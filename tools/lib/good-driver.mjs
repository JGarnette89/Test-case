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
import { stopBand, sliderFor } from "../../src/sim/player.js";
import { limitAt } from "../../src/sim/graph.js";
import { alongTo, ARRIVED_WITHIN } from "../../src/sim/route.js";
import { DT } from "../../src/sim/traffic.js";
import { whatStops } from "../../src/sim/crossing.js";

const LANE = 3.6;

export function goodInput(me, world, sc, { pace = 0.95, overtake = false } = {}) {
  const course = world.course;
  const spot = course.at[me.k], path = spot.layout.paths[me.route], leg = spot.layout.legs[path.from];
  /* Past the box the limit is the road being driven onto, from its far edge -- as the traffic reads it (crossing.js).
     Reading the approach's limit, the harness drove a kilometre of highway at a slip road's 76 km/h. */
  const posted = limitAt(course, me) ?? 13.9;
  const ahead = aheadOf(me, course, world);
  /* Cruise: a gentle P on speed. */
  /* The acceleration wanted -- proportional to the speed still to gain, gentle --
     and the slider that gives it, through the car's own inverse (player.js
     sliderFor). A fixed slider cap held the harness at 80 km/h (the hold point
     climbs with speed); a guessed offset overshot the limit. */
  let slider = sliderFor(Math.max(-1.5, Math.min(1.2, (posted * pace - me.v) * 0.6)), me.v, me.grade ?? 0);
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
  /* OVERTAKE (a highway player): a slower car close ahead in my lane, and the
     lane to my left clear beside me -- pull out; and keep right only into a
     lane that is clear and holds nobody slower just ahead. */
  /* The lane is the approach's before the line and the exit's past the box
     (lanechange.js exitStep), and a car's place in it is measured the same
     way: along the approach, or as distance remaining on the exit. */
  const onExit = me.s > path.clearAt + 1;
  const lg = onExit ? spot.layout.legs[path.to] : leg;
  const pos = lg?.pos ?? lg?.lane ?? 0;
  const besideLeg = (d) => (lg ? spot.layout.legAt?.(lg.base, pos + d) ?? null : null);
  const myAt = onExit ? -(path.length - me.s) : me.s;
  const carsOn = (legId) => world.actors.filter((a) => {
    if (a.player || (a.k ?? 0) !== me.k) return false;
    const p = spot.layout.paths[a.route];
    return onExit ? p?.to === legId && a.s > p.clearAt : p?.from === legId && a.s <= p.stopAt;
  }).map((a) => ({ a, at: onExit ? -(spot.layout.paths[a.route].length - a.s) : a.s }));
  const clear = (legId) => legId && carsOn(legId).every(({ at }) => Math.abs(at - myAt) > 20);
  const slowAhead = (legId) => carsOn(legId).some(({ a, at }) => at > myAt && at - myAt < 60 && (a.v ?? 0) < posted * pace - 1.5);
  const room = onExit ? path.length - me.s > 80 : me.s < path.stopAt - 60;
  const here = onExit ? path.to : path.from;
  /* AN ACCELERATION LANE (map/accel.js): up to speed, then over into a
     clear gap -- by half-way along it whatever the speed, so it is never
     run out of. Whichever driver this is: joining is not optional. */
  if (onExit && lg?.accel) {
    const along = me.s - path.clearAt, open = path.length - lg.accelClose - path.clearAt;
    if (!lane && (me.v >= 0.85 * posted * pace || along > open / 2) && clear(besideLeg(-1))) lane = -1;
  } else if (overtake && !lane && lg && room) {
    if (slowAhead(here) && clear(besideLeg(-1))) lane = -1;
    else if (!lg.curb && want !== "left" && clear(besideLeg(1)) && !slowAhead(besideLeg(1))) lane = 1;
  } else if (!lane && leg && !leg.curb && want !== "left" && me.s < path.stopAt - 25) lane = 1;
  /* Past the box, only toward a lane that is there: the lane the directions
     name can be a turn bay that has not opened yet, and steering for it put
     the car over the curb (20 October). */
  if (onExit && lane && !besideLeg(lane)) lane = 0;
  if (onExit && lane > 0 && lg?.accel) lane = 0;
  const target = me.s <= path.stopAt - 3 || onExit ? lane * LANE * 0.72 : 0;
  const steer = -(me.off - target) * 0.25 - me.psi * 2.5;
  return { input: { steer, slider, assist: 0 }, signal };
}

/* One tick: the input, then the player stepped by the game's own model. */
export function goodStep(me, world, sc, opts) {
  const { input, signal } = goodInput(me, world, sc, opts);
  return stepDriver({ ...me, signal }, input, world, DT);
}
