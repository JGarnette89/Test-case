/* =====================================================================
   PACING THE WORKER: when the page asks for a tick, and how far ahead of
   the world it holds to draw (14 October).

   The world the page draws is the one the worker last answered with, and
   it is drawn `carry` seconds on: carry = owed, the time since that
   world's moment. So owed must come down WHEN THE STEPPED WORLD ARRIVES,
   never when the step is sent.

   The version this replaced took DT off owed at send. Until the answer
   landed every car was drawn a whole tick behind where it had just been
   drawn, then jumped forward on the answer -- a 20 Hz stutter on every
   car whatever was on screen, at an ordinary frame cost, so the bench and
   every frame-time meter stayed green (the maintainer saw it on the
   phone). `verify-worker` drives both versions headlessly and measures
   the motion drawn, not the time a frame took.

   Pure: the page keeps the state.
   ===================================================================== */
import { DT } from "./traffic.js";

export const OWED_CAP = 2 * DT;   // s: an overloaded worker slows the world rather than piling up

export const newPace = () => ({ owed: 0, inFlight: false });

/* A frame of `dt` seconds. `ready`: the worker can take a step. Returns
   whether to send one now; the page steps the player and posts. */
export function paceFrame(p, dt, ready) {
  p.owed = Math.min(p.owed + dt, OWED_CAP);
  if (!ready || p.inFlight || p.owed < DT) return false;
  p.inFlight = true;
  return true;
}

/* The stepped world has arrived: the drawn world is now a tick later. */
export function paceReply(p) {
  p.owed = Math.max(0, p.owed - DT);
  p.inFlight = false;
}

/* How far past the drawn world's moment to draw it. */
export const carryOf = (p) => p.owed;

/* =====================================================================
   THE SIM'S CLOCK AGAINST THE WALL'S (15 October; the maintainer: "the
   fps is solid but it's like the simulation itself is slowing down").
   Every frame meter here measured FRAMES; a world running at half speed
   with perfect frames passed all of them. This measures the world: each
   tick as it lands -- the wall time, the world's own time, what the step
   cost where it ran, and the round trip when it ran in a worker -- and
   says, over the last WINDOW seconds, how many simulated seconds passed
   per real second, and the spread of the intervals between ticks, so
   jitter shows as spread rather than being averaged away.
   ===================================================================== */
export const WINDOW = 5;   // s of wall time the clock reports over
export const newSimClock = () => ({ wall: [], sim: [], stepMs: [], rtMs: [] });
export function clockTick(c, wallMs, simT, { stepMs = null, rtMs = null } = {}) {
  c.wall.push(wallMs); c.sim.push(simT); c.stepMs.push(stepMs); c.rtMs.push(rtMs);
  while (c.wall.length > 2 && wallMs - c.wall[0] > WINDOW * 1000) { c.wall.shift(); c.sim.shift(); c.stepMs.shift(); c.rtMs.shift(); }
}
const pct = (xs, f) => { const v = xs.filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(f * v.length))] : null; };
export function clockSummary(c) {
  const n = c.wall.length;
  if (n < 3) return null;
  const gaps = [];
  for (let i = 1; i < n; i++) gaps.push(c.wall[i] - c.wall[i - 1]);
  const r = (x) => (x == null ? null : Math.round(x * 10) / 10);
  return {
    rate: (c.sim[n - 1] - c.sim[0]) / ((c.wall[n - 1] - c.wall[0]) / 1000),
    tick: { p50: r(pct(gaps, 0.5)), p95: r(pct(gaps, 0.95)), max: r(Math.max(...gaps)) },
    step: { p50: r(pct(c.stepMs, 0.5)), p95: r(pct(c.stepMs, 0.95)), max: r(pct(c.stepMs, 1)) },
    rt: { p50: r(pct(c.rtMs, 0.5)), p95: r(pct(c.rtMs, 0.95)) },
  };
}
