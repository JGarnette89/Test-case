/* =====================================================================
   BOSSES
   Hand-authored, same shape as scenarios.js — never composed, never
   searched. A boss is a combination exam: it stacks rules the player has
   already met one at a time in the ordinary stage content, rather than
   introducing anything new. Each is tied to one roguelike stage (see
   stages.js) and gates progress out of it.

   Safety is not a design choice here, it is a requirement, checked the
   same way wontstop is in verify-wontstop.mjs: against safeAtFor, not
   only legalAt, because a hand-authored scenario never passes through
   compose.js's windowIsSafe search-time filter the way a generated draw
   does. See tools/verify-stages.mjs.
   ===================================================================== */
import { C } from "../theme.js";
import { M } from "./index.js";
import { S } from "./scenarios.js";

const BOSSES = [
  {
    id: "boss-fourway",
    title: "The Four-Way Liar",
    brief: "Four-way stop. Three cars, and one of them is lying to you.",
    control: "stop",
    duration: 18,
    boss: true,
    stage: "basics",
    ego: { from: "S", intent: "straight", arriveAt: 3.0, stops: true, color: C.blue },
    actors: [
      // Real prior, clean arrival order: crosses the ego's path, arrives
      // well before anyone else.
      S({ id: "w", from: "W", intent: "straight", arriveAt: 1.0, color: C.green, name: "Green car" }),
      // The harmless one: straight through from the opposite leg. Looks
      // like it is coming straight at you and touches nothing.
      S({ id: "n", from: "N", intent: "straight", arriveAt: 1.8, color: C.amber, name: "Amber car" }),
      // The liar, from the ego's own right — arriving close enough to the
      // ego to make the right-hand rule the real question, on top of the
      // indicator lie itself.
      S({ id: "e", from: "E", intent: "left", arriveAt: 2.9, color: C.red, name: "Red car", signal: "right" }),
    ],
    lesson: "Three things at once: the amber car came straight at you and never mattered, the green car crossed you and arrived first, and the red car — on your right, arriving almost with you — signalled right and turned left across your path anyway. Right of way and honest signalling are two different questions, and this intersection asked both.",
  },
  {
    id: "boss-crossing",
    title: "Crossing Under Pressure",
    brief: "Four-way stop. A pedestrian is already crossing on the far side, and a car has priority too.",
    control: "stop",
    duration: 16,
    boss: true,
    stage: "pedestrians",
    ego: { from: "S", intent: "straight", arriveAt: 1.4, stops: true, color: C.blue },
    actors: [
      S({ id: "e", from: "E", intent: "straight", arriveAt: 0.7, color: C.red, name: "Red car" }),
      S({
        id: "p", from: "N", intent: "straight", arriveAt: 0.9, stops: false, kind: "ped",
        color: "#F2E8D5", name: "Pedestrian", priority: -1, blockUntilClear: true,
      }),
    ],
    lesson: "Two separate things had to clear before you did, on two different clocks: the red car's own crossing of your path, and the pedestrian's walk past the midpoint of theirs. Whichever finishes last is the one that actually decided your window — not whichever one you happened to look at first.",
  },
  {
    id: "boss-blind-rush",
    title: "Blind and Busy",
    brief: "Stop sign. A van hides the road, and it is a busy one.",
    control: "stop",
    manoeuvre: "blindApproach",
    duration: 20,
    boss: true,
    stage: "visibility",
    road: {
      legs: {
        N: { lanes: 1, control: "stop" }, S: { lanes: 1, control: "stop" },
        E: { lanes: 2, control: "none" }, W: { lanes: 2, control: "none" },
      },
    },
    sightBlockers: [
      { id: "van", x: 268, y: 452, rot: 0, hl: M(2.8), hw: M(1.15) },
    ],
    ego: { from: "S", intent: "straight", arriveAt: 1.2, stops: true, color: C.blue },
    actors: [
      S({ id: "w1", from: "W", intent: "straight", arriveAt: 2.3, stops: false, lane: 0,
        color: C.red, name: "Near-lane car", priority: -3 }),
      S({ id: "w2", from: "W", intent: "straight", arriveAt: 3.6, stops: false, lane: 1,
        color: C.green, name: "Far-lane car", priority: -2 }),
      S({ id: "e1", from: "E", intent: "straight", arriveAt: 4.4, stops: false, lane: 0,
        color: C.amber, name: "Amber car", priority: -1 }),
    ],
    lesson: "The van hid two lanes of a busy road at once, and busy meant there was always another car arriving right behind the one you just read. Creeping bought you the sightline, same as it always does — the cost here is that a two-lane read takes longer than a one-lane one, and there was more traffic to spend that time on.",
  },
];

export { BOSSES };
export const bossById = (id) => BOSSES.find((b) => b.id === id) || null;
