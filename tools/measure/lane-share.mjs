/* verify-lanes section 6's own measurement, alone, for an A/B between two
   trees: the share of a step lane changing costs at a fleet, the neighbour
   index off, two seeds, warmed. Usage: node tools/measure/lane-share.mjs [cars=300] */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const loaded = loadMap(testMap1());
const target = Number(process.argv[2] ?? 300);
const tick = (laneChanges, seed) => {
  let w = { ...seedGraph(seed, 50, loaded, { target, posted: true, laneChanges, keepRight: true }), noIndex: true };
  const ts = [];
  for (let i = 0; i < 20 * 60; i++) { const a = performance.now(); w = step(w); ts.push(performance.now() - a); }
  ts.sort((x, y) => x - y);
  return ts[ts.length >> 1];
};
tick(true, 1); tick(false, 1);
const on = [], off = [];
for (const seed of [3, 5]) { off.push(tick(false, seed)); on.push(tick(true, seed)); }
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`${target} cars: ${mean(off).toFixed(2)} -> ${mean(on).toFixed(2)} ms, lane changing ${((mean(on) / mean(off) - 1) * 100).toFixed(0)}%`);
