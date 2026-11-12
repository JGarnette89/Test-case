/* =====================================================================
   THE PLAYER ON THE MAP: an ordinary member of the traffic, driven
   from the two controls, with THE TURN SIGNAL AS THE TURN COMMIT.

   SIMULATOR.md 1.1. On the road the player steers for real -- a bend
   turns under a straight wheel. Turns at intersections are committed
   to, not steered: the player INDICATES, any time before the stop
   line, and the car takes that corner along the arc the model builds;
   no signal means straight on, which is the project's own rule for
   directions (CLAUDE.md: silence means straight on) and what a driver
   does. Once past the line the turn is locked -- the sim's own
   commitment at the launch (crossing.js). In the exam mode the same
   act is "turn left at the next street", which is why this control
   was chosen; but it is built to feel like driving first, and the
   second life is a dividend.

   The player is an actor in the crossing world, so everybody else
   yields to them, follows them and waits for them by the same rules
   as for anybody; the world decides nothing FOR them -- their speed
   and line come from the slider and the wheel (sim/player.js), and
   their route from the signal. Pure: the screen owns the state.
   ===================================================================== */
import { stepPlayerOn, newPlayer, cornerSpeedFor, stopBand, slowBand, holdBand, sliderFor, accelFor, PULL, INOPERABLE, damagedTop, reversePull, stepReverse, REV_DWELL } from "./player.js";
import { inLaneOf } from "./occupancy.js";
import { whatStops, poseOf, AT_LINE, entryOf } from "./crossing.js";
import { REACTION_FLOOR } from "../core/perception.js";
import { HARSH_AT, wantedGap, stoppingRoom } from "./traffic.js";
import { poseOnGraph, intentOf, normDeg, curbLegOf, exitRouteInto, exitAlong, exitSAt, approachAlong, approachSAt } from "./graph.js";
import { poseAt } from "./intersection.js";
import { CAR, DT } from "./traffic.js";
import { placeOf, laneIndexOf, approachNeighbours } from "./placement.js";
import { lenOf, STANDSTILL } from "./traffic.js";
import { playerPoseOn } from "./pose.js";
import { locate, lanesAt } from "./locate.js";
import { pavedAt } from "./surface.js";
import { judgeTurn, yawRateFor, V_MAX, BACK_V } from "./player.js";

const LANE = 3.6;
const LAUNCHED = 1.5;        // m/s: moving off, as crossing.js has it
const AT_REST = 0.3;

/* THE EXIT A SIGNAL MEANS. Among the routes out of the leg the player
   arrives on: with a signal, the exit of that kind whose turn is
   nearest a right angle -- a five-way may offer two lefts, and the one
   a driver means by "left" is the one that is most a left; with no
   signal, or with none of that kind, the exit nearest straight ahead.
   A T with no straight-ahead and no signal takes the gentlest turn,
   because the road has to go somewhere. */
export function routeForSignal(layout, from, signal) {
  const routes = layout.routesFrom(from);
  const turnOf = (r) => normDeg(layout.legs[layout.paths[r].to].bearing - (layout.legs[from].bearing + 180));
  if (signal) {
    const want = signal === "left" ? -90 : 90;
    const same = routes.filter((r) => layout.paths[r].intent === signal);
    /* Nearest a right angle; two equally far from it, the gentler. */
    if (same.length) return same.sort((a, b) => (Math.abs(turnOf(a) - want) - Math.abs(turnOf(b) - want)) || (Math.abs(turnOf(a)) - Math.abs(turnOf(b))))[0];
  }
  return routes.slice().sort((a, b) => Math.abs(turnOf(a)) - Math.abs(turnOf(b)))[0];
}

/* A player standing at the start of a route, at rest. */
export function playerAt(course, k, route) {
  return { ...newPlayer(0, 0, 0), id: "player", player: true, n: -1, k, route, leg: 0, signal: null, stoppedAt: null, going: false, accepted: false, contacts: 0 };
}

/* THE PLAYER'S HORN: aimed at whoever is holding them up -- the car in front
   if it is moving or alone, else the driver the queue has already counted
   in the way (its `grudge`, crossing.js), else the head of the stopped
   queue in front. A
   horn at nobody still sounds. The sim wakes a driver who has not noticed
   their green when a horn is aimed at them, the player's like any other. */
export function playerHonk(me, world) {
  const ws = whatStops(me, world);
  const byId = new Map(world.actors.map((a) => [a.id, a]));
  let c = ws.leader?.k != null ? byId.get(ws.leader.id) : null;
  if (c?.grudge && byId.has(c.grudge)) return { honkAt: world.t, honkTo: c.grudge };
  /* ...or the head of the stopped queue in front, walked car to car: from
     behind a queue, a horn is at whoever is at its front, before the queue
     itself has counted them in the way. */
  for (let n = 0; c && (c.v ?? 0) < 0.5 && n < 30; n++) { const next = c.leadId != null ? byId.get(c.leadId) : null; if (!next || (next.v ?? 0) >= 0.5 || next.id === me.id) break; c = next; }
  return { honkAt: world.t, honkTo: c ? c.id : null };
}

/* The player at the start of a road, in its curb lane, with no signal. */
export function playerOn(course, roadId, end, opts) {
  const at = curbLegOf(course, roadId, end, opts);
  if (!at) return null;
  /* A curb lane with no movement out of it is nowhere to start: null, which the screen refuses in words (found by verify-start, 8 October). */
  const route = routeForSignal(course.at[at.k].layout, at.leg, null);
  if (!route || !course.at[at.k].layout.paths[route]) return null;
  return playerAt(course, at.k, route);
}

/* The geometry a path presents to the car model: its heading along,
   the road's edges either side of this lane's centre, and the box,
   where the committed arc is followed rather than driven. */
