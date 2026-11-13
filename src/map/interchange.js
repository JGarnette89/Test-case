/* =====================================================================
   THE GENERATED INTERCHANGE (14 November; DECISIONS 10.75). Its own
   artefact with its own parameter table, because Jay's ruling makes it the
   game's INTENSITY BEAT: "short sections of very active driving ... almost
   like a mini race track instead of just a typical loop".

   Two different jobs, two different tables. The open road (roadgen.js `ROAD`)
   wants long sweeping drama; this wants rapid decisions in a short space:
   a ramp that changes radius, a short straight to reset, and a climb that
   arrives while the car is still turning.

   OPT-IN IS A STRUCTURAL RULE, NOT A TASTE. The through lanes stay straight
   and level (roadgen holds the calm zone and asserts it); the technical part
   is the RAMP SYSTEM, which leaves the carriageway from a gore point the
   player sees coming. Nothing here ever touches the carriageways.

   VARIATION ACROSS INTERCHANGES IS FIRST CLASS (more than on the open road):
   each site draws an ARCHETYPE and its numbers from its own stream, the off
   ramp and the on ramp are drawn independently, and `verify-interchange`
   measures how different they come out rather than assuming it.

   GEOMETRY. A diamond: the crossroad runs at right angles over both
   carriageways, level at DECK above them; each carriageway has an off ramp
   that climbs to a terminal beside the crossroad and an on ramp that comes
   down from it, so a car can leave, cross over, and join the OTHER
   carriageway: a turnaround. All of it is in a local frame: s along the
   through road (the crossroad is s = 0), v to the right of it, z above it.
   The oncoming carriageway is this one turned 180 degrees about the
   middle of the median, so one draw serves both.
   ===================================================================== */
import { rng } from "../core/rng.js";

export const IX = {
  /* ---- the layout --------------------------------------------------- */
  MEDIAN: 20,                // m of median between the carriageways' edges
  DECK: 7,                   // m: the crossroad above the highway (the loader needs 4.5)
  GORE_MIN: 300, GORE_MAX: 600,   // m from the crossroad back to where a ramp leaves / joins; drawn per ramp
  TERMINAL_MIN: 45, TERMINAL_MAX: 110,   // m from the carriageway's edge to the crossroad's terminal
  CROSS_OVERRUN: 240,        // m of crossroad past each terminal (where traffic enters and leaves)
  CROSS_SPEED: 50,
  /* WHO STOPS AT THE TERMINALS. "stop": the crossroad's legs stop as well as the ramps (an all-way stop). "free": only the ramps stop, which is the usual diamond and the one wanted, but a free-flowing crossroad crashed 3 of 32 seeded drives (all inside 5 s: a through car behind one turning onto the ramp did not brake, 4 m off its bumper) against 0 of 32 with the stop: the sim's own lane-sharing rule at a free node, not geometry, and not mine to change here (DECISIONS 10.76). "stop" until that is fixed. */
  TERMINAL_CONTROL: "stop",
  /* ---- the ramps ---------------------------------------------------- */
  ANGLE_MIN: 35, ANGLE_MAX: 50,   // degrees at the gore. NOT BELOW ~35 (DECISIONS 10.74): a shallower ramp lies along the through lanes and the conflict table stops the road
  R_MIN: 86,                 // m: the tightest radius a ramp may have: the loader lowers the posted speed of a tighter bend (84 m is 40 km/h), and a ramp that is 25 km/h is a parking lot, not a race track
  RAMP_MAX_SPEED: 60,
  EASE_LEN: 110,             // m: how far the start of a ramp stays level and straight-ish before it may bend or climb
  CLIMB_PEAK: 0.060,         // peak grade of a ramp's climb (the player's engine holds 7.7%)
  CLIMB_FRAC_MIN: 0.45, CLIMB_FRAC_MAX: 1.0,   // of the ramp's length: how late the climb comes (late = steeper, and it arrives while turning)
  ATTEMPTS: 60,              // draws per ramp before falling back to the plain diamond
  /* ---- which shape (weights) ---------------------------------------- */
  W_DIAMOND: 0.18, W_ESSES: 0.30, W_SWEEPER: 0.22, W_KINK: 0.18, W_DOUBLE: 0.12,
  ESS_OFFSET_MIN: 10, ESS_OFFSET_MAX: 24,   // m: how far an S-bend swings off the straight line
  SWEEP_OUT_MIN: 20, SWEEP_OUT_MAX: 50,     // m: how far a sweeper bulges past the terminal before coming back
};
export const ARCHETYPES = ["diamond", "esses", "sweeper", "kink", "double"];

