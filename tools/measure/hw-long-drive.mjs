/* DOES THE 403-STYLE MAP (src/map/highway.js) LOAD AND DRIVE? Nothing imported it before 14 Nov. Loads it, reports the loader's warnings and refusals, seeds traffic, steps 4 minutes, reports cars, crashes, speeds and who is stuck. Usage: node tools/measure/hw-long-drive.mjs [cars=150] [seed=1] */
import { loadMap } from "../../src/map/load.js";
import { testHighway } from "../../src/map/highway.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
const cars = +(process.argv[2] ?? 150), seed = +(process.argv[3] ?? 1);
const m = testHighway();
console.log("roads", m.roads.length, "start sections", (m.sections ?? []).map((s) => s.id).join(","));
const L = loadMap(m);
console.log("loader: warnings", L.warnings?.length ?? 0, (L.warnings ?? []).slice(0, 8).map((w) => w.msg ?? w.message ?? JSON.stringify(w)).join(" | ").slice(0, 600));
console.log("dropped/refused:", JSON.stringify(L.dropped ?? L.refused ?? null)?.slice(0, 300));
let w;
try { w = seedGraph(seed, 50, L, { target: cars, posted: true, brakeReaction: true }); } catch (e) { console.log("seedGraph THREW:", e.message); process.exit(1); }
console.log("seeded actors", w.actors.length);
let crashes = 0, maxV = 0, stuck = 0;
for (let i = 0; i < 20 * 240; i++) {
  w = step(w);
  if (i % 200 === 0 && i) { const mv = w.actors.filter((a) => (a.v ?? 0) > 1).length; console.log(`t ${(i / 20).toFixed(0)} s: ${w.actors.length} cars, ${mv} moving, crashes ${w.crashes?.length ?? "?"}, fastest ${(Math.max(...w.actors.map((a) => a.v ?? 0)) * 3.6).toFixed(0)} km/h`); }
}
console.log("crashes total", w.crashes?.length, "| cars with v<1 now:", w.actors.filter((a) => (a.v ?? 0) < 1).length);
