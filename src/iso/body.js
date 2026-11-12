/* =====================================================================
   BODY MOTION: A CAR LEANS INTO A CORNER, DIVES UNDER BRAKING AND SQUATS UNDER POWER (13 November, DECISIONS 10.70).

   THE VISUAL EXPRESSION, NOT THE FEEL (Jay: "until we have various options to the user -- trucks, buses, sporty cars vs commuter cars, maybe a
   motorcycle even -- we are just tuning the feel of one vehicle, and we'll need to reiterate on all of it later"). So this is ONE SYSTEM EVERY
   VEHICLE INHERITS, with a TABLE of constants per vehicle kind (`BODY`): a truck leans further and slower than a car, and a motorcycle -- when the
   roster has one -- is a row with a roll gain several times a car's, not a different system. A motorcycle that does not lean looks broken, which
   retires "a sprite set has no pitch" for good.

   RENDERER-ONLY. No simulation state and nothing crossing the worker: per-car memory keyed by id lives in `newBody()`, held by the screen beside
   `drawn.current`, reset when an id's world clock runs backwards and dropped when an id is no longer drawn. THE INPUTS, from what the page already holds:
     longitudinal  the speed change across ticks (`a.v`, held between ticks: a 20 Hz staircase a 2 Hz spring takes to 1-2%),
     lateral       the speed squared times the curvature of the path over a CENTRED CHORD of CURVATURE_CHORD_HALF metres either side (never the heading
                   of drawn poses differenced: 89% ripple after the spring against 12%, tools/measure/body-signal.mjs), PLUS the lane change's analytic
                   second derivative (traffic) or the player's rate of turning against the road (`psi`);
   ONE FUNCTION FOR EVERYBODY (`bodyOf`): the player's stored acceleration and lateral acceleration are not read; they are the cross-check
   (tools/measure/body-signal.mjs). Sign conventions: right is positive, a RIGHT turn is a positive lateral acceleration and rolls the body LEFT
   side down (roll < 0, right-side-down positive); braking is a negative longitudinal acceleration and pitches the NOSE DOWN (pitch < 0, nose-up positive).

   THE MAGNITUDES ARE DELIBERATELY OVER THE TOP (Jay's standing legibility ruling: "what we represent needs to be over-the-top"; it is easier to say
   "too much" than "I can't quite tell"), a real car rolling about 0.5 degrees per m/s^2 here at 3.5 and pitching about 0.3 at 2.0, and they are
   numbers in this table to dial back, not code. [Jay: over-the-top, dial back; the numbers are invented.]
   ===================================================================== */
import { lateralOf } from "../sim/lanechange.js";
import { poseOnGraph } from "../sim/graph.js";

/* THE CHORD, THE MAINTAINER'S JUDGEMENT (13 November), NOT A MEASUREMENT: a centred chord of this many metres EITHER SIDE (an 18 m span), which reads the
   path ahead and so leads a bend by about 0.08 s (12% ripple after the spring; the 4.5 m chord is 22%, the trailing 18 m span 16% and 0.07 s late). The symptom
   that says it is wrong: the car looks as if it knows the corner is coming. One constant, so switching is one line. */
export const CURVATURE_CHORD_HALF = 9;

/* PER VEHICLE KIND (sim/traffic.js VEHICLES has car, truck, bus: a kind with no row here is a bug, held by verify-body). Angles in DEGREES per m/s^2 of
   acceleration at steady state; `hz` and `zeta` the spring's natural frequency and damping ratio; `max` the clamp in degrees; `pivot` the roll centre's
   height in metres above the ground (the maintainer's call: about axle height, where a car really rolls, and well below the body's centre, so a side
   does not sink into the road). */
export const BODY = {
  car: { roll: 3.5, pitch: 2.0, rollHz: 2.0, pitchHz: 2.2, rollZeta: 0.45, pitchZeta: 0.5, maxRoll: 14, maxPitch: 10, pivot: 0.35 },
  truck: { roll: 5.0, pitch: 1.6, rollHz: 1.2, pitchHz: 1.4, rollZeta: 0.35, pitchZeta: 0.35, maxRoll: 16, maxPitch: 8, pivot: 0.7 },
  bus: { roll: 5.5, pitch: 2.0, rollHz: 1.0, pitchHz: 1.2, rollZeta: 0.3, pitchZeta: 0.3, maxRoll: 16, maxPitch: 9, pivot: 0.6 },
};
const DEG = Math.PI / 180;
export const rowOf = (kind) => BODY[kind ?? "car"] ?? BODY.car;

