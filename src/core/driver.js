/* =====================================================================
   CORE -- a driver: five axes, a character, and load

   What the live simulator and the shelved engine both stand on. It
   imports nothing from src/engine/ or src/sim/, so the live screens
   can use it without the old engine in their closure (checked in
   verify-core.mjs).

   Moved here verbatim on 24 September from engine/ratings.js,
   engine/directions.js and engine/index.js. The old home
   imports and re-exports it, so there is still one definition.
   ===================================================================== */
import { rng } from "./rng.js";

/* OBSERVATION is not a peer of the other four and the ordering says so.
   They govern what the candidate DOES with what they perceived; it
   governs what they perceived at all. Concretely it is the parameter that
   degrades whatEgoSees down to what this driver actually registered —
   see awareness.js — and the other four then act on that degraded result.

   Different layer, so it does not compete with them to explain the same
   fault. The discipline that keeps it clean: observation is whether the
   information was GATHERED; confidence is what they did with it, or
   without it. A driver who looked properly and still took a tight gap has
   a confidence problem; one who never looked and got away with it has an
   observation problem. Same visible outcome, different cause, and with
   awareness modelled the model can tell which — see causeOf.

   Never score observation by outcome. The moment "didn't see the van" is
   graded by whether contact occurred, it collapses back into confidence
   and the axis stops meaning anything. */
export const SKILLS = ["observation", "confidence", "steering", "braking", "knowledge"];

/* KNOWLEDGE AND COMPLIANCE ARE TWO AXES (R2-DESIGN.md 17, the maintainer's
   ruling of 25 September): "well experienced drivers may know they are
   required to fully stop for a right turn on a red, but will roll through
   anyways. a new driver might not know that they can't do that and instead
   think it's right." KNOWLEDGE is whether they know the rule -- a scalar
   checked against how hard each kind of sign is (`reads`, below).
   COMPLIANCE is whether they follow a rule they know -- a standing
   disposition, a scalar like steering and braking.

   Compliance is not one of the SKILLS a learner's profile draws its
   weaknesses from, and that is the ruling's second half rather than a
   convenience: regular traffic knows the rules and varies in whether it
   bothers, learners are patchy on knowledge and usually trying hard. So it
   is drawn beside the profile, from its own stream -- which also leaves
   every driver drawn before this exactly the driver drawn now on the five
   skills, so what the split moved is the split alone. */
export const AXES = [...SKILLS, "compliance"];

/* EVERY SIGN CARRIES A DIFFICULTY, AND A DRIVER'S KNOWLEDGE IS CHECKED
   AGAINST IT (the maintainer, 30 September: "what if there was a sign
   difficulty level for each sign and the knowledge stat was a check
   against it? think of a complex highway exit sign, or a complicated
   downtown parking sign?"). Nobody misunderstands a stop sign and
   everybody has misread a parking sign: the variance in what drivers know
   is in the complicated rules, not spread evenly across them. R2-DESIGN 17
   records why this replaced a per-rule set drawn at random.

   DIFFICULTY is per kind of sign -- or of rule a driver meets without one
   -- a flagged design scale for the maintainer, 0 trivial to 1 only the
   best-informed read it right. A particular sign on the map may carry its
   own (`difficulty` on the sign), so a confusing sign in a confusing place
   is authored difficulty without touching a single driver. Only kinds the
   simulator can express a misreading of are here:
     stop            a stop sign -- misread, the driver rolls it;
     yield           misread, the approach is to them uncontrolled;
     no-left-turn    a symbol; listed, its misreading not yet expressible
                     (the graph removes the left the driver would take);
     no-right-on-red misread, a right on red after stopping;
     right-on-red    no sign: turning right on a red means a full stop
                     first -- misread, they roll it (the maintainer's own
                     example of what a new driver may not know);
     keep-right      no sign on these roads: out of the curb lane only to
                     pass or turn -- misread, they never go back. */
export const DIFFICULTY = {
  "stop": 0.02,
  "no-left-turn": 0.05,
  "yield": 0.10,
  "no-right-on-red": 0.25,
  "keep-right": 0.30,
  "right-on-red": 0.35,
};
/* HOW WELL A KIND OF SIGN HAS STUCK WITH THIS DRIVER: one draw per driver
   per KIND, never per encounter -- knowledge is consistent (a driver who
   reads a kind reads it every time), compliance is what is situational,
   and a re-roll per sign would make one blur into the other. The draw
   scales the difficulty between STUCK's ends, so a driver reads a sign
   when knowledge >= difficulty x (0.5 .. 1.5): a difficulty-0 sign is read
   by everybody, and a harder instance of a kind is failed by every driver
   who fails an easier one, and more. */
