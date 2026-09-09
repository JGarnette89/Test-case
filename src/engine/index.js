/* =====================================================================
   THE CONFLICT ENGINE
   Pure simulation. No React, no SVG, no colours, no DOM — so it can run in
   a test harness, and so a 3D renderer can sit on top of the same numbers
   a 2D one does.

   The rule this file exists to enforce: the answer is never authored.
   `legalAt` is derived by walking footprints through the intersection until
   nothing conflicts. If a scenario needs a different window, move the
   arrival times, not this file.
   ===================================================================== */

/* =====================================================================
   RIGHT OF WAY — conflict edition.

   The window does not open when the other car leaves the intersection.
   It opens when your path stops conflicting with theirs. Two cars going
   straight from opposite legs never conflict at all — you go together.

   Which makes the other car's INTENT the thing you have to read. Signals
   help. Signals also lie, and plenty of drivers never touch them.
   ===================================================================== */

import {
  linePath, quadPath, polyPath, turnPoints, poseOn, approachFrom, brakingApproach,
  approachDecel, approachSpeed, approachDecelAt, advance,
  pathLength,
  accelProfile, cruiseProfile, yieldingProfile, progressAt, speedAt,
  lerp, angleTo, quadAt as quad,
} from "./paths.js";
import {
  SIDES, RIGHT_OF, OPPOSITE, INTENTS, crossSpec, specOf,
  stopPoint, exitPoint, exitSideFor, boxHalf, roadHalf,
} from "./road.js";
import { GRACE } from "./score.js";

const SCALE = 20;
const M = (v) => v * SCALE;
const W = 720, H = 720, CX = 360, CY = 360;
const LANE = M(3.6), HALF = LANE, OFF = LANE / 2;

const CAR_L = M(4.5), CAR_W = M(1.8);
const PED_R = M(0.5);

/* --- where the road furniture sits ----------------------------------
   Distances out from the centre of the intersection, in the order a
   driver meets them coming the other way: stop line, crossing, then the
   box itself.

   Setback is how far outside the box the crossing sits; overhang is how
   far past the road edge it runs, since a crossing does not stop at the
   curb. BAR_HALF is half the depth of one painted bar.                  */
const PED_SETBACK = M(0.95);
const PED_OVERHANG = 30;
const BAR_HALF = M(0.75);
/* The line sits just outside the crossing and hard against the edge of the
   intersection — that is where a driver actually meets it, level with the sign
   rather than a car length before it. Everything else is measured off it:
   the sign stands at it, and SET puts a bumper behind it. */
const STOP_LINE_AT = HALF + PED_SETBACK + BAR_HALF + M(0.35);

/* How far out a waiting car's CENTRE rests.

   This has to account for the car being 4.5 m long. Sized as a setback
   for a point — which it was, at 26 — the centre sits just outside the
   box and the nose ends up 0.95 m INSIDE it, past the crossing and well
   past the stop line. So: far enough out that the front bumper comes to
   rest just behind the line, which is where a car actually stops.       */
const STOP_GAP = M(0.2);
const SET = STOP_LINE_AT - HALF + CAR_L / 2 + STOP_GAP;

/* --- roundabout ------------------------------------------------------
   Ontario drives on the right, so traffic circulates counterclockwise and
   a vehicle entering yields to traffic already going round — which reaches
   it from the left. Entering never has priority over circulating, whoever
   arrived first. That last part is the whole difference from a four-way
   stop, and it is a rule, not an emergent property of the footprints.

   Single lane only. A multi-lane roundabout adds which-lane-for-which-exit,
   and that is a different lesson.

   On screen y grows downwards, so counterclockwise motion is a DECREASING
   angle. Get that backwards and the traffic goes round the wrong way while
   still looking plausible.                                                */
const RA_OUTER = M(12);          // inscribed circle: 24 m across
const RA_ISLAND = M(7);          // central island
const RA_LANE = (RA_OUTER + RA_ISLAND) / 2;   // circulating lane centreline
const RA_SPEED = M(7);           // ~25 km/h, what a single-lane roundabout holds you to
const RA_ENTRY_ANGLE = { E: 0, S: 90, W: 180, N: 270 };
// Exits, counted the way a driver counts them: first exit is a right turn.
const RA_QUARTERS = { right: 1, straight: 2, left: 3 };
const RA_SET = M(2);      // give-way line, set back from the inscribed circle
const RA_BLEND = 18;      // degrees of arc traded for a curve in and out

/* Signalling out of a roundabout is best practice and not common practice,
   so the indicator cannot be the thing the game asks you to read. The line
   the car takes is: a driver about to leave drifts to the outside of the
   circulating lane before the exit, and one staying in holds the inner
   line. That is a real tell, it is geometry rather than a script, and the
   conflict engine works out what it costs on its own.

   Kept small on purpose. It has to be readable without being a caption. */
const RA_EXIT_DRIFT = M(0.9);   // how far out they ease before leaving
const RA_EXIT_TELL = 46;        // degrees before the exit that the drift starts
// You indicate after the exit before yours, not half a lap early.
const RA_SIGNAL_LEAD = 1.2;

/* The give-way line. Not STOPS: that one is set for the cross layout and
   sits 4.9 m from the centre, which is inside a 24 m roundabout — a car
   would be parked on the island. Same shape, measured from the circle. */
const RA_STOPS = {
  S: { x: CX + OFF, y: CY + RA_OUTER + RA_SET, rot: -90 },
  N: { x: CX - OFF, y: CY - RA_OUTER - RA_SET, rot: 90 },
  W: { x: CX - RA_OUTER - RA_SET, y: CY + OFF, rot: 0 },
  E: { x: CX + RA_OUTER + RA_SET, y: CY - OFF, rot: 180 },
};

/* Leaving happens in the outbound lane — the mirror of the entry lane on
   the same leg. Running out along the leg centreline instead would put a
   departing car across the mouth of the entry beside it, and the engine
   would then quite correctly refuse to let anyone in behind it. */
const RA_EXITS = {
  S: { x: CX - OFF, y: CY + RA_OUTER + RA_SET, out: { x: CX - OFF, y: H + 80 } },
  N: { x: CX + OFF, y: CY - RA_OUTER - RA_SET, out: { x: CX + OFF, y: -80 } },
  W: { x: CX - RA_OUTER - RA_SET, y: CY - OFF, out: { x: -80, y: CY - OFF } },
  E: { x: CX + RA_OUTER + RA_SET, y: CY + OFF, out: { x: W + 80, y: CY + OFF } },
};

const RA_SIDE_AT = { 0: "E", 90: "S", 180: "W", 270: "N" };
const sideOfAngle = (deg) => RA_SIDE_AT[((deg % 360) + 360) % 360];
// Yield envelope. Padding is mostly lengthwise: you need clear road ahead of
// and behind a car crossing your path, but one passing in the opposite lane
// at 3.6 m of lateral separation is not in your way at all.
const PAD_LONG = M(2.4), PAD_LAT = M(0.55);
// A vehicle already rolling also claims the road in front of it. That is what
// makes turning across an oncoming stream a conflict even when the arithmetic
// says you would squeak through — and it costs nothing against a stopped car.
const LOOKAHEAD = 0.9, MAX_CLAIM = M(18);

const TIE = 0.35;
/* GRACE moved to ./score.js — it never gated a footprint, only a verdict. */

/* =====================================================================
   HOW FAST ANYBODY ACTUALLY MOVES
   These replace a table of fixed traversal times (straight 1.5s, left
   2.1s, ...). That table had two things wrong with it, and both were
   measured rather than suspected:

   A car left the stop line at a constant 72 km/h with no acceleration —
   0 to 72 in no time at all — and because the time was fixed rather than
   derived, a car crossing a six-lane arterial travelled further in the
   same 1.5s and therefore moved FASTER (89 km/h) than one crossing two
   lanes. The arterial scenario's own lesson says "crossing takes longer
   here than it feels like it should", which the engine then contradicted.

   So speed is stated and time is derived. A car pulling away from a stop
   accelerates; a car that never stopped is already at speed.

   ACCEL is a brisk-but-ordinary pull-away. The cruise figures are what a
   vehicle actually settles at through an intersection, not what it would do
   on the open road — you are through the box long before an urban limit
   is reached, and a turn is taken slower than a straight-through.       */
