/* =====================================================================
   THE CANDIDATE'S CHECKS, AS EVENTS (27 October; DECISIONS 10.28 point
   6, the gating dependency for the examiner layer; SIMULATOR IN FLIGHT 31).

   A check is a NAMED EVENT with a DIRECTION and a TIMING, made by a
   driver's own behaviour at an OCCASION -- never narrated after the fact.
   The real sheet's most frequent item is Traffic Check (10.26), and an
   examiner can only mark what a candidate visibly did.

   THE KINDS, each a direction relative to the car's heading (degrees,
   clockwise positive: right is +90) and how long the eyes stay there:
     mirror            the rear-view mirror: behind
     mirror-left|right the side mirror: the rear quarter on that side
     shoulder-left|right over the shoulder: the blind spot
     left|right        along the cross road, from a line
   Durations are FLAGGED design constants: a glance at a mirror is about
   half a second, a shoulder check the same, a look along a cross road the
   same -- of the order of a registration, not tuned to any outcome.

   THE OCCASIONS (where the check is made, and what decides it):
   - A LANE CHANGE: the side mirror toward the move, then the shoulder
     check toward it, BEFORE the move (lanechange.js prepares; the signal
     is on from the start). Made in `lcChecks`.
   - PULLING AWAY FROM A LINE: left, right, left, begun as the car slows
     for the line; it does not move off until the look is done (crossing.js).
     Made in `scanChecks`.
   - THE SCHEDULED GLANCE of a perceiving driver (attention.js) IS a
     rear-view mirror check. Look-away and checks are one mechanism: while
     a driver is checking anything, the road ahead is carried, not seen.

   WHO CHECKS WHAT:
   - OBSERVATION decides whether a check is made at all, PER OCCASION:
     skipped with chance SKIP_PER_DEFICIT x the observation deficit, one
     draw per occasion from the occasion's own seed -- the rate the lane
     change's blind-spot check was measured at before checks were events,
     kept, not re-chosen.
   - KNOWLEDGE decides whether the RIGHT check is made at the right moment,
     PER DRIVER and consistently (core/driver.js `reads`, the kinds
     "shoulder-check" and "left-right-left"): a driver who does not know
     the shoulder check either omits it or makes it late -- after the move
     has begun -- the same way every time (which, from their own draw); one
     who does not know left-right-left looks right then left, ending away
     from the near traffic.
   ===================================================================== */
import { reads, deficitOf } from "../core/driver.js";
import { lookingAway } from "./attention.js";

export const CHECKS = {
  "mirror": { bearing: 180, dur: 0.5 },
  "mirror-left": { bearing: -150, dur: 0.4 },
  "mirror-right": { bearing: 150, dur: 0.4 },
  "shoulder-left": { bearing: -120, dur: 0.5 },
  "shoulder-right": { bearing: 120, dur: 0.5 },
  "left": { bearing: -80, dur: 0.5 },
  "right": { bearing: 80, dur: 0.5 },
};
/* The chance an occasion's checks are skipped, per unit of observation
   deficit: the lane change's blind-spot rate before checks were events
   (lanechange.js, measured and kept). */
export const SKIP_PER_DEFICIT = 0.6;
/* Looks in a sequence run back to back: the eyes are off the road from the first to the last (a gap between them drew as the road for a tick while the picture was still carried). */
const BETWEEN = 0;

/* A sequence of looks from t0: [[kind, from, to], ...]. */
function seq(kinds, t0) {
  const out = [];
  let t = t0;
  for (const k of kinds) { out.push([k, t, t + CHECKS[k].dur]); t += CHECKS[k].dur + BETWEEN; }
  return out;
}
const endOf = (steps) => (steps.length ? steps[steps.length - 1][2] : null);

/* Skips this occasion's checks: `u` is the occasion's own uniform draw. */
export const skips = (me, u) => u < SKIP_PER_DEFICIT * (deficitOf(me.ratings ?? {}, "observation").deficit ?? 0);

/* A driver who does not know a check: which way they get it wrong is
   their own, from the same draw that decided they do not know it (the
   kind's `stuck` value, core/driver.js), so it is the same every time. */
const wrongWay = (me, kind) => ((me.stuck?.[kind] ?? 0.5) < 0.5 ? "omits" : "late");

/* THE LANE CHANGE'S CHECKS, decided when the change is decided. `dir` +1
   is a move right. Returns the looks before the move, when the move may
   begin, whether the blind spot will have been looked at by then, and any
   look that comes late (after the move begins). */
