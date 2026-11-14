/* =====================================================================
   RELIEF SHADING: THE SLOPE OF THE GROUND AS A SIGNAL (DECISIONS 10.87).

   WHAT THIS IS, HONESTLY: a signal we are CHOOSING to send, not a simulation of light. The camera is axonometric, so a rise is the same kind of
   screen shift as more road (10.86); the one thing it leaves of a hill is a length change of about 10% per 8% of grade, which nobody reads as "hill".
   Shading by slope reads at once and survives any camera. Same category as the exaggerated body roll, under Jay's standing legibility ruling, which is
   why the gain is a named constant beside BODY and why SOMEONE LATER MUST NOT "CORRECT" IT TO PHYSICAL VALUES: a real 9% grade tilts a surface 5 degrees
   and changes its brightness by about 1%, so the physical value DELETES THE FEATURE. [the gain, floor and ceiling are invented; Jay to dial].

   HOW: the surface's gradient (rise over run, as a vector on the ground) is multiplied by RELIEF.gain, a tilt is made from it, and that tilt is lit by a
   light that is FIXED TO THE VIEWER, not to the world -- from the viewer's side with a small component from the viewer's right. A slope facing the viewer
   (a climb ahead, on a road aligned with travel) is bright, one turning away (a descent) dark, and that does not flip when the car turns, which the old
   world-fixed light did (it read +2.8% climbing at one heading and -2.8% at another). The result is a brightness MULTIPLIER, clamped to [floor, ceil] so
   nothing goes black or blows out.

   THE SURROUNDING GROUND SHADES WITH THE ROAD, by the same function of the surface's own gradient, so no step is made at the road's edge: road,
   terrain, sidewalks and junction surfaces each ask for the factor of THEIR OWN gradient, and where the road lies on the ground they are the same gradient.
   (A prototype that shaded only the road's neighbours with the road's value produced a band of darkness across the world.) Not drawn in the flat tier
   (zoomed out to the map), where terrain is one quad and a road run spans many gradients.

   THE LIMITATION, recorded beside it: it tells the player a hill is THERE; it does not let them SEE OVER it. A car vanishing at a brow and reappearing
   needs the ground to occlude, the expensive route (it needs terrain in the sorted layer, which exists to stop grass painting over tarmac, DECISIONS
   10.86). The cars it would hide are a few metres' worth at the brow at these camera angles. To be judged AFTERWARDS against what this leaves wanting.
   ===================================================================== */
import { RELIEF } from "./body.js";

/* The light in WORLD coordinates for a view rotated by `rotDeg`: the viewer's side (toward the eye) plus a lateral share from the viewer's right, and
   up. From project.js's frame: toward-the-eye horizontal is (c + s, c - s...) i.e. the rotated (1, 1) turned back, the screen's right the rotated (1, -1). */
export function reliefLight(rotDeg, R = RELIEF) {
  const a = (rotDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), r = Math.SQRT1_2;
  const ex = (c + s) * r, ey = (-s + c) * r, rx = (c - s) * r, ry = (-s - c) * r;
  const x = ex + R.lateral * rx, y = ey + R.lateral * ry, z = R.up, l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
}

/* The brightness multiplier for a surface of gradient (gx, gy) = d(height)/d(world x, y). 1 on the flat. */
export function reliefFactor(gx, gy, L, R = RELIEF) {
  if (!(R.gain > 0) || !Number.isFinite(gx) || !Number.isFinite(gy)) return 1;
  const tx = -gx * R.gain, ty = -gy * R.gain, l = Math.hypot(tx, ty, 1);
  const lit = (a) => R.amt + (1 - R.amt) * Math.max(0, a);
  const f = lit((tx * L.x + ty * L.y + L.z) / l) / lit(L.z);
  return Math.max(R.floor, Math.min(R.ceil, f));
}