const ACCEL = M(2.4);          // ~2.4 m/s^2 away from a stop
const TURN_ACCEL = M(2.0);     // a little gentler, because you are also steering
const V_STRAIGHT = M(11.5);    // ~41 km/h once clear of the box
const V_LEFT = M(7.2);         // ~26 km/h through a left
const V_RIGHT = M(6.2);        // ~22 km/h through a tighter right
/* A vehicle that is not stopping arrives at the speed it will carry
   through. Through traffic on a road with no sign for it runs faster
   than anything pulling away from a line ever reaches. */
const V_THROUGH = M(12.5);     // ~45 km/h
/* Running to a call, but through an intersection it still has to clear as it
   comes — real crews slow hard for one rather than trusting the siren, and
   a vehicle doing 54 km/h past a stop line is on screen for well under a
   second, which is not something a player could be asked to read. Faster
   than ordinary through traffic, slow enough to see coming. */
const V_EMERGENCY = M(10);     // ~36 km/h
/* A rolling stop: not a stop, a crawl. ~12 km/h — slow enough that the
   driver plainly meant to comply and fast enough that they plainly did
   not. A chosen number like LATE_SIGNAL_LEAD, and for the same reason:
   the lesson is "you did not stop", never a gotcha about how slow counts. */
const V_ROLL = M(3.4);

/* How a car arrives at a line it has to stop at: at the road's speed,
   braking at a comfortable rate. `approachSpeed` is the road's, and a
   participant may carry its own so the world can hand down the character
   of the road it is on — index.js has no idea whether this is a
   residential street or an arterial, and should not have to guess. */
const approachOf = (p, mv) => {
  /* Everybody comes in at the road's speed. What they shed on the way
     depends on what they are about to do: a car that stops sheds all of
     it, one that rolls through sheds only the difference between the road
     and the corner it is about to take. */
  const end = p.stops === false || p.rolledThrough ? (mv?.traverse?.profile?.v ?? 0) : 0;
  /* YOU SLOW FOR THE CORNER, NOT FOR NOTHING. A car carrying straight
     through at its own speed has no reason to shed any, whatever that
     speed is — which matters for an emergency vehicle, whose cruise is
     its travel speed rather than a corner it is about to take. Making it
     brake to that speed on the way in put it further back and it stopped
     being on screen in time to read. */
  const v = p.approachSpeed ?? (
    p.stops === false
      ? (p.intent === "straight" ? end : V_THROUGH)
      : V_STRAIGHT
  );
  /* How hard they brake is a property of the DRIVER, not of the road.
     `brakeFactor` is how a braking-control failure expresses: 1 is the
     comfortable rate the geometry derives, 3 is standing on the pedal. */
  return { v: Math.max(v, end), a: approachDecel(V_STRAIGHT) * (p.brakeFactor ?? 1), end };
};

/* HOW FAST IS THIS ROAD USER, AT ANY INSTANT OF ITS JOURNEY. One answer
   covering all three phases — running in, held at the line, and away —
   rather than a caller differencing two poses and hoping the join between
   phases is smooth.

   This is the API the motion model exists to have. Speed was previously
   recoverable only by finite differences, which is how 1.84g went
   unnoticed for the life of the project: nothing ever asked a car how
   fast it was going, so nothing could be surprised by the answer. The
   manner of a stop, the roughness of a departure, the closing speed
   behind a fault — all of them read from here.

   Metres per second, because a speed in engine pixels is a number nobody
   can sanity-check by eye. */
export function speedOf(p, t) {
  const mv = movementOf(p);
  const arriveAt = p.arriveAt ?? 0;
  if (t < arriveAt) {
    const ap = approachOf(p, mv);
    return approachSpeed(t, arriveAt, ap.v, ap.a, ap.end) / SCALE;
  }
  if (t < (p.departAt ?? arriveAt)) return 0;          // held at the line
  const k = progressAt(mv.traverse, t - (p.departAt ?? arriveAt));
  if (k >= 1) return 0;                                 // gone
  return speedAt(mv.traverse.profile, t - (p.departAt ?? arriveAt)) / SCALE;
}

/* How hard they are braking on the way in, in m/s^2. THE POINT OF THE
   WHOLE MOTION REWRITE: the MANNER of a stop is a quantity now, which is
   what the maintainer's discriminator between a braking fault and a
   knowledge one reads — controlled-but-misplaced against abrupt. */
export function approachDecelOf(p, t) {
  const arriveAt = p.arriveAt ?? 0;
  if (t >= arriveAt) return 0;
  const ap = approachOf(p, movementOf(p));
  return approachDecelAt(t, arriveAt, ap.v, ap.a, ap.end) / SCALE;
}

/* Kept as the narrower question, in terms of the general one. */
export const approachSpeedOf = (p, t) => (t >= (p.arriveAt ?? 0) ? null : speedOf(p, t));
const WALK = M(1.35);          // a real walking pace, ~4.9 km/h

/* The tightest a passenger car can steer, at full lock. A turn is never
   asked to be tighter than this, however badly it is being driven. */
const TURN_R_MIN = M(5.5);

/* How long after the button goes in before the walk signal actually
   changes. This is the whole point of the button: it is a tell with a
   lead time, so a driver who notices someone press it knows a crossing
   phase is coming and can decide to go NOW rather than discover it. Long
   enough that the graded window (GRACE, 2.6s) fits inside it — otherwise
   the phase would land mid-window and the player would be punished for
   taking time the scorer told them they had. */
const PED_BUTTON_WAIT = 6.0;

/* The profile a participant departs on: accelerating if it had stopped,
   already rolling if it never did. Intent picks the cruise figure, so a
   turn is slower than a straight both ways. */
const CRUISE = { straight: V_STRAIGHT, left: V_LEFT, right: V_RIGHT };
function motionOf(p) {
  /* THE ROAD'S OWN SPEED WHERE IT SAYS SO. A segment hazard sits on a
     residential street doing 30 km/h and its notional candidate was
     driving the engine's 45, so the stopping distance the scene was built
     around and the speed it was driven at were two different numbers --
     the same disagreement `driveThroughTiles` had before it read
     `tiles[i].speed`. Absent everywhere else, so nothing at an
     intersection moves. */
  const v = p.cruise ?? CRUISE[p.intent] ?? V_STRAIGHT;
  /* A car that never stopped carries the through speed, unless the road
     it is on has said what its speed is -- in which case that IS the
     through speed and V_THROUGH is the wrong number for it. */
  const through = p.cruise ?? (p.intent === "straight" ? V_THROUGH : v);
  const base = p.emergency ? cruiseProfile(p.intent === "straight" ? V_EMERGENCY : v)
    /* Required to stop and did not: they carry speed through the line
       rather than pulling away from rest, which is what makes it visible
       both before the line and after it. */
    : p.rolledThrough ? cruiseProfile(V_ROLL)
    : p.stops === false ? cruiseProfile(through)
    : accelProfile(p.intent === "straight" ? ACCEL : TURN_ACCEL, v);
  /* A road user who had to give way to somebody taking their space. Absent
     on every participant that has not been handed one, so this is inert
     for anything the reaction layer has not touched. See reaction.js —
     and note that the reaction is what the PLAYER sees, never what
     decides whether a fault happened. */
  return p.yielding ? yieldingProfile(base, p.yielding) : base;
}

const STEP = 0.05;

/* ---------------- geometry ---------------- */
/* The default four-way, derived from a road spec rather than stated. The
   numbers are identical — checked against the old tables in
   tools/probe/road.mjs — but it is now one instance of a general shape
   instead of the only shape there is. A T-intersection or a six-lane crossing
   is a different spec, not different code. */
const DEFAULT_ROAD = crossSpec();
/* A intersection is built around an origin. `at` defaults to the middle of the
   board, which is where every scenario has always put it, so nothing that
   omits it moves by a pixel. Passing one places the same intersection anywhere
   — verified translating exactly: the S-leg stop point sits at the same
   offset from its origin whether that origin is 360,360 or 4000,2500.

   This is what a continuous world needs and very nearly all it needs from
   the geometry: road.js was already written to take the origin, and only
   these helpers were holding it fixed. See WORLD-DESIGN.md. */
const stopFor = (spec, side, lane = 0, at) =>
  stopPoint(spec, side, LANE, SET, lane, at?.x ?? CX, at?.y ?? CY);
const exitFor = (side, lane = 0, at) =>
  exitPoint(side, LANE, lane, at?.x ?? CX, at?.y ?? CY);

