/* SIMULATOR 1.2.19.  Who would be full and who coarse at R (Euclidean from the player), and whether ordinary FULL traffic
   passes the promotion validator (placement.js admissible) at the competent standard and at the driver's own.
   MAP=test-loop|city node tools/measure/lod-census.mjs cars shape seed */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf, whatStops, pathOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { decide, vehicleOf } from "../../src/sim/traffic.js";
import { cornerAccel } from "../../src/sim/corner.js";
import { admissible } from "../../src/sim/placement.js";
import { goodStep } from "../lib/good-driver.mjs";
const [cars = "180", shp = "1", seed = "1"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === (process.env.MAP ?? "test-loop")).build();
let { world: w, me } = worldFor(Number(seed), 50, 2.0, true, Number(cars), raw, raw.sections?.[0]?.start ?? null, false);
w = Number(shp) ? { ...w, shape: true } : { ...w, shape: false };
const sc = { me, args: [1], saveWallet: false };
const tick = () => { me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; w = step(withDriver(w, me)); };
for (let i = 0; i < 2400; i++) tick();
const R = [400, 600, 700, 1000];
const within = R.map(() => 0); let samples = 0, asked = 0;
const fail1 = {}, failOwn = {};
const opt = { poseOf, wantsAccel: (w2, car) => Math.min(decide(car, whatStops(car, w2)), cornerAccel(car, pathOf(w2, car))), brakeOf: (c) => c.brake ?? vehicleOf(c).brake };
for (let i = 0; i < 1200; i++) {
  tick();
  if (i % 20) continue;
  samples++;
  const at = poseOf(w, me);
  for (const a of w.actors) {
    if (a.player || a.crash || a.parked) continue;
    const p = poseOf(w, a), d = Math.hypot(p.x - at.x, p.y - at.y);
    R.forEach((r, j) => { if (d < r) within[j]++; });
    if (d < 600 || d > 1000) continue;   // the promotion band
    asked++;
    const r1 = admissible(w, a, opt);
    for (const why of r1.why) fail1[why] = (fail1[why] ?? 0) + 1;
    const r2 = admissible(w, a, { ...opt, kappa: a.caution ?? 1 });
    for (const why of r2.why) failOwn[why] = (failOwn[why] ?? 0) + 1;
  }
}
console.log(`${process.env.MAP ?? "test-loop"} ${cars} shape ${shp} seed ${seed}: actors ${w.actors.length}; within ${R.map((r, j) => `${r} m ${(within[j] / samples).toFixed(0)}`).join(", ")}`);
console.log(`  full traffic 600-1000 m, ${asked} car-samples, refused at competent: ${JSON.stringify(fail1)}; at own caution: ${JSON.stringify(failOwn)}`);
