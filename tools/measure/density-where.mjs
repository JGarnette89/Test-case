/* WHERE ARE THE CARS RELATIVE TO THE PLAYER, AND WHAT DO THEY COST (Jay, 14 November: at 500 cars "still the same empty feeling road and my phone just can't keep up, page crashed and reloaded").
   The good driver drives `secs` seconds at the count asked (shaping forced ON or OFF); every 5 s the number of cars within 400 m (the screen's SIGHT, sim/shaping.js), 1 km, 2 km and in the world; and the heap and the step cost at the end.
   Usage: node --expose-gc tools/measure/density-where.mjs <mapId> <cars> <shape 0|1> [seed=1] [secs=180] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id, carsArg, shapeArg, seedArg = "1", secsArg = "180"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { loaded, world: w, me } = worldFor(+seedArg, 50, 2.0, true, +carsArg, raw, raw.sections?.[0]?.start ?? null, false);
w = shapeArg === "1" ? { ...w, shape: true } : { ...w, shape: false };
const me0 = me, sc = { me, args: [1], saveWallet: false }, rows = [], ts = [];
for (let n = 0; n < +secsArg / DT; n++) {
  if (me.atEdge) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
  const t0 = performance.now(); w = step(withDriver(w, me)); ts.push(performance.now() - t0);
  if (n % 100 === 99) {
    const roadOf = (a) => { const L = w.course.at[a.k ?? 0].layout, pa = L.paths[a.route]; return L.legs[pa?.from]?.road ?? ""; };
    const fam = (r) => (/^(hb|offb|onb)-/.test(r) ? "B" : "A"), mine = fam(roadOf(me));
    /* THE PLAYER'S OWN DIRECTION: the same carriageway (the other one is twenty metres away and is traffic nobody joins). */
    const p = poseOf(w, me), d = w.actors.filter((a) => !a.player && !a.parked && fam(roadOf(a)) === mine).map((a) => { const q = poseOf(w, a); return Math.hypot(q.x - p.x, q.y - p.y); });
    rows.push([d.filter((x) => x < 400).length, d.filter((x) => x < 1000).length, d.filter((x) => x < 2000).length, d.length]);
  }
}
globalThis.gc?.();
const mean = (i) => (rows.reduce((s, r) => s + r[i], 0) / rows.length).toFixed(1), mb = (process.memoryUsage().heapUsed / 1e6).toFixed(0);
ts.sort((a, b) => a - b);
console.log(`${id}, ${carsArg} cars asked (${(+carsArg / loaded.laneKm).toFixed(2)} per lane-km), shaping ${shapeArg === "1" ? "ON" : "OFF"}: on average the player has, in HIS OWN DIRECTION, within 400 m (the screen's SIGHT) ${mean(0)} cars, within 1 km ${mean(1)}, within 2 km ${mean(2)}, in his direction in the whole world ${mean(3)}; heap ${mb} MB; step median ${ts[Math.floor(ts.length / 2)].toFixed(1)} ms, p95 ${ts[Math.floor(ts.length * 0.95)].toFixed(1)}, max ${ts[ts.length - 1].toFixed(0)}`);