function geomOf(path, leg, lane = LANE) {
  /* Place across the approach, bays included (graph.js `pos`, `across`);
     the oncoming carriageway is the road's through lanes. With no bays
     these are exactly the lane and the lane count. */
  const mine = leg?.pos ?? leg?.lane ?? 0, count = leg?.lanes ?? 1, across = leg?.across ?? count;
  const [b0, b1] = [path.stopAt, path.clearAt];
  return {
    length: path.length,
    lane,
    turn: path.intent !== "straight",
    headingAt: (s) => poseAt(path, s).rot,
    /* The committed arc's curvature, read only inside the box, so the
       approach and the way out do not bleed into it. */
    arcAt: (s) => {
      const s0 = Math.max(b0, s - 1.5), s1 = Math.min(b1, s + 1.5);
      if (s1 - s0 < 0.5) return 0;
      return (normDeg(poseAt(path, s1).rot - poseAt(path, s0).rot) * Math.PI) / 180 / (s1 - s0);
    },
    /* The road's grade under the car, from the path's own elevation. */
    gradeAt: (s) => {
      const lo = Math.max(0, s - 2), hi = Math.min(path.length, s + 2);
      return hi > lo ? (zAlong(path, hi) - zAlong(path, lo)) / (hi - lo) : 0;
    },
    /* From this lane's centre: the lanes to the right of it and half of
       this one to the right edge; this half-lane, the lanes to the
       left and the whole oncoming carriageway to the left edge. */
    /* ...and on a one-way road there is no oncoming carriageway: the left edge is the road's own. */
    edges: { left: -(0.5 + mine + (leg?.oneWay ? 0 : count)) * lane, right: (across - mine - 0.5) * lane },
    box: [path.stopAt, path.clearAt],
  };
}

/* Elevation along a path, as poseOnGraph reads it. */
function zAlong(path, s) {
  const { pts, at } = path;
  let i = 1;
  while (i < at.length - 1 && at[i] < s) i++;
  const f = Math.max(0, Math.min(1, (s - at[i - 1]) / (at[i] - at[i - 1] || 1)));
  return (pts[i - 1].z ?? 0) + ((pts[i].z ?? 0) - (pts[i - 1].z ?? 0)) * f;
}

/* A LANE CHANGE, for the player: on the approach, a car that has moved
   more than half a lane sideways is on the next lane, and its route
   becomes that lane's -- the same kind of exit if that lane offers it,
   else straight on. `off` is re-based to the new lane's centre so the
   car does not move. Only before the line: past it the turn is
   committed, and on the way out the lane is the turn's. */
function laneChange(layout, me, path, course) {
  /* ON THE EXIT STRETCH (lanechange.js exitStep): the lane is the path's `to`
     leg, and the route becomes one into the next exit lane at the same
     distance remaining -- before, a player who steered across a line here
     moved the car but stayed in the old lane to everybody else. */
  if (me.s > path.clearAt + 1) {
    const outLeg = layout.legs[path.to];
    if (!outLeg || !layout.legAt) return me;
    const lane = LANE;
    /* RUN OUT OF ACCELERATION LANE (map/accel.js): past where it closes the
       lane is sliding onto the curb lane, and a player still in it is in the
       curb lane by the time it ends -- forced in, to everybody else too. */
    const forced = outLeg.accel && me.s > path.length - outLeg.accelEnd - 1;
    const d = forced ? -1 : me.off > lane / 2 ? 1 : me.off < -lane / 2 ? -1 : 0;
    if (!d) return me;
    const toLeg = layout.legAt(outLeg.base, (outLeg.pos ?? outLeg.lane) + d);
    if (!toLeg) return me;
    const route = exitRouteInto(layout, toLeg, path.intent, layout.legs[path.from]?.base);
    if (!route) return me;
    /* Level with the car along the road's centreline (graph.js exitAlong): on a bend, distance remaining is not level across lanes. */
    const al = exitAlong(course, me.k ?? 0, me.route, me.s);
    const target = layout.paths[route], s2 = al != null ? exitSAt(course, me.k ?? 0, route, al) : target.length - (path.length - me.s);
    if (s2 <= target.clearAt) return me;
    return { ...me, route, s: s2, off: forced ? me.off : me.off - d * lane, ...(forced ? { forcedIn: (me.forcedIn ?? 0) + 1 } : {}) };
  }
  const leg = layout.legs[path.from];
  if (!leg || me.s > path.stopAt) return me;
  const lane = LANE;
  const here = leg.pos ?? leg.lane;
  const d = me.off > lane / 2 ? 1 : me.off < -lane / 2 ? -1 : 0;
  if (!d) return me;
  const newLeg = layout.legAt ? layout.legAt(leg.base, here + d) : `${leg.base}#${leg.lane + d}`;
  if (!newLeg || !layout.legs[newLeg]) return me;
  const route = routeForSignal(layout, newLeg, me.signal);
  /* How far apart the two lanes really are here: a lane, except on a
     turn bay's taper -- and a bay not yet a whole lane out is not yet a
     lane to be in, so the car stays on its own until it is. */
  /* LEVEL WITH THE CAR ALONG THE ROAD'S CENTRELINE (graph.js approachAlong / approachSAt: the approach half of what the exit stretch above has always done). `s` is a distance along ONE lane, and on a bend the lanes are not the
     same length: the inner is shorter by a lane's width times the angle turned, so the same `s` on the next lane is a different place -- 3.3 m along and 0.6 m across after 63 degrees of bend, 5.6 m after 100 (the loop's own
     curves), the car drawn jumping on the lane change (tools/measure/lane-jump.mjs, 12 November, DECISIONS 10.70). On a straight road the two agree and nothing changes. */
  const al = approachAlong(course, me.k ?? 0, me.route, me.s), s2 = al != null ? approachSAt(course, me.k ?? 0, route, al) : null;
  const level = s2 != null && Number.isFinite(s2) && s2 >= 0 && s2 <= layout.paths[route].stopAt ? s2 : me.s;
  const a = poseAt(path, me.s), b = poseAt(layout.paths[route], level);
  const sep = Math.hypot(a.x - b.x, a.y - b.y);
  if ((leg.bay || layout.legs[newLeg].bay) && sep < 0.9 * lane) return me;
  return { ...me, route, s: level, off: me.off - d * (leg.bay || layout.legs[newLeg].bay ? sep : lane) };
}

