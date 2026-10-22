/* DOES "MERGES JUDGED" FIRE? (22 October; the maintainer's readout: 0 a
   minute over 3.1 minutes past four entrances, while overtaking 3.6 a minute
   -- which takes lane changes.) The player's own lane changes counted
   directly, by where on the path they happen (approach, box, exit stretch),
   and for each whether a car was within MERGE metres of the player in the
   lane joined -- read from the lane index by centreline (placement.js), a
   second statement independent of the counter -- against what the
   counter (sim/encounters.js) reports. And the joins out of an acceleration
   lane with the gap taken.
   Usage: node tools/measure/merge-counter.mjs [cars=280] [minutes=3] [seed=1] [lookAway=1] [shape=0] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";
import { newEncounters, encounterTick, encounterSummary, MERGE } from "../../src/sim/encounters.js";
import { placeOf, neighboursAt } from "../../src/sim/placement.js";

const [carsArg = "280", minArg = "3", seedArg = "1", lookArg = "1", shapeArg = "0"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
let { world: w, me } = worldFor(Number(seedArg), 50, 2.0, true, Number(carsArg), raw, raw.sections?.[0]?.start ?? null, lookArg === "1");
if (shapeArg !== "1") w = { ...w, shape: false };
const sc = { me, args: [1], saveWallet: false }, enc = newEncounters();
const changes = { approach: 0, box: 0, exit: 0, near: 0, nearByCounterRule: 0 };
let lastLane = null;
for (let n = 0; n < (Number(minArg) * 60) / DT; n++) {
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
  w = step(withDriver(w, me));
  encounterTick(enc, me, w);
  const L = w.course.at[me.k ?? 0].layout, p = L.paths[me.route];
  const at = placeOf(w.course, me.k ?? 0, me.route, me.s);
  if (!at) { lastLane = null; continue; }
  /* A lane change: the lane under the player changes while on the same road (lane ids share the road before '#'). */
  if (lastLane && at.lane !== lastLane && at.lane.split("#")[0] === lastLane.split("#")[0]) {
    const where = me.s <= p.stopAt ? "approach" : me.s <= p.clearAt ? "box" : "exit";
    changes[where]++;
    const nb = neighboursAt(w, at.lane, at.c, me);
    if ((nb.ahead && nb.ahead.clear < MERGE) || (nb.behind && nb.behind.clear < MERGE)) changes.near++;
  }
  lastLane = at.lane;
}
const s = encounterSummary(enc);
console.log(`endless highway, ${carsArg} cars, ${minArg} min, seed ${seedArg}, look-away ${lookArg === "1" ? "on" : "off"}, shaping ${shapeArg === "1" ? "on" : "off"}`);
console.log(`  the player's lane changes: ${changes.approach} on an approach, ${changes.box} in a box, ${changes.exit} on an exit stretch; ${changes.near} with a car within ${MERGE} m in the lane joined (counted here)`);
console.log(`  the counter: merges judged ${s.mergesPerMin}/min = ${Math.round(s.mergesPerMin * s.minutes)}; joins out of an acceleration lane ${Math.round(s.accelMergesPerMin * s.minutes)} (median gap taken ${s.mergeGap ?? "-"} m); overtook ${s.overtookPerMin}/min`);
