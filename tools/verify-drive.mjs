/* =====================================================================
   THE PLAYER ON THE MAP, AND THE TURN SIGNAL AS THE TURN COMMIT.

   SIMULATOR.md 1.1: the player drives; turns at intersections are
   committed to, not steered. Whether it feels right is the phone's
   question; what is checked here is that the control does what a
   driver expects of it: a signal picks the exit it means, at a
   crossroads, a T and a five-way; it can be changed any time before
   the line and not after; no signal is straight on; a signal is spent
   by the turn it caused; the car takes the committed arc through the
   box with the wheel straight, while a bend on the road drifts it;
   the handoff at a seam moves the car no further than a tick; and the
   traffic treats the player as one of its own -- yielding, following,
   never driving through them.
   ===================================================================== */
import { seedGraph, step, poseOf, overlapping, DT } from "../src/sim/crossing.js";
import { playerAt, playerOn, stepDriver, driverPose, withDriver, routeForSignal, aheadOf } from "../src/sim/drive.js";
import { touching, holdAt, CLEAN } from "../src/sim/player.js";
import { graphOf } from "../src/sim/graph.js";
import { loadMap } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { CAR } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const line = (a, b, n = 30) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: 0 }));

const loaded = loadMap(testMap1());
/* A road end's curb lane, from the map rather than a literal: the map
   gained a three-lane arterial and every "#1" that meant "the curb"
   quietly started meaning "the middle". */
const curbOf = (roadEnd) => `${roadEnd}#${loaded.roads.find((r) => r.id === roadEnd.split("|")[0]).lanes - 1}`;
/* The player at a road end, in its curb lane. */
const startAt = (world, legId) => {
  const [roadId, end] = legId.split("|");
  return playerOn(world.course, roadId, end);
};
/* Drive a player for `seconds` with a driver function deciding the
   inputs each tick, with or without traffic. */
function drive(world, me, seconds, driver, hook) {
  const record = [];
  for (let i = 0; i < seconds * 20; i++) {
    const inp = driver(me, world, i * DT);
    /* A driver that says `signal: null` is cancelling it; one that says nothing leaves it. */
    me = stepDriver({ ...me, signal: "signal" in inp ? inp.signal : me.signal }, inp, world, DT);
    world = withDriver(world, me);
    world = step(world);
    if (hook) hook(me, world, i * DT);
    record.push(me);
  }
  return { me, world, record };
}
const empty = (w) => ({ ...w, actors: [], every: 1e9, nextAt: 1e9 });   // the same world with no traffic and none arriving

