/* =====================================================================
   DIRECTIONS — the instruction you give, and what stacking them costs

   The fourth system, and the one that ties the other three together. The
   candidate only knows what you told them, so a course is only a course
   if you call it in time.

   THE RULE, from the maintainer, who does this for a living:

     "The instruction needs to be given as early as it is clear what the
      direction is specifically asking. I will ask the applicant to 'turn
      right at the first street' more or less as soon as that statement is
      true to where our route takes us."

   So the window is DERIVED, not tuned. It opens the moment the phrase
   stops being ambiguous — the moment the junction ahead is the one the
   phrase points at — and it closes when the candidate must already be
   acting on it. Neither edge is a number somebody picked.

     "I will avoid giving instructions in a row, only when having multiple
      instructions to execute does not overwhelm the concentration of the
      applicant, or when knowing the multiple steps required in advance
      will give the driver the most possible time to complete their task."

   Both halves of that are real and they pull opposite ways, which is
   exactly why it is a mechanic rather than a rule. Stacking buys the
   candidate time — an instruction given early can never be given late —
   and it buys YOU attention back for the other three systems. It costs
   the candidate's concentration, and a loaded driver is a worse driver.

   You are trading your own risk for theirs. That is the meter.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { sequenceFor, deriveWindows, SLOW_LEAD } from "./actions.js";
import { PROPER_SIGNAL_LEAD, severityOf } from "./index.js";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* How long between hearing an instruction and being able to start acting
   on it. Slower than reading a light — REACTION_FLOOR is 0.35s for a
   visual cue, and this is language: hear it, resolve which junction it
   means, decide. Named and tunable rather than buried, and it is the one
   number here that is a judgment rather than a derivation. */
export const FOLLOW_LAG = 1.0;

/* What each extra instruction the candidate is holding costs them, and
   how much composure is on the table at full load. Both are tunable and
   both are deliberately measured rather than asserted — verify-directions
   reports what stacking actually does to fault size, so these can be set
   against an observed consequence instead of a feeling. */
export const PRESSURE_PER_EXTRA = 0.34;
export const SKILL_UNDER_LOAD = 0.6;

/* Silence means straight on. A candidate told nothing does not stop and
   does not guess: they carry on ahead. This is why a late instruction is
   a missed turn rather than a pause, and it is the default the whole
   system is built around. */
export const DEFAULT_INTENT = "straight";

const MANOEUVRE_OF = { left: "turn", right: "turn", straight: "straight" };

export function phraseFor(intent) {
  if (intent === "left") return "Turn left at the first street";
  if (intent === "right") return "Turn right at the first street";
  return "Follow the road ahead";
}

/* =====================================================================
   The window

   opensAt — when the phrase becomes unambiguous. "The first street" means
   the junction being approached only once the previous one is behind you,
   which for a single-junction leg is the moment the leg begins. A leg
   that ever contains two junctions would move this, which is why it is
   derived from the leg rather than hardcoded to zero elsewhere.

   deadline — the candidate has to KNOW before they have to ACT. The
   earliest thing any manoeuvre asks for is already derived by
   deriveWindows (signal, then slow, then go), so the deadline is the
   earliest of those minus the time it takes to follow an instruction.
   Nothing here re-derives what a manoeuvre needs; it reads it.
   ===================================================================== */
export function instructionWindow(sim, { legStartsAt = 0 } = {}) {
  const ego = sim.ego;
  const intent = ego.intent ?? DEFAULT_INTENT;
  const sequence = sequenceFor(MANOEUVRE_OF[intent] ?? "straight");

  /* The manoeuvre is the departure: at a stop-controlled junction the
     candidate is already stationary, so leaving the line IS the act. */
  const manoeuvreAt = ego.departAt ?? sim.legalAt;
  const windows = deriveWindows(sequence, { manoeuvreAt, legalAt: sim.legalAt });

  const acts = Object.values(windows).filter((v) => v != null);
  const mustActBy = acts.length ? Math.min(...acts) : manoeuvreAt;
  const deadline = mustActBy - FOLLOW_LAG;

  return {
    intent,
    phrase: phraseFor(intent),
    opensAt: legStartsAt,
    deadline,
    mustActBy,
    // A window that never opens is a scenario that cannot be directed —
    // reported rather than clamped, because it is a content bug.
    viable: deadline > legStartsAt,
  };
}

/* How much approach a leg must carry before the candidate leaves the
   line, for its instruction to be givable at all. Derived by working
   backwards through what the manoeuvre itself asks for: hear it, then
   signal, then slow, then act.

   This is a CONTENT SPEC, and the shipped set does not meet it for turns.
   Every existing situation was authored for a driver who only had to
   press GO, so its clock starts at the stop line and carries no approach
   worth speaking of — a turn needs 5.5s of it and gets none. That is not
   a bug in this file; it is the re-timing the examiner game needs, stated
   as a number instead of a feeling. verify-directions.mjs reports the
   shortfall per situation. */
export function runwayNeeded(intent) {
  const sequence = sequenceFor(MANOEUVRE_OF[intent] ?? "straight");
  let lead = 0;
  if (sequence.includes("slow")) lead += SLOW_LEAD;
  if (sequence.includes("signal")) lead += PROPER_SIGNAL_LEAD;
  return lead + FOLLOW_LAG;
}

/* =====================================================================
   Load

   `held` is how many instructions the candidate is carrying BEYOND the
   one they are currently executing. Zero is the unloaded case and costs
   nothing, which matters: the common, correct play must be free.
   ===================================================================== */
export function pressureOf(held) {
  return clamp(Math.max(0, held) * PRESSURE_PER_EXTRA, 0, 1);
}

export function skillUnderPressure(base = 1, pressure = 0) {
  return clamp(base - pressure * SKILL_UNDER_LOAD, 0, 1);
}

/* The candidate as they actually are right now, for handing to simulate().
   Skill is a property of the driver, so it rides on the participant the
   same way traits do. */
export function loadCandidate(scn, { held = 0, baseSkill = 1 } = {}) {
  const skill = skillUnderPressure(baseSkill, pressureOf(held));
  return { ...scn, ego: { ...scn.ego, skill } };
}

/* How much worse this driver is under that load, as a plain multiplier on
   the size of whatever they get wrong. Exposed so a renderer can show the
   meter honestly rather than inventing its own curve. */
export function severityUnder(held, baseSkill = 1) {
  return severityOf({ skill: skillUnderPressure(baseSkill, pressureOf(held)) });
}

/* =====================================================================
   Whose fault was that?

   The interlock the whole design rests on. An instruction given late is
   the EXAMINER's error, not the candidate's — real practice, and the
   reason the four systems can make each other fail. Being busy marking a
   fault makes you late with a direction, and the error that follows is
   then yours and unmarkable.
   ===================================================================== */
export function attribute(givenAt, window) {
  if (givenAt == null) {
    return { verdict: "never-given", blame: "examiner", followed: DEFAULT_INTENT };
  }
  if (givenAt > window.deadline) {
    return { verdict: "late", blame: "examiner", followed: DEFAULT_INTENT };
  }
  if (givenAt < window.opensAt) {
    /* Not a fault. This is the trade: you called it before it was
       strictly unambiguous, which is allowed and sometimes right, and the
       cost lands on the candidate as load rather than on you as a mark. */
    return { verdict: "stacked", blame: null, followed: window.intent };
  }
  return { verdict: "in-window", blame: null, followed: window.intent };
}
