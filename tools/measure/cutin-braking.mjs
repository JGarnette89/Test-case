/* MISSED SHOULDER CHECKS AND THE EMERGENCY STOPS THEY CAUSE (27 October; the
   project lead's request, for the maintainer to rule on). A lane change begun
   with somebody in the blind spot unseen (lc.missed) is allowed down to the
   floor where the car behind can still stop at its hardest (lanechange.js,
   lagSurvivable) -- by design, a missed check is found out. This counts how
   often that ends in the car behind braking at the hardest a car can (8 m/s^2,
   MOST_BRAKE) or merely hard (past twice comfortable, HARSH_AT), per hour of
   traffic, checks off against on. One event per (follower, change).
   Usage: node tools/measure/cutin-braking.mjs [map=test-1] [cars=200] [mins=10] [seed=1] [checks=0] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, whatStops } from "../../src/sim/crossing.js";
import { DT, MOST_BRAKE, HARSH_AT } from "../../src/sim/traffic.js";
const [id = "test-1", cars = "200", mins = "10", seed = "1", chk = "0"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((t) => t.id === id).build());
let w = seedGraph(Number(seed), 50, loaded, { target: Number(cars), posted: true, checks: chk === "1" });
let missedChanges = 0;
const emergency = new Set(), harsh = new Set(), seenChange = new Set();
for (let i = 0; i < Number(mins) * 60 / DT; i++) {
  const before = w;
  w = step(w);
  const byId = new Map(before.actors.map((a) => [a.id, a]));
  for (const a of w.actors) {
    if (a.lc?.missed && !seenChange.has(`${a.id}@${a.lc.at}`)) { seenChange.add(`${a.id}@${a.lc.at}`); missedChanges++; }
    const dec = -(a.a ?? 0);
    if (dec <= HARSH_AT || (byId.get(a.id)?.v ?? 0) < 0.5) continue;
    const l = whatStops(byId.get(a.id) ?? a, before).leader;
    const L = l && byId.get(l.id);
    if (!L?.lc?.missed || before.t - L.lc.at > 3) continue;
    const key = `${a.id}|${L.id}@${L.lc.at}`;
    harsh.add(key);
    if (dec >= MOST_BRAKE - 0.01) emergency.add(key);
  }
}
const h = Number(mins) / 60;
console.log(`${id} ${cars} cars seed ${seed} checks ${chk}: ${missedChanges} lane changes begun with somebody unseen in the blind spot; the car behind braked hard (past ${HARSH_AT.toFixed(1)} m/s^2) after ${harsh.size} of them, at the hardest a car can (${MOST_BRAKE} m/s^2) after ${emergency.size} -- ${(emergency.size / h).toFixed(1)} emergency stops an hour`);
