/* DOES A LONG DRIVE DECAY ON THE PAGE? (18 Nov 2026; Jay's counter: 60 fps, worst 17 ms at 10:22, then 41 fps with a 108 ms worst frame a minute later and "got worse over time": spikes, which is accumulation, not throughput.) `heap-growth.mjs` ruled out a leak in the SIM alone (flat 18 MB over 14 minutes).
   This runs the PAGE'S loop as far as Node can: the sim step with the player driving (the good driver), the poses of every car, body motion (`bodyOf`, with its memory and its per-frame prune), the real `drawFrame` with a chase camera on the
   player at 60 Hz, the per-tick session and encounters, for `mins` minutes of drive on the generated road at its default 100 cars. By MINUTE it reports: the heap after a forced collection (every `GCEVERY` minutes: forcing it every
   minute would hide the shape), the garbage collector's own pauses as V8 reports them (minor, major, count, total, the longest), the bytes allocated per frame, and the frame's script time (poses + body + draw, median and p95), so a heap that
   climbs, a pause that lengthens, or a frame that creeps shows as a trend. A stub canvas with SHARED no-op methods (not a Proxy: a Proxy allocates a closure per call and would be the garbage it is looking for).
   Usage: node --expose-gc tools/measure/page-loop-long.mjs [mins=30] [cars=100] [map=test-highway-gen-wide] */
