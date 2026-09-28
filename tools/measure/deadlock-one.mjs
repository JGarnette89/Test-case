/* One pair at the yield crossroads: why does A wait for B. Run: node tools/measure/deadlock-one.mjs ctl secs A B */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, pathOf } from "../../src/sim/crossing.js";
import { yieldCross } from "./yield.mjs";
const [ctl, secs, A, B] = [process.argv[2], Number(process.argv[3]), process.argv[4], process.argv[5]];
let w = seedGraph(3, 50, loadMap(yieldCross(ctl)), { target: 40, posted: true });
for (let i = 0; i < secs / 0.05; i++) w = step(w);
for (const id of [A, B]) {
  const a = w.actors.find((q) => q.id === id), p = pathOf(w, a), L = w.course.at[a.k].layout;
  const other = id === A ? B : A, o = w.actors.find((q) => q.id === other);
  const hit = L.conflicts[a.route + "|" + o.route];
  console.log(`${id} k${a.k} ${a.route} s ${a.s.toFixed(1)} stopAt ${p.stopAt.toFixed(1)} v ${a.v.toFixed(2)} stoppedAt ${a.stoppedAt ?? "-"} going ${a.going} conflict a ${hit?.a?.toFixed(1)} clearOf ${hit?.clearOf?.toFixed(1)} -> in ${(hit?.a - a.s).toFixed(1)} m`);
}
