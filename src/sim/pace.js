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
