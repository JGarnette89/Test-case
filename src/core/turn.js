/* =====================================================================
   CORE -- a turn is an arc

   What the live simulator and the shelved engine both stand on. It
   imports nothing from src/engine/ or src/sim/, so the live screens
   can use it without the old engine in their closure (checked in
   verify-core.mjs).

   Moved here verbatim on 24 September from engine/paths.js. The old home
   imports and re-exports it, so there is still one definition.
   ===================================================================== */
/* =====================================================================
   TURNS
   A car does not pivot at the stop line and then drive straight. It runs
   up its own lane, turns on a roughly constant radius, and straightens
   into the receiving lane — so a turn is three pieces: straight, arc,
   straight, with the arc tangent to both lane centrelines.

   This replaces a single quadratic Bezier drawn from the stop line to an
   off-board exit point with its control at the corner. Because those two
   legs were wildly unequal (2.7m against 20m on a right turn) the curve
   did nearly all its bending in the first couple of metres: cars began
   steering while still on the approach, left turns crossed onto the
   oncoming side 3.3m BEFORE reaching the intersection, and right turns ran
   at a 3.4m radius — tighter than any car can physically steer.

   `radius` is not a picked number. The caller derives it from where the
   car actually rests relative to where the two lane centrelines cross,
   so a wider road gives a wider turn on its own.
   ===================================================================== */
const norm = (v) => { const d = Math.hypot(v.x, v.y) || 1; return { x: v.x / d, y: v.y / d }; };

/* The arc begins where the car is standing, because from a stop that is
   the only place it can begin — a driver cannot start steering before
   they start moving. That pins the honest radius: exactly the distance
   from the car to where the two lane centrelines cross. Turn on that and
   the arc finishes precisely on the receiving lane.

   Which is what makes `radius` the whole model for how well the turn is
   driven. Larger than that distance and the car finishes wide of its
   lane; smaller and it finishes inside — over the curb on a right, across
   the centreline on a left. The straight run out to `end` then brings it
   back, gradually, exactly as a driver recovers from a bad line. So the
   caller says how tightly this driver turns, and the fault falls out of
   the geometry instead of being drawn on. */
export function turnPoints(start, corner, end, radius, samples = 20) {
  const inDir = norm({ x: corner.x - start.x, y: corner.y - start.y });
  const outDir = norm({ x: end.x - corner.x, y: end.y - corner.y });

  const cross = inDir.x * outDir.y - inDir.y * outDir.x;
  const dot = inDir.x * outDir.x + inDir.y * outDir.y;
  const turn = Math.atan2(cross, dot);              // signed: which way round
  if (Math.abs(turn) < 1e-6) return [start, end];   // straight on: nothing to arc

  const r = Math.max(1, radius);
  const sign = Math.sign(turn) || 1;
  // Centre sits perpendicular to the entry, on the side being turned to.
  const centre = { x: start.x - inDir.y * r * sign, y: start.y + inDir.x * r * sign };

  const a0 = Math.atan2(start.y - centre.y, start.x - centre.x);
  const pts = [start];
  for (let i = 1; i <= samples; i++) {
    const a = a0 + turn * (i / samples);
    pts.push({ x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r });
  }
  pts.push(end);
  return pts;
}
