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

/* =====================================================================
   YIELDING — a third kind, for a driver who has to give way to somebody
   who took their space.

   THE REACTION IS THE PLAYER'S OBSERVABLE, NEVER THE DEFINITION OF THE
   FAULT. Encroachment is marked on what the candidate did, against road
   users holding their planned line; this profile is what the player SEES
   when the intrusion was bad enough that somebody had to do something
   about it. Nothing here may be read back into whether a fault occurred.

   Modelled as RETARDED TIME rather than as a bolted-on deceleration: the
   yielding driver covers the same path, at a time lagging behind their
   planned one by up to `hold` seconds. That has three properties worth
   having for free. Distance stays monotone, so a car can never be made to
   reverse. The final speed is exactly the planned one, so they resume
   properly instead of trailing off. And the speed dip is the derivative
   of the lag, so how hard they braked falls out of how much time they had
   to give up — a gentle lift for a small hold, very nearly a stop for a
   large one.

   THE PARAMETER IS HOW HARD THEY BRAKE, NOT HOW MUCH TIME THEY GIVE UP,
   and that is not a presentational choice. The first version took the
   time and stretched the ramp to fit it, which made the lag NON-MONOTONE
   in its own parameter: a bigger sacrifice braked more gently and so
   lagged less in the moments that mattered. Measured — giving up 4s put
   the car FURTHER FORWARD at the instant of the collision than giving up
   2s did, and the search for "the least giving way that works" was
   bisecting a function that does not increase. Severity over a fixed ramp
   is monotone at every instant, which is what a search needs.

   `give` is the peak fraction of speed surrendered, so it is also the
   severity readout the player is reading. Capped below 1 by the shape of
   the ramp, which is what keeps the car from reversing. */
export const YIELD_RAMP = 4.0;
export const MOST_GIVE = 0.8;

/* A trapezoid in the RATE of falling behind: brake in, hold, recover. Its
   plateau rate is give/(1-FLAT), so a `give` of 0.8 surrenders everything
   and the car is stopped — at which point it falls behind one second per
   second, and nothing can reverse because that is the ceiling.

   `wait` extends the plateau. Slowing has a hard limit on how much time it
   can give up (give x ramp, so 3.2s at most), and a driver being cut up
   badly enough simply stops and waits instead. Measured before this
   existed: 30 of 33 residual collisions could not be avoided by ANY amount
   of slowing, because slowing alone cannot buy more than a few seconds.
   Both parameters are monotone at every instant, which is what lets the
   search bisect them one after the other. */
const FLAT = 0.2;
const K = 1 / (1 - FLAT);

function phasesOf(profile) {
  const { give, ramp, wait } = profile;
  const tIn = FLAT * ramp;
  const tFlat = (1 - 2 * FLAT) * ramp + wait;
  return { tIn, tFlat, tOut: FLAT * ramp, peak: K * give };
}

function lagRateAt(profile, x) {
  if (x <= 0) return 0;
  const { tIn, tFlat, tOut, peak } = phasesOf(profile);
  if (x < tIn) return peak * (x / tIn);
  if (x < tIn + tFlat) return peak;
  if (x < tIn + tFlat + tOut) return peak * (1 - (x - tIn - tFlat) / tOut);
  return 0;
}

function lagTotal(profile, x) {
  if (x <= 0) return 0;
  const { tIn, tFlat, tOut, peak } = phasesOf(profile);
  if (x < tIn) return (peak * x * x) / (2 * tIn);
  let acc = (peak * tIn) / 2;
  if (x < tIn + tFlat) return acc + peak * (x - tIn);
  acc += peak * tFlat;
  if (x < tIn + tFlat + tOut) {
    const y = x - tIn - tFlat;
    return acc + peak * (y - (y * y) / (2 * tOut));
  }
  return acc + (peak * tOut) / 2;
}

