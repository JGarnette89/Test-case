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
import { crossSpec, validIntents, exitSideFor } from "./road.js";
import { runwayNeeded } from "./directions.js";
import { driveThroughTiles } from "./world.js";
import { faultsIn } from "./faults.js";
import { composeScenario } from "./compose.js";

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

/* =====================================================================
   THE ROUTE PLANNER

   Assembles tiles into an unbounded drive. Deliberately thin: every
   quantity it needs already exists somewhere, and the discipline here is
   to call it rather than to compute a second version of it.

     which turns exist here      validIntents (road.js)
     where an intent leaves you  exitSideFor / entrySideAfter (road.js, route.js)
     how much approach a tile gives   the tile's declared runway
     whether that is enough      runwayNeededFor (tiles.js)
     what it actually delivers   runwayFor (world.js)

   Every error this stage produced came from two things computing one
   quantity, so the planner owns no geometry of its own. If it ever needs
   to answer a question it cannot delegate, that is the signal something
   is missing downstream rather than an invitation to reimplement it here.

   The one thing genuinely decided here is the SHAPE of the drive: which
   tiles in which order, and which way to turn at each junction.
   ===================================================================== */

/* A drive that turns. Silence means straight on, so a route of nothing
   but straight-ahead junctions asks the examiner for no instructions at
   all and the directing task disappears — which makes "does this route
   present real decisions" a property worth planning for rather than
   hoping for. */
export const TURN_SHARE = 0.55;

export function planDrive({
  seed = 1,
  length = 6,
  library = TILES,
  from = "S",
  turnShare = TURN_SHARE,
} = {}) {
  const r = rng(seed >>> 0);
  const plan = [];
  let entry = from;

  for (let i = 0; i < length; i++) {
    /* Vary the character along the drive rather than picking uniformly,
       so a route moves between kinds of difficulty — a seeing problem,
       then a timing problem — instead of staying at one pitch. */
    const tile = pickTile(r, library, plan);
    const spec = specFor(tile.character);
    const legal = validIntents(spec, entry);
    if (!legal.length) break;

    /* The last junction is always straight on: there is nothing after it
       to turn into, and directing a candidate off the end of the world
       is not a decision. */
    const last = i === length - 1;
    const turns = legal.filter((x) => x !== "straight");
    const intent = last || !turns.length || r() > turnShare
      ? (legal.includes("straight") ? "straight" : turns[0])
      : turns[Math.floor(r() * turns.length) % turns.length];

    plan.push({ tile, spec, intent, entry, index: i });
    entry = OPPOSITE_SIDE[exitSideFor(entry, intent)];
  }

  /* A route of nothing but straight-ahead junctions asks the examiner for
     no instruction at all, so the directing task disappears. turnShare is
     a probability and a probability can come up all-straight -- measured,
     1 route in 25 did. So the turn is GUARANTEED here rather than left to
     chance, the same distinction as demanding a fault versus making one
     likelier. */
  const directable = plan.slice(0, -1);
  if (directable.length && !directable.some((p) => p.intent !== "straight")) {
    const at = Math.floor(r() * directable.length) % directable.length;
    const turns = validIntents(plan[at].spec, plan[at].entry).filter((x) => x !== "straight");
    if (turns.length) {
      plan[at].intent = turns[Math.floor(r() * turns.length) % turns.length];
      // Everything after that junction now enters from a different side.
      let e = OPPOSITE_SIDE[exitSideFor(plan[at].entry, plan[at].intent)];
      for (let i = at + 1; i < plan.length; i++) {
        plan[i].entry = e;
        const legal = validIntents(plan[i].spec, e);
        if (!legal.includes(plan[i].intent)) plan[i].intent = legal.includes("straight") ? "straight" : legal[0];
        e = OPPOSITE_SIDE[exitSideFor(e, plan[i].intent)];
      }
    }
  }
  return plan;
}

/* Prefer a character we have not just used, so the drive changes texture.
   Falls back to any tile rather than looping forever on a short library. */
