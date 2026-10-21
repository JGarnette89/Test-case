/* =====================================================================
   ATTENTION IS INTERMITTENT, NOT LATE (28 September).

   A driver sees the road as it is -- and every so often looks away: a
   mirror, the dash, the radio, a thought. For as long as they are looking
   away they go on with the last picture they had, carried forward, because
   that is what anybody assumes a moving car does. What they miss is
   whatever CHANGED while they were not looking: the car ahead braking, a
   car pulling out, a gap closing, the sign at the end of a short block.

   How long a glance away lasts is the driver's registration delay (`lag`:
   REACTION_FLOOR plus REGISTER_SPAN times their observation deficit, with
   jitter) -- the numbers the axis always had, so a sharp observer's
   glances are short and a poor one's run to two seconds. How often is
   LOOK_EVERY, a design constant (flagged) for how often a driver takes
   their eyes off the road ahead, deliberately NOT tuned to any crash rate:
   observation is never calibrated by outcome (DECISIONS.md 4.4). Each
   driver's glances fall at their own phase, from their number, so nothing
   is rolled per tick and a world replays exactly.

   What this replaced, measured (tools/measure/late-crashes.mjs): `lag` as
   a CONSTANT delay -- every driver living their lag behind the world at all
   times. That is not what the registration delay measured (the time to
   notice a newly visible road user), and it read wrong: frozen, the
   crashes were between drivers of near-perfect observation; carried
   forward, poor observers rear-ended every queue they met, 13 and 22 in
   three minutes. Intermittent: 3 and 2.

   A driver with no lag -- every driver while perception is off, the
   default -- never looks away, and the sim is exactly what it was.
   ===================================================================== */
export const LOOK_EVERY = 6.0;

/* PERIPHERAL VISION (22 October, the maintainer's ruling: "you are spot on
   about the peripheral vision doing work in the animal brain
   automatically"). A glance away is never total blindness. Something
   LOOMING -- an image growing fast in the edge of the eye -- still
   registers, and pulls the eyes back a reaction time later (REACTION_FLOOR,
   crossing.js `seenBy`): a late reaction, never none.
   Looming is the rate the image of the car ahead widens, in radians per
   second: its width times the closing speed over the gap squared. LOOMING
   is the threshold, a FLAGGED design constant taken from the perception
   literature's detection threshold for looming (of the order 0.003-0.01
   rad/s), never tuned to a crash rate (DECISIONS 4.4). */
export const LOOMING = 0.005;
export const loomingRate = (width, closing, gap) => (closing > 0 ? (width * closing) / Math.max(gap, 0.5) ** 2 : 0);
const GOLDEN = 0.6180339887;

/* WHEN A GLANCE IS TAKEN IS A DECISION (22 October, the maintainer's
   ruling: "a look away of that time would be coasting on a highway or at
   least a straight stretch of road that doesn't anticipate steering
   actions or braking ... looking away as it is now is ... being
   implemented randomly rather than when a driver might actually look away
   completely"). A glance falls DUE every LOOK_EVERY seconds, at the
   driver's own phase; it is TAKEN when the road gives them at least its
   length before they must act (crossing.js `timeFree`), and until then it
   waits. So a glance is short or absent following into a turn and
   ordinary on a clear straight, and a driver with a long glance looks away
   only where a long glance fits. `glanceAt` is when the last one was
   taken, set by the step; a car never stepped -- a probe -- reads the
   schedule as it falls (`lastDue`), which is what a stepped car does on a
   road that never asks anything of it. */
export function lastDue(t, me) {
  const phase = (((me.n ?? 0) * GOLDEN) % 1) * LOOK_EVERY;
  return t - ((((t + phase) % LOOK_EVERY) + LOOK_EVERY) % LOOK_EVERY);
}
/* Seconds since this driver looked away, at time t; 0 while they are
   looking. */
export function lookingAway(t, me) {
  const g = me.lag ?? 0;
  if (!(g > 0) || me.player) return 0;
  const into = t - (me.glanceAt !== undefined ? me.glanceAt : lastDue(t, me));
  return into >= 0 && into < g ? into : 0;
}
