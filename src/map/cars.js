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
/* CLEAN MODE'S COUNT (DECISIONS 10.50 ruling 1; 10.56). It put 180 on everything, which is 4.5
   times what a 40-car fixture is built for and 9 times a 20-car one. A map built small keeps its
   own; one built for real traffic gets the 180 measured best on the phone (22 October), which on
   the city is under what its road would take. SMALL_BELOW is a flagged design constant, and it
   sits in the gap between what the maps are built for: 20-40, and 120 upward. */
export const CLEAN_CARS = 180, SMALL_BELOW = 100;
export const cleanCarsFor = (loaded) => {
  const own = carsFor(loaded);
  return own < SMALL_BELOW ? own : Math.max(CARS.min, Math.min(carsMaxFor(loaded), CLEAN_CARS));
};
export const carsMaxFor = (loaded) => Math.min(CARS_CEILING, Math.max(CARS.max, round10(3 * DENSITY * (loaded?.laneKm ?? 28.5))));