function pickTile(r, library, plan) {
  const lastChar = plan.length ? plan[plan.length - 1].tile.character : null;
  const fresh = library.filter((t) => t.character !== lastChar);
  const pool = fresh.length ? fresh : library;
  return pool[Math.floor(r() * pool.length) % pool.length];
}

/* Leaving by the north leg means arriving at the next junction from its
   south. Mirrors world.js, which needs the same fact for placement. */
const OPPOSITE_SIDE = { N: "S", S: "N", E: "W", W: "E" };

/* Turn a plan into a drive the world can measure: each junction placed at
   the spacing its tile's declared runway requires, with the scenario that
   populates it carrying that junction's own intent. */
export function driveFromPlan(plan, { legFor, speed } = {}) {
  const tiles = plan.map((p) => ({ ...p.tile, spec: p.spec }));
  const legs = plan.map((p) => {
    const scn = legFor(p.spec, p.entry, p.intent);
    return { ...scn, ego: { ...scn.ego, from: p.entry, intent: p.intent } };
  });
  return driveThroughTiles({ tiles, legs, speed });
}

/* =====================================================================
   PACING

   The world exists for assessment, so the governing constraint is that it
   keeps producing things worth marking. Two failure modes, and the budget
   has to exclude both: a dead stretch with nothing to assess, and a
   pile-up so dense the drive stops being plausible.

   ONE QUANTITY, NOT THREE. Hazard supply, occlusion and difficulty are
   three names for the same thing here and must stay that way. Occlusion
   comes from the tile's kerbside density; the traffic comes from the
   brief its character chose; and what is actually markable comes from
   faultsIn, the same derivation the scorer grades against. So pacing
   steers WHICH JUNCTION COMES NEXT and how often its drivers err — it
   never adds a difficulty multiplier of its own, because a second dial
   would drift away from the first the moment either was tuned.

   Measured before this existed: a generated drive offered ZERO faults,
   because compose.js attached no driver traits at all. Supply was not
   thin, it was absent. With traits attached the longest dead stretch across
   eight drives fell to 42.5s, average 34.1s — real, but uneven enough that
   two or three junctions in six still offer nothing.
   ===================================================================== */

/* The dead-air ceiling: longer than this with nothing to mark and the
   drive has failed at its job.

   A TARGET, and it is now met typically but not universally. Measured
   across 24 held-out drives: median 20.2s, average 18.9s, worst 26.6s,
   with 1 of 24 still over.

   It took two pieces and neither was sufficient alone -- 39.5s unaided,
   33.0s with segment hazards alone, 32.1s with a predictive budget alone,
   26.6s with both. The budget had to become predictive because asking
   "has the gap exceeded the ceiling" reacts a whole leg late: the earliest
   a junction can answer is when the candidate reaches it, which put the
   worst case at ceiling plus one leg.

   The remaining gaps are on arterial stretches, and they are CORRECT. An
   arterial has a kerbside activity of 0.15 because a fast open road
   should not have people stepping out of it; its difficulty is timing
   rather than seeing. Forcing 25s everywhere would mean putting
   pedestrians where they do not belong, which is why the constant stays
   as a target rather than becoming a guarantee. */
export const DEAD_AIR_CEILING = 25;

/* And the floor, so incidents do not pile up implausibly. */
export const EVENT_FLOOR = 4;

/* How much likelier a driver is to err when the drive has gone quiet.
   This is the ONLY thing pacing turns, and it turns it through the brief
   rather than beside it. */
export const HUNGRY_FAULT_RATE = 0.9;
export const SATED_FAULT_RATE = 0.15;

/* What a junction is asked for, given how long it has been since anything
   was worth marking. Everything except the fault rate comes from the
   tile's own character, untouched. */
