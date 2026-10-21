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
  /* NEVER ITS OWN NEIGHBOUR (22 October): asked about a car already in the
     world -- LOD promoting one, or a check re-asking about a placed car --
     the index holds the car itself at its own place, and it read as its own
     follower at a negative gap (verify-promotion, 120 of 120). */
  const self = (e) => e.a === me || (me.id != null && e.a.id === me.id);
  let i = lo, j = lo - 1;
  while (i < xs.length && self(xs[i])) i++;
  while (j >= 0 && self(xs[j])) j--;
  const ahead = i < xs.length ? xs[i] : null, behind = j >= 0 ? xs[j] : null;
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

/* =====================================================================
   ADMISSIBLE: THE ONE TEST A CAR PASSES TO APPEAR IN THE STREAM
   (22 October; DECISIONS 10.9's promotion check, written before LOD).

   Whoever puts a car into the full simulation -- density shaping placing
   one ahead of the player, LOD promoting one out of a cheaper tier -- asks
   this, and only this. 10.9: "every promoted car arrives on a lane, at a
   speed the traffic it joins could have produced, clear of every
   headway". Each refusal is named, so a check can see which rule bit:
     lane       not on any lane's stretch (inside a box, or off the network)
     speed      faster than its own road lets it drive
     ahead      inside the headway of the car it would follow, in its lane
     behind     inside the headway of the car that would follow it
     queue      either, in its queue by the rule (approachNeighbours)
     space      a body of any road within CLEAR_AROUND (an off-ramp beside
                the road it has just split from)
     arrival    its first decision would brake harder than its own
                comfortable rate (a bend, a slower car) -- the following
                and cornering model it will drive by, passed in as
                `wantsAccel(world, car)` and `brakeOf(car)`, with
                `poseOf`, since this module may not reach into the step.
   ===================================================================== */
/* No car of any road nearer than this, centre to centre: two car lengths. A flagged design constant. */
export const CLEAR_AROUND = 10;
export function admissible(world, car, { poseOf, wantsAccel, brakeOf, actors = world.actors, kappa = 1 } = {}) {
  const why = [];
  const at = placeOf(world.course, car.k ?? 0, car.route, car.s);
  if (!at) return { ok: false, why: ["lane"] };
  if ((car.v ?? 0) > (car.v0 ?? car.v ?? 0) + 0.5) why.push("speed");
  const w = actors === world.actors ? world : { ...world, actors };
  const nb = neighboursAt(w, at.lane, at.c, car), ap = approachNeighbours(w, car, actors);
  if (nb.ahead && nb.ahead.clear < leadNeed(car, nb.ahead.car, kappa)) why.push("ahead");
  if (nb.behind && nb.behind.clear < lagNeed(car, nb.behind.car, kappa)) why.push("behind");
  if ((ap.ahead && ap.ahead.clear < leadNeed(car, ap.ahead.car, kappa)) || (ap.behind && ap.behind.clear < lagNeed(car, ap.behind.car, kappa))) why.push("queue");
  if (poseOf) {
    const p0 = poseOf(w, car);
    if (actors.some((b) => b !== car && b.id !== car.id && !b.parked && (() => { const q = poseOf(w, b); return Math.hypot(q.x - p0.x, q.y - p0.y) < CLEAR_AROUND; })())) why.push("space");
  }
  if (wantsAccel && brakeOf && wantsAccel({ ...w, actors: [...actors.filter((b) => b.id !== car.id), car] }, car) < -brakeOf(car)) why.push("arrival");
  return { ok: why.length === 0, why, at, ahead: nb.ahead, behind: nb.behind, queue: ap };
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
