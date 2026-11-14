/* =====================================================================
   THE GENERATED HIGHWAY (14 November; DECISIONS 10.73). The road only: a
   pure function of distance along it and a seed, emitted as an ordinary
   map for today's `loadMap`, so the maintainer can drive it before any of
   the machinery that would stream it exists. THE REASON FOR THE ORDER: the
   403 map (`highway.js`) failed on its PARAMETERS, not on being finite --
   4 to 7 degrees a km, 59% of it within half a percent of level -- so a
   dull road generated ahead of him for ever would be the same
   disappointment with more engineering under it. His taste is the
   instrument and it cannot be applied to a description.

   WHAT THE EYE READS IS CHANGE, NOT HOLD (DECISIONS 10.72): a steady lean
   adapts away, and a lap of the old loop had four transitions. So the
   generator is built out of TRANSITIONS: curvature is eased in linear ramps
   (a clothoid), a bend can REVERSE straight through zero (an S-bend, the
   strongest roll cue there is), grade changes over a short VERTICAL CURVE
   (a crest that registers is one whose vertical curve is short enough to
   unload the car), and rollers string crests close together.

   LEGIBILITY IS A REQUIREMENT HERE, NOT A LATER ADJUSTMENT (the
   maintainer's over-the-top ruling applied to terrain): Jay called a
   correctly sized 4.5% hill imperceptible. The projection draws a rise as
   1.15 m of screen for each metre, against 0.5 of ground travel, so a 4.5%
   grade changes a road's slope on screen by about a tenth. So the profile
   is multiplied by VERTICAL_EXAGGERATION as it is emitted. THE LIMIT ON
   THAT IS THE PLAYER'S ENGINE, not taste: a car holds 100 km/h up to about
   7.5% (player.js `resistance`), past which the screen says it cannot,
   so the numbers below keep the exaggerated peak under that. A bigger
   exaggeration than the engine allows belongs in the renderer (a draw-only
   scale), which is a separate, structural piece of work.

   EVERYTHING THAT SHAPES THE ROAD IS A NAMED NUMBER IN `ROAD`, ONE TABLE,
   so a taste loop is "more of that, less of this" and numbers change, not
   code. `roadgen(overrides)` takes any of them.

   TWO CONSTRAINTS FROM THE DESIGN, HELD BY `verify-roadgen`:
   - THE HEADING IS BOUNDED (HEADING_MAX, under 90 degrees from the
     direction of travel at the start), so x only ever increases and the
     road can never cross itself -- the loader would read a crossing as an
     intersection or an overpass.
   - IDS COME FROM DISTANCE from the start (`hw-<metres>`, `on-<metres>`),
     and the whole road is a function of u: a longer road begins with
     exactly the shorter one's roads, so this static stretch is already
     the first window of an endless road rather than a throwaway.

   INTERCHANGES ARE AMBIENT AND COMMON (Jay, DECISIONS 10.74): traffic merges
   in and out and the player changes direction by them; INTERCHANGES: 0 is a
   road with   one entrance (to start on) and nothing else. Around each interchange the
   road is held straight and level (a CALM zone, blended in and out):
   junction clearing does not know about slope, and a slip road on a curve
   crossed the through curb lane (the old loop's finding), so the drama
   lives between the interchanges.
   ===================================================================== */
import { emptyMap, road, LANE } from "./format.js";
import { interchangeOf, IX } from "./interchange.js";
import { rng } from "../core/rng.js";
import { radiusFor } from "../sim/course.js";

