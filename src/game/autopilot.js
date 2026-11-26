/* =====================================================================
   THE AUTOPILOT (WORK-game-slice2 section 3): the player's car driven as
   a sound driver, through stepDriver, as the player's two controls would.
   Pure: `autoInput(me, world, { task, phase })` -> { steer, slider, signal }.

   BASED ON tools/lib/good-driver.mjs `goodInput`, and src/ must not
   depend on tools/, so what it does is restated here.
   TAKEN from goodInput:
   - cruise by `sliderFor` toward 0.95 of the posted limit (`limitAt`), the
     acceleration wanted proportional to the speed still to gain, capped
     at -1.5 .. 1.2 m/s^2 (CHANGED in slice 4: once GONE the cap is the car's full pull-away, ACCEL_MAX);
   - `aheadOf(me, course, world).stop` as the slider marker, so
     `slider = min(slider, stop.at)`;
   - at rest, until the stop counts, slider -0.3;
   - lane-keeping `steer = -(me.off) * 0.25 - me.psi * 2.5`; assist 0.
   LEFT OUT of goodInput: the lane choice (the round maps' legs are single
   lanes, so the lane is always the middle of it), overtaking, the
   acceleration lane, pulling in at a place, and the held-by-`whatStops`
   rule at rest (the player's own decision replaces it: in `hold` the car
   is held, in `go` it goes).
   CHANGED from goodInput: the signal is on from the start of the approach
   (more than the 2-3 s ahead the law asks) and stays on through the box,
   until the car is clear of it; goodInput signals only short of the line.

   THE PHASES:
   - approach: cruise to the stop line and come to rest at it.
   - hold:     the brake, signal on. The player is waiting.
   - go:       pull away and drive the route. UNTIL THE CAR IS PAST ITS
               STOP LINE a stop marker whose `line` is true is IGNORED:
               the player decided to go, and the sim's own right-of-way
               line must not stop them (stopFor builds that marker from
               `whatStops`). A car AHEAD in the lane (line false) is still
               followed, and past the line everything is as normal.
   ===================================================================== */
import { aheadOf } from "../sim/drive.js";
import { sliderFor, ACCEL_MAX } from "../sim/player.js";
import { limitAt } from "../sim/graph.js";
import { HARSH_AT } from "../sim/traffic.js";
import { cornerOf } from "../sim/corner.js";
import { BOOST } from "./boost.js";

/* The acceleration the autopilot may ask for, m/s^2 (-1.5 is the braking floor, goodInput's own). Cruising and approaching: 1.2 (goodInput's). GONE (slice 4, section 3):
   the car's own full pull-away, ACCEL_MAX, 2.72 on the flat [M, sim/player.js], until it reaches PACE of the limit -- Jay: "launch faster". [instrument; the launch cap is the spec's] */
const CRUISE_ACCEL = 1.2;
export const LAUNCH_ACCEL = ACCEL_MAX;
const PACE = 0.95;          // of the posted limit [instrument: goodInput's own default]
const BOOST_TAPER = 0.5;     // m/s short of the target at which full throttle gives way to the proportional pull [the spec's]
const CORNER_AIM = 0.9;      // of the corner's clean speed [drive.js slowBand's own: "the middle of the band"]
const HOLD = -0.3;          // the brake while standing [instrument: goodInput's own]
/* m short of the line within which a car at rest and not yet counted is still held to count its stop (goodInput: 12). */
const COUNT_SPAN = 12;

