/* =====================================================================
   DENSITY SHAPING: THE CARS THE PHONE AFFORDS, SPENT WHERE THE PLAYER IS
   (22 October; DECISIONS 10.17).

   At the car count the phone affords, the endless highway was a car every
   ~190 m of lane and the player met 5.5 a minute and judged no gaps. The
   same cars in a window around the player are traffic, for the same step.
   So, with a player on the map:

   - THE WINDOW is by NETWORK distance -- AHEAD metres along every lane
     reachable from the player's, BEHIND metres back along every lane that
     reaches it. Euclidean distance would be wrong on the loop, whose far
     side curves back toward the player.
   - RETIRE: a car outside the window and out of SIGHT goes, as a car
     leaving at an edge does. Never the player, a wreck, or a parked car.
   - INSERT: while the map is under its target, a car is placed ahead,
     inside the window and out of sight, on a lane the player could reach,
     at the traffic's speed there, only where the competent gap predicate
     holds both ways (placement.js) -- drawn by `carFor`, the arrival's own
     construction, so who drives is unchanged.
   - ARRIVALS at the map's edges are admitted only inside the window.

   On the tick, inside `step` -- a function of the world and the player's
   pose (10.9). With no player nothing is shaped and the world is the
   world it was.
   ===================================================================== */
import { placeOf, laneIndexOf, roomAt, admissible } from "./placement.js";
import { exitSAt } from "./graph.js";
import { rng } from "../core/rng.js";

/* The window, a flagged design constant: the maintainer's arithmetic put
   the cars a phone affords in "a 6 km window" as one every ~37 m. */
export const AHEAD = 1500;    // m of road ahead of the player -- measured on the endless highway at 160 cars (22 October): 2500 left most cars 400-2500 m ahead at the player's own pace, 5 met a minute; 1000 filled the window at competent gaps (105 of 160 held, followed 66-85% of the time); 1500 held 139-157 and met 17-19 a minute, against 2.2-2.6 unshaped
export const BEHIND = 600;     // m of road behind -- with AHEAD
/* OUT OF SIGHT: farther than the drive camera can show at its widest --
   LEAD_MAX, the screen's furthest zoom-out, the isometric squash -- on any
   phone or tablet held either way. A constant in the sim (the world may
   not depend on the screen, 10.9), held against the camera by
   verify-shaping. */
export const SIGHT = 400;     // m
const NEAR_BOX = 40;          // m: nothing is placed nearer an intersection than this

/* THE ROAD GRAPH, once per course. A ROAD here is one road in one direction
   -- every lane of it, which share its centreline coordinate (lane ids
   "road:dir#lane"), so a car in the next lane is as far ahead as one in
   mine and a lane change moves nobody along it. The first version walked
   LANES and only through nodes: the lane beside the player was outside
   the window, and from the slip road -- whose acceleration lane merges
   sideways, not through a node -- the window was the slip road alone, and
   121 cars were retired in the first tick (22 October). Per road: its
   length, the roads after and before it through a node, the paths that run
   along each of its lanes (as an approach or an exit), and the lanes that
   are not through lanes -- an acceleration lane or a turn bay, where
   nothing is placed (a car put in a taper is partly in the next lane: the
   first version did, and it was struck). */
const roadOf = (laneId) => String(laneId).split("#")[0];
const graphs = new WeakMap();
function laneGraph(course) {
  let g = graphs.get(course);
  if (g) return g;
  g = { len: new Map(), next: new Map(), prev: new Map(), approach: new Map(), exit: new Map(), lanes: new Map(), special: new Set() };
  const add = (m, key, v) => { let xs = m.get(key); if (!xs) m.set(key, (xs = [])); xs.push(v); };
  course.at.forEach((spot, k) => {
    const L = spot.layout;
    for (const [route, p] of Object.entries(L.paths)) {
      const inL = L.legs[p.from]?.inLane, outL = L.legs[p.to]?.outLane;
      if (!inL?.along || !outL?.along) continue;
      const ri = roadOf(inL.id), ro = roadOf(outL.id);
      for (const [r, lane] of [[ri, inL], [ro, outL]]) {
        g.len.set(r, Math.max(g.len.get(r) ?? 0, lane.along[lane.along.length - 1]));
        add(g.lanes, r, lane.id);
      }
      add(g.next, ri, ro);
      add(g.prev, ro, ri);
      add(g.approach, inL.id, { k, route, side: p.from });
      add(g.exit, outL.id, { k, route });
      if (L.legs[p.from]?.accel || L.legs[p.from]?.bay) g.special.add(inL.id);
      if (L.legs[p.to]?.accel || L.legs[p.to]?.bay) g.special.add(outL.id);
    }
  });
  for (const m of [g.next, g.prev, g.lanes]) for (const [key, xs] of m) m.set(key, [...new Set(xs)]);
  graphs.set(course, g);
  return g;
}

