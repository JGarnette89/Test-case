/* WHY KEEP-RIGHT FELL WITH THE CHECKS ON (28 October; the courtesy-tail
   trace found keep-right moves 415 -> 157 over seeds 1-4 while overtakes fell
   17%). taper-lane.mjs's world -- the endless highway, 150 cars, one seed,
   checks off or on (stated, never defaulted), 100 s to 180 s -- and:
     every spell out of the curb lane with no reason (hogSince set), and how
       it ended: moved back (keptRight rose), a reason came back (hogSince
       cleared with no move), the car left the approach, or still out at the
       end; and the time spent out;
     every set of looks before a change (lcPrep, checks on only), by direction
       (+1 toward the curb), and how it ended: the change began, the looks
       were replaced by another set, they lapsed (past ready + PREP_GRACE with
       no change), or they were cleared (a new intersection).
   Usage: node tools/measure/keepright-trace.mjs seed checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
import { LC_EVERY } from "../../src/sim/lanechange.js";
const GRACE = (LC_EVERY + 1) * DT + 2.0;   // lanechange.js PREP_GRACE, restated
const [seed, chk] = process.argv.slice(2).map(Number);
let w = seedGraph(seed, 50, loadMap(testLoop()), { target: 150, posted: true, checks: chk === 1 });
while (w.t < 100) w = step(w);
const hog = new Map(), prep = new Map();
const H = { spells: 0, back: 0, reason: 0, gone: 0, open: 0, time: 0 };
const P = {};
const tally = (dir, how) => { const k = dir > 0 ? "toCurb" : "away"; P[k] ??= { n: 0 }; P[k].n++; P[k][how] = (P[k][how] ?? 0) + 1; };
let prev = new Map(w.actors.map((a) => [a.id, a]));
while (w.t < 180) {
  w = step(w);
  const now = new Map(w.actors.map((a) => [a.id, a]));
  for (const [id, a] of now) {
    const b = prev.get(id);
    /* spells out of the curb lane with no reason */
    if (a.hogSince != null && !hog.has(id)) { hog.set(id, a.hogSince); H.spells++; }
    if (hog.has(id) && a.hogSince == null) {
      H.time += w.t - hog.get(id); hog.delete(id);
      if ((a.keptRight ?? 0) > (b?.keptRight ?? 0)) H.back++;
      else if (b && a.k !== b.k) H.gone++;
      else H.reason++;
    }
    /* the looks */
    const p = prep.get(id);
    if (a.lcPrep && (!p || p.at !== a.lcPrep.at)) {
      if (p && !p.lapsed) tally(p.dir, a.lc && a.lc.at >= p.at ? "began" : "replaced");
      prep.set(id, { at: a.lcPrep.at, dir: a.lcPrep.dir, ready: a.lcPrep.ready });
    } else if (p && !a.lcPrep) {
      if (!p.lapsed)
      tally(p.dir, a.lc && a.lc.at >= p.at ? (a.lc.keepRight ? "began(keepRight)" : "began") : "cleared");
      prep.delete(id);
    } else if (p && w.t > p.ready + GRACE + DT && !p.lapsed) { p.lapsed = true; tally(p.dir, "lapsed"); }
  }
  for (const id of hog.keys()) if (!now.has(id)) { H.time += w.t - hog.get(id); hog.delete(id); H.gone++; }
  for (const id of prep.keys()) if (!now.has(id)) prep.delete(id);
  prev = now;
}
for (const s of hog.values()) { H.time += w.t - s; H.open++; }
H.time = Math.round(H.time);
console.log(JSON.stringify({ seed, checks: chk, hog: H, looks: P }));
