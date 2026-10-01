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
import { emptyMap, road as makeRoad, KINDS, LANE, PROP_KINDS, PARK_W, BAY } from "../map/format.js";

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
  return { ...map, roads: map.roads.filter((r) => r.id !== roadId), ...(map.signs ? { signs: map.signs.filter((s) => s.road !== roadId) } : {}) };
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
/* THE CONTROL AT AN APPROACH, as the editor writes it: a stop or yield is
   a SIGN standing there (map/format.js `signs`), anything else -- a
   signal, nothing -- is the road end's own control, and the sign that was
   there is taken away. The plate is left alone: it belongs to a signal. */
export function setRoadControl(map, roadId, end, control) {
  const sign = control === "stop" || control === "yield";
  const others = (map.signs ?? []).filter((s) => !(s.road === roadId && s.end === end && (s.kind === "stop" || s.kind === "yield")));
  const was = (map.signs ?? []).find((s) => s.road === roadId && s.end === end && (s.kind === "stop" || s.kind === "yield"));
  const signs = sign ? [...others, { id: was?.id ?? nextId(map.signs ?? [], "sign"), kind: control, road: roadId, end, back: was?.back ?? 0 }] : others;
  const m = patchRoad(map, roadId, (r) => ({ ...r, control: { ...r.control, [end]: sign ? "none" : control } }));
  return { ...m, signs };
}
/* How far before the line an approach's sign stands. */
export function setSignBack(map, roadId, end, back) {
  return { ...map, signs: (map.signs ?? []).map((s) => (s.road === roadId && s.end === end && (s.kind === "stop" || s.kind === "yield") ? { ...s, back: Math.max(0, Number(back) || 0) } : s)) };
}
/* The rule at an approach as the editor shows it: the sign if there is
   one, the road end's own control otherwise (shorthand from a map written
   before signs). */
export function controlAt(map, road, end) {
  const s = (map.signs ?? []).find((q) => q.road === road.id && q.end === end && (q.kind === "stop" || q.kind === "yield"));
  return s ? s.kind : road.control?.[end] ?? "none";
}
/* A NO-LEFT-TURN sign at an approach, on or off. */
export function setNoLeft(map, roadId, end, on) {
  const others = (map.signs ?? []).filter((s) => !(s.road === roadId && s.end === end && s.kind === "no-left-turn"));
  return { ...map, signs: on ? [...others, { id: nextId(map.signs ?? [], "sign"), kind: "no-left-turn", road: roadId, end, back: 0 }] : others };
}
export const noLeftAt = (map, road, end) => (map.signs ?? []).some((q) => q.road === road.id && q.end === end && q.kind === "no-left-turn");
export function setRoadTurns(map, roadId, end, turns) {
  return patchRoad(map, roadId, (r) => ({ ...r, turns: { ...(r.turns ?? { start: null, end: null }), [end]: turns } }));
}
export function setRoadBays(map, roadId, end, bays) {
  return patchRoad(map, roadId, (r) => fitTurns({ ...r, bays: { ...(r.bays ?? { start: null, end: null }), [end]: bays } }));
}
export function setCrosswalk(map, roadId, end, on) {
  return patchRoad(map, roadId, (r) => ({ ...r, crosswalk: { ...(r.crosswalk ?? { start: false, end: false }), [end]: on } }));
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
  const heading = headingToRoad(map, at, face) ?? 0;
  return { map: { ...map, props: [...(map.props ?? []), { id, kind, at: { x: at.x, y: at.y }, heading }] }, id };
}
/* The direction of the nearest road's segment within `face` metres of a
   point, or null with none -- what "facing the street" means. */
