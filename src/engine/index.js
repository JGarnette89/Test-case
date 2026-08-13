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
   kerb. BAR_HALF is half the depth of one painted bar.                  */
const PED_SETBACK = 22;
const PED_OVERHANG = 30;
const BAR_HALF = M(1.1);
const STOP_LINE_AT = HALF + PED_SETBACK + BAR_HALF + M(0.7);

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
const CROSS = { straight: 1.5, left: 2.1, right: 1.7, walk: 3.4 };
const STEP = 0.05;

/* ---------------- geometry ---------------- */
const STOPS = {
  S: { x: CX + OFF, y: CY + HALF + SET, rot: -90 },
  N: { x: CX - OFF, y: CY - HALF - SET, rot: 90 },
  W: { x: CX - HALF - SET, y: CY + OFF, rot: 0 },
  E: { x: CX + HALF + SET, y: CY - OFF, rot: 180 },
};
const EXITS = {
  S: { straight: { x: CX + OFF, y: -80 }, right: { x: 800, y: CY + OFF }, left: { x: -80, y: CY - OFF } },
  N: { straight: { x: CX - OFF, y: 800 }, right: { x: -80, y: CY - OFF }, left: { x: 800, y: CY + OFF } },
  W: { straight: { x: 800, y: CY + OFF }, right: { x: CX - OFF, y: 800 }, left: { x: CX + OFF, y: -80 } },
  E: { straight: { x: -80, y: CY - OFF }, right: { x: CX + OFF, y: -80 }, left: { x: CX - OFF, y: 800 } },
};
const RIGHT_OF = { S: "E", N: "W", W: "S", E: "N" };
const OPPOSITE = { S: "N", N: "S", E: "W", W: "E" };

const lerp = (a, b, t) => a + (b - a) * t;
const quad = (p0, p1, p2, t) => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};
const angleTo = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/* --- crossings -------------------------------------------------------
   A pedestrian stands on one leg's crosswalk, and which leg is given by
   the same `from` a car uses. Deriving the geometry from the side instead
   of pinning it to the north leg is what lets a crossing be rotated with
   the rest of the scene, and what lets one be generated at all.

   Setback and overhang are declared with the rest of the road furniture
   at the top of the file, because the stop line is placed against them. */
export function crossingOf(side) {
  // On the east and west legs the crosswalk runs north-south.
  const vertical = side === "E" || side === "W";
  if (vertical) {
    const x = side === "W" ? CX - HALF - PED_SETBACK : CX + HALF + PED_SETBACK;
    return {
      a: { x, y: CY - HALF - PED_OVERHANG },
      b: { x, y: CY + HALF + PED_OVERHANG },
      vertical: true, rot: 90,
    };
  }
  const y = side === "N" ? CY - HALF - PED_SETBACK : CY + HALF + PED_SETBACK;
  return {
    a: { x: CX - HALF - PED_OVERHANG, y },
    b: { x: CX + HALF + PED_OVERHANG, y },
    vertical: false, rot: 0,
  };
}

// Scenarios written before crossings were relative assumed the north leg.
const crossingFor = (p) => crossingOf(p.from ?? "N");

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

  /* Curve in and out rather than turning a corner at the kerb. A corner
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

function raAt(path, dist) {
  const { pts, cum } = path;
  if (dist <= 0) return pts[0];
  if (dist >= path.length) return pts[pts.length - 1];
  let i = 1;
  while (i < cum.length && cum[i] < dist) i++;
  const f = (dist - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return {
    x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f,
    y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
  };
}

/* How long this participant takes to clear, once moving. The cross layout
   has fixed times per intent; a roundabout is however long its path is. */
export function spanOf(p) {
  if (p.kind === "ped") return CROSS.walk;
  if (p.layout === "roundabout") return raPath(p).length / RA_SPEED;
  return CROSS[p.intent];
}

function roundaboutPose(p, t) {
  const path = raPath(p);
  const spawn = {
    x: path.gate.x - Math.cos((path.rot * Math.PI) / 180) * 490,
    y: path.gate.y - Math.sin((path.rot * Math.PI) / 180) * 490,
  };

  if (t < p.arriveAt) {
    const k = Math.max(0, Math.min(1, (t - (p.arriveAt - 2.8)) / 2.8));
    const e = k * k * (3 - 2 * k);
    return {
      x: lerp(spawn.x, path.gate.x, e), y: lerp(spawn.y, path.gate.y, e),
      rot: path.rot, approaching: true,
    };
  }
  if (t < p.departAt) return { x: path.gate.x, y: path.gate.y, rot: path.rot, waiting: true };

  const d = (t - p.departAt) * RA_SPEED;
  const pos = raAt(path, d);
  const nxt = raAt(path, d + 6);
  return {
    ...pos,
    rot: d < 2 ? path.rot : angleTo(pos, nxt),
    gone: d >= path.length,
    moving: true,
  };
}

