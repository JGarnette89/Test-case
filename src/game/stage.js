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
     screech    SCREECH    the car replays its arrival fast and stops hard,
                           in the DECISION FRAME the camera already holds
                           (slice 5: there is no far shot and no dive);
     settle     SETTLE     the body bounces back to level (a damped pitch).
   The button is shown and accepted from INTRO_END.

   THE SCREECH IS A CINEMATIC. The sim's own approach braked comfortably and is
   untouched: what is replayed is the pose the sim recorded (round.js `trail`),
   resampled by distance with a time warp. No harsh-braking event comes of it,
   because the approach's events are not the player's (slice 2).
   ===================================================================== */
import { atNode, conflictOf, blockedBy, CAR, carriedWorld, carriedPose, AT_REST } from "../sim/crossing.js";
import { lenOf } from "../sim/traffic.js";
import { driverPose } from "../sim/drive.js";
import { fitK } from "../iso/freecam.js";
import { UP_HEADING } from "../iso/chase.js";

/* THE TIMES, seconds. All [invented]. */
/* Slice 5, Jay: "realism in speed and acceleration/stopping isn't a primary concern here": 24 m in 0.6 s quadratic enters at about 80 m/s and
   stops at about 133 m/s^2 [D: 2 x 24 / 0.6, 2 x 24 / 0.6^2, assuming the 24 m trail]: an arcade cinematic, flagged. (Slice 4: 1.1 s.) */
/* Slice 6: lengthened to 0.8 s [invented] so the player has time to take in the arriving traffic (24 m in 0.8 s quadratic enters at about 60 m/s
   [D: 2 x 24 / 0.8, assuming the 24 m trail]); the intro is 1.05 s with SETTLE. */
export const SCREECH = 0.8;
export const SETTLE = 0.25;
export const INTRO_END = SCREECH + SETTLE;   // 1.05 s: the button is accepted from here

/* THE PLAYBACK AFTER GO (slice 5, section 3): the sim runs this many ticks per tick of real time from the moment the player lets go to the
   end of the round [invented]. Same ticks, so the same verdict; only the playback is quicker. Game.jsx reads it through `speedOf`. */
export const FAST = 2;
export const speedOf = (phase) => (phase === "gone" ? FAST : 1);

/* THE WORLD'S ARRIVAL (slice 6): seconds of sim ticks before the freeze that `decision.replay` holds [invented]. Played over the intro, so faster than
   real time by REPLAY_RATE [D: REPLAY / INTRO_END]: arcade, as the screech is. round.js reads REPLAY. */
export const REPLAY = 2.0;
export const REPLAY_RATE = REPLAY / INTRO_END;
/* A MOTION STREAK is this many seconds of a car's travel long [invented]. */
export const STREAK_S = 0.5;

/* THE ARRIVAL RECORDED: seconds of sim ticks before the freeze that `trail` holds [invented]. (round.js reads it.) */
export const TRAIL = 3.0;
/* ...and AT LEAST this many metres of road, whichever is longer [invented; a departure from the spec, see round.js toDecision]: it is
   SKID plus a margin, so the marks have road to lie on. */
export const TRAIL_MIN_M = 24;
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

/* THE SHARE OF THE TRAIL COVERED at `u` of the replay: a CONSTANT DECELERATION to rest, the motion of a hard braking stop, which is what
   a screech is (review, 25 November). The spec's cubic ease-out entered at three times the trail's average speed, about 56 m/s (roughly
   200 km/h) over 15 m in 0.8 s, and would read as a jump, not a stop. Quadratic over 1.0 s enters at twice the average, about 30 m/s
   (108 km/h), and stops at about 30 m/s^2 [D: 2 x 15 m / 1.0 s, and 2 x 15 m / 1.0 s^2, assuming the 15 m trail]. Still a cinematic,
   still abrupt at the end (the last tenth of u covers 1% of the road). [invented] */
export const coveredShare = (u) => 1 - Math.pow(1 - clamp01(u), 2);

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

/* WHERE THE INTRO IS at `t` seconds: the phase, and the player's drawn pose and body for it. `null` pose once it is over (the sim's own pose
   and body are the player's again). */