export const ROAD = {
  ID: "test-highway-gen", NAME: "The generated highway -- a road made of transitions: eased bends, S-bends, crests that register, rollers",   // which map this is (a variant changes these)
  SEED: 1,
  LENGTH: 20000,            // m: the static stretch Jay drives
  STEP: 4,                  // m between points
  SPAN_MAX: 2500,           // m: a road (between nodes) is split at least this often; ids are the distance of its start

  /* ---- plan: what the road does sideways ------------------------------ */
  HEADING_MAX: 70,          // degrees either side of the start heading, never exceeded: the road cannot cross itself
  HEADING_PULL: 25,         // degrees: past this a feature turns back toward the centre line rather than choosing at random
  W_STRAIGHT: 0.18, W_SWEEP: 0.30, W_SBEND: 0.30, W_CHAIN: 0.14, W_TIGHT: 0.08,   // how often each feature comes
  STRAIGHT_MIN: 200, STRAIGHT_MAX: 700,                 // m
  SWEEP_R_MIN: 500, SWEEP_R_MAX: 1300,                  // m radius
  SWEEP_TURN_MIN: 25, SWEEP_TURN_MAX: 70,               // degrees a sweep turns the road by
  TIGHT_R_MIN: 280, TIGHT_R_MAX: 450,                   // m: a bend that wants a lower posted speed
  TIGHT_TURN_MIN: 35, TIGHT_TURN_MAX: 80,
  SBEND_R_MIN: 450, SBEND_R_MAX: 1000,                  // m radius of each half
  SBEND_TURN_MIN: 18, SBEND_TURN_MAX: 45,               // degrees each half turns
  CHAIN_LEGS_MIN: 3, CHAIN_LEGS_MAX: 5,                 // alternating bends in a chicane
  CHAIN_R_MIN: 450, CHAIN_R_MAX: 800, CHAIN_TURN_MIN: 12, CHAIN_TURN_MAX: 28,
  TRANSITION_LEN: 180,      // m: curvature eased in from straight to a bend (linear in curvature: a clothoid)
  REVERSE_LEN: 90,          // m: curvature swung straight through zero from one bend to the other -- SHORT, because the roll flipping quickly is the cue
  REVERSE_LEN_CHAIN: 70,

  /* ---- profile: what the road does up and down ------------------------ */
  VERTICAL_EXAGGERATION: 1.5,   // the profile is multiplied by this on the way out (see the header): the peak below is BEFORE it
  GRADE_MIN: 0.02, GRADE_MAX: 0.050,                    // rise over run of a climb or a descent
  PLATEAU_MIN: 500, PLATEAU_MAX: 1800,                  // m a grade holds
  W_CLIMB: 0.26, W_DESCENT: 0.26, W_ROLLERS: 0.38, W_LEVEL: 0.10,
  LEVEL_MIN: 150, LEVEL_MAX: 400,                       // m
  ROLLER_WAVE_MIN: 180, ROLLER_WAVE_MAX: 320,           // m wavelength
  ROLLER_GRADE: 0.040, ROLLER_BASE_MAX: 0.010,          // grade amplitude: crest after crest, over a base grade of at most this (their sum, times the exaggeration, must stay under what the engine holds: 7.75%)
  ROLLER_COUNT_MIN: 3, ROLLER_COUNT_MAX: 6,
  CREST_VC_MIN: 70, CREST_VC_MAX: 160,                  // m: the vertical curve at a crest or a sag -- SHORT is a crest that registers
  EASE_VC_MIN: 160, EASE_VC_MAX: 320,                   // m: where the grade changes without changing sign
  Z_LOW: 4, Z_HIGH: 70,                                 // m (before exaggeration): the road is steered back toward this band

  /* ---- interchanges: AMBIENT and common (Jay, 14 November: DECISIONS 10.74) -- traffic merges in and out and the player turns around by them; they are one of the most repeated things he will see, so spacing, kind, geometry and side VARY. Placed by construction in calm zones: a feature never overlaps one. */
  INTERCHANGES: 1,          // 0 = none (one entrance only, to start on); 1 = ambient interchanges
  FIRST_EXIT: 900,          // m: the first interchange (always a full one: the road starts from its entrance)
  OPEN_MIN: 1400, OPEN_MAX: 4600, OPEN_SKEW: 1.4,   // m of road between one interchange's calm and the next's: the stretch the drama lives in (the draw is rng^SKEW, so most are short and a few long)
  W_FULL: 0.30, W_EXIT: 0.30, W_ENTRANCE: 0.40,     // exit then entrance / an exit alone / an entrance alone
  EXIT_TO_ENTRANCE_MIN: 450, EXIT_TO_ENTRANCE_MAX: 1100,   // m
  ACCEL: 350,               // m of acceleration lane
  CALM_BEFORE: 350, CALM_AFTER: 250, CALM_BLEND: 250,   // m held straight and level around an interchange, and how fast it is blended away
  EXIT_AFTER: 250, ENTRANCE_BEFORE: 150,                // m of calm past a lone exit / before a lone entrance
  RAMP_MIN: 300, RAMP_MAX: 600, ANGLE_MIN: 35, ANGLE_MAX: 50,   // m and degrees of a ramp, drawn per interchange. NOT BELOW ~35: at 28 the ramp lies along the through lanes for so long the conflict table holds a third of the road (measured, DECISIONS 10.74)
  /* The FULL interchanges are their own artefact, with their own table: interchange.js `IX`. The lone exits and entrances above are plain slip roads, on either carriageway (a left exit would run into the median now that the road is divided). */
  LANES: 3, LIMIT: 100, TRUCKS: 0.12,
  CARS: 0,                  // 0 = the density rule (test map 1's cars per lane-km); a number = this many
};

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const between = (r, a, b) => a + (b - a) * r();
const pick = (r, weights) => { const ks = Object.keys(weights), tot = ks.reduce((s, k) => s + weights[k], 0); let x = r() * tot; for (const k of ks) { x -= weights[k]; if (x <= 0) return k; } return ks[ks.length - 1]; };
const DEG = Math.PI / 180;

/* ---------------------------------------------------------------------
   The plan: curvature as a list of linear segments, built feature by
   feature from index 0 (so a longer road begins with the shorter one).
   --------------------------------------------------------------------- */
