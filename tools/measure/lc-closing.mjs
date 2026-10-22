/* LANE CHANGES BEGUN INTO A CLOSING CAR (22 October; SIMULATOR IN FLIGHT 26).
   Per lane change, not per crash -- crashes from it are one in forty shaped
   minutes, too rare to read. For every change a car BEGINS on the endless
   highway (the tick its lc appears), every car ahead in the lane joined,
   found by POSE (ahead along the changer's heading within 150 m, laterally
   within half a lane of the target lane's line -- a second statement,
   independent of lanechange.js's neighbour searches): the clear distance
   and the closing speed, and whether stopping the closing at the changer's
   own comfortable braking needs more room than there is. That is a change
   that will have to be braked out of harder than comfortable -- what the
   traced crash was.
   Usage: node tools/measure/lc-closing.mjs [cars=280] [secs=300] [seeds=1,2] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT, vehicleOf, lenOf } from "../../src/sim/traffic.js";

const [carsArg = "280", secsArg = "300", seedArg = "1,2"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
let begun = 0, bad = 0;
const examples = [];
for (const seed of seedArg.split(",").map(Number)) {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, Number(carsArg), raw, raw.sections?.[0]?.start ?? null, false);
  const sc = { me, args: [1], saveWallet: false };
  for (let n = 0; n < Number(secsArg) / DT; n++) {
    me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
    const prev = w;
    w = step(withDriver(w, me));
    const was = new Map(prev.actors.map((a) => [a.id, a]));
    for (const a of w.actors) {
      if (a.player || !a.lc) continue;
      const b = was.get(a.id);
      if (!b || (b.lc && b.lc.t0 === a.lc.t0)) continue;   // only the tick a change begins
      begun++;
      /* The target lane's line: a lane across from where the car is, on the side it moves to (L0 is the old lane relative to the new). */
      const p = poseOf(w, a), h = ((p.rot ?? 0) * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h);
      const side = -Math.sign(a.lc.L0 || 1), lane = 3.6;
      const cx = p.x + -fy * side * lane, cy = p.y + fx * side * lane;   // the target lane's line, abeam
      const brake = a.brake ?? vehicleOf(a).brake;
      for (const o of w.actors) {
        if (o.id === a.id) continue;
        const q = poseOf(w, o), dx = q.x - cx, dy = q.y - cy, along = dx * fx + dy * fy, across = Math.abs(-dx * fy + dy * fx);
        if (along <= 0 || along > 150 || across > 1.8) continue;
        if (Math.cos((((q.rot ?? 0) - (p.rot ?? 0)) * Math.PI) / 180) < 0.9) continue;
        const clear = along - (lenOf(a) + lenOf(o)) / 2, closing = a.v - (o.v ?? 0);
        if (closing > 0 && clear < (closing * closing) / (2 * brake)) {
          bad++;
          if (examples.length < 5) examples.push(`seed ${seed} t ${w.t.toFixed(1)} ${a.id} into a car ${clear.toFixed(1)} m clear closing at ${closing.toFixed(1)} m/s (needs ${((closing * closing) / (2 * brake)).toFixed(1)} m at ${brake.toFixed(1)} m/s^2)`);
          break;
        }
      }
    }
  }
}
console.log(`endless highway, ${carsArg} cars, shaped, ${secsArg} s, seeds ${seedArg}: ${begun} lane changes begun, ${bad} into a car closing too fast to stop for comfortably`);
for (const e of examples) console.log("   e.g. " + e);
