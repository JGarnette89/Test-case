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
import { stepPlayerOn, newPlayer, cornerSpeedFor } from "./player.js";
import { poseOnGraph, intentOf, normDeg, curbLegOf } from "./graph.js";
import { poseAt } from "./intersection.js";
import { CAR, DT } from "./traffic.js";

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

/* The player at the start of a road, in its curb lane, with no signal. */
export function playerOn(course, roadId, end) {
  const at = curbLegOf(course, roadId, end);
  if (!at) return null;
  return playerAt(course, at.k, routeForSignal(course.at[at.k].layout, at.leg, null));
}

/* The geometry a path presents to the car model: its heading along,
   the road's edges either side of this lane's centre, and the box,
   where the committed arc is followed rather than driven. */
function geomOf(path, leg, lane = LANE) {
  const mine = leg?.lane ?? 0, count = leg?.lanes ?? 1;
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
    edges: { left: -(0.5 + mine + count) * lane, right: (count - mine - 0.5) * lane },
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
function laneChange(layout, me, path) {
  const leg = layout.legs[path.from];
  if (!leg || me.s > path.stopAt) return me;
  const lane = LANE;
  let to = null;
  if (me.off > lane / 2 && leg.lane + 1 < leg.lanes) to = leg.lane + 1;
  else if (me.off < -lane / 2 && leg.lane > 0) to = leg.lane - 1;
  if (to == null) return me;
  const newLeg = `${leg.base}#${to}`;
  if (!layout.legs[newLeg]) return me;
  const route = routeForSignal(layout, newLeg, me.signal);
  return { ...me, route, off: me.off - (to - leg.lane) * lane };
}

/* ONE TICK OF THE PLAYER, in the world as it is: the car model along
   the current path, the signal read into the route while there is
   still time to change it, the handoff at the seam, and the fields the
   other drivers read (crossing.js: stopped when, committed yet). */
export function stepDriver(me, input, world, dt = DT) {
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

  let next = stepPlayerOn(me, input, geomOf(path, layout.legs[path.from], world.road?.lane ?? LANE), dt);
  next = { ...next, k, route };
  /* Across into the next lane: the route becomes that lane's. */
  next = laneChange(layout, next, path);
  route = next.route; path = layout.paths[route];

  /* Off the end of the path onto the next one, choosing by the signal;
     off the edge of the world, back onto the same road's start would be
     wrong, so the car stops at the end: `atEdge` for the screen. */
  let leg = me.leg ?? 0, atEdge = false;
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
  return { ...next, leg, atEdge, stoppedAt, going, accepted: going, yaw: (next.psi * 180) / Math.PI };
}

/* THE PLAYER'S POSE IN THE WORLD, with the height of the road under
   them: the path's pose at their distance along, offset by their line. */
export function driverPose(me, course) {
  const p = poseOnGraph(course, me.k, me.route, Math.min(me.s, course.at[me.k].layout.paths[me.route].length));
  const h = (p.rot * Math.PI) / 180;
  return { x: p.x - Math.sin(h) * me.off, y: p.y + Math.cos(h) * me.off, z: p.z ?? 0, heading: p.rot + (me.psi * 180) / Math.PI };
}

/* The world with the player written in as an actor everybody else can
   see, replacing the last tick's copy. */
export function withDriver(world, me) {
  const others = world.actors.filter((a) => !a.player);
  return { ...world, actors: [...others, me] };
}

/* What the player is about to do, for the screen to say so: the kind
   of turn the current route takes at the node ahead, its name, and --
   when the signal asks for a turn this lane cannot make -- which lane
   to move to. */
export function aheadOf(me, course) {
  const spot = course.at[me.k];
  const path = spot.layout.paths[me.route];
  if (spot.through) return { node: null, intent: "straight", committed: false, hint: null };
  let hint = null;
  if (me.signal && path.intent !== me.signal && me.s <= path.stopAt) {
    const leg = spot.layout.legs[path.from];
    const others = Object.values(spot.layout.legs).filter((l) => l.base === leg.base && l.id !== leg.id);
    const can = others.some((l) => spot.layout.routesFrom(l.id).some((r) => spot.layout.paths[r].intent === me.signal));
    hint = can ? `${me.signal} turns are from the ${me.signal === "right" ? "right" : "left"} lane` : `no ${me.signal} turn here`;
  }
  /* The speed the committed corner wants, for the screen to show
     beside the speed the car is doing. */
  const cornerSpeed = cornerSpeedFor(geomOf(path, spot.layout.legs[path.from]));
  return { node: spot.node, intent: path.intent, committed: me.s > path.stopAt, toLine: Math.max(0, path.stopAt - me.s), hint, lane: spot.layout.legs[path.from]?.lane, lanes: spot.layout.legs[path.from]?.lanes, cornerSpeed };
}
