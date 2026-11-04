/* =====================================================================
   HOW MANY CARS A MAP GETS, FROM HOW MUCH ROAD IT HAS.

   The maintainer, testing the city (28 September): "a severe lack of
   flowing traffic". It was exactly 120 moving cars -- the count chosen for
   test map 1 -- spread over 2.5 times the road, and saved per player, so
   a count set on one map followed him onto every other. A constant that
   was right for one case and never said so.

   So a map's default is test map 1's DENSITY (120 over its 28.5
   lane-kilometres, loader `laneKm`) on its own road; the dial still sets a
   plain count, remembered per map; its top is three times that density,
   never below the old 300, capped at 600 -- what the desk machine runs
   with room left for the phone (tools/measure/city-perf.mjs), flagged
   until the phone is measured at city scale.

   Plain JS, so a check can hold it (screens are JSX, which Node cannot
   load).
   ===================================================================== */
export const CARS = { min: 10, max: 300, step: 10, start: 120 };
export const DENSITY = 120 / 28.5;
export const CARS_CEILING = 600;
const round10 = (n) => Math.round(n / 10) * 10;
/* A MAP MAY SAY ITS OWN (load.js `traffic.cars`, 3 November): the trial
   city's 211 lane-km gave 900 by the formula -- over this dial's own top of
   600, and more than twice what the phone runs. Kept inside the dial. */
export const carsFor = (loaded) => (loaded?.traffic?.cars > 0
  ? Math.max(CARS.min, Math.min(carsMaxFor(loaded), loaded.traffic.cars))
  : Math.max(CARS.min, round10(DENSITY * (loaded?.laneKm ?? 28.5))));
export const carsMaxFor = (loaded) => Math.min(CARS_CEILING, Math.max(CARS.max, round10(3 * DENSITY * (loaded?.laneKm ?? 28.5))));
