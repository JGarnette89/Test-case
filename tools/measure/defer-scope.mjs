/* WHERE "A CAR THAT CANNOT MOVE UNTIL YOU DO" FIRES (28 October; the
   maintainer asked for its scope measured before it ships). Needs a
   temporary hook, NOT committed (no globals in src/): in lanechange.js
   gapFor, make the line that sets lagOk for a waiting car behind a block
   that also does
     globalThis.__deferFires?.push({ t: world.t, id: out.id, behind: nb.behind.id, k: out.k, lagGap, v: out.v });
   Without it this reports nothing fired. Measured 28 October with it: one
   firing in 57 world-minutes over five maps, checks on and off -- the
   verify-merge seed-1 deadlock, at a merge; none at a queue. Per firing: a merge (the changer's path ends
   in an acceleration lane) or not; for the rest, where -- on the approach
   (how far short of its line, and whether the car behind is queued at
   one) or on an exit stretch -- and what followed: did the change begin,
   did the pair touch, did the car behind brake past HARSH_AT in the next 5 s.
   Usage: node tools/measure/defer-scope.mjs [map=test-loop] [cars=300] [secs=180] [seed=1] [checks=1] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT, HARSH_AT } from "../../src/sim/traffic.js";
const [id = "test-loop", cars = "300", secs = "180", seed = "1", chk = "1"] = process.argv.slice(2);
const map = loadMap(TEST_MAPS.find((m) => m.id === id).build());
let w = seedGraph(Number(seed), 50, map, { every: 2.0, target: Number(cars), posted: true, checks: chk === "1" });
for (let i = 0; i < 1200; i++) w = step(w);
globalThis.__deferFires = [];
const fires = [], seen = new Set();
for (let i = 0; i < Number(secs) / DT; i++) {
  const before = w;
  globalThis.__deferFires.length = 0;
  w = step(w);
  for (const f of globalThis.__deferFires) {
    const key = `${f.id}|${f.behind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = before.actors.find((x) => x.id === f.id), b = before.actors.find((x) => x.id === f.behind);
    const L = before.course.at[a.k].layout, p = L.paths[a.route], pb = L.paths[b.route];
    const merge = !!L.legs[p.to]?.accel;
    const where = a.s <= p.stopAt ? `approach, ${(p.stopAt - a.s).toFixed(0)} m short of its line, behind ${b.s <= pb.stopAt ? `${(pb.stopAt - b.s).toFixed(0)} m short of its own` : "past its line"}` : "exit stretch";
    fires.push({ t: before.t, id: f.id, behind: f.behind, merge, where, gap: f.lagGap, v: a.v, began: false, touched: false, harsh: 0 });
  }
  for (const r of fires) {
    if (w.t - r.t > 5) continue;
    const a = w.actors.find((x) => x.id === r.id), b = w.actors.find((x) => x.id === r.behind);
    if (a?.lc && a.lc.at >= r.t) r.began = true;
    if ((w.crashes ?? []).some((c) => c.t > r.t && ((c.a === r.id && c.b === r.behind) || (c.b === r.id && c.a === r.behind)))) r.touched = true;
    if (b) r.harsh = Math.max(r.harsh, -(b.a ?? 0));
  }
}
const other = fires.filter((r) => !r.merge);
console.log(`${id} ${cars} cars seed ${seed} checks ${chk}, ${secs} s: fired for ${fires.length} pairs -- ${fires.length - other.length} at merges, ${other.length} elsewhere; change begun within 5 s ${fires.filter((r) => r.began).length}, the pair touched ${fires.filter((r) => r.touched).length}, the car behind braked past ${HARSH_AT.toFixed(1)} m/s^2 ${fires.filter((r) => r.harsh > HARSH_AT).length}`);
for (const r of fires) console.log(`  t ${r.t.toFixed(1)} ${r.id} ahead of ${r.behind} (${r.merge ? "merge" : r.where}): gap ${r.gap.toFixed(2)} m at ${r.v.toFixed(1)} m/s, began ${r.began}, touched ${r.touched}, behind's hardest braking ${r.harsh.toFixed(1)}`);
