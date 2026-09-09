/* =====================================================================
   THE CONTINUOUS WORLD — first increment

   Deliberately the smallest thing that can answer one question: is the
   viewport actually scarce once intersections are far enough apart to be
   directable? `tools/gate-viewport.mjs` is the acceptance test and this
   exists to be measured by it. See WORLD-DESIGN.md.

   What is here: intersections placed at world origins, joined by straight
   link road, and the candidate's continuous pose across the whole drive.

   What is NOT here, on purpose: tiles, road character, curbside content,
   pacing, streaming, route planning. Those are stages W2 onward and
   building them before the gate answers would be building on a guess.

   THE GRID IS A CHOSEN CONSTRAINT. Roads are axis-aligned because `LEG`
   is four discrete compass entries, and that is a design decision rather
   than an inherited limitation — no continuous bends, no diagonals.
   Roundabouts do not fit the lattice and will need explicit handling.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { M, CX, CY, LANE, SET, simulate, poseAt, basePose } from "./index.js";
import { crossSpec, stopPoint, exitPoint, exitSideFor, boxHalf, laneOffset, LEG, OPPOSITE } from "./road.js";
import {
  linePath, pathLength, poseOn, progressAt, cruiseProfile, yieldingProfile, MOST_GIVE,
} from "./paths.js";

/* Where an intersection's exit actually is, in the world.

   road.js's exitPoint puts it at the edge of a 720x720 BOARD, which does
   not translate with the intersection origin — an intersection placed elsewhere
   gets an exit in the wrong place entirely. That is fine for scenario
   play, where there is only ever one intersection and it sits at the board
   centre, and it is the design's own assumption 2.3.1: exits lead
   off-board rather than to the next intersection.

   The world needs the other thing: an exit just past this intersection's own
   box, which translates with the intersection and scales with its width. A
   wider intersection therefore consumes more on the way out, which is correct
   and is half of why an arterial is harder to give enough runway.

   Deliberately NOT a change to exitPoint. Moving the scenario exit would
   change every traverse length and move every window in engine-golden. */
export function worldExitOf(spec, side, at, lane = 0, clearance = M(4)) {
  const leg = LEG[side];
  const { vx, hy } = boxHalf(spec, LANE);
  const off = laneOffset(lane, LANE);
  const reach = (leg.out.x !== 0 ? vx : hy) + clearance;
  return leg.out.x !== 0
    ? { x: at.x + leg.out.x * reach, y: at.y - leg.off.y * off }
    : { x: at.x - leg.off.x * off, y: at.y + leg.out.y * reach };
}

/* Which way you travel having entered from a given leg, as a unit vector.
   Entering from the south you are heading north, which is -y on screen. */
const HEADING_VEC = {
  S: { x: 0, y: -1 },
  N: { x: 0, y: 1 },
  W: { x: 1, y: 0 },
  E: { x: -1, y: 0 },
};

/* Intersections in a line, `spacing` apart, along the direction the candidate
   is travelling. The lattice in its simplest form: one road, N intersections.

   Spacing is the whole design variable — see WORLD-DESIGN.md section 1.
   Below about 63m an intersection cannot be directed at all; above about 140m
   the drive is empty road. */
export function placeIntersections({ from = "S", spacing = M(80), count = 2, origin, intents = [] } = {}) {
  const start = origin ?? { x: CX, y: CY };
  const out = [];
  let at = { ...start }, entry = from;
  for (let i = 0; i < count; i++) {
    out.push({ index: i, at: { ...at }, from: entry });
    /* The next intersection sits along the road the candidate actually LEAVES
       on, which is decided by its intent here -- not blindly ahead. Place
       an intersection north of one the candidate turns west at and the link
       becomes a diagonal the grid does not have. */
    const intent = intents[i] ?? "straight";
    const leaving = exitSideFor(entry, intent);
    const dir = HEADING_VEC[OPPOSITE[leaving]];
    at = { x: at.x + dir.x * spacing, y: at.y + dir.y * spacing };
    entry = OPPOSITE[leaving];
  }
  return out;
}

/* Stamp an intersection origin onto every participant in a scenario, so that
   movementOf builds this intersection wherever it has been placed. Nothing
   about the scenario itself changes — it is still leg, intent and time,
   which is exactly why this works at all. */
export function placeScenario(scn, at) {
  return {
    ...scn,
    at,
    ego: { ...scn.ego, at },
    actors: (scn.actors ?? []).map((a) => ({ ...a, at })),
  };
}

