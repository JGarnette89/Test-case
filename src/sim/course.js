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
import {
  layoutFor, poseAt, exitFor, SIDES, INTENTS, OPPOSITE, ALL_WAY, TWO_WAY,
  intersectionFor, axisOf,
} from "./intersection.js";
import { rng } from "../core/rng.js";
import { laneSpanOnGraph } from "./graph.js";

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
   A GRID OF INTERSECTIONS

   `cols x rows`, and a row is the `rows: 1` case rather than a separate
   thing. It started as a row on purpose -- a grid would have added a
   placement problem to be got wrong at the same time as the handoff --
   and it became a grid the moment a ROUTE was wanted, because on a row
   every turn leaves the world and the only drive expressible is a
   straight one. A course you cannot be given directions through is not a
   course.

   THE PLACEMENT RULE IS THE SAME ONE IN BOTH AXES and needs no second
   thought: the exit path of one intersection ends `reach` from its own
   centre and the approach of the next begins `reach` from theirs, so
   they meet exactly when the centres are the sum apart. North-south
   works because `OUT.S` points at +y and `OUT.N` at -y, and the lane
   offsets fall on the same line from both directions -- checked, not
   assumed, by `seamsOf`.
   ===================================================================== */
export function courseOf({ n, cols, rows = 1, kmh = 60, control = TWO_WAY, reachFor, bends } = {}) {
  if (!reachFor) throw new Error("courseOf needs the same reachFor the crossing uses");
  const across = cols ?? n ?? 2;
  const down = rows;
  const speed = kmh / 3.6;
  const count = across * down;
  const radius = radiusFor(speed);

  /* Each intersection's control and reach first, because the links --
     and what bends on them -- have to be known before a layout can be
     built: a bend belongs to a LINK and both of its ends have to agree. */
  const kinds = [], reaches = [];
  for (let k = 0; k < count; k++) {
    kinds.push(typeof control === "function" ? control(k) : control);
    reaches.push(reachFor(kinds[k], speed));
  }

  /* The links. A leg with no link on it is an EDGE: traffic enters the
     world there and leaves by it. */
  const links = [];
  const index = (c, r) => r * across + c;
  const join = (a, aSide, b, bSide) => links.push({
    id: links.length, a, aSide, b, bSide,
    /* How much road there is between the two boxes, which is both
       approaches back to back. Recorded rather than derived at the call
       site because it is the quantity a route wants. */
    length: reaches[a] + reaches[b],
    bend: 0,
  });
  for (let r = 0; r < down; r++) {
    for (let c = 0; c < across; c++) {
      if (c + 1 < across) join(index(c, r), "E", index(c + 1, r), "W");
      /* Row r + 1 is at LARGER y, which is south. */
      if (r + 1 < down) join(index(c, r), "S", index(c, r + 1), "N");
    }
  }

  /* WHICH LINKS BEND, AND BY HOW MUCH. `bends(link, geometry)` answers
     in metres of sideways bow, signed; nothing bends unless asked, so
     every course that existed before this is the same course. The
     geometry handed over is what an amplitude has to be solved against:
     both ends' reaches (equal on a grid, and a bend needs them equal so
     the two halves are mirror images at the seam), the line, and the
     radius the road's speed wants. */
  const lineAt = intersectionFor().lineAt;
  const bend = {};
  for (const l of links) {
    if (!bends) break;
    if (reaches[l.a] !== reaches[l.b]) continue;   // a bend needs both halves alike
    l.bend = bends(l, { reach: reaches[l.a], lineAt, radius }) || 0;
    if (!l.bend) continue;
    (bend[l.a] ??= {})[l.aSide] = l.bend;
    (bend[l.b] ??= {})[l.bSide] = l.bend;
  }

  /* Each intersection gets its own layout, so a course of mixed control
     is expressible without anything here knowing about it. */
  const at = [];
  for (let k = 0; k < count; k++) {
    const layout = layoutFor({ control: kinds[k], reach: reaches[k], bend: bend[k] ?? {} });
    at.push({ k, col: k % across, row: Math.floor(k / across), layout, at: { x: 0, y: 0 } });
  }

  /* A GRID WANTS ONE SPACING, so the reaches have to agree. They do
     whenever the control does, which is every case that exists today --
     but a mixed-control grid would silently misplace every seam, so it
     is refused rather than approximated. */
  const distinct = [...new Set(reaches)];
  if (down > 1 && distinct.length > 1) {
    throw new Error(`a grid needs one approach length, got ${distinct.join(", ")}`);
  }

  let x = 0;
  const xs = [];
  for (let c = 0; c < across; c++) {
    xs.push(x);
    const here = reaches[c];
    const next = c + 1 < across ? reaches[c + 1] : 0;
    x += here + next;
  }
  const pitch = distinct[0] * 2;
  for (const spot of at) spot.at = { x: xs[spot.col], y: spot.row * pitch };

  const course = { n: count, cols: across, rows: down, kmh, speed, radius, at, links };
  course.joins = joinsOf(course);
  return course;
}

