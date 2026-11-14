/* =====================================================================
   BODY MOTION: A CAR LEANS INTO A CORNER, DIVES UNDER BRAKING AND SQUATS UNDER POWER (13 November, DECISIONS 10.70).

   THE VISUAL EXPRESSION, NOT THE FEEL (Jay: "until we have various options to the user -- trucks, buses, sporty cars vs commuter cars, maybe a
   motorcycle even -- we are just tuning the feel of one vehicle, and we'll need to reiterate on all of it later"). So this is ONE SYSTEM EVERY
   VEHICLE INHERITS, with a TABLE of constants per vehicle kind (`BODY`): a truck leans further and slower than a car, and a motorcycle -- when the
   roster has one -- is a row with a roll gain several times a car's, not a different system. A motorcycle that does not lean looks broken, which
   retires "a sprite set has no pitch" for good. (And the sprite direction itself was DROPPED on 13 November, Jay: stacked sprites tilt only by
   sliding layers and sort as layers, and asset art multiplies by vehicle x heading x damage x tilt; cars are PROCEDURAL GEOMETRY, a kind being a row of
   numbers. So this table is the central artefact, not an accommodation, and nothing here is shaped to stay sprite-compatible.)

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
   does not sink into the road); `slope` how much of the ROAD'S GRADIENT the body shows (a multiplier on the road's own pitch: Jay's 403 downhill, the sense
   of slope; deliberately far over 1 like the rest (the test highway's low hills are 1.5 to 1.7% grade, one degree of real pitch, which would not be seen), [invented] and in the table, and not touched by modifiers: a road's slope is not a suspension setting). */
export const BODY = {
  car: { slope: 4.0, roll: 3.5, pitch: 2.0, rollHz: 2.0, pitchHz: 2.2, rollZeta: 0.45, pitchZeta: 0.5, maxRoll: 14, maxPitch: 10, pivot: 0.35 },
  truck: { slope: 3.0, roll: 5.0, pitch: 1.6, rollHz: 1.2, pitchHz: 1.4, rollZeta: 0.35, pitchZeta: 0.35, maxRoll: 16, maxPitch: 8, pivot: 0.7 },
  bus: { slope: 3.0, roll: 5.5, pitch: 2.0, rollHz: 1.0, pitchHz: 1.2, rollZeta: 0.3, pitchZeta: 0.3, maxRoll: 16, maxPitch: 9, pivot: 0.6 },
};
/* RELIEF SHADING (iso/relief.js, DECISIONS 10.87), in this table because Jay dials it with the rest: a SIGNAL, NOT PHYSICS. `gain` multiplies the surface's
   gradient before it is lit (a real 9% grade is 5 degrees, about 1% brightness: the physical value deletes the feature; 0 turns it off), `lateral` the share of
   the light from the viewer's right, `up` its height, `amt` the share of brightness kept in shade, `floor` and `ceil` the clamp on the multiplier so nothing goes
   black or blows out. [invented; pitched strong so Jay has somewhere to come down from] */
export const RELIEF = { gain: 9, lateral: 0.35, up: 0.8, amt: 0.45, floor: 0.6, ceil: 1.3 };
const DEG = Math.PI / 180;
export const rowOf = (kind) => BODY[kind ?? "car"] ?? BODY.car;

/* THE TWO-STAGE RESOLVE (Jay, 13 November: upgrades must be able to modify body motion; a sporty car should read as more "planted" than a commuter car).
   `resolveBody(kind, modifiers)` is THE ONE FUNCTION THAT ANSWERS "WHAT ARE THIS CAR'S BODY PARAMETERS": the kind's base row, then the modifiers fitted, which
   are multipliers { hz, zeta, gain } (all optional, 1 when absent) on the spring's frequency, its damping and its amplitude. Strictly a data path for now: there
   is no upgrade system, `modsOf` finds no modifier on any car, and the resolve returns the base row itself (no copy, no garbage a car a frame).
   WHAT "PLANTED" MAY MEAN, A DESIGN CONSTRAINT FROM THE FINDING BEHIND IT (the maintainer, 13 November): since the position fixes Jay can get closer to other cars, so the
   body's movement is a distance cue, and an upgrade that REDUCED motion would quietly degrade the player's spatial judgement. PLANTED MEANS TIGHTER, NOT SMALLER: higher
   damping and a faster natural frequency (the same peak delivered and resolved sooner), amplitude largely left alone. A real sports car still rolls; it stops rolling
   sooner. So `hz` and `zeta` are the levers an upgrade pulls, and `gain` is floored at AMPLITUDE_FLOOR so no stack of modifiers can remove the cue. [the maintainer:
   the constraint; the floor's 0.85, the ceiling on damping and on frequency are invented / instrument]. */