/* Position and heading of a road user at time t, before any driving traits. */
function basePose(p, t) {
  if (p.layout === "roundabout" && p.kind !== "ped") return roundaboutPose(p, t);
  if (p.kind === "ped") {
    const cr = crossingFor(p);
    const start = p.reverse ? cr.b : cr.a;
    const end = p.reverse ? cr.a : cr.b;
    if (t < p.departAt) {
      return { x: start.x, y: start.y, rot: cr.rot, hidden: t < p.arriveAt - 1.2, waiting: true };
    }
    const k = Math.min(1, (t - p.departAt) / CROSS.walk);
    return { x: lerp(start.x, end.x, k), y: lerp(start.y, end.y, k), rot: cr.rot, gone: k >= 1 };
  }
  const base = STOPS[p.from], exit = EXITS[p.from][p.intent];
  const rad = (base.rot * Math.PI) / 180;
  const bias = p.stopBias || 0;
  const stop = { x: base.x + Math.cos(rad) * bias, y: base.y + Math.sin(rad) * bias, rot: base.rot };
  const spawn = { x: stop.x - Math.cos(rad) * 490, y: stop.y - Math.sin(rad) * 490 };

  if (t < p.arriveAt) {
    const k = Math.max(0, Math.min(1, (t - (p.arriveAt - 2.8)) / 2.8));
    const e = k * k * (3 - 2 * k);
    return { x: lerp(spawn.x, stop.x, e), y: lerp(spawn.y, stop.y, e), rot: stop.rot, approaching: true };
  }
  if (t < p.departAt) return { x: stop.x, y: stop.y, rot: stop.rot, waiting: true };

  const k = Math.min(1, (t - p.departAt) / CROSS[p.intent]);
  if (p.intent === "straight") {
    return { x: lerp(stop.x, exit.x, k), y: lerp(stop.y, exit.y, k), rot: stop.rot, gone: k >= 1, moving: true };
  }
  const vertical = p.from === "S" || p.from === "N";
  const wide = p.turnBias || 0;
  const ctrl = vertical
    ? { x: stop.x + (exit.x > stop.x ? -wide : wide), y: exit.y }
    : { x: exit.x, y: stop.y + (exit.y > stop.y ? -wide : wide) };
  const pos = quad(stop, ctrl, exit, k);
  const nxt = quad(stop, ctrl, exit, Math.min(1, k + 0.03));
  return { ...pos, rot: k < 0.02 ? stop.rot : angleTo(pos, nxt), gone: k >= 1, moving: true };
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
const TRAITS = {
  wander: {
    tell: "Drifting inside its lane — never held a steady line",
    pose: (p, t, po) => {
      if (po.hidden) return po;
      const amp = M(1.15), w = 1.75;
      const off = Math.sin(t * w + (p.phase || 0)) * amp;
      const r = (po.rot * Math.PI) / 180;
      return {
        ...po,
        x: po.x - Math.sin(r) * off,
        y: po.y + Math.cos(r) * off,
        rot: po.rot + Math.cos(t * w + (p.phase || 0)) * 6,
      };
    },
  },
  creep: {
    tell: "Never settled at the line — kept inching forward",
    pose: (p, t, po) => {
      if (!po.waiting) return po;
      const k = Math.max(0, Math.sin((t - p.arriveAt) * 2.1));
      const d = k * M(1.6);
      const r = (po.rot * Math.PI) / 180;
      return { ...po, x: po.x + Math.cos(r) * d, y: po.y + Math.sin(r) * d };
    },
  },
  overshoot: {
    /* Derived, not typed: enough to carry the nose from just behind the
       stop line to 0.6 m inside the box, because that is what the tell
       claims and a tell that is not true of the car is a lie to the
       player. A fixed 2.6 m stopped reaching once SET was corrected. */
    tell: "Stopped well past the line, nose already in the intersection",
    setup: (p) => { p.stopBias = STOP_LINE_AT + STOP_GAP - HALF + M(0.6); },
  },
  slowStart: {
    tell: "Slow off the mark when it was clearly their turn",
    setup: (p) => { p.startDelay = 1.7; },
  },
  wideTurn: {
    tell: "Swung wide through the turn, across the next lane",
    setup: (p) => { p.turnBias = M(2.2); },
  },
  lateSignal: {
    tell: "Indicated barely before turning — nothing like the 2-3 seconds it owed you",
    setup: (p) => { p.signalLead = LATE_SIGNAL_LEAD; },
  },
};

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

function extentsFor(p, padL, padW, claim, mode) {
  if (p.kind === "ped") {
    // A pedestrian on a crossing is a legal rule, not a geometry problem:
    // you wait until they are completely across, so while they are on it
    // they hold the whole crossing.
    if (mode === "yield" && p.blockUntilClear) {
      const cr = crossingFor(p);
      const len = Math.hypot(cr.b.x - cr.a.x, cr.b.y - cr.a.y);
      return { hl: len / 2 + padW, hw: M(1.3) + padW };
    }
    return { hl: PED_R + padW, hw: PED_R + padW };
  }
  return { hl: CAR_L / 2 + padL + claim / 2, hw: CAR_W / 2 + padW };
}
function poseFor(p, pose, claim, mode) {
  if (p.kind === "ped" && mode === "yield" && p.blockUntilClear) {
    const cr = crossingFor(p);
    return { x: (cr.a.x + cr.b.x) / 2, y: (cr.a.y + cr.b.y) / 2, rot: cr.rot };
  }
  if (!claim) return pose;
  const r = (pose.rot * Math.PI) / 180;
  return { ...pose, x: pose.x + Math.cos(r) * (claim / 2), y: pose.y + Math.sin(r) * (claim / 2) };
}
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
  const ea = extentsFor(pa, padL, padW, 0, mode);
  const eb = extentsFor(pb, padL, padW, claimB, mode);
  return boxesOverlap(poseFor(pa, poseA, 0, mode), ea, poseFor(pb, poseB, claimB, mode), eb);
}