/* =====================================================================
   The candidate's drive across more than one intersection.

   Three phases per intersection pair: through the intersection, along the link
   road, through the next. The link is where the world lives — it is the
   part a single scenario never had, and the reason the two examiner jobs
   can be in different places at all.
   ===================================================================== */

/* Where the candidate physically enters and leaves a placed intersection. */
export function intersectionPorts(j, spec, intent) {
  const entry = stopPoint(spec, j.from, LANE, SET, 0, j.at.x, j.at.y);
  const exitSide = exitSideFor(j.from, intent);
  return { entry, exitSide };
}

/* The straight road joining one intersection to the next, as a path the
   candidate actually drives. Its length is the spacing minus whatever the
   two intersections themselves consume, which is why spacing has to be
   measured centre to centre and checked here rather than assumed. */
export function linkBetween(a, b, spec, speed, intent = "straight", fromSpec, profile = null) {
  /* The link starts where the PREVIOUS intersection's traverse ends, not at
     its stop line. Getting that wrong is the first assumption the design
     called out -- exits lead off-board rather than to the next intersection --
     and it costs the whole runway: measured, a link begun at the stop line
     leaves only 22m of approach out of 80m of spacing, because the
     candidate is placed 8m behind an intersection it has already driven
     through. */
  /* WHERE THE TRAVERSE ACTUALLY ENDS, which is exitPoint and not
     worldExitOf. Those were two implementations of one quantity -- the
     recurring bug in this project -- and the gap between them, 22m out
     against 7.6m out, is a 12m BACKWARDS SNAP at every intersection exit:
     the candidate finishes their traverse and the link starts behind
     them. It read as the view cutting.

     worldExitOf was written because exitPoint was board-relative and
     could not be moved without disturbing engine-golden. exitPoint is now
     origin-aware and provably identical at the default origin, so that
     reason is gone and the two can be one again. worldExitOf stays for
     spacing, where "just past this intersection's box" is the right question
     and scales with its width. */
  const raw = exitPoint(exitSideFor(a.from, intent), LANE, 0, a.at.x, a.at.y);
  const to = stopPoint(spec, b.from, LANE, SET, 0, b.at.x, b.at.y);
  /* exitPoint returns a position and no heading, and poseOn reads
     `from.rot` for a straight path -- so without this the candidate drives
     the link with an undefined rotation and every frame built on it comes
     out NaN. */
  const rot = (Math.atan2(to.y - raw.y, to.x - raw.x) * 180) / Math.PI;
  const from = { ...raw, rot };
  /* A link is a cruise unless something on it makes the candidate give
     way. A pedestrian stepping out of a driveway is exactly that, and
     without it the drive would run them over at a constant speed --
     `hazardAt` times them to step out AS THE CANDIDATE ARRIVES, so the
     conflict is the design rather than an accident of placement. */
  const path = linePath(from, to, profile ?? cruiseProfile(speed));
  return { path, from, to, length: pathLength(path) };
}

/* How far apart two placed intersections actually are, centre to centre. The
   number the gate cares about. */
export function spacingOf(a, b) {
  return Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y);
}

/* =====================================================================
   A drive, as something with a clock.

   Each intersection is simulated as an ordinary scenario — intersection-local,
   because simulate() is O(n^2) and a world-scale simulation is not
   affordable at any traffic density worth having. The world's only job is
   to say where each intersection is and when the candidate reaches it.
   ===================================================================== */
export function driveThrough({ legs, spacing = M(80), spec = crossSpec(), speed }) {
  const js = placeIntersections({
    from: legs[0].ego.from,
    spacing,
    count: legs.length,
    intents: legs.map((l) => l.ego.intent ?? "straight"),
  });
  const placed = legs.map((scn, i) => {
    const withAt = placeScenario(scn, js[i].at);
    return { intersection: js[i], scn: withAt, sim: simulate(withAt) };
  });

  /* World time at which the candidate arrives at each intersection's line.
     The first is its own arriveAt; each later one adds the time to cover
     the link at the speed the road carries. */
  const v = speed ?? M(11.5);
  /* Two clocks per intersection: when the candidate reaches its line, and when
     it has cleared the intersection entirely. The gap between the second of
     one and the first of the next is the link, and that is where the
     runway for the next instruction lives. */
  const arrivals = [], exits = [], links = [];
  arrivals.push(placed[0].scn.ego.arriveAt ?? 0);
  for (let i = 0; i < placed.length; i++) {
    const leg = placed[i];
    const localArrive = leg.scn.ego.arriveAt ?? 0;
    const localDepart = leg.sim.ego.departAt ?? localArrive;
    exits.push(arrivals[i] + (localDepart - localArrive) + spanOfTraverse(leg.sim.ego));
    if (i + 1 < placed.length) {
      const intent = leg.scn.ego.intent ?? "straight";
      const link = linkBetween(js[i], js[i + 1], spec, v, intent);
      links.push(link);
      arrivals.push(exits[i] + link.length / v);
    }
  }

  return { intersections: js, legs: placed, arrivals, exits, links, spacing, spec, speed: v };
}

