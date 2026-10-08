/* The bench's sim step, timed: median ms per step over repeats, at a fleet,
   a warm minute in. For an A/B of an optimisation (stash, run, pop, run).
   Usage: node tools/measure/step-time.mjs [fleet=150] [steps=1200] [repeats=5] */
import { benchScene, benchStep } from "../../src/iso/bench.js";
const [fleet = "150", steps = "1200", reps = "5"] = process.argv.slice(2);
const sc = benchScene(Number(fleet), {});
benchStep(sc, 60);
const out = [];
for (let r = 0; r < Number(reps); r++) {
  const t0 = performance.now();
  for (let i = 0; i < Number(steps) / Number(reps); i++) benchStep(sc, 0.05);
  out.push((performance.now() - t0) / (Number(steps) / Number(reps)));
}
out.sort((a, b) => a - b);
console.log(`fleet ${fleet}: ${out[Math.floor(out.length / 2)].toFixed(2)} ms a step (median of ${reps}; ${out.map((x) => x.toFixed(2)).join(" ")})`);
