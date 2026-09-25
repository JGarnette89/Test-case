/* =====================================================================
   CORE -- how fast anybody reacts and registers

   What the live simulator and the shelved engine both stand on. It
   imports nothing from src/engine/ or src/sim/, so the live screens
   can use it without the old engine in their closure (checked in
   verify-core.mjs).

   Moved here verbatim on 24 September from engine/score.js and
   engine/awareness.js. The old home
   imports and re-exports it, so there is still one definition.
   ===================================================================== */
/* Nobody reacts to a visual go-cue faster than this. Grading below it
   would reward pressing on spec rather than reading the road, so anything
   inside the floor is full marks. */
export const REACTION_FLOOR = 0.35;

/* Nobody registers anything faster than they can react to it, so the
   floor is the engine's existing REACTION_FLOOR rather than a new
   number. A perfect observer therefore takes 0.35s — and measured, the
   shortest lead any road user gives is 0.50s, so a perfect observer never
   misses anything that was there to be seen. That property is the reason
   the floor is not zero. */
export const REGISTER_FLOOR = REACTION_FLOOR;

/* How much longer a hopeless observer takes. DERIVED from how much
   warning the world actually gives: across 48 scenes and 93 road users,
   the lead from a road user becoming clear to the candidate's decision is
   min 0.50s, p25 1.60s, median 3.75s, p75 5.40s.

   Set to the p25 lead, so a maximally poor observer is still registering
   about three quarters of the traffic and misses the quarter that gave
   them least warning. Tying it to the median instead would have a bad
   driver missing half of everything, which is not a driver, it is a
   hazard — and the check measures the resulting miss rate rather than
   trusting this comment. */
export const REGISTER_SPAN = 1.6;

/* Attention is not uniform: two cars appearing at the same moment are not
   noticed at the same moment. Seeded per road user so it is a property of
   the draw rather than of the frame. */
export const JITTER = 0.6;
