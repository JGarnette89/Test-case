/* =====================================================================
   STAGE 2 OF THE REBUILD: A NAMED DRIVER, AND WHETHER YOU CAN TELL.

   REBUILD.md section 6 sets this stage one test, and it is a test for a
   person rather than for a check:

     two candidates on the same course, visibly different -- one
     hesitant, one pushy -- and you can tell which is which by watching.

   If that fails, the premise fails, and no amount of green suite is an
   answer to it.

   THERE IS NOTHING HERE THAT NPCs DO NOT ALSO HAVE. REBUILD.md 4.1: an
   NPC is a rated driver and the candidate is the rated driver being
   assessed, so this file adds no behaviour at all. Every profile below
   is a set of RATINGS handed to the same `driver` the traffic is drawn
   from, and every difference you can see on screen is that model reading
   them. If a profile ever needs a parameter of its own, the axis it
   wanted is missing from the driver model and that is where it goes.

   NO TRAITS AND NO COMPILATION, which is stage 2's other instruction.
   The old engine compiled ratings down to a named trait list at
   composition time so a fault could be derived by stripping one; here
   the ratings ARE the parameters, and the controlled comparison is
   running the same seed with one axis moved.
   ===================================================================== */
import { driver } from "./traffic.js";
import { INTENTS } from "./intersection.js";
import { joinAt, edgesOf } from "./crossing.js";
import { planRoute } from "./course.js";
import { rng } from "../engine/index.js";
import { AXES, CONFIDENT_ENOUGH } from "../engine/ratings.js";

/* SOUND ON EVERY AXIS, and the base every profile is a departure from,
   so that what you are watching is one thing at a time rather than a
   different person each time. 0.9 rather than 1.0 because a real
   competent driver is not a machine, and `deficitOf` reads 1.0 as
   literally flawless. */
const SOUND = 0.9;
const sound = () => Object.fromEntries(AXES.map((a) => [a, SOUND]));

/* Confidence is the two-tailed one: `CONFIDENT_ENOUGH` is the optimum
   and being far from it in EITHER direction is the deficit, so a timid
   driver and a bold one are the same distance from sound in opposite
   directions rather than two unrelated settings. */
const timid = CONFIDENT_ENOUGH * 0.15;
const bold = CONFIDENT_ENOUGH + (1 - CONFIDENT_ENOUGH) * 0.85;

export const PROFILES = [
  {
    id: "sound",
    name: "Sound",
    blurb: "no weak axis — the control everybody else is a departure from",
    watch: "stops, waits its turn, holds its line, goes when the way is open",
    ratings: { ...sound(), confidence: CONFIDENT_ENOUGH },
  },
  {
    id: "timid",
    name: "Hesitant",
    blurb: "weak on confidence, timid side",
    watch: "lets gaps go that were plainly big enough, and sits at the line after the way is clear",
    ratings: { ...sound(), confidence: timid },
  },
  {
    id: "bold",
    name: "Pushy",
    blurb: "weak on confidence, risky side",
    watch: "drives fast, follows close, takes gaps nobody else would, and may not stop properly at all",
    ratings: { ...sound(), confidence: bold },
  },
  {
    id: "ragged",
    name: "Ragged",
    blurb: "weak on steering",
    watch: "never holds a steady line, and is not doing anything else wrong",
    ratings: { ...sound(), confidence: CONFIDENT_ENOUGH, steering: 0.15 },
  },
  {
    id: "heavy",
    name: "Heavy-footed",
    blurb: "weak on braking",
    watch: "leaves the braking late and then stands on it, where a sound driver eases off early",
    ratings: { ...sound(), confidence: CONFIDENT_ENOUGH, braking: 0.15 },
  },
  {
    id: "unschooled",
    name: "Unschooled",
    blurb: "weak on knowledge",
    watch: "treats a stop sign as a suggestion — slows to a crawl and carries on",
    ratings: { ...sound(), confidence: CONFIDENT_ENOUGH, knowledge: 0.15 },
  },
];

export const profileOf = (id) => PROFILES.find((p) => p.id === id) ?? PROFILES[0];

/* =====================================================================
   PUTTING ONE ON THE ROAD

   A candidate joins the way anybody else does -- same `driver`, same
   room test, a leg and an intent -- and differs only in carrying a name,
   so a renderer can pick them out and a check can follow them.

   `trip` counts how many times they have been round, which is what makes
   the screen a COURSE rather than a single crossing: stage 3 builds the
   real route, and until it exists the honest stand-in is the same driver
   arriving again.
   ===================================================================== */
