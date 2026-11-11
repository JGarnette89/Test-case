/* DO JOINERS ARRIVE BESIDE A GAP, AND IS THERE ONE TO ARRIVE BESIDE? (11 November, DECISIONS 10.70.) One run per process: CARS=300 SEED=1 [SCAN=150] node tools/measure/lane-gaps.mjs.
   Per joiner (a car on a path whose exit is an acceleration lane, on the approach or the lane): (1) did it ever hold a gap target (a non-null wanted speed,
   `mergeV`, from `gapTarget`); (2) at the tick it first reaches the lane (past the slip road's clearAt), how many INTERIOR gaps -- between two cars of the lane it
   joins, of `room(v)` or more, by gapTarget's own definition (2 x the following gap + the car) -- were there within 150 m and within 300 m of it, by the lane's
   along-coordinate; (3) did it end the run at or near rest (the lane-end probe's definition: within 15 m of the taper, under 2 m/s within 20 m).
   [invented] throughout: the 150 and 300 m, room(v) as gapTarget defines it, near rest. The cross-tab is the point: had a target, had a gap in reach, still stopped. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { wantedGap, lenOf } from "../../src/sim/traffic.js";
import { exitAlong } from "../../src/sim/graph.js";

const cars = +(process.env.CARS ?? 300), seed = +(process.env.SEED ?? 1), secs = +(process.env.SECS ?? 120);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: cars, posted: true });
for (let i = 0; i < 1200; i++) w = step(w);

function interiorGaps(world, out, layout, path, outLeg, look) {
  const toLeg = layout.legAt?.(outLeg.base, outLeg.pos - 1);
  const mine = exitAlong(world.course, out.k ?? 0, out.route, out.s);
  if (!toLeg || mine == null) return null;
  const cs = [];
  for (const a of world.actors) {
    if (a.id === out.id || a.crash || a.offLane || (a.k ?? 0) !== (out.k ?? 0)) continue;
    const p = layout.paths[a.route];
    if (!p || a.s <= p.clearAt || p.to !== toLeg) continue;
    const al = exitAlong(world.course, a.k ?? 0, a.route, a.s);
    if (al != null && Math.abs(al - mine) < look) cs.push({ al, v: a.v ?? 0, half: lenOf(a) / 2 });
  }
  cs.sort((x, y) => x.al - y.al);
  const me = lenOf(out) / 2, room = (v) => 2 * wantedGap({ ...out, v }, { v }) + 2 * me;
  let n = 0;
  for (let i = 0; i + 1 < cs.length; i++) { const B = cs[i], A = cs[i + 1]; if (A.al - A.half - (B.al + B.half) >= room(B.v)) n++; }
  return { n, cars: cs.length };
}

const J = new Map();
for (let i = 0; i < secs * 20; i++) {
  w = step(w);
  for (const a of w.actors) {
    const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p.to];
    if (!to?.accel) continue;
    let j = J.get(a.id);
    if (!j) { j = { target: false, entry: null, minV20: Infinity, minToEnd: Infinity }; J.set(a.id, j); }
    if (a.mergeV != null) j.target = true;
    if (a.s > p.clearAt) {
      if (!j.entry) j.entry = { g150: interiorGaps(w, a, L, p, to, 150), g300: interiorGaps(w, a, L, p, to, 300) };
      const toEnd = p.length - to.accelClose - a.s;
      if (toEnd < j.minToEnd) j.minToEnd = toEnd;
      if (toEnd <= 20 && a.v < j.minV20) j.minV20 = a.v;
    }
  }
}
const js = [...J.values()].filter((j) => j.entry && j.entry.g150 && j.entry.g300);
const near = (j) => j.minToEnd <= 15 && j.minV20 < 2;
const cell = (f) => { const g = js.filter(f); return { n: g.length, nearRest: g.filter(near).length, share: +(g.filter(near).length / Math.max(1, g.length)).toFixed(3) }; };
const q = (xs, f) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(f * a.length))] : null; };
console.log(JSON.stringify({
  env: { SCAN: process.env.SCAN ?? null }, cars, seed, secs, joiners: js.length,
  everHadTarget: +(js.filter((j) => j.target).length / Math.max(1, js.length)).toFixed(3),
  gapInReach150: +(js.filter((j) => j.entry.g150.n > 0).length / Math.max(1, js.length)).toFixed(3),
  gapInReach300: +(js.filter((j) => j.entry.g300.n > 0).length / Math.max(1, js.length)).toFixed(3),
  interiorGapsWithin150: { p25: q(js.map((j) => j.entry.g150.n), 0.25), median: q(js.map((j) => j.entry.g150.n), 0.5), p75: q(js.map((j) => j.entry.g150.n), 0.75) },
  carsWithin150Median: q(js.map((j) => j.entry.g150.cars), 0.5),
  nearRestOverall: cell(() => true),
  byTarget: { had: cell((j) => j.target), not: cell((j) => !j.target) },
  byGap150: { had: cell((j) => j.entry.g150.n > 0), none: cell((j) => j.entry.g150.n === 0) },
  byTargetAndGap150: { targetAndGap: cell((j) => j.target && j.entry.g150.n > 0), noTargetButGap: cell((j) => !j.target && j.entry.g150.n > 0), targetNoGap: cell((j) => j.target && j.entry.g150.n === 0), neither: cell((j) => !j.target && j.entry.g150.n === 0) },
}));
