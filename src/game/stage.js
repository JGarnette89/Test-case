/* =====================================================================
   THE STAGING OF A ROUND (WORK-game-slice3): pure, no React, no DOM, so a
   check in Node reads the same arithmetic the screen draws with. PRESENTATION
   ONLY: nothing here changes a round's rules, its verdict or the sim.

   Jay, 25 November, after playing slice 2: "It should feel like a snap
   decision, the game state begins with the world waiting, and an extreme
   zoomed out view. The player should see their car screech into the hold
   position, and see the relevant traffic." The world stays frozen until the
   player acts: no timer; the snap is the staging.

   THE INTRO, in order (all durations [invented], dialled with Jay, kept here):
     far shot   HOLD_FAR   the whole map fits, the player's heading up, the
                           player's car at the START of its recorded arrival;
     screech    SCREECH    the car replays its arrival fast and stops hard,
                           and the camera dives into the decision view;
     settle     SETTLE     the body bounces back to level (a damped pitch).
   The button is shown and accepted from INTRO_END.

   THE SCREECH IS A CINEMATIC. The sim's own approach braked comfortably and is
   untouched: what is replayed is the pose the sim recorded (round.js `trail`),
   resampled by distance with a time warp. No harsh-braking event comes of it,
   because the approach's events are not the player's (slice 2).
   ===================================================================== */
import { atNode, conflictOf, CAR } from "../sim/crossing.js";
import { lenOf } from "../sim/traffic.js";
import { fitK } from "../iso/freecam.js";
import { UP_HEADING } from "../iso/chase.js";

/* THE TIMES, seconds. All [invented]. */
export const HOLD_FAR = 0.5;
export const SCREECH = 0.8;
export const SETTLE = 0.4;
export const INTRO_END = HOLD_FAR + SCREECH + SETTLE;   // 1.7 s: the button is accepted from here

/* THE ARRIVAL RECORDED: seconds of sim ticks before the freeze that `trail` holds [invented]. (round.js reads it.) */
export const TRAIL = 3.0;
/* ...and AT LEAST this many metres of road, whichever is longer [invented; a departure from the spec, see round.js toDecision]: it is
   SKID plus a margin, so the marks have road to lie on. */
export const TRAIL_MIN_M = 15;
/* Metres of the trail, ending at the frozen pose, that carry skid marks [invented], and how far the marks sit either side of the car's centre line [invented]. */
export const SKID = 12;
export const SKID_HALF = 0.8;
/* The marks end this far behind the car's centre, under its own body: they are drawn over the road AFTER the cars (drawFrame is one
   painter's pass this slice may not edit), so the car's own footprint must be kept clear or the lines would be drawn across its roof. [invented] */
export const SKID_REAR = 2.4;
/* The nose dive at full braking, degrees (nose down is negative pitch, iso/body.js) [invented]; it comes on over the first RAMP of the replay. */
export const PITCH_DIVE = 10;
const RAMP = 0.15;
/* The ring: at least this many SCREEN pixels in radius, so a car a few pixels long at the far zoom still reads [the spec's]. */
export const RING_MIN_PX = 14;
/* The decision camera [invented, slice 2's]: centred this far ahead of the stop line along the player's heading, zoomed so a circle of
   this radius fits the shorter screen side. */
export const CENTRE_AHEAD = 10;   // m
export const SEE_RADIUS = 45;     // m

const DEG = Math.PI / 180;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (b) => b * b * (3 - 2 * b);
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

/* ---------------------------------------------------------------- THE TRAIL */

/* Cumulative distance along a trail's positions, and the whole length. */
export function alongOf(trail) {
  const d = [0];
  for (let i = 1; i < trail.length; i++) d.push(d[i - 1] + Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y));
  return { d, total: d[d.length - 1] ?? 0 };
}

