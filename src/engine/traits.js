/* =====================================================================
   PLAYER UPGRADES
   Run-scoped equipment fitted to the player's car in the roguelike layer
   — not the driver-behaviour traits in index.js (wander, creep, ...),
   which bend an NPC's own path. These bend nothing about how anyone
   drives, the player's car included. An upgrade may only
   change what the player is shown, how generous the scorer is being this
   run, or which kind of situation the generator is asked for next — never
   `legalAt`/`safeAt`, never collision detection, never a pad/claim/
   resolution constant. See CLAUDE.md's "never author the answer": a part
   that touched the window would be exactly that, wearing a costume.

   Data over code, same as scenarios and routes: the catalog is a plain
   list, and applying one is folding a pure function over a modifier
   object. Nothing here imports React, and nothing here imports
   compose.js or generate.js — an upgrade describes an *intent*
   (`trafficBias: "heavy"`), and it is roguelike.js's job, not this
   file's, to turn that into an actual draw against the generator.

   The word "trait" survives in the identifiers — TRAIT_CATALOG,
   applyTrait, run.traits — because renaming the run state is a change to
   roguelike.js's shape and every caller of it, and that is a separate
   job from restyling what the player reads. The fiction is upgrades; the
   plumbing still says traits.
   ===================================================================== */
import { REACTION_FLOOR, GRACE } from "./score.js";

/* mulberry32 — the same small seeded RNG generate.js and compose.js each
   already carry their own copy of. A run's draft is exactly the kind of
   thing that has to be reproducible from (seed, milestone index), the
   same reason a scenario is reproducible from a seed. */
export { rng } from "./index.js";

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

/* =====================================================================
   RARITY
   Ordered worst-to-best. `weight` is how often a tier is offered in a
   draft, nothing more — it does not make an upgrade stronger, it makes
   it scarcer, and the strength is entirely in the `apply` below it.

   No colour here, deliberately. Rarity is the sort of thing a renderer
   wants to paint, and `src/engine/` never holds a palette (CLAUDE.md).
   The renderer maps these ids to colours out of theme.js.
   ===================================================================== */
export const RARITIES = [
  { id: "common", label: "Common", weight: 100 },
  { id: "uncommon", label: "Uncommon", weight: 55 },
  { id: "rare", label: "Rare", weight: 26 },
  { id: "epic", label: "Epic", weight: 10 },
  { id: "legendary", label: "Legendary", weight: 3 },
];
export const rarityOf = (id) => RARITIES.find((r) => r.id === id) || RARITIES[0];
export const rarityRank = (id) => RARITIES.findIndex((r) => r.id === id);

/* =====================================================================
   THE CATALOG — equipment bolted to the player's car.

   NOTHING HERE CHANGES HOW THE CAR MOVES. Not its speed, not its
   acceleration, not its turning circle, not where it rests or how far it
   creeps. That is not a stylistic preference, it is the safety boundary
   from CLAUDE.md wearing new bodywork: an upgrade may only change what
   the player is SHOWN, how generous the SCORER is being for display this
   run, or which situation the generator is asked for NEXT. The moment a
   part moved the car, it would be moving `legalAt` with it, and the game
   would be authoring its own answer.

   That constraint is also why the fiction is picked the way it is. Every
   part here is glass, a mirror, a camera, a readout or a route choice —
   things that change what the driver knows. No brakes, no tyres, no
   suspension, no engine. If a future part cannot be described without
   implying the car handles differently, it does not belong in this file.

   The descriptions have to stay literally true for the same reason a
   driver trait's tell does. "Blind Spot Monitoring" may say it makes a
   half-seen car readable, because that is what partialOpacity does. It
   may NOT imply it will spot someone for you, because it will not.
   ===================================================================== */
