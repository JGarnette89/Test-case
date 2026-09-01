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

   PARAMETERISED BY ARC LENGTH, AND WALKED BY A MOTION PROFILE. A path is
   a shape plus how fast a body moves along it, and those are separate
   things: the shape says where, the profile says when. Every path
   therefore knows its own length, and time maps to distance through the
   profile rather than straight onto the shape's own parameter.

   This replaces a fixed duration per manoeuvre. That version had cars
   leaving a stop line at a constant 72 km/h with no acceleration at all,
   and — because the duration was fixed rather than derived — made a car
   crossing six lanes move FASTER than one crossing two, in the same
   time. Both are now consequences of the profile instead.
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

/* =====================================================================
   MOTION PROFILES
   How far along the path a body is after `t` seconds. Two kinds, and the
   difference is exactly whether the body was stopped:

     accel   pulls away from rest at `a`, levels off at `vmax`. This is a
             car leaving a stop line, and it is why the first second of a
             departure now covers a metre or so rather than eleven.
     cruise  already moving and stays that way. A car that never stopped
             does not accelerate from zero, and a pedestrian mid-crossing
             walks at a walking pace throughout.

   Units are whatever the caller's distances are, per second. The engine
   works in pixels, so an acceleration is passed in as px/s^2.
   ===================================================================== */
export function accelProfile(a, vmax) { return { kind: "accel", a, vmax }; }
export function cruiseProfile(v) { return { kind: "cruise", v }; }

/* Distance covered by `t` seconds in. */
export function distanceAt(profile, t) {
  if (t <= 0) return 0;
  if (profile.kind === "cruise") return profile.v * t;
  const { a, vmax } = profile;
  const tRamp = vmax / a;
  if (t < tRamp) return 0.5 * a * t * t;
  return 0.5 * vmax * tRamp + vmax * (t - tRamp);
}

/* The inverse: how long to cover `d`. Used once per path, to state a
   duration everything downstream can keep asking for. */
export function timeToCover(profile, d) {
  if (d <= 0) return 0;
  if (profile.kind === "cruise") return d / profile.v;
  const { a, vmax } = profile;
  const dRamp = (vmax * vmax) / (2 * a);
  if (d <= dRamp) return Math.sqrt((2 * d) / a);
  return vmax / a + (d - dRamp) / vmax;
}

/* Speed at `t` — what forwardClaim reads to decide how much road a
   vehicle is claiming ahead of itself. Now genuinely varies: a car just
   off the line claims very little, which is correct and was not true
   when everything moved at one speed. */
export function speedAt(profile, t) {
  if (profile.kind === "cruise") return profile.v;
  return Math.min(profile.vmax, Math.max(0, profile.a * t));
}

/* Fraction of the path covered by `t` seconds in — the number poseOn
   and pointOn both take. */
export function progressAt(path, t) {
  if (!path.length) return t > 0 ? 1 : 0;
  return Math.min(1, distanceAt(path.profile, t) / path.length);
}

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

export function linePath(from, to, profile) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  return { kind: "line", from, to, length, profile, duration: timeToCover(profile, length) };
}

/* A quadratic Bezier's own parameter is NOT proportional to arc length —
   it runs fastest through the middle of the curve. Walking one by
   parameter therefore makes a turning car speed up mid-turn and slow at
   both ends, for no reason anybody chose. So the curve is sampled once
   into a cumulative-length table here, and looked up by distance. */
const QUAD_SAMPLES = 32;

export function quadPath(from, ctrl, to, profile, lead = 0.03, hold = 0.02) {
  const pts = [];
  for (let i = 0; i <= QUAD_SAMPLES; i++) pts.push(quadAt(from, ctrl, to, i / QUAD_SAMPLES));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  const length = cum[cum.length - 1];
  return {
    kind: "quad", from, ctrl, to, cum, length, profile,
    duration: timeToCover(profile, length), lead, hold,
  };
}

/* `points` is walked by distance: cumulative length is precomputed so a
   progress fraction maps straight onto arc length. */
export function polyPath(points, profile, opts = {}) {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  const length = cum[cum.length - 1];
  return {
    kind: "poly",
    points,
    cum,
    length,
    profile,
    duration: timeToCover(profile, length),
    rot0: opts.rot0 ?? 0,
    lead: opts.lead ?? 6,      // in pixels
    hold: opts.hold ?? 2,      // in pixels
  };
}

/* Bezier parameter at a distance fraction, through the table above. */
function quadParamAt(path, k) {
  const target = k * path.length;
  const { cum } = path;
  if (target <= 0) return 0;
  if (target >= path.length) return 1;
  let i = 1;
  while (i < cum.length && cum[i] < target) i++;
  const f = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return (i - 1 + f) / QUAD_SAMPLES;
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

/* Where on the path, at distance fraction k in 0..1. */
export function pointOn(path, k) {
  switch (path.kind) {
    case "line":
      return { x: lerp(path.from.x, path.to.x, k), y: lerp(path.from.y, path.to.y, k) };
    case "quad":
      return quadAt(path.from, path.ctrl, path.to, quadParamAt(path, k));
    case "poly":
      return polyAt(path, k * path.length);
    default:
      return { x: path.from.x, y: path.from.y };
  }
}

/* Position and heading at distance fraction k. */
export function poseOn(path, k) {
  const p = pointOn(path, k);
  switch (path.kind) {
    case "line":
      return { x: p.x, y: p.y, rot: path.from.rot };
    case "quad": {
      if (k < path.hold) return { x: p.x, y: p.y, rot: path.from.rot };
      const n = pointOn(path, Math.min(1, k + path.lead));
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

/* Every path now measures itself at construction. */
export function pathLength(path) {
  return path.length;
}

/* Running up to the line WITHOUT stopping: constant speed, no braking
   curve. A car with no reason to stop that visibly slows at the line and
   then accelerates away is unreadable — the player cannot tell whether it
   is yielding, and neither can the rules. */
export function rollingApproach(rest, t, arriveAt, speed) {
  const back = Math.max(0, (arriveAt - t) * speed);
  const r = rad(rest.rot);
  return {
    x: rest.x - Math.cos(r) * back,
    y: rest.y - Math.sin(r) * back,
    rot: rest.rot,
  };
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
