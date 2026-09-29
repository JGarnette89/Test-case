/* Who rolls stops and who keeps right, before and after the knowledge/
   compliance split, over the same drawn drivers (driver() in traffic.js).
   Run: node tools/measure/comply-pop.mjs [n] */
import { driver } from "../../src/sim/traffic.js";
import { deficitOf, cautionOf, LACKING_AT, knows } from "../../src/core/driver.js";
const N = Number(process.argv[2] ?? 4000), road = { speed: 13.9 };
let old = 0, always = 0, unwatched = 0, krUnknown = 0, krLax = 0;
for (let n = 0; n < N; n++) {
  const d = driver(road, 1, n);
  const bold = Math.max(0, 1 - cautionOf(d.ratings));
  if (0.7 * deficitOf(d.ratings, "knowledge").deficit + 0.3 * bold > LACKING_AT) old++;
  if (d.rollsStops === "always") always++;
  if (d.rollsStops === "unwatched") unwatched++;
  if (!knows(d, "keepRight")) krUnknown++;
  else if (deficitOf(d.ratings, "compliance").deficit > 0.5) krLax++;
}
const pc = (x) => `${(100 * x / N).toFixed(1)}%`;
console.log(`${N} drivers: rolled stops before the split ${pc(old)}; now ${pc(always)} always (do not know) + ${pc(unwatched)} when nobody is about (do not care)`);
console.log(`keep right: ${pc(krUnknown)} do not know the rule, ${pc(krLax)} know it and are lax (compliance deficit > 0.5)`);
