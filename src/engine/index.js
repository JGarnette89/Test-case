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
const SET = 26;

const CAR_L = M(4.5), CAR_W = M(1.8);
const PED_R = M(0.5);
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

const PED_Y = CY - HALF - 22, PED_X0 = CX - HALF - 30, PED_X1 = CX + HALF + 30;

/* Position and heading of a road user at time t, before any driving traits. */
function basePose(p, t) {
  if (p.kind === "ped") {
    if (t < p.departAt) return { x: PED_X0, y: PED_Y, rot: 0, hidden: t < p.arriveAt - 1.2, waiting: true };
    const k = Math.min(1, (t - p.departAt) / CROSS.walk);
    return { x: lerp(PED_X0, PED_X1, k), y: PED_Y, rot: 0, gone: k >= 1 };
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
    tell: "Stopped well past the line, nose already in the intersection",
    setup: (p) => { p.stopBias = M(2.6); },
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
  const lead = p.signalLead ?? PROPER_SIGNAL_LEAD;
  return t >= (p.departAt ?? 0) - lead;
}

function extentsFor(p, padL, padW, claim, mode) {
  if (p.kind === "ped") {
    // A pedestrian on a crossing is a legal rule, not a geometry problem:
    // you wait until they are completely across, so while they are on it
    // they hold the whole crossing.
    if (mode === "yield" && p.blockUntilClear) {
      return { hl: (PED_X1 - PED_X0) / 2 + padW, hw: M(1.3) + padW };
    }
    return { hl: PED_R + padW, hw: PED_R + padW };
  }
  return { hl: CAR_L / 2 + padL + claim / 2, hw: CAR_W / 2 + padW };
}
function poseFor(p, pose, claim, mode) {
  if (p.kind === "ped" && mode === "yield" && p.blockUntilClear) {
    return { x: (PED_X0 + PED_X1) / 2, y: PED_Y, rot: 0 };
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
  const span = CROSS[p.kind === "ped" ? "walk" : p.intent];
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
  const ego = { ...scn.ego, id: "ego", kind: "car", name: "You", signal: scn.ego.signal ?? null };
  const actors = scn.actors.map((a) => ({ ...a }));
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
  STOPS, EXITS, RIGHT_OF, OPPOSITE, lerp, quad, angleTo,
  PED_Y, PED_X0, PED_X1,
  basePose, TRAITS, traitTells, poseAt, signalShowing,
  extentsFor, poseFor, forwardClaim, boxesOverlap, conflicts,
  outranks, earliestClear, applyTraits, schedule,
};