const between = (r, a, b) => a + (b - a) * r();
const pick = (r, w) => { const ks = Object.keys(w), tot = ks.reduce((s, k) => s + w[k], 0); let x = r() * tot; for (const k of ks) { x -= w[k]; if (x <= 0) return k; } return ks[ks.length - 1]; };
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/* A smooth path through the knots: Hermite segments, tangents along the line
   between the neighbours (fixed at the ends). Sampled about every 6 m. */
function chain(knots, t0, t1) {
  const n = knots.length, dir = [];
  for (let i = 0; i < n; i++) {
    let d = i === 0 ? t0 : i === n - 1 ? t1 : { s: knots[i + 1].s - knots[i - 1].s, v: knots[i + 1].v - knots[i - 1].v };
    const m = Math.hypot(d.s, d.v) || 1; dir.push({ s: d.s / m, v: d.v / m });
  }
  const out = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = knots[i], b = knots[i + 1], L = Math.hypot(b.s - a.s, b.v - a.v), N = Math.max(4, Math.ceil(L / 6));
    for (let j = i === 0 ? 0 : 1; j <= N; j++) {
      const t = j / N, h00 = 2 * t ** 3 - 3 * t * t + 1, h10 = t ** 3 - 2 * t * t + t, h01 = -2 * t ** 3 + 3 * t * t, h11 = t ** 3 - t * t;
      out.push({ s: h00 * a.s + h10 * L * dir[i].s + h01 * b.s + h11 * L * dir[i + 1].s, v: h00 * a.v + h10 * L * dir[i].v + h01 * b.v + h11 * L * dir[i + 1].v });
    }
  }
  return out;
}
const arc = (p) => { const a = [0]; for (let i = 1; i < p.length; i++) a.push(a[i - 1] + Math.hypot(p[i].s - p[i - 1].s, p[i].v - p[i - 1].v)); return a; };
/* The tightest radius along a path: the circle through points two samples apart. */
export function minRadius(p) {
  let best = Infinity;
  for (let i = 2; i + 2 < p.length; i++) {
    const a = p[i - 2], b = p[i], c = p[i + 2], ab = Math.hypot(b.s - a.s, b.v - a.v), bc = Math.hypot(c.s - b.s, c.v - b.v), ca = Math.hypot(a.s - c.s, a.v - c.v);
    const area2 = Math.abs((b.s - a.s) * (c.v - a.v) - (c.s - a.s) * (b.v - a.v));
    if (area2 > 1e-9) best = Math.min(best, (ab * bc * ca) / (2 * area2));
  }
  return best;
}
const selfCrosses = (p) => {
  const X = (a, b, c, d) => { const r = (b.s - a.s) * (d.v - c.v) - (b.v - a.v) * (d.s - c.s); if (Math.abs(r) < 1e-12) return false; const t = ((c.s - a.s) * (d.v - c.v) - (c.v - a.v) * (d.s - c.s)) / r, u = ((c.s - a.s) * (b.v - a.v) - (c.v - a.v) * (b.s - a.s)) / r; return t > 0 && t < 1 && u > 0 && u < 1; };
  for (let i = 0; i + 1 < p.length; i += 1) for (let j = i + 3; j + 1 < p.length; j += 1) if (X(p[i], p[i + 1], p[j], p[j + 1])) return true;
  return false;
};

