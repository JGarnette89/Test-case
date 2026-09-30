/* =====================================================================
   BUSES AND THEIR STOPS (SIMULATOR.md, "3. Bus stops"). A bus is a row in
   the vehicle table (traffic.js VEHICLES) -- long, slow to pull away, tall
   enough to hide what is behind it (sight.js), never a special case in
   how it drives. What makes it a bus is that it STOPS where nobody else
   does: at a stop beside its own curb lane, for as long as it takes, and
   then carries on.

   A stop is a place on the map (map/load.js `stops`) that the loader has
   already put beside a road, on a side, so it names the lane that serves
   it: that road's curb lane in that direction. Here it becomes a distance
   along that lane -- the coordinate a car's own position on the lane is
   measured in (graph.js `laneSpanOnGraph`), the same one a parking slot
   uses -- so finding the stop ahead of a bus is arithmetic.

   Stopping is the braking every car already does: the stop is a stopped
   place ahead, considered exactly as a stopped car is (crossing.js
   `whatStops`, the rule that pulls a car into a parking slot). No second
   braking law.

   Slice A: curb stops, the bus in its lane, the traffic behind it
   queueing. Bays, passengers, the yield-to-a-bus rule and going round
   come next, in that order (SIMULATOR.md).

   Pure. No React, no DOM.
   ===================================================================== */
import { lenOf } from "./traffic.js";

/* A BUS NOW AND THEN, on a map with stops -- a share of the traffic
   arriving from outside, like a truck (crossing.js TRUCK_SHARE). A
   flagged tunable: enough that one comes by while you watch a stop. */
export const BUS_SHARE = 0.08;
/* HOW LONG A BUS STANDS AT A STOP with nobody getting on or off: doors
   open, a look, doors shut. A flagged tunable until passengers exist to
   set it (slice B). */
export const DWELL = 12;
/* How far short of the stop a bus sets its front: it pulls up with its
   front door at the sign. */
const DOOR = 1.5;
/* How far short of its aim a bus may rest and still be at the stop: the
   gap the following rule keeps behind a stopped place (measured 1.8 m). */
const REST = 3;

const cache = new WeakMap();
/* Every stop on the course, by the lane that serves it: `{ id, kind,
   along }`, ordered along the lane. */
export function stopsOf(course) {
  if (!course?.graph) return new Map();
  if (cache.has(course)) return cache.get(course);
  const out = new Map();
  const roads = Object.fromEntries((course.map?.roads ?? []).map((r) => [r.id, r]));
  for (const st of course.map?.stops ?? []) {
    const r = roads[st.road];
    if (!r) continue;
    const id = `${r.id}:${st.dir}#${(r.lanes ?? 1) - 1}`;
    const L = course.lanes?.[id];
    if (!L) continue;
    /* Where along the curb lane the stop's sign is beside. */
    let best = null;
    for (let i = 0; i + 1 < L.pts.length; i++) {
      const a = L.pts[i], b = L.pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      const f = Math.max(0, Math.min(1, ((st.at.x - a.x) * dx + (st.at.y - a.y) * dy) / L2));
      const d = Math.hypot(a.x + dx * f - st.at.x, a.y + dy * f - st.at.y);
      if (!best || d < best.d) best = { d, along: L.at[i] + f * Math.sqrt(L2) };
    }
    if (!out.has(id)) out.set(id, []);
    out.get(id).push({ id: st.id, kind: st.kind, along: best.along });
  }
  for (const list of out.values()) list.sort((a, b) => a.along - b.along);
  cache.set(course, out);
  return out;
}

/* THE NEXT STOP a bus on this path should make, as `{ id, at }` with `at`
   in the path's own metres -- where its CENTRE comes to rest -- or null.
   On the lane it comes in on, far enough ahead to stop for and clear of
   the line; or on the lane it leaves by, past the box. Never the one it
   has just served. */
export function nextStop(course, me, path, fromS, room) {
  const stops = stopsOf(course);
  if (!stops.size) return null;
  const half = lenOf(me) / 2;
  const found = [];
  for (const st of stops.get(path.laneIn?.id) ?? []) {
    const at = st.along - path.laneIn.at0 - DOOR - half;
    if (at <= path.stopAt - 10) found.push({ id: st.id, kind: st.kind, at });
  }
  for (const st of stops.get(path.laneOut?.id) ?? []) {
    const at = path.clearAt + (st.along - path.laneOut.at0) - DOOR - half;
    if (at >= path.clearAt + half && at <= path.length) found.push({ id: st.id, kind: st.kind, at });
  }
  const ahead = found.filter((q) => q.id !== me.served && q.at >= fromS + room).sort((a, b) => a.at - b.at);
  return ahead[0] ?? null;
}

/* AT THE STOP: standing there, the doors open for DWELL, and then it is
   served and the bus looks for the next. Returns the bus as it now is. */
export function atStop(me, t, course, path) {
  if (!me.busStop) return me;
  /* Only AT the stop -- a bus held in a queue short of it has not arrived,
     and one that moves has shut its doors (verify-buses: a bus that began
     its dwell in a queue and crept up stood 19 s). It comes to rest a
     little short of where it aims, by the following gap. */
  if (me.v > 0.3 || me.s < me.busStop.at - REST) return me.dwellFrom == null ? me : { ...me, dwellFrom: null };
  if (me.dwellFrom == null) return { ...me, dwellFrom: t };
  if (t - me.dwellFrom < DWELL) return me;
  const served = me.busStop.id;
  const on = { ...me, served, dwellFrom: null, busStop: null };
  return { ...on, busStop: nextStop(course, on, path, me.s, 20) };
}
