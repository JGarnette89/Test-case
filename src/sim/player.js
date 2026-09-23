/* =====================================================================
   THE PLAYER AT THE WHEEL.

   SIMULATOR.md 1.1: two controls. Steering, left and right; and one
   vertical slider from throttle at the top through a neutral coasting
   band to partial and then full braking at the bottom. On the open road
   the player steers for real -- a bend is driven, not followed -- which
   is why this is a car with a heading and not a dot with a lane offset.

   The car lives in the ROAD'S frame: `s` metres along the road, `off`
   metres right of the centreline, `psi` radians of heading relative to
   the road's tangent. A road that bends under a car holding its wheel
   straight therefore drifts the car toward the outside of the bend,
   which is what makes the bend matter and what the wide line is
   measured in. Pure functions; the screen owns the state and the sim
   owns everybody else.
   ===================================================================== */
const WHEELBASE = 2.7;                     // m, a passenger car
const LOCK = (35 * Math.PI) / 180;         // full steering lock, at walking pace
const GRIP = 6.0;                          // m/s^2 of sideways acceleration at full deflection: a road tyre's comfortable limit, not its edge
export const BRAKE_MAX = 7.5;              // m/s^2 the brakes add at full brake, on top of what the road already takes: an emergency stop
export const V_MAX = 33;                   // m/s, about 120 km/h: the car's, not the road's
export const NEUTRAL = 0.12;               // the slider's coasting band either side of centre
export const HOLD_W = 0.06;                // half-width of the maintain band, in slider travel: a thumb can find it, and has to

/* WHAT THE ROAD TAKES: rolling resistance, air rising with the square
   of speed, and the hill -- g times the grade, negative downhill. The
   throttle has to pay all of it to hold a speed, which is why the
   point on the slider that holds a speed climbs with the speed and
   with the road (the maintainer's "to maintain higher speeds will
   require more fuel input from the throttle"). The first two are the
   old coasting deceleration unchanged. */
const ROLL = 0.25, DRAG = 0.0025, G = 9.81;
export const resistance = (v, grade = 0) => ROLL + DRAG * v * v + G * grade;
/* Full throttle supplies exactly what V_MAX costs on the flat, so the
   top speed is where the throttle runs out rather than a clamp, and
   full-throttle acceleration fades with speed the way a car's does. */
export const T_MAX = resistance(V_MAX);
export const ACCEL_MAX = T_MAX - ROLL;     // full throttle from rest on the flat: 2.72 m/s^2, a family car's pull-away

/* THE MAINTAIN POINT: where on the slider the throttle exactly pays
   for this speed on this grade. On the throttle when the road costs
   something (always, on the flat); on the brake going downhill, when
   the hill pays more than the road takes; past the top of the slider
   when the hill costs more than the engine has -- the car cannot hold
   this speed here, and the screen says so. The throttle's supply is
   linear in the slider, so this is the linear map inverted. */
export function holdAt(v, grade = 0) {
  const R = resistance(v, grade);
  if (R >= 0) return NEUTRAL + (1 - HOLD_W - NEUTRAL) * (R / T_MAX);   // the band's top reaches 1 exactly at V_MAX on the flat
  return -NEUTRAL - (1 - NEUTRAL) * (-R / BRAKE_MAX);
}

/* The band the screen draws: HOLD_W either side of the maintain point
   on the throttle side, where the car holds its speed exactly; a line
   on the brake side (downhill) where it is one point. `lo`/`hi` may
   run past 1, which the screen draws as "can't hold this here". */
export function holdBand(v, grade = 0) {
  const at = holdAt(v, grade);
  if (at > NEUTRAL + HOLD_W) return { at, lo: at - HOLD_W, hi: at + HOLD_W };
  return { at, lo: at, hi: at };
}

