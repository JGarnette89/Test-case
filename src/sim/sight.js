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
export function segHitsBox(p, q, b, l = b.l, w = b.w) {
  const h = ((b.heading ?? 0) * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h);
  const to = (x, y) => { const dx = x - b.x, dy = y - b.y; return [dx * c + dy * s, -dx * s + dy * c]; };
  const [u0, v0] = to(p.x, p.y), [u1, v1] = to(q.x, q.y);
  let t0 = 0, t1 = 1;
  const du = u1 - u0, dv = v1 - v0;
  for (const [pp, qq] of [[-du, u0 + l / 2], [du, l / 2 - u0], [-dv, v0 + w / 2], [dv, w / 2 - v0]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
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
