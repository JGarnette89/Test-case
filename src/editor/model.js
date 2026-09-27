/* =====================================================================
   THE EDITOR'S DATA MODEL: pure functions over a map (map/format.js).

   SIMULATOR.md section 4, stage 2. The draft IS a map -- literally the
   same shape `emptyMap()`/`road()` produce, never a parallel
   representation with editor bookkeeping mixed in -- so "save" is
   `JSON.stringify(draft)` with nothing to strip, and the map format
   stays the one thing the editor and the simulator agree on (section
   3). Every function here takes a map and returns a new one; nothing
   here imports React, canvas, or anything from src/sim/ or src/iso/ --
   the editor WRITES the format, `map/load.js` and `sim/graph.js` READ
   it, and the boundary between drawing a road and understanding what it
   means stays exactly where the rest of the project draws it.

   IDS ARE ASSIGNED HERE, NOT LEFT TO THE CALLER, so two roads drawn in
   the same session can never collide -- `nextId` scans what already
   exists rather than keeping a counter, which is what makes deleting a
   road and adding another safe without extra bookkeeping.
   ===================================================================== */
import { emptyMap, road as makeRoad, KINDS, LANE, PROP_KINDS } from "../map/format.js";

/* --- ids ---------------------------------------------------------- */
function nextId(list, prefix) {
  let n = list.length;
  const used = new Set(list.map((x) => x.id));
  let id = `${prefix}${n}`;
  while (used.has(id)) { n++; id = `${prefix}${n}`; }
  return id;
}

/* --- roads ---------------------------------------------------------- */
/* A road starts with no points; the caller appends them as the pointer
   moves. Kind supplies every default (speed, lanes, parking) the way
   `road()` already does, so a road is drivable the instant it has two
   points, before anyone has touched a property field. */
export function addRoad(map, { kind = "collector" } = {}) {
  const id = nextId(map.roads, "road");
  const roads = [...map.roads, makeRoad({ id, kind, points: [] })];
  return { map: { ...map, roads }, id };
}

const patchRoad = (map, roadId, fn) => ({
  ...map,
  roads: map.roads.map((r) => (r.id === roadId ? fn(r) : r)),
});

export function addPoint(map, roadId, pt) {
  return patchRoad(map, roadId, (r) => ({ ...r, points: [...r.points, { x: pt.x, y: pt.y, z: pt.z ?? 0 }] }));
}
export function updatePoint(map, roadId, index, pt) {
  return patchRoad(map, roadId, (r) => ({
    ...r,
    points: r.points.map((p, i) => (i === index ? { ...p, ...pt } : p)),
  }));
}
export function removeLastPoint(map, roadId) {
  return patchRoad(map, roadId, (r) => ({ ...r, points: r.points.slice(0, -1) }));
}
export function setPointZ(map, roadId, index, z) {
  return updatePoint(map, roadId, index, { z });
}
export function deleteRoad(map, roadId) {
  return { ...map, roads: map.roads.filter((r) => r.id !== roadId) };
}
/* A property patch: kind, lanes, oneWay, speed, parking. Changing kind
   does NOT overwrite lanes/speed/parking the author already set --
   `road()`'s own kind-fills-blanks rule only applies to a field that
   was never given, and a patch here is exactly the fields the caller
   names, same discipline. */
/* A turns override lists one entry per lane at the line -- the road's
   lanes plus that end's bays -- so a change to either can leave it the
   wrong length, which the graph would refuse and replace with the
   general rule anyway. Such an override is dropped here instead, so the
   panel shows the rule rather than an error; one that still fits stays. */
const atLine = (r, end) => (r.lanes ?? 1) + (r.bays?.[end]?.left ?? 0) + (r.bays?.[end]?.right ?? 0);
function fitTurns(r) {
  if (!r.turns) return r;
  const turns = { ...r.turns };
  for (const end of ["start", "end"]) if (turns[end] && turns[end].length !== atLine(r, end)) turns[end] = null;
  return { ...r, turns };
}
export function setRoadProps(map, roadId, patch) {
  return patchRoad(map, roadId, (r) => fitTurns({ ...r, ...patch }));
}
export function setRoadControl(map, roadId, end, control) {
  return patchRoad(map, roadId, (r) => ({ ...r, control: { ...r.control, [end]: control } }));
}
export function setRoadTurns(map, roadId, end, turns) {
  return patchRoad(map, roadId, (r) => ({ ...r, turns: { ...(r.turns ?? { start: null, end: null }), [end]: turns } }));
}
export function setRoadBays(map, roadId, end, bays) {
  return patchRoad(map, roadId, (r) => fitTurns({ ...r, bays: { ...(r.bays ?? { start: null, end: null }), [end]: bays } }));
}
export function setLeftArrow(map, roadId, end, on) {
  return patchRoad(map, roadId, (r) => ({ ...r, leftArrow: { ...(r.leftArrow ?? { start: false, end: false }), [end]: on } }));
}