/* ONE TICK OF THE PLAYER, in the world as it is: the car model along
   the current path, the signal read into the route while there is
   still time to change it, the handoff at the seam, and the fields the
   other drivers read (crossing.js: stopped when, committed yet). */
export function stepDriver(me, input, world, dt = DT) {
  if (!world.realPos) return stepOnRoute(me, input, world, dt);
  const next = me.noLane ? stepNoLane(me, input, world, dt) : settle(stepOnRoute(me, input, world, dt), world);
  return { ...next, shadows: shadowsOf(world.course, next) ?? undefined };
}

/* =====================================================================
   WHERE THE CAR'S BODY IS, FOR THE TRAFFIC (DECISIONS 10.68: the traffic
   perceives by geometry, not by lane membership; a car's presence in
   another driver's awareness follows its BODY, not its route).

   The traffic finds everybody through an index built from each actor's
   `(k, route, s)` (crossing.js relevanceOf). So the body is put into that
   index where it physically is: one STAND-IN per lane the body overlaps,
   at the body's place along that lane -- found by the locator at the
   body's middle, front and rear, without asking which way it points. No
   driver scans anything; this is one car's three queries a tick.

   - ON NO LANE: every lane under the body. The car's own actor is flagged
     `offLane` and the readers that find cars by route pass over it: THE
     GHOST IS GONE.
   - ON A LANE: NO STAND-IN, however far over a line the body is. That is
     the lane change's and `straddles`' (crossing.js), as it was -- one
     rule per case (the maintainer, 11 November; the earlier build also gave
     a stand-in over the centre line, and an ordinary driver touching it
     made the oncoming traffic brake: DECISIONS 10.68).
   - A STAND-IN HAS A PLACE, NOT A DIRECTION: its speed is the car's speed
     ALONG that lane, never less than nothing -- across a lane or against
     it, it is a stopped thing there (10.68 gap 3).
   - NOBODY YIELDS TO IT: `noRight` (crossing.js blockedBy). It is followed
     and stopped for, as a car in front is.

   LANES ONLY (10.69): inside a box there are no lanes and no stand-in.
   ===================================================================== */
const BODY_AT = 1.5;                         // m fore and aft of the middle where the body is asked about
const BODY_REACH = LANE / 2 + 0.9;           // a lane's half-width and the car's: the body is over the line
const laneIdOf = (course, c) => { const leg = course.at[c.k].layout.legs[c.leg]; return (c.part === "in" ? leg?.inLane?.id : leg?.outLane?.id) ?? `${c.k}|${c.part}|${c.leg}`; };
export function shadowsOf(course, me) {
  /* ONE RULE PER CASE (the maintainer, 11 November): a car still on a lane, even with its body over
     a line, is the existing rules' -- the lane change's and `straddles`' (crossing.js). A stand-in
     is for a car on NO lane only. */
  if (!me.noLane) return null;
  const pose = playerPoseOn(course, me), h = (pose.heading * Math.PI) / 180;
  const found = new Map();
  for (const d of [0, BODY_AT, -BODY_AT]) {
    const at = { x: pose.x + Math.cos(h) * d, y: pose.y + Math.sin(h) * d, z: pose.z, heading: pose.heading };
    for (const lane of lanesAt(course, at, { reach: BODY_REACH, aligned: false })) {
      const c = lane.names[0], id = laneIdOf(course, c);
      /* The middle's place along the lane where the middle is over it; else the end's. */
      if (!found.has(id)) found.set(id, { lane: id, k: c.k, route: c.route, s: c.s, v: Math.max(0, (me.v ?? 0) * Math.cos(c.psi)) });
    }
  }
  return found.size ? [...found.values()] : null;
}

