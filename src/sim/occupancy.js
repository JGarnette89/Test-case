/* =====================================================================
   WHO IS IN A LANE -- ONE DEFINITION, AND THE PHYSICAL ONE (28 October;
   SIMULATOR IN FLIGHT 38, DECISIONS 10.23 item 17).

   Four readers ask it: the following model (crossing.js whatStops), the
   lane change on the approach and on the exit stretch (lanechange.js
   neighbours, exitNeighbours) and placement (placement.js
   approachNeighbours). They had two answers. The following model counted
   two cars from the same leg as sharing a lane for their WHOLE paths, past
   where the paths split -- comparing distance along two DIFFERENT paths as
   if they were one lane -- so a car that had left on the off-ramp, a median
   30 m sideways, was still the leader, and 10-27% of all following was
   done against a car that was not there. The exit-stretch lane change
   counted by destination and could not see a car still in the lane short of
   its split. The earlier fix for placement made it AGREE with the following
   model: two readers consistent with a fiction. The rule since: find which
   definition matches the world, then share that one.

   THE DEFINITION. Two cars on the same route share its lane. Two cars on
   DIFFERENT routes from the same leg share a lane only while BOTH are short
   of their SPLIT: the first point where the two paths' centrelines are a
   lane apart (LANE) -- which is what "a different lane" means, and the point
   past which no two bodies can touch (the widest vehicle is 2.6 m). Short of
   the split the two paths run on one centreline, so distance along either
   is distance along the lane.

   COST: the split is a property of two paths, not of anybody on them --
   computed once per pair, lazily, cached per layout like the conflict
   table, never per tick (DECISIONS 10.33).
   ===================================================================== */
import { poseAt } from "./intersection.js";
import { LANE } from "../map/format.js";

const splits = new WeakMap();
/* How many splits have been computed: the evidence that it is once per pair (SIMULATOR IN FLIGHT 38, F6). */
export const splitCount = { n: 0 };

/* Where routes a and b come a lane apart: { a, b }, each the distance along
   its own path; Infinity where they never do. */
export function splitOf(layout, a, b) {
  /* Nested maps, not a joined key: the lookup runs for every pair of cars
     from one leg on different routes, every tick, and building "a|b" there
     was the whole of this module's cost -- +2.3% of the city's step with the
     world held identical (SIMULATOR IN FLIGHT 38, F6). */
  let m = splits.get(layout);
  if (!m) splits.set(layout, (m = new Map()));
  let row = m.get(a);
  if (!row) m.set(a, (row = new Map()));
  let hit = row.get(b);
  if (hit) return hit;
  splitCount.n++;
  const pa = layout.paths[a], pb = layout.paths[b];
  hit = { a: Infinity, b: Infinity };
  if (pa && pb) {
    /* Walk path a; keep the nearest point of path b, searched near the last
       one (the two run together until they part, so the match moves on
       steadily). */
    let sb = 0;
    for (let s = 0; s <= pa.length; s += 0.5) {
      const p = poseAt(pa, s);
      let best = Infinity, bestS = sb;
      for (let t = Math.max(0, sb - 2); t <= Math.min(pb.length, sb + 6); t += 0.25) {
        const q = poseAt(pb, t), d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < best) { best = d; bestS = t; }
      }
      sb = bestS;
      if (best >= LANE) { hit = { a: s, b: sb }; break; }
    }
  }
  row.set(b, hit);
  let back = m.get(b);
  if (!back) m.set(b, (back = new Map()));
  back.set(a, { a: hit.b, b: hit.a });
  return hit;
}

/* Whether car `them` is in the lane car `me` is in, by the definition above.
   Both at one node, on paths of `layout`. */
export function sharesLane(layout, me, them) {
  if (me.route === them.route) return true;
  const pm = layout.paths[me.route], pt = layout.paths[them.route];
  if (!pm || !pt || pm.from !== pt.from) return false;
  const sp = splitOf(layout, me.route, them.route);
  return me.s < sp.a && them.s < sp.b;
}

/* Whether a car on `route` at `s` is in the lane of `target` -- the same
   question asked of a place on a route rather than a car (the lane change's
   target lane, placement's slot). */
export function onLaneOf(layout, route, s, target, sTarget) {
  return sharesLane(layout, { route: target, s: sTarget }, { route, s });
}