function planOf(C, zones) {
  const segs = [];   // { u0, u1, k0, k1 }
  const features = [];   // { kind, u0, u1 } for the sections and the report
  let u = 0, h = 0, i = 0;
  const lim = C.HEADING_MAX * DEG;
  /* A feature is a list of [length, k0, k1] parts. It is ACCEPTED only if the heading stays inside the bound the whole way through it (the peak, not just the end), tried with each sign: that is what keeps the road from ever crossing itself. */
  /* checked every 10 m INSIDE each part: a reversal passes through zero curvature mid-part, where the heading peaks, so the ends of a part are not enough */
  const within = (parts, s) => { let hh = h; for (const [len, k0, k1] of parts) { const n = Math.max(1, Math.ceil(len / 10)); for (let j = 1; j <= n; j++) { const a = (j - 1) / n, b = j / n; hh += s * (k0 + (k1 - k0) * (a + b) / 2) * (len / n); if (Math.abs(hh) > lim) return false; } } return true; };
  const commit = (parts, s) => { for (const [len, k0, k1] of parts) { segs.push({ u0: u, u1: u + len, k0: s * k0, k1: s * k1 }); h += s * ((k0 + k1) / 2) * len; u += len; } };
  /* A feature never overlaps a calm zone (or its blend): the zone's flattening would change what the feature turns the road by and the heading bound would be a lie. It is replaced by a straight to the zone's end. */
  const hit = (len) => zones.find(([a, b]) => u + len > a - C.CALM_BLEND && u < b + C.CALM_BLEND);
  const pass = (len) => { const z = hit(len); if (!z) return false; commit([[Math.max(1, z[1] + C.CALM_BLEND - u), 0, 0]], 1); return true; };
  const place = (r, parts) => {
    if (pass(parts.reduce((n, p) => n + p[0], 0))) return true;
    const first = Math.abs(h) / DEG > C.HEADING_PULL ? -Math.sign(h) : r() < 0.5 ? -1 : 1;
    for (const s of [first, -first]) if (within(parts, s)) { commit(parts, s); return true; }
    return false;
  };
  while (u < C.LENGTH + 2000) {
    const r = rng(C.SEED * 1000003 + i * 7919 + 11); i++;
    const kind = pick(r, { straight: C.W_STRAIGHT, sweep: C.W_SWEEP, sbend: C.W_SBEND, chain: C.W_CHAIN, tight: C.W_TIGHT });
    const u0 = u;
    if (kind === "straight") { const len = between(r, C.STRAIGHT_MIN, C.STRAIGHT_MAX); if (!pass(len)) commit([[len, 0, 0]], 1); }
    else if (kind === "sweep" || kind === "tight") {
      const R = kind === "sweep" ? between(r, C.SWEEP_R_MIN, C.SWEEP_R_MAX) : between(r, C.TIGHT_R_MIN, C.TIGHT_R_MAX);
      const turn = (kind === "sweep" ? between(r, C.SWEEP_TURN_MIN, C.SWEEP_TURN_MAX) : between(r, C.TIGHT_TURN_MIN, C.TIGHT_TURN_MAX)) * DEG;
      const k = 1 / R, arc = Math.max(0, turn * R - C.TRANSITION_LEN);
      if (!place(r, [[C.TRANSITION_LEN, 0, k], [arc, k, k], [C.TRANSITION_LEN, k, 0]])) commit([[200, 0, 0]], 1);
    } else if (kind === "sbend") {
      const R1 = between(r, C.SBEND_R_MIN, C.SBEND_R_MAX), R2 = between(r, C.SBEND_R_MIN, C.SBEND_R_MAX);
      const t1 = between(r, C.SBEND_TURN_MIN, C.SBEND_TURN_MAX) * DEG, t2 = between(r, C.SBEND_TURN_MIN, C.SBEND_TURN_MAX) * DEG;
      const k1 = 1 / R1, k2 = -1 / R2, e = (C.TRANSITION_LEN + C.REVERSE_LEN) / 2;
      if (!place(r, [[C.TRANSITION_LEN, 0, k1], [Math.max(0, t1 * R1 - e), k1, k1], [C.REVERSE_LEN, k1, k2], [Math.max(0, t2 * R2 - e), k2, k2], [C.TRANSITION_LEN, k2, 0]])) commit([[200, 0, 0]], 1);
    } else {
      const legs = Math.round(between(r, C.CHAIN_LEGS_MIN, C.CHAIN_LEGS_MAX)), parts = [];
      let s = 1, prev = 0;
      for (let j = 0; j < legs; j++) {
        const R = between(r, C.CHAIN_R_MIN, C.CHAIN_R_MAX), t = between(r, C.CHAIN_TURN_MIN, C.CHAIN_TURN_MAX) * DEG, k = s / R;
        const lead = j === 0 ? C.TRANSITION_LEN : C.REVERSE_LEN_CHAIN;
        parts.push([lead, prev, k], [Math.max(0, t * R - lead / 2 - C.REVERSE_LEN_CHAIN / 2), k, k]); prev = k; s = -s;
      }
      parts.push([C.TRANSITION_LEN, prev, 0]);
      if (!place(r, parts)) commit([[200, 0, 0]], 1);
    }
    features.push({ kind, u0, u1: u });
  }
  return { segs, features };
}
function curvatureAt(plan, v) {
  const S = plan.segs; let lo = 0, hi = S.length - 1;
  if (v <= S[0].u0) return S[0].k0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].u0 <= v) lo = mid; else hi = mid - 1; }
  const s = S[lo]; if (v >= s.u1) return s.k1;
  return s.k0 + ((s.k1 - s.k0) * (v - s.u0)) / (s.u1 - s.u0 || 1);
}

