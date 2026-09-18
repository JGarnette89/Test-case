/* =====================================================================
   THE TRAFFIC THAT ALREADY WORKS, PUT ON THE STAGE 0 ROADS.

   Nothing new is simulated here. Each direction of each road is one of
   stage 0's stepped worlds from traffic.js -- cars following each other
   along `s`, deciding twenty times a second from the car ahead -- with
   the road's length set to the curve's length instead of six seconds of
   straight. The curve, the hill and the bridge are the renderer's
   business: following along `s` is the same following whatever shape
   the metres are laid out in, which is the point REBUILD.md 8.2 made
   when it measured a bend costing the simulation nothing.
   ===================================================================== */
import { step, DT, ROAD, CAR } from "../sim/traffic.js";
import { valleyRoad, bridgeRoad, terrain, LANE } from "./road.js";

function trafficOn(road, seed, kmh) {
  const speed = kmh / 3.6;
  let w = {
    t: 0, tick: 0, seed,
    road: { ...ROAD, kmh, speed, length: road.length, lane: LANE },
    spawned: 0, nextAt: 0, actors: [],
  };
  /* Warmed for two trips of the road, so it opens with traffic on it. */
  const warm = Math.round((2 * road.length) / speed / DT);
  for (let i = 0; i < warm; i++) w = step(w);
  return { ...w, t: 0, tick: 0, nextAt: w.nextAt - w.t };
}

export function seedScene(seed = 1, kmh = 60) {
  const valley = valleyRoad(), bridge = bridgeRoad();
  return {
    seed, kmh,
    valley, bridge,
    terrain: terrain(),
    /* Two directions per road: the same world twice, one driven along
       `s` and one against it, each in its own right-hand lane. */
    worlds: [
      { road: valley, dir: 1, world: trafficOn(valley, seed * 4 + 1, kmh) },
      { road: valley, dir: -1, world: trafficOn(valley, seed * 4 + 2, kmh) },
      { road: bridge, dir: 1, world: trafficOn(bridge, seed * 4 + 3, kmh) },
      { road: bridge, dir: -1, world: trafficOn(bridge, seed * 4 + 4, kmh) },
    ],
  };
}

export function stepScene(scene, n = 1) {
  const worlds = scene.worlds.map((w) => {
    let world = w.world;
    for (let i = 0; i < n; i++) world = step(world);
    return { ...w, world };
  });
  return { ...scene, worlds };
}

/* What the renderer draws: each road with its cars, positions carried
   forward by `carry` seconds since the last tick. */
export function carsOf(scene, carry = 0) {
  const byRoad = new Map();
  for (const { road, dir, world } of scene.worlds) {
    if (!byRoad.has(road)) byRoad.set(road, []);
    const list = byRoad.get(road);
    for (const a of world.actors) {
      list.push({ id: a.id, n: a.n ?? 0, s: a.s + a.v * carry, v: a.v, dir, weave: a.weave ? weaveOf(a) : 0 });
    }
  }
  return [...byRoad.entries()].map(([road, cars]) => ({ road, cars }));
}

/* The weave as traffic.js draws it: amplitude by steering deficit, a
   sinusoid in distance. Re-stated here only because traffic.js's poseOf
   is the straight-road pose and the curve needs the offset alone. */
import { weaveAt } from "../sim/traffic.js";
const weaveOf = (a) => weaveAt(a, a.s);

export { DT, CAR };
