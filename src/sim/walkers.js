/* =====================================================================
   PEOPLE WALKING (SIMULATOR.md, "Ambient pedestrians: the plan", step 2).
   Not the people who cross (peds.js): people on the sidewalks, walking
   along, coming out of a building and going into another, stopping a
   while. Most of them never step off the curb, and that is the point:
   the maintainer's, that a street where the only person on foot is the
   one about to cross is a diorama, and a street full of people walking
   is what makes the one who crosses a surprise.

   They are cheap on purpose: a walker is a sidewalk, a distance along it,
   a direction and a speed, stepped with no traffic questions at all.
   Nothing here reads a car and no car reads a walker -- they are never
   on the road (step 3 is where one becomes a crosser, through peds.js).

   Where they come from and go to. A building's DOOR is the point on its
   nearest sidewalk facing it, and a short front walk joins the two; a
   walker comes out along it, walks, and after a while goes in at a door
   it passes. Where a road leaves the map, its sidewalks do too, and
   people walk on and off there. Never created or ended in the open --
   the same rule as the crossers (peds.js, "seen coming and going") --
   except at t = 0, before anybody is looking.

   Their own random stream (the world's seed, salted), so the traffic
   draws exactly what it drew before they existed.

   Pure. No React, no DOM.
   ===================================================================== */
import { rng } from "../core/rng.js";
import { DT } from "./traffic.js";
import { sidewalksOf, SIDEWALK_W } from "../map/sidewalks.js";
import { alightAt } from "./buses.js";
import { LANE } from "../map/format.js";

/* PEOPLE AT A BUS STOP (SIMULATOR.md, "3. Bus stops", slice B). Somebody
   walking past a stop waits there now and then -- WAIT_SHARE of those who
   pass, while fewer than WAIT_MAX are already waiting -- in a queue along
   the sidewalk behind the post, and gives up after WAIT_PATIENCE with no
   bus. Flagged tunables. When a bus stands at the stop they get on once
   the people getting off have (buses.js `alightAt`), walking to its door;
   the people getting off step down there and walk away. */
export const WAIT_SHARE = 0.3, WAIT_MAX = 8, WAIT_PATIENCE = 420;
const QUEUE = 0.9;   // metres between people queueing
const BUS_W = 2.6;   // a bus's width (traffic.js VEHICLES.bus): where its side stands

/* PEOPLE PER KILOMETRE OF SIDEWALK, by the district it runs through --
   more where there are shops. A flagged tunable: chosen to look like a
   street with people on it, not measured from anywhere. */
export const WALKERS_PER_KM = { residential: 4, commercial: 12, industrial: 1.5, park: 3, none: 2 };
/* An ordinary walking pace and its spread across people. */
export const STROLL = 1.3, STROLL_SPREAD = 0.25;
/* How often somebody stops a while -- once in this many seconds of
   walking, on average -- and for how long. Tunable. */
const STAND_EVERY = 120, STAND_MIN = 4, STAND_MAX = 30;
/* How far a walker goes before looking for a door to go in at. */
const WALK_MIN = 150, WALK_MAX = 1200;
/* Two sidewalk ends this close are one walk: the corner where two roads'
   sidewalks meet (about 1.3 m apart at a right angle, more at a sharp one). */
const JOIN = 4;
/* Keeping to one side of the sidewalk, so two people passing do not walk
   through each other. */
const KEEP = Math.min(0.45, SIDEWALK_W / 2 - 0.3);
/* SOMEBODY TO CROSS is somebody walking this close to the curb it is
   wanted from (peds.js): near enough that turning to it is what they were
   doing anyway. */
export const WANT_NEAR = 12;
/* Stepping back onto a sidewalk from a crossing: this long to settle onto
   their side of it, so nobody jumps. */
const SETTLE = 0.6;

const nets = new WeakMap();

const inPoly = (poly, p) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

/* A point `s` metres along a sidewalk, and its heading. */
function along(w, s) {
  const c = Math.max(0, Math.min(w.length, s));
  let i = 0;
  while (i + 2 < w.pts.length && w.at[i + 1] < c) i++;
  const a = w.pts[i], b = w.pts[i + 1];
  const f = (c - w.at[i]) / Math.max(1e-6, w.at[i + 1] - w.at[i]);
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * f, h: Math.atan2(b.y - a.y, b.x - a.x) };
}

/* The walking network of a loaded map, once: its sidewalks, which ends
   join which, which ends leave the map, and the doors. */