function stepOnRoute(me, input, world, dt = DT) {
  const course = world.course;
  let { k, route } = me;
  let layout = course.at[k].layout;
  let path = layout.paths[route];

  /* THE SIGNAL PICKS THE EXIT, any time before the line. All routes out
     of a leg share the approach to the stop line, so switching between
     them there moves nothing; past the line the turn is committed. */
  if (me.s <= path.stopAt) {
    const want = routeForSignal(layout, path.from, me.signal);
    if (want !== route) { route = want; path = layout.paths[route]; }
  }

  /* DAMAGE (player.js): the car pulls, and past the limit will not drive. */
  const d = me.damage ?? 0;
  const driven = d > 0 ? { ...input, pull: (me.pull ?? 1) * PULL * d, slider: d >= INOPERABLE ? Math.min(input.slider, -0.4) : input.slider } : input;
  const geom = geomOf(path, layout.legs[path.from], world.road?.lane ?? LANE);
  /* THE GRASS, with the real position on (DECISIONS 10.67): on the route's own road as it always
     was, OR on any road's drawn surface -- pavement far from the route no longer drags. Not the
     drawn surface alone: it does not cover every committed arc (29 of 2132 points in test map 1's
     boxes lie off every ribbon, 10 November), and a car on its own turn is on the road. */
  if (world.realPos) {
    const onRoute = me.off >= geom.edges.left - 0.5 && me.off <= geom.edges.right + 0.5;
    geom.paved = onRoute || pavedAt(course, playerPoseOn(course, me)) === true;
  }
  let next = stepPlayerOn(me, driven, geom, dt);
  if (d > 0) next = { ...next, v: Math.min(next.v, damagedTop(d)) };
  /* REVERSE (player.js): a fresh pull to the bottom from a standstill. A car that will not go goes neither way. */
  const revFrom = reversePull(me, input.slider, world.t);
  const reversing = revFrom != null && world.t - revFrom >= REV_DWELL && (me.v ?? 0) <= 0.1 && d < INOPERABLE;
  next = reversing ? { ...next, ...stepReverse(me, input, geomOf(path, layout.legs[path.from], world.road?.lane ?? LANE), dt), revFrom } : { ...next, revFrom, backing: false };
  next = { ...next, k, route };
  /* Across into the next lane: the route becomes that lane's. */
  const wasRoute = route;
  next = laneChange(layout, next, path, course);
  /* When they last changed lane: being struck from behind just after is theirs (contact.js). */
  if (next.route !== wasRoute) next = { ...next, laneAt: world.t };
  route = next.route; path = layout.paths[route];

  /* Off the end of the path onto the next one, choosing by the signal;
     off the edge of the world, back onto the same road's start would be
     wrong, so the car stops at the end: `atEdge` for the screen. */
  let leg = me.leg ?? 0, atEdge = false;
  /* Backwards off the start of a path, onto the movement that leads to it; at the map's edge, the car stops. */
  if (next.s < 0) {
    const from = Object.entries(course.joins).find(([, j]) => j.k === k && j.side === path.from)?.[0];
    const sep = from ? from.indexOf("|") : -1;   // a side has a bar of its own
    const kBack = from ? Number(from.slice(0, sep)) : null, sideBack = from ? from.slice(sep + 1) : null;
    const there = from ? course.at[kBack].layout : null;
    const into = there && Object.keys(there.paths).filter((r) => there.paths[r].to === sideBack);
    const r = into && (into.find((x) => there.paths[x].intent === "straight") ?? into[0]);
    if (r) {
      next = { ...next, k: kBack, route: r, s: there.paths[r].length + next.s, stoppedAt: null, going: true, accepted: true };
      k = kBack; layout = there; route = r; path = there.paths[r]; leg = Math.max(0, leg - 1);
    } else next = { ...next, s: 0 };
  }
  if (next.s >= path.length) {
    const j = course.joins[`${k}|${path.to}`];
    if (!j) { next = { ...next, s: path.length, v: 0 }; atEdge = true; }
    else {
      const there = course.at[j.k].layout;
      const nextRoute = routeForSignal(there, j.side, me.signal);
      next = { ...next, k: j.k, route: nextRoute, s: next.s - path.length, stoppedAt: null, going: false, accepted: false };
      leg += 1;
      /* A signal is spent by the turn it caused. */
      if (me.signal && there.paths[nextRoute].intent === me.signal) next.signal = null;
      path = there.paths[nextRoute];
    }
  }

  /* What the others read. Stopped at the line: at rest within reach of
     it, remembered once. Committed: past the line, or moving off after
     a stop -- crossing.js's own definitions. */
  const waitAt = path.stopAt - CAR.length / 2;
  const nearLine = Math.abs(next.s - waitAt) < 2.5;
  const stoppedAt = next.stoppedAt ?? (next.v < AT_REST && nearLine ? world.t : null);
  const going = next.s > waitAt + 0.5 || (stoppedAt != null && next.v > LAUNCHED);

  /* THE STOP, JUDGED -- the brake's version of the turn verdict. The
     hardest the car braked on the way in is carried until it comes to
     rest; a stop that ends near a LINE (not behind a car) is then
     judged on the maintainer's own rule, MANNER BEFORE POSITION (CLAUDE.md,
     the three-way stop split): abrupt is braking, whatever the position;
     a controlled stop in the wrong place is short or over. `HARSH_AT`
     is the sim's own -- twice the comfortable rate. */
  let brakePeak = (next.a ?? 0) > 0.3 ? 0 : Math.max(me.brakePeak ?? 0, -(next.a ?? 0));
  let lastStop = me.lastStop ?? null, stops = me.stops ?? null;
  const cameToRest = (me.v ?? 0) >= AT_REST && next.v < AT_REST;
  const err = next.s - waitAt;
  /* Behind a car is not at a line: whoever is in front decides where
     you stop, and the line's verdict would be about their position. */
  const infront = world.actors.find((a) => a.id !== me.id && !a.shadow && (a.k ?? 0) === next.k && a.route && inLaneOf(layout, a, next.route) && a.s > next.s && a.s - next.s < CAR.length + 8);   // in my lane physically (occupancy.js)
  if (cameToRest && next.s < path.stopAt + 1 && err > -12 && !infront) {
    const verdict = brakePeak > HARSH_AT ? "harsh" : err > 0.3 ? "over" : err < -AT_LINE ? "short" : "clean";
    lastStop = { verdict, err, peak: brakePeak, at: world.t };
    stops = { ...(stops ?? {}), [verdict]: (stops?.[verdict] ?? 0) + 1 };
  }
  if (next.v > 1.0) brakePeak = 0;
  /* What they entered under (crossing.js `entryOf`), for who owed whom. */
  const entry = (me.k === next.k && me.s <= path.stopAt && next.s > path.stopAt) ? entryOf(world, next.k, path, stoppedAt) : next.entry;
  return { ...next, leg, atEdge, stoppedAt, going, accepted: going, yaw: (next.psi * 180) / Math.PI, brakePeak, lastStop, stops, ...(entry ? { entry } : {}) };
}

/* =====================================================================
   THE CAR'S REAL POSITION (DECISIONS 10.64 (b), 10.65, 10.67), behind
   `world.realPos`.

   The car is kept against its route, and nothing asked which road it was
   on. Three things here, and everything else is the stepping above,
   unchanged to the bit for a car that stays within a lane of its line:

   RE-LOCATED. More than a lane off its route's line -- the adjacent-lane
   re-base (laneChange) has had its chance -- the car is asked of the
   world (locate.js): the lane its centre is in and pointing along. Found,
   it is re-based onto that lane WITH ITS POSE UNMOVED.

   ON NO LANE. Not found, and past the narrow guard's own bound (player.js
   `lost`), its route no longer says where it is. Its pose is then kept IN
   THE WORLD (`at`: x, y, z, heading) and moved there by the speed and the
   wheel alone -- no assist, no committed arc, and the grass by what is
   under it -- and it is asked of the world again every tick until a lane
   takes it.

   WHAT THE TRAFFIC READS MEANWHILE IS NOT DECIDED HERE (10.66's named
   risk, 10.67 piece 4). The traffic finds the player by `(k, route, s)`.
   On no lane those are kept as HEAD keeps them: the route latched, `s`
   carried along it by the speed along it, the seams crossed by the signal.
   That is a ghost on the old lane, and it is what shipped before this.
   How the traffic should perceive a car on no lane is the maintainer's.
   ===================================================================== */
