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
/* THE LANES A CAR DRIVES ALONG A ROAD, in one direction: the centreline
   offset to the right of travel by half a lane for lane 0, a lane and
   a half for lane 1, and so on -- lane 0 is BESIDE THE CENTRE LINE and
   the last lane is the curb lane -- each with cumulative distance from
   its own start. `dir` +1 runs the road's points in order, -1 reversed.

   MORE THAN ONE LANE EACH WAY, from 20 September. Every road had been
   one lane each way, the examiner project's narrow street, and the
   maintainer's first drive called the roads "very restrictive": with
   one lane there is nowhere to go, nothing to pass, and any car ahead
   is a wall. The map's `lanes` per direction is honoured from here,
   and lane changing is REACHABLE -- a lane is a polyline with an id,
   following is per lane already, and a car that moves to the next lane
   is a car on the next polyline. The player does it now (drive.js);
   the traffic will. */
export function laneAlong(road, dir, lane, index = 0) {
  const pts = dir > 0 ? road.pts : road.pts.slice().reverse();
  const { right } = ribbonOf(pts, lane * (2 * index + 1));   // ribbonOf offsets by width/2 each side
  const at = [0];
  for (let i = 1; i < right.length; i++) at.push(at[i - 1] + dist(right[i], right[i - 1]));
  return { id: `${road.id}:${dir > 0 ? "fwd" : "rev"}#${index}`, road: road.id, dir, index, pts: right, at, length: at[at.length - 1] };
}

/* WHICH LANE A TURN IS MADE FROM, AND INTO. The rule real driving
   supplies: a right turn from the curb lane into the curb lane; a left
   turn from the lane beside the centre line into the lane beside the
   centre line; straight on stays in its lane, or the nearest the road
   ahead has. A car in the wrong lane for a turn has no route for it --
   which is what makes the lane a choice. */
