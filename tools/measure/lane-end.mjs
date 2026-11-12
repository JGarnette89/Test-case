/* WHAT JAY SEES AT THE END OF AN ACCELERATION LANE (11 November): joiners at or near rest where the lane runs out. A COUNT AND A RATE PER JOINER,
   not a maximum: verify-merge's `longest` is the longest unbroken stand below 0.5 m/s of any one joiner and says nothing about how many reached
   the end slowly. One run per process: CARS=150 SEED=1 node tools/measure/lane-end.mjs. Prints one JSON line.
   Per joiner (a car past the slip road's clearAt on a path whose leg is an acceleration lane, the same definition verify-merge uses):
   merged / reached the taper start (within 15 m) / speed there / slowest speed in the last 20 m / the first tick a merge plan existed (and
   where in the lane, and at what speed) / how long it had a plan and no gap at its own demand. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { mergePlan, kappaOf, leadNeed, lagNeed } from "../../src/sim/lanechange.js";
import { clearBetween } from "../../src/sim/traffic.js";
import { courteous } from "../../src/sim/courtesy.js";
import { overlapping } from "../../src/sim/crossing.js";

/* THRESHOLDS, MARKED (DECISIONS 10.70): `[invented]` every one: near rest under 2 m/s within 20 m of the taper's start, reached within 15 m; at rest under 0.5 m/s;
   "braked" over 1 m/s^2; "below its desired speed" under 0.9 of it; the car behind within 80 m; no gap when offered/needed under 1 at the sim's own
   (itself invented) demand. None is a claim Jay has ruled on. */
const cars = +(process.env.CARS ?? 150), seed = +(process.env.SEED ?? 1), secs = +(process.env.SECS ?? 180);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: cars, posted: true });
if (process.env.COURTESY === "0") w.courtesy = false;
for (let i = 0; i < 1200; i++) w = step(w);
const J = new Map();
const M = [], watch = [];   // M: one record per merge begun; watch: the car behind, followed for 4 s after it [thresholds invented: 1 s, 3 m/s^2, 4 s]
const movers = new Set();   // mainline cars that moved over for a joiner (the MOVE arm's `movedFor`)
let overlapTicks = 0, standSum = 0, standMax = 0, standTicks = 0;   // joiners standing (under 0.5 m/s) in an acceleration lane at once: a queue the length of the ramp is what Jay would see and the share at the END undercounts it
for (let i = 0; i < secs * 20; i++) {
  const before = w;
  w = step(w);
  if (i % 5 === 0) overlapTicks += overlapping(w).length;
  const prevV = new Map(before.actors.map((x) => [x.id, x.v])), offeredTo = new Map();
  { const byId = new Map(w.actors.map((x) => [x.id, x])); for (let k = watch.length - 1; k >= 0; k--) { const m = watch[k], b = byId.get(m.behindId), pv = prevV.get(m.behindId); if (b && pv != null) { const dv = ((b.v ?? 0) - pv) / 0.05; if (dv < m.worstDecel) m.worstDecel = dv; } if (w.t - m.t >= 4 || !b) { watch.splice(k, 1); } } }
  for (const x of w.actors) if (x.courtesy && !x.courtesy.forPlayer && !x.courtesy.done) offeredTo.set(x.courtesy.for, (offeredTo.get(x.courtesy.for) ?? 0) + 1);
  let standNow = 0;
  for (const a of w.actors) {
    if (a.movedFor != null) movers.add(a.id);
    if (a.lc?.merge && a.lc.at === before.t) { const j0 = J.get(a.id); if (j0 && j0.last && !j0.mAt) { j0.mAt = w.t; const rec = { t: w.t, joinerV: j0.last.joinerV, closing: j0.last.closing, lagT: j0.last.lagT, leadT: j0.last.leadT, worstDecel: 0, behindId: j0.last.behindId }; M.push(rec); if (rec.behindId != null) watch.push(rec); } }
    const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p.to];
    if (!to?.accel || !(a.s > p.clearAt)) continue;
    const laneLen = p.length - to.accelClose - p.clearAt, run = a.s - p.clearAt, toEnd = p.length - to.accelClose - a.s;
    let j = J.get(a.id);
    if (!j) { j = { id: a.id, kappa: kappaOf(a), laneLen, enterV: a.v, enterT: w.t, minV20: Infinity, minToEnd: Infinity, vAtEnd: null, merged: false, planAt: null, planRun: null, planV: null, planTicks: 0, noGapTicks: 0, offerTicks: 0, offerRun: null, behindCourteous: 0, behindNone: 0, behindBrake: 0, behindBelowV0: 0, behindSeen: 0, restTicks: 0, atRest: false }; J.set(a.id, j); }
    if (toEnd < j.minToEnd) { j.minToEnd = toEnd; j.vAtEnd = a.v; }
    if (toEnd <= 20 && a.v < j.minV20) j.minV20 = a.v;
    if (a.v < 0.5) { j.restTicks++; j.atRest = true; standNow++; }
    if (a.lc?.merge) j.merged = true;
    if (offeredTo.has(a.id)) { j.offerTicks++; if (j.offerRun == null) j.offerRun = run; }
    const mp = mergePlan(w, a, L, p, to);
    if (mp) { const nb = mp.best.nb; j.last = { joinerV: a.v ?? 0, closing: nb.behind ? (nb.behind.v ?? 0) - (a.v ?? 0) : null, lagT: nb.behind ? clearBetween(nb.db, nb.behind, a) / Math.max(nb.behind.v ?? 0, 1) : Infinity, leadT: nb.ahead ? clearBetween(nb.da, a, nb.ahead) / Math.max(a.v ?? 0, 1) : Infinity, behindId: nb.behind?.id ?? null }; }
    if (mp) {
      if (j.planAt == null) { j.planAt = w.t; j.planRun = run; j.planV = a.v; }
      j.planTicks++;
      { const b = mp.best.nb.behind; if (!b) j.behindNone++; else if (courteous(b)) j.behindCourteous++; if (b && mp.best.nb.db < 80) { j.behindSeen++; const dv = ((b.v ?? 0) - (prevV.get(b.id) ?? b.v ?? 0)) / 0.05; if (dv < j.behindBrake) j.behindBrake = dv; if ((b.v ?? 0) < 0.9 * (b.v0 ?? b.v ?? 0)) j.behindBelowV0++; } }
      const nb = mp.best.nb, k = j.kappa;
      const lead = nb.ahead ? clearBetween(nb.da, a, nb.ahead) : Infinity, lag = nb.behind ? clearBetween(nb.db, nb.behind, a) : Infinity;
      if (Math.min(lead / leadNeed(a, nb.ahead, k), lag / lagNeed(a, nb.behind, k)) < 1) j.noGapTicks++;
    }
  }
  standSum += standNow; standTicks++; if (standNow > standMax) standMax = standNow;
}

