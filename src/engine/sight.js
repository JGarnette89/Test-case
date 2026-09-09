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
   intersection, and a step that only fits into it once makes creeping a switch
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

/* A control carries its own size, because a sign is drawn as a map symbol
   rather than at its true 0.75 m face — and the scorer must never know
   something the screen did not show, so awareness uses the DRAWN size.
   See SIGN_SIZE in road.js. */
const extentOf = (p) =>
  p.hl != null ? { hl: p.hl, hw: p.hw }
  : p.kind === "ped" ? { hl: M(0.5), hw: M(0.5) }
  : { hl: CAR_L / 2, hw: CAR_W / 2 };

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

/* Standing obstructions — a parked van on the curb, a hedge on the corner.
   Declared per scenario as plain data, because most of what actually
   blocks a driver's view at a intersection is not another car in the road.
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
export function whatEgoSees(sim, t, steps = 0, statics = [], { reach } = {}) {
  const egoPose = creepPose(sim.ego, t, steps);
  const eye = eyePoint(egoPose);

  const live = sim.actors
    .map((p) => ({ p, pose: poseAt(p, t) }))
    .filter(({ pose }) => !pose.gone && !pose.hidden);

  /* Culling is opt-in: omit `reach` and this behaves exactly as it always
     has, which is why the driver game and its checks are untouched. */
  const near = reach ? withinReach(eye, reach, live) : live;
  const walls = reach ? withinReach(eye, reach, statics) : statics;

  const out = {};
  for (const { p, pose } of near) {
    const blockers = [...near.filter((o) => o.p.id !== p.id), ...walls];
    out[p.id] = visibility(eye, p, pose, blockers);
  }
  return out;
}

/* =====================================================================
   WHAT THE EXAMINER CAN SEE

   There was a view cone here. It gated whether a fault counted, and it
   was removed because it produced the one exchange a judgment game cannot
   survive: the player watches a car swing wide, marks it, and the game
   says they did not see it. Technically defensible, completely illegible.

   What constrains attention now is the VIEWPORT — the camera is smaller
   than the situation, so where you point it is a real choice, and that
   lives in frame.js. What survives here is occlusion, which is a
   different thing and stays for a reason worth writing down:

     "things being hidden is core to our gameplay, looking around and
      through objects is what driving in traffic is all about"

   Occlusion is only fair under one constraint, and it is the constraint
   that separates it from the cone:

     THE SCORER MUST NEVER KNOW SOMETHING THE SCREEN DID NOT SHOW.

   So a fault hidden behind a van must also be hidden on the display. This
   file decides; the renderer is obliged to agree with it, and must draw
   from this same answer rather than computing its own. Two visibility
   sources would drift, and the drift would only ever surface as a player
   being wrongly marked. See EXAMINER-REDESIGN.md.

   Sightlines are cast from the CAR's eye, never from the overhead camera,
   because it is the occupant's view that is being modelled. The god's-eye
   presentation is a convenience of the renderer, not a superpower of the
   examiner.
   ===================================================================== */

/* =====================================================================
   CULLING — bounded by the frame, not by a number somebody picked

   A residential tile lays down ~25 blockers per 100m, so a twelve-tile
   drive carries 161 of them, and visibility() is linear in that count:
   0.0042ms against 10 blockers, 0.0334ms against 161. At world scale it
   stops being an optimisation and becomes a prerequisite.

   THE REACH IS DERIVED, NOT DECLARED. The viewport already decides what
   is markable, so anything it cannot show cannot be seen and cannot
   matter — which means the frame IS the range and there is no second
   quantity to keep in step with it. Inventing a SIGHT_RANGE constant
   would be the same mistake as spacing standing in for runway: a proxy
   that happens to correlate, drifting silently the first time the frame
   changes.

   Measured: bounded this way, 151 of 161 blockers fall away, 94%.
   ===================================================================== */

/* How far the eye could possibly need to see, given the frame it is
   looking through: out to the furthest corner of it. */
export function reachOf(eye, view, W = 720) {
  const half = (view.scale * W) / 2;
  return Math.hypot(view.cx - eye.x, view.cy - eye.y) + half * Math.SQRT2;
}

/* Everything that could still occlude something inside that reach.

   A blocker is kept if any part of it could touch a sightline of that
   length, which means its own size is added to the bound rather than its
   centre being tested alone — cull on the centre and a long wall lying
   across the boundary disappears while still blocking the view. */
export function withinReach(eye, reach, items) {
  if (!(reach > 0)) return items;
  return items.filter((b) => {
    const ext = b.hl != null ? { hl: b.hl, hw: b.hw } : extentOf(b.p);
    const own = Math.hypot(ext.hl, ext.hw);
    return Math.hypot(b.pose.x - eye.x, b.pose.y - eye.y) <= reach + own;
  });
}

/* Can the examiner see this fault at this instant?

   Nothing can occlude your own car, so the candidate's own faults are
   always visible to someone sitting in it. Whether they are on SCREEN is
   the viewport's business, not this function's. */
export function faultSeenAt(sim, fault, t, statics = [], { reach } = {}) {
  const subject = [sim.ego, ...sim.actors].find((p) => p.id === fault.who);
  if (!subject) return "hidden";
  if (subject.id === sim.ego.id) return "clear";

  const pose = poseAt(subject, t);
  if (pose.gone || pose.hidden) return "hidden";

  const eye = eyePoint(poseAt(sim.ego, t));
  const others = sim.actors
    .map((p) => ({ p, pose: poseAt(p, t) }))
    .filter(({ p, pose: q }) => !q.gone && !q.hidden && p.id !== fault.who);
  const all = [...others, ...statics];
  return visibility(eye, subject, pose, reach ? withinReach(eye, reach, all) : all);
}

/* How long the screen actually showed this fault, in seconds.

   This is the scorer's gate, and it is a DURATION rather than a share of
   the fault's life on purpose. A share reintroduces exactly the unfairness
   the cone had: a fault visible for a fifth of its duration was shown
   plainly, and calling it unmarkable tells the player they did not see
   something they watched. The honest question is "was it ever on screen
   long enough to register", and REACTION_FLOOR already answers what long
   enough means. */
export function faultShownFor(sim, fault, statics = []) {
  if (!fault.samples || !fault.samples.length) return 0;
  // faults.js samples at STEP, so counting samples IS measuring time.
  let shown = 0;
  for (const s of fault.samples) {
    const v = faultSeenAt(sim, fault, s.t, statics);
    if (v === "clear" || v === "partial") shown += STEP;
  }
  return Math.round(shown * 1000) / 1000;
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

/* How far the ego's nose is short of the middle of the intersection, measured
   along its own approach. Below STOP_LINE_AT it has crossed the line;
   below zero it is through the middle and out the other side.

   Signed on purpose. Straight-line distance cannot tell approaching from
   departed, so a car that has driven clean through reads the same as one
   still short of the line — which made a creep past the intersection look
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
   cars stacked in the box is how the intersection ends up blocked when the
   light changes.

   "Already waiting in the intersection" means inside the box and not
   moving — a car crossing it is passing through, not occupying it.

   THE BOX, not a one-lane guess at it: a car sitting in the outer lane
   of a six-lane arterial is still in the box, and a circle drawn at
   one-lane radius from the centre would miss it. Every participant
   carries the same road spec the intersection was built from, so the box is
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
