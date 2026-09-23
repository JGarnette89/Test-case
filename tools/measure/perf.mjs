/* =====================================================================
   THE CPU HALF OF THE FRAME, MEASURED IN NODE.

   A frame is the sim step plus the draw, and the draw is two halves:
   the JavaScript that decides what to paint (projection, box corners,
   culling, the painter's sort) and the rasterising the browser does
   when a path is filled. Only the first half runs here, against a stub
   context that counts calls and paints nothing -- so this is a floor
   under the frame time, not the frame time, and it says how the cost
   SCALES with the load rather than what the load costs on a phone.

   Usage: node tools/measure/perf.mjs [seconds per step, default 3]
   ===================================================================== */
import { seedScene, stepScene, carsOf, DT } from "../../src/iso/world.js";
import { drawFrame } from "../../src/iso/draw.js";
import { rampSteps } from "../../src/iso/perf.js";

const secs = Number(process.argv[2] ?? 3);
const canvas = { w: 412, h: 560 };     // a phone's portrait canvas in CSS pixels
const cam = { x: 140, y: 257, z: 3 };  // the overpass, where the ramp looks
const k = Math.max(3, (canvas.w / 70) * 0.8);

const stub = () => {
  const c = { calls: 0 };
  for (const f of ["beginPath", "moveTo", "lineTo", "closePath", "fill", "stroke", "fillRect", "setTransform", "setLineDash", "save", "restore"]) c[f] = () => { c.calls++; };
  return c;
};

const pct = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

console.log(`node ${process.version} · canvas ${canvas.w}x${canvas.h} · k ${k.toFixed(2)} px/m · ${secs}s per step`);
console.log("step  traffic  props  cars(drawn)  things  ctx-calls   step-ms(p50/p95)   draw-ms(p50/p95)   sum p95   share of 16.7ms");
for (const [i, s] of rampSteps().entries()) {
  let scene = seedScene(1, 60, { ...s, focus: cam });
  const ctx = stub();
  const stepT = [], drawT = [];
  let drew = null, calls = 0;
  const frames = Math.round(secs * 60);
  let owed = 0;
  for (let f = 0; f < frames; f++) {
    owed += 1 / 60;
    const n = Math.floor(owed / DT); owed -= n * DT;
    const a = performance.now();
    if (n > 0) scene = stepScene(scene, n);
    const b = performance.now();
    const roads = carsOf(scene, owed);
    ctx.calls = 0;
    drew = drawFrame(ctx, canvas, { roads, terrain: scene.terrain, cam, k, tilt: false, props: scene.props });
    calls = ctx.calls;
    const c = performance.now();
    stepT.push(b - a); drawT.push(c - b);
  }
  const sp = [pct(stepT, 0.5), pct(stepT, 0.95)], dp = [pct(drawT, 0.5), pct(drawT, 0.95)];
  const sum = sp[1] + dp[1];
  console.log(`${String(i + 1).padStart(4)}  ${String(s.traffic).padStart(7)}  ${String(s.props).padStart(5)}  ${String(drew.cars).padStart(11)}  ${String(drew.items).padStart(6)}  ${String(calls).padStart(9)}   ${sp[0].toFixed(2).padStart(6)} / ${sp[1].toFixed(2).padStart(6)}   ${dp[0].toFixed(2).padStart(6)} / ${dp[1].toFixed(2).padStart(6)}   ${sum.toFixed(2).padStart(7)}   ${(100 * sum / 16.7).toFixed(0).padStart(4)}%`);
}