/* What the spring is driven towards, in radians: a right turn (positive lateral acceleration) is roll < 0, braking (negative) is pitch < 0. */
export function targetsOf(row, aLat, aLong) {
  const cl = (x, m) => Math.max(-m, Math.min(m, x));
  return { roll: cl(-row.roll * aLat, row.maxRoll) * DEG, pitch: cl(row.pitch * aLong, row.maxPitch) * DEG };
}

/* One step of a damped spring towards a target (semi-implicit Euler: stable for 2 pi hz dt well under 2, and the frame step is clamped by the caller). */
export function springStep(x, v, target, hz, zeta, dt) {
  const w = 2 * Math.PI * hz;
  v += (w * w * (target - x) - 2 * zeta * w * v) * dt;
  return [x + v * dt, v];
}

export function newBody() { return { cars: new Map(), seen: new Set() }; }
/* A frame is begun and ended around the actors, so a car that is no longer drawn is forgotten. */
export function beginBodyFrame(body) { body.seen.clear(); }
export function endBodyFrame(body) { for (const id of body.cars.keys()) if (!body.seen.has(id)) body.cars.delete(id); }

/* The path's curvature (1/m, a right turn positive) over the centred chord at distance s: heading a little ahead against heading a little behind, one-sided
   at a path's end. Read from the path the car is on; the segments' headings span three or more vertices at this length, which is the point. */
export function chordCurvature(course, a, s = a.s, half = CURVATURE_CHORD_HALF) {
  const L = course.at[a.k ?? 0].layout.paths[a.route]?.length;
  if (!(L > 0)) return 0;
  const s0 = Math.max(0, s - half), s1 = Math.min(L, s + half);
  if (s1 - s0 < 2) return 0;
  const d = (poseOnGraph(course, a.k ?? 0, a.route, s1).rot - poseOnGraph(course, a.k ?? 0, a.route, s0).rot + 540) % 360 - 180;
  return (d * DEG) / (s1 - s0);
}

/* THE BODY OF ONE CAR THIS FRAME: { roll, pitch, pivot } in radians and metres, or null for a car that has no business leaning (a wreck). `world` is the
   world at its tick, `carry` the seconds since, `dt` the frame's step, `body` the memory. The tick-rate inputs (the speed change, the curvature, the player's
   turning against the road) are taken ONCE per tick; the lane change's analytic term is read at the carried time; the spring runs at the frame rate. */
export function bodyOf(body, world, a, carry, dt) {
  if (a.crash || a.crashed || a.parked) return null;
  const row = rowOf(a.kind), id = a.id;
  body.seen.add(id);
  let m = body.cars.get(id);
  if (m && world.t < m.t - 1e-9) m = null;   // the world was restarted: the id is somebody else
  if (!m) {
    m = { t: world.t - 1, v: a.v ?? 0, psi: a.psi ?? 0, aLong: 0, kappa: 0, psiRate: 0, roll: 0, rollRate: 0, pitch: 0, pitchRate: 0, fresh: true };
    body.cars.set(id, m);
  }
  if (world.t !== m.t) {
    const dtk = world.t - m.t;
    if (!m.fresh && dtk > 0 && dtk < 0.5) {
      m.aLong = ((a.v ?? 0) - m.v) / dtk;
      if (a.psi != null) m.psiRate = 0.5 * ((a.psi - m.psi) / dtk) + 0.5 * m.psiRate;
    } else { m.aLong = 0; m.psiRate = 0; }
    m.v = a.v ?? 0; m.psi = a.psi ?? 0; m.t = world.t; m.fresh = false;
    m.kappa = a.route != null ? chordCurvature(world.course, a) : 0;
  }
  const v = a.v ?? 0, tt = world.t + carry;
  /* RIGHT POSITIVE: the road's turn, and the car's own lateral movement against it (a lane change's second derivative; the player's rate of turning against the road, v times psi's rate). */
  const h = 0.05;
  const lc2 = a.lc ? (lateralOf(a.lc, tt + h) - 2 * lateralOf(a.lc, tt) + lateralOf(a.lc, tt - h)) / (h * h) : 0;
  const aLat = v * v * m.kappa + lc2 + (a.player ? v * m.psiRate : 0);
  const tg = targetsOf(row, aLat, m.aLong);
  if (dt >= 0.25) { m.roll = tg.roll; m.rollRate = 0; m.pitch = tg.pitch; m.pitchRate = 0; }   // a long gap (a backgrounded tab): snap, do not integrate
  else if (dt > 0) {
    const step = Math.min(dt, 0.05);
    [m.roll, m.rollRate] = springStep(m.roll, m.rollRate, tg.roll, row.rollHz, row.rollZeta, step);
    [m.pitch, m.pitchRate] = springStep(m.pitch, m.pitchRate, tg.pitch, row.pitchHz, row.pitchZeta, step);
  }
  return { roll: m.roll, pitch: m.pitch, pivot: row.pivot };
}
