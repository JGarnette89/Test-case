/* =====================================================================
   STAGE 1: AN INTERSECTION, AND THE PATHS THROUGH IT.

   Geometry only. Nothing here decides anything -- who yields to whom is
   `traffic.js`'s business, and it decides it every tick from what a
   driver can see. This file only answers "where does a car go, and where
   would two of them meet".

   `turnPoints` is imported from the OLD engine's `paths.js` and that is
   deliberate rather than lazy. REBUILD.md section 3.2 puts the path
   shapes on the survives-unchanged list: a turn is a circular arc that
   starts at the car and is tangent to the lane it is leaving, with the
   radius derived from where the two centrelines cross rather than
   chosen. That was measured, argued and fixed once already -- every turn
   in the game used to cut the corner -- and `paths.js` imports nothing,
   so taking it costs no coupling at all. Rebuilding it would be
   rebuilding a solved problem, which is section 7.1's failure mode.

   METRES AND SECONDS, like the rest of the sim.
   ===================================================================== */
import { turnPoints } from "../engine/paths.js";
import { CAR, weaveRoom } from "./traffic.js";

export const SIDES = ["N", "E", "S", "W"];
export const INTENTS = ["straight", "right", "left"];

/* Away from the centre, along each leg. */
const OUT = {
  N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 },
};

/* Clockwise round the compass, which is what makes "the leg to my right"
   a lookup rather than a calculation. */
const CW = { N: "E", E: "S", S: "W", W: "N" };
const CCW = { N: "W", W: "S", S: "E", E: "N" };
export const OPPOSITE = { N: "S", S: "N", E: "W", W: "E" };

/* THE LEG A CAR LEAVES BY. A car arriving FROM the north is travelling
   south, so "straight on" puts it out of the south leg. Its right hand
   points west, so a right turn puts it out of the west leg. */
export const exitFor = (from, intent) =>
  intent === "straight" ? OPPOSITE[from] : intent === "right" ? CCW[from] : CW[from];

/* WHO IS ON WHOSE RIGHT, which is the tie-break the law actually uses.
   A car arriving from the north has the east leg on its right... no: it
   is travelling south, so its right hand points west. `rightOf(a)` is the
   leg whose traffic has priority over a car arriving from `a`. */
export const rightOf = (from) => CCW[from];

/* The right of the direction of travel, in screen coordinates with y
   downward. The same expression stage 0 uses for which side of the road
   a car is on, and it has to stay the same one. */
const right = (u) => ({ x: -u.y, y: u.x });

/* =====================================================================
   The shape of the place

   One lane each way on every leg, which makes the box exactly as wide as
   the crossing road: half of it is one lane.
   ===================================================================== */
/* THE STOP LINE SITS OUTSIDE THE BOX, NOT ON ITS EDGE, and the numbers
   are the old engine's rather than new ones. It puts the line beyond the
   crossing -- a 0.95m pedestrian setback, the 1.5m painted bar itself,
   and a 0.35m margin -- because that is where a driver actually meets it,
   level with the sign.

   Putting the line ON the box edge was a real geometric omission and it
   showed up exactly where the old engine's own comment says it would:
   "the centre sits just outside the box and the nose ends up 0.95m
   INSIDE it". Measured here before the fix, three distinct pairs of cars
   clipped each other in twenty-four intersection-minutes -- always a car
   waiting at a line with its bonnet over the edge and another crossing
   the box. */
const PED_SETBACK = 0.95;
const BAR_HALF = 0.75;
const LINE_MARGIN = 0.35;
/* The stop line's distance beyond the box edge: one definition, used
   here and by every node the map produces (graph.js). */
export const LINE_SETBACK = PED_SETBACK + BAR_HALF + LINE_MARGIN;

/* CONTROL IS PER LEG, which is what lets one shape of intersection be
   several kinds of place. All four stopping is an all-way stop; two
   stopping and two running is the ordinary two-way stop, where the
   through road never pauses and the minor road has to find a gap.

   DECISIONS.md 5.3-5.5: a T-intersection defaults to a stop on the minor
   leg only, with the through road uninterrupted. Same idea, four legs. */
export const ALL_WAY = { N: "stop", E: "stop", S: "stop", W: "stop" };
export const TWO_WAY = { N: "stop", S: "stop", E: "none", W: "none" };