export const STUCK = [0.5, 1.5];
export const stuckFor = (r) => Object.fromEntries(Object.keys(DIFFICULTY).map((k) => [k, r()]));
export function reads(d, kind, difficulty = DIFFICULTY[kind]) {
  /* A kind with no difficulty is a misspelling, not an easy sign: read as
     0 it made every driver read it, silently (a check asking about
     "keepRight" after the rule became "keep-right" classed drivers who
     cannot read it as sound). */
  if (difficulty == null) throw new Error(`reads: no difficulty for sign kind "${kind}"`);
  if (d?.player) return true;
  const k = d?.ratings?.knowledge ?? 1;
  const u = d?.stuck?.[kind] ?? 0.5;
  return k >= difficulty * (STUCK[0] + (STUCK[1] - STUCK[0]) * u);
}
export const knows = (d, kind) => reads(d, kind);

/* Confidence is TWO-TAILED and the other three are not, which is the
   thing that makes a driver read as a person rather than a set of
   sliders. Too little produces hesitation, refused gaps and over-cautious
   creeping; too much produces gaps taken too tight, late commitment and
   observation skipped. Steering, braking and knowledge are monotonic —
   more is simply better, and there is no such thing as steering too well.

   So confidence is held as a POSITION with an optimum in the middle and
   measured as deviation from it, never as a quantity. Two candidates can
   then fail in opposite directions on one axis, which no monotonic rating
   can express and which two separate traits could only fake. */
export const CONFIDENT_ENOUGH = 0.5;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/* How far off the mark this driver is on one axis, and — for confidence
   only — which side they are off on. `tail` is -1 timid, +1 risky, 0 for
   an axis that has no sides. */
export function deficitOf(ratings, axis) {
  const v = ratings?.[axis];
  if (v === undefined || v === null) return { deficit: 0, tail: 0 };
  if (axis !== "confidence") return { deficit: clamp01(1 - v), tail: 0 };
  const off = v - CONFIDENT_ENOUGH;
  const span = off < 0 ? CONFIDENT_ENOUGH : 1 - CONFIDENT_ENOUGH;
  return {
    deficit: span > 0 ? clamp01(Math.abs(off) / span) : 0,
    tail: off < 0 ? -1 : off > 0 ? 1 : 0,
  };
}

/* ---------------------------------------------------------------------
   Drawing a driver
   --------------------------------------------------------------------- */

/* A CANDIDATE HAS A CHARACTER: weak on one or two axes, sound on the
   rest. Not a uniformly poor driver, and not a uniformly good one —
   either is equally uninformative to examine, because the player's real
   task is assembling a picture of a person rather than counting
   incidents.

   Three faults spread across three axes make a more interesting drive
   than six from one, so the shape of the distribution matters more than
   how far down it reaches. That is why this draws a PROFILE — pick the
   weaknesses, then fill in — rather than sampling each axis
   independently, which produced drivers who were slightly bad at
   everything and identifiable as nothing.

   Weakness on confidence means deviation from the optimum in EITHER
   direction, since that axis has no bad end and no good one, only a
   middle. So a confident-weak candidate is bold or timid, drawn, and the
   other four are simply low. */
export const WEAK_AXES = [1, 2];
export const WEAK_RANGE = [0.15, 0.5];
export const SOUND_RANGE = [0.8, 1.0];

/* EVERY CANDIDATE HAS A REAL STRENGTH AND A REAL WEAKNESS. Maintainer's
   ruling: "drivers will generally have at least developed skill even if
   they are desperately lacking in others." True of real learners, and it
   does work for the game — a strength is the contrast the player reads
   the weakness against, so "bad at everything" stops being the shape of
   every difficult drive.

   The converse is enforced too, because a candidate worth examining needs
   something to FIND as well as something to rule out. A drive where the
   answer is "nothing" teaches the player only that the answer is
   sometimes nothing.

   Both fall out of drawing 1-2 weaknesses from five axes, so they held
   before they were stated. They are named and checked so that a later
   change to WEAK_AXES or the ranges cannot quietly break them. */
export const COMPETENT_AT = 0.75;
export const LACKING_AT = 0.5;

/* How sound this driver is on an axis, 0..1, with confidence's deviation
   folded in so the five are comparable. */
export const soundnessOf = (ratings, axis) => 1 - deficitOf(ratings, axis).deficit;
export const strengthsOf = (d) => AXES.filter((a) => soundnessOf(d?.ratings, a) >= COMPETENT_AT);
export const lackingIn = (d) => AXES.filter((a) => soundnessOf(d?.ratings, a) <= LACKING_AT);
/* How far from the optimum confidence sits, as a share of the distance to
   its end, when it is a weakness and when it is not. */
export const WEAK_DEVIATION = [0.55, 1.0];
export const SOUND_DEVIATION = [0, 0.25];

const span = (r, [lo, hi]) => lo + r() * (hi - lo);

/* A TOWN is a distribution over the axes, not a driver (DRIVING-SCHOOL.md
   section 3): `town.weights` makes some axes likelier to be the weak one,
   `town.bold` is the share of weak confidence that falls on the bold side.
   With no town every axis weighs 1 and bold is one half, and the pick below
   reduces EXACTLY to the uniform one it replaced -- the same draw from the
   same number -- so every driver drawn before is the driver drawn now. */
