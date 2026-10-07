/* What speed traffic cruises at on the open highway, far from the lights: wanted (v0) and actual, by kind. */
import { loadMap } from "../../src/map/load.js";
import { testHighway } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
const L = loadMap(testHighway());
let w = seedGraph(1, 50, L, { every: 2.0, target: 150, posted: true });
const v = { car: [], truck: [] }, v0 = { car: [], truck: [] };
for (let i = 0; i < 20 * 240; i++) {
  w = step(w);
  if (i % 20) continue;
  for (const a of w.actors) {
    const p = poseOf(w, a);
    /* the open road: away from both crossroads (x 1800, 3600) and the ends */
    if (!((p.x > 400 && p.x < 1300) || (p.x > 2300 && p.x < 3100) || (p.x > 4100 && p.x < 5600))) continue;
    if (Math.abs(p.y - 180 * Math.sin((2 * Math.PI * p.x) / 2400)) > 15) continue;   // on the highway, not a side road
    const kind = a.kind === "truck" ? "truck" : "car";
    v[kind].push(a.v * 3.6); v0[kind].push((a.v0 ?? 0) * 3.6);
  }
}
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.floor(f * (s.length - 1))]?.toFixed(0); };
for (const k of ["car", "truck"]) console.log(`${k}: ${v[k].length} samples; wanted p10/50/90 ${q(v0[k], 0.1)}/${q(v0[k], 0.5)}/${q(v0[k], 0.9)} km/h; actual p10/50/90 ${q(v[k], 0.1)}/${q(v[k], 0.5)}/${q(v[k], 0.9)} km/h`);
