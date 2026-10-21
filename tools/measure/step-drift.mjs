/* DOES THE STEP GET DEARER AS A DRIVE GOES ON? (22 October) The
   maintainer's phone, 280 cars on the endless highway, one drive: step p50
   36 ms at 1.8 min, 49 at 4.8, 50 at 5.1 -- at a constant car count. This
   drives the world as #/map does (worldFor, a player cruising at his pace)
   and reports the step in windows, beside everything the world carries that
   could grow: per-car fields and their sizes, lists on the world, caches.
   Usage: node tools/measure/step-drift.mjs [map=test-loop] [cars=280] [minutes=6] [lookAway=1] [player=1] */
import { performance } from "node:perf_hooks";
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";
const [mapId = "test-loop", carsArg = "280", minArg = "6", lookArg = "1", playerArg = "1"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === mapId).build();
let { world: w, me } = worldFor(1, 50, 2.0, playerArg === "1", Number(carsArg), raw, raw.sections?.[0]?.start ?? null, lookArg === "1");
const sc = { me, args: [1], saveWallet: false };
const size = (x) => (Array.isArray(x) ? x.length : x && typeof x === "object" ? Object.keys(x).length : 0);
const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
let ms = [];
for (let n = 0; n < Number(minArg) * 60 / DT; n++) {
  if (me) { me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; w = withDriver(w, me); }
  const t0 = performance.now();
  w = step(w);
  ms.push(performance.now() - t0);
  if ((n + 1) % 600 === 0) {
    const cars = w.actors.filter((a) => !a.player);
    const fieldSizes = {};
    for (const a of cars) for (const [k, v] of Object.entries(a)) if (v && typeof v === "object") fieldSizes[k] = (fieldSizes[k] ?? 0) + JSON.stringify(v).length;
    const top = Object.entries(fieldSizes).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / cars.length).toFixed(0)}B`).join(", ");
    const lists = Object.entries(w).filter(([, v]) => size(v) > 0 && typeof v === "object").map(([k, v]) => [k, size(v)]).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(", ");
    console.log(`t ${(w.t / 60).toFixed(1)} min: step p50 ${q(ms, 0.5).toFixed(2)} p95 ${q(ms, 0.95).toFixed(2)} ms, ${w.actors.length} actors; per car (JSON bytes): ${top}; world: ${lists}`);
    ms = [];
  }
}
