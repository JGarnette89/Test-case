/* =====================================================================
   SCENARIO GENERATION
   Ten hand-written situations is a tutorial. This is where the rest come
   from.

   The rule from CLAUDE.md holds absolutely: the answer is never authored.
   This file only declares who arrives, from where, intending what — then
   asks the engine what that means and throws the draw away if the answer
   is not worth playing. Nothing here decides when a road is yours.

   Everything is seeded, so the same seed is the same situation on every
   device, forever. That is what makes a daily challenge possible without
   a server: the date IS the seed.
   ===================================================================== */
import {
  simulate, poseAt, conflicts, forwardClaim, spanOf, STEP, OPPOSITE, RIGHT_OF,
} from "./index.js";
import { EARLY_TOLERANCE, GRACE } from "./score.js";
import { PULL_STEP } from "./sight.js";

/* mulberry32 — small, fast, and good enough that consecutive seeds do not
   produce visibly similar draws. Deterministic across every platform. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const range = (r, lo, hi, step = 0.1) =>
  Math.round((lo + r() * (hi - lo)) / step) * step;

const SIDES = ["N", "S", "E", "W"];
const INTENTS = ["straight", "left", "right"];
const COLOURS = ["red", "green", "amber"];

/* Traits worth generating. lateSignal is included because it changes what
   can be read in time even though it never moves a window. wideTurn is
   left out until there is a geometry where it bites — see CLAUDE.md. */
const TRAIT_POOL = ["wander", "creep", "overshoot", "slowStart", "lateSignal"];

/* What makes a draw worth playing. Tunable, and deliberately data. */
export const ACCEPT = {
  maxThink: 6.0,      // beyond this it is a waiting game, not a judgment
  maxLegalAt: 9.0,    // the window has to arrive inside the clock
  minDuration: 11,
  slack: 3.0,         // seconds of run time after the window opens

  /* A window opening inside the early tolerance is a wait the player
     cannot perceive and the scorer does not punish skipping. Such a draw
     claims to be a yield and plays as a go-now, so it is neither lesson.
     Every accepted scenario is one or the other, never the fog between. */
  ambiguousBelow: EARLY_TOLERANCE,
};

/* ---------------------------------------------------------------------
   Is the window the engine derived actually safe to take, and was the
   moment before it actually unsafe? If either fails, the draw is not a
   fair question and gets thrown away. This is the generator checking the
   engine, which is the only honest way round.
   --------------------------------------------------------------------- */
function collidesIfDepartingAt(sim, T, creepSteps = 0) {
  const ego = { ...sim.ego, departAt: T, stopBias: (sim.ego.stopBias || 0) + creepSteps * PULL_STEP };
  for (let t = T; t <= T + spanOf(ego) + 0.3; t += STEP) {
    const mine = poseAt(ego, t);
    if (mine.gone) break;
    for (const a of sim.actors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) return true;
    }
  }
  return false;
}

/* How many presses of PULL UP to check the draw against. The encroachment
   fault only ever watches priors — traffic that has right of way, per the
   rule creeping is actually judged against — so it cannot warn about a
   road user who does not outrank the ego. Matches the range verify-sight
   already exercises for creep, which is enough to carry the nose well
   past the stop line and into the box on every road this generates. */
const CREEP_STEPS_CHECKED = 8;

/* legalAt is derived against PRIORS only — whoever outranks the ego. A
   road user who does not is still a physical object, and one who is
   still arriving when the window opens can be scheduled on the
   assumption the ego leaves promptly. The scorer calls anywhere up to
   GRACE seconds later "good" too, so if departing later in that same
   stretch hits that road user, the promise "good" makes was never true
   — the draw just had not been asked the later question. Every instant
   the scorer will call good has to be asked, not only the first one.

   And not only from the stop line: creeping shifts where the ego departs
   from, and the fault that watches creep cannot see this exact danger
   (see above), so the generator has to be the one that catches it. */
function unsafeWithinGrace(sim) {
  for (let steps = 0; steps <= CREEP_STEPS_CHECKED; steps++) {
    // +1e-9 guards against float drift silently dropping the sample right
    // at the boundary — where a narrow unsafe sliver actually hid once.
    for (let d = sim.legalAt; d <= sim.legalAt + GRACE + 1e-9; d += STEP * 2) {
      if (collidesIfDepartingAt(sim, d, steps)) return true;
    }
  }
  return false;
}

/* Which actor is still in the way one step before the window opens. Used
   to describe the situation truthfully rather than from a template. */
function bindingActor(sim) {
  const T = sim.legalAt - STEP;
  if (T < sim.ego.arriveAt) return null;
  const ego = { ...sim.ego, departAt: T };
  for (let t = T; t <= T + spanOf(ego) + 0.3; t += STEP) {
    const mine = poseAt(ego, t);
    if (mine.gone) break;
    for (const a of sim.priors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(ego, mine, a, theirs, 4, 2, forwardClaim(a, t), "yield")) return a;
    }
  }
  return null;
}

