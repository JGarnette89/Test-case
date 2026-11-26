/* =====================================================================
   THE ROUNDS (WORK-game-slice2 section 5): pure data. A round TYPE is a
   map, a task and a car count; a round is a type plus a SEED drawn from
   one of its two pools. Nothing here says what the traffic does.

   THE SEED AND THE CAR COUNT ARE CHOSEN BY MEASUREMENT, NEVER TYPED IN AS
   A TIME (GAME.md rule 1): tools/measure/round-seeds.mjs builds the
   decision point of every seed and sorts it by what the freeze shows; the
   pools below carry that run's mark.

   Each leg is 140 m, the intersection at the middle of a 500 m square. A leg is straight, so it is its two
   ends (no stroke helper: map/samples.js is imported by 65 checks, and a one-word export there re-runs them all).
   ===================================================================== */
import { emptyMap, road } from "../map/format.js";
import { rng } from "../core/rng.js";

const C = { x: 250, y: 250 };
const LEG = 140;
/* The far end of each leg, and the road that comes from it. */
const FAR = { S: { x: C.x, y: C.y + LEG }, N: { x: C.x, y: C.y - LEG }, W: { x: C.x - LEG, y: C.y }, E: { x: C.x + LEG, y: C.y } };

/* A four-leg intersection, every leg a road that ends at the middle; `legs` says each one's kind and what governs it. */
function crossroads(id, name, legs, walk = null) {
  const m = emptyMap(id, name);
  m.bounds = { x: 0, y: 0, w: 500, h: 500 };
  for (const side of ["S", "N", "W", "E"]) {
    const { kind, control } = legs[side];
    m.roads.push(road({ id: side, kind, points: [FAR[side], C], control: { start: "none", end: control }, ...(walk === side ? { crosswalk: { end: true } } : {}) }));
  }
  return m;
}
/* An all-way stop on residential streets. */
const allWayStop = (walk = null) => crossroads("round-all-way", "An all-way stop", Object.fromEntries(["S", "N", "W", "E"].map((s) => [s, { kind: "residential", control: "stop" }])), walk);
/* A two-way stop: a residential minor road stops; a collector (50 km/h) runs through with no control. */
const twoWayStop = (walk = null) => crossroads("round-two-way", "A two-way stop", {
  S: { kind: "residential", control: "stop" }, N: { kind: "residential", control: "stop" },
  W: { kind: "collector", control: "none" }, E: { kind: "collector", control: "none" },
}, walk);
const START = { road: "S", end: "end" };   // the approach from the south, whose end is the intersection

/* THE POOLS [M, tools/measure/round-seeds.mjs]: filled from the run named in POOLS_RUN. `now`: the way is open at the freeze and stays
   open at least 2.0 s, so going at once is right. `wait`: shut at the freeze, and an opening of at least 1.5 s begins between 1.0 and
   10.0 s into the wait. Every seed in either pool is one the oracle (hold until the opening, then go) passes with 3 stars and no fault. */
export const POOLS_RUN = "[M, tools/measure/round-seeds.mjs, run 2026-11-25 (slice 5, with forcedBrake in the oracle's criteria), seeds 1-200 at 4, 8 and 12 cars; the rebuilt first 30 of each pool equal slice 4's, now/wait 131/48, 109/64, 162/18, 64/49; no oracle seed rejected for a forcedBrake]";
/* Per type, the car count with the most pooled seeds, and the first 30 seeds of each pool (a cap [invented] so verify-rounds stays short; the
   search found now/wait: straight-4way (131, 48), left-4way (109, 64), right-2way (162, 18), left-2way (64, 49) at the chosen counts). */
const POOLS = {
  "four-way-straight": { cars: 4, now: [1, 2, 4, 5, 7, 9, 10, 11, 13, 15, 16, 17, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 36, 37, 41, 42, 45], wait: [3, 12, 14, 21, 31, 35, 38, 39, 43, 46, 51, 56, 61, 66, 73, 75, 76, 77, 84, 85, 90, 91, 92, 94, 100, 105, 107, 108, 111, 119] },
  "four-way-left": { cars: 4, now: [1, 2, 4, 9, 10, 11, 15, 16, 17, 19, 22, 23, 24, 25, 27, 28, 29, 30, 33, 37, 41, 42, 46, 47, 52, 53, 55, 58, 62, 65], wait: [3, 7, 12, 13, 20, 21, 26, 31, 32, 35, 36, 38, 39, 40, 43, 48, 49, 51, 54, 56, 60, 61, 64, 66, 73, 75, 76, 77, 86, 90] },
  "two-way-right": { cars: 4, now: [1, 2, 3, 4, 6, 7, 8, 9, 10, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34, 36, 37, 38], wait: [5, 11, 12, 14, 21, 42, 74, 81, 90, 119, 122, 126, 140, 144, 150, 153, 164, 169] },
  "two-way-left": { cars: 4, now: [4, 18, 29, 30, 31, 34, 36, 39, 43, 49, 50, 54, 65, 66, 71, 72, 73, 76, 77, 78, 84, 85, 87, 89, 91, 92, 94, 96, 99, 101], wait: [3, 12, 23, 33, 38, 41, 42, 44, 61, 67, 70, 74, 80, 81, 82, 83, 86, 93, 97, 98, 102, 104, 105, 106, 108, 111, 114, 122, 137, 138] },
};

