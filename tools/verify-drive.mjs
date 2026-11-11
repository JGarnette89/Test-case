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
import { seedGraph, step, poseOf, overlapping, DT, restAt, blockedBy } from "../src/sim/crossing.js";
import { playerAt, playerOn, stepDriver, driverPose, withDriver, routeForSignal, aheadOf } from "../src/sim/drive.js";
import { touching, holdAt, CLEAN, sliderFor, stopBand, accelFor } from "../src/sim/player.js";
import { graphOf, poseOnGraph } from "../src/sim/graph.js";
import { loadMap } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { CAR, HARSH_AT, stoppingRoom, weaveRoom } from "../src/sim/traffic.js";

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
  /* The five-way, arriving from the south-east. This was the approach
     from the east, whose two lefts were 45 and 135 degrees -- and a 135
     degree turn is a hairpin the sim no longer offers (graph.js HAIRPIN,
     28 September: its arc curled back into its own queue), so that
     approach has one left now. From the south-east the lefts are 90 and 45
     degrees, which asks the same question: which exit does "left" mean? */
  const F = g.at.find((s) => s.node === "n2").layout;
  const fromF = "C-southeast|end#0";
  const lefts = F.routesFrom(fromF).filter((r) => F.paths[r].intent === "left");
  check(lefts.length >= 2, `arriving at the five-way from the south-east there are ${lefts.length} exits that are lefts`);
  const chosen = F.paths[routeForSignal(F, fromF, "left")];
  const turnOf = (p) => { let d = F.legs[p.to].bearing - (F.legs[fromF].bearing + 180); while (d > 180) d -= 360; while (d < -180) d += 360; return d; };
  check(lefts.every((r) => Math.abs(turnOf(F.paths[r]) + 90) >= Math.abs(turnOf(chosen) + 90)) && Math.abs(Math.abs(turnOf(chosen)) - 90) < 5, `and "left" means the one nearest a right angle (${turnOf(chosen).toFixed(0)} degrees, to ${chosen.to}), not the 45 degree one`);
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
  /* Within the weave room -- half the air between a car and the next
     lane -- which is the bound the conflict geometry is built on; a car
     inside it is still on its line for everybody else. (It was 0.3 m, a
     number nobody derived, until the turn began at the corner rather
     than at a set-back line and the right turn got tighter: 0.39.) */
  check(inBox.length > 10 && worstOff < weaveRoom(3.6), `through a right turn with the wheel straight the car holds the committed arc (${inBox.length} ticks in the box, at most ${worstOff.toFixed(2)} m off its line, against the ${weaveRoom(3.6).toFixed(2)} m weave room)`);
  /* Judged as the car leaves the box, which is what the turn decides. Past
     it a wheel held dead straight lets the car drift on the heading the arc
     left it with, and since a drift across a lane line on the exit stretch
     re-bases the car in the lane it is now in (20 October) -- as on the
     approach -- the LAST tick says where the drift went, not where the turn
     put the car. */
  const out = r.record.find((m) => { const p = w0.course.at[m.k].layout.paths[m.route]; return m.leg === 0 && m.s > p.clearAt; });
  check(out && w0.course.at[out.k].layout.paths[out.route].to === curbOf("A-west|end"), `and comes out of the box on the west road in its curb lane (${out ? out.route : "never left the box"})`);
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
        if ((a.route.startsWith("N|") || a.route.startsWith("S|")) && a.v < 0.3 && Math.abs(a.s - restAt(pa, a)) < 2.5 && Math.abs(mine.x - 500) < 40) minorWaited++;
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

