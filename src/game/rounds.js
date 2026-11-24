/* =====================================================================
   THE ROUNDS (WORK-game-slice1 section 3): pure data. A round is a map,
   a seed and a car count; nothing here says what the traffic does.

   THE SEED AND THE CAR COUNT ARE CHOSEN BY MEASUREMENT, NEVER TYPED IN AS
   A TIME (GAME.md rule 1): tools/measure/round-seeds.mjs ran the good
   driver over seeds 1-60 and printed what each showed; the chosen values
   carry that run's mark below.

   Each leg is 140 m, the intersection at the middle of a 500 m square.
   ===================================================================== */
import { emptyMap, road } from "../map/format.js";
import { stroke } from "../map/samples.js";

const C = { x: 250, y: 250 };
const LEG = 140;
/* The far end of each leg, and the road that comes from it. */
const FAR = { S: { x: C.x, y: C.y + LEG }, N: { x: C.x, y: C.y - LEG }, W: { x: C.x - LEG, y: C.y }, E: { x: C.x + LEG, y: C.y } };

/* A four-leg intersection, every leg a road that ends at the middle; `legs` says each one's kind and what governs it. */
function crossroads(id, name, legs) {
  const m = emptyMap(id, name);
  m.bounds = { x: 0, y: 0, w: 500, h: 500 };
  for (const side of ["S", "N", "W", "E"]) {
    const { kind, control } = legs[side];
    m.roads.push(road({ id: side, kind, points: stroke(FAR[side], C), control: { start: "none", end: control } }));
  }
  return m;
}
/* An all-way stop on residential streets. */
const allWayStop = () => crossroads("round-all-way", "An all-way stop", Object.fromEntries(["S", "N", "W", "E"].map((s) => [s, { kind: "residential", control: "stop" }])));
/* A two-way stop: a residential minor road stops; a collector (50 km/h) runs through with no control. */
const twoWayStop = () => crossroads("round-two-way", "A two-way stop", {
  S: { kind: "residential", control: "stop" }, N: { kind: "residential", control: "stop" },
  W: { kind: "collector", control: "none" }, E: { kind: "collector", control: "none" },
});
const START = { road: "S", end: "end" };   // the approach from the south, whose end is the intersection

/* `expose`: the property the round exists to show, measured with the good driver (verify-rounds section 2):
   cameToRest -- it came to rest at its line before crossing;
   heldByRight -- while standing at its line the way was not open to a sound driver for at least HELD_FOR seconds. */
export const HELD_FOR = 1.0;   // s [invented]

/* CHOSEN BY MEASUREMENT [M, tools/measure/round-seeds.mjs, run 2026-11-24]: seeds 1-60 at 4, 8 and 14 cars, the good driver through the
   round's own tick; a seed SHOWS the round when it ends through with 3 stars, the expose property held and 15-45 s on the clock.
   Per round the car count with the most showing seeds (fewest cars on a tie), then its lowest showing seed:
     full-stop  4 cars, seed 1  (shows at 56/60 seeds at 4 cars; 45/60 at 8; 3/60 at 14)
     who-first  8 cars, seed 2  (24/60 at 8; 21/60 at 4; 5/60 at 14)
     into-gap   8 cars, seed 2  (17/60 at 8; 6/60 at 4; 9/60 at 14)
     across     4 cars, seed 2  (20/60 at 4; 11/60 at 8; 0/60 at 14)
   14 cars is where the good driver is hit or hits (46 of 60 contacts at full-stop): the small map saturates. */
export const ROUNDS = [
  { id: "full-stop", title: "Full stop", task: "straight", brief: "A four-way stop. Go straight through.", say: "Go straight through the four-way stop", map: allWayStop, start: START, cars: 4, seed: 1, expose: "cameToRest" },
  { id: "who-first", title: "Who goes first", task: "left", brief: "A four-way stop. Turn left. Somebody may have the right of way.", say: "Turn left at the four-way stop", map: allWayStop, start: START, cars: 8, seed: 2, expose: "heldByRight" },
  { id: "into-gap", title: "Into the gap", task: "right", brief: "Stop, then turn right onto the busy road.", say: "Turn right onto the busy road", map: twoWayStop, start: START, cars: 8, seed: 2, expose: "heldByRight" },
  { id: "across", title: "Across the traffic", task: "left", brief: "Stop, then turn left across the busy road.", say: "Turn left across the busy road", map: twoWayStop, start: START, cars: 4, seed: 2, expose: "heldByRight" },
];
