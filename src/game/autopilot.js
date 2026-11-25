/* =====================================================================
   THE AUTOPILOT (WORK-game-slice2 section 3): the player's car driven as
   a sound driver, through stepDriver, as the player's two controls would.
   Pure: `autoInput(me, world, { task, phase })` -> { steer, slider, signal }.

   BASED ON tools/lib/good-driver.mjs `goodInput`, and src/ must not
   depend on tools/, so what it does is restated here.
   TAKEN from goodInput:
   - cruise by `sliderFor` toward 0.95 of the posted limit (`limitAt`), the
     acceleration wanted proportional to the speed still to gain, capped
     at -1.5 .. 1.2 m/s^2;
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
import { sliderFor } from "../sim/player.js";
import { limitAt } from "../sim/graph.js";

const PACE = 0.95;          // of the posted limit [instrument: goodInput's own default]
const HOLD = -0.3;          // the brake while standing [instrument: goodInput's own]
/* m short of the line within which a car at rest and not yet counted is still held to count its stop (goodInput: 12). */
const COUNT_SPAN = 12;

export function autoInput(me, world, { task, phase }) {
  const course = world.course;
  const spot = course.at[me.k], path = spot.layout.paths[me.route];
  const steer = -(me.off ?? 0) * 0.25 - (me.psi ?? 0) * 2.5;
  /* The signal for the task, from the start; straight is no signal (drive.js routeForSignal). Kept on while the car is inside this
     intersection's own path, so the lamp does not go out at the line in the middle of the turn. */
  const signal = task && task !== "straight" && me.s <= path.clearAt ? task : null;
  if (phase === "hold") return { steer, slider: HOLD, signal };

  const posted = limitAt(course, me) ?? 13.9;
  const ahead = aheadOf(me, course, world);
  let slider = sliderFor(Math.max(-1.5, Math.min(1.2, (posted * PACE - me.v) * 0.6)), me.v, me.grade ?? 0);
  let stop = ahead.stop;
  if (phase === "go" && stop?.line && me.s <= path.stopAt) stop = null;
  if (stop) slider = Math.min(slider, stop.at);
  /* APPROACH: at rest near the line, hold until the stop is counted (and after: the round freezes here). */
  if (phase === "approach" && me.v < 0.3 && me.s <= path.stopAt + 0.5 && me.s > path.stopAt - COUNT_SPAN) slider = HOLD;
  return { steer, slider, signal };
}
