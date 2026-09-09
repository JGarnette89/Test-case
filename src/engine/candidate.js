/* =====================================================================
   THE CANDIDATE — one driver, across a whole drive

   Half the real job is identifying a driver's habits, and until now the
   game made that impossible in the most basic way. Measured across 320
   generated intersections: the candidate carried no traits at all and
   committed zero faults. All 143 faults on offer belonged to some other
   road user. There was no driver to read.

   NO THIRD WORD FOR IT. The engine already calls a standing disposition a
   TRAIT, and this file does not rename it — a trait is the disposition, a
   SHOWING is one occasion it visibly expressed, and a habit is a trait
   with several showings. That last one is a derived property of a drive,
   not a field on anybody, which is the finding: the trait model could
   already express a standing disposition perfectly well. What was missing
   was a world that gave one repeated chances.

   THE REQUIREMENT IS STRONGER THAN PERSISTENCE. A trait that manifests
   once is an incident. For a player to identify a tendency they have to
   form a hypothesis and then test it, so a trait needs several chances
   inside one drive — and, just as much, the RIVAL traits need chances
   they visibly decline to take. Both fall out of one fact and need no
   separate machinery: a left turn is where cutsCorner would show, so a
   left turn where nothing happens is evidence AGAINST cutsCorner. One
   intersection speaks to every hypothesis it has the shape to speak to. See
   chancesAt and habitReport.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { TRAIT_KEYS, rng } from "./index.js";
import { faultsIn } from "./faults.js";
import { crossSpec } from "./road.js";
import { rollErrors, likelihoodOf } from "./ratings.js";

/* How many showings before a tendency reads as a tendency.

   Not a tuning knob. One showing is an incident; two is a coincidence a
   player is entitled to distrust; three is where a hypothesis has been
   formed, tested and confirmed. Held as a stated target and MEASURED, the
   way DEAD_AIR_CEILING is — a threshold moved to fit a result stops being
   a measurement. */
export const SHOWINGS_FOR_A_HABIT = 3;

/* How many traits one candidate carries. A driver with six tendencies is
   noise rather than a character, and a driver with none gives the player
   nothing to be right about — but some candidates SHOULD be clean, or
   "there is always something" becomes the winning assumption and the
   player stops looking for the answer they are being asked for. */
export const TRAITS_PER_CANDIDATE = [1, 2];
export const CLEAN_SHARE = 0.15;

/* ---------------------------------------------------------------------
   Composing a driver
   --------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   Habits that cannot coexist
   --------------------------------------------------------------------- */

/* A driver cannot both swing wide through a corner and cut inside it, and
   the engine already says so without being asked: wideTurn and cutsCorner
   write the same turnBias, so fitting both leaves one of them with
   nothing to be blamed for. faultWindow strips one trait at a time, and
   stripping the loser changes nothing — so it derives no fault, and the
   habit becomes one the player can never identify and the debrief would
   name anyway.

   Found the hard way: a candidate carrying both reported wideTurn as
   0 showings from 5 chances while cutsCorner took all five.

   DERIVED, not listed. Two habits are incompatible when fitting both
   hides either — the same controlled comparison the whole fault model
   rests on, asked of a pair instead of a single trait. A new trait that
   writes over an old one is caught here on its first draw rather than
   shipping as a habit that never shows. Measured today: exactly one pair,
   wideTurn + cutsCorner. */
const MASK_CACHE = new Map();

/* The most permissive shape there is — a stop, a left, and traffic to be
   held by. Every trait shows here alone, so anything that vanishes when a
   second is fitted vanished because of that second. */
const maskScene = (traits) => {
  const scn = probeScene({ stops: true, intent: "left", prior: true });
  return { ...scn, ego: { ...scn.ego, traits } };
};

export function masks(a, b) {
  if (a === b) return false;
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  const hit = MASK_CACHE.get(key);
  if (hit !== undefined) return hit;
  const shown = new Set(
    faultsIn(maskScene([a, b]), 20).filter((f) => f.who === "ego").map((f) => f.trait)
  );
  const bad = !shown.has(a) || !shown.has(b);
  MASK_CACHE.set(key, bad);
  return bad;
}

export const compatibleWith = (traits, t) => !traits.some((x) => masks(x, t));

/* One driver, decided once, for the whole drive. `skill` is their
   composure right now — the dial directions.js already turns when the
   examiner stacks instructions — carried here so a drive has ONE thing to
   turn rather than a fresh ego per intersection to chase. */
