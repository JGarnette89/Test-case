/* The 200-car lane runs of verify-lanes (seeds 3, 5, 9, 150 s): crashes and
   the pairs, with what each car was doing. Run: node tools/measure/lane-overlaps.mjs */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step, overlapping } from "../../src/sim/crossing.js";

const loaded = loadMap(testMap1());
for (const seed of [3, 5, 9]) {
  let w = seedGraph(seed, 50, loaded, { target: 200, posted: true });
  console.log(`seed ${seed}: ${w.actors.length} cars at t=0, crashes carried from warm-up ${(w.crashes ?? []).length}, overlapping at t=0 ${overlapping(w).length}`);
  for (const c of w.crashes ?? []) console.log(`   warm-up crash t=${c.t.toFixed(2)} ${c.a} x ${c.b}`);
  let seen = 0;
  for (let i = 0; i < 150 * 20; i++) {
    w = step(w);
    for (const c of (w.crashes ?? []).slice(seen)) {
      const d = (id) => { const a = w.actors.find((q) => q.id === id); return a ? `${id} k${a.k} ${a.route} s${a.s.toFixed(1)} lc${a.lc ? (a.lc.missed ? "(missed)" : "") : "-"} fromCurb${!!a.fromCurb}` : id; };
      console.log(`   crash t=${c.t.toFixed(2)}: ${d(c.a)} | ${d(c.b)}`);
    }
    seen = (w.crashes ?? []).length;
  }
}