const SIDE_WORD = { N: "north", S: "south", E: "east", W: "west" };
const INTENT_WORD = { straight: "straight through", left: "turning left", right: "turning right" };

/* Description derived from what the engine found, never asserted ahead of
   it. If the generator cannot say why, it says nothing rather than guessing. */
function describe(scn, sim) {
  const n = scn.actors.length;
  const control = scn.control === "signal" ? "Green light" : "Four-way stop";
  /* Deliberately silent about what the ego is doing: the player reads that
     off their own indicator, the same way they read everyone else's. */
  const brief = `${control}. ${n === 1 ? "One other road user." : `${n} other road users.`}`;

  const blocker = bindingActor(sim);
  const think = Math.round((sim.legalAt - scn.ego.arriveAt) * 100) / 100;

  let why;
  if (!blocker) {
    why = think <= 0.001
      ? "Nothing crossed your path, so the road was yours the moment you had stopped. Waiting for the intersection to empty would have cost you the whole window."
      : "Your path was clear of everyone who had priority.";
  } else if (blocker.kind === "ped") {
    why = `Someone was on the ${SIDE_WORD[blocker.from]} crossing, and you were driving through it. ` +
      `A pedestrian holds the near half of the crossing until they are past its midpoint, not the ` +
      `moment they step off the curb. That is a rule about the crossing, not about where they happen to be standing.`;
  } else {
    why = `The ${blocker.name.toLowerCase()} came from the ${SIDE_WORD[blocker.from]} ${INTENT_WORD[blocker.intent]}, ` +
      `and that path crossed yours. You were waiting for that one — not for the intersection to empty.`;
  }
  return { brief, why, blockerId: blocker?.id ?? null, think };
}

/* ---------------------------------------------------------------------
   One draw. Returns a scenario with its derived facts attached, or null
   if the situation is not worth asking about.
   --------------------------------------------------------------------- */
export function drawScenario(seed) {
  const r = rng(seed);

  const control = r() < 0.25 ? "signal" : "stop";
  const egoFrom = pick(r, SIDES);
  const egoIntent = pick(r, INTENTS);
  const egoArrive = range(r, 1.0, 2.6);

  const count = 1 + Math.floor(r() * 3); // 1..3
  const used = new Set([egoFrom]);
  const actors = [];

  for (let i = 0; i < count; i++) {
    // Prefer a fresh approach so actors are not stacked in one lane.
    const options = SIDES.filter((s) => !used.has(s));
    const from = options.length && r() < 0.85 ? pick(r, options) : pick(r, SIDES);
    used.add(from);

    /* Sometimes the other road user is on foot. A pedestrian holds the
       whole crossing until they are completely across — a legal rule, not
       a geometric one — so this is the only way that rule ever turns up
       outside the one hand-written situation that teaches it.

       Their crossing is placed on a leg the ego actually meets. A crossing
       on the far side of the box is scenery, not a decision. */
    if (r() < 0.22) {
      const legs = [egoFrom, OPPOSITE[egoFrom], RIGHT_OF[egoFrom]];
      actors.push({
        id: `p${i}`,
        from: pick(r, legs),
        intent: "straight",
        arriveAt: range(r, 0.4, 2.6),
        stops: false,
        kind: "ped",
        colorKey: "pale",
        name: "Pedestrian",
        // Pedestrians are not resolved by arrival order against vehicles.
        priority: -1,
        blockUntilClear: true,
        reverse: r() < 0.5,
      });
      continue;
    }

    const intent = pick(r, INTENTS);
    const rolling = control === "signal" && r() < 0.6;
    const traits = r() < 0.45 ? [pick(r, TRAIT_POOL)] : [];

    actors.push({
      id: `a${i}`,
      from,
      intent,
      arriveAt: range(r, 0.6, 3.4),
      stops: !rolling,
      kind: "car",
      colorKey: COLOURS[i % COLOURS.length],
      name: `${["Red", "Green", "Amber"][i % 3]} car`,
      // An indicator is shown for most turns, and sometimes not at all —
      // which is the situation the tutorial's "silent" scenario teaches.
      signal: intent === "straight" ? null : r() < 0.75 ? intent : null,
      ...(traits.length ? { traits } : {}),
    });
  }

  const scn = {
    id: `gen-${seed}`,
    generated: true,
    seed,
    title: "Generated situation",
    brief: "",
    control,
    duration: ACCEPT.minDuration,
    ego: { from: egoFrom, intent: egoIntent, arriveAt: egoArrive, stops: true, colorKey: "blue" },
    actors,
    lesson: "",
  };

  const sim = simulate(scn);
  const think = sim.legalAt - egoArrive;

  // --- rejections, cheapest first ---
  if (!(sim.legalAt >= egoArrive)) return null;              // window before you arrive: impossible
  if (think > ACCEPT.maxThink) return null;                  // a wait, not a decision
  if (sim.legalAt > ACCEPT.maxLegalAt) return null;          // outside any sensible clock
  if (unsafeWithinGrace(sim)) return null;                   // not safe somewhere the scorer still calls good
  // Either the road is yours on arrival, or the wait is long enough to be
  // a real yield. Nothing in between.
  if (think > STEP && think <= ACCEPT.ambiguousBelow) return null;

  const { brief, why } = describe(scn, sim);
  scn.brief = brief;
  scn.lesson = why;
  scn.duration = Math.max(ACCEPT.minDuration, Math.ceil(sim.legalAt + ACCEPT.slack));

  // Facts about the draw, for difficulty and for the harness.
  scn.derived = {
    legalAt: sim.legalAt,
    think: Math.round(think * 100) / 100,
    priors: sim.priors.length,
    traits: actors.flatMap((a) => a.traits || []),
  };
  scn.difficulty = difficultyOf(scn.derived, actors.length);
  scn.title = TITLE_BY_DIFFICULTY[scn.difficulty];
  return scn;
}

