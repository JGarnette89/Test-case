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
import { atNode, conflictOf, blockedBy, CAR, carriedWorld, carriedPose, poseOf, AT_REST } from "../sim/crossing.js";
import { lenOf } from "../sim/traffic.js";
import { driverPose, carriedPlayer } from "../sim/drive.js";
import { limitAt } from "../sim/graph.js";
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
/* Slice 7: FAST applies only once the car is CLEAR OF THE BOX (`clear`, round.js clearOfBox), since until then the player's thumb is driving it and a
   thumb that is played back at twice the speed is not the thumb the player moved. `clear` defaults to true so the phase alone still reads as before. */
export const speedOf = (phase, clear = true) => (phase === "gone" && clear ? FAST : 1);

/* THE WORLD'S ARRIVAL (slice 6): seconds of sim ticks before the freeze that `decision.replay` holds [invented]. Played over the intro, so faster than
   real time by REPLAY_RATE [D: REPLAY / INTRO_END]: arcade, as the screech is. round.js reads REPLAY. */
export const REPLAY = 2.0;
export const REPLAY_RATE = REPLAY / INTRO_END;

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
     that decide the decision small. They are shown by a ring and their seconds when on the screen, and, off the screen, by a ghost at its edge (ghostOf, slice 7)
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

/* ------------------------------------------------------ NO CLIPPING IN THE ARRIVAL (slice 7, section 1) */

/* Jay, after slice 6: "I just saw the player car teleport through another car to the stop line, it's okay to be in a queue but clipping through
   traffic is a no-go." The screech replays the player's recorded trail on a warped clock while the world replays on its own, so at some instants the
   player's drawn car stands where another car is drawn. DRAWN FOOTPRINTS are tested as oriented rectangles (each vehicle's own length and width),
   at CLIP_SAMPLES + 1 instants of the intro, and the decision picks the longest screech that clears every one (`chooseScreech`, called once by
   round.js toDecisionFrom -- never per frame on the screen). */
export const CLIP_SAMPLES = 60;      // the intro is tested at 1/60 steps [the spec's]
export const SCREECH_MIN_M = 6;      // m: a screech shorter than this is not drawn, the player is drawn at its own pose in the replay [the spec's]
export const CLIP_DEPTH = 0.01;      // m of penetration below which two footprints are not overlapping [instrument: float slack]
const CLIP_STEP_M = 1;               // the trail is shortened by this much at a time while searching [instrument]

/* The four corners of a drawn footprint { x, y, heading (degrees), length, width }, in world metres. */
export function cornersOf(p) {
  const h = p.heading * DEG, ux = Math.cos(h), uy = Math.sin(h), vx = -uy, vy = ux, l = p.length / 2, w = p.width / 2;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => ({ x: p.x + ux * l * a + vx * w * b, y: p.y + uy * l * a + vy * w * b }));
}

/* How far two oriented rectangles overlap, in metres: the smallest penetration over their four edge normals (the separating-axis test), or 0 when
   some axis separates them. */
export function overlapDepth(a, b) {
  const ca = cornersOf(a), cb = cornersOf(b);
  let least = Infinity;
  for (const poly of [ca, cb]) {
    for (let i = 0; i < 2; i++) {
      const dx = poly[i + 1].x - poly[i].x, dy = poly[i + 1].y - poly[i].y, n = Math.hypot(dx, dy), ax = -dy / n, ay = dx / n;
      const pa = ca.map((c) => c.x * ax + c.y * ay), pb = cb.map((c) => c.x * ax + c.y * ay);
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (!(o > 0)) return 0;
      least = Math.min(least, o);
    }
  }
  return least;
}

