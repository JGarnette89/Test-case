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
import { emptyMap, road as makeRoad, KINDS, LANE } from "../map/format.js";

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
export function setRoadProps(map, roadId, patch) {
  return patchRoad(map, roadId, (r) => ({ ...r, ...patch }));
}
export function setRoadControl(map, roadId, end, control) {
  return patchRoad(map, roadId, (r) => ({ ...r, control: { ...r.control, [end]: control } }));
}
export function setRoadTurns(map, roadId, end, turns) {
  return patchRoad(map, roadId, (r) => ({ ...r, turns: { ...(r.turns ?? { start: null, end: null }), [end]: turns } }));
}
export function setRoadBays(map, roadId, end, bays) {
  return patchRoad(map, roadId, (r) => ({ ...r, bays: { ...(r.bays ?? { start: null, end: null }), [end]: bays } }));
}
export function setLeftArrow(map, roadId, end, on) {
  return patchRoad(map, roadId, (r) => ({ ...r, leftArrow: { ...(r.leftArrow ?? { start: false, end: false }), [end]: on } }));
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
   the warning. This only answers "is there an END nearby to click
   toward", cheap enough to run every frame the pointer moves: it
   checks the road ENDS on the map (what a road drawn a little short of
   another will actually join), not every point on every road, which is
   what load.js's own `nearestOn` sweep is for and is not free to redo
   on each pointer move. Returns the nearest end within `within`
   metres, or null. */
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