/* 1. Which exit a signal means. */
{
  const g = graphOf(loaded);
  const A = g.at.find((s) => s.node === "n0").layout;      // the crossroads, arriving from the north
  const from = "A-north|end#1";                            // in the curb lane: straight on or right
  const to = (sig) => A.paths[routeForSignal(A, from, sig)];
  check(to(null).intent === "straight" && to("right").intent === "right" && to("left").intent === "straight", `at the crossroads from the north in the curb lane: no signal is straight on, right is ${to("right").to}, and a left signal has no route from this lane, so straight on`);
  const inner = A.paths[routeForSignal(A, "A-north|end#0", "left")];
  check(inner.intent === "left", `from the lane beside the centre line, left is ${inner.to}`);
  /* The T is D now -- B became a crossroads when the arterial was given
     a way through it -- arriving from B, heading south: the road goes
     east or west. */
  const T = g.at.find((s) => s.node === "n3").layout;
  const fromT = curbOf("B-D|end");
  const noSig = T.paths[routeForSignal(T, fromT, null)], left = T.paths[routeForSignal(T, "B-D|end#0", "left")], right = T.paths[routeForSignal(T, fromT, "right")];
  check(left.intent === "left" && right.intent === "right" && noSig.intent !== "straight", `at the T arriving from the north: left from the inner lane goes ${left.to}, right from the curb lane goes ${right.to}, and with no signal the car takes the turn its lane allows (${noSig.intent})`);
  const F = g.at.find((s) => s.node === "n2").layout;      // the five-way, arriving from the east along C-D, in the inner lane
  const fromF = "C-D|start#0";
  const lefts = F.routesFrom(fromF).filter((r) => F.paths[r].intent === "left");
  check(lefts.length >= 2, `arriving at the five-way from the east there are ${lefts.length} exits that are lefts`);
  const chosen = F.paths[routeForSignal(F, fromF, "left")];
  const turnOf = (p) => { let d = F.legs[p.to].bearing - (F.legs[fromF].bearing + 180); while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  check(lefts.every((r) => Math.abs(turnOf(F.paths[r]) + 90) >= Math.abs(turnOf(chosen) + 90)) && chosen.to === "C-southwest|end#0", `and "left" means the one nearest a right angle, the gentler of two equally far (${turnOf(chosen).toFixed(0)} degrees, to ${chosen.to})`);
}

/* 2. The signal can be changed before the line and not after; it is spent by the turn. */
{
  const w0 = empty(seedGraph(1, 50, loaded, { every: 2 }));
  let me = startAt(w0, "A-north|end");
  const path0 = w0.course.at[me.k].layout.paths[me.route];
  /* Drive at the line in the curb lane with the signal off, then left, then right, then off again, all
     before the line: left has no route from this lane (straight on stands), right does, then straight. */
  const r = drive(w0, me, 60, (m) => ({ steer: 0, slider: m.v < 8 ? 0.6 : 0.1, signal: m.s < 50 ? null : m.s < 120 ? "left" : m.s < 200 ? "right" : null }));
  const changed = r.record.filter((m, i) => i > 0 && m.route !== r.record[i - 1].route && m.k === r.record[i - 1].k);
  check(changed.length === 2 && changed.every((m) => m.s <= path0.stopAt) && changed[0].route.endsWith(curbOf("A-west|end")) && r.record[r.record.length - 1].route.endsWith("C-A|end#1"), `the route follows the signal while the car is short of the line: a left the lane cannot make leaves it straight on, right takes the right, off takes it back -- ${changed.length} changes, all before ${path0.stopAt.toFixed(0)} m`);
  const committedAt = r.record.find((m) => m.s > path0.stopAt);
  const after = r.record.filter((m) => m.k === committedAt?.k && m.s > path0.stopAt);
  check(committedAt && after.every((m) => m.route === committedAt.route), "past the line the route no longer changes whatever the signal says");
  /* Signal left, hold it, from the lane beside the centre line: the car turns left at the crossroads and the signal is spent. */
  const innerStart = playerAt(w0, 0, routeForSignal(w0.course.at[0].layout, "A-north|end#0", null));
  const r2 = drive(w0, innerStart, 90, (m) => ({ steer: 0, slider: m.v < 8 ? 0.6 : 0.1, signal: m.leg === 0 && m.signal !== "spent" ? "left" : m.signal }));
  const turned = r2.record.find((m) => m.leg === 1);
  check(turned && w0.course.at[turned.k].layout.legs[w0.course.at[turned.k].layout.paths[turned.route].from].road === "A-B", `signalling left from the north, the car left the crossroads eastward along A-B (arrived on leg ${turned && w0.course.at[turned.k].layout.paths[turned.route].from})`);
  check(turned && turned.signal === null, "and the signal was spent by the turn it caused");
  const ahead0 = aheadOf(startAt(w0, "A-north|end"), w0.course);
  check(ahead0.node === "n0" && ahead0.intent === "straight" && !ahead0.committed && ahead0.toLine > 300, `the screen can say what is ahead: straight on at ${ahead0.node}, ${ahead0.toLine.toFixed(0)} m to the line`);
  const wrongLane = aheadOf({ ...startAt(w0, "A-north|end"), signal: "left" }, w0.course);
  check(wrongLane.intent === "straight" && /left turns are from the left lane/.test(wrongLane.hint ?? ""), `and when the signal asks for a turn this lane cannot make, it says which lane can: "${wrongLane.hint}"`);
  /* A LANE CHANGE: drift half a lane left on the approach and the car is in the inner lane, its route that lane's, its line re-based. */
  const rl = drive(w0, startAt(w0, "A-north|end"), 30, (m) => ({ steer: m.s < 60 ? -0.35 : -(m.off) * 0.3 - m.psi * 3, slider: m.v < 8 ? 0.6 : 0.1, signal: "left" }));
  const moved = rl.record.find((m) => w0.course.at[m.k].layout.legs[w0.course.at[m.k].layout.paths[m.route].from].lane === 0);
  check(moved && Math.abs(moved.off) < 3.6 / 2 + 0.05, `steering across the lane line puts the car in the lane beside the centre line, with its line re-based (${moved ? moved.off.toFixed(2) : "?"} m off that lane's centre)`);
  check(moved && w0.course.at[moved.k].layout.paths[moved.route].intent === "left", "and with the left signal on, that lane's route is the left turn");
}

/* 3. The box is committed to; the road is driven. */
{
  const w0 = empty(seedGraph(1, 50, loaded, { every: 2 }));
  const me0 = startAt(w0, "A-north|end");
  /* A right turn with the wheel dead straight: through the box the car
     follows the arc -- its line stays on the lane. */
  const r = drive(w0, me0, 80, (m) => ({ steer: 0, slider: m.v < 6 ? 0.6 : 0.05, signal: m.leg === 0 ? "right" : m.signal }));
  const inBox = r.record.filter((m) => { const p = w0.course.at[m.k].layout.paths[m.route]; return m.leg === 0 && m.s >= p.stopAt && m.s <= p.clearAt; });
  const worstOff = Math.max(...inBox.map((m) => Math.abs(m.off)));
  check(inBox.length > 10 && worstOff < 0.3, `through a right turn with the wheel straight the car holds the committed arc (${inBox.length} ticks in the box, at most ${worstOff.toFixed(2)} m off its line)`);
  const out = r.record[r.record.length - 1];
  check(w0.course.at[out.k].layout.paths[out.route].to === curbOf("A-west|end") && out.leg === 0, `and comes out on the west road in its curb lane, which runs to the map's edge (${out.atEdge ? "reached" : "not yet reached"})`);
  /* The bend on C-A, wheel straight: the road turns out from under the car. */
  const meC = startAt(w0, "C-A|end");   // arriving at A from C, along the bend
  const rb = drive(w0, { ...meC, v: 12 }, 25, () => ({ steer: 0, slider: 0.4, signal: null }));
  const drift = Math.max(...rb.record.map((m) => Math.abs(m.off)));
  check(drift > 1.0, `on the bend, a straight wheel drifts the car off its line (${drift.toFixed(2)} m at most): the bend is driven`);
}

/* 4. The seam hands the car on without a jump, the loop can be driven round, and the edge ends the road. */
{
  const w0 = empty(seedGraph(1, 50, loaded, { every: 2 }));
  let jumps = 0, prev = null, legs = 0;
  /* The loop A-B-D-C-A is clockwise on the screen: arriving from the
     north the first turn is a left, east along A-B -- from the lane
     beside the centre line, so the driver moves over for it -- and
     with y down every turn after that is a right, from the curb lane,
     so they move back. A driver who steers for the lane the turn needs. */
  const laneFor = (m, w) => { const lay = w.course.at[m.k].layout, leg = lay.legs[lay.paths[m.route].from]; const want = m.leg === 0 ? 0 : leg.lanes - 1; return (want - leg.lane) * 3.6; };
  const r = drive(w0, startAt(w0, "A-north|end"), 240, (m, w) => ({ steer: -(m.off - laneFor(m, w)) * 0.3 - m.psi * 3, slider: m.v < 11 ? 0.6 : 0.05, signal: m.leg < 8 && !m.signal ? (m.leg === 0 ? "left" : "right") : m.signal }), (m, w) => {
    const p = driverPose(m, w.course);
    if (prev && m.leg !== prev.leg && Math.hypot(p.x - prev.x, p.y - prev.y) > Math.max(prev.v, m.v) * DT + 0.6) jumps++;
    prev = { x: p.x, y: p.y, leg: m.leg, v: m.v };
    legs = Math.max(legs, m.leg);
  });
  check(jumps === 0, `no handoff moved the car further than a tick's travel (${jumps} jumps)`);
  check(legs >= 4 && !r.me.atEdge, `left at the crossroads then right at every node, the car went round the loop: ${legs} nodes in four minutes, still on the map`);
  const leftLane = (m, w) => { const lay = w.course.at[m.k].layout, leg = lay.legs[lay.paths[m.route].from]; return -leg.lane * 3.6; };
  const rl = drive(w0, startAt(w0, "A-north|end"), 120, (m, w) => ({ steer: -(m.off - leftLane(m, w)) * 0.3 - m.psi * 3, slider: m.v < 11 ? 0.6 : 0.05, signal: !m.signal ? "left" : m.signal }));
  check(rl.me.atEdge && rl.me.leg === 1 && rl.me.v === 0, `left at every node instead, from the inner lane: east at the crossroads, north at the T, and the car stops at the edge of the map (${rl.me.leg} node passed, at the edge: ${rl.me.atEdge})`);
}

/* 5. In traffic: the others treat the player as one of their own. */
{
  /* A crossroads with a two-way stop, the player on the through road holding 50 km/h: the stop legs wait for them, and nobody touches them. */
  const m = emptyMap("x"); const c = { x: 500, y: 500 };
  for (const [id, far] of [["N", { x: 500, y: 100 }], ["S", { x: 500, y: 900 }], ["E", { x: 900, y: 500 }], ["W", { x: 100, y: 500 }]]) m.roads.push(road({ id, lanes: 2, points: line(far, c), control: { start: "none", end: id === "N" || id === "S" ? "stop" : "none" } }));
  const xl = loadMap(m);
  let touches = 0, minorWaited = 0, followed = 0;
  let w, me;
  /* Four passes through, each in a fresh world, the player entering at
     road speed where the west road begins with nobody on top of them. */
  for (let pass = 0; pass < 4; pass++) {
    w = seedGraph(4 + pass, 50, xl, { every: 0.7 });   // demand spread over twice the lanes now
    w = { ...w, actors: w.actors.filter((a) => !(a.route.startsWith("W|end#1") && a.s < 40)) };
    me = { ...startAt(w, "W|end"), v: 13.9 };
    /* A driver who holds 50 and, like anybody, brakes for the car ahead in their lane. */
    const gapAhead = (mm, ww) => Math.min(Infinity, ...ww.actors.filter((a) => !a.player && a.k === mm.k && ww.course.at[a.k].layout.paths[a.route].from === ww.course.at[mm.k].layout.paths[mm.route].from && a.s > mm.s).map((a) => a.s - mm.s - CAR.length));
    const r = drive(w, me, 60, (mm, ww) => { const g = gapAhead(mm, ww); return { steer: -(mm.off) * 0.3 - mm.psi * 3, slider: g < 12 ? -0.8 : g < 30 ? -0.2 : mm.v < 13.9 ? 0.5 : 0.05, signal: null }; }, (mm, ww) => {
      const mine = driverPose(mm, ww.course);
      for (const a of ww.actors) {
        if (a.player) continue;
        const p = poseOf(ww, a);
        if (touching(mine, { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot })) touches++;
        /* A stop-leg car at rest at its line while the player is within the box's reach: it waited. */
        const pa = ww.course.at[a.k].layout.paths[a.route];
        if ((a.route.startsWith("N|") || a.route.startsWith("S|")) && a.v < 0.3 && Math.abs(a.s - (pa.stopAt - CAR.length / 2)) < 2.5 && Math.abs(mine.x - 500) < 40) minorWaited++;
        /* A car behind the player on the same lane, closer than its own headway would be at speed: it is following. */
        if (a.k === mm.k && pa.from === ww.course.at[mm.k].layout.paths[mm.route].from && a.s < mm.s && mm.s - a.s < 60 && a.v > 1) followed++;
      }
    });
    w = r.world; me = r.me;
  }
  check(touches === 0, `four passes through a two-way stop on its through road, in traffic: nobody touched the player (${touches} car-ticks)`);
  check(minorWaited > 20, `cars on the stop legs sat at their line while the player came through (${minorWaited} car-ticks)`);
  check(followed > 20, `and cars behind the player followed them (${followed} car-ticks)`);
  const overlapsAmongOthers = overlapping({ ...w, actors: w.actors.filter((a) => !a.player) }).length;
  check(overlapsAmongOthers === 0, "and the rest of the traffic is still not driving through itself");
}

/* 6. THE CORNER HAS TO BE EARNED. The maintainer: "we need to make sure
   players are going the correct speed to actually make the turn well
   and reward them for doing so." So the committed arc is followed only
   as far as the tyres allow: at the right speed it is clean and the
   speed is carried out; faster it scrubs; faster still it runs wide.
   The speeds are not typed in -- CLEAN is what the maintainer's 26 km/h
   costs on this map's 12.7 m left, and his 22 for a right falls out of
   the curb-lane right's 9.3 m unasked. Swept in tools/measure/turn.mjs;
   the properties any right model would have are checked here. */
{
  const w0 = { ...seedGraph(1, 50, loaded, { every: 2 }), actors: [] };
  const RANK = { slow: 0, clean: 0, rough: 1, wide: 2, cut: 2 };
  const through = (leg, sig, kmh) => {
    const k = w0.course.at.findIndex((s) => s.layout.legs[leg]);
    const layout = w0.course.at[k].layout, route = routeForSignal(layout, leg, sig), path = layout.paths[route];
    let me = { ...playerAt(w0, k, route), s: path.stopAt - 0.5, v: kmh / 3.6, signal: sig, going: true, accepted: true, off: 0 };
    let world = withDriver(w0, me), offMax = 0;
    for (let i = 0; i < 1200 && !me.lastTurn; i++) {   /* a minute: a crawl round the wider arterial arc takes more than twenty seconds */
      me = stepDriver(me, { steer: 0, slider: holdAt(me.v, me.grade ?? 0) }, world, DT);   // held in the band: the speed is the entry speed unless the tyres take it
      world = withDriver(world, me);
      if (me.turn) offMax = Math.max(offMax, Math.abs(me.off));
    }
    return { ...me.lastTurn, offMax, vOut: me.v };
  };
  /* EACH CORNER AGAINST ITS OWN ARC. The clean speed is sqrt(CLEAN r)
     for the arc the geometry built, so a left onto the three-lane
     arterial -- a wider box, a wider arc -- rightly wants more than a
     left onto a collector did. The speeds are sampled as fractions of
     that corner's own clean speed, so the property is the model's and
     not a number about one map; the maintainer's numbers anchor CLEAN
     itself, at the end of this section. */
  const probe = (leg, sig) => through(leg, sig, 10).vClean;
  const sweep = (leg, sig) => { const vc = probe(leg, sig) * 3.6; return [0.45, 0.7, 0.95, 1.1, 1.3, 1.55].map((f) => [Math.round(f * vc * 10) / 10, f, through(leg, sig, f * vc)]); };
  const left = sweep("A-north|end#0", "left"), right = sweep(curbOf("A-north|end"), "right");
  const say = (rows) => rows.map(([kmh, , t]) => `${kmh}: ${t.verdict}`).join(", ");
  check(left.every(([, , t]) => t.verdict) && right.every(([, , t]) => t.verdict), "a turn is judged as the car leaves the box, every time");
  check(left.every(([, f, t]) => (f <= 0.95 ? t.verdict === "clean" : t.verdict !== "clean") || (f < 0.5 && t.verdict === "slow")),
    `the crossroads left wants ${Math.round(left[0][2].vClean * 3.6)} km/h on its ${left[0][2].rMin.toFixed(1)} m arc: clean below it, not above (${say(left)})`);
  check(right.every(([, f, t]) => (f <= 0.95 ? t.verdict === "clean" : t.verdict !== "clean") || (f < 0.5 && t.verdict === "slow")),
    `the curb-lane right wants ${Math.round(right[0][2].vClean * 3.6)} km/h on its ${right[0][2].rMin.toFixed(1)} m arc: clean below it, not above (${say(right)})`);
  check(left.every(([, , t], i) => i === 0 || RANK[t.verdict] >= RANK[left[i - 1][2].verdict]) && right.every(([, , t], i) => i === 0 || RANK[t.verdict] >= RANK[right[i - 1][2].verdict]), "arriving faster never earns a better verdict");
  const [fastKmh, , fast] = left[left.length - 1], [okKmh, , ok] = left[2];
  check(fast.verdict === "wide" && fast.offMax > 0.9 && ok.offMax < 0.05, `at ${fastKmh} km/h -- half again the clean speed -- the left runs wide, ${fast.offMax.toFixed(2)} m off the line against ${ok.offMax.toFixed(2)} at ${okKmh}, because the tyres cannot turn the car as hard as the arc asks`);
  const roughRow = left.find(([, , t]) => t.verdict === "rough");
  check(left.every(([kmh, , t]) => t.verdict !== "clean" || Math.abs(t.vOut * 3.6 - kmh) < 1) && roughRow && roughRow[2].vOut * 3.6 < roughRow[0] - 0.5,
    `a clean turn carries its speed out; a rough one scrubs it (${roughRow?.[0]} km/h in, ${(roughRow?.[2].vOut * 3.6).toFixed(0)} out)`);
  const crawl = through("A-north|end#0", "left", 6);
  check(crawl.verdict === "slow", `and crawling round at 6 km/h is called what it is: ${crawl.verdict}`);
  const straight = (() => { const k = 0, layout = w0.course.at[k].layout, route = routeForSignal(layout, "A-north|end#1", null), path = layout.paths[route];
    let me = { ...playerAt(w0, k, route), s: path.stopAt - 0.5, v: 12, going: true, accepted: true }, world = withDriver(w0, me);
    for (let i = 0; i < 200; i++) { me = stepDriver(me, { steer: 0, slider: 0.4 }, world, DT); world = withDriver(world, me); }
    return me; })();
  check(!straight.lastTurn && !straight.turns, "straight through is not a turn and is not judged");
  check(Math.abs(CLEAN - (26 / 3.6) ** 2 / 12.7) < 0.05, `CLEAN is derived: ${CLEAN} m/s^2 is 26 km/h on a 12.7 m arc`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the signal picks the exit it means and only before the line, the box is committed to and the road is driven, the seam is seamless, the corner has to be earned, and the traffic treats the player as its own.");