export function walkNetOf(loaded) {
  if (!loaded) return null;
  if (nets.has(loaded)) return nets.get(loaded);
  const walks = sidewalksOf(loaded);
  const endPt = (w, e) => w.pts[e === 0 ? 0 : w.pts.length - 1];
  const joins = walks.map(() => [[], []]);
  for (let i = 0; i < walks.length; i++) for (const e of [0, 1]) {
    const p = endPt(walks[i], e);
    for (let j = 0; j < walks.length; j++) for (const f of [0, 1]) {
      if (i === j && e === f) continue;
      const q = endPt(walks[j], f);
      if (Math.hypot(p.x - q.x, p.y - q.y) < JOIN && Math.abs((p.z ?? 0) - (q.z ?? 0)) < 0.5) joins[i][e].push({ w: j, end: f });
    }
  }
  /* An end beside a road end that joins nothing: people walk on and off the map there. */
  const roads = Object.fromEntries(loaded.roads.map((r) => [r.id, r]));
  const edge = walks.map((w) => [0, 1].map((e) => {
    const r = roads[w.road];
    if (!r?.edge) return false;
    const p = endPt(w, e), reach = (r.outer ?? r.width) / 2 + SIDEWALK_W + 1;
    return (r.edge.start && Math.hypot(p.x - r.pts[0].x, p.y - r.pts[0].y) < reach) || (r.edge.end && Math.hypot(p.x - r.pts[r.pts.length - 1].x, p.y - r.pts[r.pts.length - 1].y) < reach);
  }));
  /* Doors: each building's nearest sidewalk, if it faces one, and the
     front walk from there to the building's face. */
  const doors = [];
  for (const b of loaded.props ?? []) {
    const l = b.l ?? 12, wd = b.w ?? 9, h = ((b.heading ?? 0) * Math.PI) / 180;
    let best = null;
    for (let i = 0; i < walks.length; i++) {
      const w = walks[i];
      for (let k = 0; k + 1 < w.pts.length; k++) {
        const a = w.pts[k], c = w.pts[k + 1], dx = c.x - a.x, dy = c.y - a.y, L2 = dx * dx + dy * dy || 1;
        const f = Math.max(0, Math.min(1, ((b.at.x - a.x) * dx + (b.at.y - a.y) * dy) / L2));
        const x = a.x + dx * f, y = a.y + dy * f, d = Math.hypot(b.at.x - x, b.at.y - y);
        if (!best || d < best.d) best = { d, w: i, s: w.at[k] + f * Math.sqrt(L2), x, y, z: (a.z ?? 0) };
      }
    }
    if (!best || best.d > Math.max(l, wd) / 2 + 20) continue;
    /* Where the line from the building's centre to that point leaves the footprint. */
    const ux = (best.x - b.at.x) / best.d, uy = (best.y - b.at.y) / best.d;
    const lu = Math.abs(ux * Math.cos(h) + uy * Math.sin(h)), lv = Math.abs(-ux * Math.sin(h) + uy * Math.cos(h));
    const out = Math.min(lu > 1e-6 ? l / 2 / lu : Infinity, lv > 1e-6 ? wd / 2 / lv : Infinity);
    if (!(out < best.d - SIDEWALK_W / 2)) continue;
    doors.push({ w: best.w, s: best.s, face: { x: b.at.x + ux * out, y: b.at.y + uy * out, z: best.z }, walk: { x: best.x, y: best.y, z: best.z } });
  }
  const byWalk = walks.map(() => []);
  doors.forEach((d, i) => byWalk[d.w].push(i));
  /* How many people a sidewalk carries: its length at its district's density. */
  const zoneOf = (p) => (loaded.zones ?? []).find((z) => inPoly(z.polygon, p))?.kind ?? "none";
  const weight = walks.map((w) => (w.length / 1000) * (WALKERS_PER_KM[zoneOf(along(w, w.length / 2))] ?? WALKERS_PER_KM.none));
  /* BUS STOPS on the sidewalk: where the post is along its sidewalk, and
     the DOOR -- the curb stepped out to where the side of a bus standing in
     the curb lane is, past the parking strip where the road has one. */
  const stops = [];
  for (const st of loaded.stops ?? []) {
    const near = nearestWalk({ walks }, st.at);
    if (!near) continue;
    const w = walks[near.w], r = roads[st.road];
    const k = Math.max(0, Math.min(w.pts.length - 2, w.at.findIndex((a, i) => i + 1 < w.at.length && w.at[i + 1] >= near.s)));
    const f = (near.s - w.at[k]) / Math.max(1e-6, w.at[k + 1] - w.at[k]);
    const lerp = (A) => ({ x: A[k].x + (A[k + 1].x - A[k].x) * f, y: A[k].y + (A[k + 1].y - A[k].y) * f, z: A[k].z ?? 0 });
    const inner = lerp(w.inner), mid = lerp(w.pts);
    const ux = inner.x - mid.x, uy = inner.y - mid.y, ul = Math.hypot(ux, uy) || 1;
    const out = ((r?.outer ?? r?.width ?? 0) - (r?.width ?? 0)) / 2 + Math.max(0.3, (LANE - BUS_W) / 2);
    stops.push({ id: st.id, w: near.w, s: near.s, door: { x: inner.x + (ux / ul) * out, y: inner.y + (uy / ul) * out, z: inner.z }, spot: mid });
  }
  const net = { walks, joins, edge, doors, byWalk, weight, stops, people: Math.round(weight.reduce((a, b) => a + b, 0)) };
  nets.set(loaded, net);
  return net;
}

