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
  M, CX, CY, HALF, CAR_L, CAR_W, STOPS, STOP_LINE_AT,
  poseAt, conflicts, PAD_LONG, PAD_LAT, forwardClaim, STEP,
} from "./index.js";

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
   moving — a car crossing it is passing through, not occupying it. */
export function carWaitingInBox(sim, t, exclude = "ego") {
  for (const a of [...sim.actors]) {
    if (a.id === exclude) continue;
    const p = poseAt(a, t);
    if (p.gone || p.hidden) continue;
    if (!p.waiting && !isStationary(a, t)) continue;
    if (Math.hypot(p.x - CX, p.y - CY) <= HALF + CAR_L / 2) return { blocked: true, who: a.name ?? a.id };
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
