/* NOTE (11 November, after the fix): `lagNeed` now charges the closing speed ONCE, so the shed column below reads 0 and the totals are the "dynamic only" column (173 m at rest); the figures in the
   DECISIONS record of the 9 s (249 m, 152 + 76) are the table BEFORE the fix, which this tool printed. Kept to show the decomposition.
   WHERE THE 9 SECONDS COMES FROM (11 November, DECISIONS 10.70): the gap the car BEHIND needs from a joiner (lanechange.js lagNeed = max(floor, kappa * (wantedGap(behind, joiner) + shedOf(...)))), taken
   apart into the terms the sim adds, at the joiner's own speed, against a stream at 100 km/h, kappa 1. Prints what the SIM computes. The same closing speed is charged by wantedGap's dynamic term
   AND by shedOf: two implementations of one quantity. [invented]: every constant behind them. */
import { lagNeed } from "../../src/sim/lanechange.js";
import { wantedGap, vehicleOf, MOST_BRAKE } from "../../src/sim/traffic.js";
const V = 27.8, behind = { v: V, v0: V, caution: 1 };
const a = vehicleOf(behind).accel, b = vehicleOf(behind).brake;
console.log(`car: accel ${a} m/s^2, brake ${b} m/s^2, most ${MOST_BRAKE}; stream ${V} m/s (100 km/h)`);
console.log("joiner km/h | total m (s) | standstill+headway m | dynamic closing term m | shed term m | floor 1.5+stop m | total if the closing speed were charged ONCE (dynamic only / shed only)");
for (const kmh of [0, 20, 40, 60, 80, 100]) {
  const v = kmh / 3.6, joiner = { v, v0: V, caution: 1 };
  const total = lagNeed(joiner, behind, 1), wg = wantedGap(behind, joiner), base = wantedGap(behind, { v: behind.v });
  const dyn = wg - base, shed = total - wg;
  const floor = 1.5 + Math.max(0, (V * V - v * v) / (2 * MOST_BRAKE));
  console.log(`${String(kmh).padStart(5)} | ${total.toFixed(0).padStart(4)} (${(total / V).toFixed(1)}) | ${base.toFixed(1).padStart(5)} | ${dyn.toFixed(0).padStart(4)} | ${shed.toFixed(0).padStart(4)} | ${floor.toFixed(0).padStart(3)} | ${Math.max(floor, wg).toFixed(0)} m (${(Math.max(floor, wg) / V).toFixed(1)} s) / ${Math.max(floor, base + shed).toFixed(0)} m (${(Math.max(floor, base + shed) / V).toFixed(1)} s)`);
}
