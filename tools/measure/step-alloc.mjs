/* WHO ALLOCATES IN A SIM STEP. The step's spikes are garbage collection
   (step-spikes.mjs: 85% of a slow step's time is the collector), so the
   cause is how much each step allocates. This samples allocations by the
   function that made them, over many steps, and reports bytes per step --
   the rate the collector has to keep up with.

   Usage: node tools/measure/step-alloc.mjs [map=city] [cars=200] [steps=400] [frames=0]
   (frames > 0 also builds #/map's per-frame poses that many times a step) */
import { Session } from "node:inspector/promises";
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { parkedPoses } from "../../src/sim/parking.js";
import { walkerPose } from "../../src/sim/walkers.js";

const [mapId = "city", carsArg = "200", stepsArg = "400", framesArg = "0"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
let w = seedGraph(1, 50, loaded, { every: 2.0, target: Number(carsArg), posted: true, walkers: true });
for (let i = 0; i < 50; i++) w = step(w);

const session = new Session();
session.connect();
await session.post("HeapProfiler.enable");
await session.post("HeapProfiler.startSampling", { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const N = Number(stepsArg), F = Number(framesArg);
let sink = 0;
for (let i = 0; i < N; i++) {
  w = step(w);
  for (let f = 0; f < F; f++) {
    const out = w.parked ? parkedPoses(w.course, w.parked).slice() : [];
    for (const a of w.actors) out.push(poseOf(w, a));
    for (const q of w.walkers ?? []) out.push(walkerPose(w, q));
    sink += out.length;
  }
}
const { profile } = await session.post("HeapProfiler.stopSampling");

const bytes = new Map();
let all = 0;
const walk = (n, stack) => {
  const nm = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
  if (n.selfSize) { bytes.set(nm, (bytes.get(nm) ?? 0) + n.selfSize); all += n.selfSize; }
  for (const c of n.children ?? []) walk(c, stack);
};
walk(profile.head, []);
console.log(`${N} steps${F ? ` with ${F} frames' poses each` : ""}: ${(all / N / 1024).toFixed(0)} KB allocated a step (sampled), ${w.actors.length} cars, ${(w.walkers ?? []).length} walkers, ${Object.keys(w.parked ?? {}).length} parked`);
for (const [nm, b] of [...bytes.entries()].sort((a, c) => c[1] - a[1]).slice(0, 20)) console.log(`   ${(b / N / 1024).toFixed(1).padStart(7)} KB/step  ${(100 * b / all).toFixed(0).padStart(3)}%  ${nm}`);
void sink;
