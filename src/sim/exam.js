/* =====================================================================
   STAGE 3: THE EXAM MODE, AS A REINTERPRETATION (SIMULATOR.md 1.1,
   1.1.19, stage 3).

   The dial's last position: the AI holds the steering and the pedals of
   the car you are in, and you hold the route and the brake. Nothing
   here decides anything for the candidate. They are an ordinary driver
   of the sim, built from a named profile's ratings (candidate.js), who
   carries straight on at every intersection unless told otherwise --
   silence means straight on -- and everything they do on the way is
   the same model driving every other car on the map.

   What the two controls become:

     the turn commit   GIVING THE DIRECTION. Tapped for the intersection
                       ahead, it becomes the route there if the candidate
                       can still take it; once they are past the line it
                       is for the next one. Their lane may not make the
                       turn, and then they move over for it or miss it,
                       by the same lane-change model everybody uses.
     the slider        its lower half is INTERVENTION. Easing down is
                       telling them to slow: they want less speed and
                       shed it by their own driving. The bottom of the
                       travel is the instructor's brake: the car's full
                       braking, whatever they are doing. The upper half
                       does nothing -- the examiner has no throttle.

   WHAT IS DELIBERATELY NOT HERE: marking, the sheet, grading the
   examiner, and any record of what an intervention costs. The shelved
   sheet (marking.js) imports the old engine's grader, which a live
   screen may not reach (verify-core), so bringing it in is a move of
   that grader into src/core/ first -- assessment work, which this stage
   exists to defer until the riding has been judged on its own.

   Pure. No React, no DOM.
   ===================================================================== */
import { wantFor, joinAt, pathOf } from "./crossing.js";
import { routeForSignal } from "./drive.js";
import { curbLegOf, postedAt } from "./graph.js";
import { cornerOf, cornerSpeedOf } from "./corner.js";
import { driver, HARSH_AT } from "./traffic.js";
import { profileOf, PROFILES } from "./candidate.js";
import { NEUTRAL, BRAKE_MAX } from "./player.js";

export const CANDIDATE = "candidate";
/* The share of the slider's brake travel that is "slow down"; below it
   is the instructor's brake. Nine tenths, so the brake is a deliberate
   push to the stop and not something a thumb easing off reaches by
   accident. A design constant, flagged as one. */
export const DUAL_AT = 0.9;

export const candidateOf = (world) => world.actors.find((a) => a.id === CANDIDATE) ?? null;
const replaced = (world, me) => ({ ...world, actors: world.actors.map((a) => (a.id === CANDIDATE ? me : a)) });

/* A profile id, or a draw from them when none is asked for -- "surprise
   me" -- off the seed, so a restart on the same seed is the same person. */
export function pickProfile(seed, id = null) {
  if (id && PROFILES.some((p) => p.id === id)) return id;
  return PROFILES[(Math.abs(Math.round(seed)) * 7 + 3) % PROFILES.length].id;
}

/* THE CANDIDATE, AT A ROAD END: in its curb lane, heading into the node
   that end touches (or, on a road with no node, as a through road), the
   same place the player starts. They join like anybody else; a car
   already sitting on the spot is moved off the map rather than driven
   through. Null where there is no curb leg to start on. */
export function candidateOn(world, { profile, road, end, through = false }) {
  const at = curbLegOf(world.course, road, end, { through });
  if (!at) return null;
  const layout = world.course.at[at.k].layout;
  const route = routeForSignal(layout, at.leg, null);
  const posted = world.road.posted ? postedAt(world.course, at.k, route) : null;
  const roadNow = posted == null ? world.road : { ...world.road, speed: posted, kmh: Math.round(posted * 3.6) };
  const who = profileOf(profile);
  const me = {
    ...driver(roadNow, world.seed, 9001, who.ratings),
    id: CANDIDATE,
    candidate: "exam",
    profile: who.id,
    colour: "#f4f4f2",
    n: 9001,
    k: at.k,
    route,
    leg: 0,
    /* KNOWS ONLY WHAT THEY HAVE BEEN TOLD: an empty plan is straight on
       at every intersection (crossing.js `wantFor`). */
    plan: [],
    s: 0,
    stoppedAt: null, going: false, accepted: false,
    openFor: 0, openedAt: null, waited: 0, delayed: false,
    ease: 0, dual: 0,
  };
  const from = layout.paths[route].from;
  const clear = world.actors.filter((a) => !((a.k ?? 0) === at.k && pathOf(world, a).from === from && a.s < 20));
  const joined = joinAt(world, clear, me) ?? { ...me, v: 0 };
  return { ...world, actors: [...clear, joined] };
}

/* THE DIRECTION: "left", "right" or "straight", given now.

   For the intersection ahead while the candidate is still short of its
   line -- if they can still take it. Whether they can is the corner
   model's own arithmetic (corner.js): the braking it needs to reach
   THEIR speed for that corner before the arc starts. More than
   `HARSH_AT`, the sim's own boundary for a controlled stop, and they
   carry on as they were -- which is what a late instruction does to a
   real candidate, and it is the examiner's fault, not theirs.

   Past the line, or on a road with no intersection, it is for the next
   intersection, read when they get there.

   Returns `{ world, heard }`: "now", "next" or "late", or null with no
   candidate. */
export function direct(world, intent) {
  const me = candidateOf(world);
  if (!me) return { world, heard: null };
  const spot = world.course.at[me.k];
  const path = spot.layout.paths[me.route];
  if (spot.through || me.s > path.stopAt) {
    const plan = [...(me.plan ?? [])];
    plan[(me.leg ?? 0) + 1] = intent;
    return { world: replaced(world, { ...me, plan }), heard: "next" };
  }
  const side = path.from;
  const w = wantFor(world, me, me.k, side, intent);
  if (intent !== "straight") {
    const base = spot.layout.legs[side]?.base;
    const probe = Object.values(spot.layout.paths).find((p) => p.intent === intent && (base == null || spot.layout.legs[p.from]?.base === base));
    const corner = probe && cornerOf(probe);
    if (corner) {
      const vc = cornerSpeedOf(corner, me);
      const d = corner.from - me.s;
      const need = me.v <= vc ? 0 : d > 0 ? (me.v * me.v - vc * vc) / (2 * d) : Infinity;
      if (need > HARSH_AT) return { world, heard: "late" };
    }
  }
  return { world: replaced(world, { ...me, route: w.route, want: w.want ?? null }), heard: "now" };
}

/* THE SLIDER, read as the examiner's hand: -1 is the bottom of the
   travel. Nothing above the brake side's neutral band. */
export function interventionOf(slider) {
  if (!(slider < -NEUTRAL)) return { ease: 0, dual: 0 };
  const depth = Math.min(1, (-slider - NEUTRAL) / (1 - NEUTRAL));
  return depth >= DUAL_AT ? { ease: 0, dual: BRAKE_MAX } : { ease: depth, dual: 0 };
}

/* Written onto the candidate before each tick, the way the player's
   controls are written in before theirs. */
export function withIntervention(world, { ease, dual }) {
  const me = candidateOf(world);
  if (!me || (me.ease === ease && me.dual === dual)) return world;
  return replaced(world, { ...me, ease, dual });
}
