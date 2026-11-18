/* THE PAGE'S FRAME LOOP, PER FRAME (DECISIONS 10.137; the lead: "do not aggregate: a median is what hid this for a week"). Runs the page's own pacing -- the accumulator `owed += dt` clamped to 0.25 s, `pageMore` (at most PAGE_STEPS ticks a
   frame, and no more once the steps cost PAGE_BUDGET), `pageLeft` dropping what is still owed -- over the same work page-loop-long.mjs does (the player driving, poses, body motion, the real drawFrame on a stub canvas), on a VIRTUAL
   CLOCK: a frame's callback costs what it really cost here times `scale` (a slower device), and the next frame arrives at the next 60 Hz boundary after the callback ends, never sooner. So a long frame makes the next dt larger,
   which makes more steps owed, which is the catch-up feedback the lead named; whether it spirals is read off the series, not assumed.
   Per frame it records the gap before it, the ticks it ran, the step's own ms, the rest of the callback, and what it dropped. It then reports: the steps-per-frame distribution; the gap distribution; how many gaps were over 50 ms and
   what the frame BEFORE each did (carried a step, carried several, carried none); runs of long gaps; and the autocorrelation of the gap series (a spiral shows as a long gap following a long gap).
   Usage: node tools/measure/frame-series.mjs [seconds=120] [scale=1] [cars=100] [map=test-highway-gen-wide]   (writes tools/scratch/frames-<scale>.json) */
import { writeFileSync, mkdirSync } from "node:fs";
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, driverPose } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { pageMore, pageLeft, PAGE_STEPS, PAGE_BUDGET } from "../../src/sim/pace.js";
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

