/* WHERE A SIM STEP'S TIME GOES ON A TEST MAP, by function, at a fleet --
   step-profile.mjs is the bench's; this is any test map, as #/tests opens
   it (posted speeds, walkers, rivals). Compare two fleets to find what
   grows faster than the cars (22 October: the endless highway at 259 cars).
   Usage: node tools/measure/step-profile-map.mjs [map=test-loop] [cars=300] [steps=600] */
import { Session } from "node:inspector/promises";
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const [mapId = "test-loop", carsArg = "300", stepsArg = "600"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
let w = seedGraph(1, 50, loaded, { every: 2.0, target: Number(carsArg), posted: true, walkers: true, rivals: true });
for (let i = 0; i < 1200; i++) w = step(w);
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 100 });
await session.post("Profiler.start");
const t0 = performance.now();
for (let i = 0; i < Number(stepsArg); i++) w = step(w);
const ms = (performance.now() - t0) / Number(stepsArg);
const { profile } = await session.post("Profiler.stop");
const by = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
const inc = new Map(), self = new Map();
let total = 0;
for (const id0 of profile.samples) {
  const leaf = by.get(id0);
  if (leaf.callFrame.functionName === "(idle)" || leaf.callFrame.functionName === "(program)") continue;
  total++;
  self.set(name(leaf), (self.get(name(leaf)) ?? 0) + 1);
  const seen = new Set();
  for (let id = id0; id != null; id = parent.get(id)) { const k = name(by.get(id)); if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) ?? 0) + 1); } }
}
console.log(`${mapId}, ${w.actors.length} cars: ${ms.toFixed(2)} ms a step`);
const pct = (c) => `${(100 * c / total).toFixed(0).padStart(3)}%  ${(ms * c / total).toFixed(2).padStart(6)} ms`;
console.log("inclusive (src only):");
for (const [k, c] of [...inc].filter(([k]) => /\.js:/.test(k) && !/node:/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, Number(process.env.TOP ?? 30))) console.log(`  ${pct(c)}  ${k}`);
console.log("self:");
for (const [k, c] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`  ${pct(c)}  ${k}`);
/* FOCUS=<function name>: time under it, split by the function it called. */
if (process.env.FOCUS) {
  const under = new Map(); let tot = 0;
  for (const id0 of profile.samples) {
    const chain = [];
    for (let id = id0; id != null; id = parent.get(id)) chain.push(by.get(id));
    const i = chain.findIndex((n) => n.callFrame.functionName === process.env.FOCUS);
    if (i < 0) continue;
    tot++;
    const child = i === 0 ? "(self)" : name(chain[i - 1]);
    under.set(child, (under.get(child) ?? 0) + 1);
  }
  console.log(`under ${process.env.FOCUS}: ${(ms * tot / total).toFixed(2)} ms`);
  for (const [k, c] of [...under].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${(ms * c / total).toFixed(2).padStart(6)} ms  ${k}`);
}