export function laneForTurn(kind, fromLeg, toLanes) {
  if (kind === "right") return fromLeg.curb ? toLanes - 1 : null;
  if (kind === "left") return fromLeg.inner ? 0 : null;
  return Math.min(fromLeg.lane, toLanes - 1);
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
  const lanesOf = (r) => Math.max(1, Math.round(r.lanes ?? 1));
  const lanes = {};
  for (const r of roads) {
    for (let i = 0; i < lanesOf(r); i++) {
      lanes[`${r.id}:fwd#${i}`] = laneAlong(r, 1, lane, i);
      lanes[`${r.id}:rev#${i}`] = laneAlong(r, -1, lane, i);
    }
  }
  /* Which node each road end belongs to, if any. */
  const endNode = {};
  loaded.nodes.forEach((n, k) => { for (const l of n.legs) endNode[`${l.road}|${l.end}`] = { k, leg: l }; });

  const at = [];
  const joins = {};
  const links = [];

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
    /* THE BOX is as wide as the widest road meeting here, so the stop
       line on every leg sits clear of the crossing traffic's lanes. */
    const widest = Math.max(1, ...n.legs.map((l) => (roadOf[l.road] ? lanesOf(roadOf[l.road]) : 1)));
    const boxHalf = lane * widest;
    const lineAt = boxHalf + LINE_SETBACK;      // the stop line beyond the box, as intersection.js has it
    const legs = {};
    for (const l of n.legs) {
      const r = roadOf[l.road];
      if (!r) continue;
      const seam = seamed(r);
      const base = l.id ?? `${r.id}|${l.end}`;
      /* A control override by leg id, or for every leg ("*"), else the
         map's own. */
      const ctl = control?.[base] ?? control?.["*"] ?? l.control ?? "none";
      const count = lanesOf(r);
      /* ONE LEG PER LANE: `road|end#i`. Travelling TOWARD the node on
         this road is the lane whose direction ends at this end. */
      for (let i = 0; i < count; i++) {
        const inLane = lanes[`${r.id}:${l.end === "end" ? "fwd" : "rev"}#${i}`];
        const outLane = lanes[`${r.id}:${l.end === "end" ? "rev" : "fwd"}#${i}`];
        const id = `${base}#${i}`;
        legs[id] = {
          id, base, lane: i, lanes: count, inner: i === 0, curb: i === count - 1,
          road: r.id, end: l.end, bearing: l.bearing, control: ctl,
          /* THE POSTED SPEED OF THE ROAD THIS LEG IS ON, in m/s. The
             loader already derives it -- the kind's default, the road's
             override, lowered where a bend cannot be taken at it
             (map/load.js) -- and until now the sim threw it away and
             drove the whole map at one limit. It rides on the leg
             because the leg is what a car knows it is on. */
          speed: (r.speed ?? 50) / 3.6,
          inLane, outLane,
          /* Arc positions on the two lanes: where the approach begins
             (the lane's midpoint, or the far edge) and where the exit
             ends (the lane's midpoint, or the road's end). */
          inFrom: seam ? inLane.length / 2 : 0,
          outTo: seam ? outLane.length / 2 : outLane.length,
        };
      }
    }
    const ids = Object.keys(legs);
    /* THE STOP LINE CLEARS THE CROSSING TRAFFIC ON A SKEWED LEG TOO. The
       box's half-width is measured along a leg's own axis, and on a leg
       that meets the crossing road at an angle that is not far enough:
       at the five-way a car at rest at its line on the 45 degree
       diagonal sat inside the swept path of the eastbound curb lane,
       and was clipped twice in five minutes. A leg's setback is the
       box's, divided by the sine of the smallest angle to any leg that
       actually crosses it -- 1 at a right angle, 1.41 at 45 degrees,
       capped at 2 for a fork -- with the legs that run parallel to it
       (its own opposite) left out, since they do not cross its lane. */
    for (const id of ids) {
      const A = legs[id];
      let sinMin = 1;
      for (const other of ids) {
        const B = legs[other];
        if (B.base === A.base) continue;
        const theta = Math.abs(norm(B.bearing - A.bearing));
        if (theta < 15 || theta > 165) continue;           // parallel or oncoming: does not cross this lane
        sinMin = Math.min(sinMin, Math.sin((theta * Math.PI) / 180));
      }
      const f = 1 / Math.max(sinMin, 0.5);
      A.boxHalf = boxHalf * f;
      A.lineAt = boxHalf * f + LINE_SETBACK;
    }
    const place = { lane, boxHalf, lineAt, control: Object.fromEntries(ids.map((id) => [id, legs[id].control])), at: n.at, reach: 0 };
    const paths = {};
    for (const from of ids) {
      const A = legs[from];
      for (const to of ids) {
        const B = legs[to];
        if (B.base === A.base) continue;
        const kind = intentOf({ legs }, from, to);
        /* The one lane a turn of this kind goes into from this lane, or
           none: right turns from the curb lane, left turns from beside
           the centre line, straight on in one's own lane. */
        if (laneForTurn(kind, A, B.lanes) !== B.lane) continue;
        paths[`${from}/${to}`] = pathBetween(place, A, B, { from, to, intent: kind });
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
    const byFrom = {};
    for (const key of keys) (byFrom[paths[key].from] ??= []).push(key);
    at.push({ at: { x: 0, y: 0 }, node: n.id, layout: { place, paths, conflicts, legs, routesFrom: (leg) => byFrom[leg] ?? [] } });
  }

  /* Joins: a road between two nodes joins their two legs, lane by
     lane -- the lane a car leaves one node in is the lane it arrives
     at the next in. */
  for (const r of roads) {
    const a = endNode[`${r.id}|start`], b = endNode[`${r.id}|end`];
    if (a && b) {
      const id = links.length;
      const aBase = a.leg.id ?? `${r.id}|start`, bBase = b.leg.id ?? `${r.id}|end`;
      links.push({ id, road: r.id, a: a.k, aSide: aBase, b: b.k, bSide: bBase });
      for (let i = 0; i < lanesOf(r); i++) {
        joins[`${a.k}|${aBase}#${i}`] = { k: b.k, side: `${bBase}#${i}`, link: id };
        joins[`${b.k}|${bBase}#${i}`] = { k: a.k, side: `${aBase}#${i}`, link: id };
      }
    }
  }

  /* ROADS WITH NO NODE AT EITHER END are lanes with nothing on them:
     one path per lane each way, the whole lane, no line and no
     conflicts. Cars spawn at the start and are gone at the end. */
  for (const r of roads) {
    if (endNode[`${r.id}|start`] || endNode[`${r.id}|end`]) continue;
    for (const dir of ["fwd", "rev"]) {
      for (let i = 0; i < lanesOf(r); i++) {
        const L = lanes[`${r.id}:${dir}#${i}`];
        const id = `${r.id}:${dir}#${i}`;
        const legs = { [id]: { id, base: `${r.id}:${dir}`, lane: i, lanes: lanesOf(r), inner: i === 0, curb: i === lanesOf(r) - 1, road: r.id, end: dir === "fwd" ? "end" : "start", bearing: bearingOf(L.pts[L.pts.length - 2], L.pts[L.pts.length - 1]) + 180, control: "none", speed: (r.speed ?? 50) / 3.6, inLane: L, outLane: L, inFrom: 0, outTo: L.length } };
        const path = { from: id, to: id, intent: "straight", pts: L.pts, at: L.at, length: L.length, stopAt: L.length, clearAt: L.length, laneIn: { id: L.id, at0: 0 }, laneOut: { id: L.id, at0: 0 } };
        at.push({ at: { x: 0, y: 0 }, node: id, through: true, layout: { place: { lane, boxHalf: lane, lineAt: lane + LINE_SETBACK, control: { [id]: "none" }, at: L.pts[L.pts.length - 1], reach: L.length }, paths: { [`${id}/${id}`]: path }, conflicts: {}, legs, routesFrom: (leg) => [`${leg}/${leg}`] } });
      }
    }
  }

  return { graph: true, n: at.length, at, joins, links, lanes, roads, map: loaded };
}

/* The lane-leg a car should start on for a road end: the curb lane,
   which is where a driver keeps to. */
export function curbLegOf(course, roadId, end) {
  for (const [k, spot] of course.at.entries()) {
    for (const leg of Object.values(spot.layout.legs)) {
      if (leg.road === roadId && leg.end === end && leg.curb && !spot.through) return { k, leg: leg.id };
    }
  }
  return null;
}

/* ---- a path between two legs of one node ---------------------------- */
/* Approach along the inbound lane to the stop line, an arc where a
   driver turns the wheel, out along the outbound lane to the seam. The
   arc is tangent to both lanes: its radius follows from the corner
   where the two lane lines cross and the angle turned, so a wider road
   turns wider on its own and a skew turns as its angle demands. */
function pathBetween(place, A, B, meta) {
  const inL = A.inLane, outL = B.outLane;
  const stopS = inL.length - (A.lineAt ?? place.lineAt);       // the stop line, along the inbound lane
  const approach = cut(inL, A.inFrom, stopS);
  const stop = approach[approach.length - 1];
  const inDir = unit(approach[approach.length - 2] ?? inL.pts[inL.pts.length - 2], stop);
  const leaveS = Math.min(outL.length, B.boxHalf ?? place.boxHalf);   // the box edge, along the outbound lane
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

/* THE POSTED SPEED A CAR IS DRIVING TO, in m/s: the speed of the road
   it came in on. A route is `from/to` and the car spends its approach
   on `from`'s road, so that is the limit it has been driving to and
   the one it is judged against. It changes at the NODE rather than
   mid-box, which is where a driver reads the next road's sign anyway.

   `null` where the course cannot say -- a grid course has no map under
   it -- and the caller keeps the world's single limit, which is what
   every compass course has always run on. */
export function postedAt(course, k, route) {
  const layout = course.at?.[k]?.layout;
  const from = layout?.paths?.[route]?.from;
  const s = from == null ? null : layout.legs?.[from]?.speed;
  return typeof s === "number" && s > 0 ? s : null;
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

/* THE JUNCTIONS, FOR WHATEVER DRAWS THEM: per node, the surface where
   the legs meet (a polygon through each leg's road edges at the box
   edge), each controlled leg's STOP LINE across its inbound lane where
   the sim actually holds a car (the path's stop point), and the sign
   beside it. Derived from the same geometry the cars use, so what is
   drawn is where the line is -- the screen said "stop at the line" and
   drew none, which is the lie CLAUDE.md item 6 names. */
export function junctionsOf(course) {
  const out = [];
  const roadOf = Object.fromEntries(course.roads.map((r) => [r.id, r]));
  for (const spot of course.at) {
    if (spot.through) continue;
    const { legs, paths, place } = spot.layout;
    const centre = place.at;
    const corners = [];
    const lines = [], signs = [];
    const seenBase = new Set();
    for (const leg of Object.values(legs)) {
      const r = roadOf[leg.road];
      if (!r) continue;
      if (!seenBase.has(leg.base)) {
        seenBase.add(leg.base);
        /* The road's edges at the box edge: the ribbon sample nearest
           boxHalf from this end. */
        const n = r.pts.length;
        const idx = (() => {
          const half = leg.boxHalf ?? place.boxHalf;
          if (leg.end === "end") { let i = n - 1; while (i > 0 && r.length - r.at[i] < half) i--; return i; }
          let i = 0; while (i < n - 1 && r.at[i] < half) i++; return i;
        })();
        corners.push(r.left[idx], r.right[idx]);
      }
      /* The stop line: across this lane at the stop point of any path
         out of it (they share the approach). */
      const route = Object.keys(paths).find((k) => paths[k].from === leg.id);
      if (!route) continue;
      const p = paths[route];
      const pose = poseAt(p, p.stopAt);
      const h = (pose.rot * Math.PI) / 180, nx = -Math.sin(h), ny = Math.cos(h);   // right of travel
      const z = poseOnGraph(course, course.at.indexOf(spot), route, p.stopAt).z ?? 0;
      const lane = place.lane;
      if (leg.control === "stop" || leg.control === "yield") {
        lines.push({ kind: leg.control, a: { x: pose.x - nx * lane / 2, y: pose.y - ny * lane / 2, z }, b: { x: pose.x + nx * lane / 2, y: pose.y + ny * lane / 2, z } });
        /* One sign per road end, at the curb lane's right-hand edge, level with the line, facing the approaching driver. */
        if (leg.curb) signs.push({ kind: leg.control, at: { x: pose.x + nx * (lane / 2 + 0.6), y: pose.y + ny * (lane / 2 + 0.6), z }, heading: pose.rot });
      }
    }
    /* The surface: the corners in order round the centre. */
    const c2 = { x: centre.x, y: centre.y };
    corners.sort((p, q) => Math.atan2(p.y - c2.y, p.x - c2.x) - Math.atan2(q.y - c2.y, q.x - c2.x));
    out.push({ node: spot.node, at: centre, surface: corners, lines, signs });
  }
  return out;
}

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
