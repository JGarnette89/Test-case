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
import { DT, CAR, MOST_BRAKE, lenOf, widthOf, vehicleOf } from "./traffic.js";
import { lookingAway } from "./attention.js";
import { accelFor } from "./player.js";
import { parkingOf, parkedPoses } from "./parking.js";
import { PARK_W } from "../map/format.js";
import { REACTION_FLOOR } from "../core/perception.js";
import { segHitsBox } from "./sight.js";

/* =====================================================================
   PEOPLE WHO DO DANGEROUS THINGS (the maintainer, 29 September:
   "pedestrians should absolutely have a chance to do dangerous stuff, we
   just need to make sure the player has time to react whenever put in
   that situation. NPC cars however don't need that same level of
   fairness"). FAIRNESS IS OWED TO THE PLAYER, NOT TO THE SIMULATION:
   safe-by-construction everywhere is why inattention never cost anything.

   A person's MANNER is drawn when they appear:
     careful   steps off only when every car could stop comfortably;
     trusting  steps off whenever nothing is on the paint, trusting the
               cars to stop for them -- their right of way;
     heedless  the same, and does not wait for a car already pulling away
               either.
   Neither of the last two pauses at the middle for a car -- except the
   PLAYER's. In front of the player they step out only where a response
   exists in time: reacting at the floor and braking as hard as the car
   can, the player stops short of the paint -- the old engine's
   avoidability question (engine/outcome.js `avoidableFrom`), asked of the
   one response a driver has.

   PED_RISK is the share of each: a flagged design constant, set against a
   measured strike rate (tools/measure/ped-risk.mjs), and per world
   (`world.pedRisk`) so a check can hold an all-careful world as control. */
export const PED_RISK = { trusting: 0.15, heedless: 0.05 };
const mannerOf = (world, x) => {
  const k = world.pedRisk ?? PED_RISK;
  return x < k.heedless ? "heedless" : x < k.heedless + k.trusting ? "trusting" : "careful";
};

/* Is a car on this crosswalk's paint (or pulling away across it)? */
function onPaint(world, cw, { going = true } = {}) {
  for (const { a, near, far } of carsFor(world, cw)) {
    const nose = a.s + lenOf(a) / 2;
    if (nose > near && a.s - lenOf(a) / 2 < far) return true;
    if (going && a.going && nose <= far) return true;
  }
  return false;
}

/* Could the player still stop short of this crosswalk if somebody stepped
   onto it now? True when the player does not cross it, is past it, or is
   standing. */
export function playerCanRespond(world, cw, p = null) {
  for (const { a, near } of carsFor(world, cw)) {
    if (!a.player) continue;
    const nose = a.s + lenOf(a) / 2;
    if (nose > near) continue;                       // on it or past: onPaint's business
    const v = a.v ?? 0;
    if (v < 0.3) continue;
    /* Given what the player can perceive: a person behind a parked car is
       seen only once they are out past it, a parking strip's walk away. */
    const eye = eyeOf(world, a);
    const hidden = cw.kind === "gap" && p && eye && !inSight(world, eye, pedPose(world, p)) ? PARK_W / speedOf(p) : 0;
    const room = near - nose - v * (REACTION_FLOOR + hidden);
    if (room <= 0 || (v * v) / (2 * room) > -accelFor(-1, v)) return false;
  }
  return true;
}

export const WALK = 1.35;
/* THE APPROACH AND THE DEPARTURE (the maintainer, from testing: "they
   simply appear 10% in the road and disappear when they reach 90% of the
   way. it gives the impression cars are waiting for nobody"). A person is
   created APPROACH metres back along the line of their crossing -- on the
   pavement, beyond the drawn road -- walks to the kerb in view, waits or
   does not by their manner, crosses, and walks APPROACH metres on before
   they are gone. The approach is what a good observer notices and a poor
   one misses, and nobody decides to cross before they have been visible
   walking up to it. */
export const APPROACH = 10;
/* Somebody heedless DARTS -- a child after a ball, somebody late for the
   bus: a jog, a flagged design constant. At a walk they spent 1.8 s in
   the parking strip before reaching the lane, which handed every driver
   the warning a dart never gives. */