export function composeCandidate(seed = 1, { pool = TRAIT_KEYS, forceTraits = null } = {}) {
  const id = `cand-${seed >>> 0}`;
  if (forceTraits) return { id, traits: [...forceTraits], skill: 1 };

  const r = rng(seed);
  if (r() < CLEAN_SHARE) return { id, traits: [], skill: 1 };

  const [lo, hi] = TRAITS_PER_CANDIDATE;
  const n = lo + Math.floor(r() * (hi - lo + 1));
  const bag = [...pool];
  const traits = [];
  while (traits.length < n && bag.length) {
    const t = bag.splice(Math.floor(r() * bag.length) % bag.length, 1)[0];
    /* A habit that would be hidden by one already fitted is not a second
       habit, it is a habit the player is asked to spot and never can. */
    if (compatibleWith(traits, t)) traits.push(t);
  }
  return { id, traits, skill: 1 };
}

/* What this driver will carry through THIS scene.

   A candidate defined by ratings has their errors compiled here, once,
   from the scenario's own seed — so the same driver in the same situation
   produces the same faults on every replay, which is what the marking
   sheet's ground truth and the whole verify suite depend on. A candidate
   defined by traits keeps them verbatim, so every hand-authored scenario
   and the golden fingerprint are untouched and the two models coexist.

   `prior` is taken to follow `stops`: a driver who stops at a intersection
   generally has somebody to be held by, and one rolling down a segment
   does not. It is the same assumption the planner makes, and the compiler
   only PROPOSES — a fault it proposes that the scene has no room for
   simply never derives. */
export function traitsForScene(candidate, { intent = "straight", stops = true, seed = 1 } = {}) {
  if (!candidate?.ratings) return [...(candidate?.traits || [])];
  const available = chancesAt(shapeOf({ stops, intent, prior: stops }));
  return rollErrors(candidate.ratings, available, seed, { allow: compatibleWith });
}

/* The candidate as a participant. Everything the engine needs to drive
   them lives here, so a intersection and a segment ask for the SAME driver
   rather than each inventing one — which is what they did before, one by
   composing a flawless ego and the other by taking traits from whoever
   called it. */
export function egoFor(candidate, { from, intent, arriveAt = 1.6, stops = true, lane = 0, seed = 1 } = {}) {
  return {
    from,
    intent,
    arriveAt,
    stops,
    lane,
    colorKey: "blue",
    traits: traitsForScene(candidate, { intent, stops, seed }),
    ...(candidate?.skill !== undefined && candidate.skill !== 1 ? { skill: candidate.skill } : {}),
    /* A driver signals their own intent. Without one there is no
       indicator for lateSignal to be late with — measured: the trait was
       silent in every shape until the ego was given a signal to give. */
    signal: intent && intent !== "straight" ? intent : null,
  };
}

/* ---------------------------------------------------------------------
   Where a trait can show — the same oracle, asked a cheaper question
   --------------------------------------------------------------------- */

/* A SHAPE is the little that decides whether a trait has anything to say:
   does the driver stop, which way do they go, and is there anyone with
   priority to hold them. Nothing else about a intersection changes the
   answer, which is why this is cheap enough to ask per plan step.

   Deliberately NOT a table. Writing down "cutsCorner needs a left" would
   author the answer in the one place this project has always refused to,
   and it would go stale the first time a trait changed. This builds the
   smallest scene that has the shape and asks faultsIn — the identical
   derivation the scorer grades against. A cheaper call to the same
   oracle, not a second oracle. Cached because the shape space is twelve
   entries wide and the answers never move. */
const CHANCE_CACHE = new Map();

const probeScene = ({ stops, intent, prior }) => ({
  id: "probe",
  road: crossSpec(stops ? "stop" : "none", 1),
  control: stops ? "stop" : "none",
  duration: 20,
  ego: {
    from: "S",
    intent,
    arriveAt: 1.2,
    stops,
    signal: intent === "straight" ? null : intent,
  },
  /* Two of them, spaced, because `creep` needs the candidate to actually
     be HELD and a single crossing car is gone before they are ready. That
     was not obvious: creep read as inert in every shape until the probe
     gave it something to wait for, which is precisely the class of wrong
     answer a hand-written table would have frozen in. */
  actors: prior
    ? [
        { id: "h1", from: "W", intent: "straight", arriveAt: 1.4, stops: false, kind: "car", priority: -3 },
        { id: "h2", from: "W", intent: "straight", arriveAt: 4.6, stops: false, kind: "car", priority: -2 },
      ]
    : [{ id: "far", from: "N", intent: "straight", arriveAt: 16, stops: false, kind: "car" }],
});

export const shapeOf = ({ stops = true, intent = "straight", prior = true } = {}) => ({ stops, intent, prior });

/* Every trait this shape could show, whoever is driving. The full set
   matters as much as the candidate's own: these are the hypotheses this
   intersection can speak to, and the ones it declines are the ones it rules
   out. */
export function chancesAt(shape) {
  const key = `${shape.stops ? 1 : 0}${shape.prior ? 1 : 0}${shape.intent}`;
  const hit = CHANCE_CACHE.get(key);
  if (hit) return hit;
  const out = [];
  for (const t of TRAIT_KEYS) {
    const scn = probeScene(shape);
    scn.ego = { ...scn.ego, traits: [t] };
    if (faultsIn(scn, 20).some((f) => f.who === "ego" && f.trait === t)) out.push(t);
  }
  CHANCE_CACHE.set(key, out);
  return out;
}

