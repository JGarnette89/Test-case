/* =====================================================================
   WHAT THE PLAYER ACTUALLY MEETS (the maintainer, 20 October: "my issue is
   how we are measuring performance compared to what the player will
   actually encounter gameplay-wise").

   Every number this project kept -- cars on the map, step ms, sim against
   real time -- describes the simulation's WORKLOAD. None says how much
   traffic the player interacted with. A world of 200 cars where the player
   meets one car a minute passes every check we own; this is the
   instrument for the number the game lives on.

   Per tick, from the player's seat:
   - MET: distinct cars that came within NEAR metres (about two seconds
     at 50 km/h) -- traffic the player had to share road with.
   - FOLLOWING: seconds the player was behind a car that constrained them
     (whatStops's own leader, a car, within FOLLOW_S seconds of headway).
   - FOLLOWED: seconds a car was behind the player in the player's lane,
     within the same headway.
   - GAPS JUDGED: approaches where the player stood at the line while a car
     on a route that conflicts with theirs was coming on -- a decision the
     player had to make against somebody.
   - OVERTAKING / OVERTAKEN (20 October; "swimming" in numbers): a car
     beside the player -- within PASS_SIDE metres either way along their
     heading, at least a lane's half-width across -- that goes from ahead
     to behind (the player passed it) or behind to ahead (it passed them).
   - MERGES JUDGED: the player moving into another lane, or joining a
     highway from a slip road, with a car in that lane within MERGE metres.
   Flagged design constants, chosen as "an interaction" a driver would feel.

   Pure. `encounterTick(state, me, world)`; `encounterSummary(state)`.
   ===================================================================== */
import { whatStops, poseOf, conflictOf } from "./crossing.js";
import { laneSpan } from "./course.js";
import { DT } from "./traffic.js";

export const NEAR = 30;        // m: within this, a car is traffic you are sharing road with
export const FOLLOW_S = 2.5;   // s of headway: closer than this, somebody is following somebody
const FOLLOW_MIN = 10;         // m: and never "following" at a crawl farther off than this
const APPROACH = 60;           // m: a conflicting car within this of the conflict point is coming on
export const PASS_SIDE = 30;   // m along the player's heading: a car this near, beside them, is being passed or passing
const SIDE_MIN = 1.8;          // m across: half a lane, so a car in the player's own lane is not "beside" them
export const MERGE = 30;       // m along the lane joined: a car this near makes the merge a judgement

/* A road's kind by its id (the course keeps its roads as a list): indexed once per course. */
const kinds = new WeakMap();
const kindOf = (course, id) => { let m = kinds.get(course); if (!m) { m = new Map((course.roads ?? []).map((r) => [r.id, r.kind])); kinds.set(course, m); } return m.get(id) ?? null; };
export const newEncounters = () => ({ t: 0, met: new Set(), following: 0, followed: 0, gaps: 0, judging: null, overtook: 0, overtaken: 0, merges: 0, rel: new Map(), was: null });

