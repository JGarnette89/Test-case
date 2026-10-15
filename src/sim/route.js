/* =====================================================================
   GOING SOMEWHERE (PLAN.md phase 3, item 7): a place to go, a route to it
   on the graph, and how far along it the player is. The deepest shared
   foundation -- jobs, racing, pursuit and A.U.T.O.'s rerouting all ask
   "how do I get from here to there".

   A PLACE is the curb in front of a building, on the side of the road it
   faces: a point on a curb lane's path, so arriving is being stopped
   there. Derived from the map's own buildings (`loaded.props`), never
   typed in; a building facing no road, or too far from one, is no place.

   A ROUTE is a shortest path over the graph's own joins: from an approach
   at one intersection, through a movement to an exit, which the join hands
   to the next intersection's approach -- until the place's own stretch of
   road. Its length is the sum of the paths driven. Pure; Dijkstra over
   (intersection, approach) -- a few hundred states on the stand-in city.
   ===================================================================== */
import { poseOnGraph } from "./graph.js";
import { routeForSignal } from "./drive.js";

const baseOf = (layout, legId) => layout.legs[legId]?.base ?? legId;
export const PLACE_REACH = 25;   // m: a door further than this from any curb lane is not on a street
export const ARRIVED_WITHIN = 15; // m along the curb either side of the place
const SAMPLE = 4;                 // m between the curb samples a place is found on

/* Every curb-lane sample on the map, once per course: where, which way, and on which path. */
const samplesOf = new WeakMap();
function curbSamples(course) {
  let out = samplesOf.get(course);
  if (out) return out;
  out = [];
  course.at.forEach((spot, k) => {
    if (spot.through) return;
    const L = spot.layout;
    for (const [route, p] of Object.entries(L.paths)) {
      if (p.intent !== "straight") continue;
      const from = L.legs[p.from], to = L.legs[p.to];
      /* The approach half (to the line, on the curb lane in) and the exit half (from the box, on the curb lane out). */
      if (from?.curb) for (let s = 5; s < p.stopAt - 5; s += SAMPLE) { const q = poseOnGraph(course, k, route, s); out.push({ k, route, s, x: q.x, y: q.y, rot: q.rot, base: from.base, part: "in" }); }
      if (to?.curb) for (let s = p.clearAt + 5; s < p.length - 5; s += SAMPLE) { const q = poseOnGraph(course, k, route, s); out.push({ k, route, s, x: q.x, y: q.y, rot: q.rot, base: to.base, part: "out" }); }
    }
  });
  samplesOf.set(course, out);
  return out;
}

/* THE PLACES: a curb in front of each building that faces a road. */
export function placesOf(course, loaded) {
  const samples = curbSamples(course), out = [];
  for (const b of loaded.props ?? []) {
    let best = null, bd = PLACE_REACH;
    for (const q of samples) {
      const dx = b.at.x - q.x, dy = b.at.y - q.y, d = Math.hypot(dx, dy);
      if (d >= bd) continue;
      /* On the right of the direction of travel: y is down, so the right of heading h is (-sin h, cos h). */
      const h = (q.rot * Math.PI) / 180;
      if (-Math.sin(h) * dx + Math.cos(h) * dy <= 0) continue;
      bd = d; best = q;
    }
    if (best) out.push({ id: b.id, kind: b.kind ?? "building", k: best.k, route: best.route, s: best.s, base: best.base, part: best.part, x: best.x, y: best.y });
  }
  /* A STRETCH OF CURB WITH NO BUILDING ON IT is still somewhere to go --
     "pull in on Elm, past the lights" -- so a map with no buildings (test
     map 1, #/map's own) is not a map with nowhere to go. One place per
     stretch, at its middle. */
  const served = new Set(out.map((p) => `${p.k}|${p.base}|${p.part}`));
  const stretches = new Map();
  for (const q of samples) {
    const key = `${q.k}|${q.base}|${q.part}`;
    if (served.has(key)) continue;
    (stretches.get(key) ?? stretches.set(key, []).get(key)).push(q);
  }
  for (const [key, qs] of stretches) {
    const q = qs[Math.floor(qs.length / 2)];
    out.push({ id: `curb:${key}`, kind: "curb", k: q.k, route: q.route, s: q.s, base: q.base, part: q.part, x: q.x, y: q.y });
  }
  return out;
}

/* THE MOVEMENTS A PLAYER CAN MAKE: from each lane, the one its signal
   picks for left, for right, and for none (drive.js `routeForSignal`) --
   the turn signal is the player's only way to choose. A five-way can
   offer two lefts from one lane, and the signal means the one most a
   left; the other is no movement the player can make, so no route may
   ask for it (14 October: a ride on test map 1 planned the other left at
   n2 and the car, signalling left as told, took the one a signal means). */
const selectableOf = new WeakMap();
export function selectable(layout) {
  let set = selectableOf.get(layout);
  if (set) return set;
  set = new Set();
  for (const legId of Object.keys(layout.legs)) {
    if (!layout.routesFrom(legId).length) continue;
    for (const sig of [null, "left", "right"]) { const r = routeForSignal(layout, legId, sig); if (r) set.add(r); }
  }
  selectableOf.set(layout, set);
  return set;
}

/* Is the car on the place's own stretch of road, and how far along it from the place (negative: still short of it)? */
export function alongTo(course, me, place) {
  if ((me.k ?? 0) !== place.k) return null;
  const L = course.at[place.k].layout, p = L.paths[me.route], tp = L.paths[place.route];
  if (!p || !tp) return null;
  if (place.part === "in") { if (baseOf(L, p.from) !== place.base || me.s > p.stopAt) return null; return me.s * (tp.stopAt / p.stopAt) - place.s; }
  if (baseOf(L, p.to) !== place.base || me.s < p.clearAt) return null;
  return (me.s - p.clearAt) - (place.s - tp.clearAt);
}

