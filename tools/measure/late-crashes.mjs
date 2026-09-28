/* Why traffic that perceives the world late crashes so often: every crash
   in a few minutes of heavy traffic with `perceive: true` (everybody's own
   lag), classified. Run: node tools/measure/late-crashes.mjs [minutes] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, pathOf, DT } from "../../src/sim/crossing.js";
import { deficitOf } from "../../src/core/driver.js";

const minutes = Number(process.argv[2]) || 3;
for (const [id, cars] of [["test-1", 150], ["city", 250]]) {
  const loaded = loadMap(TEST_MAPS.find((t) => t.id === id).build());
  let w = seedGraph(3, 50, loaded, { target: cars, posted: true, perceive: true });
  const kinds = {}, rows = [];
  let seen = 0;
  for (let i = 0; i < (minutes * 60) / DT; i++) {
    const before = w;
    w = step(w);
    const log = w.crashes ?? [];
    for (const c of log.slice(seen)) {
      const was = (x) => before.actors.find((q) => q.id === x);
      const A = was(c.a), B = was(c.b);
      if (!A || !B) { kinds.other = (kinds.other ?? 0) + 1; continue; }
      const pa = pathOf(before, A), pb = pathOf(before, B);
      const wreck = A.crash || B.crash;
      const sameLane = (A.k === B.k && pa.from === pb.from) || pa.laneIn.id === pb.laneOut?.id || pb.laneIn.id === pa.laneOut?.id || pa.laneIn.id === pb.laneIn.id;
      const inBox = (x, p) => x.s > p.stopAt && x.s < p.clearAt;
      const kind = wreck ? "into a wreck" : A.lc || B.lc ? "lane change" : sameLane && !inBox(A, pa) && !inBox(B, pb) ? "rear-end" : "in the intersection";
      kinds[kind] = (kinds[kind] ?? 0) + 1;
      const behind = A.s < B.s ? A : B;
      rows.push(`${kind.padEnd(20)} v ${A.v.toFixed(1)}/${B.v.toFixed(1)} lag ${(A.lag ?? 0).toFixed(2)}/${(B.lag ?? 0).toFixed(2)} obs-deficit ${deficitOf(A.ratings, "observation").deficit.toFixed(2)}/${deficitOf(B.ratings, "observation").deficit.toFixed(2)} headway ${(behind.headway ?? 0).toFixed(2)}`);
    }
    seen = log.length;
  }
  console.log(`\n${id}, ${cars} cars, ${minutes} min, everybody perceiving late: ${seen} crashes`, kinds);
  for (const r of rows.slice(0, 12)) console.log("  " + r);
}