/* ---------------------------------------------------------------------
   The profile: grade as plateaus (a held grade, or rollers) joined by
   linear grade ramps (parabolic vertical curves). A crest or a sag is a
   sign change across a SHORT ramp.
   --------------------------------------------------------------------- */
function profileOf(C, zones) {
  const segs = [];   // { u0, u1, g0, g1, A, wave }  grade = ramp g0->g1 (A = 0) or plateau g0 + A sin(2 pi (v - u0) / wave)
  const features = [];
  let u = 0, z = 0, g = 0, i = 0;
  /* the height a segment ACTUALLY adds: the calm zones flatten the grade where they lie, so steering on the unflattened profile let the road drift 250 m below where it was steered to stay */
  const area = (s) => { let a = 0; const n = Math.max(1, Math.ceil((s.u1 - s.u0) / 8)), d = (s.u1 - s.u0) / n; for (let j = 0; j < n; j++) { const v = s.u0 + (j + 0.5) * d, t = (v - s.u0) / (s.u1 - s.u0 || 1); a += (s.g0 + (s.g1 - s.g0) * t + (s.A ? s.A * Math.sin((2 * Math.PI * (v - s.u0)) / s.wave) : 0)) * calmAt(zones, C.CALM_BLEND, v) * d; } return a; };
  const add = (s) => { segs.push(s); z += area(s); u = s.u1; g = s.g1; };
  while (u < C.LENGTH + 2000) {
    const r = rng(C.SEED * 1000003 + i * 104729 + 29); i++;
    let w = { climb: C.W_CLIMB, descent: C.W_DESCENT, rollers: C.W_ROLLERS, level: C.W_LEVEL };
    if (z > C.Z_HIGH) w = { climb: 0, descent: 1, rollers: 0.2, level: 0 }; else if (z < C.Z_LOW) w = { climb: 1, descent: 0, rollers: 0.2, level: 0 };
    let kind = pick(r, w);
    let target, len, A = 0, wave = 0;
    if (kind === "climb") { target = between(r, C.GRADE_MIN, C.GRADE_MAX); len = between(r, C.PLATEAU_MIN, C.PLATEAU_MAX); }
    else if (kind === "descent") { target = -between(r, C.GRADE_MIN, C.GRADE_MAX); len = between(r, C.PLATEAU_MIN, C.PLATEAU_MAX); }
    else if (kind === "level") { target = 0; len = between(r, C.LEVEL_MIN, C.LEVEL_MAX); }
    else { target = (z > C.Z_HIGH ? -1 : z < C.Z_LOW ? 1 : r() < 0.5 ? -1 : 1) * between(r, 0, C.ROLLER_BASE_MAX); A = C.ROLLER_GRADE; wave = between(r, C.ROLLER_WAVE_MIN, C.ROLLER_WAVE_MAX); len = wave * Math.round(between(r, C.ROLLER_COUNT_MIN, C.ROLLER_COUNT_MAX)); }
    /* a plateau never carries the road past the band it is steered within: it is cut short, or turned round if there is no room */
    if (kind === "climb" || kind === "descent") { const room = kind === "climb" ? C.Z_HIGH - z : z - C.Z_LOW; if (room < Math.abs(target) * C.PLATEAU_MIN * 0.4) { target = -target; len = Math.min(len, (kind === "climb" ? z - C.Z_LOW : C.Z_HIGH - z) / Math.abs(target) || len); } else len = Math.min(len, room / Math.abs(target)); }
    /* the vertical curve into it: a change of sign is a crest or a sag and is SHORT */
    const flips = Math.sign(g) * Math.sign(target) < 0, vc = flips ? between(r, C.CREST_VC_MIN, C.CREST_VC_MAX) : between(r, C.EASE_VC_MIN, C.EASE_VC_MAX);
    const rampFrom = u;
    add({ u0: u, u1: u + vc, g0: g, g1: target, A: 0, wave: 0 });
    if (flips) features.push({ kind: g > 0 ? "crest" : "sag", u0: rampFrom, u1: u, dg: Math.abs(target - segs[segs.length - 1].g0), vc });
    add({ u0: u, u1: u + len, g0: target, g1: target, A, wave });
    if (kind === "rollers") features.push({ kind: "rollers", u0: u - len, u1: u, wave, A });
  }
  return { segs, features };
}
function gradeAt(plan, v) {
  const S = plan.segs; let lo = 0, hi = S.length - 1;
  if (v <= S[0].u0) return S[0].g0;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].u0 <= v) lo = mid; else hi = mid - 1; }
  const s = S[lo]; if (v >= s.u1) return s.g1;
  const t = (v - s.u0) / (s.u1 - s.u0 || 1);
  return s.g0 + (s.g1 - s.g0) * t + (s.A ? s.A * Math.sin((2 * Math.PI * (v - s.u0)) / s.wave) : 0);
}

