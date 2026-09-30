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
import { fillZone, fillLots } from "./generate.js";
import { loadMap } from "./load.js";

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
  /* THE PLACES TO LOOK, as data: these were the view buttons hard-coded
     into #/map, and now the map carries them like any test map. */
  m.sections = [
    { id: "crossroads", name: "the crossroads", look: { x: 400, y: 400 }, start: { road: "A-north", end: "end" }, judge: "Signals: who goes on the green, who waits, and left turns across oncoming traffic." },
    { id: "tee", name: "the T", look: { x: 800, y: 400 }, judge: "A stop on the minor leg: drivers wait for a real gap in the through traffic." },
    { id: "fiveway", name: "the five-way", look: { x: 400, y: 800 }, judge: "Five legs and stop signs: whose turn it is." },
    { id: "arterial", name: "the arterial", look: { x: 1250, y: 400 }, judge: "Turn bays and protected left arrows: lefts leave from the bay, on their arrow." },
    { id: "overpass", name: "the overpass", look: { x: 600, y: 800, z: 3 }, judge: "One road over another with no intersection: cars under it are drawn under it." },
    { id: "hill", name: "the hill", look: { x: 600, y: 400, z: 3 }, judge: "A crest on the arterial." },
  ];
  return m;
}

/* A STAND-IN FOR THE MAINTAINER'S BLOCKOUT (SIMULATOR.md stage 5) --
   throwaway, and labelled as one, so generation inside districts has
   something to be built and checked against before his own exists. The
   shape of a blockout and nothing more: an arterial loop about 1.4 by
   0.9 km, a collector through the middle on signals, the big roads
   running on out of the city at the corners, and two districts --
   residential to the west, commercial to the east -- with NO streets in
   them. Generating the streets is the editor's job (map/generate.js). */
export function testCity0() {
  const m = emptyMap("city0", "Stand-in city (blockout only)");
  const P = (x, y) => ({ x, y, z: 0 });
  m.roads.push(
    road({ id: "art-n", kind: "arterial", points: [P(0, 0), P(700, 0)] }),
    road({ id: "art-n2", kind: "arterial", points: [P(700, 0), P(1400, 0)] }),
    road({ id: "art-e", kind: "arterial", points: [P(1400, 0), P(1400, 900)] }),
    road({ id: "art-s2", kind: "arterial", points: [P(1400, 900), P(700, 900)] }),
    road({ id: "art-s", kind: "arterial", points: [P(700, 900), P(0, 900)] }),
    road({ id: "art-w", kind: "arterial", points: [P(0, 900), P(0, 0)] }),
    road({ id: "col", kind: "collector", points: [P(700, 0), P(700, 900)], control: { start: "signal", end: "signal" } }),
    road({ id: "out-nw", kind: "arterial", points: [P(0, 0), P(-250, -250)] }),
    road({ id: "out-ne", kind: "arterial", points: [P(1400, 0), P(1650, -250)] }),
    road({ id: "out-se", kind: "arterial", points: [P(1400, 900), P(1650, 1150)] }),
    road({ id: "out-sw", kind: "arterial", points: [P(0, 900), P(-250, 1150)] }),
    road({ id: "out-n", kind: "collector", points: [P(700, 0), P(700, -300)] }),
    road({ id: "out-s", kind: "collector", points: [P(700, 900), P(700, 1200)] }),
  );
  m.zones.push(
    { id: "west", kind: "residential", density: 0.5, polygon: [P(0, 0), P(700, 0), P(700, 900), P(0, 900)] },
    { id: "east", kind: "commercial", density: 0.5, polygon: [P(700, 0), P(1400, 0), P(1400, 900), P(700, 900)] },
  );
  return m;
}

/* THE STAND-IN CITY, READY TO DRIVE: the blockout above with both
   districts filled -- streets, buildings -- and a character each, the
   west's people rolling their stops and the east's tailgating, so the
   two can be told apart by watching. Its sections are chosen FROM the
   generated map (a street in each district, a T where a neighbourhood
   meets the arterial), not typed in as coordinates, so they stay true if
   the generator changes. Still a stand-in for the maintainer's blockout. */