/* THE ROUTE from the car to a place: the movement to make at each
   intersection, in order, and the length driven. State = (k, approach
   base); a step makes one movement and the join hands it on. The goal is
   the place's stretch: its approach at its own intersection, or -- for a
   place on an exit -- the movement onto that exit. Null if unreachable. */
export function routeTo(course, me, place) {
  const L0 = course.at[me.k ?? 0].layout, p0 = L0.paths[me.route];
  if (!p0) return null;
  /* Already on its stretch, ahead of it. */
  const here = alongTo(course, me, place);
  if (here != null && here <= ARRIVED_WITHIN) return { steps: [], length: Math.max(0, -here) };
  const key = (k, base) => `${k}|${base}`;
  const dist = new Map(), prev = new Map(), done = new Set();
  /* Past the line the movement is committed: the search starts from where it leads. */
  const startStates = [];
  if (me.s > p0.stopAt) {
    const j = course.joins[`${me.k ?? 0}|${p0.to}`];
    if (place.part === "out" && place.k === (me.k ?? 0) && baseOf(L0, p0.to) === place.base) return { steps: [], length: Math.max(0, place.s - me.s) };
    if (j) startStates.push({ k: j.k, base: baseOf(course.at[j.k].layout, j.side), d: p0.length - me.s });
  } else startStates.push({ k: me.k ?? 0, base: baseOf(L0, p0.from), d: Math.max(0, p0.stopAt - me.s) });
  const queue = [];
  for (const s0 of startStates) { dist.set(key(s0.k, s0.base), s0.d); queue.push(s0); }
  let goal = null;
  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const cur = queue.shift(), ck = key(cur.k, cur.base);
    if (done.has(ck)) continue;
    done.add(ck);
    const L = course.at[cur.k].layout, sel = selectable(L);
    /* The place is on this approach. */
    if (place.part === "in" && place.k === cur.k && place.base === cur.base) { goal = { ck, d: cur.d }; break; }
    for (const [route, p] of Object.entries(L.paths)) {
      if (baseOf(L, p.from) !== cur.base || !sel.has(route)) continue;
      /* The place is on the exit this movement takes: done after it. */
      if (place.part === "out" && place.k === cur.k && baseOf(L, p.to) === place.base) {
        const d = cur.d + (place.s - p.stopAt);
        if (!goal || d < goal.d) goal = { ck: `${ck}>${route}`, d, last: { from: ck, k: cur.k, route } };
        continue;
      }
      const j = course.joins[`${cur.k}|${p.to}`];
      if (!j) continue;
      const nb = baseOf(course.at[j.k].layout, j.side), nk = key(j.k, nb);
      const d = cur.d + (p.length - p.stopAt) + (course.at[j.k].layout.paths[Object.keys(course.at[j.k].layout.paths).find((r) => course.at[j.k].layout.paths[r].from === j.side)]?.stopAt ?? 0);
      if (d < (dist.get(nk) ?? Infinity)) { dist.set(nk, d); prev.set(nk, { from: ck, k: cur.k, route }); queue.push({ k: j.k, base: nb, d }); }
    }
  }
  if (!goal) return null;
  const steps = [];
  let at = goal.ck;
  if (goal.last) { steps.unshift({ k: goal.last.k, route: goal.last.route }); at = goal.last.from; }
  while (prev.has(at)) { const s = prev.get(at); steps.unshift({ k: s.k, route: s.route }); at = s.from; }
  return { steps, length: goal.d };
}

/* What to do next: the movement at the coming intersection and how far to its line -- for the screen to say, and for the player to signal. */
export function nextTurn(course, me, route) {
  const step = route?.steps?.[0];
  if (!step) return null;
  const L = course.at[step.k].layout, p = L.paths[step.route];
  const sameNode = step.k === (me.k ?? 0);
  const toLine = sameNode ? (L.paths[me.route]?.stopAt ?? 0) - me.s : null;
  /* The lane is said from the exit before, too: a short link leaves no
     room to move over once on the approach. The join says which lane the
     car will arrive in. */
  let lane = 0;
  if (sameNode) lane = laneFor(L, L.paths[me.route], p);
  else {
    const mine = course.at[me.k ?? 0].layout.paths[me.route];
    const j = mine && course.joins[`${me.k ?? 0}|${mine.to}`];
    if (j && j.k === step.k) lane = laneFor(L, { from: j.side }, p);
  }
  return { intent: p.intent, k: step.k, toLine, lane };
}

/* WHICH WAY TO MOVE OVER for a movement: 0 if the car's own lane makes it
   (the same turn onto the same road), else -1 (left) or +1 (right) toward
   the nearest lane that does -- a left from the curb lane of an arterial
   is not on offer, and the screen has to say so before the line, not after. */
export function laneFor(layout, mine, want) {
  if (!mine || !want) return 0;
  const legs = layout.legs, from = legs[mine.from], toBase = baseOf(layout, want.to);
  const sel = selectable(layout);
  const makes = (legId) => layout.routesFrom(legId).some((r) => { const q = layout.paths[r]; return sel.has(r) && q.intent === want.intent && baseOf(layout, q.to) === toBase; });
  if (!from || makes(mine.from)) return 0;
  const here = from.pos ?? from.lane ?? 0;
  let best = null;
  for (const [id, l] of Object.entries(legs)) {
    if (l.base !== from.base || id === mine.from || !makes(id)) continue;
    const d = (l.pos ?? l.lane ?? 0) - here;
    if (best == null || Math.abs(d) < Math.abs(best)) best = d;
  }
  return best == null ? 0 : Math.sign(best);
}