/* The distance between two footprints (0 when they overlap): the smallest corner-to-edge distance. Used to say how close a car came. */
export function gapOf(a, b) {
  if (overlapDepth(a, b) > 0) return 0;
  const seg = (p, q, r) => { const dx = q.x - p.x, dy = q.y - p.y, f = Math.max(0, Math.min(1, ((r.x - p.x) * dx + (r.y - p.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(r.x - p.x - f * dx, r.y - p.y - f * dy); };
  const ca = cornersOf(a), cb = cornersOf(b);
  let m = Infinity;
  for (const [P, Q] of [[ca, cb], [cb, ca]]) for (const r of P) for (let i = 0; i < 4; i++) m = Math.min(m, seg(Q[i], Q[(i + 1) % 4], r));
  return m;
}

/* EVERY OTHER ROAD USER AS DRAWN at `t` seconds into the intro: the replayed world at that time, each car carried forward by the replay's carry
   -- the calls `actorsOf` (apps/MapRoad.jsx) makes for the traffic, which a Node check cannot import. */
export function othersAt(replay, t) {
  const r = replayAt(replay, t), w = r.world, wc = carriedWorld(w, r.carry), out = [];
  for (const a of w.actors) {
    if (a.shadow || a.player) continue;
    const p = carriedPose(wc, a, r.carry);
    out.push({ id: a.id, x: p.x, y: p.y, heading: p.rot, length: p.length, width: p.width });
  }
  return out;
}

/* THE PLAYER AS DRAWN at `t`: the screech's pose while it plays, otherwise the replayed world's own player (the frozen pose from INTRO_END, and for
   the whole intro when there is no screech). */
export function playerAt(trail, replay, t) {
  const it = introAt(trail, t), r = replayAt(replay, t), me = r.world.actors.find((a) => a.player && !a.shadow);
  const p = it.pose ?? driverPose(carriedPlayer(me, r.carry), r.world.course);
  return { x: p.x, y: p.y, heading: p.heading, length: lenOf(me), width: CAR.width };
}

/* The others at every sample of the intro, worked out once. */
export const othersTrack = (replay) => Array.from({ length: CLIP_SAMPLES + 1 }, (_, i) => othersAt(replay, (INTRO_END * i) / CLIP_SAMPLES));

/* THE WORST OVERLAP of the player (with this trail, or none) over the intro: { worst, t, id, along, across, nearest } -- `along` and `across` are the
   other car's place in the player's frame at that instant (metres along the player's heading, and to its left), so a check can say which
   configuration it was; `nearest` is the closest any other footprint came, overlapping or not. */
export function clipOf(trail, replay, track = othersTrack(replay)) {
  let out = { worst: 0, t: null, id: null, along: null, across: null, nearest: Infinity };
  for (let i = 0; i <= CLIP_SAMPLES; i++) {
    const t = (INTRO_END * i) / CLIP_SAMPLES, me = playerAt(trail, replay, t);
    for (const o of track[i]) {
      const d = overlapDepth(me, o);
      if (d > out.worst) {
        const h = me.heading * DEG, dx = o.x - me.x, dy = o.y - me.y;
        out = { ...out, worst: d, t, id: o.id, along: dx * Math.cos(h) + dy * Math.sin(h), across: -dx * Math.sin(h) + dy * Math.cos(h) };
      }
      out.nearest = Math.min(out.nearest, gapOf(me, o));
    }
  }
  return out;
}

/* THE SCREECH THIS DECISION USES, decided once at the freeze. In order of preference (the spec's):
   (a) the whole recorded trail, if no instant of the intro overlaps another road user ("full"), or its longest SUFFIX, shortened by CLIP_STEP_M at a
       time and never under SCREECH_MIN_M, that clears every instant: the screech starts later on the trail ("shortened");
   (b) none -- an empty trail, which `introAt` reads as no screech -- and the player is drawn at its own pose in the replayed world, the sim's own
       motion, where the sim never overlaps two cars ("own").
   Returns { kind, trail, meters, clip } with `clip` the worst overlap of the FULL trail (what the screech would have done). */
export function chooseScreech(trail, replay) {
  const track = othersTrack(replay), full = clipOf(trail, replay, track), along = alongOf(trail);
  if (!(full.worst > CLIP_DEPTH)) return { kind: "full", trail, meters: along.total, clip: full };
  for (let L = Math.floor(along.total / CLIP_STEP_M) * CLIP_STEP_M; L >= SCREECH_MIN_M - 1e-9; L -= CLIP_STEP_M) {
    let i = trail.length - 1;
    while (i > 0 && along.total - along.d[i] < L - 1e-9) i--;
    const sub = trail.slice(i);
    if (!(clipOf(sub, replay, track).worst > CLIP_DEPTH)) return { kind: "shortened", trail: sub, meters: along.total - along.d[i], clip: full };
  }
  return { kind: "own", trail: [], meters: 0, clip: full };
}

/* ------------------------------------------------------ GHOSTS AT THE EDGE (slice 7, section 3) */

/* Jay: "a ghost car at the edge of the screen that becomes real once the car enters the players actual view... simulate the driver simply looking
   left or right." An ARRIVING or HOLDING car (whyRelevant) whose drawn pose is off the screen is drawn as a translucent silhouette, standing on ITS
   OWN PATH, ahead of it toward the conflict, at the first point that is GHOST_INSET px inside the screen. No number. The moment the car's own pose is
   on the screen the ghost is gone and the car is drawn as itself. */
export const GHOST_INSET = 24;            // px [invented]
export const GHOST_ALPHA = [0.25, 0.6];   // far .. at the edge [invented]
const GHOST_STEP_M = 0.25;                // m, the walk along the path [instrument]

/* `view` is iso/project.js viewOf (its `P`), `size` { w, h }, `carry` the seconds the drawn car is carried past its tick. Returns
   { id, x, y, z, heading, alpha, length, width, height } or null. THE OPACITY is from the DISTANCE along the car's path to the ghost's point: 0.25
   at ARRIVE_WITHIN seconds of the road's posted speed away or further, 0.6 on the point -- a distance, so it rises with every metre the car closes
   (a time would fall again as a car braked) [D: ARRIVE_WITHIN x the posted limit, assuming a car at it]. */
export function ghostOf(world, me, a, view, size, carry = 0) {
  const why = whyRelevant(world, me, a);
  if (why !== "arriving" && why !== "holds") return null;
  const L = world.course.at[me.k ?? 0].layout, path = L.paths[a.route];
  const at = (s) => poseOf(world, { ...a, s });
  const inside = (p, m) => { const [x, y] = view.P(p.x, p.y, p.z ?? 0); return x >= m && x <= size.w - m && y >= m && y <= size.h - m; };
  const s0 = Math.min(a.s + (a.v ?? 0) * carry, path.length);
  if (inside(at(s0), 0)) return null;
  let lo = s0, hi = null;
  for (let s = s0 + GHOST_STEP_M; s < path.length + GHOST_STEP_M; s += GHOST_STEP_M) {
    const q = Math.min(s, path.length);
    if (inside(at(q), GHOST_INSET)) { hi = q; break; }
    lo = q;
  }
  if (hi == null) return null;
  for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (inside(at(mid), GHOST_INSET)) hi = mid; else lo = mid; }
  const p = at(hi), far = ARRIVE_WITHIN * (limitAt(world.course, a) ?? 13.9);
  const near = 1 - clamp01((hi - s0) / far);
  return { id: a.id, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, alpha: GHOST_ALPHA[0] + (GHOST_ALPHA[1] - GHOST_ALPHA[0]) * near, length: p.length, width: p.width, height: p.height };
}

/* The eight corners of a ghost's box, world points { x, y, z }, for the screen to project. */
export function ghostBox(g) {
  const c = cornersOf(g);
  return [...c.map((q) => ({ ...q, z: g.z })), ...c.map((q) => ({ ...q, z: g.z + (g.height ?? 1.5) }))];
}
