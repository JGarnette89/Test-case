/* WHAT BODY MOTION COSTS A FRAME (13 November, DECISIONS 10.70). Plays #/map's frame the way frame-cost.mjs does, headlessly: a sim step every third frame (60 fps, a 50 ms tick), each car's carried pose, the body (iso/body.js bodyOf) when on,
   and drawFrame on a phone-sized canvas with a stub context that COUNTS CANVAS CALLS (the phone pays per call). Two arms, alternated and warmed (OFF, ON, OFF, ON ...), on the loop with 300 cars at street zoom:
   per frame the milliseconds of poses, of the body, of the draw, their total; canvas calls; and garbage collections. Read the numbers as PROPORTIONS: a desktop is several times faster than a Pixel 7 Pro, its JIT and cache behave differently,
   and garbage costs more on the phone. The honest transferable things are the RATIO between the arms, the canvas-call count (identical or not), and the count of collections. Usage: node tools/measure/body-cost.mjs [cars=300] [k=13.7] [rounds=4] */
import { PerformanceObserver, performance } from "node:perf_hooks";
import { loadMap, groundFor } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, carriedWorld, carriedPose, DT } from "../../src/sim/crossing.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { terrain } from "../../src/iso/road.js";
import { drawFrame } from "../../src/iso/draw.js";
import { newBody, beginBodyFrame, endBodyFrame, bodyOf } from "../../src/iso/body.js";
const [carsArg = "300", kArg = "13.7", roundsArg = "4"] = process.argv.slice(2), FDT = 1 / 60, size = { w: 824, h: 1830 };
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(1, 50, loaded, { target: +carsArg, posted: true, brakeReaction: true });
const bnd = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const sc = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: bnd.x, y0: bnd.y, x1: bnd.x + bnd.w, y1: bnd.y + bnd.h, cell: 20, ground }), junctions: junctionsOf(w.course), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [], groundAt: ground };
let calls = 0;
const fn = () => { calls++; };
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : fn), set: (t, p, v) => { t[p] = v; return true; } });
let gcs = 0; new PerformanceObserver((l) => { gcs += l.getEntries().length; }).observe({ entryTypes: ["gc"] });
const mem = newBody();
const arm = (on, frames, warm) => {
  const ms = { pose: [], body: [], draw: [], all: [] }; let c0 = 0, g0 = 0, n = 0;
  for (let f = 0; f < frames; f++) {
    if (f % 3 === 0) w = step(w);
    const carry = (f % 3) * FDT, t0 = performance.now(), wc = carriedWorld(w, carry), actors = [], bodyArg = on ? mem : null;
    if (on) beginBodyFrame(mem);
    let tb = 0;
    for (const a of w.actors) {
      if (a.shadow) continue;
      const p = carriedPose(wc, a, carry);
      let bd = null; if (on) { const q0 = performance.now(); bd = bodyOf(mem, w, a, carry, FDT); tb += performance.now() - q0; }
      actors.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: a.colour, crashed: !!a.crash, kind: a.kind, length: p.length, width: p.width, height: p.height, brakeLamp: !!a.brakeLamp, blinker: a.blinker ?? null, ...(bd ? { body: bd } : {}) });
    }
    if (on) endBodyFrame(mem);
    const t1 = performance.now(), car = actors[Math.floor(actors.length / 2)];
    if (f === warm) { c0 = calls; g0 = gcs; }
    drawFrame(ctx, size, { ...sc, cam: { x: car.x, y: car.y, z: 0 }, rot: (f * 0.3) % 360, k: +kArg, tilt: false, actors });
    const t2 = performance.now();
    if (f >= warm) { ms.pose.push(t1 - t0 - tb); ms.body.push(tb); ms.draw.push(t2 - t1); ms.all.push(t2 - t0); n++; }
  }
  const q = (x, p) => [...x].sort((a, b) => a - b)[Math.floor(p * (x.length - 1))], mean = (x) => x.reduce((a, b) => a + b, 0) / x.length;
  return { mean: mean(ms.all), p50: q(ms.all, 0.5), p95: q(ms.all, 0.95), p99: q(ms.all, 0.99), pose: mean(ms.pose), body: mean(ms.body), draw: mean(ms.draw), calls: (calls - c0) / n, gcs: gcs - g0, frames: n };
};
/* GARBAGE: the PerformanceObserver cannot report collections from inside a synchronous loop (its callback waits for the event loop; the first version printed gcs 0 for both arms), so ARM=off|on runs ONE arm alone and `node --trace-gc` is counted from outside. */
if (process.env.ARM) { const on = process.env.ARM === "on"; arm(on, 300, 0); console.log("TIMED", JSON.stringify(arm(on, 3000, 100))); process.exit(0); }
const rows = { off: [], on: [] };
arm(false, 300, 0); arm(true, 300, 0);   // warm both paths
for (let r = 0; r < +roundsArg; r++) { rows.off.push(arm(false, 600, 100)); rows.on.push(arm(true, 600, 100)); }
const avg = (k, key) => rows[k].reduce((a, b) => a + b[key], 0) / rows[k].length, f = (x) => +x.toFixed(3);
const out = {};
for (const k of ["off", "on"]) out[k] = Object.fromEntries(["mean", "p50", "p95", "p99", "pose", "body", "draw", "calls", "gcs"].map((key) => [key, f(avg(k, key))]));
out.cars = w.actors.length; out.k = +kArg;
out["body motion costs, ms a frame (mean / p95)"] = [f(out.on.mean - out.off.mean), f(out.on.p95 - out.off.p95)];
out["...as a share of the frame without it"] = f((out.on.mean - out.off.mean) / out.off.mean);
out["...as a share of a 16.7 ms frame, on this machine"] = f((out.on.mean - out.off.mean) / 16.7);
out["...the body's own bodyOf time a frame, ms"] = out.on.body;
out["canvas calls a frame, off / on (the arms alternate on an advancing world, so the scenes differ by a few percent: NOT a cost of the body, which draws the same boxes)"] = [out.off.calls, out.on.calls];
out.gcs = "not reported here: see ARM=off|on with --trace-gc";
delete out.off.gcs; delete out.on.gcs;
console.log(JSON.stringify(out, null, 1));
