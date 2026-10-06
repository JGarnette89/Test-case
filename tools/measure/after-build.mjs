/* WHAT HAPPENS IN THE SECONDS AFTER A CITY IS BUILT. The phone's bench
   (c38ecb9) logged one hitch per step that rebuilt its world, 1.3-4.8 s
   into it, with our own callback 6-30 ms and no long task seen. This
   plays the bench's frames for a while after each of three builds in a
   row -- as the ramp does -- and lists every garbage collection over
   10 ms with when it fell, against frames of the same play with no
   build behind them.

   Usage: node tools/measure/after-build.mjs [fleet=150] [seconds=20] */
import { PerformanceObserver, performance } from "node:perf_hooks";
import { benchState, loadStep, benchFrame } from "../../src/iso/bench.js";

const [fleetArg = "150", secsArg = "20"] = process.argv.slice(2);
const gcs = [];
new PerformanceObserver((l) => { for (const e of l.getEntries()) gcs.push({ at: e.startTime, ms: e.duration, kind: e.detail?.kind ?? e.kind }); }).observe({ entryTypes: ["gc"] });
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 412, h: 560 };
let st = null;
for (const fleet of [Number(fleetArg) - 50, Number(fleetArg), Number(fleetArg) + 50]) {
  const b0 = performance.now();
  st = st ? loadStep(st, { fleet, off: {} }) : benchState({ fleet, off: {} });
  const built = performance.now();
  const frames = [];
  for (let f = 0; f < Number(secsArg) * 60; f++) {
    if (f % 20 === 0) await new Promise((r) => setImmediate(r));   // let the GC observer deliver
    const t0 = performance.now();
    benchFrame(st, 16.7, ctx, size);
    frames.push(performance.now() - t0);
  }
  await new Promise((r) => setImmediate(r));
  const big = gcs.filter((g) => g.at >= b0 && g.ms > 10);
  const fmt = (g) => `${g.at < built ? "during build" : `${((g.at - built) / 1000).toFixed(1)} s after`} ${g.ms.toFixed(0)} ms`;
  const worst = (from, to) => Math.max(0, ...frames.slice(from * 60, to * 60));
  console.log(`build ${fleet} cars: ${((built - b0) / 1000).toFixed(1)} s; collections over 10 ms: ${big.map(fmt).join(", ") || "none"}`);
  console.log(`   worst frame (our own work) 0-6 s after: ${worst(0, 6).toFixed(1)} ms; 6-${secsArg} s after: ${worst(6, Number(secsArg)).toFixed(1)} ms`);
}
