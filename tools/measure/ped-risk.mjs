/* How often people on foot are struck, by PED_RISK: the rate a person
   watching would see. Per hour of simulated time on the Pedestrians map
   (two crossroads and a mid-block crossing, 60 cars) -- the densest
   walking the game has. Run: node tools/measure/ped-risk.mjs [secs] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { testPeds } from "../../src/map/samples.js";
import { DT } from "../../src/sim/traffic.js";
const secs = Number(process.argv[2] ?? 600), CARS = Number(process.env.CARS ?? 60);
const seeds = process.argv.slice(3).map(Number); if (!seeds.length) seeds.push(3, 5, 7);
for (const [name, risk] of [["all careful", { trusting: 0, heedless: 0 }], ["5% trusting, 2% heedless", { trusting: 0.05, heedless: 0.02 }], ["15% trusting, 5% heedless", { trusting: 0.15, heedless: 0.05 }], ["30% trusting, 10% heedless", { trusting: 0.3, heedless: 0.1 }]]) {
  let struck = 0, across = 0, cars = 0, hard = 0, ticks = 0;
  for (const seed of seeds) {
    let w = { ...seedGraph(seed, 50, loadMap(testPeds()), { target: CARS, posted: true }), pedRisk: risk };
    for (let i = 0; i < secs / DT; i++) {
      const before = new Map((w.peds ?? []).map((q) => [q.id, q]));
      w = step(w);
      const now = new Set((w.peds ?? []).map((q) => q.id));
      for (const [id, q] of before) if (!now.has(id) && q.state === "crossing") across++;
      for (const a of w.actors) { ticks++; if (-(a.a ?? 0) > 3.5) hard++; }
    }
    struck += (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-")).length;
    cars += (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length;
  }
  const hours = (secs * seeds.length) / 3600;
  console.log(`${name.padEnd(26)}: ${(struck / hours).toFixed(1)} people struck an hour (${struck} in ${(hours * 60).toFixed(0)} min), ${across} across, car-car crashes ${cars}, hard-braking share ${(100 * hard / ticks).toFixed(2)}%`);
}