export function yieldingProfile(base, { from = 0, give = 0, wait = 0, ramp = YIELD_RAMP } = {}) {
  const g = Math.max(0, Math.min(MOST_GIVE, give));
  const w = Math.max(0, wait);
  const prof = { kind: "yielding", base, from, give: g, wait: w, ramp };
  prof.hold = lagTotal(prof, Infinity);
  return prof;
}

const lagAt = (profile, t) => lagTotal(profile, t - profile.from);
const lagRate = (profile, t) => lagRateAt(profile, t - profile.from);

/* Distance covered by `t` seconds in. */
export function distanceAt(profile, t) {
  if (t <= 0) return 0;
  if (profile.kind === "yielding") {
    return distanceAt(profile.base, Math.max(0, t - lagAt(profile, t)));
  }
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
  if (profile.kind === "yielding") {
    /* Monotone, so bisection is exact enough and this is called once per
       path rather than per frame. Bounded above by the planned time plus
       the whole hold, which is what the lag converges to. */
    let lo = timeToCover(profile.base, d);
    let hi = lo + profile.hold + profile.ramp + profile.wait;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (distanceAt(profile, mid) < d) lo = mid; else hi = mid;
    }
    return hi;
  }
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
  if (profile.kind === "yielding") {
    const base = speedAt(profile.base, Math.max(0, t - lagAt(profile, t)));
    return Math.max(0, base * (1 - lagRate(profile, t)));
  }
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

/* =====================================================================
   TURNS
   A car does not pivot at the stop line and then drive straight. It runs
   up its own lane, turns on a roughly constant radius, and straightens
   into the receiving lane — so a turn is three pieces: straight, arc,
   straight, with the arc tangent to both lane centrelines.

   This replaces a single quadratic Bezier drawn from the stop line to an
   off-board exit point with its control at the corner. Because those two
   legs were wildly unequal (2.7m against 20m on a right turn) the curve
   did nearly all its bending in the first couple of metres: cars began
   steering while still on the approach, left turns crossed onto the
   oncoming side 3.3m BEFORE reaching the junction, and right turns ran
   at a 3.4m radius — tighter than any car can physically steer.

   `radius` is not a picked number. The caller derives it from where the
   car actually rests relative to where the two lane centrelines cross,
   so a wider road gives a wider turn on its own.
   ===================================================================== */
const norm = (v) => { const d = Math.hypot(v.x, v.y) || 1; return { x: v.x / d, y: v.y / d }; };

/* The arc begins where the car is standing, because from a stop that is
   the only place it can begin — a driver cannot start steering before
   they start moving. That pins the honest radius: exactly the distance
   from the car to where the two lane centrelines cross. Turn on that and
   the arc finishes precisely on the receiving lane.

   Which is what makes `radius` the whole model for how well the turn is
   driven. Larger than that distance and the car finishes wide of its
   lane; smaller and it finishes inside — over the kerb on a right, across
   the centreline on a left. The straight run out to `end` then brings it
   back, gradually, exactly as a driver recovers from a bad line. So the
   caller says how tightly this driver turns, and the fault falls out of
   the geometry instead of being drawn on. */
export function turnPoints(start, corner, end, radius, samples = 20) {
  const inDir = norm({ x: corner.x - start.x, y: corner.y - start.y });
  const outDir = norm({ x: end.x - corner.x, y: end.y - corner.y });

  const cross = inDir.x * outDir.y - inDir.y * outDir.x;
  const dot = inDir.x * outDir.x + inDir.y * outDir.y;
  const turn = Math.atan2(cross, dot);              // signed: which way round
  if (Math.abs(turn) < 1e-6) return [start, end];   // straight on: nothing to arc

  const r = Math.max(1, radius);
  const sign = Math.sign(turn) || 1;
  // Centre sits perpendicular to the entry, on the side being turned to.
  const centre = { x: start.x - inDir.y * r * sign, y: start.y + inDir.x * r * sign };

  const a0 = Math.atan2(start.y - centre.y, start.x - centre.x);
  const pts = [start];
  for (let i = 1; i <= samples; i++) {
    const a = a0 + turn * (i / samples);
    pts.push({ x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r });
  }
  pts.push(end);
  return pts;
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
