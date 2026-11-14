/* =====================================================================
   THE TRAFFIC SLOWS FOR CORNERS -- with the player's own cornering limit.

   DECISIONS.md 5.15.13 recorded it: nothing in the sim knew a corner was
   coming, so a car took a turn at whatever speed it arrived at -- left
   turns at a median 40 km/h on a through road, up to 78. It stayed
   hidden while every intersection was a stop. Signals and lane changes
   (SIMULATOR.md 1.1.13) brought it out: left-turners reached the line
   at road speed, found the oncoming gap closed, and stood on the brakes
   -- harsh braking at a signalised crossroads went from 3 car-ticks to
   1383 in five minutes.

   The record said the turn-speed question and the right-turn-radius
   question were one question, because the maintainer's 26 and 22 km/h
   were not derivable at the radii of the time. They are now: the
   player's CLEAN (player.js) is his 26 km/h on a 12.7 m left, and the
   same number gave his 22 on the curb-lane right unasked. So the
   traffic uses exactly the limit the player is judged against, on
   whatever arc the geometry builds. The tight-right radius question is
   still open and still his; this does not decide it, it only drives
   the arcs that exist at the speed they allow.

   AND A DRIVER'S TEMPERAMENT IS IN IT. The corner speed a driver aims
   for is the clean speed scaled exactly as their speed on the road is
   (traffic.js `wantedSpeed`): a competent driver takes the corner at
   the clean speed, a bold one hotter -- a rough turn, the verdict the
   player gets for the same thing -- and a timid one slower. Never past
   what the tyres can do (GRIP): boldness is a hot corner, not a car
   leaving the road.

   A SECOND constraint, not a second model: the corner allows an
   acceleration, the traffic in front allows one, and the car takes the
   harder of the two (`cornerAccel`).
   ===================================================================== */
import { poseAt } from "./intersection.js";
import { CLEAN, GRIP } from "./player.js";
import { LATERAL } from "../core/motion.js";
import { wantedSpeed, decide, MOST_BRAKE, CAR, lenOf, widthOf } from "./traffic.js";


const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
/* Gentler than this is not a corner: a 150 m radius is a bend the road
   handles on its own. */
const STRAIGHT = 1 / 150;

/* The corner on a path, once: where its arc starts and ends, its
   tightest curvature, and the clean and grip-limited speeds for it.
   Cached on the path object, which is built once per map. */
export function cornerOf(path) {
  if (path._corner !== undefined) return path._corner;
  let kMax = 0, from = null, to = null;
  if (path.intent && path.intent !== "straight") {
    for (let s = path.stopAt; s <= path.clearAt; s += 0.5) {
      const a = poseAt(path, Math.max(path.stopAt, s - 1.5)).rot, b = poseAt(path, Math.min(path.clearAt, s + 1.5)).rot;
      const span = Math.min(path.clearAt, s + 1.5) - Math.max(path.stopAt, s - 1.5);
      if (span < 0.5) continue;
      const k = Math.abs((norm(b - a) * Math.PI) / 180 / span);
      if (k > STRAIGHT) { from ??= s; to = s; }
      kMax = Math.max(kMax, k);
    }
  }
  path._corner = kMax > STRAIGHT && from != null
    ? { from, to, k: kMax, clean: Math.sqrt(CLEAN / kMax), grip: Math.sqrt(GRIP / kMax) }
    : null;
  return path._corner;
}

/* A TURN THIS VEHICLE CAN MAKE WITHOUT LEAVING ITS LANE. A rigid body
   with front and rear on an arc of radius r cuts r - sqrt(r^2 - (L/2)^2)
   inside it; the room it has is its lane less its own width, split. A
   car makes every turn a path was drawn for; a truck does not make a tight
   residential corner -- measured (30 September): a truck turning right
   from a stop cut 2 m inside, over the curb, onto somebody waiting there.
   A real truck swings wide into the next lane to make such a corner; that
   is not modelled, so a truck does not take a turn it cannot make when
   the leg offers another way on (a TRUCK ROUTE, in effect), and takes the
   least tight when it offers none. */
export function fits(me, path, lane = 3.6) {
  const half = lenOf(me) / 2;
  if (half <= CAR.length / 2) return true;
  const c = cornerOf(path);
  if (!c) return true;
  const r = 1 / c.k, cut = r > half ? r - Math.sqrt(r * r - half * half) : Infinity;
  if (cut > ((lane ?? 3.6) - widthOf(me)) / 2) return false;
  /* AND NO MORE THAN A RIGHT ANGLE WITHIN ITS OWN LENGTH. A rigid body with
     both ends on a path that turns further than that has two places its
     tail could be, and the one it is on can vanish under it: a truck on a
     120-degree right jumped 3.6 m, drawn and checked (verify-lanes). */
  const L = 2 * half;
  for (let s = Math.max(0, c.from - L); s <= c.to; s += 1) {
    let d = poseAt(path, Math.min(path.length, s + L)).rot - poseAt(path, s).rot;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) > 90) return false;
  }
  return true;
}

