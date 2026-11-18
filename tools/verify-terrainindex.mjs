/* =====================================================================
   THE TERRAIN WALK IS THE SIZE OF THE VIEW, AND DRAWS WHAT THE FULL WALK DREW (17 November 2026). Jay's frame counter on the Pixel 7 Pro read the same 33 ms past the step at 100 and 160 cars; the
   measured owner is the loop over every ground cell in the map in `drawFrame` (329,208 on the generated road, 13 ms of script a frame on the desk, 95% of the draw's). `terrain()` now keeps its grid and
   `drawFrame` visits only the index range `view.groundRect` says the canvas can show. Expectations are stated here, never read from the module:
     1. IT DRAWS THE SAME THING: for many cameras (a chase camera on forty cars, four rotations, three zooms) on four maps with different ground, the items the indexed walk makes are IDENTICAL, in the same order with the same
        depth keys, to the items the full walk makes on the same cells (the full walk = the same array without its grid). Cell items are compared one by one, not by count.
     2. IT IS WORTH IT: on the generated road the number of cells visited is under 1% of the map's (and the full walk visits all of them), so the cost is the size of the view.
     3. IT FALLS BACK: a terrain with no grid, and the far (flat) tier, walk everything and still match.
   Sabotage: the rectangle's margin removed fails 1 (cells at the edge of the canvas missing); the heights of the ground ignored (z fixed at 0) fails 1 on a hilly map. Usage: node tools/verify-terrainindex.mjs
   ===================================================================== */
import { loadMap, groundFor } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";
import { junctionsOf } from "../src/sim/graph.js";
import { sidewalksOf } from "../src/map/sidewalks.js";
import { terrain } from "../src/iso/road.js";
import { drawFrame } from "../src/iso/draw.js";
import { chaseStep, newChase, zoomFor } from "../src/iso/chase.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
// BARE WORLD: seedGraph with the options it needs stated; the subject is the draw of the ground, which no sim mechanism touches.
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 395, h: 527 };
let visitedTotal = 0, framesTotal = 0;
for (const id of ["test-highway-gen-wide", "test-1", "test-highway", "city"]) {
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
  const cells = terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), bare = cells.slice();   // no grid on the copy
  const statics = (t) => ({ roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: t, sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [] });
  let w = seedGraph(1, 50, loaded, { every: 2.0, target: 60, posted: true });
  for (let i = 0; i < 400; i++) w = step(w);
  const junctions = junctionsOf(w.course);
  const actors = w.actors.slice(0, 40).map((a) => { const p = poseOf(w, a); return { id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: "#c33", kind: a.kind, length: p.length, width: p.width, v: a.v }; });
  let same = 0, differ = 0, cellsSeen = 0, firstBad = null, zRange = [cells.grid?.zMin, cells.grid?.zMax];
  for (const a of actors) for (const rot of [0, 90, 180, 270]) for (const kz of [1, 2, 4]) {
    const cam = chaseStep(newChase(a, a.heading), { ...a, v: a.v ?? 10 }, 1 / 60), k = zoomFor(size.w, size.h, cam.lead) * kz / 2;
    const one = (t) => drawFrame(ctx, size, { ...statics(t), junctions, cam, rot, k, tilt: false, actors, t: w.t, lights: w.lights }, { audit: true });
    const x = one(cells), y = one(bare);
    const cx = x.order.filter((o) => o.kind === "cell"), cy = y.order.filter((o) => o.kind === "cell");
    const eq = x.order.length === y.order.length && x.order.every((o, i) => o.kind === y.order[i].kind && o.key === y.order[i].key && (o.kind !== "cell" || (o.poly[0] === y.order[i].poly[0] && o.poly[2] === y.order[i].poly[2])));
    if (eq) same++; else { differ++; firstBad ??= `${id} rot ${rot} zoom x${kz}: ${cx.length} cell items against ${cy.length}`; }
    cellsSeen += cx.length; visitedTotal += x.of.cells; framesTotal++;
  }
  check(differ === 0 && cells.grid, `${id}: ${cells.length} cells (heights ${zRange.map((z) => z?.toFixed(1)).join(" to ")}); ${same + differ} frames, every item list identical to the full walk's (${differ} differ${firstBad ? `, first: ${firstBad}` : ""}); ${(cellsSeen / (same + differ)).toFixed(0)} cells drawn a frame`);
}
console.log("\n2. IT IS WORTH IT");
{
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build()), b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
  const cells = terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground });
  const g = cells.grid; let touched = 0; const spy = new Proxy(cells, { get: (t, p, r) => { if (typeof p === "string" && /^\d+$/.test(p)) touched++; return Reflect.get(t, p, r); } }); spy.grid = g;
  const w = seedGraph(1, 50, loaded, { every: 2.0, target: 20, posted: true }), a = w.actors[0], p = poseOf(w, a), ac = { id: a.id, n: 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: "#c33", length: p.length, width: p.width, v: 10 };
  const cam = chaseStep(newChase(ac, ac.heading), ac, 1 / 60);
  drawFrame(ctx, size, { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: spy, sidewalks: [], stops: [], props: [], junctions: [], cam, rot: 0, k: zoomFor(size.w, size.h, cam.lead), tilt: false, actors: [ac], t: 0 });
  check(touched < 0.01 * cells.length, `the generated road: ${touched} of ${cells.length} cells visited in a frame (${(100 * touched / cells.length).toFixed(2)}%, under 1%)`);
}
console.log("\n3. IT FALLS BACK");
{
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-1").build()), b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
  const cells = terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), bare = cells.slice();
  const w = seedGraph(1, 50, loaded, { every: 2.0, target: 20, posted: true }), a = w.actors[0], p = poseOf(w, a), ac = { id: a.id, n: 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: "#c33", length: p.length, width: p.width, v: 10 };
  const cam = chaseStep(newChase(ac, ac.heading), ac, 1 / 60);
  const far = (t) => drawFrame(ctx, size, { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: t, sidewalks: [], stops: [], props: [], junctions: [], cam, rot: 0, k: 0.05, tilt: false, actors: [ac], t: 0 }, { audit: true });
  const x = far(cells), y = far(bare);
  check(!bare.grid && x.order.length === y.order.length && x.order.every((o, i) => o.key === y.order[i].key), `no grid: the full walk; and the far tier (k 0.05): ${x.order.length} items, the same with and without a grid`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
