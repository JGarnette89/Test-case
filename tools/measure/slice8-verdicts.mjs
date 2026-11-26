/* The verdict of every pooled seed (oracle, eager, creep) and every hazard seed (no stop, and STOP at REACTION_FLOOR + 0.5 s), made on the CODE IT IS RUN
   ON. Slice 9's baseline, tools/lib/slice8-verdicts.json, was made by running this on commit 31a9d3d (slice 8, before the boost):
     node tools/measure/slice8-verdicts.mjs tools/lib/slice8-verdicts.json
   verify-rounds section 21 compares the boosted code with it. [instrument] */
import { writeFileSync } from "node:fs";
import { TYPES } from "../../src/game/rounds.js";
import { driveDecision, oracle, eager, creep } from "../lib/round-drive.mjs";
import { hazardRun } from "../lib/hazard-drive.mjs";
import { REACTION_FLOOR } from "../../src/core/perception.js";

export const summary = (r) => {
  const v = r.verdict;
  return { end: r.rs.end?.why, stars: v.stars, faults: v.faults.map((f) => f.id).sort().join(","), praise: v.praise.map((f) => f.id).sort().join(","), delay: v.delay == null ? null : +v.delay.toFixed(2),
    contact: r.rs.end?.why === "contact" || v.faults.some((f) => f.id === "collision" || f.id === "struckPerson") };
};
export function all() {
  const out = {};
  for (const type of TYPES) for (const pool of ["now", "wait"]) for (const seed of type.pools[pool]) for (const [name, make] of [["oracle", oracle], ["eager", eager], ["creep", creep]]) {
    out[`${type.id}/${pool}#${seed}/${name}`] = summary(driveDecision(type, seed, type.cars, make));
  }
  for (const t of TYPES) { const ht = t.hazardType; for (const seed of ht.pools.hazard) {
    out[`${ht.id}#${seed}/free`] = summary(hazardRun(ht, seed, ht.cars));
    out[`${ht.id}#${seed}/stop`] = summary(hazardRun(ht, seed, ht.cars, { stopAfter: REACTION_FLOOR + 0.5 }));
  } }
  return out;
}
if (process.argv[1]?.endsWith("slice8-verdicts.mjs")) { const o = all(); writeFileSync(process.argv[2], JSON.stringify(o, null, 1)); console.log(`${Object.keys(o).length} entries -> ${process.argv[2]}`); }
