/* What lane changing costs a sim step, in milliseconds and as a share,
   with the neighbour index on and off -- the controlled comparison
   verify-lanes section 6 makes, on its map (the test map), its seeds and
   its method (median tick over a minute), run both ways.
   node tools/measure/lane-cost.mjs */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";

const loaded = loadMap(testMap1());
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const tick = (target, laneChanges, seed, noIndex) => {
  let w = { ...seedGraph(seed, 50, loaded, { target, posted: true, laneChanges }), noIndex };
  const ts = [];
  for (let i = 0; i < 20 * 60; i++) { const a = performance.now(); w = step(w); ts.push(performance.now() - a); }
  ts.sort((x, y) => x - y);
  return ts[ts.length >> 1];
};
tick(120, true, 1, false); tick(120, false, 1, false);
for (const noIndex of [true, false]) {
  for (const target of [120, 300]) {
    const on = [], off = [];
    for (const seed of [3, 5]) { off.push(tick(target, false, seed, noIndex)); on.push(tick(target, true, seed, noIndex)); }
    console.log(`${noIndex ? "scan everybody" : "neighbour index"}  ${target} cars: without lane changes ${mean(off).toFixed(2)} ms, with ${mean(on).toFixed(2)} ms -- lane changing adds ${(mean(on) - mean(off)).toFixed(2)} ms (${((mean(on) / mean(off) - 1) * 100).toFixed(0)}%)`);
  }
}
