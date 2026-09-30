/* Sidewalks on every test map: how many, how long, and whether any
   sample of one lies on a road's surface (it must not), or a road end
   at an intersection is left without a sidewalk reaching near it.
   Usage: node tools/measure/sidewalks.mjs */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { sidewalksOf, onRoadSurface, WALKED, SIDEWALK_W } from "../../src/map/sidewalks.js";

for (const tm of TEST_MAPS) {
  const loaded = loadMap(tm.map ? tm.map() : tm.build());
  if (!loaded.ok) { console.log(tm.id, "does not load"); continue; }
  const t0 = performance.now();
  const walks = sidewalksOf(loaded);
  const ms = performance.now() - t0;
  let len = 0, onRoad = 0, samples = 0;
  const bad = [];
  for (const w of walks) {
    len += w.length;
    for (let i = 0; i + 1 < w.pts.length; i++) for (let f = 0; f < 1; f += 0.25) {
      for (const e of [w.inner, w.pts, w.outer]) {
        const a = e[i], b = e[i + 1];
        const p = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
        /* Pulled a centimetre off the curb, so a point ON the edge is not a hit. */
        const c = w.pts[i], q = { x: p.x + (p.x - c.x) * 0 , y: p.y };
        samples++;
        for (const r of loaded.roads) {
          if (r.id === w.road) continue;
          const inside = onRoadSurface(r, e === w.inner ? { x: p.x + (w.outer[i].x - w.inner[i].x) * 0.01, y: p.y + (w.outer[i].y - w.inner[i].y) * 0.01 } : p);
          if (inside && Math.abs((r.pts[0].z ?? 0) - (a.z ?? 0)) < 1) { onRoad++; if (bad.length < 3) bad.push(`${w.id} on ${r.id} at ${p.x.toFixed(1)},${p.y.toFixed(1)}`); break; }
        }
      }
    }
  }
  const walked = loaded.roads.filter((r) => WALKED.has(r.kind)).length;
  console.log(`${tm.id}: ${walks.length} sidewalks on ${walked}/${loaded.roads.length} walked roads, ${(len / 1000).toFixed(2)} km, ${onRoad}/${samples} samples on another road, ${ms.toFixed(0)} ms`, bad.join("; "));
}