export function intersectionFor({ lane = 3.6, reach = 60, control = ALL_WAY, bend = {} } = {}) {
  const boxHalf = lane;
  return {
    lane, reach, boxHalf, control,
    lineAt: boxHalf + LINE_SETBACK,
    /* How far each leg bows sideways by the time it reaches its far end,
       in metres, signed along ACROSS. Zero is a straight leg, which is
       every leg that existed before the bend and every edge leg still. */
    bend: { N: 0, E: 0, S: 0, W: 0, ...bend },
  };
}

/* =====================================================================
   A BEND IN THE LEG

   The maintainer wanted "a curved road that challenges steering ability
   a little", and REBUILD.md 8.2 measured what one costs: nothing in the
   simulation, because a path is already a polyline, and the renderer,
   which drew roads as rectangles and now draws them from this.

   THE CHEAP KIND, DELIBERATELY. A bend that ARRIVES on a different
   bearing would make SIDES, OPPOSITE and rightOf relative bearings
   instead of compass constants, and that is the expensive version the
   old ruling was refusing. This one bows a leg sideways and brings it
   back parallel: zero offset and flat through the stop line, so the box,
   the corners and every turn arc are untouched; the full offset and flat
   again at the far end, so the seam with the next intersection is exactly
   where it was and pointing the same way. Both ends of a link bow by the
   same signed amount in the same world direction, which is what ACROSS
   is for: it is fixed by the AXIS rather than by the leg, so the east leg
   of one intersection and the west leg of the next name the same side.

   THE SHAPE IS THE SMOOTHEST STEP, and it was chosen for what it gives
   for free rather than for how it looks. Zero slope AND zero curvature at
   both ends: a car queues on straight road at the line, and the road is
   flat at the seam, which is where `alongDir`'s straight-lane projection
   has to be accurate for following across the boundary (course.js).
   Between them it is one reverse curve -- out, then back parallel --
   whose tightest points are at 21% and 79% of the way, and the amplitude
   that gives a wanted radius there is solved for in `amplitudeFor`.

   THE OFFSET IS ALONG THE LOCAL NORMAL, NOT SIDEWAYS. Displacing both
   lanes by the same sideways vector keeps them `lane` apart sideways but
   narrows them across the road by cos(slope); at the slopes a real bend
   has that is a third of a metre of lane gone. So the axis is bent and
   each lane is offset from it perpendicular to where the axis is
   actually pointing.
   ===================================================================== */
const ACROSS = {
  N: { x: 1, y: 0 }, S: { x: 1, y: 0 }, E: { x: 0, y: 1 }, W: { x: 0, y: 1 },
};
/* Whether +ACROSS is to the RIGHT of a driver heading OUT along the leg.
   East and north: yes; west and south: it is their left. What a bend is
   to the driver on it -- a right-hand bend or a left-hand one -- follows
   from this and which way they are going. */
const HANDED = { N: 1, E: 1, S: -1, W: -1 };
/* Metres between samples along a bent leg. A resolution, like DT and the
   conflict scan's 0.4m, not a behaviour: fine enough that the heading
   changes by well under a degree per vertex at the radius a road wants. */
const BEND_STEP = 5;

const smoother = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const smootherSlope = (t) => 30 * t * t * (1 - t) * (1 - t);
const smootherCurve = (t) => 60 * t * (1 - t) * (1 - 2 * t);

/* Where the bow runs: from one sample past the line to one sample short
   of the far end. The sample touching the line and the sample touching
   the seam are therefore EXACTLY straight, not merely flat -- a chord
   across any part of a smooth bow has a slope, and a seam that turned by
   0.08 degrees would be a seam that turned. */
const bowSpan = (place) => [place.lineAt + BEND_STEP, place.reach - BEND_STEP];

/* The bow at `d` metres from the centre along a leg: how far sideways,
   the slope of that, and the signed curvature toward +ACROSS. Zero and
   flat through the line; the full amplitude and flat at the far end. */
export function bowAt(place, side, d) {
  const A = place.bend?.[side] ?? 0;
  const [d0, d1] = bowSpan(place);
  const w = d1 - d0;
  if (!A || d <= d0) return { off: 0, slope: 0, curve: 0 };
  if (d >= d1) return { off: A, slope: 0, curve: 0 };
  const t = (d - d0) / w;
  const slope = (A / w) * smootherSlope(t);
  const second = (A / (w * w)) * smootherCurve(t);
  return { off: A * smoother(t), slope, curve: second / Math.pow(1 + slope * slope, 1.5) };
}

