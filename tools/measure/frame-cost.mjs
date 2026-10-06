/* WHAT A FRAME COSTS ON THE REAL SCREEN, AND WHERE IT GOES (2 October).
   The in-app instrument (#/iso) measures stage 0's hand-built roads: none
   of trucks, buses, pedestrians, walkers, parked cars, buildings or
   sidewalks. This plays #/map's own frame loop headlessly on a real map
   -- a sim step every third frame at 60 fps (DT is 50 ms), the poses, the
   draw on a phone-sized canvas -- and reports:

   1. SPIKES, not averages: the distribution of frame time, the worst
      frames, and what each was doing (step or not, how long each part
      took, and any garbage collection that landed inside it).
   2. COST BY CATEGORY, simulation and drawing kept apart: the same world
      stepped with each kind of content switched off, and the same frame
      drawn without each kind.

   Node on a desktop is several times faster than the phone, so read the
   numbers as PROPORTIONS and canvas calls (the phone pays per call), not
   as the phone's milliseconds. `actorsOf` is #/map's, copied here (that
   module is JSX); keep the two in step.

   Usage: node --expose-gc tools/measure/frame-cost.mjs [map=city] [cars=200] [seconds=30] */
import { PerformanceObserver, performance } from "node:perf_hooks";
import { loadMap, groundFor } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { mapFromBrief } from "../../src/map/brief.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { parkedPoses } from "../../src/sim/parking.js";
import { pedPose } from "../../src/sim/peds.js";
import { walkerPose } from "../../src/sim/walkers.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { terrain } from "../../src/iso/road.js";
import { drawFrame } from "../../src/iso/draw.js";
import { zoomFor } from "../../src/iso/chase.js";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "city", carsArg = "200", secsArg = "30"] = process.argv.slice(2);
const cars = Number(carsArg), secs = Number(secsArg);
const raw = mapId === "downtown" ? mapFromBrief({ downtown: true, buses: true }, 1) : TEST_MAPS.find((m) => m.id === mapId).build();
const loaded = loadMap(raw);

/* A canvas that does nothing and counts what it was asked to do. */
let calls = 0;
const noop = () => { calls++; };
const ctx = new Proxy({ canvas: { width: 824, height: 1830 } }, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 824, h: 1830 };

const b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const scene = (world, without = {}) => ({
  roads: loaded.roads.map((road) => ({ road, cars: [] })),
  terrain: without.terrain ? [] : terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }),
  junctions: junctionsOf(world.course), sidewalks: without.sidewalks ? [] : sidewalksOf(loaded), stops: loaded.stops ?? [],
  props: without.props ? [] : (loaded.props ?? []).map((p) => ({ x: p.at.x, y: p.at.y, heading: p.heading, l: p.l, w: p.w, h: p.h })),
  groundAt: ground,
});
/* #/map's actorsOf, verbatim in effect. */
function actorsOf(w, carry, without = {}) {
  const out = w.parked && !without.parked ? parkedPoses(w.course, w.parked).slice() : [];
  for (const a of w.actors) {
    const p = poseOf(w, { ...a, s: Math.min(a.s + a.v * carry, w.course.at[a.k].layout.paths[a.route].length) });
    out.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: a.colour, crashed: !!a.crash, kind: a.kind, length: p.length, width: p.width, height: p.height });
  }
  for (const q of w.peds ?? []) out.push({ id: q.id, n: q.look ?? q.n, ...pedPose(w, q), ped: true, struck: q.state === "struck" });
  if (!without.walkers) for (const q of w.walkers ?? []) out.push({ id: q.id, n: q.look ?? q.n, ...walkerPose(w, q), ped: true });
  return out;
}

/* GC pauses, by when they happened. */
const gcs = [];
new PerformanceObserver((list) => { for (const e of list.getEntries()) gcs.push({ at: e.startTime, ms: e.duration }); }).observe({ entryTypes: ["gc"] });

const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fmt = (x) => x.toFixed(2);

console.log(`map ${mapId}: ${loaded.roads.length} roads, ${loaded.props.length} buildings, ${(loaded.laneKm).toFixed(0)} lane-km; ${cars} cars asked for`);
let w = seedGraph(1, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true });
const sc = scene(w);
console.log(`after the warm-up: ${w.actors.length} moving, ${Object.keys(w.parked ?? {}).length} parked, ${(w.walkers ?? []).length} walking, ${(w.peds ?? []).length} crossing`);

