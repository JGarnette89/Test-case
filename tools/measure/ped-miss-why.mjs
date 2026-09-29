/* The first few car-person touches the tick did not record, and the first
   strikes by attentive drivers: who, where, doing what. */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, poseOf, pathOf } from "../../src/sim/crossing.js";
import { testPeds } from "../../src/map/samples.js";
import { crosswalksOf, pedPose, bandOn } from "../../src/sim/peds.js";
import { touching } from "./peds.mjs";
let w = seedGraph(3, 50, loadMap(testPeds()), { target: 60, posted: true, perceive: false });
const cws = crosswalksOf(w.course);
let shown = 0, strikesShown = 0, seenCrash = 0;
for (let i = 0; i < 12000 && (shown < 4 || strikesShown < 4); i++) {
  w = step(w);
  for (const t of touching(w)) {
    if (shown >= 4) break;
    const p = w.peds.find((q) => q.id === t.ped), a = w.actors.find((q) => q.id === t.car), cw = cws[p.cw];
    const path = pathOf(w, a), band = bandOn(path, cw);
    console.log(`TOUCH t${w.t.toFixed(1)} ${p.id} ${p.state} cw ${cw.key} k${cw.k} u ${p.u.toFixed(1)}/${cw.width.toFixed(1)} | ${a.id} k${a.k} ${a.route} s ${a.s.toFixed(1)} v ${a.v.toFixed(1)} crash ${!!a.crash} band ${band ? band.s.toFixed(1) : "none"}`);
    shown++;
  }
  for (const c of (w.crashes ?? []).slice(seenCrash)) {
    const a = w.actors.find((q) => q.id === c.b);
    if (strikesShown < 4) console.log(`STRIKE t${c.t.toFixed(1)} ${c.a} by ${c.b} ${a?.route} v ${a?.v} going ${a?.going}`);
    strikesShown++;
  }
  seenCrash = (w.crashes ?? []).length;
}
