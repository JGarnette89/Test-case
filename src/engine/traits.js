/* =====================================================================
   PLAYER TRAITS
   Run-scoped perks for the roguelike layer on Endless — not the driver-
   behaviour traits in index.js (wander, creep, ...), which bend an NPC's
   own path. These bend nothing about how anyone drives. A trait may only
   change what the player is shown, how generous the scorer is being this
   run, or which kind of situation the generator is asked for next — never
   `legalAt`/`safeAt`, never collision detection, never a pad/claim/
   resolution constant. See CLAUDE.md's "never author the answer": a trait
   that touched the window would be exactly that, wearing a costume.

   Data over code, same as scenarios and routes: the catalog is a plain
   list, and applying one is folding a pure function over a modifier
   object. Nothing here imports React, and nothing here imports
   compose.js or generate.js — traits describe an *intent*
   (`trafficBias: "heavy"`), and it is roguelike.js's job, not this
   file's, to turn that into an actual draw against the generator.
   ===================================================================== */
import { REACTION_FLOOR, GRACE } from "./score.js";

/* mulberry32 — the same small seeded RNG generate.js and compose.js each
   already carry their own copy of. A run's draft is exactly the kind of
   thing that has to be reproducible from (seed, milestone index), the
   same reason a scenario is reproducible from a seed. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The baseline: a run with no traits drafted behaves byte-identical to
   the engine's own defaults. Every `apply` below only ever widens a
   number away from these, never narrows one. */
export function emptyMods() {
  return {
    revealHiddenOpacity: 0,     // 0 = today's behaviour: not rendered at all
    partialOpacity: 0.45,       // today's fixed opacity for a partial view
    reactionFloor: REACTION_FLOOR,
    grace: GRACE,
    trafficBias: null,          // null = no bias, cycle ENDLESS_BRIEFS as today
    visibilityBias: null,
    preferPedestrian: false,
    draftEvery: 3,              // clean clears between drafts
    insightBonus: 0,            // extra Insight per clean clear — see roguelike.js
  };
}

export const TRAIT_CATALOG = [
  {
    id: "peripheral-awareness",
    name: "Peripheral Awareness",
    category: "reveal",
    description: "Cars you can't clearly see no longer vanish outright — they show faintly instead. Also earns a little extra Insight on every clean clear.",
    // insightBonus is additive rather than Math.max-guarded like the rest
    // of this file: it is meant to stack when more than one reveal trait
    // is active, and draftFor already guarantees a trait is only ever
    // applied once per run, so there is no double-application to guard
    // against the way the other fields (which a future trait might one
    // day also touch) are guarded.
    apply: (mods) => ({ ...mods, revealHiddenOpacity: Math.max(mods.revealHiddenOpacity, 0.2), insightBonus: mods.insightBonus + 1 }),
  },
  {
    id: "mirror-check",
    name: "Mirror Check",
    category: "reveal",
    description: "Cars you can partly see read more clearly. Also earns a little extra Insight on every clean clear.",
    apply: (mods) => ({ ...mods, partialOpacity: Math.max(mods.partialOpacity, 0.7), insightBonus: mods.insightBonus + 1 }),
  },
  {
    id: "steady-hands",
    name: "Steady Hands",
    category: "scoring",
    description: "A wider automatic full-marks window after your window opens.",
    apply: (mods) => ({ ...mods, reactionFloor: Math.max(mods.reactionFloor, 0.55) }),
  },
  {
    id: "extra-beat",
    name: "Extra Beat",
    category: "scoring",
    description: "More time before a slow read counts as undue delay.",
    apply: (mods) => ({ ...mods, grace: Math.max(mods.grace, 3.2) }),
  },
  {
    id: "rush-hour",
    name: "Rush Hour",
    category: "generation",
    description: "You'll be leaned toward heavier traffic from here on.",
    apply: (mods) => ({ ...mods, trafficBias: "heavy" }),
  },
  {
    id: "low-visibility",
    name: "Low Visibility",
    category: "generation",
    description: "You'll be leaned toward restricted-visibility situations from here on.",
    apply: (mods) => ({ ...mods, visibilityBias: "restricted" }),
  },
  {
    id: "crossing-guard",
    name: "Crossing Guard",
    category: "generation",
    description: "You'll be leaned toward situations with a pedestrian crossing.",
    apply: (mods) => ({ ...mods, preferPedestrian: true }),
  },
  {
    id: "quick-study",
    name: "Quick Study",
    category: "structure",
    description: "Your next trait arrives after fewer clean clears.",
    apply: (mods) => ({ ...mods, draftEvery: Math.min(mods.draftEvery, 2) }),
  },
];

export function applyTrait(mods, traitId) {
  const trait = TRAIT_CATALOG.find((t) => t.id === traitId);
  return trait ? trait.apply(mods) : mods;
}

/* =====================================================================
   CONSUMABLES
   What Insight buys. Same shape as a trait — id, name, description,
   apply(mods) -> mods — for the same reason: it is what proves a spend
   cannot smuggle in an effect the trait system's own safety boundary
   does not already cover (see tools/verify-roguelike.mjs). Most of these
   are not really "modifiers" at all — rerolling a draw, calling a draft
   early, reshuffling a roundabout — so their `apply` is the identity;
   only reveal-burst actually widens anything, and it does so the same
   Math.max way a permanent reveal trait would. What each id actually
   *does* (redraw, force a draft, reshuffle exits) is roguelike.js's job,
   in spendConsumable — this catalog only has to prove none of it is
   secretly a different kind of effect.
   ===================================================================== */
export const CONSUMABLES = [
  {
    id: "peek-reroll",
    name: "Reroll the situation",
    cost: 3,
    description: "Discard what's about to play and draw something else instead.",
    apply: (mods) => mods,
  },
  {
    id: "reveal-burst",
    name: "Reveal burst",
    cost: 5,
    description: "Just this one situation — nothing hidden, nothing partial.",
    apply: (mods) => ({
      ...mods,
      revealHiddenOpacity: Math.max(mods.revealHiddenOpacity, 1),
      partialOpacity: Math.max(mods.partialOpacity, 1),
    }),
  },
  {
    id: "early-draft",
    name: "Call an early draft",
    cost: 6,
    description: "Skip ahead to your next trait choice, milestone or not.",
    apply: (mods) => mods,
  },
  {
    id: "reroll-branch",
    name: "Reroll the roundabout",
    cost: 4,
    description: "Redraw what's on offer here.",
    apply: (mods) => mods,
  },
];

export const consumableById = (id) => CONSUMABLES.find((c) => c.id === id) || null;

/* `count` distinct catalog entries not already active, deterministic for
   a given rng — the same draw offered twice from the same (seed,
   milestone) is not a coincidence, it is the point. Returns fewer than
   `count` only once the catalog itself is exhausted. */
export function draftFor(r, activeTraitIds, count = 3) {
  const pool = TRAIT_CATALOG.filter((t) => !activeTraitIds.includes(t.id));
  const picks = [];
  const remaining = [...pool];
  while (picks.length < count && remaining.length) {
    const i = Math.floor(r() * remaining.length);
    picks.push(remaining[i]);
    remaining.splice(i, 1);
  }
  return picks;
}
