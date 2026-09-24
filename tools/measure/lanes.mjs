/* LANE CHANGES ON THE TEST MAP, BY DENSITY: how many happen, how many
   are aborted after a missed blind-spot check, whether anybody touches,
   how the change rate splits by temperament, and what the whole sim
   costs per tick against the same map without the behaviour. Run:
   node tools/measure/lanes.mjs [targets...]. SIMULATOR.md 1.1.13. */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step, overlapping } from "../../src/sim/crossing.js";
const loaded = loadMap(testMap1());
const targets = process.argv.slice(2).map(Number).filter(Boolean);
for (const target of targets.length ? targets : [30, 120, 200, 300]) {
  let w = seedGraph(3, 50, loaded, { target, posted: true });
  const ticks = [], seen = new Map();
  let overlaps = 0;
  for (let i = 0; i < 20 * 120; i++) {
    const a = performance.now(); w = step(w); ticks.push(performance.now() - a);
    if (i % 5 === 0) overlaps += overlapping(w).length;
    for (const c of w.actors) seen.set(c.id, c);
  }
  ticks.sort((x, y) => x - y);
  const cars = [...seen.values()];
  const changes = cars.reduce((s, c) => s + (c.lcCount ?? 0), 0), aborts = cars.reduce((s, c) => s + (c.aborts ?? 0), 0);
  const band = (lo, hi) => { const g = cars.filter((c) => (c.caution ?? 1) >= lo && (c.caution ?? 1) < hi); return g.length ? (g.reduce((s, c) => s + (c.lcCount ?? 0), 0) / g.length).toFixed(2) : "-"; };
  console.log(`cars ${String(target).padStart(3)}: tick median ${ticks[ticks.length >> 1].toFixed(2)} ms, p95 ${ticks[Math.floor(ticks.length * 0.95)].toFixed(2)} ms | ${changes} lane changes, ${aborts} aborted (missed blind spot) | per driver: bold ${band(0, 0.7)}, middle ${band(0.7, 1.3)}, timid ${band(1.3, 3)} | overlapping car-ticks (sampled) ${overlaps}`);
}
