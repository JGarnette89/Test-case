/* WHAT MAKES A SCENE EXPENSIVE TO DRAW (15 October; the maintainer, sim on
   the page: "sim stayed steady while fps varied depending on the scene",
   past about 200 cars, on #/map and the endless highway).
   The chase camera put on many cars in turn, on a phone-sized canvas at
   the zoom #/map uses for their speed, and each frame drawn: the draw's
   list (cull and items), sort and paint times, the canvas calls it made
   (the phone pays per call), and what was in view. Then which quantity the
   cost follows, and how it grows with the cars on the map -- a cliff (a
   step at some count: something falling out of a fast path) or a slope.
   Usage: node tools/measure/draw-scenes.mjs [map=test-1|test-loop] [cars=100,150,200,250,300,400] */
import { performance } from "node:perf_hooks";
import { loadMap, groundFor } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { parkedPoses } from "../../src/sim/parking.js";
import { pedPose } from "../../src/sim/peds.js";
import { walkerPose } from "../../src/sim/walkers.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { terrain } from "../../src/iso/road.js";
import { drawFrame } from "../../src/iso/draw.js";
import { chaseStep, newChase, zoomFor } from "../../src/iso/chase.js";

const [mapId = "test-1", carsArg = "100,150,200,250,300,400"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
let calls = 0;
const noop = () => { calls++; };
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 395, h: 527 };
const b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const statics = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: (loaded.props ?? []).map((p) => ({ x: p.at.x, y: p.at.y, heading: p.heading, l: p.l, w: p.w, h: p.h })), groundAt: ground };
const actorsOf = (w) => {
  const out = w.parked ? parkedPoses(w.course, w.parked).slice() : [];
  for (const a of w.actors) { const p = poseOf(w, a); out.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: a.colour ?? "#c33", kind: a.kind, length: p.length, width: p.width, height: p.height, brakeLamp: !!a.brakeLamp, blinker: a.blinker ?? null, v: a.v }); }
  for (const q of w.peds ?? []) out.push({ id: q.id, n: q.n, ...pedPose(w, q), ped: true });
  for (const q of w.walkers ?? []) out.push({ id: q.id, n: q.n, ...walkerPose(w, q), ped: true });
  return out;
};
const q = (xs, f) => [...xs].sort((a, c) => a - c)[Math.floor(f * (xs.length - 1))];
const avg = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };
console.log(`${mapId}: ${loaded.roads.length} roads, ${statics.terrain.length} ground cells, ${statics.props.length} buildings; canvas ${size.w}x${size.h}, the chase camera on each car`);
const all = [];
for (const cars of carsArg.split(",").map(Number)) {
  let w = seedGraph(1, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true });
  for (let i = 0; i < 1200; i++) w = step(w);   // a minute in: queues formed
  const actors = actorsOf(w), junctions = junctionsOf(w.course);
  const rows = [];
  const movers = actors.filter((a) => !a.ped && !String(a.id).startsWith("parked-"));
  for (let r = 0; r < 3; r++) for (const a of movers.slice(0, 60)) {
    const cam = chaseStep(newChase(a, a.heading), { ...a, v: a.v ?? 10 }, 1 / 60);
    const k = zoomFor(size.w, size.h, cam.lead);
    calls = 0;
    const t0 = performance.now();
    const d = drawFrame(ctx, size, { ...statics, junctions, cam, rot: cam.rot, k, tilt: false, actors, t: w.t, lights: w.lights });
    const ms = performance.now() - t0;
    if (r > 0) rows.push({ ms, list: d.ms.build, sort: d.ms.sort, paint: d.ms.paint, calls, items: d.items, cars: d.cars, segs: d.segments, cells: d.cells, props: d.props });
  }
  const col = (k) => rows.map((x) => x[k]);
  const line = `  ${String(w.actors.length).padStart(4)} cars: draw p50 ${q(col("ms"), 0.5).toFixed(2)} p95 ${q(col("ms"), 0.95).toFixed(2)} max ${Math.max(...col("ms")).toFixed(2)} ms; mean ${avg(col("ms")).toFixed(2)} = list ${avg(col("list")).toFixed(2)} + sort ${avg(col("sort")).toFixed(3)} + paint ${avg(col("paint")).toFixed(2)} (means: medians do not add); calls p50 ${q(col("calls"), 0.5)} p95 ${q(col("calls"), 0.95)}; in view p50/p95: items ${q(col("items"), 0.5)}/${q(col("items"), 0.95)}, cars ${q(col("cars"), 0.5)}/${q(col("cars"), 0.95)}, road ${q(col("segs"), 0.5)}/${q(col("segs"), 0.95)}, ground ${q(col("cells"), 0.5)}, buildings ${q(col("props"), 0.5)}`;
  console.log(line);
  all.push(...rows);
}
const col = (k) => all.map((x) => x[k]);
console.log(`what the draw's time follows, across every frame (correlation with ms): canvas calls ${corr(col("calls"), col("ms")).toFixed(2)}, items ${corr(col("items"), col("ms")).toFixed(2)}, cars in view ${corr(col("cars"), col("ms")).toFixed(2)}, road pieces ${corr(col("segs"), col("ms")).toFixed(2)}, ground ${corr(col("cells"), col("ms")).toFixed(2)}`);
console.log(`calls per car in view ~ ${(corr(col("cars"), col("calls"))).toFixed(2)} correlated; sort is ${(all.reduce((s, x) => s + x.sort, 0) / all.reduce((s, x) => s + x.ms, 0) * 100).toFixed(1)}% of the draw`);
