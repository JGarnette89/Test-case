/* IS THE MAINLINE STREAM UNNATURALLY UNIFORM? (11 November, DECISIONS 10.70.) One run per process: CARS=300 SEED=1 [HEADS=1] [TABLE=C] node tools/measure/stream-gaps.mjs.
   PART 1 (always): TIME HEADWAYS AT A CROSS-SECTION of the lane each acceleration lane merges into, 30 m past the node's box and BEFORE any joiner has merged (the stream as
   offered): successive cars of that lane crossing the point, their headways: count, mean, standard deviation, COEFFICIENT OF VARIATION (a Poisson stream is 1, a perfectly even wall 0),
   quantiles, flow, and the SHARE and the RATE PER MINUTE of headways at or above 0.5, 1, 2, 2.5, 3, 3.4, 5 and 9 s. 2.0, 3.4, 5.0 and 9.0 s are the sim's own gap needs of a joiner at
   80, 60, 40 km/h and at rest under the OLD table (needgap.mjs); 2.5 s is Jay's 2-3 s calibration (the table arm C); 3 s is the hole that leaves a 2.5 s need open for half a second.
   [invented] throughout: the thresholds, the 30 m, the sample.
   PART 2 (HEADS=1): how the heads lose their speed. Joiners that rest are classified as lane-residual.mjs does (head or follower); for the heads: the distance to the taper's start at the first rest
   tick (AT the taper, within 3 m, or short of it), the speed at each tenth of the lane against joiners that never rested, and whether it ever held a gap target below its own speed (hanging back) first. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { exitAlong } from "../../src/sim/graph.js";
import { clearBetween } from "../../src/sim/traffic.js";

const cars = +(process.env.CARS ?? 300), seed = +(process.env.SEED ?? 1), secs = +(process.env.SECS ?? 180), HEADS = !!process.env.HEADS;
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: cars, posted: true });
for (let i = 0; i < 1200; i++) w = step(w);

const cross = new Map(), prevS = new Map(), times = new Map();   // per (node, lane): the crossing times
const J = new Map();
for (let i = 0; i < secs * 20; i++) {
  w = step(w);
  const lane = [];
  for (const a of w.actors) {
    if (a.crash || a.player) continue;
    const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p.to];
    // part 1: a car of the lane an acceleration lane merges into, crossing 30 m past the box
    const accelHere = Object.values(L.legs).find((l) => l.accel && L.legAt?.(l.base, l.pos - 1) === p.to);
    if (accelHere && a.s > p.clearAt - 5) {
      const key = `${a.k}|${p.to}`, mark = p.clearAt + 30, ps = prevS.get(a.id);
      if (ps != null && ps < mark && a.s >= mark) { const t = w.t - (a.s - mark) / Math.max(a.v, 1); if (!times.has(key)) times.set(key, []); times.get(key).push(t); }
      prevS.set(a.id, a.s);
    }
    if (HEADS && to?.accel && a.s > p.clearAt) lane.push({ a, L, p, to, al: exitAlong(w.course, a.k ?? 0, a.route, a.s) });
  }
  if (!HEADS) continue;
  const leadOf = (x) => { let best = null, bd = Infinity; for (const y of lane) { if (y.a.id === x.a.id || y.p.to !== x.p.to || (y.a.k ?? 0) !== (x.a.k ?? 0) || y.al == null || x.al == null) continue; const d = y.al - x.al; if (d > 0 && d < bd) { bd = d; best = y; } } return best && { y: best, gap: clearBetween(bd, x.a, best.a) }; };
  for (const x of lane) {
    const a = x.a, laneLen = x.p.length - x.to.accelClose - x.p.clearAt, run = a.s - x.p.clearAt, toEnd = x.p.length - x.to.accelClose - a.s;
    let j = J.get(a.id); if (!j) { j = { prof: new Array(10).fill(null), rested: false, cls: null, toEndAtRest: null, hung: false }; J.set(a.id, j); }
    const dec = Math.min(9, Math.floor((10 * run) / laneLen)); if (j.prof[dec] == null) j.prof[dec] = a.v;
    if (a.mergeV != null && a.mergeV < 0.8 * a.v && !j.rested) j.hung = true;
    if (a.v < 0.5 && !j.rested) { j.rested = true; const ld = leadOf(x); j.cls = ld && ld.y.a.v < 0.5 && ld.gap < 40 ? "follower" : "head"; j.toEndAtRest = toEnd; }
  }
}
const q = (xs, f) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(2) : null; };
const hw = []; let spanSecs = 0;
for (const ts of times.values()) { ts.sort((x, y) => x - y); for (let i = 1; i < ts.length; i++) hw.push(ts[i] - ts[i - 1]); spanSecs += Math.max(0, (ts[ts.length - 1] ?? 0) - (ts[0] ?? 0)); }
const mean = hw.reduce((x, y) => x + y, 0) / Math.max(1, hw.length), sd = Math.sqrt(hw.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, hw.length));
const TH = [0.5, 1, 2, 2.5, 3, 3.4, 5, 9], share = {}, perMin = {};
for (const t of TH) { const n = hw.filter((h) => h >= t).length; share[t] = +(n / Math.max(1, hw.length)).toFixed(3); perMin[t] = +((n * 60) / Math.max(1, spanSecs)).toFixed(2); }
const out = { env: { TABLE: process.env.TABLE ?? null }, cars, seed, secs, lanes: times.size, headways: hw.length, meanS: +mean.toFixed(2), sdS: +sd.toFixed(2), cv: +(sd / Math.max(mean, 1e-9)).toFixed(2),
  p10: q(hw, 0.1), p50: q(hw, 0.5), p90: q(hw, 0.9), flowPerLaneHour: +((hw.length * 3600) / Math.max(1, spanSecs)).toFixed(0), shareAtLeast: share, perMinuteAtLeast: perMin };
if (HEADS) {
  const all = [...J.values()], heads = all.filter((j) => j.rested && j.cls === "head"), others = all.filter((j) => !j.rested);
  const med = (g, d) => q(g.map((j) => j.prof[d]).filter((x) => x != null), 0.5);
  out.heads = { n: heads.length, followers: all.filter((j) => j.rested && j.cls === "follower").length, atTaperWithin3m: heads.filter((j) => j.toEndAtRest <= 3).length, shortOfTaper10mOrMore: heads.filter((j) => j.toEndAtRest >= 10).length, hungBackFirst: heads.filter((j) => j.hung).length,
    toEndAtRestMedian: q(heads.map((j) => j.toEndAtRest), 0.5), speedByTenthHeads: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => med(heads, d)), speedByTenthNeverRested: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => med(others, d)), neverRested: others.length };
}
console.log(JSON.stringify(out));
