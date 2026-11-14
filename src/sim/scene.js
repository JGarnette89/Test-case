/* =====================================================================
   THE WORLD FOR A MAP -- one place, so the screen and the sim's worker
   (sim/remote.js) build the same world from the same arguments. The
   player's contact with it is sim/contact.js, passed on from here.

   Moved out of MapRoad.jsx `sceneFor` (13 October), which still calls it:
   a worker cannot import a React screen, and two copies of how a world is
   seeded would be the project's recurring bug (CLAUDE.md item 2).
   ===================================================================== */
import { loadMap } from "../map/load.js";
import { testMap1 } from "../map/samples.js";
import { firstEdge } from "../map/edges.js";
import { carsFor } from "../map/cars.js";
import { seedGraph, step } from "./crossing.js";
import { DT } from "./traffic.js";
import { DEFAULT_MERGE_TOLERANCE } from "./lanechange.js";
import { playerOn, placePlayer, withDriver } from "./drive.js";
export { playerContact } from "./contact.js";

/* HOW MANY SECONDS OF THE SHAPED WORLD THE SCREEN RUNS BEFORE THE PLAYER HAS THE WHEEL (`preroll`, below): 15, a flagged design constant. At 10 s the window is 70 to 80% filled (68 to 81 of about 99 cars within 1.5 km), at 20 s 98%; the world build is already 4.6 s on the generated highways on the desk and 20 s of pre-roll adds 1.0 to 1.2 s (25%), 10 s adds 0.46: 15 takes about 90 to 95% of the fill for about 0.8 s (tools/measure/lane-speeds.mjs, DECISIONS 10.93). Never the phone's measurement; to be raised or cut by it. */
export const PREROLL = 15;
export const START = { road: "A-north", end: "end" };   // the player begins at the map's north edge, driving down to the crossroads

/* The loaded map, the seeded world and -- when driving -- the player,
   placed clear (drive.js `placePlayer`). Deterministic in its arguments. */
export function worldFor(seed, kmh, every, drive, cars = null, rawMap = null, startAt = null, lookAway = false, unshaped = false, { checks = false, brakeReaction = true, mergeTolerance = DEFAULT_MERGE_TOLERANCE, preroll = 0 } = {}) {
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
  /* `checks`: the candidate's checks (sim/checks.js) -- off unless asked for, while they are built and not on (SIMULATOR IN FLIGHT 31). */
  let world = seedGraph(seed, kmh, loaded, { every, target: cars, posted: true, perceive: !!lookAway, walkers: true, rivals: true, checks, brakeReaction, mergeTolerance });
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
    /* THE WINDOW FILLED BEFORE THE PLAYER HAS THE WHEEL (Jay, 14 November: "it took about a minute of driving before the road filled"). Shaping places one car a tick and starts only once a player is on the map, so the world opens with a handful of cars within 1.5 km of him (5 to 8 of 101) and has 68 to 81 after 10 s and 89 to 99 after 20 (tools/measure/lane-speeds.mjs): `preroll` seconds of the shaped world are run with the player standing, so what he opens is the filled road. Only the screen asks (`sceneFor`): every check that builds a world through here keeps the one it always had. */
    if (preroll > 0 && world.shape) for (let i = 0, n = Math.round(preroll / DT); i < n; i++) world = step(withDriver(world, me));
  }
  return { loaded, world, me };
}