export const RELOCATE_BEYOND = LANE;   // m off the route's line before the world is asked: a whole lane, so the adjacent re-base goes first -- flagged

/* The name of a located lane this car takes: on an approach the route its signal means; past a
   box a route in from the road it came by, making the movement it made, where there is one. */
function nameFor(course, lane, me) {
  const layout = course.at[lane.k].layout;
  let route = null;
  if (lane.part === "in") route = routeForSignal(layout, lane.leg, me.signal);
  else {
    const was = lane.k === me.k ? course.at[me.k].layout.paths[me.route] : null;
    route = exitRouteInto(layout, lane.leg, was?.intent ?? "straight", was ? layout.legs[was.from]?.base ?? null : null) ?? exitRouteInto(layout, lane.leg);
  }
  return lane.names.find((c) => c.route === route) ?? lane.names.find((c) => c.k === me.k && c.route === me.route) ?? lane.names[0];
}

/* Onto the lane found, the pose unmoved. What the others read is reset as at a seam: past a box
   the car is through it; on an approach it has yet to stop. */
function rebase(me, c, world) {
  const { at: _at, noLane: _n, ...rest } = me;
  const out = c.part === "out";
  return { ...rest, ...judgeTurn(me), k: c.k, route: c.route, s: c.s, off: c.off, psi: c.psi, yaw: (c.psi * 180) / Math.PI,
    lost: false, laneAt: world.t, relocated: (me.relocated ?? 0) + 1, stoppedAt: null, going: out, accepted: out, atEdge: false };
}

/* After a tick on the route: re-located, or put on no lane, or left as it is. */
function settle(next, world) {
  if (Math.abs(next.off) <= RELOCATE_BEYOND) return next;
  const course = world.course, pose = playerPoseOn(course, next);
  const lane = locate(course, pose, { prefer: { k: next.k, route: next.route } });
  if (lane) {
    const c = nameFor(course, lane, next);
    /* The lane it is already on, by another name, is no move at all. */
    if (c.k === next.k && c.route === next.route) return next;
    return rebase(next, c, world);
  }
  if (!next.lost) return next;
  return { ...next, ...judgeTurn(next), noLane: true, at: pose, assist: 0 };
}

/* ONE TICK ON NO LANE: the pose moved in the world; the route's ghost carried as HEAD carries it. */
function stepNoLane(me, input, world, dt) {
  const course = world.course;
  let { k, route } = me, layout = course.at[k].layout, path = layout.paths[route];
  const d = me.damage ?? 0;
  const slider = d >= INOPERABLE ? Math.min(input.slider, -0.4) : input.slider;
  const wheel = input.steer + (d > 0 ? (me.pull ?? 1) * PULL * d : 0);
  const paved = pavedAt(course, me.at) === true;
  const revFrom = reversePull(me, input.slider, world.t);
  const reversing = revFrom != null && world.t - revFrom >= REV_DWELL && (me.v ?? 0) <= 0.1 && d < INOPERABLE;
  let a = accelFor(slider, me.v, 0) - (paved ? 0 : 1.5);
  let v = Math.max(0, Math.min(paved ? V_MAX : V_MAX / 4, me.v + a * dt));
  if (d > 0) v = Math.min(v, damagedTop(d));
  let h = (me.at.heading * Math.PI) / 180, move = v;
  if (reversing) { h -= yawRateFor(input.steer, BACK_V) * dt; move = -BACK_V; v = 0; a = 0; }
  else h += yawRateFor(wheel, v) * dt;
  const at = { x: me.at.x + move * Math.cos(h) * dt, y: me.at.y + move * Math.sin(h) * dt, z: me.at.z ?? 0, heading: (h * 180) / Math.PI };
  /* THE GHOST (see above: not a decision): along the latched route by the speed along it. */
  const rot0 = poseAt(path, Math.min(me.s, path.length)).rot;
  let s = me.s + move * Math.cos(((at.heading - rot0) * Math.PI) / 180) * dt, leg = me.leg ?? 0, signal = me.signal;
  if (s < 0) s = 0;
  if (s >= path.length) {
    const j = course.joins[`${k}|${path.to}`];
    if (!j) s = path.length;
    else {
      const there = course.at[j.k].layout, nextRoute = routeForSignal(there, j.side, me.signal);
      s -= path.length; k = j.k; route = nextRoute; layout = there; path = there.paths[nextRoute]; leg += 1;
      if (me.signal && path.intent === me.signal) signal = null;
    }
  }
  /* `off` and `psi` say where the car is against the ghost, for anybody who still reads them; the pose is `at`. */
  const g = poseOnGraph(course, k, route, Math.min(s, path.length)), gh = (g.rot * Math.PI) / 180;
  const off = -(at.x - g.x) * Math.sin(gh) + (at.y - g.y) * Math.cos(gh);
  const psi = (normDeg(at.heading - g.rot) * Math.PI) / 180;
  const moving = Math.abs(input.steer - (me.steer ?? input.steer)) > 0.001;
  let next = { ...me, k, route, s, off, psi, v, a, at, leg, signal, grade: 0, lat: 0, assist: 0, lost: true, noLane: true, steer: input.steer, slider: input.slider,
    handsOff: Math.abs(input.steer) > 0.05 || moving ? 0 : (me.handsOff ?? Infinity) + dt, revFrom, backing: reversing, yaw: (psi * 180) / Math.PI, atEdge: false,
    noLaneFor: (me.noLaneFor ?? 0) + dt };
  /* Asked of the world again: a lane that takes it ends this. */
  const lane = locate(course, at);
  if (lane) return rebase(next, nameFor(course, lane, next), world);
  /* What the others read of the ghost, by crossing.js's own definitions (stepOnRoute's tail). */
  const waitAt = path.stopAt - CAR.length / 2;
  const stoppedAt = (k === me.k ? me.stoppedAt : null) ?? (v < AT_REST && Math.abs(s - waitAt) < 2.5 ? world.t : null);
  const going = s > waitAt + 0.5 || (stoppedAt != null && v > LAUNCHED);
  return { ...next, stoppedAt, going, accepted: going };
}

