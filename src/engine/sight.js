/* =====================================================================
   SIGHTLINES AND CREEPING

   The whole game so far assumes you can see everything. Real judgment
   fails most often when you cannot: the classic is an unprotected left
   where the oncoming car waiting to turn hides the traffic coming through
   behind it. You cannot read what you cannot see, and the answer is not
   to guess — it is to move up until you can, which costs you safety.

   That trade is the mechanic. Creeping buys sightline and spends margin.
   Go too far and you are in someone's path, which is a critical fault
   whatever else you did.

   Pure geometry. No React, no DOM, no colour. What is visible is derived,
   never authored — the same rule as everything else here.
   ===================================================================== */
import {
  M, CX, CY, LANE, CAR_L, CAR_W, STOPS, STOP_LINE_AT,
  poseAt, conflicts, PAD_LONG, PAD_LAT, forwardClaim, STEP,
} from "./index.js";
import { boxHalf } from "./road.js";

/* The driver sits about a metre back from the front bumper. It matters:
   an eye point at the nose sees past a blocker a whole car length before
   the driver actually can. */
export const EYE_BACK = M(1.0);

/* One press of PULL UP. Sized against the space it has rather than picked:
   there are about two metres between the stop line and the edge of the
   junction, and a step that only fits into it once makes creeping a switch
   instead of a judgment. At 0.9 m there are two presses of genuine
   hesitation before the nose is in the box, which is the decision the
   mechanic exists to pose. Checked in verify-sight.mjs. */
export const PULL_STEP = M(0.9);

const rad = (deg) => (deg * Math.PI) / 180;

export function eyePoint(pose) {
  const r = rad(pose.rot);
  const d = CAR_L / 2 - EYE_BACK;
  return { x: pose.x + Math.cos(r) * d, y: pose.y + Math.sin(r) * d };
}

/* Segment against an oriented box, done in the box's own frame where it
   is an axis-aligned slab test. */
export function segmentHitsBox(p0, p1, pose, hl, hw) {
  const r = rad(-pose.rot);
  const cos = Math.cos(r), sin = Math.sin(r);
  const to = (p) => {
    const dx = p.x - pose.x, dy = p.y - pose.y;
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  };
  const a = to(p0), b = to(p1);
  const d = { x: b.x - a.x, y: b.y - a.y };

  let t0 = 0, t1 = 1;
  for (const [origin, delta, half] of [[a.x, d.x, hl], [a.y, d.y, hw]]) {
    if (Math.abs(delta) < 1e-9) {
      if (origin < -half || origin > half) return false;   // parallel and outside
      continue;
    }
    let lo = (-half - origin) / delta;
    let hi = (half - origin) / delta;
    if (lo > hi) [lo, hi] = [hi, lo];
    t0 = Math.max(t0, lo);
    t1 = Math.min(t1, hi);
    if (t0 > t1) return false;
  }
  return true;
}

const corners = (pose, hl, hw) => {
  const r = rad(pose.rot);
  const cos = Math.cos(r), sin = Math.sin(r);
  const pts = [];
  for (const [a, b] of [[hl, hw], [hl, -hw], [-hl, hw], [-hl, -hw], [0, 0]]) {
    pts.push({ x: pose.x + a * cos - b * sin, y: pose.y + a * sin + b * cos });
  }
  return pts;
};

const extentOf = (p) =>
  p.kind === "ped" ? { hl: M(0.5), hw: M(0.5) } : { hl: CAR_L / 2, hw: CAR_W / 2 };

/* How much of `target` the viewer can see past `blockers`.

   Sampled at the target's corners and centre rather than its middle
   alone: a car half-hidden behind another is exactly the case that gets
   people hurt, and reporting it as "visible" would lose the lesson. */
export function visibility(eye, target, targetPose, blockers) {
  const ext = extentOf(target);
  const pts = corners(targetPose, ext.hl, ext.hw);
  let seen = 0;
  for (const pt of pts) {
    let blocked = false;
    for (const b of blockers) {
      // A standing obstruction carries its own size; a road user is sized
      // from what it is.
      const be = b.hl != null ? { hl: b.hl, hw: b.hw } : extentOf(b.p);
      if (segmentHitsBox(eye, pt, b.pose, be.hl, be.hw)) { blocked = true; break; }
    }
    if (!blocked) seen++;
  }
  if (seen === 0) return "hidden";
  if (seen < pts.length) return "partial";
  return "clear";
}

