/* =====================================================================
   THE FIVE AXES — a driver as ratings, and errors derived from them

   A trait said WHAT a driver does wrong. A rating says what they are
   BAD AT, and which errors follow is worked out from that. The difference
   matters for the game rather than for tidiness: a rating is a standing
   disposition by construction, so identity stops being bolted onto the
   scenario model and becomes the model. Habits emerge instead of being
   scripted — a weak braking rating produces late braking again and again,
   across situations that look nothing alike, which is precisely the
   recurrence a player needs to form a hypothesis and then test it.

   TRAITS ARE NOT DELETED, THEY ARE COMPILED. The roll is resolved once,
   at composition time, from the scenario's own seed, and its output is
   the same list of trait keys a participant always carried. Everything
   below that line — schedule, poseAt, faultWindow's controlled comparison
   — is untouched. That is what keeps ground truth deterministic and
   replayable, and it is the whole reason this is cheap.

   The alternative, ratings bending behaviour continuously at simulation
   time, is the version to avoid: there would be no discrete thing to
   strip and no control to diff against, every driver would commit a
   continuum of micro-faults, and only POS_VISIBLE and MIN_DURATION would
   separate a fault from numerical noise.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { TRAIT_KEYS, rng } from "./index.js";
/* THE DRIVER MODEL ITSELF -- the five axes, what a deficit is, and how
   a driver is drawn -- lives in src/core/driver.js, because every car in
   the live traffic is composed by it. What stays here is the exam
   half: what causes what, and the compiler from ratings to traits.
   Re-exported so every engine caller is unchanged. */
import {
  AXES, CONFIDENT_ENOUGH, deficitOf,
  WEAK_AXES, WEAK_RANGE, SOUND_RANGE, COMPETENT_AT, LACKING_AT,
  soundnessOf, strengthsOf, lackingIn, WEAK_DEVIATION, SOUND_DEVIATION, composeDriver,
} from "../core/driver.js";
export {
  AXES, CONFIDENT_ENOUGH, deficitOf,
  WEAK_AXES, WEAK_RANGE, SOUND_RANGE, COMPETENT_AT, LACKING_AT,
  soundnessOf, strengthsOf, lackingIn, WEAK_DEVIATION, SOUND_DEVIATION, composeDriver,
};


/* ---------------------------------------------------------------------
   What causes what
   --------------------------------------------------------------------- */

/* THE ONE TABLE THIS FILE IS ALLOWED TO AUTHOR, and it is worth being
   explicit about why. Everywhere else the project refuses to write the
   answer down: a window is simulated, a fault is derived by controlled
   comparison, where a habit can show is asked of faultsIn rather than
   listed. But "why did that driver do that" is not recoverable from
   geometry at any price. It is a claim about people, so it is data, it is
   the maintainer's to rule on, and it is stated in one place rather than
   implied in several.

   WEIGHTED AND MULTI-AXIS, not one owner per fault. Measured across the
   set: only wander and wideTurn belong unambiguously to a single axis.
   An examiner watching a car stop past the line cannot tell braking from
   knowledge, and a model that forced the choice would be claiming more
   than the evidence supports. cutsCorner is the maintainer's own ruling —
   "a steering error, combined with a knowledge error" — and the shape of
   that ruling is why the whole table is a distribution.

   The same weights are read in both directions, deliberately. Generation
   asks "how likely is this driver to do this", attribution asks "what
   does this fault say about them". Two tables would drift apart the first
   time either was tuned. */
export const CAUSES = {
  wander: { steering: 1 },
  wideTurn: { steering: 1 },
  /* Maintainer's ruling: steering combined with knowledge. You placed the
     car badly AND you did not know how far into the intersection a left is
     supposed to go. */
  cutsCorner: { steering: 0.6, knowledge: 0.4 },
  /* RULED, and it flipped. The maintainer's discriminator is the MANNER
     of the stop, not its position: a CONTROLLED stop in the wrong place
     is a knowledge gap — not knowing where to stop, or not understanding
     why the stopping point matters — while an ABRUPT stop, before or
     after the line, is braking control.

     As modelled, overshoot moves the resting point and leaves the manner
     alone, so it is the controlled case and it is knowledge-dominant. The
     abrupt case cannot be built yet: every approach in the game
     decelerates at 18.1 m/s^2, so there is no controlled stop for an
     abrupt one to be abrupt relative to. See CLAUDE.md. */
  overshoot: { knowledge: 0.7, braking: 0.3 },
  slowStart: { confidence: 1 },
  creep: { confidence: 1 },
  lateSignal: { knowledge: 1 },
  /* R2.5. Three kinds added against MEASURED gaps rather than picked from
     a list of plausible driving errors: knowledge dominated one fault and
     braking dominated one, so neither could be isolated by a player, and
     the rolling stop owned every residual collision the reaction layer
     could not prevent. */
  /* "A particularly poorly skilled driver would have to be completely
     unable to make their stop due to lack of control to make this
     anything other than a failure to obey traffic law." Overwhelmingly
     knowledge, with control as a rare extreme rather than a partner. */
  rollingStop: { knowledge: 0.9, braking: 0.1 },
  /* The ABRUPT cases, which the approach rewrite made expressible. Manner
     rather than position, so these are braking where overshoot and
     stopsShort are knowledge. */
  harshStop: { braking: 1 },
  brakesTooLate: { braking: 0.8, knowledge: 0.2 },
  noSignal: { knowledge: 1 },
  /* The same ruling: stopping short is a stop in the wrong place, and as
     modelled it is a controlled one. Knowledge, with the same small
     control share overshoot carries. */
  stopsShort: { knowledge: 0.7, braking: 0.3 },
};

