/* =====================================================================
   WHAT A DRIVER KNOWS ABOUT THE RULES AT AN INTERSECTION (the signs
   design, SIMULATOR.md). Every question a DRIVER asks of the form "what is
   the rule here" is asked here and nowhere else.

     knownControl   the rule at MY approach, as I have read it;
     theirControl   the rule at SOMEBODY ELSE's approach, as posted -- what
                    I expect of them. When they missed their sign, that
                    expectation is exactly what is wrong, which is the
                    hazard observation makes for everybody else.

   What is NOT a driver's question stays outside: where traffic spawns
   (crossing.js `edgesOf`) and what the examiner's sheet counts
   (marking.js) read the map as it is.

   READING A SIGN. A stop or yield sign can be made out from SIGN_LEGIBLE
   before it, or from where its road begins if that is nearer -- a driver
   who turned onto a short block has only the block. It is read the first
   time the driver is LOOKING while it is legible (sim/attention.js): a
   driver looking away as it comes into view reads it when they look back,
   so on a long road everybody reads it with room to spare, and on a short
   block a glance at the wrong moment leaves them reading it too late to
   stop comfortably -- or, where the glance outlasts the block, not at all.
   Nothing is rolled: the miss falls out of when they looked away, for how
   long, their speed and where the sign stands.

   Until they have read it the approach is, to them, uncontrolled: they
   yield only to what they see and do not plan to stop.

   A LOCAL knows their own district's signs without reading them (the
   maintainer's ruling, 28 September): a driver whose `home` is the
   district this approach is in knows the rule from the start.

   Signals are not read this way: a light is large, lit and public. A
   driver who never looks away -- every driver while perception is off,
   the default -- reads every sign, which is the sim exactly as it was;
   `verify-signs` holds that tick for tick.
   ===================================================================== */
import { lookingAway } from "./attention.js";

/* How far away a stop or yield sign can be made out and understood: a
   750 mm red octagon or inverted triangle, by shape and colour, in
   daylight. A design constant, flagged: sight lines (a van, a building, a
   bend) will shorten it per sign; this is the clear-view figure. */
export const SIGN_LEGIBLE = 100;

/* Where along this path (s) the sign on it stands, and where it first
   becomes legible -- negative where that is back along the road, before
   the path's own start at the seam. */
export function signReach(layout, path) {
  const leg = layout.legs[path.from];
  const at = path.stopAt - (leg?.sign?.back ?? 0);
  return { at, from: Math.max(-(leg?.inFrom ?? 0), at - SIGN_LEGIBLE) };
}

export function knownControl(actor, layout, path, t = 0) {
  const standing = layout.place.control[path.from];
  if (standing !== "stop" && standing !== "yield") return standing;
  if (!(actor.lag > 0) || actor.player) return standing;
  const leg = layout.legs[path.from];
  if (actor.home && leg?.zone && actor.home === leg.zone) return standing;
  const { from } = signReach(layout, path);
  const s = actor.s ?? 0;
  if (s < from) return "none";
  /* In view for this long, at the speed they are doing; read if they were
     looking at any moment of it. */
  const inView = (s - from) / Math.max(actor.v ?? 0, 0.5);
  return inView > lookingAway(t, actor) ? standing : "none";
}
export const theirControl = (layout, path) => layout.place.control[path.from];
