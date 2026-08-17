/* =====================================================================
   PATHS
   Where a road user goes, as data rather than as a branch in basePose.

   The whole point of moving to this: a junction is currently a pair of
   lookup tables that assume a symmetric four-way with one lane each way.
   A path knows nothing about junctions. It is a shape and a duration, so
   a merge, a parking entrance, a skewed T and a six-lane crossroad are
   all the same kind of thing — different paths, same engine.

   Pure geometry. No road layout, no conflict rules, no colour, and no
   imports from the rest of the engine, so it cannot form a cycle with
   the layer that builds it.

   PARAMETERISED BY PROGRESS, NOT BY ARC LENGTH. That is deliberate and
   it is not an aesthetic choice: the cross layout's traversal times are
   fixed per intent, so a car three-quarters of the way through a left
   turn is three-quarters of the way through its 2.1 seconds regardless of
   how far it has actually travelled. Walking these by distance instead
   would move every window in the game. The roundabout does want constant
   speed, and gets it by being sampled to a polyline whose progress and
   distance are the same thing.
   ===================================================================== */

const rad = (deg) => (deg * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const angleTo = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

const quadAt = (p0, p1, p2, t) => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};

/* --- constructors ----------------------------------------------------
   Each carries how it should be turned as well as where it goes, because
   the three kinds genuinely differ and flattening them would change what
   the cars look like:

     line  holds its heading. A car going straight does not rotate, and
           deriving its angle from two sampled points would introduce
           float noise into a value that is exactly constant today.
     quad  faces along the curve, sampled a little ahead, and holds its
           entry heading for the first sliver so the nose does not snap.
     poly  the same, but with the lookahead measured in distance, since
           that is what the roundabout was built against.
   --------------------------------------------------------------------- */

export function linePath(from, to, duration) {
  return { kind: "line", from, to, duration };
}

export function quadPath(from, ctrl, to, duration, lead = 0.03, hold = 0.02) {
  return { kind: "quad", from, ctrl, to, duration, lead, hold };
}

/* `points` is walked at constant speed: cumulative length is precomputed
   so progress maps straight onto distance. */
export function polyPath(points, duration, opts = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return {
    kind: "poly",
    points,
    cum,
    length: cum[cum.length - 1],
    duration,
    rot0: opts.rot0 ?? 0,
    lead: opts.lead ?? 6,      // in pixels
    hold: opts.hold ?? 2,      // in pixels
  };
}

/* Position at distance along a polyline. */
function polyAt(path, dist) {
  const { points, cum } = path;
  if (dist <= 0) return points[0];
  if (dist >= path.length) return points[points.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < dist) i++;
  const f = (dist - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return {
    x: points[i - 1].x + (points[i].x - points[i - 1].x) * f,
    y: points[i - 1].y + (points[i].y - points[i - 1].y) * f,
  };
}

/* Where on the path, at progress k in 0..1. */
export function pointOn(path, k) {
  switch (path.kind) {
    case "line":
      return { x: lerp(path.from.x, path.to.x, k), y: lerp(path.from.y, path.to.y, k) };
    case "quad":
      return quadAt(path.from, path.ctrl, path.to, k);
    case "poly":
      return polyAt(path, k * path.length);
    default:
      return { x: path.from.x, y: path.from.y };
  }
}

/* Position and heading at progress k. */
export function poseOn(path, k) {
  const p = pointOn(path, k);
  switch (path.kind) {
    case "line":
      return { x: p.x, y: p.y, rot: path.from.rot };
    case "quad": {
      if (k < path.hold) return { x: p.x, y: p.y, rot: path.from.rot };
      const n = quadAt(path.from, path.ctrl, path.to, Math.min(1, k + path.lead));
      return { x: p.x, y: p.y, rot: angleTo(p, n) };
    }
    case "poly": {
      const d = k * path.length;
      if (d < path.hold) return { x: p.x, y: p.y, rot: path.rot0 };
      const n = polyAt(path, d + path.lead);
      return { x: p.x, y: p.y, rot: angleTo(p, n) };
    }
    default:
      return { x: p.x, y: p.y, rot: 0 };
  }
}

/* --- approaches ------------------------------------------------------
   Coming up to the line is the same everywhere: appear far enough back to
   be off screen, and ease to a stop. Eased rather than linear so a car
   arrives as though it braked. */
export const APPROACH_RUN = 490;
export const APPROACH_TIME = 2.8;

export function approachFrom(rest, distance = APPROACH_RUN) {
  const r = rad(rest.rot);
  return { x: rest.x - Math.cos(r) * distance, y: rest.y - Math.sin(r) * distance };
}

/* Progress along the approach at time t, given when the car settles. */
export function approachPose(spawn, rest, t, arriveAt, time = APPROACH_TIME) {
  const k = Math.max(0, Math.min(1, (t - (arriveAt - time)) / time));
  const e = k * k * (3 - 2 * k);
  return { x: lerp(spawn.x, rest.x, e), y: lerp(spawn.y, rest.y, e), rot: rest.rot };
}

/* Shift a point along a heading — used for stop bias and for creeping. */
export function advance(pt, rotDeg, distance) {
  const r = rad(rotDeg);
  return { x: pt.x + Math.cos(r) * distance, y: pt.y + Math.sin(r) * distance };
}

export { lerp, angleTo, quadAt, rad };