/* A ROAD BEND, AND WHAT A DRIVER CAN ASK OF IT (Jay, 14 November; DECISIONS 10.96, the standing model): a driver may push their SKILL, their CAR or the ROAD CONDITIONS, two of the three at most, never all three, and people do anyway, which is when they crash. A corner here is not a number we set: the driver chooses the speed (confidence and compliance, `wantedFor`), and whether they get away with it is decided by what they, their car and the road have to give.
   THE SIDEWAYS ACCELERATION a car at `v` on a path of curvature `k` asks of its tyres is v^2 k. WHAT IT HAS TO GIVE, `lateralCapability`: the design figure (`LATERAL`, 0.15 g, what a road is built assuming EVERY licensed driver can handle) for the least skilled, rising to the GRIP (0.61 g) for the most, by the steering rating, the one linear form between two figures that already exist, so no constant is chosen here; times the car (`me.carGrip`, a car spec's, 1 until one exists) and the conditions (`world.grip`, 1: dry, until there is weather). The rating alone (`GRIP x steering`) was tried first, on the preview of 2,000 drivers: 30% have a steering rating under 0.6 and a p10 of 0.26, which is 0.16 g, barely above the design figure, and 7% would lose the car at the radius a 110 road is built for: it contradicts "most people will never push their car until the tires are squealing".
   A loss of control is NOT a crash rule: it is asking more than there is, and the step stops the car where it is, as every crash here does. What comes of a population doing that is EMERGENT, never tuned to a rate. */
/* THE CURVATURE OF A ROAD, ESTIMATED OVER A CHORD LONG ENOUGH TO SPAN MANY VERTICES (the second version of this, after the first read 1/500 and 1/260 a metre apart). A path is a polyline with a vertex every 4 m (roadgen `STEP`), its heading constant along a segment, so a heading change over a +-3 m window spans ONE vertex or TWO depending on where the car stands: the estimate doubles and halves between adjacent ticks, and 29 cars "lost the road" at gentle bends on a quantization error. The error goes as one over the chord (a vertex's heading step at R = 450 is 0.0089 rad, and the generator's 0.01 m coordinate rounding puts 0.0025 rad of noise on each segment's heading), MEASURED from one metre to the next over 8,000 interior samples (`tools/measure/chord-noise.mjs`): a 40 m chord varies by 12% at the 95th percentile and 16% at most, 60 m 8.4 and 11, 80 m 6.5 and 9, 100 m 5.3 and 7, 160 m 3.4 and 4. 80 m is the first that is stable to under a tenth, and still short of a bend's own length (an arc of 300 to 550 m). Cached on the path, every 2 m, built once. */
export const CHORD = 80;
function kappaProfile(path) {
  if (path._kappa) return path._kappa;
  const n = Math.floor(path.length / 2) + 1, h = CHORD / 2, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const s = i * 2, s0 = Math.max(0, s - h), s1 = Math.min(path.length, s + h), span = s1 - s0;
    out[i] = span >= CHORD / 2 ? Math.abs((norm(poseAt(path, s1).rot - poseAt(path, s0).rot) * Math.PI) / 180 / span) : 0;
  }
  return (path._kappa = out);
}
export const curvatureAt = (path, s) => {
  const prof = kappaProfile(path), f = Math.max(0, Math.min(prof.length - 1, s / 2)), i = Math.floor(f);
  return i + 1 < prof.length ? prof[i] + (prof[i + 1] - prof[i]) * (f - i) : prof[i];
};
/* THE JOINS OF A PATH ARE NOT BENDS. Where a path is joined to the box or the road beyond it, the polyline has a KINK, and a heading change over a metre or two reads as a curvature of 1/20 or 1/2: measured on the five-lane road (tools/measure/join-spikes.mjs), every sample with a radius under 60 m lies within 20.1 m of a join (the path's start, the line, the box's far edge, the path's end). The first version of the bend rule asked the tyres for 64 g there, and 130 cars in five minutes "lost the road", many of them the most skilled, at a gentle 100 km/h: the instrument, not the drivers. So a position within BEND_JOIN of a join asks nothing; 25 m is the measured reach, 20.1 m, with a margin. */
export const BEND_JOIN = 25;
export const onTheOpenRoad = (path, s) => s >= BEND_JOIN && s <= path.length - BEND_JOIN && !(s > path.stopAt - BEND_JOIN && s < path.clearAt + BEND_JOIN);
export const lateralCapability = (me, conditions = 1) => (LATERAL + (GRIP - LATERAL) * (me.ratings?.steering ?? 1)) * (me.carGrip ?? 1) * conditions;

/* The speed THIS driver takes that corner at. */
export const cornerSpeedOf = (corner, me) => Math.min(corner.grip, wantedSpeed(corner.clean, me.caution ?? 1));