export function briefFor(tile, sinceLastEvent, legTime = 0) {
  const brief = { ...CHARACTER[tile.character].brief };
  /* PREDICTIVE, not reactive. Asking "has the gap exceeded the ceiling"
     reacts a whole leg late, because the earliest a junction can answer is
     when the candidate reaches it -- measured, that put the worst dead
     stretch at ceiling plus one leg, 33s against a 25s target. Asking
     "will it have, by the time we get there" spends the same budget one
     junction earlier. */
  const projected = sinceLastEvent + legTime;
  /* Past the ceiling the junction must produce something markable, not
     merely be likelier to. compose.js enforces that in the same
     accept/reject loop as every other guarantee it makes. */
  if (projected >= DEAD_AIR_CEILING) {
    return { ...brief, faultRate: HUNGRY_FAULT_RATE, mustFault: true };
  }
  if (sinceLastEvent < EVENT_FLOOR) return { ...brief, faultRate: SATED_FAULT_RATE };
  return brief;
}

/* When the drive offers something worth marking, in drive time.

   Reads faultsIn — the same derivation the scorer marks against — rather
   than counting actors or traits, because "how much traffic there is" and
   "how much there is to assess" are different questions and only the
   second one is pacing. */
export function markableTimeline(filled) {
  const events = [];
  let t = 0;
  for (const { tile, scn, hazards } of filled) {
    const speed = CHARACTER[tile.character].speed;
    const legTime = tile.runway / speed + 4;
    /* Junction faults and segment faults land on ONE timeline, because
       "something worth marking happened" is one idea. A separate segment
       clock would be a second notion of the same thing, and this stage
       has been a catalogue of what that costs. */
    if (scn) for (const f of faultsIn(scn)) events.push(t + f.from);
    for (const h of hazards ?? []) {
      for (const f of faultsIn(h.scn)) events.push(t + h.scn.reachesAt + f.from);
    }
    t += legTime;
  }
  events.sort((a, b) => a - b);
  return { events, duration: t };
}

/* The gaps a player would actually sit through, including the run-in
   before the first event and the run-out after the last. */
export function pacingOf({ events, duration }) {
  if (!events.length) return { worstGap: duration, count: 0, tightest: Infinity, duration };
  let worst = events[0], tightest = Infinity;
  for (let i = 1; i < events.length; i++) {
    worst = Math.max(worst, events[i] - events[i - 1]);
    tightest = Math.min(tightest, events[i] - events[i - 1]);
  }
  worst = Math.max(worst, duration - events[events.length - 1]);
  return { worstGap: worst, count: events.length, tightest, duration };
}

/* Populating one junction, with somewhere to fall back to.

   Demanding a fault makes the search fail more often -- composeScenario
   already returns nothing on about a fifth of heavy briefs, and an extra
   condition tightens that. An empty junction is the worst possible answer
   to "the drive has gone quiet", so the ask is relaxed in steps rather
   than abandoned: insist on a fault, then merely lean toward one, then
   take whatever the road character would have given anyway.

   The fallback is a CHAIN, not a second generator. Every step is the same
   composeScenario against the same brief vocabulary, so nothing here
   knows anything the rest of the system does not. */
export function composeForTile(tile, sinceLastEvent, seed, legTime = 0) {
  const wanted = briefFor(tile, sinceLastEvent, legTime);
  const plain = CHARACTER[tile.character].brief;
  const ladder = [
    wanted,
    wanted.mustFault ? { ...wanted, mustFault: false } : null,
    plain,
    { ...plain, traffic: "light" },
  ].filter(Boolean);

  for (let i = 0; i < ladder.length; i++) {
    /* The first attempt uses the caller's own seed, so steering a brief
       and not steering it draw the SAME scenario space and can be
       compared honestly. Deriving a seed here made every measurement of
       whether pacing helps a comparison between different draws. */
    const s = i === 0 ? seed : (seed * 2654435761 + i * 40503) >>> 0;
    const scn = composeScenario(ladder[i], s);
    if (scn) return { scn, brief: ladder[i], relaxed: i };
  }
  return { scn: null, brief: null, relaxed: ladder.length };
}

