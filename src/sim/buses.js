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
import { BAY, bayShape } from "../map/format.js";
import { laneSpanOnGraph } from "./graph.js";

/* A BUS NOW AND THEN, on a map with stops -- a share of the traffic
   arriving from outside, like a truck (crossing.js TRUCK_SHARE). A
   flagged tunable: enough that one comes by while you watch a stop. */
export const BUS_SHARE = 0.08;
/* HOW LONG A BUS STANDS AT A STOP (slice B): as long as its people take
   -- everybody getting off, one at a time at the front door, and then
   everybody waiting getting on -- and never less than MIN_DWELL (doors
   open, a look, doors shut) nor more than MAX_DWELL (a driver running
   late goes). Flagged tunables. */
export const MIN_DWELL = 6, MAX_DWELL = 45;
/* One person stepping off every ALIGHT_EACH seconds, the first a second
   after the doors open. */
export const ALIGHT_EACH = 1.5;
/* How many people a bus arrives carrying, and the share who get off at a
   stop. Flagged: a middling city bus. */
export const RIDERS = [4, 30], OFF_SHARE = [0.1, 0.4];
/* The old fixed dwell, which the checks still read as the floor. */
export const DWELL = MIN_DWELL;
/* How far short of the stop a bus sets its front: it pulls up with its
   front door at the sign. */
const DOOR = 1.5;
/* How far short of its aim a bus may rest and still be at the stop: the
   gap the following rule keeps behind a stopped place (measured 1.8 m). */
const REST = 3;

const hash = (s) => [...String(s)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
/* How many people a bus arrives with, from its own number. */
export const ridersFor = (n) => RIDERS[0] + Math.floor((((n * 2246822519) >>> 0) / 4294967296) * (RIDERS[1] - RIDERS[0] + 1));

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
  const next = ahead[0] ?? null;
  /* INTO A BAY (slice C): out of the lane over the taper before it comes
     to rest, positionally -- never on a clock -- so the line it takes is
     the bay the loader drew. Only with room to pull out again on this path;
     otherwise the bus stands in the lane beside it, as at a curb stop. */
  if (next?.kind === "bay") {
    const limit = next.at <= path.stopAt ? path.stopAt - 10 : path.length - 1;
    /* `post`: where the stop's post is, in the path's metres -- the bay
       is drawn about it (map/format.js `bayShape`), so the bus follows it
       there too. Out of the bay needs its tail past the taper. */
    if (next.at + DOOR + half + BAY.ahead + BAY.taper + half <= limit) return { ...next, bay: { post: next.at + DOOR + half, w: BAY.w } };
    return { ...next, kind: "curb" };
  }
  return next;
}

const ease = (x) => { const c = Math.max(0, Math.min(1, x)); return c * c * (3 - 2 * c); };
/* How far a bus has pulled toward the curb, in metres off its lane's line:
   in over the taper before its stop, out over the taper after it once it
   has been let go (`out0`). */
export function pullOf(a, s = a.s) {
  const b = a.bay ?? a.busStop?.bay;
  if (!b) return 0;
  /* THE BAY'S OWN SHAPE, where that point of the bus is: the line a bus
     follows IS the bay the loader drew (one set of numbers, map/format.js
     BAY). An ease of its own, keyed to where the bus meant to stop, left a
     standing bus's tail on the ramp and out in the lane once its ends were
     placed on the line (1 October). */
  return b.w * bayShape(s - b.post);
}
/* Out of the lane: far enough into the bay that a car passes clear of it
   -- and not yet let go. A bus pulling OUT is claiming the lane from the
   moment it moves: read as out of it until its pull fell below the line, a
   driver who had stopped to let it out lost sight of it, pulled forward,
   and met it coming (verify-buses, 30 September). */
export const inBay = (a) => a.kind === "bus" && !(a.bay?.out0 != null)
  && Math.min(pullOf(a, a.s + lenOf(a) / 2), pullOf(a, a.s - lenOf(a) / 2)) >= BAY.w - 0.3;   // both ends in

/* MAY A BUS PULL OUT OF ITS BAY? The bus driver knows the rule and still
   looks (the maintainer, 30 September: "will observe behind without simply
   assuming others will follow the rule"): nobody beside it, and whoever is
   coming up behind in the lane it rejoins is either stopped -- letting it
   out -- or PULL_GAP seconds back. A flagged tunable. */
