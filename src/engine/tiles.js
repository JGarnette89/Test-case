/* =====================================================================
   TILES — the world as data

   A tile is one junction and the road leading into it. It declares the
   RUNWAY it provides — the approach the candidate actually gets before
   that junction — and never the spacing between junction centres.

   THAT DISTINCTION IS THE WHOLE POINT, and it is the same lesson twice
   over. Spacing is a proxy that happens to correlate; runway is the thing
   the game depends on. Measured:

     - the previous junction's traverse consumes ~22m reaching its exit,
       so runway is always less than spacing
     - a wider junction's stop line sits further back, so the same 100m
       spacing delivers 69.9m of runway on one lane and 62.7m on three
     - and a faster road NEEDS more: 46m residential, 63m collector, 76m
       arterial, because runwayNeeded is in seconds and distance is
       seconds times speed

   So an arterial is squeezed from both ends — it needs the most approach
   and gets the least per metre of spacing. A single spacing band could
   never express that, and a tile library built on one would have
   contained junctions nobody could direct. Declaring runway makes the
   claim checkable at authoring time: see verify-tiles.mjs.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { M } from "./index.js";
import { crossSpec } from "./road.js";
import { runwayNeeded } from "./directions.js";

/* =====================================================================
   ROAD CHARACTER

   Expressed in the representation rather than painted on: four different
   things read this table, which is what makes it structure instead of
   decoration.

     speed      -> what the road carries, and therefore how much runway a
                   turn off it needs
     junction   -> lanes and control at the far end
     brief      -> what the generator is asked for
     kerbside   -> what stands at the roadside, which is both the scenery
                   and the occlusion

   THE INVERSION IS DELIBERATE. Density falls as speed rises, so
   difficulty does not decrease along the table — it changes KIND. A
   residential street is a seeing problem: short sightlines, things
   emerging from between parked cars. A dual carriageway is a timing
   problem: you can see everything and have no time. Checked in
   verify-tiles.mjs, because an author could quietly break it.
   ===================================================================== */
export const CHARACTER = {
  residential: {
    speed: M(8.3),                       // ~30 km/h
    lanes: 1,
    control: "stop",
    brief: { traffic: "light", visibility: "restricted" },
    kerbside: {
      density: 0.85,
      kinds: ["parked", "hedge", "wall", "bins"],
      activity: 0.7,                     // people about: doors, driveways, kids
    },
  },
  collector: {
    speed: M(11.5),                      // ~41 km/h, the engine's V_STRAIGHT
    lanes: 1,
    control: "stop",
    brief: { traffic: "busy", visibility: "open" },
    kerbside: {
      density: 0.5,
      kinds: ["parked", "furniture", "shopfront"],
      activity: 0.45,
    },
  },
  arterial: {
    speed: M(13.9),                      // ~50 km/h
    lanes: 3,
    control: "none",
    brief: { traffic: "heavy", visibility: "open" },
    kerbside: {
      density: 0.2,
      kinds: ["furniture", "shelter", "signage"],
      activity: 0.15,
    },
  },
};

export const CHARACTERS = Object.keys(CHARACTER);

/* How much approach a turn off this character of road needs, in world
   units. Seconds from directions.js, distance from the road's own speed —
   so a faster road demands more tarmac for the same instruction. */
export function runwayNeededFor(character, intent = "left") {
  const c = CHARACTER[character];
  return runwayNeeded(intent) * c.speed;
}

export const specFor = (character) =>
  crossSpec(CHARACTER[character].control, CHARACTER[character].lanes);

/* =====================================================================
   THE LIBRARY

   Each tile declares the runway it delivers. The declaration is a
   promise, and verify-tiles.mjs holds it to it against measured geometry
   for every tile that could precede it — so a tile that cannot deliver
   what it claims fails at authoring time rather than becoming a junction
   nobody can direct, several stages later.

   Runways here are declared with headroom over the minimum rather than
   exactly at it, because a tile sitting on its own limit has nothing left
   when a candidate arrives slightly late.
   ===================================================================== */