/* --- buildings ---------------------------------------------------------- */
/* A building placed by hand. It faces the nearest road when there is one
   within `face` metres -- a building's long side along its street is what
   a person placing one means nearly every time -- else it sits square. */
export function addProp(map, { kind = "house", at, face = 40 } = {}) {
  const id = nextId(map.props ?? [], "b");
  const near = nearestOnRoad(map, at, { within: face });
  let heading = 0;
  if (near) {
    const pts = map.roads.find((r) => r.id === near.road).points, p = pts[near.seg], q = pts[near.seg + 1];
    heading = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
  }
  return { map: { ...map, props: [...(map.props ?? []), { id, kind, at: { x: at.x, y: at.y }, heading }] }, id };
}
export function setPropProps(map, id, patch) {
  return { ...map, props: (map.props ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)) };
}
export function deleteProp(map, id) {
  return { ...map, props: (map.props ?? []).filter((p) => p.id !== id) };
}
/* A prop's footprint as the loader will build it: the kind's size unless
   overridden. */
export function footprintOf(p) {
  const k = PROP_KINDS[p.kind] ?? PROP_KINDS.house;
  return { l: p.l ?? k.l, w: p.w ?? k.w, h: p.h ?? k.h };
}
/* The building under a point, the last placed first (the one drawn on
   top). */
export function propAt(map, pt) {
  const list = map.props ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i], { l, w } = footprintOf(p);
    const a = ((p.heading ?? 0) * Math.PI) / 180, dx = pt.x - p.at.x, dy = pt.y - p.at.y;
    if (Math.abs(dx * Math.cos(a) + dy * Math.sin(a)) <= l / 2 && Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= w / 2) return p.id;
  }
  return null;
}

/* --- zones ------------------------------------------------------------ */
export function addZone(map, { kind = "residential" } = {}) {
  const id = nextId(map.zones ?? [], "zone");
  const zones = [...(map.zones ?? []), { id, kind, polygon: [] }];
  return { map: { ...map, zones }, id };
}
const patchZone = (map, zoneId, fn) => ({
  ...map,
  zones: (map.zones ?? []).map((z) => (z.id === zoneId ? fn(z) : z)),
});
export function addZonePoint(map, zoneId, pt) {
  return patchZone(map, zoneId, (z) => ({ ...z, polygon: [...z.polygon, { x: pt.x, y: pt.y }] }));
}
export function setZoneProps(map, zoneId, patch) {
  return patchZone(map, zoneId, (z) => ({ ...z, ...patch }));
}
export function deleteZone(map, zoneId) {
  return { ...map, zones: (map.zones ?? []).filter((z) => z.id !== zoneId) };
}

/* --- snap preview -------------------------------------------------- */
/* THE LIVE FEEDBACK WHILE DRAWING, not the authority. `map/load.js`
   still does the real snapping at validate/save/drive time -- splitting
   a road a new one lands on the middle of, creating the node, writing
   the warning. This answers "is there an END nearby to click toward";
   `nearestOnRoad` below answers the same for a point on a LINE (a T),
   and the editor asks this first, since joining end to end is the
   commoner intent and an end sitting on a line would otherwise be
   indistinguishable from the line. Both sweep every segment of every
   road per pointer move, which is cheap at a blockout's size (hundreds
   of segments) and would want the chunk index (section 3.4) at a
   city's. Returns the nearest end within `within` metres, or null. */