export const DART = 3.0;
export const speedOf = (p) => (p?.manner === "heedless" ? DART : WALK);
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
    for (const c of j.crossings ?? []) out.push({ ...c, k, key: `${c.road}|${c.end}`, i: out.length, kind: "crosswalk" });
  }
  /* MID-BLOCK CROSSING POINTS: a line across the road from the curb
     behind the parked row to the far curb, every GAP_EVERY parking slots
     on a street that has them -- where somebody crosses with no crosswalk,
     from between parked cars (the maintainer's ruling, 29 September: hiding
     is core to the game). Owned by the nearer intersection, as the traffic
     paths over that stretch are. */
  const { slots } = parkingOf(course);
  const roads = Object.fromEntries((course.map?.roads ?? []).map((r) => [r.id, r]));
  const nodeAt = new Map();
  for (const n of course.map?.nodes ?? []) for (const l of n.legs) nodeAt.set(`${l.road}|${l.end}`, n.id);
  slots.forEach((slot, j) => {
    if (j % GAP_EVERY !== 0) return;
    const rid = /^(.*):(fwd|rev)#\d+$/.exec(slot.lane)?.[1], r = roads[rid];
    if (!r) return;
    const near = alongRoad(r, slot);
    const nx = (slot.x - near.x) / (near.d || 1), ny = (slot.y - near.y) / (near.d || 1);
    const half = (r.outer ?? r.width) / 2;
    const a = { x: near.x + nx * half, y: near.y + ny * half, z: slot.z ?? 0 }, b = { x: near.x - nx * half, y: near.y - ny * half, z: slot.z ?? 0 };
    const first = near.s < r.length / 2 ? "start" : "end";
    const node = nodeAt.get(`${r.id}|${first}`) ?? nodeAt.get(`${r.id}|${first === "start" ? "end" : "start"}`);
    const k = course.at.findIndex((q) => q.node === node);
    if (k < 0) return;
    out.push({ road: r.id, kind: "gap", k, key: `gap:${slot.key}`, i: out.length, a, b, width: Math.hypot(b.x - a.x, b.y - a.y), from: -1, to: 1, slot: slot.key });
  });
  /* Each car asks only about the crossings at its own intersection. */
  out.byK = new Map();
  for (const c of out) { if (!out.byK.has(c.k)) out.byK.set(c.k, []); out.byK.get(c.k).push(c); }
  cwCache.set(course, out);
  return out;
}
/* Where along a road a point is: the nearest point on its centre line,
   how far along the road that is, and how far away the point was. */
function alongRoad(r, p) {
  let best = null;
  for (let i = 0; i + 1 < r.pts.length; i++) {
    const a = r.pts[i], b = r.pts[i + 1], L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const f = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2)) : 0;
    const q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || d < best.d) best = { ...q, d, s: (r.at?.[i] ?? 0) + f * Math.sqrt(L2) };
  }
  return best;
}
/* Mid-block crossing points: one every this many parking slots (6.5 m
   each, so about every 40 m of curb). */
const GAP_EVERY = 6;
/* HOW OFTEN SOMEBODY CROSSES MID-BLOCK: per kilometre of parked curb per
   hour, and the share of them who step out without looking. Flagged
   design constants, set against the strike rate a person watching the
   city would see (tools/measure/ped-risk.mjs); per world (`world.gapRate`,
   `world.gapHeedless`) for checks. */
export const GAP_RATE = 30, GAP_HEEDLESS = 0.1;

/* CAN THIS DRIVER SEE THIS PERSON: the line from the driver's eye (the
   front of their car) to them clears every parked car and wreck near them,
   footprints in plan. A parked car hides a person standing behind it --
   the default until the maintainer rules on heights. */
export function inSight(world, eye, q) {
  /* Only what could lie between: parked cars from a grid built once per
     parking state, and wrecks where they stand. */
  const reach = Math.hypot(eye.x - q.x, eye.y - q.y) / 2 + 5, mid = { x: (eye.x + q.x) / 2, y: (eye.y + q.y) / 2 };
  for (const b of parkedNear(world, mid, reach)) if (segHitsBox(eye, q, b, 4.5, 1.8)) return false;
  for (const a of world.actors) if (a.crash?.at && Math.hypot(a.crash.at.x - mid.x, a.crash.at.y - mid.y) < reach && segHitsBox(eye, q, { ...a.crash.at, heading: 0 }, 3.5, 3.5)) return false;
  /* ...and a truck, standing or moving (sim/sight.js): somebody stepping
     out from in front of one is not there for a driver until they are past
     it -- nor for the player, whose fairness counts the hidden time. */
  for (const b of world.tall ?? []) if (Math.hypot(b.x - mid.x, b.y - mid.y) < reach + b.l / 2 && segHitsBox(eye, q, b)) return false;
  return true;
}
const CELL = 25;
const gridCache = new WeakMap();
function parkedNear(world, p, r) {
  if (!world.parked) return [];
  let g = gridCache.get(world.parked);
  if (!g) {
    g = new Map();
    for (const c of parkedPoses(world.course, world.parked)) {
      const k = `${Math.floor(c.x / CELL)},${Math.floor(c.y / CELL)}`;
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(c);
    }
    gridCache.set(world.parked, g);
  }
  const out = [], x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL), y0 = Math.floor((p.y - r) / CELL), y1 = Math.floor((p.y + r) / CELL);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (const c of g.get(`${x},${y}`) ?? []) out.push(c);
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