export function testCityReady() {
  let m = testCity0();
  m = { ...m, id: "city0-ready", name: "Stand-in city, ready to drive", zones: m.zones.map((z) => ({ ...z, character: z.id === "west" ? "rolling-stops" : "tailgaters" })) };
  for (const z of ["west", "east"]) m = fillZone(m, z).map;
  for (const z of ["west", "east"]) m = fillLots(m, z).map;
  const L = loadMap(m);
  const mid = (r) => r.pts[Math.floor(r.pts.length / 2)];
  const centre = (z) => { const p = m.zones.find((q) => q.id === z).polygon; return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length }; };
  const nodeOf = new Map();
  for (const n of L.nodes) for (const l of n.legs) nodeOf.set(`${l.road}|${l.end}`, n);
  /* The generated street in a district nearest its middle that runs INTO
     an intersection -- somewhere to watch and to start driving from. */
  const streetIn = (z) => {
    const c = centre(z);
    return L.roads.filter((r) => r.id.startsWith(`${z}~`) && nodeOf.has(`${r.id}|end`))
      .sort((a, b) => Math.hypot(mid(a).x - c.x, mid(a).y - c.y) - Math.hypot(mid(b).x - c.x, mid(b).y - c.y))[0];
  };
  const west = streetIn("west"), east = streetIn("east");
  /* A T where a west street meets the northern arterial: left turns off
     the arterial across oncoming traffic, where the rolling-stop bug was. */
  const tee = L.nodes.filter((n) => n.legs.some((l) => l.road.startsWith("art-n")) && n.legs.some((l) => l.road.startsWith("west~")))
    .sort((a, b) => Math.abs(a.at.x - 350) - Math.abs(b.at.x - 350))[0];
  const teeArt = tee?.legs.find((l) => l.road.startsWith("art-n") && l.end === "end");
  m.sections = [
    west && { id: "west", name: "West streets: rolling stops", look: mid(west), start: { road: west.id, end: "end" }, judge: "Most people from here roll their stop signs. Watch the all-way stops: do they come to rest, or crawl through? Compare the east." },
    east && { id: "east", name: "East streets: tailgaters", look: mid(east), start: { road: east.id, end: "end" }, judge: "Most people from here follow close. Do they visibly tailgate, compared with the west?" },
    west && { id: "parked", name: "A parked street", look: mid(west), start: { road: west.id, end: "end" }, judge: "Parked cars in the strip; cars pull out and in at rest. Drive past close: can you clip one?" },
    tee && { id: "tee", name: "Left turns off the arterial", look: tee.at, ...(teeArt ? { start: { road: teeArt.road, end: "end" } } : {}), judge: "Cars turning left off the arterial into the neighbourhood, across oncoming traffic. Do they wait for a real gap?" },
    { id: "collector", name: "The collector on signals", look: { x: 700, y: 450 }, judge: "The collector between the districts, with streets joining it from both sides at the same points." },
    { id: "whole", name: "Performance: the whole city", look: { x: 700, y: 450 }, judge: "Set Cars to 300 and watch: is it smooth on the phone, or does it stutter?" },
  ].filter(Boolean);
  return m;
}

/* SIGNS: a yield crossroads and an uncontrolled one on the same through
   road, so the two can be watched side by side (DECISIONS.md 5.16.4). The
   yield is on the side street's two approaches; the uncontrolled crossroads
   has no sign anywhere. */
export function testSigns() {
  const Y = { x: 400, y: 400 }, U = { x: 1000, y: 400 };
  const m = emptyMap("test-signs", "Signs -- a yield crossroads and an uncontrolled one");
  m.bounds = { x: -50, y: -50, w: 1500, h: 900 };
  m.roads.push(
    road({ id: "west", kind: "collector", points: stroke({ x: 0, y: 400 }, Y) }),
    road({ id: "middle", kind: "collector", points: stroke(Y, U) }),
    road({ id: "east", kind: "collector", points: stroke(U, { x: 1400, y: 400 }) }),
    road({ id: "Y-north", kind: "residential", points: stroke({ x: 400, y: 0 }, Y), control: { start: "none", end: "yield" } }),
    road({ id: "Y-south", kind: "residential", points: stroke({ x: 400, y: 800 }, Y), control: { start: "none", end: "yield" } }),
    road({ id: "U-north", kind: "residential", points: stroke({ x: 1000, y: 0 }, U) }),
    road({ id: "U-south", kind: "residential", points: stroke({ x: 1000, y: 800 }, U) }),
  );
  m.sections = [
    { id: "yield", name: "the yield", look: Y, start: { road: "Y-south", end: "end" }, judge: "Side-street drivers slow to about 20 km/h, give way to the through road, and roll through without stopping when it is clear. The through road never waits for them." },
    { id: "uncontrolled", name: "the uncontrolled crossroads", look: U, start: { road: "U-south", end: "end" }, judge: "No signs: whoever gets there first goes, cars that arrive together defer to the one on their right, and it never locks up." },
  ];
  return m;
}

/* PEDESTRIANS: a four-way stop and an uncontrolled crossroads on one
   collector, a crosswalk on every road end of both (sim/peds.js). */
