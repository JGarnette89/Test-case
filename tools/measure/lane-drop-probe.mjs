/* A LANE THAT ENDS, WITHOUT ANY NEW MACHINERY (DECISIONS 10.142): an acceleration lane (map/accel.js) with NO feeding road on a mid span of the generated highway, so the fifth lane is open for L m and then closes over its taper, which is a lane drop 5 to 4. Counts crashes and cars slow or standing within 350 m of the drop. Usage: node tools/measure/lane-drop-probe.mjs cars mins L span seed (L 0 = as built) */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const cars = Number(process.argv[2] ?? 260), mins = Number(process.argv[3] ?? 6), L = process.argv[4] ? Number(process.argv[4]) : 0, spanId = process.argv[5] ?? "hw-5000", seed = Number(process.argv[6] ?? 1);
const raw = TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build();
const span = raw.roads.find((r) => r.id === spanId);
if (L) span.accel = { start: { length: L } };   // an acceleration lane with NO feeding road: a lane that ends along the road
const pts = span.points.map((p) => [p.x ?? p[0], p.y ?? p[1]]);
let acc = 0, endAt = pts[0]; for (let i = 1; i < pts.length && acc < L + 250; i++) { acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); endAt = pts[i]; }
console.log(`${spanId} ${L ? `lane 5 ends over ${L} m (+taper), point ${endAt.map(Math.round)}` : "as built"}; ${cars} cars, ${mins} min, seed ${seed}`);
let w; try { ({ world: w } = worldFor(seed, 50, 2.0, false, cars, raw, null, false)); } catch (e) { console.log("BUILD THREW:", String(e.message).slice(0, 200)); process.exit(1); }
const seen = new Set(); let crashes = 0, n = 0, slow = 0, stopped = 0, inL5 = 0; const lanes = {};
try {
  for (let i = 0; i < (mins * 60) / DT; i++) {
    w = step(w);
    for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (!seen.has(k)) { seen.add(k); crashes++; } }
    if (i % 10 === 0 && i * DT > 60) for (const a of w.actors) { if (a.parked || a.player) continue; const p = poseOf(w, a), d = Math.hypot(p.x - endAt[0], p.y - endAt[1]); if (d < 350) { n++; if ((a.v ?? 0) < 8) slow++; if ((a.v ?? 0) < 0.5) stopped++; } }
  }
  console.log(`  crashes ${crashes}; car-samples within 350 m of the drop ${n}: under 8 m/s ${slow} (${(100 * slow / Math.max(1, n)).toFixed(1)}%), standing (<0.5 m/s) ${stopped} (${(100 * stopped / Math.max(1, n)).toFixed(1)}%)`);
} catch (e) { console.log("  SIM THREW:", String(e.message).slice(0, 160)); }