export function introAt(trail, t) {
  if (t >= INTRO_END || !trail?.length) return { phase: "done", pose: null, body: null, u: 1 };
  if (t < SCREECH) {
    const u = clamp01(t / SCREECH), s = screechAt(trail, u);
    return { phase: "screech", pose: { x: s.x, y: s.y, z: s.z, heading: s.heading }, body: { roll: 0, pitch: s.pitch, pivot: 0.35 }, u };
  }
  const s = screechAt(trail, 1);
  return { phase: "settle", pose: { x: s.x, y: s.y, z: s.z, heading: s.heading }, body: { roll: 0, pitch: settleAt(t - SCREECH), pivot: 0.35 }, u: 1 };
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

/* THE CAMERA OF A DECISION (slice 5): the frame { x, y, w, h } (decisionFrame, below) fits the screen, the player's heading up.
   THE CENTRE USED IS THE FRAME'S CENTRE. The zoom is iso/freecam.js `fitK` on the frame as the rotated view sees it, BUT NOT ABOVE what
   keeps the lower corner on the screen: fitK sizes the projection to the canvas centred, while the camera puts its anchor at 55% of the
   height (iso/project.js CENTRE_Y), so a frame that fills fitK's height runs 5% off the bottom. The cap below is that missing term.
   `p` is the player's frozen pose (only its heading is read). */
export function frameCamera(bounds, p, size) {
  const rot = UP_HEADING - p.heading, a = rot * DEG, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const rb = { x: 0, y: 0, w: bounds.w * c + bounds.h * s, h: bounds.w * s + bounds.h * c };
  const across = rb.w + rb.h;
  const kv = (0.43 * size.h) / ((across * 0.5) / 2);   // ground squash g = 0.5 at the default elevation; the lower half of the frame is across * g / 2
  return { cam: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2, z: 0 }, rot, k: Math.min(fitK(rb, size), kv) };
}

/* THE FRAME OF A DECISION (slice 5, section 1; slice 6 section 2): the world rectangle { x, y, w, h } the camera holds, derived from THE DECISION and never
   from the map or the arrival. It fits the intersection's own box (its node, plus or minus the layout's box half-size), the player's stop
   pose, and every relevant car at its line or in the box (whyRelevant "line" or "box") by its drawn pose -- grown by FRAME_MARGIN on each side, and never
   less than FRAME_MIN_R round the box's centre -- and nothing else. Dropped from slice 4: the trail's start (the player's car screeches
   in from the edge and may start outside it) and the decision view's 45 m circle. */
