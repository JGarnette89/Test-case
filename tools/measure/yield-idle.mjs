/* Yield-road cars standing at the line with neither a right-of-way hold nor
   a queue in front: who, where, and what whatStops says.
   Run: node tools/measure/yield-idle.mjs [cars] [seed] */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, pathOf, whatStops } from "../../src/sim/crossing.js";
import { yieldCross } from "./yield.mjs";

const cars = Number(process.argv[2] ?? 40), seed = Number(process.argv[3] ?? 3);
let w = seedGraph(seed, 50, loadMap(yieldCross("yield")), { target: cars, posted: true });
const idle = new Map();
let shown = 0;
for (let i = 0; i < 240 / 0.05 && shown < 8; i++) {
  w = step(w);
  const L = w.course.at[0].layout;
  for (const a of w.actors) {
    if (a.crash || w.course.at[a.k].through) continue;
    const p = pathOf(w, a), leg = L.legs[p.from];
    if (!(leg.road === "n" || leg.road === "s") || a.s >= p.stopAt || a.v >= 0.3) { idle.delete(a.id); continue; }
    const why = whatStops(a, w);
    if (why.held || why.queued) { idle.delete(a.id); continue; }
    const n = (idle.get(a.id) ?? 0) + 0.05;
    idle.set(a.id, n);
    if (n > 1.0 && n <= 1.05) {
      shown++;
      console.log(`t${w.t.toFixed(1)} ${a.id} ${a.route} toLine ${(p.stopAt - a.s).toFixed(2)} v ${a.v.toFixed(2)} a ${(a.a ?? 0).toFixed(2)} stoppedAt ${a.stoppedAt?.toFixed(1)} going ${a.going} accepted ${a.accepted} leader ${why.leader?.id} gap ${Number.isFinite(why.gap) ? why.gap.toFixed(2) : "inf"} hold ${why.hold}`);
    }
  }
}
