/* WHERE THE LOOP'S SPEED SPREAD COMES FROM (11 November, DECISIONS 10.70). `verify-loop` section 3 asks that at minute 15 the speeds are still spread (sd >= 10 km/h, [invented]) and cars still overtake (>= 60, [invented]).
   This replicates its sample exactly (the open loop, target 200 cars, seed 1, every cars ON THE LOOP roads once a second over minute 14 to 15) and takes the spread apart:
     sd of the speeds                      (the quantity the check reads);
     sd of the WANTED speeds (v0)          (what drivers want: the spread that is a feature);
     the mean shortfall v0 - v and the share of samples under 80% and under 60% of the wanted speed (traffic holding a car back: the spread that is a symptom);
     the sd among the samples NOT held back (v >= 0.8 v0); and by lane (curb 0, middle 1, left 2): n, mean speed, mean wanted speed, sd.
   Usage: node tools/measure/loop-spread.mjs   (run in the tree under test). Prints one JSON line. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
import { pathOf } from "../../src/sim/crossing.js";

const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
const onLoop = (w, a) => { const p = pathOf(w, a), L = w.course.at[a.k ?? 0].layout; return /^loop-/.test(L.legs[p.from]?.road ?? "") && /^loop-/.test(L.legs[p.to]?.road ?? ""); };
let w = seedGraph(1, 50, loaded, { target: 200, posted: true });
while (w.t < 840) w = step(w);
const S = [];
for (let i = 0; i < 60 / DT; i++) {
  w = step(w);
  if (i % 20) continue;
  for (const a of w.actors) { if (!onLoop(w, a)) continue; const p = pathOf(w, a); const lane = +(String(p.from).split("#")[1] ?? 0); S.push({ v: a.v * 3.6, v0: (a.v0 ?? a.v) * 3.6, lane }); }
}
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); return +Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, xs.length)).toFixed(2); };
const mean = (xs) => +(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1);
const free = S.filter((s) => s.v >= 0.8 * s.v0);
const lanes = {}; for (const l of [0, 1, 2]) { const g = S.filter((s) => s.lane === l); lanes[l] = { n: g.length, meanV: mean(g.map((s) => s.v)), meanWanted: mean(g.map((s) => s.v0)), sdV: sd(g.map((s) => s.v)) }; }
console.log(JSON.stringify({ samples: S.length, sdSpeed: sd(S.map((s) => s.v)), sdWanted: sd(S.map((s) => s.v0)), meanShortfallKmh: mean(S.map((s) => s.v0 - s.v)), shareUnder80pcOfWanted: +(S.filter((s) => s.v < 0.8 * s.v0).length / Math.max(1, S.length)).toFixed(3), shareUnder60pcOfWanted: +(S.filter((s) => s.v < 0.6 * s.v0).length / Math.max(1, S.length)).toFixed(3), sdAmongNotHeldBack: sd(free.map((s) => s.v)), nNotHeldBack: free.length, lanes }));