/* Network distance from the player's place to the START of every road
   reachable ahead, and to the END of every road that reaches them. */
function reach(g, road, c, way, lims) {
  const dist = new Map();
  const first = way > 0 ? (g.len.get(road) ?? 0) - c : c;
  const queue = [];
  for (const nx of (way > 0 ? g.next : g.prev).get(road) ?? []) queue.push([nx, first]);
  const lim = way > 0 ? lims.ahead : lims.behind;
  while (queue.length) {
    queue.sort((x, y) => x[1] - y[1]);
    const [r, d] = queue.shift();
    if (d > lim || (dist.has(r) && dist.get(r) <= d)) continue;
    dist.set(r, d);
    const through = d + (g.len.get(r) ?? 0);
    for (const nx of (way > 0 ? g.next : g.prev).get(r) ?? []) if (!dist.has(nx) || dist.get(nx) > through) queue.push([nx, through]);
  }
  return dist;
}

/* The player's window this tick, or null with no player (or one inside a box). */
export function windowOf(world, actors) {
  const pl = actors.find((a) => a.player);
  if (!pl) return null;
  const at = placeOf(world.course, pl.k ?? 0, pl.route, pl.s);
  if (!at) return null;
  const g = laneGraph(world.course), road = roadOf(at.lane);
  /* The window's size: the flagged constants, or a world's own (a measurement sweeping them). */
  const lims = { ahead: world.shapeAhead ?? AHEAD, behind: world.shapeBehind ?? BEHIND };
  const ahead = reach(g, road, at.c, 1, lims), behind = reach(g, road, at.c, -1, lims);
  return { pl, at, road, g, lims, ahead, behind };
}

/* How far ahead of the player (>= 0) a place is, or null if it is not ahead within AHEAD. */
function aheadBy(win, lane, c) {
  const r = roadOf(lane);
  if (r === win.road && c >= win.at.c) return c - win.at.c <= win.lims.ahead ? c - win.at.c : null;
  const d = win.ahead.get(r);
  return d != null && d + c <= win.lims.ahead ? d + c : null;
}
export function inWindow(win, lane, c) {
  if (aheadBy(win, lane, c) != null) return true;
  const r = roadOf(lane);
  if (r === win.road && c < win.at.c) return win.at.c - c <= win.lims.behind;
  const d = win.behind.get(r);
  return d != null && d + ((win.g.len.get(r) ?? 0) - c) <= win.lims.behind;
}

/* Is a car (about to join at an edge, or anywhere) inside the window? */
export function admits(world, win, car) {
  if (!win) return true;
  const at = placeOf(world.course, car.k ?? 0, car.route, car.s);
  return !at || inWindow(win, at.lane, at.c);
}

const far = (poseOf, w, a, from) => { const p = poseOf(w, a); return Math.hypot(p.x - from.x, p.y - from.y) > SIGHT; };

/* THE TICK'S SHAPING of `next` (the actors as they will be): the cars to
   retire gone, and at most one car placed. `make(n, k, route, want, kind)`
   is the arrival's construction (crossing.js carFor); `want(n, kind, k,
   side)` the arrival's choice of route; `poseOf` where an actor is. */