/* EVERY CROSSING AHEAD OF A CAR, in its own path's coordinates: those at
   its own intersection, and those just past the seam on the road it is
   leaving by, which belong to the next intersection. Looking only at the
   first missed a car 0.25 s from a mid-block crossing that lay just past
   the seam: counted at the previous intersection, neither the person
   judging whether to step off nor the driver judging whether to stop saw
   the other coming, and it struck her (tools/measure/gap-strike.mjs).
   Cached per path. Each entry: { cw, s, t }. */
const aheadCache = new WeakMap();
export function bandsAhead(world, k, path) {
  let hit = aheadCache.get(path);
  if (hit) return hit;
  const cws = crosswalksOf(world.course), out = [];
  for (const cw of cws.byK?.get(k) ?? []) { const b = bandOn(path, cw); if (b) out.push({ cw, s: b.s, t: b.t }); }
  const L = world.course.at[k]?.layout, lane = L?.legs[path.to]?.outLane;
  if (lane) {
    world.course.at.forEach((spot, k2) => {
      if (k2 === k || spot.through) return;
      const leg = Object.values(spot.layout.legs).find((l) => l.inLane === lane);
      if (!leg) return;
      const next = Object.values(spot.layout.paths).find((q) => q.from === leg.id);
      if (!next) return;
      for (const cw of cws.byK?.get(k2) ?? []) {
        if (cw.kind !== "gap") continue;
        const b = bandOn(next, cw);
        if (b && b.s < next.stopAt) out.push({ cw, s: path.length + b.s, t: b.t });
      }
    });
  }
  aheadCache.set(path, out);
  return out;
}
/* Every car that will cross this crossing, and where it is relative to it:
   { a, near, far, t } in the car's own path coordinates. */
