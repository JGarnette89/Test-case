/* =====================================================================
   THE TRIAL CITY (3 November; the maintainer: "Go with the bench brief
   plus a highway section, look at adding proper on and off ramps that
   connect to the greater road network. This map can be a trial for the
   final map, large and built with purpose to resemble a city (with
   traffic having somewhere to come from and go to)").

   THE CITY is the bench's brief (iso/benchworld.js BENCH_BRIEF: every
   intersection type, a downtown, buses) made LARGE -- four blocks by
   three, 2 x 1.5 km -- with mixed district characters, so neighbourhoods
   drive differently. MAP-INVENTORY.md found the bench brief already most
   of a combined city; what it lacked was the highway half.

   THE HIGHWAY is a divided freeway along the south side: two one-way
   carriageways of three lanes, open at both ends -- through traffic
   comes in at one end and leaves at the other, so it has somewhere to
   come from and go to (sim/crossing.js `edgesOf`). Straight and level
   through the interchanges (every junction on level ground, as
   map/highway.js found), bending away beyond them.

   TWO DIAMOND INTERCHANGES join it to the city, at the west and east
   arterials. Each arterial crosses the highway on a bridge; each
   carriageway has an off-ramp to a terminal intersection on the arterial
   and an on-ramp back, joining by an acceleration lane (map/accel.js),
   never a yield. The west pair of terminals is signalled, the east pair
   stops the off-ramps -- both are real Ontario practice. The three
   collectors cross over the highway on bridges with no ramps and carry on
   to the map's south edge, as the arterials do.

   A LANE DROP, built the only honest way the network allows: eastbound,
   the curb lane leaves at the east interchange as an exit-only lane, two
   lanes carry on past the entrance, and the third comes back at a
   two-road join 1 km past it (map/highway.js: lanes change at junctions,
   never mid-road).

   Pure. No React, no DOM.
   ===================================================================== */
import { road } from "./format.js";
import { mapFromBrief } from "./brief.js";
import { setRoadControl } from "../editor/model.js";

/* Flagged design constants. */
const BRIEF = { size: "large", arterials: "loop", everyType: true, downtown: true, buses: true, drivers: "mixed" };
const YH = 2000;          // m: the highway's centreline, 500 m south of the city's south arterial
const HALF = 8;           // m: carriageway centreline off the highway's: 3 lanes (5.4 m) and half a 5 m median
const TERM = 200;         // m: a ramp terminal is this far either side of the highway, on the crossing road
/* A ramp leaves or joins at 35 degrees, as on the loop: shallower and the
   graph reads the split as going STRAIGHT on (graph.js STRAIGHT_TOL), and
   every through lane would be told it may take the one-lane ramp. So the
   ramp's length along the highway follows from the angle and the terminal. */
const RAMP_ANG = 35;
const RAMP_X = Math.round((TERM - HALF) / Math.tan((RAMP_ANG * Math.PI) / 180));   // m: 274
const BRIDGE_TOP = 7.5;   // m over the highway, as test-highway's bridge
const PLATEAU = 30;       // m either side of the highway centreline the deck holds its height
const SOUTH = 2700;       // m: where the roads south of the highway leave the map
const STRAIGHT = [-900, 3600];   // x: the highway runs straight and level between these
const BEND_R = 1000, BEND_DEG = 30, TAIL = 800;   // beyond them: a 1 km bend through 30 degrees, then straight to the edge
const ACCEL = 350;        // m of acceleration lane, as on the loop and the open highway (a flagged figure)
const STEP = 4;           // m between highway points: the loader reads curvature between its own samples
const r2 = (v) => Math.round(v * 10000) / 10000;

