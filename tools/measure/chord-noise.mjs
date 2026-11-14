import { roadgen } from "../../src/map/roadgen.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph } from "../../src/sim/crossing.js";
import { poseAt } from "../../src/sim/intersection.js";
import { onTheOpenRoad } from "../../src/sim/corner.js";
const raw = roadgen({ ID: "x", LANES: 5, LIMIT: 110, CARS: 0, CARS_MAX: 0, SHAPE: false, BENDS: "driver" });
const w0 = seedGraph(1, 50, loadMap(raw), { every: 2.0, target: 10, posted: true });
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
for (const CH of [40, 60, 80, 100, 120, 160]) {
  const h = CH / 2; let worst = 0, p95 = [], vals = [];
  for (const at of w0.course.at) for (const p of Object.values(at.layout.paths)) {
    const k = (s) => Math.abs((norm(poseAt(p, Math.min(p.length, s + h)).rot - poseAt(p, Math.max(0, s - h)).rot) * Math.PI) / 180 / Math.min(CH, p.length));
    for (let s = 150; s < p.stopAt - 150; s += 1) { const a = k(s), b = k(s + 1); if (a > 1 / 700 && b > 1 / 700 && onTheOpenRoad(p, s)) { const d = Math.abs(a - b) / Math.max(a, b); worst = Math.max(worst, d); vals.push(d); } }
  }
  vals.sort((a, b) => a - b);
  console.log(`chord ${String(CH).padStart(3)} m: adjacent-metre variation over ${vals.length} samples: median ${(100 * vals[Math.floor(vals.length / 2)]).toFixed(1)}%, p95 ${(100 * vals[Math.floor(vals.length * 0.95)]).toFixed(1)}%, max ${(100 * worst).toFixed(0)}%`);
}
