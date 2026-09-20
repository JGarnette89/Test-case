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
   pixel lie on one line of sight: move along it and neither px nor py
   changes. From the formulas, px is unchanged along any (a, a, b), and
   py is unchanged when a - b * LIFT = 0, so the line runs in the
   direction (1, 1, 1 / LIFT). The point nearer the viewer is the one
   with the larger projection onto that direction, and

     depth = x + y + z / LIFT

   (Stage 0 wrote 2 * LIFT for the z weight -- 1.73 where 1.15 is the
   number -- and it looked right by eye because the two weights rarely
   disagree on the pairs a scene has. verify-chase.mjs caught it: two
   points along the stated direction did not land on one pixel. Fixed
   at the source; the exact key can only order more pairs correctly.)

   orders anything against anything: a bridge deck that overlaps a car on
   screen is nearer in ground terms AND higher, and both terms push it
   later; the crest of a hill between the viewer and a car beyond it is
   nearer and higher too. Painter's algorithm on this key, with every
   drawable small enough to have ONE key, is the renderer.

   Pure. No canvas, no colour.
   ===================================================================== */
export const LIFT = Math.cos(Math.PI / 6);

/* The direction toward the eye, for deciding which faces of a box show. */
export const TOWARD_EYE = { x: 1, y: 1, z: 1 / LIFT };

export const depthOf = (x, y, z) => x + y + z / LIFT;

/* A projector for one frame: pixels per metre and where the camera's
   world point lands on the canvas. Returned as a function rather than a
   class because it is called tens of thousands of times a frame. */
export function projector(k, cam, canvas) {
  const cx = canvas.w / 2 - (cam.x - cam.y) * k;
  const cy = canvas.h * 0.55 - ((cam.x + cam.y) / 2 - cam.z * LIFT) * k;
  return (x, y, z) => [cx + (x - y) * k, cy + ((x + y) / 2 - z * LIFT) * k];
}

/* THE VIEW, WITH A ROTATION: the world turned by `rot` degrees about
   the camera before the same projection. A chase camera that keeps the
   road ahead up the screen needs it (chase.js), and everything drawn
   is a box the code builds, so nothing is drawn wrong at any angle.
   Three things must agree on the rotation or the picture lies: where a
   point lands (`P`), what is nearer the eye (`key`, on the ROTATED
   coordinates -- the line of sight is fixed to the screen, not to the
   world), and which faces of a box show (`eye`, the line of sight
   turned back into the world's frame). All three come from here. */
export function viewOf(k, cam, rot, canvas, { centreY = 0.55 } = {}) {
  const a = ((rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = canvas.w / 2, cy = canvas.h * centreY + cam.z * LIFT * k;
  const turn = (x, y) => { const dx = x - cam.x, dy = y - cam.y; return [dx * c - dy * s, dx * s + dy * c]; };
  return {
    rot: rot ?? 0, k,
    P: (x, y, z) => { const [u, v] = turn(x, y); return [cx + (u - v) * k, cy + ((u + v) / 2 - z * LIFT) * k]; },
    key: (x, y, z) => { const [u, v] = turn(x, y); return u + v + z / LIFT; },
    /* The direction toward the eye, in world coordinates: (1, 1, 1/LIFT)
       in the rotated frame, turned back. */
    eye: { x: c + s, y: -s + c, z: 1 / LIFT },
  };
}
