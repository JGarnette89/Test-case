/* =====================================================================
   SCORING
   Grades a press against a window the engine derived. Nothing in here may
   decide when the road is yours — it only measures how long you took to
   take it once it was.

   Why reaction time and not a pass/fail: on a real test, moving off two
   seconds after your window opened is undue delay, and hesitating that
   long at a four-way stop is how you get the person behind you into the
   intersection with you. A binary verdict cannot tell a driver who read
   the situation from one who waited until it was obvious.
   ===================================================================== */


/* REACTION_FLOOR lives in src/core/perception.js: the live traffic
   reacts on it too. Imported and re-exported, one definition. */
import { REACTION_FLOOR } from "../core/perception.js";
export { REACTION_FLOOR };

/* How long after the window opens before the score reaches nothing. Also
   the boundary between "took your time" and undue delay. */
export const GRACE = 2.6;

/* Presses fractionally before the window are the engine's own 0.05s step
   and float error, not a failure to yield. Beyond this you went on someone
   else's right of way, and that is the one fault that cannot be scored on
   a curve. */
export const EARLY_TOLERANCE = 0.25;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* Bands exist so the player gets a word, not just a number. The cutoffs
   are deliberately generous at the top: reading an intersection right and
   moving within half a second of your window deserves the good word. */
const BANDS = [
  { min: 90, label: "Sharp", note: "Moved the moment it was yours." },
  { min: 65, label: "Clean", note: "Read it well, went promptly." },
  { min: 30, label: "Slow", note: "The gap was there before you took it." },
  { min: 1, label: "Hesitant", note: "Most of your window went by unused." },
];

export function bandFor(score) {
  return BANDS.find((b) => score >= b.min) || null;
}

/* The whole judgment in one call: what happened, and what it was worth.
   `legalAt` comes from the engine. `pressedAt` is null if they never went.

   `reactionFloor`/`grace` default to the constants above and exist so a
   run-scoped modifier (a drafted trait — see roguelike.js) can widen how
   generous the curve is being *for display*, without this file having
   any idea a roguelike exists. `EARLY_TOLERANCE` is not a parameter: it
   is the boundary of a failure to yield, not a matter of taste, and no
   caller gets to move it. Every existing call site, unchanged, gets
   back exactly what it always has.

   Returns:
     verdict   collision | early | good | late | missed
     score     0-100, continuous inside the window
     reaction  seconds after the window opened; negative means premature */
export function grade({ legalAt, pressedAt, collided = false, reactionFloor = REACTION_FLOOR, grace = GRACE }) {
  if (collided) {
    return { verdict: "collision", score: 0, reaction: pressedAt == null ? null : pressedAt - legalAt, band: null };
  }
  if (pressedAt == null) {
    return { verdict: "missed", score: 0, reaction: null, band: null };
  }

  const reaction = pressedAt - legalAt;

  if (reaction < -EARLY_TOLERANCE) {
    return { verdict: "early", score: 0, reaction, band: null };
  }

  // Decay runs from the reaction floor to the grace limit, so the score
  // hits exactly zero where undue delay begins — no cliff at the boundary.
  const over = Math.max(0, reaction - reactionFloor);
  const span = grace - reactionFloor;
  const q = clamp(1 - over / span, 0, 1);
  const score = Math.round(100 * q);

  const verdict = reaction > grace ? "late" : "good";
  return { verdict, score, reaction, band: bandFor(score) };
}

/* Running total across a session. Average matters more than the sum,
   because scenarios differ in how much window they give you. */
export function tally(prev, result) {
  const played = prev.played + 1;
  const points = prev.points + result.score;
  return {
    played,
    points,
    clean: prev.clean + (result.verdict === "good" ? 1 : 0),
    best: Math.max(prev.best, result.score),
    average: Math.round(points / played),
  };
}

export const emptyTally = { played: 0, points: 0, clean: 0, best: 0, average: 0 };