function pick(r, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) <= 0) return i;
  return weights.length - 1;
}

const person = (r, n, rest) => ({ id: `w${n}`, n, v: STROLL * (1 - STROLL_SPREAD + 2 * STROLL_SPREAD * r()), left: WALK_MIN + (WALK_MAX - WALK_MIN) * r(), ...rest });

/* Somebody new, where people come from once anybody is looking: out of a
   door, or onto the map where a sidewalk leaves it. Null if the map has
   neither -- then its people are all there from the start and stay. */
function arrival(net, r, n) {
  const ends = [];
  net.edge.forEach((e, w) => e.forEach((on, end) => on && ends.push({ w, end })));
  if (!net.doors.length && !ends.length) return null;
  if (net.doors.length && (!ends.length || r() < 0.8)) {
    const i = Math.floor(r() * net.doors.length), d = net.doors[i];
    return person(r, n, { state: "out", door: i, u: 1, w: d.w, s: d.s, dir: r() < 0.5 ? 1 : -1 });
  }
  const e = ends[Math.floor(r() * ends.length)];
  return person(r, n, { state: "walking", w: e.w, s: e.end === 0 ? 0 : net.walks[e.w].length, dir: e.end === 0 ? 1 : -1 });
}

/* The people on a map at t = 0, spread over its sidewalks by density. */
export function seedWalkers(loaded, seed = 1) {
  const net = walkNetOf(loaded);
  if (!net?.walks.length || !net.people) return null;
  const r = rng((seed * 7919 + 104729) >>> 0);
  const walkers = [];
  for (let n = 0; n < net.people; n++) {
    const w = pick(r, net.weight);
    walkers.push(person(r, n, { state: "walking", w, s: r() * net.walks[w].length, dir: r() < 0.5 ? 1 : -1 }));
  }
  return { walkers, walkerN: net.people, walkRng: r() * 4294967296 >>> 0 };
}

/* One tick for everybody on foot along the sidewalks. Returns the new
   `{ walkers, walkerN, walkRng }`. */
