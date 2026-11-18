/* =====================================================================
   THE LANE MARKINGS, BATCHED, DRAW THE SAME LINES (18 November 2026). A road piece's markings were stroked one segment at a time (beginPath, moveTo, lineTo, stroke each: 1,696 of a frame's 3,944 canvas calls on the generated road); `drawFrame`
   now builds one path per style and strokes it once, with `batchMarkings: false` keeping the old way. A canvas that RECORDS what is stroked (each segment, in order, with the style and width in force when it was stroked) is the instrument.
   Expectations are stated here, not read from the module:
     1. THE SAME LINES: over four maps (one with five lanes and lane lines, a one-way road, collectors with broken centre lines, a residential street with none) and many cameras, the sequence of stroked segments, each with its stroke style and line width, is IDENTICAL
        between the batched and the one-at-a-time draw: the same segments, the same styles, the same order, so the painter's order is untouched.
     2. FEWER STROKES: the batched draw makes at most 85% of the strokes the old one did on the generated road (measured about 81%), and never more on any map.
     3. THE SAME FILLS: the number of fills is equal (nothing else moved).
   Sabotage: a segment dropped from the batched path fails 1; the switch ignored (always the old path) fails 2. Usage: node tools/verify-markings.mjs
   ===================================================================== */
import { loadMap, groundFor } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";
import { junctionsOf } from "../src/sim/graph.js";
import { sidewalksOf } from "../src/map/sidewalks.js";
import { terrain } from "../src/iso/road.js";
import { drawFrame } from "../src/iso/draw.js";
import { chaseStep, newChase, zoomFor } from "../src/iso/chase.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
// BARE WORLD: seedGraph with the options it needs stated; the subject is how roads are drawn, which no sim mechanism touches.
const recorder = () => {
  const log = { strokes: 0, fills: 0, segs: [] };
  let cur = [], last = null;
  const st = { strokeStyle: "", lineWidth: 1 };
  const f = (x) => Math.round(x * 1e4) / 1e4;
  const ctx = new Proxy(st, {
    get: (t, p) => {
      if (p in t) return t[p];
      return (...a) => {
        if (p === "beginPath") { cur = []; last = null; }
        else if (p === "moveTo") { last = [f(a[0]), f(a[1])]; }
        else if (p === "lineTo") { const q = [f(a[0]), f(a[1])]; if (last) cur.push([...last, ...q]); last = q; }
        else if (p === "stroke") { log.strokes++; for (const s of cur) log.segs.push(`${t.strokeStyle}|${t.lineWidth}|${s.join(",")}`); }
        else if (p === "fill") log.fills++;
      };
    },
    set: (t, p, v) => { t[p] = v; return true; },
  });
  return { ctx, log };
};
const size = { w: 395, h: 527 };
let strokesOld = 0, strokesNew = 0, genOld = 0, genNew = 0;
for (const id of ["test-highway-gen-wide", "test-1", "test-highway", "city"]) {
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
  const statics = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }), sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [] };
  let w = seedGraph(1, 50, loaded, { every: 2.0, target: 60, posted: true });
  for (let i = 0; i < 400; i++) w = step(w);
  const junctions = junctionsOf(w.course);
  const actors = w.actors.slice(0, 24).map((a) => { const p = poseOf(w, a); return { id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: "#c33", kind: a.kind, length: p.length, width: p.width, v: a.v }; });
  let frames = 0, differ = 0, first = null, so = 0, sn = 0, fo = 0, fn = 0, segs = 0;
  for (const a of actors) for (const rot of [0, 90, 180, 270]) for (const kz of [1, 2]) {
    const cam = chaseStep(newChase(a, a.heading), { ...a, v: a.v ?? 10 }, 1 / 60), k = zoomFor(size.w, size.h, cam.lead) * kz / 2;
    const draw = (batch) => { const r = recorder(); drawFrame(r.ctx, size, { ...statics, junctions, cam, rot, k, tilt: false, actors, t: w.t, lights: w.lights }, { batchMarkings: batch }); return r.log; };
    const o = draw(false), n = draw(true);
    frames++; so += o.strokes; sn += n.strokes; fo += o.fills; fn += n.fills; segs += n.segs.length;
    if (o.segs.length !== n.segs.length || o.segs.some((s, i) => s !== n.segs[i])) { differ++; first ??= `rot ${rot} x${kz}: ${o.segs.length} segments against ${n.segs.length}`; }
  }
  strokesOld += so; strokesNew += sn; if (id === "test-highway-gen-wide") { genOld = so; genNew = sn; }
  check(differ === 0 && fo === fn && sn <= so, `${id}: ${frames} frames, the stroked segments identical in sequence, style and width (${differ} differ${first ? `, first ${first}`: ""}); ${segs} segments; strokes ${so} -> ${sn} (${(100 * sn / so).toFixed(0)}%); fills ${fo} = ${fn}`);
}
console.log("\n2. FEWER STROKES ON THE GENERATED ROAD");
check(genNew <= 0.85 * genOld, `the generated road: ${genOld} strokes the old way, ${genNew} batched (${(100 * genNew / genOld).toFixed(0)}%, at most 85%)`);
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