const STOPS = Object.fromEntries(SIDES.map((s) => [s, stopFor(DEFAULT_ROAD, s)]));
const EXITS = Object.fromEntries(
  SIDES.map((s) => [
    s,
    Object.fromEntries(INTENTS.map((i) => [i, exitFor(exitSideFor(s, i))])),
  ])
);

/* lerp, quad and angleTo now live in paths.js, which is where the geometry
   went. Imported above rather than kept as a second copy. */

/* --- crossings -------------------------------------------------------
   A pedestrian stands on one leg's crosswalk, and which leg is given by
   the same `from` a car uses. Deriving the geometry from the side instead
   of pinning it to the north leg is what lets a crossing be rotated with
   the rest of the scene, and what lets one be generated at all.

   Setback and overhang are declared with the rest of the road furniture
   at the top of the file, because the stop line is placed against them. */
export function crossingOf(side, spec = DEFAULT_ROAD, at) {
  // Set back from THE BOX (see road.js), not a fixed one-lane guess at
  // it — a crossing on a six-lane arterial sits six lanes further out
  // than one on the default four-way, same as the stop line beside it.
  const { vx, hy } = boxHalf(spec, LANE);
  const CXa = at?.x ?? CX, CYa = at?.y ?? CY;
  // On the east and west legs the crosswalk runs north-south.
  const vertical = side === "E" || side === "W";
  if (vertical) {
    const x = side === "W" ? CXa - vx - PED_SETBACK : CXa + vx + PED_SETBACK;
    return {
      a: { x, y: CYa - hy - PED_OVERHANG },
      b: { x, y: CYa + hy + PED_OVERHANG },
      vertical: true, rot: 90,
    };
  }
  const y = side === "N" ? CYa - hy - PED_SETBACK : CYa + hy + PED_SETBACK;
  return {
    a: { x: CXa - vx - PED_OVERHANG, y },
    b: { x: CXa + vx + PED_OVERHANG, y },
    vertical: false, rot: 0,
  };
}

// Scenarios written before crossings were relative assumed the north leg.
const crossingFor = (p) => crossingOf(p.from ?? "N", p.road ?? DEFAULT_ROAD, p.at);

/* --- roundabout path -------------------------------------------------
   Give-way line, round the island, out the chosen exit — sampled as a
   polyline and walked by arc length rather than by a 0..1 parameter.
   Uniform speed matters: forwardClaim measures how much road a vehicle is
   claiming from how fast it is actually moving, so a path that secretly
   speeds up through the arc would claim road it has no business claiming.

   Cached per participant. earliestClear walks this thousands of times per
   scenario and the shape never changes once the traits are applied.       */
const raCache = new WeakMap();

function raPath(p) {
  const hit = raCache.get(p);
  if (hit) return hit;

  const enter = RA_ENTRY_ANGLE[p.from];
  const quarters = RA_QUARTERS[p.intent] ?? 2;
  const rad = (deg) => (deg * Math.PI) / 180;
  const onCircle = (deg, r = RA_LANE) => ({
    x: CX + Math.cos(rad(deg)) * r,
    y: CY + Math.sin(rad(deg)) * r,
  });

  const give = RA_STOPS[p.from];
  const bias = p.stopBias || 0;
  const gaRad = rad(give.rot);
  const gate = {
    x: give.x + Math.cos(gaRad) * bias,
    y: give.y + Math.sin(gaRad) * bias,
  };

  const exitAngle = enter - quarters * 90;
  const joinAt = enter - RA_BLEND;        // where you actually meet the lane
  const leaveAt = exitAngle + RA_BLEND;   // where you start peeling off

  /* Curve in and out rather than turning a corner at the curb. A corner
     would make the measured speed dip across the join, and forwardClaim
     reads speed to decide how much road a car is claiming — so a fake
     slowdown at the mouth would quietly shrink its claim. */
  const pts = [];
  const sampleQuad = (p0, p1, p2, n) => {
    for (let i = 0; i <= n; i++) pts.push(quad(p0, p1, p2, i / n));
  };

  sampleQuad(gate, onCircle(enter, RA_OUTER), onCircle(joinAt), 10);

  /* Round the island, counterclockwise: decreasing angle. The radius eases
     outward over the last stretch — that drift is the tell that this car is
     about to leave, and it is what a driver reads when no indicator comes. */
  const sweep = joinAt - leaveAt;
  const steps = Math.max(6, Math.round(sweep / 3));
  const tell = Math.min(RA_EXIT_TELL, sweep);
  for (let i = 1; i <= steps; i++) {
    const ang = joinAt - (sweep * i) / steps;
    const toGo = ang - leaveAt;
    const f = toGo < tell ? 1 - toGo / tell : 0;
    const eased = f * f * (3 - 2 * f);
    pts.push(onCircle(ang, RA_LANE + RA_EXIT_DRIFT * eased));
  }

  /* And out, in the outbound lane, past the frame so the car properly
     leaves. Starts at the drifted radius the arc actually ended on — start
     it back on the centreline and there is a kink there, which shows up as
     a speed dip and therefore as a false claim. */
  const peelIndex = pts.length;
  const leg = RA_EXITS[sideOfAngle(exitAngle)];
  sampleQuad(onCircle(leaveAt, RA_LANE + RA_EXIT_DRIFT), onCircle(exitAngle, RA_OUTER), leg, 10);
  pts.push(leg.out);

  // Cumulative arc length, for constant-speed lookup.
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  // Where the car actually starts to leave, so an indicator can be timed
  // against the exit rather than against entering the roundabout.
  const peelDist = cum[peelIndex];
  const path = { pts, cum, length: cum[cum.length - 1], gate, rot: give.rot, peelDist };
  raCache.set(p, path);
  return path;
}

/* How long this participant takes to clear, once moving. Comes off the
   path now rather than a table, so a layout that is neither a crossing
   nor a roundabout needs no special case here. */
export function spanOf(p) {
  return movementOf(p).traverse.duration;
}

/* =====================================================================
   MOVEMENTS
   Where a road user rests and the path it takes from there. One of these
   per participant, built once and cached, then walked by basePose.

   This is the seam. Everything downstream — conflicts, windows, sight,
   scoring, the renderer — only ever asks where somebody is at time t. So
   a new intersection type is a new builder here and nothing else: the rules
   layer never learns what shape the road was.
   ===================================================================== */
const moveCache = new WeakMap();

/* The four-way. Straight runs to its exit; a turn bends through a control
   point set off to the side, which is what turnBias widens. */
function crossMovement(p) {
  const spec = p.road ?? DEFAULT_ROAD;
  const base = stopFor(spec, p.from, p.lane ?? 0, p.at);
  const exit = p.exitAt
    ? p.exitAt
    : exitFor(exitSideFor(p.from, p.intent), p.exitLane ?? p.lane ?? 0, p.at);
  const rest = { ...advance(base, base.rot, p.stopBias || 0), rot: base.rot };

  const motion = motionOf(p);
  if (p.intent === "straight") {
    return { rest, traverse: linePath(rest, exit, motion) };
  }

  /* Where the two lane centrelines actually cross. A vertical approach
     holds its own x and takes the exit lane's y, and the other way round
     — that point is the corner the turn is built around. */
  const vertical = p.from === "S" || p.from === "N";
  const corner = vertical ? { x: rest.x, y: exit.y } : { x: exit.x, y: rest.y };

  /* The honest radius is exactly how far the car is standing from where
     those centrelines cross: turn on that and the arc finishes on the
     receiving lane. So a wider road, whose stop line sits further back,
     turns wider on its own, and a left — whose corner is across the
     intersection — comes out wider than a right. Nothing here is picked.

     `turnBias` is then how badly this driver takes it, in metres of
     finishing error: positive swings wide of the lane, negative cuts
     inside it. Floored at what a car can physically steer, however badly
     it is being driven. */
  const toCorner = Math.hypot(corner.x - rest.x, corner.y - rest.y);

  /* THE BIAS IS BOUNDED BY THE ROAD IT FINISHES ON. A wide turn swings
     into the far lane, and on a road with no far lane there is nothing to
     swing into: wideTurn's flat 4.5m put a car 2.70m PAST THE CURB on a
     single-lane left, which the maintainer reported as turns going
     "completely off the roadway". Measured, and it is exactly
     4.5 - (3.6 - 1.8): the bias was a fixed distance while the room for
     it is a property of the receiving road.

     So the room is derived the way the radius already is, from the
     carriageway the car is turning into. A positive bias swings AWAY from
     the centreline, so the room is what lies between the lane centre and
     that side's curb and nothing more -- there is no swinging into
     oncoming, which is the opposite direction.

     This is a floor under the geometry, not the fix. The fix is that
     wideTurn declines a road with no next lane at all, below: clamping
     alone would leave the car finishing exactly on the lane line while
     its tell claimed it had crossed one. */
  const exitVert = !vertical;
  const half = roadHalf(spec, exitVert ? "vert" : "horiz", LANE);
  const room = Math.max(0, half - LANE / 2);
  const bias = Math.min(p.turnBias || 0, room);
  const radius = Math.max(TURN_R_MIN, toCorner + bias);

  const pts = turnPoints(rest, corner, exit, radius);
  return { rest, traverse: polyPath(pts, motion, { rot0: base.rot }) };
}

