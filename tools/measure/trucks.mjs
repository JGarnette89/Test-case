/* Trucks in traffic: pull-away, speed against the limit, where they stop,
   and crashes, against the cars in the same world.
   Run: node tools/measure/trucks.mjs [secs] [cars] [share] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, pathOf, layoutOf, DT } from "../../src/sim/crossing.js";
import { postedAt } from "../../src/sim/graph.js";
import { lenOf } from "../../src/sim/traffic.js";
const [secs = 600, cars = 200, share = 0.06, ...seeds] = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(3);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
const stat = { car: { pull: [], over: 0, ticks: 0, noseOff: [] }, truck: { pull: [], over: 0, ticks: 0, noseOff: [] } };
let crashes = 0, withTruck = 0, vehTicks = { car: 0, truck: 0 };
for (const seed of seeds) {
  let w = seedGraph(seed, 50, city, { target: cars, posted: true, trucks: share });
  const from = new Map();
  for (let i = 0; i < secs / DT; i++) {
    w = step(w);
    for (const c of (w.crashes ?? []).filter((c) => Math.abs(c.t - w.t) < 1e-9)) { crashes++; if ([c.a, c.b].some((id) => w.actors.find((a) => a.id === id)?.kind === "truck")) withTruck++; }
    for (const a of w.actors) {
      if (a.player || a.crash) continue;
      const k = a.kind === "truck" ? "truck" : "car", S = stat[k];
      vehTicks[k]++;
      const lim = postedAt(w.course, a.k, a.route);
      if (lim) { S.ticks++; if (a.v > lim * 1.02) S.over++; }
      const p = pathOf(w, a);
      if (a.v < 0.05 && a.stoppedAt != null && !a.going && layoutOf(w, a).place.control[p.from] === "stop") S.noseOff.push(a.s + lenOf(a) / 2 - p.stopAt);
      if (a.v < 0.05) from.set(a.id, w.t);
      else if (from.has(a.id) && a.v > 30 / 3.6) { S.pull.push(w.t - from.get(a.id)); from.delete(a.id); }
    }
  }
}
const med = (xs) => { const q = [...xs].sort((a, b) => a - b); return q.length ? q[q.length >> 1] : NaN; };
for (const k of ["car", "truck"]) {
  const S = stat[k];
  console.log(`${k}: ${(vehTicks[k] * DT / 3600).toFixed(1)} vehicle-hours; from rest to 30 km/h median ${med(S.pull).toFixed(1)} s (${S.pull.length}); over the limit ${(100 * S.over / Math.max(1, S.ticks)).toFixed(1)}% of the time; nose at a stop line ${med(S.noseOff).toFixed(2)} m from it (${S.noseOff.length} ticks, range ${Math.min(...S.noseOff).toFixed(2)}..${Math.max(...S.noseOff).toFixed(2)})`);
}
console.log(`crashes ${crashes}, ${withTruck} involving a truck; per vehicle-hour: cars ${((crashes - withTruck) / (vehTicks.car * DT / 3600)).toFixed(2)}, trucks ${(withTruck / Math.max(1e-9, vehTicks.truck * DT / 3600)).toFixed(2)}`);
