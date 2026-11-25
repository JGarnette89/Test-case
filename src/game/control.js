/* =====================================================================
   THE THUMB SETS THE SPEED (WORK-game-slice7 section 2; pure, no React, no
   DOM, so a check in Node reads the same arithmetic the screen does).

   Jay, after slice 6: "The car still doesn't quite fully launch from the
   stop position making the turn unpredictable. Maybe we can add some speed
   controls? Hold to wait, drag up to move drag up further to move faster?"
   And, asked and answered: letting go KEEPS the speed (the car holds the
   speed the player dragged to, and dragging back down brakes).

   Steering stays automatic. The player controls only the speed the car aims
   for: `targetOf` turns a drag UP from the press point into a target speed
   in m/s; round.js `setTarget` is what the screen calls with it, and
   autopilot.js is what makes the car go there.
   ===================================================================== */
import { LIMIT } from "./round.js";

/* px of drag under which the car is waiting [invented]. */
export const DEAD = 14;
/* The drag, as a share of the screen's height, from the dead zone to the top of the speed (the limit) [invented]. */
export const RANGE_OF = 0.3;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/* The drag that spans the speeds, in px, for a screen. */
export const rangeOf = (size) => RANGE_OF * size.h;

/* The target speed, m/s, for a drag of `dy` px UP from the press point (negative is down): 0 at or under DEAD, then linear to the limit at
   DEAD + RANGE, and never above it. */
export const targetOf = (dy, size) => LIMIT * clamp01((dy - DEAD) / rangeOf(size));

/* The drag, in px, that `target` is the answer to (0 for a target of 0): what a later touch starts from, so it takes over from the target the last one
   left. The inverse of targetOf above the dead zone. */
export const offsetOf = (target, size) => (target > 0 ? DEAD + rangeOf(size) * clamp01(target / LIMIT) : 0);

/* A touch that took the control at `y` when the target was `base` (an offset, offsetOf): the target at `now`. */
export const thumbTarget = (grab, now, size) => targetOf(grab.base + (grab.y - now), size);

/* THE CONTROL'S ZONE, a rectangle: the button's own, extended up by the range. A touch that lands in it is the control's and never pans; one that
   lands anywhere else pans or pinches, as in slice 5. [invented: "at least the button's rectangle, extending up by RANGE"] */
export const zoneRect = (size, button) => {
  const r = rangeOf(size);
  return { x: button.x, y: button.y - r, w: button.w, h: button.h + r };
};
