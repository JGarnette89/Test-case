/* WHERE DOES A CAR FIRST APPEAR (14 November)? The lane it is placed in and how fast it wants to go, by road: if cars are placed uniformly across lanes the road starts UNSORTED by construction, and the only thing that sorts it is lane changing.
   Usage: node tools/measure/spawn-lanes.mjs <mapId> [cars] [seed=1] [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const [id, carsArg, seedArg = "1", secsArg = "300"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), cars = carsArg ? +carsArg : carsFor(loaded);
let w = seedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true, rivals: true, brakeReaction: true });
const seen = new Set(w.actors.map((a) => a.id)), byRoad = new Map();
for (let i = 0; i < (180 + +secsArg) * 20; i++) {
  w = step(w);
  for (const a of w.actors) {
    if (seen.has(a.id)) continue; seen.add(a.id);
    if (i < 3600) continue;   // after the warm-up only
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p?.from];
    if (!leg || (leg.across ?? leg.lanes ?? 1) < 2) continue;
    const key = `${leg.road} (${leg.across ?? leg.lanes} lanes)`;
    const r = byRoad.get(key) ?? byRoad.set(key, { n: 0, lanes: new Map(), v0: new Map() }).get(key);
    r.n++; r.lanes.set(leg.pos, (r.lanes.get(leg.pos) ?? 0) + 1); (r.v0.get(leg.pos) ?? r.v0.set(leg.pos, []).get(leg.pos)).push(a.v0 * 3.6);
  }
}
console.log(`${id}, ${cars} cars: where cars first appear on a multi-lane road (after warm-up), lane position (0 = inner): count, mean wanted speed`);
for (const [k, r] of [...byRoad.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8)) console.log(`  ${k}: ${r.n} cars -- ${[...r.lanes.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `lane ${p}: ${n} (${(r.v0.get(p).reduce((s, x) => s + x, 0) / n).toFixed(0)} km/h)`).join(", ")}`);
