/* =====================================================================
   ROUTES — several intersections in one go

   A route is a list of scenarios played back to back, with one thing the
   single-intersection game never had to care about: continuity. Where you
   leave one intersection decides which side of the next one you arrive at.
   Go straight and you carry on the same way. Turn left and you now meet
   the next intersection from the far side.

   Getting that wrong is not a cosmetic bug — it silently changes who is on
   your right, and the right-hand rule is decided by exactly that.

   Nothing here decides when a road is yours. It sequences scenarios and
   keeps the tally; the engine still derives every window.
   ===================================================================== */
import { OPPOSITE } from "./index.js";
import { tally, emptyTally } from "./score.js";

/* Entering from the south means travelling north. */
const HEADING_OF = { S: "N", N: "S", W: "E", E: "W" };
const RIGHT_TURN = { N: "E", E: "S", S: "W", W: "N" };
const LEFT_TURN = { N: "W", W: "S", S: "E", E: "N" };

/* Rotating the whole scene one quarter turn. Applied uniformly to every
   participant this preserves both RIGHT_OF and OPPOSITE, which is the only
   reason it is safe to reuse a scenario from another approach: the rules
   engine sees an identical situation, just pointing a different way. */
const QUARTER = { S: "W", W: "N", N: "E", E: "S" };

export function headingOf(from) {
  return HEADING_OF[from];
}

/* Which way you are travelling as you leave. */
export function exitHeading(leg) {
  const h = HEADING_OF[leg.ego.from];
  if (leg.ego.intent === "right") return RIGHT_TURN[h];
  if (leg.ego.intent === "left") return LEFT_TURN[h];
  return h; // straight
}

/* Which side of the NEXT intersection you therefore arrive at. Travelling
   north, you meet it from its south side. */
export function entrySideAfter(leg) {
  return OPPOSITE[exitHeading(leg)];
}

/* How many quarter turns take `from` to `to`. */
function turnsBetween(from, to) {
  let cur = from;
  for (let n = 0; n < 4; n++) {
    if (cur === to) return n;
    cur = QUARTER[cur];
  }
  return null;
}

/* Everything in a scenario is now expressed by which leg it belongs to,
   pedestrian crossings included, so a quarter turn carries the whole scene.
   Kept as a named check because a future road user with fixed coordinates
   would have to declare itself here rather than be silently misplaced.

   sightBlockers are exactly that: fixed x/y, authored for one specific
   approach (the van in "unprotected" sits where it blocks the S leg's
   view, not any rotated leg's). rotateScenario spins the road and every
   actor's `from`, but a static blocker has no `from` to spin — a rotated
   copy would keep it planted in the same screen position while the road
   and cars turned around it. legalAt does not read sightBlockers, so
   nothing about safety would notice; the driver would, since the whole
   point of the van is to be seen sitting where it blocks the approach. */
export function isRotatable(scn) {
  if (scn.sightBlockers?.length) return false;
  return scn.actors.every((a) => a.from != null || a.kind === "ped");
}

export function rotateScenario(scn, turns) {
  const n = ((turns % 4) + 4) % 4;
  if (n === 0) return scn;
  if (!isRotatable(scn)) return null;

  const spin = (side) => {
    let s = side;
    for (let i = 0; i < n; i++) s = QUARTER[s];
    return s;
  };
  /* The road turns with the traffic. Spin the cars and leave the intersection
     where it was and they end up entering by legs that do not exist — the
     window still computes, everything still draws, and the situation is
     nonsense. A T is the case that exposes it; a four-way is symmetric
     enough to hide it. */
  const road = scn.road
    ? { ...scn.road, legs: Object.fromEntries(
        Object.entries(scn.road.legs).map(([side, leg]) => [spin(side), leg])
      ) }
    : undefined;

  return {
    ...scn,
    id: `${scn.id}@${spin(scn.ego.from)}`,
    rotatedFrom: scn.id,
    ...(road ? { road } : {}),
    ego: { ...scn.ego, from: spin(scn.ego.from) },
    actors: scn.actors.map((a) => ({ ...a, from: a.from ? spin(a.from) : a.from })),
  };
}

/* Return the scenario rotated so the ego arrives from `requiredFrom`,
   or null if it cannot be. */
export function alignScenario(scn, requiredFrom) {
  if (scn.ego.from === requiredFrom) return scn;
  const turns = turnsBetween(scn.ego.from, requiredFrom);
  if (turns == null) return null;
  return rotateScenario(scn, turns);
}

/* =====================================================================
   Planning
   Resolve ids to scenarios and rotate each one to meet the approach the
   previous leg leaves you on. Problems are returned, never thrown: a route
   with a hole in it should be reportable, not fatal.
   ===================================================================== */
export function planRoute(route, scenarios) {
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const legs = [];
  const problems = [];
  let requiredFrom = null;

  route.legs.forEach((id, i) => {
    const base = byId.get(id);
    if (!base) {
      problems.push({ leg: i, id, kind: "missing", detail: `no scenario with id "${id}"` });
      return;
    }
    // The first leg sets the approach; every later one has to match.
    if (requiredFrom == null) {
      legs.push(base);
    } else {
      const aligned = alignScenario(base, requiredFrom);
      if (!aligned) {
        problems.push({
          leg: i, id, kind: "unrotatable",
          detail: `needs to be approached from ${requiredFrom} but cannot be rotated ` +
                  `(fixed geometry, e.g. a pedestrian crossing)`,
        });
        return;
      }
      legs.push(aligned);
    }
    requiredFrom = entrySideAfter(legs[legs.length - 1]);
  });

  return { route, legs, problems, ok: problems.length === 0 };
}

/* =====================================================================
   Running
   State is a plain value and every transition returns a new one, so the
   renderer can hold it in useState and the harness can drive it headlessly.
   ===================================================================== */

/* What ends a run early. A collision is an immediate fail on a road test,
   so it is the default; a route may override it. */
const DEFAULT_END_ON = ["collision"];

export function startRun(plan) {
  return {
    plan,
    index: 0,
    results: [],
    tally: emptyTally,
    over: false,
    outcome: null, // "finished" | "ended-early"
  };
}

export function currentLeg(run) {
  return run.plan.legs[run.index] ?? null;
}

export function recordLeg(run, result) {
  if (run.over) return run;

  const endOn = run.plan.route.endOn ?? DEFAULT_END_ON;
  const fatal = endOn.includes(result.verdict);
  const next = run.index + 1;
  const exhausted = next >= run.plan.legs.length;
  const over = fatal || exhausted;

  return {
    ...run,
    results: [...run.results, result],
    tally: tally(run.tally, result),
    index: over ? run.index : next,
    over,
    outcome: over ? (fatal ? "ended-early" : "finished") : null,
  };
}

export function summary(run) {
  const total = run.plan.legs.length;
  const played = run.results.length;
  return {
    played,
    total,
    remaining: Math.max(0, total - played),
    points: run.tally.points,
    average: run.tally.average,
    clean: run.tally.clean,
    best: run.tally.best,
    over: run.over,
    outcome: run.outcome,
    // Completing a route without a clean sheet is still worth saying out loud.
    perfect: run.outcome === "finished" && run.tally.clean === total,
  };
}
