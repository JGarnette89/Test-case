/* =====================================================================
   HAND-WRITTEN MAPS, as data.

   SIMULATOR.md stage 1 asks for a test map written in a text editor:
   "a loop with a hill, a T, a crossroads, a skewed five-way, an
   overpass". `testMap1` is that map, about a kilometre square, and it
   is what verify-graph.mjs drives traffic through and what `#/map`
   draws. Every stroke is a list of points in metres; the loader does
   the rest (map/load.js). Nothing here is geometry code -- it is the
   kind of file an editor will write.
   ===================================================================== */
import { emptyMap, road } from "./format.js";

/* A straight stroke, or a bowed one: `bow` metres sideways at the
   middle, so a road can bend without anybody computing an arc. */
function stroke(a, b, { n = 24, bow = 0, z = () => 0 } = {}) {
  const pts = [];
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(Math.PI * t) * bow;
    const x = a.x + dx * t + nx * s, y = a.y + dy * t + ny * s;
    pts.push({ x, y, z: z(t, x, y) });
  }
  return pts;
}

/* THE FIRST TEST MAP.

     A (400,400)  crossroads, all-way stop: north edge, west edge, B, C
     B (800,400)  a T on a north-south through road: north edge, D; A stops
     C (400,800)  a skewed five-way: A, west edge, D, and two diagonals to
                  the southern edge -- legs at 0, 45, 135, 180, 270 degrees
     D (800,800)  a T on an east-west through road: C, east edge; B stops

   A-B-D-C-A is the loop. The A-B road carries a hill; the C-A road
   bends; a north-south road crosses C-D at x = 600 seven metres up with
   no node -- the overpass. */
export function testMap1() {
  const A = { x: 400, y: 400 }, B = { x: 800, y: 400 }, C = { x: 400, y: 800 }, D = { x: 800, y: 800 };
  const m = emptyMap("test-1", "Test map 1 — a loop, a T, a crossroads, a five-way, an overpass");
  m.bounds = { x: -50, y: -50, w: 1300, h: 1200 };
  const hill = (t) => 6 * Math.sin(Math.PI * t) ** 2;   // a 6 m rise in the middle of the A-B road
  m.roads.push(
    road({ id: "A-north", kind: "collector", points: stroke({ x: 400, y: 0 }, A), control: { start: "none", end: "stop" } }),
    road({ id: "A-west", kind: "collector", points: stroke({ x: 0, y: 400 }, A), control: { start: "none", end: "stop" } }),
    road({ id: "A-B", kind: "collector", points: stroke(A, B, { z: hill }), control: { start: "stop", end: "stop" } }),
    road({ id: "C-A", kind: "collector", points: stroke(C, A, { bow: 60 }), control: { start: "stop", end: "stop" } }),
    road({ id: "B-north", kind: "collector", points: stroke({ x: 800, y: 0 }, B), control: { start: "none", end: "none" } }),
    road({ id: "B-D", kind: "collector", points: stroke(B, D), control: { start: "none", end: "stop" } }),
    road({ id: "C-west", kind: "collector", points: stroke({ x: 0, y: 800 }, C), control: { start: "none", end: "stop" } }),
    road({ id: "C-D", kind: "collector", points: stroke(C, D), control: { start: "stop", end: "none" } }),
    road({ id: "C-southeast", kind: "residential", points: stroke({ x: 700, y: 1100 }, C), control: { start: "none", end: "stop" } }),
    road({ id: "C-southwest", kind: "residential", points: stroke({ x: 100, y: 1100 }, C), control: { start: "none", end: "stop" } }),
    road({ id: "D-east", kind: "collector", points: stroke(D, { x: 1200, y: 800 }), control: { start: "none", end: "none" } }),
    /* Ends short of the south-east diagonal: drawn to y = 1000 it landed
       exactly on that road and the loader, correctly, made a node of it. */
    road({ id: "over", kind: "collector", points: stroke({ x: 600, y: 600 }, { x: 600, y: 950 }, { z: (t) => 7 * Math.sin(Math.PI * t) ** 2 }), control: { start: "none", end: "none" } }),
  );
  return m;
}
