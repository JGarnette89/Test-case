/* =====================================================================
   CORE -- how hard a road lets a car move sideways

   What the live simulator and the shelved engine both stand on. It
   imports nothing from src/engine/ or src/sim/, so the live screens
   can use it without the old engine in their closure (checked in
   verify-core.mjs).

   Moved here on 25 September from sim/course.js (LATERAL) and
   sim/lanechange.js (the lane-change time), because a turn bay's taper
   (map/bays.js) is sized by both and importing them where they lived
   made a module cycle. The old homes re-export or call them.
   ===================================================================== */

/* HOW TIGHT A BEND A ROAD IS ALLOWED, and the one sideways comfort limit
   everything here is sized by.
   A road is designed so that a driver at its speed feels no more than a
   set sideways acceleration on its tightest curve; the radius follows
   from the speed and that one constant. The constant is road design's
   own -- the side-friction factor the design tables use at the speeds a
   street has, about 0.15 g on a flat road with no banking -- and it is
   the one number in the bend that is taken from a standard rather than
   derived here. It is not tuned: at 60 km/h it gives 189m, and a bend at
   that radius is as tight as a road built for 60 is allowed to be, which
   is exactly "challenges steering ability a little".
   ===================================================================== */
export const LATERAL = 0.15 * 9.81;

/* HOW LONG A CLEAN CHANGE OF ONE LANE TAKES, derived rather than chosen:
   a smooth (smoothstep) lateral move of `lane` metres has its peak
   sideways acceleration 6L/T^2 at the ends, and the road's own comfort
   limit for sideways acceleration is LATERAL. Solved for T: about 3.8 s
   for a 3.6 m lane. A function of the lane's width, because the width is
   declared in more than one place and this is the formula, once. */
export const changeTime = (lane) => Math.sqrt((6 * lane) / LATERAL);
