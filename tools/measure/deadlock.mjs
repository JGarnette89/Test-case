/* Who is waiting for whom at the yield crossroads (tools/measure/yield.mjs)
   after a while. Run: node tools/measure/deadlock.mjs [ctl] [secs] */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, pathOf, blockedBy, whatStops } from "../../src/sim/crossing.js";
import { yieldCross } from "./yield.mjs";

const ctl = process.argv[2] ?? "none", secs = Number(process.argv[3] ?? 60);
let w = seedGraph(3, 50, loadMap(yieldCross(ctl)), { target: 40, posted: true });
for (let i = 0; i < secs / 0.05; i++) w = step(w);
const k = w.course.at.findIndex((a) => !a.through && Object.keys(a.layout.legs).length > 4);
const L = w.course.at[k].layout;
const here = w.actors.filter((a) => a.k === k).sort((a, b) => (pathOf(w, b).stopAt - b.s) - (pathOf(w, a).stopAt - a.s)).reverse();
console.log(`t=${w.t.toFixed(1)} node ${k}: ${here.length} cars`);
for (const a of here.slice(0, 14)) {
  const p = pathOf(w, a);
  const by = here.filter((b) => b.id !== a.id && blockedBy(a, b, L, a.caution, w.t)).map((b) => b.id);
  const ws = whatStops(a, w);
  console.log(`${a.id} ${a.route} toLine ${(p.stopAt - a.s).toFixed(1)} v ${a.v.toFixed(1)} stoppedAt ${a.stoppedAt?.toFixed(1) ?? "-"} going ${a.going} held ${ws.held} leaderGap ${Number.isFinite(ws.gap) ? ws.gap.toFixed(1) : "inf"} blockedBy [${by.join(",")}]`);
}
