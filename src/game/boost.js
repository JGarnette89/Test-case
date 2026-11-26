/* =====================================================================
   THE LAUNCH IS A BOOST (WORK-game-slice9; pure, no React, no DOM, so a
   check in Node reads the same arithmetic the screen does).

   Jay, after slice 7: "Gotta launch the car even harder, I want it to
   feel like a fun boost through the intersection at full throttle."

   Two halves. The ENGINE: after GO the car carries `power = BOOST`, the
   sim's own opt-in multiplier on full throttle (sim/player.js accelFor's
   fourth argument; 1 or absent is the old arithmetic bit for bit). The
   FEEL, here: what the screen draws while the car is accelerating hard --
   the camera trailing, a small shake, speed lines, tire smoke. Every one
   is a function of a `state` the frame loop keeps in a closure variable
   (never React state) and of the car's own acceleration.
   ===================================================================== */
import { T_MAX, resistance } from "../sim/player.js";

/* The engine's multiplier after GO [invented, for Jay to tune]. About 6.8 m/s^2 from rest [D: BOOST x T_MAX - ROLL, 2.5 x 3.0 - 0.25 with T_MAX from sim/player.js],
   0 to 50 km/h in about 2 s: a sports car. */
export const BOOST = 2.5;

/* HARD ACCELERATING: the car's own net acceleration above this share of what the boosted full throttle could give at its speed [the spec's 0.6]. */
export const HARD_AT = 0.6;
export const hardShare = (me) => {
  const full = BOOST * T_MAX - resistance(me.v ?? 0, me.grade ?? 0);
  return full > 0 ? (me.a ?? 0) / full : 0;
};
export const isHard = (me) => hardShare(me) > HARD_AT;

/* The camera trails the car by up to this many metres at the launch's peak [spec: 3], easing back over EASE_BACK seconds [invented, spec]; it takes RISE_S to fall behind [invented]. */
export const LAG_M = 3, EASE_BACK = 0.6, RISE_S = 0.15;
/* The shake: at most SHAKE_PX [spec: 2], fading over SHAKE_S [invented, spec]. Smoke: for the first SMOKE_S of a launch [invented, spec]; a puff lives PUFF_S. */
export const SHAKE_PX = 2, SHAKE_S = 0.4, SMOKE_S = 0.4, PUFF_S = 0.6;
/* Speed lines: at most this many, at the edges, their length rising with speed [invented]. */
export const STREAKS_MAX = 14, STREAK_MIN_PX = 18, STREAK_MAX_PX = 90;

export const newBoost = () => ({ k: 0, shake: 0, since: Infinity, on: false, puffs: [] });

/* One frame of the feel: `hard` is isHard(me) while the car is GONE (and the round not over), else false. Returns the next state (the puffs are aged here;
   spawning is `spawnPuffs`). */
export function boostStep(st, hard, dt) {
  const onset = hard && !st.on;
  const k = hard ? Math.min(1, st.k + dt / RISE_S) : Math.max(0, st.k - dt / EASE_BACK);
  const shake = onset ? 1 : Math.max(0, st.shake - dt / SHAKE_S);
  const since = onset ? 0 : hard ? st.since + dt : Infinity;
  const puffs = st.puffs.map((p) => ({ ...p, age: p.age + dt })).filter((p) => p.age < PUFF_S);
  return { k, shake, since, on: hard, puffs };
}

/* The camera's trail behind the car, m. */
export const lagOf = (st) => LAG_M * st.k;
/* The shake's offset, px (a fixed wobble scaled by what is left of it). */
export const shakeOf = (st, t) => ({ x: SHAKE_PX * st.shake * Math.sin(t * 91), y: SHAKE_PX * st.shake * Math.sin(t * 73 + 1) });
/* The speed lines for a screen: [{ x, y0, y1 }] down the two edges, moving down the screen as the road moves past, count and length rising with speed. */
export function streaksOf(st, v, limit, size, t) {
  if (st.k <= 0.02) return [];
  const u = Math.max(0, Math.min(1, v / limit)), n = Math.round(STREAKS_MAX * u * st.k), out = [];
  const len = STREAK_MIN_PX + (STREAK_MAX_PX - STREAK_MIN_PX) * u, band = Math.min(70, size.w * 0.18);
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, r = ((i * 0.6180339887) % 1), x = side < 0 ? band * r : size.w - band * r;
    const y0 = ((((r * 7.31 + t * (1.2 + 2.2 * u)) % 1) + 1) % 1) * (size.h + len) - len;
    out.push({ x, y0, y1: y0 + len, alpha: 0.5 * st.k });
  }
  return out;
}
/* Tire smoke: while the launch is in its first SMOKE_S, two puffs a frame from the rear wheels (world points behind the car, half a width either side). */
export function spawnPuffs(st, pose, dims) {
  if (!st.on || st.since >= SMOKE_S) return st;
  const h = (pose.heading * Math.PI) / 180, c = Math.cos(h), s = Math.sin(h), back = dims.length / 2 - 0.5, half = dims.width / 2 - 0.2;
  const at = (side) => ({ x: pose.x - c * back - s * half * side, y: pose.y - s * back + c * half * side, z: pose.z ?? 0, age: 0 });
  return { ...st, puffs: [...st.puffs, at(1), at(-1)] };
}