export const FRAME_MARGIN = 4;    // m [invented; slice 6, from 6]
export const FRAME_MIN_R = 14;    // m [invented; slice 6, from 25]
export function decisionFrame(rs) {
  const { world, me } = rs, k = rs.targetK ?? me.k ?? 0;
  const L = world.course.at[k].layout, at = L.place.at;
  const stop = driverPose(me, world.course);
  const pts = [stop];
  const half = Math.max(L.place.boxHalf ?? 0, ...Object.values(L.legs ?? {}).map((l) => l.boxHalf ?? 0));
  for (const dx of [-half, half]) for (const dy of [-half, half]) pts.push({ x: at.x + dx, y: at.y + dy });
  const wc = carriedWorld(world, 0);
  /* SLICE 6, Jay: "the wide view": ONLY a car at its line or in the box shapes the frame. An ARRIVING car (up to 4 s out, 55 m at 50 km/h) and a
     HOLDING car (the sound driver's conservative gap, 230 m out at worst [M, slice 5 review run]) would each widen it to 50-108 m and make the cars
     that decide the decision small. They are shown by a ring and their seconds when on the screen, and by a badge pinned to its edge (edgePoint)
     pointing at them when not. */
  for (const id of relevantIds(world, me)) {
    const a = world.actors.find((c) => c.id === id), why = a && whyRelevant(world, me, a);
    if (why === "line" || why === "box") { const p = carriedPose(wc, a, 0); pts.push({ x: p.x, y: p.y }); }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  x0 -= FRAME_MARGIN; y0 -= FRAME_MARGIN; x1 += FRAME_MARGIN; y1 += FRAME_MARGIN;
  x0 = Math.min(x0, at.x - FRAME_MIN_R); y0 = Math.min(y0, at.y - FRAME_MIN_R); x1 = Math.max(x1, at.x + FRAME_MIN_R); y1 = Math.max(y1, at.y + FRAME_MIN_R);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/* ------------------------------------------------------ THE RELEVANT TRAFFIC */

/* A car's distance along its own path to where its conflict with the player's route begins (crossing.js blockedBy's `meet.a - them.s`). */
const theirIn = (L, me, a) => { const meet = conflictOf(L, a.route, me.route); return meet ? meet.a - a.s : null; };

/* Seconds [invented, the spec's 4.0]: an arriving car is relevant when its distance to the conflict over its speed is at most this. */
export const ARRIVE_WITHIN = 4.0;
/* WHY a car matters to the decision right now, or null. The car must CONFLICT with the player's route and not yet be past that conflict
   (crossing.js blockedBy's own test: its `s` at most the conflict's `clearOf`, plus half a car and the length beyond a car's own), and
   then be one of (slice 5, Jay: "cars shown at the extremes of the road are completely irrelevant"):
     "line"      at its stop line, at rest, its stop counted (the sim records `stoppedAt` only for a car that stopped at its line, wherever
                 within it a driver who stops short came to rest: the sim's own counted stop, not a distance of ours);
     "box"       in the box (past its stop line) or going;
     "arriving"  its distance to the conflict over its speed is at most ARRIVE_WITHIN.
   A car further out is drawn, not ringed, and does not shape the frame. */
export function whyRelevant(world, me, a) {
  const L = world.course?.at[me.k ?? 0]?.layout;
  if (!L || a.id === me.id || a.shadow || a.player || a.route == null || (a.k ?? 0) !== (me.k ?? 0)) return null;
  const hit = conflictOf(L, me.route, a.route);
  if (!hit) return null;
  if (a.s > hit.clearOf + CAR.length / 2 + (lenOf(a) - CAR.length)) return null;   // already past it
  const q = L.paths[a.route];
  if (a.going || a.s >= q.stopAt) return "box";
  if (a.v < AT_REST && a.stoppedAt != null) return "line";
  const d = theirIn(L, me, a);
  if (d != null && a.v > AT_REST && d / a.v <= ARRIVE_WITHIN) return "arriving";
  /* "holds" (review, 25 November): the sim's own sound driver (caution 1) must yield to it, however far out. Without this, 24 of 108 wait
     seeds showed NO car at the freeze [M, verify-rounds, slice 5's first run]: the careful driver's conservative gap waits for a car more
     than ARRIVE_WITHIN out, and the player was asked to wait for something they were not shown. The car that makes it a wait round decides
     the decision, so it is shown, with its seconds (arrivalSeconds), and the player judges whether to thread the needle. */
  if (blockedBy({ ...me, caution: 1 }, a, L, 1, world.t ?? 0)) return "holds";
  return null;
}

/* THE CARS THAT MATTER TO THE DECISION at this node, by whyRelevant. Derived from the sim's own geometry, never typed in; recomputed from
   the drawn world. */
export function relevantIds(world, me) {
  const k = me.k ?? 0;
  if (!world.course?.at[k]?.layout) return [];
  return atNode(world, world.actors, k).filter((a) => whyRelevant(world, me, a)).map((a) => a.id);
}

/* ------------------------------------------------------ THE STOPPING ORDER (slice 5, section 2) */

/* Restates crossing.js's `const SAME_MOMENT = 0.4;` (line 661, not exported): two stops within it share a number and the sim settles them by
   the right-hand rule. tools/verify-rounds.mjs reads that line's text and holds the two equal. [the sim's own tolerance] */
export const SAME_MOMENT = 0.4;

/* THE ORDER THEY STOPPED: every car at the player's node standing at its line under a STOP (the player's included), with its stop counted
   and not yet going, numbered by `stoppedAt` and nothing else. Stops within SAME_MOMENT of the one before share a number, so any two cars
   with different numbers differ by more than the sim's tolerance and the sim's own order applies. Returns [{ id, n, you, stoppedAt }]. */
export function stopOrder(world, me) {
  const k = me.k ?? 0, L = world.course?.at[k]?.layout;
  if (!L) return [];
  const rows = atNode(world, world.actors, k).filter((a) => {
    if (a.shadow || a.route == null || (a.k ?? 0) !== k || a.going || a.stoppedAt == null || a.v >= AT_REST) return false;
    const q = L.paths[a.route];
    if (!q) return false;
    return (L.place.control?.[q.from] ?? L.legs[q.from]?.control) === "stop";
  }).sort((x, y) => x.stoppedAt - y.stoppedAt);
  const out = [];
  let n = 0, prev = -Infinity;
  for (const a of rows) {
    if (a.stoppedAt - prev > SAME_MOMENT) n++;
    prev = a.stoppedAt;
    out.push({ id: a.id, n, you: a.id === me.id || !!a.player, stoppedAt: a.stoppedAt });
  }
  return out;
}

/* A BADGE FOR A CAR OFF THE SCREEN (review, 25 November): the screen point (px, py) pulled in along the line from the screen's centre until
   it lies INSET pixels inside every edge. A point already inside stays where it is. Returns { x, y, off, angle }, angle (radians, screen)
   from the badge toward the car, for the pointer. */
export const EDGE_INSET = 28;   // px [invented]: half a badge and a margin
export function edgePoint(px, py, size, inset = EDGE_INSET) {
  const cx = size.w / 2, cy = size.h / 2, dx = px - cx, dy = py - cy;
  const hx = cx - inset, hy = cy - inset;
  const f = Math.max(Math.abs(dx) / hx, Math.abs(dy) / hy);
  if (!(f > 1)) return { x: px, y: py, off: false, angle: Math.atan2(dy, dx) };
  return { x: cx + dx / f, y: cy + dy / f, off: true, angle: Math.atan2(dy, dx) };
}

/* THE SECONDS TO THE CONFLICT of a relevant car that is arriving and not in the order above: [{ id, secs }], whole seconds, from its
   distance to the conflict and its speed (the same quantity whyRelevant's time filter reads). */
export function arrivalSeconds(world, me) {
  const k = me.k ?? 0, L = world.course?.at[k]?.layout;
  if (!L) return [];
  const numbered = new Set(stopOrder(world, me).map((r) => r.id)), out = [];
  for (const a of atNode(world, world.actors, k)) {
    const why = whyRelevant(world, me, a);
    if (numbered.has(a.id) || !(why === "arriving" || (why === "holds" && a.v > AT_REST))) continue;
    out.push({ id: a.id, secs: Math.round(theirIn(L, me, a) / a.v) });
  }
  return out;
}

/* ------------------------------------------------------ THE ARRIVAL, REPLAYED (slice 6, section 1) */

/* WHICH WORLD IS DRAWN at `t` seconds into the intro, from `decision.replay` ([{ t, world }], oldest first, the last being the frozen world):
   the recorded span is played over INTRO_END, so the sim time is the first entry's plus t / INTRO_END of the span. Returns { world, carry, i }:
   the last tick at or before that time, and the seconds since it (what `actorsOf` carries each car forward by, so the motion is smooth between
   20 Hz ticks). At t <= 0 it is the first world; at t >= INTRO_END it is the frozen world itself with no carry. Pure. */
export function replayAt(replay, t) {
  const n = replay.length, last = replay[n - 1];
  if (n === 1 || t >= INTRO_END) return { world: last.world, carry: 0, i: n - 1 };
  const first = replay[0], simT = first.t + (Math.max(0, t) / INTRO_END) * (last.t - first.t);
  let i = 0;
  while (i < n - 1 && replay[i + 1].t <= simT + 1e-9) i++;
  return { world: replay[i].world, carry: i === n - 1 ? 0 : Math.max(0, simT - replay[i].t), i };
}

/* THE MOTION STREAK of a drawn car: three lines behind it along its heading (heading in degrees, a direction of (cos, sin), as skidLines reads
   it), each STREAK_S x v long, starting at the car's rear bumper and spread across its width, with alpha falling from the middle line outward
   [invented]. Nothing for a car at rest (v under AT_REST). Returns [{ x0, y0, x1, y1, z, alpha }] in world coordinates. */
export const STREAK_LANES = [0, -0.6, 0.6];   // m across the car [invented]
export const STREAK_ALPHA = [0.55, 0.35, 0.35];
export function streakOf(pose, v) {
  if (!(v > AT_REST)) return [];
  const h = pose.heading * DEG, dx = Math.cos(h), dy = Math.sin(h), nx = -dy, ny = dx, half = (pose.length ?? CAR.length) / 2, len = STREAK_S * v;
  return STREAK_LANES.map((o, i) => {
    const x0 = pose.x - dx * half + nx * o, y0 = pose.y - dy * half + ny * o;
    return { x0, y0, x1: x0 - dx * len, y1: y0 - dy * len, z: pose.z ?? 0, alpha: STREAK_ALPHA[i] };
  });
}

/* THE STREAKS OF A DRAWN FRAME: every drawn car that is not the player's, a pedestrian's or a wreck's, with its speed from the world's own
   actor of that id. `poses` is what `actorsOf` returned. Returns [{ id, lines }] for the cars that move. */
export function streaksFor(poses, world) {
  const byId = new Map(world.actors.map((a) => [a.id, a]));
  const out = [];
  for (const p of poses) {
    const a = byId.get(p.id);
    if (!a || p.player || p.ped || p.crashed || a.shadow) continue;
    const lines = streakOf(p, a.v ?? 0);
    if (lines.length) out.push({ id: p.id, lines });
  }
  return out;
}
