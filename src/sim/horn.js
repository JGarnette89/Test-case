/* THE HORN, as the sim and the screen both need it: how long one is shown,
   and the least time between two from one driver. Design constants
   (flagged). In its own small module so the renderer (iso/draw.js) and the
   sim (crossing.js) read one number rather than keeping two. */
export const HONK_FOR = 1.5;   // s: how long a honk shows (0.8 was easy to miss -- 8 October)
export const HONK_AGAIN = 3;   // s: the least time between two honks from one driver

/* THE HORN AT BEING HELD UP (DECISIONS 10.32 ruling 2: a horn at a driver
   doing nothing wrong, for being in the way -- its own recorded class,
   `honkWhy: "heldUp"`, never counted among horns aimed at an error). Only a
   driver at aggression HELD_FROM or more (above the dial's default range, so
   the default world has none and they arrive with the dial), held below their
   wanted speed by a moving car ahead, for a patience that falls from
   HELD_PATIENCE at HELD_FROM to HELD_SOONEST at 1. Flagged design constants. */
export const HELD_FROM = 0.4, HELD_PATIENCE = 8, HELD_SOONEST = 2;
export const heldPatienceOf = (aggression) => Math.max(HELD_SOONEST, HELD_PATIENCE * (1 - aggression) / (1 - HELD_FROM));