export function stepWalkers(world) {
  const net = walkNetOf(world.course?.map);
  if (!net || !world.walkers) return null;
  const r = rng(world.walkRng);
  const t = world.t;
  let n = world.walkerN;
  const out = [];
  /* Whoever turned to cross this tick is a crosser now (peds.js); whoever
     reached the far sidewalk walks on from where they are. */
  const taken = new Set(world.walkersTaken ?? []);
  const walkers = world.walkers.filter((p) => !taken.has(p.id));
  for (const c of world.walkersFreed ?? []) {
    const at = c.pose, near = nearestWalk(net, at);
    if (!near) continue;
    walkers.push(person(r, n++, { id: `w${n - 1}`, look: c.look ?? c.n, state: "walking", w: near.w, s: near.s, dir: r() < 0.5 ? 1 : -1, blend: { x: at.x, y: at.y, t } }));
  }
  const here = (p) => { const q = walkerPose(world, p); return { x: q.x, y: q.y, t }; };
  const stopById = new Map(net.stops.map((q) => [q.id, q]));
  const stopsOn = new Map();
  for (const q of net.stops) { if (!stopsOn.has(q.w)) stopsOn.set(q.w, []); stopsOn.get(q.w).push(q); }
  /* The bus standing at a stop with its doors open, if one is. */
  const busAt = (id) => (world.actors ?? []).find((a) => a.kind === "bus" && a.dwellFrom != null && a.busStop?.id === id) ?? null;
  for (let p of walkers) {
    if (p.state === "standing") { out.push(t >= p.until ? { ...p, state: "walking" } : p); continue; }
    /* WAITING FOR A BUS: on when one stands here and its people are off;
       walking on if none comes. */
    if (p.state === "waiting") {
      const bus = busAt(p.stop);
      if (bus && t >= alightAt(bus.dwellFrom, bus.alighting ?? 0)) {
        const st = stopById.get(p.stop), from = walkerPose(world, p);
        out.push({ ...p, state: "boarding", from: { x: from.x, y: from.y, z: from.z }, to: st.door, u: 0 });
      } else if (t - p.since > WAIT_PATIENCE) out.push({ ...p, state: "walking", stop: undefined, blend: here(p) });
      else out.push(p);
      continue;
    }
    if (p.state === "boarding" || p.state === "alighting" || p.state === "returning") {
      const len = Math.max(0.3, Math.hypot(p.to.x - p.from.x, p.to.y - p.from.y)), u = p.u + (p.v * DT) / len;
      if (p.state === "boarding") {
        /* The bus left without them: they walk back to their place in the
           queue, at their own pace (eased in 0.6 s it was 10 m/s). */
        if (!busAt(p.stop)) {
          const at = walkerPose(world, p), spot = walkerPose(world, { ...p, state: "waiting", blend: undefined });
          out.push({ ...p, state: "returning", from: { x: at.x, y: at.y, z: at.z }, to: { x: spot.x, y: spot.y, z: spot.z }, u: 0, blend: undefined });
          continue;
        }
        if (u >= 1) continue;   // aboard
        out.push({ ...p, u });
        continue;
      }
      if (p.state === "returning") { out.push(u >= 1 ? { ...p, state: "waiting", since: t, u: undefined } : { ...p, u }); continue; }
      if (u >= 1) { out.push({ ...p, state: "walking", u: undefined, blend: here(p) }); continue; }
      out.push({ ...p, u });
      continue;
    }
    if (p.state === "out" || p.state === "in") {
      const d = net.doors[p.door], len = Math.max(0.5, Math.hypot(d.face.x - d.walk.x, d.face.y - d.walk.y));
      /* `u` is how far along the front walk from the sidewalk (0) to the door (1). */
      const u = p.u + ((p.state === "in" ? 1 : -1) * p.v * DT) / len;
      if (p.state === "in" && u >= 1) continue;   // gone in
      if (p.state === "out" && u <= 0) { out.push({ ...p, state: "walking", u: undefined, blend: here(p) }); continue; }
      out.push({ ...p, u });
      continue;
    }
    const w = net.walks[p.w];
    const step = p.v * DT;
    let s = p.s + p.dir * step;
    const left = p.left - step;
    /* Going in, at a door being passed once the walk is done. */
    if (left <= 0) {
      const door = net.byWalk[p.w].find((i) => (net.doors[i].s - p.s) * p.dir >= 0 && (net.doors[i].s - s) * p.dir <= 0);
      if (door != null) { out.push({ ...p, s: net.doors[door].s, state: "in", door, u: 0, left }); continue; }
    }
    /* Passing a stop: now and then, waiting for the bus there. */
    const st = stopsOn.get(p.w)?.find((q) => (q.s - p.s) * p.dir >= 0 && (q.s - s) * p.dir < 0);
    if (st && !p.stop && r() < WAIT_SHARE) {
      const queueing = (q) => q.stop === st.id && (q.state === "waiting" || q.state === "returning");
      const queued = walkers.filter(queueing).length + out.filter(queueing).length;
      if (queued < WAIT_MAX) {
        const w = net.walks[p.w], at = Math.max(0, Math.min(w.length, st.s - QUEUE * (queued + 1)));
        /* They walk to their place in the queue (eased, it was a 6 m slide). */
        const from = walkerPose(world, p), spot = walkerPose(world, { ...p, s: at, state: "waiting", blend: undefined });
        out.push({ ...p, s: at, left, state: "returning", stop: st.id, since: t, from: { x: from.x, y: from.y, z: from.z }, to: { x: spot.x, y: spot.y, z: spot.z }, u: 0, blend: undefined });
        continue;
      }
    }
    if (r() < DT / STAND_EVERY) { out.push({ ...p, s, left, state: "standing", until: t + STAND_MIN + (STAND_MAX - STAND_MIN) * r() }); continue; }
    if (s < 0 || s > w.length) {
      const end = s < 0 ? 0 : 1;
      const on = net.joins[p.w][end];
      if (net.edge[p.w][end] && (left <= 0 || !on.length)) continue;   // walked off the map
      if (on.length) {
        const j = on[Math.floor(r() * on.length)];
        const over = s < 0 ? -s : s - w.length;
        const nw = net.walks[j.w];
        /* Round the corner onto the next sidewalk -- its end can be a few
           metres from this one's (JOIN), so they ease across (SETTLE). */
        out.push({ ...p, w: j.w, s: j.end === 0 ? over : nw.length - over, dir: j.end === 0 ? 1 : -1, left, blend: here(p) });
        continue;
      }
      /* A dead end: back the way they came, crossing to the other side of the sidewalk. */
      out.push({ ...p, s: end === 0 ? -s : 2 * w.length - s, dir: -p.dir, left, blend: here(p) });
      continue;
    }
    out.push({ ...p, s, left });
  }
  /* The same number of people all day: whoever went in or walked off is
     somebody else coming out. */
  /* PEOPLE GETTING OFF: stepping down at the door of a bus at its stop, one
     every ALIGHT_EACH (buses.js `alightAt`), and walking onto the sidewalk. */
  for (const bus of world.actors ?? []) {
    if (bus.kind !== "bus" || bus.dwellFrom == null || !bus.alighting) continue;
    const st = stopById.get(bus.busStop?.id);
    if (!st) continue;
    for (let i = 0; i < bus.alighting; i++) {
      const at = alightAt(bus.dwellFrom, i);
      if (at > t - DT && at <= t) {
        out.push(person(r, n, { id: `w${n}`, state: "alighting", from: st.door, to: { x: st.spot.x, y: st.spot.y, z: st.spot.z }, u: 0, w: st.w, s: st.s, dir: r() < 0.5 ? 1 : -1 }));
        n++;
      }
    }
  }
  const away = world.walkersAway ?? 0;
  while (out.length + away < net.people) {
    const q = arrival(net, r, n);
    if (!q) break;
    out.push(q);
    n++;
  }
  return { walkers: out, walkerN: n, walkRng: (r() * 4294967296) >>> 0 };
}