/* The tightest the bow gets, as a radius, for a given amplitude. */
export function tightestOf(reach, lineAt, amplitude) {
  const place = { reach, lineAt, bend: { E: amplitude } };
  let worst = 0;
  for (let i = 0; i <= 400; i++) {
    const d = lineAt + ((reach - lineAt) * i) / 400;
    worst = Math.max(worst, Math.abs(bowAt(place, "E", d).curve));
  }
  return worst ? 1 / worst : Infinity;
}

/* THE AMPLITUDE THAT MAKES THE BEND EXACTLY AS TIGHT AS ASKED. Solved
   rather than typed: the radius is the derived quantity (course.js), and
   the bow that produces it over this leg follows. Bisection, because the
   curvature's slope correction makes the closed form only approximate. */
export function amplitudeFor(reach, lineAt, radius) {
  let lo = 0, hi = reach;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (tightestOf(reach, lineAt, mid) > radius) lo = mid; else hi = mid;
  }
  return lo;
}

/* A point on the leg's AXIS -- between the two lanes -- `d` out from the
   centre, with the direction the axis is pointing there (outward). */
function axisAt(place, side, d) {
  const out = OUT[side], across = ACROSS[side];
  const { off, slope } = bowAt(place, side, d);
  const n = Math.hypot(1, slope);
  return {
    x: out.x * d + across.x * off,
    y: out.y * d + across.y * off,
    ux: (out.x + across.x * slope) / n,
    uy: (out.y + across.y * slope) / n,
  };
}

/* A point in a LANE of the leg, `d` out, in the lane a car uses going the
   given way -- offset from the axis perpendicular to where the axis
   points there, so the lanes stay `lane` apart across the road however
   it bends. Reduces to `onLeg` exactly on a straight leg. */
function laneAt(place, side, d, going) {
  const a = axisAt(place, side, d);
  const u = going === "in" ? { x: -a.ux, y: -a.uy } : { x: a.ux, y: a.uy };
  const r = right(u);
  return { x: a.x + r.x * (place.lane / 2), y: a.y + r.y * (place.lane / 2) };
}

/* The distances at which a leg is sampled between the line and the far
   end: just the two ends when it is straight, so a straight path is the
   same four points it always was, and BEND_STEP apart when it bends. */
function stationsOf(place, side) {
  if (!place.bend?.[side]) return [place.lineAt, place.reach];
  const [d0, d1] = bowSpan(place);
  const n = Math.max(1, Math.ceil((d1 - d0) / BEND_STEP));
  const out = [place.lineAt];
  for (let i = 0; i <= n; i++) out.push(d0 + ((d1 - d0) * i) / n);
  out.push(place.reach);
  return out;
}

/* The lane along a leg, line to far end going out, far end to line going
   in. What `pathFor` builds its approach and its exit from. */
function legPoints(place, side, going) {
  const ds = stationsOf(place, side);
  if (going === "in") ds.reverse();
  return ds.map((d) => laneAt(place, side, d, going));
}

/* THE AXIS OF A LEG FROM THE BOX EDGE TO THE FAR END, for whatever draws
   the road. The renderer draws the carriageway as a stroke along this and
   the centre line as a dash along it, so a road is drawn FROM the
   geometry the cars follow rather than from a rectangle that agrees with
   it only while the road is straight -- which is section 0's rule: a
   state the engine can produce and the screen cannot express is a lie
   about what happened. */
export function axisOf(place, side) {
  const ds = place.bend?.[side] ? [place.boxHalf, ...stationsOf(place, side)] : [place.boxHalf, place.reach];
  return ds.map((d) => { const a = axisAt(place, side, d); return { x: a.x, y: a.y }; });
}

/* THE BEND AS THE DRIVER AT `s` MEETS IT: signed curvature, positive for
   a right-hand bend, zero in the box and on a straight leg. Read from the
   bow rather than from the polyline, so the turn arcs -- whose radius is
   an open question with the maintainer (DECISIONS.md 5.15.12) -- are
   never mistaken for a bend in the road. */
export function bendSeenBy(place, path, s) {
  let side, going;
  if (s < path.stopAt) { side = path.from; going = "in"; }
  else if (s > path.clearAt) { side = path.to; going = "out"; }
  else return 0;
  if (!place.bend?.[side]) return 0;
  const p = poseAt(path, s);
  const d = Math.abs(p.x * OUT[side].x + p.y * OUT[side].y);
  return bowAt(place, side, d).curve * HANDED[side] * (going === "out" ? 1 : -1);
}

