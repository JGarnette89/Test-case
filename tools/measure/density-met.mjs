/* WHAT DOES THE PLAYER MEET AT THE DIAL'S SETTING (Jay, 14 November: "very little traffic moving in my direction on the 110 highway at 260 cars ... maybe came across 2 cars")?
   The good driver (tools/lib/good-driver.mjs) drives the map for `secs` seconds at the count asked, shaping forced ON or OFF (tools/lib/shape-drive.mjs), and reports what the player met (src/sim/encounters.js); also how many cars the world actually holds at the end,
   and where they are: by carriageway and per km. cars/lane-km is the dial's real meaning on this map.
   Usage: node tools/measure/density-met.mjs <mapId> <cars> <shape 0|1> [seed=1] [secs=240] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { loadMap } from "../../src/map/load.js";
import { drive } from "../lib/shape-drive.mjs";
const [id, carsArg, shapeArg, seedArg = "1", secsArg = "240"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build(), L = loadMap(raw), cars = +carsArg;
const out = drive({ raw, cars, seed: +seedArg, secs: +secsArg, shape: shapeArg === "1", pace: 1.19, overtake: true });
const e = out.enc;
console.log(`${id}, ${cars} cars asked (${(cars / L.laneKm).toFixed(2)} per lane-km, standard 4.21), shaping ${shapeArg === "1" ? "ON" : "OFF"}, seed ${seedArg}, ${secsArg} s driven by the good driver at 1.19x the traffic's pace:`);
console.log(`  met a minute ${e.metPerMin}; overtaken by the player a minute ${e.overtookPerMin}; following ${e.followingShare}% of the time; followed ${e.followedShare}%; gaps judged a minute ${e.gapsPerMin ?? "?"}; placed ${out.placed}, retired ${out.retired}, crashes ${out.crashes}`);
console.log("  " + JSON.stringify(e).slice(0, 400));
