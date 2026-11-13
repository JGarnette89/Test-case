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

/* THE ELEVATION IS A PARAMETER (DECISIONS 10.86). The 2:1 look is the
   case g = 0.5, h = LIFT; the general view keeps the horizontal scale
   (px = (u - v) k) and sets the ground's vertical squash g = sin(elev)
   and the height's lift h = cos(elev), so elev = 30 is today's picture
   exactly. The line of sight is where px and py both stand still:
   (a, a, b) with 2 g a = h b, so the depth key is u + v + z * tz with
   tz = 2 g / h = 2 tan(elev) (1/LIFT at 30), and the same tz is the
   eye's z for which faces of a box show.

   THE SORT IS ONLY EXACT FOR A BOX AT ONE KEY WHERE DRAWABLES DO NOT
   OVERLAP IN DEPTH; the lower the elevation the longer a vehicle's
   footprint is on screen against its height, and the more pairs a
   single key per vehicle orders wrongly. That is expected and is not
   fixed here: the lower steps are for judging feel. 30 is the default
   and is returned as the exact constants so nothing moves at it. */
export const ELEVATIONS = [30, 25, 20, 15];
export function lensOf(elev = 30) {
  if (elev === 30) return { elev: 30, g: 0.5, h: LIFT, tz: 1 / LIFT, gk: 0.707 };
  const a = (elev * Math.PI) / 180, g = Math.sin(a), h = Math.cos(a);
  return { elev, g, h, tz: (2 * g) / h, gk: Math.SQRT2 * g };
}

/* A projector for one frame: pixels per metre and where the camera's
   world point lands on the canvas. Returned as a function rather than a
   class because it is called tens of thousands of times a frame. */
export function projector(k, cam, canvas, elev = 30) {
  const { g, h } = lensOf(elev);
  const cx = canvas.w / 2 - (cam.x - cam.y) * k;
  const cy = canvas.h * 0.55 - ((cam.x + cam.y) * g - cam.z * h) * k;
  return (x, y, z) => [cx + (x - y) * k, cy + ((x + y) * g - z * h) * k];
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
export function viewOf(k, cam, rot, canvas, { centreY = 0.55, elev = cam.elev ?? 30 } = {}) {
  const { g, h, tz } = lensOf(elev);
  const a = ((rot ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const cx = canvas.w / 2, cy = canvas.h * centreY + cam.z * h * k;
  /* NO ARRAY BUT THE ONE RETURNED. These run for every cell, segment and
     sidewalk piece in the city every frame, on screen or not, and an
     intermediate [u, v] apiece was most of the 13 MB of garbage a frame
     made at street zoom (tools/measure/draw-alloc.mjs). Same arithmetic,
     in the same order, so not one pixel or key moves. */
  const cx0 = cam.x, cy0 = cam.y, W = canvas.w, H = canvas.h;
  const P = (x, y, z) => { const dx = x - cx0, dy = y - cy0, u = dx * c - dy * s, v = dx * s + dy * c; return [cx + (u - v) * k, cy + ((u + v) * g - z * h) * k]; };
  const into = (x, y, z, o) => { const dx = x - cx0, dy = y - cy0, u = dx * c - dy * s, v = dx * s + dy * c; o[0] = cx + (u - v) * k; o[1] = cy + ((u + v) * g - z * h) * k; return o; };
  /* P carries `into`, so a helper handed only P can write into scratch. */
  P.into = into;
  return {
    rot: rot ?? 0, k,
    P,
    key: (x, y, z) => { const dx = x - cx0, dy = y - cy0, u = dx * c - dy * s, v = dx * s + dy * c; return u + v + z * tz; },
    /* P written into `o` rather than a new array, for the hot paths that
       use the point at once (a box's faces). */
    into,
    /* Whether a point lands within `m` pixels of the canvas -- P's test,
       without building P's array. */
    onScreen: (x, y, z, m) => {
      const dx = x - cx0, dy = y - cy0, u = dx * c - dy * s, v = dx * s + dy * c;
      const px = cx + (u - v) * k, py = cy + ((u + v) * g - z * h) * k;
      return px > -m && px < W + m && py > -m && py < H + m;
    },
    /* The direction toward the eye, in world coordinates: (1, 1, 1/LIFT)
       in the rotated frame, turned back. */
    eye: { x: c + s, y: -s + c, z: tz },
    elev,
  };
}
