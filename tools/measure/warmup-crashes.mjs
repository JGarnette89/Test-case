/* HOW MANY OF A CRASH PROBE'S COUNTED CRASHES HAPPENED IN THE WARM-UP? (12 November, DECISIONS 10.70.) `seedGraph` warms a world and puts the clock back to zero but leaves `w.crashes` as it was, so a probe that
   counts `w.crashes` at the end counts the warm-up's crashes as well as the measured 180 s. This prints, per cell, the car-car crashes already in the list at t = 0, before one measured step.
   Usage: node tools/measure/warmup-crashes.mjs MAP CARS PLAYED(0|1) [seeds=6]. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph } from "../../src/sim/crossing.js";
const [mapId = "test-loop", cars = "260", played = "1", n = "6"] = process.argv.slice(2), pl = played === "1";
const per = [];
for (let seed = 1; seed <= +n; seed++) {
  const w = seedGraph(seed, 50, loadMap(TEST_MAPS.find((m) => m.id === mapId).build()), { target: +cars, posted: true, perceive: false, brakeReaction: true, ...(pl ? { walkers: true, rivals: true } : {}) });
  per.push((w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-")).length);
}
console.log(JSON.stringify({ map: mapId, cars: +cars, played: pl, crashesAtT0PerSeed: per, total: per.reduce((a, b) => a + b, 0) }));
