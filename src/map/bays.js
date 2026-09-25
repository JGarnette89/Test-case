/* =====================================================================
   TURN BAYS: a lane that BEGINS before an intersection.

   SIMULATOR.md 1.1.15 designed a lane count that changes along a road
   and named the commonest reason for one: "a turn bay opening before an
   intersection, the commonest reason an approach has more lanes at the
   line than on the link". The maintainer asked for a big arterial
   intersection (25 September), and a big arterial is bays: a left bay
   (or two -- a double left) and a right bay on each approach. This is
   that case, and only that case; a lane that ENDS -- the curb lane
   merging away -- is the other half of 1.1.15 and is not built.

   THE SHAPE. A road end that declares bays widens on the way in. Left
   bays open in the MIDDLE: the road grows a median, both directions'
   through lanes move out by half of it, and the approaching direction's
   bays occupy it -- so the double yellow ends up on the far side of the
   bay, the way it is painted on a real arterial. Right bays open at the
   curb, and only that side widens. Over the TAPER the widening grows
   smoothly from nothing; over the bay's LENGTH it is full.

   A BAY'S LANE RUNS THE WHOLE ROAD, lying exactly on the adjacent lane
   until its taper begins and then easing across. That is what lets
   every lane-change remapping in the sim, which relates positions on two
   lanes by their lengths, treat a bay like any other lane -- and why a
   bay must never be ENTERED or spawned in before it `opensAt`.

   THE TAPER IS DERIVED, not chosen: as long as a clean lane change takes
   at the road's posted speed, plus a reaction -- LC_TIME and
   REACTION_FLOOR, the numbers the lane change itself runs on -- so a
   driver who starts over as the bay begins to open is in it as it
   finishes. At 60 km/h, 70 m. The STORAGE (full-width length) is the
   map's; absent, it is the distance a lane change must be finished by
   before the line at that speed (lanechange.js's own deadline), so the
   whole taper is a window in which the change can be made.

   A road with no bays takes none of this: `hasBays` is false and every
   caller keeps its old code, byte for byte.
   ===================================================================== */
import { LANE } from "./format.js";
import { changeTime } from "../core/motion.js";
import { REACTION_FLOOR } from "../core/perception.js";

const smooth = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

/* The taper for a road at `kmh`, and the default storage. */
const LC_TIME = changeTime(LANE);
export const taperFor = (kmh) => (LC_TIME + REACTION_FLOOR) * (kmh / 3.6);
export const storageFor = (kmh) => (kmh / 3.6) * LC_TIME * 1.2 + 10;

/* A road end's bays, normalised: counts clamped, length defaulted. Null
   when the end has none. */
export function baysAt(road, end) {
  const b = road?.bays?.[end];
  if (!b) return null;
  const left = Math.max(0, Math.min(2, Math.round(Number(b.left) || 0)));
  const right = Math.max(0, Math.min(1, Math.round(Number(b.right) || 0)));
  if (!left && !right) return null;
  const kmh = road.speed ?? 50;
  const length = Number(b.length) > 0 ? Number(b.length) : storageFor(kmh);
  return { left, right, length, taper: taperFor(kmh) };
}
export const hasBays = (road) => !!(baysAt(road, "start") || baysAt(road, "end"));

/* How open a bay section is at distance `d` from its road end: 1 over
   the storage, easing to 0 across the taper, 0 beyond. */
const openAt = (b, d) => (!b ? 0 : d <= b.length ? 1 : d >= b.length + b.taper ? 0 : smooth(1 - (d - b.length) / b.taper));

/* PER SAMPLE OF THE ROAD, every offset anything needs, in metres. Lane
   offsets are to the RIGHT OF THAT DIRECTION'S TRAVEL, the convention
   laneAlong has always used (lane i at (i + 0.5) lanes); `fwd` runs the
   road's points in order, `rev` against them, and each direction's
   arrays are indexed by the road's own samples (not reversed).
     through[i]  the i-th through lane from the centre line
     left[j]     left bay j, j = 0 the one beside through lane 0
     right[j]    right bay j, beside the curb lane
   Plus the road's two edges (distance from the centreline, positive),
   and where the double yellow sits (signed, + to the right of fwd). */
