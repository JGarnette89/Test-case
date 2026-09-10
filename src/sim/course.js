/* =====================================================================
   STAGE 3 OF THE REBUILD: MORE THAN ONE INTERSECTION, AND THE ROAD
   BETWEEN THEM.

   The piece none of the earlier stages have. Until now every arrival was
   created at the far end of one approach and destroyed at the far end of
   its exit, and a candidate's "course" was `keepDriving` putting the same
   person back on a fresh leg -- an honest stand-in, labelled as one, and
   the first thing this stage kills.

   THE LINK IS NOT NEW GEOMETRY. It is the exit of one intersection and
   the approach of the next, and if the two are placed `reach + reach`
   apart those are the same piece of road: the exit path ends exactly
   where the approach path begins, in the same lane, pointing the same
   way. So a car crossing from one to the other is not teleported and
   nothing is stitched -- it runs off the end of one path and onto the
   start of the next at the same metre and the same speed.

   That is also why the approaches are as long as they are. An approach
   at a two-way stop is sized to hold the longest gap anybody could need
   (DECISIONS.md 5.13.12), which at 60 km/h is 279m -- and two of those
   back to back is a 558m link between boxes, which is a city block.
   The constraint that made the geometry awkward turns out to have been
   building the thing the next stage needs.

   AND THE LINK IS ASSESSABLE TERRITORY (DECISIONS.md 5.14.8). Three of
   the five axes read on the approach and only confidence needs the box,
   so this is where most of the marking supply lives rather than the gap
   between assessments.

   METRES AND SECONDS, like everything else in `src/sim/`.
   ===================================================================== */
import { layoutFor, poseAt, SIDES, OPPOSITE, ALL_WAY, TWO_WAY } from "./intersection.js";

/* Which way a car is travelling when it ARRIVES from a given side. A car
   arriving from the west is heading east. The mirror of `OUT` in
   intersection.js, which points away from the centre. */
const IN_DIR = {
  N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, E: { x: -1, y: 0 }, W: { x: 1, y: 0 },
};
const OUT_DIR = {
  N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 },
};

/* =====================================================================
   A ROW OF INTERSECTIONS

   Deliberately a row rather than a grid for the first increment. A grid
   adds nothing to the question this stage is answering -- does traffic
   flow from one intersection to the next as the same traffic -- and it
   would add a placement problem that has to be got right at the same
   time. The row generalises: `place` is the only thing that would change.
   ===================================================================== */
export function courseOf({ n = 2, kmh = 60, control = TWO_WAY, reachFor } = {}) {
  if (!reachFor) throw new Error("courseOf needs the same reachFor the crossing uses");
  const speed = kmh / 3.6;

  /* Each intersection gets its own layout, so a course of mixed control
     is expressible without anything here knowing about it. */
  const at = [];
  for (let k = 0; k < n; k++) {
    const kind = typeof control === "function" ? control(k) : control;
    const layout = layoutFor({ control: kind, reach: reachFor(kind, speed) });
    at.push({ k, layout, at: { x: 0, y: 0 } });
  }

  /* PLACED SO THE ROADS JOIN. The exit path of one ends `reach` from its
     own centre and the approach of the next begins `reach` from theirs,
     so the two meet exactly when the centres are the sum apart. A gap
     would leave a car driving through nothing; an overlap would put two
     boxes on the same tarmac. */
  let x = 0;
  for (let k = 0; k < n; k++) {
    at[k].at = { x, y: 0 };
    if (k + 1 < n) x += at[k].layout.place.reach + at[k + 1].layout.place.reach;
  }

  /* The links, east-west. A leg with no link on it is an EDGE: traffic
     enters the world there and leaves by it. */
  const links = [];
  for (let k = 0; k + 1 < n; k++) {
    links.push({
      id: links.length,
      a: k, aSide: "E",
      b: k + 1, bSide: "W",
      /* How much road there is between the two boxes, which is both
         approaches back to back. Recorded rather than derived at the
         call site because it is the quantity a route wants. */
      length: at[k].layout.place.reach + at[k + 1].layout.place.reach,
    });
  }

  const course = { n, kmh, speed, at, links };
  course.joins = joinsOf(course);
  return course;
}

/* WHAT IS ON THE OTHER SIDE OF THIS LEG. `joins["2|E"]` is the
   intersection and side a car leaving intersection 2 eastward arrives
   at, or undefined if that leg is the edge of the world. */
