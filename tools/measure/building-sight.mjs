/* WHAT WOULD IT TAKE FOR BUILDINGS TO BLOCK SIGHT? (5 November; a scope, NOTHING BUILT and
   no source changed. The project lead: whether the sight model can take a static
   occluder, whether buildings are geometry the sim can see, what it costs per tick.)
   1. GEOMETRY: per map, the buildings the loader keeps, their size, how far they stand from
      the nearest node.
   2. WHAT THEY WOULD HIDE: for every approach and every road crossing it, the road's last
      8 s at its limit, from the driver's eye at 30 m back and at the line.
      "Any" hidden is what caution would answer; "all" is a driver who can see nothing of
      that road, and creeping for a view is not modelled.
   3. COST: whatStops over every car for real worlds, with world.tall as it is, then
      handed the buildings. Two ways: all of them to every car (what a one-line merge
      would do), and only those within SIGHT_NEAR, found by a grid outside the timer (the
      best an index could do). The world is not stepped under buildings: this is the cost
      of asking, not of a world that behaves differently.
   4. A TABLE INSTEAD (10.33): the same answers computed once per map at load, per approach,
      per crossing road, every 5 m over the last 60 m: time and entries.
   Usage: node building-sight.mjs map [cars=180] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, whatStops, conflictOf } from "../../src/sim/crossing.js";
import { poseAt } from "../../src/sim/intersection.js";
import { blocked, conesFrom, blockedFrom } from "../../src/sim/sight.js";
import { DT } from "../../src/sim/traffic.js";

const [id, carsArg = "180"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build());
const boxes = loaded.props.map((p, i) => ({ id: `building-${i}`, x: p.at.x, y: p.at.y, heading: p.heading ?? 0, l: p.l, w: p.w }));
const med = (a) => { const q = [...a].sort((x, y) => x - y); return q[q.length >> 1] ?? 0; };
const CELL = 120, grid = new Map();
for (const b of boxes) { const k = `${Math.floor(b.x / CELL)},${Math.floor(b.y / CELL)}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(b); }
const near = (x, y) => { const out = [], cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const b of grid.get(`${cx + i},${cy + j}`) ?? []) if (Math.abs(b.x - x) < CELL && Math.abs(b.y - y) < CELL) out.push(b); return out; };
const out = { id, buildings: boxes.length, medianL: +med(boxes.map((b) => b.l)).toFixed(1), medianW: +med(boxes.map((b) => b.w)).toFixed(1), laneKm: +(loaded.laneKm ?? 0).toFixed(1) };
let w = seedGraph(1, 50, loaded, { target: Number(carsArg), posted: true, rivals: true });
const nodes = w.course.at.length;
out.nodes = nodes;
out.medianNearestBuildingToNode = boxes.length ? +med(w.course.at.map((n) => { const c = n.layout.place?.at ?? n.at ?? n; const X = c.x ?? 0, Y = c.y ?? 0; return Math.min(...near(X, Y).map((b) => Math.hypot(b.x - X, b.y - Y)), Infinity); }).filter(Number.isFinite)).toFixed(0) : null;
/* 2 and 4: over the approaches, geometry only. */
let pairs = 0, any30 = 0, anyLine = 0, all30 = 0, allLine = 0, entries = 0, tableMs = 0, approaches = new Set();
const limit = 8 * 14;   // 8 s at 50 km/h: what phantomHolds looks along
const hiddenShare = (eye, p2, meet, cones) => { let n = 0, hid = 0; for (let s = meet.a; s >= Math.max(0, meet.a - limit); s -= 3) { n++; if (blockedFrom(eye, poseAt(p2, s), cones)) hid++; } return n ? hid / n : 0; };
const eyeAt = (p, s) => { const q = poseAt(p, s); return { x: q.x, y: q.y }; };
w.course.at.forEach((n, k) => {
  const L = n.layout, routes = Object.entries(L.paths);
  const t0 = performance.now();
  for (const [r, p] of routes) {
    const base = L.legs[p.from]?.base ?? p.from;
    for (const [r2, p2] of routes) {
      if (r2 === r || (L.legs[p2.from]?.base ?? p2.from) === base) continue;
      const meet = conflictOf(L, r2, r);
      if (!meet) continue;
      pairs++; approaches.add(`${k}|${r}`);
      for (let back = 0; back <= 60; back += 5) {
        const s = p.stopAt - 2.25 - back;
        if (s < 0) continue;
        const e = eyeAt(p, s), cones = conesFrom(e, near(e.x, e.y)), share = hiddenShare(e, p2, meet, cones);
        entries++;
        if (back === 0) { if (share > 0) anyLine++; if (share >= 0.999) allLine++; }
        if (back === 30) { if (share > 0) any30++; if (share >= 0.999) all30++; }
      }
    }
  }
  tableMs += performance.now() - t0;
});
Object.assign(out, { approaches: approaches.size, pairs, hiddenAt30: +(any30 / Math.max(1, pairs)).toFixed(3), hiddenAtLine: +(anyLine / Math.max(1, pairs)).toFixed(3), allHiddenAt30: +(all30 / Math.max(1, pairs)).toFixed(3), allHiddenAtLine: +(allLine / Math.max(1, pairs)).toFixed(3), tableEntries: entries, tableMs: Math.round(tableMs) });
/* 3: the cost of asking. */
for (let i = 0; i < 60 / DT; i++) w = step(w);
const times = { asIs: 0, all: 0, indexed: 0 }, nearCounts = [];
let ticks = 0, calls = 0;
for (let i = 0; i < 400; i++) {
  w = step(w);
  if (i % 4) continue;
  ticks++;
  const cars = w.actors.filter((a) => !a.player && !a.crash);
  calls += cars.length;
  let t = performance.now();
  for (const a of cars) whatStops(a, w);
  times.asIs += performance.now() - t;
  const withAll = { ...w, tall: [...(w.tall ?? []), ...boxes] };
  t = performance.now();
  for (const a of cars) whatStops(a, withAll);
  times.all += performance.now() - t;
  const prepared = cars.map((a) => { const L = w.course.at[a.k ?? 0].layout, q = poseAt(L.paths[a.route], a.s), list = near(q.x, q.y); nearCounts.push(list.length); return [a, { ...w, tall: [...(w.tall ?? []), ...list] }]; });
  t = performance.now();
  for (const [a, W] of prepared) whatStops(a, W);
  times.indexed += performance.now() - t;
}
Object.assign(out, { cars: Number(carsArg), ticks, whatStopsMs: +(times.asIs / ticks).toFixed(2), withAllMs: +(times.all / ticks).toFixed(2), indexedMs: +(times.indexed / ticks).toFixed(2), nearBuildingsMedian: med(nearCounts), nearBuildingsMax: Math.max(0, ...nearCounts) });
console.log(JSON.stringify(out));
