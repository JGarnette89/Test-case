/* WHERE A SIM STEP'S TIME GOES, by function, inclusive and self -- on the
   bench map (src/iso/bench.js) at a fleet, after a warm minute so the
   people crossing have built up as they do on the phone.

   Usage: node tools/measure/step-profile.mjs [fleet=50] [steps=600] [off=] */
import { Session } from "node:inspector/promises";
import { benchScene, benchStep } from "../../src/iso/bench.js";

const [fleetArg = "50", stepsArg = "600", offArg = ""] = process.argv.slice(2);
const off = Object.fromEntries(offArg.split(",").filter(Boolean).map((k) => [k, true]));
const sc = benchScene(Number(fleetArg), off);
benchStep(sc, 60);   // a minute in, where the phone's steps are measured
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 100 });
await session.post("Profiler.start");
const t0 = performance.now();
for (let i = 0; i < Number(stepsArg); i++) benchStep(sc, 0.05);
const ms = (performance.now() - t0) / Number(stepsArg);
const { profile } = await session.post("Profiler.stop");
const by = new Map(profile.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
const inc = new Map(), self = new Map();
let total = 0;
for (const id0 of profile.samples) {
  const leaf = by.get(id0);
  if (!/\.js:/.test(name(leaf)) && leaf.callFrame.functionName === "(idle)") continue;
  total++;
  self.set(name(leaf), (self.get(name(leaf)) ?? 0) + 1);
  const seen = new Set();
  for (let id = id0; id != null; id = parent.get(id)) { const k = name(by.get(id)); if (!seen.has(k)) { seen.add(k); inc.set(k, (inc.get(k) ?? 0) + 1); } }
}
console.log(`fleet ${fleetArg}${offArg ? `, off ${offArg}` : ""}: ${ms.toFixed(2)} ms a step; ${(sc.world.peds ?? []).length} crossing, ${(sc.world.walkers ?? []).length} walking`);
const pct = (c) => `${(100 * c / total).toFixed(0).padStart(3)}%  ${(ms * c / total).toFixed(2).padStart(6)} ms`;
console.log("inclusive (src only):");
for (const [k, c] of [...inc].filter(([k]) => /src\/|\.js:/.test(k) && !/node:/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`  ${pct(c)}  ${k}`);
console.log("self:");
for (const [k, c] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`  ${pct(c)}  ${k}`);
