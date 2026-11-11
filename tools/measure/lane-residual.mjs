/* WHO IS STILL STOPPED, AND WHY? (11 November, DECISIONS 10.70.) The residual after E2: classify the joiners that come to rest in an acceleration lane.
   One run per process: CARS=300 SEED=1 [SCAN=150 MODALL=1] node tools/measure/lane-residual.mjs. Each joiner that comes to rest (under 0.5 m/s past the slip road's end)
   is classified at its FIRST rest tick:
     FOLLOWER   the car directly ahead in its own lane is itself a joiner standing (under 0.5 m/s) within 40 m [invented];
     HEAD       otherwise; and over its whole rest a head is
        OFFERED AND NOT TAKEN  at least one tick at rest with a merge plan whose offered gap is at least its own need (leadNeed, lagNeed at its own demand: the sim's
                               own definition of a gap it would take) -- so it was offered one and did not go;
        NONE AVAILABLE         a plan existed and no tick had an acceptable gap;
        NO PLAN                never ready to ask.
   Reported for every joiner that rested and for those meeting the lane-end probe's near-rest definition (within 15 m of the taper, under 2 m/s within 20 m), with the
   queue length (joiners standing together per head, per tick) and the followers per head. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { mergePlan, kappaOf, leadNeed, lagNeed } from "../../src/sim/lanechange.js";
import { clearBetween } from "../../src/sim/traffic.js";
import { exitAlong } from "../../src/sim/graph.js";

const cars = +(process.env.CARS ?? 300), seed = +(process.env.SEED ?? 1), secs = +(process.env.SECS ?? 180);
const QUEUE_M = 40;   // [invented]
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: cars, posted: true });
for (let i = 0; i < 1200; i++) w = step(w);

const J = new Map();
let qSum = 0, qTicks = 0, qMax = 0;
for (let i = 0; i < secs * 20; i++) {
  w = step(w);
  const lane = [];
  for (const a of w.actors) {
    const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p.to];
    if (!to?.accel || !(a.s > p.clearAt) || a.crash) continue;
    lane.push({ a, L, p, to, al: exitAlong(w.course, a.k ?? 0, a.route, a.s) });
  }
  const leadOf = (x) => {
    let best = null, bd = Infinity;
    for (const y of lane) {
      if (y.a.id === x.a.id || y.p.to !== x.p.to || (y.a.k ?? 0) !== (x.a.k ?? 0) || y.al == null || x.al == null) continue;
      const d = y.al - x.al;
      if (d > 0 && d < bd) { bd = d; best = y; }
    }
    return best && { y: best, gap: clearBetween(bd, x.a, best.a) };
  };
  let standing = 0, heads = 0;
  for (const x of lane) {
    const a = x.a;
    let j = J.get(a.id);
    if (!j) { j = { restTicks: 0, cls: null, offered: 0, run: 0, maxRun: 0, planTicks: 0, minV20: Infinity, minToEnd: Infinity }; J.set(a.id, j); }
    const toEnd = x.p.length - x.to.accelClose - a.s;
    if (toEnd < j.minToEnd) j.minToEnd = toEnd;
    if (toEnd <= 20 && a.v < j.minV20) j.minV20 = a.v;
    if (a.v >= 0.5) continue;
    standing++; j.restTicks++;
    const ld = leadOf(x), follower = !!(ld && ld.y.a.v < 0.5 && ld.gap < QUEUE_M);
    if (!follower) heads++;
    if (j.cls == null) j.cls = follower ? "follower" : "head";
    const mp = mergePlan(w, a, x.L, x.p, x.to);
    if (mp) {
      j.planTicks++;
      const nb = mp.best.nb, k = kappaOf(a);
      const lead = nb.ahead ? clearBetween(nb.da, a, nb.ahead) : Infinity, lag = nb.behind ? clearBetween(nb.db, nb.behind, a) : Infinity;
      /* POST-HOC REFINEMENT (11 November, flagged): the sim also requires every car beyond the first ahead to clear its own lead need (`nb.aheads`), and decides only
         every LC_EVERY ticks (0.5 s), so a gap acceptable for one tick is not one it could take. `strict` adds the first; the longest CONTINUOUS acceptable run is the second. */
      let strict = Math.min(lead / leadNeed(a, nb.ahead, k), lag / lagNeed(a, nb.behind, k)) >= 1;
      if (strict) for (const { car, d } of nb.aheads ?? []) if (car !== nb.ahead && clearBetween(d, a, car) < leadNeed(a, car, k)) { strict = false; break; }
      if (Math.min(lead / leadNeed(a, nb.ahead, k), lag / lagNeed(a, nb.behind, k)) >= 1) j.offered++;
      if (strict) { j.run++; if (j.run > j.maxRun) j.maxRun = j.run; } else j.run = 0;
    } else j.run = 0;
  }
  if (heads > 0) { const q = standing / heads; qSum += q; qTicks++; if (q > qMax) qMax = q; }
}
const all = [...J.values()].filter((j) => j.restTicks > 0);
const near = (j) => j.minToEnd <= 15 && j.minV20 < 2;
const tally = (g) => {
  const f = g.filter((j) => j.cls === "follower"), h = g.filter((j) => j.cls === "head");
  return { rested: g.length, followers: f.length, heads: h.length, shareFollowers: +(f.length / Math.max(1, g.length)).toFixed(3),
    headsOfferedAndNotTaken: h.filter((j) => j.offered > 0).length, headsLongestStrictRun: { none: h.filter((j) => j.maxRun === 0).length, under05s: h.filter((j) => j.maxRun > 0 && j.maxRun * 0.05 < 0.5).length, from05to1s: h.filter((j) => j.maxRun * 0.05 >= 0.5 && j.maxRun * 0.05 < 1).length, from1to2s: h.filter((j) => j.maxRun * 0.05 >= 1 && j.maxRun * 0.05 < 2).length, atLeast2s: h.filter((j) => j.maxRun * 0.05 >= 2).length }, headsNoneAvailable: h.filter((j) => j.offered === 0 && j.planTicks > 0).length, headsNoPlan: h.filter((j) => j.planTicks === 0).length };
};
console.log(JSON.stringify({ env: { SCAN: process.env.SCAN ?? null, MODALL: process.env.MODALL ?? null }, cars, seed, secs, joinersTotal: J.size, all: tally(all), nearRestAtEnd: tally(all.filter(near)),
  queue: { meanJoinersStandingPerHead: +(qSum / Math.max(1, qTicks)).toFixed(2), max: +qMax.toFixed(1) } }));
