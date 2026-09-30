/* Hard braking and crashes in a car-only city: how often a driver brakes
   harder than HARSH_AT, and how many crashes, per car-hour.
   Run: node tools/measure/seam-brake.mjs [secs] [cars] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, DT } from "../../src/sim/crossing.js";
import { HARSH_AT } from "../../src/sim/traffic.js";
const [secs = 300, cars = 200, ...seeds] = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(3, 5);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
let harsh = 0, hardest = 0, ticks = 0, crashes = 0;
for (const seed of seeds) {
  let w = seedGraph(seed, 50, city, { target: cars, posted: true, trucks: 0 });
  const was = new Set();
  for (let i = 0; i < secs / DT; i++) {
    w = step(w);
    for (const a of w.actors) {
      if (a.player || a.crash) continue;
      ticks++;
      const h = (a.a ?? 0) < -HARSH_AT;
      if (h && !was.has(a.id)) harsh++;
      if (h) was.add(a.id); else was.delete(a.id);
      hardest = Math.min(hardest, a.a ?? 0);
    }
  }
  crashes += (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length;
}
const hours = (ticks * DT) / 3600;
console.log(`${hours.toFixed(1)} car-hours: harsh braking episodes ${(harsh / hours).toFixed(1)} per car-hour, hardest ${hardest.toFixed(1)} m/s2, car crashes ${crashes} (${(crashes / hours).toFixed(2)} per car-hour)`);
