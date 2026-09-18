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

export function seedScene(seed = 1, kmh = 60, { traffic = 1, props = 0, focus = null } = {}) {
  const valley = valleyRoad(), bridge = bridgeRoad();
  /* Two directions per road: the same world twice, one driven along
     `s` and one against it, each in its own right-hand lane. `traffic`
     above one stacks more worlds on each -- cars that overlap, which is
     not a scene but a LOAD, for the performance budget (perf.js). */
  const worlds = [];
  for (let k = 0; k < Math.max(1, traffic); k++) {
    const base = seed * 4 + k * 1000;
    worlds.push(
      { road: valley, dir: 1, world: trafficOn(valley, base + 1, kmh) },
      { road: valley, dir: -1, world: trafficOn(valley, base + 2, kmh) },
      { road: bridge, dir: 1, world: trafficOn(bridge, base + 3, kmh) },
      { road: bridge, dir: -1, world: trafficOn(bridge, base + 4, kmh) },
    );
  }
  return { seed, kmh, valley, bridge, terrain: terrain(), worlds, props: propsFor(props, seed, [valley, bridge], focus) };
}

/* Boxes standing about the ground, off the roads: stand-ins for the
   buildings and props a city will have, at the cost each will have.
   Only for the budget ramp; a scene has none. Scattered around `focus`
   when one is given -- the ramp's camera -- because a load the camera
   cannot see is not a load: spread over the whole world, 300 of them
   put 25 on a phone's screen. */
export function propsFor(n, seed, roads, focus = null) {
  const out = [];
  let x = (seed * 2654435761) >>> 0;
  const r = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
  const REACH = 90;   // metres either side of the focus: about what a phone shows at the ramp's zoom
  let tries = 0;
  while (out.length < n && tries++ < n * 20) {
    const px = focus ? focus.x - REACH + r() * 2 * REACH : -60 + r() * 780;
    const py = focus ? focus.y - REACH + r() * 2 * REACH : -70 + r() * 560;
    let near = false;
    for (const road of roads) {
      for (let i = 0; i < road.pts.length; i += 2) {
        const p = road.pts[i];
        if (Math.hypot(p.x - px, p.y - py) < 12) { near = true; break; }
      }
      if (near) break;
    }
    if (near) continue;
    out.push({ x: px, y: py, heading: Math.floor(r() * 4) * 90, l: 6 + r() * 6, w: 5 + r() * 5, h: 3 + r() * 6 });
  }
  return out;
}

/* THE PLAYER IS AN ACTOR IN THE TRAFFIC'S OWN WORLD -- the valley road,
   forward -- so the car behind follows them with the model that follows
   everybody, and the spawner leaves room for them. `me` is the player's
   road-frame state from player.js; it is written in before the tick and
   the tick leaves it alone (traffic.js step). */
export function stepWithPlayer(scene, me) {
  const worlds = scene.worlds.map((w, i) => {
    if (i !== 0) return { ...w, world: step(w.world) };
    const actor = { id: "player", player: true, n: -1, s: me.s, v: me.v, a: me.a, off: me.off, yaw: (me.psi * 180) / Math.PI };
    const others = w.world.actors.filter((a) => !a.player);
    return { ...w, world: step({ ...w.world, actors: [...others, actor] }) };
  });
  return { ...scene, worlds };
}

/* A start for the player: the forward valley world with its cars
   cleared from a stretch around `s`, so a car at rest there is not
   born in contact. Traffic ahead stays ahead; the spawner fills in
   behind once the player moves off, since a car at rest is the last
   car on the road and it leaves no room. */
export function clearAround(scene, s, reach = 35) {
  const worlds = scene.worlds.map((w, i) => i !== 0 ? w
    : { ...w, world: { ...w.world, actors: w.world.actors.filter((a) => Math.abs(a.s - s) > reach) } });
  return { ...scene, worlds };
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
      if (a.player) {
        /* Carried forward by the screen, which owns its state; drawn in
           its own colour, with its heading off the road's. */
        list.push({ id: a.id, n: -1, s: a.s, v: a.v, dir, weave: a.off - LANE / 2, yaw: a.yaw, colour: "#f4f4f2", player: true });
        continue;
      }
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