export function shape(world, next, { n: n0, make, settle = (c) => c, wantAt, poseOf, kindOf, wantsAccel, brakeOf }) {
  const win = windowOf(world, next);
  if (!win) return { next, win: null, retired: 0, placed: null };
  const w = { ...world, actors: next };
  const me = poseOf(w, win.pl);
  /* Retire: outside the window and out of sight -- ONE A TICK, AND ONLY WITH
     THE MAP AT ITS TARGET, so every car retired is followed by a place for
     one (below). Retiring every car outside the window at once drained a map
     where nothing could be placed (test map 1, 22 October); as a swap, a map
     that has nowhere to put a car keeps the ones it has. */
  let retired = 0;
  if (world.target != null && next.length >= world.target) {
    for (let i = 0; i < next.length; i++) {
      const a = next[i];
      if (a.player || a.crash || a.parked) continue;
      const at = placeOf(world.course, a.k ?? 0, a.route, a.s);
      if (!at || inWindow(win, at.lane, at.c) || !far(poseOf, w, a, me)) continue;
      next = [...next.slice(0, i), ...next.slice(i + 1)];
      retired = 1;
      break;
    }
  }
  /* Insert: one car a tick while under the target. */
  if (world.target == null || next.length >= world.target) return { next, win, retired, placed: null };
  const r = rng(world.seed * 6151 + (world.tick ?? 0) * 7 + 3);
  const lanes = [...win.ahead.keys(), win.road].flatMap((r) => win.g.lanes.get(r) ?? []).filter((l) => !win.g.special.has(l));
  const wn = { ...world, actors: next };
  for (let tries = 0; tries < 4; tries++) {
    const lane = lanes[Math.floor(r() * lanes.length) % lanes.length];
    const len = win.g.len.get(roadOf(lane)) ?? 0;
    const c = r() * len;
    const by = aheadBy(win, lane, c);
    if (by == null || by < SIGHT) continue;
    /* Where on a path that is: an approach well short of its line, or an exit well past its box. */
    let spot = null;
    for (const ap of win.g.approach.get(lane) ?? []) {
      const p = world.course.at[ap.k].layout.paths[ap.route], lo = world.course.at[ap.k].layout.legs[p.from].inLane;
      const s = interpBack(lo, c) - p.laneIn.at0;
      if (s >= 0 && s <= p.stopAt - NEAR_BOX) { spot = { k: ap.k, side: ap.side, s }; break; }
    }
    if (!spot) for (const ex of win.g.exit.get(lane) ?? []) {
      const p = world.course.at[ex.k].layout.paths[ex.route], s = exitSAt(world.course, ex.k, ex.route, c);
      if (s != null && s >= p.clearAt + NEAR_BOX && s <= p.length - 5) { spot = { k: ex.k, route: ex.route, s }; break; }
    }
    if (!spot) continue;
    const n = n0;
    const kind = kindOf(n);
    const choice = spot.route ? { route: spot.route, want: null } : wantAt(n, kind, spot.k, spot.side);
    if (!choice?.route) continue;
    /* Settled where it is put -- past the box, the exit road's limit (crossing.js exitLimit) -- before its speed is chosen. */
    let car = settle({ ...make(n, spot.k, choice.route, choice.want, kind), s: spot.s });
    /* At the traffic's speed: the car ahead's if it is near enough to follow, else their own. */
    const at = placeOf(world.course, car.k, car.route, car.s);
    if (!at || at.lane !== lane) continue;
    let room = roomAt(wn, { ...car, v: car.v0 }, lane, at.c);
    /* At the car ahead's speed when it is near enough to follow, else its own.
       (Tried 22 October: the speed of any car it would follow within 150 m.
       Encounters fell from 19 a minute to 5 and the hard braking behind
       placed cars did not go -- the placed car slowed with a slowing leader
       anyway. Reverted; DECISIONS 10.17.) */
    const lead = room.ahead;
    const v = lead && lead.clear < 3 * (car.v0 * 2 + 10) ? Math.min(car.v0, lead.car.v ?? 0) : car.v0;
    car = { ...car, v, placed: world.t };   // when shaping put them here: a car that arrived at an edge carries none
    /* Out of sight, and ADMISSIBLE (placement.js): on a lane, at a speed its
       road allows, clear of every headway in its lane and its queue, clear in
       space (an off-ramp beside the road it has just split from: a car placed
       64 m past the split sat on a highway changer), and not braking hard the
       tick it arrives (placed short of a bend at its own cruising speed, one
       braked at about 5 m/s^2 and the car behind with it). The one test LOD's
       promotion will ask too. */
    if (!far(poseOf, wn, car, me) || !admissible(wn, car, { poseOf, wantsAccel, brakeOf, actors: next, all: false }).ok) continue;
    return { next: [...next, car], win, retired, placed: car };
  }
  return { next, win, retired, placed: null };
}

/* The arc length on a lane at a centreline place (graph.js keeps the pair as `at` and `along`). */
function interpBack(lane, c) {
  const xs = lane.along, ys = lane.at;
  let lo = 0, hi = xs.length - 1;
  if (c <= xs[0]) return ys[0];
  if (c >= xs[hi]) return ys[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= c) lo = m; else hi = m; }
  return ys[lo] + ((c - xs[lo]) / ((xs[hi] - xs[lo]) || 1)) * (ys[hi] - ys[lo]);
}
