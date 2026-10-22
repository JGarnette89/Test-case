/* DENSITY SHAPING ON THE CITY, through the same gates as the highway (tools/lib/shape-drive.mjs; DECISIONS 10.17).
   The city is the gaps-judged venue (DECISIONS 10.23): reported on its own, never averaged with the highway.
   Usage: node tools/measure/shape-city.mjs [cars=default] [secs=300] [seeds=1,2] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { drive } from "../lib/shape-drive.mjs";
const [carsArg = "default", secsArg = "300", seedArg = "1,2"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === "city").build();
const cars = carsArg === "default" ? null : Number(carsArg);
for (const seed of seedArg.split(",").map(Number)) {
  for (const shape of [false, true]) {
    const r = drive({ raw, cars, seed, secs: Number(secsArg), shape, trips: true, ...(process.env.STYLE === "keep-right" ? { pace: 0.95, overtake: false } : {}), extra: { ...(process.env.AHEAD ? { shapeAhead: Number(process.env.AHEAD) } : {}), ...(process.env.BEHIND ? { shapeBehind: Number(process.env.BEHIND) } : {}) } });
    const e = r.enc;
    console.log(`city seed ${seed} shaping ${shape ? "on " : "off"}: met ${e.metPerMin}/min, gaps judged ${e.gapsPerMin}/min, following ${e.followingShare}%, followed ${e.followedShare}% | placed ${r.placed}, gone ${r.retired}, near events ${r.nearEvents.length}${r.nearEvents.length ? ` (${r.nearEvents.slice(0, 3).join("; ")})` : ""}, placed in a crash ${r.placedCrash}, jolted ${r.jolted}, crashes ${r.crashes}`);
  }
}