const seconds = Number(process.argv[2] ?? 120), scale = Number(process.argv[3] ?? 1), cars = Number(process.argv[4] ?? 100), id = process.argv[5] ?? "test-highway-gen-wide";
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
let { loaded, world: w, me } = worldFor(1, 50, 2.0, true, cars, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 15 });
const noop = () => {}; const ctx = {}; for (const m of "beginPath moveTo lineTo closePath stroke fill arc rect save restore translate rotate scale setTransform fillRect strokeRect clip quadraticCurveTo bezierCurveTo fillText strokeText drawImage ellipse clearRect setLineDash".split(" ")) ctx[m] = noop;
ctx.measureText = () => ({ width: 10 });
const size = { w: 395, h: 527 }, b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const statics = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [] };
const sc = { me, args: [1], saveWallet: false }, enc = newEncounters(), body = newBody(), junctions = junctionsOf(w.course);
const VS = 1000 / 60;
let vt = 0, lastVt = null, owed = 0, chase = null;
const fr = [];
const N = Math.round(seconds * 60);
for (let f = 0; f < N; f++) {
  const gap = lastVt == null ? 0 : vt - lastVt, dt = lastVt == null ? 0 : Math.min(0.25, Math.max(0, gap / 1000)); lastVt = vt;
  const t0 = performance.now();
  owed += dt;
  let steps = 0, stepMs = 0, tickMs = 0;
  const sp0 = performance.now();
  for (; pageMore(owed, steps, (performance.now() - sp0) * scale); steps++) {
    owed -= DT;
    const tk = performance.now(), prev = w;
    me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me;
    const ts = performance.now(); w = step(withDriver(w, me)); stepMs += performance.now() - ts;
    noticeTick(sc, { me: prev.actors.find((a) => a.player) ?? me, world: prev }, { me, world: w }); encounterTick(enc, me, w);
    if (me.atEdge) me = { ...me, s: 0, v: 0, atEdge: false };
    tickMs += performance.now() - tk;
  }
  const dropped = Math.max(0, owed - DT); owed = pageLeft(owed);
  const carry = owed;
  beginBodyFrame(body); body.dt = 1 / 60;
  const actors = [];
  for (const a of w.actors) { if (a.shadow) continue; const p = a.player ? driverPose(a, w.course) : poseOf(w, a); const bd = bodyOf(body, w, a, carry, 1 / 60); actors.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot ?? p.heading, colour: "#c33", kind: a.kind, length: p.length, width: p.width, v: a.v, body: bd }); }
  endBodyFrame(body);
  const me2 = actors.find((a) => a.id === me.id) ?? actors[0];
  if (me2) { chase = chaseStep(chase ?? newChase(me2, me2.heading), { ...me2, v: me.v ?? 10 }, 1 / 60); drawFrame(ctx, size, { ...statics, junctions, cam: chase, rot: chase.rot, k: zoomFor(size.w, size.h, chase.lead), tilt: false, actors, t: w.t + carry, lights: w.lights }); }
  const work = (performance.now() - t0) * scale;
  fr.push({ f, gap, steps, stepMs: stepMs * scale, tickMs: tickMs * scale, drawMs: work - tickMs * scale, work, dropped });
  vt = Math.max(vt + VS, Math.ceil((vt + work) / VS - 1e-9) * VS);   // the next frame arrives at the first 60 Hz boundary after this callback ends
}
const g = fr.slice(1), pc = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`${id}, ${cars} cars, ${seconds} s of virtual drive, callback cost x${scale}; PAGE_STEPS ${PAGE_STEPS}, PAGE_BUDGET ${PAGE_BUDGET} ms`);
const hist = {}; for (const x of g) hist[x.steps] = (hist[x.steps] ?? 0) + 1;
console.log("STEPS PER FRAME:", Object.entries(hist).map(([k, v]) => `${k}: ${v} (${(100 * v / g.length).toFixed(1)}%)`).join("   "), `  [more than one: ${g.filter((x) => x.steps > 1).length}; frames that dropped owed time: ${g.filter((x) => x.dropped > 0).length}]`);
const gaps = g.map((x) => x.gap);
console.log(`GAP (ms between frames): median ${pc(gaps, 0.5).toFixed(1)}, p95 ${pc(gaps, 0.95).toFixed(1)}, p99 ${pc(gaps, 0.99).toFixed(1)}, max ${Math.max(...gaps).toFixed(0)}; fps ${(1000 * g.length / gaps.reduce((a, c) => a + c, 0)).toFixed(1)}; over 50 ms ${gaps.filter((x) => x > 50).length} (${(gaps.filter((x) => x > 50).length / (gaps.reduce((a, c) => a + c, 0) / 1000)).toFixed(2)} a second)`);
console.log(`CALLBACK: step median ${pc(g.filter((x) => x.steps).map((x) => x.stepMs), 0.5).toFixed(1)} p99 ${pc(g.filter((x) => x.steps).map((x) => x.stepMs), 0.99).toFixed(1)} max ${Math.max(...g.map((x) => x.stepMs)).toFixed(1)} ms; whole callback median ${pc(g.map((x) => x.work), 0.5).toFixed(1)} p99 ${pc(g.map((x) => x.work), 0.99).toFixed(1)} max ${Math.max(...g.map((x) => x.work)).toFixed(1)} ms`);
/* the correlation: for each long gap, what the frame BEFORE it did */
const by = { none: 0, one: 0, several: 0 }, all = { none: 0, one: 0, several: 0 };
for (let i = 1; i < fr.length; i++) { const p = fr[i - 1], k = p.steps === 0 ? "none" : p.steps === 1 ? "one" : "several"; all[k]++; if (fr[i].gap > 50) by[k]++; }
console.log("LONG GAPS (over 50 ms) BY WHAT THE FRAME BEFORE CARRIED (long / frames of that kind):", Object.keys(by).map((k) => `${k} step${k === "none" ? "s" : ""}: ${by[k]}/${all[k]} = ${(100 * by[k] / Math.max(1, all[k])).toFixed(1)}%`).join("   "));
const idx = []; for (let i = 1; i < fr.length; i++) if (fr[i].gap > 50) idx.push(i);
let runs = 0, longest = 0, cur = 0; for (let i = 1; i < fr.length; i++) { if (fr[i].gap > 50) { cur++; if (cur === 1) runs++; longest = Math.max(longest, cur); } else cur = 0; }
const after = idx.filter((i) => fr[i - 1].gap > 50).length;
console.log(`RUNS: ${idx.length} long gaps in ${runs} runs, the longest ${longest} frames; ${after} of ${idx.length} long gaps directly follow another long gap (chance, if independent: ${(100 * idx.length / fr.length).toFixed(1)}% of them would)`);
mkdirSync("tools/scratch", { recursive: true }); writeFileSync(`tools/scratch/frames-x${scale}.json`, JSON.stringify(fr));
