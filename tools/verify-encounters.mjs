/* =====================================================================
   WHAT THE PLAYER MEETS (sim/encounters.js), checked in made scenes whose
   right answer is stated HERE -- 30 m, 2.5 s, once per approach -- never
   read back from the module's own constants (CLAUDE.md item 3: a check
   that reads the code's constant cannot catch it being wrong).

   1. MET: a car at 10 m and at 29 m is met, at 31 m and 60 m is not; one car
      near for many ticks is met once.
   2. FOLLOWING: behind a car close ahead in my lane, yes; one 100 m ahead,
      or close ahead in the next lane, no.
   3. FOLLOWED: a moving car close behind in my lane, yes; a car close AHEAD,
      no.
   4. GAPS JUDGED: standing at my line with a car on a conflicting route
      coming on counts once for the stand, not once a tick; with nobody
      coming, none.
   5. NOT VACUOUS: on real traffic, driven, every counter moves.
   6. FROM WHERE THE PLAYER IS: a player off their line and turned against
      the road is measured from their own pose (10.66).
   ===================================================================== */
import { worldFor } from "../src/sim/scene.js";
import { step, poseOf, conflictOf } from "../src/sim/crossing.js";
import { withDriver } from "../src/sim/drive.js";
import { newEncounters, encounterTick, encounterSummary } from "../src/sim/encounters.js";
import { goodStep } from "./lib/good-driver.mjs";
import { placesOf, routeTo } from "../src/sim/route.js";
import { noticeTick } from "../src/sim/session.js";
import { DT } from "../src/sim/traffic.js";
import { poseOnGraph } from "../src/sim/graph.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

/* A world with traffic, for a template car; then emptied for made scenes. */
const { world: full, me: me0 } = worldFor(1, 50, 2.0, true, 60, null, null, false);
let wf = full;
for (let i = 0; i < 200; i++) wf = step(wf);
const template = wf.actors.find((a) => !a.player && a.kind !== "truck" && a.kind !== "bus");
const empty = { ...wf, actors: [], every: 1e9, nextAt: 1e9 };
const course = empty.course;
/* The longest straight approach on the map with a second lane beside it, for room. */
let R = null;
course.at.forEach((spot, k) => {
  if (spot.through) return;
  for (const [route, p] of Object.entries(spot.layout.paths)) {
    if (p.intent !== "straight" || p.stopAt < 150) continue;
    const leg = spot.layout.legs[p.from];
    const besides = Object.values(spot.layout.legs).filter((l) => l.base === leg.base && l.id !== leg.id);
    const other = besides.map((l) => spot.layout.routesFrom(l.id).find((r) => spot.layout.paths[r].intent === "straight")).find(Boolean);
    if (other && (!R || p.stopAt > R.p.stopAt)) R = { k, route, p, other };
  }
});
const car = (id, k, route, s, v) => ({ ...template, id, k, route, s, v, lc: null, pass: null, crash: null, stoppedAt: null, going: false, accepted: false, want: null });
const player = (k, route, s, v) => ({ ...me0, k, route, s, v, off: 0, psi: 0, stoppedAt: null, going: false });
const run = (me, cars, ticks = 1) => {
  const st = newEncounters();
  let w = withDriver({ ...empty, actors: cars }, me);
  for (let i = 0; i < ticks; i++) encounterTick(st, me, w);
  return st;
};

console.log("\n1. MET: within 30 m, each car once");
{
  const me = player(R.k, R.route, 60, 0);
  const at = (d) => car(`c${d}`, R.k, R.route, 60 + d, 0);
  const st = run(me, [at(10), at(29), at(31), at(60)], 40);
  check(st.met.has("c10") && st.met.has("c29") && !st.met.has("c31") && !st.met.has("c60"), `cars at 10 and 29 m met, at 31 and 60 m not (met: ${[...st.met].join(", ") || "none"})`);
  check(st.met.size === 2, `two cars near for 40 ticks are two cars met, not eighty (${st.met.size})`);
}

console.log("\n2. FOLLOWING: close behind a car in my lane");
{
  const me = player(R.k, R.route, 40, 12);
  const near = run(me, [car("lead", R.k, R.route, 40 + 20, 10)], 20);
  const far = run(me, [car("lead", R.k, R.route, 40 + 100, 10)], 20);
  const beside = run(me, [car("lead", R.k, R.other, 40 + 20, 10)], 20);
  check(near.following > 0.9, `20 m behind a car at 10 m/s, doing 12: following for ${near.following.toFixed(2)} s of 1.00`);
  check(far.following === 0, `100 m behind: not following (${far.following.toFixed(2)} s)`);
  check(beside.following === 0, `close ahead but in the next lane: not following (${beside.following.toFixed(2)} s)`);
}

console.log("\n3. FOLLOWED: a moving car close behind me in my lane");
{
  const me = player(R.k, R.route, 80, 12);
  const behind = run(me, [car("tail", R.k, R.route, 80 - 15, 12)], 20);
  const ahead = run(me, [car("lead", R.k, R.route, 80 + 15, 12)], 20);
  const parked = run(me, [car("tail", R.k, R.route, 80 - 15, 0)], 20);
  check(behind.followed > 0.9, `a car 15 m behind at 12 m/s: followed for ${behind.followed.toFixed(2)} s of 1.00`);
  check(ahead.followed === 0, `a car 15 m AHEAD: not followed (${ahead.followed.toFixed(2)} s)`);
  check(parked.followed === 0, `a car behind standing still: not followed (${parked.followed.toFixed(2)} s)`);
}

