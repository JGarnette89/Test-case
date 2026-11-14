/* DOES A LONGER HOLD BUY A FASTER TRY (the lead, 14 November)? Per car-second held (headway under 2 s, under 90% of wanted, through traffic on multi-lane road), bucketed by how long that car has been CONTINUOUSLY held: how often a discretionary lane change begins. If the rate is the same at 20 s as at 2 s, pressure does not raise the rate of trying.
   Also, for each held car, whether the adjacent lanes had anywhere faster to go (a car in the next lane, within 4 s of its wanted speed ahead, slower than the car's own leader would mean no gain).
   Usage: node tools/measure/held-rate.mjs <mapId> [cars] [seed=1] [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const [id, carsArg, seedArg = "1", secsArg = "300"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), cars = carsArg ? +carsArg : carsFor(loaded);
let w = seedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true, rivals: true, brakeReaction: true });
for (let i = 0; i < 3600; i++) w = step(w);
const edges = [0, 2, 5, 10, 20, 40, Infinity], secs = edges.slice(1).map(() => 0), starts = edges.slice(1).map(() => 0), since = new Map();
const bucket = (d) => edges.findIndex((e, i) => i > 0 && d < e) - 1;
for (let i = 0; i < +secsArg * 20; i++) {
  const before = w; w = step(w);
  const nowHeld = new Set();
  for (const a of w.actors) {
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p?.from];
    if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > p.stopAt || a.crash || /^offb?-/.test(L.legs[p.to]?.road ?? "")) continue;
    const held = a.headway != null && a.v < 0.9 * a.v0 && a.headway / Math.max(a.v, 1) < 2;
    if (held) { nowHeld.add(a.id); if (!since.has(a.id)) since.set(a.id, w.t); }
    const was = before.actors.find((b) => b.id === a.id);
    const startedChange = a.lc && a.lc.at === before.t && !a.lc.abort && !(a.keptRight !== was?.keptRight) && !(was?.want && was.want.k === was.k);
    if (since.has(a.id) || startedChange) {
      const d = since.has(a.id) ? w.t - since.get(a.id) : 0, b = bucket(d);
      if (i % 20 === 0 && held) secs[b]++;
      if (startedChange && b >= 0) starts[b]++;
    }
  }
  for (const id2 of [...since.keys()]) if (!nowHeld.has(id2)) since.delete(id2);
}
console.log(`${id}, ${cars} cars: discretionary lane changes begun per HELD car-minute, by how long the car had been continuously held`);
edges.slice(0, -1).forEach((e, i) => console.log(`  held ${String(e).padStart(2)}-${edges[i + 1] === Infinity ? "..." : String(edges[i + 1]).padStart(3)} s: ${secs[i]} held car-seconds, ${starts[i]} changes begun -> ${(60 * starts[i] / Math.max(1, secs[i])).toFixed(2)} per held car-minute`));
