/* WHERE A BENCH STEP'S BUILD GOES (14 October): the phone reported 6-21 s
   of build-s per step, the page frozen meanwhile. Times the parts of
   benchScene on the desk. Usage: node tools/measure/bench-build.mjs [fleet=400] */
import { performance } from "node:perf_hooks";
import { benchMap, benchWorld } from "../../src/iso/benchworld.js";
import { benchScene } from "../../src/iso/bench.js";
const fleet = Number(process.argv[2] ?? 400);
let t = performance.now();
const m1 = benchMap({ parking: true }); const tMap1 = performance.now() - t;
t = performance.now(); benchMap({ parking: true }); const tMap2 = performance.now() - t;
t = performance.now(); const w = benchWorld(fleet, { sight: false }); const tWorld = performance.now() - t;
t = performance.now(); benchScene(fleet, {}); const tScene = performance.now() - t;
console.log(`map first ${tMap1.toFixed(0)} ms, again ${tMap2.toFixed(0)} ms (cached?) · world at ${fleet}: ${tWorld.toFixed(0)} ms, ${w.actors.length} actors at t=${w.t} · whole benchScene ${tScene.toFixed(0)} ms`);
