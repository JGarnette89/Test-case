/* =====================================================================
   PEDESTRIANS ON CROSSWALKS (SIMULATOR.md stage 6).

   A pedestrian is not an obstacle with a timer on it (DECISIONS.md
   5.13.4): they choose when to step off, and what they hold while
   crossing is a claim about entitlement, not only about where they are.

   WHO: people appear at the curb of every crosswalk (map data per road
   end, graph.js `junctionsOf` `crossings`) at a seeded rate, PED_EVERY
   seconds apart on average per crosswalk -- a design constant, flagged.
   A map without crosswalks has none and its traffic is untouched: the
   draws come from their own stream.

   WHEN THEY GO: when every car that would cross their path could still
   stop comfortably short of it, or is stopped. A pedestrian at an
   intersection crosswalk has the right of way once on it, and a sensible
   one does not step in front of a car that cannot stop. (Heedless ones,
   who do, are content for later -- DECISIONS.md, `heedless`.)

   WHAT THEY HOLD (DECISIONS.md 5.4, the maintainer's rule): the HALF of
   the road they are on -- a driver whose lane lies on the other half may
   go -- and the next half too once they are within a step of it, so
   nobody drives into the half somebody is about to walk into. Waiting at
   the curb they hold nothing, as the crossing-button rule has it.

   Walking speed 1.35 m/s, the engine's established figure.
   ===================================================================== */
import { junctionsOf } from "./graph.js";
import { rng } from "../core/rng.js";
import { DT, CAR } from "./traffic.js";

export const WALK = 1.35;
const STRUCK_CLEAR = 45;
export const PED_EVERY = 25;
/* What a pedestrian judges a driver able to do: a comfortable stop. */
const COMFY = 2.5;
/* Within this of the midpoint, heading over it, they hold the next half. */
const STEP = 1.0;

const cwCache = new WeakMap();
/* Every crosswalk on the map: where it lies, and at which node. */
export function crosswalksOf(course) {
  if (!course?.graph) return [];
  if (cwCache.has(course)) return cwCache.get(course);
  const out = [];
  for (const j of junctionsOf(course)) {
    const k = course.at.findIndex((a) => a.node === j.node);
    for (const c of j.crossings ?? []) out.push({ ...c, k, key: `${c.road}|${c.end}`, i: out.length });
  }
  cwCache.set(course, out);
  return out;
}

/* Where a path crosses a crosswalk's centre line, if it does: `s` along
   the path and `t` from the crosswalk's a (0) to b (1). Cached per path. */
const bandCache = new WeakMap();
export function bandOn(path, cw) {
  let m = bandCache.get(path);
  if (!m) { m = new Map(); bandCache.set(path, m); }
  if (m.has(cw.key)) return m.get(cw.key);
  let hit = null;
  const { a, b } = cw;
  for (let i = 1; i < path.pts.length && !hit; i++) {
    const p = path.pts[i - 1], q = path.pts[i];
    const d = (q.x - p.x) * (b.y - a.y) - (q.y - p.y) * (b.x - a.x);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((a.x - p.x) * (b.y - a.y) - (a.y - p.y) * (b.x - a.x)) / d;
    const t = ((a.x - p.x) * (q.y - p.y) - (a.y - p.y) * (q.x - p.x)) / d;
    if (u >= 0 && u <= 1 && t >= 0 && t <= 1) hit = { s: path.at[i - 1] + u * (path.at[i] - path.at[i - 1]), t };
  }
  m.set(cw.key, hit);
  return hit;
}

/* Where along its crosswalk (0 at a, 1 at b) a pedestrian is. */
const tOf = (p, cw) => (p.from === 0 ? p.u / cw.width : 1 - p.u / cw.width);
/* Does this crossing pedestrian hold the point t of their crosswalk? */
export function holds(p, cw, t) {
  /* Somebody STRUCK lies where they fell: nobody drives over them. */
  if (p.state === "struck") return true;
  if (p.state !== "crossing") return false;
  const at = tOf(p, cw), mid = 0.5, stepT = STEP / cw.width;
  const half = (x) => (x < mid ? 0 : 1);
  if (half(at) === half(t)) return true;
  /* Heading over the midpoint and within a step of it. */
  const heading = p.from === 0 ? 1 : -1;
  return Math.abs(at - mid) < stepT && Math.sign(mid - at) === heading;
}

/* The nearest crosswalk ahead on this car's path that somebody holds
   where the car would cross it: `{ s }` of the band's near edge, or null. */
export function heldAhead(world, me, path) {
  const peds = world.peds;
  /* `ignorePeds` is a check's controlled comparison, never a game setting. */
  if (!peds?.length || world.ignorePeds) return null;
  const cws = crosswalksOf(world.course);
  /* Every crosswalk still ahead on this path, nearest first. */
  const ahead = [];
  for (const cw of cws) {
    if (cw.k !== (me.k ?? 0)) continue;
    const band = bandOn(path, cw);
    if (!band) continue;
    const near = band.s - (cw.to - cw.from) / 2;
    if (me.s + CAR.length / 2 > near + 0.5) continue;   // already on or past it: go on through
    ahead.push({ near, held: peds.some((p) => p.cw === cw.i && holds(p, cw, band.t)) });
  }
  if (!ahead.some((x) => x.held)) return null;
  /* NOBODY STOPS ON A CROSSWALK. With one held further on -- the exit
     crosswalk of a turn, somebody crossing where this car would come out
     -- the car waits behind the FIRST crosswalk it has not yet entered,
     not on it, as a driver is taught to. */
  ahead.sort((x, y) => x.near - y.near);
  return { s: ahead[0].near };
}