export function composeDriver(seed = 1, town = null) {
  const r = rng(seed);
  const bag = [...SKILLS];
  const n = WEAK_AXES[0] + Math.floor(r() * (WEAK_AXES[1] - WEAK_AXES[0] + 1));
  const weak = new Set();
  const weightOf = (a) => town?.weights?.[a] ?? 1;
  for (let i = 0; i < n && bag.length; i++) {
    const total = bag.reduce((s, a) => s + weightOf(a), 0);
    let left = r() * total, at = bag.length - 1;
    for (let j = 0; j < bag.length; j++) { if (left < weightOf(bag[j])) { at = j; break; } left -= weightOf(bag[j]); }
    weak.add(bag.splice(at, 1)[0]);
  }

  const ratings = {};
  for (const axis of SKILLS) {
    if (axis === "confidence") {
      const side = r() < 1 - (town?.bold ?? 0.5) ? -1 : 1;
      const dev = span(r, weak.has(axis) ? WEAK_DEVIATION : SOUND_DEVIATION);
      const half = side < 0 ? CONFIDENT_ENOUGH : 1 - CONFIDENT_ENOUGH;
      ratings[axis] = clamp01(CONFIDENT_ENOUGH + side * dev * half);
    } else {
      ratings[axis] = clamp01(span(r, weak.has(axis) ? WEAK_RANGE : SOUND_RANGE));
    }
  }
  /* Compliance and the rules, from a second stream (see AXES). */
  const r2 = rng((Math.imul(seed >>> 0, 0x9e3779b1) ^ 0x85ebca6b) >>> 0);
  if (r2() < shareAt(COMPLY_WEAK, town?.weights?.compliance ?? 1)) weak.add("compliance");
  ratings.compliance = clamp01(span(r2, weak.has("compliance") ? WEAK_RANGE : SOUND_RANGE));
  return { id: `drv-${seed >>> 0}`, ratings, weakOn: [...weak], stuck: stuckFor(r2), skill: 1 };
}

/* HOW OFTEN COMPLIANCE IS SOMEBODY'S WEAKNESS: as often as any one skill
   is, in an ordinary place -- the profile's mean number of weak axes over
   the skills it draws from, 0.3. Derived, not chosen, so "compliance is as
   common a failing as any other" holds by construction. A town's weight on
   it acts on the odds, the same pull TOWN_PULL has on a skill (at 6: about
   seven in ten). */
export const COMPLY_WEAK = (WEAK_AXES[0] + WEAK_AXES[1]) / 2 / SKILLS.length;
const shareAt = (p, w) => (w * p) / (w * p + 1 - p);



/* 1 at the optimum, 0 when maximally bold, 2 when maximally timid. The
   whole of confidence, in one number.

   It takes RATINGS. There used to be two: this one in engine/awareness.js
   taking a candidate, and a copy in sim/traffic.js taking ratings, kept
   only because importing the first dragged most of the old engine along.
   With core that reason is gone, so the copy is -- and a candidate passed
   where ratings are expected would read as perfectly ordinary, so every
   caller hands over `.ratings` explicitly. */
export function cautionOf(ratings) {
  const { deficit, tail } = deficitOf(ratings, "confidence");
  if (tail > 0) return Math.max(0, 1 - deficit);   // bold: less margin
  if (tail < 0) return 1 + deficit;                // timid: more
  return 1;
}

/* ---------------------------------------------------------------------
   Load: what carrying instructions costs, and how badly a habit shows
   --------------------------------------------------------------------- */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* What each extra instruction the candidate is holding costs them, and
   how much composure is on the table at full load. Both are tunable and
   both are deliberately measured rather than asserted — verify-directions
   reports what stacking actually does to fault size, so these can be set
   against an observed consequence instead of a feeling. */
export const PRESSURE_PER_EXTRA = 0.34;
export const SKILL_UNDER_LOAD = 0.6;

export function pressureOf(held) {
  return clamp(Math.max(0, held) * PRESSURE_PER_EXTRA, 0, 1);
}

export function skillUnderPressure(base = 1, pressure = 0) {
  return clamp(base - pressure * SKILL_UNDER_LOAD, 0, 1);
}

/* =====================================================================
   DRIVER SKILL

   A driver's composure right now, 0..1, where 1 is this driver at their
   best. Skill does NOT decide which faults a driver has — their traits
   do that, and a trait is a habit rather than a mistake. Skill decides
   how badly the habit shows.

   Kept as a multiplier anchored at 1 so `skill` absent, or 1, reproduces
   every existing scenario exactly. Nothing in the shipped set sets it,
   and nothing in the shipped set moves.

   The reason this exists: the examiner may stack directions to buy back
   their own attention, and stacking loads the candidate. A loaded driver
   is a worse driver. See directions.js, where that trade is measured.

   Note for whoever wires pressure into a live drive: the `pose` traits
   below read skill at pose time, so they respond immediately, but the
   `setup` traits are applied once in schedule(). Changing skill mid-drive
   means re-scheduling, not mutating a participant in place.            */
export const SKILL_SPAN = 1.0;
export const severityOf = (p) => 1 + (1 - (p.skill ?? 1)) * SKILL_SPAN;