/* The pose at a distance along the trail (clamped to its ends): position and height by lerp, heading the short way round. */
export function poseAtDistance(trail, along, dist) {
  const n = trail.length;
  if (n === 0) return null;
  if (n === 1 || dist <= 0) return { x: trail[0].x, y: trail[0].y, z: trail[0].z ?? 0, heading: trail[0].heading };
  if (dist >= along.total) { const e = trail[n - 1]; return { x: e.x, y: e.y, z: e.z ?? 0, heading: e.heading }; }
  let i = 1;
  while (i < n - 1 && along.d[i] < dist) i++;
  const a = trail[i - 1], b = trail[i], span = along.d[i] - along.d[i - 1], f = span > 0 ? (dist - along.d[i - 1]) / span : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f, heading: a.heading + norm(b.heading - a.heading) * f };
}

/* THE SHARE OF THE TRAIL COVERED at `u` of the replay: fast at the start, abrupt at the end. [invented, the spec's cubic ease-out] */
export const coveredShare = (u) => 1 - Math.pow(1 - clamp01(u), 3);

/* THE SCREECH: the car's pose and body at `u` in [0, 1] of the replay. `pitch` is radians, nose down negative: it comes on over the
   first RAMP of the replay and holds to the stop (hard braking all the way down), then `settleAt` takes it back to level. */
export function screechAt(trail, u) {
  const along = alongOf(trail), p = poseAtDistance(trail, along, coveredShare(u) * along.total);
  if (!p) return null;
  const r = clamp01(u / RAMP);
  return { ...p, pitch: -PITCH_DIVE * DEG * ease(r), roll: 0 };
}

/* THE SETTLE: the pitch (radians) `tau` seconds after the stop. A damped bounce from the full dive: one overshoot nose-up, level and
   at rest at SETTLE exactly. [invented] */
export function settleAt(tau) {
  const x = tau / SETTLE;
  if (x >= 1) return 0;
  if (x <= 0) return -PITCH_DIVE * DEG;
  return -PITCH_DIVE * DEG * Math.exp(-3 * x) * Math.cos(1.5 * Math.PI * x);
}

/* WHERE THE INTRO IS at `t` seconds: the phase, and the player's drawn pose and body for it. `null` pose once it is over (the sim's own
   pose and body are the player's again). */
export function introAt(trail, t) {
  if (t >= INTRO_END || !trail?.length) return { phase: "done", pose: null, body: null, u: 1 };
  const far = t < HOLD_FAR, u = clamp01((t - HOLD_FAR) / SCREECH);
  if (t < HOLD_FAR + SCREECH) {
    const s = screechAt(trail, u);
    return { phase: far ? "far" : "screech", pose: { x: s.x, y: s.y, z: s.z, heading: s.heading }, body: { roll: 0, pitch: s.pitch, pivot: 0.35 }, u };
  }
  const s = screechAt(trail, 1);
  return { phase: "settle", pose: { x: s.x, y: s.y, z: s.z, heading: s.heading }, body: { roll: 0, pitch: settleAt(t - HOLD_FAR - SCREECH), pivot: 0.35 }, u: 1 };
}

/* THE SKID MARKS: two polylines of world points { x, y, z } (the rear wheels, SKID_HALF either side of the centre line) along the last
   SKID metres of the trail, from where the car has got to by `u` of the replay (1 for the rest of the round). The marks stop SKID_REAR
   short of the car's centre. Empty until the car has covered some of it. */
export function skidLines(trail, u = 1) {
  if (!trail?.length) return [[], []];
  const along = alongOf(trail), D = along.total;
  const from = Math.max(0, D - SKID), to = Math.min(coveredShare(u) * D, D) - SKID_REAR;
  if (!(to > from)) return [[], []];
  const left = [], right = [], n = Math.max(2, Math.ceil((to - from) / 0.5));
  for (let i = 0; i <= n; i++) {
    const p = poseAtDistance(trail, along, from + ((to - from) * i) / n), h = p.heading * DEG, nx = -Math.sin(h), ny = Math.cos(h);
    left.push({ x: p.x - nx * SKID_HALF, y: p.y - ny * SKID_HALF, z: p.z });
    right.push({ x: p.x + nx * SKID_HALF, y: p.y + ny * SKID_HALF, z: p.z });
  }
  return [left, right];
}

