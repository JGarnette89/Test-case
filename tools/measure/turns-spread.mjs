/* THE SPREAD OF verify-lanes' TURN FIGURE (28 October; the maintainer asked
   for the margin and floor to be set from measured variance, not picked).
   verify-lanes 4b pools three seeds of test map 1 at 200 cars for 150 s and
   asserts the share of drivers in the wrong lane for their turn who got over
   and made it. This runs that same world -- the same counting: every driver
   seen in the window, turnsMet against turnsMet + missedTurns -- for one
   seed, checks off or on, and prints the counts so seeds can be pooled.
   Usage: node tools/measure/turns-spread.mjs seed checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const [seed, chk] = process.argv.slice(2).map(Number);
let w = seedGraph(seed, 50, loadMap(testMap1()), { target: 200, posted: true, checks: chk === 1 });
const drivers = new Map();
for (let i = 0; i < 150 * 20; i++) { w = step(w); for (const a of w.actors) drivers.set(a.id, a); }
const d = [...drivers.values()];
const met = d.reduce((s, x) => s + (x.turnsMet ?? 0), 0), missed = d.reduce((s, x) => s + (x.missedTurns ?? 0), 0);
console.log(JSON.stringify({ seed, checks: chk, met, need: met + missed }));