/* Which tail of confidence a fault belongs to, where it has one. Every
   confidence fault the game can currently derive is on the TIMID side;
   there is no risky-tail fault at all, which is measured rather than
   assumed and is the largest content gap in the model. See
   verify-candidate.mjs section 8.

   OBSERVATION dominates nothing yet either, and that is honest rather
   than an oversight: it expresses through awareness rather than through
   any of the seven path-and-signal traits, so its faults are R2.5 content
   and it reports as a measured gap until they exist. */
export const TAIL = { slowStart: -1, creep: -1 };

/* How much of a fault each axis is answerable for, normalised. This is
   what a debrief reads: not "they cut a corner" but "0.6 of that was
   steering and 0.4 was not knowing where the corner is". */
export function attributionOf(kind) {
  const w = CAUSES[kind];
  if (!w) return {};
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const [axis, weight] of Object.entries(w)) out[axis] = weight / total;
  return out;
}

/* The axis a fault is mostly about. An axis becomes ATTRIBUTABLE only
   through faults it dominates: if knowledge never appears except as a
   junior partner to steering or braking, every knowledge signal arrives
   entangled and the player can never isolate it, however many faults
   touch the axis. */
export function dominantAxis(kind) {
  const a = attributionOf(kind);
  let best = null, top = 0;
  for (const [axis, share] of Object.entries(a)) if (share > top) { top = share; best = axis; }
  return best;
}

/* How likely this driver is to commit this error, 0..1, before any
   situation is considered. A fault draws on the axes that cause it, in
   proportion — so a driver weak at braking and fine on the rules is
   fairly likely to overshoot, and one weak at both is likelier still. */
export function likelihoodOf(kind, ratings) {
  const w = CAUSES[kind];
  if (!w) return 0;
  const need = TAIL[kind];
  let sum = 0, total = 0;
  for (const [axis, weight] of Object.entries(w)) {
    const { deficit, tail } = deficitOf(ratings, axis);
    /* A timid driver does not commit a risky driver's errors, and the
       reverse. Being off the optimum in the wrong direction is not a
       weaker version of this fault, it is a different fault. */
    if (need && axis === "confidence" && tail !== need) return 0;
    sum += weight * deficit;
    total += weight;
  }
  return total ? sum / total : 0;
}

/* ---------------------------------------------------------------------
   The compiler
   --------------------------------------------------------------------- */

/* How readily a full deficit becomes an actual error. A driver rated 0 on
   an axis is not certain to err at every single opportunity — real bad
   drivers get away with things — so this is under 1 on purpose. It is a
   rate, calibrated against what the trait model produced so the world's
   supply does not move underneath the change, and measured rather than
   asserted in verify-candidate.mjs. */
export const ERROR_SCALE = 0.85;

/* Ratings plus a situation plus a seed, in; the trait keys the candidate
   will carry through that scene, out. Pure, total, and resolved ONCE at
   composition time — never at simulation or render time, or the marking
   sheet's ground truth would materialise differently on a re-run and take
   the scoring and the whole verify suite with it.

   `available` is what this situation could show at all, which the caller
   derives (chancesAt). Rolling only against those means the compiler
   never proposes an error the intersection has no room for; the engine still
   has the last word on whether what it proposed actually shows. The
   compiler proposes, faultsIn disposes.

   PACING DELIBERATELY DOES NOT REACH IN HERE. The brief's faultRate still
   steers other road users, because that is a supply lever. The candidate's
   own error rate belongs to the candidate, or observed frequency would be
   reporting the pacing budget rather than the driver — and then a player
   who counted errors would be reading the wrong thing. Pacing steers how
   many opportunities the drive presents; it never steers whether this
   driver takes them. */
