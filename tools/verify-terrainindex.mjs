/* =====================================================================
   THE TERRAIN WALK IS THE SIZE OF THE VIEW, AND DRAWS WHAT THE FULL WALK DREW (17 November 2026). Jay's frame counter on the Pixel 7 Pro read the same 33 ms past the step at 100 and 160 cars; the
   measured owner is the loop over every ground cell in the map in `drawFrame` (329,208 on the generated road, 13 ms of script a frame on the desk, 95% of the draw's). `terrain()` now keeps its grid and
   `drawFrame` visits only the index range `view.groundRect` says the canvas can show. Expectations are stated here, never read from the module:
     1. IT DRAWS THE SAME THING: for many cameras (a chase camera on forty cars, four rotations, three zooms) on four maps with different ground, the items the indexed walk makes are IDENTICAL, in the same order with the same
        depth keys, to the items the full walk makes on the same cells (the full walk = the same array without its grid). Cell items are compared one by one, not by count.
     2. IT IS WORTH IT: on the generated road the number of cells visited is under 1% of the map's (and the full walk visits all of them), so the cost is the size of the view.
     3. IT FALLS BACK: a terrain with no grid, and the far (flat) tier, walk everything and still match.
   4. THE GRID TERRAIN HOLDS THE OLD CELLS: every corner of every cell on four maps, the 329,208-cell generated road included, is bit-identical to the old construction restated in the check, and the typed arrays hold under 4 MB (it was 149 MB of objects).
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
    const eq = x.order.length === y.order.length && x.order.every((o, i) => o.kind === y.order[i].kind && o.key === y.order[i].key && (o.kind !== "cell" || o.poly.every((q, m) => q.x === y.order[i].poly[m].x && q.y === y.order[i].poly[m].y && Object.is(q.z, y.order[i].poly[m].z))));
    if (eq) same++; else { differ++; firstBad ??= `${id} rot ${rot} zoom x${kz}: ${cx.length} cell items against ${cy.length}`; }
    cellsSeen += cx.length; visitedTotal += x.of.cells; framesTotal++;
  }
  check(differ === 0 && cells.grid, `${id}: ${cells.length} cells (heights ${zRange.map((z) => z?.toFixed(1)).join(" to ")}); ${same + differ} frames, every item list identical to the full walk's (${differ} differ${firstBad ? `, first: ${firstBad}` : ""}); ${(cellsSeen / (same + differ)).toFixed(0)} cells drawn a frame`);
}
console.log("\n2. IT IS WORTH IT");
{
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build()), b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
  const cells = terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground });

  const w = seedGraph(1, 50, loaded, { every: 2.0, target: 20, posted: true }), a = w.actors[0], p = poseOf(w, a), ac = { id: a.id, n: 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: "#c33", length: p.length, width: p.width, v: 10 };
  const cam = chaseStep(newChase(ac, ac.heading), ac, 1 / 60);
  const d = drawFrame(ctx, size, { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: cells, sidewalks: [], stops: [], props: [], junctions: [], cam, rot: 0, k: zoomFor(size.w, size.h, cam.lead), tilt: false, actors: [ac], t: 0 });
  const touched = d.visited;   // the cells the draw considered, from its own report (a grid terrain has no cell objects to index)
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
console.log("\n4. THE GRID TERRAIN HOLDS EXACTLY THE CELLS THE OLD ARRAY DID (18 Nov 2026: the 149 MB of 1.6 million point objects became typed arrays)");
for (const id of ["test-1", "test-highway", "city", "test-highway-gen-wide"]) {
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
  const t = terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground });
  /* the old construction, restated here and not imported: a row-major array of [(x, y), (x + cell, y), (x + cell, y + cell), (x, y + cell)] with the ground's height at each */
  let n = 0, bad = 0, first = null;
  for (let y = b.y; y < b.y + b.h; y += 20) for (let x = b.x; x < b.x + b.w; x += 20) {
    const want = [[x, y], [x + 20, y], [x + 20, y + 20], [x, y + 20]].map(([px, py]) => ({ x: px, y: py, z: ground(px, py) })), got = t.cellAt(n);
    if (!want.every((q, k) => q.x === got[k].x && q.y === got[k].y && Object.is(q.z, got[k].z))) { bad++; first ??= n; }
    n++;
  }
  const mb = (t.xs.byteLength + t.ys.byteLength + t.zs.byteLength) / 1048576;
  check(n === t.length && bad === 0 && t.grid.nx * t.grid.ny === n && mb < 4, `${id}: ${n} cells, every corner (x, y, z) bit-identical to the old construction (${bad} differ${first != null ? `, first cell ${first}` : ""}); ${mb.toFixed(1)} MB held (under 4)`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