export const TILES = [
  {
    id: "res-quiet",
    character: "residential",
    runway: M(55),
    note: "Parked both sides. You cannot see the junction until you are nearly in it.",
  },
  {
    id: "res-busy",
    character: "residential",
    runway: M(60),
    note: "The same street with more life in it — and more to hide behind.",
  },
  {
    id: "coll-standard",
    character: "collector",
    runway: M(72),
    note: "Through road. Enough sightline to read the junction, enough traffic to fill it.",
  },
  {
    id: "art-main",
    character: "arterial",
    runway: M(88),
    note: "Wide and fast. You can see everything coming and have very little time.",
  },
];

export const tileById = (id) => TILES.find((t) => t.id === id) || null;

/* =====================================================================
   ROADSIDE CONTENT

   The props that make the world feel alive are the props that block
   sightlines. One declaration produces both, which is why density is the
   occlusion budget and the difficulty dial at once rather than two knobs
   that would drift apart.

   Emitted as ordinary sightBlockers — the same { x, y, rot, hl, hw } that
   sightBlockersOf already reads and visibility already tests against, so
   nothing downstream needs to learn a new shape.
   ===================================================================== */

const KIND_SIZE = {
  parked: { hl: M(2.3), hw: M(0.9) },
  hedge: { hl: M(3.0), hw: M(0.6) },
  wall: { hl: M(4.0), hw: M(0.3) },
  bins: { hl: M(0.5), hw: M(0.5) },
  furniture: { hl: M(0.4), hw: M(0.4) },
  shopfront: { hl: M(3.5), hw: M(0.5) },
  shelter: { hl: M(1.8), hw: M(0.8) },
  signage: { hl: M(0.3), hw: M(0.3) },
};

/* mulberry32, as everywhere else that needs a reproducible draw. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Blockers along one link, both kerbs, spaced by the tile's density.

   `along` is the link path's own from/to, so the content follows the road
   rather than being scattered on a board — which is what lets a tile be
   placed anywhere the planner puts it. */
export function kerbsideFor(tile, link, seed = 1) {
  const c = CHARACTER[tile.character];
  const { density, kinds } = c.kerbside;
  if (density <= 0) return [];

  const r = rng(seed);
  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;          // along the road
  const nx = -uy, ny = ux;                     // across it

  /* One slot per car length; density decides how many are taken. Kerb
     offset is half the carriageway plus half the prop, so it sits at the
     edge rather than in the lane. */
  const slot = M(6);
  const slots = Math.max(0, Math.floor(len / slot) - 1);
  const offset = M(3.6) * c.lanes + M(1.2);

  const out = [];
  for (let i = 1; i <= slots; i++) {
    for (const side of [-1, 1]) {
      if (r() > density) continue;
      const kind = kinds[Math.floor(r() * kinds.length) % kinds.length];
      const size = KIND_SIZE[kind] ?? KIND_SIZE.parked;
      const d = i * slot + (r() - 0.5) * M(1.0);
      out.push({
        id: `${tile.id}-${kind}-${i}-${side}`,
        kind,
        x: link.from.x + ux * d + nx * offset * side,
        y: link.from.y + uy * d + ny * offset * side,
        rot: (Math.atan2(uy, ux) * 180) / Math.PI,
        hl: size.hl,
        hw: size.hw,
      });
    }
  }
  return out;
}

/* People, drawn from the same declaration that placed the props — which
   is the point. A pedestrian stepping out from behind a parked car is a
   hazard precisely because the car was there to hide them, so activity
   and density have to come from one tile rather than two systems.

   Returned as positions along the link rather than as scenario actors:
   turning them into road users belongs to whatever populates a segment,
   and this file only says where the life is. */
export function roadsideLifeFor(tile, link, seed = 2) {
  const c = CHARACTER[tile.character];
  const activity = c.kerbside.activity;
  if (activity <= 0) return [];

  const r = rng(seed);
  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const offset = M(3.6) * c.lanes + M(2.0);

  const out = [];
  const chances = Math.max(1, Math.round(len / M(25)));
  for (let i = 0; i < chances; i++) {
    if (r() > activity) continue;
    const d = ((i + 0.5) / chances) * len;
    const side = r() < 0.5 ? -1 : 1;
    out.push({
      id: `${tile.id}-life-${i}`,
      kind: "ped",
      x: link.from.x + ux * d + nx * offset * side,
      y: link.from.y + uy * d + ny * offset * side,
      side,
      /* Whether they step out is the segment's business; what this says
         is that there is somebody there to. */
      mayEmerge: r() < activity,
    });
  }
  return out;
}
