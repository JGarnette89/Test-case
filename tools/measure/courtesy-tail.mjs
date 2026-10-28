/* THE COURTESY TAIL, PER SEED (28 October; verify-merge section 3 with the
   candidate's checks on found 1 wait of 20 s or more without courtesy where
   it needs 4). verify-merge's own trials -- the endless highway, 150 cars,
   the player stopped at the taper of every on-ramp at 120 s and 165 s,
   with courtesy and without (stranded.mjs strandTrial) -- for ONE seed,
   checks off or on; prints the waits so seeds can be pooled. A tail wait is
   one of 20 s or more without courtesy, the check's own threshold.
   Usage: node tools/measure/courtesy-tail.mjs seed checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { strandTrial } from "./stranded.mjs";
const [seed, chk] = process.argv.slice(2).map(Number);
const loaded = loadMap(testLoop());
let base = seedGraph(seed, 50, loaded, { target: 150, posted: true, checks: chk === 1 });
const trials = [];
for (const at of [120, 165]) {
  while (base.t < at) base = step(base);
  for (let k = 0; k < base.course.at.length; k++) {
    const L = base.course.at[k].layout;
    for (const [r, p] of Object.entries(L.paths)) {
      if (!L.legs[p.to]?.accel || !L.legs[p.from]?.road?.startsWith("on-")) continue;
      trials.push({ at, k, r, on: strandTrial(base, k, r, true), off: strandTrial(base, k, r, false) });
    }
  }
}
const fin = (x) => (isFinite(x) ? x : 120);
console.log(JSON.stringify({ seed, checks: chk, trials: trials.length, tail: trials.filter((t) => fin(t.off) >= 20).length, waits: trials.map((t) => [+fin(t.off).toFixed(1), +fin(t.on).toFixed(1)]) }));
