/* =====================================================================
   BUSES AND THEIR STOPS (SIMULATOR.md, "3. Bus stops"), slice A.

   1. A stop is a place, and the loader puts it beside its road, on its
      side, serving the direction whose curb it is at -- and refuses by
      name one beside no road, too near an intersection, or on the wrong
      side of a one-way road.
   2. Every bus that drives past a stop in its lane stands at it, with its
      front door at the sign, for its dwell, and then goes on; nothing but
      a bus ever stops there.
   3. The traffic behind a standing bus waits behind it -- a queue forms
      -- and nothing touches anything.
   4. A map without stops has no buses and is tick for tick the world it
      was.
   5. Passengers (slice B): people walking past a stop wait there, get on
      at the door of a bus standing at it once its people are off, and get
      off at that door; a bus stands as long as that takes, between its
      shortest and longest stand, and never shuts its doors on somebody
      still waiting short of the longest.
   6. Bays (slice C): the road's surface steps back at a bay; a bus in it
      is out of the lane and the traffic passes it; when it signals to pull
      out, nobody who knows to give way and could stop drives past it,
      those who do not know do, and it waits for the road behind rather
      than pulling out on the rule -- and not for ever.
   7. Going round a stopped bus (slice D): on a broken centre line or none, a car
      stopped behind a bus at a curb stop goes round it when the oncoming
      gap is one it takes -- bold drivers too, theirs to misjudge -- which
      cuts the time stood behind the bus, touches nothing, and never
      happens on a solid line -- but does on an unmarked street.

   Usage: node tools/verify-buses.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testBuses, testMap1 } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";
import { laneSpanOnGraph } from "../src/sim/graph.js";
import { stopsOf, DWELL, MIN_DWELL, MAX_DWELL, inBay, laneAt } from "../src/sim/buses.js";
import { planPass } from "../src/sim/passing.js";
import { onRoadSurface } from "../src/map/sidewalks.js";
import { reads, DIFFICULTY } from "../src/core/driver.js";
import { walkNetOf, walkerPose, WAIT_PATIENCE } from "../src/sim/walkers.js";
import { DT, lenOf } from "../src/sim/traffic.js";

let fails = 0;
/* VEHICLES TOUCHING VEHICLES. A person struck is peds.js's content -- the
   heedless one who darts out between parked cars ahead of the traffic, by
   design -- and verify-peds holds it to the fairness rules. Counted here
   it made "nothing touched" a claim about pedestrians this check never
   tests, green only while nobody happened to dart out (1 October). */
