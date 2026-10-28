/* WHAT MOVED A WORLD, AND WHY (28 October; the project lead: "for each world
   whose hash changes, state what changed and why it follows from the new
   rule"). The same world built twice -- the old gap rule (`imposed: false`,
   the exact control) and the new one at the default -- stepped in lockstep,
   as world-hash.mjs builds it (map, cars, seed, truck share). Reports:
     first   the first tick any car differs, which car, and what differed
             first on it: a lane change begun in one world and not the other
             (which world, and the change's kind), a courtesy offer present
             in one and not the other, or a position/speed difference with
             neither (a follow-on of something unseen);
     counts  over the run, lane changes begun and courtesy offers made, in
             each world, by kind -- the shape of the change, not one event.
   Usage: node tools/measure/diverge.mjs map secs cars seed trucks */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const [id, secs, cars, seed, trucks] = process.argv.slice(2);
if (trucks == null) throw new Error("usage: map secs cars seed trucks");
const L = loadMap(TEST_MAPS.find((t) => t.id === id).build());
const mk = (imposed) => seedGraph(Number(seed), 50, L, { target: Number(cars), posted: true, trucks: Number(trucks), checks: false, ...(imposed ? {} : { imposed: false }) });
let a = mk(false), b = mk(true);
const kindOf = (lc) => (lc.merge ? "merge" : lc.keepRight ? "keepRight" : lc.mandatory ? "forTurn" : "choice");
const C = { old: { changes: {}, offers: 0 }, new: { changes: {}, offers: 0 } };
const seen = { old: new Set(), new: new Set() }, offered = { old: new Set(), new: new Set() };
let first = null;
const tally = (w, side) => {
  for (const x of w.actors) {
    if (x.lc && !x.lc.abort && !seen[side].has(`${x.id}@${x.lc.at}`)) { seen[side].add(`${x.id}@${x.lc.at}`); const k = kindOf(x.lc); C[side].changes[k] = (C[side].changes[k] ?? 0) + 1; }
    if (x.courtesy && !offered[side].has(`${x.id}@${x.courtesy.since}`)) { offered[side].add(`${x.id}@${x.courtesy.since}`); C[side].offers++; }
  }
};
for (let i = 0; i < Number(secs) / DT; i++) {
  a = step(a); b = step(b);
  tally(a, "old"); tally(b, "new");
  if (first) continue;
  const bm = new Map(b.actors.map((x) => [x.id, x]));
  for (const x of a.actors) {
    const y = bm.get(x.id);
    const same = y && x.route === y.route && Math.abs(x.s - y.s) < 1e-9 && Math.abs(x.v - y.v) < 1e-9;
    if (same) continue;
    const lcX = x.lc ? `${x.lc.at}` : null, lcY = y?.lc ? `${y.lc.at}` : null;
    let what;
    if (!y) what = "present in the old world only";
    else if (lcX !== lcY) what = lcY && !lcX ? `a lane change (${kindOf(y.lc)}) begun under the NEW rule, not the old` : lcX && !lcY ? `a lane change (${kindOf(x.lc)}) begun under the OLD rule, not the new` : "lane changes begun at different times";
    else if (!!x.courtesy !== !!y.courtesy) what = y.courtesy ? "a courtesy offer under the new gate only" : "a courtesy offer under the old gate only";
    else what = "position or speed with no change or offer differing on this car (a follow-on)";
    first = { t: +a.t.toFixed(2), car: x.id, what, confidence: y?.ratings?.confidence?.toFixed(2), aggression: y?.aggression?.toFixed(2) };
    break;
  }
  if (!first && b.actors.length !== a.actors.length) first = { t: +a.t.toFixed(2), what: "a car present in the new world only" };
}
console.log(JSON.stringify({ map: id, secs: Number(secs), cars: Number(cars), seed: Number(seed), first, old: C.old, new: C.new }));
