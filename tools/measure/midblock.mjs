/* A mid-block crossing as it can be drawn today: one street as two roads
   meeting end to end, stop signs on both approaches, a crosswalk there.
   Does a two-leg node carry traffic and people? Run: node tools/measure/midblock.mjs [secs] */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { seedGraph, step, overlapping } from "../../src/sim/crossing.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { touching } from "./peds.mjs";
import { DT } from "../../src/sim/traffic.js";

const P = (x, y) => ({ x, y, z: 0 });
const m = emptyMap("midblock");
m.bounds = { x: 0, y: 0, w: 600, h: 200 };
m.roads.push(
  road({ id: "a", kind: "residential", points: [P(0, 100), P(300, 100)], control: { start: "none", end: "stop" }, crosswalk: { start: false, end: true } }),
  road({ id: "b", kind: "residential", points: [P(300, 100), P(600, 100)], control: { start: "stop", end: "none" } }),
);
const L = loadMap(m);
console.log("nodes", L.nodes.length, L.nodes.map((n) => n.legs.length), "warnings", L.warnings.map((w) => w.code));
let w = seedGraph(3, 50, L, { target: 20, posted: true });
const j = junctionsOf(w.course);
console.log("junctions", j.length, "crossings", j.map((x) => x.crossings.length), "signs", j.map((x) => x.signs.map((s) => s.kind).join(",")));
let crossed = 0, touch = 0, over = 0, passed = 0, stops = 0;
const secs = Number(process.argv[2] ?? 240);
for (let i = 0; i < secs / DT; i++) {
  const before = new Map((w.peds ?? []).map((q) => [q.id, q])), cars = new Map(w.actors.map((a) => [a.id, a]));
  w = step(w);
  const now = new Set((w.peds ?? []).map((q) => q.id));
  for (const q of w.peds ?? []) if (q.state === "leaving" && before.get(q.id)?.state === "crossing") crossed++;
  for (const a of w.actors) {
    const was = cars.get(a.id); if (!was || was.route !== a.route) continue;
    const pa = w.course.at[a.k].layout.paths[a.route];
    if (was.s < pa.stopAt && a.s >= pa.stopAt) { passed++; if (a.stoppedAt != null) stops++; }
  }
  if (i % 5 === 0) { touch += touching(w).length; over += overlapping(w).length; }
}
console.log(`${secs}s: ${w.actors.length} cars, ${passed} cars over the line, ${stops} of them having stopped, ${crossed} people across, touches ${touch}, overlaps ${over}, crashes ${(w.crashes ?? []).length}`);
