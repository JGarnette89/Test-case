/* =====================================================================
   THE SIM ON A ROAD NETWORK: intersections wherever roads meet, at
   whatever bearings, with however many legs.

   SIMULATOR.md 2.4, the one real refactor in the core. The compass
   intersection (intersection.js) has four legs at N/E/S/W and a grid
   places them a reach apart; the map has nodes where strokes met,
   three-legged, four-legged, five-legged, skewed. THE RULES DO NOT
   CHANGE; THEIR COORDINATES DO. Right of way is still path conflict
   (DECISIONS.md 5.3), the right-hand rule and left-yields-to-oncoming
   are still the tie-breaks, gap acceptance is still the whole of a
   two-way stop -- crossing.js keeps every one of them and asks the
   LAYOUT what "on my right" and "oncoming" mean, in bearings, instead
   of looking them up in a table.

   So this file produces, for every node of a loaded map, a layout in
   the shape crossing.js already consumes:

     layout.paths[route]      a path from one leg to another, as a
                              polyline with cumulative distance, where
                              the stop line and the box are along it
     layout.conflicts["a|b"]  where two paths would put two cars in the
                              same place, by footprint scan, unchanged
     layout.legs[id]          each leg's bearing and control

   and a COURSE in the shape course.js already consumes: `at[k]` per
   node, `joins` for what is on the other end of each leg, and lanes
   with positions along them.

   THE LINK IS THE ROAD, and the seam is its midpoint. A road between
   two nodes is the exit leg of one and the approach leg of the other,
   as course.js has always had it; a car runs off the end of one path
   onto the start of the next at the same metre, and the seam is exact
   because both paths are cut from the same polyline at the same point.
   A road with an edge at one end starts or ends the path there
   instead, and a road with edges at both ends -- stage 0's two roads
   -- is a lane with no intersection on it at all: one path, no line,
   no conflicts.

   Metres and seconds, like everything in src/sim/.
   ===================================================================== */
import { turnPoints } from "../engine/paths.js";

import { CAR, weaveRoom } from "./traffic.js";
import { conflictsBetween, poseAt, LINE_SETBACK } from "./intersection.js";
import { ribbonOf } from "../iso/road.js";
import { rng } from "../engine/index.js";

/* HOW FAR FROM OPPOSITE STILL COUNTS AS ONCOMING. A left turn yields
   to the oncoming approach; at a skewed crossing "oncoming" is the leg
   within this many degrees of straight across. FLAGGED AS A DESIGN
   CONSTANT AND A DOMAIN QUESTION: a five-way at 72 degrees has no leg
   inside it and every pair falls to the right-hand rule, which is a
   claim about how a driver reads such a place that the maintainer has
   not ruled on. Forty degrees so that anything a driver would call
   "straight ahead" is oncoming and a crossing at sixty is not. */
export const ONCOMING_TOL = 40;
/* WHAT A DRIVER CALLS STRAIGHT ON. The test map's bent road arrives at
   its crossroads 25 degrees off square -- a bow's tangent at its end --
   and at twelve degrees there was no straight exit from the north, so
   "no signal" became a right turn. A driver at a crossroads whose other
   exits are right angles calls a 25 degree kink straight on, and does
   not signal for it. Thirty degrees. Separate from ARC_FROM: whether to
   BUILD an arc is geometry, and a 25 degree kink still wants one. */
const STRAIGHT_TOL = 30;
const ARC_FROM = 5;

const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;   // to (-180, 180]
const bearingOf = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* IS `theirs` ON THE RIGHT OF A CAR ARRIVING FROM `mine`? The car is
   travelling in from its leg, so its right hand points at bearings
   between its own leg's bearing and the one opposite, going the short
   way round clockwise -- which with y down and headings clockwise is
   the half-turn BELOW its bearing. The compass version was `rightOf(N)
   === W`: north is -90, west is 180, and 180 - (-90) normalised is
   -90, on the right. Exactly opposite is on nobody's right, which is
   what leaves two opposing lefts to `settle`'s next rule. */
