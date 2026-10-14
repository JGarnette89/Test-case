/* =====================================================================
   GOING SOMEWHERE (sim/route.js, sim/session.js; PLAN.md phase 3, item 7).

   1. A PLACE is the curb in front of a building, on the side of the road it
      faces: on a curb lane, within PLACE_REACH of the building, the
      building on the right of the direction of travel.
   2. A ROUTE is real: replayed step by step it makes a movement from the
      approach it is on, the graph's own join hands it on, and it ends on
      the place's own stretch of road.
   3. A ROUTE IS SHORTEST: an independent search -- relaxation to a fixed
      point, written here, not Dijkstra -- over the same roads agrees on
      every length.
   4. IT CAN BE DRIVEN: a player who signals only what the screen says
      (sim/session.js `navigate`, the screen's own logic) gets there on
      the empty city, and the session notices the arrival.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testCityReady } from "../src/map/samples.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { playerOn, stepDriver, stopFor, withDriver } from "../src/sim/drive.js";
import { placesOf, routeTo, alongTo, PLACE_REACH, ARRIVED_WITHIN } from "../src/sim/route.js";
import { noticeTick } from "../src/sim/session.js";
import { postedAt, poseOnGraph } from "../src/sim/graph.js";
import { firstEdge } from "../src/map/edges.js";
import { worldFor } from "../src/sim/scene.js";
import { DT, stoppingRoom } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

const L = loadMap(testCityReady());
const w0 = { ...seedGraph(1, 50, L, { target: 0, posted: true }), actors: [], every: 1e9, nextAt: 1e9 };
const course = w0.course;
const places = placesOf(course, L);
const baseOf = (k, leg) => course.at[k].layout.legs[leg]?.base ?? leg;
const e = firstEdge(L);
const start = playerOn(course, e.road, e.end);

console.log("\n1. A PLACE IS THE CURB IN FRONT OF A BUILDING");
{
  const byId = new Map(L.props.map((b) => [b.id, b]));
  let far = 0, wrongSide = 0, notCurb = 0;
  for (const p of places) {
    if (p.kind === "curb") continue;
    const b = byId.get(p.id), Lk = course.at[p.k].layout, path = Lk.paths[p.route];
    if (Math.hypot(b.at.x - p.x, b.at.y - p.y) > PLACE_REACH) far++;
    const leg = Lk.legs[p.part === "in" ? path.from : path.to];
    if (!leg?.curb) notCurb++;
    /* The building on the right of travel, from the heading the curb lane
       has a metre either side of the place -- not the pose's own rotation. */
    const a = poseOnGraph(course, p.k, p.route, Math.max(0, p.s - 1)), c = poseOnGraph(course, p.k, p.route, Math.min(path.length, p.s + 1));
    const tx = c.x - a.x, ty = c.y - a.y;
    if (tx * (b.at.y - p.y) - ty * (b.at.x - p.x) <= 0) wrongSide++;
  }
  const bp = places.filter((p) => p.kind !== "curb").length;
  check(bp >= 0.9 * L.props.length, `${bp} of the city's ${L.props.length} buildings face a street and have a place, and ${places.length - bp} stretches of curb with no building on them are places too`);
  check(far === 0 && notCurb === 0 && wrongSide === 0, `every place within ${PLACE_REACH} m of its building (${far} not), on a curb lane (${notCurb} not), the building on the right of travel (${wrongSide} not)`);
}

console.log("\n2-3. A ROUTE IS REAL, AND SHORTEST");
{
  /* THE INDEPENDENT SEARCH: every (intersection, approach) relaxed until nothing improves. */
  const states = new Map(), edgesOut = new Map();
  course.at.forEach((spot, k) => {
    if (spot.through) return;
    for (const [r, p] of Object.entries(spot.layout.paths)) {
      const from = `${k}|${baseOf(k, p.from)}`;
      const j = course.joins[`${k}|${p.to}`];
      if (!j) continue;
      const np = Object.values(course.at[j.k].layout.paths).find((q) => q.from === j.side);
      const to = `${j.k}|${baseOf(j.k, j.side)}`;
      (edgesOut.get(from) ?? edgesOut.set(from, []).get(from)).push({ to, cost: p.length - p.stopAt + (np?.stopAt ?? 0), k, r, p });
      states.set(from, Infinity); states.set(to, Infinity);
    }
  });
  const shortest = (me, place) => {
    const d = new Map([...states.keys()].map((s) => [s, Infinity]));
    const p0 = course.at[me.k].layout.paths[me.route];
    d.set(`${me.k}|${baseOf(me.k, p0.from)}`, Math.max(0, p0.stopAt - me.s));
    for (let changed = true; changed; ) {
      changed = false;
      for (const [from, list] of edgesOut) { const df = d.get(from); if (df === Infinity) continue; for (const ed of list) if (df + ed.cost < d.get(ed.to) - 1e-9) { d.set(ed.to, df + ed.cost); changed = true; } }
    }
    if (place.part === "in") return d.get(`${place.k}|${place.base}`) ?? Infinity;
    let best = Infinity;
    for (const [from, list] of edgesOut) for (const ed of list) if (ed.k === place.k && baseOf(ed.k, ed.p.to) === place.base) best = Math.min(best, (d.get(from) ?? Infinity) + place.s - ed.p.stopAt);
    return best;
  };
  let replayBad = 0, notShortest = 0, missing = 0, n = 0, worst = 0;
  for (let i = 0; i < places.length; i += Math.max(1, Math.floor(places.length / 60))) {
    const place = places[i], r = routeTo(course, start, place);
    n++;
    const ref = shortest(start, place);
    if (!r) { if (ref < Infinity) missing++; continue; }
    /* Replay: each step from the state the previous left. */
    let k = start.k, base = baseOf(start.k, course.at[start.k].layout.paths[start.route].from), ok = true;
    r.steps.forEach((st, j) => {
      const p = course.at[st.k].layout.paths[st.route];
      if (st.k !== k || baseOf(st.k, p.from) !== base) ok = false;
      const last = j === r.steps.length - 1;
      if (last && place.part === "out") { if (!(st.k === place.k && baseOf(st.k, p.to) === place.base)) ok = false; return; }
      const jn = course.joins[`${st.k}|${p.to}`];
      if (!jn) { ok = false; return; }
      k = jn.k; base = baseOf(jn.k, jn.side);
    });
    if (place.part === "in" && !(k === place.k && base === place.base)) ok = false;
    if (!ok) replayBad++;
    if (Math.abs(r.length - ref) > 1) { notShortest++; worst = Math.max(worst, Math.abs(r.length - ref)); }
  }
  check(missing === 0 && replayBad === 0, `${n} routes from the start of the map: every one reachable the independent search can reach (${missing} missed), every one replays along the graph's joins to its place's stretch (${replayBad} did not)`);
  check(notShortest === 0, `and every one is the shortest the independent search finds (${notShortest} longer, worst by ${worst.toFixed(1)} m)`);
}