export const AMPLITUDE_FLOOR = 0.85, ZETA_CEILING = 1.0, HZ_CEILING = 5;   // [invented] / [instrument: 2 pi hz dt stays under 2 at the 0.05 s step]
const NO_MODS = Object.freeze([]);
export const modsOf = (a) => a.bodyMods ?? NO_MODS;   // WHERE the fitted modifiers come from: nothing fits any yet
export function resolveBody(kind, modifiers = NO_MODS) {
  const base = rowOf(kind);
  if (!modifiers.length) return base;
  let hz = 1, zeta = 1, gain = 1;
  for (const m of modifiers) { hz *= m.hz ?? 1; zeta *= m.zeta ?? 1; gain *= m.gain ?? 1; }
  gain = Math.max(AMPLITUDE_FLOOR, gain);
  return { ...base, roll: base.roll * gain, pitch: base.pitch * gain,
    rollHz: Math.min(HZ_CEILING, base.rollHz * hz), pitchHz: Math.min(HZ_CEILING, base.pitchHz * hz),
    rollZeta: Math.min(ZETA_CEILING, base.rollZeta * zeta), pitchZeta: Math.min(ZETA_CEILING, base.pitchZeta * zeta) };
}

/* What the spring is driven towards, in radians: a right turn (positive lateral acceleration) is roll < 0, braking (negative) is pitch < 0, and the road's
   GRADIENT (rise over run, uphill positive) tips the nose with it: uphill nose up, downhill nose down, `slope` times the road's own angle, on top of the dive and squat. */
export function targetsOf(row, aLat, aLong, grade = 0) {
  const cl = (x, m) => Math.max(-m, Math.min(m, x));
  return { roll: cl(-row.roll * aLat, row.maxRoll) * DEG, pitch: cl(row.pitch * aLong, row.maxPitch) * DEG + Math.atan(grade) * row.slope };
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

/* The road's gradient (rise over run, uphill positive) over the same centred chord as the curvature: the height a little ahead against a little behind. */
export function chordGrade(course, a, s = a.s, half = CURVATURE_CHORD_HALF) {
  const L = course.at[a.k ?? 0].layout.paths[a.route]?.length;
  if (!(L > 0)) return 0;
  const s0 = Math.max(0, s - half), s1 = Math.min(L, s + half);
  if (s1 - s0 < 2) return 0;
  return ((poseOnGraph(course, a.k ?? 0, a.route, s1).z ?? 0) - (poseOnGraph(course, a.k ?? 0, a.route, s0).z ?? 0)) / (s1 - s0);
}

/* THE BODY OF ONE CAR THIS FRAME: { roll, pitch, pivot } in radians and metres, or null for a car that has no business leaning (a wreck). `world` is the
   world at its tick, `carry` the seconds since, `dt` the frame's step, `body` the memory. The tick-rate inputs (the speed change, the curvature, the player's
   turning against the road) are taken ONCE per tick; the lane change's analytic term is read at the carried time; the spring runs at the frame rate. */
export function bodyOf(body, world, a, carry, dt) {
  if (a.crash || a.crashed || a.parked) return null;
  const row = resolveBody(a.kind, modsOf(a)), id = a.id;
  body.seen.add(id);
  let m = body.cars.get(id);
  if (m && world.t < m.t - 1e-9) m = null;   // the world was restarted: the id is somebody else
  if (!m) {
    m = { t: world.t - 1, v: a.v ?? 0, psi: a.psi ?? 0, aLong: 0, kappa: 0, grade: 0, psiRate: 0, roll: 0, rollRate: 0, pitch: 0, pitchRate: 0, fresh: true };
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
    m.grade = a.route != null ? chordGrade(world.course, a) : 0;
  }
  const v = a.v ?? 0, tt = world.t + carry;
  /* RIGHT POSITIVE: the road's turn, and the car's own lateral movement against it (a lane change's second derivative; the player's rate of turning against the road, v times psi's rate). */
  const h = 0.05;
  const lc2 = a.lc ? (lateralOf(a.lc, tt + h) - 2 * lateralOf(a.lc, tt) + lateralOf(a.lc, tt - h)) / (h * h) : 0;
  const aLat = v * v * m.kappa + lc2 + (a.player ? v * m.psiRate : 0);
  const tg = targetsOf(row, aLat, m.aLong, m.grade);
  if (dt >= 0.25) { m.roll = tg.roll; m.rollRate = 0; m.pitch = tg.pitch; m.pitchRate = 0; }   // a long gap (a backgrounded tab): snap, do not integrate
  else if (dt > 0) {
    const step = Math.min(dt, 0.05);
    [m.roll, m.rollRate] = springStep(m.roll, m.rollRate, tg.roll, row.rollHz, row.rollZeta, step);
    [m.pitch, m.pitchRate] = springStep(m.pitch, m.pitchRate, tg.pitch, row.pitchHz, row.pitchZeta, step);
  }
  return { roll: m.roll, pitch: m.pitch, pivot: row.pivot };
}
