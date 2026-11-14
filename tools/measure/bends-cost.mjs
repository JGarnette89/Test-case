/* WHAT THE DRIVER'S BEND JUDGEMENT COSTS A TICK (DECISIONS 10.96, 10.98): the same road and seed, bends the road's own against bends by the driver, 300 cars, the step's median and p95 after a warm-up, one process, one after the other. Usage: node tools/measure/bends-cost.mjs [cars=300] [seconds=60] */
import { roadgen } from "../../src/map/roadgen.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const [carsArg = "300", secsArg = "60"] = process.argv.slice(2);
const base = { ID: "x", LANES: 5, LIMIT: 110, CARS: 0, CARS_MAX: 0, SHAPE: false };
for (const [name, bends] of [["the road's own", null], ["by the driver", "driver"], ["the road's own", null], ["by the driver", "driver"]]) {
  let w = seedGraph(1, 50, loadMap(roadgen({ ...base, ...(bends ? { BENDS: bends } : {}) })), { every: 2.0, target: +carsArg, posted: true, walkers: true, rivals: true, brakeReaction: true });
  for (let i = 0; i < 20 * 120; i++) w = step(w);
  const ts = [];
  for (let i = 0; i < +secsArg * 20; i++) { const t = performance.now(); w = step(w); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b);
  console.log(`bends ${name.padEnd(14)}: ${carsArg} cars, step median ${ts[Math.floor(ts.length / 2)].toFixed(2)} ms, p95 ${ts[Math.floor(ts.length * 0.95)].toFixed(2)}, mean ${(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(2)}`);
}
