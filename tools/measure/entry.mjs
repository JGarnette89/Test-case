/* ACCELERATION LANE AGAINST YIELD SIGN, same map, same code, same seeds
   (21 October): the endless highway as built, the same map with each
   entrance's acceleration lane taken away and its slip road given a yield
   sign -- the entry the maintainer drove -- and the acceleration lanes with
   merge courtesy switched off. Per density, the mean over seeds: cars on
   the highway (not entering), cars entering (on a slip road or still in an
   acceleration lane), car-seconds standing to enter, joins per minute, and
   crashes.
   Usage: node tools/measure/entry.mjs [cars=150,300] [seconds=240] [seeds=1,2,3] [variants=yield,accel,accel-nocourtesy] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";

const [carsArg = "150,300", secsArg = "240", seedArg = "1,2,3", varArg = "yield,accel,accel-nocourtesy"] = process.argv.slice(2);
const seeds = seedArg.split(",").map(Number), variants = varArg.split(","), secs = Number(secsArg);
const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
const asYield = JSON.parse(JSON.stringify(raw));
for (const r of asYield.roads) { delete r.accel; if (r.id.startsWith("on-")) r.control = { start: "none", end: "yield" }; }
const maps = { accel: loadMap(raw), "accel-nocourtesy": loadMap(raw), yield: loadMap(asYield) };

const enteringOf = (w, a) => {
  const L = w.course.at[a.k].layout, p = L.paths[a.route], from = L.legs[p.from], to = L.legs[p.to];
  return (from?.road?.startsWith("on-") && a.s <= p.clearAt) || (to?.accel && a.s > p.clearAt);
};
for (const cars of carsArg.split(",").map(Number)) {
  console.log(`${cars} cars, ${secs} s, mean of seeds ${seeds.join(",")}:`);
  for (const name of variants) {
    const sum = { highway: 0, entering: 0, standing: 0, joins: 0, crashes: 0 };
    for (const seed of seeds) {
      let w = seedGraph(seed, 50, maps[name], { every: 2.0, target: cars, posted: true });
      if (name.endsWith("nocourtesy")) w = { ...w, courtesy: false };
      for (let i = 0; i < 1200; i++) w = step(w);
      const c0 = (w.crashes ?? []).length;
      let samples = 0;
      for (let i = 0; i < secs * 20; i++) {
        const before = w;
        w = step(w);
        const was = new Map(before.actors.map((a) => [a.id, enteringOf(before, a)]));
        for (const a of w.actors) {
          const e = enteringOf(w, a);
          if (e && a.v < 0.5) sum.standing += 0.05;
          if (was.get(a.id) === true && !e) sum.joins++;
          if (i % 20 === 0) { if (e) sum.entering++; else sum.highway++; }
        }
        if (i % 20 === 0) samples++;
      }
      sum.crashes += (w.crashes ?? []).length - c0;
      sum.samples = (sum.samples ?? 0) + samples;
    }
    const n = seeds.length;
    console.log(`  ${name.padEnd(17)} ${(sum.highway / sum.samples).toFixed(0)} on the highway, ${(sum.entering / sum.samples).toFixed(0)} entering, ${(sum.standing / n).toFixed(0)} car-s standing to enter, ${(sum.joins / n / (secs / 60)).toFixed(1)} joins/min, ${sum.crashes} crashes`);
  }
}