/* The highway's centreline, eastward, as points with headings. */
function centreline() {
  /* One end: from the straight's end, heading `h0`, bending right of
     travel through BEND_DEG, then straight for TAIL. */
  const tail = (x0, h0) => {
    const pts = [];
    let x = x0, y = YH, h = h0;
    const bend = BEND_R * (BEND_DEG * Math.PI) / 180;
    for (let u = STEP; u <= bend + TAIL + 1e-9; u += STEP) {
      if (u <= bend) h += STEP / BEND_R;
      x += Math.cos(h) * STEP; y += Math.sin(h) * STEP;
      pts.push({ x, y, h });
    }
    return pts;
  };
  const west = tail(STRAIGHT[0], Math.PI).reverse().map((p) => ({ ...p, h: p.h - Math.PI }));
  const mid = [];
  for (let x = STRAIGHT[0]; x <= STRAIGHT[1] + 1e-9; x += STEP) mid.push({ x, y: YH, h: 0 });
  const east = tail(STRAIGHT[1], 0);
  return [...west, ...mid, ...east];
}

/* A carriageway: the centreline offset to the right of ITS travel. */
const offset = (pts, d) => pts.map((p) => ({ x: r2(p.x - Math.sin(p.h) * d), y: r2(p.y + Math.cos(p.h) * d), z: 0 }));

/* Cut a carriageway (points in travel order, on the straight where cut)
   at the given x positions: pieces whose ends meet exactly there. */
function cutAt(pts, xs, eastward) {
  const order = eastward ? xs.slice().sort((a, b) => a - b) : xs.slice().sort((a, b) => b - a);
  const pieces = [];
  let cur = [];
  let k = 0;
  for (const p of pts) {
    while (k < order.length && (eastward ? p.x > order[k] + 1e-6 : p.x < order[k] - 1e-6)) {
      const cut = { x: order[k], y: cur.at(-1).y, z: 0 };
      cur.push(cut);
      pieces.push(cur);
      cur = [cut];
      k++;
    }
    if (!cur.length || Math.hypot(p.x - cur.at(-1).x, p.y - cur.at(-1).y) > 0.5) cur.push(p);
  }
  pieces.push(cur);
  return pieces;
}

/* The deck over the highway: flat at the terminals, up to BRIDGE_TOP over
   both carriageways, eased (a vertical curve). `y` along a north-south road. */
const deck = (y) => {
  const d = Math.abs(y - YH);
  if (d <= PLATEAU) return BRIDGE_TOP;
  if (d >= TERM) return 0;
  const t = (TERM - d) / (TERM - PLATEAU);
  return r2(BRIDGE_TOP * t * t * (3 - 2 * t));
};
const northSouth = (x, y0, y1, step = 5) => {
  const pts = [];
  for (let y = y0; y < y1; y += step) pts.push({ x, y, z: deck(y) });
  pts.push({ x, y: y1, z: deck(y1) });
  return pts;
};

