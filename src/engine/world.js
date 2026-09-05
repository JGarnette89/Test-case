/* =====================================================================
   THE CONTINUOUS WORLD — first increment

   Deliberately the smallest thing that can answer one question: is the
   viewport actually scarce once junctions are far enough apart to be
   directable? `tools/gate-viewport.mjs` is the acceptance test and this
   exists to be measured by it. See WORLD-DESIGN.md.

   What is here: junctions placed at world origins, joined by straight
   link road, and the candidate's continuous pose across the whole drive.

   What is NOT here, on purpose: tiles, road character, kerbside content,
   pacing, streaming, route planning. Those are stages W2 onward and
   building them before the gate answers would be building on a guess.

   THE GRID IS A CHOSEN CONSTRAINT. Roads are axis-aligned because `LEG`
   is four discrete compass entries, and that is a design decision rather
   than an inherited limitation — no continuous bends, no diagonals.
   Roundabouts do not fit the lattice and will need explicit handling.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { M, CX, CY, LANE, SET, simulate, poseAt, basePose } from "./index.js";
import { crossSpec, stopPoint, exitPoint, exitSideFor } from "./road.js";
import { linePath, pathLength, poseOn, progressAt, cruiseProfile } from "./paths.js";

/* Which way you travel having entered from a given leg, as a unit vector.
   Entering from the south you are heading north, which is -y on screen. */
const HEADING_VEC = {
  S: { x: 0, y: -1 },
  N: { x: 0, y: 1 },
  W: { x: 1, y: 0 },
  E: { x: -1, y: 0 },
};

/* Junctions in a line, `spacing` apart, along the direction the candidate
   is travelling. The lattice in its simplest form: one road, N junctions.

   Spacing is the whole design variable — see WORLD-DESIGN.md section 1.
   Below about 63m a junction cannot be directed at all; above about 140m
   the drive is empty road. */
export function placeJunctions({ from = "S", spacing = M(80), count = 2, origin, intents = [] } = {}) {
  const start = origin ?? { x: CX, y: CY };
  const out = [];
  let at = { ...start }, entry = from;
  for (let i = 0; i < count; i++) {
    out.push({ index: i, at: { ...at }, from: entry });
    /* The next junction sits along the road the candidate actually LEAVES
       on, which is decided by its intent here -- not blindly ahead. Place
       a junction north of one the candidate turns west at and the link
       becomes a diagonal the grid does not have. */
    const intent = intents[i] ?? "straight";
    const leaving = exitSideFor(entry, intent);
    const dir = HEADING_VEC[OPPOSITE_SIDE[leaving]];
    at = { x: at.x + dir.x * spacing, y: at.y + dir.y * spacing };
    entry = OPPOSITE_SIDE[leaving];
  }
  return out;
}

/* Leaving by the north leg means arriving at the next junction from ITS
   south. */
const OPPOSITE_SIDE = { N: "S", S: "N", E: "W", W: "E" };

/* Stamp a junction origin onto every participant in a scenario, so that
   movementOf builds this junction wherever it has been placed. Nothing
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
   The candidate's drive across more than one junction.

   Three phases per junction pair: through the junction, along the link
   road, through the next. The link is where the world lives — it is the
   part a single scenario never had, and the reason the two examiner jobs
   can be in different places at all.
   ===================================================================== */

/* Where the candidate physically enters and leaves a placed junction. */
export function junctionPorts(j, spec, intent) {
  const entry = stopPoint(spec, j.from, LANE, SET, 0, j.at.x, j.at.y);
  const exitSide = exitSideFor(j.from, intent);
  return { entry, exitSide };
}

/* The straight road joining one junction to the next, as a path the
   candidate actually drives. Its length is the spacing minus whatever the
   two junctions themselves consume, which is why spacing has to be
   measured centre to centre and checked here rather than assumed. */
export function linkBetween(a, b, spec, speed, intent = "straight") {
  /* The link starts where the PREVIOUS junction's traverse ends, not at
     its stop line. Getting that wrong is the first assumption the design
     called out -- exits lead off-board rather than to the next junction --
     and it costs the whole runway: measured, a link begun at the stop line
     leaves only 22m of approach out of 80m of spacing, because the
     candidate is placed 8m behind a junction it has already driven
     through. */
  const raw = exitPoint(exitSideFor(a.from, intent), LANE, 0, a.at.x, a.at.y);
  const to = stopPoint(spec, b.from, LANE, SET, 0, b.at.x, b.at.y);
  /* exitPoint returns a position and no heading, and poseOn reads
     `from.rot` for a straight path -- so without this the candidate drives
     the link with an undefined rotation and every frame built on it comes
     out NaN. */
  const rot = (Math.atan2(to.y - raw.y, to.x - raw.x) * 180) / Math.PI;
  const from = { ...raw, rot };
  const path = linePath(from, to, cruiseProfile(speed));
  return { path, from, to, length: pathLength(path) };
}

/* How far apart two placed junctions actually are, centre to centre. The
   number the gate cares about. */
export function spacingOf(a, b) {
  return Math.hypot(b.at.x - a.at.x, b.at.y - a.at.y);
}

/* =====================================================================
   A drive, as something with a clock.

   Each junction is simulated as an ordinary scenario — junction-local,
   because simulate() is O(n^2) and a world-scale simulation is not
   affordable at any traffic density worth having. The world's only job is
   to say where each junction is and when the candidate reaches it.
   ===================================================================== */
export function driveThrough({ legs, spacing = M(80), spec = crossSpec(), speed }) {
  const js = placeJunctions({
    from: legs[0].ego.from,
    spacing,
    count: legs.length,
    intents: legs.map((l) => l.ego.intent ?? "straight"),
  });
  const placed = legs.map((scn, i) => {
    const withAt = placeScenario(scn, js[i].at);
    return { junction: js[i], scn: withAt, sim: simulate(withAt) };
  });

  /* World time at which the candidate arrives at each junction's line.
     The first is its own arriveAt; each later one adds the time to cover
     the link at the speed the road carries. */
  const v = speed ?? M(11.5);
  /* Two clocks per junction: when the candidate reaches its line, and when
     it has cleared the junction entirely. The gap between the second of
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

  return { junctions: js, legs: placed, arrivals, exits, links, spacing, spec, speed: v };
}

function spanOfTraverse(p) {
  const mv = poseAt(p, (p.departAt ?? 0)) ? null : null;
  // Duration of the junction traverse, read off the path the engine built.
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

/* Where the candidate is in the world at time t: inside a junction if it
   is between that junction's arrival and its exit, otherwise on the link
   between two of them. */
export function candidateAt(drive, t) {
  const { legs, arrivals, exits, links } = drive;
  for (let i = legs.length - 1; i >= 0; i--) {
    if (t < arrivals[i]) continue;
    const leg = legs[i];
    const local = t - arrivals[i] + (leg.scn.ego.arriveAt ?? 0);

    if (t < exits[i]) {
      const p = poseAt(leg.sim.ego, local);
      if (p && Number.isFinite(p.x)) return { ...p, junction: i, phase: "junction", local };
    }
    if (i + 1 < legs.length) {
      const link = links[i];
      const k = progressAt(link.path, Math.max(0, t - exits[i]));
      return {
        ...poseOn(link.path, Math.min(1, k)),
        junction: i, phase: "link", local, toNext: i + 1,
      };
    }
    return { ...poseAt(leg.sim.ego, local), junction: i, phase: "done", local };
  }
  return { ...poseAt(legs[0].sim.ego, t), junction: 0, phase: "approach", local: t };
}
