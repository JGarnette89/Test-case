/* WHAT A SLOW SIM STEP IS DOING. The city's step is ~4 ms at the median
   and occasionally 30-90 ms (frame-cost.mjs) -- rare, so an average
   profile drowns it. This profiles the CPU across many steps, times each
   step on the same clock, and adds up the samples that fell inside the
   slow ones only, by function: the cost of the spike, not of the step.

   Usage: node tools/measure/step-spikes.mjs [map=city] [cars=200] [steps=1200] [seed=1] */
import { Session } from "node:inspector/promises";
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";

const [mapId = "city", carsArg = "200", stepsArg = "1200", seedArg = "1"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
let w = seedGraph(Number(seedArg), 50, loaded, { every: 2.0, target: Number(carsArg), posted: true, walkers: true });

const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 100 });   // microseconds
await session.post("Profiler.start");
const ticks = [];
for (let i = 0; i < Number(stepsArg); i++) {
  const t0 = process.hrtime.bigint();
  w = step(w);
  const t1 = process.hrtime.bigint();
  ticks.push({ i, t0: Number(t0 / 1000n), t1: Number(t1 / 1000n), ms: Number(t1 - t0) / 1e6, cars: w.actors.length, peds: (w.peds ?? []).length, crashes: (w.crashes ?? []).length });
}
const { profile } = await session.post("Profiler.stop");

const ms = ticks.map((t) => t.ms).sort((a, b) => a - b);
const med = ms[Math.floor(ms.length / 2)];
const slow = ticks.filter((t) => t.ms > 4 * med);
console.log(`${ticks.length} steps: median ${med.toFixed(2)} ms, p99 ${ms[Math.floor(0.99 * ms.length)].toFixed(2)}, max ${ms.at(-1).toFixed(2)}; ${slow.length} over 4x the median`);
for (const t of slow.slice().sort((a, b) => b.ms - a.ms).slice(0, 8)) console.log(`   step ${t.i}: ${t.ms.toFixed(1)} ms, ${t.cars} cars, ${t.peds} on foot crossing, ${t.crashes} crashes so far`);

/* Samples by function, inside the slow steps and over all steps. */
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const name = (n) => `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
const inSlow = new Map(), inAll = new Map(), inSlowSelf = new Map();
let t = profile.startTime, si = 0;
const slowSorted = slow.slice().sort((a, b) => a.t0 - b.t0);
for (let k = 0; k < profile.samples.length; k++) {
  t += profile.timeDeltas[k];
  while (si < slowSorted.length && slowSorted[si].t1 < t) si++;
  const hit = si < slowSorted.length && slowSorted[si].t0 <= t && t <= slowSorted[si].t1;
  /* Inclusive: every function on the stack gets the sample. */
  const seen = new Set();
  let id = profile.samples[k];
  const leaf = byId.get(id);
  if (hit) inSlowSelf.set(name(leaf), (inSlowSelf.get(name(leaf)) ?? 0) + 1);
  while (id != null) {
    const nm = name(byId.get(id));
    if (!seen.has(nm)) { seen.add(nm); (hit ? inSlow : inAll).set(nm, ((hit ? inSlow : inAll).get(nm) ?? 0) + 1); }
    id = parent.get(id);
  }
}
const total = [...inSlow.values()].reduce((a, b) => Math.max(a, b), 0);
console.log(`\ninside the slow steps (${total} samples at the root), inclusive -- functions from src/ only:`);
for (const [nm, c] of [...inSlow.entries()].filter(([nm]) => /\.js:/.test(nm) && !/node:/.test(nm)).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`   ${(100 * c / total).toFixed(0).padStart(3)}%  ${nm}`);
console.log("\nself time inside the slow steps:");
for (const [nm, c] of [...inSlowSelf.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ${(100 * c / total).toFixed(0).padStart(3)}%  ${nm}`);