const js = [...J.values()];
const reached = js.filter((j) => j.minToEnd <= 15), slow = js.filter((j) => j.minToEnd <= 15 && j.minV20 < 2), dead = js.filter((j) => j.atRest);
const q = (xs, f) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(2) : null; };
const planFrac = (g) => g.filter((j) => j.planRun != null).map((j) => j.planRun / j.laneLen);
const yieldOf = (g) => ({ offeredShare: +(g.filter((j) => j.offerTicks > 0).length / Math.max(1, g.length)).toFixed(3), offerRunFrac: q(g.filter((j) => j.offerRun != null).map((j) => j.offerRun / j.laneLen), 0.5), behindBrakedOver1: +(g.filter((j) => j.behindBrake < -1).length / Math.max(1, g.length)).toFixed(3), behindBelowV0Share: +(g.filter((j) => j.behindSeen && j.behindBelowV0 / j.behindSeen > 0.5).length / Math.max(1, g.length)).toFixed(3) });
const planTk = (g) => g.reduce((a, j) => a + j.planTicks, 0), cShare = (g) => +(g.reduce((a, j) => a + j.behindCourteous, 0) / Math.max(1, planTk(g))).toFixed(3), noneShare = (g) => +(g.reduce((a, j) => a + j.behindNone, 0) / Math.max(1, planTk(g))).toFixed(3);
const mq = (f) => { const a = M.map(f).filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(0.5 * a.length))].toFixed(2) : null; };
const mp5 = (f) => { const a = M.map(f).filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? +a[Math.floor(0.05 * a.length)].toFixed(2) : null; };
const cl = M.map((m) => m.closing).filter((x) => x != null).sort((x, y) => x - y);   // closing speed at the merge: the car behind's speed minus the joiner's (m/s)
/* THE HARD BRAKING SPLIT BY THE JOINER'S SPEED AT MERGE ONSET (11 November, DECISIONS 10.70): a car behind braking hard for a SLOW or STOPPED joiner forcing in is Jay's ruling working ("floor it into traffic ... causing a major disruption");
   braking for a joiner with speed that took a tight gap is what nothing in his account sanctions. Bins in km/h of the joiner's speed at the last plan before the merge begins [invented]: under 20, 20 to 40, 40 to 60, 60 and over. */