/* =====================================================================
   HOW TIGHT A BEND THIS ROAD IS ALLOWED

   A road is designed so that a driver at its speed feels no more than a
   set sideways acceleration on its tightest curve; the radius follows
   from the speed and that one constant. The constant is road design's
   own -- the side-friction factor the design tables use at the speeds a
   street has, about 0.15 g on a flat road with no banking -- and it is
   the one number in the bend that is taken from a standard rather than
   derived here. It is not tuned: at 60 km/h it gives 189m, and a bend at
   that radius is as tight as a road built for 60 is allowed to be, which
   is exactly "challenges steering ability a little".

   The same radius is what the wide line reads against (crossing.js): a
   driver who cannot hold a line runs fully wide on a bend this tight and
   proportionally less on a gentler one.
   ===================================================================== */
/* LATERAL lives in core/motion.js -- a lane change and a turn bay's taper
   are sized by it too -- and is re-exported here. */
import { LATERAL } from "../core/motion.js";
export { LATERAL };
export const radiusFor = (speed) => (speed * speed) / LATERAL;

/* =====================================================================
   THE ROADS, FOR WHATEVER DRAWS THEM

   One polyline per link, from box edge to box edge through the seam, and
   one per edge leg. Drawn FROM the geometry the cars follow -- the same
   `axisOf` the lanes are offset from -- rather than from rectangles that
   only agree with it while the road is straight. Section 0's rule: the
   renderer has to be able to express any state the engine can produce,
   and the first bend would otherwise have had cars driving across the
   grass beside a straight grey rectangle.
   ===================================================================== */
export function roadsOf(course) {
  const world = (k, pts) => pts.map((p) => ({ x: p.x + course.at[k].at.x, y: p.y + course.at[k].at.y }));
  const out = [];
  for (const l of course.links) {
    const a = world(l.a, axisOf(course.at[l.a].layout.place, l.aSide));
    const b = world(l.b, axisOf(course.at[l.b].layout.place, l.bSide)).reverse();
    /* `a` ends at the seam and `b`, reversed, begins there: one point. */
    out.push({ link: l.id, bend: l.bend, pts: [...a, ...b.slice(1)] });
  }
  for (let k = 0; k < course.n; k++) {
    for (const side of SIDES) {
      if (joinedTo(course, k, side)) continue;
      out.push({ k, side, bend: 0, pts: world(k, axisOf(course.at[k].layout.place, side)) });
    }
  }
  return out;
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
  if (!j) return `edge${k}:${side}:out`;
  /* Which END of the link I am leaving from decides which of its two
     lanes I am on. `a` and `b` are the link's own ends, not an ordering
     of the intersection numbers -- on a grid the northern intersection
     has the lower index AND so does the western one, so keying off the
     index would give the two axes the same names. */
  const l = course.links[j.link];
  return `link${j.link}:${l.a === k ? "ab" : "ba"}`;
}

export function laneIn(course, k, side) {
  const j = joinedTo(course, k, side);
  if (!j) return `edge${k}:${side}:in`;
  const l = course.links[j.link];
  return `link${j.link}:${l.a === k ? "ba" : "ab"}`;
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
  /* `pick` names the whole route out of the leg arrived on -- an
     intent on the compass, a destination leg on the map. */
  return { k: j.k, route: pick(j.k, j.side) };
}