export function nearestRoadEnd(map, pt, { within = LANE, excludeRoad = null } = {}) {
  let best = null;
  for (const r of map.roads) {
    if (r.id === excludeRoad || r.points.length === 0) continue;
    for (const end of ["start", "end"]) {
      const p = end === "start" ? r.points[0] : r.points[r.points.length - 1];
      const d = Math.hypot(p.x - pt.x, p.y - pt.y);
      if (d <= within && (!best || d < best.d)) best = { road: r.id, end, at: { x: p.x, y: p.y, z: p.z ?? 0 }, d };
    }
  }
  return best;
}

/* Cumulative distance along a road's own points, for the elevation
   profile's x-axis. A leaf utility, not imported from sim/graph.js --
   graph.js's own `cumulative` does the identical sum but lives in
   src/sim/, which the editor does not depend on (it writes the format,
   it does not run the sim), the same boundary `map/load.js`'s own
   local `dist`/`lerp` already keep. */
export function cumulative(points) {
  const at = [0];
  for (let i = 1; i < points.length; i++) {
    at.push(at[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return at;
}

/* --- joining roads ------------------------------------------------------ */
/* THE NEAREST POINT ON ANY ROAD'S LINE, not only its ends: what a road
   drawn to finish on the MIDDLE of another -- a T -- has to land on.
   `map/load.js` joins such an end by splitting the other road, but only
   within SNAP (a lane width, 3.6 m), which a fingertip on a phone
   misses as often as it hits; snapping the placed point exactly onto
   the line here makes the loader's join certain rather than lucky.
   Returns `{ road, seg, at, d }` -- `seg` the segment index, `at` the
   point with z interpolated -- or null beyond `within`. */
export function nearestOnRoad(map, pt, { within = LANE, excludeRoad = null } = {}) {
  let best = null;
  for (const r of map.roads) {
    if (r.id === excludeRoad || r.points.length < 2) continue;
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i], b = r.points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      const f = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2));
      const at = { x: a.x + dx * f, y: a.y + dy * f, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f };
      const d = Math.hypot(at.x - pt.x, at.y - pt.y);
      if (d <= within && (!best || d < best.d)) best = { road: r.id, seg: i, f, at, d };
    }
  }
  return best;
}

/* SPLIT A ROAD IN TWO at a point on segment `seg`. The first half keeps
   the id and everything at its START; the second gets a fresh id and
   everything at its END; the new ends meet at the split with no control
   of their own, the same rule `map/load.js` applies when it splits a
   road an end has snapped onto. Per-end fields (control, turns, bays,
   leftArrow) go with the end that carried them. */
export function splitRoad(map, roadId, seg, at) {
  const r = map.roads.find((x) => x.id === roadId);
  if (!r || seg < 0 || seg >= r.points.length - 1) return { map, ids: [roadId] };
  const p = { x: at.x, y: at.y, z: at.z ?? 0 };
  const newId = nextId(map.roads, "road");
  const keep = (f, which) => (r[f] ? { [f]: { start: which === "a" ? r[f].start ?? null : null, end: which === "b" ? r[f].end ?? null : null } } : {});
  const a = { ...r, points: [...r.points.slice(0, seg + 1), p], control: { start: r.control?.start ?? "none", end: "none" }, ...keep("turns", "a"), ...keep("bays", "a"), ...keep("leftArrow", "a") };
  const b = { ...r, id: newId, points: [p, ...r.points.slice(seg + 1)], control: { start: "none", end: r.control?.end ?? "none" }, ...keep("turns", "b"), ...keep("bays", "b"), ...keep("leftArrow", "b") };
  const roads = map.roads.flatMap((x) => (x.id === roadId ? [a, b] : [x]));
  return { map: { ...map, roads }, ids: [roadId, newId] };
}

/* MAKE AN INTERSECTION WHERE TWO ROADS CROSS. The format connects roads
   only at nodes (section 3.1): two roads drawn across each other are an
   overpass if one is high enough and a warning if not, never silently a
   junction -- because the editor cannot tell which was meant. When it
   WAS meant, this is the fix the warning offers: split both roads at
   the crossing, so four ends meet at one point and the loader makes the
   node. Both roads are brought to the same height there, the lower of
   the two, since a junction is one surface. */
