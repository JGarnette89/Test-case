/* DID THE GLANCE FIT WHEN IT WAS TAKEN? (22 October, DECISIONS 10.19.)
   Every glance started, judged on the tick it started by a statement made
   here and not read from crossing.js: it did NOT fit if it began inside an
   intersection's box, or lasted longer than the time headway to the car
   ahead, or than the time to the next stop line. By observation: sound
   (deficit under 0.2), middling, poor (0.5 or more).
   Usage: node tools/measure/glance-fit.mjs [cars=260] [secs=180] [seed=1] [anyTime=0] */
import { worldFor } from "../../src/sim/scene.js";
import { step, pathOf, whatStops } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
import { deficitOf } from "../../src/core/driver.js";
const [carsArg = "260", secsArg = "180", seedArg = "1", anyArg = "0"] = process.argv.slice(2);
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), null, null, true);
if (anyArg === "1") w = { ...w, glanceAnyTime: true };
const g = { sound: [0, 0], middling: [0, 0], poor: [0, 0] };
for (let i = 0; i < Number(secsArg) / DT; i++) {
  const prev = w;
  w = step(w);
  if (i < 200) continue;
  const was = new Map(prev.actors.map((a) => [a.id, a]));
  for (const a of w.actors) {
    const b = was.get(a.id);
    if (!b || a.player || !(a.lag > 0) || a.glanceAt !== prev.t || !(b.v > 1)) continue;
    const p = pathOf(prev, b), v = whatStops(b, { ...prev, noPeriphery: true });
    const unfit = (b.s > p.stopAt && b.s < p.clearAt) || (b.s <= p.stopAt && (p.stopAt - b.s) / b.v < a.lag) || (v.leader && v.gap / b.v < a.lag);
    const d = deficitOf(a.ratings ?? {}, "observation").deficit ?? 0;
    const k = d < 0.2 ? "sound" : d >= 0.5 ? "poor" : "middling";
    g[k][1]++; if (unfit) g[k][0]++;
  }
}
console.log(`glances started while moving, ${secsArg} s at ${carsArg} cars, seed ${seedArg}${anyArg === "1" ? ", taken any time" : ""}: the share that did not fit`);
for (const [k, [u, n]] of Object.entries(g)) console.log(`   ${k.padEnd(9)} ${(100 * u / Math.max(n, 1)).toFixed(0).padStart(3)}% of ${n}`);