/* THE SLIDER, from -1 (full brake) through the neutral band to +1
   (full throttle), to an acceleration.

   Coasting is what the road takes, so easing off IS slowing -- the
   maintainer's "slowing without braking". Braking is graduated below
   the band, from the coast (the first touch of the brake slows you a
   little more than lifting off did, never less) to BRAKE_MAX more than
   the coast at the bottom.

   THE THROTTLE HAS A MAINTAIN BAND, and it moves. From the coast at the
   neutral band's edge the throttle climbs to zero net acceleration at
   the band's lower edge, holds the speed exactly across the band, and
   climbs from its upper edge to full throttle at the top. The band
   sits at holdAt(v, grade), so holding a steady speed is finding the
   band and staying in it as it climbs with the speed and the hill:
   something the player DOES, which is what makes smoothness a skill
   the sheet can read. Continuous and monotone in the slider. */
export function accelFor(slider, v, grade = 0) {
  const R = resistance(v, grade), coast = -R;
  if (slider < -NEUTRAL) {
    const frac = (-slider - NEUTRAL) / (1 - NEUTRAL);
    return coast - frac * BRAKE_MAX;
  }
  if (slider <= NEUTRAL) return coast;
  const top = T_MAX - R;                                    // full throttle's net: negative on a hill steeper than the engine
  const { lo, hi } = holdBand(v, grade);
  if (lo <= NEUTRAL) return coast + ((slider - NEUTRAL) / (1 - NEUTRAL)) * (top - coast);   // no room for a band (downhill): one ramp
  if (slider < lo) return coast * ((lo - slider) / (lo - NEUTRAL));
  if (slider <= hi || hi >= 1) return 0;
  return top * ((slider - hi) / (1 - hi));
}

/* Yaw rate for a steering deflection in [-1, 1] at speed v. Two limits,
   the tighter wins: at walking pace the wheels' lock (a bicycle model),
   at speed the tyres' grip -- a car at 60 km/h cannot turn a 14 m
   circle whatever the wheel says. Zero at rest: a stationary car does
   not turn. Positive is right, because headings are clockwise in plan
   with y down (road.js). */
export function yawRateFor(steer, v) {
  if (v <= 0) return 0;
  const byLock = (v / WHEELBASE) * Math.tan(LOCK);
  const byGrip = GRIP / v;
  return steer * Math.min(byLock, byGrip);
}

/* The road's curvature at s, radians per metre, positive bending right,
   from the headings a little either side. */
export function curvatureAt(road, poseAt, s, h = 2) {
  const a = poseAt(road, Math.max(0, s - h)).heading, b = poseAt(road, Math.min(road.length, s + h)).heading;
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return (d * Math.PI) / 180 / (2 * h);
}

/* One tick of the player's car. `input` is { steer, slider } in [-1, 1]
   each. The heading integrates the yaw rate less the road's own turning
   under the car; the position integrates speed along the heading. */
export function stepPlayer(me, input, road, poseAt, dt) {
  const zAt = (s) => poseAt(road, Math.max(0, Math.min(road.length, s))).z ?? 0;
  return stepPlayerOn(me, input, {
    length: road.length,
    headingAt: (s) => poseAt(road, s).heading,
    gradeAt: (s) => (zAt(s + 2) - zAt(s - 2)) / 4,
    edges: { left: -road.width / 2, right: road.width / 2 },
    box: null,
  }, dt);
}

/* THE CORNER: how hard the tyres may be asked to turn the car before
   the turn stops being clean, and where they let go.

   CLEAN is derived from the maintainer's own number rather than
   chosen: he takes a left at 26 km/h, and this map's left-turn arc is
   12.7 m, which is 7.2^2 / 12.7 = 4.1 m/s^2 sideways -- 0.4 g, a brisk
   urban corner; and his 22 km/h for a right is what the same number
   gives on the 9.3 m curb-lane right at the crossroads, unasked
   (tools/measure/turn.mjs). Below it the arc is followed and the speed is carried
   out; between it and GRIP the tyres scrub speed off, harder the
   closer to the limit; past GRIP they cannot turn the car as hard as
   the arc asks and it runs wide. The tighter right-turn arc (4.2 m on
   this map) therefore wants 15 km/h, which is DECISIONS.md 5.15.12's
   open question made drivable. SCRUB is a design constant: how much
   speed a scrubbing tyre sheds at the limit. */
