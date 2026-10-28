/* =====================================================================
   THE SKILL DIAL, LIVE (the maintainer's request, 28 October; SIMULATOR
   IN FLIGHT 34). `world.skill`, -1 to +1, is where the population's
   rating distribution sits (core/driver.js `profileAt`); new arrivals are
   drawn at it (crossing.js, through `driver`). When it moves, everybody
   already on the map is REDRAWN AT IT -- the same person, from the same
   seed and the same district, at the new level -- so the road changes
   in front of whoever is watching rather than as the traffic turns over,
   which on a closed city takes many minutes and would confound the one
   thing the dial is for: can a player SEE a poorly rated driver?

   A redraw replaces exactly the fields `driver` derives from the ratings
   (traffic.js `PERSONAL`) and nothing about where anybody is or what they
   are doing. Never redrawn: the player, an exam candidate, a rival (a
   character, whose ratings are their profile). At level 0 with the dial
   never touched nothing here runs, and the world is the world it was.
   ===================================================================== */
import { driver, PERSONAL } from "./traffic.js";
import { postedAt, kindAt } from "./graph.js";
import { townOf } from "./towns.js";

/* The district a driver came from, for its character (crossing.js draws a
   district's people from it); a car from the map's edge is from nowhere. */
const townFor = (world, a) => {
  if (!a.home) return null;
  const z = (world.course?.map?.zones ?? []).find((q) => q.id === a.home);
  return z ? townOf(z.character ?? "ordinary") : null;
};

export function redrawn(world, a, level = world.skill ?? 0) {
  if (a.player || a.candidate || a.rival || a.n == null) return a;
  const base = world.road.perceive?.who === "all" ? world.road : { ...world.road, perceive: null };
  const posted = world.road.posted && world.course?.graph ? postedAt(world.course, a.k ?? 0, a.route) : null;
  const road = posted == null ? base : { ...base, speed: posted, kmh: Math.round(posted * 3.6), kind: kindAt(world.course, a.k ?? 0, a.route) };
  const who = driver(road, world.seed, a.n, null, townFor(world, a), a.kind ?? "car", level);
  const out = { ...a };
  for (const k of PERSONAL) out[k] = who[k];
  return out;
}

/* Once per step, before anybody moves: if the dial has moved since the
   population was last drawn, redraw it. */
export function applySkill(world) {
  const want = world.skill ?? 0, drawn = world.skillDrawn ?? 0;
  if (want === drawn) return world;
  return { ...world, skillDrawn: want, actors: world.actors.map((a) => redrawn(world, a, want)) };
}
