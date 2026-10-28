/* THE LANE BESIDE THE TAPERS, AND THE LANE CHANGES BY KIND (28 October; the
   courtesy-tail trace). The endless highway, 150 cars, one seed, checks off
   or on (stated, never defaulted): cars in the through lane within 150 m of
   each on-ramp taper and their speed, sampled each second from 100 s to
   180 s, and every lane change begun, by kind (merge, keep-right, overtake,
   for a turn or exit). Usage: node tools/measure/taper-lane.mjs seed checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { exitAlong } from "../../src/sim/graph.js";
const [seed, chk] = process.argv.slice(2).map(Number);
let w = seedGraph(seed, 50, loadMap(testLoop()), { target: 150, posted: true, checks: chk === 1 });
const out = { cars: 0, v: 0, n: 0, onMap: 0, curbChangesIn: 0, changes: 0 };
const seenLc = new Set();
while (w.t < 180) {
  w = step(w);
  for (const a of w.actors) if (a.lc && !seenLc.has(a.id + "@" + a.lc.at)) { seenLc.add(a.id + "@" + a.lc.at); out.changes++; const kind = a.lc.merge ? "merge" : a.lc.keepRight ? "keepRight" : a.lc.mandatory ? "forTurn" : "overtake"; out[kind] = (out[kind] ?? 0) + 1; }
  if (Math.round(w.t * 20) % 20 || w.t < 100) continue;
  out.onMap += w.actors.length;
  for (let k = 0; k < w.course.at.length; k++) {
    const L = w.course.at[k].layout;
    for (const [r, p] of Object.entries(L.paths)) {
      if (!L.legs[p.to]?.accel || !L.legs[p.from]?.road?.startsWith("on-")) continue;
      const to = L.legs[p.to], toLeg = L.legAt(to.base, to.pos - 1);
      const mine = exitAlong(w.course, k, r, p.length - to.accelClose - 5);
      for (const a of w.actors) {
        if ((a.k ?? 0) !== k) continue;
        const pa = L.paths[a.route];
        if (!pa || pa.to !== toLeg || a.s <= pa.clearAt) continue;
        const al = exitAlong(w.course, k, a.route, a.s);
        if (al != null && Math.abs(al - mine) < 150) { out.cars++; out.v += a.v; }
      }
      out.n++;
    }
  }
}
console.log(JSON.stringify({ seed, chk, perTaper: +(out.cars / out.n).toFixed(2), v: +(out.v / Math.max(1, out.cars)).toFixed(1), onMap: +(out.onMap / (out.n / 4)).toFixed(0), changes: out.changes, merge: out.merge, keepRight: out.keepRight, overtake: out.overtake, forTurn: out.forTurn }));
