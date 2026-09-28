/* =====================================================================
   TOWNS ARE DISTRIBUTIONS, NOT DRIVERS (DRIVING-SCHOOL.md section 3, the
   maintainer's addition): "everywhere tailgates here, nobody signals
   there, this one rolls every stop" -- so the same candidate feels
   different in different places and the player is learning a PLACE.

   A character is a weighting over which axis a driver born here is weak
   on (core/driver.js `composeDriver`), and for confidence which side. Every
   behaviour follows from the model that already turns ratings into
   driving: a knowledge-weak driver rolls stops, a bold one follows close
   and takes tight gaps, a steering-weak one weaves and runs wide on bends,
   a braking-weak one leaves it late and stands on it. Nothing here writes
   a behaviour.

   TOWN_PULL is the weight on the character's own axis against 1 for each
   of the other four: at 6 the axis is the first weak one drawn for 6 in 10
   drivers and a weak axis for about three quarters of them, against about
   a third in an ordinary place -- "most of the population", which is how
   the maintainer put it. A design constant, flagged; the school's
   raising of a town's ceiling (DRIVING-SCHOOL.md) is where it would move.
   ===================================================================== */
export const TOWN_PULL = 6;

export const TOWNS = {
  ordinary: null,
  tailgaters: { weights: { confidence: TOWN_PULL }, bold: 0.9 },
  "rolling-stops": { weights: { knowledge: TOWN_PULL } },
  wanderers: { weights: { steering: TOWN_PULL } },
  "late-brakers": { weights: { braking: TOWN_PULL } },
  hesitant: { weights: { confidence: TOWN_PULL }, bold: 0.1 },
};

/* What a character means to the draw; an unknown or absent one is ordinary. */
export const townOf = (character) => TOWNS[character] ?? null;