function joinsOf(course) {
  const joins = {};
  for (const l of course.links) {
    joins[`${l.a}|${l.aSide}`] = { k: l.b, side: l.bSide, link: l.id };
    joins[`${l.b}|${l.bSide}`] = { k: l.a, side: l.aSide, link: l.id };
  }
  return joins;
}

export const joinedTo = (course, k, side) => course.joins[`${k}|${side}`];

/* =====================================================================
   LANES, AND WHY THEY EXIST

   Following is about being on the same piece of road as somebody else,
   and that is a property of the ROAD rather than of an intersection. A
   car at the far end of one intersection's exit and a car at the near end
   of the next one's approach are nose to tail on one street -- they are
   simply filed under different intersections, and a follower that cannot
   see across that boundary drives into the back of whoever crossed it.

   So a lane has an identity of its own, shared by the two paths that use
   it, and a position along it that both can be measured in. The position
   is the WORLD POSE projected onto the lane's direction, which needs no
   bookkeeping at all: the pose is already the coordinate.
   ===================================================================== */
export function laneOut(course, k, side) {
  const j = joinedTo(course, k, side);
  return j ? `link${j.link}:${k < j.k ? "ab" : "ba"}` : `edge${k}:${side}:out`;
}

export function laneIn(course, k, side) {
  const j = joinedTo(course, k, side);
  return j ? `link${j.link}:${j.k < k ? "ab" : "ba"}` : `edge${k}:${side}:in`;
}

/* The direction of travel on a lane, so "ahead of me" is a comparison
   rather than a case analysis. Every lane here is axis-aligned, which is
   what makes the projection a single dot product. */
export const dirIn = (side) => IN_DIR[side];
export const dirOut = (side) => OUT_DIR[side];

/* WHERE A CAR IS, IN THE WORLD. The intersection's own path geometry,
   offset by where that intersection stands. `poseAt` is unchanged and
   knows nothing about any of this. */
export function poseOn(course, k, route, s) {
  const spot = course.at[k];
  const p = poseAt(spot.layout.paths[route], s);
  return { ...p, x: p.x + spot.at.x, y: p.y + spot.at.y };
}

/* HOW FAR ALONG THEIR LANE, in the lane's own direction. Larger is
   further forward, so following is `theirs > mine`, whichever way round
   the lane happens to point in world coordinates. */
export const alongDir = (pose, dir) => pose.x * dir.x + pose.y * dir.y;

/* =====================================================================
   WHERE A CAR GOES NEXT

   It runs off the end of its path and onto the start of the next one, at
   the same point and the same speed. If the leg it left by is the edge of
   the world, it is gone -- which is what the single-intersection world
   has always done, and is now the special case rather than the rule.
   ===================================================================== */
export function nextFor(course, k, route, pick) {
  const path = course.at[k].layout.paths[route];
  const j = joinedTo(course, k, path.to);
  if (!j) return null;
  return { k: j.k, route: `${j.side}/${pick(j.k, j.side)}` };
}

/* Two intersections' worth of geometry, checked rather than assumed:
   the end of one path and the start of the next have to be the same
   place, or a car crosses the boundary by teleporting. Exported so the
   check can ask, and so a course built with different reaches per
   intersection cannot quietly stop lining up. */
export function seamsOf(course) {
  const out = [];
  for (const l of course.links) {
    for (const [from, side, to, otherSide] of [
      [l.a, l.aSide, l.b, l.bSide], [l.b, l.bSide, l.a, l.aSide],
    ]) {
      /* Any movement that leaves `from` by `side` ends where any movement
         arriving at `to` from `otherSide` begins. */
      const leaving = Object.values(course.at[from].layout.paths).find((p) => p.to === side);
      const arriving = course.at[to].layout.paths[`${otherSide}/straight`];
      const end = poseOn(course, from, `${leaving.from}/${leaving.intent}`, leaving.length);
      const start = poseOn(course, to, `${otherSide}/straight`, 0);
      out.push({
        from, side, to, otherSide,
        apart: Math.hypot(end.x - start.x, end.y - start.y),
        turned: Math.abs(((end.rot - start.rot + 540) % 360) - 180),
      });
    }
  }
  return out;
}

export { ALL_WAY, TWO_WAY, SIDES, OPPOSITE };