/* 7. THE PRESSURE THAT STOPS YOU AT THE LINE. The maintainer liked the
   throttle's hold band and said braking wanted "something similar";
   the shape proposed, and built: a marker at the brake pressure that,
   held, brings the car to rest exactly at the line. What any correct
   version must do:
     - the marker is exactly that pressure (v^2/2d, through accelFor);
     - HOLD IT AND IT STAYS STILL, because a constant deceleration keeps
       v^2/2d constant -- tracking it is a smooth stop at the line;
     - leave it late and it slides DOWN the brake (more needed later);
     - it appears only when the rules say stop, from the same
       `whatStops` the traffic obeys;
     - and the stop is judged on manner before position: tracking the
       marker is a clean stop, stamping on the brake late is a harsh
       one, a controlled stop short of the line is short. */
{
  /* The pure part. */
  const v = 13.9, d = 40, b = stopBand(v, d);
  check(Math.abs(accelFor(b.at, v) + (v * v) / (2 * d)) < 1e-6, `the marker is the pressure whose deceleration is v^2/2d: ${((v * v) / (2 * d)).toFixed(2)} m/s^2 for 50 km/h and 40 m`);
  check(b.lo < b.at && stopBand(v, 20).at < b.at, "the band reaches down to a stop two metres short, and the closer the line the further down the marker sits");
  check(stopBand(v, 8).can === false && stopBand(v, 20).can === true, `full brake cannot stop 50 km/h in 8 m (it needs ${((v * v) / (2 * (-accelFor(-1, v)))).toFixed(1)}), so the screen says so`);

  /* In the world: a two-way stop on the map, empty, the player coming
     down the stopping leg at 50 km/h. */
  const w0 = empty(seedGraph(1, 50, loaded, { every: 2 }));
  const legId = curbOf("B-north|end");
  const k = w0.course.at.findIndex((s) => s.layout.legs[legId]);
  const layout = w0.course.at[k].layout, route = routeForSignal(layout, legId, null), path = layout.paths[route];
  const waitAt = path.stopAt - CAR.length / 2;
  const run = (ctrl) => {
    let me = { ...playerAt(w0, k, route), s: Math.max(0, waitAt - 140), v: 13.9, off: 0 }, world = withDriver(w0, me);
    const marks = [];
    for (let i = 0; i < 20 * 40 && !me.lastStop; i++) {
      const ahead = aheadOf(me, w0.course, world);
      if (ahead.stop) marks.push({ at: ahead.stop.at, d: ahead.stop.d, v: me.v });
      me = stepDriver(me, { steer: 0, slider: ctrl(me, ahead.stop) }, world, DT);
      world = withDriver(world, me);
    }
    return { me, marks };
  };
  const track = run((m, s) => (s ? s.at : holdAt(m.v)));
  const drift = track.marks.length > 5 ? Math.max(...track.marks.slice(2, -8).map((x) => x.at)) - Math.min(...track.marks.slice(2, -8).map((x) => x.at)) : 1;
  /* Held, it is not perfectly still, and should not be: the brake adds
     to what the air takes, and the air takes less as the car slows, so
     a fixed pressure decelerates a little less on the way in and the
     marker eases down a few percent. That is the honest physics, and
     it is why the statement below is a COMPARISON with leaving it late
     rather than a threshold nobody derived. */
  check(track.marks.length > 20, `approaching a stop sign at 50 km/h the marker appears ${track.marks[0]?.d.toFixed(0)} m out; held on, it moves ${(drift * 100).toFixed(1)}% of the slider over the whole approach`);
  check(track.me.lastStop?.verdict === "clean" && Math.abs(track.me.lastStop.err) <= 2, `tracking it is a clean stop at the line (${track.me.lastStop?.verdict}, ${track.me.lastStop?.err.toFixed(2)} m from the line, peak ${track.me.lastStop?.peak.toFixed(1)} m/s^2)`);

  /* Leave it late: hold speed until the marker is well down the brake,
     then the marker has slid down -- more pressure the later you leave it. */
  /* "Late" is defined by the sim's own line between controlled and
     abrupt: the driver holds speed until the stop needs more than
     HARSH_AT, which is exactly when it can no longer be a smooth one. */
  const lateAt = (x) => x.d < (x.v * x.v) / (2 * HARSH_AT);
  let stamped = false;   // a driver who stamps on the brake keeps it there until the car stops
  const late = run((m, s) => { if (s && lateAt({ d: s.d, v: m.v })) stamped = true; return stamped ? -1 : holdAt(m.v); });
  const early = late.marks[0]?.at, whenLate = late.marks.find(lateAt)?.at;
  const slid = early - whenLate;
  check(early != null && whenLate != null && slid > 5 * drift, `leave it late and the marker slides down the brake: from ${early?.toFixed(2)} when it appeared to ${whenLate?.toFixed(2)} by the time the driver moves -- ${(slid / drift).toFixed(0)} times as far as it moves for a driver holding it`);
  check(late.me.lastStop?.verdict === "harsh" && late.me.lastStop.peak > HARSH_AT, `and stamping on it then is a harsh stop, whatever the position (${late.me.lastStop?.verdict}, peak ${late.me.lastStop?.peak.toFixed(1)} against ${HARSH_AT.toFixed(1)})`);

  /* A controlled stop in the wrong place is a knowledge fault, not a braking one. */
  const short = run((m, s) => (s ? sliderFor(-(m.v * m.v) / (2 * Math.max(0.5, s.d - 6)), m.v) : holdAt(m.v)));
  check(short.me.lastStop?.verdict === "short", `a smooth stop aimed six metres short is called short, not harsh (${short.me.lastStop?.verdict}, ${short.me.lastStop?.err.toFixed(1)} m, peak ${short.me.lastStop?.peak.toFixed(1)})`);

  /* Only when the rules say stop: the same approach with the stop sign
     taken away -- the through road of the same crossroads -- shows no
     marker at all. */
  const through = curbOf("A-B|end");
  const kt = w0.course.at.findIndex((s) => s.layout.legs[through]);
  const rt = routeForSignal(w0.course.at[kt].layout, through, null), pt = w0.course.at[kt].layout.paths[rt];
  let mt = { ...playerAt(w0, kt, rt), s: Math.max(0, pt.stopAt - 60), v: 13.9, off: 0 }, wt = withDriver(w0, mt), shown = 0;
  for (let i = 0; i < 20 * 6; i++) { if (aheadOf(mt, w0.course, wt).stop) shown++; mt = stepDriver(mt, { steer: 0, slider: holdAt(mt.v) }, wt, DT); wt = withDriver(wt, mt); }
  check(shown === 0, `on the through road of the same crossroads, with nothing to stop for, the marker never appears (${shown} ticks)`);

  /* THE TURN'S PRESENTATION, fixed at the root: "the turn speed
     indicator encourages a smooth turn but every intersection is a full
     stop." Where a stop comes first there is no corner advice at all;
     where the car drives through, the corner has a marker like a stop's
     -- the pressure that brings it to the corner's clean speed at the
     arc -- and tracking it is a clean turn that carries its speed. */
  const stopLeg = curbOf("B-north|end");
  const ks = w0.course.at.findIndex((s) => s.layout.legs[stopLeg]);
  const rightAtStop = routeForSignal(w0.course.at[ks].layout, stopLeg, "right");
  const ps = w0.course.at[ks].layout.paths[rightAtStop];
  let ms = { ...playerAt(w0, ks, rightAtStop), s: ps.stopAt - 40, v: 13.9, off: 0, signal: "right" };
  const aS = aheadOf(ms, w0.course, withDriver(w0, ms));
  check(aS.intent === "right" && aS.cornerSpeed == null && aS.stop?.kind === "stop", `turning right at a stop sign: no corner advice, only the stop marker -- from rest the corner is the pull-away's, not the approach's`);

  /* Through the uncontrolled T at D, turning right: nothing to stop for. */
  const thruLeg = curbOf("B-D|end");
  const kd = w0.course.at.findIndex((s) => s.layout.legs[thruLeg]);
  const rightThru = routeForSignal(w0.course.at[kd].layout, thruLeg, "right");
  const pd = w0.course.at[kd].layout.paths[rightThru];
  let md = { ...playerAt(w0, kd, rightThru), s: Math.max(0, pd.stopAt - 120), v: 13.9, off: 0, signal: "right" }, wd = withDriver(w0, md);
  let cornerShown = 0, vAtArc = null, vc = null;
  for (let i = 0; i < 20 * 30 && !md.lastTurn; i++) {
    const a = aheadOf(md, w0.course, wd);
    if (a.stop?.kind === "corner") { cornerShown++; vc = a.stop.vc; }
    const slider = a.stop?.kind === "corner" ? a.stop.at : holdAt(md.v, md.grade ?? 0);
    const before = md.s;
    md = stepDriver(md, { steer: 0, slider }, wd, DT); wd = withDriver(wd, md);
    if (before <= pd.stopAt && md.s > pd.stopAt && md.k === kd) vAtArc = md.v;
  }
  check(cornerShown > 10 && vc != null && vAtArc != null && vAtArc <= vc * 1.02 && vAtArc >= vc * 0.8,
    `turning right through the uncontrolled T at 50 km/h, the corner marker appears (${cornerShown} ticks), and tracking it arrives at the arc at ${(vAtArc * 3.6).toFixed(0)} km/h for a corner that wants ${(vc * 3.6).toFixed(0)}`);
  check(md.lastTurn?.verdict === "clean", `and the turn is clean (${md.lastTurn?.verdict}, ${(md.lastTurn?.vPeak * 3.6).toFixed(0)} km/h through it)`);
}