/* Could every car that would cross this pedestrian's path stop short of it? */
function safeToStep(world, cw) {
  for (const a of world.actors) {
    if ((a.k ?? 0) !== cw.k || a.crash || a.parked) continue;
    const path = world.course.at[a.k]?.layout?.paths?.[a.route];
    if (!path) continue;
    const band = bandOn(path, cw);
    if (!band) continue;
    const nose = a.s + CAR.length / 2, near = band.s - (cw.to - cw.from) / 2, far = band.s + (cw.to - cw.from) / 2;
    /* ON IT: actually over the paint. A margin here counted a car waiting
       at its own line -- 0.35 m short of the crosswalk after running its
       line by a metre and a half -- as standing on it, and people at that
       curb waited 108 s for a car that was not in their way
       (tools/measure/ped-wait-car.mjs). */
    if (nose > near && a.s - CAR.length / 2 < far) return false;
    if (nose > far) continue;
    const room = near - nose - 1;
    if ((a.v ?? 0) > 0.3 && (a.v * a.v) / (2 * COMFY) > room) return false;
  }
  return true;
}

/* One tick of everybody on foot: `{ peds, pedN }`, or null where the map
   has no crosswalk (and then nothing on the world changes). */
export function stepPeds(world) {
  const cws = crosswalksOf(world.course);
  if (!cws.length) return null;
  const t = world.t;
  let n = world.pedN ?? 0;
  const out = [];
  for (const p of world.peds ?? []) {
    const cw = cws[p.cw];
    if (p.state === "waiting") {
      out.push(safeToStep(world, cw) ? { ...p, state: "crossing", since: t } : p);
      continue;
    }
    /* STRUCK: they stay where they fell for as long as a wreck stands
       (crossing.js CRASH_CLEAR, 45 s), and then are gone. */
    if (p.state === "struck") { if (t - p.since < STRUCK_CLEAR) out.push(p); continue; }
    const u = p.u + WALK * DT;
    if (u >= cw.width) continue;   // across: gone
    out.push({ ...p, u });
  }
  for (const cw of cws) {
    const r = rng((world.seed ?? 1) * 104729 + cw.i * 7919 + (world.tick ?? 0) * 31 + 17);
    if (r() >= DT / PED_EVERY) continue;
    /* Nobody new while somebody from the same curb is still waiting. */
    const from = r() < 0.5 ? 0 : 1;
    if (out.some((p) => p.cw === cw.i && p.state === "waiting" && p.from === from)) continue;
    out.push({ id: `ped-${n}`, n, cw: cw.i, from, u: 0, state: "waiting", since: t });
    n += 1;
  }
  return { peds: out, pedN: n };
}

/* Where a pedestrian stands, for drawing and for the contact check. */
export function pedPose(world, p) {
  const cw = crosswalksOf(world.course)[p.cw];
  const t = tOf(p, cw);
  /* Waiting: half a metre back on the curb they will step off. */
  const tt = p.state === "waiting" ? (p.from === 0 ? -0.5 / cw.width : 1 + 0.5 / cw.width) : t;
  return { x: cw.a.x + (cw.b.x - cw.a.x) * tt, y: cw.a.y + (cw.b.y - cw.a.y) * tt, z: cw.a.z ?? 0, heading: (Math.atan2(cw.b.y - cw.a.y, cw.b.x - cw.a.x) * 180) / Math.PI + (p.from === 0 ? 0 : 180) };
}

/* THE PLAYER'S CAR AGAINST PEOPLE ON FOOT: the id of anybody inside its
   footprint (a car pose: x, y, heading), or null. A state the sim can
   produce has to be one the screen shows (CLAUDE.md item 6): the traffic
   yields, but nothing stopped the player driving through a person. */
export function pedAt(world, car, margin = 0.3) {
  const h = ((car.heading ?? car.rot ?? 0) * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h);
  for (const p of world.peds ?? []) {
    if (p.state === "struck") continue;
    const q = pedPose(world, p);
    const dx = q.x - car.x, dy = q.y - car.y, u = dx * c + dy * s, v = -dx * s + dy * c;
    if (Math.abs(u) < CAR.length / 2 + margin && Math.abs(v) < CAR.width / 2 + margin) return p.id;
  }
  return null;
}
/* Somebody hit: they stop where they are and stay (`stepPeds`). */
export function strikePed(world, id) {
  return { ...world, peds: (world.peds ?? []).map((p) => (p.id === id ? { ...p, state: "struck", since: world.t } : p)) };
}
