/* WHERE GLANCES FALL (22 October, DECISIONS 10.19). For every tick a
   moving driver spends looking away, the situation they were in: inside a
   box; within 3 s of a stop line; following at under 2 s headway; or
   clear. And the same for the glance's length, to see whether the long
   glances are on clear road. The ruling: "a look away of that time would be
   coasting on a highway or at least a straight stretch".
   Usage: node tools/measure/glance-where.mjs [cars=260] [secs=120] [seed=1] [map=test-1] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, pathOf, whatStops } from "../../src/sim/crossing.js";
import { lookingAway } from "../../src/sim/attention.js";
import { DT } from "../../src/sim/traffic.js";
const [carsArg = "260", secsArg = "120", seedArg = "1", mapId = "test-1"] = process.argv.slice(2);
const raw = mapId === "test-1" ? null : TEST_MAPS.find((m) => m.id === mapId).build();
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), raw, null, true);
const tally = { box: [0, 0], line: [0, 0], following: [0, 0], clear: [0, 0] };
let moving = 0;
for (let i = 0; i < Number(secsArg) / DT; i++) {
  w = step(w);
  if (i < 200 || i % 4) continue;
  for (const a of w.actors) {
    if (a.player || !(a.v > 1) || !(a.lag > 0)) continue;
    moving++;
    if (!(lookingAway(w.t, a) > 0)) continue;
    const p = pathOf(w, a), v = whatStops(a, { ...w, noPeriphery: true });
    const where = a.s > p.stopAt && a.s < p.clearAt ? "box" : a.s <= p.stopAt && (p.stopAt - a.s) / a.v < 3 ? "line" : v.leader && v.gap / a.v < 2 ? "following" : "clear";
    tally[where][0]++;
    if (a.lag >= 1.5) tally[where][1]++;
  }
}
const all = Object.values(tally).reduce((s, x) => s + x[0], 0), long = Object.values(tally).reduce((s, x) => s + x[1], 0);
console.log(`moving driver-ticks ${moving}; looking away ${(100 * all / moving).toFixed(1)}% of them (${all}); by situation (all glances | glances of 1.5 s or more):`);
for (const [k, [n, l]] of Object.entries(tally)) console.log(`   ${k.padEnd(10)} ${(100 * n / Math.max(all, 1)).toFixed(0).padStart(3)}% | ${(100 * l / Math.max(long, 1)).toFixed(0).padStart(3)}%`);