/* =====================================================================
   EMERGING — a road user who starts stationary off the carriageway and
   joins it. The first genuinely new movement shape this engine has
   needed: everything else approaches, waits, or traverses, and all of
   those already existed.

   BUILT AS THE GENERAL CASE ON PURPOSE. A car reversing out of a bay is
   one instance; so is one pulling out of a parallel space, a delivery van
   moving off, and a car leaving a driveway. They share every property
   that makes them worth having:

     - the emerging driver's own view is obstructed
     - the candidate cannot see them until they MOVE
     - so the fault is purely one of ANTICIPATION -- did the candidate
       read the situation before it developed

   That last one is why this is the observation axis's content. Almost
   every other fault in the game needs a stop in order to happen; this one
   needs only that somebody was not looking.

   Naming it "the reversing car" would have been the two-implementations
   bug again, paid for the first time somebody wanted a van.

   THE GEOMETRY IS THE TURN GEOMETRY, not a new kind. An arc tangent to
   where the car is standing and to the lane it is joining, built around
   the point where those two headings cross -- exactly `turnPoints`, which
   is what an intersection turn already is. A perpendicular bay and a parallel
   space differ only in the resting heading.                            */
function emergeMovement(p) {
  /* `rest`, `into` and `onward` are OFFSETS within the scene; `at` is
     where the scene stands in the world, and placeScenario stamps it onto
     every participant. Reading the rest position out of `at` itself made
     those one field doing two jobs, so placing a scene moved the parked
     car onto the scene's own centre and the car and the road it was
     leaving only ever agreed on links that happened to run north. */
  const org = { x: p.at?.x ?? CX, y: p.at?.y ?? CY };
  const off = (q, dflt) => (q ? { ...q, x: org.x + q.x, y: org.y + q.y } : dflt);
  const rest = { ...off(p.rest, org), rot: p.restRot ?? 0 };
  const into = off(p.into, { x: rest.x, y: rest.y - M(20), rot: rest.rot });

  const toRad = (deg) => (deg * Math.PI) / 180;
  /* REVERSING IS A DIRECTION OF TRAVEL, NOT A DIFFERENT SHAPE. A car
     nose-in to a bay leaves it going BACKWARDS: the path runs opposite
     the way the car is pointing, and the car keeps pointing at the bay
     until it has swung round. Without this the arc is built forwards --
     into the curb -- and comes out crossing the centreline, which is what
     the first version did.

     It is also exactly why this hazard is worth having: a driver reversing
     cannot see, and neither can the candidate until the car moves. */
  const back = p.reversing ? -1 : 1;
  const inDir = { x: back * Math.cos(toRad(rest.rot)), y: back * Math.sin(toRad(rest.rot)) };
  const outDir = { x: Math.cos(toRad(into.rot)), y: Math.sin(toRad(into.rot)) };
  /* Where the two headings cross. Parallel headings have no corner, and
     the arc degenerates to the straight line turnPoints already returns. */
  const den = inDir.x * outDir.y - inDir.y * outDir.x;
  const corner = Math.abs(den) < 1e-6
    ? { x: (rest.x + into.x) / 2, y: (rest.y + into.y) / 2 }
    : (() => {
        const t = ((into.x - rest.x) * outDir.y - (into.y - rest.y) * outDir.x) / den;
        return { x: rest.x + inDir.x * t, y: rest.y + inDir.y * t };
      })();

  /* STRAIGHT OUT FIRST, THEN TURN, because a car cannot do it in one arc
     and pretending otherwise put it on the wrong side of the road.
     TURN_R_MIN is 5.5m -- a passenger car at full lock -- while a bay sits
     about 3m from the lane, so a single arc from a perpendicular space
     overshoots the centreline by 0.69m no matter where it is aimed. That
     is not a bug in the arc; it is why reversing out of a bay is a
     multi-point manoeuvre in life.

     So the emerging car clears its space along its own heading first, and
     only then swings into the lane. `clearBy` is the depth it has to get
     out of -- zero for a parallel space, where you simply pull forward. */
  const clearBy = p.clearBy ?? 0;
  const from = clearBy > 0
    ? { x: rest.x + inDir.x * clearBy, y: rest.y + inDir.y * clearBy, rot: rest.rot }
    : rest;
  const den2 = inDir.x * outDir.y - inDir.y * outDir.x;
  const corner2 = Math.abs(den2) < 1e-6
    ? { x: (from.x + into.x) / 2, y: (from.y + into.y) / 2 }
    : (() => {
        const t = ((into.x - from.x) * outDir.y - (into.y - from.y) * outDir.x) / den2;
        return { x: from.x + inDir.x * t, y: from.y + inDir.y * t };
      })();
  const radius = Math.max(TURN_R_MIN, Math.hypot(corner2.x - from.x, corner2.y - from.y));
  /* AND THEN THEY ARE TRAFFIC. The path used to stop at the merge point,
     so a car that pulled out in front of the candidate ceased to exist a
     few car lengths later -- measured, not one of 73 emergences ever made
     contact, because the thing that had joined the road was gone before
     anybody caught up with it. Somebody pulling out in front of you is a
     hazard precisely because you are now behind them. */
  const onward = off(p.onward, null);
  const pts = [
    ...(clearBy > 0 ? [rest] : []),
    ...turnPoints(from, corner2, into, radius),
    ...(onward ? [onward] : []),
  ];
  /* Drawn facing the way the car is pointing rather than the way it is
     going, for as long as it is going backwards. */
  /* Slow. Somebody easing out of a space is not accelerating like traffic,
     and the speed is what gives the candidate time to have noticed. */
  const motion = accelProfile(EMERGE_ACCEL, p.speed ?? EMERGE_SPEED);
  return {
    rest,
    traverse: polyPath(pts, motion, { rot0: rest.rot }),
    reversing: Boolean(p.reversing),
  };
}

/* How briskly somebody eases out of a space. Deliberately well under the
   2.4 m/s^2 a car pulls away from a stop line at: they are looking over a
   shoulder, and the whole point is that the candidate had time. */
const EMERGE_ACCEL = M(1.2);
const EMERGE_SPEED = M(4.0);

/* The roundabout, whose path was already a sampled polyline walked at a
   constant speed — the shape everything else is now expressed in. */
function roundaboutMovement(p) {
  const path = raPath(p);
  /* Accelerating away from the give-way line, then holding the
     circulating speed — which is the constant the arc was always walked
     at, and still is once the car is up to it. What changes is only the
     first second or so, where a car that has genuinely stopped no longer
     appears in the circle already doing 25 km/h. */
  const motion = p.stops === false ? cruiseProfile(RA_SPEED) : accelProfile(ACCEL, RA_SPEED);
  return {
    rest: { x: path.gate.x, y: path.gate.y, rot: path.rot },
    traverse: polyPath(path.pts, motion, { rot0: path.rot }),
  };
}

/* On foot: straight across the crossing, at a walking pace — and it is
   now genuinely a walking pace. The old fixed 3.4s crossing put someone
   across the default four-way at 3.0 m/s, which is a jog, and across a
   wider road faster still, because a fixed time over a longer crossing
   is a faster pedestrian. Both follow from stating the speed instead. */
function pedMovement(p) {
  const cr = crossingFor(p);
  const start = p.reverse ? cr.b : cr.a;
  const end = p.reverse ? cr.a : cr.b;
  return {
    rest: { x: start.x, y: start.y, rot: cr.rot },
    /* A pedestrian gives way by hesitating rather than by braking, which
       the same yielding profile expresses exactly: they hold at the curb,
       or stop mid-crossing, and their walk resumes at a walking pace.
       Absent unless the reaction layer handed them one. */
    traverse: linePath(
      { ...start, rot: cr.rot },
      end,
      p.yielding ? yieldingProfile(cruiseProfile(WALK), p.yielding) : cruiseProfile(WALK)
    ),
    onFoot: true,
  };
}