/* THE PLAYER, CARRIED `carry` SECONDS PAST THE TICK, THE WAY THE TICK MOVES IT (player.js stepPlayerOn: psi += psiDot dt, s += v cos(psi) dt, off += v sin(psi) dt). The screen draws between ticks; it carried only `s`, so `off` and `psi`
   were held still for 50 ms and then stepped, twenty times a second, on the car in the middle of the screen (up to 208 mm sideways and 0.8 degrees of heading a tick in a steered weave at 80 km/h; tools/measure/player-carry.mjs, 13 November,
   DECISIONS 10.70). ONE IMPLEMENTATION: the same arithmetic as the tick, for a part of a tick, used by the picture and the camera that follows it. On no lane the pose is kept in the world (`at`) and is not carried, as before. */
export function carriedPlayer(me, carry) {
  if (!carry || me.noLane) return me;
  const psi = me.psi + (me.psiDot ?? 0) * carry;
  return { ...me, psi, s: me.s + me.v * Math.cos(psi) * carry, off: me.off + me.v * Math.sin(psi) * carry };
}

/* THE PLAYER'S POSE IN THE WORLD, with the height of the road under
   them: the path's pose at their distance along, offset by their line. */
export function driverPose(me, course) {
  return playerPoseOn(course, me);   // the one place (pose.js); the traffic's poseOf reads it too
}

/* PUTTING THE PLAYER IN THE WORLD, CLEAR -- wherever they start. A start
   is a place in an already-running world: the traffic has been warmed up,
   and the player appears among it standing still. Nothing may already be
   where they appear, and nothing may be able to reach them before they
   have had any chance to act: a collision on the first frame is made
   impossible here, by construction, rather than unlikely (8 October: the
   endless highway's slip road is where its traffic enters the map, the
   warm-up had left a car standing on the start, and the player appeared on
   top of it). Stage 1's `clearAround` (iso/world.js) did this for the
   wheel screen's one road and was never carried to the map; this is the
   one place every map start goes through (MapRoad `sceneFor`).
   - NO ONE NEAR: any road user within START_NEAR of the player, whatever
     lane or path it is on -- the body of a car beside them, a queue they
     would be standing in.
   - NO ONE ABLE TO REACH THEM: a road user travelling the same way behind
     them, within what it needs to stop for a car standing there -- its
     reaction, its comfortable stop from its own speed and its own gap --
     measured in the plane, so a car across a seam (the lane belongs to the
     intersection before) is found as surely as one on the same path.
   They are taken off the map before it starts, as a world that had never
   put them there; the spawner already leaves room for the player
   (crossing.js `joinAt`), so nobody new arrives on top of them either. */
export const START_NEAR = 12;   // m: a car's length and a half each way and the lanes either side
export function placePlayer(world, me) {
  const p = driverPose(me, world.course);
  const h = (p.heading * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h);
  const clearOf = (a) => {
    const q = poseOf(world, a), dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
    if (Math.abs((q.z ?? 0) - p.z) > 4) return true;   // a deck above or a road beneath
    if (d < START_NEAR) return false;
    const along = dx * fx + dy * fy, across = Math.abs(-dx * fy + dy * fx);
    const sameWay = Math.cos((((q.rot ?? q.heading ?? 0) - p.heading) * Math.PI) / 180) > 0.7;
    if (!sameWay || along >= 0 || across > 2 * LANE) return true;
    const v = a.v ?? 0, brake = a.brake ?? 2.7;
    const reach = v * REACTION_FLOOR + stoppingRoom(v, brake) + wantedGap({ ...a, v }, { v: 0 }) + CAR.length;
    return -along > reach;
  };
  return withDriver({ ...world, actors: world.actors.filter((a) => a.player || clearOf(a)) }, me);
}

/* The world with the player written in as an actor everybody else can
   see, replacing the last tick's copy. */
export function withDriver(world, me) {
  const others = world.actors.filter((a) => !a.player);
  /* With the real position on: where the body is, for the traffic (shadowsOf).
     The player's own actor stays first of the player's, so whoever looks for
     "the player" finds the car and not a stand-in. */
  if (!me.noLane && !me.shadows) return { ...world, actors: [...others, me] };
  const real = playerPoseOn(world.course, me);
  const stand = (me.shadows ?? []).map((sh, i) => ({ id: `${me.id}~${i}`, player: true, shadow: true, shadowOf: me.id, noRight: true, n: -1,
    k: sh.k, route: sh.route, s: sh.s, v: sh.v, a: 0, off: 0, psi: 0, yaw: 0, noLane: true, at: real,
    stoppedAt: null, going: sh.v > 1.5, accepted: sh.v > 1.5, signal: null, honkAt: me.honkAt ?? null }));
  return { ...world, actors: [...others, me.noLane ? { ...me, offLane: true } : me, ...stand] };
}

/* What the player is about to do, for the screen to say so: the kind
   of turn the current route takes at the node ahead, its name, and --
   when the signal asks for a turn this lane cannot make -- which lane
   to move to. */
/* WHAT THE PLAYER MUST STOP FOR, AND WHERE: the same `whatStops` the
   traffic obeys -- a stop sign until they have stopped, a red, an amber
   they can still make, a car with the right of way, or a car standing
   in front of them -- so the marker on the slider can never ask for a
   stop the rules do not, or miss one they do. A moving leader is
   following, not stopping, and gets no marker. Null when nothing is to
   be stopped for, or it is still far enough off not to matter yet. */
