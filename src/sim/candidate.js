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
import { joinAt } from "./crossing.js";
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
export function candidateFor(world, { id, profile, trip = 0 }) {
  const who = profileOf(profile);
  /* SEEDED OFF THE TRIP AND NOTHING ELSE, so two candidates given the
     same seed drive the SAME COURSE -- leg for leg, turn for turn, in
     the same traffic. That is what makes watching them a controlled
     comparison rather than two anecdotes: one thing differs, and it is
     the person. Seeding off the id as well would have been the obvious
     thing and would have quietly made every difference unattributable. */
  const r = rng(trip * 7919 + 1);
  const from = "NESW"[Math.floor(r() * 4) % 4];
  const intent = INTENTS[Math.floor(r() * INTENTS.length) % INTENTS.length];
  return {
    ...driver(world.road, 4242, trip, who.ratings),
    id: `${id}#${trip}`,
    candidate: id,
    profile: who.id,
    trip,
    route: `${from}/${intent}`,
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

/* THE COURSE, FOR AS LONG AS THERE IS NOT A REAL ONE. A candidate who
   has driven out of the world comes back at the far end of another leg,
   as the same person -- same ratings, same everything -- so a viewer can
   keep watching one driver instead of losing them after six seconds.

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
    const joining = joinAt(actors, world.layout, candidateFor(world, { ...w, trip }));
    if (!joining) continue;
    actors = [...actors, joining];
    watching = watching.map((x, j) => (j === i ? { ...x, trip, started: true } : x));
    changed = true;
  }
  return changed ? { ...world, actors, watching } : world;
}

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
  };
}
