/* =====================================================================
   WHICH LANE A CAR IS PHYSICALLY IN: from a pose in the world back to a
   place on a route (DECISIONS 10.64 (b), 10.66, 10.67).

   Everything in the sim goes the other way -- a route, a distance along
   it and an offset, to a pose (graph.js poseOnGraph, pose.js). Nothing
   asked which road a car was on, so the player's car, the one car whose
   offset is kept and can grow, was measured for good against a lane it
   had left. This is the question, asked of the world.

   A LANE IS ROAD OUTSIDE A BOX. A path is an approach, a box and an exit
   stretch. Its approach (short of the stop line) and its exit stretch
   (past where the box is cleared) are lanes; inside the box the routes
   cross and overlap, and a car there is on the turn it committed to or
   on no lane at all. So only those two parts of a path are ever found,
   and the hard question -- which of several overlapping movements a car
   in a box is on -- is never asked.

   IN A LANE: the car's centre within `reach` of the centreline (half a
   lane), on the same level, and pointing along it within ALIGNED --
   along rather than across or against. A car crossing a road is in none
   of its lanes; a car going the wrong way down one is not in it.

   THE SAME LANE HAS SEVERAL NAMES. Every route out of a leg shares its
   approach, and every route into a leg shares its exit stretch. `locate`
   returns the nearest lane with every route that names it; who is asking
   picks (drive.js: the signal on an approach, the road come from past a
   box).

   NEAREST MEANS NEAREST, ALSO ON A TAPER. A turn bay slides out from its
   neighbour, and along the taper the two centrelines are less than a
   lane apart: a car between them is in whichever is nearer, which is not
   always the one its route says (verify-locate found this, not the
   design).

   EXACT, PER SEGMENT: a path's heading is constant along each segment
   (intersection.js poseAt), so the inverse of "the path's point, moved
   across by the offset" is a projection onto the segment. At a vertex
   the two segments' normals leave a wedge neither covers; a point there
   takes the nearer segment's end, out by the offset times the bend --
   millimetres within a lane.

   Pure; the index is built once per course. No React, no DOM.
   ===================================================================== */
import { LANE } from "../map/format.js";

export const ALIGNED = 60;      // degrees off the lane's own heading within which a car is driving along it -- a flagged design constant
export const LEVEL = 2;         // m of height: a deck above is another road (contact's own figure, player.js touching)
const CELL = 30;                // m: the index's grid
const TIE = 0.01;                // m: two centrelines this close are one line
const WEDGE = 0.5;              // m past a segment's end still taken as its end: the wedge at a vertex

const grids = new WeakMap();
const keyOf = (i, j) => i * 100003 + j;

/* Every lane segment of every path, by the grid cells its body (a lane wide) touches. */
function gridOf(course, reach) {
  let g = grids.get(course);
  if (g && g.reach >= reach) return g;
  g = { reach, cells: new Map() };
  const pad = reach + WEDGE;
  course.at.forEach((spot, k) => {
    for (const [route, p] of Object.entries(spot.layout.paths)) {
      for (let i = 1; i < p.pts.length; i++) {
        /* A lane: short of the line, or past the box. A segment across either boundary is kept and its distance tested. */
        if (p.at[i - 1] >= p.stopAt && p.at[i] <= p.clearAt) continue;
        const a = p.pts[i - 1], b = p.pts[i];
        const i0 = Math.floor((Math.min(a.x, b.x) - pad) / CELL), i1 = Math.floor((Math.max(a.x, b.x) + pad) / CELL);
        const j0 = Math.floor((Math.min(a.y, b.y) - pad) / CELL), j1 = Math.floor((Math.max(a.y, b.y) + pad) / CELL);
        const seg = { k, route, p, i };
        for (let ci = i0; ci <= i1; ci++) for (let cj = j0; cj <= j1; cj++) {
          const key = keyOf(ci, cj);
          let xs = g.cells.get(key);
          if (!xs) g.cells.set(key, (xs = []));
          xs.push(seg);
        }
      }
    }
  });
  grids.set(course, g);
  return g;
}

