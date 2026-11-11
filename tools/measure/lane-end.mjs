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

const cars = +(process.env.CARS ?? 150), seed = +(process.env.SEED ?? 1), secs = +(process.env.SECS ?? 180);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: cars, posted: true });
for (let i = 0; i < 1200; i++) w = step(w);
const J = new Map();
for (let i = 0; i < secs * 20; i++) {
  const before = w;
  w = step(w);
  for (const a of w.actors) {
    const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p.to];
    if (!to?.accel || !(a.s > p.clearAt)) continue;
    const laneLen = p.length - to.accelClose - p.clearAt, run = a.s - p.clearAt, toEnd = p.length - to.accelClose - a.s;
    let j = J.get(a.id);
    if (!j) { j = { id: a.id, kappa: kappaOf(a), laneLen, enterV: a.v, enterT: w.t, minV20: Infinity, minToEnd: Infinity, vAtEnd: null, merged: false, planAt: null, planRun: null, planV: null, planTicks: 0, noGapTicks: 0, restTicks: 0, atRest: false }; J.set(a.id, j); }
    if (toEnd < j.minToEnd) { j.minToEnd = toEnd; j.vAtEnd = a.v; }
    if (toEnd <= 20 && a.v < j.minV20) j.minV20 = a.v;
    if (a.v < 0.5) { j.restTicks++; j.atRest = true; }
    if (a.lc?.merge) j.merged = true;
    const mp = mergePlan(w, a, L, p, to);
    if (mp) {
      if (j.planAt == null) { j.planAt = w.t; j.planRun = run; j.planV = a.v; }
      j.planTicks++;
      const nb = mp.best.nb, k = j.kappa;
      const lead = nb.ahead ? clearBetween(nb.da, a, nb.ahead) : Infinity, lag = nb.behind ? clearBetween(nb.db, nb.behind, a) : Infinity;
      if (Math.min(lead / leadNeed(a, nb.ahead, k), lag / lagNeed(a, nb.behind, k)) < 1) j.noGapTicks++;
    }
  }
}
const js = [...J.values()];
const reached = js.filter((j) => j.minToEnd <= 15), slow = js.filter((j) => j.minToEnd <= 15 && j.minV20 < 2), dead = js.filter((j) => j.atRest);
const q = (xs, f) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(2) : null; };
const planFrac = (g) => g.filter((j) => j.planRun != null).map((j) => j.planRun / j.laneLen);
const out = {
  cars, seed, secs, joiners: js.length, merged: js.filter((j) => j.merged).length, reachedEnd: reached.length, atRestNearEnd: slow.length, restedAtAll: dead.length,
  ratePerMin: +((slow.length * 60) / secs).toFixed(2), shareSlowOfJoiners: +(slow.length / Math.max(1, js.length)).toFixed(3),
  laneLen: q(js.map((j) => j.laneLen), 0.5),
  stalled: { n: slow.length, kappaMedian: q(slow.map((j) => j.kappa), 0.5), timid12: slow.filter((j) => j.kappa >= 1.2).length, noPlanEver: slow.filter((j) => j.planAt == null).length, planRunFrac: { p25: q(planFrac(slow), 0.25), p50: q(planFrac(slow), 0.5), p75: q(planFrac(slow), 0.75) }, planSecs: q(slow.map((j) => j.planTicks * 0.05), 0.5), noGapSecs: q(slow.map((j) => j.noGapTicks * 0.05), 0.5), restSecs: q(slow.map((j) => j.restTicks * 0.05), 0.5), vAtEnd: q(slow.map((j) => j.vAtEnd), 0.5) },
  others: { n: js.length - slow.length, kappaMedian: q(js.filter((j) => !slow.includes(j)).map((j) => j.kappa), 0.5), timid12: js.filter((j) => !slow.includes(j) && j.kappa >= 1.2).length, planRunFrac: { p50: q(planFrac(js.filter((j) => !slow.includes(j))), 0.5) } },
};
console.log(JSON.stringify(out));
