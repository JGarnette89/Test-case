/* The car standing on the south crosswalk in ped-wait.mjs's case: what holds it. */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, whatStops, pathOf } from "../../src/sim/crossing.js";
import { heldAhead, crosswalksOf, bandOn } from "../../src/sim/peds.js";
import { walkedCrossroads } from "./peds.mjs";
let w = seedGraph(5, 50, loadMap(walkedCrossroads("none")), { target: 40, posted: true });
const cws = crosswalksOf(w.course), south = cws.find((c) => c.key === "s|end");
let shown = 0;
for (let i = 0; i < 4800 && shown < 3; i++) {
  w = step(w);
  for (const a of w.actors) {
    const p = pathOf(w, a); const band = bandOn(p, south);
    if (!band || a.v > 0.05 || Math.abs(a.s - band.s) > 4.5) continue;
    if (i % 100) continue;
    const v = whatStops(a, w);
    console.log(`t${w.t.toFixed(1)} ${a.id} ${a.route} s ${a.s.toFixed(1)} band ${band.s.toFixed(1)} stopAt ${p.stopAt.toFixed(1)} going ${a.going} held ${v.held} leader ${v.leader?.id} gap ${Number.isFinite(v.gap) ? v.gap.toFixed(1) : "inf"} pedHold ${JSON.stringify(heldAhead(w, a, p))} peds ${(w.peds ?? []).map((q) => q.cw + ":" + q.state + ":" + q.u.toFixed(1)).join(" ")}`);
    shown++;
  }
}