const TITLE_BY_DIFFICULTY = {
  1: "Straightforward",
  2: "Watch the order",
  3: "Read the drivers",
  4: "Nothing obvious about it",
};

/* Difficulty is described, not decreed: it comes out of what the engine
   found in the draw. */
function difficultyOf(d, actorCount) {
  let score = 0;
  if (d.priors > 0) score += 1;
  if (d.priors > 1) score += 1;
  if (d.traits.length) score += 1;
  if (actorCount >= 3) score += 1;
  if (d.think >= 1.5) score += 1;
  return Math.max(1, Math.min(4, score));
}

/* Keep drawing until one is worth playing. Bounded so a bad tuning cannot
   spin forever — it returns null and the caller can say so.

   `difficulty` asks for a band rather than taking the first acceptable
   draw. If the run of tries never hits it, the nearest band is returned
   instead: a day must always produce a situation, and a Tuesday that is
   marginally too hard beats a Tuesday with nothing in it. Still fully
   deterministic — the same seed and target give the same answer. */
export function generateScenario(seed, opts = {}) {
  const { difficulty = null, tries = 60 } = typeof opts === "number" ? { tries: opts } : opts;
  let nearest = null;
  for (let i = 0; i < tries; i++) {
    const scn = drawScenario((seed * 7919 + i * 104729) >>> 0);
    if (!scn) continue;
    if (difficulty == null || scn.difficulty === difficulty) return scn;
    if (!nearest || Math.abs(scn.difficulty - difficulty) < Math.abs(nearest.difficulty - difficulty)) {
      nearest = scn;
    }
  }
  return nearest;
}

export function generateBatch(seed, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const scn = generateScenario((seed + i) >>> 0);
    if (scn) out.push(scn);
  }
  return out;
}

/* The daily challenge. The date is the seed, so every device gets the same
   situation with nothing to coordinate and no network involved. */
export const DAY_MS = 86400000;
export const EPOCH = Date.UTC(2026, 0, 1);

export function dayIndex(now = Date.now()) {
  return Math.floor((now - EPOCH) / DAY_MS);
}

/* The week ramps: gentle on Monday, hardest at the weekend, and it resets.
   A beginner gets a foothold early in the week; someone who has been
   playing gets something worth the trip by Saturday.

   Derived from the date and nothing else. It must never key off what the
   player has been clearing — everyone getting the same intersection on the
   same day is precisely the property a leaderboard would need, and a
   personalised ramp quietly spends it. */
export const WEEK_CURVE = [1, 1, 2, 2, 3, 4, 4]; // Monday..Sunday
export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* Weekday of the epoch, Monday-based, computed rather than asserted so a
   change of EPOCH cannot silently shift the whole week. */
const EPOCH_WEEKDAY = (new Date(EPOCH).getUTCDay() + 6) % 7;

export function weekdayOf(day) {
  return (((day + EPOCH_WEEKDAY) % 7) + 7) % 7;
}

export function targetDifficulty(day) {
  return WEEK_CURVE[weekdayOf(day)];
}

export function dailyScenario(now = Date.now()) {
  const d = dayIndex(now);
  const target = targetDifficulty(d);
  // A wider search than the endless mode: hitting the band matters more
  // here than returning quickly, and it runs once a day.
  const scn = generateScenario((d + 1) >>> 0, { difficulty: target, tries: 400 });
  if (scn) {
    scn.id = `daily-${d}`;
    scn.day = d;
    scn.weekday = weekdayOf(d);
    scn.targetDifficulty = target;
  }
  return scn;
}
