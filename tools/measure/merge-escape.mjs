/* WHEN THE CAR BEHIND A MERGE BRAKES HARD, DID IT HAVE AN ESCAPE? (Jay, 11 November: "for traffic without an escape (changing lanes away from the
   merge) I could see that happening"; DECISIONS 10.70, recorded as [Jay, conditional].) One run per process: CARS=300 SEED=1 node tools/measure/merge-escape.mjs.
   At the tick a merge begins the car behind it in the lane joined is taken from the joiner's last merge plan and followed for 4 s. The FIRST tick its
   deceleration passes 3 m/s^2 (and, separately, 5) it is tested for an ESCAPE: a gap in the lane beside it, AWAY from the merge, that the sim's own lane-change
   test would take (the gap ahead at least `leadNeed`, behind at least `lagNeed`, at that car's own demand), by the lane's own along-coordinate. The BASE RATE
   is the same test at the tick every merge begins, for every car behind: if nearly everybody has an escape, braking with one proves nothing.
   [invented] instrument choices: 3 and 5 m/s^2, 4 s, the onset tick, the lane away only (the other side is the acceleration lane), the sim's gap constants.
   CAVEAT: in this sim a car that brakes never moves over in response, so "escape available" is an OPPORTUNITY measure by construction. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { mergePlan, kappaOf, leadNeed, lagNeed } from "../../src/sim/lanechange.js";
import { clearBetween } from "../../src/sim/traffic.js";
import { exitAlong } from "../../src/sim/graph.js";

const cars = +(process.env.CARS ?? 150), seed = +(process.env.SEED ?? 1), secs = +(process.env.SECS ?? 180);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: cars, posted: true });
if (process.env.COURTESY === "0") w.courtesy = false;
for (let i = 0; i < 1200; i++) w = step(w);

/* Is there a gap in the lane beside `b` (away from the merge) that b's own test would take? null when there is no lane there. */
function escapeOf(world, b) {
  const L = world.course.at[b.k ?? 0]?.layout, p = L?.paths[b.route];
  if (!p || !L.legAt) return null;
  const leg = L.legs[p.to];
  if (!leg || b.s <= p.clearAt) return null;
  const adj = L.legAt(leg.base, (leg.pos ?? leg.lane) - 1);
  if (!adj || !L.legs[adj] || L.legs[adj].accel || L.legs[adj].bay) return null;
  const me = exitAlong(world.course, b.k ?? 0, b.route, b.s);
  if (me == null) return null;
  let ahead = null, behind = null, da = Infinity, db = Infinity;
  for (const a of world.actors) {
    if (a.id === b.id || a.crash || (a.k ?? 0) !== (b.k ?? 0)) continue;
    const q = L.paths[a.route];
    if (!q || q.to !== adj || a.s <= q.clearAt) continue;
    const al = exitAlong(world.course, a.k ?? 0, a.route, a.s);
    if (al == null) continue;
    const d = al - me;
    if (d > 0 && d < da) { da = d; ahead = a; }
    if (d <= 0 && -d < db) { db = -d; behind = a; }
  }
  const k = kappaOf(b);
  const leadOk = !ahead || clearBetween(da, b, ahead) >= leadNeed(b, ahead, k);
  const lagOk = !behind || clearBetween(db, behind, b) >= lagNeed(b, behind, k);
  return leadOk && lagOk;
}

const J = new Map(), watch = [], merges = [];
for (let i = 0; i < secs * 20; i++) {
  const before = w;
  w = step(w);
  const prevV = new Map(before.actors.map((x) => [x.id, x.v])), byId = new Map(w.actors.map((x) => [x.id, x]));
  for (let k = watch.length - 1; k >= 0; k--) {
    const m = watch[k], b = byId.get(m.behindId), pv = prevV.get(m.behindId);
    if (b && pv != null) {
      const dv = ((b.v ?? 0) - pv) / 0.05;
      if (m.onset3 == null && dv < -3) { m.onset3 = escapeOf(w, b) ?? "none"; }
      if (m.onset5 == null && dv < -5) { m.onset5 = escapeOf(w, b) ?? "none"; }
    }
    if (w.t - m.t >= 4 || !b) watch.splice(k, 1);
  }
  for (const a of w.actors) {
    const L = w.course.at[a.k].layout, p = L.paths[a.route];
    if (a.lc?.merge && a.lc.at === before.t) {
      const j = J.get(a.id);
      if (j?.last?.behindId != null && !j.done) {
        j.done = true;
        const behind = byId.get(j.last.behindId);
        const rec = { t: w.t, behindId: j.last.behindId, base: behind ? escapeOf(w, behind) : null, onset3: null, onset5: null };
        merges.push(rec); watch.push(rec);
      }
    }
    const to = L.legs[p.to];
    if (!to?.accel || !(a.s > p.clearAt)) continue;
    let j = J.get(a.id); if (!j) { j = { last: null, done: false }; J.set(a.id, j); }
    const mp = mergePlan(w, a, L, p, to);
    if (mp?.best.nb.behind) j.last = { behindId: mp.best.nb.behind.id };
  }
}
const known = merges.filter((m) => m.base != null);
const hard = (key) => merges.filter((m) => m[key] != null);
const split = (key) => { const h = hard(key); return { events: h.length, escape: h.filter((m) => m[key] === true).length, noEscape: h.filter((m) => m[key] === false).length, noAdjacentLane: h.filter((m) => m[key] === "none").length, shareWithEscape: +(h.filter((m) => m[key] === true).length / Math.max(1, h.length)).toFixed(3) }; };
console.log(JSON.stringify({
  env: { COURTESY: process.env.COURTESY ?? null }, cars, seed, secs, merges: merges.length, withAdjacentLane: known.length,
  baseRateEscapeAvailable: +(known.filter((m) => m.base).length / Math.max(1, known.length)).toFixed(3),
  hardBrake3: { shareOfMerges: +(hard("onset3").length / Math.max(1, merges.length)).toFixed(3), ...split("onset3") },
  hardBrake5: { shareOfMerges: +(hard("onset5").length / Math.max(1, merges.length)).toFixed(3), ...split("onset5") },
}));
