/* A fingerprint of the bench world (src/iso/bench.js) after a run: every
   car, person crossing, walker and parked car. For proving an optimisation
   of the step left the traffic exactly as it was -- the bench map has
   everything, where world-hash.mjs's maps have no walkers or crossers.

   Usage: node tools/measure/bench-hash.mjs [fleet=50] [seconds=120] */
import { createHash } from "node:crypto";
import { benchScene, benchStep } from "../../src/iso/bench.js";
const [fleet = "50", secs = "120"] = process.argv.slice(2);
const sc = benchScene(Number(fleet), {});
const h = createHash("sha1");
for (let s = 0; s < Number(secs); s++) {
  benchStep(sc, 1);
  const w = sc.world;
  h.update(JSON.stringify([w.t.toFixed(3), w.actors.map((a) => [a.id, a.s.toFixed(4), a.v.toFixed(4), a.route, a.k]), (w.peds ?? []).map((q) => [q.id, q.state, q.u.toFixed(4), q.cw, q.from]), (w.walkers ?? []).map((q) => [q.id, q.state, (q.s ?? 0).toFixed(4), q.w, q.dir]), Object.keys(w.parked ?? {}).length, w.pedWant, w.pedN]));
}
console.log(`bench ${fleet} cars ${secs} s ${h.digest("hex")}`);
