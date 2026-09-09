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
import { poseAt, conflicts, spanOf, STEP, M } from "./index.js";
import { registrationsIn, registrationDelay } from "./awareness.js";
import { observe, divergenceAt, BELIEF_SAME } from "./belief.js";
import { REACTION_FLOOR } from "./score.js";
import { MOST_GIVEN, MOST_WAIT } from "./reaction.js";
import { approachDecel } from "./paths.js";

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
   A WHOLE DRIVE, NOT ONE SCENE

   A drive is intersections and the links between them, each its own
   little simulation with its own clock. Contact can happen in any of
   them and a drive ends at the FIRST one, so "how did this drive end"
   is not a question any single scene can answer.

   This lives in the engine rather than being assembled in the component,
   for exactly the reason `sectionSheet` does: a React component is the
   one place nothing else in this suite can reach, and the outcome of a
   drive is the last thing that should be unverifiable.

   A scene is `{ id, sim, offset }`. `offset` maps that scene's own clock
   onto the drive's, and the caller owns it because only the caller knows
   how its drive was laid out.
   ===================================================================== */

export function contactsAcross(scenes, opts = {}) {
  const out = [];
  for (const s of scenes) {
    const hit = contactIn(s.sim, opts);
    if (!hit) continue;
    out.push({
      ...hit,
      local: hit.at,
      at: Math.round((hit.at + (s.offset ?? 0)) * 100) / 100,
      scene: s.id,
      where: s.where ?? null,
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* HOW LONG A GRAB CAN PLAUSIBLY BE PREVENTING SOMETHING, and it is
   derived rather than picked: the examiner's own reaction plus the time
   to bring the car to rest at this road's speed. It is the same quantity
   the anticipation window is built from, which is the point -- one
   statement of "how long it takes to stop something", read in both
   directions.

   Without a horizon every grab is CORRECT, because a drive that ends in
   contact at all ends in contact at some point after any given instant.
   Taking the wheel for something further away than you could have
   stopped for is not preventing it; it is not having waited. */
export const graspHorizon = (v) => REACTION_FLOOR + v / approachDecel(v);

/* Judge one grab against everything the drive was going to do. Same
   derivation as `judgeIntervention` -- ask the world whether it was still
   going to hurt somebody -- lifted to the drive's clock. */
export function judgeGrab(contacts, at, speed) {
  const prevented = contacts.find((c) => c.at >= at && c.at <= at + graspHorizon(speed)) ?? null;
  return {
    at,
    verdict: prevented ? INTERVENTION.CORRECT : INTERVENTION.HASTY,
    prevented,
    /* The asymmetry, and it is the whole ruling: a correct grab is an
       automatic fail for the CANDIDATE, a hasty one is dismissed and
       costs the EXAMINER alone. */
    on: prevented ? ON.CANDIDATE : ON.EXAMINER,
    endsDrive: Boolean(prevented),
  };
}

/* What ended this drive, and who it lands on.

   The drive ends at whichever comes first: a grab that turned out to be
   justified, or a contact nobody stopped. A hasty grab ends nothing --
   the candidate is not failed and play continues -- but it is still
   reported, because it is the player's cost and the sheet is where they
   pay it. */
export function driveOutcome(contacts, grabs = [], { speed = M(11.5), completedAt = null } = {}) {
  const judged = grabs.map((g) => judgeGrab(contacts, g.at ?? g, speed)).sort((a, b) => a.at - b.at);
  const hasty = judged.filter((j) => j.verdict === INTERVENTION.HASTY);
  const correct = judged.find((j) => j.verdict === INTERVENTION.CORRECT) ?? null;
  const hit = contacts[0] ?? null;

  if (correct && (!hit || correct.at <= hit.at)) {
    return {
      kind: OUTCOME.INTERVENTION, verdict: INTERVENTION.CORRECT,
      at: correct.at, on: ON.CANDIDATE, prevented: correct.prevented,
      ends: true, candidateFailed: true, hasty,
    };
  }
  if (hit) {
    return {
      kind: OUTCOME.COLLISION, verdict: INTERVENTION.MISSED,
      at: hit.at, on: ON.EXAMINER, contact: hit,
      ends: true, candidateFailed: true, hasty,
    };
  }
  return {
    kind: OUTCOME.COMPLETED, verdict: null, at: completedAt, on: ON.NOBODY,
    ends: false, candidateFailed: false, hasty,
  };
}

/* One line a screen can print without deciding anything itself. */
export function describeDrive(o) {
  if (!o) return "";
  const tail = o.hasty?.length
    ? ` You took the wheel ${o.hasty.length === 1 ? "once" : `${o.hasty.length} times`} when nothing was coming.`
    : "";
  if (o.kind === OUTCOME.COLLISION) {
    return `Contact with ${o.contact?.name ?? "another road user"} at ${o.at?.toFixed(1)}s.`
      + ` You did not take the wheel, and stopping that was your job.${tail}`;
  }
  if (o.kind === OUTCOME.INTERVENTION) {
    return `You took the wheel at ${o.at?.toFixed(1)}s, and ${o.prevented?.name ?? "somebody"} would have been hit.`
      + ` The candidate fails, which is what an intervention is.${tail}`;
  }
  return `Drive completed with nobody hurt.${tail}`;
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


/* =====================================================================
   FAILING TO AVOID SOMEBODY ELSE'S MISTAKE

   The maintainer's ruling, and it is a general principle rather than
   content for one hazard: "failing to prevent a collision when you
   otherwise could, even if you're not strictly at 'fault', is a fail on
   the test."

   So a candidate is assessed on AVOIDING OTHER PEOPLE'S MISTAKES, not
   only on committing none of their own. Every fault before this derives
   from the candidate's own ratings and actions; this one derives from
   what they did about somebody else's.

   IT IS THE SAME RULE AS THE EXAMINER'S OWN DUTY TO INTERVENE, one level
   down. A candidate who fails to prevent an avoidable collision fails; an
   examiner who fails to prevent one is penalised. Same principle applied
   to both people in the car, which is why the shape here is
   `judgeIntervention`'s shape: take the world at a moment and ask whether
   a different action changes the ending.

   AVOIDABILITY IS DERIVED, NEVER AUTHORED. There is no list of avoidable
   situations. "Could otherwise have prevented" means there existed a
   response, available in time, given what the candidate could actually
   see -- so it is a search over the one response a driver has, exactly as
   `giveNeeded` searches for the least giving way that avoids a collision.
   The difference is only which participant is doing the giving.
   ===================================================================== */

/* Would braking from `at` have avoided it? `yielding` is the same field
   reaction.js stamps on a road user giving way, so the candidate slows by
   the identical mechanism rather than a second one. */
export function avoidableFrom(sim, at, { horizon = null } = {}) {
  const arriveAt = sim.ego.arriveAt ?? 0;
  const departAt = sim.ego.departAt ?? 0;

  /* SLOWING ON THE TRAVERSE. `yielding` is the field reaction.js already
     stamps on a road user giving way, so the candidate brakes by the
     identical mechanism rather than a second one. */
  const from = Math.max(0, at - departAt);
  for (const give of [0.4, MOST_GIVEN]) {
    for (const wait of [0, MOST_WAIT / 2, MOST_WAIT]) {
      const braked = { ...sim, ego: { ...sim.ego, yielding: { from, give, wait } } };
      if (!contactIn(braked, { horizon })) return { give, wait };
    }
  }

  /* AND EASING OFF ON THE APPROACH, which `yielding` cannot express: it
     wraps the traverse profile, while the approach is a fixed
     deceleration to the line. So a conflict arising BEFORE departAt was
     unavoidable by construction -- not because a driver could not have
     braked, but because the model had no way to say so. Measured, that
     put every roadside hazard beyond reach: they all happen while the
     candidate is approaching.

     Arriving later IS easing off: the same distance over more time. It is
     asked here rather than in basePose because `yielding` never appears
     in a normal simulate() path -- only the lab and this probe set it --
     so nothing shipped moves and the golden cannot.

     A response only counts if there was TIME for it: they must have been
     able to react before they arrived. */
  if (at + REACTION_FLOOR <= arriveAt) {
    for (const delay of [0.5, 1.0, 2.0, 4.0]) {
      const eased = {
        ...sim,
        ego: { ...sim.ego, arriveAt: arriveAt + delay, departAt: departAt + delay },
      };
      if (!contactIn(eased, { horizon })) return { easedBy: delay };
    }
  }
  return null;
}

/* Was this collision one the candidate could have prevented, and if so
   what does it say about them?

   THE EXISTING DISCRIMINATOR APPLIES UNCHANGED -- the maintainer's
   manner-and-registration rule already decides the axis:

     did not register the danger developing   -> OBSERVATION
     registered it and braked too late/hard   -> BRAKING
     registered it and pressed on anyway      -> CONFIDENCE

   No new attribution machinery, and no new axis. */
export function unavoided(sim, scn, candidate, seed = 1, opts = {}) {
  const hit = contactIn(sim, opts);
  if (!hit) return null;

  /* WHEN THE DANGER BECAME PERCEIVABLE, which is NOT when the other party
     became visible. A car parked at a curb is in plain sight the whole
     time; what has to be noticed is that it STARTED MOVING. Registering
     an object and registering a developing danger are different
     questions, and using the first put every emerging car down as
     "registered" -- 0 observation faults from 95 collisions.

     belief.js already answers the second: belief and reality diverge
     exactly where somebody is doing something you would not have
     predicted. So the onset is where the candidate's belief about that
     road user stops being true, and the candidate then needs their own
     registration delay on top. */
  const other = sim.actors.find((a) => a.id === hit.who);
  const regs = opts.registrations ?? registrationsIn(sim, scn, candidate, seed, opts);
  const visibleAt = regs?.[hit.who] ?? null;

  /* THE ONSET IS WHEN THEY START MOVING, and belief divergence is the
     wrong instrument for it. belief.js predicts "they carry on driving
     properly" -- and for a car whose whole movement IS to pull out of a
     space, driving properly is pulling out, so belief never diverges.
     Measured: onset undetected on 36 of 36. A car leaving a driveway is
     not misbehaving; it is doing an ordinary thing that has to be
     ANTICIPATED, which is a different question from being caught out by
     somebody driving badly.

     So the danger begins when the other party's behaviour begins. For a
     car that was stationary that is exactly its departure; for one
     already moving there is nothing to anticipate beyond seeing it, and
     the visible moment stands. */
  let onset = null;
  if (other) {
    const wasStill = other.emerges || other.stops;
    onset = wasStill ? (other.departAt ?? null) : null;
    if (onset == null) {
      const obs = observe(other, 0);
      for (let t = 0; t <= hit.at; t += STEP) {
        if (divergenceAt(other, obs, t) > BELIEF_SAME) { onset = t; break; }
      }
    }
  }
  /* Nothing diverged, so the danger was simply where it always was and
     seeing the object was seeing the danger. */
  const dangerAt = onset == null ? visibleAt : onset + registrationDelay(candidate, hit.who, seed);
  const sawAt = dangerAt == null ? null
    : (visibleAt == null ? dangerAt : Math.max(dangerAt, visibleAt));

  /* COULD ANYBODY HAVE AVOIDED IT -- not could THIS candidate, from the
     moment they happened to notice. That question is circular: a
     candidate who noticed too late can never avoid anything, so their own
     inattention would make every collision "unavoidable" and therefore
     nobody's fault. Measured, it did exactly that: 95 contacts, 87 with
     the danger unregistered in time, and NOT ONE counted as avoidable.

     So the standard is a COMPETENT OBSERVER: the danger's onset plus the
     floor nobody reacts faster than. If braking from there would have
     worked, the collision was preventable and "failing to prevent it when
     you otherwise could" applies. Whether THIS candidate could is not the
     question -- it is the answer, and it is what the axis records. */
  const couldHave = avoidableFrom(sim, (onset ?? 0) + REACTION_FLOOR, opts);

  /* Never registered them at all, yet braking from the moment they became
     perceivable would have worked: the only thing missing was looking. */
  /* THE MAINTAINER'S THREE-WAY RULE, all three branches.

       did not register the developing danger  -> OBSERVATION
       registered it, and only a hard response
         would have saved it -- so they left it
         too late                              -> BRAKING
       registered it in time and pressed on    -> CONFIDENCE

     The middle branch was missing, and without it everything that was not
     observation fell to confidence by default -- which is not the rule,
     it is the absence of one. The discriminator is the same MANNER
     question the stop-fault split already uses: a response that needs the
     hardest braking available is one that was left too late. */
  /* What THIS candidate would have needed from the moment THEY noticed --
     a different question from whether anybody could have avoided it, and
     the one that separates leaving it late from pressing on. Asking only
     the competent-observer question left the braking branch dead, because
     avoidableFrom returns the FIRST response that works and that is
     always the gentlest one. */
  const theirs = sawAt == null ? null : avoidableFrom(sim, sawAt, opts);
  const tooLate = sawAt != null && (theirs == null || (theirs.give ?? 0) >= MOST_GIVEN);

  const axis = sawAt == null || sawAt > hit.at
    ? "observation"
    : tooLate ? "braking" : "confidence";

  return {
    kind: "unavoided",
    at: hit.at,
    who: hit.who,
    name: hit.name,
    perceivedAt: sawAt,
    avoidable: Boolean(couldHave),
    response: couldHave,
    axis: couldHave ? axis : null,
    /* Not avoidable is not a fault. Somebody else's mistake that nobody
       could have done anything about is exactly the case this rule is NOT
       about, and counting it would punish the candidate for the world. */
    tell: couldHave
      ? (axis === "observation"
        ? "Never saw it coming — it was there to be seen"
        : axis === "braking"
          ? "Saw it, but left the braking too late"
          : "Saw it and carried on anyway")
      : null,
  };
}
