/* WHAT THE PAGE ALLOCATES IN WORKER MODE (15 October): the phone's bench
   showed a few frames of 50-108 ms with our own callback the whole of it,
   in play, at 400 cars -- the shape of a major collection. With the sim
   in a worker the page does three things per second of play: lays 20
   answers over its copy (each a structured clone of the actors, walkers,
   people crossing, lights), builds 60 frames of poses, and draws 60
   frames. This measures the bytes each allocates, with the young
   generation made large so nothing is collected mid-measure.
   Usage: node --expose-gc --max-semi-space-size=1024 tools/measure/page-alloc.mjs [fleet=400] */
import { benchScene, benchActors, benchCamera } from "../../src/iso/bench.js";
import { handle, merge } from "../../src/sim/remote.js";
import { drawFrame } from "../../src/iso/draw.js";

const fleet = Number(process.argv[2] ?? 400);
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 395, h: 527 };
const sc = benchScene(fleet, {}, { shell: true });
let { state, reply } = handle(null, { type: "init", bench: { fleet, off: {} }, seq: 1 });
sc.world = merge(sc.world, structuredClone(reply.dyn));
/* Replies for 10 s of play, made ahead so the worker's own work is not counted. */
const replies = [];
for (let i = 0; i < 200; i++) { const r = handle(state, { type: "step", me: null, seq: i + 2 }); state = r.state; replies.push(r.reply.dyn); }
const heap = () => { global.gc(); return process.memoryUsage().heapUsed; };
const measure = (label, n, fn) => {
  const h0 = heap(); let a = process.memoryUsage().heapUsed; const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const used = process.memoryUsage().heapUsed - a, ms = performance.now() - t0;
  void h0;
  return { label, perCall: used / n, ms: ms / n };
};
let cam = {};
const out = [];
out.push(measure("lay an answer over the copy (clone + merge), x20/s", 200, (i) => { sc.world = merge(sc.world, structuredClone(replies[i])); }));
out.push(measure("the poses (benchActors), x60/s", 300, () => benchActors(sc, 0.02)));
const actors = benchActors(sc, 0.02);
out.push(measure("the camera, x60/s", 300, () => { cam = benchCamera(cam, sc, actors, "car", size, 1 / 60).cam; }));
const k = Math.max(1, size.w / 60);
out.push(measure("the draw (drawFrame), x60/s", 300, () => drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam, rot: 0, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t: sc.world.t, lights: sc.world.lights })));
const rate = { 0: 20, 1: 60, 2: 60, 3: 60 };
let total = 0;
out.forEach((r, i) => { const perS = r.perCall * rate[i]; total += perS; console.log(`${r.label.padEnd(56)} ${(r.perCall / 1024).toFixed(0).padStart(6)} KB a call, ${(perS / 1048576).toFixed(1).padStart(5)} MB a second, ${r.ms.toFixed(2)} ms a call`); });
console.log(`the page, in all: ${(total / 1048576).toFixed(1)} MB a second at ${fleet} cars`);
