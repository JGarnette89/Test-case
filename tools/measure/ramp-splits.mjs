/* verify-promotion's queue case asks for a placed car that the lane index files
   under another lane while it physically shares one with a car beside the same
   approach. After IN FLIGHT 38 that exists only between a route's box and its
   split. Is there such a stretch on the endless highway, how long, and does the
   queue rule refuse there and nowhere past it? (4 November.) */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, poseOf, whatStops, pathOf } from "../../src/sim/crossing.js";
import { admissible, placeOf } from "../../src/sim/placement.js";
import { splitOf, sharesLane } from "../../src/sim/occupancy.js";

const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(1, 50, loaded, { every: 2.0, target: 160, posted: true });
for (let i = 0; i < 1200; i++) w = step(w);
const rows = [];
w.course.at.forEach((n, k) => {
  const L = n.layout;
  for (const [r, p] of Object.entries(L.paths)) {
    const toRoad = L.legs[p.to]?.road;
    if (!toRoad?.startsWith("off-")) continue;
    for (const [r2, q] of Object.entries(L.paths)) {
      if (r2 === r || q.from !== p.from) continue;
      const sp = splitOf(L, r2, r);
      rows.push({ k, ramp: r, through: r2, stopAt: +p.stopAt.toFixed(1), clearRamp: +p.clearAt.toFixed(1), clearThrough: +q.clearAt.toFixed(1), splitRamp: +sp.b.toFixed(1), splitThrough: +sp.a.toFixed(1), rampLen: +p.length.toFixed(0), thruToRoad: L.legs[q.to]?.road });
    }
  }
});
console.table(rows);
const stretches = rows.map((r) => r.splitRamp - r.clearRamp);
console.log("stretch between the ramp's box and its split, m:", Math.min(...stretches).toFixed(1), "to", Math.max(...stretches).toFixed(1));