const vehicleCrashes = (w) => (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped") && !String(c.b).startsWith("ped")).length;
const ok = (cond, msg) => { console.log(`${cond ? "  ok  " : "  FAIL"} ${msg}`); if (!cond) fails++; };

console.log("1. a stop is a place beside a road, serving one direction");
{
  const loaded = loadMap(testBuses());
  const by = Object.fromEntries(loaded.stops.map((s) => [s.id, s]));
  ok(by["east-curb"]?.road === "main-w" && by["east-curb"].dir === "fwd", `the stop south of the road serves eastbound traffic (${by["east-curb"]?.road} ${by["east-curb"]?.dir})`);
  ok(by["west-curb"]?.road === "main-e" && by["west-curb"].dir === "rev", `the stop north of the road serves westbound traffic (${by["west-curb"]?.road} ${by["west-curb"]?.dir})`);
  const m = emptyMap("bad", "bad");
  m.roads.push(road({ id: "a", lanes: 1, points: [{ x: 0, y: 0 }, { x: 300, y: 0 }] }), road({ id: "o", lanes: 1, oneWay: true, points: [{ x: 0, y: 200 }, { x: 300, y: 200 }] }));
  m.stops = [{ id: "far", at: { x: 150, y: 80 } }, { id: "end", at: { x: 5, y: 5 } }, { id: "left", at: { x: 150, y: 195 } }, { id: "fine", at: { x: 150, y: 5 }, kind: "bay" }];
  const L = loadMap(m), codes = L.warnings.map((w) => w.code);
  ok(codes.includes("stop-no-road") && codes.includes("stop-near-intersection") && codes.includes("stop-wrong-side"), `refused by name: ${codes.filter((c) => c.startsWith("stop")).join(", ")}`);
  ok(L.stops.length === 1 && L.stops[0].id === "fine" && L.stops[0].kind === "bay", `and the one good stop kept, as a bay (${L.stops.map((s) => `${s.id}:${s.kind}`).join(", ")})`);
}

console.log("2. every bus stands at every stop it passes in its lane, and nothing else stops there");
const loaded = loadMap(testBuses());
let w = seedGraph(3, 50, loaded, { every: 2.0, target: 40, posted: true, buses: 0.3 });
const stops = [...stopsOf(w.course)].flatMap(([lane, list]) => list.map((s) => ({ ...s, lane })));
const MINS = 15;
const track = new Map();   // bus id|stop id -> { before, passed, stood, door }
let buses = new Set(), strangers = 0, queued = 0, contacts = 0, dwellMax = 0;
const dwellFrom = new Map();
for (let k = 0; k < (MINS * 60) / DT; k++) {
  w = step(w);
  for (const a of w.actors) {
    if (a.busStop && a.kind !== "bus") strangers++;
    if (a.kind !== "bus") continue;
    buses.add(a.id);
    const span = laneSpanOnGraph(w.course, a.k, a.route, a.s);
    for (const st of stops) {
      const on = span.find((x) => x.lane === st.lane);
      if (!on) continue;
      const key = `${a.id}|${st.id}`, tr = track.get(key) ?? { before: false, passed: false, stood: 0 };
      const front = on.along + lenOf(a) / 2;
      if (front < st.along - 5) tr.before = true;
      if (tr.before && front > st.along + 2) tr.passed = true;
      if (a.v < 0.3 && !tr.passed) { tr.stood += DT; tr.door = st.along - front; }
      track.set(key, tr);
    }
    if (a.dwellFrom != null) { dwellFrom.set(a.id, a.dwellFrom); dwellMax = Math.max(dwellMax, w.t - a.dwellFrom); }
  }
  /* Somebody stopped right behind a bus that is standing at its stop. */
  for (const a of w.actors) {
    if (a.kind !== "bus" || a.dwellFrom == null) continue;
    if (w.actors.some((b) => b !== a && b.k === a.k && b.route === a.route && b.s < a.s && a.s - b.s < 25 && b.v < 0.3)) queued++;
  }
  contacts = vehicleCrashes(w);
}
const passes = [...track.values()].filter((x) => x.before && x.passed);
const stood = passes.filter((x) => x.stood >= DWELL - 0.5);
const doors = passes.filter((x) => x.door != null).map((x) => x.door);
ok(passes.length >= 8, `${buses.size} buses in ${MINS} minutes drove past a stop in their lane ${passes.length} times`);
ok(stood.length === passes.length, `every time, they stood there at least the shortest stand (${stood.length} of ${passes.length}, ${MIN_DWELL} s)`);
ok(doors.length && Math.max(...doors.map(Math.abs)) < 4, `with the front of the bus at the stop -- within ${doors.length ? Math.max(...doors.map(Math.abs)).toFixed(1) : "?"} m of the sign`);
ok(dwellMax < MAX_DWELL + 1, `and went on when done: the longest stand was ${dwellMax.toFixed(1)} s, against ${MAX_DWELL}`);
ok(strangers === 0, `nothing but a bus ever stops for a stop (${strangers})`);

console.log("3. the traffic behind waits behind it");
ok(queued > 0, `a car stood behind a bus at its stop in ${(queued * DT).toFixed(0)} s of the run`);
ok(contacts === 0, `and no vehicle touched another (${contacts})`);

console.log("4. a map without stops has no buses and is the world it was");
{
  const L1 = loadMap(testMap1());
  let a = seedGraph(4, 50, L1, { every: 2.0, target: 80, posted: true, buses: 0 });
  let b = seedGraph(4, 50, L1, { every: 2.0, target: 80, posted: true });
  const key = (x) => JSON.stringify(x.actors.map((q) => [q.id, q.kind, q.s.toFixed(6), q.v.toFixed(6)]));
  let same = key(a) === key(b), any = false;
  for (let i = 0; i < 60 / DT && same; i++) { a = step(a); b = step(b); same = key(a) === key(b); any ||= b.actors.some((q) => q.kind === "bus"); }
  ok(same && !any, `test map 1, with the bus share on and off: identical for a minute, and no bus (${any ? "a bus appeared" : "none"})`);
}

console.log("5. people wait at a stop, get on at the door of a bus standing there, and get off at it");
{
  let v = seedGraph(3, 50, loadMap(testBuses()), { every: 2.0, target: 40, posted: true, buses: 0.3, walkers: true });
  const net = walkNetOf(v.course.map);
  const doorOf = new Map(net.stops.map((q) => [q.id, q.door]));
  /* A bus with its doors open at a stop, and where that door is. */
  const open = (x) => x.actors.filter((a) => a.kind === "bus" && a.dwellFrom != null).map((a) => ({ a, door: doorOf.get(a.busStop.id) }));
  let prev = new Map(v.walkers.map((p) => [p.id, { p, q: walkerPose(v, p) }])), prevOpen = open(v);
  let boarded = 0, alighted = 0, wrongOn = 0, wrongOff = 0, worst = 0, leftWaiting = 0, waitedLong = 0, waited = 0;
  const dwells = [];
  for (let k = 0; k < (MINS * 60) / DT; k++) {
    const before = v;
    v = step(v);
    const now = new Map(v.walkers.map((p) => [p.id, { p, q: walkerPose(v, p) }])), nowOpen = open(v);
    for (const [id, { p, q }] of now) {
      const o = prev.get(id);
      if (o) { worst = Math.max(worst, Math.hypot(q.x - o.q.x, q.y - o.q.y)); if (o.p.state !== "waiting" && p.state === "waiting") waited++; continue; }
      if (p.state !== "alighting") continue;
      alighted++;
      if (!nowOpen.some(({ door }) => door && Math.hypot(door.x - q.x, door.y - q.y) < 0.5)) wrongOff++;
    }
    for (const [id, { p, q }] of prev) {
      if (now.has(id) || p.state !== "boarding") continue;
      boarded++;
      if (!prevOpen.some(({ door }) => door && Math.hypot(door.x - q.x, door.y - q.y) < 1.0)) wrongOn++;
    }
    /* A bus that shuts its doors with somebody still waiting to get on, short of its longest stand. */
    for (const a of before.actors) {
      if (a.kind !== "bus" || a.dwellFrom == null) continue;
      const after = v.actors.find((b) => b.id === a.id);
      if (after && after.dwellFrom == null) {
        const stood = v.t - a.dwellFrom;
        dwells.push(stood);
        if (stood < MAX_DWELL - 0.5 && before.walkers.some((q) => q.stop === a.busStop.id && (q.state === "waiting" || q.state === "boarding"))) leftWaiting++;
      }
    }
    for (const q of v.walkers) if (q.state === "waiting" && v.t - q.since > WAIT_PATIENCE + 1) waitedLong++;
    prev = now; prevOpen = nowOpen;
  }
  ok(waited > 5 && boarded > 5, `in ${MINS} minutes somebody started waiting at a stop ${waited} times, and ${boarded} got on`);
  ok(wrongOn === 0, `everybody who got on did so at the door of a bus standing at their stop (${wrongOn} did not)`);
  ok(alighted > 5 && wrongOff === 0, `${alighted} got off, every one at the door of a bus standing at a stop (${wrongOff} did not)`);
  ok(leftWaiting === 0, `no bus shut its doors on somebody still waiting to get on, short of its longest stand (${leftWaiting})`);
  ok(dwells.length && Math.min(...dwells) >= MIN_DWELL - 0.1 && Math.max(...dwells) <= MAX_DWELL + 0.1, `a bus stands as long as its people take: ${dwells.length ? `${Math.min(...dwells).toFixed(1)}-${Math.max(...dwells).toFixed(1)} s` : "never"}, between ${MIN_DWELL} and ${MAX_DWELL}`);
  ok(worst < 0.5 && waitedLong === 0, `nobody on foot jumps (largest step ${worst.toFixed(2)} m), and nobody waits past their patience (${waitedLong})`);
  ok(vehicleCrashes(v) === 0, `and no vehicle touched another (${vehicleCrashes(v)})`);
}

console.log("6. bays: out of the lane, passed, and given way to -- by those who know to");
{
  const L = loadMap(testBuses());
  const bayStops = L.stops.filter((q) => q.kind === "bay");
  ok(bayStops.length === 2, `the Buses map has its two bays (${bayStops.map((q) => q.id).join(", ")})`);
  /* The surface steps back at a bay: a point a metre and a half beyond the plain curb, level with the post, is road. */
  const widened = bayStops.every((st) => {
    const r = L.roads.find((x) => x.id === st.road), i = r.at.findIndex((a) => a >= st.s);
    const c = r.pts[i], e = (st.dir === "fwd" ? r.right : r.left)[i], plain = (r.outer ?? r.width) / 2;
    const ux = (e.x - c.x) / Math.hypot(e.x - c.x, e.y - c.y), uy = (e.y - c.y) / Math.hypot(e.x - c.x, e.y - c.y);
    return onRoadSurface(r, { x: c.x + ux * (plain + 1.5), y: c.y + uy * (plain + 1.5) });
  });
  ok(widened, "the road's surface steps back into each bay, so the sidewalk steps back with it");

  /* THREE SEEDS: one run gave three drivers who knew the rule and one who
     did not -- too few to say anything (CLAUDE.md item 3, the implied
     sample size). */
  const MINS6 = 20;
  let crashes6 = 0;
  let passedStanding = 0, inLane = 0, signalled = 0, longest = 0;
  /* ONE EPISODE per bus signalling to pull out: each car coming up behind
     it in its lane when it began -- whether they know the rule, and whether
     they could stop comfortably then -- and what came first, the car past
     the bus or the bus out. Counting stopped time instead missed every
     yield: the bus goes the moment the car behind has all but stopped. */
  const episodes = new Map();   // bus id -> { t, cars: Map(car id -> { reads, couldStop, outcome }) }
  const outcomes = [];
  const close = (bus, how) => { const ep = episodes.get(bus); if (!ep) return; for (const c of ep.cars.values()) if (!c.outcome) c.outcome = how; outcomes.push(...ep.cars.values()); episodes.delete(bus); };
  /* AND A FOURTH RUN WITH THE RULE MADE HARD, for the other half. At the
     rule's own difficulty (0.15, the maintainer's ruling) so few drivers
     do not know it that three runs held one or none of them -- the check
     passed on whoever happened to turn up, and went 0 of 0 when an
     unrelated change moved the traffic (7 October). A controlled run, as
     verify-compliance makes a map's signs hard: the same drivers, the
     rule harder, so many do not know it. The three runs at the real
     difficulty still hold everybody who knows. */
  const realDifficulty = DIFFICULTY["yield-to-bus"];
  for (const [seed, hard] of [[5, false], [6, false], [7, false], [8, true]]) {
  DIFFICULTY["yield-to-bus"] = hard ? 0.9 : realDifficulty;
  let v = seedGraph(seed, 50, L, { every: 2.0, target: 90, posted: true, buses: 0.3 });
  episodes.clear();
  for (let k = 0; k < (MINS6 * 60) / DT; k++) {
    v = step(v);
    for (const id of [...episodes.keys()]) { const b = v.actors.find((a) => a.id === id); if (!b || b.wantsOut == null) close(id, "let out"); }
    for (const bus of v.actors) {
      if (bus.kind !== "bus" || !bus.busStop?.bay || bus.dwellFrom == null) continue;
      if (!inBay(bus)) inLane += DT;
      const [m] = laneAt(v.course, bus);
      if (!m) continue;
      const tail = m.along - lenOf(bus) / 2;
      if (bus.wantsOut != null && !episodes.has(bus.id)) { episodes.set(bus.id, { t: v.t, cars: new Map() }); signalled++; }
      const ep = episodes.get(bus.id);
      if (ep) longest = Math.max(longest, v.t - ep.t);
      for (const car of v.actors) {
        if (car.id === bus.id || car.kind === "bus") continue;
        const [o] = laneAt(v.course, car);
        if (!o || o.lane !== m.lane) continue;
        const front = o.along + lenOf(car) / 2;
        if (!ep) { if (front > tail && front < tail + 1 && (car.v ?? 0) > 1) passedStanding++; continue; }
        if (!ep.cars.has(car.id) && front < tail && tail - front < 80 && v.t - ep.t < DT * 1.5) ep.cars.set(car.id, { hard, reads: reads(car, "yield-to-bus"), couldStop: tail - front >= ((car.v ?? 0) ** 2) / (2 * (car.brake ?? 2.7)) + 1, outcome: null });
        const c = ep.cars.get(car.id);
        if (c && !c.outcome && front > tail) c.outcome = "passed";
      }
    }
  }
  crashes6 += vehicleCrashes(v);
  }
  DIFFICULTY["yield-to-bus"] = realDifficulty;
  const knew = outcomes.filter((c) => c.reads && c.couldStop), didNot = outcomes.filter((c) => !c.reads && c.couldStop && c.hard);
  ok(passedStanding > 0 && inLane < 1, `a bus in its bay is out of the lane (${inLane.toFixed(1)} s standing in it) and the traffic goes past it (${passedStanding} times)`);
  ok(signalled > 10, `buses had to wait to pull out ${signalled} times in four runs of ${MINS6} minutes`);
  ok(knew.length >= 5 && knew.every((c) => c.outcome === "let out"), `everybody who knows to give way and could stop let the bus out (${knew.filter((c) => c.outcome === "let out").length} of ${knew.length})`);
  /* Measured 5 of 9 (7 October); with everybody made to yield whatever they
     know it is 0 of 8, so the floor sits between the two rather than on
     the measurement. */
  ok(didNot.filter((c) => c.outcome === "passed").length >= 3, `and, with the rule made hard, drivers who do not know and could have stopped drove on past it (${didNot.filter((c) => c.outcome === "passed").length} of ${didNot.length})`);
  ok(longest < 90, `and no bus waited for ever to get out: the longest was ${longest.toFixed(1)} s`);
  ok(crashes6 === 0, `no vehicle touched another (${crashes6})`);
}

console.log("7. going round a bus at a curb stop, on a broken centre line or none, never a solid one");
{
  /* The same map with its through road re-made: a collector is painted
     with a broken line, an arterial a solid double, a residential street
     none (draw.js). Passing is the broken line's alone. */
  const remade = (kind) => { const m = testBuses(); m.roads = m.roads.map((r) => (r.id.startsWith("main") ? { ...r, kind, lanes: 1, parking: "none" } : r)); return loadMap(m); };
  /* BOLD AGAINST TIMID, asked of the same moment: wherever a car stands
     behind a bus at its stop, the pass rule is asked as a bold driver and
     as a timid one. Counting bold drivers among the passes that happened
     was one in eighteen, then none -- luck, not a property. */
  let boldOnly = 0, timidOnly = 0;
  const run = (L, passing, seeds) => {
    let passes = 0, carCrashes = 0, behind = 0, bold = 0;
    for (const seed of seeds) {
      let v = seedGraph(seed, 50, L, { every: 2.0, target: 90, posted: true, buses: 0.3, passing });
      const seen = new Set();
      for (let k = 0; k < (15 * 60) / DT; k++) {
        v = step(v);
        for (const a of v.actors) if (a.pass && !seen.has(`${a.id}|${a.pass.s0}`)) { seen.add(`${a.id}|${a.pass.s0}`); passes++; if ((a.caution ?? 1) < 0.6) bold++; }
        for (const b of v.actors) if (b.kind === "bus" && b.dwellFrom != null && !b.busStop?.bay) {
          const queued = v.actors.filter((c) => c.kind === "car" && c.k === b.k && c.route === b.route && c.s < b.s && b.s - c.s < 25 && c.v < 0.3);
          behind += queued.length * DT;
          if (passing && k % 10 === 0) for (const c of queued) {
            const path = v.course.at[c.k].layout.paths[c.route];
            const yes = (caution) => !!planPass(v, { ...c, caution, pass: null }, b, path);
            const bo = yes(0.05), ti = yes(1.8);
            if (bo && !ti) boldOnly++;
            if (ti && !bo) timidOnly++;
          }
        }
      }
      /* Vehicles touching vehicles: a person struck is peds.js's content (verify-peds), not this. */
      carCrashes += (v.crashes ?? []).filter((c) => !String(c.a).startsWith("ped") && !String(c.b).startsWith("ped")).length;
    }
    return { passes, carCrashes, behind, bold };
  };
  const seeds = [5, 6];
  const on = run(loadMap(testBuses()), true, seeds), off = run(loadMap(testBuses()), false, seeds);
  ok(on.passes >= 5, `on the two-lane collector, cars went round a bus standing at its stop ${on.passes} times in two runs of 15 minutes`);
  ok(boldOnly > 0 && timidOnly === 0, `the gap is theirs to misjudge: at the same moment behind the same bus a bold driver would go where a timid one would not ${boldOnly} times, and never the other way (${timidOnly})`);
  ok(on.behind < off.behind, `and stood behind a standing bus for less of it: ${on.behind.toFixed(0)} car-seconds against ${off.behind.toFixed(0)} with passing off`);
  ok(on.carCrashes === 0, `no vehicle touched another while passing (${on.carCrashes})`);
  const solid = run(remade("arterial"), true, [5]), none = run(remade("residential"), true, [5]);
  ok(solid.passes === 0, `nobody passed on the same road painted with a solid line (${solid.passes})`);
  /* The maintainer, 1 October: on an unmarked street, yes, if the way is clear. */
  ok(none.passes > 0 && none.carCrashes === 0, `and on the same road with no line painted they do, touching nothing (${none.passes} passes)`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