/* 1. THE FRAME LOOP. A camera that follows a car through the city, as Watch does, at street zoom. */
const frames = [];
let owed = 0, follow = w.actors[Math.floor(w.actors.length / 2)]?.id;
const N = Math.round(secs * 60);
for (let f = 0; f < N; f++) {
  /* Let the GC observer deliver: it only reports between ticks of the event loop. */
  if (f % 30 === 0) await new Promise((r) => setImmediate(r));
  const t0 = performance.now();
  owed += 1 / 60;
  let stepMs = 0, steps = 0;
  while (owed >= DT) { owed -= DT; const s0 = performance.now(); w = step(w); stepMs += performance.now() - s0; steps++; }
  const a0 = performance.now();
  const actors = actorsOf(w, owed);
  const actMs = performance.now() - a0;
  let target = actors.find((a) => a.id === follow);
  if (!target) { const cs = actors.filter((a) => !a.ped); target = cs[Math.floor(cs.length / 2)]; follow = target?.id; }
  const d0 = performance.now();
  calls = 0;
  drawFrame(ctx, size, { ...sc, cam: { x: target.x, y: target.y, z: target.z ?? 0 }, rot: 0, k: size.w / 60, tilt: false, actors, t: w.t + owed });
  const drawMs = performance.now() - d0;
  frames.push({ f, at: t0, ms: performance.now() - t0, stepMs, steps, actMs, drawMs, calls, actors: actors.length });
}
const ms = frames.map((x) => x.ms);
const gcIn = (fr) => gcs.filter((g) => g.at >= fr.at && g.at < fr.at + fr.ms).reduce((s, g) => s + g.ms, 0);
console.log(`\n1. ${N} frames (${secs} s at 60 fps), following a car at street zoom:`);
console.log(`   frame ms  p50 ${fmt(pct(ms, 0.5))}  p95 ${fmt(pct(ms, 0.95))}  p99 ${fmt(pct(ms, 0.99))}  max ${fmt(Math.max(...ms))}`);
const withStep = frames.filter((x) => x.steps), without = frames.filter((x) => !x.steps);
console.log(`   frames with a sim step: p50 ${fmt(pct(withStep.map((x) => x.ms), 0.5))} max ${fmt(Math.max(...withStep.map((x) => x.ms)))};  without: p50 ${fmt(pct(without.map((x) => x.ms), 0.5))} max ${fmt(Math.max(...without.map((x) => x.ms)))}`);
console.log(`   of a frame (median): step ${fmt(pct(withStep.map((x) => x.stepMs), 0.5))} (every 3rd frame), poses ${fmt(pct(frames.map((x) => x.actMs), 0.5))}, draw ${fmt(pct(frames.map((x) => x.drawMs), 0.5))};  canvas calls ${pct(frames.map((x) => x.calls), 0.5)}`);
const med = pct(ms, 0.5);
const spikes = frames.filter((x) => x.ms > 3 * med);
console.log(`   spikes over 3x the median frame: ${spikes.length} (${(100 * spikes.length / N).toFixed(1)}% of frames, ${(spikes.length / secs).toFixed(1)} a second); GC total ${fmt(gcs.reduce((s, g) => s + g.ms, 0))} ms in ${gcs.length} pauses`);
console.log("   the worst ten frames:");
for (const x of frames.slice().sort((p, q) => q.ms - p.ms).slice(0, 10)) console.log(`     #${x.f} ${fmt(x.ms)} ms: ${x.steps ? `step ${fmt(x.stepMs)}` : "no step"}, poses ${fmt(x.actMs)}, draw ${fmt(x.drawMs)}, gc ${fmt(gcIn(x))}, ${x.calls} calls`);

/* 2a. SIMULATION BY CATEGORY: the same seed stepped with each kind of content off. */
const stepCost = (opts, label, mutateMap = null) => {
  const L = mutateMap ? loadMap(mutateMap(raw)) : loaded;
  let v = seedGraph(1, 50, L, { every: 2.0, target: cars, posted: true, walkers: true, ...opts });
  for (let i = 0; i < 100; i++) v = step(v);   // past the first churn
  const t = [];
  for (let i = 0; i < 400; i++) { const s0 = performance.now(); v = step(v); t.push(performance.now() - s0); }
  return { label, p50: pct(t, 0.5), p99: pct(t, 0.99), max: Math.max(...t), cars: v.actors.length };
};
console.log("\n2a. a sim step (ms), with each kind of content switched off -- the difference is what it costs:");
const base = stepCost({}, "everything");
for (const r of [base,
  stepCost({ walkers: false }, "no walkers"),
  stepCost({ trucks: 0 }, "no trucks"),
  stepCost({ pedEvery: Infinity, gapRate: 0 }, "nobody crossing"),
  stepCost({ seeThrough: true }, "trucks see-through (no sight)"),
  stepCost({}, "no parking", (m) => ({ ...m, roads: m.roads.map((r) => ({ ...r, parking: "none" })) })),
]) console.log(`   ${r.label.padEnd(30)} p50 ${fmt(r.p50)}  p99 ${fmt(r.p99)}  max ${fmt(r.max)}   (${r.cars} cars)   ${r === base ? "" : `saves ${fmt(base.p50 - r.p50)} at the median`}`);

/* 2b. DRAWING BY CATEGORY: one frame, drawn at three views, without each kind. */
console.log("\n2b. one frame drawn (ms, median of 30, and canvas calls), without each kind of content:");
const views = [["street zoom", size.w / 60], ["district (watch a place)", size.w / 110], ["whole map", Math.min(size.w / b.w, size.h / b.h) * 0.9]];
const actorsAll = actorsOf(w, 0);
const centre = { x: b.x + b.w / 2, y: b.y + b.h / 2, z: 0 };
for (const [name, k] of views) {
  const cam = k > 3 ? { x: actorsAll.find((a) => !a.ped)?.x ?? centre.x, y: actorsAll.find((a) => !a.ped)?.y ?? centre.y, z: 0 } : centre;
  const cost = (without) => {
    const s = scene(w, without), act = actorsOf(w, 0, without), t = [];
    let c = 0;
    for (let i = 0; i < 30; i++) { calls = 0; const d0 = performance.now(); drawFrame(ctx, size, { ...s, cam, rot: 0, k, tilt: false, actors: act, t: w.t }); t.push(performance.now() - d0); c = calls; }
    return { ms: pct(t, 0.5), calls: c };
  };
  const all = cost({});
  const parts = [["parked cars", { parked: true }], ["walkers", { walkers: true }], ["buildings", { props: true }], ["sidewalks", { sidewalks: true }], ["ground", { terrain: true }]];
  console.log(`   ${name} (k ${k.toFixed(2)}): ${fmt(all.ms)} ms, ${all.calls} calls`);
  for (const [label, wo] of parts) { const r = cost(wo); console.log(`      ${label.padEnd(12)} ${fmt(all.ms - r.ms).padStart(6)} ms  ${String(all.calls - r.calls).padStart(6)} calls  (${(100 * (all.calls - r.calls) / all.calls).toFixed(0)}% of the calls)`); }
}
