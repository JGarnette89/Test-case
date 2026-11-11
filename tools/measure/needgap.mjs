/* THE GAP A JOINER NEEDS DEPENDS ON ITS OWN SPEED (11 November, DECISIONS 10.70): from the sim's own `lagNeed`, the room the car behind needs, at kappa 1, the
   stream at 100 km/h. A joiner at rest needs about eleven times what a matched one does, which is why a stopped joiner is very nearly stuck.
   [D] the constants behind lagNeed are [invented]; this prints what the sim asks, not what a real driver needs. */
import { lagNeed } from "../../src/sim/lanechange.js";
const behind = { v: 27.8, v0: 27.8, caution: 1 };
console.log("gap the car BEHIND needs (m), by the joiner's own speed; the stream at 100 km/h; kappa 1");
for (const kmh of [0, 20, 40, 60, 80, 100]) {
  const v = kmh / 3.6, g = lagNeed({ v, v0: 27.8, caution: 1 }, behind, 1);
  console.log(`  joiner ${String(kmh).padStart(3)} km/h: ${g.toFixed(0).padStart(4)} m = ${(g / 27.8).toFixed(1)} s of stream`);
}