export function encounterTick(st, me, world) {
  if (!me || !world?.course) return st;
  const course = world.course, k = me.k ?? 0, layout = course.at[k]?.layout, path = layout?.paths[me.route];
  if (!path) return st;
  st.t += DT;
  const mp = poseOf(world, me);
  /* MET; and OVERTAKING / OVERTAKEN, from each nearby car's place along and across the player's heading. */
  const h = ((mp.rot ?? 0) * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h);
  const rel = new Map();
  for (const a of world.actors) {
    if (a.player || a.id === me.id) continue;
    const p = poseOf(world, a);
    if (Math.abs(p.x - mp.x) > PASS_SIDE + 5 || Math.abs(p.y - mp.y) > PASS_SIDE + 5) continue;
    if (Math.hypot(p.x - mp.x, p.y - mp.y) < NEAR) st.met.add(a.id);
    const dx = p.x - mp.x, dy = p.y - mp.y, along = dx * fx + dy * fy, across = Math.abs(-dx * fy + dy * fx);
    /* Heading the same way, beside the player, near enough along. */
    const same = Math.cos((((p.rot ?? 0) - (mp.rot ?? 0)) * Math.PI) / 180) > 0.7;
    if (!same || Math.abs(along) > PASS_SIDE) continue;
    rel.set(a.id, { along, across });
    const was = st.rel.get(a.id);
    if (was && across >= SIDE_MIN && was.across >= SIDE_MIN && (me.v ?? 0) > 2) {
      if (was.along > 0 && along <= 0) st.overtook++;
      else if (was.along < 0 && along >= 0) st.overtaken++;
    }
  }
  st.rel = rel;
  /* MERGES JUDGED: into another lane of the same road, or onto a highway from another kind of road, with a car in that lane near. */
  const leg = layout.legs[path.from], here = { k, from: path.from, base: leg?.base, s: me.s };
  const was = st.was;
  const kind = kindOf(course, leg?.road);
  if (was && was.from !== here.from && ((was.k === k && was.base === here.base) || (was.k !== k && kind === "highway" && was.kind !== "highway"))) {
    const near = world.actors.some((a) => !a.player && (a.k ?? 0) === k && layout.paths[a.route]?.from === path.from && Math.abs(a.s - me.s) < MERGE);
    if (near) st.merges++;
  }
  st.was = { ...here, kind };
  const head = (v) => Math.max(FOLLOW_MIN, FOLLOW_S * (v ?? 0));
  /* FOLLOWING: the leader whatStops picks for the player is a car, close in time. */
  if ((me.v ?? 0) > 2) {
    const view = whatStops({ ...me, caution: 1, headway: 1.6 }, world);
    const L = view.leader;
    if (L && view.gap <= head(me.v) && world.actors.some((a) => !a.player && a.id === L.id)) st.following += DT;
  }
  /* FOLLOWED: a moving car behind the player on a lane they share, within its own headway. */
  const mine = laneSpan(course, k, me.route, me.s);
  for (const a of world.actors) {
    if (a.player || (a.v ?? 0) <= 2) continue;
    const theirs = laneSpan(course, a.k ?? 0, a.route, a.s);
    let behind = false;
    for (const m of mine) { const o = theirs.find((x) => x.lane === m.lane); if (o && m.along - o.along > 0 && m.along - o.along <= head(a.v) + 4.5) behind = true; }
    if (behind) { st.followed += DT; break; }
  }
  /* GAPS JUDGED: standing at the line while a car on a conflicting route comes on. Once per approach. */
  const atLine = (me.v ?? 0) < 0.5 && me.s <= path.stopAt + 0.5 && me.s > path.stopAt - 4;
  const key = `${k}|${path.from}|${Math.floor(st.t / 30)}`;
  if (atLine && st.judging !== key) {
    for (const a of world.actors) {
      if (a.player || (a.k ?? 0) !== k || (a.v ?? 0) < 1) continue;
      const hit = conflictOf(layout, a.route, me.route);
      if (hit && a.s < hit.a && hit.a - a.s < APPROACH) { st.gaps++; st.judging = key; break; }
    }
  } else if (!atLine && st.judging && !st.judging.startsWith(`${k}|${path.from}|`)) st.judging = null;
  return st;
}

/* Per minute of the player's time. */
export function encounterSummary(st) {
  const min = Math.max(st.t, 1e-9) / 60;
  const r = (x) => Math.round(x * 10) / 10;
  return { minutes: r(min), metPerMin: r(st.met.size / min), followingShare: r((100 * st.following) / Math.max(st.t, 1e-9)), followedShare: r((100 * st.followed) / Math.max(st.t, 1e-9)), gapsPerMin: r(st.gaps / min), overtookPerMin: r(st.overtook / min), overtakenPerMin: r(st.overtaken / min), mergesPerMin: r(st.merges / min) };
}
