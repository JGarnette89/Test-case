/* =====================================================================
   A GOOD DRIVER, FOR CHECKS: a player who does what the screen says and
   drives the way the game's own standards call good -- so a check can
   ask "what does a good drive earn" of something that actually drives
   well, rather than of a script that brakes flat out at every line.

   Everything it does is read off the screen's own advice:
   - THE SLIDER MARKER (drive.js `aheadOf`): where a stop or a corner
     asks the slider to be, the pressure for a constant, comfortable
     deceleration to the line or the corner's clean speed. Followed from
     the moment it appears.
   - Otherwise cruise just under the posted limit (graph.js `postedAt`).
   - At a stop: come to rest, then go -- promptly, never dawdling.
   - THE DIRECTIONS (session.js): the turn signalled, the lane the
     screen asks for (`navLane`); otherwise keep right, out of the passing
     lane unless a left is coming.
   - Pulling in at a place: a constant deceleration to rest at it.

   `pace` scales the cruise: 1.3 is a driver who speeds and otherwise
   drives exactly as well.
   ===================================================================== */
import { stepDriver, aheadOf } from "../../src/sim/drive.js";
import { stopBand } from "../../src/sim/player.js";
import { postedAt } from "../../src/sim/graph.js";
import { alongTo, ARRIVED_WITHIN } from "../../src/sim/route.js";
import { DT } from "../../src/sim/traffic.js";
import { whatStops } from "../../src/sim/crossing.js";

const LANE = 3.6;

export function goodInput(me, world, sc, { pace = 0.95 } = {}) {
  const course = world.course;
  const spot = course.at[me.k], path = spot.layout.paths[me.route], leg = spot.layout.legs[path.from];
  const posted = postedAt(course, me.k, me.route) ?? 13.9;
  const ahead = aheadOf(me, course, world);
  /* Cruise: a gentle P on speed. */
  let slider = Math.max(-0.3, Math.min(0.6, ((posted * pace - me.v) / Math.max(1, posted)) * 3));
  if (ahead.stop) slider = Math.min(slider, ahead.stop.at);
  /* At rest: hold until the stop counts and the rules the traffic obeys
     let them go (crossing.js `whatStops` -- a red, somebody with the
     right of way, the car in front), then go. */
  if (me.v < 0.3) {
    const view = whatStops({ ...me, caution: 1, headway: 1.6 }, world);
    const held = view.leader && (view.leader.v ?? 0) <= 0.5 && view.gap < 4;
    if (held || (me.stoppedAt == null && me.s <= path.stopAt + 0.5 && me.s > path.stopAt - 12)) slider = -0.3;
  }
  /* Pulling in at the place sent to. */
  const along = sc.dest ? alongTo(course, me, sc.dest) : null;
  if (along != null && along > -60 && along < ARRIVED_WITHIN - 2) {
    const d = Math.max(0.5, -along + 2);
    const band = stopBand(me.v, d);
    slider = band ? Math.min(slider, band.at) : me.v > 0.3 ? -0.2 : slider;
    if (-along < ARRIVED_WITHIN - 3 && me.v < 1) slider = -0.3;
  }
  if (!sc.dest && sc.job) slider = -0.3;   // standing while they get in or out
  /* The turn the screen says, signalled only before the line. */
  const turn = sc.route?.steps?.[0];
  const want = turn && turn.k === me.k ? spot.layout.paths[turn.route].intent : null;
  const signal = want && want !== "straight" && me.s <= path.stopAt ? want : null;
  /* The lane: the one the screen asks for, else keep right unless a left is coming here. */
  let lane = sc.navLane ?? 0;
  if (!lane && leg && !leg.curb && want !== "left" && me.s < path.stopAt - 25) lane = 1;
  const target = me.s <= path.stopAt - 3 ? lane * LANE * 0.72 : 0;
  const steer = -(me.off - target) * 0.25 - me.psi * 2.5;
  return { input: { steer, slider, assist: 0 }, signal };
}

/* One tick: the input, then the player stepped by the game's own model. */
export function goodStep(me, world, sc, opts) {
  const { input, signal } = goodInput(me, world, sc, opts);
  return stepDriver({ ...me, signal }, input, world, DT);
}
