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
import { earliestClear, rng } from "./index.js";
import { REACTION_FLOOR } from "./score.js";
import { whatEgoSees, sightBlockersOf } from "./sight.js";
import { deficitOf } from "./ratings.js";

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
export function departureOnAwareness(sim, scn, candidate, seed = 1, opts = {}) {
  const seen = opts.sightings ?? sightingsIn(sim, scn, { ...opts, candidate });
  const reg = opts.registrations ?? registrationsIn(sim, scn, candidate, seed, { ...opts, sightings: seen });
  const ego = sim.ego;
  let t = ego.arriveAt ?? 0;
  for (let i = 0; i < 8; i++) {
    const known = awarenessAt(sim, scn, candidate, t, seed, { ...opts, sightings: seen, registrations: reg });
    const next = earliestClear(ego, known, ego.arriveAt ?? 0);
    if (next <= t + 1e-9) return t;
    t = next;
  }
  return t;
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
