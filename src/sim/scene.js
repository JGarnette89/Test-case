/* =====================================================================
   THE WORLD FOR A MAP, AND THE PLAYER'S CONTACT WITH IT -- one place, so
   the screen and the sim's worker (sim/remote.js) build the same world
   from the same arguments and judge the same contact.

   Moved out of MapRoad.jsx `sceneFor` (13 October), which still calls it:
   a worker cannot import a React screen, and two copies of how a world is
   seeded would be the project's recurring bug (CLAUDE.md item 2).
   ===================================================================== */
import { loadMap } from "../map/load.js";
import { testMap1 } from "../map/samples.js";
import { firstEdge } from "../map/edges.js";
import { carsFor } from "../map/cars.js";
import { seedGraph, poseOf, crashWith } from "./crossing.js";
import { playerOn, placePlayer, driverPose } from "./drive.js";
import { touching } from "./player.js";
import { contactWith } from "./parking.js";
import { pedAt, strikePed } from "./peds.js";

export const START = { road: "A-north", end: "end" };   // the player begins at the map's north edge, driving down to the crossroads

/* The loaded map, the seeded world and -- when driving -- the player,
   placed clear (drive.js `placePlayer`). Deterministic in its arguments. */
export function worldFor(seed, kmh, every, drive, cars = null, rawMap = null, startAt = null, lookAway = false, unshaped = false) {
  const loaded = loadMap(rawMap ?? testMap1());
  if (cars == null) cars = carsFor(loaded);
  if (!loaded.ok) throw new Error(`${rawMap ? "map" : "test map"}: ${loaded.error}`);
  const start = rawMap ? (startAt ?? firstEdge(loaded) ?? START) : START;
  /* POSTED SPEEDS ON (SIMULATOR.md 1.1.6): every road is driven at the
     limit it posts, so an arterial and a residential street are not the
     same road to drive -- which is the first thing that makes them feel
     different. The `kmh` passed in is then only what sizes the geometry
     (the fastest road's), never what anybody drives at. */
  /* DRIVERS WHO LOOK AWAY (sim/attention.js): everybody glances off the
     road now and then, for as long as their observation lets them, and
     misses what changed meanwhile. Off by default -- it makes crashes,
     which stay where they happened for the player to see. */
  /* THE RIVALS (sim/rivals.js) drive every map the screen opens. */
  let world = seedGraph(seed, kmh, loaded, { every, target: cars, posted: true, perceive: !!lookAway, walkers: true, rivals: true });
  /* DENSITY SHAPING (sim/shaping.js), where the map asks for it and somebody is driving -- unless the player switched it off (`unshaped`, the readout comparison: shaped against unshaped on one build, DECISIONS 10.17). */
  if (drive && loaded.traffic?.shape && !unshaped) world = { ...world, shape: true };
  let me = null;
  if (drive) {
    me = playerOn(world.course, start.road, start.end, { through: !!start.through });   // the curb lane, driving down to the crossroads
    /* A map with no drivable curb leg at its own chosen start -- a
       lone one-way road backwards, say -- refuses cleanly rather than
       pushing a null driver into the world, where every downstream
       reader of `a.player` would throw on it instead. The editor
       catches this and says so; #/map's own hardcoded start can never
       hit it. */
    if (!me) throw new Error("nowhere to start driving from on this map");
    /* Clear of every car, and of every car able to reach a car standing there (drive.js `placePlayer`). */
    world = placePlayer(world, me);
  }
  return { loaded, world, me };
}

/* THE PLAYER'S CONTACT, after a tick: a car they touch crashes too -- it
   stops and is logged -- rather than driving on through them; a parked
   car is as solid as a moving one; a person on foot falls where they are
   (sim/peds.js). Contact stops the player's car: what a collision IS in
   this game is still the maintainer's question. Returns the world and
   whether they hit anything. */
export function playerContact(w, me) {
  const mine = driverPose(me, w.course);
  let hit = false;
  for (const a of w.actors) {
    if (a.player) continue;
    const p = poseOf(w, a);
    if (touching(mine, { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, length: p.length, width: p.width })) { hit = true; w = crashWith(w, a.id, { x: p.x, y: p.y, z: p.z ?? 0 }); }
  }
  if (!hit && w.parked && contactWith(w.course, w.parked, mine, touching)) hit = true;
  const struck = hit ? null : pedAt(w, mine);
  if (struck) { hit = true; w = strikePed(w, struck); }
  return { world: w, hit };
}
