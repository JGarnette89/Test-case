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
import { lookingAway } from "./attention.js";

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
/* Does this crossing pedestrian hold the point t of their crosswalk?
   `within`: seconds the asking driver needs to be clear of that point.
   The half they are on, always (the near-half rule); and the other half
   too if they will walk into t before the driver is clear of it -- a
   fixed step here let a car that needed 2.5 s to clear the paint commit
   while she was 1.1 m from the middle, and it struck her
   (tools/measure/ped-strike.mjs). */
export function holds(p, cw, t, within = 0) {
  /* Somebody STRUCK lies where they fell: nobody drives over them. */
  if (p.state === "struck") return true;
  if (p.state !== "crossing") return false;
  const at = tOf(p, cw), mid = 0.5, stepT = STEP / cw.width;
  const half = (x) => (x < mid ? 0 : 1);
  if (half(at) === half(t)) return true;
  /* Heading over the midpoint and within a step of it. */
  const heading = p.from === 0 ? 1 : -1;
  if (Math.abs(at - mid) < stepT && Math.sign(mid - at) === heading) return true;
  /* Or heading for t, and there before the driver is clear of it. */
  if (Math.sign(t - at) !== heading) return false;
  return (Math.abs(t - at) * cw.width) / WALK < within;
}

/* The nearest crosswalk ahead on this car's path that somebody holds
   where the car would cross it: `{ s }` of the band's near edge, or null. */
export function heldAhead(world, me, path) {
  const peds = world.peds;
  /* `ignorePeds` is a check's controlled comparison, never a game setting. */
  if (!peds?.length || world.ignorePeds) return null;
  const cws = crosswalksOf(world.course);
  /* WHAT THIS DRIVER HAS SEEN (sim/attention.js). Looking away, they go on
     with the picture from when they looked away: somebody who stepped off
     since is not in it, and they do not wait for them. Only with drivers
     looking away switched on -- a driver with no lag always sees. */
  /* `pedsAlwaysSeen`: a check's controlled comparison, never a setting. */
  const away = world.pedsAlwaysSeen ? 0 : lookingAway(world.t ?? 0, me);
  const seen = (p) => !(away > 0 && p.since > (world.t ?? 0) - away);
  /* Every crosswalk still ahead on this path, nearest first. */
  const ahead = [];
  for (const cw of cws) {
    if (cw.k !== (me.k ?? 0)) continue;
    const band = bandOn(path, cw);
    if (!band) continue;
    const near = band.s - (cw.to - cw.from) / 2;
    if (me.s + CAR.length / 2 > near + 0.5) continue;   // already on or past it: go on through
    /* How long this car needs to be clear of the crossing point: to the
       band's far edge plus its own length, at its speed or, from rest, a
       walking-pace pull-away -- and a margin. */
    const far = band.s + (cw.to - cw.from) / 2;
    /* COMMITTED: a car that can no longer stop comfortably short of the
       paint does not brake for somebody still on the other half -- it would
       only arrive slower (measured: a car that slowed for its turn, began
       braking for her, could not stop, crept on and struck her). It goes
       through; the person pauses at the middle for it (`stepPeds`). */
    const canStop = ((me.v ?? 0) ** 2) / (2 * COMFY) <= near - (me.s + CAR.length / 2);
    const within = canStop ? (far + CAR.length / 2 - me.s) / Math.max(me.v ?? 0, 1.5) + 0.5 : 0;
    ahead.push({ near, held: peds.some((p) => p.cw === cw.i && seen(p) && holds(p, cw, band.t, within)) });
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
    /* A WRECK is in the way like any car on the paint -- it will not move
       -- so nobody steps off into one; skipping crashed cars had people
       walking through a car stopped on the crosswalk. */
    if ((a.k ?? 0) !== cw.k || a.parked) continue;
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
    /* A CAR ALREADY PULLING AWAY across this crosswalk goes first: stepping
       out in front of one stopped it after it had taken its gap, and when
       it went on the gap had gone -- two cars met in the exit lane
       (tools/measure/ped-miss.mjs, seed 7). People let it go. */
    if (a.going) return false;
    const room = near - nose - 1;
    if ((a.v ?? 0) > 0.3 && (a.v * a.v) / (2 * COMFY) > room) return false;
  }
  return true;
}

/* Is a car about to cross this person's far half that cannot stop for it? */
function committedAcross(world, cw, p) {
  const farHalf = p.from === 0 ? (t) => t >= 0.5 : (t) => t < 0.5;
  for (const a of world.actors) {
    if ((a.k ?? 0) !== cw.k || a.parked) continue;
    const path = world.course.at[a.k]?.layout?.paths?.[a.route];
    const band = path && bandOn(path, cw);
    if (!band || !farHalf(band.t)) continue;
    const near = band.s - (cw.to - cw.from) / 2, far = band.s + (cw.to - cw.from) / 2;
    const nose = a.s + CAR.length / 2, tail = a.s - CAR.length / 2;
    if (tail > far) continue;                                      // past it
    if (nose > near) return true;                                  // on it
    if ((a.v ?? 0) > 0.3 && ((a.v ?? 0) ** 2) / (2 * COMFY) > near - nose) return true;   // cannot stop short of it
  }
  return false;
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
    let u = p.u + WALK * DT;
    if (u >= cw.width) continue;   // across: gone
    /* PAUSING AT THE MIDDLE: about to step into the far half while a car
       that cannot stop comfortably is about to cross it there, a person
       waits at the line and lets it pass -- what anybody does. */
    const edge = cw.width / 2 - 0.3;
    if (p.u <= edge && u > edge && committedAcross(world, cw, p)) u = p.u;
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

/* THE TRAFFIC AGAINST PEOPLE ON FOOT, after each tick: anybody crossing
   inside a car's footprint is struck, and the car has crashed -- stopped
   where it is, logged, drawn (CLAUDE.md item 6: a contact nothing draws
   is a lie). It happens only when a driver did not see them: drivers who
   look away (sim/attention.js). `poseOf` is the caller's, to keep this
   module free of crossing.js. */
export function strikes(world, poseOf) {
  const out = [];
  if (!world.peds?.some((p) => p.state === "crossing")) return out;
  for (const p of world.peds) {
    if (p.state !== "crossing") continue;
    const cw = crosswalksOf(world.course)[p.cw];
    for (const a of world.actors) {
      if (a.player || a.crash || (a.k ?? 0) !== cw.k) continue;
      const c = poseOf(world, a);
      const h = ((c.rot ?? 0) * Math.PI) / 180, q = pedPose(world, p);
      const dx = q.x - c.x, dy = q.y - c.y, u = dx * Math.cos(h) + dy * Math.sin(h), v = -dx * Math.sin(h) + dy * Math.cos(h);
      if (Math.abs(u) < CAR.length / 2 + 0.3 && Math.abs(v) < CAR.width / 2 + 0.3) { out.push({ ped: p.id, car: a.id, at: { x: q.x, y: q.y, z: q.z ?? 0 } }); break; }
    }
  }
  return out;
}