/* ---------------------------------------------------------------------
   The interchanges and the calm around them.
   --------------------------------------------------------------------- */
/* The interchanges depend on DISTANCE ONLY, never on where this stretch happens to end (`to`: how far to generate them, the plan wants them past the end): otherwise a longer road would not begin with the shorter one, because a calm zone beyond the end of the short road changes the bends before it. Each site draws a fixed number of random values, so the sequence is the same however far it runs. THE ROAD IS DIVIDED: carriageway A (the one the player starts on) and B, the oncoming one, a median to its left. A FULL interchange is a diamond (interchange.js) centred on its crossroad `c`; a lone exit or entrance is a slip road on one carriageway or the other. */
export function sitesOf(C, to = C.LENGTH) {
  const half = (C.LANES * LANE) / 2, q = (v) => Math.round(v / C.STEP) * C.STEP;
  if (!(C.INTERCHANGES > 0)) { const u = q(C.FIRST_EXIT); return [{ i: 0, kind: "entrance", carriage: "A", nodes: [{ u, kind: "entrance", carriage: "A" }], zone: [u - C.ENTRANCE_BEFORE, u + C.ACCEL + C.CALM_AFTER], end: u + C.ACCEL + C.CALM_AFTER, ramp: C.RAMP_MIN, ang: 35 }]; }
  const r = rng(C.SEED * 1000003 + 977), lerp = (a2, b2, t) => a2 + (b2 - a2) * t, sites = [];
  for (let z0 = q(C.FIRST_EXIT), i = 0; z0 < to; i++) {
    const t = r(), ramp = lerp(C.RAMP_MIN, C.RAMP_MAX, r()), ang = lerp(C.ANGLE_MIN, C.ANGLE_MAX, r()), onB = r() < 0.5, open = lerp(C.OPEN_MIN, C.OPEN_MAX, Math.pow(r(), C.OPEN_SKEW));
    const kind = i === 0 ? "full" : t < C.W_FULL ? "full" : t < C.W_FULL + C.W_EXIT ? "exit" : "entrance";
    let site;
    if (kind === "full") {
      const ix = interchangeOf(C.SEED, i, half), ZH = Math.max(ix.dOff, ix.dOn) + C.ACCEL + C.CALM_AFTER, c = z0 + ZH;
      site = { i, kind, c, ix, nodes: [{ u: c - ix.dOff, kind: "exit", carriage: "A" }, { u: c + ix.dOn, kind: "entrance", carriage: "A" }, { u: c + ix.dOff, kind: "exit", carriage: "B" }, { u: c - ix.dOn, kind: "entrance", carriage: "B" }], zone: [z0, c + ZH], end: c + ZH };
    } else {
      const carriage = onB ? "B" : "A", span = kind === "exit" ? (onB ? [C.EXIT_AFTER, C.CALM_BEFORE] : [C.CALM_BEFORE, C.EXIT_AFTER]) : (onB ? [C.ACCEL + C.CALM_AFTER, C.ENTRANCE_BEFORE] : [C.ENTRANCE_BEFORE, C.ACCEL + C.CALM_AFTER]);
      const u = z0 + span[0];
      site = { i, kind, carriage, nodes: [{ u, kind, carriage }], zone: [z0, u + span[1]], end: u + span[1], ramp, ang };
    }
    sites.push(site);
    z0 = q(site.end + open);
  }
  return sites;
}
export const interchangesOf = (C, to = C.LENGTH) => sitesOf(C, to).flatMap((s) => s.nodes.map((n) => ({ ...n, x: n.u, site: s })));
const calmZones = (C, nodes) => [...new Map(nodes.map((n) => [n.site.i, n.site.zone])).values()];
const calmAt = (zones, blend, v) => { let m = 1; for (const [a, b] of zones) { const d = v < a ? a - v : v > b ? v - b : 0; m = Math.min(m, smooth(d / blend)); } return m; };

/* ---------------------------------------------------------------------
   The centreline: integrated from u = 0, heading east, at STEP.
   --------------------------------------------------------------------- */
