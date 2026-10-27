/* Where the step goes, by distance from the player (27 October, SIMULATOR 1.2.19): cars in each band and their
   whatStops cost, timed outside the step (warm caches -- a lower bound). MAP=test-loop|city node tools/measure/lod-split.mjs [cars=180] [shape=1] [seed=1] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf, whatStops } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { goodStep } from "../../tools/lib/good-driver.mjs";
const [cars = "180", shp = "1", seed = "1"] = process.argv.slice(2);
const loop = TEST_MAPS.find((m) => m.id === (process.env.MAP ?? "test-loop")).build();
let { world: w, me } = worldFor(Number(seed), 50, 2.0, true, Number(cars), loop, loop.sections?.[0]?.start ?? null, false);
w = Number(shp) ? { ...w, shape: true } : { ...w, shape: false };
const sc = { me, args: [1], saveWallet: false };
const tick = () => { me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; w = step(withDriver(w, me)); };
for (let i = 0; i < 20 * 120; i++) tick();
const bands = [[0, 100], [100, 400], [400, 1000], [1000, 2000], [2000, 1e9]];
const n = bands.map(() => 0), cost = bands.map(() => 0);
let stepMs = 0, ticks = 0;
for (let i = 0; i < 20 * 60; i++) {
  const t0 = performance.now(); tick(); stepMs += performance.now() - t0; ticks++;
  if (i % 10) continue;
  const at = poseOf(w, me);
  for (const a of w.actors) {
    if (a.player) continue;
    const p = poseOf(w, a), d = Math.hypot(p.x - at.x, p.y - at.y);
    const b = bands.findIndex(([lo, hi]) => d >= lo && d < hi);
    const t1 = performance.now(); for (let r = 0; r < 5; r++) whatStops(a, w); cost[b] += (performance.now() - t1) / 5; n[b]++;
  }
}
const samples = 120;
console.log(`cars ${cars} shape ${shp} seed ${seed}: step mean ${(stepMs / ticks).toFixed(2)} ms, actors ${w.actors.length}`);
let tot = 0; for (let b = 0; b < bands.length; b++) tot += cost[b] / samples;
for (let b = 0; b < bands.length; b++) console.log(`  ${bands[b][0]}-${bands[b][1]} m: ${(n[b] / samples).toFixed(1)} cars, whatStops ${(cost[b] / samples).toFixed(2)} ms/tick (${((cost[b] / samples) / tot * 100).toFixed(0)}%), ${(1000 * cost[b] / Math.max(1, n[b])).toFixed(1)} us a car`);
console.log(`  whatStops total ${tot.toFixed(2)} ms/tick = ${(tot / (stepMs / ticks) * 100).toFixed(0)}% of step`);
