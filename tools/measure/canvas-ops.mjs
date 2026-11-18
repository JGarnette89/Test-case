/* WHAT THE CANVAS IS ASKED TO DO, PER FRAME (DECISIONS 10.138). The page's callback is 14 ms and the frame is 233: the delay is in rasterising, which a main-thread timeline never shows, and which on a phone follows the NUMBER AND KIND of the
   operations recorded, not the JavaScript that recorded them. This counts, on the generated road at 100 cars with the page's chase camera and the real drawFrame: calls by method, how many are strokes and fills of paths, the total
   path segments those carry, state changes (fillStyle, strokeStyle, lineWidth, font, globalAlpha, dash), clips, saves, text, and the share of the canvas each fill covers. Usage: node tools/measure/canvas-ops.mjs [frames=300] [cars=100] [map] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, driverPose } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
import { junctionsOf } from "../../src/sim/graph.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { groundFor } from "../../src/map/load.js";
import { terrain } from "../../src/iso/road.js";
import { drawFrame } from "../../src/iso/draw.js";
import { chaseStep, newChase, zoomFor } from "../../src/iso/chase.js";
import { newBody, beginBodyFrame, bodyOf, endBodyFrame } from "../../src/iso/body.js";
const frames = Number(process.argv[2] ?? 300), cars = Number(process.argv[3] ?? 100), id = process.argv[4] ?? "test-highway-gen-wide";
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
let { loaded, world: w, me } = worldFor(1, 50, 2.0, true, cars, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 15 });
const calls = {}, state = {}; let segs = 0, pathsOpen = 0, pathsFilled = 0, pathsStroked = 0, pathLens = [], curLen = 0, area = 0;
const count = (k) => (calls[k] = (calls[k] ?? 0) + 1);
const ctx = { canvas: { width: 395 * 2, height: 527 * 2 } };
for (const m of "save restore translate rotate scale setTransform clip fillRect strokeRect fillText strokeText drawImage clearRect setLineDash rect ellipse arc quadraticCurveTo bezierCurveTo".split(" ")) ctx[m] = (...a) => { count(m); if (m === "arc" || m === "ellipse" || m === "rect" || m === "quadraticCurveTo" || m === "bezierCurveTo") { segs++; curLen++; } };
ctx.beginPath = () => { count("beginPath"); curLen = 0; };
ctx.moveTo = () => { count("moveTo"); segs++; curLen++; }; ctx.lineTo = () => { count("lineTo"); segs++; curLen++; }; ctx.closePath = () => count("closePath");
ctx.fill = () => { count("fill"); pathsFilled++; pathLens.push(curLen); }; ctx.stroke = () => { count("stroke"); pathsStroked++; pathLens.push(curLen); };
ctx.measureText = () => ({ width: 10 });
for (const p of ["fillStyle", "strokeStyle", "lineWidth", "font", "globalAlpha", "lineCap", "lineJoin", "textAlign", "textBaseline", "globalCompositeOperation", "shadowBlur", "filter"]) { let v; Object.defineProperty(ctx, p, { get: () => v, set: (x) => { if (x !== v) state[p] = (state[p] ?? 0) + 1; v = x; } }); }
const size = { w: 395, h: 527 }, b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const statics = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [] };
const sc = { me, args: [1], saveWallet: false }, body = newBody(), junctions = junctionsOf(w.course);
let chase = null; const per = [];
for (let f = 0; f < frames * 3; f++) {
  if (f % 3 === 0) { me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me; w = step(withDriver(w, me)); }
  if (f < 3 * 60) continue;   // a second of warm-up
  beginBodyFrame(body); body.dt = 1 / 60; const actors = [];
  for (const a of w.actors) { if (a.shadow) continue; const p = a.player ? driverPose(a, w.course) : poseOf(w, a); actors.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot ?? p.heading, colour: "#c33", kind: a.kind, length: p.length, width: p.width, v: a.v, body: bodyOf(body, w, a, 0, 1 / 60) }); }
  endBodyFrame(body);
  const me2 = actors.find((a) => a.id === me.id) ?? actors[0]; chase = chaseStep(chase ?? newChase(me2, me2.heading), { ...me2, v: me.v ?? 10 }, 1 / 60);
  for (const k in calls) calls[k] = 0; for (const k in state) state[k] = 0; segs = 0; pathsFilled = 0; pathsStroked = 0; pathLens = [];
  const d = drawFrame(ctx, size, { ...statics, junctions, cam: chase, rot: chase.rot, k: zoomFor(size.w, size.h, chase.lead), tilt: false, actors, t: w.t, lights: w.lights });
  per.push({ calls: { ...calls }, state: { ...state }, segs, fills: pathsFilled, strokes: pathsStroked, maxLen: Math.max(0, ...pathLens), items: d.items, cells: d.cells, total: Object.values(calls).reduce((a, c) => a + c, 0) });
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, pc = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * a.length)];
console.log(`${id}, ${cars} cars, ${per.length} frames on a ${size.w}x${size.h} css canvas (backing ${size.w * 2}x${size.h * 2})`);
console.log(`CANVAS CALLS a frame: mean ${mean(per.map((x) => x.total)).toFixed(0)}, p95 ${pc(per.map((x) => x.total), 0.95)}, max ${Math.max(...per.map((x) => x.total))}`);
const kinds = new Set(per.flatMap((x) => Object.keys(x.calls))); console.log("  by kind (mean):", [...kinds].map((k) => [k, mean(per.map((x) => x.calls[k] ?? 0))]).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(", "));
console.log(`PATHS a frame: ${mean(per.map((x) => x.fills)).toFixed(0)} fills, ${mean(per.map((x) => x.strokes)).toFixed(0)} strokes, ${mean(per.map((x) => x.segs)).toFixed(0)} segments; the longest single path ${Math.max(...per.map((x) => x.maxLen))} segments`);
console.log("STATE CHANGES a frame (mean):", Object.keys(per[0].state).map((k) => `${k} ${mean(per.map((x) => x.state[k] ?? 0)).toFixed(0)}`).join(", "));
{ // what the items are, and which kind of item makes the strokes (the audit's item list names each; a stroke is counted against the kind drawn when it was made)
  const a = drawFrame(ctx, size, { ...statics, junctions, cam: chase, rot: chase.rot, k: zoomFor(size.w, size.h, chase.lead), tilt: false, actors: [], t: w.t, lights: w.lights }, { audit: true });
  const h = {}; for (const o of a.order) h[o.kind] = (h[o.kind] ?? 0) + 1; console.log("ITEMS BY KIND (no cars):", JSON.stringify(h));
  const h2 = {}; const orig = ctx.stroke; const stackKinds = {}; ctx.stroke = () => { const s = new Error().stack.split("\n")[2]?.trim().replace(/^at /, "").replace(/\(.*[\/]/, "(") ?? "?"; stackKinds[s] = (stackKinds[s] ?? 0) + 1; orig(); };
  drawFrame(ctx, size, { ...statics, junctions, cam: chase, rot: chase.rot, k: zoomFor(size.w, size.h, chase.lead), tilt: false, actors: [], t: w.t, lights: w.lights });
  console.log("STROKES BY CALLER (no cars):", Object.entries(stackKinds).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${v} ${k}`).join("; ")); ctx.stroke = orig;
  const stackFill = {}; const of = ctx.fill; ctx.fill = () => { const s = new Error().stack.split("\n")[2]?.trim().replace(/^at /, "").replace(/\(.*[\/]/, "(") ?? "?"; stackFill[s] = (stackFill[s] ?? 0) + 1; of(); };
  drawFrame(ctx, size, { ...statics, junctions, cam: chase, rot: chase.rot, k: zoomFor(size.w, size.h, chase.lead), tilt: false, actors: [], t: w.t, lights: w.lights });
  console.log("FILLS BY CALLER (no cars):", Object.entries(stackFill).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${v} ${k}`).join("; "));
}