export function lineOf(overrides = {}) {
  const C = { ...ROAD, ...overrides };
  const allNodes = interchangesOf(C, C.LENGTH + 4000), zones = calmZones(C, allNodes), nodes = allNodes.filter((n) => n.site.end + 900 < C.LENGTH), plan = planOf(C, zones), prof = profileOf(C, zones);
  const pts = []; let x = 0, y = 0, z = 0, h = 0;
  for (let u = 0; u <= C.LENGTH + 1e-9; u += C.STEP) {
    const m = calmAt(zones, C.CALM_BLEND, u);
    pts.push({ u, x, y, z, h, k: curvatureAt(plan, u) * m, g: gradeAt(prof, u) * m * C.VERTICAL_EXAGGERATION });
    h += pts[pts.length - 1].k * C.STEP; x += Math.cos(h) * C.STEP; y += Math.sin(h) * C.STEP; z += pts[pts.length - 1].g * C.STEP;
  }
  return { C, plan, prof, nodes, zones, pts };
}

/* ---------------------------------------------------------------------
   The map.
   --------------------------------------------------------------------- */
const r2 = (v) => Math.round(v * 10000) / 10000;
const speedFor = (C, minR) => { let best = 40; for (let v = 40; v <= C.LIMIT; v += 5) if (radiusFor(v / 3.6) <= minR * 0.85) best = v; return best; };