/* 8. A CAR RUN WIDE PAST ITS ROUTE'S ROAD IS NOT PULLED BACK TO IT
   (DECISIONS 10.64, the maintainer's stagger). His recipe: signal a turn,
   take it so fast the car leaves the lane, then drive by hand. The car is
   only ever measured against its route, and past the exit's lanes nothing
   re-bases it -- so the assist steered at full authority for a lane the
   car was 16-19 m from, and the grass was judged by distance from it. The
   guard: further than LOST_BEYOND past the route's road, the assist does
   not act. The grass still does, on purpose (player.js): lifting it took
   the drag off cars genuinely off the road and broke verify-contact.
   Stated here, not read from the module: at 45 km/h through the 9.3 m
   right the car ends up more than a lane off the road; at 32 it does not,
   and still settles in a lane. */
{
  const w0 = { ...seedGraph(1, 50, loaded, { every: 2 }), actors: [] };
  const run = (kmh) => {
    const leg = "A-north|end#1", k = w0.course.at.findIndex((s) => s.layout.legs[leg]);
    const layout = w0.course.at[k].layout, route = routeForSignal(layout, leg, "right"), path = layout.paths[route];
    let me = { ...playerAt(w0, k, route), s: path.stopAt - 0.5, v: kmh / 3.6, signal: "right", going: true, accepted: true, off: 0 };
    let world = withDriver(w0, me), lostTicks = 0, pulledWhileLost = 0, crawledWhileLost = 0, offMax = 0;
    for (let i = 0; i < 20 * 12; i++) {
      const was = me;
      me = stepDriver(me, { steer: 0, slider: holdAt(me.v, me.grade ?? 0), assist: 1 }, world, DT);
      world = withDriver(world, me);
      offMax = Math.max(offMax, Math.abs(me.off));
      if (me.lost) { lostTicks++; if (Math.abs(me.assist ?? 0) > 1e-9) pulledWhileLost++; if (was.lost && me.v < was.v - 1.4 * DT) crawledWhileLost++; }
    }
    return { me, lostTicks, pulledWhileLost, crawledWhileLost, offMax };
  };
  const fast = run(45), slow = run(32);
  check(fast.lostTicks > 40, `45 km/h into the right runs the car more than a lane off its route's road (${fast.lostTicks} ticks lost, ${fast.offMax.toFixed(1)} m off)`);
  check(fast.pulledWhileLost === 0, `and out there the lane assist never steers for the route's lane (${fast.pulledWhileLost} ticks pulled)`);
  check(slow.lostTicks === 0 && Math.abs(slow.me.off) < 0.5 && slow.me.lastTurn?.verdict === "wide", `at 32 km/h it runs wide, is never lost, and the assist settles it in a lane (${slow.me.lastTurn?.verdict}, off ${slow.me.off.toFixed(2)} m)`);
}