export const CLEAN = 4.1;
const SCRUB = 3.0;
const HALF_W = 0.9;                        // the car's half-width: over the line by this and the body is across it

/* THE SAME TICK ALONG ANY PATH, given as its heading at a distance
   along, the road's edges either side of the line the car is measured
   from, and -- on a path through an intersection -- the BOX, between
   the stop line and the way out, with the committed arc's curvature
   (`arcAt`) and whether the path turns at all.

   A BEND IS DRIVEN; THE CORNER IS COMMITTED TO -- AND HAS TO BE EARNED.
   On the road the path's own turning drifts a car whose wheel is
   straight, which is what makes a bend matter. Inside the box the
   commit turns the wheel for the arc the model built (SIMULATOR.md
   1.1: turns at intersections are committed to, not steered), the
   player's wheel adds to that, and THE TYRES DECIDE WHETHER THE CAR
   CAN DO IT: the arc at this speed asks for a sideways acceleration,
   and past GRIP the car gets only GRIP's worth and runs wide, while
   past CLEAN it scrubs speed. So the speed the car arrives at decides
   how the turn goes, which is where the approach earns its keep and
   the brake half of the slider gets a job. The turn's record is kept
   on the car while it is in the box and judged as it leaves. */
export function stepPlayerOn(me, input, geom, dt) {
  /* Off the road the grass drags hard and the car crawls: it can always
     come back, and nothing else about being there is modelled yet. */
  const onRoad = me.off >= geom.edges.left - 0.5 && me.off <= geom.edges.right + 0.5;
  const grade = geom.gradeAt ? geom.gradeAt(me.s) : 0;
  const inBox = !!geom.box && me.s >= geom.box[0] && me.s <= geom.box[1];
  let a = accelFor(input.slider, me.v, grade) - (onRoad ? 0 : 1.5);
  let kappa = 0, lat = 0, scrub = 0;
  if (inBox) {
    kappa = geom.arcAt ? geom.arcAt(me.s) : 0;
    lat = Math.abs(kappa * me.v + yawRateFor(input.steer, me.v)) * me.v;
    scrub = SCRUB * Math.max(0, Math.min(1, (lat - CLEAN) / (GRIP - CLEAN)));
    a -= scrub;
  } else kappa = curvatureOf(geom, me.s, geom.box);
  const v = Math.max(0, Math.min(onRoad ? V_MAX : V_MAX / 4, me.v + a * dt));
  let psiDot;
  if (inBox) {
    const want = kappa * v + yawRateFor(input.steer, v);
    const cap = v > 0 ? GRIP / v : 0;
    const omega = Math.max(-cap, Math.min(cap, want));
    psiDot = omega - kappa * v * Math.cos(me.psi);
  } else psiDot = yawRateFor(input.steer, v) - kappa * v * Math.cos(me.psi);
  const psi = me.psi + psiDot * dt;
  const s = me.s + v * Math.cos(psi) * dt;
  const off = me.off + v * Math.sin(psi) * dt;

  /* The turn's record: kept while the car is in the box of a path that
     turns, judged when it leaves. */
  let turn = me.turn ?? null, lastTurn = me.lastTurn ?? null, turns = me.turns ?? null;
  if (inBox && geom.turn) {
    turn = turn ? { ...turn } : { peak: 0, vPeak: 0, scrubbed: 0, rMin: Infinity, wide: false, cut: false, seconds: 0 };
    turn.peak = Math.max(turn.peak, lat);
    turn.vPeak = Math.max(turn.vPeak, v);
    turn.scrubbed += scrub * dt;
    turn.seconds += dt;
    if (kappa) turn.rMin = Math.min(turn.rMin, 1 / Math.abs(kappa));
    const lane = geom.lane ?? 3.6;
    if (Math.abs(off) > lane / 2 - HALF_W) {
      if (Math.sign(off) === -Math.sign(kappa)) turn.wide = true; else turn.cut = true;
    }
  } else if (turn) {
    const vClean = Math.sqrt(CLEAN * (turn.rMin === Infinity ? 10 : turn.rMin));
    const verdict = turn.wide ? "wide" : turn.cut ? "cut" : turn.peak > CLEAN ? "rough" : turn.vPeak < 0.4 * vClean ? "slow" : "clean";
    lastTurn = { ...turn, verdict, vClean };
    turns = { ...(turns ?? {}), [verdict]: (turns?.[verdict] ?? 0) + 1 };
    turn = null;
  }
  return { ...me, v, a, s, psi, off, grade, lat, steer: input.steer, slider: input.slider, turn, lastTurn, turns };
}