export function testPeds() {
  const S = { x: 400, y: 400 }, U = { x: 1000, y: 400 };
  const m = emptyMap("test-peds", "Pedestrians -- crosswalks at a four-way stop and an uncontrolled crossroads");
  m.bounds = { x: -50, y: -50, w: 1500, h: 900 };
  const both = { start: true, end: true }, atEnd = { start: false, end: true };
  m.roads.push(
    road({ id: "west", points: stroke({ x: 0, y: 400 }, S), control: { start: "none", end: "stop" }, crosswalk: atEnd }),
    road({ id: "middle", points: stroke(S, U), control: { start: "stop", end: "none" }, crosswalk: both }),
    /* East of the crossroads the collector has a MID-BLOCK crossing: two
       roads meeting end to end, a stop sign each way, a crosswalk -- the
       maintainer's school-zone stop (editor/model.js `addCrossing`). */
    road({ id: "east", points: stroke({ x: 1400, y: 400 }, { x: 1200, y: 400 }), control: { start: "none", end: "stop" }, crosswalk: atEnd }),
    road({ id: "east-in", points: stroke({ x: 1200, y: 400 }, U), control: { start: "stop", end: "none" }, crosswalk: atEnd }),
    road({ id: "S-north", kind: "residential", points: stroke({ x: 400, y: 0 }, S), control: { start: "none", end: "stop" }, crosswalk: atEnd }),
    road({ id: "S-south", kind: "residential", points: stroke({ x: 400, y: 800 }, S), control: { start: "none", end: "stop" }, crosswalk: atEnd }),
    road({ id: "U-north", kind: "residential", points: stroke({ x: 1000, y: 0 }, U), crosswalk: atEnd }),
    road({ id: "U-south", kind: "residential", points: stroke({ x: 1000, y: 800 }, U), crosswalk: atEnd }),
  );
  m.sections = [
    { id: "stop", name: "the four-way stop", look: S, start: { road: "S-south", end: "end" }, judge: "People step off only when the cars could stop; drivers wait for them -- but go once they are past the middle, onto the far half (the near-half rule). A turning car waits behind the crosswalk, not on it." },
    { id: "uncontrolled", name: "the uncontrolled crossroads", look: U, start: { road: "U-south", end: "end" }, judge: "The same with no signs: through traffic slows and waits for people already crossing." },
    { id: "midblock", name: "the mid-block crossing", look: { x: 1200, y: 400 }, start: { road: "east", end: "end" }, judge: "A stop sign each way with no side street, only a crosswalk: everybody stops, and waits while somebody is crossing their half." },
  ];
  return m;
}

/* BUSES (SIMULATOR.md, "3. Bus stops"): a two-lane collector through a
   T-less crossroads with a side street, a curb stop each way along it.
   Bays, passengers and going round a stopped bus come next and will be
   sections here. */
export function testBuses() {
  const X = { x: 800, y: 400 };
  const m = emptyMap("test-buses", "Buses -- curb stops on a two-lane collector");
  m.bounds = { x: -50, y: -50, w: 1700, h: 900 };
  m.roads.push(
    road({ id: "main-w", lanes: 1, points: stroke({ x: 0, y: 400 }, X) }),
    road({ id: "main-e", lanes: 1, points: stroke(X, { x: 1600, y: 400 }) }),
    road({ id: "side-n", kind: "residential", points: stroke({ x: 800, y: 0 }, X), control: { start: "none", end: "stop" } }),
    road({ id: "side-s", kind: "residential", points: stroke({ x: 800, y: 800 }, X), control: { start: "none", end: "stop" } }),
  );
  /* Beside the curb each way: south of the road for eastbound traffic,
     north for westbound (right of travel). */
  m.stops = [
    { id: "east-curb", at: { x: 420, y: 405 }, kind: "curb" },
    { id: "west-curb", at: { x: 1180, y: 395 }, kind: "curb" },
  ];
  m.sections = [
    { id: "curb-east", name: "the eastbound curb stop", look: { x: 420, y: 400 }, start: { road: "main-w", end: "end" }, judge: "A bus pulls up with its front door at the stop and stands there in the lane with its doors open; the traffic behind it queues, and it pulls away when it is done." },
    { id: "curb-west", name: "the westbound curb stop", look: { x: 1180, y: 400 }, start: { road: "main-e", end: "start" }, judge: "The same the other way." },
  ];
  return m;
}

/* THE TEST MAPS, for the Test maps screen: each builds its map on demand
   (the city is generated, so it is built only when opened). */
export const TEST_MAPS = [
  { id: "city", name: "Stand-in city", blurb: "Two neighbourhoods with their own drivers, parked cars, buildings, an arterial loop and a collector on signals.", build: testCityReady },
  { id: "test-peds", name: "Pedestrians", blurb: "Crosswalks at a four-way stop and at an uncontrolled crossroads, and the people who walk them.", build: testPeds },
  { id: "test-signs", name: "Signs", blurb: "A yield crossroads and an uncontrolled crossroads on one through road.", build: testSigns },
  { id: "test-buses", name: "Buses", blurb: "Curb stops on a two-lane collector: a bus stops, stands, and the traffic behind it waits.", build: testBuses },
  { id: "test-1", name: "Test map 1", blurb: "The loop, the T, the crossroads, the five-way, the overpass and the big arterial.", build: testMap1 },
];