export function autoInput(me, world, { task, phase, target, stop: stopped = false }) {
  const course = world.course;
  const spot = course.at[me.k], path = spot.layout.paths[me.route];
  const steer = -(me.off ?? 0) * 0.25 - (me.psi ?? 0) * 2.5;
  /* The signal for the task, from the start; straight is no signal (drive.js routeForSignal). Kept on while the car is inside this
     intersection's own path, so the lamp does not go out at the line in the middle of the turn. */
  const signal = task && task !== "straight" && me.s <= path.clearAt ? task : null;
  if (phase === "hold") return { steer, slider: HOLD, signal, power: 1 };

  const posted = limitAt(course, me) ?? 13.9;
  /* SLICE 8: AFTER GO THE AUTOPILOT DOES NOT STOP FOR A PERSON ON ITS OWN -- that is the player's job now (STOP). Until slice 8 it did: the sim's
     stop marker (drive.js stopFor, from crossing.js whatStops) holds a driver short of a crosswalk somebody holds, and the autopilot honored it. The
     sim's own `ignorePeds` is the way to ask the question without them; it reaches only this call, never the world the car is stepped in. The queue
     rule (a car ahead) and the line are untouched. */
  const ahead = aheadOf(me, course, phase === "go" ? { ...world, ignorePeds: true } : world);
  /* SLICE 7, THE THUMB SETS THE SPEED (control.js): once GONE, with a `target` (m/s) the car aims for that speed -- never over the road's posted one
     -- accelerating at up to ACCEL_MAX and braking at up to HARSH_AT (the sim's own harsh threshold, the arcade brake [invented]), so a drag down is
     felt. A target of 0 stops the car wherever it is. The corner's cap and a car ahead (`stop`, below) still win. With no target (the other phases, and
     any caller that has no thumb) it is as before. */
  const thumb = phase === "go" && target != null;
  let aim = thumb ? Math.min(target, posted) : posted * PACE;
  /* THE CORNER CAP (slice 9): the boost launches the car to the road's pace within a couple of seconds, which is faster than the arc's clean speed (the
     sim's own, corner.js cornerOf, the same sqrt(CLEAN / kMax) as player.js cornerSpeedFor), so while the car is on a turning path and not yet clear of
     its box it aims no faster than 90% of that speed (slowBand's own aim, drive.js). Before it, the pull-away was too slow to arrive at the arc fast: a
     car boosted into one overruns its grip and goes wide. Straight paths and the way out of the box are not capped. */
  if (phase === "go") {
    const c = path.intent !== "straight" && me.s <= path.clearAt ? cornerOf(path) : null;
    if (c) aim = Math.min(aim, CORNER_AIM * c.clean);
  }
  /* SLICE 9, THE LAUNCH IS A BOOST: once GONE the car carries `power` = BOOST (sim/player.js accelFor's fourth argument), and the slider for a wanted
     acceleration is found WITH that power, so a partial drag still gets the acceleration slice 7 asked for. At the LIMIT (the target is the posted speed) the
     car asks for FULL throttle, slider 1, until it is within BOOST_TAPER of the target: slice 7's proportional pull would taper the launch from about 9 m/s.
     The corner cap, a car ahead and STOP below still win. The posted limit is still the top speed. */
  const power = phase === "go" ? BOOST : 1;
  const full = thumb && target >= posted - 0.05 && aim - me.v > BOOST_TAPER;   // the PLAYER's target is the limit; `aim` may be lower (the corner)
  let slider = full ? 1 : sliderFor(Math.max(thumb ? -HARSH_AT : -1.5, Math.min(phase === "go" ? LAUNCH_ACCEL : CRUISE_ACCEL, (aim - me.v) * 0.6)), me.v, me.grade ?? 0, power);
  if (thumb && aim < 0.05 && me.v < 0.3) slider = HOLD;
  /* STOP (slice 8): the car's FULL brake, slider -1, until it is at rest; then the hold. */
  if (thumb && stopped) slider = me.v > 0.05 ? -1 : HOLD;
  let stop = ahead.stop;
  if (phase === "go" && stop?.line && me.s <= path.stopAt) stop = null;
  if (stop) slider = Math.min(slider, stop.at);
  /* APPROACH: at rest near the line, hold until the stop is counted (and after: the round freezes here). */
  if (phase === "approach" && me.v < 0.3 && me.s <= path.stopAt + 0.5 && me.s > path.stopAt - COUNT_SPAN) slider = HOLD;
  return { steer, slider, signal, power };
}