export function lcChecks(me, dir, t, u) {
  const side = dir > 0 ? "right" : "left";
  if (skips(me, u)) return { steps: [], ready: t, shoulder: false, late: null, skipped: true };
  if (me.player || reads(me, "shoulder-check")) {
    const steps = seq([`mirror-${side}`, `shoulder-${side}`], t);
    return { steps, ready: endOf(steps), shoulder: true, late: null, skipped: false };
  }
  const steps = seq([`mirror-${side}`], t);
  const ready = endOf(steps);
  if (wrongWay(me, "shoulder-check") === "omits") return { steps, ready, shoulder: false, late: null, skipped: false, wrong: "omits" };
  /* Late: over the shoulder a beat after the wheel has turned. */
  return { steps, ready, shoulder: false, late: seq([`shoulder-${side}`], ready + 0.3), skipped: false, wrong: "late" };
}

/* PULLING AWAY: the look along the cross road, begun as the car slows for
   the line. */
export function scanChecks(me, t, u) {
  if (skips(me, u)) return { steps: [], until: t, skipped: true };
  const order = me.player || reads(me, "left-right-left") ? ["left", "right", "left"] : ["right", "left"];
  const steps = seq(order, t);
  return { steps, until: endOf(steps), skipped: false, wrong: order.length === 2 ? "order" : null };
}

/* WHAT THIS DRIVER IS LOOKING AT NOW: the look in progress from a lane
   change's preparation (or its late look), a scan at a line, or a
   scheduled glance -- which is the rear-view mirror. Null: the road ahead. */
export function lookOf(me, t) {
  /* A late look is the move's (lc.late, timed from when the move begins): the preparation's copy is only the plan, and drawn it showed a late shoulder check before the move during the wait for a gap (verify-checks, 27 October). */
  for (const steps of [me.lcPrep?.steps, me.lc?.late, me.scan?.steps]) {
    if (!steps) continue;
    for (const [kind, a, b] of steps) if (t >= a && t < b) return { kind, t0: a, t1: b };
  }
  const away = lookingAway(t, me);
  if (away > 0) return { kind: "mirror", t0: t - away, t1: t - away + (me.lag ?? 0) };
  return null;
}

/* Since when the eyes have been off the road, if they are now (s), for a
   check that is not a scheduled glance -- what a perceiving driver's
   picture of the road ahead is carried from (crossing.js seenBy). */
export function eyesOffSince(me, t) {
  /* A late look is the move's (lc.late, timed from when the move begins): the preparation's copy is only the plan, and drawn it showed a late shoulder check before the move during the wait for a gap (verify-checks, 27 October). */
  for (const steps of [me.lcPrep?.steps, me.lc?.late, me.scan?.steps]) {
    if (!steps?.length) continue;
    const first = steps[0][1], last = steps[steps.length - 1][2];
    if (t >= first && t < last) return first;
  }
  return null;
}

/* The side a look along the cross road covers, or null. */
export const sideOf = (kind) => (kind === "left" || kind === "right" ? kind : null);

/* EVERY TIME THE CHECKS KEEP, MOVED BY A CLOCK'S REBASE (crossing.js
   `warmed`): the warm-up runs on its own clock and then starts the world
   at 0. Left on the warm-up's clock, a scan made during it lay fourteen
   seconds in the future and held its driver at the line that long, marked
   for undue delay (27 October, tools/scratch -- found before it shipped);
   the same trap the scheduled glance fell into on 22 October. Every field
   here that holds a time is moved, and only here. */
export function rebaseLooks(a, shift) {
  const steps = (xs) => (xs ? xs.map(([k, from, to]) => [k, from - shift, to - shift]) : xs);
  const out = { ...a };
  if (a.lcPrep) out.lcPrep = { ...a.lcPrep, at: a.lcPrep.at - shift, ready: a.lcPrep.ready - shift, ...(a.lcPrep.seen != null ? { seen: a.lcPrep.seen - shift } : {}), steps: steps(a.lcPrep.steps), late: steps(a.lcPrep.late) };
  if (a.lc?.late) out.lc = { ...a.lc, late: steps(a.lc.late) };
  if (a.scan) out.scan = { ...a.scan, until: a.scan.until - shift, steps: steps(a.scan.steps) };
  if (a.looked) out.looked = Object.fromEntries(Object.entries(a.looked).map(([k, v]) => [k, v - shift]));
  if (a.look) out.look = { ...a.look, t0: a.look.t0 - shift, t1: a.look.t1 - shift };
  return out;
}