export function onRightOf(layout, mine, theirs) {
  const a = layout.legs[mine]?.bearing, b = layout.legs[theirs]?.bearing;
  if (a == null || b == null) return false;
  const d = norm(b - a);
  return d < 0 && d > -180;
}

/* IS `theirs` ONCOMING TO `mine`: within ONCOMING_TOL of straight
   across. The compass version was `OPPOSITE[from]`. */
export function oncoming(layout, mine, theirs) {
  const a = layout.legs[mine]?.bearing, b = layout.legs[theirs]?.bearing;
  if (a == null || b == null) return false;
  return Math.abs(norm(b - a)) >= 180 - ONCOMING_TOL;
}

/* WHAT KIND OF TURN a path from one leg to another is, from the
   heading change: the car arrives heading opposite to its leg's
   bearing and leaves along the other's. Positive is clockwise, which
   with y down is a right turn. */
export function intentOf(layout, from, to) {
  if (from === to) return "straight";
  const turn = norm(layout.legs[to].bearing - (layout.legs[from].bearing + 180));
  return Math.abs(turn) < STRAIGHT_TOL ? "straight" : turn > 0 ? "right" : "left";
}

/* ---- lanes along a road --------------------------------------------- */
/* THE LANE A CAR DRIVES ALONG A ROAD, in one direction: the centreline
   offset half a lane to the right of travel, with cumulative distance
   from the lane's own start. `dir` +1 runs the road's points in order,
   -1 reversed. One lane each way for now, as the compass intersection
   has; a road's lane count is carried and not yet used. */
export function laneAlong(road, dir, lane) {
  const pts = dir > 0 ? road.pts : road.pts.slice().reverse();
  const { right } = ribbonOf(pts, lane);   // ribbonOf offsets by width/2 each side: half a lane
  const at = [0];
  for (let i = 1; i < right.length; i++) at.push(at[i - 1] + dist(right[i], right[i - 1]));
  return { id: `${road.id}:${dir > 0 ? "fwd" : "rev"}`, road: road.id, dir, pts: right, at, length: at[at.length - 1] };
}

/* The polyline of a lane between two arc positions, cut exactly. */
function cut(laneP, s0, s1) {
  const { pts, at } = laneP;
  const posAt = (s) => {
    const t = Math.max(0, Math.min(laneP.length, s));
    let i = 1;
    while (i < at.length - 1 && at[i] < t) i++;
    const f = (t - at[i - 1]) / (at[i] - at[i - 1] || 1);
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f, z: (pts[i - 1].z ?? 0) + ((pts[i].z ?? 0) - (pts[i - 1].z ?? 0)) * f };
  };
  const out = [posAt(s0)];
  for (let i = 0; i < pts.length; i++) if (at[i] > s0 + 1e-6 && at[i] < s1 - 1e-6) out.push(pts[i]);
  out.push(posAt(s1));
  return out;
}

/* Nearest arc position on a lane to a point. */
function nearestAlong(laneP, p) {
  let best = { s: 0, d: Infinity };
  for (let i = 0; i + 1 < laneP.pts.length; i++) {
    const a = laneP.pts[i], b = laneP.pts[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    const q = { x: a.x + dx * f, y: a.y + dy * f };
    const d = dist(p, q);
    if (d < best.d) best = { s: laneP.at[i] + f * (laneP.at[i + 1] - laneP.at[i]), d };
  }
  return best;
}

const cumulative = (pts) => {
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + dist(pts[i], pts[i - 1]));
  return at;
};

/* Where two lines cross, given a point and a direction on each. */
function crossOf(p, pu, q, qu) {
  const den = pu.x * qu.y - pu.y * qu.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * qu.y - (q.y - p.y) * qu.x) / den;
  return { x: p.x + pu.x * t, y: p.y + pu.y * t };
}
const unit = (a, b) => { const L = dist(a, b) || 1; return { x: (b.x - a.x) / L, y: (b.y - a.y) / L }; };

/* ---- the course ------------------------------------------------------ */
/* THE WHOLE NETWORK AS A COURSE: one entry in `at` per node, plus one
   per road that touches no node (a lane with nothing on it), joins
   between legs, and lanes. `lane` is the lane width; `control` may
   override the map's per-end controls for every leg (a test's
   convenience). */