export function movementOf(p) {
  const hit = moveCache.get(p);
  if (hit) return hit;
  const mv = p.kind === "ped" ? pedMovement(p)
    : p.emerges ? emergeMovement(p)
    : p.layout === "roundabout" ? roundaboutMovement(p)
    : crossMovement(p);
  /* An emerging car is ALREADY THERE -- parked. It has no approach to
     spawn from, and giving it one would have it drive in off-board to its
     own space first. */
  mv.spawn = mv.onFoot || p.emerges ? null : approachFrom(mv.rest);
  moveCache.set(p, mv);
  return mv;
}

/* Position and heading of a road user at time t, before any driving traits. */
function basePose(p, t) {
  const mv = movementOf(p);

  if (mv.onFoot) {
    if (t < p.departAt) {
      // `pressed` is what the renderer lights the button on: they have
      // reached the curb and pushed it, and are now waiting for the walk
      // signal. Before arriveAt they are still walking up to it.
      return {
        ...mv.rest, hidden: t < p.arriveAt - 1.2, waiting: true, progress: 0,
        pressed: Boolean(p.button) && t >= p.arriveAt,
      };
    }
    const k = progressAt(mv.traverse, t - p.departAt);
    return { ...poseOn(mv.traverse, k), gone: k >= 1, progress: k };
  }

  if (t < p.arriveAt) {
    /* ONE MODEL FOR EVERY APPROACH: come in at the road's speed and shed
       only what you do not need. A car that stops sheds all of it; one
       with priority sheds the difference between the road and the corner
       it is about to take; a rolling stop sheds almost none, which is the
       ABSENCE that makes it readable before the line as well as after.

       A rolling car used to run the whole way in at the speed it would
       take the INTERSECTION at, which is why wontstop's tell inverted: a
       left-turner cruising in at 7.2 m/s was slower than a car braking
       from road speed for the first second and a half, so "that one is
       not slowing" read backwards exactly when it mattered. */
    const ap = approachOf(p, mv);
    return { ...brakingApproach(mv.rest, t, p.arriveAt, ap.v, ap.a, ap.end), approaching: true };
  }
  if (t < p.departAt) return { ...mv.rest, waiting: true };

  const k = progressAt(mv.traverse, t - p.departAt);
  const on = poseOn(mv.traverse, k);
  /* A reversing car points opposite its travel, until it is round. */
  return {
    ...on,
    ...(mv.reversing && k < 1 ? { rot: on.rot + 180 } : {}),
    gone: k >= 1,
    moving: true,
  };
}

/* ---------------- footprint overlap ----------------
   Oriented boxes, checked in both frames. Padding is applied lengthwise
   so that a car crossing your path blocks you, while one running parallel
   in the opposite lane does not.                                        */
/* =====================================================================
   DRIVING TRAITS
   Tells you can actually see. Each one bends the car's real behaviour, so
   the conflict engine works out the consequences on its own — a wandering
   car genuinely does intrude, rather than being scripted to punish you.
   ===================================================================== */
/* =====================================================================
   DRIVER SKILL

   A driver's composure right now, 0..1, where 1 is this driver at their
   best. Skill does NOT decide which faults a driver has — their traits
   do that, and a trait is a habit rather than a mistake. Skill decides
   how badly the habit shows.

   Kept as a multiplier anchored at 1 so `skill` absent, or 1, reproduces
   every existing scenario exactly. Nothing in the shipped set sets it,
   and nothing in the shipped set moves.

   The reason this exists: the examiner may stack directions to buy back
   their own attention, and stacking loads the candidate. A loaded driver
   is a worse driver. See directions.js, where that trade is measured.

   Note for whoever wires pressure into a live drive: the `pose` traits
   below read skill at pose time, so they respond immediately, but the
   `setup` traits are applied once in schedule(). Changing skill mid-drive
   means re-scheduling, not mutating a participant in place.            */
const SKILL_SPAN = 1.0;
const severityOf = (p) => 1 + (1 - (p.skill ?? 1)) * SKILL_SPAN;

const TRAITS = {
  wander: {
    tell: "Drifting inside its lane — never held a steady line",
    pose: (p, t, po) => {
      if (po.hidden) return po;
      /* A STOPPED CAR CANNOT WEAVE. Maintainer, on seeing it: the car
         "weaves back and forth in place while stopped, impossible."
         Drifting inside your lane is a lane-keeping failure and it needs
         forward motion to exist -- and the tell says as much, so applying
         it at rest was claiming something to the player that was not
         happening. The same guard `creep` has always had, for the mirror
         reason: creep only means anything while waiting, wander only
         means anything while moving. */
      if (po.waiting) return po;
      const amp = M(1.15) * severityOf(p), w = 1.75;
      const off = Math.sin(t * w + (p.phase || 0)) * amp;
      const r = (po.rot * Math.PI) / 180;
      return {
        ...po,
        x: po.x - Math.sin(r) * off,
        y: po.y + Math.cos(r) * off,
        rot: po.rot + Math.cos(t * w + (p.phase || 0)) * 6 * severityOf(p),
      };
    },
  },
  creep: {
    tell: "Never settled at the line — kept inching forward",
    pose: (p, t, po) => {
      if (!po.waiting) return po;
      const k = Math.max(0, Math.sin((t - p.arriveAt) * 2.1));
      const d = k * M(1.6) * severityOf(p);
      const r = (po.rot * Math.PI) / 180;
      return { ...po, x: po.x + Math.cos(r) * d, y: po.y + Math.sin(r) * d };
    },
  },
  overshoot: {
    /* Derived, not typed: enough to carry the nose from just behind the
       stop line to 0.6 m inside the box, because that is what the tell
       claims and a tell that is not true of the car is a lie to the
       player. A fixed 2.6 m stopped reaching once SET was corrected.

       Only for a driver who stops, and that is the same rule cutsCorner
       already lives under rather than a special case. stopBias shifts the
       origin of the traverse whether or not anyone braked, so on a road
       with no line a rolling driver picked up a visible, derivable fault
       whose tell said they had stopped past a line that was not there.
       Measured on a segment before this guard existed: 3.8s of it. */
    tell: "Stopped well past the line, nose already in the intersection",
    setup: (p) => {
      if (p.stops) p.stopBias = STOP_LINE_AT + STOP_GAP - HALF + M(0.6) * severityOf(p);
    },
  },
  slowStart: {
    /* "Their turn" is a queue word: a driver who never stopped never had
       one. Same guard, same reason. */
    tell: "Slow off the mark when it was clearly their turn",
    setup: (p) => { if (p.stops) p.startDelay = 1.7 * severityOf(p); },
  },
  wideTurn: {
    tell: "Swung wide through the turn, across the next lane",
    /* ONLY WHERE THERE IS A NEXT LANE TO SWING ACROSS. The tell says
       "across the next lane", and on a single-lane road there is no such
       lane: a flat 4.5m put the car 2.70m PAST THE CURB, which the
       maintainer reported as left turns going completely off the roadway.
       Clamping it to the curb instead only moved the lie -- the car then
       finished exactly on the lane line claiming to have crossed it.

       So this declines a narrow road the same way cutsCorner declines a
       right turn, and for the same stated reason: a trait may only fire
       where its tell is true. A trait whose setup writes unconditionally
       is claiming a consequence somewhere it does not happen. */
    setup: (p) => {
      const spec = p.road ?? DEFAULT_ROAD;
      const vertical = p.from === "S" || p.from === "N";
      const half = roadHalf(spec, vertical ? "horiz" : "vert", LANE);
      if (half - LANE / 2 < LANE) return;         // no next lane to reach
      p.turnBias = M(4.5) * severityOf(p);
    },
  },
  cutsCorner: {
    /* The fault every turn in this game used to commit by accident, back
       when a turn was one Bezier that did all its bending at the stop
       line. Now it only happens where a scenario asks for it, and the
       driver it belongs to is the one who does not go far enough into the
       intersection before turning.

       Left only, and that is the real rule rather than a shortcut. A left
       turns around a corner across the intersection, so there is a lot of
       radius to give away and the car ends up inside the receiving lane,
       over the centre it should have gone around — measured at 2.8 m. A
       right turns around the near curb, where the clean radius is already
       close to TURN_R_MIN: cutting it is not a bad habit, it is a steering
       lock the car does not have, so the floor absorbs the bias and the
       tell would be claiming a fault nobody could see. */
    tell: "Cut the corner — turned inside the center of the intersection",
    setup: (p) => { if (p.intent === "left") p.turnBias = -M(2.6) * severityOf(p); },
  },
  rollingStop: {
    /* THE ONE THAT OWNED THE RESIDUAL COLLISIONS. Measured: for a blind,
       bold candidate, 100% of the contacts the reaction layer could not
       prevent came from a departure with essentially no dwell at the
       line. That is not overconfidence — it is not stopping — and caution
       was deliberately left untuned rather than dialled up to absorb a
       fault belonging to a different axis.

       Only where there was something to stop for. It also only SHOWS
       where the candidate did not have to wait anyway: if traffic holds
       them they come to rest like everybody else, which is correct. */
    tell: "Did not stop — carried speed straight through the line",
    setup: (p) => { if (p.stops) p.rolledThrough = true; },
  },
  harshStop: {
    /* THE MANNER OF THE STOP, which is the maintainer's discriminator
       between a braking fault and a knowledge one. Position is untouched:
       they arrive exactly where they should, having got there in a way
       that would put a passenger through the windscreen. This is what the
       approach rewrite made expressible — before it every car in the game
       braked at 1.84g, so there was no controlled stop for an abrupt one
       to be abrupt relative to. */
    tell: "Braked hard for the line, far harder than the situation asked",
    setup: (p) => { if (p.stops) p.brakeFactor = 3; },
  },
  brakesTooLate: {
    /* Abrupt AND past the line: they left it far too late, stood on the
       brakes, and still ended up in the box. Writes stopBias, so it cannot
       coexist with overshoot — you do not drift past gently and slam past
       hard at the same time, and masks() derives that rather than being
       told. */
    tell: "Left the braking far too late — hard on the anchors and still into the box",
    setup: (p) => {
      if (!p.stops) return;
      p.brakeFactor = 3.2;
      p.stopBias = STOP_LINE_AT + STOP_GAP - HALF + M(0.5) * severityOf(p);
    },
  },
  stopsShort: {
    /* The other end of overshoot, and the second thing braking can say.
       Writes the same stopBias, so a driver cannot be fitted with both —
       masks() derives that rather than being told. */
    tell: "Stopped well short of the line, nowhere near a view of the road",
    setup: (p) => { if (p.stops) p.stopBias = -M(3.2) * severityOf(p); },
  },
  noSignal: {
    /* lateSignal says the indicator came too late to be worth anything.
       This says it never came at all, which is a different failure and a
       heavier one: there was nothing to read rather than something read
       too late. Only where there was a signal owed. */
    tell: "Turned without signalling at all",
    setup: (p) => { if (p.intent && p.intent !== "straight") p.signal = null; },
  },
  lateSignal: {
    tell: "Indicated barely before turning — nothing like the 2-3 seconds it owed you",
    setup: (p) => { p.signalLead = LATE_SIGNAL_LEAD / severityOf(p); },
  },
};