/* Where somebody on foot is: on the sidewalk, kept to their side of it,
   or on a front walk between a door and the sidewalk. */
export function walkerPose(world, p) {
  const net = walkNetOf(world.course?.map);
  if (p.state === "boarding" || p.state === "alighting" || p.state === "returning") {
    const u = Math.max(0, Math.min(1, p.u));
    return { x: p.from.x + (p.to.x - p.from.x) * u, y: p.from.y + (p.to.y - p.from.y) * u, z: p.from.z ?? 0, heading: (Math.atan2(p.to.y - p.from.y, p.to.x - p.from.x) * 180) / Math.PI };
  }
  if (p.state === "out" || p.state === "in") {
    const d = net.doors[p.door];
    const x = d.walk.x + (d.face.x - d.walk.x) * p.u, y = d.walk.y + (d.face.y - d.walk.y) * p.u;
    const h = Math.atan2(d.face.y - d.walk.y, d.face.x - d.walk.x) + (p.state === "out" ? Math.PI : 0);   // facing the door going in, the street coming out
    return { x, y, z: d.walk.z ?? 0, heading: (h * 180) / Math.PI };
  }
  const w = net.walks[p.w];
  const q = along(w, p.s);
  const nx = -Math.sin(q.h), ny = Math.cos(q.h);
  /* Keeping to the right of the way they walk. */
  let x = q.x - nx * KEEP * p.dir, y = q.y - ny * KEEP * p.dir;
  if (p.blend && world.t >= p.blend.t && world.t - p.blend.t < SETTLE) {
    const k = (world.t - p.blend.t) / SETTLE;
    x = p.blend.x + (x - p.blend.x) * k; y = p.blend.y + (y - p.blend.y) * k;
  }
  return { x, y, z: q.z, heading: ((q.h + (p.dir < 0 ? Math.PI : 0)) * 180) / Math.PI };
}

/* The nearest point on any sidewalk: which, and how far along. */
function nearestWalk(net, p) {
  let best = null;
  net.walks.forEach((w, i) => {
    for (let k = 0; k + 1 < w.pts.length; k++) {
      const a = w.pts[k], b = w.pts[k + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
      const f = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
      const d = Math.hypot(a.x + dx * f - p.x, a.y + dy * f - p.y);
      if (!best || d < best.d) best = { d, w: i, s: w.at[k] + f * Math.sqrt(L2) };
    }
  });
  return best && best.d < 3 ? best : null;
}
