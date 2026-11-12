/* WHICH SWITCH MAKES THE TRAFFIC CRASH? (12 November, DECISIONS 10.70.) The ordinary world (`worldFor`: brake reaction ON, perception off) crashes about 1.4 times in three minutes on test map 1 at 260 cars; the world
   `verify-crashes` calls "where crashes happen" (`seedGraph` with `perceive: true`, brake reaction OFF by default) crashes about never. This runs the 2 x 2 of the two switches and nothing else:
   test map 1, 260 cars, 180 s, no player, no checks. Usage: PERC=0|1 BR=0|1 node tools/measure/crash-matrix.mjs [seed]. Prints one line: crashes between vehicles. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const seed = +(process.argv[2] ?? 1), perc = process.env.PERC === "1", br = process.env.BR === "1", mapId = process.env.MAP ?? "test-1", cars0 = +(process.env.CARS ?? 260);   // MAP and CARS: the density sweep
let w = seedGraph(seed, 50, loadMap(TEST_MAPS.find((m) => m.id === mapId).build()), { target: cars0, posted: true, perceive: perc, brakeReaction: br });
for (let i = 0; i < 180 / DT; i++) w = step(w);
const cars = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-"));
console.log(JSON.stringify({ map: mapId, cars: cars0, perceive: perc, brakeReaction: br, seed, crashes: cars.length, people: (w.crashes ?? []).length - cars.length }));
