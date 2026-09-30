/* What trucks hiding things costs and changes: the city with trucks
   opaque, against the same city with them see-through (`seeThrough`, a
   controlled comparison), at a raised truck share so there is something
   to measure. Crashes (car-car, and people struck), and how often a driver
   at a line was held by nothing but what a truck might be hiding.
   Run: node tools/measure/truck-sight.mjs [secs] [share] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, whatStops, DT } from "../../src/sim/crossing.js";
const [secs = 300, share = 0.15, ...seeds] = process.argv.slice(2).map(Number);
if (!seeds.length) seeds.push(3, 5);
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
for (const opaque of [false, true]) {
  let crashes = 0, struck = 0, withTruck = 0, heldTicks = 0, carTicks = 0;
  for (const seed of seeds) {
    let w = { ...seedGraph(seed, 50, city, { target: 200, posted: true, trucks: share }), seeThrough: !opaque };
    for (let i = 0; i < secs / DT; i++) {
      w = step(w);
      if (i % 10 === 0) for (const a of w.actors) { if (a.player || a.crash) continue; carTicks++; const v = whatStops(a, w); if (v.held) heldTicks++; }
    }
    const byId = new Map(w.actors.map((a) => [a.id, a]));
    for (const c of w.crashes ?? []) {
      if (String(c.a).startsWith("ped-")) { struck++; continue; }
      crashes++;
      if ([c.a, c.b].some((id) => byId.get(id)?.kind === "truck")) withTruck++;
    }
  }
  console.log(`${opaque ? "opaque" : "see-through"}: ${crashes} crashes (${withTruck} with a truck), ${struck} people struck, drivers held at a line ${(100 * heldTicks / carTicks).toFixed(1)}% of sampled ticks -- ${seeds.length} x ${secs}s, ${share * 100}% trucks`);
}
