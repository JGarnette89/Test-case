/* How much one sim step costs on a city, and where it goes.

   The stand-in city (map/samples.js testCity0) with its districts filled
   (streets and buildings), run at several car counts. Reports the mean and
   the 95th-percentile step time after warm-up, and -- by timing the step
   with the per-car neighbour scan (`whatStops`) wrapped -- how much of it
   is that scan, which reads every other car on the map for every car.

   Desk-machine numbers; the phone is several times slower, and 20 Hz gives
   a step 50 ms of which the renderer needs most. Run:
     node tools/measure/city-perf.mjs [cars...]   default 100 200 300 */
import { loadMap } from "../../src/map/load.js";
import { testCity0 } from "../../src/map/samples.js";
import { fillZone, fillLots } from "../../src/map/generate.js";
import * as crossing from "../../src/sim/crossing.js";

const counts = process.argv.slice(2).map(Number).filter(Boolean);
let m = testCity0();
for (const z of ["west", "east"]) m = fillZone(m, z).map;
for (const z of ["west", "east"]) m = fillLots(m, z).map;
const L = loadMap(m);
console.log(`stand-in city: ${L.nodes.length} intersections, ${L.roads.length} road pieces`);

for (const n of counts.length ? counts : [100, 200, 300]) {
  let w = crossing.seedGraph(1, 60, L, { target: n, posted: true });
  for (let i = 0; i < 600; i++) w = crossing.step(w);          // 30 s to fill
  const times = [];
  let scan = 0;
  for (let i = 0; i < 400; i++) {
    const t0 = performance.now();
    w = crossing.step(w);
    times.push(performance.now() - t0);
  }
  /* The scan on its own: every car's whatStops over the same world. */
  const t1 = performance.now();
  for (let r = 0; r < 20; r++) for (const a of w.actors) if (!a.player) crossing.whatStops(a, w);
  scan = (performance.now() - t1) / 20;
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  console.log(`${String(w.actors.length).padStart(4)} cars: step mean ${mean.toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms; the neighbour scan alone ${scan.toFixed(2)} ms (${Math.round((scan / mean) * 100)}%)`);
}
