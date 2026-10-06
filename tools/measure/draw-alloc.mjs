/* WHO ALLOCATES IN A DRAWN FRAME. The same sampling as step-alloc.mjs, on
   drawFrame alone, at street zoom on the city with its traffic, walkers
   and parked cars -- the garbage the renderer makes sixty times a second.

   Usage: node tools/measure/draw-alloc.mjs [map=city] [cars=200] [frames=300] [k=13.7] [omit=roads,sidewalks,...] */
import { Session } from "node:inspector/promises";
import { loadMap, groundFor } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { junctionsOf } from "../../src/sim/graph.js";
import { parkedPoses } from "../../src/sim/parking.js";
import { walkerPose } from "../../src/sim/walkers.js";
import { sidewalksOf } from "../../src/map/sidewalks.js";
import { terrain } from "../../src/iso/road.js";
import { drawFrame } from "../../src/iso/draw.js";

const [mapId = "city", carsArg = "200", framesArg = "300", kArg = "13.7", omitArg = ""] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
let w = seedGraph(1, 50, loaded, { every: 2.0, target: Number(carsArg), posted: true, walkers: true });
const b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const sc = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), junctions: junctionsOf(w.course), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: (loaded.props ?? []).map((p) => ({ x: p.at.x, y: p.at.y, heading: p.heading, l: p.l, w: p.w, h: p.h })), groundAt: ground };
const actors = [...parkedPoses(w.course, w.parked), ...w.actors.map((a) => { const p = poseOf(w, a); return { id: a.id, n: a.n, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: a.colour, kind: a.kind, length: p.length, width: p.width, height: p.height }; }), ...(w.walkers ?? []).map((q) => ({ id: q.id, n: q.n, ...walkerPose(w, q), ped: true }))];
for (const key of omitArg.split(",").filter(Boolean)) sc[key] = [];   // bisecting: a kind of content left out
const car = actors.find((a) => !a.ped && !a.parked);
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 824, h: 1830 }, N = Number(framesArg);

const session = new Session();
session.connect();
await session.post("HeapProfiler.enable");
await session.post("HeapProfiler.startSampling", { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
let last; for (let i = 0; i < N; i++) last = drawFrame(ctx, size, { ...sc, cam: { x: car.x, y: car.y, z: 0 }, rot: (i * 0.3) % 360, k: Number(kArg), tilt: false, actors: omitArg.includes("actors") ? [] : actors, t: i / 60 });
const { profile } = await session.post("HeapProfiler.stopSampling");
console.log("last frame:", JSON.stringify(last));
const bytes = new Map();
let all = 0;
const walk = (n) => {
  const nm = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber + 1}`;
  if (n.selfSize) { bytes.set(nm, (bytes.get(nm) ?? 0) + n.selfSize); all += n.selfSize; }
  for (const c of n.children ?? []) walk(c);
};
walk(profile.head);
console.log(`${N} frames at k ${kArg}: ${(all / N / 1024).toFixed(0)} KB allocated a frame (sampled), ${(all / N / 1024 * 60 / 1024).toFixed(1)} MB a second at 60 fps; ${actors.length} things to draw (${actors.filter((a) => a.parked).length} parked)`);
for (const [nm, x] of [...bytes.entries()].sort((a, c) => c[1] - a[1]).slice(0, 14)) console.log(`   ${(x / N / 1024).toFixed(1).padStart(7)} KB/frame  ${(100 * x / all).toFixed(0).padStart(3)}%  ${nm}`);
