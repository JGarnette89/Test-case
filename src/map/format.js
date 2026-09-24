/* =====================================================================
   THE MAP FORMAT: a map is data, in JSON, in metres.

   SIMULATOR.md section 3. The one artifact the editor and the simulator
   agree on, designed so that nothing a badly drawn map contains can
   throw the simulation: `load.js` normalises, warns, and produces a
   valid graph or refuses with a reason. This file is the vocabulary --
   what a road kind means, what a control is, what an empty map looks
   like -- and the first map, which is stage 0's two roads.

   Coordinates: metres, origin top-left, y southward, as everywhere
   else in this project. Headings clockwise in plan, degrees.
   ===================================================================== */
export const MAP_VERSION = 1;
export const CHUNK = 256;          // metres per chunk edge (section 3.4)
export const LANE = 3.6;           // metres; the lane width every road is built from
export const SAMPLE = 5;           // metres between centreline samples after normalisation (the bend's step today)

/* A road kind is a posted speed and a lane count per direction; the
   editor picks a kind and can override either. The speeds are DEFAULTS
   in the range Ontario posts (a residential street is 40 or 50, an
   arterial 60), a step up from the old engine's CHARACTER table
   (tiles.js: 30 / 41 / 50), which was tuned to that engine's pace.
   Posted speeds are the maintainer's to correct; nothing below depends
   on these exact numbers. */
/* LANES PER DIRECTION: generous, as a gameplay decision. The first
   playtest called one lane each way "very restrictive" -- nowhere to
   go, nothing to pass, a car ahead is a wall -- and metric realism was
   demoted when the project was reframed: only a quiet residential
   street is one lane each way. */
export const KINDS = {
  residential: { speed: 40, lanes: 1, parking: "parallel" },
  collector:   { speed: 50, lanes: 2, parking: "none" },
  arterial:    { speed: 60, lanes: 3, parking: "none" },
  highway:     { speed: 100, lanes: 3, parking: "none" },
  service:     { speed: 30, lanes: 1, parking: "none" },
};
/* WHAT GOVERNS A ROAD END. `signal-no-right-on-red` is a posted sign
   rather than a fifth kind of control: it is a signal, and the suffix
   is how one approach says the turn is not permitted on its red, which
   is per approach in the real world too (src/sim/signal.js). */
export const CONTROLS = ["stop", "yield", "none", "signal", "signal-no-right-on-red"];
export const ZONES = ["residential", "commercial", "industrial", "park", "water", "highway"];

export function emptyMap(id = "untitled", name = "Untitled") {
  return { id, name, version: MAP_VERSION, bounds: { x: 0, y: 0, w: CHUNK, h: CHUNK }, chunk: CHUNK, roads: [], nodes: [], zones: [], props: [], spawns: [] };
}

/* A road as the editor draws it: a stroke of points and a kind. The
   loader fills what is missing from the kind. */
/* `turns`, optional, per road end: what each lane arriving at that end
   may do, one list per lane from the centre line out -- ["left"],
   ["straight", "right"] and so on. Absent, the general rule applies
   (sim/lanes.js); present, it overrides it, which is how a double left
   or a right-turn-only curb lane is written. */
export function road({ id, kind = "collector", points, lanes, oneWay = false, speed, parking, control = { start: "none", end: "none" }, turns }) {
  const k = KINDS[kind] ?? KINDS.collector;
  return { id, kind, points, lanes: lanes ?? k.lanes, oneWay, speed: speed ?? k.speed, parking: parking ?? k.parking, control, ...(turns ? { turns } : {}) };
}

/* STAGE 0 AS THE FIRST MAP. The valley road and the bridge road from
   iso/road.js, expressed as strokes of points every SAMPLE metres,
   with no node where they cross -- an overpass is two roads whose plan
   projections cross with no node at the crossing. Loading this must
   reproduce what `valleyRoad()` and `bridgeRoad()` build, to the
   centimetre, which is what verify-map.mjs checks: the format's first
   test is that it can carry the world that already exists. */
import { valleyRoad, bridgeRoad } from "../iso/road.js";
export function stage0Map() {
  const strokeOf = (r) => r.pts.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 }));
  return {
    ...emptyMap("stage0", "Stage 0 — a valley road, a hill, an overpass"),
    bounds: { x: -80, y: -90, w: 840, h: 610 },
    roads: [
      road({ id: "valley", kind: "arterial", lanes: 1, speed: 60, points: strokeOf(valleyRoad()) }),   // stage 0's roads, exactly as built: one lane each way
      road({ id: "bridge", kind: "arterial", lanes: 1, speed: 60, points: strokeOf(bridgeRoad()) }),
    ],
  };
}