function carsFor(world, cw) {
  const out = [];
  for (const a of world.actors) {
    if (a.parked) continue;
    const path = world.course.at[a.k ?? 0]?.layout?.paths?.[a.route];
    if (!path) continue;
    const e = bandsAhead(world, a.k ?? 0, path).find((x) => x.cw === cw);
    if (!e) continue;
    const half = (cw.to - cw.from) / 2;
    out.push({ a, near: e.s - half, far: e.s + half, t: e.t, path });
  }
  return out;
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
  /* WHATEVER THE HALF RULE ALLOWS, NOBODY DRIVES THROUGH A PERSON: within
     half a lane and half a metre of the car's own line they are in its
     way, on either side of the middle -- an inner-lane car's edge runs a
     metre from the centre line. */
  if (Math.abs(at - t) * cw.width < 1.8 + 0.5) return true;
  /* Heading over the midpoint and within a step of it. */
  const heading = p.from === 0 ? 1 : -1;
  if (Math.abs(at - mid) < stepT && Math.sign(mid - at) === heading) return true;
  /* Or heading for t, and there before the driver is clear of it. */
  if (Math.sign(t - at) !== heading) return false;
  return (Math.abs(t - at) * cw.width) / speedOf(p) < within;
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
  const eye = world.course.graph ? eyeOf(world, me) : null;
  for (const { cw, s: bandS, t: bandT } of bandsAhead(world, me.k ?? 0, path)) {
    const band = { s: bandS, t: bandT };
    const near = band.s - (cw.to - cw.from) / 2;
    const farEdge = band.s + (cw.to - cw.from) / 2;
    if (me.s + lenOf(me) / 2 > near + 0.5) {
      /* ALREADY ON IT: go on through -- unless somebody is in the car's own
         path in front of it, whom it stops for where it is. Driving on
         because the paint had been reached put a queued car that crept
         forward into a careful person stepping out beside it. */
      if (me.s - lenOf(me) / 2 < farEdge && peds.some((p) => p.cw === cw.i && (p.state === "crossing" || p.state === "struck") && seen(p) && Math.abs(tOf(p, cw) - band.t) * cw.width < 1.8 + 0.3 && (cw.kind !== "gap" || !eye || world.pedsAlwaysSeen || inSight(world, eye, pedPose(world, p))))) {
        ahead.push({ near: me.s + lenOf(me) / 2 + 0.3, held: true });
      }
      continue;
    }
    /* How long this car needs to be clear of the crossing point: to the
       band's far edge plus its own length, at its speed or, from rest, a
       walking-pace pull-away -- and a margin. */
    const far = band.s + (cw.to - cw.from) / 2;
    /* COMMITTED: a car that can no longer stop comfortably short of the
       paint does not brake for somebody still on the other half -- it would
       only arrive slower (measured: a car that slowed for its turn, began
       braking for her, could not stop, crept on and struck her). It goes
       through; the person pauses at the middle for it (`stepPeds`). */
    const canStop = ((me.v ?? 0) ** 2) / (2 * COMFY) <= near - (me.s + lenOf(me) / 2);
    const clearIn = (far + lenOf(me) / 2 - me.s) / Math.max(me.v ?? 0, 1.5) + 0.5;
    const within = canStop ? clearIn : 0;
    /* BUT SOMEBODY RUNNING WILL NOT PAUSE. The committed car goes on because
       the person pauses at the middle for it -- and a person seen running
       across plainly is not going to. A driver who can see that brakes as
       hard as the car can, if that still stops them short (measured, the
       default city: an attentive car drove on into somebody darting across
       it had been able to see for most of a second, and braked 9 m out). */
    const hardStop = ((me.v ?? 0) ** 2) / (2 * vehicleOf(me).most) <= near - (me.s + lenOf(me) / 2);
    const withinFor = (p) => (speedOf(p) > WALK && hardStop ? clearIn : within);
    /* Only somebody the driver can SEE: a person behind a parked car is not
       there for them until they step out past it (mid-block crossings). */
    ahead.push({ near, held: peds.some((p) => p.cw === cw.i && seen(p) && holds(p, cw, band.t, withinFor(p)) && (cw.kind !== "gap" || !eye || world.pedsAlwaysSeen || inSight(world, eye, pedPose(world, p)))) });
  }
  if (!ahead.some((x) => x.held)) return null;
  /* NOBODY STOPS ON A CROSSWALK. With one held further on -- the exit
     crosswalk of a turn, somebody crossing where this car would come out
     -- the car waits behind the FIRST crosswalk it has not yet entered,
     not on it, as a driver is taught to. */
  ahead.sort((x, y) => x.near - y.near);
  return { s: ahead[0].near };
}

/* A driver's eye: the front of their car, near enough. */
function eyeOf(world, me) {
  const path = world.course.at[me.k ?? 0]?.layout?.paths?.[me.route];
  if (!path) return null;
  const s = Math.min(path.length, (me.s ?? 0) + 1.5);
  let i = 0; while (i < path.at.length - 2 && path.at[i + 1] < s) i++;
  const f = Math.max(0, Math.min(1, (s - path.at[i]) / Math.max(1e-9, path.at[i + 1] - path.at[i])));
  const p = path.pts[i], q = path.pts[i + 1];
  return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f };
}

/* Could every car that would cross this pedestrian's path stop short of it? */
function safeToStep(world, cw, from = 0) {
  /* A WRECK is in the way like any car on the paint -- it will not move --
     so nobody steps off into one; skipping crashed cars had people walking
     through a car stopped on the crosswalk. */
  for (const { a, near, far } of carsFor(world, cw)) {
    const nose = a.s + lenOf(a) / 2;
    /* ON IT: actually over the paint. A margin here counted a car waiting
       at its own line -- 0.35 m short of the crosswalk after running its
       line by a metre and a half -- as standing on it, and people at that
       curb waited 108 s for a car that was not in their way
       (tools/measure/ped-wait-car.mjs). */
    /* On the paint -- or standing with its nose at it, about to move: a
       careful person does not step out right beside it. */
    if (nose > near - 1 && a.s - lenOf(a) / 2 < far) return false;
    if (nose > far) continue;
    /* FROM BEHIND A PARKED CAR the driver will not see them until they are
       out past it, a parking strip's walk away: a careful person allows for
       that, or they step out "with room" a driver cannot use. */
    /* ...AND FROM BEHIND A TRUCK (sim/sight.js), on any crossing: walked
       from this person's curb until the driver could first see them, at a
       walk -- a parking strip's width behind a parked car, a lane's behind
       a truck in the near lane. A fixed parking-strip allowance let a
       careful person step out from in front of a truck into a car that
       could not see them (30 September). */
    const eye = cw.kind === "gap" || world.tall?.length ? eyeOf(world, a) : null;
    let hidden = 0;
    if (eye) {
      const at = (d) => { const t = from === 0 ? d / cw.width : 1 - d / cw.width; return { x: cw.a.x + (cw.b.x - cw.a.x) * t, y: cw.a.y + (cw.b.y - cw.a.y) * t }; };
      let d = 0;
      while (d < cw.width && !inSight(world, eye, at(d))) d += 0.6;
      hidden = Math.min(d, cw.width) / WALK;
    }
    /* A CAR ALREADY PULLING AWAY across this crosswalk goes first: stepping
       out in front of one stopped it after it had taken its gap, and when
       it went on the gap had gone -- two cars met in the exit lane
       (tools/measure/ped-miss.mjs, seed 7). People let it go. */
    if (a.going) return false;
    const room = near - nose - 1 - (a.v ?? 0) * hidden;
    if ((a.v ?? 0) > 0.3 && (a.v * a.v) / (2 * COMFY) > room) return false;
  }
  return true;
}