export function graphOf(loaded, { lane = 3.6, control = null } = {}) {
  const roads = loaded.roads;
  const roadOf = Object.fromEntries(roads.map((r) => [r.id, r]));
  const lanes = {};
  for (const r of roads) {
    lanes[`${r.id}:fwd`] = laneAlong(r, 1, lane);
    lanes[`${r.id}:rev`] = laneAlong(r, -1, lane);
  }
  /* Which node each road end belongs to, if any. */
  const endNode = {};
  loaded.nodes.forEach((n, k) => { for (const l of n.legs) endNode[`${l.road}|${l.end}`] = { k, leg: l }; });

  const at = [];
  const joins = {};
  const links = [];
  const boxHalf = lane;                       // one lane each way: the box is as wide as the crossing road
  const lineAt = boxHalf + LINE_SETBACK;      // the stop line beyond the box, as intersection.js has it

  /* Whether a road has a node at both ends, and so a seam. THE SEAM IS
     THE LANE'S OWN MIDPOINT, not the road's: a lane is the centreline
     offset to one side, and on a bend the outside lane is longer than
     the centreline and the inside one shorter, so halves cut at the
     road's midpoint met a metre or two apart -- measured as 33 cars
     jumping at the seam of the test map's one bend. Each lane's two
     halves are cut from the same polyline at the same arc position,
     so the seam is exact whatever the road does. A road with an edge
     starts or ends the path at the edge instead. */
  const seamed = (r) => !!(endNode[`${r.id}|start`] && endNode[`${r.id}|end`]);

  for (const [k, n] of loaded.nodes.entries()) {
    const legs = {};
    for (const l of n.legs) {
      const r = roadOf[l.road];
      if (!r) continue;
      /* Travelling TOWARD the node on this road is the lane whose
         direction ends at this end. */
      const inLane = lanes[`${r.id}:${l.end === "end" ? "fwd" : "rev"}`];
      const outLane = lanes[`${r.id}:${l.end === "end" ? "rev" : "fwd"}`];
      const seam = seamed(r);
      const id = l.id ?? `${r.id}|${l.end}`;
      /* A control override by leg id, or for every leg ("*"), else the
         map's own. (Looked up by `l.id` at first, which the loader does
         not set, so an override never applied and a two-way stop ran
         uncontrolled -- with zero overlaps, which says something about
         the precedence rules, but not what the check claimed.) */
      const ctl = control?.[id] ?? control?.["*"] ?? l.control ?? "none";
      legs[id] = {
        id, road: r.id, end: l.end, bearing: l.bearing, control: ctl,
        inLane, outLane,
        /* Arc positions on the two lanes: where the approach begins
           (the lane's midpoint, or the far edge) and where the exit
           ends (the lane's midpoint, or the road's end). */
        inFrom: seam ? inLane.length / 2 : 0,
        outTo: seam ? outLane.length / 2 : outLane.length,
      };
    }
    const ids = Object.keys(legs);
    const place = { lane, boxHalf, lineAt, control: Object.fromEntries(ids.map((id) => [id, legs[id].control])), at: n.at, reach: 0 };
    const paths = {};
    for (const from of ids) {
      for (const to of ids) {
        if (from === to) continue;
        paths[`${from}/${to}`] = pathBetween(place, legs[from], legs[to], { from, to, intent: intentOf({ legs }, from, to) });
      }
    }
    place.reach = Math.max(0, ...Object.values(paths).map((p) => p.stopAt));
    const conflicts = {};
    const keys = Object.keys(paths);
    for (const ka of keys) {
      for (const kb of keys) {
        if (ka === kb || paths[ka].from === paths[kb].from) continue;
        const hit = conflictsBetween(paths[ka], paths[kb], weaveRoom(lane));
        if (hit) conflicts[`${ka}|${kb}`] = hit;
      }
    }
    at.push({ at: { x: 0, y: 0 }, node: n.id, layout: { place, paths, conflicts, legs, routesFrom: (leg) => ids.filter((t) => t !== leg).map((t) => `${leg}/${t}`) } });
  }

  /* Joins: a road between two nodes joins their two legs. */
  for (const r of roads) {
    const a = endNode[`${r.id}|start`], b = endNode[`${r.id}|end`];
    if (a && b) {
      const id = links.length;
      links.push({ id, road: r.id, a: a.k, aSide: a.leg.id ?? `${r.id}|start`, b: b.k, bSide: b.leg.id ?? `${r.id}|end` });
      joins[`${a.k}|${a.leg.id ?? `${r.id}|start`}`] = { k: b.k, side: b.leg.id ?? `${r.id}|end`, link: id };
      joins[`${b.k}|${b.leg.id ?? `${r.id}|end`}`] = { k: a.k, side: a.leg.id ?? `${r.id}|start`, link: id };
    }
  }

  /* ROADS WITH NO NODE AT EITHER END are lanes with nothing on them:
     one path each way, the whole lane, no line and no conflicts. Cars
     spawn at the start and are gone at the end. */
  for (const r of roads) {
    if (endNode[`${r.id}|start`] || endNode[`${r.id}|end`]) continue;
    for (const dir of ["fwd", "rev"]) {
      const L = lanes[`${r.id}:${dir}`];
      const id = `${r.id}:${dir}`;
      const legs = { [id]: { id, road: r.id, end: dir === "fwd" ? "end" : "start", bearing: bearingOf(L.pts[L.pts.length - 2], L.pts[L.pts.length - 1]) + 180, control: "none", inLane: L, outLane: L, inFrom: 0, outTo: L.length } };
      const path = { from: id, to: id, intent: "straight", pts: L.pts, at: L.at, length: L.length, stopAt: L.length, clearAt: L.length, laneIn: { id: L.id, at0: 0 }, laneOut: { id: L.id, at0: 0 } };
      at.push({ at: { x: 0, y: 0 }, node: `${r.id}:${dir}`, through: true, layout: { place: { lane, boxHalf, lineAt, control: { [id]: "none" }, at: L.pts[L.pts.length - 1], reach: L.length }, paths: { [`${id}/${id}`]: path }, conflicts: {}, legs, routesFrom: (leg) => [`${leg}/${leg}`] } });
    }
  }

  return { graph: true, n: at.length, at, joins, links, lanes, roads, map: loaded };
}