export const TRAIT_CATALOG = [
  /* ---------------- Common: cheap glass, bought at a parts counter ----- */
  {
    id: "aux-mirror",
    name: "Auxiliary Mirror",
    category: "perception",
    rarity: "common",
    description: "A stick-on convex mirror. Traffic you can only partly see reads a little more clearly. Earns a little extra Insight on every clean clear.",
    // insightBonus is additive rather than Math.max-guarded like the rest
    // of this file: it is meant to stack when more than one perception
    // part is fitted, and draftFor already guarantees an upgrade is only
    // ever applied once per run, so there is no double-application to
    // guard against the way the other fields (which a future part might
    // one day also touch) are guarded.
    apply: (mods) => ({ ...mods, partialOpacity: Math.max(mods.partialOpacity, 0.62), insightBonus: mods.insightBonus + 1 }),
  },
  {
    id: "dash-cam",
    name: "Dash Cam",
    category: "economy",
    rarity: "common",
    description: "Watching your own footage back teaches you more than the drive did. Noticeably more Insight per clean clear.",
    apply: (mods) => ({ ...mods, insightBonus: mods.insightBonus + 2 }),
  },

  /* ---------------- Uncommon: factory options ------------------------- */
  {
    id: "cross-traffic-camera",
    name: "Front Cross-Traffic Camera",
    category: "perception",
    rarity: "uncommon",
    // The one part whose real-world job is exactly this mod: a nose-mounted
    // camera exists to look PAST whatever you are hiding behind at a blind
    // exit, which is precisely what revealHiddenOpacity renders.
    description: "A nose camera that looks past whatever you're hiding behind. Traffic you can't see at all stops vanishing outright — it shows faintly instead. Earns a little extra Insight on every clean clear.",
    apply: (mods) => ({ ...mods, revealHiddenOpacity: Math.max(mods.revealHiddenOpacity, 0.2), insightBonus: mods.insightBonus + 1 }),
  },
  {
    id: "head-up-display",
    name: "Head-Up Display",
    category: "scoring",
    rarity: "uncommon",
    description: "The road stays in your eyeline. A wider automatic full-marks window right after your window opens.",
    apply: (mods) => ({ ...mods, reactionFloor: Math.max(mods.reactionFloor, 0.55) }),
  },
  {
    id: "traffic-routing",
    name: "Live-Traffic Routing",
    category: "routing",
    rarity: "uncommon",
    description: "Your nav is very confident and completely wrong. Expect heavier traffic from here on — and the Insight that comes with surviving it.",
    apply: (mods) => ({ ...mods, trafficBias: "heavy" }),
  },

  /* ---------------- Rare: the good options list ----------------------- */
  {
    id: "blind-spot-monitor",
    name: "Blind Spot Monitoring",
    category: "perception",
    rarity: "rare",
    description: "The grown-up version of the stick-on mirror. Traffic you can partly see reads almost as clearly as traffic you can. Earns a little extra Insight on every clean clear.",
    apply: (mods) => ({ ...mods, partialOpacity: Math.max(mods.partialOpacity, 0.85), insightBonus: mods.insightBonus + 1 }),
  },
  {
    id: "acoustic-glass",
    name: "Acoustic Glass",
    category: "scoring",
    rarity: "rare",
    description: "A quiet cabin is an unhurried one. More time before a slow read is marked as undue delay.",
    apply: (mods) => ({ ...mods, grace: Math.max(mods.grace, 3.2) }),
  },
  {
    id: "backroad-routing",
    name: "Backroad Routing",
    category: "routing",
    rarity: "rare",
    description: "It prefers the shortcut every time. Expect tighter, blinder intersections — which pay the most Insight of anything on the road.",
    apply: (mods) => ({ ...mods, visibilityBias: "restricted" }),
  },

  /* ---------------- Epic: not really options at all ------------------- */
  {
    id: "school-zone-routing",
    name: "School-Zone Routing",
    category: "routing",
    rarity: "epic",
    // Named for what it does — it routes you toward crossings. It is
    // pointedly NOT called "Pedestrian Detection": preferPedestrian sends
    // you where the pedestrians are, it does not help you see one, and a
    // part whose name promised that would be lying to the player.
    description: "Routes you past the crossings, whether you wanted that or not. More situations with someone on foot in them, and more Insight for reading them right.",
    apply: (mods) => ({ ...mods, preferPedestrian: true, insightBonus: mods.insightBonus + 1 }),
  },
  {
    id: "extended-warranty",
    name: "Extended Warranty",
    category: "structure",
    rarity: "epic",
    description: "Somebody down here still honours it. Your next upgrade arrives after fewer clean clears.",
    apply: (mods) => ({ ...mods, draftEvery: Math.min(mods.draftEvery, 2) }),
  },

  /* ---------------- Legendary: not sold, exactly ---------------------- */
  {
    id: "v2x-link",
    name: "Vehicle-to-Vehicle Link",
    category: "perception",
    rarity: "legendary",
    description: "Every other car on the road announces itself to you. Nothing stays fully hidden, and half-seen traffic reads almost perfectly. Earns a little extra Insight on every clean clear.",
    apply: (mods) => ({
      ...mods,
      revealHiddenOpacity: Math.max(mods.revealHiddenOpacity, 0.45),
      partialOpacity: Math.max(mods.partialOpacity, 0.9),
      insightBonus: mods.insightBonus + 1,
    }),
  },
];

export const traitById = (id) => TRAIT_CATALOG.find((t) => t.id === id) || null;

export function applyTrait(mods, traitId) {
  const trait = traitById(traitId);
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
    name: "Call an early fitting",
    cost: 6,
    description: "Skip ahead to your next upgrade, milestone or not.",
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
   `count` only once the catalog itself is exhausted.

   Weighted by rarity, which is the only thing rarity does. Note what
   this deliberately is NOT: there is no pity timer, no floor that
   guarantees a legendary eventually, and no scaling with how deep the
   run is. A rare part is rare every single draft, and a run that never
   sees one is a normal run rather than a bug. Weighted sampling WITHOUT
   replacement, so the three on offer are always three different parts
   even when one tier dominates the pool. */
export function draftFor(r, activeTraitIds, count = 3) {
  const remaining = TRAIT_CATALOG.filter((t) => !activeTraitIds.includes(t.id));
  const picks = [];
  while (picks.length < count && remaining.length) {
    const total = remaining.reduce((n, t) => n + rarityOf(t.rarity).weight, 0);
    let roll = r() * total;
    let i = remaining.length - 1;          // the last entry also absorbs float drift
    for (let j = 0; j < remaining.length; j++) {
      roll -= rarityOf(remaining[j].rarity).weight;
      if (roll <= 0) { i = j; break; }
    }
    picks.push(remaining[i]);
    remaining.splice(i, 1);
  }
  return picks;
}