const normDeg = (d) => { d %= 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

/* A pose against one segment of one path: { k, route, s, off, psi, part, leg } or null. */
function onSegment(seg, pose, reach, aligned = true) {
  const { p, i } = seg, a = p.pts[i - 1], b = p.pts[i];
  const len = p.at[i] - p.at[i - 1];
  if (!(len > 0)) return null;
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  const dx = pose.x - a.x, dy = pose.y - a.y;
  let t = dx * ux + dy * uy;
  if (t < -WEDGE || t > len + WEDGE) return null;
  /* How far past the segment's end the point was: zero when the projection is exact. */
  const over = t < 0 ? -t : t > len ? t - len : 0;
  t = Math.max(0, Math.min(len, t));
  /* Right of the line is positive, y down: the same hand as the pose's own offset (pose.js). */
  const off = -dx * uy + dy * ux;
  if (Math.abs(off) > reach) return null;
  const s = p.at[i - 1] + t;
  const part = s < p.stopAt ? "in" : s > p.clearAt ? "out" : null;
  if (!part) return null;
  const z = (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * (t / len);
  if (Math.abs(z - (pose.z ?? 0)) > LEVEL) return null;
  const rot = (Math.atan2(uy, ux) * 180) / Math.PI, turn = normDeg(pose.heading - rot);
  if (aligned && Math.abs(turn) > ALIGNED) return null;
  return { k: seg.k, route: seg.route, s, off, psi: (turn * Math.PI) / 180, part, leg: part === "in" ? p.from : p.to, over };
}

/* EVERY LANE WITHIN `reach` OF A POINT, nearest first: [{ k, part, leg, off, names }].
   `aligned: false` asks where a BODY is rather than where a car is driving -- a car
   across a lane, or against it, is in that lane as a thing in the road (DECISIONS
   10.68: perceived by geometry). */
export function lanesAt(course, pose, { reach = LANE / 2, aligned = true } = {}) {
  if (!course?.at) return [];
  const g = gridOf(course, reach);
  const segs = g.cells.get(keyOf(Math.floor(pose.x / CELL), Math.floor(pose.y / CELL)));
  if (!segs) return [];
  /* The best per route (a vertex gives two segments of one route), then per lane. */
  const byRoute = new Map();
  for (const seg of segs) {
    const c = onSegment(seg, pose, reach, aligned);
    if (!c) continue;
    const key = `${c.k}|${c.route}`, had = byRoute.get(key);
    /* The segment the point really projects onto, before one it is only near the end of:
       taking the smaller offset put a car up to WEDGE along from where it was. */
    if (!had || c.over < had.over - 1e-9 || (Math.abs(c.over - had.over) <= 1e-9 && Math.abs(c.off) < Math.abs(had.off))) byRoute.set(key, c);
  }
  const lanes = new Map();
  for (const c of byRoute.values()) {
    const key = `${c.k}|${c.part}|${c.leg}`;
    let lane = lanes.get(key);
    if (!lane) lanes.set(key, (lane = { k: c.k, part: c.part, leg: c.leg, off: c.off, names: [] }));
    lane.names.push(c);
    if (Math.abs(c.off) < Math.abs(lane.off)) lane.off = c.off;
  }
  return [...lanes.values()].sort((x, y) => Math.abs(x.off) - Math.abs(y.off));
}

/* THE LANE A POSE IS IN: { k, part, leg, off, names } -- the nearest lane
   whose centreline the pose is within `reach` of and aligned with, and
   under `names` every route that names it, each with its own distance
   along ({ k, route, s, off, psi, part, leg }). Null on no lane. */
export function locate(course, pose, { reach = LANE / 2, prefer = null } = {}) {
  const lanes = lanesAt(course, pose, { reach });
  let best = lanes[0] ?? null;
  /* TWO LANES ON ONE CENTRELINE: a turn bay lies on its neighbour until it
     opens (map/bays.js), so short of there the nearest lane is two lanes.
     The one the asker is already on (`prefer`: { k, route }) is the one
     they are in. */
  if (best && prefer) {
    for (const lane of lanes) {
      if (lane !== best && Math.abs(lane.off) <= Math.abs(best.off) + TIE && lane.names.some((c) => c.k === prefer.k && c.route === prefer.route)) { best = lane; break; }
    }
  }
  return best;
}