/* ---------------------------------------------------------------------
   What a drive actually did with them
   --------------------------------------------------------------------- */

/* What THIS scene could have shown, whoever was driving it: put each
   trait on the ego in turn and ask whether it visibly expresses. A
   counterfactual on the real intersection, not a forecast of one.

   TWO FUNCTIONS, TWO QUESTIONS -- not two answers to one. chancesAt is
   asked before a scene exists, by a planner choosing an intent, and can
   only reason about the shape. chancesIn is asked afterwards, of the
   scene itself, and is the truth: it knows the candidate was held eleven
   seconds by traffic a shape could never have predicted. Reporting uses
   the truth. How far the forecast strays from it is MEASURED rather than
   assumed -- see verify-candidate.mjs. */
export function chancesIn(scn) {
  if (!scn) return [];
  const out = [];
  for (const t of TRAIT_KEYS) {
    const trial = { ...scn, ego: { ...scn.ego, traits: [t] } };
    /* A counterfactual about a TRAIT, so the trait-less faults are not
       part of the question and there is no reason to pay for them. */
    if (faultsIn(trial, 20, { encroachment: false }).some((f) => f.who === "ego" && f.trait === t)) out.push(t);
  }
  return out;
}

/* What the candidate actually did here. */
export function showingsIn(scn) {
  if (!scn) return [];
  return faultsIn(scn).filter((f) => f.who === "ego");
}

/* Per-trait tally over a whole drive: chances offered, showings taken,
   and -- the half that makes a hypothesis testable -- chances a trait had
   and visibly did not take.

   `scenes` is what the drive actually presented, in order. Intersections and
   segments both: a habit does not care which it turns up in and neither
   does the player. */
export function habitReport(candidate, scenes) {
  const carried = new Set(candidate?.traits || []);
  const rows = {};
  for (const t of TRAIT_KEYS) {
    rows[t] = { trait: t, carried: carried.has(t), chances: 0, showings: 0, declined: 0, at: [] };
  }

  scenes.forEach((s, i) => {
    const scn = s?.scn ?? s;
    if (!scn) return;
    const could = chancesIn(scn);
    const shown = new Set(showingsIn(scn).map((f) => f.trait));
    for (const t of could) {
      rows[t].chances++;
      if (shown.has(t)) { rows[t].showings++; rows[t].at.push(i); }
      else rows[t].declined++;
    }
  });

  const list = TRAIT_KEYS.map((t) => rows[t]);
  const mine = list.filter((x) => x.carried);
  return {
    rows: list,
    /* A trait the player could actually pin down: enough showings to be a
       tendency rather than an incident. */
    identifiable: mine.filter((x) => x.showings >= SHOWINGS_FOR_A_HABIT).map((x) => x.trait),
    /* Turned up, but not often enough to be more than an incident -- the
       drive glimpsed the driver's character instead of testing the
       player's eye on it. */
    glimpsed: mine.filter((x) => x.showings > 0 && x.showings < SHOWINGS_FOR_A_HABIT).map((x) => x.trait),
    /* Never got a chance at all: the drive hid the driver. */
    hidden: mine.filter((x) => x.showings === 0).map((x) => x.trait),
    /* Hypotheses this drive gave the player grounds to rule out, by
       offering the shape that would have betrayed them and getting
       nothing. */
    ruledOut: list.filter((x) => !x.carried && x.declined >= SHOWINGS_FOR_A_HABIT).map((x) => x.trait),
  };
}

/* What a shape is worth to this candidate, for a planner choosing between
   intents. A chance for a trait still short of a habit is worth most; one
   already identified is worth little; and a shape that can only
   disconfirm a rival is worth something rather than nothing, because
   ruling a habit out is half of identifying one. */
export function valueOfShape(candidate, shape, sofar = {}) {
  let v = 0;
  for (const t of chancesAt(shape)) {
    const have = sofar[t] || 0;
    const room = have >= SHOWINGS_FOR_A_HABIT ? 0.1 : SHOWINGS_FOR_A_HABIT - have;
    if (candidate?.ratings) {
      /* Under ratings nothing is certain, so a shape is worth what this
         driver is LIKELY to do with it. A intersection offering three errors
         they are each 20% likely to make is worth about as much as one
         offering a single error they are 60% likely to make, which is the
         right trade for a planner with one turn to spend.

         Still keyed by error rather than by axis: making an axis readable
         needs two distinct kinds of error it dominates, and steering for
         that is only worth doing once those kinds exist. R2. */
      v += likelihoodOf(t, candidate.ratings) * room + 0.05;
    } else if ((candidate?.traits || []).includes(t)) {
      v += room;
    } else {
      v += 0.25;
    }
  }
  return v;
}
