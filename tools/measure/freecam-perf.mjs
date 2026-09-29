/* What the free camera costs zoomed out: the whole city in one frame, with
   300 cars, against the watch view as it was. Counts what is drawn (the
   phone's cost is canvas fills, which a desktop cannot time) and the JS
   time of building the frame.
   Run: node tools/measure/freecam-perf.mjs [cars] */
import { drawFrame } from "../../src/iso/draw.js";
import { terrain } from "../../src/iso/road.js";
import { loadMap, groundFor } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { parkedPoses } from "../../src/sim/parking.js";
import { fitK, extentOf } from "../../src/iso/freecam.js";

const cars = Number(process.argv[2] ?? 300);
const loaded = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
let w = seedGraph(1, 50, loaded, { target: cars, posted: true });
for (let i = 0; i < 200; i++) w = step(w);
const b = extentOf(loaded);
const ground = groundFor(loaded, { cell: 20 });
const actors = [...(w.parked ? parkedPoses(w.course, w.parked) : []), ...w.actors.map((a) => { const p = poseOf(w, a); return { id: a.id, n: a.n, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot }; })];
const scene = {
  roads: loaded.roads.map((road) => ({ road, cars: [] })),
  terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }),
  junctions: junctionsOf(w.course), props: loaded.props.map((p) => ({ x: p.at.x, y: p.at.y, heading: p.heading, l: p.l, w: p.w, h: p.h })), groundAt: ground, tilt: false, actors,
};
let calls = 0;
const ctx = new Proxy({}, { get: (t, p) => (p === "canvas" ? { width: 1, height: 1 } : () => { calls++; }), set: () => true });
const canvas = { w: 412, h: 760 };   // a phone in portrait, CSS pixels
const centre = { x: b.x + b.w / 2, y: b.y + b.h / 2, z: 0 };
for (const [name, k] of [["watch view as it was (k 3.7)", 412 / 110], ["a district (k 1)", 1], ["the whole city (fit)", fitK(b, canvas)]]) {
  let ms = 0, drew = null;
  for (let r = 0; r < 5; r++) { calls = 0; const t0 = performance.now(); drew = drawFrame(ctx, canvas, { ...scene, cam: centre, rot: 0, k }); ms += performance.now() - t0; }
  console.log(`${name}: k ${k.toFixed(2)}, ${drew.cars ?? "?"} cars drawn, ${calls} canvas calls, ${(ms / 5).toFixed(1)} ms JS per frame`);
}
console.log(`city ${b.w} x ${b.h} m, ${actors.length} cars incl. parked, ${loaded.props.length} buildings`);

/* Where the calls go at the widest: each layer taken away in turn. */
const kFit = fitK(b, canvas);
for (const [name, patch] of [["all", {}], ["no terrain", { terrain: [] }], ["no buildings", { props: [] }], ["no cars", { actors: [] }], ["no junctions", { junctions: [] }], ["no roads", { roads: [] }]]) {
  calls = 0; const t0 = performance.now();
  drawFrame(ctx, canvas, { ...scene, ...patch, cam: centre, rot: 0, k: kFit });
  console.log(`  whole city, ${name}: ${calls} calls, ${(performance.now() - t0).toFixed(1)} ms`);
}

/* Calls across the zoom range, at the city's centre. */
const row = [];
for (const k of [0.06, 0.12, 0.3, 0.6, 1, 1.49, 1.51, 2, 2.49, 2.51, 3, 3.75, 6]) {
  calls = 0; const t0 = performance.now();
  const d = drawFrame(ctx, canvas, { ...scene, cam: centre, rot: 0, k });
  row.push(`k ${k}: ${calls} calls ${(performance.now() - t0).toFixed(1)}ms ${d.cars} cars`);
}
console.log(row.join("\n"));
