/* How fast a map fills to its car count, and how many places it has to
   fill from (edges plus district curb lanes). Run: node tools/measure/fill.mjs */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step, edgesOf, districtStreetsOf } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";

for (const id of ["test-1", "city"]) {
  const m = loadMap(TEST_MAPS.find((t) => t.id === id).build());
  let w = seedGraph(1, 50, m, { every: 2, target: carsFor(m), posted: true });
  const e = edgesOf(w.course).length, d = districtStreetsOf(w.course).length;
  const row = [];
  for (let i = 0; i <= 60 / DT; i++) {
    if (i % (5 / DT) === 0) row.push(`${(i * DT).toFixed(0)}s ${w.actors.length}`);
    w = step(w);
  }
  console.log(`${id}: target ${carsFor(m)}, ${m.laneKm.toFixed(1)} lane-km, ${e} edges, ${d} district lanes\n  ${row.join(" | ")}`);
}