/* ------------------------------------------------------------ THE CAMERAS */

/* THE DECISION CAMERA (slice 2's, moved here so a check can read it): from the player's frozen pose `p` { x, y, z, heading } and the screen. */
export function decisionCamera(p, size) {
  const h = p.heading * DEG;
  return { cam: { x: p.x + Math.cos(h) * CENTRE_AHEAD, y: p.y + Math.sin(h) * CENTRE_AHEAD, z: p.z ?? 0 }, rot: UP_HEADING - p.heading, k: Math.min(size.w, size.h) / (2 * SEE_RADIUS * Math.SQRT2) };
}

/* THE FAR VIEW: the whole map (`bounds`, its loaded bounds) fits the screen, the player's heading up.
   THE CENTRE USED IS THE MAP'S CENTRE (which keeps the player's car and the intersection both on screen, being inside the bounds).
   The zoom is iso/freecam.js `fitK` on the bounds as the rotated view sees them, BUT NOT ABOVE what keeps the lower corner on the screen:
   fitK sizes the projection to the canvas centred, while the camera puts its anchor at 55% of the height (iso/project.js CENTRE_Y), so a
   map that fills fitK's height runs 5% off the bottom. The cap below is that missing term. */
export function farCamera(bounds, p, size) {
  const rot = UP_HEADING - p.heading, a = rot * DEG, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const rb = { x: 0, y: 0, w: bounds.w * c + bounds.h * s, h: bounds.w * s + bounds.h * c };
  const across = rb.w + rb.h;
  const kv = (0.43 * size.h) / ((across * 0.5) / 2);   // ground squash g = 0.5 at the default elevation; the lower half of the map is across * g / 2
  return { cam: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, z: 0 }, rot, k: Math.min(fitK(rb, size), kv) };
}

/* THE INTRO CAMERA at `t`: the far view for HOLD_FAR, then over SCREECH eased into the decision camera, the position and the zoom on the
   one easing so the car (which arrives over the same time) stays in frame. `far` and `decision` are { cam, rot, k }. */
export function introCamera(t, far, decision) {
  const b = ease(clamp01((t - HOLD_FAR) / SCREECH));
  return {
    cam: { x: far.cam.x + (decision.cam.x - far.cam.x) * b, y: far.cam.y + (decision.cam.y - far.cam.y) * b, z: (far.cam.z ?? 0) + ((decision.cam.z ?? 0) - (far.cam.z ?? 0)) * b },
    rot: far.rot + norm(decision.rot - far.rot) * b,
    k: far.k + (decision.k - far.k) * b,
  };
}

/* ------------------------------------------------------ THE RELEVANT TRAFFIC */

/* THE CARS THAT MATTER TO THE DECISION at this node: other road users at the player's node whose path CONFLICTS with the player's route
   there and who are not yet past that conflict (their `s` at most the conflict's `clearOf`, as crossing.js blockedBy reads it: plus half
   a car and the length beyond a car's own). Derived from the sim's own geometry, never typed in; recomputed from the drawn world. */
export function relevantIds(world, me) {
  const k = me.k ?? 0, L = world.course?.at[k]?.layout;
  if (!L) return [];
  const out = [];
  for (const a of atNode(world, world.actors, k)) {
    if (a.id === me.id || a.shadow || a.player || a.route == null || (a.k ?? 0) !== k) continue;
    const hit = conflictOf(L, me.route, a.route);
    if (!hit) continue;
    if (a.s > hit.clearOf + CAR.length / 2 + (lenOf(a) - CAR.length)) continue;   // already past it
    out.push(a.id);
  }
  return out;
}
