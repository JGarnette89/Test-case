/* =====================================================================
   WHAT A FRAME ALLOCATES, AND WHAT THE GARBAGE COLLECTOR DOES ABOUT IT.

   The first phone report (19 Sep) failed on eight 100-200 ms frames in
   an otherwise perfect 16.7 ms stream. One hypothesis is the classic
   sawtooth: per-frame allocation in the step and draw paths piling up
   until the collector pauses the world. This runs the exact per-frame
   work -- sim ticks at 20 Hz, carsOf, drawFrame against a stub context
   -- for a stretch, and watches V8's own GC events: how often it
   collects, which generation, and how long each pause is. Node's V8 is
   not the phone's, and a stub context paints nothing, but the heap
   behaviour of THIS code is the same code's behaviour anywhere.

   Usage: node --expose-gc tools/measure/alloc.mjs [seconds, default 20]
   ===================================================================== */
import { PerformanceObserver, performance } from "node:perf_hooks";
import { seedScene, stepScene, carsOf, DT } from "../../src/iso/world.js";
import { drawFrame } from "../../src/iso/draw.js";

const secs = Number(process.argv[2] ?? 20);
const canvas = { w: 395, h: 527 };            // the phone's canvas, CSS px
const cam = { x: 140, y: 257, z: 3 };
const k = Math.max(3, (canvas.w / 70) * 0.8);

const stub = () => {
  const c = {};
  for (const f of ["beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "setTransform", "setLineDash", "save", "restore", "arc", "fillText"]) c[f] = () => {};
  return c;
};

/* GC events as V8 reports them. kind: 1 minor (scavenge), 2 major
   (mark-sweep-compact), 4 incremental marking, 8 weak callbacks. */
const gcs = [];
const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) gcs.push({ at: e.startTime, ms: e.duration, kind: e.detail?.kind ?? e.kind }); });
obs.observe({ entryTypes: ["gc"] });

/* Bytes per frame: force a collection, run one frame, read the heap
   before and after with nothing else allocating. Rough but honest. */
function bytesPerFrame(scene) {
  if (!global.gc) return null;
  const ctx = stub();
  global.gc();
  const before = process.memoryUsage().heapUsed;
  const roads = carsOf(scene, 0.01);
  drawFrame(ctx, canvas, { roads, terrain: scene.terrain, cam, k, tilt: false, props: scene.props });
  const after = process.memoryUsage().heapUsed;
  return after - before;
}

let scene = seedScene(1, 60, { traffic: 1, props: 0, focus: cam });
console.log(`node ${process.version} · ${secs}s of frames at 60 Hz, sim at 20 Hz, canvas ${canvas.w}x${canvas.h} (stub)`);
const perFrame = bytesPerFrame(scene);
if (perFrame != null) console.log(`one draw allocates about ${(perFrame / 1024).toFixed(0)} KB (heap delta after a forced collection)`);
else console.log("run with --expose-gc for the per-frame allocation figure");

const ctx = stub();
const frames = Math.round(secs * 60);
let owed = 0;
const heap = [];
const t0 = performance.now();
const frameTimes = [];
for (let f = 0; f < frames; f++) {
  const a = performance.now();
  owed += 1 / 60;
  const n = Math.floor(owed / DT); owed -= n * DT;
  if (n > 0) scene = stepScene(scene, n);
  const roads = carsOf(scene, owed);
  drawFrame(ctx, canvas, { roads, terrain: scene.terrain, cam, k, tilt: false, props: scene.props });
  frameTimes.push(performance.now() - a);
  if (f % 60 === 0) heap.push(process.memoryUsage().heapUsed / 1048576);
}
const elapsed = performance.now() - t0;
await new Promise((r) => setTimeout(r, 50));   // let the observer deliver
obs.disconnect();

const minor = gcs.filter((g) => g.kind === 1), major = gcs.filter((g) => g.kind === 2), other = gcs.filter((g) => g.kind !== 1 && g.kind !== 2);
const worst = (arr) => (arr.length ? Math.max(...arr.map((g) => g.ms)) : 0);
const sum = (arr) => arr.reduce((t, g) => t + g.ms, 0);
console.log(`\n${frames} frames of work in ${(elapsed / 1000).toFixed(1)} s of CPU (${(elapsed / frames).toFixed(2)} ms per frame, JS half only)`);
console.log(`GC events: ${minor.length} minor (scavenge), ${major.length} major (mark-sweep), ${other.length} other`);
console.log(`  minor: worst ${worst(minor).toFixed(2)} ms, total ${sum(minor).toFixed(1)} ms, one every ${(elapsed / Math.max(1, minor.length)).toFixed(0)} ms of CPU`);
console.log(`  major: worst ${worst(major).toFixed(2)} ms, total ${sum(major).toFixed(1)} ms`);
console.log(`  other: worst ${worst(other).toFixed(2)} ms`);
console.log(`heap used, MB, sampled each second: ${heap.map((h) => h.toFixed(1)).join(" ")}`);
const drift = heap.length > 2 ? heap[heap.length - 1] - heap[1] : 0;
console.log(`heap drift over the run: ${drift >= 0 ? "+" : ""}${drift.toFixed(1)} MB (${drift > 5 ? "GROWING: something survives" : "flat: per-frame garbage dies young"})`);
const sorted = frameTimes.slice().sort((a, b) => a - b);
console.log(`frame CPU: p50 ${sorted[Math.floor(sorted.length * 0.5)].toFixed(2)} ms, p95 ${sorted[Math.floor(sorted.length * 0.95)].toFixed(2)} ms, worst ${sorted[sorted.length - 1].toFixed(2)} ms`);