import { PerformanceObserver, constants } from "node:perf_hooks";
import { Session } from "node:inspector/promises";
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, driverPose } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
import { newEncounters, encounterTick } from "../../src/sim/encounters.js";
import { noticeTick } from "../../src/sim/session.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { groundFor } from "../../src/map/load.js";
import { terrain } from "../../src/iso/road.js";
import { drawFrame } from "../../src/iso/draw.js";
import { chaseStep, newChase, zoomFor } from "../../src/iso/chase.js";
import { newBody, beginBodyFrame, bodyOf, endBodyFrame } from "../../src/iso/body.js";
const mins = Number(process.argv[2] ?? 30), cars = Number(process.argv[3] ?? 100), id = process.argv[4] ?? "test-highway-gen-wide", GCEVERY = Number(process.env.GCEVERY ?? 5);
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
let { loaded, world: w, me } = worldFor(1, 50, 2.0, true, cars, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 15 });
const noop = () => {}; const ctx = {}; for (const m of "beginPath moveTo lineTo closePath stroke fill arc rect save restore translate rotate scale setTransform fillRect strokeRect clip quadraticCurveTo bezierCurveTo fillText strokeText drawImage roundRect ellipse setLineDash".split(" ")) ctx[m] = noop;
ctx.measureText = () => ({ width: 10 });
const size = { w: 395, h: 527 }, b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const statics = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [] };
const sc = { me, args: [1], saveWallet: false }, enc = newEncounters(), body = newBody();
const gcs = { minor: [], major: [], other: [] };   // not filled: a PerformanceObserver delivers on the event loop and this loop never yields (found 18 Nov: it read zero collections); run with --trace-gc and read tools/measure/parse-gc.mjs
let chase = null, junctions = junctionsOf(w.course), t60 = 0, ticks = 0;
const frameMs = [], rows = []; let allocBase = process.memoryUsage().heapUsed, framesDone = 0;
const FRAMES = mins * 60 * 60, perTick = 3;   // 60 Hz frames, a 20 Hz tick every third
console.log(`${id}, ${cars} cars, ${mins} min of drive at 60 Hz, a full gc every ${GCEVERY} min`);
/* PROMOTED ALLOCATIONS (env PROMOTED=1, 18 Nov 2026): what fills the OLD generation is what survives a scavenge, and that is what sets how often a major runs (the major's cost is the live heap, 10.132; its FREQUENCY is the promotion rate). The inspector's sampling heap profiler with minor-collected objects EXCLUDED and major-collected objects INCLUDED reports exactly the allocations that outlived at least one scavenge, by the function that made them. */
let session = null;
if (process.env.PROMOTED) { session = new Session(); session.connect(); await session.post("HeapProfiler.enable"); await session.post("HeapProfiler.startSampling", { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: false }); }
const spikes = []; let driven = 0;
for (let f = 0; f < FRAMES; f++) {
  const tFrame = performance.now(); let tickMs = 0;
  if (f % perTick === 0) {
    const tk = performance.now();
    const prev = w; me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me; w = step(withDriver(w, me));
    noticeTick(sc, { me: prev.actors.find((a) => a.player) ?? me, world: prev }, { me, world: w }); encounterTick(enc, me, w); ticks++;
    if (me.atEdge) { me = { ...me, s: 0, v: 0, atEdge: false }; }
    tickMs = performance.now() - tk; driven += (me.v ?? 0) * DT;
  }
  const t0 = tFrame;
  const carry = (f % perTick) * DT / perTick;
  beginBodyFrame(body); body.dt = 1 / 60;
  const actors = [];
  for (const a of w.actors) { if (a.shadow) continue; const p = a.player ? driverPose(a, w.course) : poseOf(w, a); const bd = bodyOf(body, w, a, carry, 1 / 60); actors.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot ?? p.heading, colour: "#c33", kind: a.kind, length: p.length, width: p.width, v: a.v, body: bd }); }
  endBodyFrame(body);
  const me2 = actors.find((a) => a.id === me.id) ?? actors[0];
  if (me2) { chase = chaseStep(chase ?? newChase(me2, me2.heading), { ...me2, v: me.v ?? 10 }, 1 / 60); drawFrame(ctx, size, { ...statics, junctions, cam: chase, rot: chase.rot, k: zoomFor(size.w, size.h, chase.lead), tilt: false, actors, t: w.t + carry, lights: w.lights }); }
  const fms = performance.now() - t0; frameMs.push(fms); framesDone++;
  if (fms > 12) spikes.push({ at: Math.round(performance.now()), f, minute: (f / 3600).toFixed(2), frameMs: +fms.toFixed(1), tickMs: +tickMs.toFixed(1), km: +(driven / 1000).toFixed(3), sec: +(f / 60).toFixed(1) });
  if ((f + 1) % (60 * 60) === 0) {
    const m = (f + 1) / 3600, fm = frameMs.splice(0).sort((x, y) => x - y), sum = (a) => a.reduce((x, y) => x + y, 0), mx = (a) => (a.length ? Math.max(...a) : 0);
    const allocMB = (process.memoryUsage().heapUsed - allocBase) / 1048576;   // net heap change over the minute, collections included: only meaningful beside the gc counts
    let heap = "-"; if (m % GCEVERY === 0) { global.gc(); global.gc(); heap = `${(process.memoryUsage().heapUsed / 1048576).toFixed(1)} MB`; } allocBase = process.memoryUsage().heapUsed;
    rows.push({ m, fm50: fm[fm.length >> 1], fm95: fm[Math.floor(fm.length * 0.95)] });
    console.log(`  min ${String(m).padStart(2)}: frame script median ${fm[fm.length >> 1].toFixed(2)} p95 ${fm[Math.floor(fm.length * 0.95)].toFixed(2)} max ${fm[fm.length - 1].toFixed(1)} ms | gc minor ${gcs.minor.length} (total ${sum(gcs.minor).toFixed(0)} ms, longest ${mx(gcs.minor).toFixed(1)}) major ${gcs.major.length} (total ${sum(gcs.major).toFixed(0)} ms, longest ${mx(gcs.major).toFixed(1)}) | heap after a full gc: ${heap} | cars ${w.actors.length}`);
    gcs.minor.length = 0; gcs.major.length = 0; gcs.other.length = 0;
  }
}
const first = rows.slice(0, 3), last = rows.slice(-3), avg = (a, k) => a.reduce((s, r) => s + r[k], 0) / a.length;
console.log(`frame script, first 3 minutes against last 3: median ${avg(first, "fm50").toFixed(2)} -> ${avg(last, "fm50").toFixed(2)} ms, p95 ${avg(first, "fm95").toFixed(2)} -> ${avg(last, "fm95").toFixed(2)} ms`);
console.log(`SPIKES over 12 ms (a frame includes its tick when it has one): ${spikes.length} in ${(FRAMES / 3600).toFixed(0)} min`);
for (const sp of spikes.slice(0, 40)) console.log(`  process clock ${sp.at} ms: t=${sp.sec}s (min ${sp.minute}) frame ${sp.frameMs} ms of which the sim tick ${sp.tickMs} ms, ${sp.km} km driven`);
console.log(`DRIVEN ${(driven / 1000).toFixed(1)} km`);
if (session) {
  const { profile } = await session.post("HeapProfiler.getSamplingProfile"), agg = new Map();
  const walk = (n) => { const cf = n.callFrame, k = `${cf.functionName || "(anon)"} ${cf.url.split("/").pop()}:${cf.lineNumber + 1}`; agg.set(k, (agg.get(k) ?? 0) + (n.selfSize ?? 0)); for (const c of n.children ?? []) walk(c); };
  walk(profile.head);
  const total = [...agg.values()].reduce((a, b) => a + b, 0), secs = FRAMES / 60;
  console.log(`PROMOTED ALLOCATIONS (those that survived a scavenge), ${(total / 1048576).toFixed(0)} MB over ${secs} s of drive = ${(total / 1048576 / secs).toFixed(1)} MB a second of drive; by allocating function:`);
  for (const [k, b] of [...agg.entries()].sort((x, y) => y[1] - x[1]).slice(0, 18)) console.log(`  ${(100 * b / total).toFixed(1).padStart(5)}%  ${(b / 1048576).toFixed(1).padStart(6)} MB  ${k}`);
}