export function stopFor(me, world) {
  if (!world || (me.v ?? 0) < 0.3) return null;
  /* The player is judged as a COMPETENT driver would be: caution 1, the
     sim's ordinary headway. They carry no rating of their own. */
  const view = whatStops({ ...me, caution: me.caution ?? 1, headway: me.headway ?? 1.6 }, world);
  if (!view.leader || (view.leader.v ?? 0) > 0.5) return null;
  const line = view.leader.id === "line";
  const d = line ? view.gap : view.gap - wantedGap({ v: 0 }, { v: 0 });
  if (!(d > 0) || d > Math.max(15, 2.5 * stoppingRoom(me.v))) return null;
  const band = stopBand(me.v, d, me.grade ?? 0, AT_LINE);
  return band && { ...band, d, line, kind: "stop" };
}

/* OR A CORNER TO SLOW FOR: when nothing is to be stopped for and the
   committed route turns, the pressure that brings the car to the
   corner's clean speed at the start of the arc. This is the turn's
   presentation fixed at the root (SIMULATOR.md 1.1.12): the maintainer
   found the speed advice "encourages a smooth turn but every
   intersection is a full stop" -- so where a stop comes first, the stop
   marker is shown and the corner advice is not, and where the car
   drives through, the corner has a marker exactly like a stop's. */
function cornerFor(me, course, stop) {
  if (stop || (me.v ?? 0) < 0.3) return null;
  const spot = course.at[me.k];
  if (spot.through) return null;
  const path = spot.layout.paths[me.route];
  if (path.intent === "straight" || me.s > path.stopAt) return null;
  const vc = cornerSpeedFor(geomOf(path, spot.layout.legs[path.from]));
  if (vc == null) return null;
  const d = path.stopAt - me.s;
  if (d > Math.max(15, 2.5 * stoppingRoom(Math.max(0, me.v - vc)) + 10)) return null;
  const band = slowBand(me.v, d, vc, me.grade ?? 0);
  return band && { ...band, d, vc, kind: "corner" };
}

/* THE FOLLOWING GAP, AS THE PLAYER CAN SEE IT (27 October, the
   maintainer: a headway readout on the throttle bar). Following too close
   is something an examiner marks, and the player had no way to see their
   own following distance. The time gap to the car ahead in the player's
   own lane: clear road bumper to bumper over the player's speed -- the
   time until their front reaches where the car ahead's rear is now, which
   is how the two-second rule is counted.

   THE CAR AHEAD IN THE LANE, by the two rules the sim follows by, not
   `whatStops`' leader -- that is whatever presses hardest, a stop line or a
   car crossing the intersection, and neither is a car being followed. The
   nearer of: the lane index (placement.js `neighboursAt`), every car in
   the player's lane by its place along the road, whatever node it is on;
   and the queue by the rule (`approachNeighbours`), every car from the
   player's own approach by distance along its own path -- through the box
   and past where an exit splits, where the lane index sees nobody. The
   first version read the lane index alone and went blank whenever either
   car was in a box: on the highway, at every merge and diverge, which is
   where a following gap matters most (tools/measure/headway-trace.mjs, held
   car by car against the cars' poses). Still blank: a car beyond the next
   intersection while the player has not reached it.

   Never a car ALONGSIDE: a changer counts in both its lanes while it
   moves across (the sim's rule), and one beside the player overlaps them
   along the road -- the nearest ahead by place, at a negative gap, hid the
   car really ahead behind it. And never a car that has taken another exit:
   the queue rule keeps cars from one approach together past where an
   off-ramp splits; the player is not following a car on the ramp.

   FOR SWIMMING TRAFFIC FIRST (the maintainer, 27 October: "to help with
   following the car ahead, when waiting for gaps in traffic to appear when
   swimming traffic on the highway"): the follow target on the throttle bar
   (followTarget, below) and the time to the car ahead. A gauge of the gap
   was built first and replaced the same day -- he wanted a control aid,
   not a readout. `lengths` and `inside` stay for the fault (10.24-10.25).

   FOLLOWS TOO CLOSELY, RULED (DECISIONS 10.24): inside 0.75 car lengths --
   CAR.length 4.5 m, so 3.375 m of clear road -- FOR 2-3 SECONDS. The 2-3 s
   is how long the gap is held, NOT the gap: the real rule's 2-3 s gap
   "won't play well on a screen". Above FOLLOW_FLOOR only: below it a sound
   driver's own following gap is inside the threshold, so closing up there is
   normal, not careless. The readout shows the threshold and says when the
   player is inside it above the floor; marking it waits on how the guide
   sections it (10.18). SHOWN_UNDER and MOVING are display constants: past
   five seconds nobody is following anybody, and under 2 m/s the time gap of
   a queue creeping forward means nothing. */
export const FOLLOWS_CLOSE = 0.75 * CAR.length;   // m, bumper to bumper: 3.375
/* THE SPEED BELOW WHICH CLOSING UP IS NORMAL: where a sound driver's own
   chosen gap -- STANDSTILL + speed x HEADWAY, the following model at
   caution 1 with nobody closing (traffic.js wantedGap) -- is exactly
   FOLLOWS_CLOSE. 1.96 m/s, 7.1 km/h. Asked of the model itself (its gap
   beyond standstill at 1 m/s is the sound headway in seconds), so it moves
   if the model, the standstill gap or the threshold does. */
