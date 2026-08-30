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
  };
}

export const TRAIT_CATALOG = [
  {
    id: "peripheral-awareness",
    name: "Peripheral Awareness",
    category: "reveal",
    description: "Cars you can't clearly see no longer vanish outright — they show faintly instead.",
    apply: (mods) => ({ ...mods, revealHiddenOpacity: Math.max(mods.revealHiddenOpacity, 0.2) }),
  },
  {
    id: "mirror-check",
    name: "Mirror Check",
    category: "reveal",
    description: "Cars you can partly see read more clearly.",
    apply: (mods) => ({ ...mods, partialOpacity: Math.max(mods.partialOpacity, 0.7) }),
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
