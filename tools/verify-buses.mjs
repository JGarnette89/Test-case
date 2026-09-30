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

   Usage: node tools/verify-buses.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testBuses, testMap1 } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";
import { laneSpanOnGraph } from "../src/sim/graph.js";
import { stopsOf, DWELL } from "../src/sim/buses.js";
import { DT, lenOf } from "../src/sim/traffic.js";

let fails = 0;
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
  contacts = (w.crashes ?? []).length;
}
const passes = [...track.values()].filter((x) => x.before && x.passed);
const stood = passes.filter((x) => x.stood >= DWELL - 0.5);
const doors = passes.filter((x) => x.door != null).map((x) => x.door);
ok(passes.length >= 8, `${buses.size} buses in ${MINS} minutes drove past a stop in their lane ${passes.length} times`);
ok(stood.length === passes.length, `every time, they stood there for the dwell (${stood.length} of ${passes.length}, ${DWELL} s)`);
ok(doors.length && Math.max(...doors.map(Math.abs)) < 4, `with the front of the bus at the stop -- within ${doors.length ? Math.max(...doors.map(Math.abs)).toFixed(1) : "?"} m of the sign`);
ok(dwellMax < DWELL + 1, `and went on when done: the longest stand was ${dwellMax.toFixed(1)} s`);
ok(strangers === 0, `nothing but a bus ever stops for a stop (${strangers})`);

console.log("3. the traffic behind waits behind it");
ok(queued > 0, `a car stood behind a bus at its stop in ${(queued * DT).toFixed(0)} s of the run`);
ok(contacts === 0, `and nothing touched anything (${contacts} crashes)`);

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

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