export function offsetsOf(road, lane = LANE) {
  const n = Math.max(1, Math.round(road.lanes ?? 1));
  const bS = baysAt(road, "start"), bE = baysAt(road, "end");
  const at = road.at, L = road.length;
  const out = { n, bays: { start: bS, end: bE }, fwd: { through: [], left: [], right: [] }, rev: { through: [], left: [], right: [] }, edgeRight: [], edgeLeft: [], centre: [], open: { start: [], end: [] } };
  /* fwd approaches the END, rev approaches the START. */
  const dirs = [["fwd", bE, "end"], ["rev", bS, "start"]];
  for (const [dir] of dirs) {
    for (let i = 0; i < n; i++) out[dir].through.push([]);
    const b = dir === "fwd" ? bE : bS;
    for (let j = 0; j < (b?.left ?? 0); j++) out[dir].left.push([]);
    for (let j = 0; j < (b?.right ?? 0); j++) out[dir].right.push([]);
  }
  for (let k = 0; k < at.length; k++) {
    const fE = openAt(bE, L - at[k]), fS = openAt(bS, at[k]);
    out.open.end.push(fE); out.open.start.push(fS);
    /* The median is the approaching directions' left bays, as open as
       each is here; both directions' through lanes sit outside it. */
    const mE = (bE?.left ?? 0) * lane * fE, mS = (bS?.left ?? 0) * lane * fS;
    const half = (mE + mS) / 2;
    for (const [dir, b, end] of dirs) {
      const f = end === "end" ? fE : fS;
      for (let i = 0; i < n; i++) out[dir].through[i].push(half + (i + 0.5) * lane);
      const lane0 = half + 0.5 * lane, curb = half + (n - 0.5) * lane;
      for (let j = 0; j < (b?.left ?? 0); j++) out[dir].left[j].push(lane0 - (j + 1) * lane * f);
      for (let j = 0; j < (b?.right ?? 0); j++) out[dir].right[j].push(curb + (j + 1) * lane * f);
    }
    out.edgeRight.push(half + n * lane + (bE?.right ?? 0) * lane * fE);
    out.edgeLeft.push(half + n * lane + (bS?.right ?? 0) * lane * fS);
    /* The double yellow: on the far side of whichever bay is open here --
       fwd's bays sit left of fwd's lanes, so the line is pushed to the
       rev side (negative), and the reverse for rev's. */
    out.centre.push(-mE / 2 + mS / 2);
  }
  return out;
}

/* A polyline offset from `pts` by a per-point amount to the right of
   travel -- ribbonOf's right edge with the width varying. */
export function offsetLine(pts, offs) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, Lh = Math.hypot(dx, dy) || 1;
    const nx = -dy / Lh, ny = dx / Lh;
    out.push({ x: pts[i].x + nx * offs[i], y: pts[i].y + ny * offs[i], z: pts[i].z });
  }
  return out;
}

/* THE SURFACE OF A ROAD WITH BAYS: its edges, the lines between lanes
   where two lanes are actually apart, and the double yellow's line. A
   line is drawn only where the lanes either side of it are at least half
   a lane apart, so a bay lying on its neighbour before the taper paints
   nothing; `null` marks the gaps and the renderer skips them. */
export function baySurfaceOf(road, lane = LANE) {
  const o = offsetsOf(road, lane);
  const pts = road.pts, rev = pts.slice().reverse();
  const right = offsetLine(pts, o.edgeRight);
  const left = offsetLine(pts, o.edgeLeft.map((v) => -v));
  const centre = offsetLine(pts, o.centre);
  const laneLines = [];
  for (const dir of ["fwd", "rev"]) {
    /* This direction's lanes in order across the road, centre out. */
    const order = [...o[dir].left.slice().reverse(), ...o[dir].through, ...o[dir].right];
    for (let p = 0; p + 1 < order.length; p++) {
      const A = order[p], B = order[p + 1];
      const mid = A.map((v, k) => (v + B[k]) / 2);
      const line = dir === "fwd" ? offsetLine(pts, mid) : offsetLine(rev, mid.slice().reverse()).reverse();
      laneLines.push(line.map((q, k) => (Math.abs(B[k] - A[k]) >= lane / 2 ? q : null)));
    }
  }
  return { left, right, laneLines, centre };
}
