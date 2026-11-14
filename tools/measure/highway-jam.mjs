/* WHAT IS THE SLOW STRETCH ON THE WIDE ROAD (14 November: 7,500 car-seconds held at 47-50 km/h on the 80 km/h stretch)? A wreck standing in a lane is the leading candidate.
   Every 5 s: wrecks standing (crashed actors), slow cars (under 20 km/h) by posted-limit band of the road they are on, and which roads/where the slow ones are; then each crash's time, place and the road.
   Usage: node tools/measure/highway-jam.mjs [mapId=test-highway-gen-wide] [cars=890] [seed=1] [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
/* THE PLAYED WORLD, stated here so this script stands on its own: what worldFor (scene.js) turns on. */
const playedGraph = (seed, kmh, loaded, o = {}) => seedGraph(seed, kmh, loaded, { posted: true, walkers: true, rivals: true, brakeReaction: true, ...o });
const [id = "test-highway-gen-wide", carsArg = "890", seedArg = "1", secsArg = "300"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build(), L = loadMap(raw);
const lim = new Map(raw.roads.map((r) => [r.id, r.speed ?? 100]));
let w = playedGraph(+seedArg, 50, L, { every: 2.0, target: +carsArg });
for (let i = 0; i < 3600; i++) w = step(w);
const t0 = w.t, hist = [];
for (let i = 0; i < +secsArg * 20; i++) {
  w = step(w);
  if (i % 100) continue;
  const slow = new Map(); let wrecks = 0;
  for (const a of w.actors) {
    if (a.crash) wrecks++;
    const leg = w.course.at[a.k ?? 0].layout.legs[w.course.at[a.k ?? 0].layout.paths[a.route]?.from];
    if (!leg || !leg.road) continue;
    if (a.v * 3.6 < 20 && !a.crash) slow.set(leg.road, (slow.get(leg.road) ?? 0) + 1);
  }
  hist.push({ t: Math.round(w.t - t0), wrecks, slow: [...slow.entries()].filter(([, n]) => n >= 3).map(([r, n]) => `${r}(${lim.get(r)}):${n}`).join(" ") });
}
console.log(`${id}, ${carsArg} cars, seed ${seedArg}`);
for (const h of hist.filter((_, i) => i % 3 === 0)) console.log(`t+${String(h.t).padStart(3)} s  wrecks ${h.wrecks}  roads with 3+ cars under 20 km/h: ${h.slow || "-"}`);
console.log("crashes:", (w.crashes ?? []).map((c) => `t+${Math.round(c.t - t0)} ${c.a}x${c.b} at (${Math.round(c.at?.x)},${Math.round(c.at?.y)})`).join("; "));
