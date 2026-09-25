/* =====================================================================
   AWARENESS — what the candidate actually registered

   THE THREE LAYERS. What happened is layer 1. What the CANDIDATE
   perceived is layer 2, and this file is layer 2. What the PLAYER noticed
   is layer 3, constrained by the viewport. The FAULT lives in the gap
   between 1 and 2 — the candidate did not perceive the vehicle and acted
   anyway. The SCORE lives in the gap between 1 and 3.

   The original view cone was the right idea attached to the wrong party.
   A poor driver's defining characteristic is not perceiving the traffic
   around them; putting the cone on the player asked the PLAYER to be the
   bad driver. Here it belongs to the candidate.

   ONE FUNCTION, TWO LAYERS, NO CONTAMINATION. `whatEgoSees` is pure and
   was always casting from the candidate's own eye — it was modelling
   layer 2 all along and being read as layer 3. Layers 2 and 3 share the
   occlusion term, and that is correct rather than contaminating: the
   player watches through roughly the same windscreen, so a van hides the
   same car from both. What stays independent are the DEGRADATIONS —
   layer 2 is degraded by the driver's observation rating, layer 3 by
   where the camera is pointed. Which gives three distinguishable
   failures:

     visible, not registered            -> the candidate's fault, markable
     visible, registered, player looked away -> the player's failure, scored
     occluded for both                  -> the scenario's doing, neither

   DETERMINISTIC, RESOLVED AT COMPOSITION TIME. One registration delay is
   drawn per road user from the scenario's seed, exactly as fault
   occurrence is. A per-frame roll would resolve at simulation time and
   ground truth would move between runs, taking the marking sheet and the
   verify suite with it.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { earliestClear, rng, poseAt, extentsFor, approachDecelOf, M, CX, CY, LANE, SET } from "./index.js";
/* How fast anybody registers anything lives in src/core/perception.js,
   because the live traffic perceives on the same lag. Re-exported. */
import { REGISTER_FLOOR, REGISTER_SPAN, JITTER } from "../core/perception.js";
import { cautionOf } from "../core/driver.js";
export { REGISTER_FLOOR, REGISTER_SPAN, JITTER };
import { approachDecel, MOST_GIVE } from "./paths.js";
import { whatEgoSees, sightBlockersOf, eyePoint, creepPose, segmentHitsBox, visibility } from "./sight.js";
import { deficitOf } from "./ratings.js";
import { LEG, SIDES, hasLeg, specOf, laneOffset, controlsOf } from "./road.js";


const DT = 0.1;

