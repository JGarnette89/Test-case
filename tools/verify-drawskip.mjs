/* THE DEVICE BISECT LEAVES OUT WHAT IT SAYS (DECISIONS 10.138). `drawFrame`'s `skip` is a debug switch: the frame counter's `other` time is the canvas's rasterising, so a chip leaves part of the scene undrawn to say which part costs it. Expectations stated here:
     1. DEFAULT UNCHANGED: with no skip the items drawn are those of an explicit null, in order (so every other check's draw is the draw).
     2. "ground": no terrain cell is painted and nothing else changes (every other item stays; the fills fall by exactly the cells').
     3. "height": nothing above the floor is painted (no car, no prop): fewer fills and strokes than the default, the ground still drawn.
     4. "all": no item paints (the canvas gets no fill or stroke from the items).
     5. The page wires it: MapRoad passes `{ skip: skipRef.current }`, builds the context from the chosen attributes, and has both chips (source, the screen being JSX).
   Sabotage: the skip ignored in the paint loop fails 3 and 4; the ground push unguarded fails 2. Usage: node tools/verify-drawskip.mjs */
// THE FILE THIS CHECK READS AS TEXT, which the import graph cannot see (DECISIONS 10.129):
// check-input: ../src/apps/MapRoad.jsx
import fs from "node:fs";
import { loadMap, groundFor } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";
import { junctionsOf } from "../src/sim/graph.js";
import { sidewalksOf } from "../src/map/sidewalks.js";
import { terrain } from "../src/iso/road.js";
import { drawFrame } from "../src/iso/draw.js";
import { chaseStep, newChase, zoomFor } from "../src/iso/chase.js";
let failed = 0; const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
// BARE WORLD: seedGraph with the options it needs stated; the subject is what the draw paints, which no sim mechanism touches.
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-1").build()), b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
const cells = terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground });
let w = seedGraph(1, 50, loaded, { every: 2.0, target: 40, posted: true }); for (let i = 0; i < 300; i++) w = step(w);
const actors = w.actors.slice(0, 25).map((a) => { const p = poseOf(w, a); return { id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: "#c33", kind: a.kind, length: p.length, width: p.width, v: a.v }; });
const size = { w: 395, h: 527 }, a0 = actors[0], cam = chaseStep(newChase(a0, a0.heading), { ...a0, v: 10 }, 1 / 60);
const scene = { roads: loaded.roads.map((road) => ({ road, cars: [] })), terrain: cells, sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [], props: [], junctions: junctionsOf(w.course), cam, rot: 0, k: zoomFor(size.w, size.h, cam.lead), tilt: false, actors, t: w.t, lights: w.lights };
const run = (opts) => {
  const c = { fill: 0, stroke: 0 };
  const ctx = new Proxy({}, { get: (t, p) => (p in c ? () => { c[p]++; } : p in t ? t[p] : () => ({ width: 10 })), set: (t, p, v) => { t[p] = v; return true; } });
  const d = drawFrame(ctx, size, scene, opts); return { c, order: d.order };
};
const base = run({ audit: true }), nul = run({ audit: true, skip: null }), gr = run({ audit: true, skip: "ground" }), hi = run({ audit: true, skip: "height" }), al = run({ audit: true, skip: "all" });
check(base.order.length === nul.order.length && base.order.every((o, i) => o.key === nul.order[i].key && o.kind === nul.order[i].kind) && base.c.fill === nul.c.fill, `default = skip null: ${base.order.length} items, ${base.c.fill} fills, the same in order`);
const cellsIn = base.order.filter((o) => o.kind === "cell").length;
check(cellsIn > 20 && gr.order.filter((o) => o.kind === "cell").length === 0 && gr.order.length === base.order.length - cellsIn && base.c.fill - gr.c.fill === cellsIn, `"ground": the ${cellsIn} terrain cells are gone, every other item stays (${gr.order.length} of ${base.order.length}), ${base.c.fill - gr.c.fill} fewer fills = the cells'`);
check(hi.c.fill < base.c.fill && hi.c.fill > 0 && hi.c.stroke < base.c.stroke, `"height": only the floor paints: ${hi.c.fill} fills against ${base.c.fill}, ${hi.c.stroke} strokes against ${base.c.stroke}, the ground still drawn`);
check(al.c.fill === 0 && al.c.stroke === 0, `"all": no item paints: ${al.c.fill} fills, ${al.c.stroke} strokes (default ${base.c.fill}/${base.c.stroke})`);
const src = fs.readFileSync(new URL("../src/apps/MapRoad.jsx", import.meta.url), "utf8");
check(/\{ skip: skipRef\.current \}/.test(src) && /Layers: \$\{SKIP_LABEL/.test(src) && /Canvas: \$\{cvMode\}/.test(src) && /getContext\("2d", CV_ATTRS\[cvRef\.current\]\)/.test(src), "the page passes the skip to drawFrame, builds the context from the chosen attributes, and has both chips");
console.log(failed ? `\n${failed} FAILED` : "\nall passed"); process.exit(failed ? 1 : 0);