export function rollErrors(ratings, available, seed, { scale = ERROR_SCALE, allow = null } = {}) {
  const r = rng(seed);
  const out = [];

  /* ONE ROLL PER AXIS, NOT ONE PER FAULT KIND, and this is a correctness
     fix rather than a tuning choice. Rolling each available kind
     independently made the number of faults a candidate commits a
     function of HOW MANY KINDS THE GAME HAS VOCABULARY FOR: every kind
     added to CAUSES raised the density for every driver. Measured across
     R2.5 — 1.11 faults per intersection at seven kinds, 1.57 at ten, 2.0 at
     twelve, which took the section implied by a 3-4 recall band down to
     1.5 intersections. That is not a section, and the fix is not a smaller
     scale.

     A driver's deficit decides HOW MUCH they err; the vocabulary decides
     WHICH WAY. So the roll is per axis they could fail on here, and the
     kind is then drawn from that axis weighted by how likely each is.
     Density becomes a property of the driver, which is what it always
     claimed to be — and it stays put as R2 keeps adding content.

     It also delivers "variety over volume" by construction: at most one
     fault per axis per intersection, so a candidate weak on two axes shows at
     most two things here and they are two DIFFERENT things. */
  const byAxis = new Map();
  for (const kind of available) {
    const like = likelihoodOf(kind, ratings);
    if (like <= 0) continue;
    const axis = dominantAxis(kind);
    if (!axis) continue;
    if (!byAxis.has(axis)) byAxis.set(axis, []);
    byAxis.get(axis).push({ kind, like });
  }

  /* AXES in order, so the draw does not depend on Map insertion order and
     therefore on which kinds this situation happened to offer. */
  for (const axis of AXES) {
    const kinds = byAxis.get(axis);
    if (!kinds) continue;
    /* How likely this driver is to fail on this axis at all: the best
       chance any of its kinds gives them, so adding a kind cannot make a
       driver worse at an axis they were already going to fail. */
    const chance = Math.max(...kinds.map((k) => k.like)) * scale;
    if (r() >= chance) continue;
    /* Which way it goes, weighted. */
    const total = kinds.reduce((a, k) => a + k.like, 0);
    let pick = r() * total;
    for (const k of kinds) {
      pick -= k.like;
      if (pick <= 0) {
        if (!allow || allow(out, k.kind)) out.push(k.kind);
        break;
      }
    }
  }
  return out;
}


/* What a drive's faults said about the driver, per axis: evidence weight,
   how much of it came from faults the axis DOMINATES, and how many
   distinct kinds of error it spoke through.

   The last two are the ones that decide whether a player could ever have
   read the axis. Entangled evidence does not accumulate into an
   inference — an axis needs faults where it is the primary cause, and at
   least two distinct kinds of them, or every signal it sends arrives
   wearing another axis's clothes. */
export function axisEvidence(faults) {
  const rows = {};
  for (const a of AXES) rows[a] = { axis: a, weight: 0, dominant: 0, kinds: new Set(), dominantKinds: new Set() };
  for (const f of faults) {
    const share = attributionOf(f.trait);
    const boss = dominantAxis(f.trait);
    for (const [axis, s] of Object.entries(share)) {
      if (!rows[axis]) continue;
      rows[axis].weight += s * (f.duration ?? 1);
      rows[axis].kinds.add(f.trait);
      if (axis === boss) {
        rows[axis].dominant += s * (f.duration ?? 1);
        rows[axis].dominantKinds.add(f.trait);
      }
    }
  }
  return AXES.map((a) => ({
    ...rows[a],
    kinds: [...rows[a].kinds],
    dominantKinds: [...rows[a].dominantKinds],
  }));
}

/* Which errors exist for each axis at all, ignoring any driver or any
   situation. A standing property of the fault vocabulary rather than of a
   drive, and the thing R2's content work has to move. */
export function vocabularyByAxis() {
  const rows = {};
  for (const a of AXES) rows[a] = { axis: a, kinds: [], dominates: [], tails: new Set() };
  for (const kind of TRAIT_KEYS) {
    const share = attributionOf(kind);
    const boss = dominantAxis(kind);
    for (const axis of Object.keys(share)) {
      if (!rows[axis]) continue;
      rows[axis].kinds.push(kind);
      if (axis === boss) rows[axis].dominates.push(kind);
    }
    if (TAIL[kind] && rows.confidence) rows.confidence.tails.add(TAIL[kind]);
  }
  return AXES.map((a) => ({ ...rows[a], tails: [...rows[a].tails] }));
}