/* FOUR ROUND TYPES: the same two maps as slice 1, a task each. */
const DEFS = [
  { id: "four-way-straight", title: "Four-way stop, straight", task: "straight", brief: "A four-way stop. Go straight through.", say: "Go straight through the four-way stop", map: allWayStop, start: START },
  { id: "four-way-left", title: "Four-way stop, left", task: "left", brief: "A four-way stop. Turn left.", say: "Turn left at the four-way stop", map: allWayStop, start: START },
  { id: "two-way-right", title: "Two-way stop, right", task: "right", brief: "Stop, then turn right onto the busy road.", say: "Turn right onto the busy road", map: twoWayStop, start: START },
  { id: "two-way-left", title: "Two-way stop, left", task: "left", brief: "Stop, then turn left across the busy road.", say: "Turn left across the busy road", map: twoWayStop, start: START },
];
/* THE HAZARD ROUNDS (slice 8; round.js HAZARD_RISK). The same four types on the same maps with ONE crosswalk, at the box on the leg the task EXITS BY
   (straight N, left W, right E: the player comes from the south), so the people the sim sends there are on the player's path after the turn. Each has
   its own pool of HAZARD seeds, chosen by measurement (tools/measure/round-seeds.mjs --hazard, HAZARDS below): a person the sim made steps onto the
   player's path after its stop line, and a stop at REACTION_FLOOR + 0.5 s after they step off stops short of them. Plain seeds are on the plain maps
   and are not touched. */
const EXIT = { straight: "N", left: "W", right: "E" };
export const HAZARD_P = 0.35;   // the chance a round of a set is a hazard round, from the types that have a pool [invented, the spec's]
export const HAZARDS_RUN = "[M, tools/measure/round-seeds.mjs --hazard, run 2026-11-26 (slice 9, WITH THE BOOST: the car launches at power 2.5), at 4 cars, found by the search and kept if a stop at REACTION_FLOOR + 0.5 s rests with the crosswalk ahead of the nose: straight-4way 1 of 6000 seeds (slice 8: 6 of 1500), left-4way 0 of 1500, right-2way 30 of 1500 (slice 8: 25), left-2way 81 of 1500 (slice 8: 60); the first 30 of each pool are kept (a cap [invented] so verify-rounds stays short)]";
const HAZARDS = {
  "four-way-straight": { cars: 4, seeds: [547] },
  "four-way-left": { cars: 4, seeds: [] },
  "two-way-right": { cars: 4, seeds: [89, 131, 201, 228, 312, 320, 414, 432, 445, 511, 580, 654, 668, 686, 694, 704, 774, 811, 874, 914, 939, 1110, 1112, 1120, 1139, 1245, 1299, 1338, 1429, 1456] },
  "two-way-left": { cars: 4, seeds: [17, 19, 42, 74, 84, 91, 103, 112, 118, 168, 213, 216, 252, 285, 297, 362, 397, 398, 400, 442, 499, 502, 510, 511, 528, 540, 542, 543, 567, 585] },
};
const hazardOf = (d) => ({ ...d, id: `${d.id}-hazard`, hazard: true, map: () => d.map(EXIT[d.task]), cars: HAZARDS[d.id].cars, pools: { hazard: HAZARDS[d.id].seeds } });
export const TYPES = DEFS.map((d) => ({ ...d, cars: POOLS[d.id].cars, pools: { now: POOLS[d.id].now, wait: POOLS[d.id].wait }, hazardType: hazardOf(d) }));

/* A SET is five rounds: one of each type, then one more from a random type. Each is drawn from its type's pools: `wait` with probability
   P_WAIT, `now` otherwise, so that "go at once" is sometimes right and waiting is not a free habit. From a seed taken when Play is
   pressed (never inside a useMemo). A pool that is empty falls back to the other, and a type with neither is skipped. */
export const SET_SIZE = 5;
export const P_WAIT = 0.7;   // [invented, the spec's]
/* A HAZARD POOL SMALLER THAN THIS IS NEVER DRAWN (slice 9 review): five seeds is the variety floor every pool is held to [invented]. The boost left
   four-way-straight one fair hazard seed in 6000 searched [M, slice 9's run], and one seed drawn every time is a memorised round, not a hazard. */
export const HAZARD_MIN = 5;
export function drawSet(setSeed, types = TYPES) {
  const r = rng(setSeed), usable = types.filter((t) => t.pools.now.length || t.pools.wait.length);
  if (!usable.length) return [];
  const order = usable.slice();
  while (order.length < SET_SIZE) order.push(usable[Math.floor(r() * usable.length)]);
  /* THE HAZARD ROLL has its own stream, so the plain draws above are the draws they always were (slice 8): with probability HAZARD_P a round is the
     type's HAZARD round, from its hazard pool, when it has one. Two draws per round, always, whether or not they are used. */
  const rh = rng((setSeed ^ 0x9e3779b9) >>> 0);   // HAZARD_MIN: below it the type plays no hazard round (slice 9 review)
  return order.slice(0, SET_SIZE).map((type) => {
    const wantWait = r() < P_WAIT;
    const pool = wantWait ? (type.pools.wait.length ? "wait" : "now") : (type.pools.now.length ? "now" : "wait");
    const seeds = type.pools[pool];
    const plain = { type, pool, seed: seeds[Math.floor(r() * seeds.length)], cars: type.cars };
    const roll = rh(), pick = rh(), hz = type.hazardType;
    return hz?.pools.hazard.length >= HAZARD_MIN && roll < HAZARD_P ? { type: hz, pool: "hazard", seed: hz.pools.hazard[Math.floor(pick * hz.pools.hazard.length)], cars: hz.cars } : plain;
  });
}