/* =====================================================================
   SEGMENT HAZARDS

   Junctions were the only source of markable events, and a leg takes
   about ten seconds, so no amount of pacing could react faster than a
   junction arrived. That is what structurally capped dead air at ~40s
   against a 25s target. This is the piece that lifts it.

   BUILT FROM THE ROADSIDE CONTENT THAT ALREADY EXISTS. roadsideLifeFor
   decides where the people are and kerbsideFor decides where the props
   are; a hazard is those same two answers turned into a situation. There
   is no second notion of where anything stands at the roadside, because a
   second notion is how every error this stage produced began.

   Which makes liveliness and hazard supply the same work rather than two
   budgets: a pedestrian stepping out is markable precisely BECAUSE the
   parked car that makes the street feel lived-in is hiding them.

   A segment is an ordinary scenario. Two legs instead of four, so it is a
   straight road with nothing to give way to, and everything downstream --
   simulate, faultsIn, whatEgoSees, the whole fault derivation -- works on
   it unchanged. Verified before it was designed: a two-leg spec
   simulates, the candidate drives through it, and faultsIn derives from
   it exactly as at a junction.
   ===================================================================== */

/* A straight road of the character's own width. `control: "none"` because
   there is nothing here to stop for -- the hazard is the point, not a
   right-of-way puzzle. */
export function straightSpecFor(character) {
  const lanes = CHARACTER[character].lanes;
  return { legs: { S: { lanes, control: "none" }, N: { lanes, control: "none" } } };
}

/* One hazard, placed where the roadside life already put somebody.

   The candidate meets them at whatever time their distance along the link
   implies, so the hazard's own clock is the drive's clock offset -- the
   same relationship a junction has to the drive. */
export function hazardAt(tile, link, person, { candidateTraits = [], seed = 1 } = {}) {
  const spec = straightSpecFor(tile.character);
  const speed = CHARACTER[tile.character].speed;

  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const along = ((person.x - link.from.x) * dx + (person.y - link.from.y) * dy) / len;
  const reachesAt = along / speed;

  /* The person crosses from the kerb they are standing on. `side` came
     from roadsideLifeFor, so which way they step is decided once, where
     they were placed, rather than again here. */
  const from = person.side < 0 ? "S" : "N";

  return {
    id: `haz-${person.id}`,
    road: spec,
    control: "none",
    at: { x: person.x, y: person.y },
    reachesAt,
    ego: {
      from: "S", intent: "straight", arriveAt: 0, departAt: 0, stops: false,
      traits: candidateTraits,
    },
    actors: [{
      id: person.id,
      from,
      intent: "straight",
      /* Timed so they are stepping out as the candidate arrives, which is
         what makes the parked cars matter: seen early it is nothing, seen
         late it is everything. */
      arriveAt: 0.8,
      stops: false,
      kind: "ped",
      colorKey: "pale",
      name: "Pedestrian",
      priority: -1,
      blockUntilClear: true,
      reverse: person.side < 0,
    }],
  };
}

/* Every hazard along one link, and the blockers that hide them.

   Only the people roadsideLifeFor marked as `mayEmerge` become hazards;
   the rest are scenery, which is the difference between a street that is
   busy and a street that is dangerous. */
export function segmentHazards(tile, link, seed = 1, { candidateTraits = [] } = {}) {
  const people = roadsideLifeFor(tile, link, seed);
  const blockers = kerbsideFor(tile, link, seed);
  return people
    .filter((p) => p.mayEmerge)
    .map((p) => ({
      scn: hazardAt(tile, link, p, { candidateTraits, seed }),
      person: p,
      /* The props near them, as ordinary sightBlockers -- the same shape
         sightBlockersOf reads, so the hazard occludes without anything
         downstream learning a new type. */
      blockers: blockers.filter(
        (b) => Math.hypot(b.x - p.x, b.y - p.y) < M(18)
      ),
    }));
}