/* Standing obstructions — a parked van on the kerb, a hedge on the corner.
   Declared per scenario as plain data, because most of what actually
   blocks a driver's view at a junction is not another car in the road.
   The engine has no idea what the renderer draws there, so a scenario
   that wants a blind corner has to say so.

   { x, y, rot, hl, hw } in engine pixels, like everything else. */
export function sightBlockersOf(scn) {
  return (scn?.sightBlockers ?? []).map((b) => ({
    p: { id: b.id ?? "obstruction", kind: "static" },
    pose: { x: b.x, y: b.y, rot: b.rot ?? 0 },
    hl: b.hl ?? M(2.4),
    hw: b.hw ?? M(1.0),
  }));
}

/* What the ego can see of everyone else, at a moment, having crept
   `steps` times. Returns a map of actor id to visibility. */
export function whatEgoSees(sim, t, steps = 0, statics = []) {
  const egoPose = creepPose(sim.ego, t, steps);
  const eye = eyePoint(egoPose);

  const live = sim.actors
    .map((p) => ({ p, pose: poseAt(p, t) }))
    .filter(({ pose }) => !pose.gone && !pose.hidden);

  const out = {};
  for (const { p, pose } of live) {
    const blockers = [...live.filter((o) => o.p.id !== p.id), ...statics];
    out[p.id] = visibility(eye, p, pose, blockers);
  }
  return out;
}

/* =====================================================================
   THE EXAMINER'S SEAT

   Everything above answers "what can the driver see", and answers it
   omnidirectionally: occlusion only, no field of view, because a driver
   choosing when to go is assumed to have looked. An examiner is the
   opposite case. Their whole job is where they point their attention,
   so what they see is occlusion AND a cone.

   The cone is one angular test in front of the occlusion work already
   here. That is the entire engine cost of the examiner flip's headline
   mechanic.
   ===================================================================== */

/* Across from the driver, same row. The examiner's head turns; the car
   does not turn with it. */
export const EXAMINER_ACROSS = M(0.7);

/* A comfortable field of useful attention, full angle. Wider than this
   and holding a gaze stops being a decision; much narrower and the
   measured spread of real faults (54 degrees across the shipped set)
   stops fitting in any single look. */
export const EXAMINER_CONE = 60;

export function examinerEye(egoPose, across = EXAMINER_ACROSS) {
  const e = eyePoint(egoPose);
  const r = rad(egoPose.rot);
  return { x: e.x - Math.sin(r) * across, y: e.y + Math.cos(r) * across };
}

/* Signed degrees from the car's own heading to a point: negative is to
   the candidate's left, positive to their right, zero straight ahead.

   RELATIVE to the car, never absolute, and that is load-bearing rather
   than a convenience. route.js rotates a scenario a quarter turn to reuse
   it from another approach, and the whole reason that is safe is that a
   rotated scene is an identical situation pointing a different way. An
   examiner gaze held in world degrees would break exactly that: the same
   drive would need a different look on every rotation. Held against the
   car's heading it rotates with the scene for free. */
export function bearingFromCar(egoPose, eye, point) {
  const ang = (Math.atan2(point.y - eye.y, point.x - eye.x) * 180) / Math.PI;
  return ((ang - egoPose.rot + 540) % 360) - 180;
}

/* Is `point` inside a cone of `cone` degrees centred `gaze` degrees off
   the car's heading? */
export function inCone(egoPose, eye, gaze, point, cone = EXAMINER_CONE) {
  const off = bearingFromCar(egoPose, eye, point) - gaze;
  return Math.abs(((off + 540) % 360) - 180) <= cone / 2;
}

/* What the examiner can see of everyone at a moment, given where they are
   looking. Same shape as whatEgoSees — actor id to visibility — with one
   extra state the driver's version never needed: "away", meaning nothing
   is blocking it, you simply were not looking there.

   Distinguishing "away" from "hidden" is the point. Missing a fault
   because a van was in the way is the scenario's doing; missing it
   because you were looking the other way is yours. */