/* 9. THE CAR'S REAL POSITION (DECISIONS 10.64 (b), 10.65, 10.67), behind
   `world.realPos`. Section 8's guard stops the assist pulling; it does not
   tell the car where it is. THE TURN ABANDONED, stated here: signal right at
   the crossroads from the north, take it at 45 km/h so the car leaves the
   road, and a second later steer for the road STRAIGHT AHEAD instead and
   drive down it, asking for 45 km/h, then take the hands off. That road is
   another street from the one the route is latched to.
     With the switch off (HEAD) the car stays measured against the latched
     lane: lost, tens of metres "off", held to the grass's quarter speed on
     pavement. With it on, the car is located on the lane it reaches.
   Where the car is, is asked of the road's own path here (poseOnGraph),
   never of the car's `off`. */
console.log("\n9. The car's real position: re-located onto the lane it is in, and on no lane when it is in none");
{
  const base = { ...seedGraph(1, 50, loaded, { every: 2 }), actors: [] };
  const leg = "A-north|end#1", k = base.course.at.findIndex((s) => s.layout.legs[leg]);
  const layout = base.course.at[k].layout, route = routeForSignal(layout, leg, "right"), path = layout.paths[route];
  const aim = routeForSignal(layout, leg, null), ap = layout.paths[aim];
  const course = base.course;
  const nearestOn = (p) => { let sn = ap.clearAt + 1, dn = Infinity; for (let q = ap.clearAt + 1; q <= ap.length; q += 0.25) { const c = poseOnGraph(course, k, aim, q), d = Math.hypot(c.x - p.x, c.y - p.y); if (d < dn) { dn = d; sn = q; } } return { s: sn, d: dn }; };
  const turnOf = (a, b) => ((a - b + 540) % 360) - 180;
  const abandoned = (real, kmh = 45, steerBack = true) => {
    const w0 = real ? { ...base, realPos: true } : base;
    let me = { ...playerAt(w0, k, route), s: path.stopAt - 0.5, v: kmh / 3.6, signal: "right", going: true, accepted: true, off: 0 };
    let acted = 0, world = withDriver(w0, me), out = null, settled = null, jump = 0, swing = 0, pulledOffLane = 0, noLaneTicks = 0;
    const log = [];
    let was = driverPose(me, course);
    for (let i = 0; i < 20 * 24; i++) {
      const t = i * DT, pz = driverPose(me, course);
      if (me.lastTurn && out == null) out = t;
      let steer = 0, slider = holdAt(me.v, me.grade ?? 0);
      if (steerBack && out != null && t - out >= 1) {
        const n = nearestOn(pz), tp = poseOnGraph(course, k, aim, Math.min(ap.length, n.s + 20));
        const e = turnOf(pz.heading, (Math.atan2(tp.y - pz.y, tp.x - pz.x) * 180) / Math.PI);
        if (n.d < 0.6 && Math.abs(e) < 6) settled ??= t;
        steer = settled != null ? 0 : Math.max(-1, Math.min(1, -e / 20));
        if (me.v < 12.5) slider = 0.8;
      }
      const before = me;
      me = stepDriver(me, { steer, slider, assist: 1 }, world, DT);
      world = withDriver(world, me);
      const now = driverPose(me, course);
      /* THE POSE NEVER JUMPS: a tick moves the car by its speed and turns it by what a wheel can, whatever
         happened to its route in that tick. A tick's worth, and a centimetre and a degree for the arithmetic. */
      /* ASKED ON THE TICKS THIS MACHINERY ACTS -- on no lane, entering it, leaving it, re-located. Not
         everywhere: on its route inside a box, off its arc, the car's pose already steps as it passes each
         vertex of the arc (the offset times the bend there: 209 mm in a tick at 45 km/h, 149 at 32, with the
         switch off -- tools measured 10 November, DECISIONS 10.67). That is the route's frame, HEAD's, and
         not this section's to assert away. */
      if (me.noLane || before.noLane || (me.relocated ?? 0) !== (before.relocated ?? 0)) {
        acted++;
        jump = Math.max(jump, Math.hypot(now.x - was.x, now.y - was.y) - Math.max(before.v, me.v) * DT);
        swing = Math.max(swing, Math.abs(turnOf(now.heading, was.heading)));
      }
      if (me.noLane) { noLaneTicks++; if (Math.abs(me.assist ?? 0) > 1e-9) pulledOffLane++; }
      log.push(me);
      was = now;
    }
    const end = driverPose(me, course), at = nearestOn(end);
    return { me, end, at, acted, jump, swing, pulledOffLane, noLaneTicks, settled, log };
  };
  const on = abandoned(true), offSw = abandoned(false);
  check(offSw.me.lost && Math.abs(offSw.me.off) > 50 && offSw.me.v * 3.6 < 31,
    `switch off, the turn abandoned for the road straight ahead: still measured against the latched lane (lost ${offSw.me.lost}, ${Math.abs(offSw.me.off).toFixed(0)} m "off", ${(offSw.me.v * 3.6).toFixed(0)} km/h asked 45)`);
  check(on.me.relocated >= 1 && !on.me.noLane && !on.me.lost && layout.paths[on.me.route]?.to === ap.to || (on.me.k !== k && on.me.relocated >= 1 && !on.me.noLane),
    `switch on: located on the road it drove onto (re-located ${on.me.relocated ?? 0} time(s), on no lane ${!!on.me.noLane}, route ${on.me.route})`);
  check(on.noLaneTicks > 40 && on.pulledOffLane === 0, `between the two it was on no lane (${on.noLaneTicks} ticks) and the assist never steered there (${on.pulledOffLane})`);
  check(Math.abs(on.me.off) < 0.5 && on.me.v * 3.6 > 40, `and from then its offset is from the lane it is in, and pavement does not drag (off ${on.me.off.toFixed(2)} m, ${(on.me.v * 3.6).toFixed(0)} km/h asked 45)`);
  /* Hands off since `settled`: the assist holds it on a road that bends. By the road's own path, not by `off`.
     If it has gone on across the seam, it is on the next intersection's path, and the last pose on this one is asked. */
  const lastHere = [...on.log].reverse().find((m) => m.k === k), lastPose = lastHere ? driverPose(lastHere, course) : null;
  check(on.settled != null && lastPose && nearestOn(lastPose).d < 0.5, `hands off from ${on.settled?.toFixed(1)} s, it holds the bending road: ${lastPose ? nearestOn(lastPose).d.toFixed(2) : "-"} m from that lane's own line at the last of it`);
  check(on.acted > 100 && on.jump < 0.01 && on.swing < 4, `on no lane, entering it and re-located out of it, its pose never jumps: over ${on.acted} ticks at most ${(on.jump * 1000).toFixed(1)} mm more than a tick's travel, ${on.swing.toFixed(2)} degrees in a tick`);
  /* A car that never goes a lane off its line cannot tell the switch is on: 32 km/h, the mild run-wide. */
  const mildOn = abandoned(true, 32, false), mildOff = abandoned(false, 32, false);
  const sameTicks = mildOn.log.filter((m, i) => JSON.stringify(m) === JSON.stringify(mildOff.log[i])).length;
  check(sameTicks === mildOn.log.length && mildOn.log.length === 480, `at 32 km/h, run wide and settled by the assist, the car is the same car tick for tick with the switch on (${sameTicks} of ${mildOn.log.length})`);
  /* ...AND ON A TURN BAY'S TAPER, where the bay's line is nearer than the car's own lane's and the bay is not yet
     a lane to be in (drive.js laneChange): a car drifted 0.7 m toward the opening bay stays the same car, tick for
     tick. Asking the world before a whole lane off the line re-bases it onto the bay here. (Added because asking
     every tick passed everything else: 10 November. 0.7 m and not 0.9: at 0.9 the body's edge is exactly on the
     centre line, and whether it has a stand-in in the oncoming lane is a coin's edge -- 11 November.) */
  {
    const kb = course.at.findIndex((sp) => sp.layout.paths["B-east|end#0/E-east|start#0"]), rb = "B-east|end#0/E-east|start#0";
    const taper = (real) => {
      const w0 = real ? { ...base, realPos: true } : base;
      let me = { ...playerAt(w0, kb, rb), s: 60, v: 10, off: -0.7 }, world = withDriver(w0, me);
      const log = [];
      for (let i = 0; i < 80; i++) { me = stepDriver(me, { steer: 0, slider: holdAt(me.v, 0), assist: 0 }, world, DT); world = withDriver(world, me); log.push(JSON.stringify(me)); }
      return { log, me };
    };
    const a = taper(true), b = taper(false);
    const same = a.log.filter((x, i) => x === b.log[i]).length;
    check(kb >= 0 && b.me.s > 95 && same === 80, `along a turn bay's taper, 0.7 m toward the bay, the car is the same car tick for tick with the switch on (${same} of 80, to ${b.me.s.toFixed(0)} m)`);
  }
  /* Left alone at 45: on no lane, on grass, it slows to a crawl in a straight line -- the grass is still grass. */
  const alone = abandoned(true, 45, false), tail = alone.log.filter((m) => m.noLane);
  const a0 = tail[0]?.at, a1 = tail[Math.floor(tail.length / 2)]?.at, a2 = tail[tail.length - 1]?.at;
  const bow = a0 && a2 ? Math.abs((a2.x - a0.x) * (a1.y - a0.y) - (a2.y - a0.y) * (a1.x - a0.x)) / (Math.hypot(a2.x - a0.x, a2.y - a0.y) || 1) : Infinity;
  check(tail.length > 100 && bow < 0.01 && alone.me.v < 1, `left alone at 45 it is on no lane, goes straight (${(bow * 1000).toFixed(1)} mm off a line over ${tail.length} ticks) and the grass stops it (${(alone.me.v * 3.6).toFixed(1)} km/h)`);

  /* THE WRONG WAY DOWN A ROAD IS ON NO LANE, ON PAVEMENT. A car put on an oncoming lane's line, against it:
     never located on that lane; full throttle for 8 s it passes 60 km/h (the grass's cap is a quarter of
     120: 30); and the wheel turns it at the car's own yaw rate, clockwise for right (y is down). */
  const w1 = { ...base, realPos: true };
  const lane = poseOnGraph(course, k, route, 150);   // the approach, southbound; the car is put on it facing north
  let wrong = { ...playerAt(w1, k, route), s: 150, v: 0, noLane: true, lost: true, at: { x: lane.x, y: lane.y, z: lane.z ?? 0, heading: lane.rot + 180 } };
  let ww = withDriver(w1, wrong), everLocated = 0;
  for (let i = 0; i < 160; i++) { wrong = stepDriver(wrong, { steer: 0, slider: 1, assist: 1 }, ww, DT); ww = withDriver(ww, wrong); if (!wrong.noLane) everLocated++; }
  const went = Math.hypot(wrong.at.x - lane.x, wrong.at.y - lane.y);
  check(everLocated === 0 && wrong.v * 3.6 > 60 && went > 60, `against the traffic on a lane's own line: on no lane throughout (${everLocated} ticks located), and pavement is pavement (${(wrong.v * 3.6).toFixed(0)} km/h after 8 s, ${went.toFixed(0)} m)`);
  /* ...AND ON PAST THE END OF THE PATH ITS GHOST IS ON. The route's own terms (a distance along, an offset)
     cannot say where a car is once it is beyond the path's end: only the pose kept in the world can. Driven on
     north for 10 s more it leaves the top of that approach; every tick its pose moves by its speed, and the sum
     is the distance gone. (Added because ignoring the kept pose passed everything above: 10 November.) */
  {
    let far = wrong, wf = ww, gone = 0, worst = 0, pastEnd = 0;
    const from = driverPose(far, course);
    let was = from;
    for (let i = 0; i < 200; i++) {
      far = stepDriver(far, { steer: 0, slider: holdAt(far.v, 0), assist: 1 }, wf, DT); wf = withDriver(wf, far);
      const now = driverPose(far, course), d = Math.hypot(now.x - was.x, now.y - was.y);
      gone += far.v * DT; worst = Math.max(worst, Math.abs(d - far.v * DT)); was = now;
      if (far.noLane && far.s <= 0) pastEnd++;
    }
    const moved = Math.hypot(was.x - from.x, was.y - from.y);
    check(pastEnd > 20 && worst < 0.001 && Math.abs(moved - gone) < 0.01, `driven on past the end of the path its ghost is on (${pastEnd} ticks beyond it), its pose still moves by its speed every tick: ${moved.toFixed(1)} m gone for ${gone.toFixed(1)} m driven, worst tick ${(worst * 1000).toFixed(2)} mm out`);
  }
  const h0 = wrong.at.heading, v0 = wrong.v;
  for (let i = 0; i < 10; i++) { wrong = stepDriver(wrong, { steer: 0.2, slider: holdAt(wrong.v, 0), assist: 1 }, ww, DT); ww = withDriver(ww, wrong); }
  const turned = turnOf(wrong.at.heading, h0), expect = (0.2 * (6.0 / v0) * 0.5 * 180) / Math.PI;   // a fifth of the grip-limited yaw (6 m/s^2 over the speed) for half a second
  check(turned > 0 && Math.abs(turned - expect) < 0.15 * expect, `a fifth of the wheel to the right for half a second turns it ${turned.toFixed(2)} degrees clockwise (${expect.toFixed(2)} by the tyres' grip)`);
  /* And turned round to face the way the lane goes, it is taken by that lane. */
  let round = { ...wrong, v: 5, at: { x: lane.x, y: lane.y, z: lane.z ?? 0, heading: lane.rot + 10 } };
  round = stepDriver(round, { steer: 0, slider: 0.5, assist: 1 }, withDriver(w1, round), DT);
  const back = driverPose(round, course);
  check(!round.noLane && round.k === k && layout.paths[round.route].from === path.from && Math.abs(round.off) < 0.3 && Math.hypot(back.x - lane.x, back.y - lane.y) < 0.5,
    `the same place facing the lane's way is that lane (on no lane ${!!round.noLane}, off ${round.off.toFixed(2)} m, ${Math.hypot(back.x - lane.x, back.y - lane.y).toFixed(2)} m from where it was put)`);
}

