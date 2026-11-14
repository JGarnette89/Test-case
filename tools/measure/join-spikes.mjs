import { roadgen } from "../../src/map/roadgen.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph } from "../../src/sim/crossing.js";
import { curvatureAt } from "../../src/sim/corner.js";
const raw = roadgen({ ID: "x", LANES: 5, LIMIT: 110, CARS: 0, CARS_MAX: 0, SHAPE: false, BENDS: "driver" });
const w = seedGraph(1, 50, loadMap(raw), { every: 2.0, target: 10, posted: true });
let paths = 0, spiky = 0; const where = new Map(); const ex = [];
for (const at of w.course.at) for (const [id, p] of Object.entries(at.layout.paths)) {
  paths++; let any = false;
  for (let s = 0; s <= p.length; s += 1) {
    if (s >= p.stopAt && s <= p.clearAt) continue;
    const k = curvatureAt(p, s); if (k > 1 / 60) { any = true; const rel = s < p.stopAt ? `approach ${(p.stopAt - s).toFixed(0)} m before the line` : `exit ${(s - p.clearAt).toFixed(0)} m after the box`; const key = s < 3 ? "path start" : s > p.length - 3 ? "path end" : (s < p.stopAt ? "approach" : "exit"); where.set(key, (where.get(key) ?? 0) + 1); if (ex.length < 6) ex.push(`${at.layout ? "" : ""}${id} s=${s} k=1/${(1 / k).toFixed(0)} (${rel}; stopAt ${p.stopAt.toFixed(0)} clearAt ${p.clearAt.toFixed(0)} len ${p.length.toFixed(0)})`); }
  }
  if (any) spiky++;
}
console.log(`${paths} paths, ${spiky} with a curvature spike (R < 60 m) on a road part; where: ${[...where.entries()].map(([k, n]) => `${k} ${n}`).join(", ")}`);
for (const e of ex) console.log("  " + e);
// how far from a join do real spikes (R < 60 m) reach? distance to the nearest of: path start, the line, the box's far edge, path end
for (const thr of [1 / 60, 1 / 100, 1 / 150, 1 / 200]) {
  let far = 0, n = 0; const dist = [];
  for (const at of w.course.at) for (const p of Object.values(at.layout.paths)) for (let s = 0; s <= p.length; s += 1) {
    if (s >= p.stopAt && s <= p.clearAt) continue;
    if (curvatureAt(p, s) > thr) { const d = Math.min(s, Math.abs(s - p.stopAt), Math.abs(s - p.clearAt), p.length - s); dist.push(d); }
  }
  dist.sort((a, b) => a - b);
  console.log(`curvature above 1/${Math.round(1 / thr)}: ${dist.length} samples; distance to the nearest join p50/p90/p99/max ${dist[Math.floor(dist.length / 2)]}/${dist[Math.floor(dist.length * .9)]}/${dist[Math.floor(dist.length * .99)]}/${dist.at(-1)} m`);
}
