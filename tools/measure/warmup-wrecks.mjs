/* WRECKS STANDING AT t = 0 (12 November, DECISIONS 10.70): the independent witness for a warm-up crash now that `warmed()` drops the crash LIST. A crash in the warm-up leaves its cars standing as actors with `crash`
   set, whatever the list says, so counting those at t = 0 finds the warm-up's crashes after the fix as well as before it. Usage: node tools/measure/warmup-wrecks.mjs MAP CARS FIRST LAST. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph } from "../../src/sim/crossing.js";
const [mapId = "test-loop", cars = "300", a = "11", b = "50"] = process.argv.slice(2);
const per = {};
for (let seed = +a; seed <= +b; seed++) {
  const w = seedGraph(seed, 50, loadMap(TEST_MAPS.find((m) => m.id === mapId).build()), { target: +cars, ...(process.env.MERGETOL ? { mergeTolerance: +process.env.MERGETOL } : {}), posted: true, perceive: false, brakeReaction: true, walkers: true, rivals: true });
  const n = w.actors.filter((x) => x.crash).length; if (n) per[seed] = { wrecksAtT0: n, listAtT0: (w.crashes ?? []).length };
}
console.log(JSON.stringify({ mergeTolerance: process.env.MERGETOL ?? null, map: mapId, cars: +cars, seeds: `${a}..${b}`, seedsWithAWreckAtT0: per }));