/* Where a car sits on a leg: `d` metres out from the centre, in the lane
   it would use going the given way. */
function onLeg(place, side, d, going) {
  const out = OUT[side];
  const u = going === "in" ? { x: -out.x, y: -out.y } : out;
  const r = right(u);
  return {
    x: out.x * d + r.x * (place.lane / 2),
    y: out.y * d + r.y * (place.lane / 2),
  };
}

/* =====================================================================
   A PATH THROUGH THE INTERSECTION

   Approach in the inbound lane, turn where a driver actually turns the
   wheel, leave in the outbound lane of the leg being taken. Returned as
   a polyline with cumulative distances, because everything downstream
   asks "where am I at `s` metres along" and nothing asks for a formula.
   ===================================================================== */
export function pathFor(place, from, intent) {
  const to = exitFor(from, intent);
  /* Where the car waits is the LINE; where it is clear of the crossing
     traffic is the BOX. Two different places, and conflating them is
     what put a waiting bonnet inside the intersection. */
  const stop = onLeg(place, from, place.lineAt, "in");
  const leave = onLeg(place, to, place.boxHalf, "out");
  /* The STRAIGHT exit, whatever the leg does further out: the turn arc
     needs the direction of the outbound centreline, and a bent leg's far
     end is not on it. */
  const exit = onLeg(place, to, place.reach, "out");
  /* The approach, far end to line, and the way out, line to far end.
     Two points each on a straight leg -- so a straight path is the same
     four points it always was -- and sampled on a bent one. */
  const approach = legPoints(place, from, "in");
  const away = legPoints(place, to, "out");

  let pts, iStop, iClear;
  if (intent === "straight") {
    /* `leave` sits between the line and the far end on a straight leg,
       collinear, so the way out needs only its far end there; a bent
       leg keeps its line point, because the bend starts from it. */
    pts = [...approach, leave, ...(place.bend?.[to] ? away : away.slice(1))];
    iStop = approach.length - 1;
    iClear = approach.length;
  } else {
    /* Where the two lane centrelines cross, which is the corner a driver
       steers around. The radius is that distance rather than a number
       somebody picked, so a wider road turns wider on its own. */
    const corner = crossOf(stop, OUT[from], leave, OUT[to]);
    const radius = Math.hypot(corner.x - stop.x, corner.y - stop.y);
    /* AND THE ARC RUNS TO THE EXIT, NOT TO THE BOX EDGE.

       EVERY TURNING CAR USED TO DRIVE 2.05 METRES BACKWARDS. The arc is
       tangent to both centrelines at `radius` from the corner, and the
       stop line is set further back than the box edge is -- 5.65m against
       3.60m -- so the arc's tangent point on the way out lands 5.65m from
       the centre, PAST `leave`. Appending `leave` after it sent the path
       back toward the intersection for two metres and then forward again:
       177.8 degrees of turn at one vertex, then -180 at the next.

       `leave` is simply the wrong point to aim at. The arc already
       reaches the outbound lane, so it is aimed at the exit and `leave`
       is left to the straight case, where it really does sit between the
       line and the exit.

       Not caught by anything, because `verify-crossing` measured whether
       a path JUMPS -- half a metre along being at most half a metre of
       travel -- and two metres backwards is two metres of travel. It
       measured distance where it needed direction. DECISIONS.md 5.15.11. */
    const arc = turnPoints(stop, corner, exit, radius);
    /* The arc's last sample is the tangent point on the outbound lane,
       which is where the way out begins; the straight `exit` after it is
       replaced by the leg, bent or not. */
    arc.pop();
    pts = [...approach.slice(0, -1), ...arc];
    iStop = approach.length - 1;
    iClear = pts.length - 1;
    pts.push(...away.slice(1));
  }

  /* Cumulative distance along, so `s` means the same thing everywhere. */
  const at = [0];
  for (let i = 1; i < pts.length; i++) {
    at.push(at[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return {
    from, to, intent, pts, at,
    length: at[at.length - 1],
    /* How far along the path the stop line is, and where the box ends.
       A driver needs both: one is where they wait, the other is what
       they have to be clear of. */
    stopAt: at[iStop],
    clearAt: at[iClear],
  };
}

/* Where two lines cross, given a point and a direction on each. */
function crossOf(p, pu, q, qu) {
  const den = pu.x * qu.y - pu.y * qu.x;
  if (Math.abs(den) < 1e-9) return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  const t = ((q.x - p.x) * qu.y - (q.y - p.y) * qu.x) / den;
  return { x: p.x + pu.x * t, y: p.y + pu.y * t };
}

/* Position and heading at `s` metres along a path. */
export function poseAt(path, s) {
  const { pts, at } = path;
  if (s <= 0) {
    const h = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    return { x: pts[0].x + Math.cos(h) * s, y: pts[0].y + Math.sin(h) * s, rot: (h * 180) / Math.PI };
  }
  for (let i = 1; i < at.length; i++) {
    if (s > at[i] && i < at.length - 1) continue;
    const span = at[i] - at[i - 1] || 1;
    const k = Math.min(1, (s - at[i - 1]) / span);
    const a = pts[i - 1], b = pts[i];
    return {
      x: a.x + (b.x - a.x) * k,
      y: a.y + (b.y - a.y) * k,
      rot: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  }
  return { ...pts[pts.length - 1], rot: 0 };
}

/* =====================================================================
   WHERE TWO PATHS WOULD MEET

   THE MAINTAINER'S RULE IS PATH CONFLICT, NOT INTERSECTION OCCUPANCY
   (DECISIONS.md 5.3): you do not wait for another vehicle to leave the
   intersection, you wait until your path is clear of theirs. So the thing
   the model needs is not "is anybody in the box" but "where, if anywhere,
   do these two lines cross, and how far along each".

   Two vehicles going straight from opposite legs pass on their own sides
   and their paths never cross -- so that rule needs no special case
   either. It simply comes out empty here, which is the right kind of
   answer.

   Computed once per intersection: twelve paths, so 66 pairs, each a
   sampled scan. Done at setup and never again.
   ===================================================================== */
/* THE FOUR CORNERS OF A CAR at a pose, optionally grown by `pad` on
   every side. One definition, used both to ask whether two cars are
   touching and to ask whether two PATHS could ever put them there. */
export function cornersOf(p, pad = 0) {
  const a = (p.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
  const hl = CAR.length / 2 + pad, hw = CAR.width / 2 + pad;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([u, v]) => ({
    x: p.x + c * hl * u - sn * hw * v,
    y: p.y + sn * hl * u + c * hw * v,
  }));
}

/* The separating-axis theorem on two rectangles. A DISTANCE THRESHOLD
   CANNOT ANSWER THIS and the first version of both callers used one,
   wrongly in both directions: two cars side by side in opposite lanes
   are 3.6m apart and perfectly fine, while two nose to tail at 4.0m are
   inside each other. No single number separates those. */
export function boxesOverlap(A, B) {
  for (const [P, Q] of [[A, B], [B, A]]) {
    for (let i = 0; i < 4; i++) {
      const ax = P[(i + 1) % 4].x - P[i].x, ay = P[(i + 1) % 4].y - P[i].y;
      const nx = -ay, ny = ax;
      let pMin = Infinity, pMax = -Infinity, qMin = Infinity, qMax = -Infinity;
      for (const v of P) { const d = v.x * nx + v.y * ny; pMin = Math.min(pMin, d); pMax = Math.max(pMax, d); }
      for (const v of Q) { const d = v.x * nx + v.y * ny; qMin = Math.min(qMin, d); qMax = Math.max(qMax, d); }
      if (pMax < qMin || qMax < pMin) return false;   // a gap on this axis
    }
  }
  return true;
}

export function conflictsBetween(a, b, pad = 0) {
  /* Walk both polylines finely and record the whole REGION where they
     interact, not just the first point of it.

     Two paths do not merely cross at a point -- a left turn and a
     crossing straight run alongside each other for several metres. A
     driver has to wait until the other car is clear of the WHOLE region,
     and using only the first point left cars clipping each other after
     the nominal conflict was behind them: measured, 13 pairs in
     thirty-two intersection-minutes, every one of them two cars still
     beside each other with the meeting point passed.

     `at`/`by` is where I must wait; `clearOf` is how far along THEIR path
     they have to be before I may go.

     TWO PATHS INTERACT WHERE TWO CARS ON THEM WOULD, which is a
     FOOTPRINT question and not a distance one. It was a distance --
     centres within 3.0m -- and that was wrong in a way only the steering
     axis could expose: a driver who does not hold a steady line is not
     on their own centreline, so two paths measured 3.2m apart at their
     closest put two cars 2.6m apart and inside each other, in a pair the
     conflict table said never meet.

     Widening the distance was not available: two straights from opposite
     legs run 3.6m apart for their whole length and MUST NOT conflict
     (DECISIONS.md 5.3), so any threshold big enough to cover the weave
     would have broken the rule that costs the most to lose. A footprint
     grown by the weave is exact instead of approximate -- two cars in
     adjacent lanes still have 0.9m of air between them at full stray,
     because the amplitude is half the room by construction. */
  /* THE CONFLICT REGION IS INSIDE THE INTERSECTION. BEYOND IT, TWO CARS
     IN ONE LANE ARE A QUEUE.

     Without this bound the scan is honest but useless: two paths that
     leave by the same leg -- a straight from the north and a left from
     the east -- share their whole outbound lane, so they are within
     clearance of each other for every remaining metre, and `clearOf`
     came back as the far end of the road. A driver then waited for
     anybody sharing their exit to leave the WORLD before moving, which
     is intersection occupancy at its most extreme rather than path
     conflict (DECISIONS.md 5.3).

     It was survivable at a 60m approach and it is not at the longer one
     a two-way stop needs, because the wait scales with the approach
     length. `whatStops` already treats a shared exit as FOLLOWING, and
     it takes over at exactly this boundary, so bounding here removes a
     duplicate answer rather than dropping a case. */
  const step = 0.4;
  /* Cheap reject first: two cars whose CENTRES are further apart than
     their own diagonals cannot be touching however they are turned, so
     the footprint test never has to run for most of the scan. */
  const far = Math.hypot(CAR.length, CAR.width) + 2 * pad;
  const opens = (p) => Math.max(0, p.stopAt - 2 * CAR.length);
  const shuts = (p) => Math.min(p.length, p.clearAt + CAR.length);
  const [a0, a1] = [opens(a), shuts(a)];
  const [b0, b1] = [opens(b), shuts(b)];
  let first = null, lastB = -Infinity;
  /* The inner path's poses once, not once per outer sample: a bent path
     has a hundred vertices for `poseAt` to walk, and the scan is the one
     place it is called thousands of times per layout. */
  const bs = [];
  for (let sb = b0; sb <= b1; sb += step) bs.push([sb, poseAt(b, sb)]);
  for (let sa = a0; sa <= a1; sa += step) {
    const pa = poseAt(a, sa);
    for (const [sb, pb] of bs) {
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) >= far) continue;
      if (!boxesOverlap(cornersOf(pa, pad), cornersOf(pb, pad))) continue;
      if (first === null || sa < first.a) first = { a: sa, b: sb };
      if (sb > lastB) lastB = sb;
    }
  }
  return first === null ? null : { ...first, clearOf: lastB };
}

/* Every path, and where each pair meets. The whole geometry of one
   intersection, resolved once. */
/* EACH COMPASS LEG'S BEARING, so the bearing rules the map needs
   (graph.js: onRightOf, oncoming) answer for this layout too, and give
   the answers the table gave: north is -90 with y down, west 180, and
   west is 90 degrees clockwise-short of north, on its right. */
export const BEARING = { N: -90, E: 0, S: 90, W: 180 };

export function layoutFor(opts = {}) {
  const place = intersectionFor(opts);
  const paths = {};
  for (const from of SIDES) {
    for (const intent of INTENTS) paths[`${from}/${intent}`] = pathFor(place, from, intent);
  }
  const legs = Object.fromEntries(SIDES.map((s) => [s, { id: s, bearing: BEARING[s], control: place.control[s] }]));
  /* The routes out of a leg, in INTENTS order -- the same order the
     random draw has always indexed, so a course seeded before the map
     existed is the same course to the byte. */
  const routesFrom = (leg) => INTENTS.map((i) => `${leg}/${i}`);
  const conflicts = {};
  const keys = Object.keys(paths);
  for (const ka of keys) {
    for (const kb of keys) {
      if (ka === kb) continue;
      /* Same approach lane is following, not conflict -- stage 0 already
         handles that and handling it twice would be two answers to one
         question. */
      if (paths[ka].from === paths[kb].from) continue;
      const hit = conflictsBetween(paths[ka], paths[kb], weaveRoom(place.lane));
      if (hit) conflicts[`${ka}|${kb}`] = hit;
    }
  }
  return { place, paths, conflicts, legs, routesFrom };
}