/* THE CORNER AS A SECOND CONSTRAINT: the acceleration it allows, which
   the caller sets against what the traffic in front allows and takes
   the harder of. Infinity where the corner asks nothing yet.

   A SPEED TO BE AT, BY A PLACE -- the same physics as the player's brake
   marker (player.js `stopBand`), not a car standing at the corner. The
   deceleration that brings this car to its corner speed at the arc's
   start is (v^2 - vc^2) / 2d; a driver lets it build until it reaches
   the rate they PLAN on braking at (traffic.js `brake`, the braking
   axis) and then holds it. So a sound driver slows for a turn at the
   comfortable rate and one who leaves it late brakes harder into every
   corner, exactly as they do at a stop line. Inside the arc their
   wanted speed is capped at the corner speed.

   Two versions came first and were measured wrong. The corner as the
   nearer of it and the car in front: a driver behind another car began
   slowing only when that car turned off, and harsh braking on the test
   map went UP. The corner as a car standing at the arc: a driver
   already slow enough still braked hard closing on it, because the
   following model keeps a gap behind a car that never moves -- harsh
   braking tripled. */
export function cornerAccel(me, path, world = null) {
  const corner = cornerOf(path);
  const turn = !corner || me.s > corner.to ? Infinity : speedBy(me, cornerSpeedOf(corner, me), corner.from);
  return world && world.bends === "driver" ? Math.min(turn, bendAccel(me, path, world)) : turn;
}

/* THE BEND AHEAD, READ BY THE DRIVER (DECISIONS 10.96; Jay's model: push your skill, your car or the road conditions, never all three -- and the bend is the CONDITIONS: slowing for it is declining to push that factor). Where a map's bends are the drivers' business (`world.bends`) the road no longer lowers its posted speed to the bend, so NOTHING slowed anybody for it, and drivers who did not have the skill to hold the sideways load a 110 limit asks of a 450 m bend lost the road: a missing behaviour, not a reckless population (the first measurement, 14 November, which looked like a finding and was a half-finished change).
   WHAT EACH DRIVER DOES: reads the road ahead as far as they would need to brake, and takes each bend at the speed their OWN capability allows, as `corner.js` already does for an intersection's turn: the acceleration a competent driver uses there (`CLEAN`, 4.1 m/s^2) is 68% of what the tyres hold (`GRIP`, 6.0), so the same share, of THIS driver's capability (`lateralCapability`: skill, car, conditions), is what they choose to ask of a bend; and their confidence scales the SPEED exactly as it scales their speed on the road (`wantedSpeed`): the bold take it hotter, the timid slower. No constant is chosen here: every one is already in the model. A skilled driver (steering 0.9, 0.56 g) holds 150 km/h through a 450 m bend; a poor one (0.2, 0.24 g) slows to about 96, and the road is no longer the same speed for everybody. Only a driver bold enough that the scaled speed asks more than the whole capability (confidence factor over about 1.2, a caution under about 0.4) loses it: THE THREE FACTORS' REMAINING CASE, which is emergent and is whatever it is. The braking is planned ahead at this driver's own rate (`speedBy`), as for a stop line. Not here yet: the PERCEIVED capability (a driver who does not know their tyres are poor, or the road wet, is the observation axis); until then everybody knows their car and the conditions. A path is read only to its own end: a bend just past a seam is seen late. */
export const BEND_STRIDE = 10;
export const bendSpeedOf = (k, me, grip = 1) => wantedSpeed(Math.sqrt(((lateralCapability(me, grip) * CLEAN) / GRIP) / k), me.caution ?? 1);
export function bendAccel(me, path, world) {
  const lay = world.course.at[me.k ?? 0].layout, grip = world.grip ?? 1;
  const to = Math.min(path.length, me.s + Math.min(400, (me.v * me.v) / (2 * (me.brake ?? 2.7)) + 30));
  let worst = Infinity;
  for (let s = Math.ceil(me.s / BEND_STRIDE) * BEND_STRIDE; s <= to; s += BEND_STRIDE) {
    if (!onTheOpenRoad(path, s)) continue;
    const leg = lay.legs[s < path.stopAt ? path.from : path.to];
    if (!leg || (leg.across ?? leg.lanes ?? 1) < 2) continue;
    const k = curvatureAt(path, s);
    if (k < 1 / 5000) continue;
    const a = speedBy(me, bendSpeedOf(k, me, grip), s);
    if (a < worst) worst = a;
  }
  return worst;
}

/* A SPEED TO BE AT, BY A PLACE, as above: the acceleration that has this
   driver at `vc` by `at` braking at the rate they plan on, and held to it
   from there. The corner uses it, and so does a yield line (crossing.js). */
export function speedBy(me, vc, at) {
  if (me.s >= at - 0.5) {
    if (me.v <= vc) return Infinity;
    return decide({ ...me, v0: vc }, { leader: null, gap: Infinity });
  }
  const d = at - me.s;
  const need = (me.v * me.v - vc * vc) / (2 * d);
  if (need < (me.brake ?? 2.7)) return Infinity;
  return -Math.min(MOST_BRAKE, need);
}
