/* =====================================================================
   IS THERE ROAD UNDER THE CAR: the drawn surface of any road, asked of a
   point in the world (DECISIONS 10.64, 10.67).

   The grass was judged by distance from the player's ROUTE, so pavement
   far from the route dragged like grass and a car on another street
   crawled. This asks the map: the road's ribbon as the loader built it
   and the renderer draws it (map/load.js `left`/`right`), parking strip
   and bays included -- what is drawn as road is road.

   A road's bounding box is kept per course so a point is tested against
   the few roads near it. Pure.
   ===================================================================== */
import { onRoadSurface } from "../map/sidewalks.js";

const boxes = new WeakMap();
function boxesOf(course) {
  let b = boxes.get(course);
  if (b) return b;
  b = (course.map?.roads ?? []).filter((r) => r.left && r.right).map((r) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const side of [r.left, r.right]) for (const p of side) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    return { r, x0, y0, x1, y1 };
  });
  boxes.set(course, b);
  return b;
}

/* Whether (x, y) is on some road's drawn surface. A course with no map (stage 0) has no answer: null. */
export function pavedAt(course, p) {
  if (!course?.map?.roads) return null;
  for (const b of boxesOf(course)) {
    if (p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1) continue;
    if (onRoadSurface(b.r, p)) return true;
  }
  return false;
}
