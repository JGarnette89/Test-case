/* =====================================================================
   WHAT A DRIVER CAN SEE PAST (SIMULATOR.md, trucks as sight blockers).

   `seenBy` (crossing.js) is WHEN a driver looks; this is WHAT they can see
   when they do. A vehicle taller than a driver's eye hides what is behind
   it: a truck, never a car -- you see over and through a car, and nobody
   sees through a box truck. Plan geometry, one segment against each tall
   vehicle's footprint, the same test people on foot were already hidden
   behind parked cars by (peds.js `inSight`), moved here so there is one.

   The tall vehicles' footprints are taken once a tick, as the world is
   committed (`world.tall`), so every driver deciding from that state sees
   the same trucks; a world without one carries none and nothing here
   runs, which leaves a world of cars exactly as it was.

   Pure. No React, no DOM.
   ===================================================================== */
import { vehicleOf, lenOf } from "./traffic.js";

/* WHAT HIDES WHAT IS BEHIND IT: a vehicle that is an opaque box above a
   driver's eye. A car is taller than the eye (1.5 m against about 1.2) and
   hides nothing -- it is glass at that height; a van or a truck is a wall.
   A flagged figure: taller than HIDES. (The first version tested against
   the eye height, and every car in the world blocked every other.) */
export const EYE = 1.2;
export const HIDES = 2.0;
export const tallerThanEye = (a) => !a.crash && vehicleOf(a).height > HIDES;

/* The footprint of a pose as a box: centre, heading in degrees, size. */
export const boxOf = (p, id = null) => ({ id, x: p.x, y: p.y, heading: p.rot ?? p.heading ?? 0, l: p.length, w: p.width });

/* Does the segment p-q pass through box b (l along its heading, w across)? */
/* ALLOCATES NOTHING: it runs for every eye, every target and every box
   on every tick, and a version that built arrays for each corner and edge
   was a tenth of all the garbage the sim made (step-alloc.mjs, 2 October)
   -- and garbage is what made the step stall. Liang-Barsky clipping, the
   four edges written out. */
export function segHitsBox(p, q, b, l = b.l, w = b.w) {
  const h = ((b.heading ?? 0) * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h);
  const ax = p.x - b.x, ay = p.y - b.y, bx = q.x - b.x, by = q.y - b.y;
  const u0 = ax * c + ay * s, v0 = -ax * s + ay * c, u1 = bx * c + by * s, v1 = -bx * s + by * c;
  const du = u1 - u0, dv = v1 - v0;
  let t0 = 0, t1 = 1;
  /* One edge: the segment's parameter where it crosses, and which side it enters from. */
  const clip = (pp, qq) => {
    if (pp === 0) return qq >= 0;
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
    return true;
  };
  return clip(-du, u0 + l / 2) && clip(du, l / 2 - u0) && clip(-dv, v0 + w / 2) && clip(dv, w / 2 - v0) && t0 <= t1;
}

/* Hidden from `eye`: every line from it to the point passes through a box
   (other than those in `skip`, the looker's own and the target's). */
export const blocked = (eye, q, boxes, skip = null) => boxes.some((b) => (!skip || !skip.has(b.id)) && segHitsBox(eye, q, b));

/* A driver's eye: in their own car, a little behind its nose. */
export function eyeOf(pose, me) {
  const h = ((pose.rot ?? pose.heading ?? 0) * Math.PI) / 180, d = lenOf(me) / 2 - 1.8;
  return { x: pose.x + Math.cos(h) * d, y: pose.y + Math.sin(h) * d };
}

/* A road user is hidden when neither end of it can be seen: a car whose
   nose shows past the truck is seen. */
export function hiddenFrom(eye, pose, them, boxes, skip) {
  const h = ((pose.rot ?? 0) * Math.PI) / 180, d = lenOf(them) * 0.4;
  const a = { x: pose.x + Math.cos(h) * d, y: pose.y + Math.sin(h) * d }, b = { x: pose.x - Math.cos(h) * d, y: pose.y - Math.sin(h) * d };
  return blocked(eye, a, boxes, skip) && blocked(eye, b, boxes, skip);
}