export function roadgen(overrides = {}) {
  const gen = lineOf(overrides), { C, pts, nodes } = gen, DEGR = Math.PI / 180;
  const D = C.LANES * LANE + IX.MEDIAN;   // m from carriageway A's centre line to B's
  const P = (u) => pts[Math.min(pts.length - 1, Math.round(u / C.STEP))];
  /* The two carriageways. A is the generated line; B is A moved D to its left, going the other way. Where A bends, B's bend is a little wider or tighter, so its posted speed is read from its own curvature. */
  const nrm = (p) => ({ x: -Math.sin(p.h), y: Math.cos(p.h) });
  const Q = (car, u) => { const p = P(u); if (car === "A") return { x: p.x, y: p.y, z: p.z, h: p.h, k: p.k }; const n = nrm(p); return { x: p.x - n.x * D, y: p.y - n.y * D, z: p.z, h: p.h + Math.PI, k: p.k / (1 + p.k * D) }; };
  const m = emptyMap(C.ID, C.NAME);
  m.traffic = { trucks: C.TRUCKS, ...(C.CARS > 0 ? { cars: C.CARS } : {}) };   // CARS: the map says its own count (load.js `traffic.cars`) where the density rule would give a road more than the dial allows
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  m.bounds = { x: Math.min(...xs) - 800, y: Math.min(...ys) - 800, w: Math.max(...xs) - Math.min(...xs) + 1600, h: Math.max(...ys) - Math.min(...ys) + 1600 };
  /* A road is the stretch between two breaks: ITS OWN carriageway's interchange nodes and every SPAN_MAX; its id is the distance of its start. No break soon after an entrance on A (its acceleration lane needs the road after it), nor soon BEFORE one on B (B runs the other way). */
  const guard = 2 * (C.ACCEL + 150), spans = [];
  for (const car of ["A", "B"]) {
    const mine = nodes.filter((n) => n.carriage === car), inGuard = (v) => mine.some((n) => n.kind === "entrance" && (car === "A" ? v > n.u && v < n.u + guard : v < n.u && v > n.u - guard));
    const breaks = [...new Set([0, C.LENGTH, ...mine.map((n) => n.u), ...Array.from({ length: Math.floor(C.LENGTH / C.SPAN_MAX) }, (_, j) => (j + 1) * C.SPAN_MAX)])].filter((v) => v >= 0 && v <= C.LENGTH).sort((a2, b2) => a2 - b2).filter((v) => mine.some((n) => n.u === v) || v === 0 || v === C.LENGTH || !inGuard(v));
    for (let j = 0; j + 1 < breaks.length; j++) {
      const a2 = breaks[j], b2 = breaks[j + 1], line = [], us = [];
      for (let u = a2; u < b2; u += C.STEP) us.push(u); us.push(b2);
      for (const u of car === "A" ? us : us.slice().reverse()) { const e = Q(car, u); line.push({ x: r2(e.x), y: r2(e.y), z: r2(e.z) }); }
      let kmax = 0; for (const u of us) kmax = Math.max(kmax, Math.abs(Q(car, u).k));
      const startNode = mine.find((n) => n.kind === "entrance" && n.u === (car === "A" ? a2 : b2)), endNode = mine.find((n) => n.kind === "exit" && n.u === (car === "A" ? b2 : a2));
      const extra = {};
      if (startNode) extra.accel = { start: { from: `${car === "A" ? "on" : "onb"}-${startNode.u}`, length: C.ACCEL } };
      spans.push({ car, a: a2, b: b2, id: `${car === "A" ? "hw" : "hb"}-${a2}`, speed: Math.min(C.LIMIT, kmax > 0 ? speedFor(C, 1 / kmax) : C.LIMIT), line, extra, endNode });
    }
  }
  for (const s2 of spans) m.roads.push(road({ id: s2.id, kind: "highway", lanes: C.LANES, speed: s2.speed, oneWay: true, points: s2.line, ...s2.extra }));
  const ramps = [], rampId = (n) => `${n.kind === "exit" ? "off" : "on"}${n.carriage === "B" ? "b" : ""}-${n.u}`;
  /* LONE slip roads: a straight stub at the site's angle, to nowhere (traffic leaves and joins there). */
  for (const n of nodes) {
    const S = n.site; if (S.kind === "full") continue;
    const e = Q(n.carriage, n.u), z = r2(e.z), ANG = S.ang * DEGR, R = S.ramp, line = [];
    if (n.kind === "exit") { const dx = Math.cos(e.h + ANG) * R, dy = Math.sin(e.h + ANG) * R; for (let i = 0; i <= 40; i++) line.push({ x: r2(e.x + (dx * i) / 40), y: r2(e.y + (dy * i) / 40), z }); m.roads.push(road({ id: rampId(n), kind: "highway", lanes: 1, oneWay: true, speed: 60, points: line })); }
    else { const dx = Math.cos(e.h - ANG) * R, dy = Math.sin(e.h - ANG) * R; for (let i = 0; i <= 40; i++) line.push({ x: r2(e.x - dx + (dx * i) / 40), y: r2(e.y - dy + (dy * i) / 40), z }); m.roads.push(road({ id: rampId(n), kind: "highway", lanes: 1, oneWay: true, speed: 80, points: line })); if (n.carriage === "A") ramps.push({ id: rampId(n), u: n.u }); }
  }
  /* FULL interchanges: the diamond of interchange.js, placed on the straight level road. The oncoming side is the same drawing turned 180 degrees about the middle of the median. */
  const fulls = [];
  for (const S of nodes.filter((n) => n.site.kind === "full").map((n) => n.site).filter((v, i, a2) => a2.indexOf(v) === i)) {
    const o = P(S.c), t = { x: Math.cos(o.h), y: Math.sin(o.h) }, nn = nrm(o), ix = S.ix, zc = o.z;
    const W = (sv, vv, zz) => ({ x: r2(o.x + t.x * sv + nn.x * vv), y: r2(o.y + t.y * sv + nn.y * vv), z: r2(zc + zz) });
    const side = (flip) => (q2) => (flip ? W(-q2.s, -D - q2.v, q2.z) : W(q2.s, q2.v, q2.z));
    const kmin = (arr) => { let best = Infinity; for (let i = 2; i + 2 < arr.length; i++) { const a2 = arr[i - 2], b2 = arr[i], c2 = arr[i + 2], ab = Math.hypot(b2.x - a2.x, b2.y - a2.y), bc = Math.hypot(c2.x - b2.x, c2.y - b2.y), ca = Math.hypot(a2.x - c2.x, a2.y - c2.y), ar = Math.abs((b2.x - a2.x) * (c2.y - a2.y) - (c2.x - a2.x) * (b2.y - a2.y)); if (ar > 1e-9) best = Math.min(best, (ab * bc * ca) / (2 * ar)); } return 1 / best; };
    for (const car of ["A", "B"]) {
      const f = side(car === "B"), uOff = car === "A" ? S.c - ix.dOff : S.c + ix.dOff, uOn = car === "A" ? S.c + ix.dOn : S.c - ix.dOn;
      const off = ix.off.pts.map(f), on = ix.on.pts.map(f), sp = (arr) => Math.min(IX.RAMP_MAX_SPEED, speedFor(C, 1 / kmin(arr)));
      const suf = car === "B" ? "b" : "";
      m.roads.push(road({ id: `off${suf}-${uOff}`, kind: "highway", lanes: 1, oneWay: true, speed: sp(off), points: off, control: { start: "none", end: "stop" } }));
      m.roads.push(road({ id: `on${suf}-${uOn}`, kind: "highway", lanes: 1, oneWay: true, speed: sp(on), points: on }));
      if (car === "A") ramps.push({ id: `on-${uOn}`, u: uOn });
    }
    /* The crossroad over both carriageways, level at the deck, split at its two terminals. */
    const vS = ix.vT, vN = -D - ix.vT, cr = (v0, v1) => { const out = [], n = Math.max(2, Math.ceil(Math.abs(v1 - v0) / 20)); for (let i = 0; i <= n; i++) out.push(W(0, v0 + ((v1 - v0) * i) / n, IX.DECK)); return out; };
    const stop = IX.TERMINAL_CONTROL === "stop";
    m.roads.push(road({ id: `xs-${S.c}`, kind: "service", lanes: 1, oneWay: false, speed: IX.CROSS_SPEED, points: cr(vS + IX.CROSS_OVERRUN, vS), ...(stop ? { control: { start: "none", end: "stop" } } : {}) }));
    m.roads.push(road({ id: `xm-${S.c}`, kind: "service", lanes: 1, oneWay: false, speed: IX.CROSS_SPEED, points: cr(vS, vN), ...(stop ? { control: { start: "stop", end: "stop" } } : {}) }));
    m.roads.push(road({ id: `xn-${S.c}`, kind: "service", lanes: 1, oneWay: false, speed: IX.CROSS_SPEED, points: cr(vN, vN - IX.CROSS_OVERRUN), ...(stop ? { control: { start: "stop", end: "none" } } : {}) }));
    fulls.push(S);
  }
  /* The exit-only lane at each exit: the lane on its side may only leave there. */
  for (const s2 of spans) if (s2.endNode) { const rd = m.roads.find((q2) => q2.id === s2.id); rd.turns = { end: Array.from({ length: C.LANES }, (_, j) => (j === C.LANES - 1 ? ["right"] : ["straight"])) }; }
  /* Sections: the start, an interchange, and the most dramatic of each kind the road has, each joined from the entrance before it. */
  const entranceBefore = (u) => ramps.filter((q2) => q2.u + C.ACCEL < u).pop() ?? ramps[0];
  const look = (u) => { const p = P(u); return { x: r2(p.x + Math.cos(p.h + Math.PI / 2) * 100), y: r2(p.y + Math.sin(p.h + Math.PI / 2) * 100) }; };
  const vAcc = (f) => (27.8 * 27.8 * f.dg) / f.vc;   // m/s^2 of vertical acceleration at 100 km/h
  const crest = gen.prof.features.filter((f) => f.kind === "crest" && f.u1 < C.LENGTH).sort((a2, b2) => vAcc(b2) - vAcc(a2))[0];
  const roller = gen.prof.features.filter((f) => f.kind === "rollers" && f.u1 < C.LENGTH)[0];
  const sbend = gen.plan.features.filter((f) => f.kind === "sbend" && f.u1 < C.LENGTH)[0];
  m.sections = [{ id: "start", name: "join from the slip road", look: look(ramps[0].u + 300), start: { road: ramps[0].id, end: "end" }, judge: "You start standing on a slip road. Join the highway, then drive: what does the road do?" }];
  const fx = fulls[1] ?? fulls[0];
  if (fx) m.sections.push({ id: "interchange", name: "an interchange", look: look(fx.c), start: { road: entranceBefore(fx.c - fx.ix.dOff - 600).id, end: "end" }, judge: `A diamond at ${(fx.c / 1000).toFixed(1)} km: ${fx.ix.off.kind} off, ${fx.ix.on.kind} on. Leave, cross over, join the other way: is it a section of driving you chose, or one you were put through?` });
  if (crest) m.sections.push({ id: "crest", name: "the sharpest crest", look: look((crest.u0 + crest.u1) / 2), start: { road: entranceBefore(crest.u0).id, end: "end" }, judge: `Over the crest at ${(crest.u0 / 1000).toFixed(1)} km the grade changes ${(100 * crest.dg).toFixed(0)} points in ${crest.vc.toFixed(0)} m. Does the nose go over, and does it register?` });
  if (roller) m.sections.push({ id: "rollers", name: "rollers", look: look((roller.u0 + roller.u1) / 2), start: { road: entranceBefore(roller.u0).id, end: "end" }, judge: `Crest after crest from ${(roller.u0 / 1000).toFixed(1)} km: does it read as speed?` });
  if (sbend) m.sections.push({ id: "sbend", name: "an S-bend", look: look((sbend.u0 + sbend.u1) / 2), start: { road: entranceBefore(sbend.u0).id, end: "end" }, judge: `An S-bend at ${(sbend.u0 / 1000).toFixed(1)} km: the lean swings from one side to the other. Does that read?` });
  return m;
}
export const testHighwayGen = () => roadgen();
/* The same road with no interchange but the entrance to start on: all of it is the road, none of it calm. */
export const testHighwayGenOpen = () => roadgen({ ID: "test-highway-gen-open", NAME: "The generated highway, no interchanges", INTERCHANGES: 0 });
/* THE HIGH-SPEED WIDE ROAD (Jay, 14 November: "five lanes each way and a high posted limit"; then "the limit is higher, 110 and the speediest speeders get faster as a result"). Two table entries, no generator change: LANES and LIMIT are the same table the road is made from. */
export const testHighwayGenWide = () => roadgen({ ID: "test-highway-gen-wide", NAME: "The generated highway, five lanes each way at 110", LANES: 5, LIMIT: 110,
  /* 600 is the density dial's own ceiling (map/cars.js CARS_CEILING) and 21 ms a tick on an idle machine. The density rule would give 890 here: 35 ms, and above the control that governs it. 600 is 2.8 cars per lane-km, against the 4.2 of the other maps: the road will feel emptier per lane. */
  CARS: 600,
  /* A limit is only posted where the road allows it (`speedFor`: the radius a speed needs, with 15% in hand): 110 needs 750 m, so the bends are drawn gentler or most of the road would post 85 to 95 and the limit would be a label. The tight bend stays tight, relatively: it is what posts lower. */
  SWEEP_R_MIN: 800, SWEEP_R_MAX: 1800, SBEND_R_MIN: 750, SBEND_R_MAX: 1400, CHAIN_R_MIN: 750, CHAIN_R_MAX: 1100, TIGHT_R_MIN: 450, TIGHT_R_MAX: 650 });
