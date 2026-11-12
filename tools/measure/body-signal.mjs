/* DOES THE SIGNAL SURVIVE A 3 Hz SPRING? (13 November, DECISIONS 10.70; read-only, builds nothing.) For a body that leans and dives, three accelerations would drive a spring per car: lateral from the curve (v^2 x curvature),
   lateral from a lane change, and longitudinal. The renderer would derive them from what the page already holds. This drives the loop's traffic at 20 Hz, draws each car at 60 frames a second through `carriedPose` (as the screen does), and
   asks of each candidate signal: how much of its power sits above 8 Hz BEFORE any spring (jitter), how much of what comes out of a 2.5 Hz spring (zeta 0.7) is ripple against a heavily smoothed reference, and what lag the
   candidate has against that reference.
     A  naive:  the second difference of the DRAWN positions (frame rate), lateral = along the heading's normal, longitudinal = along the heading;
     B  derived: lateral = v^2 x a CHORD curvature (headings at s +- d, d = 2.25 m, half a car) + the lane change's analytic second derivative at the carried time; longitudinal = the speed change across ticks, held between ticks;
     R  reference: the chord with d = 15 m and the same lane change term, then smoothed (what a design curve would give).
   Usage: node tools/measure/body-signal.mjs [seconds=60] [cars=200]. Asserts nothing. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, carriedWorld, carriedPose, DT } from "../../src/sim/crossing.js";
import { lateralOf } from "../../src/sim/lanechange.js";
import { poseOnGraph } from "../../src/sim/graph.js";
const SECS = +(process.argv[2] ?? 60), CARS = +(process.argv[3] ?? 200), FPS = 60, FDT = 1 / FPS;
let w = seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build()), { target: CARS, posted: true });
const snaps = [w];
for (let i = 0; i < SECS / DT; i++) { w = step(w); snaps.push(w); }
const rad = (d) => (d * Math.PI) / 180, turnOf = (a, b) => ((a - b + 540) % 360) - 180;
/* WINDOWS, NOT CARS: a car crosses a seam (its route changes) every few hundred metres, and the bends are where the curvature is. Each car's stretches of ONE route that last long enough give a window of WIN seconds, kept apart by what the car does in it. */
const WIN = 5, frames = WIN * FPS;
const windows = [];
{
  const open = new Map();   // id -> { key, t0 }
  const close = (id, o, tEnd) => { if (tEnd - o.t0 >= WIN + 2) windows.push({ id, ti0: Math.round((o.t0 + 1) / DT) }); };
  for (let ti = 0; ti < snaps.length; ti++) {
    const here = new Map(snaps[ti].actors.filter((a) => !a.player && !a.crash).map((a) => [a.id, a]));
    for (const [id, o] of open) { const a = here.get(id); if (!a || `${a.k}|${a.route}` !== o.key) { close(id, o, ti * DT); open.delete(id); } }
    for (const [id, a] of here) if (!open.has(id)) open.set(id, { key: `${a.k}|${a.route}`, t0: ti * DT });
  }
  for (const [id, o] of open) close(id, o, snaps.length * DT);
}
const curv = (course, a, d) => { const L = course.at[a.k ?? 0].layout.paths[a.route].length, s = Math.min(L - d - 0.1, Math.max(d + 0.1, a.s)); return turnOf(poseOnGraph(course, a.k ?? 0, a.route, s + d).rot, poseOnGraph(course, a.k ?? 0, a.route, s - d).rot) * Math.PI / 180 / (2 * d); };
const series = [];
for (const { id, ti0 } of windows.slice(0, 600)) {
  const rows = [];
  for (let f = 0; f < frames; f++) {
    const t = ti0 * DT + f * FDT, ti = Math.floor(t / DT + 1e-9), carry = t - ti * DT, wc = carriedWorld(snaps[ti], carry), a = snaps[ti].actors.find((x) => x.id === id);
    if (!a) { rows.length = 0; break; }
    const p = carriedPose(wc, a, carry), course = snaps[ti].course, tt = snaps[ti].t + carry, lc2 = a.lc ? (lateralOf(a.lc, tt + 0.05) - 2 * lateralOf(a.lc, tt) + lateralOf(a.lc, tt - 0.05)) / 0.0025 : 0;
    const prev = snaps[Math.max(0, ti - 1)].actors.find((x) => x.id === id), aLong = prev ? (a.v - prev.v) / DT : 0;
    rows.push({ x: p.x, y: p.y, h: p.rot, v: a.v, kB: curv(course, a, 2.25), kB2: curv(course, a, 4.5), kB4: curv(course, a, 9), kR: curv(course, a, 15), lc2, aLong, lc: !!a.lc && tt < a.lc.t0 + a.lc.T });
  }
  if (rows.length === frames) series.push({ id, rows });
}
/* the signals, per car */
const sig = series.map(({ id, rows }) => {
  const A_lat = [], A_lon = [], B_lat = [], B2_lat = [], B4_lat = [], B_lon = [], R_lat = [];
  for (let f = 1; f < rows.length - 1; f++) {
    const r0 = rows[f - 1], r1 = rows[f], r2 = rows[f + 1], h = rad(r1.h), n = { x: -Math.sin(h), y: Math.cos(h) }, u = { x: Math.cos(h), y: Math.sin(h) };
    const ax = (r2.x - 2 * r1.x + r0.x) / (FDT * FDT), ay = (r2.y - 2 * r1.y + r0.y) / (FDT * FDT);
    A_lat.push(ax * n.x + ay * n.y); A_lon.push(ax * u.x + ay * u.y);
    B_lat.push(r1.v * r1.v * r1.kB + r1.lc2); B2_lat.push(r1.v * r1.v * r1.kB2 + r1.lc2); B4_lat.push(r1.v * r1.v * r1.kB4 + r1.lc2); B_lon.push(r1.aLong); R_lat.push(r1.v * r1.v * r1.kR + r1.lc2);
  }
  return { id, A_lat, A_lon, B_lat, B2_lat, B4_lat, B_lon, R_lat, hasLc: rows.some((r) => r.lc), curved: rows.filter((r) => Math.abs(r.v * r.v * r.kR) > 0.3).length / rows.length };
});
/* power above 8 Hz (a plain DFT: the series are short) */
const hfShare = (x) => { const N = x.length, m = x.reduce((a, b) => a + b, 0) / N; let tot = 0, hi = 0; for (let k = 1; k < N / 2; k += 1) { const fr = (k * FPS) / N; let re = 0, im = 0; for (let n = 0; n < N; n += 1) { const ang = (2 * Math.PI * k * n) / N, v = x[n] - m; re += v * Math.cos(ang); im += v * Math.sin(ang); } const p = re * re + im * im; tot += p; if (fr > 8) hi += p; } return tot ? hi / tot : 0; };
/* a 2.5 Hz spring, zeta 0.7, driven by the signal (semi-implicit, at the frame rate) */
const spring = (x) => { const wn = 2 * Math.PI * 2.5, z = 0.7; let th = 0, om = 0; const out = []; for (const a of x) { om += (a - 2 * z * wn * om - wn * wn * th) * FDT; th += om * FDT; out.push(th); } return out; };
const std = (x) => { const m = x.reduce((a, b) => a + b, 0) / x.length; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / x.length); };
const lagOf = (x, y) => { let best = 0, bv = -Infinity; for (let L = -30; L <= 30; L++) { let s = 0; for (let i = 40; i < x.length - 40; i++) s += x[i] * y[i + L]; if (s > bv) { bv = s; best = L; } } return best / FPS; };
/* RIPPLE, NORMALISED BY THE LEVEL OF THE SIGNAL (RMS including its steady part, as a lean in a bend is a steady angle) AND SKIPPED WHERE THERE IS NOTHING TO RIPPLE (a reference under 0.2 m/s^2 equivalent): the first version normalised by the standard deviation, which is nothing on a steady bend, and printed 1e12 on a straight. */
const ripple = (x, ref) => { const th = spring(x), tr = spring(ref), lvl = Math.sqrt(tr.reduce((a, b) => a + b * b, 0) / tr.length), floor = 0.2 / ((2 * Math.PI * 2.5) ** 2); if (!(lvl > floor)) return NaN; const e = th.map((v, i) => v - tr[i]); return std(e) / lvl; };
const pick = (f, sel) => { const S = sig.filter(sel); if (!S.length) return null; return S.map(f).filter((x) => Number.isFinite(x)); };
const mean = (xs) => (xs && xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3) : null);
const out = { cars: sig.length, withLaneChange: sig.filter((s) => s.hasLc).length, curvedCars: sig.filter((s) => s.curved > 0.3).length, seconds: SECS - 1 };
for (const [name, sel] of [["curved", (s) => s.curved > 0.3], ["lane-change", (s) => s.hasLc], ["straight, no lane change", (s) => s.curved <= 0.3 && !s.hasLc]]) {
  out[name] = {
    n: sig.filter(sel).length,
    "lateral A (differenced poses): share of power above 8 Hz": mean(pick((s) => hfShare(s.A_lat), sel)),
    "lateral B (chord + analytic): share above 8 Hz": mean(pick((s) => hfShare(s.B_lat), sel)),
    "lateral A after the spring: ripple against the reference": mean(pick((s) => ripple(s.A_lat, s.R_lat), sel)),
    "lateral B (chord 2.25 m each side) after the spring: ripple": mean(pick((s) => ripple(s.B_lat, s.R_lat), sel)),
    "lateral B (chord 4.5 m) after the spring: ripple": mean(pick((s) => ripple(s.B2_lat, s.R_lat), sel)),
    "lateral B (chord 9 m) after the spring: ripple": mean(pick((s) => ripple(s.B4_lat, s.R_lat), sel)),
    "windows with a signal to ripple (of n)": pick((s) => ripple(s.B_lat, s.R_lat), sel)?.length ?? 0,
    "lateral B lag against the reference, s": mean(pick((s) => lagOf(spring(s.R_lat), spring(s.B_lat)), sel)),
    "longitudinal A (differenced poses): share above 8 Hz": mean(pick((s) => hfShare(s.A_lon), sel)),
    "longitudinal B (speed across ticks): share above 8 Hz": mean(pick((s) => hfShare(s.B_lon), sel)),
    "longitudinal A after the spring: ripple against B's own heavy smooth": mean(pick((s) => ripple(s.A_lon, s.B_lon.map((_, i, a) => { let t = 0, c = 0; for (let j = Math.max(0, i - 15); j <= Math.min(a.length - 1, i + 15); j++) { t += a[j]; c++; } return t / c; })), sel)),
    "longitudinal B after the spring: ripple against the same": mean(pick((s) => ripple(s.B_lon, s.B_lon.map((_, i, a) => { let t = 0, c = 0; for (let j = Math.max(0, i - 15); j <= Math.min(a.length - 1, i + 15); j++) { t += a[j]; c++; } return t / c; })), sel)),
  };
}
console.log(JSON.stringify(out, null, 1));