export function joinCrossing(map, roadA, roadB, at) {
  const onA = nearestOnRoad({ roads: map.roads.filter((r) => r.id === roadA) }, at, { within: Infinity });
  const onB = nearestOnRoad({ roads: map.roads.filter((r) => r.id === roadB) }, at, { within: Infinity });
  if (!onA || !onB) return map;
  const z = Math.min(onA.at.z, onB.at.z);
  const p = { x: at.x, y: at.y, z };
  let m = splitRoad(map, roadA, onA.seg, p).map;
  m = splitRoad(m, roadB, onB.seg, p).map;
  return m;
}

/* --- reshaping ---------------------------------------------------------- */
/* A road drawn by tapping is straight segments; "free-drawn curves"
   (SIMULATOR.md section 1) on a phone need a way to round them off and
   to add or take away a point without redrawing the road. */

/* Remove one point. A road keeps at least two, or it is not a road; a
   request that would leave fewer is refused by returning the map
   unchanged, the same "cannot, so nothing happens" the rest of the
   model keeps. */
export function deletePoint(map, roadId, index) {
  return patchRoad(map, roadId, (r) => (r.points.length <= 2 ? r : { ...r, points: r.points.filter((_, i) => i !== index) }));
}

/* A point in the middle of every segment, height interpolated: more
   handles to drag a straight road into a curve by. */
export function subdivideRoad(map, roadId) {
  return patchRoad(map, roadId, (r) => {
    const out = [];
    r.points.forEach((p, i) => {
      out.push(p);
      const q = r.points[i + 1];
      if (q) out.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: ((p.z ?? 0) + (q.z ?? 0)) / 2 });
    });
    return { ...r, points: out };
  });
}

/* ONE PASS OF CORNER-CUTTING (Chaikin): every segment replaced by its
   quarter and three-quarter points, the two ENDS kept exactly where
   they are -- they are where the road meets another road or the edge
   of the map, and moving them would unjoin a junction. Each pass
   rounds every corner further; a few turn a tapped zigzag into a road
   a car can take at speed, which the loader's own bend check
   (map/load.js `tightestBend`) then reads as a gentler radius. */
export function smoothRoad(map, roadId) {
  return patchRoad(map, roadId, (r) => {
    const P = r.points;
    if (P.length < 3) return r;
    const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f });
    const out = [P[0]];
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      if (i > 0) out.push(lerp(a, b, 0.25));
      if (i + 2 < P.length) out.push(lerp(a, b, 0.75));
    }
    out.push(P[P.length - 1]);
    return { ...r, points: out };
  });
}

/* --- elevation, road-wide --------------------------------------------- */
/* SECTION 4: "a height handle per point, or a road-wide ramp". Per-point
   fields are tedious on a phone for a bridge of twenty points; these
   set a whole road's profile from two numbers, by distance along it.
   RAMP: straight from `z0` at the start to `z1` at the end. HUMP: a
   rise of `peak` over whatever the ends already are, highest in the
   middle and flat where it meets the ground at each end -- the shape
   of an overpass, and the same sin^2 the test map's own hill uses. */
export function setRoadRamp(map, roadId, z0, z1) {
  return patchRoad(map, roadId, (r) => {
    const at = cumulative(r.points), L = at.at(-1) || 1;
    return { ...r, points: r.points.map((p, i) => ({ ...p, z: z0 + (z1 - z0) * (at[i] / L) })) };
  });
}
export function setRoadHump(map, roadId, peak) {
  return patchRoad(map, roadId, (r) => {
    const at = cumulative(r.points), L = at.at(-1) || 1;
    const z0 = r.points[0]?.z ?? 0, z1 = r.points.at(-1)?.z ?? 0;
    return { ...r, points: r.points.map((p, i) => { const t = at[i] / L; return { ...p, z: z0 + (z1 - z0) * t + peak * Math.sin(Math.PI * t) ** 2 }; }) };
  });
}

/* --- new / serialize -------------------------------------------------- */
export function newDraft(id = "untitled", name = "Untitled map") {
  return emptyMap(id, name);
}
export function serialize(map) {
  return JSON.stringify(map, null, 2);
}
/* Never throws: a corrupt or foreign file is a null, for the caller to
   report, the same discipline `storage.js readJSON` already keeps for
   the same reason -- a bad file must not crash the session it is
   dropped into. */
export function parse(text) {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && Array.isArray(v.roads) ? v : null;
  } catch {
    return null;
  }
}

export { KINDS };