console.log("\n4. IT CAN BE DRIVEN, AND ARRIVING IS NOTICED");
{
  /* A player who keeps their lane, drives at four fifths of the limit,
     stops for what the rules say, signals only what the screen says, and
     pulls up when the place is near. */
  let arrived = 0, said = 0, trips = 0, times = [];
  for (let trip = 0; trip < 6; trip++) {
    let me = start, w = withDriver(w0, me);
    const sc = { me, dest: null, args: [1] };
    let pick = null;
    for (let i = 0; i < places.length && !pick; i++) {
      const p = places[(trip * 7919 + i * 104729) % places.length], r = routeTo(course, me, p);
      if (r && r.length > 400 && r.length < 1500) pick = p;
    }
    if (!pick) continue;
    trips++;
    sc.dest = pick;
    let done = false;
    for (let n = 0; n < 300 / DT && !done; n++) {
      const prev = { me, world: w };
      const path = course.at[me.k].layout.paths[me.route];
      const posted = postedAt(course, me.k, me.route) ?? 13.9;
      const along = alongTo(course, me, pick);
      const stop = stopFor(me, w);
      let slider = me.v < posted * 0.8 ? 0.5 : 0.05;
      if (stop && stop.d < stoppingRoom(me.v) + 3) slider = me.v < 1 && stop.d > 1.5 ? 0.15 : -0.8;
      if (along != null && along > -40) slider = along > -ARRIVED_WITHIN + 3 || me.v > Math.max(2, -along / 4) ? -0.8 : 0.2;
      const turn = sc.route?.steps?.[0];
      const want = turn && turn.k === me.k ? course.at[me.k].layout.paths[turn.route].intent : null;
      me = stepDriver({ ...me, signal: want && want !== "straight" && me.s <= path.stopAt ? want : null }, { steer: -(me.off - (me.s <= path.stopAt - 3 ? (sc.navLane ?? 0) * 2.6 : 0)) * 0.3 - me.psi * 3, slider, assist: 0 }, w, DT);
      w = step(withDriver(w, me));
      const before = sc.said;
      noticeTick(sc, prev, { me, world: w });
      sc.me = me;
      if (sc.dest == null) { arrived++; times.push(n * DT); done = true; if (sc.said && sc.said !== before && sc.voice) said++; }
    }
  }
  check(trips >= 5 && arrived >= trips - 1, `${arrived} of ${trips} trips across the empty city driven to their place by a player signalling only what the screen said (${times.map((t) => t.toFixed(0)).join(", ")} s)`);
  check(said >= 1, `and the session noticed the arrival -- the voice spoke to it on ${said} of them (the voice has its own budget)`);
}

console.log("\n5. A MAP WITH NO BUILDINGS STILL HAS SOMEWHERE TO GO (#/map's own test map 1)");
{
  /* The first build gave places only to buildings and was checked only on
     the city: #/map runs test map 1, which has none, and said "nowhere to
     go" on every tap (the maintainer, 14 October). */
  const { loaded: L1, world: w1, me: m1 } = worldFor(1, 50, null, "drive");
  const P1 = placesOf(w1.course, L1);
  const reach = P1.map((p) => routeTo(w1.course, m1, p)).filter(Boolean);
  const longest = Math.max(0, ...reach.map((r) => r.length));
  check(L1.props.length === 0 && P1.length >= w1.course.at.filter((s) => !s.through).length, `test map 1, ${L1.props.length} buildings: ${P1.length} places on its curbs, ${reach.length} reachable from the start, the furthest ${longest.toFixed(0)} m`);
  check(reach.length >= P1.length / 2 && longest > 200, "most of them reachable, and a real trip among them");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
