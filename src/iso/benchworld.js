/* =====================================================================
   THE BENCH'S WORLD: the map and the seeded world for a fleet and a set
   of things switched off. Out of bench.js (13 October) so the sim's
   worker (sim/remote.js) can build the same world without the renderer.
   Pure. No React, no DOM, no canvas.
   ===================================================================== */
import { mapFromBrief } from "../map/brief.js";
import { loadMap } from "../map/load.js";
import { seedGraph } from "../sim/crossing.js";

/* THE MAP: a made-to-order city with everything the game has --
   signals and every other kind of intersection, a downtown with
   crosswalks and people on every sidewalk, curb stops and bays with
   buses, buildings on every lot, parked cars on the residential
   streets, trucks in the traffic at their ordinary share. */
export const BENCH_BRIEF = { size: "medium", arterials: "loop", everyType: true, downtown: true, buses: true };

/* WHAT CAN BE SWITCHED OFF, each to say what it costs. The sim-side
   ones change the world; `sidewalks` and `buildings` only what is
   drawn (walkers still use the buildings' doors). Every one is counted
   in the report, so a switch that silently does nothing shows as
   nothing having gone. */
export const OFF = {
  trucks: "trucks",
  buses: "buses",
  walkers: "people walking along",
  crossers: "people crossing",
  parked: "parked cars",
  sight: "sight blocking (trucks see-through)",
  sidewalks: "sidewalks (drawn)",
  buildings: "buildings (drawn)",
};

const maps = new Map();
/* The loaded bench map, with parking or without; built once each. */
export function benchMap({ parking = true } = {}) {
  const key = parking ? "with" : "without";
  if (!maps.has(key)) {
    let raw = mapFromBrief(BENCH_BRIEF, 1);
    if (!parking) raw = { ...raw, roads: raw.roads.map((r) => ({ ...r, parking: "none" })) };
    maps.set(key, loadMap(raw));
  }
  return maps.get(key);
}

/* What has to be a new WORLD: the fleet, and what the traffic is made
   of. Sight and what is drawn are switched on the world in hand. */
export const worldKey = (fleet, off = {}) => [fleet, ...["trucks", "buses", "walkers", "crossers", "parked"].map((k) => (off[k] ? 1 : 0))].join("|");

/* The world for a fleet and a set of things switched off -- the bench's
   `benchScene` world, sight included (bench.js `withOff`). */
export function benchWorld(fleet, off = {}) {
  const world = seedGraph(1, 50, benchMap({ parking: !off.parked }), {
    every: 2.0, target: fleet, posted: true, walkers: !off.walkers,
    ...(off.trucks ? { trucks: 0 } : {}), ...(off.buses ? { buses: 0 } : {}),
    ...(off.crossers ? { pedEvery: Infinity, gapRate: 0 } : {}),
  });
  return off.sight ? { ...world, seeThrough: true } : world;
}