function hashOf(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/* How long after a road user becomes objectively visible this driver
   takes to register it. A perfect observer takes the floor exactly, with
   no jitter — consistency is what being good at this means. */
export function registrationDelay(candidate, actorId, seed = 1) {
  const { deficit } = deficitOf(candidate?.ratings, "observation");
  if (deficit <= 0) return REGISTER_FLOOR;
  const r = rng((hashOf(actorId) ^ (seed >>> 0)) >>> 0);
  const wobble = 1 + (r() - 0.5) * 2 * JITTER;
  return REGISTER_FLOOR + deficit * REGISTER_SPAN * wobble;
}

/* ---------------------------------------------------------------------
   Layer 1: when each road user was actually there to be seen
   --------------------------------------------------------------------- */

/* `steps` is the creep depth, and it must come from the CANDIDATE.

   In the driver game it was a player input — creep forward to see past
   the van — and feeding a player input into the candidate's awareness
   would be exactly the contamination the three-layer split exists to
   prevent. In the examiner game the player does not creep; the candidate
   drives. */
const creepOf = (candidate) => candidate?.creep ?? 0;

/* One sweep, all road users: `clearAt` is the first instant each becomes
   fully clear from the candidate's eye with occlusion applied, and
   `onStageAt` is the first instant it exists in the world at all.

   THE TWO ARE NOT THE SAME THING AND CONFLATING THEM MAKES A PERFECT
   OBSERVER BLIND. `pose.hidden` covers both "a van is in the way" and
   "this car has not spawned yet", and only the first is a perceptual
   fact. The second is an artifact of the board being finite: a car about
   to arrive is, in reality, a car visible up the road. Measured before
   this was separated — a candidate rated 1.0 on observation, who by
   construction misses nothing, pulled out into `gap` and made contact,
   because two oncoming cars had not yet come on stage when it decided.

   So `clearAt: null` with an `onStageAt` means genuinely occluded, which
   is the scenario's doing. `onStageAt` later than the decision means
   approaching from up the road, which nobody can be blamed for missing
   and which registrationsIn therefore treats as known. */
export function sightingsIn(sim, scn, { horizon = 16, candidate = null, dt = DT } = {}) {
  const statics = sightBlockersOf(scn);
  const steps = creepOf(candidate);
  const out = {};
  for (const a of sim.actors) out[a.id] = { clearAt: null, onStageAt: null };
  for (let t = 0; t <= horizon; t += dt) {
    const seen = whatEgoSees(sim, t, steps, statics);
    for (const [id, state] of Object.entries(seen)) {
      if (!out[id]) out[id] = { clearAt: null, onStageAt: null };
      if (out[id].onStageAt == null) out[id].onStageAt = t;
      if (state === "clear" && out[id].clearAt == null) out[id].clearAt = t;
    }
  }
  return out;
}


/* =====================================================================
   HOW MUCH OF THE ROAD THIS DRIVER CANNOT SEE

   A driver cannot know WHAT is in the space they cannot see. They can
   perfectly well see THAT there is space they cannot see — a van on the
   corner, a queue of oncoming traffic, a hedge. That self-knowledge is
   the input to caution, and it is available without a shred of oracle
   knowledge: it is geometry from the eye, not a fact about who is there.

   Deliberately NOT the same thing as the observation axis. Occlusion is a
   known unknown and a driver can compensate for it by waiting. Inattention
   is an unknown unknown and no amount of caution helps, because you do not
   know you failed to look. That asymmetry is true of driving and it is why
   the two axes do not collapse into each other.
   ===================================================================== */

/* Sampled over the approach road the scenario actually contains — from
   the edge of the intersection box out to the edge of the world. That is
   where a conflicting vehicle can be, so it is the road whose visibility
   means anything; sampling further would be measuring tarmac nobody can
   occupy. */
const SAMPLES = 8;

export function unseenShare(sim, scn, t, candidate = null) {
  const spec = specOf(scn);
  const egoPose = creepPose(sim.ego, t, creepOf(candidate));
  const eye = eyePoint(egoPose);
  const from = sim.ego.from;

  /* Every leg but the one they are sitting on: those are where a conflict
     can come from. */
  const legs = SIDES.filter((sd) => sd !== from && hasLeg(spec, sd));
  if (!legs.length) return 0;

  /* Physical blockers: the standing obstructions and every other road
     user. A car you have not registered still blocks your view — the
     occlusion is a fact about light, not about knowledge. */
  const blockers = [
    ...sightBlockersOf(scn).map((b) => ({ pose: b.pose, hl: b.hl, hw: b.hw })),
    ...sim.actors.map((a) => {
      const po = poseAt(a, t);
      if (!po || po.hidden || po.gone) return null;
      const e = extentsFor(a, po, 0, 0, 0, "hit");
      return { pose: po, hl: e.hl, hw: e.hw };
    }).filter(Boolean),
  ];

  let blocked = 0, total = 0;
  for (const sd of legs) {
    const leg = LEG[sd];
    const off = laneOffset(0, LANE);
    for (let i = 1; i <= SAMPLES; i++) {
      const d = M(6) + (i / SAMPLES) * (CX - M(6));
      const pt = {
        x: CX + leg.out.x * d - leg.off.x * off,
        y: CY + leg.out.y * d - leg.off.y * off,
      };
      total++;
      if (blockers.some((b) => segmentHitsBox(eye, pt, b.pose, b.hl, b.hw))) blocked++;
    }
  }
  return total ? blocked / total : 0;
}

/* THE CONTROLS ARE THINGS TO BE REGISTERED TOO, and until they were the
   observation branch of the stop-fault split had nothing to work with:
   "did not register the control in time" cannot be asked of a string on a
   leg.

   ELEVATED OBJECTS ARE NOT BLOCKED BY VEHICLES. A sign on a post at two
   metres is visible straight over a car, and this engine's occlusion is
   flat — so testing a sign against traffic would systematically claim it
   hidden when a driver would plainly see it. Walls, hedges and buildings
   do block it, and those are exactly what sightBlockersOf carries. So the
   blocker set here is the statics alone, and that difference from road
   users is the whole rule. */
export function controlSightingsIn(sim, scn, { horizon = 16, candidate = null, dt = DT } = {}) {
  const spec = specOf(scn);
  const controls = controlsOf(spec, LANE, SET, scn.at ?? { x: CX, y: CY }, M);
  const walls = sightBlockersOf(scn);
  const steps = creepOf(candidate);
  const out = {};
  for (const c of controls) out[c.id] = { clearAt: null, onStageAt: 0, side: c.side, control: c.control };
  if (!controls.length) return out;
  for (let t = 0; t <= horizon; t += dt) {
    const eye = eyePoint(creepPose(sim.ego, t, steps));
    for (const c of controls) {
      if (out[c.id].clearAt != null) continue;
      if (visibility(eye, c, c, walls) === "clear") out[c.id].clearAt = t;
    }
  }
  return out;
}

/* Which control governs this candidate's own approach — the one they were
   required to read. */
export const ownControlOf = (sim, sightings) =>
  Object.values(sightings).find((c) => c.side === sim.ego.from) ?? null;

/* ---------------------------------------------------------------------
   Layer 2: when this driver actually registered them
   --------------------------------------------------------------------- */

/* Never-registered is not a special case: a delay longer than the road
   user stays relevant is the same thing, and falls out without one. */
export function registrationsIn(sim, scn, candidate, seed = 1, opts = {}) {
  const seen = opts.sightings ?? sightingsIn(sim, scn, { ...opts, candidate });
  const out = {};
  for (const [id, s] of Object.entries(seen)) {
    out[id] = s.clearAt == null ? null : s.clearAt + registrationDelay(candidate, id, seed);
  }
  return out;
}

/* Who this driver believes is out there at time t.

   Includes anybody still up the road: a road user who has not come on
   stage by t is approaching in plain sight, so not accounting for them is
   nobody's failure. Without this a perfect observer is surprised by
   traffic no observer could have missed. */
export function awarenessAt(sim, scn, candidate, t, seed = 1, opts = {}) {
  const seen = opts.sightings ?? sightingsIn(sim, scn, { ...opts, candidate });
  const reg = opts.registrations ?? registrationsIn(sim, scn, candidate, seed, { ...opts, sightings: seen });
  return sim.actors.filter((a) => {
    const s = seen[a.id];
    if (s && (s.onStageAt == null || s.onStageAt > t)) return true;
    return reg[a.id] != null && reg[a.id] <= t;
  });
}


/* =====================================================================
   CAUTION — the margin you leave for what you cannot see

   THIS IS THE RISKY TAIL OF CONFIDENCE, and it is where it always
   belonged. Departing the instant your KNOWN set is clear is not neutral
   behaviour: it is a driver with no humility about their own perception.
   The margin a driver leaves for traffic they have not accounted for IS
   overconfidence, expressed as a standing disposition rather than as a
   dice roll — and it gives the tail the markable, non-terminal expression
   it was missing. An overconfident driver takes gaps sized only to what
   they happened to register, so they are routinely tight and occasionally
   unlucky, rather than simply crashing.

   And it predicts the timid tail from the same parameter: too much
   caution is refused gaps and over-long waits. One quantity, two ends,
   which is what "two-tailed" has to mean if it is to mean anything.

   It composes with observation exactly as intended, giving three
   recognisably different drivers from two axes:

     poor observer, cautious  -> hesitant but safe
     good observer, bold      -> fast and mostly fine
     poor observer AND bold   -> the dangerous one
   ===================================================================== */

/* How long a driver adds for a FULLY blinded approach, and it is not a
   constant at all — it is the candidate's own time to clear the intersection,
   derived per scenario.

   The reasoning is the only one that does not need a number picked. If
   you cannot see a stretch of road, the way to become sure it is empty is
   to watch it for as long as anything hiding in it would take to reach
   you — and that is the same duration you need to be clear of the box
   before it arrives. One quantity doing both jobs rather than two that
   would drift apart.

   Measured across the set: 5.05s for a straight, 5.90s for a left, 7.65s
   through a roundabout. Nothing typed in. */
export function crossingTimeOf(sim, horizon = 20) {
  const d = sim.ego.departAt ?? 0;
  for (let t = d; t <= d + horizon; t += 0.05) {
    const po = poseAt(sim.ego, t);
    if (!po || po.gone) return t - d;
  }
  return horizon;
}

/* The whole of confidence in one number is `cautionOf` in core/driver.js,
   and it takes RATINGS, not a candidate. Re-exported. */
export { cautionOf };

/* The extra time this driver holds, at this instant, for road they cannot
   see. Zero at an intersection with a clear view whatever their confidence —
   caution is about known unknowns, so with nothing hidden there is
   nothing to be cautious ABOUT, and a bold driver at an open intersection is
   indistinguishable from a careful one. That is correct: overconfidence
   costs you where your view is poor. */
export function marginAt(sim, scn, candidate, t, opts = {}) {
  const allowance = opts.allowance ?? crossingTimeOf(sim);
  const unseen = unseenShare(sim, scn, t, candidate);
  return unseen * allowance * cautionOf(candidate?.ratings);
}

/* ---------------------------------------------------------------------
   The decision that follows from it
   --------------------------------------------------------------------- */

/* When this driver would go, believing only what they have registered.

   No dice roll for "takes a tight gap" anywhere. A driver who never
   registered the approaching car finds the road clear and goes; the
   encroachment is a CONSEQUENCE of an awareness the model already
   resolved, not an outcome sampled to produce it.

   A fixed point, because the two depend on each other: waiting longer
   means registering more, which may mean waiting longer still. It
   terminates because a departure can only move later, and it is clamped
   so a pathological case cannot loop.

   Exposed as a query. Wiring it into schedule() is R2.3, and deliberately
   separate: this file computes what the driver believes, and changing
   what the world does about it is a different change with its own
   measurement. */
/* =====================================================================
   RESPONDING WHILE TRAVELLING, not only at a decision point

   THE GAP THIS FILLS. Awareness governed the DEPARTURE decision and
   nothing else, so the candidate was a decision-maker at an intersection
   and a passive mover in between. On a link there was no mechanism by
   which a good observer drove differently from a poor one -- which means
   anticipation could not be demonstrated at all, which is why the
   avoidability fault class could not go live.

   THE RESPONSE IS DERIVED FROM THE SAME TWO THINGS AS THE DEPARTURE:
   what they have registered, and their ratings. A candidate who has
   registered a road user entering their path eases off from the moment
   they registered it; one who has not, does not. Nothing is scripted --
   whether they respond at all is decided by whether the danger ever
   reached them.

   HOW MUCH they ease is `cautionOf`, which is the whole of confidence in
   one number and already means "the margin this driver leaves". A bold
   driver eases nothing, the optimum eases moderately, a timid one eases
   hard. So the same axis that decides how big a gap they take decides how
   readily they lift off, which is what makes them one person.

   Resolved from the seed at composition time, like everything else, so
   ground truth stays replayable. */
export function responseOnAwareness(sim, scn, candidate, seed = 1, opts = {}) {
  const ego = sim.ego;
  const reg = opts.registrations ?? registrationsIn(sim, scn, candidate, seed, opts);

  /* The danger is a road user that was stationary and begins to move --
     the thing that has to be ANTICIPATED. One already travelling is
     ordinary traffic and the departure decision already covers it. */
  let soonest = null;
  for (const a of sim.actors) {
    if (!(a.emerges || a.stops)) continue;
    const at = reg[a.id];
    if (at == null) continue;                       // never registered: no response
    const onset = a.departAt ?? 0;
    const noticed = Math.max(at, onset + registrationDelay(candidate, a.id, seed));
    if (soonest == null || noticed < soonest) soonest = noticed;
  }
  if (soonest == null) return null;

  const eases = Math.max(0, Math.min(1, cautionOf(candidate?.ratings) / 2));
  if (eases <= 0) return null;                      // bold enough to press on
  return {
    from: Math.max(0, soonest - (ego.departAt ?? 0)),
    give: MOST_GIVE * eases,
    wait: 0,
    noticedAt: soonest,
  };
}

export function departureOnAwareness(sim, scn, candidate, seed = 1, opts = {}) {
  const seen = opts.sightings ?? sightingsIn(sim, scn, { ...opts, candidate });
  const reg = opts.registrations ?? registrationsIn(sim, scn, candidate, seed, { ...opts, sightings: seen });
  const ego = sim.ego;
  let t = ego.arriveAt ?? 0;
  for (let i = 0; i < 8; i++) {
    const known = awarenessAt(sim, scn, candidate, t, seed, { ...opts, sightings: seen, registrations: reg });
    /* Clear of what they know, PLUS what they hold back for what they
       cannot see. The margin is evaluated at the moment they are actually
       deciding, which is why it lives inside the fixed point rather than
       being added afterwards: a driver behind a queue sees less at the
       moment of decision than they did on arrival. */
    const next = earliestClear(ego, known, ego.arriveAt ?? 0)
      + marginAt(sim, scn, candidate, t, opts);
    if (next <= t + 1e-9) return t;
    t = next;
  }
  return t;
}

/* ---------------------------------------------------------------------
   Why was the stop wrong?  Three answers, both discriminators derived.
   --------------------------------------------------------------------- */

/* Where "controlled" stops and "abrupt" begins: twice the comfortable
   rate the approach geometry derives. Not a number picked to separate the
   traits that exist — an ordinary stop is at the comfortable rate by
   construction, and anything at double it is unmistakably not ordinary.
   Measured: a normal approach peaks at 2.70 m/s^2, harshStop at 8.10. */
export const ABRUPT_AT = 2 * (approachDecel(M(11.5)) / M(1));

/* THE MAINTAINER'S THREE-WAY SPLIT, and it needs no rule table because
   both discriminators are quantities the model already holds:

     registered the control, stopped smoothly, wrong place -> KNOWLEDGE
     registered the control, stopped abruptly              -> BRAKING
     did not register the control in time                  -> OBSERVATION

   The registration delay that separates observation from confidence for
   an encroachment does the same work here; the approach rewrite supplies
   the second discriminator, because the manner of a stop is a number now.

   "In time" means before they reached the line. A driver who only takes
   in the sign as they arrive at it did not read it in time to act on it,
   whatever they then did.

   Meaningful only where a stop actually went wrong — this says WHICH axis
   is answerable, not whether anybody is. */
export function causeOfStop(sim, scn, candidate, seed = 1, opts = {}) {
  const ego = sim.ego;
  if (ego.stops === false) return null;
  const arriveAt = ego.arriveAt ?? 0;

  const controls = opts.controls ?? controlSightingsIn(sim, scn, { ...opts, candidate });
  const own = ownControlOf(sim, controls);
  /* No control on their leg, or one they could never see: neither is the
     driver's failing. */
  if (!own || own.clearAt == null) return "unsighted";

  const registered = own.clearAt + registrationDelay(candidate, `ctl-${own.side}`, seed);
  if (registered > arriveAt) return "observation";

  let peak = 0;
  for (let t = 0; t <= arriveAt; t += DT) peak = Math.max(peak, approachDecelOf(ego, t));
  return peak >= ABRUPT_AT ? "braking" : "knowledge";
}

/* ---------------------------------------------------------------------
   Observation or confidence?  Mechanical, not a weight in a table.
   --------------------------------------------------------------------- */

/* THE CENTRE OF THE MODEL. A tight gap taken having registered the
   vehicle is a CONFIDENCE fault — they saw it and went anyway. The same
   gap taken without having registered it is an OBSERVATION fault — they
   never gathered the information. Same visible outcome, different cause,
   and a real examiner separates them.

   With layer 2 modelled this stops being an attribution weight and
   becomes a fact the model already holds: whether the candidate had
   registered that road user at the moment they committed.

   Note what is NOT consulted here: whether contact occurred, whether
   anybody had to brake, how bad the band was. Observation is scored on
   whether the information was gathered, full stop. Grading it by outcome
   would collapse it back into confidence and the axis would stop meaning
   anything. */
export function causeOf(sim, scn, candidate, who, committedAt, seed = 1, opts = {}) {
  const seen = opts.sightings ?? sightingsIn(sim, scn, { ...opts, candidate });
  const reg = opts.registrations ?? registrationsIn(sim, scn, candidate, seed, { ...opts, sightings: seen });
  const s = seen[who];
  if (!s || s.clearAt == null) return "unsighted";       // occluded: the scenario's doing
  if (s.clearAt > committedAt) return "unsighted";       // not yet in view when they committed
  const at = reg[who];
  return at == null || at > committedAt ? "observation" : "confidence";
}
