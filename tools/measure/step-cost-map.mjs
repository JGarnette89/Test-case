/* SIM STEP COST ON A MAP, THE PLAYED WORLD, ONE PROCESS ON AN IDLE MACHINE (14 November: 52 ms a tick was taken with runs competing and is not a number).
   Usage: node tools/measure/step-cost-map.mjs <mapId> <cars,cars,...> */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
/* THE PLAYED WORLD, stated here so this script stands on its own: what worldFor (scene.js) turns on. */
const playedGraph = (seed, kmh, loaded, o = {}) => seedGraph(seed, kmh, loaded, { posted: true, walkers: true, rivals: true, brakeReaction: true, ...o });
const [id, carsArg] = process.argv.slice(2);
const L = loadMap(TEST_MAPS.find((m) => m.id === id).build());
for (const cars of carsArg.split(",").map(Number)) {
  let w = playedGraph(1, 50, L, { every: 2.0, target: cars });
  for (let i = 0; i < 1200; i++) w = step(w);
  const ts = [];
  for (let i = 0; i < 600; i++) { const t = performance.now(); w = step(w); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b);
  console.log(`${id} ${cars} cars (${w.actors.length} actors): step median ${ts[300].toFixed(1)} ms, p95 ${ts[570].toFixed(1)}, max ${ts[599].toFixed(1)}`);
}