/* ONE RAMP: from the gore (-d, 0) to the terminal (0, vT), leaving at `ang` degrees and arriving heading along the through road. `kind` is the archetype. Returns the path (s, v) or null if the draw broke a rule. */
function rampPath(r, kind, d, vT, ang) {
  const G = { s: -d, v: 0 }, T = { s: 0, v: vT }, A = (ang * Math.PI) / 180;
  const at = (f, off = 0) => ({ s: G.s + (T.s - G.s) * f, v: G.v + (T.v - G.v) * f + off });   // a point along the straight line, pushed sideways (v)
  const sgn = r() < 0.5 ? -1 : 1, a1 = between(r, IX.ESS_OFFSET_MIN, IX.ESS_OFFSET_MAX), a2 = between(r, IX.ESS_OFFSET_MIN, IX.ESS_OFFSET_MAX), out = between(r, IX.SWEEP_OUT_MIN, IX.SWEEP_OUT_MAX);
  let K;
  if (kind === "diamond") K = [G, T];
  else if (kind === "esses") K = [G, at(0.42, sgn * a1), at(0.74, -sgn * a2), T];
  else if (kind === "sweeper") K = [G, at(0.5, out), T];
  else if (kind === "kink") K = [G, at(0.36, sgn * a1), at(0.55, sgn * a1), at(0.8, -sgn * a2), T];   // a short straight to reset between the two bends
  else K = [G, at(0.3, sgn * a1), at(0.55, -sgn * a2), at(0.8, sgn * a1 * 0.7), T];   // double: three bends in a row
  const p = chain(K, { s: Math.cos(A), v: Math.sin(A) }, { s: 1, v: 0 });
  return p;
}

const accept = (p, d, vT, half) => {
  if (minRadius(p) < IX.R_MIN) return false;
  if (selfCrosses(p)) return false;
  const a = arc(p);
  for (let i = 0; i < p.length; i++) {
    if (p[i].s < -d - 5 || p[i].s > 5) return false;                  // stays between the gore and the crossroad
    if (a[i] > 70 && p[i].v < half + 8) return false;                  // clear of the carriageway once past the gore
    if (p[i].v > vT + 95) return false;
  }
  return true;
};

/* The z of a ramp along its length: level, then a climb that lands exactly on the deck. */
const climb = (r, len) => {
  const frac = between(r, IX.CLIMB_FRAC_MIN, IX.CLIMB_FRAC_MAX);
  let c = Math.max(frac * len, (1.5 * IX.DECK) / IX.CLIMB_PEAK);       // never steeper than the peak
  c = Math.min(c, len - 1);
  return (x) => IX.DECK * smooth((x - (len - c)) / c);
};

/* THE WHOLE INTERCHANGE for a site: everything in the local frame. `half` is half the width of a carriageway. */
export function interchangeOf(seed, i, half) {
  const r = rng(seed * 1000003 + i * 15485863 + 41), q = (v) => Math.round(v / 4) * 4;
  const dOff = q(between(r, IX.GORE_MIN, IX.GORE_MAX)), dOn = q(between(r, IX.GORE_MIN, IX.GORE_MAX)), vT = half + between(r, IX.TERMINAL_MIN, IX.TERMINAL_MAX);
  const weights = { diamond: IX.W_DIAMOND, esses: IX.W_ESSES, sweeper: IX.W_SWEEPER, kink: IX.W_KINK, double: IX.W_DOUBLE };
  const draw = (d) => {
    const kind = pick(r, weights);
    for (let k = 0; k < IX.ATTEMPTS; k++) {
      const ang = between(r, IX.ANGLE_MIN, IX.ANGLE_MAX), p = rampPath(r, kind, d, vT, ang);
      if (p && accept(p, d, vT, half)) return { kind, ang, p };
    }
    return { kind: "diamond", ang: IX.ANGLE_MIN + 5, p: rampPath(r, "diamond", d, vT, IX.ANGLE_MIN + 5) };
  };
  const off = draw(dOff), onRaw = draw(dOn);
  const withZ = (p) => { const a = arc(p), z = climb(r, a[a.length - 1]); return p.map((q2, k) => ({ s: q2.s, v: q2.v, z: z(a[k]) })); };
  const offP = withZ(off.p), onDown = withZ(onRaw.p);
  /* The on ramp is the same kind of path turned round: from the terminal, heading along the road, down to the gore. Mirror s and reverse, and the climb runs the other way. */
  const onP = onDown.map((q2) => ({ s: -q2.s, v: q2.v, z: q2.z })).reverse();
  /* reversed path starts at the terminal (z = DECK) and ends at the gore (z = 0) */
  return { vT, dOff, dOn, off: { kind: off.kind, ang: off.ang, pts: offP, rmin: minRadius(off.p) }, on: { kind: onRaw.kind, ang: onRaw.ang, pts: onP, rmin: minRadius(onRaw.p) } };
}