export function whatExaminerSees(sim, t, { gaze = 0, cone = EXAMINER_CONE, statics = [] } = {}) {
  const egoPose = poseAt(sim.ego, t);
  const eye = examinerEye(egoPose);

  const live = sim.actors
    .map((p) => ({ p, pose: poseAt(p, t) }))
    .filter(({ pose }) => !pose.gone && !pose.hidden);

  const out = {};
  for (const { p, pose } of live) {
    if (!inCone(egoPose, eye, gaze, pose, cone)) { out[p.id] = "away"; continue; }
    const blockers = [...live.filter((o) => o.p.id !== p.id), ...statics];
    out[p.id] = visibility(eye, p, pose, blockers);
  }
  return out;
}

/* Could the examiner have seen this fault happen, looking `gaze` degrees
   off the car's heading the whole time it was live?

   Returns the share of the fault's own duration during which it was both
   in the cone and not occluded — so a fault glimpsed at the edge of a
   look reads differently from one watched throughout. A signal-channel
   fault is judged on the car's position exactly like a path one: you read
   an indicator by looking at the car wearing it. */
/* Reading the candidate's OWN driving is a different act from spotting
   another road user, and the geometry says so: the examiner is sitting in
   that car, roughly a metre from its centre, so the bearing to it is
   meaningless and every fault it commits would read as 90 degrees off to
   the side. Nothing occludes it either.

   What an examiner is actually doing is reading the car against the road
   ahead of it — its line in the lane, how square it is to the kerb, where
   it is going to end up. So the cone is tested against the road the car
   is about to cover, one look-ahead in front of the bonnet, and occlusion
   does not apply. Gaze still matters: stare out of the side window and
   you stop reading the line. */
export const OWN_CAR_READ_AT = M(12);

function ownCarTarget(pose) {
  const r = rad(pose.rot);
  return { x: pose.x + Math.cos(r) * OWN_CAR_READ_AT, y: pose.y + Math.sin(r) * OWN_CAR_READ_AT };
}

export function faultVisibility(sim, fault, { gaze = 0, cone = EXAMINER_CONE, statics = [] } = {}) {
  const subject = [sim.ego, ...sim.actors].find((p) => p.id === fault.who);
  if (!subject) return { seen: 0, best: "away" };

  if (subject.id === sim.ego.id) {
    let seenFor = 0;
    for (const s of fault.samples) {
      const egoPose = poseAt(sim.ego, s.t);
      const eye = examinerEye(egoPose);
      if (inCone(egoPose, eye, gaze, ownCarTarget(egoPose), cone)) seenFor++;
    }
    const share = fault.samples.length ? seenFor / fault.samples.length : 0;
    return { seen: share, best: share > 0 ? "clear" : "away" };
  }

  const rank = { away: 0, hidden: 1, partial: 2, clear: 3 };
  let seenFor = 0, best = "away";

  for (const s of fault.samples) {
    const egoPose = poseAt(sim.ego, s.t);
    const eye = examinerEye(egoPose);
    const pose = poseAt(subject, s.t);
    let state;
    if (!inCone(egoPose, eye, gaze, pose, cone)) {
      state = "away";
    } else {
      const others = sim.actors
        .map((p) => ({ p, pose: poseAt(p, s.t) }))
        .filter(({ p, pose }) => !pose.gone && !pose.hidden && p.id !== fault.who);
      state = visibility(eye, subject, pose, [...others, ...statics]);
    }
    if (rank[state] > rank[best]) best = state;
    if (state === "partial" || state === "clear") seenFor++;
  }
  return { seen: fault.samples.length ? seenFor / fault.samples.length : 0, best };
}

/* ---------------------------------------------------------------------
   Creeping
   --------------------------------------------------------------------- */

/* The ego's pose after `steps` presses of PULL UP, while still waiting.
   Straight up its own approach — creeping is not steering. */
