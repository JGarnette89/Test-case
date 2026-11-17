/* DOES THE SHAPED WORLD LEAK? (the Pixel page crash, 17 Nov 2026.) Shaping now places and retires about 2.7 cars a second for the whole drive, so anything a retired car leaves behind -- an entry in a Map or Set,
   a closure, an array that only grows -- accumulates for as long as the page is open. The player drives (the good driver, as the screen's loop would) for `secs` s of world time on a map at `cars`; after
   every `every` s of world time a full gc and the heap in use, the world's own sizes (actors, crashes, anything on the world that is an array or object with a length/size growing), and the step time.
   A flat heap and flat sizes is no leak in the sim; a heap that climbs with flat sizes is held somewhere else. Usage: node --expose-gc tools/measure/heap-growth.mjs <mapId> <cars> [secs=900] [every=120] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id, carsArg, secsArg = "900", everyArg = "120"] = process.argv.slice(2), secs = +secsArg, every = +everyArg;
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(1, 50, 2.0, true, +carsArg, raw, raw.sections?.[0]?.start ?? null, false, false, { preroll: 15 });
const sc = { me, args: [1], saveWallet: false }; let stepMs = 0, steps = 0, ids = new Set(), respawns = 0;
const sizes = (x) => Object.entries(x).filter(([, v]) => Array.isArray(v) || v instanceof Map || v instanceof Set).map(([k, v]) => `${k}:${v.length ?? v.size}`).join(" ");
console.log(`${id} at ${carsArg} cars, ${secs} s of world time, a full gc every ${every} s`);
for (let n = 0; n < secs / DT; n++) {
  if (me.atEdge) { respawns++; me = { ...sc.me, s: 0, v: 0, atEdge: false }; }   // a road with an end: keep driving the same world rather than a standing player
  me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me;
  const t0 = performance.now(); w = step(withDriver(w, me)); stepMs += performance.now() - t0; steps++;
  for (const a of w.actors) ids.add(a.id);
  if ((n + 1) % Math.round(every / DT) === 0) { global.gc(); global.gc(); const m = process.memoryUsage(); console.log(`  t=${((n + 1) * DT).toFixed(0).padStart(4)} s  heap ${(m.heapUsed / 1048576).toFixed(1)} MB  rss ${(m.rss / 1048576).toFixed(0)} MB  step ${(stepMs / steps).toFixed(1)} ms  cars ${w.actors.length}  distinct ids ever ${ids.size}  world: ${sizes(w)}`); stepMs = 0; steps = 0; }
}
