/* =====================================================================
   THE ISOMETRIC PROJECTION, AND THE ONE DEPTH KEY EVERYTHING SORTS BY.

   Stage 0 of SIMULATOR.md. The world stays metric and flat-earth:
   x east, y south, z up. The screen is the classic 2:1 dimetric view
   from the south-east and above, which is the "isometric" every builder
   game means: the two ground axes project to slopes of one in two, and
   height lifts a point straight up the screen.

     px = (x - y) * k
     py = ((x + y) / 2 - z * LIFT) * k

   LIFT is cos(30 degrees): the camera elevation the 2:1 ground implies,
   so a metre up is 0.866 of a metre on screen where a metre along a
   ground axis is 1.118. Not tuned; it is the angle the 2:1 look IS.

   THE DEPTH KEY IS THE WHOLE OF THE DRAW-ORDER PROBLEM, and it is why
   the overpass is in scope for stage 0. Two points that land on the same
   pixel lie on one line of sight, and that line runs in the direction
   (1, 1, 2 * LIFT) -- move along it and neither px nor py changes. So
   the point nearer the viewer is the one with the larger projection onto
   that direction, and

     depth = x + y + 2 * LIFT * z

   orders anything against anything: a bridge deck that overlaps a car on
   screen is nearer in ground terms AND higher, and both terms push it
   later; the crest of a hill between the viewer and a car beyond it is
   nearer and higher too. Painter's algorithm on this key, with every
   drawable small enough to have ONE key, is the renderer.

   Pure. No canvas, no colour.
   ===================================================================== */
export const LIFT = Math.cos(Math.PI / 6);

/* The direction toward the eye, for deciding which faces of a box show. */
export const TOWARD_EYE = { x: 1, y: 1, z: 2 * LIFT };

export const depthOf = (x, y, z) => x + y + 2 * LIFT * z;

/* A projector for one frame: pixels per metre and where the camera's
   world point lands on the canvas. Returned as a function rather than a
   class because it is called tens of thousands of times a frame. */
export function projector(k, cam, canvas) {
  const cx = canvas.w / 2 - (cam.x - cam.y) * k;
  const cy = canvas.h * 0.55 - ((cam.x + cam.y) / 2 - cam.z * LIFT) * k;
  return (x, y, z) => [cx + (x - y) * k, cy + ((x + y) / 2 - z * LIFT) * k];
}
