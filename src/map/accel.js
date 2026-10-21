/* =====================================================================
   ACCELERATION LANES: a lane that BEGINS at an entrance and ENDS along
   the road (21 October; the maintainer, driving the endless highway:
   "most traffic seems to be queued to enter the highway. can we add an
   acceleration lane rather than just a yield sign?").

   A yield-controlled entry makes every joining car slow, stand and wait
   for a gap in 100 km/h traffic, which on a busy road almost never
   opens: the queue on the slip road was traffic that was not on the
   highway. A real freeway entry is a lane of its own beside the through
   carriageway, in which the joining driver gets up to the speed of the
   traffic and moves over into a gap while moving. Nobody stops -- unless
   they run out of lane.

   This is the other half of SIMULATOR.md 1.1.15 -- "a lane count that
   changes ALONG a road" -- and the mirror of a turn bay (map/bays.js): a
   bay is a lane lying on its neighbour until it opens before an
   intersection; an acceleration lane is open from the intersection it
   starts at, for its LENGTH, then closes over a TAPER and lies on its
   neighbour (the through curb lane) to the road's far end. Every lane
   still runs the whole road, so the lane-change remapping that relates
   positions on two lanes treats it like any other -- and nobody may be in
   it past where it ENDS (sim/crossing.js stops a car short of that).

   DATA, per road end: `accel: { start: { from, length } }` -- the lane on
   the curb side of the traffic LEAVING the road's start, fed by road
   `from` (the slip road). A yield-controlled entry is still what a map
   gets without it, and is still right on smaller roads; which one an
   entry is, is the map's to say.

   THE TAPER is the bays' own (a clean lane change at the posted speed
   plus a reaction). THE LENGTH, absent, is derived: getting from the
   feeding road's posted speed up to this road's at the comfortable
   acceleration everybody pulls away at (traffic.js ACCEL), then one clean
   lane change at this road's speed, with the bays' 1.2 margin.
   ===================================================================== */
import { LANE } from "./format.js";
import { taperFor, offsetLine } from "./bays.js";
import { changeTime } from "../core/motion.js";

const ACCEL = 2.4;   // m/s^2: traffic.js ACCEL, the comfortable pull-away (map/ may not import sim/)
const LC_TIME = changeTime(LANE);
const smooth = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

export const accelLengthFor = (kmh, fromKmh) => {
  const v = kmh / 3.6, v0 = Math.min(v, (fromKmh ?? kmh) / 3.6);
  return ((v * v - v0 * v0) / (2 * ACCEL) + v * LC_TIME) * 1.2 + 10;
};

/* A road's acceleration lane, normalised: null when it has none. Only at
   a road's START, for the traffic leaving it. */
export function accelAt(road, speedOf = () => null) {
  const a = road?.accel?.start;
  if (!a) return null;
  const kmh = road.speed ?? 50;
  const length = Number(a.length) > 0 ? Number(a.length) : accelLengthFor(kmh, speedOf(a.from));
  return { from: a.from ?? null, length, taper: taperFor(kmh) };
}
export const hasAccel = (road) => !!road?.accel?.start;

/* How open the lane is `d` metres from the road's start: 1 over its
   length, easing to 0 across the taper, 0 beyond. */
export const accelOpenAt = (acc, d) => (!acc ? 0 : d <= acc.length ? 1 : d >= acc.length + acc.taper ? 0 : smooth(1 - (d - acc.length) / acc.taper));

/* The through curb lane's offset to the right of travel: a one-way road's
   lanes are centred on it (sim/graph.js laneAlong), a two-way road's fwd
   lanes sit right of the centre line. */
const curbOffset = (road, lane) => {
  const n = Math.max(1, Math.round(road.lanes ?? 1));
  return road.oneWay ? (n / 2 - 0.5) * lane : (n - 0.5) * lane;
};

/* THE LANE ITSELF, for the graph: the curb lane's line moved out by a lane
   times how open it is. `closesAt` and `endsAt` are arc positions along
   it: where the taper begins, and where it lies on the curb lane. */
export function accelLane(road, acc, lane = LANE) {
  const c = curbOffset(road, lane);
  const offs = road.at.map((d) => c + lane * accelOpenAt(acc, d));
  const pts = offsetLine(road.pts, offs);
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const arcAt = (d) => { const i = road.at.findIndex((x) => x >= d); return i < 0 ? at[at.length - 1] : at[i]; };
  return { id: `${road.id}:fwd#A0`, road: road.id, dir: 1, index: "A0", pts, at, length: at[at.length - 1], accel: true, closesAt: arcAt(acc.length), endsAt: arcAt(acc.length + acc.taper) };
}

/* THE SURFACE: the right edge moves out with the lane, and the line
   between it and the curb lane is painted where the two are at least half
   a lane apart -- `null` marks the gap, which the renderer skips (as for
   bays). */
export function accelSurface(road, acc, base, lane = LANE) {
  const half = (road.outer ?? road.width) / 2;
  const f = road.at.map((d) => accelOpenAt(acc, d));
  const right = offsetLine(road.pts, f.map((x) => half + lane * x));
  const line = offsetLine(road.pts, f.map(() => curbOffset(road, lane) + lane / 2)).map((q, k) => (f[k] >= 0.5 ? q : null));
  return { ...base, right, laneLines: [...base.laneLines, line] };
}
