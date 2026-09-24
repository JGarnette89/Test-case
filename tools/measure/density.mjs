/* HOW MANY CARS THE MAP CAN CARRY, AND WHAT THEY COST THE SIM. For each
   target: how long seeding takes, the population it holds, the sim's own
   cost per 20 Hz tick (the budget is 50 ms a tick for real time, and a
   phone is several times slower than this machine), and whether anybody
   drove through anybody. Run: node tools/measure/density.mjs [targets...].
   SIMULATOR.md 1.1.9. */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step, overlapping } from "../../src/sim/crossing.js";
const targets = process.argv.slice(2).map(Number).filter(Boolean);
const loaded = loadMap(testMap1());
for (const target of targets.length ? targets : [30, 60, 120, 200, 300]) {
  const t0 = performance.now();
  let w = seedGraph(3, 50, loaded, { target, posted: true });
  const seedMs = performance.now() - t0;
  let held = 0, worstOverlap = 0, tickMs = [];
  for (let i = 0; i < 20 * 60; i++) {
    const a = performance.now(); w = step(w); tickMs.push(performance.now() - a);
    held += w.actors.length;
    if (i % 10 === 0) worstOverlap += overlapping(w).length;
  }
  tickMs.sort((x, y) => x - y);
  console.log(`target ${String(target).padStart(3)}: seeded in ${(seedMs / 1000).toFixed(1)}s holding ${w.actors.length}; over a minute ${(held / 1200).toFixed(0)} on average; sim tick median ${tickMs[600].toFixed(2)} ms, p95 ${tickMs[1140].toFixed(2)} ms; overlapping car-ticks (sampled) ${worstOverlap}`);
}
