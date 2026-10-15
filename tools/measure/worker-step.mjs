/* WHAT ONE WORKER TICK COSTS, END TO END (15 October; the maintainer:
   "the fps is solid but it's like the simulation itself is slowing down",
   test map 1, on the phone). With one tick in flight, the world keeps real
   time only while worker step + the answer's clone both ways + the wait
   for the page's next frame stays under DT. This measures the first two on
   the desk with #/map's own arguments, and what that round trip does to the
   achieved rate at a phone's slowdown factors.
   Usage: node tools/measure/worker-step.mjs [cars=default] [seconds=120] */
import { performance } from "node:perf_hooks";
import { serialize, deserialize } from "node:v8";
import { handle, merge } from "../../src/sim/remote.js";
import { worldFor } from "../../src/sim/scene.js";
import { stepDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";

const cars = process.argv[2] && process.argv[2] !== "default" ? Number(process.argv[2]) : null;
const secs = Number(process.argv[3] ?? 120);
const args = [1, 50, 2.0, true, cars, null, null, false];
let { world: page, me } = worldFor(...args);
let { state, reply } = handle(null, { type: "init", args, seq: 1 });
page = merge(page, deserialize(serialize(reply.dyn)));
const step = [], clone = [], merges = [];
for (let n = 0; n < secs / DT; n++) {
  me = stepDriver(me, { steer: -me.off * 0.3 - me.psi * 3, slider: me.v < 11 ? 0.4 : 0.05, assist: 0 }, page, DT);
  let t = performance.now();
  ({ state, reply } = handle(state, { type: "step", me, seq: n + 2 }));
  step.push(performance.now() - t);
  t = performance.now(); const buf = serialize(reply.dyn); const dyn = deserialize(buf); clone.push(performance.now() - t);
  t = performance.now(); page = merge(page, dyn); merges.push(performance.now() - t);
  if (reply.hit) me = { ...me, v: 0 };
}
const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
const row = (k, xs) => console.log(`  ${k.padEnd(28)} p50 ${q(xs, 0.5).toFixed(2)}  p95 ${q(xs, 0.95).toFixed(2)}  max ${Math.max(...xs).toFixed(2)} ms`);
console.log(`test map 1, ${state.world.actors.length} actors, ${secs} s simulated:`);
row("worker step", step); row("answer cloned there and back", clone); row("laid over the page's copy", merges);
/* The achieved rate with ONE tick in flight, sent on the next 60 Hz frame
   after the answer, and owed time capped at two ticks: per tick the wall
   time is max(DT, round trip rounded up to a frame); the rest is lost. */
const frame = 1000 / 60;
for (const slow of [1, 2, 3, 4]) {
  let wall = 0;
  for (let i = 0; i < step.length; i++) { const rt = (step[i] + clone[i]) * slow + merges[i] * slow; wall += Math.max(DT * 1000, Math.ceil(rt / frame) * frame); }
  console.log(`  at ${slow}x the desk's cost: the world runs at ${((step.length * DT * 1000) / wall).toFixed(2)}x real time`);
}