/* ---- a path between two legs of one node ---------------------------- */
/* Approach along the inbound lane to the stop line, an arc where a
   driver turns the wheel, out along the outbound lane to the seam. The
   arc is tangent to both lanes: its radius follows from the corner
   where the two lane lines cross and the angle turned, so a wider road
   turns wider on its own and a skew turns as its angle demands. */
function pathBetween(place, A, B, meta) {
  const inL = A.inLane, outL = B.outLane;
  const stopS = inL.length - place.lineAt;                    // the stop line, along the inbound lane
  const approach = cut(inL, A.inFrom, stopS);
  const stop = approach[approach.length - 1];
  const inDir = unit(approach[approach.length - 2] ?? inL.pts[inL.pts.length - 2], stop);
  const leaveS = Math.min(outL.length, place.boxHalf);        // the box edge, along the outbound lane
  const exit0 = cut(outL, leaveS, Math.min(outL.length, leaveS + 20));
  const outDir = unit(exit0[0], exit0[exit0.length - 1]);
  const turn = norm((Math.atan2(outDir.y, outDir.x) - Math.atan2(inDir.y, inDir.x)) * 180 / Math.PI);

  let pts, iStop, iClear, exitFrom;
  if (Math.abs(turn) < ARC_FROM) {
    /* Straight on: line to box edge to the way out. */
    pts = [...approach, exit0[0]];
    iStop = approach.length - 1;
    iClear = pts.length - 1;
    exitFrom = leaveS;
  } else {
    const corner = crossOf(stop, inDir, exit0[0], outDir);
    const d = corner ? dist(corner, stop) : place.lineAt;
    /* Tangent to both lines: the arc meets the outbound line as far
       from the corner as it left the inbound one. At a right angle that
       is the corner distance itself, which is what the compass version
       used; at a skew it is not.

       NOT FLOORED AT A CAR'S LOCK, DELIBERATELY. The corner at a
       one-lane crossroads is 3.85 m from the stop point, tighter than
       the 5.5 m a car can steer; flooring the radius swung the arc wide
       of the corner and finished 1.65 m into the next lane -- measured
       here as twelve waiting cars clipped by right-turners in two
       minutes, and it is exactly the old engine's horn of DECISIONS.md
       5.15.12. The compass path does not floor, and the question of
       what a driver actually does at that corner is the maintainer's
       and still open. */
    const radius = d / Math.tan((Math.abs(turn) * Math.PI) / 360);
    const far = { x: corner.x + outDir.x * 30, y: corner.y + outDir.y * 30 };
    const arc = turnPoints(stop, corner ?? exit0[0], far, radius).map((p) => ({ ...p, z: stop.z ?? 0 }));
    arc.pop();
    pts = [...approach.slice(0, -1), ...arc];
    iStop = approach.length - 1;
    iClear = pts.length - 1;
    /* The way out begins where the arc lands on the outbound lane. */
    exitFrom = Math.max(leaveS, nearestAlong(outL, pts[pts.length - 1]).s);
  }
  const away = cut(outL, exitFrom, B.outTo);
  pts.push(...away.slice(1));
  const at = cumulative(pts);
  return {
    ...meta, pts, at, length: at[at.length - 1], stopAt: at[iStop], clearAt: at[iClear],
    /* Where this path is on its two lanes: s=0 is `inFrom` along the
       inbound lane; the exit portion starts at `exitFrom` along the
       outbound one. */
    laneIn: { id: inL.id, at0: A.inFrom },
    laneOut: { id: outL.id, at0: exitFrom },
  };
}

