/* WHY A JOINER STANDS OVER A MINUTE (27 October; the verify-merge gate with
   the candidate's checks on). verify-merge's own world -- the endless highway,
   seed 1, warmed a minute, three minutes -- and for every joiner that stands
   (under 0.5 m/s past its slip road's box) over a minute, every 10 s while
   it stands: the lane beside at its place (clear road ahead and behind,
   placement.js neighboursAt, and the speeds of those two cars -- is the curb
   lane itself standing?), whether that gap is one it would take at its own
   caution (lanechange.js leadNeed / lagNeed), its own state (a change begun,
   prepared, mid-look), and the courtesy offers aimed at it.
   Usage: node tools/measure/merge-stranded.mjs [cars=300] [seed=1] [checks=1] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
import { neighboursAt } from "../../src/sim/placement.js";
import { leadNeed, lagNeed } from "../../src/sim/lanechange.js";
import { exitRouteInto, exitAlong } from "../../src/sim/graph.js";
const [cars = "300", seed = "1", chk = "1"] = process.argv.slice(2);
const map = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(Number(seed), 50, map, { every: 2.0, target: Number(cars), posted: true, checks: chk === "1" });
for (let i = 0; i < 1200; i++) w = step(w);
const standing = new Map(), log = new Map(), offers = new Map();
for (let i = 0; i < 180 / DT; i++) {
  w = step(w);
  for (const a of w.actors) {
    if (a.courtesy && !a.courtesy.forPlayer) { const k = `${a.id}@${a.courtesy.since}`; const o = offers.get(a.courtesy.for) ?? new Map(); o.set(k, `${a.id} from ${a.courtesy.since.toFixed(1)}${a.courtesy.done ? " (done)" : ""}`); offers.set(a.courtesy.for, o); }
    const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p?.to];
    if (a.player || !p || !to?.accel || a.s <= p.clearAt || !(a.v < 0.5)) { standing.delete(a.id); continue; }
    const t = (standing.get(a.id) ?? 0) + DT;
    standing.set(a.id, t);
    if (Math.round(t / DT) % 200 !== 1) continue;
    const toLeg = L.legAt?.(to.base, to.pos - 1), lane = toLeg && L.legs[toLeg]?.outLane;
    const c = lane && exitAlong(w.course, a.k, a.route, a.s);
    let beside = "lane beside not found";
    if (c != null) {
      const nb = neighboursAt(w, lane.id, c, a);
      const ahead = nb.ahead?.clear ?? Infinity, behind = nb.behind?.clear ?? Infinity;
      const takeable = (!nb.ahead || ahead >= leadNeed(a, nb.ahead.car)) && (!nb.behind || behind >= lagNeed(a, nb.behind.car));
      beside = `beside: ahead ${ahead.toFixed(0)} m at ${(nb.ahead?.car.v ?? NaN).toFixed(1)} m/s, behind ${behind.toFixed(0)} m at ${(nb.behind?.car.v ?? NaN).toFixed(1)} m/s, takeable ${takeable}`;
    }
    const line = `  +${t.toFixed(0)} s, s ${a.s.toFixed(0)} of ${p.length.toFixed(0)}: ${beside}; lc ${a.lc ? "yes" : "-"}, prep ${a.lcPrep ? `${a.lcPrep.dir} ready ${a.lcPrep.ready?.toFixed(1)} seen ${a.lcPrep.seen?.toFixed(1)}` : "-"}, look ${a.look?.kind ?? "-"}`;
    (log.get(a.id) ?? log.set(a.id, []).get(a.id)).push({ t, line });
  }
}
let n = 0;
for (const [id, rows] of log) {
  const longest = Math.max(...rows.map((r) => r.t));
  if (longest < 60) continue;
  n++;
  console.log(`${id}: stood ${longest.toFixed(0)}+ s; offers aimed at it: ${[...(offers.get(id)?.values() ?? [])].join(", ") || "none"}`);
  for (const r of rows) console.log(r.line);
}
console.log(`test-loop ${cars} cars seed ${seed} checks ${chk}: ${n} joiners stood over a minute`);
