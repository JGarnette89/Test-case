/* THE CAPS, FROM MEASURED COST (backlog item 6, 17 Nov 2026). What the sim's step costs per car on each map the dial reaches, in the PLAYED world with the player driving (so shaping runs, as in play), one process on an idle machine
   (step-cost-map.mjs's rule: a number taken with runs competing is not a number). Per map and car count: the cars actually in the world, the step's median and p95 in ms over 20 s of driving after 30 s of warm-up, and ms per car.
   This is the DESK side of a ceiling and nothing more: the phone's factor is not known here. READ A PHONE AGAINST IT: Jay's frame counter shows `step N ms`; divide his step by the desk's median for the same map and count and that is the
   phone factor; a ceiling is then (the step the 20 Hz tick can afford on the phone) / (desk ms per car x factor). A tick may spend at most 50 ms (20 Hz) and the page also has to draw, so the step should stay well under half of it.
   Usage: node tools/measure/cost-per-car.mjs <mapId> <cars,cars,...> */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id, carsArg] = process.argv.slice(2);
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
console.log(`${id}: sim step cost, the played world, a good driver (shaping on where the map asks), desk machine`);
for (const cars of carsArg.split(",").map(Number)) {
  let { world: w, me } = worldFor(1, 50, 2.0, true, cars, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 0 });
  const sc = { me, args: [1], saveWallet: false }, ts = [];
  for (let i = 0; i < 50 / DT; i++) {
    me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me;
    const t = performance.now(); w = step(withDriver(w, me)); const dt = performance.now() - t;
    if (i >= 30 / DT) ts.push(dt);
  }
  ts.sort((a, b) => a - b); const med = ts[ts.length >> 1], p95 = ts[Math.floor(ts.length * 0.95)], n = w.actors.length;
  console.log(`  asked ${String(cars).padStart(3)} cars -> ${String(n).padStart(3)} in the world: step median ${med.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ${(1000 * med / Math.max(1, n)).toFixed(0)} us a car`);
}
