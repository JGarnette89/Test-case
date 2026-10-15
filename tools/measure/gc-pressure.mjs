/* GARBAGE COLLECTION ON THE PAGE, MEASURED AS PAUSES (15 October): the
   page's frame loop in worker mode -- an answer laid over the copy every
   third frame, the poses and the draw every frame -- for N frames on the
   bench at street zoom, and every collection V8 ran: how many, of which
   kind, the total and the longest. Bytes are hard to count in V8; the
   pauses are what the phone feels.
   Usage: node tools/measure/gc-pressure.mjs [fleet=400] [frames=1800] */
import { PerformanceObserver, constants } from "node:perf_hooks";
import { serialize, deserialize } from "node:v8";
import { benchScene, benchActors, benchCamera } from "../../src/iso/bench.js";
import { handle, merge } from "../../src/sim/remote.js";
import { drawFrame } from "../../src/iso/draw.js";

const fleet = Number(process.argv[2] ?? 400), N = Number(process.argv[3] ?? 1800);
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 395, h: 527 };
const sc = benchScene(fleet, {}, { shell: true });
let { state, reply } = handle(null, { type: "init", bench: { fleet, off: {} }, seq: 1 });
sc.world = merge(sc.world, structuredClone(reply.dyn));
const replies = [];
for (let i = 0; i < Math.ceil(N / 3) + 41; i++) { const r = handle(state, { type: "step", me: null, seq: i + 2 }); state = r.state; replies.push(serialize(r.reply.dyn)); }
state = null; reply = null;
/* Each answer kept SERIALIZED, outside the JS heap, and deserialized when
   it lands -- as the browser hands the page a fresh copy of what the
   worker posted. Kept as objects, 600 answers would sit in the old
   generation and cause the very collections being measured. */
const KIND = { [constants.NODE_PERFORMANCE_GC_MINOR]: "scavenge", [constants.NODE_PERFORMANCE_GC_MAJOR]: "mark-compact", [constants.NODE_PERFORMANCE_GC_INCREMENTAL]: "incremental", [constants.NODE_PERFORMANCE_GC_WEAKCB]: "weak" };
const gcs = [];
let on = false;
new PerformanceObserver((l) => { if (on) for (const e of l.getEntries()) gcs.push({ kind: KIND[e.detail?.kind ?? e.kind] ?? "other", ms: e.duration }); }).observe({ entryTypes: ["gc"] });
let cam = {};
const frame = (i) => {
  if (i % 3 === 0) sc.world = merge(sc.world, deserialize(replies[i / 3]));
  const actors = benchActors(sc, (i % 3) / 60);
  const c = benchCamera(cam, sc, actors, "car", size, 1 / 60); cam = c.cam;
  drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam, rot: 0, k: c.k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t: sc.world.t, lights: sc.world.lights });
};
for (let i = 0; i < 120; i++) frame(i);   // warm the compiler
global.gc?.();
on = true;
const t0 = performance.now();
for (let i = 120; i < N + 120; i++) frame(i);
const ms = performance.now() - t0;
await new Promise((r) => setTimeout(r, 50));
const by = {};
for (const g of gcs) { const b = (by[g.kind] ??= { n: 0, ms: 0, max: 0 }); b.n++; b.ms += g.ms; b.max = Math.max(b.max, g.ms); }
console.log(`${N} frames (${(N / 60).toFixed(0)} s at 60 fps) at ${fleet} cars: ${(ms / N).toFixed(2)} ms a frame of script`);
for (const [k, b] of Object.entries(by)) console.log(`  ${k.padEnd(13)} ${String(b.n).padStart(4)} collections, ${b.ms.toFixed(0).padStart(5)} ms in all, longest ${b.max.toFixed(1)} ms`);