export function headingToRoad(map, at, face = 40) {
  const near = nearestOnRoad(map, at, { within: face });
  if (!near) return null;
  const pts = map.roads.find((r) => r.id === near.road).points, p = pts[near.seg], q = pts[near.seg + 1];
  return (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
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
  const a = { ...r, points: [...r.points.slice(0, seg + 1), p], control: { start: r.control?.start ?? "none", end: "none" }, ...keep("turns", "a"), ...keep("bays", "a"), ...keep("leftArrow", "a"), ...keep("crosswalk", "a") };
  const b = { ...r, id: newId, points: [p, ...r.points.slice(seg + 1)], control: { start: "none", end: r.control?.end ?? "none" }, ...keep("turns", "b"), ...keep("bays", "b"), ...keep("leftArrow", "b"), ...keep("crosswalk", "b") };
  const roads = map.roads.flatMap((x) => (x.id === roadId ? [a, b] : [x]));
  /* A sign stands at a road END: the one at the old end now stands at the
     second half's, and the new ends where the split is have none. */
  const signs = map.signs?.map((s) => (s.road === roadId && s.end === "end" ? { ...s, road: newId } : s));
  return { map: { ...map, roads, ...(signs ? { signs } : {}) }, ids: [roadId, newId] };
}

/* A MID-BLOCK CROSSING (the maintainer's ruling, 28 September: "a stop
   sign can be mid-road, but it needs to still serve its purpose to stop
   traffic for a crossing" -- a school zone, say). The road is split at the
   point nearest `at`; the two new ends meet at a node with only this
   street through it, each gets a stop sign, and a crosswalk is painted
   there -- the people who use it are the sim's (sim/peds.js). Nothing new
   in the format: it is two roads, two signs and a crosswalk, which is what
   a mid-block stop is. */
export function addCrossing(map, roadId, at) {
  const r = map.roads.find((x) => x.id === roadId);
  if (!r || r.points.length < 2) return { map, ids: [roadId] };
  let best = null;
  for (let i = 0; i + 1 < r.points.length; i++) {
    const a = r.points[i], b = r.points[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0.05, Math.min(0.95, ((at.x - a.x) * dx + (at.y - a.y) * dy) / L2));
    const p = { x: a.x + dx * t, y: a.y + dy * t, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t };
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (!best || d < best.d) best = { seg: i, p, d };
  }
  const { map: split, ids } = splitRoad(map, roadId, best.seg, best.p);
  let m = setRoadControl(split, ids[0], "end", "stop");
  m = setRoadControl(m, ids[1], "start", "stop");
  m = setCrosswalk(m, ids[0], "end", true);
  return { map: m, ids };
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

/* --- bus stops ------------------------------------------------------------ */
/* A STOP IS A PLACE (map/format.js `stops`), so placing one is a tap beside
   a road: the post goes just beyond the curb on the side tapped -- past
   the parking strip where the road has one, past the bay where it is a
   bay -- and the loader decides from that which direction it serves and
   refuses, by name, one it cannot place. */
const halfOuter = (r) => {
  const k = KINDS[r.kind] ?? KINDS.collector, lanes = r.lanes ?? k.lanes, two = !r.oneWay;
  const parked = (r.parking ?? k.parking) === "parallel" && two && !r.bays;
  return (two ? lanes * LANE : (lanes * LANE) / 2) + (parked ? PARK_W : 0);
};
export function addStop(map, at, { kind = "curb", within = 15 } = {}) {
  const on = nearestOnRoad(map, at, { within });
  if (!on) return { map, id: null };
  const r = map.roads.find((x) => x.id === on.road), a = r.points[on.seg], b = r.points[on.seg + 1];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  const side = (at.x - on.at.x) * nx + (at.y - on.at.y) * ny >= 0 ? 1 : -1;
  const out = halfOuter(r) + 1.0 + (kind === "bay" ? BAY.w : 0);
  const id = nextId(map.stops ?? [], "stop");
  const stop = { id, at: { x: on.at.x + side * nx * out, y: on.at.y + side * ny * out }, kind };
  return { map: { ...map, stops: [...(map.stops ?? []), stop] }, id };
}
/* Curb or bay: the post moves out by the bay's width, or back in, so it
   stays just beyond the curb either way. */
export function setStopKind(map, id, kind) {
  return { ...map, stops: (map.stops ?? []).map((s) => {
    if (s.id !== id || s.kind === kind) return s;
    const on = nearestOnRoad(map, s.at, { within: 40 });
    if (!on) return { ...s, kind };
    const dx = s.at.x - on.at.x, dy = s.at.y - on.at.y, d = Math.hypot(dx, dy) || 1, by = kind === "bay" ? BAY.w : -BAY.w;
    return { ...s, kind, at: { x: s.at.x + (dx / d) * by, y: s.at.y + (dy / d) * by } };
  }) };
}
export function deleteStop(map, id) {
  return { ...map, stops: (map.stops ?? []).filter((s) => s.id !== id) };
}
export function stopAt(map, pt, within = 6) {
  let best = null;
  for (const s of map.stops ?? []) { const d = Math.hypot(s.at.x - pt.x, s.at.y - pt.y); if (d <= within && (!best || d < best.d)) best = { id: s.id, d }; }
  return best?.id ?? null;
}

/* --- an intersection's controls, in one tap ------------------------------ */
/* A crossroads drawn by hand starts uncontrolled at every end, and setting
   it meant selecting each road and each end in turn -- four edits for one
   crossroads. These set the whole intersection at once, through the same
   `setRoadControl` an end-by-end edit uses, so the result is exactly what
   those edits would have written. */

/* How major a kind of road is: the lower kinds are the minor roads at an
   intersection, the ones a stop or a yield goes on. */
export const RANK = { service: 0, residential: 1, collector: 2, arterial: 3, highway: 4 };
export const PRESETS = ["all-stop", "minor-stop", "minor-yield", "signal", "none"];

/* The road ends meeting at a point (within `within` metres), each with its
   kind and the direction it leaves in; which of them are minor; and the
   roads that run straight THROUGH the point without an end there (they
   need splitting before they can carry a control). */
export function intersectionAt(map, at, { within = LANE * 1.5 } = {}) {
  const legs = [], through = [];
  for (const r of map.roads) {
    if (r.points.length < 2) continue;
    const n = r.points.length;
    for (const [end, p, q] of [["start", r.points[0], r.points[1]], ["end", r.points[n - 1], r.points[n - 2]]]) {
      if (Math.hypot(p.x - at.x, p.y - at.y) > within) continue;
      const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      legs.push({ road: r.id, end, kind: r.kind, dir: { x: (q.x - p.x) / L, y: (q.y - p.y) / L } });
    }
    if (!legs.some((l) => l.road === r.id)) {
      const on = nearestOnRoad({ roads: [r] }, at, { within });
      if (on) through.push(on);
    }
  }
  return { at, legs, through, minor: minorLegs(legs, through.length) };
}

/* Which legs are minor: the lower-ranked roads, if the roads are not all
   one kind; at a T of one kind, the stem -- the leg with no other leg
   running straight on from it. Null where nothing tells the roads apart
   (a crossroads of four equal roads): then "minor" means nothing, and the
   choice is all-way, signals or nothing. */
function minorLegs(legs, throughCount) {
  if (throughCount) return null;   // decided once the through road is split
  if (legs.length < 2) return null;
  const top = Math.max(...legs.map((l) => RANK[l.kind] ?? 2));
  const lower = legs.map((l, i) => ((RANK[l.kind] ?? 2) < top ? i : -1)).filter((i) => i >= 0);
  if (lower.length) return lower;
  if (legs.length === 3) {
    const straightOn = (i) => legs.some((m, j) => j !== i && legs[i].dir.x * m.dir.x + legs[i].dir.y * m.dir.y < -0.87);   // within 30 degrees of opposite
    const stem = legs.map((_, i) => i).filter((i) => !straightOn(i));
    return stem.length === 1 ? stem : null;
  }
  return null;
}

/* SET AN INTERSECTION. Splits any road running straight through the point
   first, so every road there has an end to carry a control; then applies
   the preset to every end. Returns `{ map, applied, reason }` -- `applied`
   false, with a reason in words, where the preset means nothing here. */
export function setIntersection(map, at, preset, { within = LANE * 1.5 } = {}) {
  if (!PRESETS.includes(preset)) return { map, applied: false, reason: `"${preset}" is not one of ${PRESETS.join(", ")}` };
  let m = map, x = intersectionAt(m, at, { within });
  for (const on of x.through) m = splitRoad(m, on.road, on.seg, on.at).map;
  x = intersectionAt(m, at, { within });
  if (x.legs.length < 2) return { map, applied: false, reason: "no intersection here: fewer than two road ends meet at this point" };
  const minor = new Set(x.minor ?? []);
  if (preset.startsWith("minor") && !minor.size) return { map, applied: false, reason: "every road here is the same kind, so there is no minor road -- choose all-way stop, signals or none" };
  x.legs.forEach((l, i) => {
    const c = preset === "all-stop" ? "stop" : preset === "signal" ? "signal" : preset === "none" ? "none"
      : minor.has(i) ? (preset === "minor-stop" ? "stop" : "yield") : "none";
    m = setRoadControl(m, l.road, l.end, c);
  });
  return { map: m, applied: true, reason: null };
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