/* One seeded random source for the whole engine. mulberry32, and it was
   written out identically in four separate files before this — the exact
   duplication the project treats as a bug arriving early. Its first draw
   is well distributed for small seeds, which a plain LCG's is not: a
   naive one written for candidate.js returned ~0.236 for every seed in
   sequence, so a 15% branch taken on the first draw never fired once in
   200 candidates. */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* The one list of what habits exist. compose.js used to keep a literal
   copy of this and generate.js keeps a deliberate SUBSET (it predates
   wideTurn and cutsCorner and is the pre-flip driver mode's pool); a
   second copy of the full set is how a new trait gets forgotten by one
   generator and not the other. */
const TRAIT_KEYS = Object.keys(TRAITS);

const traitTells = (p) => (p.traits || []).map((k) => TRAITS[k]?.tell).filter(Boolean);

/* Full pose: base motion with every trait layered on top. */
function poseAt(p, t) {
  let po = basePose(p, t);
  const tr = p.traits;
  if (tr) for (let i = 0; i < tr.length; i++) {
    const fn = TRAITS[tr[i]]?.pose;
    if (fn) po = fn(p, t, po);
  }
  return po;
}
/* Signalling is modelled as lead time — how long before the manoeuvre the
   indicator comes on — because that is what a driver actually judges.

   Proper practice is 2-3 seconds before a change of direction or before
   stopping at the line. A late signaller sits outside that, but is NOT so
   late that it is a trick: the tell has to be readable, or the scenario
   punishes attentiveness instead of assumption. The lesson is "do not
   commit on an absent indicator", not "gotcha".                          */
const PROPER_SIGNAL_LEAD = 2.5;
const LATE_SIGNAL_LEAD = 0.8;

function signalShowing(p, t) {
  if (!p.signal) return false;
  const lead = p.signalLead ?? (p.layout === "roundabout" ? RA_SIGNAL_LEAD : PROPER_SIGNAL_LEAD);
  // In a roundabout the indicator is about leaving, not about entering.
  const at = p.layout === "roundabout" && p.kind !== "ped"
    ? raExitTime(p)
    : (p.departAt ?? 0);
  return t >= at - lead;
}

/* The moment a circulating car begins to peel off for its exit. */
export function raExitTime(p) {
  return (p.departAt ?? 0) + raPath(p).peelDist / RA_SPEED;
}

/* A pedestrian on a crossing holds the NEAR half, not the whole thing —
   a legal rule, not a geometry problem, same as before, just narrower.
   Past the midpoint they are on the side serving the opposing direction
   of traffic, clear of the lanes a driver on this side would actually
   use, and real drivers take the lane once it opens rather than waiting
   for someone who has already left their side of the road.

   `pose.progress` is the same k basePose already derived from poseOn —
   0 at the start of the crossing, 1 at the far end, direction-aware
   (walking `reverse` is baked in), so this needs no geometry of its own
   and works the same on a wide crossing as a narrow one. */
const PED_HOLDS_UNTIL = 0.5;

/* Somebody standing at the curb with the button pressed is NOT on the
   crossing, and holds none of it. The signal has not changed yet; traffic
   keeps moving, which is exactly what happens at a real push-button
   crossing and exactly what makes the press worth reading — it is a
   warning about a phase that is coming, not the phase itself.

   Without this a waiting pedestrian would block from the moment they
   became visible, and the button would be indistinguishable from them
   simply walking out: same block, just announced earlier. */
const holdsCrossing = (p, pose) =>
  p.blockUntilClear && !(p.button && pose.waiting) && (pose.progress ?? 0) < PED_HOLDS_UNTIL;

function extentsFor(p, pose, padL, padW, claim, mode) {
  if (p.kind === "ped") {
    if (mode === "yield" && holdsCrossing(p, pose)) {
      const cr = crossingFor(p);
      const len = Math.hypot(cr.b.x - cr.a.x, cr.b.y - cr.a.y);
      return { hl: len / 2 + padW, hw: M(1.3) + padW };
    }
    return { hl: PED_R + padW, hw: PED_R + padW };
  }
  return { hl: CAR_L / 2 + padL + claim / 2, hw: CAR_W / 2 + padW };
}
function poseFor(p, pose, claim, mode) {
  if (p.kind === "ped" && mode === "yield" && holdsCrossing(p, pose)) {
    const cr = crossingFor(p);
    return { x: (cr.a.x + cr.b.x) / 2, y: (cr.a.y + cr.b.y) / 2, rot: cr.rot };
  }
  if (!claim) return pose;
  const r = (pose.rot * Math.PI) / 180;
  return { ...pose, x: pose.x + Math.cos(r) * (claim / 2), y: pose.y + Math.sin(r) * (claim / 2) };
}
/* How much road ahead of itself a vehicle is claiming, from how fast it
   is actually going. Still sampled from the poses rather than read off
   the profile: a trait can bend the path (wander swings the body about,
   creep shuffles it forward while nominally stopped), and what is
   claimed should follow the car that is really being driven, not the
   idealised one. With real acceleration this finally discriminates —
   a car just off the line claims a couple of metres, not the ceiling. */
function forwardClaim(p, t) {
  if (p.kind === "ped") return 0;
  if (p.stops && t < p.departAt) return 0;
  const a = poseAt(p, t), b = poseAt(p, t + 0.06);
  const speed = Math.hypot(b.x - a.x, b.y - a.y) / 0.06;
  return Math.min(speed * LOOKAHEAD, MAX_CLAIM);
}
// Separating-axis test on two oriented boxes. Checking each frame separately
// is not enough once one box is stretched out by a forward claim.
const axesOf = (rot) => {
  const r = (rot * Math.PI) / 180;
  return [{ x: Math.cos(r), y: Math.sin(r) }, { x: -Math.sin(r), y: Math.cos(r) }];
};
const dot = (u, v) => u.x * v.x + u.y * v.y;
function boxesOverlap(pa, ea, pb, eb) {
  const A = axesOf(pa.rot), B = axesOf(pb.rot);
  const d = { x: pb.x - pa.x, y: pb.y - pa.y };
  for (const ax of [A[0], A[1], B[0], B[1]]) {
    const ra = ea.hl * Math.abs(dot(ax, A[0])) + ea.hw * Math.abs(dot(ax, A[1]));
    const rb = eb.hl * Math.abs(dot(ax, B[0])) + eb.hw * Math.abs(dot(ax, B[1]));
    if (Math.abs(dot(d, ax)) > ra + rb) return false;
  }
  return true;
}
function conflicts(pa, poseA, pb, poseB, padL, padW, claimB, mode) {
  const ea = extentsFor(pa, poseA, padL, padW, 0, mode);
  const eb = extentsFor(pb, poseB, padL, padW, claimB, mode);
  return boxesOverlap(poseFor(pa, poseA, 0, mode), ea, poseFor(pb, poseB, claimB, mode), eb);
}

/* ---------------- rules engine ---------------- */
function outranks(a, b) {
  /* An emergency vehicle on a call outranks everything, and it is checked
     before anything else so that nothing below can talk its way past it.
     This is a rule, not an emergent property of arrival order: it does not
     matter who reached the line first, which side anyone is on, or what
     priority a scenario stamped on somebody. You yield, and you go when it
     is safe — which is the whole of what the player has to do, so there is
     no new action to press. Two emergency vehicles fall through to the
     ordinary rules, which is as good an answer as any for a case that
     should not arise. */
  if (Boolean(a.emergency) !== Boolean(b.emergency)) return Boolean(a.emergency);
  if (a.priority != null || b.priority != null) return (a.priority ?? 0) < (b.priority ?? 0);

  /* At a roundabout there is no right-hand rule and no first-come order:
     whoever is already going round has priority over whoever is waiting to
     get in. Two vehicles both still at their give-way lines fall back to
     arrival order, which is the only thing left to separate them. */
  if (a.layout === "roundabout" || b.layout === "roundabout") {
    const aIn = a.departAt != null && a.departAt <= b.arriveAt;
    const bIn = b.departAt != null && b.departAt <= a.arriveAt;
    if (aIn !== bIn) return aIn;
  }

  const dt = a.arriveAt - b.arriveAt;
  if (dt < -TIE) return true;
  if (dt > TIE) return false;
  if (a.from === RIGHT_OF[b.from]) return true;
  if (b.from === RIGHT_OF[a.from]) return false;
  if (a.from === OPPOSITE[b.from]) {
    if (a.intent === "left" && b.intent !== "left") return false;
    if (b.intent === "left" && a.intent !== "left") return true;
  }
  return a.arriveAt <= b.arriveAt;
}

// Earliest departure with no yield-envelope breach against anyone already scheduled.
function earliestClear(p, scheduled, from) {
  const span = spanOf(p);
  for (let T = from; T < from + 14; T += STEP) {
    const trial = { ...p, departAt: T };
    let ok = true;
    for (let t = T; t <= T + span + 0.25 && ok; t += STEP) {
      const mine = poseAt(trial, t);
      if (mine.gone) break;
      for (const q of scheduled) {
        const theirs = poseAt(q, t);
        if (theirs.gone || theirs.hidden) continue;
        if (conflicts(trial, mine, q, theirs, PAD_LONG, PAD_LAT, forwardClaim(q, t), "yield")) { ok = false; break; }
      }
    }
    if (ok) return Math.round(T * 100) / 100;
  }
  return from;
}

/* Earliest departure that is not merely legally clear but literally safe
   against everyone — priors and non-priors alike, and safe for the whole
   GRACE stretch the scorer will call "good" from there, not just at the
   first instant that happens to be clear. That distinction is not
   academic: a window can open, close again as a second road user
   arrives, and reopen later, so the first T that tests clear is not
   necessarily safe to publish as the answer — the whole reason
   generate.js and compose.js sweep a range instead of trusting one
   instant (see their own comments). This is that same fix, promoted
   into the engine so a hand-authored scenario gets it for free.

   Iterative, not a single pass: candidate opens at `from`; if anything
   in [candidate, candidate+GRACE] collides, candidate jumps to one step
   past the LAST such instant and the whole stretch is checked again.
   Repeats until a full GRACE stretch comes back clean. A single pass
   bounded at from+GRACE is not enough by itself — once candidate moves
   past `from`, the stretch that actually needs checking moves with it,
   and a fixed bound can leave the far end of that new stretch
   unexamined. Caught for real while building the first scenario meant
   to use this: legalAt 1.5, one bounded pass said safe at 2.7, but nothing
   had checked past 4.1 (1.5+GRACE) even though the scored window from
   2.7 now reaches to 5.3.

   Capped at a handful of rounds so a pathological scenario cannot hang;
   a hand-authored scene needing more than that is describing something
   else and should be redesigned, not chased further here.

   For almost every scenario this equals legalAt exactly: a non-prior is
   only still in the way if it does not actually yield, and well-behaved
   traffic always does. It diverges only where a scenario deliberately
   authors a driver who does not stop despite having no right of way —
   see scenarios.js.

   The same crash-mode footprint test the generator audits a draw with
   (see generate.js, compose.js), promoted here so a hand-authored
   scenario gets to SCORE against it, instead of relying on a lesson
   nobody reads until after the crash. Also swept across creep depth for
   the same reason those two audits are: encroaches() only ever watches
   priors (creeping is a foul against traffic that has right of way, not
   against traffic that must yield to you — CLAUDE.md's rule, verbatim),
   so it cannot warn about creeping toward a road user this scenario is
   specifically about. safeAt has to cover what the fault cannot. */
function earliestSafe(p, everyone, from) {
  const span = spanOf(p);
  // Finer than STEP for this one check: the resolution floor CLAUDE.md
  // already accepts for footprints in general (STEP itself) is a real risk
  // here specifically, because a departure this test misses is not an
  // invisible-and-harmless effect, it is a hit the player was told was
  // safe. Caught for real: at STEP resolution a narrow collision window
  // sat squarely on top of a sample that read clear either side of it.
  //
  // That fine a resolution only for standing still, though — checked
  // directly against 3000 generated scenarios, STEP resolution never once
  // missed a creep-and-grace collision the finer one caught. So: MICRO
  // for creepSteps 0, the plain STEP*2 the generator audits already trust
  // for the 8 creep depths on top of it. Running all nine at MICRO made
  // verify-compose.mjs's own batch time out — correctness that costs the
  // workflow minutes stops getting run, which is its own kind of unsafe.
  const MICRO = STEP / 2;
  // M(0.9), matching PULL_STEP in sight.js exactly — not imported, since
  // sight.js already imports from this file and the reverse would cycle.
  // If PULL_STEP is ever retuned, this needs to move with it.
  const CREEP_STEP = M(0.9);
  const CREEP_DEPTHS_CHECKED = 8;
  const collidesAt = (T, creepSteps, resolution) => {
    const trial = { ...p, departAt: T, stopBias: (p.stopBias || 0) + creepSteps * CREEP_STEP };
    for (let t = T; t <= T + span + 0.3; t += resolution) {
      const mine = poseAt(trial, t);
      if (mine.gone) break;
      for (const q of everyone) {
        const theirs = poseAt(q, t);
        if (theirs.gone || theirs.hidden) continue;
        if (conflicts(trial, mine, q, theirs, 0, 0, 0, "crash")) return true;
      }
    }
    return false;
  };

  let candidate = from;
  for (let round = 0; round < 8; round++) {
    let lastUnsafe = candidate - MICRO;
    // The +1e-9 guards against float drift silently dropping the last
    // sample right at the boundary, which is exactly where a narrow
    // unsafe sliver hides — caught for real once, see generate.js.
    for (let T = candidate; T <= candidate + GRACE + 1e-9; T += MICRO) {
      if (collidesAt(T, 0, MICRO)) lastUnsafe = T;
    }
    for (let steps = 1; steps <= CREEP_DEPTHS_CHECKED; steps++) {
      for (let T = candidate; T <= candidate + GRACE + 1e-9; T += STEP * 2) {
        if (collidesAt(T, steps, STEP)) lastUnsafe = Math.max(lastUnsafe, T);
      }
    }
    if (lastUnsafe < candidate) return Math.round(candidate * 100) / 100;
    // A full STEP of margin past the last instant actually caught, not
    // one MICRO — the same resolution floor that motivated checking
    // finer in the first place is still there past this point too.
    candidate = Math.round((lastUnsafe + STEP) * 100) / 100;
  }
  return candidate;
}

/* What a trait's `setup` is allowed to write. Captured BEFORE the traits
   run so a trait-free twin of this participant can be reconstructed
   later — see cleanPose, and the comment there for why that is not the
   same thing as basePose. */
const SETUP_FIELDS = ["stopBias", "startDelay", "turnBias", "signalLead"];
const preTrait = new WeakMap();
const cleanTwins = new WeakMap();

function applyTraits(p) {
  const traits = p.traits || [];
  if (traits.length) {
    const before = {};
    for (const f of SETUP_FIELDS) before[f] = p[f];
    preTrait.set(p, before);
  }
  traits.forEach((k) => TRAITS[k]?.setup?.(p));
  return p;
}

/* This participant driving properly: every trait removed, both the kinds
   that bend the pose and the kinds that rewrote a parameter.

   NOT the same as basePose, and the difference caused a real bug. poseAt
   is basePose plus the `pose` traits (wander, creep), so basePose is
   clean of those — but the `setup` traits (overshoot, slowStart,
   wideTurn, cutsCorner) write stopBias / startDelay / turnBias, which
   movementOf reads, so basePose already CONTAINS their fault. Anything
   wanting a genuine control has to undo those too.

   The twin is cached because movementOf keys its own cache on object
   identity, and handing it a fresh object every call would rebuild the
   whole movement each time. */
function cleanTwin(p) {
  let twin = cleanTwins.get(p);
  if (!twin) {
    const before = preTrait.get(p) || {};
    twin = { ...p, ...before, traits: [] };
    /* startDelay is the odd one out: schedule() spends it into departAt
       rather than leaving it for movementOf, so clearing the field alone
       leaves the delay baked into a departure time that has already been
       computed. Wind it back by hand or slowStart becomes invisible to
       every control that uses this twin. */
    const spent = (p.startDelay || 0) - (before.startDelay || 0);
    if (spent && twin.departAt != null) twin.departAt = twin.departAt - spent;
    cleanTwins.set(p, twin);
  }
  return twin;
}

export function cleanPose(p, t) {
  if (!(p.traits || []).length) return basePose(p, t);
  return basePose(cleanTwin(p), t);
}

function schedule(participants) {
  participants.forEach(applyTraits);
  const rolling = participants.filter((p) => !p.stops);
  /* A pedestrian at a push button reaches the curb, presses, and then
     waits for the signal. The wait is the readable part — see
     PED_BUTTON_WAIT — so it belongs in the schedule rather than being
     faked by moving their arrival later, which would hide the press. */
  rolling.forEach((p) => {
    p.departAt = p.arriveAt + (p.startDelay || 0)
      + (p.button ? (p.buttonWait ?? PED_BUTTON_WAIT) : 0);
  });

  const queued = participants.filter((p) => p.stops)
    .sort((a, b) => (outranks(a, b) ? -1 : 1));

  const done = [...rolling];
  queued.forEach((p) => {
    /* `departOverride` is how a driver who decided for themselves gets to
       act on it: awareness.js works out when this candidate believes the
       road is clear, and stamps it. Absent on everyone else, so the
       schedule is exactly what it always was — and it is a REPLACEMENT
       rather than a floor, because the whole point is that a driver who
       has not registered the traffic goes EARLY. Resolved once, at
       composition time, like everything else. */
    // A distracted driver still has the right of way — they just sit on it.
    const clear = p.departOverride != null ? p.departOverride : earliestClear(p, done, p.arriveAt);
    p.departAt = Math.max(clear, p.arriveAt ?? 0) + (p.startDelay || 0);
    done.push(p);
  });
  return queued;
}
/* ---------------- public entry point ----------------
   The one call a renderer needs: hand it a scenario, get back the scheduled
   actors and the moment the road is legally yours. */
export function simulate(scn) {
  // Layout is stamped onto every participant because motion is decided per
  // road user, not per frame — basePose only ever sees the participant.
  const layout = scn.layout ?? "cross";
  /* The road spec travels with each participant for the same reason the
     layout does: movements are built per road user, and basePose only ever
     sees the road user. A scenario that declares no road gets the default
     four-way, so nothing that exists today changes. */
  const road = specOf(scn);
  const ego = { ...scn.ego, id: "ego", kind: "car", name: "You", signal: scn.ego.signal ?? null, layout, road };
  const actors = scn.actors.map((a) => ({ ...a, layout, road }));
  schedule([ego, ...actors]);
  // Window opens the moment ego's path is clear of everyone who outranks it.
  const priors = actors.filter((a) => outranks(a, ego));
  const legalAt = earliestClear(ego, priors, ego.arriveAt);
  return { ego, actors, legalAt, priors };
}

/* An event during the wait is only an event if the player can see it in
   time. A button pressed after the driver is already at the line is not a
   warning about a coming phase, it is a surprise — and the whole value of
   the press is that it arrives BEFORE the decision.

   Lives here rather than in either generator because it is a rule about
   scenarios, and both generators have to apply the same one. MIN_WARNING
   matches the bar the roundabout's exit tell clears: appearing at the
   instant of the decision is not a warning.

   Hand-authored scenarios are held to it too, by verify-events.mjs. */
export const MIN_WARNING = 0.6;

/* An emergency vehicle has to arrive close enough behind the decision to
   be on screen when it is made, and not so close the driver has no time
   to act. Stated as TIME rather than as anything about the frame on
   purpose: how much road fits on screen is a renderer's business, and a
   3D view would answer it differently. A scenario says "this one matters
   early" by declaring a `camera`; whether the 2D renderer actually got it
   into shot is checked separately, in verify-camera.mjs. */
export const EMERGENCY_LEAD = [0.5, 2.5];

export function eventsAreReadable(scn) {
  const decide = scn.ego.arriveAt;
  for (const a of scn.actors) {
    // Only the press needs this lead. A pedestrian simply walking out is
    // not an event during the wait, it is the traffic itself.
    if (a.button && a.arriveAt > decide - MIN_WARNING) return false;
    if (a.emergency) {
      const lead = a.arriveAt - decide;
      if (lead < EMERGENCY_LEAD[0] || lead > EMERGENCY_LEAD[1]) return false;
    }
  }
  return true;
}

/* safeAt, on demand rather than folded into simulate(). Composition and
   generation call simulate() deep inside their own search loops — up to
   90 tries per accepted draw, sometimes several simulates per try — and
   earliestSafe's grace-and-creep sweep is real work: cheap once, not
   cheap ninety times over. Baked into simulate() unconditionally, it took
   Endless mode from ~20ms to ~270ms per press of "next" and made
   verify-compose.mjs time out outright — correctness that costs the
   generator or the workflow that much stops paying for itself. The
   renderer calls this once, when a scenario is actually about to be
   played, which is the only place the cost belongs. */
export function safeAtFor(sim) {
  return earliestSafe(sim.ego, sim.actors, sim.legalAt);
}

export {
  SCALE, M, W, H, CX, CY, LANE, HALF, OFF, SET, CAR_L, CAR_W, PED_R,
  PAD_LONG, PAD_LAT, LOOKAHEAD, MAX_CLAIM, TIE, STEP,
  PROPER_SIGNAL_LEAD, LATE_SIGNAL_LEAD,
  RA_OUTER, RA_ISLAND, RA_LANE, RA_SPEED, RA_ENTRY_ANGLE, RA_QUARTERS, raPath,
  STOPS, EXITS, RIGHT_OF, OPPOSITE,
  PED_SETBACK, PED_OVERHANG, BAR_HALF, STOP_LINE_AT, STOP_GAP,
  basePose, TRAITS, TRAIT_KEYS, traitTells, poseAt, signalShowing,
  SKILL_SPAN, severityOf,
  extentsFor, poseFor, forwardClaim, boxesOverlap, conflicts,
  outranks, earliestClear, applyTraits, schedule,
};