/* WHERE A CAR IS ON ITS TWO LANES -- the one it came in on and the one
   it leaves by -- as a position along each, so following across a seam
   compares two cars on the same piece of road. On the grid a lane is
   straight and the position is the world pose projected onto its
   direction; on a map it is arc length along the road (graph.js),
   which is the same number on a straight road and the right one on a
   bend. */
export function laneSpan(course, k, route, s) {
  if (course.graph) return laneSpanOnGraph(course, k, route, s);
  const path = course.at[k].layout.paths[route];
  const pose = poseOn(course, k, route, s);
  return [
    { lane: laneIn(course, k, path.from), along: alongDir(pose, dirIn(path.from)) },
    { lane: laneOut(course, k, path.to), along: alongDir(pose, dirOut(path.to)) },
  ];
}

/* =====================================================================
   A ROUTE THROUGH IT

   A set course is a sequence of intersections and what to do at each,
   which is what `route.js` has always meant by one. The difference here
   is that it is DERIVED FROM THE GEOMETRY rather than declared: an intent
   is only offered at an intersection if the leg it would leave by
   actually has something on the end of it, so a plan cannot ask a
   candidate to turn into nothing.

   That is also why a course had to become a grid. On a row, every turn
   leaves the world and the only route expressible is a straight line --
   which is not a course, it is a corridor, and no instruction given on it
   could ever be wrong.

   `plan[i]` is what to do at the i-th intersection reached, indexed by
   how many have been negotiated rather than by which. A plan that RUNS
   OUT is not an error: silence means straight on (CLAUDE.md, Directions),
   so the drive continues ahead and ends when the road does.
   ===================================================================== */
export function planRoute(course, { from, legs = 6, seed = 1 } = {}) {
  const r = rng(seed >>> 0);
  const plan = [];
  let k = from.k, side = from.side;
  const been = [{ k, side }];

  for (let i = 0; i < legs; i++) {
    /* Only movements that lead somewhere, and PREFER ONES THAT HAVE NOT
       BEEN USED YET, so a route reads like a route rather than a loop
       around one block. Not a hard rule -- a real drive doubles back --
       just a lean. */
    const open = INTENTS.filter((intent) => joinedTo(course, k, exitFor(side, intent)));
    if (!open.length) {
      /* NOWHERE TO GO FROM HERE BUT OFF THE EDGE, so this is the last
         instruction of the drive -- and it is still an instruction.
         Leaving the world by turning left is an ordinary way to finish a
         drive, and refusing to plan it is not the same thing.

         The first version broke here and it broke a DIFFERENT STAGE: on
         a course of one intersection nothing is joined, so no intent was
         ever offered, so every candidate drove straight through every
         time. `verify-telling` caught it -- a hesitant driver waited
         0.3s more than a sound one instead of 7.1s, because confidence
         bites hardest on the LEFT turn and no candidate was making one
         any more. A route that will not plan the end of a drive quietly
         deletes two thirds of the manoeuvres. */
      plan.push(INTENTS[Math.floor(r() * INTENTS.length) % INTENTS.length]);
      break;
    }
    const fresh = open.filter((intent) => {
      const j = joinedTo(course, k, exitFor(side, intent));
      return !been.some((b) => b.k === j.k);
    });
    const from2 = fresh.length ? fresh : open;
    const intent = from2[Math.floor(r() * from2.length) % from2.length];
    plan.push(intent);
    const j = joinedTo(course, k, exitFor(side, intent));
    k = j.k; side = j.side;
    been.push({ k, side });
  }
  return { from, plan, visits: been };
}

/* WHERE A ROUTE GOES, replayed against the geometry. The plan says what
   to do; this says what that means, so a check can compare where the
   candidate actually went against where they were told to. Silence is
   straight on here too, because it has to mean the same thing in both
   places or the two would disagree about a drive nobody misdrove. */
export function walkRoute(course, { from, plan }, legs = plan.length + 4) {
  const out = [];
  let k = from.k, side = from.side;
  for (let i = 0; i < legs; i++) {
    const intent = plan[i] ?? "straight";
    out.push({ k, side, intent, route: `${side}/${intent}` });
    const j = joinedTo(course, k, exitFor(side, intent));
    if (!j) break;
    k = j.k; side = j.side;
  }
  return out;
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
      /* Whatever the axis: the end of any path leaving `from` by `side`
         is the start of any path arriving at `to` from `otherSide`. */
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
