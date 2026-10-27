/* SIMULATOR 1.2.19.  Of the cars beyond 700 m, the share whose decision could be HELD (on a lane's stretch, not changing lane,
   not standing, farther from their line than half a second of travel plus a comfortable stop).
   MAP=... node tools/measure/lod-hold.mjs cars shape seed */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf, pathOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { vehicleOf } from "../../src/sim/traffic.js";
import { placeOf } from "../../src/sim/placement.js";
import { goodStep } from "../lib/good-driver.mjs";
const [cars = "180", shp = "1", seed = "1"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === (process.env.MAP ?? "test-loop")).build();
let { world: w, me } = worldFor(Number(seed), 50, 2.0, true, Number(cars), raw, raw.sections?.[0]?.start ?? null, false);
w = Number(shp) ? { ...w, shape: true } : { ...w, shape: false };
const sc = { me, args: [1], saveWallet: false };
const tick = () => { me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; w = step(withDriver(w, me)); };
for (let i = 0; i < 2400; i++) tick();
const c = { far: 0, box: 0, lc: 0, line: 0, standing: 0, hold: 0 };
for (let i = 0; i < 1200; i++) {
  tick(); if (i % 20) continue;
  const at = poseOf(w, me);
  for (const a of w.actors) {
    if (a.player || a.crash) continue;
    const p = poseOf(w, a); if (Math.hypot(p.x - at.x, p.y - at.y) < 700) continue;
    c.far++;
    const path = pathOf(w, a), v = a.v ?? 0, b = a.brake ?? vehicleOf(a).brake;
    if (!placeOf(w.course, a.k ?? 0, a.route, a.s)) c.box++;
    else if (a.lc && w.t < a.lc.t0 + a.lc.T) c.lc++;
    else if (v < 0.5) c.standing++;
    else if (a.s <= path.stopAt && path.stopAt - a.s < v * 0.5 + v * v / (2 * b) + 5) c.line++;
    else c.hold++;
  }
}
const pc = (x) => `${(100 * x / c.far).toFixed(0)}%`;
console.log(`${process.env.MAP ?? "test-loop"} ${cars} shape ${shp} seed ${seed}: ${(c.far / 60).toFixed(0)} cars beyond 700 m; in a box ${pc(c.box)}, changing lane ${pc(c.lc)}, standing ${pc(c.standing)}, near their line ${pc(c.line)}, HOLDABLE ${pc(c.hold)}`);
