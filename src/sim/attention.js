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
const GOLDEN = 0.6180339887;

/* Seconds since this driver looked away, at time t; 0 while they are
   looking. */
export function lookingAway(t, me) {
  const g = me.lag ?? 0;
  if (!(g > 0) || me.player) return 0;
  const phase = (((me.n ?? 0) * GOLDEN) % 1) * LOOK_EVERY;
  const into = (((t + phase) % LOOK_EVERY) + LOOK_EVERY) % LOOK_EVERY;
  return into < g ? into : 0;
}
