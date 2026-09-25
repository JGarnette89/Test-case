/* =====================================================================
   HAND-WRITTEN MAPS, as data.

   SIMULATOR.md stage 1 asks for a test map written in a text editor:
   "a loop with a hill, a T, a crossroads, a skewed five-way, an
   overpass". `testMap1` is that map, about a kilometre square, and it
   is what verify-graph.mjs drives traffic through and what `#/map`
   draws. Every stroke is a list of points in metres; the loader does
   the rest (map/load.js). Nothing here is geometry code -- it is the
   kind of file an editor will write.

   THE FOUR NODES ARE FOUR DIFFERENT KINDS OF PLACE, on purpose (23
   September): the maintainer asked for varied intersections to judge
   the simulator by, and one control repeated over a whole map was the
   limitation. A (the crossroads) is SIGNALISED, B (a crossroads) is a
   two-way stop on its minor road, C (the five-way) is an all-way stop,
   and D (a T) is UNCONTROLLED -- the through road runs and the rules do
   the rest. Nobody had to add a mechanism for three of the four; they
   are what the per-leg control always meant.

   AND THREE KINDS OF ROAD (24 September: "we need different roads and
   they need to feel different"). An ARTERIAL runs east-west straight
   through A and B -- three lanes each way, 60 km/h, the signal where
   it crosses a collector and priority where it crosses the next one;
   COLLECTORS at 50 with two lanes carry the loop; the streets off the
   five-way are RESIDENTIAL, one lane, 40. The arterial was given B-east
   so it runs through B rather than ending at a T: a three-lane approach
   into a T strands its middle lane, which has no straight ahead and is
   neither the curb lane nor beside the centre line -- which lane may do
   what there is a road marking the format does not carry yet, and a
   rule for the maintainer rather than a guess.

   AND LANES HAVE TO LAND (24 September, the maintainer's ruling: lanes
   "always need to be connected to roads that can accommodate these
   turns, or the lanes need to converge ahead of the intersection"). The
   two collectors into the five-way each continue straight into a
   one-lane residential street, so two lanes cannot both go straight on:
   until the connectivity check existed they merged inside the box.
   Their curb lanes are marked RIGHT TURN ONLY here (`turns`), which is
   how a real road handles a lane that has nowhere to go straight into
   -- and the test map carries a per-lane override because of it.

   AND A BIG ARTERIAL INTERSECTION (25 September: "300 cars seems to
   work, need advanced intersections to see it really work"). E, east of
   B, is two three-lane arterials crossing under signals with TURN BAYS
   (map/bays.js) and PROTECTED LEFT ARROWS (sim/signal.js) on every
   approach. The approaches differ on purpose, so one node shows every
   case: from the west a DOUBLE LEFT (two bays) and a right bay; from the
   east and the north one left bay and a right bay; from the south a left
   bay alone. Its roads are kept to the old map's longest (424 m) or
   near it, because the warm-up on `#/map` is sized by the longest road
   and a 700 m first draft tripled the time to open it at 300 cars.
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
     E (1250,400) two arterials crossing under signals, with turn bays and
                  protected lefts on every approach

   A-B-D-C-A is the loop. The A-B road carries a hill; the C-A road
   bends; a north-south road crosses C-D at x = 600 seven metres up with
   no node -- the overpass. */
export function testMap1() {
  const A = { x: 400, y: 400 }, B = { x: 800, y: 400 }, C = { x: 400, y: 800 }, D = { x: 800, y: 800 };
  const m = emptyMap("test-1", "Test map 1 — a loop, a T, a crossroads, a five-way, an overpass");
  const E = { x: 1250, y: 400 };
  m.bounds = { x: -50, y: -50, w: 1770, h: 1200 };
  const hill = (t) => 6 * Math.sin(Math.PI * t) ** 2;   // a 6 m rise in the middle of the A-B road
  m.roads.push(
    road({ id: "A-north", kind: "collector", points: stroke({ x: 400, y: 0 }, A), control: { start: "none", end: "signal" } }),
    road({ id: "A-west", kind: "arterial", points: stroke({ x: 0, y: 400 }, A), control: { start: "none", end: "signal" } }),
    road({ id: "A-B", kind: "arterial", points: stroke(A, B, { z: hill }), control: { start: "signal", end: "none" } }),
    road({ id: "C-A", kind: "collector", points: stroke(C, A, { bow: 60 }), control: { start: "stop", end: "signal" }, turns: { start: [["left", "straight"], ["right"]] } }),
    road({ id: "B-north", kind: "collector", points: stroke({ x: 800, y: 0 }, B), control: { start: "none", end: "stop" } }),
    road({ id: "B-D", kind: "collector", points: stroke(B, D), control: { start: "stop", end: "none" } }),
    road({ id: "C-west", kind: "residential", points: stroke({ x: 0, y: 800 }, C), control: { start: "none", end: "stop" } }),
    road({ id: "C-D", kind: "collector", points: stroke(C, D), control: { start: "stop", end: "none" }, turns: { start: [["left", "straight"], ["right"]] } }),
    road({ id: "C-southeast", kind: "residential", points: stroke({ x: 700, y: 1100 }, C), control: { start: "none", end: "stop" } }),
    road({ id: "C-southwest", kind: "residential", points: stroke({ x: 100, y: 1100 }, C), control: { start: "none", end: "stop" } }),
    road({ id: "D-east", kind: "collector", points: stroke(D, { x: 1200, y: 800 }), control: { start: "none", end: "none" } }),
    /* Ends short of the south-east diagonal: drawn to y = 1000 it landed
       exactly on that road and the loader, correctly, made a node of it. */
    road({ id: "over", kind: "collector", points: stroke({ x: 600, y: 600 }, { x: 600, y: 950 }, { z: (t) => 7 * Math.sin(Math.PI * t) ** 2 }), control: { start: "none", end: "none" } }),
    /* E and the arterial into it, LAST: the loader names the nodes it
       finds in road order, and listing these after the rest leaves every
       older node its id (n0-n3), which the checks and measurements use. */
    road({ id: "B-east", kind: "arterial", points: stroke(B, E), control: { start: "none", end: "signal" }, bays: { end: { left: 2, right: 1 } }, leftArrow: { end: true } }),
    road({ id: "E-east", kind: "arterial", points: stroke(E, { x: 1670, y: 400 }), control: { start: "signal", end: "none" }, bays: { start: { left: 1, right: 1 } }, leftArrow: { start: true } }),
    road({ id: "E-north", kind: "arterial", points: stroke({ x: 1250, y: 0 }, E), control: { start: "none", end: "signal" }, bays: { end: { left: 1, right: 1 } }, leftArrow: { end: true } }),
    road({ id: "E-south", kind: "arterial", points: stroke(E, { x: 1250, y: 820 }), control: { start: "signal", end: "none" }, bays: { start: { left: 1 } }, leftArrow: { start: true } }),
  );
  return m;
}