export function trialCity(seed = 1) {
  let m = mapFromBrief(BRIEF, seed);
  m = { ...m, id: "trial-city", name: "Trial city -- the bench brief, large, with a highway and two interchanges" };
  const W = 2000, H = 1500;   // BRIEF.size.large: 4 x 3 blocks of 500 m (brief.js CELL)
  const xs = [0, 500, 1000, 1500, 2000];

  /* THE CROSSING ROADS. Each north-south road's stub past the city's
     south edge (the brief carries every line 250 m OUT) is replaced by a
     road that goes on over the highway to the map's edge. */
  const stub = (x) => m.roads.find((r) => {
    const a = r.points[0], b = r.points.at(-1);
    return Math.abs(a.x - x) < 0.5 && Math.abs(b.x - x) < 0.5 && Math.abs(Math.min(a.y, b.y) - H) < 0.5 && Math.max(a.y, b.y) > H + 1;
  });
  const interchange = { 0: "signal", 2000: "stop" };
  for (const x of xs) {
    const old = stub(x);
    if (!old) throw new Error(`trialCity: no stub south of the city at x = ${x}`);
    const kind = old.kind, lanes = old.lanes;
    /* The stub's city end is an approach to the south arterial's corner:
       its control there -- a sign, a signal -- its left arrow and its
       crosswalk go to the road that replaces it, or that corner loses its
       south approach's control (three stop signs were dropped so). */
    const atCity = Math.abs(old.points[0].y - H) < 0.5 ? "start" : "end";
    const ctl = (m.signs ?? []).find((q) => q.road === old.id && q.end === atCity && (q.kind === "stop" || q.kind === "yield"))?.kind ?? old.control?.[atCity] ?? "none";
    const arrow = !!old.leftArrow?.[atCity], walk = !!old.crosswalk?.[atCity];
    m = { ...m, roads: m.roads.filter((r) => r.id !== old.id), signs: (m.signs ?? []).filter((q) => q.road !== old.id) };
    const first = interchange[x] ? `s${x}-n` : `s${x}`;
    if (!interchange[x]) m.roads.push(road({ id: first, kind, lanes, points: northSouth(x, H, SOUTH) }));
    else m.roads.push(
      road({ id: first, kind, lanes, points: northSouth(x, H, YH - TERM) }),
      road({ id: `s${x}-bridge`, kind, lanes, points: northSouth(x, YH - TERM, YH + TERM) }),
      road({ id: `s${x}-s`, kind, lanes, points: northSouth(x, YH + TERM, SOUTH) }),
    );
    if (ctl !== "none") m = setRoadControl(m, first, "start", ctl);
    if (arrow || walk) m = { ...m, roads: m.roads.map((r) => (r.id === first ? { ...r, ...(arrow ? { leftArrow: { start: true } } : {}), ...(walk ? { crosswalk: { start: true } } : {}) } : r)) };
  }

  /* THE HIGHWAY. Junctions: a ramp RAMP_X either side of each
     interchange, and the lane gain 1 km past the east entrance. */
  const c = centreline();
  const eb = offset(c, HALF);
  const wb = offset(c.slice().reverse().map((p) => ({ ...p, h: p.h + Math.PI })), HALF);
  /* The lane gain 1 km past the east entrance: an acceleration lane must open and close in the first half of the road after it (the next node's approach starts at its midpoint), and 350 m plus its taper does not fit in half of 600. */
  const GAIN = 2000 + RAMP_X + 1000;
  const ebCuts = [-RAMP_X, RAMP_X, 2000 - RAMP_X, 2000 + RAMP_X, GAIN];
  const wbCuts = [-RAMP_X, RAMP_X, 2000 - RAMP_X, 2000 + RAMP_X];
  const ebPieces = cutAt(eb, ebCuts, true), wbPieces = cutAt(wb, wbCuts, false);
  /* Eastbound, west to east: [edge..-400] [-400..400] [400..1600] [1600..2400] [2400..3400] [3400..edge].
     The curb lane leaves at 1600 (exit only), two lanes carry on, three again from 3400. */
  const ebLanes = [3, 3, 3, 2, 2, 3];
  ebPieces.forEach((pts, i) => {
    const extra = {};
    if (i === 2) extra.turns = { end: [["straight"], ["straight"], ["right"]] };   // the curb lane: exit only
    if (i === 2 || i === 4) extra.accel = { start: { from: i === 2 ? "on-eb-0" : "on-eb-2000", length: ACCEL } };
    m.roads.push(road({ id: `hw-eb-${i}`, kind: "highway", lanes: ebLanes[i], oneWay: true, points: pts, ...extra }));
  });
  /* Westbound, east to west: [edge..2400] [2400..1600] [1600..400] [400..-400] [-400..edge]. */
  wbPieces.forEach((pts, i) => {
    const extra = {};
    if (i === 2 || i === 4) extra.accel = { start: { from: i === 2 ? "on-wb-2000" : "on-wb-0", length: ACCEL } };
    m.roads.push(road({ id: `hw-wb-${i}`, kind: "highway", lanes: 3, oneWay: true, points: pts, ...extra }));
  });

  /* THE RAMPS, one lane each, one way: off-ramps at 60, on-ramps at 80, as on the loop. */
  /* An off-ramp's one lane turns left or right at its terminal, never
     straight across onto the on-ramp: the general rule offered it, and a
     car at the stopped east terminal waited 192 s to cross six lanes of
     free-flowing arterial to get back on the highway it had just left. */
  const ramp = (id, a, b, speed) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push({ x: r2(a.x + ((b.x - a.x) * i) / 40), y: r2(a.y + ((b.y - a.y) * i) / 40), z: 0 });
    m.roads.push(road({ id, kind: "arterial", lanes: 1, oneWay: true, speed, points: pts, ...(id.startsWith("off") ? { turns: { end: [["left", "right"]] } } : {}) }));
  };
  for (const X of [0, 2000]) {
    const ebAt = (x) => ({ x, y: YH + HALF }), wbAt = (x) => ({ x, y: YH - HALF });
    const south = { x: X, y: YH + TERM }, north = { x: X, y: YH - TERM };
    ramp(`off-eb-${X}`, ebAt(X - RAMP_X), south, 60);
    ramp(`on-eb-${X}`, south, ebAt(X + RAMP_X), 80);
    ramp(`off-wb-${X}`, wbAt(X + RAMP_X), north, 60);
    ramp(`on-wb-${X}`, north, wbAt(X - RAMP_X), 80);
    /* The terminals. Signalled: every approach. Stopped: the off-ramps only; the arterial runs free. */
    const ends = [[`off-eb-${X}`, "end"], [`off-wb-${X}`, "end"], [`s${X}-n`, "end"], [`s${X}-bridge`, "start"], [`s${X}-bridge`, "end"], [`s${X}-s`, "start"]];
    for (const [id, end] of ends) {
      const ramp = id.startsWith("off");
      if (interchange[X] === "signal") m = setRoadControl(m, id, end, "signal");
      else if (ramp) m = setRoadControl(m, id, end, "stop");
    }
  }

  const xsAll = m.roads.flatMap((r) => r.points.map((p) => p.x)), ysAll = m.roads.flatMap((r) => r.points.map((p) => p.y));
  m.bounds = { x: Math.min(...xsAll) - 50, y: Math.min(...ysAll) - 50, w: Math.max(...xsAll) - Math.min(...xsAll) + 100, h: Math.max(...ysAll) - Math.min(...ysAll) + 100 };

  /* THE SECTIONS: the brief's own (each intersection type, downtown, the
     bus stops), then the highway's. */
  const city = (m.sections ?? []).filter((s) => s.id !== "whole");
  m.sections = [
    ...city,
    { id: "join", name: "Join the highway", look: { x: RAMP_X, y: YH + 100 }, start: { road: "on-eb-0", end: "end" },
      judge: "Up the on-ramp from the west interchange and along the acceleration lane: match the traffic's 100 and move over into a gap before the lane ends. Nobody should stop." },
    { id: "interchange-signals", name: "The west interchange -- signals", look: { x: 0, y: YH }, start: { road: "s0-n", end: "end" },
      judge: "A diamond: the arterial crosses the highway on a bridge between two signalled terminals. Who turns onto the on-ramps, how the off-ramp queues clear, and whether the two lights 400 m apart keep the arterial moving." },
    { id: "interchange-stops", name: "The east interchange -- stops on the ramps", look: { x: 2000, y: YH }, start: { road: "hw-wb-1", end: "end" },
      judge: "The same diamond with the arterial free and the off-ramps stopping: leave the highway, stop at the end of the ramp, and find a gap in the arterial's traffic." },
    { id: "exit-only", name: "The exit-only lane", look: { x: 2000 - RAMP_X, y: YH + 60 }, start: { road: "hw-eb-1", end: "end" },
      judge: "Eastbound, the curb lane leaves at the east interchange: anybody going on must be out of it in time, two lanes carry on past the entrance, and the third comes back 1 km past the entrance. Who leaves it late?" },
    { id: "through", name: "Through traffic", look: { x: STRAIGHT[0], y: YH }, start: { road: "on-eb-0", end: "end" },
      judge: "The highway comes from beyond the map and goes beyond it at both ends, bending away out there: is there always traffic coming through, and does what leaves by the ramps reach the city?" },
    { id: "whole", name: "The whole map", look: { x: W / 2, y: (H + YH) / 2 }, judge: "Two kilometres of city, a highway past it, and everything joined: does traffic come from somewhere and go somewhere, all day?" },
  ];
  return m;
}
