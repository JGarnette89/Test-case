/* =====================================================================
   TILES — the world as data

   A tile is one intersection and the road leading into it. It declares the
   RUNWAY it provides — the approach the candidate actually gets before
   that intersection — and never the spacing between intersection centres.

   THAT DISTINCTION IS THE WHOLE POINT, and it is the same lesson twice
   over. Spacing is a proxy that happens to correlate; runway is the thing
   the game depends on. Measured:

     - the previous intersection's traverse consumes ~22m reaching its exit,
       so runway is always less than spacing
     - a wider intersection's stop line sits further back, so the same 100m
       spacing delivers 69.9m of runway on one lane and 62.7m on three
     - and a faster road NEEDS more: 46m residential, 63m collector, 76m
       arterial, because runwayNeeded is in seconds and distance is
       seconds times speed

   So an arterial is squeezed from both ends — it needs the most approach
   and gets the least per metre of spacing. A single spacing band could
   never express that, and a tile library built on one would have
   contained intersections nobody could direct. Declaring runway makes the
   claim checkable at authoring time: see verify-tiles.mjs.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { M, rng, CAR_L, simulate} from "./index.js";
import { crossSpec, validIntents, exitSideFor, OPPOSITE } from "./road.js";
import { runwayNeeded } from "./directions.js";
import { approachDecel } from "./paths.js";
import { REACTION_FLOOR } from "./score.js";
import { driveThroughTiles } from "./world.js";
import { faultsIn } from "./faults.js";
import { responseOnAwareness } from "./awareness.js";
import { egoFor, chancesAt, shapeOf, valueOfShape, SHOWINGS_FOR_A_HABIT } from "./candidate.js";
import { composeScenario } from "./compose.js";

/* =====================================================================
   ROAD CHARACTER

   Expressed in the representation rather than painted on: four different
   things read this table, which is what makes it structure instead of
   decoration.

     speed      -> what the road carries, and therefore how much runway a
                   turn off it needs
     intersection   -> lanes and control at the far end
     brief      -> what the generator is asked for
     curbside   -> what stands at the roadside, which is both the scenery
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
    /* PARKING FOLLOWS THE HIERARCHY, which makes density a difficulty
       dial and a realism dial at once: a busy residential street is both
       more alive and harder to examine. */
    parking: "parallel",
    /* Residential streets get courts; an arterial never does and a
       collector rarely warrants one. */
    driveways: true,
    brief: { traffic: "light", visibility: "restricted" },
    curbside: {
      density: 0.85,
      kinds: ["parked", "hedge", "wall", "bins"],
      activity: 0.7,                     // people about: doors, driveways, kids
    },
  },
  collector: {
    speed: M(11.5),                      // ~41 km/h, the engine's V_STRAIGHT
    lanes: 1,
    control: "stop",
    parking: "parallel",
    brief: { traffic: "busy", visibility: "open" },
    curbside: {
      density: 0.5,
      kinds: ["parked", "furniture", "shopfront"],
      activity: 0.45,
    },
  },
  arterial: {
    speed: M(13.9),                      // ~50 km/h
    lanes: 3,
    control: "none",
    parking: "none",
    brief: { traffic: "heavy", visibility: "open" },
    curbside: {
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
   what it claims fails at authoring time rather than becoming an intersection
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
    note: "Parked both sides. You cannot see the intersection until you are nearly in it.",
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
    note: "Through road. Enough sightline to read the intersection, enough traffic to fill it.",
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

/* =====================================================================
   PARKING — the strip beside the traffic lane, and why it is content

   Until now every roadside object sat at `3.6*lanes + 2.0` from the
   centreline: two metres BEYOND the carriageway edge, politely out of the
   way. Nothing occupied the space next to the traffic lane, so there was
   nothing to pass close to, and the whole observation axis had no
   non-stopping content available to it. A pedestrian who steps off a curb
   two metres clear of the road is behind you before they reach it.

   THE MAINTAINER'S RULING: "absolutely we should have a variety of
   parking situations, along the curb but also in dedicated spots where it
   makes sense." Parking TYPE is content rather than decoration, because
   each type produces a different hazard:

     parallel  the carriageway effectively narrows, doors open into the
               lane, a car can pull out, and pedestrians emerge from
               BETWEEN vehicles that are genuinely in the way.
     bay       perpendicular spaces, and the hazard is a car REVERSING
               OUT. The driver cannot see, and the candidate cannot see
               them until they move -- a fault purely of anticipation,
               which is the strongest observation content available.

   WIDTHS ARE REAL, not chosen to fit: a parallel parking lane is 2.4m
   (8ft) against a 3.6m traffic lane, and a perpendicular bay is a car
   length plus clearance.

   PARKING IS PROHIBITED NEAR AN INTERSECTION -- 9m in Ontario -- so the
   strip belongs to the LINK and never to the intersection box. That is why
   this changes no intersection geometry: roadHalf, stop lines, exits, runway
   and spacing are all untouched, and the golden does not move. The rule
   is the reason, not a convenience. */
export const PARKING = {
  none: 0,
  parallel: M(2.4),
  /* No perpendicular parking on the road -- see curbLayout. */
};

/* How far a parked car's centre sits from the road centreline, and how
   far out the verge beyond it starts. One derivation, so the props, the
   people and anything that draws the strip cannot disagree. */
export function curbLayout(character) {
  const c = CHARACTER[character];
  const laneHalf = M(3.6) * c.lanes;
  const park = PARKING[c.parking ?? "none"] ?? 0;
  const curb = laneHalf + park;
  /* A BAY IS A LAY-BY THAT WIDENS THE VERGE, never the carriageway --
     maintainer's ruling, and it is what actually exists: shop-front
     parking, a bay set back from the road, a residential court. It also
     keeps the intersection rule intact, since nothing about the road's own
     width changes.

     The court is a bay deep plus an aisle to manoeuvre in, and the aisle
     is what makes the car able to LEAVE FORWARDS. Without it a car
     reversing straight out of a perpendicular space onto a single traffic
     lane cannot align without occupying the oncoming one -- measured,
     3.2m over the centreline -- because a 5.5m turning circle does not
     fit in 3m of road. That is why real perpendicular parking has an
     aisle, and modelling it without one would have been teaching the
     manoeuvre wrong. */
  /* NO PERPENDICULAR PARKING ON THE CARRIAGEWAY. Maintainer's ruling:
     "there is almost never a case where a car is parked perpendicular
     along the road, these cars would be parked straight along the road."
     Both the aisle-court and the reverse-across-the-lane versions are
     gone; cars park parallel, full stop.

     THE REVERSING CASE IS DRIVEWAYS, and it is hierarchy-bound: "we could
     exemplify this by having cars reverse out of their driveways in
     residential streets, but you'd never see this type of parking along a
     major road." A driveway is perpendicular to the road and the car
     emerges across the parking lane into the traffic lane, which is
     exactly the movement shape already built. */
  const drive = c.driveways ? M(6.0) : 0;
  return {
    laneEdge: laneHalf,
    park,
    parkCentre: laneHalf + park / 2,
    curb,
    verge: curb + M(1.2),
    /* The court sits beyond the pavement, so a car in it is hidden by
       whatever is at the curb until it reaches the mouth. */
    /* Where a driveway runs back from, and how deep. A car sits in it
       nose-in, so it comes out backwards -- the driver looking over a
       shoulder past the cars parked either side of the entrance. */
    driveway: c.driveways ? { mouth: curb, depth: drive, back: curb + drive } : null,
  };
}

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

/* HOW MUCH ROAD A DRIVEWAY TAKES OUT OF THE PARKED ROW, derived from the
   two cars rather than picked. An emerging car turns within its own
   footprint, so the furthest any part of it reaches from the driveway
   centre is its half-diagonal; a parked car reaches its own half-length
   toward it. Closer than the sum and they occupy the same tarmac.

   Measured against the manoeuvre emergeMovement actually builds: it
   sweeps 3.27m of the parking lane and reaches 1.92m from the centre of
   the mouth, inside the 2.42m half-diagonal this bounds it by. So the
   bound holds without being fitted to it, and it moves on its own if
   either car ever changes size. */
const SWEPT = Math.hypot(M(2.25), M(0.9));
export const DRIVEWAY_CLEAR = SWEPT + M(2.3);
/* And the mouth is that swept radius either side of the centre — one
   quantity, two uses, so a wider car widens the driveway AND pushes the
   parking further back rather than only one of the two. */
export const DRIVEWAY_MOUTH = 2 * SWEPT;

/* The strip beside one link: what stands on it, and where it is broken.

   ONE PASS, because a driveway and a parking space are the same slot
   asking two questions. Two functions replaying one rng would drift the
   first time either drew a number the other did not, and the drift would
   surface as a car parked across a driveway — which is what it was.

   `along` is the link path's own from/to, so the content follows the road
   rather than being scattered on a board — which is what lets a tile be
   placed anywhere the planner puts it. */
function stripFor(tile, link, seed = 1) {
  const c = CHARACTER[tile.character];
  const { density, kinds } = c.curbside;
  if (density <= 0) return { props: [], driveways: [] };

  const r = rng(seed);
  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;          // along the road
  const nx = -uy, ny = ux;                     // across it

  /* One slot per car length; density decides how many are taken.

     A PARKED CAR SITS IN THE PARKING LANE and everything else behind the
     curb. The literal here was already 3.6*lanes + 1.2, which happens to
     be the centre of a 2.4m parking lane -- correct by accident rather
     than by derivation, and it disagreed with roadsideLifeFor's own
     offset two metres further out. One derivation now, so a prop, a
     person and anything that draws the strip cannot drift apart. */
  const slot = M(6);
  const slots = Math.max(0, Math.floor(len / slot) - 1);
  const lay = curbLayout(tile.character);
  const offsetFor = (kind) => (kind === "parked" && lay.park > 0 ? lay.parkCentre : lay.verge);

  const out = [], drives = [];
  for (let i = 1; i <= slots; i++) {
    for (const side of [-1, 1]) {
      if (r() > density) {
        /* A DRIVEWAY IS THE BREAK IN THE ROW, not a thing placed beside
           it. The gaps were already here — density says what share of
           the frontage is parked, so what is left is what a house is
           using — and reading them as driveways introduces no second
           rate to keep in step with the first. It also explains the gap
           rather than leaving it as bare curb.

           The empty slot is the whole of the guarantee: nothing was
           placed here, so nothing can be parked across the mouth, and
           the neighbours sit a slot away. */
        if (lay.driveway) {
          /* THE SAME { x, y, rot, hl, hw } SHAPE EVERY OTHER ROADSIDE
             THING USES, so the renderer draws it with the code it already
             has and there is no second notion of where a driveway is.
             The surface runs from the traffic lane's edge back past the
             curb: it crosses the parking lane too, which is exactly why
             nothing is parked on it. */
          const mid = (lay.laneEdge + lay.driveway.back) / 2;
          drives.push({
            id: `${tile.id}-drive-${i}-${side}`,
            kind: "driveway",
            along: i * slot,
            side,
            x: link.from.x + ux * (i * slot) + nx * mid * side,
            y: link.from.y + uy * (i * slot) + ny * mid * side,
            rot: (Math.atan2(uy, ux) * 180) / Math.PI,
            hl: DRIVEWAY_MOUTH / 2,
            hw: (lay.driveway.back - lay.laneEdge) / 2,
            depth: lay.driveway.depth,
          });
        }
        continue;
      }
      const kind = kinds[Math.floor(r() * kinds.length) % kinds.length];
      const size = KIND_SIZE[kind] ?? KIND_SIZE.parked;
      const d = i * slot + (r() - 0.5) * M(1.0);
      out.push({
        id: `${tile.id}-${kind}-${i}-${side}`,
        kind,
        x: link.from.x + ux * d + nx * offsetFor(kind) * side,
        y: link.from.y + uy * d + ny * offsetFor(kind) * side,
        rot: (Math.atan2(uy, ux) * 180) / Math.PI,
        hl: size.hl,
        hw: size.hw,
        parked: kind === "parked" && lay.park > 0,
        side,
      });
    }
  }
  return { props: out, driveways: drives };
}

/* What stands beside the road. */
export function curbsideFor(tile, link, seed = 1) {
  return stripFor(tile, link, seed).props;
}

/* Where the row is broken for a house. Only on a character that has them
   — "you would never see this type of parking along a major road". */
export function drivewaysFor(tile, link, seed = 1) {
  return stripFor(tile, link, seed).driveways;
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
  const activity = c.curbside.activity;
  if (activity <= 0) return [];

  const r = rng(seed);
  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  /* People stand on the pavement, BEYOND the parked cars -- which is what
     makes the cars matter: somebody emerging has to come out from between
     them, and is hidden until they do. */
  const offset = curbLayout(tile.character).verge;

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
   tiles in which order, and which way to turn at each intersection.
   ===================================================================== */

/* A drive that turns. Silence means straight on, so a route of nothing
   but straight-ahead intersections asks the examiner for no instructions at
   all and the directing task disappears — which makes "does this route
   present real decisions" a property worth planning for rather than
   hoping for. */
export const TURN_SHARE = 0.55;

/* A intersection's shape, for planning. The candidate always stops at one --
   compose() puts them on a controlled leg and holds them -- so the only
   thing a plan gets to choose is which way they go. `prior` is assumed
   rather than known, because whether the traffic that turns up outranks
   them is decided by the draw and not by the route; how far that
   assumption strays from the scenes actually produced is measured in
   verify-candidate.mjs rather than waved through. */
const intersectionShape = (intent) => shapeOf({ stops: true, intent, prior: true });

/* Which of the turns on offer is worth most to this driver, given what
   the route has already promised their other habits. */
const bestTurn = (candidate, turns, owed) =>
  turns.reduce(
    (best, x) =>
      valueOfShape(candidate, intersectionShape(x), owed) >
      valueOfShape(candidate, intersectionShape(best), owed)
        ? x
        : best,
    turns[0]
  );

export function planDrive({
  seed = 1,
  length = 6,
  library = TILES,
  from = "S",
  turnShare = TURN_SHARE,
  candidate = null,
} = {}) {
  const r = rng(seed >>> 0);
  const plan = [];
  let entry = from;
  /* What the route has already given each habit a chance at. A forecast,
     not a tally of showings -- the scenes do not exist yet. */
  const owed = {};
  const credit = (intent) => {
    for (const t of chancesAt(intersectionShape(intent))) owed[t] = (owed[t] || 0) + 1;
  };

  for (let i = 0; i < length; i++) {
    /* Vary the character along the drive rather than picking uniformly,
       so a route moves between kinds of difficulty — a seeing problem,
       then a timing problem — instead of staying at one pitch. */
    const tile = pickTile(r, library, plan);
    const spec = specFor(tile.character);
    const legal = validIntents(spec, entry);
    if (!legal.length) break;

    /* The last intersection is always straight on: there is nothing after it
       to turn into, and directing a candidate off the end of the world
       is not a decision. */
    const last = i === length - 1;
    const turns = legal.filter((x) => x !== "straight");
    /* Whether to turn is left exactly as it was -- a route still has to
       read like a route, not like a trait-delivery mechanism. What the
       candidate gets to influence is WHICH turn, and only among turns the
       intersection was going to offer anyway.

       A left is where cutsCorner shows and a right is not, so a driver who
       cuts corners on a route that only ever turns right has had their
       character hidden rather than the player's eye tested. Measured
       before this existed: cutsCorner reached a habit's worth of showings
       on 1 drive in 3, against wander on 3 in 3. */
    const goStraight = last || !turns.length || r() > turnShare;
    let intent;
    if (goStraight) {
      intent = legal.includes("straight") ? "straight" : turns[0];
    } else {
      /* The draw happens whether or not it is used, so a steered plan and
         an unsteered one walk the same random stream and differ only where
         the candidate actually changed a choice. Skipping it would have
         reshuffled every route and made the comparison meaningless -- the
         same uncontrolled-comparison mistake this stage has caught before,
         one layer down. */
      const drawn = turns[Math.floor(r() * turns.length) % turns.length];
      intent = candidate && turns.length > 1 ? bestTurn(candidate, turns, owed) : drawn;
    }

    credit(intent);
    plan.push({ tile, spec, intent, entry, index: i });
    entry = OPPOSITE[exitSideFor(entry, intent)];
  }

  /* A route of nothing but straight-ahead intersections asks the examiner for
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
      const drawn = turns[Math.floor(r() * turns.length) % turns.length];
      plan[at].intent = candidate && turns.length > 1 ? bestTurn(candidate, turns, owed) : drawn;
      // Everything after that intersection now enters from a different side.
      let e = OPPOSITE[exitSideFor(plan[at].entry, plan[at].intent)];
      for (let i = at + 1; i < plan.length; i++) {
        plan[i].entry = e;
        const legal = validIntents(plan[i].spec, e);
        if (!legal.includes(plan[i].intent)) plan[i].intent = legal.includes("straight") ? "straight" : legal[0];
        e = OPPOSITE[exitSideFor(e, plan[i].intent)];
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

/* Turn a plan into a drive the world can measure: each intersection placed at
   the spacing its tile's declared runway requires, with the scenario that
   populates it carrying that intersection's own intent. */
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
   comes from the tile's curbside density; the traffic comes from the
   brief its character chose; and what is actually markable comes from
   faultsIn, the same derivation the scorer grades against. So pacing
   steers WHICH INTERSECTION COMES NEXT and how often its drivers err — it
   never adds a difficulty multiplier of its own, because a second dial
   would drift away from the first the moment either was tuned.

   Measured before this existed: a generated drive offered ZERO faults,
   because compose.js attached no driver traits at all. Supply was not
   thin, it was absent. With traits attached the longest dead stretch across
   eight drives fell to 42.5s, average 34.1s — real, but uneven enough that
   two or three intersections in six still offer nothing.
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
   an intersection can answer is when the candidate reaches it, which put the
   worst case at ceiling plus one leg.

   The remaining gaps are on arterial stretches, and they are CORRECT. An
   arterial has a curbside activity of 0.15 because a fast open road
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

/* What an intersection is asked for, given how long it has been since anything
   was worth marking. Everything except the fault rate comes from the
   tile's own character, untouched. */
export function briefFor(tile, sinceLastEvent, legTime = 0) {
  const brief = { ...CHARACTER[tile.character].brief };
  /* PREDICTIVE, not reactive. Asking "has the gap exceeded the ceiling"
     reacts a whole leg late, because the earliest an intersection can answer is
     when the candidate reaches it -- measured, that put the worst dead
     stretch at ceiling plus one leg, 33s against a 25s target. Asking
     "will it have, by the time we get there" spends the same budget one
     intersection earlier. */
  const projected = sinceLastEvent + legTime;
  /* Past the ceiling the intersection must produce something markable, not
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
    /* Intersection faults and segment faults land on ONE timeline, because
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

/* Populating one intersection, with somewhere to fall back to.

   Demanding a fault makes the search fail more often -- composeScenario
   already returns nothing on about a fifth of heavy briefs, and an extra
   condition tightens that. An empty intersection is the worst possible answer
   to "the drive has gone quiet", so the ask is relaxed in steps rather
   than abandoned: insist on a fault, then merely lean toward one, then
   take whatever the road character would have given anyway.

   The fallback is a CHAIN, not a second generator. Every step is the same
   composeScenario against the same brief vocabulary, so nothing here
   knows anything the rest of the system does not. */
export function composeForTile(tile, sinceLastEvent, seed, opts = {}) {
  const { legTime = 0, candidate = null, at = null, show = null } = opts;
  const wanted = briefFor(tile, sinceLastEvent, legTime);
  const plain = CHARACTER[tile.character].brief;

  /* Who is driving, and which way the route says they go. Both are the
     SAME driver at every intersection -- before this the composer invented a
     flawless ego of its own and re-decided the turn, and the plan's
     (entry, intent) survived 9 times in 120. */
  /* The scene's own seed compiles the driver's errors, so the same
     candidate at the same intersection errs identically on every replay. */
  const ego = candidate ? egoFor(candidate, { from: at?.from, intent: at?.intent, seed }) : null;
  const place = at ? { from: at.from, intent: at.intent } : null;
  const driver = ego || place ? { ...(ego || {}), ...(place || {}) } : null;

  /* The ladder gains one rung at the top and keeps the rest. Asking for a
     particular habit to show SUBSUMES asking for any fault at all -- a
     showing by the candidate is a fault -- so the strictest rung is the
     new one, and everything below it is the chain that already existed.

     A habit that cannot show at this intersection must not cost the intersection:
     rung 1 drops the demand rather than the draw. */
  const ladder = [
    show && show.length ? { brief: wanted, show } : null,
    { brief: wanted },
    wanted.mustFault ? { brief: { ...wanted, mustFault: false } } : null,
    { brief: plain },
    { brief: { ...plain, traffic: "light" } },
  ].filter(Boolean);

  for (let i = 0; i < ladder.length; i++) {
    /* The first attempt uses the caller's own seed, so steering a brief
       and not steering it draw the SAME scenario space and can be
       compared honestly. Deriving a seed here made every measurement of
       whether pacing helps a comparison between different draws. */
    const s = i === 0 ? seed : (seed * 2654435761 + i * 40503) >>> 0;
    const scn = composeScenario(ladder[i].brief, s, {
      ...(driver ? { ego: driver } : {}),
      ...(ladder[i].show ? { mustShow: ladder[i].show } : {}),
    });
    if (scn) return { scn, brief: ladder[i].brief, relaxed: i, asked: ladder[i].show ?? null };
  }
  return { scn: null, brief: null, relaxed: ladder.length, asked: null };
}

/* =====================================================================
   SEGMENT HAZARDS

   Intersections were the only source of markable events, and a leg takes
   about ten seconds, so no amount of pacing could react faster than a
   intersection arrived. That is what structurally capped dead air at ~40s
   against a 25s target. This is the piece that lifts it.

   BUILT FROM THE ROADSIDE CONTENT THAT ALREADY EXISTS. roadsideLifeFor
   decides where the people are and curbsideFor decides where the props
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
   it exactly as at an intersection.
   ===================================================================== */

/* =====================================================================
   WHICH WAY A HAZARD SCENE POINTS

   A hazard is a little scenario placed at a point on a link, and it was
   only ever PLACED -- never turned. The spec was fixed N-S and the ego
   always entered from "S", so on a link running any other way the
   notional candidate drove ACROSS the road they were supposed to be on.
   Measured before the fix: 29 of 70 hazard scenes pointed the right way,
   35 were at right angles and 6 were backwards. A pedestrian stepping
   off the curb walked along the carriageway; a car leaving a driveway
   pulled out sideways across the street.

   Everything derived from that scene inherited the error -- what the
   candidate could see, when they registered it, whether they could have
   avoided it -- so every measurement of the segment-hazard system was
   taken through a scene half of which was sideways.

   THIS IS route.js's PROBLEM ONE LEVEL DOWN, and route.js already solved
   it: a scenario carries an orientation as well as a position, and a
   rotated scene is the same situation pointing a different way. Hazards
   never used that machinery, and `isRotatable` would have refused them
   anyway because they carry sightBlockers with fixed coordinates.

   So the scene is BUILT facing the right way rather than rotated
   afterwards, which is cheaper and removes the blocker problem: pick the
   leg whose local travel direction already equals the link's world
   direction, and the two frames then differ by a TRANSLATION alone.
   Nothing has to be spun, and a blocker's coordinates carry across
   unchanged. World links run on a grid, so such a leg always exists.

   The invariant that makes it work, checked in verify-world: the
   candidate is always on the side `n = (-uy, ux)` points to -- the right
   of travel, in every one of the four directions -- so `side: +1` is the
   near curb whichever way the road runs.
   ===================================================================== */

/* Which leg the candidate enters by, so that driving straight through
   takes them the way the link actually goes. */
export function entryForLink(link) {
  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "W" : "E";
  return dy >= 0 ? "N" : "S";
}

/* A straight road of the character's own width, on the axis the entry leg
   implies. `control: "none"` because there is nothing here to stop for --
   the hazard is the point, not a right-of-way puzzle. */
export function straightSpecFor(character, from = "S") {
  const lanes = CHARACTER[character].lanes;
  const leg = { lanes, control: "none" };
  return from === "E" || from === "W"
    ? { legs: { E: leg, W: leg } }
    : { legs: { N: leg, S: leg } };
}

/* The scene's own frame: the local travel direction and the offset to its
   right, matching the link's by construction. */
function frameOf(from) {
  const u = from === "S" ? { x: 0, y: -1 }
    : from === "N" ? { x: 0, y: 1 }
    : from === "W" ? { x: 1, y: 0 }
    : { x: -1, y: 0 };
  return { u, n: { x: -u.y, y: u.x } };
}

/* An OFFSET from the scene's own centre: so far along the road, so far to
   the right of it. Kept as an offset rather than a coordinate because
   placeScenario moves the scene by handing every participant the scene's
   placement, and a participant holding an absolute position would be
   built in one frame and drawn in another. */
function offsetInScene(from, dAlong, across) {
  const { u, n } = frameOf(from);
  return { x: u.x * dAlong + n.x * across, y: u.y * dAlong + n.y * across };
}

/* One hazard, placed where the roadside life already put somebody.

   The candidate meets them at whatever time their distance along the link
   implies, so the hazard's own clock is the drive's clock offset -- the
   same relationship an intersection has to the drive. */
/* A HAZARD AND AN OBSTRUCTION ARE NOT THE SAME THING, and conflating
   them is what put frequency and pace in direct conflict: every piece of
   street life stopped the car, so a lively street was an obstacle course
   and the only lever was to have less of it.

   Separated, the conflict dissolves.

     BLOCKING      somebody steps out in front of the candidate and the
                   road is legally theirs until they are past the near
                   half. Costs a real ~6s hold, so these stay rare and
                   strictly gated by the pacing budget, and are genuinely
                   alarming when they happen.

     NON-BLOCKING  somebody steps off the curb as the car clears them,
                   or is simply standing at the edge of it. No legal
                   hold, no stop, and the candidate drives on either way.
                   These can be frequent and cost nothing.

   WHAT MAKES A NON-BLOCKING HAZARD MARKABLE is the only question it
   asks: did the driver notice. That is clearance — how much room they
   left somebody entitled to it — which `clearance.js` already measures
   in seconds, and which `causeOf` attributes to OBSERVATION or
   CONFIDENCE by whether the candidate had registered them.

   That axis has had the least expression available to it, because
   almost every other fault needs a stop in order to happen. This is the
   class of content that does not.

   The distinction is a PROPERTY OF THE HAZARD, not a second generator:
   same roadsideLifeFor placing the same people, same scenario shape. */
export function hazardAt(tile, link, person, { candidate = null, seed = 1, blocking = true } = {}) {
  const entry = entryForLink(link);
  const spec = straightSpecFor(tile.character, entry);
  const speed = CHARACTER[tile.character].speed;

  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const along = ((person.x - link.from.x) * dx + (person.y - link.from.y) * dy) / len;
  const reachesAt = along / speed;

  /* The person crosses from the curb they are standing on. `side` came
     from roadsideLifeFor, so which way they step is decided once, where
     they were placed, rather than again here.

     Their leg is the candidate's own approach or the far one -- near or
     far along the road -- and it has to be on the SAME AXIS as the
     candidate's, or they cross a road nobody is driving on. */
  const from = person.side < 0 ? entry : OPPOSITE[entry];

  return {
    id: `haz-${person.id}`,
    road: spec,
    control: "none",
    /* THE SCENE SITS ON THE ROAD'S CENTRELINE, not on the person. `at` is
       where the scene's own centre lands in the world, and putting the
       person there shifted the whole road sideways by however far from
       the curb they were standing. */
    at: {
      x: link.from.x + (dx / len) * along,
      y: link.from.y + (dy / len) * along,
    },
    reachesAt,
    /* The same driver who is at the intersections. A segment used to take
       whatever traits its caller felt like handing it, which made the
       candidate two different people on one drive. */
    ego: {
      ...egoFor(candidate, { from: entry, intent: "straight", arriveAt: 0, stops: false, seed }),
      departAt: 0,
      cruise: speed,
    },
    actors: [{
      id: person.id,
      from,
      intent: "straight",
      /* Timed so they are stepping out as the candidate arrives, which is
         what makes the parked cars matter: seen early it is nothing, seen
         late it is everything.

         A NON-BLOCKING ONE STEPS OFF AS THE CAR CLEARS THEM, and the lead
         is derived rather than picked: one car length at this road's
         speed is exactly how long the candidate takes to go past. So the
         gap they are given follows from the geometry, and lands wherever
         the clearance bands say it lands. */
      arriveAt: blocking ? 0.8 : 0.8 + CAR_L / speed,
      stops: false,
      kind: "ped",
      colorKey: "pale",
      name: "Pedestrian",
      priority: -1,
      /* The legal hold is what makes a hazard an obstruction. Without it
         the candidate has no duty to stop and the only question left is
         how much room they left, which is the point. */
      ...(blocking ? { blockUntilClear: true } : {}),
      reverse: person.side < 0,
    }],
    blocking,
  };
}

/* A CAR JOINING THE ROAD FROM A SPACE BESIDE IT.

   The observation axis's content, and the reason is that the fault is
   purely one of ANTICIPATION: the emerging driver's view is obstructed,
   the candidate cannot see them until they move, and nothing about it
   requires anybody to stop. Almost every other fault in this game needs a
   stop in order to happen.

   Placed at the mouth of a court where the tile has one, and in a
   parallel space otherwise -- the same layout the props are drawn from,
   so the car is standing where a car would be standing.

   `emerges` picks up index.js's movement shape; nothing here knows how
   the arc is built, only where the car starts and which lane it joins. */
export function emergingAt(tile, link, at, seed = 1, { candidate = null, fromDriveway = false, blockers = [] } = {}) {
  const lay = curbLayout(tile.character);
  const speed = CHARACTER[tile.character].speed;
  const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;

  /* THE SCENE FACES THE WAY THE ROAD GOES, and everything in it is built
     in the scene's own frame rather than the world's. It used to be built
     in world coordinates and then handed to placeScenario, which stamps
     the scene's placement onto every participant -- so the car's resting
     place and the candidate's road were two different notions of where
     this hazard is, agreeing only on links that happened to run north. */
  const entry = entryForLink(link);
  const heading = Math.atan2(frameOf(entry).u.y, frameOf(entry).u.x) * 180 / Math.PI;

  const side = at.side ?? 1;
  const out = fromDriveway && lay.driveway
    ? lay.driveway.mouth + lay.driveway.depth / 2
    : lay.parkCentre;
  const d = at.along;

  const rest = offsetInScene(entry, 0, out * side);
  /* Nose-in to a driveway, so it comes out BACKWARDS across the parking
     lane; alongside the curb in a parallel space, so it pulls out
     forwards. Same movement shape, different resting heading. */
  const restRot = fromDriveway ? heading + 90 * side : heading;
  const lane = lay.laneEdge / 2;
  const join = M(18);

  return {
    id: `emerge-${tile.id}-${Math.round(d)}-${side}`,
    road: straightSpecFor(tile.character, entry),
    control: "none",
    /* The scene's centre on the road's centreline, at this point along the
       link -- so placeScenario drops the whole thing where it belongs. */
    at: {
      x: link.from.x + ux * d,
      y: link.from.y + uy * d,
    },
    reachesAt: d / speed,
    /* THE CARS THAT HIDE THEM. Without these the emerging car is in plain
       sight from the first frame, so the candidate always registers the
       danger in time and the fault can only ever be confidence -- which is
       exactly what was measured, 9 of 9. The whole property that makes
       this hazard worth having is that the driver's view is obstructed
       and THE CANDIDATE CANNOT SEE THEM UNTIL THEY MOVE.

       curbsideFor already emits the { x, y, rot, hl, hw } shape
       sightBlockersOf reads, so the row of parked cars becomes occlusion
       without anything downstream learning a new type. */
    /* THE ONE THING THAT STAYS IN WORLD COORDINATES, and it has to.
       sightBlockers are read straight off the scenario and tested against
       poses that placeScenario has already moved into the world, so a
       blocker written in the scene's frame would sit hundreds of metres
       from the sightline it is supposed to interrupt.

       Filtered by distance ALONG the road rather than straight-line, so
       the same stretch of curb is considered whichever way the link
       runs. */
    sightBlockers: blockers
      .filter((b) => Math.abs((b.x - link.from.x) * ux + (b.y - link.from.y) * uy - d) < M(22))
      .map((b) => ({ id: b.id, x: b.x, y: b.y, rot: b.rot, hl: b.hl, hw: b.hw })),
    /* THE ANTICIPATION WINDOW IS BUILT IN, not hoped for. The car starts
       moving at once and the candidate is still this far up the road --
       their own reaction floor plus the distance they need to stop
       comfortably at this road's speed. So a response always exists from
       the moment the danger begins, which is what makes it a test of
       reading the situation rather than a trap.

       Without it the emergence was unavoidable in 31 of 36 cases, and an
       unavoidable collision fails a candidate who could not have done
       anything -- exactly the unfairness the whole redesign has been
       avoiding. The rule is "failing to prevent a collision WHEN YOU
       OTHERWISE COULD"; if they could not, there is no fault. */
    ego: {
      ...egoFor(candidate, {
        from: entry, intent: "straight",
        arriveAt: REACTION_FLOOR + speed / approachDecel(speed),
        stops: false, seed,
      }),
      cruise: speed,
    },
    actors: [{
      id: `em-${Math.round(d)}-${side}`,
      kind: "car",
      colorKey: "amber",
      name: "Car leaving a driveway",
      emerges: true,
      /* Its own place in the scene, kept out of `at` because
         placeScenario overwrites `at` with the scene's placement -- the
         two were one field doing two jobs, which is what put the car and
         the road it was leaving in different frames. */
      rest: { x: rest.x, y: rest.y },
      restRot,
      /* Where they are going: the near lane, a short way up the road. */
      into: { ...offsetInScene(entry, join, lane * side), rot: heading },
      /* AND ON UP THE ROAD THEY HAVE JOINED. Not a distance somebody
         picked: it is the rest of this link, because that is how much road
         there is to be traffic on. */
      onward: offsetInScene(entry, Math.max(join + M(4), len - d), lane * side),
      reversing: fromDriveway,
      clearBy: fromDriveway ? lay.driveway.depth : 0,
      /* THEY ARE ALREADY THERE, so arriveAt is zero and the moment they
         pull out is a startDelay -- which is the knob schedule() actually
         honours for a rolling car (departAt = arriveAt + startDelay). A
         departAt written here is overwritten, which cost a measurement
         that came back identical at every value.

         WHEN THEY GO IS PLACED AT THE BOUNDARY OF AVOIDABILITY, and that
         is a design statement rather than a fitted number.

         An emerging driver commits when the road looks clear as far as
         they can see, and from a driveway between parked cars that is not
         far. Set too late, the collision is unavoidable however alert the
         candidate is -- measured, 95 contacts in 111 with NOT ONE
         avoidable, which by the maintainer's own rule is nobody's fault
         and therefore not content at all. Set too early and nothing ever
         happens.

         So it is derived from the CANDIDATE'S OWN STOPPING PHYSICS: the
         car pulls out as the candidate reaches the distance they need to
         stop comfortably from this road's speed, plus the time to react.
         An alert candidate stops; an inattentive one does not. Attention
         is then the only thing that decides the outcome, which is exactly
         what a hazard of anticipation should test. */
      arriveAt: 0,
      /* They go at once; the window is the candidate's approach above. */
      startDelay: 0,
      stops: false,
      speed: M(4.0),
    }],
    emerging: true,
  };
}

/* Every hazard along one link, and the blockers that hide them.

   Only the people roadsideLifeFor marked as `mayEmerge` become hazards;
   the rest are scenery, which is the difference between a street that is
   busy and a street that is dangerous. */
export function segmentHazards(tile, link, seed = 1, { candidate = null } = {}) {
  const people = roadsideLifeFor(tile, link, seed);
  const blockers = curbsideFor(tile, link, seed);
  /* EVERY person beside the road is a hazard; `mayEmerge` decides only
     which KIND. The ones who might step out in front are blocking and
     the pacing budget gates them; everybody else is somebody you pass
     close to, which costs nothing and still has to be noticed. A street
     where every pedestrian forces an emergency stop is an obstacle
     course; one full of people who mostly do not step out, but might, is
     a place. */
  /* A CAR JOINING FROM A SPACE, one per link where the road has parking.
     Non-blocking by nature: nobody has to stop, the only question is
     whether the candidate saw it coming. Placed where a parked car
     actually is, so it emerges from a row rather than from nowhere. */
  const parked = blockers.filter((b) => b.parked);
  const lay = curbLayout(tile.character);
  const emerging = [];
  /* NOT LIVE YET, and deliberately so. As timed, a car leaving a space
     collides with the candidate in 95 of 111 cases and NOT ONE of those
     is avoidable even from a competent observer's reaction floor -- it
     sits across the candidate's path with no escape. That is broken
     content rather than a hard hazard: an unavoidable collision is, by
     the maintainer's own rule, nobody's fault, and at 3.5 per drive it
     would end almost every drive.

     The movement shape, the placement, the drawing and the avoidability
     fault class are all built and verified; what is wrong is the timing
     and clearance of this one scenario. Kept behind a flag rather than
     deleted, because everything except that is right. */
  /* STILL NOT LIVE, and the reason has changed twice now. It is no longer
     that the collisions are unavoidable -- 13 of 13 are avoidable, the
     candidate eases off in 99% of cases, and all three attribution
     branches fire. It is that A COLLISION HAS NO REPRESENTATION IN THE
     DRIVE: outcome.js knows a contact ends a drive and ExaminerDrive does
     not consult it, so shipping this would put cars into the candidate's
     path with nothing acknowledging what happened when one is hit.

     That is the intervention question, still the maintainer's. The
     content is ready and gated on it rather than on itself. */
  const LIVE = false;
  const drives = drivewaysFor(tile, link, seed);
  /* WHERE THE CAR LEAVING FROM IS, and the two cases are different
     places rather than the same place with a flag on it. A car reversing
     out comes from a DRIVEWAY — a break in the row — and a car pulling
     forward out comes from a PARKING SPACE, which is a car that is
     really there.

     Before this both came from a parked car's own slot, so the reversing
     car was standing exactly where a parked car was standing: it would
     have driven through it, and that car was then handed back as one of
     its own sight blockers, which is what kept it invisible until it
     moved. */
  /* ON THE CANDIDATE'S OWN SIDE, because a car pulling out on the far
     curb joins the opposite lane and never crosses their path -- it is
     street life, not a hazard, and counting it as one was inflating the
     supply with scenes nobody could interact with. `side: +1` is the near
     curb whichever way the road runs; see entryForLink. */
  const near = (x) => (x.side ?? 1) > 0;
  const drivesNear = drives.filter(near), parkedNear = parked.filter(near);
  const fromDriveway = drivesNear.length > 0 && seed % 2 === 0;
  const pool = fromDriveway ? drivesNear : parkedNear;
  const pick = pool.length ? pool[seed % pool.length] : null;
  if (LIVE && pick) {
    const dx = link.to.x - link.from.x, dy = link.to.y - link.from.y;
    const len = Math.hypot(dx, dy) || 1;
    const along = fromDriveway
      ? pick.along
      : ((pick.x - link.from.x) * dx + (pick.y - link.from.y) * dy) / len;
    let scn = emergingAt(tile, link, { along, reach: along / CHARACTER[tile.character].speed, side: pick.side ?? 1 }, seed, { candidate, fromDriveway, blockers: parked });
    /* AND THE CANDIDATE RESPONDS TO IT, or does not. Built once, simulated
       once to find out what they registered, then rebuilt with whatever
       response that earns them -- so a good observer eases off and a poor
       one carries on, from the same scene. Two passes at composition time,
       resolved from the seed, so ground truth stays replayable. */
    const eased = responseOnAwareness(simulate(scn), scn, candidate, seed);
    if (eased) {
      scn = { ...scn, ego: { ...scn.ego, yielding: { from: eased.from, give: eased.give, wait: eased.wait } } };
    }
    emerging.push({ blocking: false, emerging: true, fromDriveway, scn, person: null, blockers: parked });
  }

  return emerging.concat(people
    .map((p) => ({
      blocking: Boolean(p.mayEmerge),
      scn: hazardAt(tile, link, p, { candidate, seed, blocking: Boolean(p.mayEmerge) }),
      person: p,
      /* The props near them, as ordinary sightBlockers -- the same shape
         sightBlockersOf reads, so the hazard occludes without anything
         downstream learning a new type. */
      blockers: blockers.filter(
        (b) => Math.hypot(b.x - p.x, b.y - p.y) < M(18)
      ),
    })));
}
