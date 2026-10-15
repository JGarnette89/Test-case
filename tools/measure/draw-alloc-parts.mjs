/* WHERE THE DRAW'S GARBAGE COMES FROM (15 October): drawFrame on the
   bench at street zoom following a car, bytes per frame with each part of
   the scene taken away in turn. The young generation is made large so
   nothing is collected mid-measure.
   Usage: node --expose-gc --max-semi-space-size=1024 tools/measure/draw-alloc-parts.mjs [fleet=400] */
import { PerformanceObserver } from "node:perf_hooks";
import { benchScene, benchActors } from "../../src/iso/bench.js";
import { handle, merge } from "../../src/sim/remote.js";
import { drawFrame } from "../../src/iso/draw.js";

const fleet = Number(process.argv[2] ?? 400);
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 395, h: 527 };
const sc = benchScene(fleet, {}, { shell: true });
const { reply } = handle(null, { type: "init", bench: { fleet, off: {} }, seq: 1 });
sc.world = merge(sc.world, reply.dyn);
const actors = benchActors(sc, 0.02);
const a = actors.filter((x) => !x.parked && !x.ped)[5];
const cam = { x: a.x, y: a.y, z: 0 };
const k = Math.max(1, size.w / 60);
const base = { roads: sc.roads, terrain: sc.terrain, cam, rot: 0, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t: sc.world.t, lights: sc.world.lights };
/* A window a collection ran in is thrown away and taken again: heapUsed
   only measures allocation while nothing is collected. */
let gcs = 0;
new PerformanceObserver((l) => { gcs += l.getEntries().length; }).observe({ entryTypes: ["gc"] });
const tick = () => new Promise((r) => setImmediate(r));
const per = async (scene, n = 20) => {
  for (let i = 0; i < 150; i++) drawFrame(ctx, size, scene);   // past the compiler and the caches: what is left is per frame
  for (let attempt = 0; attempt < 20; attempt++) {
    global.gc(); await tick(); gcs = 0;
    const h = process.memoryUsage().heapUsed;
    for (let i = 0; i < n; i++) drawFrame(ctx, size, scene);
    const used = process.memoryUsage().heapUsed - h;
    await tick();
    if (gcs <= 1) return used / n;   // the forced collection's own entry may land late
  }
  return NaN;
};
const all = await per(base);
console.log(`whole frame: ${(all / 1024).toFixed(0)} KB (${actors.length} actors handed in)`);
const parts = {
  "parked cars": { actors: actors.filter((x) => !x.parked) },
  "moving cars": { actors: actors.filter((x) => x.parked || x.ped) },
  "people": { actors: actors.filter((x) => !x.ped) },
  "all actors": { actors: [] },
  "buildings": { props: [] },
  "sidewalks": { sidewalks: [] },
  "roads": { roads: [] },
  "junctions": { junctions: [] },
  "ground": { terrain: null },
  "stops": { stops: [] },
  "lights": { lights: null },
};
for (const [name, off] of Object.entries(parts)) {
  let b;
  try { b = await per({ ...base, ...off }); } catch (e) { console.log(`  ${name}: cannot remove (${e.message})`); continue; }
  console.log(`  without ${name.padEnd(12)} ${(b / 1024).toFixed(0).padStart(6)} KB  -> ${name} ${((all - b) / 1024).toFixed(0).padStart(5)} KB`);
}