/* The speed a corner wants: the arc's tightest radius at CLEAN. From a
   path with a box and `arcAt`; null for a path that does not turn. */
export function cornerSpeedFor(geom) {
  if (!geom.box || !geom.arcAt || !geom.turn) return null;
  let kMax = 0;
  for (let s = geom.box[0]; s <= geom.box[1]; s += 0.5) kMax = Math.max(kMax, Math.abs(geom.arcAt(s)));
  return kMax > 1e-4 ? Math.sqrt(CLEAN / kMax) : null;
}

/* A path's curvature at s from its heading a little either side --
   never sampled across the box, whose arc is the committed turn and
   not the road: read across the stop line it drifted the car nearly a
   metre before it got there. */
function curvatureOf(geom, s, box = null, h = 2) {
  let s0 = Math.max(0, s - h), s1 = Math.min(geom.length, s + h);
  if (box) {
    if (s < box[0]) s1 = Math.min(s1, box[0] - 0.01);
    if (s > box[1]) s0 = Math.max(s0, box[1] + 0.01);
  }
  if (s1 - s0 < 0.5) return 0;
  const a = geom.headingAt(s0), b = geom.headingAt(s1);
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return (d * Math.PI) / 180 / (s1 - s0);
}

/* Where the car is in the world, for the renderer and the contact test. */
export function playerPose(me, road, poseAt) {
  const p = poseAt(road, me.s);
  const h = (p.heading * Math.PI) / 180;
  return {
    x: p.x - Math.sin(h) * me.off, y: p.y + Math.cos(h) * me.off, z: p.z,
    heading: p.heading + (me.psi * 180) / Math.PI,
  };
}

/* CONTACT, cheaply: each car is two discs a little fore and aft of its
   centre, and two cars touch when any pair of discs overlaps. Coarser
   than the old engine's box test, and a scene this simple does not
   need finer; it says "you hit that car" and it never says it for a
   car a lane away. */
const DISC_R = 0.95, DISC_AT = 1.3;   // the discs reach the car's half-length fore and aft, and its half-width abeam
function discs(pose) {
  const h = (pose.heading * Math.PI) / 180;
  const dx = Math.cos(h) * DISC_AT, dy = Math.sin(h) * DISC_AT;
  return [{ x: pose.x + dx, y: pose.y + dy }, { x: pose.x - dx, y: pose.y - dy }];
}
export function touching(a, b) {
  if (Math.abs(a.z - b.z) > 2) return false;   // one is on the overpass
  const A = discs(a), B = discs(b);
  for (const p of A) for (const q of B) if (Math.hypot(p.x - q.x, p.y - q.y) < 2 * DISC_R) return true;
  return false;
}

export const newPlayer = (s = 0, off = 1.8, v = 0) => ({ s, off, psi: 0, v, a: 0, steer: 0, slider: 0 });