const bins = [[0, 20], [20, 40], [40, 60], [60, 1e9]], splitOf = Object.fromEntries(bins.map(([lo, hi]) => { const g = M.filter((m) => m.joinerV != null && m.joinerV * 3.6 >= lo && m.joinerV * 3.6 < hi); return [`${lo}-${hi === 1e9 ? "+" : hi}`, { merges: g.length, over3: g.filter((m) => m.behindId != null && m.worstDecel < -3).length, over5: g.filter((m) => m.behindId != null && m.worstDecel < -5).length }]; }));
const merges = { speedSplit: splitOf, closingMedian: cl.length ? +cl[Math.floor(cl.length / 2)].toFixed(2) : null, closingP90: cl.length ? +cl[Math.floor(0.9 * cl.length)].toFixed(2) : null, closingOver10: +(cl.filter((x) => x > 10).length / Math.max(1, cl.length)).toFixed(3), n: M.length, lagTimeP5: mp5((m) => m.lagT), lagTimeMedian: mq((m) => m.lagT), leadTimeMedian: mq((m) => m.leadT), under1s: +(M.filter((m) => m.lagT < 1).length / Math.max(1, M.length)).toFixed(3), under05s: +(M.filter((m) => m.lagT < 0.5).length / Math.max(1, M.length)).toFixed(3), behindBraked3: +(M.filter((m) => m.behindId != null && m.worstDecel < -3).length / Math.max(1, M.length)).toFixed(3), behindBraked5: +(M.filter((m) => m.behindId != null && m.worstDecel < -5).length / Math.max(1, M.length)).toFixed(3) };
const out = {
  moves: movers.size, merges, standing: { mean: +(standSum / Math.max(1, standTicks)).toFixed(2), max: standMax },
  env: { WIDEN: process.env.WIDEN ?? null, DECAY: process.env.DECAY ?? null, SCAN: process.env.SCAN ?? null, PRO: process.env.PRO ?? null, DECAYS: process.env.DECAYS ?? null, MODALL: process.env.MODALL ?? null, GAPLOOK: process.env.GAPLOOK ?? null, FLOOR: process.env.FLOOR ?? null, MOVE: process.env.MOVE ?? null, NEED: process.env.NEED ?? null, TABLE: process.env.TABLE ?? null, TOL: process.env.TOL ?? null }, safety: { overlapTicks, crashes: (w.crashes ?? []).length }, nearestBehindCourteous: { all: cShare(js), stalled: cShare(slow), noCarBehind: noneShare(js) },
  courtesy: process.env.COURTESY !== "0", all: yieldOf(js), stalledYield: yieldOf(slow), othersYield: yieldOf(js.filter((j) => !slow.includes(j))), waitsAtRest: { p50: q(dead.map((j) => j.restTicks * 0.05), 0.5), p90: q(dead.map((j) => j.restTicks * 0.05), 0.9), max: q(dead.map((j) => j.restTicks * 0.05), 1), over20: dead.filter((j) => j.restTicks * 0.05 > 20).length, over60: dead.filter((j) => j.restTicks * 0.05 > 60).length },
  cars, seed, secs, joiners: js.length, reachedEnd: reached.length, atRestNearEnd: slow.length, restedAtAll: dead.length,
  ratePerMin: +((slow.length * 60) / secs).toFixed(2), shareSlowOfJoiners: +(slow.length / Math.max(1, js.length)).toFixed(3),
  laneLen: q(js.map((j) => j.laneLen), 0.5),
  stalled: { n: slow.length, kappaMedian: q(slow.map((j) => j.kappa), 0.5), timid12: slow.filter((j) => j.kappa >= 1.2).length, noPlanEver: slow.filter((j) => j.planAt == null).length, planRunFrac: { p25: q(planFrac(slow), 0.25), p50: q(planFrac(slow), 0.5), p75: q(planFrac(slow), 0.75) }, planSecs: q(slow.map((j) => j.planTicks * 0.05), 0.5), noGapSecs: q(slow.map((j) => j.noGapTicks * 0.05), 0.5), restSecs: q(slow.map((j) => j.restTicks * 0.05), 0.5), vAtEnd: q(slow.map((j) => j.vAtEnd), 0.5) },
  others: { n: js.length - slow.length, kappaMedian: q(js.filter((j) => !slow.includes(j)).map((j) => j.kappa), 0.5), timid12: js.filter((j) => !slow.includes(j) && j.kappa >= 1.2).length, planRunFrac: { p50: q(planFrac(js.filter((j) => !slow.includes(j))), 0.5) } },
};
console.log(JSON.stringify(out));