/* Is a car about to cross this person's far half that cannot stop for it? */
function committedAcross(world, cw, p, { onlyPlayer = false } = {}) {
  const farHalf = p.from === 0 ? (t) => t >= 0.5 : (t) => t < 0.5;
  for (const { a, near, far, t: bt } of carsFor(world, cw)) {
    if (onlyPlayer && !a.player) continue;
    if (!farHalf(bt)) continue;
    const nose = a.s + lenOf(a) / 2, tail = a.s - lenOf(a) / 2;
    if (tail > far) continue;                                      // past it
    /* On it -- unless it has STOPPED there for them. A car that halted with
       its nose on the paint because this person was in its way is waiting
       for them, and they were waiting for it: measured (29 September, the
       walked crossroads), a person paused at the middle for a right-turner
       standing on the paint, the car stood for her, and the crossing
       locked for the rest of the run. A wreck is not waiting for anybody. */
    if (nose > near) return a.crash || a.going || (a.v ?? 0) > 0.3;
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
  let across = world.pedsAcross ?? 0;
  for (let p of world.peds ?? []) {
    const cw = cws[p.cw];
    /* Walking up to the kerb; at it, waiting -- and a heedless person
       decides on the spot, in the same tick, without stopping. */
    if (p.state === "approaching") {
      const u = p.u + speedOf(p) * DT;
      if (u < -0.5) { out.push({ ...p, u }); continue; }
      p = { ...p, u: -0.5, state: "waiting", since: t };
    }
    /* Across: walking on, off the road, and then gone. */
    if (p.state === "leaving") {
      const u = p.u + speedOf(p) * DT;
      if (u < cw.width + APPROACH) out.push({ ...p, u });
      continue;
    }
    if (p.state === "waiting") {
      const go = p.manner === "trusting" ? !onPaint(world, cw) && playerCanRespond(world, cw, p)
        : p.manner === "heedless" ? !onPaint(world, cw, { going: false }) && playerCanRespond(world, cw, p)
        : safeToStep(world, cw, p.from);
      out.push(go ? { ...p, u: 0, state: "crossing", since: t } : p);
      continue;
    }
    /* STRUCK: they stay where they fell for as long as a wreck stands
       (crossing.js CRASH_CLEAR, 45 s), and then are gone. */
    if (p.state === "struck") { if (t - p.since < STRUCK_CLEAR) out.push(p); continue; }
    let u = p.u + speedOf(p) * DT;
    if (u >= cw.width) { across += 1; out.push({ ...p, u, state: "leaving", since: t }); continue; }
    /* PAUSING AT THE MIDDLE: about to step into the far half while a car
       that cannot stop comfortably is about to cross it there, a person
       waits at the line and lets it pass -- what anybody does. */
    const edge = cw.width / 2 - 0.3;
    if (p.u <= edge && u > edge && committedAcross(world, cw, p, { onlyPlayer: p.manner && p.manner !== "careful" })) u = p.u;
    /* AND A CAREFUL PERSON KEEPS WATCHING, lane by lane: they do not step
       into the lane of a car that cannot stop comfortably short of them,
       whatever it looked like from the curb. A moving truck that comes
       between them and a car after they have stepped off hides them from
       it until it is too late to stop (30 September, the Pedestrians map:
       a careful person struck at 8.8 m by a car that had just come out
       from behind a truck). */
    if ((!p.manner || p.manner === "careful") && u !== p.u) {
      for (const { a, near, far, t } of carsFor(world, cw)) {
        if (a.crash || a.parked) continue;
        const uc = p.from === 0 ? t * cw.width : (1 - t) * cw.width;
        /* They wait just outside the strip a driver on the paint holds for
           somebody in front of them (1.8 + 0.3 m either side of its line),
           so a car that is on it goes on past rather than waiting for them
           while they wait for it. */
        const laneEdge = uc - (1.8 + 0.3 + 0.2);
        if (!(p.u <= laneEdge && u > laneEdge)) continue;
        const nose = a.s + lenOf(a) / 2, tail = a.s - (a.rear ?? lenOf(a) / 2);
        if (tail > far) continue;                                   // past
        const onIt = nose > near - 0.5;                             // at or over the paint: let it go by
        const cannotStop = (a.v ?? 0) > 0.3 && ((a.v ?? 0) ** 2) / (2 * COMFY) > near - nose - 1;
        if (onIt || cannotStop) { u = p.u; break; }
      }
    }
    out.push({ ...p, u });
  }
  /* MID-BLOCK: by the kilometre of parked curb, a person at a random gap,
     careful or -- GAP_HEEDLESS of them -- stepping out without looking. */
  const gaps = cws.gaps ?? (cws.gaps = cws.filter((c) => c.kind === "gap"));
  if (gaps.length) {
    const r = rng((world.seed ?? 1) * 15485863 + (world.tick ?? 0) * 7 + 3);
    const km = (gaps.length * GAP_EVERY * 6.5) / 1000;
    if (r() < (DT * (world.gapRate ?? GAP_RATE) * km) / 3600) {
      const cw = gaps[Math.floor(r() * gaps.length) % gaps.length];
      if (!out.some((q) => q.cw === cw.i)) {
        out.push({ id: `ped-${n}`, n, cw: cw.i, from: 0, u: -APPROACH, state: "approaching", since: t, manner: r() < (world.gapHeedless ?? GAP_HEEDLESS) ? "heedless" : "careful" });
        n += 1;
      }
    }
  }
  for (const cw of cws) {
    if (cw.kind === "gap") continue;
    const r = rng((world.seed ?? 1) * 104729 + cw.i * 7919 + (world.tick ?? 0) * 31 + 17);
    if (r() >= DT / PED_EVERY) continue;
    /* Nobody new while somebody from the same curb is still waiting. */
    const from = r() < 0.5 ? 0 : 1;
    if (out.some((p) => p.cw === cw.i && (p.state === "waiting" || p.state === "approaching") && p.from === from)) continue;
    out.push({ id: `ped-${n}`, n, cw: cw.i, from, u: -APPROACH, state: "approaching", since: t, manner: mannerOf(world, r()) });
    n += 1;
  }
  return { peds: out, pedN: n, pedsAcross: across };
}

/* Where a pedestrian stands, for drawing and for the contact check. */
export function pedPose(world, p) {
  const cw = crosswalksOf(world.course)[p.cw];
  const t = tOf(p, cw);
  /* Waiting: half a metre back on the curb they will step off. */
  const tt = t;   // u runs from -APPROACH (on the pavement) to width + APPROACH, so one rule places them all
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
    if (Math.abs(u) < (car.length ?? CAR.length) / 2 + margin && Math.abs(v) < (car.width ?? CAR.width) / 2 + margin) return p.id;
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
      /* Any car near them -- whichever intersection it is counted at, since
         a crossing just past a seam is reached from the one before. */
      if (a.player || a.crash) continue;
      const c = poseOf(world, a);
      if (Math.abs(c.x - (cw.a.x + cw.b.x) / 2) > 30 || Math.abs(c.y - (cw.a.y + cw.b.y) / 2) > 30) continue;
      const h = ((c.rot ?? 0) * Math.PI) / 180, q = pedPose(world, p);
      const dx = q.x - c.x, dy = q.y - c.y, u = dx * Math.cos(h) + dy * Math.sin(h), v = -dx * Math.sin(h) + dy * Math.cos(h);
      if (Math.abs(u) < lenOf(a) / 2 + 0.3 && Math.abs(v) < widthOf(a) / 2 + 0.3) { out.push({ ped: p.id, car: a.id, at: { x: q.x, y: q.y, z: q.z ?? 0 } }); break; }
    }
  }
  return out;
}
