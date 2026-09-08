/* =====================================================================
   OUTCOME — how a drive ends, and who it lands on

   Until now a drive had no ending. A collision was simply not modelled:
   the two cars drove through each other and play carried on, which is why
   `windowIsMarkable` refuses contact at all — the accept test was standing
   in for a state the game could not represent. This is that state.

   IT CARRIES TWO THINGS, deliberately, because they are the same shape.
   A drive stops either because the candidate hit somebody, or because the
   examiner took the wheel. Both end it, both are recorded, and both have
   to say who they land on.

   THE MAINTAINER'S RULING ON INTERVENTION, verbatim:

     "an intervention is an automatic fail in real life, however we are
      also taught that an early intervention (at the examiners discretion)
      can be dismissed from the scoresheet if the intervention was too
      hasty or 'overly' cautious."

     "failing to intervene when possible will count against the examiner
      in some way (in reality it could cost their job if it happens
      enough)."

   So there are three, and they mirror the marking sheet's own three —
   caught, invented, missed — which is not a coincidence: intervening is
   marking with the wheel instead of the pen.

     CORRECT   the danger was real and it was prevented.
               AUTOMATIC FAIL for the candidate. The player was right.
     HASTY     nothing was going to happen. Dismissed from the sheet, the
               candidate is NOT failed, and the drive continues.
               THE COST FALLS ENTIRELY ON THE PLAYER.
     MISSED    contact happened and nobody took the wheel. Counts against
               the player, seriously.

   THE ASYMMETRY IN `HASTY` IS THE POINT AND MUST BE PRESERVED. A
   candidate is never penalised for the examiner's nerves. Anything that
   quietly moves a hasty intervention onto the candidate's sheet has
   broken the rule, not tuned it.

   WHAT IS DERIVED HERE AND WHAT IS NOT. Which of the three happened is
   DERIVED, by the same controlled comparison everything else in this
   engine uses: take the world as it stands and ask whether it ends in
   contact. If it would have, the intervention was correct; if it would
   not have, it was hasty. Nobody writes down "this one was hasty".

   What is NOT here is what any of it is WORTH. The scoring weights are
   the maintainer's and are deliberately absent rather than guessed at.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { poseAt, conflicts, spanOf, STEP } from "./index.js";

export const OUTCOME = {
  COMPLETED: "completed",
  COLLISION: "collision",
  INTERVENTION: "intervention",
};

export const INTERVENTION = {
  CORRECT: "correct",
  HASTY: "hasty",
  MISSED: "missed",
};

/* Blame, kept as a field rather than inferred at the call site, because
   the whole ruling is about WHO a thing lands on and that must not be
   re-derived differently in two places. */
export const ON = { CANDIDATE: "candidate", EXAMINER: "examiner", NOBODY: "nobody" };

/* =====================================================================
   Does this drive end in contact, and where?

   The ego against everybody, from `from` onward. Returns the FIRST
   contact — a drive ends at the first one, so later ones are not a
   different outcome, they are the same one continuing.
   ===================================================================== */
export function contactIn(sim, { from = null, horizon = null } = {}) {
  const ego = sim.ego;
  const start = from ?? ego.departAt ?? 0;
  const end = horizon ?? start + spanOf(ego) + 2;
  for (let t = start; t <= end; t += STEP) {
    const mine = poseAt(ego, t);
    if (mine.gone) break;
    for (const a of sim.actors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) {
        return {
          at: Math.round(t * 100) / 100,
          who: a.id,
          name: a.name ?? a.id,
          kind: a.kind ?? "car",
          x: (mine.x + theirs.x) / 2,
          y: (mine.y + theirs.y) / 2,
        };
      }
    }
  }
  return null;
}

/* =====================================================================
   Judging an intervention

   DERIVED, not authored. The question "was that intervention justified"
   is exactly "was this world going to end in contact", and the world
   already knows. Take the drive as it stands at the moment the player
   grabbed the wheel and ask whether it hits anybody after that.

   `graceBefore` exists because an intervention prevents a collision by
   happening BEFORE it — judging only from the instant of the grab would
   call every successful intervention hasty, since by then the danger is
   in the future either way. The window looks forward from the grab, which
   is the same direction the danger lies in.
   ===================================================================== */
export function judgeIntervention(sim, atT, { horizon = null } = {}) {
  const hit = contactIn(sim, { from: atT, horizon });
  return {
    verdict: hit ? INTERVENTION.CORRECT : INTERVENTION.HASTY,
    at: atT,
    prevented: hit,
    /* A correct intervention fails the candidate. A hasty one is
       dismissed and costs the candidate NOTHING -- the asymmetry above. */
    on: hit ? ON.CANDIDATE : ON.EXAMINER,
    endsDrive: Boolean(hit),
  };
}

/* Was there anything to intervene ON? A drive that was never going to hurt
   anybody cannot be a failure to intervene, and this is what keeps
   "missed" from being charged for every quiet drive. */
export const wasPreventable = (sim) => contactIn(sim) != null;

/* =====================================================================
   How the drive actually ended

   One call, so a renderer never assembles this itself. `intervenedAt` is
   null when the player never took the wheel.
   ===================================================================== */
export function outcomeOf(sim, { intervenedAt = null, horizon = null } = {}) {
  if (intervenedAt != null) {
    const j = judgeIntervention(sim, intervenedAt, { horizon });
    return {
      kind: OUTCOME.INTERVENTION,
      verdict: j.verdict,
      at: j.at,
      on: j.on,
      prevented: j.prevented,
      /* A hasty one does not end the drive. That is the ruling: the
         candidate is not failed and play continues. */
      ends: j.endsDrive,
      candidateFailed: j.verdict === INTERVENTION.CORRECT,
    };
  }

  const hit = contactIn(sim, { horizon });
  if (hit) {
    return {
      kind: OUTCOME.COLLISION,
      verdict: INTERVENTION.MISSED,
      at: hit.at,
      /* Contact that nobody prevented is BOTH: the candidate drove into
         somebody and the examiner did not stop them. Recorded as landing
         on the examiner, because the candidate's fault is already on the
         sheet as an encroachment and this is the half that is not. */
      on: ON.EXAMINER,
      contact: hit,
      ends: true,
      candidateFailed: true,
    };
  }

  return { kind: OUTCOME.COMPLETED, verdict: null, at: null, on: ON.NOBODY, ends: false, candidateFailed: false };
}

/* What to say about it. Prose rather than a score, because what any of
   this is WORTH is the maintainer's call and is not encoded here. */
export function describeOutcome(o) {
  if (!o) return "";
  if (o.kind === OUTCOME.COLLISION) {
    return `Contact with ${o.contact?.name ?? "another road user"} at ${o.at?.toFixed(1)}s. You did not take the wheel.`;
  }
  if (o.kind === OUTCOME.INTERVENTION) {
    return o.verdict === INTERVENTION.CORRECT
      ? `You took the wheel at ${o.at?.toFixed(1)}s and prevented contact with ${o.prevented?.name ?? "another road user"}.`
      : `You took the wheel at ${o.at?.toFixed(1)}s. Nothing was going to happen — dismissed, and it cost you the drive you were watching.`;
  }
  return "Drive completed.";
}
