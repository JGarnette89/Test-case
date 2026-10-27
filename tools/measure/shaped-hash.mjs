/* A fingerprint of a DRIVEN world run (27 October): world-hash.mjs runs with
   nobody at the wheel, so density shaping -- which needs a player -- never
   runs in it. This drives the good driver (119% of the limit, overtaking)
   and hashes every actor's id, node, route, s, v and crash every second,
   with the crash log, so a refactor of shaping or contact detection is
   held to "nothing moved" where those actually run. Also prints the mean
   step, for the same run's before and after.
   CHECKS=0: the candidate's checks off (sim/checks.js) -- today's world before them.
   Usage: node tools/measure/shaped-hash.mjs [map=test-loop] [secs=180] [cars=180] [seed=1] [shape=1] [perceive=0] */
import { createHash } from "node:crypto";
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id = "test-loop", secs = "180", cars = "180", seed = "1", shp = "1", perceive = "0"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(Number(seed), 50, 2.0, true, Number(cars), raw, raw.sections?.[0]?.start ?? null, Number(perceive) === 1, false, { checks: process.env.CHECKS !== "0" });
/* GLANCE_ANY=1: the old blind glance (a check's controlled comparison, crossing.js) -- traffic that crashes, so contact detection is exercised with several contacts a tick. */
w = { ...w, shape: Number(shp) === 1, ...(process.env.GLANCE_ANY ? { glanceAnyTime: true } : {}), ...(process.env.CHECKS === "0" ? { checks: false } : {}) };
const me0 = me, sc = { me, args: [1], saveWallet: false };
let restarts = 0;
const h = createHash("sha1");
let ms = 0, placed = 0;
for (let i = 0; i < Number(secs) / DT; i++) {
  /* Off the map's edge: back to the start, as shape-drive.mjs does. */
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); restarts++; }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 });
  sc.me = me;
  const x = withDriver(w, me), t0 = performance.now();
  w = step(x);
  ms += performance.now() - t0;
  for (const a of w.actors) if (a.placed === x.t) placed++;
  if (i % 20 === 0) h.update(JSON.stringify([w.actors.map((a) => [a.id, a.k, a.route, +a.s.toFixed(6), +(a.v ?? 0).toFixed(6), a.crash ? 1 : 0]), w.crashes ?? []]));
}
console.log(`${id} ${secs}s ${cars} cars seed ${seed} shape ${shp} perceive ${perceive}: ${h.digest("hex")}  (step mean ${(ms / (Number(secs) / DT)).toFixed(2)} ms, ${placed} placed, ${(w.crashes ?? []).length} crashes, ${restarts} restarts)`);