export const PULL_GAP = 4;
/* THE LANE A VEHICLE IS ACTUALLY ON, and how far along it: the lane in
   before its line, the lane out once through the box, none in the box.
   `laneSpanOnGraph` gives both ends of a path, the one not reached yet
   clamped to its start -- read as a position, every car on its way to the
   road a bus was pulling back onto sat "beside" it, and the bus waited for
   ever (verify-buses, 30 September). */
export function laneAt(course, a) {
  const p = course.at[a.k ?? 0]?.layout.paths[a.route];
  if (!p) return [];
  const [inn, out] = laneSpanOnGraph(course, a.k ?? 0, a.route, a.s);
  return a.s <= p.stopAt ? [inn] : a.s >= p.clearAt ? [out] : [];
}
export function mayPullOut(world, bus) {
  const mine = laneAt(world.course, bus);
  const half = lenOf(bus) / 2;
  for (const a of world.actors) {
    if (a.id === bus.id || a.parked || inBay(a)) continue;
    const theirs = laneAt(world.course, a);
    for (const my of mine) {
      const on = theirs.find((q) => q.lane === my.lane);
      if (!on) continue;
      const gap = my.along - half - (on.along + lenOf(a) / 2);
      if (on.along - lenOf(a) / 2 > my.along + half) continue;   // ahead of it
      if (gap < 0) return false;                                  // beside it
      if (gap < 80 && (a.v ?? 0) >= 0.5 && gap / (a.v ?? 0.1) < PULL_GAP) return false;
    }
  }
  return true;
}

/* When the i-th person getting off steps down, counted from the doors
   opening -- read the same way by the bus and by the people (walkers.js),
   so neither has to tell the other. */
export const alightAt = (dwellFrom, i) => dwellFrom + 1 + i * ALIGHT_EACH;

/* AT THE STOP: standing there, the doors open; the people getting off get
   off, the people waiting (`waiting`, counted from the sidewalk as it was
   last tick) get on, and then it is served and the bus looks for the
   next. Returns the bus as it now is. */
export function atStop(me, t, course, path, waiting = 0, mayGo = () => true) {
  if (!me.busStop) return me;
  /* Only AT the stop -- a bus held in a queue short of it has not arrived,
     and one that moves has shut its doors (verify-buses: a bus that began
     its dwell in a queue and crept up stood 19 s). It comes to rest a
     little short of where it aims, by the following gap. */
  if (me.v > 0.3 || me.s < me.busStop.at - REST) return me.dwellFrom == null ? me : { ...me, dwellFrom: null };
  if (me.dwellFrom == null) {
    /* Who gets off here: a share of whoever is aboard, drawn from the bus's
       own number and the stop, so it is the same every time it is asked. */
    const riders = me.riders ?? 0;
    const u = ((((me.n ?? 0) * 2654435761) ^ hash(me.busStop.id)) >>> 0) / 4294967296;
    const off = Math.round(riders * (OFF_SHARE[0] + (OFF_SHARE[1] - OFF_SHARE[0]) * u));
    return { ...me, dwellFrom: t, alighting: off, boardedFrom: null };
  }
  const since = t - me.dwellFrom;
  const offDone = since >= (me.alighting ? alightAt(0, me.alighting - 1) + 1 : 0);
  /* Doors shut when everybody has got off and nobody is left to get on --
     or when it has stood long enough. */
  const boarded = Math.max(me.boarded ?? 0, waiting);
  if (since < MAX_DWELL && (since < MIN_DWELL || !offDone || waiting > 0)) return boarded === (me.boarded ?? 0) ? me : { ...me, boarded };
  /* Out of a bay only when the road behind lets it (`mayPullOut`),
     signalling meanwhile -- which is what a driver who knows the rule
     gives way to. */
  const bay = me.busStop.bay;
  if (bay && !mayGo()) return me.wantsOut ? (boarded === (me.boarded ?? 0) ? me : { ...me, boarded }) : { ...me, wantsOut: t, boarded };
  const served = me.busStop.id;
  const on = { ...me, served, dwellFrom: null, busStop: null, wantsOut: null, riders: Math.max(0, (me.riders ?? 0) - (me.alighting ?? 0)) + boarded, alighting: 0, boarded: 0,
    ...(bay ? { bay: { ...bay, out0: me.s } } : {}) };
  return { ...on, busStop: nextStop(course, on, path, me.s, 20) };
}