function spanOfTraverse(p) {
  const mv = poseAt(p, (p.departAt ?? 0)) ? null : null;
  // Duration of the intersection traverse, read off the path the engine built.
  const probe = basePose(p, (p.departAt ?? 0) + 0.001);
  if (!probe) return 0;
  let lo = 0, hi = 20;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const q = basePose(p, (p.departAt ?? 0) + mid);
    if (q && q.gone) hi = mid; else lo = mid;
  }
  return hi;
}

/* Where the candidate is in the world at time t: inside an intersection if it
   is between that intersection's arrival and its exit, otherwise on the link
   between two of them. */
export function candidateAt(drive, t) {
  const { legs, arrivals, exits, links } = drive;
  for (let i = legs.length - 1; i >= 0; i--) {
    if (t < arrivals[i]) continue;
    const leg = legs[i];
    const local = t - arrivals[i] + (leg.scn.ego.arriveAt ?? 0);

    if (t < exits[i]) {
      const p = poseAt(leg.sim.ego, local);
      if (p && Number.isFinite(p.x)) return { ...p, intersection: i, phase: "intersection", local };
    }
    if (i + 1 < legs.length) {
      const link = links[i];
      const k = progressAt(link.path, Math.max(0, t - exits[i]));
      return {
        ...poseOn(link.path, Math.min(1, k)),
        intersection: i, phase: "link", local, toNext: i + 1,
      };
    }
    return { ...poseAt(leg.sim.ego, local), intersection: i, phase: "done", local };
  }
  return { ...poseAt(legs[0].sim.ego, t), intersection: 0, phase: "approach", local: t };
}

/* =====================================================================
   RUNWAY — the quantity the game actually depends on

   How much approach the candidate gets before an intersection: the distance
   from clearing the previous intersection to reaching this one's line.

   NOT the spacing between intersection centres, and the difference is the
   lesson W1 taught. The previous intersection's own traverse consumes real
   distance reaching its exit — about 22m on a default cross, more on a
   wider one — so spacing overstates the approach by exactly that much.
   Designing to spacing produced a band 20m too generous, and a tile
   library built to it would have contained intersections nobody could direct.

   One implementation, used by the gate and by the tile check, so a tile's
   declared runway is verified against the same number the game plays on.
   ===================================================================== */
export function runwayFor(drive, index) {
  if (index < 1 || index >= drive.legs.length) return null;
  const j = drive.intersections[index];
  /* Measured to the STOP LINE, not the intersection centre. The candidate has
     to have signalled and slowed by the line, and on a wider road the line
     sits further back — so measuring to the centre overstates the approach
     by exactly the setback, which is the same proxy error one level down
     from the spacing-versus-runway one. */
  /* THIS intersection's own spec, not the drive's. Using a single spec for
     every intersection mismeasures by the difference in stop-line setback the
     moment a drive mixes road widths — 7.2m between a one-lane and a
     three-lane intersection, which is enough to turn a directable tile into a
     failing one. The same proxy error as spacing-for-runway, one level
     further down. */
  const spec = drive.specs?.[index] ?? drive.spec;
  const line = stopPoint(spec, j.from, LANE, SET, 0, j.at.x, j.at.y);
  const start = drive.exits[index - 1];
  const end = drive.arrivals[index];
  if (!(end > start)) return 0;
  let most = 0;
  for (let t = start; t <= end; t += 0.02) {
    const p = candidateAt(drive, t);
    if (!p || !Number.isFinite(p.x) || p.phase !== "link") continue;
    most = Math.max(most, Math.hypot(line.x - p.x, line.y - p.y));
  }
  return most;
}

/* What an intersection of this shape consumes on the way out — the gap between
   spacing and runway, measured rather than assumed, because it grows with
   the width of the road. */
export function exitRunOf(spec, from = "S", intent = "straight") {
  const at = { x: CX, y: CY };
  const exit = exitPoint(exitSideFor(from, intent), LANE, 0, at.x, at.y);
  return Math.hypot(exit.x - at.x, exit.y - at.y);
}