/* ---- what course.js and crossing.js ask of a course ------------------ */
/* WHERE A CAR IS ON ITS TWO LANES, as arc positions, so following
   across a seam compares metres along the same piece of road -- exact
   on a curve, where a projection onto one direction is not. In the box
   a car is held at the end of its approach and the start of its exit. */
export function laneSpanOnGraph(course, k, route, s) {
  const p = course.at[k].layout.paths[route];
  const sIn = Math.min(s, p.stopAt), sOut = Math.max(0, s - p.clearAt);
  return [
    { lane: p.laneIn.id, along: p.laneIn.at0 + sIn },
    { lane: p.laneOut.id, along: p.laneOut.at0 + sOut },
  ];
}

/* Every leg of every node with nothing beyond it: where traffic enters,
   weighted so a through road carries more than the street that stops
   for it (crossing.js). A lane with no node spawns at its start. */
export function edgesOfGraph(course, busier = 2) {
  const out = [];
  course.at.forEach((spot, k) => {
    for (const id of Object.keys(spot.layout.legs)) {
      if (course.joins[`${k}|${id}`]) continue;
      out.push({ k, side: id, weight: spot.layout.legs[id].control === "stop" ? 1 : busier });
    }
  });
  return out;
}

/* A random route out of a leg, drawn from a number: the graph's
   version of "pick an intent". */
export function routeFromGraph(course, k, leg, x) {
  const routes = course.at[k].layout.routesFrom(leg);
  return routes[Math.floor(x * routes.length) % routes.length];
}

/* Roads for a renderer: the loaded map's, as they are. */
export const roadsOfGraph = (course) => course.roads;

/* WHERE A CAR IS, WITH ITS HEIGHT: the path's pose plus z interpolated
   along the path's own points, for a renderer that draws elevation. */
export function poseOnGraph(course, k, route, s) {
  const p = course.at[k].layout.paths[route];
  const pose = poseAt(p, s);
  const { pts, at } = p;
  let i = 1;
  while (i < at.length - 1 && at[i] < s) i++;
  const f = Math.max(0, Math.min(1, (s - at[i - 1]) / (at[i] - at[i - 1] || 1)));
  const z = (pts[i - 1].z ?? 0) + ((pts[i].z ?? 0) - (pts[i - 1].z ?? 0)) * f;
  return { ...pose, z };
}

export { norm as normDeg, bearingOf };