console.log("\n4. GAPS JUDGED: standing at my line with a conflicting car coming, once per stand");
{
  /* A route and a conflicting one at one node. */
  let G = null;
  course.at.forEach((spot, k) => {
    if (G || spot.through) return;
    for (const [mine, p] of Object.entries(spot.layout.paths)) {
      for (const theirs of Object.keys(spot.layout.paths)) {
        const hit = conflictOf(spot.layout, theirs, mine);
        if (hit && hit.a > 40 && spot.layout.paths[theirs].from !== p.from) { G = { k, mine, p, theirs, hit }; return; }
      }
    }
  });
  const me = player(G.k, G.mine, G.p.stopAt, 0);
  const coming = run(me, [car("x", G.k, G.theirs, G.hit.a - 30, 8)], 100);
  const nobody = run(me, [], 100);
  check(coming.gaps === 1, `five seconds at the line with a car on a crossing route 30 m out: one gap judged (${coming.gaps})`);
  check(nobody.gaps === 0, `at the line with nobody coming: none (${nobody.gaps})`);
}

console.log("\n5. NOT VACUOUS: driven on test map 1 at 120 cars, every counter moves");
{
  let { loaded, world: w, me } = worldFor(1, 50, 2.0, true, 120, null, null, false);
  const places = placesOf(w.course, loaded), sc = { me, args: [1], saveWallet: false }, me00 = me;
  const st = newEncounters();
  let trip = 0;
  const pick = () => { for (let i = 0; i < 80; i++) { const p = places[(++trip * 7919 + i * 104729) % places.length]; const r = routeTo(w.course, me, p); if (r && r.length > 300) return p; } return null; };
  for (let n = 0; n < 240 / DT; n++) {
    if (!sc.dest) { sc.dest = pick(); sc.routeKey = null; }
    if (me.atEdge || !sc.dest) { me = { ...me00 }; w = withDriver(w, me); sc.me = me; sc.dest = pick(); sc.routeKey = null; }
    const prev = { me, world: w };
    me = goodStep(me, w, sc);
    w = step(withDriver(w, me));
    noticeTick(sc, prev, { me, world: w });
    sc.me = me;
    encounterTick(st, me, w);
  }
  const s = encounterSummary(st);
  check(s.metPerMin > 1 && st.following > 0 && st.followed > 0 && st.gaps > 0, `four minutes: met ${s.metPerMin}/min, following ${s.followingShare}%, followed ${s.followedShare}%, ${s.gapsPerMin} gaps/min -- none of them zero`);
}

console.log("\n6. FROM WHERE THE PLAYER IS, NOT WHERE THEIR ROUTE IS (DECISIONS 10.66): a player off their line");
{
  /* Every scene above has the player on their route's centreline (off 0), which is the one place the two ways of
     computing their pose agreed -- the check's boundary, and why it passed while the traffic's poseOf dropped `off`.
     Here the player is 1.7 m toward the next lane and 40 degrees off the road's heading. Where they are is restated
     from the path (graph.js poseOnGraph) and the offset's own definition: right of the line, y down. */
  const off0 = 1.7, s0 = 60;
  const line = poseOnGraph(course, R.k, R.route, s0), h = (line.rot * Math.PI) / 180;
  const other = poseOnGraph(course, R.k, R.other, s0);
  /* Toward the other lane: the sign of its place across my line. */
  const side = Math.sign(-(other.x - line.x) * Math.sin(h) + (other.y - line.y) * Math.cos(h)) || 1;
  const off = side * off0;
  const truth = { x: line.x - Math.sin(h) * off, y: line.y + Math.cos(h) * off };
  /* A car in the other lane placed so that it is past 30 m from the centreline and inside 30 m of the player. */
  let pick = null;
  for (let d = 28; d < 31 && !pick; d += 0.01) {
    const q = poseOnGraph(course, R.k, R.other, s0 + d);
    const fromLine = Math.hypot(q.x - line.x, q.y - line.y), fromMe = Math.hypot(q.x - truth.x, q.y - truth.y);
    if (fromLine > 30.05 && fromMe < 29.95) pick = { d, fromLine, fromMe };
  }
  check(!!pick, `a place in the next lane past 30 m from the route's line and within 30 m of the player exists (${pick ? `${pick.fromLine.toFixed(2)} m and ${pick.fromMe.toFixed(2)} m` : "none"})`);
  if (pick) {
    const c = car("edge", R.k, R.other, s0 + pick.d, 0);
    const on = run({ ...player(R.k, R.route, s0, 0), off, psi: 0 }, [c], 5);
    const centred = run(player(R.k, R.route, s0, 0), [c], 5);
    check(on.met.has("edge") && !centred.met.has("edge"), `the player ${off0} m off their line meets it; the same player on the line does not (off line: ${on.met.has("edge")}, on it: ${centred.met.has("edge")})`);
  }
  /* And the heading: a car dead ahead of a player turned 40 degrees is not "beside" them by the route's heading.
     Passing is judged along and across the player's own heading. */
  const turned = { ...player(R.k, R.route, s0, 10), off: 0, psi: (side * 40 * Math.PI) / 180 };
  const mp = poseOf(withDriver({ ...empty, actors: [] }, turned), turned);
  const dh = ((((mp.rot - line.rot) % 360) + 540) % 360) - 180;
  check(Math.abs(Math.abs(dh) - 40) < 0.01, `the traffic's pose of a player turned 40 degrees against the road is turned 40 degrees (${dh.toFixed(2)})`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
