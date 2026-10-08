/* THE HORN, as the sim and the screen both need it: how long one is shown,
   and the least time between two from one driver. Design constants
   (flagged). In its own small module so the renderer (iso/draw.js) and the
   sim (crossing.js) read one number rather than keeping two. */
export const HONK_FOR = 0.8;   // s: how long a honk shows
export const HONK_AGAIN = 3;   // s: the least time between two honks from one driver
