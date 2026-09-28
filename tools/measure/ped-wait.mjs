/* Why the longest curb wait at the uncontrolled walked crossroads is long:
   for the longest waiter, which cars made stepping off unsafe, and how.
   Run: node tools/measure/ped-wait.mjs [ctl] [seed] */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { crosswalksOf, bandOn } from "../../src/sim/peds.js";
import { CAR } from "../../src/sim/traffic.js";
import { walkedCrossroads } from "./peds.mjs";

const ctl = process.argv[2] ?? "none", seed = Number(process.argv[3] ?? 5);
let w = seedGraph(seed, 50, loadMap(walkedCrossroads(ctl)), { target: 40, posted: true });
const cws = crosswalksOf(w.course);
const L = w.course.at.find((a) => !a.through).layout;
const why = new Map();
for (let i = 0; i < 240 / 0.05; i++) {
  w = step(w);
  for (const p of w.peds ?? []) {
    if (p.state !== "waiting" || w.t - p.since < 20) continue;
    const cw = cws[p.cw];
    for (const a of w.actors) {
      const path = L.paths[a.route];
      const band = path && bandOn(path, cw);
      if (!band) continue;
      const nose = a.s + CAR.length / 2, near = band.s - 1.5, far = band.s + 1.5;
      let r = null;
      if (nose > near - 0.5 && a.s - CAR.length / 2 < far + 0.5) r = `on it (v ${a.v.toFixed(1)}, ${a.route})`;
      else if (nose <= far && a.v > 0.3 && (a.v * a.v) / 5 > near - nose - 1) r = "coming, cannot stop";
      if (r) { const k = `${p.id} @${cw.key}: ${r}`; why.set(k, (why.get(k) ?? 0) + 1); }
    }
  }
}
console.log([...why].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${n}  ${k}`).join("\n"));