export function candidateFor(world, { id, profile, trip = 0, planned = false, ratings = null }) {
  const who = profileOf(profile);
  /* SEEDED OFF THE TRIP AND NOTHING ELSE, so two candidates given the
     same seed drive the SAME COURSE -- leg for leg, turn for turn, in
     the same traffic. That is what makes watching them a controlled
     comparison rather than two anecdotes: one thing differs, and it is
     the person. Seeding off the id as well would have been the obvious
     thing and would have quietly made every difference unattributable. */
  const r = rng(trip * 7919 + 1);
  /* ON AN EDGE OF THE COURSE, like any other arrival: a candidate does
     not appear in the middle of a street either. With one intersection
     that is all four legs, which is what every earlier stage had. */
  const edges = edgesOf(world.course);
  const where = edges[Math.floor(r() * edges.length) % edges.length];
  /* AND A ROUTE THROUGH THE COURSE RATHER THAN A TURN AT THE FIRST
     INTERSECTION. This is what replaces `keepDriving`'s stand-in: the
     candidate is driving somewhere now, and where they go at each
     intersection is a decision that was made before they set off rather
     than a fresh roll when they get there.

     Seeded off the trip like everything else about them, so two
     candidates on one seed drive the same route as well as the same
     legs. */
  /* A CANDIDATE KNOWS ONLY WHAT THEY HAVE BEEN TOLD, so by default they
     set off with an EMPTY plan and carry straight on until somebody says
     otherwise. That is the examiner's job arriving: without it there is
     nothing for the directions to do, and a course that plans itself is a
     course nobody is being examined on.

     `planned` asks for a route decided in advance instead, which is what
     a check wants when the question is whether a driver FOLLOWS one --
     and what the screen wanted before there was anybody to give
     instructions. */
  /* THE SET COURSE IS ALWAYS PLANNED, because the sheet grades the
     examiner's directions against it. Whether the DRIVER knows it is a
     separate question: by default they do not, and `wanted` is a record
     the driver never reads -- `intentFor` consults `plan` and nothing
     else. `planned` copies the course into the plan for a check that
     wants a driver who follows a route rather than an examiner who has
     to give one. */
  const wanted = planRoute(world.course, { from: where, seed: trip * 31337 + 17 }).plan;
  const plan = planned ? [...wanted] : [];
  const intent = plan[0] ?? "straight";
  return {
    /* Ratings given directly override the profile's: a measurement can
       ask for a driver the profile table does not have yet. */
    ...driver(world.road, 4242, trip, ratings ?? who.ratings),
    id: `${id}#${trip}`,
    candidate: id,
    profile: who.id,
    trip,
    /* Numbered off the trip rather than off who they are, so two
       candidates on the same seed make the same choices at every
       intersection they reach and the comparison stays controlled. */
    n: trip,
    k: where.k,
    leg: 0,
    plan,
    wanted,
    /* When each instruction was given, by leg. The sheet needs the
       moment as well as the content, because a right instruction given
       late is the examiner's fault and one given in time is nobody's. */
    toldAt: {},
    route: `${where.side}/${intent}`,
    s: 0,
    stoppedAt: null,
    going: false,
    accepted: false,
    openFor: 0,
    openedAt: null,
    waited: 0,
    delayed: false,
    arriveIn: 0,
  };
}

/* WHO IS BEING WATCHED. Declared on the world so `keepDriving` can put
   them back without anything else having to know they exist. */
export function withCandidates(world, wanted) {
  return keepDriving({ ...world, watching: wanted.map((w) => ({ ...w, trip: 0 })) });
}

/* ANOTHER DRIVE, once this one is over. A candidate who has driven off
   the edge of the course comes back at another edge, as the same person
   -- same ratings, same everything -- with a NEW ROUTE through it.

   This used to be the stand-in for a course and said so: before there
   was more than one intersection it put the same driver back on a fresh
   leg and called the repetition a drive. It is not that any more. A trip
   is a real route now -- a sequence of intersections and what to do at
   each -- and this is what starts the next one.

   They join through the SAME `joinAt` ordinary traffic does, so a
   candidate never materialises on top of a queue, and a fast one slows
   to fit rather than being turned away for wanting to go fast. */
export function keepDriving(world) {
  if (!world.watching?.length) return world;
  let actors = world.actors, watching = world.watching, changed = false;

  for (let i = 0; i < watching.length; i++) {
    const w = watching[i];
    if (actors.some((a) => a.candidate === w.id)) continue;
    /* Gone means they finished the last one, so this is the next trip. */
    const trip = w.trip + (w.started ? 1 : 0);
    const joining = joinAt(world, actors, candidateFor(world, { ...w, trip }));
    if (!joining) continue;
    actors = [...actors, joining];
    watching = watching.map((x, j) => (j === i ? { ...x, trip, started: true } : x));
    changed = true;
  }
  return changed ? { ...world, actors, watching } : world;
}

