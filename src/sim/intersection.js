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
export function intersectionFor({ lane = 3.6, reach = 60 } = {}) {
  return { lane, reach, boxHalf: lane };
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
  const entry = onLeg(place, from, place.reach, "in");
  const stop = onLeg(place, from, place.boxHalf, "in");
  const leave = onLeg(place, to, place.boxHalf, "out");
  const exit = onLeg(place, to, place.reach, "out");

  let pts;
  if (intent === "straight") {
    pts = [entry, stop, leave, exit];
  } else {
    /* Where the two lane centrelines cross, which is the corner a driver
       steers around. The radius is that distance rather than a number
       somebody picked, so a wider road turns wider on its own. */
    const corner = crossOf(stop, OUT[from], leave, OUT[to]);
    const radius = Math.hypot(corner.x - stop.x, corner.y - stop.y);
    pts = [entry, ...turnPoints(stop, corner, leave, radius), exit];
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
    stopAt: at[1],
    clearAt: intent === "straight" ? at[2] : at[at.length - 2],
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
export function conflictsBetween(a, b, clearance = 2.2) {
  /* Walk both polylines finely and keep the FIRST place they come within
     a car's width of each other -- first, because a driver yields at the
     first point of conflict rather than the worst one. */
  const step = 0.4;
  let best = null;
  for (let sa = 0; sa <= a.length; sa += step) {
    const pa = poseAt(a, sa);
    for (let sb = 0; sb <= b.length; sb += step) {
      const pb = poseAt(b, sb);
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (d < clearance && (best === null || sa < best.a)) best = { a: sa, b: sb, d };
    }
  }
  return best;
}

/* Every path, and where each pair meets. The whole geometry of one
   intersection, resolved once. */
export function layoutFor(opts = {}) {
  const place = intersectionFor(opts);
  const paths = {};
  for (const from of SIDES) {
    for (const intent of INTENTS) paths[`${from}/${intent}`] = pathFor(place, from, intent);
  }
  const conflicts = {};
  const keys = Object.keys(paths);
  for (const ka of keys) {
    for (const kb of keys) {
      if (ka === kb) continue;
      /* Same approach lane is following, not conflict -- stage 0 already
         handles that and handling it twice would be two answers to one
         question. */
      if (paths[ka].from === paths[kb].from) continue;
      const hit = conflictsBetween(paths[ka], paths[kb]);
      if (hit) conflicts[`${ka}|${kb}`] = hit;
    }
  }
  return { place, paths, conflicts };
}