export const FOLLOW_FLOOR = (FOLLOWS_CLOSE - STANDSTILL) / (wantedGap({ v: 1 }, { v: 1 }) - STANDSTILL);
const SHOWN_UNDER = 5;   // s
const MOVING = 2;        // m/s
export function headwayOf(me, world) {
  if (!world || !me || (me.v ?? 0) < MOVING) return null;
  const at = placeOf(world.course, me.k ?? 0, me.route, me.s);
  let inLane = null;
  if (at) {
    const xs = laneIndexOf(world).get(at.lane) ?? [], half = lenOf(me) / 2;
    for (const e of xs) {
      if (e.a.id === me.id || e.a.shadowOf === me.id || e.c <= at.c) continue;
      const clear = e.c - at.c - half - lenOf(e.a) / 2;
      if (clear >= 0 && (!inLane || clear < inLane.clear)) inLane = { car: e.a, clear };
    }
  }
  const L = world.course.at[me.k ?? 0].layout, mine = L.paths[me.route];
  const q = approachNeighbours(world, me).ahead;
  const inQueue = q && q.clear >= 0 && (L.paths[q.car.route]?.to === mine.to || q.car.s < L.paths[q.car.route]?.clearAt) ? q : null;
  /* The same car by both: the queue's gap, which is along the paths the two
     drive. Just past a box onto an acceleration lane the lane index put the
     player ~4 m further along than their path does (2.1 m against the poses'
     6.5, 27 October) -- noted in SIMULATOR 1.2.19, not chased here. */
  const ahead = inLane && inQueue && inLane.car.id === inQueue.car.id ? inQueue : [inLane, inQueue].filter(Boolean).sort((x, y) => x.clear - y.clear)[0];
  if (!ahead) return null;
  const secs = ahead.clear / me.v;
  if (secs >= SHOWN_UNDER) return null;
  /* Closing: how much faster than the car ahead, m/s (negative: dropping back). */
  return { secs, clear: ahead.clear, id: ahead.car.id, lengths: ahead.clear / CAR.length, closing: me.v - (ahead.car.v ?? 0), vAhead: ahead.car.v ?? 0, inside: ahead.clear < FOLLOWS_CLOSE && me.v >= FOLLOW_FLOOR };
}

/* THE FOLLOW TARGET ON THE THROTTLE BAR (the maintainer, 27 October,
   replacing the gauge: "something similar to where it shows you to hold
   your throttle to maintain speed, the follow indicator would eventually
   settle within this holding zone once you have matched speed with the car
   ahead"). A control aid, read by where the thumb is, not a number.

   THE SPEED TO HOLD is the car ahead's while there is room behind them,
   and less once the player is inside a sound driver's following gap at
   their speed (traffic.js wantedGap, caution 1), so the gap opens again
   over T_BACK. The target is the pressure that reaches that speed over
   MATCH_T -- never later than the brake's one mechanic allows (player.js
   stopBand): closing on them, at least the constant deceleration that
   brings the closing speed to zero by the time the room is used up,
   dv^2 / 2d. Within MATCHED of that speed the target IS the hold band: the
   settling he described.

   WHAT DID NOT WORK, so neither comes back (verify-headway, both before
   shipping): (1) the hold band asked at the car ahead's speed -- the band
   is a dead zone, anywhere in it the car keeps whatever speed it has, so a
   thumb held there stopped converging up to 6.4 m/s short; (2) dv^2 / 2d
   alone -- it only approaches their speed, so the player crept in at a
   hundredth of a metre a second inside the gap, and reached a standstill
   gap behind a slow car. Not drawn when there is a stop to make (the stop
   marker takes the band's place), nor when nobody is ahead. */
const MATCH_T = 3;      // s: how quickly the target asks for the speed to hold -- a flagged design constant
const T_BACK = 4;       // s: inside the gap, how quickly the target asks for it back -- flagged
const MATCHED = 0.3;    // m/s: within this of the speed to hold, the target is the hold band
export function followTarget(me, hw) {
  if (!hw || !me) return null;
  const v = me.v ?? 0, vA = Math.max(0, hw.vAhead), g = me.grade ?? 0, dv = v - vA;
  const room = hw.clear - wantedGap({ v: vA }, { v: vA });
  const vHold = Math.max(0, room >= 0 ? vA : vA + room / T_BACK);
  if (Math.abs(v - vHold) < MATCHED) return { ...holdBand(v, g), matched: true, can: true };
  let a = (vHold - v) / MATCH_T;
  if (dv > 0) a = Math.min(a, -(dv * dv) / (2 * Math.max(0.5, room)));
  const at = sliderFor(a, v, g);
  return { at, lo: at, hi: at, matched: false, can: accelFor(-1, v, g) <= a + 1e-9 };
}

export function aheadOf(me, course, world = null) {
  const spot = course.at[me.k];
  const path = spot.layout.paths[me.route];
  const stop = stopFor(me, world) ?? (world ? cornerFor(me, course, null) : null);
  if (spot.through) return { node: null, intent: "straight", committed: false, hint: null, stop };
  let hint = null;
  /* A RESTRICTED LANE, said aloud: with no signal on, the car means to go
     straight -- and a lane marked for a turn only will take that turn.
     The paint on the road says so too (graph.js lane arrows); this is
     the line under the speed saying it before the arrows are in view. */
  const legHere = spot.layout.legs[path.from];
  if (!me.signal && path.intent !== "straight" && me.s <= path.stopAt && legHere?.turns && !legHere.turns.includes("straight")
      && Object.values(spot.layout.paths).some((q) => q.intent === "straight" && spot.layout.legs[q.from]?.base === legHere.base)) {
    hint = `this lane is ${path.intent} turn only`;
  }
  if (me.signal && path.intent !== me.signal && me.s <= path.stopAt) {
    const leg = spot.layout.legs[path.from];
    const others = Object.values(spot.layout.legs).filter((l) => l.base === leg.base && l.id !== leg.id);
    const can = others.some((l) => spot.layout.routesFrom(l.id).some((r) => spot.layout.paths[r].intent === me.signal));
    hint = can ? `${me.signal} turns are from the ${me.signal === "right" ? "right" : "left"} lane` : `no ${me.signal} turn here`;
  }
  /* The speed the committed corner wants, for the screen to show
     beside the speed the car is doing. */
  /* No corner advice where a stop comes first: from rest the speed
     through the corner is the pull-away's, not the approach's. */
  const cornerSpeed = stop?.kind === "stop" ? null : cornerSpeedFor(geomOf(path, spot.layout.legs[path.from]));
  return { node: spot.node, intent: path.intent, committed: me.s > path.stopAt, toLine: Math.max(0, path.stopAt - me.s), hint, lane: spot.layout.legs[path.from]?.pos ?? spot.layout.legs[path.from]?.lane, lanes: spot.layout.legs[path.from]?.across ?? spot.layout.legs[path.from]?.lanes, cornerSpeed, stop };
}