/* ---------------- rules engine ---------------- */
function outranks(a, b) {
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

function applyTraits(p) {
  (p.traits || []).forEach((k) => TRAITS[k]?.setup?.(p));
  return p;
}

function schedule(participants) {
  participants.forEach(applyTraits);
  const rolling = participants.filter((p) => !p.stops);
  rolling.forEach((p) => { p.departAt = p.arriveAt + (p.startDelay || 0); });

  const queued = participants.filter((p) => p.stops)
    .sort((a, b) => (outranks(a, b) ? -1 : 1));

  const done = [...rolling];
  queued.forEach((p) => {
    // A distracted driver still has the right of way — they just sit on it.
    p.departAt = earliestClear(p, done, p.arriveAt) + (p.startDelay || 0);
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
  const ego = { ...scn.ego, id: "ego", kind: "car", name: "You", signal: scn.ego.signal ?? null, layout };
  const actors = scn.actors.map((a) => ({ ...a, layout }));
  schedule([ego, ...actors]);
  // Window opens the moment ego's path is clear of everyone who outranks it.
  const priors = actors.filter((a) => outranks(a, ego));
  const legalAt = earliestClear(ego, priors, ego.arriveAt);
  return { ego, actors, legalAt, priors };
}

export {
  SCALE, M, W, H, CX, CY, LANE, HALF, OFF, SET, CAR_L, CAR_W, PED_R,
  PAD_LONG, PAD_LAT, LOOKAHEAD, MAX_CLAIM, TIE, CROSS, STEP,
  PROPER_SIGNAL_LEAD, LATE_SIGNAL_LEAD,
  RA_OUTER, RA_ISLAND, RA_LANE, RA_SPEED, RA_ENTRY_ANGLE, RA_QUARTERS, raPath,
  STOPS, EXITS, RIGHT_OF, OPPOSITE, lerp, quad, angleTo,
  PED_SETBACK, PED_OVERHANG, BAR_HALF, STOP_LINE_AT, STOP_GAP,
  basePose, TRAITS, traitTells, poseAt, signalShowing,
  extentsFor, poseFor, forwardClaim, boxesOverlap, conflicts,
  outranks, earliestClear, applyTraits, schedule,
};