/* =====================================================================
   PLACING FROM RUNWAY

   The planner is given the runway a tile promises and works out where the
   intersection has to go, rather than being given a spacing and hoping the
   runway falls out. That inversion is the whole reason tiles declare
   runway: the quantity the game depends on is the input, and the proxy is
   derived.

   spacing = runway + what the previous intersection consumes on the way out
                    + how far this intersection's stop line sits back
   ===================================================================== */
export function spacingForRunway({ prevSpec, spec, from = "S", intent = "straight", runway }) {
  const at = { x: 0, y: 0 };
  /* What the intersection being LEFT consumes, measured to WHERE THE TRAVERSE
     ACTUALLY ENDS. It used to use worldExitOf, just past the intersection box,
     while the candidate's path ran 14m further to exitPoint -- so runway
     was measured from a point they had already driven past and was
     overstated by exactly that. The same two-implementations bug the link
     had, and fixing the link exposed it: three intersections immediately
     reported less runway than their tile promised, which was true before
     and simply not measurable. */
  const exit = exitPoint(exitSideFor(from, intent), LANE, 0, at.x, at.y);
  const consumed = Math.hypot(exit.x - at.x, exit.y - at.y);
  // How far back the intersection being APPROACHED puts its stop line.
  const line = stopPoint(spec, from, LANE, SET, 0, at.x, at.y);
  const setback = Math.hypot(line.x - at.x, line.y - at.y);
  return runway + consumed + setback;
}

/* A drive assembled from tiles. Each gap is sized so the tile delivers
   the runway it declared, which is then measured back with runwayFor —
   the promise and the check use the same geometry. */
export function driveThroughTiles({ tiles, legs, speed, holdFor = null }) {
  const specs = tiles.map((t) => t.spec);
  const from = legs[0].ego.from;
  const at = { x: CX, y: CY };
  const js = [{ index: 0, at: { ...at }, from }];
  let entry = from, here = { ...at };

  for (let i = 1; i < tiles.length; i++) {
    const intent = legs[i - 1].ego.intent ?? "straight";
    const gap = spacingForRunway({
      prevSpec: specs[i - 1], spec: specs[i], from: entry, intent, runway: tiles[i].runway,
    });
    const leaving = exitSideFor(entry, intent);
    const next = OPPOSITE[leaving];
    const dir = HEADING_VEC[next];
    here = { x: here.x + dir.x * gap, y: here.y + dir.y * gap };
    js.push({ index: i, at: { ...here }, from: next });
    entry = next;
  }

  const placed = legs.map((scn, i) => {
    const withAt = placeScenario({ ...scn, road: specs[i] }, js[i].at);
    return { intersection: js[i], scn: withAt, sim: simulate(withAt), tile: tiles[i] };
  });

  /* A LINK RUNS AT ITS OWN ROAD'S SPEED. A tile already declares one --
     30 km/h residential, 41 collector, 50 arterial -- and one figure for
     the whole drive threw that away on the straights, which is where most
     of the drive time is spent. The hierarchy stopped at the intersection and
     never reached the road between them. The fallback keeps every
     existing caller behaving exactly as it did. */
  const v = speed ?? M(11.5);
  const speedAt = (i) => tiles[i]?.speed ?? v;
  const arrivals = [], exits = [], links = [];
  arrivals.push(placed[0].scn.ego.arriveAt ?? 0);
  for (let i = 0; i < placed.length; i++) {
    const leg = placed[i];
    const localArrive = leg.scn.ego.arriveAt ?? 0;
    const localDepart = leg.sim.ego.departAt ?? localArrive;
    exits.push(arrivals[i] + (localDepart - localArrive) + spanOfTraverse(leg.sim.ego));
    if (i + 1 < placed.length) {
      const vi = speedAt(i);
      /* Built once to find out what is ON it, then again holding for
         whatever that is. The placements do not depend on the hold, so
         the second build is a re-timing rather than a re-layout. */
      const bare = linkBetween(js[i], js[i + 1], specs[i + 1], vi, leg.scn.ego.intent ?? "straight", specs[i]);
      const hold = holdFor?.(i, bare) ?? null;
      const link = hold && hold.wait > 0
        ? linkBetween(js[i], js[i + 1], specs[i + 1], vi, leg.scn.ego.intent ?? "straight", specs[i],
            yieldingProfile(cruiseProfile(vi), { from: hold.at, give: MOST_GIVE, wait: hold.wait }))
        : bare;
      links.push(link);
      arrivals.push(exits[i] + link.path.duration);
    }
  }
  return { intersections: js, legs: placed, arrivals, exits, links, spec: specs[0], specs, speed: v, tiles };
}
