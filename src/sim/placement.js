/* =====================================================================
   PUTTING A CAR INTO A MOVING STREAM: ONE NEIGHBOUR QUERY, ONE PREDICATE
   (22 October; DECISIONS 10.10, 10.17).

   The question has been answered four times, separately, and got wrong
   three times (10.10). Here it is answered once for whoever needs to place
   a car: who is ahead and who behind at a place in a lane, and whether a
   car there at a speed has room both ways.

   PLACES ARE COMPARED BY THE ROAD'S CENTRELINE (graph.js exitAlong /
   approachAlong), the one coordinate that agrees across lanes. A car
   changing lane is in BOTH lanes at its centreline place until its change
   is done -- the rule whatStops reads it by. A car inside an intersection's
   box is on no lane's stretch; nothing is placed near a box (shaping.js
   keeps clear of them).

   THE PREDICATE IS THE LANE CHANGE'S OWN (lanechange.js leadNeed and
   lagNeed), at the COMPETENT standard (caution 1): placement may choose
   where and how fast, so it never takes a gap a competent driver would
   refuse. Never bold, never missing anybody.

   Pure. Cached per tick on the actors array.
   ===================================================================== */
import { exitAlong, approachAlong } from "./graph.js";
import { leadNeed, lagNeed } from "./lanechange.js";
import { lenOf } from "./traffic.js";

/* The lane and centreline place of a car on route `route` at node k, s
   along it: its approach lane before the line, its exit lane after the
   box, null inside the box. */
export function placeOf(course, k, route, s) {
  const L = course.at?.[k]?.layout, p = L?.paths?.[route];
  if (!p) return null;
  if (s >= p.clearAt) { const c = exitAlong(course, k, route, s), lane = L.legs[p.to]?.outLane; return c != null && lane ? { lane: lane.id, c } : null; }
  if (s <= p.stopAt) { const c = approachAlong(course, k, route, s), lane = L.legs[p.from]?.inLane; return c != null && lane ? { lane: lane.id, c } : null; }
  return null;
}

const cache = new WeakMap();
/* Every car on every lane, by centreline place: lane id -> [{ c, a }] sorted by c. */
export function laneIndexOf(world) {
  let idx = cache.get(world.actors);
  if (idx) return idx;
  idx = new Map();
  const put = (lane, c, a) => { let xs = idx.get(lane); if (!xs) idx.set(lane, (xs = [])); xs.push({ c, a }); };
  const course = world.course;
  for (const a of world.actors) {
    if (a.parked) continue;
    const at = placeOf(course, a.k ?? 0, a.route, a.s);
    if (!at) continue;
    put(at.lane, at.c, a);
    /* Mid-change: in the lane being left too, at the same centreline place. */
    if (a.lc && world.t < a.lc.t0 + a.lc.T) {
      const Lk = course.at[a.k ?? 0].layout;
      /* The lane being left where the car IS: an approach change records both legs (fromLeg and fromTo), and reading fromTo first filed one on the road past the box -- invisible in the lane it was leaving, and a car was placed beside it (22 October). */
      const p = Lk.paths[a.route], onApproach = p && a.s <= p.stopAt;
      const old = onApproach ? (a.lc.fromLeg != null ? Lk.legs[a.lc.fromLeg]?.inLane : null) : (a.lc.fromTo != null ? Lk.legs[a.lc.fromTo]?.outLane : null);
      if (old && old.id !== at.lane) put(old.id, at.c, a);
    }
  }
  for (const xs of idx.values()) xs.sort((x, y) => x.c - y.c);
  cache.set(world.actors, idx);
  return idx;
}

/* Nearest ahead and behind of centreline place c in lane `lane`, with the
   clear road between bodies (a car of `me`'s length standing at c). */
export function neighboursAt(world, lane, c, me) {
  const xs = laneIndexOf(world).get(lane) ?? [];
  let lo = 0, hi = xs.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m].c > c) hi = m; else lo = m + 1; }
  const half = lenOf(me) / 2;
  const ahead = lo < xs.length ? xs[lo] : null, behind = lo > 0 ? xs[lo - 1] : null;
  return {
    ahead: ahead && { car: ahead.a, clear: ahead.c - c - half - lenOf(ahead.a) / 2 },
    behind: behind && { car: behind.a, clear: c - behind.c - half - lenOf(behind.a) / 2 },
  };
}

/* THE QUEUE A CAR IS IN BY THE RULE IT DRIVES BY: whatStops has every car
   from the same approach at the same node follow by distance along its own
   path (`shareLane`, theirs.from === mine.from) -- for the WHOLE path, past
   the box and past where an off-ramp splits from the road. So a car placed
   on the off-ramp 70-180 m past the split was the car in front of a car in
   the curb lane, by the rule, while the lane index filed the two under
   different roads (22 October: every follower verify-shaping caught braking
   hard behind a placed car was this). Nearest ahead and behind among them,
   with the clear road between. */
export function approachNeighbours(world, me, actors = world.actors) {
  const L = world.course.at[me.k ?? 0]?.layout, mine = L?.paths?.[me.route];
  if (!mine) return { ahead: null, behind: null };
  let ahead = null, behind = null, da = Infinity, db = Infinity;
  for (const b of actors) {
    if (b === me || b.id === me.id || b.parked || (b.k ?? 0) !== (me.k ?? 0)) continue;
    const p = L.paths[b.route];
    if (!p || p.from !== mine.from) continue;
    const d = b.s - me.s;
    if (d > 0 && d < da) { da = d; ahead = b; }
    if (d <= 0 && -d < db) { db = -d; behind = b; }
  }
  const half = lenOf(me) / 2;
  return {
    ahead: ahead && { car: ahead, clear: da - half - lenOf(ahead) / 2 },
    behind: behind && { car: behind, clear: db - half - lenOf(behind) / 2 },
  };
}

/* ROOM FOR `me` (its kind, ratings and speed v) at centreline place c in
   `lane`: the competent standard both ways, by the lane change's own needs. */
export function roomAt(world, me, lane, c, kappa = 1) {
  const nb = neighboursAt(world, lane, c, me);
  const ap = approachNeighbours(world, me);
  const ok = (n) => (!n.ahead || n.ahead.clear >= leadNeed(me, n.ahead.car, kappa)) && (!n.behind || n.behind.clear >= lagNeed(me, n.behind.car, kappa));
  /* Both: the lane (the road beside, the seams) and the queue by the rule (above). */
  return { ok: ok(nb) && ok(ap), ...nb, queue: ap };
}