/* =====================================================================
   GIVING THE DIRECTIONS

   One of the examiner's four jobs, and the first of them the rebuild can
   actually do. A set course is a route; the instruction to give at each
   intersection is that leg's intent; and the candidate only knows what
   they have been TOLD.

   SILENCE MEANS STRAIGHT ON, which is already how `intentFor` reads a
   plan with a hole in it -- so a candidate who is told nothing carries on
   ahead, and a LATE instruction is a missed turn rather than a pause.
   That is the interlock the whole design rests on: being busy with one
   job makes you late with another, and the resulting error is then the
   examiner's and unmarkable.

   WHAT IS TOLD IS THE SAME FIELD THE DRIVER READS. There is no separate
   record of instructions given -- `plan` IS the instructions given, and
   `intentFor` reads it at the moment of handoff. A second list would be
   two answers to "what were they told", which is the bug this project
   keeps finding.

   THE DEADLINE IS THE LOOSEST TRUE ONE, DELIBERATELY. An instruction can
   be given right up until the candidate is handed to that intersection,
   because that is the tick `intentFor` reads the plan. It is a real
   boundary rather than a placeholder -- past it the choice is genuinely
   made -- but it is generous: an approach is 279m, so it allows a good
   seventeen seconds of notice. The tighter bound is "in time to slow for
   the turn and signal", and it needs a turn speed the model does not have
   (DECISIONS.md 5.15.13). It will only ever move EARLIER, so nothing
   built against this one has to be unbuilt.
   ===================================================================== */

/* WHICH INTERSECTIONS CAN STILL BE INSTRUCTED FOR, and what they have
   already been told about each. `at` is an absolute leg number, so an
   instruction survives the candidate moving on. */
export function toTell(world, id, ahead = 3) {
  const a = world.actors.find((x) => x.candidate === id);
  if (!a) return [];
  const out = [];
  for (let i = 1; i <= ahead; i++) {
    const at = (a.leg ?? 0) + i;
    out.push({
      at,
      /* Distance 1 is the next intersection, which is discharged the
         moment they reach it -- so it never makes them CARRY anything.
         Stacking only exists from distance two, which is why more than
         one is offered at all. */
      distance: i,
      told: a.plan?.[at] ?? null,
    });
  }
  return out;
}

/* THE INSTRUCTION. Written into the plan the driver reads, at an
   absolute leg, and refused once that leg has been decided -- which is
   not an error to report but the late instruction itself: they carry
   straight on, and it is the examiner's fault. */
export function tell(world, id, at, intent) {
  const a = world.actors.find((x) => x.candidate === id);
  if (!a) return world;
  if (at <= (a.leg ?? 0)) return world;
  const plan = [...(a.plan ?? [])];
  while (plan.length < at) plan.push(undefined);
  plan[at] = intent;
  const toldAt = { ...(a.toldAt ?? {}), [at]: a.toldAt?.[at] ?? world.t };
  return {
    ...world,
    actors: world.actors.map((x) => (x.id === a.id ? { ...x, plan, toldAt } : x)),
  };
}

/* CAN THIS STILL BE SAID? The same test `tell` applies, asked in
   advance, so a screen can grey a button out rather than offering
   something that will be ignored. */
export const stillTellable = (world, id, at) => {
  const a = world.actors.find((x) => x.candidate === id);
  return !!a && at > (a.leg ?? 0);
};

/* What one of them is doing, for something that wants to say so out
   loud. Nothing here is a new measurement -- every field is a quantity
   the driver already carries. */
export function watch(world, id) {
  const a = world.actors.find((x) => x.candidate === id);
  const seat = world.watching?.find((x) => x.id === id);
  if (!a) return { on: false, profile: seat?.profile, trips: seat?.trip ?? 0 };
  return {
    on: true,
    profile: a.profile,
    trips: a.trip,
    v: a.v,
    a: a.a ?? 0,
    stopped: a.v < 0.3,
    waiting: a.stoppedAt != null && !a.going,
    waited: a.waited ?? 0,
    delayed: !!a.delayed,
    rolling: !!a.rollsStops,
    off: Math.abs(a.weave ?? 0),
    route: a.route,
    leg: a.leg ?? 0,
    plan: a.plan ?? [],
  };
}
