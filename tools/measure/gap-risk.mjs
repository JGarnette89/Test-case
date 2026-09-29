/* Mid-block crossings on the city: how many people cross, how many are
   struck, how drivers react -- per hour of city time, by rate and heedless
   share. Run: node tools/measure/gap-risk.mjs [secs] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const secs = Number(process.argv[2] ?? 300);
const seeds = process.argv.slice(3).map(Number); if (!seeds.length) seeds.push(3);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
for (const [rate, heed, perceive] of (process.env.CASES ? JSON.parse(process.env.CASES) : [[30, 0.25, false], [30, 0.25, true]])) {
  let struck = 0, across = 0, carCrash = 0, spawned = 0, ms = 0;
  for (const seed of seeds) {
    let w = seedGraph(seed, 50, city, { target: 300, posted: true, perceive, gapRate: rate, gapHeedless: heed });
    const seen = new Set();
    const t0 = performance.now();
    for (let i = 0; i < secs / DT; i++) {
      const before = new Map((w.peds ?? []).map((q) => [q.id, q]));
      w = step(w);
      for (const q of w.peds ?? []) seen.add(q.id);
      const now = new Set((w.peds ?? []).map((q) => q.id));
      for (const [id, q] of before) if (!now.has(id) && q.state === "crossing") across++;
    }
    ms += (performance.now() - t0) / (secs / DT);
    spawned += seen.size;
    struck += (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-")).length;
    carCrash += (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length;
  }
  const hours = (secs * seeds.length) / 3600;
  console.log(`rate ${rate}/km/h, ${heed * 100}% heedless, look-away ${perceive ? "on" : "off"}: ${(spawned / hours).toFixed(0)} people an hour, ${(across / hours).toFixed(0)} across, ${(struck / hours).toFixed(1)} struck an hour, car-car ${(carCrash / hours).toFixed(1)} an hour, ${(ms / seeds.length).toFixed(1)} ms a step`);
}
