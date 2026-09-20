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
export const ACCEL_MAX = 2.6;              // m/s^2 at full throttle: a family car's pull-away, a shade over the traffic's ACCEL
export const BRAKE_MAX = 7.5;              // m/s^2 at full brake: an emergency stop, short of MOST_BRAKE's clamp
export const V_MAX = 33;                   // m/s, about 120 km/h: the car's, not the road's
export const NEUTRAL = 0.12;               // the slider's coasting band either side of centre

/* THE SLIDER, from -1 (full brake) through the neutral band to +1
   (full throttle), to an acceleration. Coasting is engine braking and
   air: gentle, and stronger the faster you go, so easing off IS slowing
   -- the maintainer's "slowing without braking". Braking is graduated
   below the band: partial brakes are partial. */
export function accelFor(slider, v) {
  const coast = -(0.25 + 0.0025 * v * v);
  if (Math.abs(slider) <= NEUTRAL) return coast;
  /* Both sides run FROM the coast: the first touch of the brake slows
     you a little more than lifting off did, never less. A version that
     ran the brake from zero had a light brake slowing the car less than
     coasting, which is a pedal nobody has driven. */
  const frac = (Math.abs(slider) - NEUTRAL) / (1 - NEUTRAL);
  return slider > 0 ? coast + frac * (ACCEL_MAX - coast) : coast + frac * (-BRAKE_MAX - coast);
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
  return stepPlayerOn(me, input, {
    length: road.length,
    headingAt: (s) => poseAt(road, s).heading,
    edges: { left: -road.width / 2, right: road.width / 2 },
    box: null,
  }, dt);
}

/* THE SAME TICK ALONG ANY PATH, given as its heading at a distance
   along, the road's edges either side of the line the car is measured
   from, and -- on a path through an intersection -- the BOX, between
   the stop line and the way out.

   A BEND IS DRIVEN; THE CORNER IS COMMITTED TO. On the road the path's
   own turning drifts a car whose wheel is straight, which is what
   makes a bend matter. Inside the box the car takes the arc the model
   built for the turn it committed to (SIMULATOR.md 1.1: turns at
   intersections are committed to, not steered), so the arc's
   curvature does not act on the car and the wheel adjusts the line,
   not the corner. */
export function stepPlayerOn(me, input, geom, dt) {
  /* Off the road the grass drags hard and the car crawls: it can always
     come back, and nothing else about being there is modelled yet. */
  const onRoad = me.off >= geom.edges.left - 0.5 && me.off <= geom.edges.right + 0.5;
  const a = accelFor(input.slider, me.v) - (onRoad ? 0 : 1.5);
  const v = Math.max(0, Math.min(onRoad ? V_MAX : V_MAX / 4, me.v + a * dt));
  const inBox = geom.box && me.s >= geom.box[0] && me.s <= geom.box[1];
  const kappa = inBox ? 0 : curvatureOf(geom, me.s, geom.box);
  const psi = me.psi + (yawRateFor(input.steer, v) - kappa * v * Math.cos(me.psi)) * dt;
  const s = me.s + v * Math.cos(psi) * dt;
  const off = me.off + v * Math.sin(psi) * dt;
  return { ...me, v, a, s, psi, off, steer: input.steer, slider: input.slider };
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