/* 10. THE TRAFFIC PERCEIVES BY GEOMETRY, NOT BY LANE MEMBERSHIP (DECISIONS 10.68, the maintainer's ruling):
   a car on no lane is seen where its BODY is and avoided; nobody yields to it; and where its route says it
   is, nothing is -- the ghost is gone. One traffic car per scene, on test map 1, the real position on. What
   each car should do is stated here; the scenes at HEAD are DECISIONS 10.67 (a car stood behind the ghost
   with the player 34 m away, and a car drove into a standing player at 35 km/h). LANES ONLY: nothing here
   is in a box. */
console.log("\n10. The traffic sees a car on no lane where its body is: avoided, not yielded to, and no ghost");
{
  let warm = seedGraph(1, 50, loaded, { every: 2 });
  for (let i = 0; i < 200; i++) warm = step(warm);
  const template = warm.actors.find((a) => !a.player && a.kind !== "truck" && a.kind !== "bus");
  const empty = { ...warm, actors: [], every: 1e9, nextAt: 1e9, realPos: true }, course = empty.course;
  const car = (id, k, route, s, v) => ({ ...template, id, k, route, s, v, lc: null, pass: null, crash: null, stoppedAt: null, going: false, accepted: false, want: null });
  const leg = "A-north|end#1", k = course.at.findIndex((sp) => sp.layout.legs[leg]), layout = course.at[k].layout;
  const west = "A-B|start#0/A-west|end#0";
  const scene = (me, other, secs) => {
    let w = withDriver({ ...empty, actors: [other] }, me), stood = 0, vMin = Infinity, nearest = Infinity, hit = false, o = other, shadows = 0;
    for (let i = 0; i < secs / DT; i++) {
      me = stepDriver(me, { steer: 0, slider: 0, assist: 0 }, w, DT);
      w = step(withDriver(w, me));
      shadows = Math.max(shadows, w.actors.filter((a) => a.shadow).length);
      const now = w.actors.find((a) => a.id === other.id);
      if (!now) break;
      o = now;
      const p = poseOf(w, o), m = driverPose(me, course);
      nearest = Math.min(nearest, Math.hypot(p.x - m.x, p.y - m.y));
      vMin = Math.min(vMin, o.v ?? 0);
      if ((o.v ?? 0) < 0.2) stood += DT;
      if (touching({ ...m, z: m.z ?? 0 }, { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot })) hit = true;
    }
    const p = poseOf(w, o), m = driverPose(me, course);
    return { o, stood, vMin, nearest, hit, shadows, endGap: Math.hypot(p.x - m.x, p.y - m.y), w, me };
  };
  const offRoad = (at, kGhost, rGhost, sGhost) => ({ ...playerAt(empty, kGhost, rGhost), s: sGhost, v: 0, going: true, accepted: true, noLane: true, lost: true, at });

  /* A. NO GHOST: the player on the grass 34 m from the road, their route still naming the westbound lane. */
  const g = poseOnGraph(course, k, west, 227.6);
  const A = scene(offRoad({ x: 372.4, y: 432.1, z: g.z ?? 0, heading: 117 }, k, west, 227.6), car("a", k, west, 227.6 - 90, 12), 20);
  check(A.stood === 0 && A.vMin * 3.6 > 25 && (A.o.k !== k || A.o.s > 227.6 + 40) && A.shadows === 0,
    `a car coming down the lane the player's route still names drives on past where the ghost was: never stands (${A.stood.toFixed(1)} s), never under ${(A.vMin * 3.6).toFixed(0)} km/h, ${A.shadows} stand-ins for a car on the grass`);

  /* B. SEEN, TWO LANES: the player standing in the southbound lane, against it. The car in that lane must not touch them. */
  const south = routeForSignal(layout, leg, null), sAt = poseOnGraph(course, k, south, 200);
  const B = scene(offRoad({ x: sAt.x, y: sAt.y, z: sAt.z ?? 0, heading: sAt.rot + 180 }, k, west, 300), car("b", k, south, 90, 12), 16);
  check(!B.hit && B.shadows >= 1 && B.nearest > 3.0, `a car coming down a lane the player stands in, against it, does not touch them: nearest ${B.nearest.toFixed(1)} m centre to centre, ${B.shadows} stand-in(s) (it ${B.stood > 1 ? "stopped" : "went round"})`);

  /* C. SEEN, ONE LANE: nowhere to go round. It stops short and stands. */
  let one = null;
  course.at.forEach((spot, kk) => { for (const [r, p] of Object.entries(spot.layout.paths)) { const lg = spot.layout.legs[p.from]; if (!one && p.intent === "straight" && p.stopAt > 220 && (lg.across ?? lg.lanes) === 1 && !lg.oneWay) one = { kk, r }; } });
  const cAt = poseOnGraph(course, one.kk, one.r, 200);
  const C = scene(offRoad({ x: cAt.x, y: cAt.y, z: cAt.z ?? 0, heading: cAt.rot + 180 }, k, west, 300), car("c", one.kk, one.r, 90, 12), 20);
  /* Stopped behind: bumper to bumper the gap is the centre distance less a car's length (4.5 m). */
  check(!C.hit && C.stood > 3 && C.endGap - 4.5 > 0.5 && C.endGap - 4.5 < 8, `on a one-lane road it stops short of them and stands: ${(C.endGap - 4.5).toFixed(1)} m clear, stood ${C.stood.toFixed(1)} s, untouched`);
  /* ...and ACROSS the lane, a body at right angles is as much in the road as one along it. */
  const X = scene(offRoad({ x: cAt.x, y: cAt.y, z: cAt.z ?? 0, heading: cAt.rot + 90 }, k, west, 300), car("x", one.kk, one.r, 90, 12), 20);
  check(!X.hit && X.stood > 3, `and a car standing ACROSS that lane is stopped for too (stood ${X.stood.toFixed(1)} s, ${(X.endGap).toFixed(1)} m off, untouched)`);

  /* D. NO RIGHT OF WAY. Wherever a driver would give way to a car coming on a conflicting approach, they do not
     give way to a stand-in in the same place, at the same speed: it is avoided, not yielded to. */
  let pairs = 0, yielded = 0, toStandIn = 0;
  course.at.forEach((spot, kk) => {
    const L = spot.layout, rs = Object.keys(L.paths);
    for (const r1 of rs) for (const r2 of rs) {
      if (pairs >= 400 || L.paths[r1].from === L.paths[r2].from) continue;
      const me = { ...car("m", kk, r1, L.paths[r1].stopAt - 3, 0), stoppedAt: 0 }, them = { ...car("t", kk, r2, L.paths[r2].stopAt - 12, 10), going: true, accepted: true };
      if (!blockedBy(me, them, L, 1, 10)) continue;
      pairs++; yielded++;
      if (blockedBy(me, { ...them, player: true, shadow: true, noRight: true }, L, 1, 10)) toStandIn++;
    }
  });
  check(pairs > 50 && toStandIn === 0, `of ${pairs} places where a driver at their line gives way to a car coming on, none gives way to a stand-in there (${toStandIn})`);

  /* E. A CAR THAT KEEPS TO ITS OWN SIDE OF THE ROAD HAS NO STAND-INS, however it wanders in its lanes. */
  const r2l = routeForSignal(layout, leg, null);
  let me = { ...playerAt(empty, k, r2l), s: 60, v: 12 }, w = withDriver(empty, me), any = 0;
  let driven = 0, offMax = 0;
  for (let i = 0; i < 400; i++) { me = stepDriver(me, { steer: 0.05 * Math.sin(i / 14), slider: holdAt(12, 0), assist: 0 }, w, DT); w = withDriver(w, me); driven += me.v * DT; offMax = Math.max(offMax, Math.abs(me.off)); if (me.shadows || w.actors.some((a) => a.shadow || a.offLane)) any++; }
  check(any === 0 && driven > 150 && offMax > 0.3, `weaving on its own side of the road for 20 s, lanes and shoulder (${driven.toFixed(0)} m, up to ${offMax.toFixed(1)} m off its lane's line), the player has no stand-in and is never flagged (${any} ticks)`);
  /* ...and over the centre line it has one, in the oncoming lane, standing still to the traffic there. */
  const onc = { ...playerAt(empty, k, r2l), s: 150, v: 10, off: -(0.5 + (layout.legs[leg].pos ?? layout.legs[leg].lane)) * 3.6 - 1.5 };
  const stepped = stepDriver(onc, { steer: 0, slider: holdAt(10, 0), assist: 0 }, withDriver(empty, onc), DT);
  const ww = withDriver(empty, stepped), stand = ww.actors.filter((a) => a.shadow);
  const sp = stand.map((a) => course.at[a.k].layout.paths[a.route]).filter(Boolean);
  check(!stepped.noLane && stand.length >= 1 && stand.every((a) => a.v === 0 && a.noRight) && sp.every((q) => q.from !== layout.paths[r2l].from),
    `1.5 m over the centre line, still on its own lane by route, it has ${stand.length} stand-in(s) in the oncoming carriageway, at rest to the traffic there`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the signal picks the exit it means and only before the line, the box is committed to and the road is driven, the seam is seamless, the corner has to be earned, the stop marker holds still when held and slides when left late, and the traffic treats the player as its own.");