export function creepPose(ego, t, steps = 0) {
  const base = poseAt(ego, t);
  if (!steps) return base;
  const r = rad(base.rot);
  return {
    ...base,
    x: base.x + Math.cos(r) * PULL_STEP * steps,
    y: base.y + Math.sin(r) * PULL_STEP * steps,
  };
}

/* How far the ego's nose is short of the middle of the junction, measured
   along its own approach. Below STOP_LINE_AT it has crossed the line;
   below zero it is through the middle and out the other side.

   Signed on purpose. Straight-line distance cannot tell approaching from
   departed, so a car that has driven clean through reads the same as one
   still short of the line — which made a creep past the junction look
   like a creep up to it. */
export function noseOut(pose) {
  const r = rad(pose.rot);
  const nx = pose.x + Math.cos(r) * (CAR_L / 2);
  const ny = pose.y + Math.sin(r) * (CAR_L / 2);
  return -((nx - CX) * Math.cos(r) + (ny - CY) * Math.sin(r));
}

export function crossedStopLine(pose) {
  return noseOut(pose) < STOP_LINE_AT;
}

/* Has the ego crept into the path of traffic that has right of way?

   The rule as stated: intersecting with the path of other traffic, which
   includes pedestrians and cyclists approaching a crossing and not only
   vehicles on the road. So every prior is checked, on foot or not, across
   the whole time they are moving through — a stationary car in someone's
   way is in it for as long as they take to arrive. */
export function encroaches(sim, t, steps, until = null) {
  const pose = creepPose(sim.ego, t, steps);
  const ego = { ...sim.ego, kind: "car" };
  const end = until ?? t + 6;

  for (const a of sim.priors) {
    for (let u = t; u <= end; u += STEP) {
      const theirs = poseAt(a, u);
      if (theirs.gone || theirs.hidden) continue;
      // The ego is stopped, so it claims nothing; they claim what they need.
      if (conflicts(ego, pose, a, theirs, PAD_LONG, PAD_LAT, forwardClaim(a, u), "yield")) {
        return { encroached: true, who: a.name ?? a.id, at: Math.round(u * 100) / 100 };
      }
    }
  }
  return { encroached: false };
}

/* Ontario: a vehicle waiting to turn left must not cross the stop line
   while a car ahead of it is already waiting in the intersection. Two
   cars stacked in the box is how the junction ends up blocked when the
   light changes.

   "Already waiting in the intersection" means inside the box and not
   moving — a car crossing it is passing through, not occupying it.

   THE BOX, not a one-lane guess at it: a car sitting in the outer lane
   of a six-lane arterial is still in the box, and a circle drawn at
   one-lane radius from the centre would miss it. Every participant
   carries the same road spec the junction was built from, so the box is
   read off that, not off a fixed number — see road.js. */
export function carWaitingInBox(sim, t, exclude = "ego") {
  const { vx, hy } = boxHalf(sim.ego.road, LANE);
  const reachX = vx + CAR_L / 2, reachY = hy + CAR_L / 2;
  for (const a of [...sim.actors]) {
    if (a.id === exclude) continue;
    const p = poseAt(a, t);
    if (p.gone || p.hidden) continue;
    if (!p.waiting && !isStationary(a, t)) continue;
    if (Math.abs(p.x - CX) <= reachX && Math.abs(p.y - CY) <= reachY) {
      return { blocked: true, who: a.name ?? a.id };
    }
  }
  return { blocked: false };
}

function isStationary(p, t) {
  const a = poseAt(p, t), b = poseAt(p, t + 0.1);
  return Math.hypot(b.x - a.x, b.y - a.y) < M(0.15);
}

/* The whole judgment on a creep, in one call: is it allowed, and what
   did it buy? */
export function assessCreep(sim, t, steps, statics = []) {
  const pose = creepPose(sim.ego, t, steps);
  const crossed = crossedStopLine(pose);
  const box = crossed ? carWaitingInBox(sim, t) : { blocked: false };
  const enc = encroaches(sim, t, steps);
  return {
    steps,
    noseOut: Math.round(noseOut(pose) * 100) / 100,
    crossedStopLine: crossed,
    blockedBox: box.blocked,
    blockedBoxWho: box.who ?? null,
    ...enc,
    sees: whatEgoSees(sim, t, steps, statics),
  };
}
