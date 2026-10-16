/* THE SIM STEP AGAINST THE CARS ON THE MAP (15 October): with the sim on
   the page its step lands inside every third frame, so its growth with the
   fleet is half of what a frame costs. A cliff (a step change at some
   count) or a slope. Desk ms; the phone's factor was about 1.6 (SIMULATOR.md 1.2.11).
   Usage: node tools/measure/step-ramp.mjs [map=test-1] [cars=100,150,200,250,300,400] */
import { performance } from "node:perf_hooks";
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const [mapId = "test-1", carsArg = "100,150,200,250,300,400"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
for (const cars of carsArg.split(",").map(Number)) {
  let w = seedGraph(1, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true });
  for (let i = 0; i < 600; i++) w = step(w);
  const ms = [];
  for (let i = 0; i < 1200; i++) { const t = performance.now(); w = step(w); ms.push(performance.now() - t); }
  console.log(`${mapId} ${String(w.actors.length).padStart(4)} cars: step p50 ${q(ms, 0.5).toFixed(1)}  p95 ${q(ms, 0.95).toFixed(1)}  max ${Math.max(...ms).toFixed(1)} ms   (${(q(ms, 0.5) / w.actors.length * 1000).toFixed(0)} us a car)`);
}
