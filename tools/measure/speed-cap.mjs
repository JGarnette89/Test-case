/* WHAT CAPS A FAST DRIVER'S SPEED (14 Nov, DECISIONS 10.71): for cars whose wanted speed is high, how much of the time on the open highway do they reach it, and what holds them when they do not? The bound on wanted speed is the formula (HIGHWAY_CENTRE/SLOPE); this measures the three other candidates. Usage: node tools/measure/speed-cap.mjs [wantedBoost=1] */
import { loadMap } from "../../src/map/load.js";
import { testHighway } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
const boost = +(process.argv[2] ?? 1);
const L = loadMap(testHighway());
let w = seedGraph(1, 50, L, { every: 2.0, target: 150, posted: true });
if (boost !== 1) for (const a of w.actors) if (!a.player && a.v0) a.v0 *= boost;
const rows = [], seen = new Set();
let maxV = 0, maxW = 0;
for (let i = 0; i < 20 * 240; i++) {
  w = step(w);
  if (i % 20) continue;
  for (const a of w.actors) {
    if (a.kind === "truck" || a.kind === "bus" || a.player) continue;
    const p = poseOf(w, a);
    if (!((p.x > 400 && p.x < 1300) || (p.x > 2300 && p.x < 3100) || (p.x > 4100 && p.x < 5600))) continue;
    if (Math.abs(p.y - 180 * Math.sin((2 * Math.PI * p.x) / 2400)) > 15) continue;
    maxV = Math.max(maxV, a.v * 3.6); maxW = Math.max(maxW, a.v0 * 3.6);
    rows.push({ v: a.v * 3.6, w: a.v0 * 3.6, lead: a.lead ?? a.following ?? null, keys: Object.keys(a).length });
  }
}
const fast = rows.filter((r) => r.w >= 115 * boost / boost && r.w >= 115), q = (xs, f) => xs.slice().sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
const atWanted = fast.filter((r) => r.v >= r.w - 3).length;
console.log(`boost ${boost}: samples ${rows.length}; max wanted ${maxW.toFixed(0)}; max actual ${maxV.toFixed(0)}`);
console.log(`cars wanting >=115: ${fast.length} samples; at their wanted speed (within 3): ${(100 * atWanted / Math.max(1, fast.length)).toFixed(0)}%; actual/wanted p10/50/90: ${[0.1, 0.5, 0.9].map((f) => (q(fast.map((r) => r.v / r.w), f) ?? NaN).toFixed(2)).join("/")}`);
console.log("actor fields sample:", Object.keys(w.actors.find((a) => !a.player)).join(","));
