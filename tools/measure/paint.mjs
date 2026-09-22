/* THE FIXED VIEW, BY CASE: cars at segment seams and mid-segment on a road along the depth axis (A-north), one across it (A-west), the bent road (C-A), and in each box. Run: node tools/measure/paint.mjs. Against the renderer before 5bb0fcc: A-west 113/113 misdrawn, A-north 0/113, C-A 40/82, every box -- seams no different from mid-segment. SIMULATOR.md 1.1.4. */
import { drawFrame } from "../../src/iso/draw.js";
import { terrain } from "../../src/iso/road.js";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { graphOf } from "../../src/sim/graph.js";
const stub = new Proxy({}, { get: (t, p) => (p === "canvas" ? { width: 1, height: 1 } : () => {}), set: () => true });
const inside = (poly, x, y) => { let on = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) on = !on; } return on; };
const loaded = loadMap(testMap1());
const course = graphOf(loaded, { lane: 3.6 });
const b = loaded.bounds;
/* Cars: at seams (s = multiples of 5 m from the road start) and mid-segment on A-north (N-S, along the map's y), on A-west (E-W), on the bent road C-A, in the boxes. */
const cars = [];
for (let y = 100; y <= 380; y += 2.5) cars.push({ id: `A-north@${y}${y % 5 === 0 ? " seam" : " mid"}`, x: 405.4, y, z: 0, heading: 90 });
for (let x = 100; x <= 380; x += 2.5) cars.push({ id: `A-west@${x}${x % 5 === 0 ? " seam" : " mid"}`, x, y: 394.6, z: 0, heading: 0 });
const ca = loaded.roads.find((r) => r.id === "C-A");
for (let i = 2; i < ca.pts.length - 2; i += 2) cars.push({ id: `C-A#${i} seam`, x: ca.pts[i].x, y: ca.pts[i].y, z: 0, heading: 0 });
for (let i = 2; i < ca.pts.length - 2; i += 2) { const p = ca.pts[i], q = ca.pts[i + 1]; cars.push({ id: `C-A#${i}.5 mid`, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: 0, heading: 0 }); }
for (const [n, x, y] of [["n0", 400, 400], ["n1", 800, 400], ["n2", 400, 800], ["n3", 800, 800]]) for (const [dx, dy] of [[0, 0], [5, 0], [-5, 0], [0, 5], [0, -5], [4, 4]]) cars.push({ id: `${n} box`, x: x + dx, y: y + dy, z: 0, heading: 0 });
const scene = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground: () => 0 }), junctions: junctionsOf(course), groundAt: () => 0, k: 3, tilt: false, actors: cars, rot: 0 };
const tally = {};
for (const cam of [{ x: 400, y: 400, z: 0 }, { x: 600, y: 600, z: 0 }, { x: 400, y: 800, z: 0 }, { x: 800, y: 600, z: 0 }]) {
  const out = drawFrame(stub, { w: 2400, h: 1800 }, { ...scene, cam }, { audit: true });
  const order = out.order.map((t, i) => ({ ...t, i }));
  for (const c of order.filter((t) => t.kind === "car")) for (const s of order.filter((t) => t.poly)) {
    if (!inside(s.poly, c.at.x, c.at.y) || Math.abs(c.at.z - s.poly[0].z) > 1.5) continue;
    const group = c.id.replace(/@[\d.]+/, "").replace(/#[\d.]+/, "");
    tally[group] ??= { cars: new Set(), bad: new Set(), badOn: {} };
    tally[group].cars.add(c.id);
    if (c.i < s.i) { tally[group].bad.add(c.id); tally[group].badOn[s.kind] = (tally[group].badOn[s.kind] ?? 0) + 1; }
  }
}
for (const [g, t] of Object.entries(tally)) console.log(`${g.padEnd(14)} ${t.bad.size}/${t.cars.size} cars misdrawn at the fixed view`, JSON.stringify(t.badOn));
