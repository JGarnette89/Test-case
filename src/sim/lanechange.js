/* =====================================================================
   LANE CHANGES: behaviour arising from the ratings, not a manoeuvre on cue.

   SIMULATOR.md 1.1.2 recorded that lane changing became REACHABLE when
   roads gained lanes, and what was missing: the decision and the blend.
   This is both, and the rule for writing it was the one the project was
   reframed around -- in a single-file queue none of the five axes has
   anything to say about a lane change, so each part of the manoeuvre is
   decided by the axis that governs it in a real driver:

     CONFIDENCE decides WHETHER. How big a speed gain it takes to bother
       (a bold driver changes for a little, a timid one only for a lot),
       and how small a gap they will take (a bold driver cuts in on a
       gap a cautious one refuses). One number, `caution`, the same one
       that sets their speed and their gaps at a stop.
     OBSERVATION decides whether they SAW. The car in the target lane
       beside and just behind is the blind spot; a poor observer can
       skip the check, start into a space somebody is already in, and
       only register them after their registration delay -- then swing
       back. The abort is the fault an examiner would see, and nothing
       touches: the intrusion before they notice is bounded by the time
       it takes, and it is under the air between two cars side by side.
     STEERING decides how CLEANLY they arrive. A sound driver blends
       across in the time the road's comfort allows; a poor one takes
       longer and runs past the new lane's centre before settling --
       bounded exactly as the weave is, half the room, so they never
       reach the car in the far lane.

   And one rule that is not a rating: A DRIVER DOES NOT LEAVE THE LANE
   THEIR TURN NEEDS. A car only moves into a lane that offers the turn it
   is making, so a right-turner stays in the curb lane and a left-turner
   beside the centre line. Where to change lanes to MAKE a turn is a
   second behaviour and is not this one.

   Nobody changes lane inside the approach's last stretch -- the change
   must finish before the line, at this speed, with room to spare -- nor
   within a lag window of the seam, where the car behind could still be
   filed under the previous node and would not be seen.

   The one thing held here is `me.lc`, the manoeuvre in progress: the
   route it left, when it started, how long it takes, and where the car
   began relative to its new lane. The car's route switches at the START
   -- it is in the new lane for everyone who follows there -- and it
   stays in the old one too, for following, until the blend is over
   (crossing.js `whatStops`).
   ===================================================================== */
import { deficitOf } from "../engine/ratings.js";
import { rng } from "../engine/index.js";
import { REACTION_FLOOR } from "../engine/score.js";
import { REGISTER_SPAN } from "../engine/awareness.js";
import { CAR, wantedGap, weaveRoom } from "./traffic.js";
import { LATERAL } from "./course.js";

const LANE = 3.6;
/* HOW LONG A CLEAN CHANGE TAKES, derived rather than chosen: a smooth
   (smoothstep) lateral move of one lane has its peak sideways
   acceleration 6L/T^2 at the ends, and the road's own comfort limit for
   sideways acceleration is course.js LATERAL (0.15 g -- what sizes a
   bend). Solved for T: about 3.8 s for a 3.6 m lane. */
export const LC_TIME = Math.sqrt((6 * LANE) / LATERAL);
/* HOW MUCH FASTER THE NEXT LANE HAS TO BE to be worth it, for a driver
   at caution 1, in m/s -- scaled by caution, so a bold driver changes
   for less and a timid one for more. A design constant, flagged: how
   much a driver cares about 7 km/h is a matter of temperament, which
   is the point, and this sets the middle of it. */
export const LC_GAIN = 2.0;
/* How far ahead a driver looks for what is holding them up, in seconds
   of their own wanted speed. */
const LOOK = 4.0;
/* The blind spot: the stretch of the next lane beside and just behind
   the car. A car there is the one a skipped check misses. */
const BLIND_BEHIND = 10, BLIND_AHEAD = CAR.length;
/* How often a driver reconsiders, in ticks. A lane change is not a
   20 Hz decision, and asking it twice a second rather than twenty times
   is most of what keeps its cost small (SIMULATOR.md 1.1.13). */
export const LC_EVERY = 10;
/* Once changed, not again for this long: a driver settles in a lane. */
const SETTLE = 6;

const smooth = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : p * p * (3 - 2 * p));

/* WHERE THE CAR IS, SIDEWAYS, RELATIVE TO THE LANE IT IS CHANGING INTO,
   t seconds into the manoeuvre. `L0` is the old lane's offset (signed,
   right positive), `ov` the overshoot a poor steerer carries past the
   new lane's centre, peaking late and gone by the end. */
export function lateralOf(lc, t) {
  if (!lc) return 0;
  const p = Math.max(0, Math.min(1, (t - lc.t0) / lc.T));
  const past = -Math.sign(lc.L0) * lc.ov * Math.sin(Math.PI * p) * p;
  return lc.L0 * (1 - smooth(p)) + past;
}
/* And its rate, for the heading: a car changing lane points across it. */
export function lateralRate(lc, t) {
  if (!lc) return 0;
  const h = 0.05;
  return (lateralOf(lc, t + h) - lateralOf(lc, t - h)) / (2 * h);
}
export const changing = (lc, t) => !!lc && t < lc.t0 + lc.T;

/* The car in the lane `legId` of this node nearest ahead of s, and
   nearest behind, from the actors at this node. A changer counts in
   both of its lanes while the blend lasts. */
function neighbours(world, me, legId, s) {
  let ahead = null, behind = null, da = Infinity, db = Infinity;
  const layout = world.course.at[me.k ?? 0].layout;
  for (const a of world.actors) {
    if (a.id === me.id || (a.k ?? 0) !== (me.k ?? 0)) continue;
    const from = layout.paths[a.route]?.from;
    const inLane = from === legId || (changing(a.lc, world.t) && a.lc.fromLeg === legId);
    if (!inLane) continue;
    const d = a.s - s;
    if (d >= 0 && d < da) { da = d; ahead = a; }
    if (d < 0 && -d < db) { db = -d; behind = a; }
  }
  return { ahead, behind, da, db };
}

/* ONE DRIVER, ONE TICK: start a change, carry one on, abort one that
   went into somebody, or leave them alone. `out` is the actor as the
   tick has already moved it; returns it, possibly with a new route, a
   re-mapped `s` and an `lc`. */
export function laneStep(world, me, out, view) {
  const t = world.t;
  const layout = world.course.at[out.k ?? 0].layout;

  /* A MANOEUVRE IN PROGRESS: finished, or noticed to be wrong. */
  if (out.lc) {
    if (!changing(out.lc, t)) return { ...out, lc: null, lcDone: t };
    /* THE ABORT. A driver who skipped the check registers the car they
       missed after their registration delay; if it is still in the
       blind spot, they swing back to the lane they left, from wherever
       they are -- continuous, no jump. */
    if (out.lc.missed && !out.lc.abort && t >= out.lc.t0 + out.lc.noticeAfter) {
      const path = layout.paths[out.route];
      const nb = neighbours(world, out, path.from, out.s);
      const beside = (nb.behind && nb.db < BLIND_BEHIND) || (nb.ahead && nb.da < BLIND_AHEAD);
      if (beside) {
        const back = layout.paths[out.lc.from];
        const here = lateralOf(out.lc, t);
        return {
          ...out,
          route: out.lc.from,
          s: out.s * (back.stopAt / path.stopAt),
          aborts: (out.aborts ?? 0) + 1,
          lc: { ...out.lc, from: out.route, fromLeg: path.from, t0: t, T: out.lc.T / 2, L0: here - out.lc.L0, ov: 0, abort: true },
        };
      }
    }
    return out;
  }

  /* CONSIDERING ONE: twice a second, staggered, and only when it could
     possibly be wanted. The cheap tests first -- most cars fail the first
     line and cost nothing more. */
  if ((world.tick + (out.n ?? 0)) % LC_EVERY !== 0) return out;
  if (out.going || out.stoppedAt != null || out.v < 3) return out;
  if (out.lcDone != null && t - out.lcDone < SETTLE) return out;
  const path = layout.paths[out.route];
  const leg = layout.legs[path.from];
  if (!leg || (leg.lanes ?? 1) < 2) return out;
  const T0 = LC_TIME;
  if (out.s < BLIND_BEHIND + 30 || path.stopAt - out.s < out.v * T0 * 1.5 + 15) return out;

  /* THE MOTIVE: held back by a slower car in this lane. */
  const leader = view?.leader;
  const want = out.v0 ?? out.v;
  const look = Math.max(30, want * LOOK);
  if (!leader || leader.id === "line" || view.gap > look) return out;
  const here = Math.min(want, leader.v ?? 0);
  if (here > want - 1) return out;
  /* ROOM TO SWING OUT. For the first half of the blend the car is still
     mostly in the lane it is leaving, closing on the car it wanted to get
     round. A driver who starts the change with less than that closing
     distance in hand runs into that car's tail before they are clear of
     it -- measured, at 200 cars: a change begun 4 m behind a stopped
     car. */
  const closing = Math.max(0, out.v - (leader.v ?? 0));
  if (view.gap < closing * LC_TIME * 0.5 + 2) return out;

  const caution = out.caution ?? 1;
  let best = null;
  for (const dir of [-1, 1]) {
    const to = leg.lane + dir;
    if (to < 0 || to >= leg.lanes) continue;
    const toLeg = `${leg.base}#${to}`;
    if (!layout.legs[toLeg]) continue;
    /* ...and never out of the lane the turn needs. */
    const route = layout.routesFrom(toLeg).find((r) => layout.paths[r].intent === path.intent);
    if (!route) continue;
    const target = layout.paths[route];
    const s2 = out.s * (target.stopAt / path.stopAt);
    const nb = neighbours(world, out, toLeg, s2);
    const there = nb.ahead && nb.da - CAR.length < look ? Math.min(want, nb.ahead.v) : want;
    const gain = there - here;
    if (gain < LC_GAIN * Math.max(0.2, caution)) continue;
    if (!best || gain > best.gain) best = { dir, to, toLeg, route, s2, nb, gain };
  }
  if (!best) return out;

  /* THE GAP, AT THIS DRIVER'S CONFIDENCE. What the car behind in the
     target lane would want to leave them, and what they would want to
     leave the car ahead, both from stage 0's own following model,
     scaled by caution: a competent driver moves only into the gap the
     car behind is comfortable with; a bold one takes a third of it. A
     floor of a metre and a half bumper to bumper holds whatever the
     scale says -- boldness is tight, not contact. */
  const kappa = Math.max(0.3, Math.min(1.7, caution));
  const { nb } = best;
  const leadGap = nb.ahead ? nb.da - CAR.length : Infinity;
  const needLead = Math.max(1.5, kappa * wantedGap(out, nb.ahead ?? { v: out.v }));

  /* THE BLIND-SPOT CHECK, AT THIS DRIVER'S OBSERVATION. Drawn once per
     manoeuvre from the driver's own seed, so a run replays exactly. */
  const obs = deficitOf(out.ratings ?? {}, "observation").deficit ?? 0;
  const r = rng((world.seed ?? 1) * 7919 + (out.n ?? 0) * 104729 + (out.lcCount ?? 0) * 31 + 7);
  const inBlind = nb.behind && nb.db < BLIND_BEHIND;
  const missed = !!inBlind && r() < obs * 0.6;
  const lagGap = nb.behind ? nb.db - CAR.length : Infinity;
  const needLag = Math.max(1.5, kappa * wantedGap(nb.behind ?? { v: 0 }, out));
  if (leadGap < needLead) return out;
  /* Every time a driver got this far with somebody in the blind spot is
     an occasion to look or not -- counted whether they went or not, so
     a miss RATE can be read (verify-lanes.mjs), not only the misses. */
  const counted = inBlind ? { ...out, blindOcc: (out.blindOcc ?? 0) + 1, blindMiss: (out.blindMiss ?? 0) + (missed ? 1 : 0) } : out;
  if (!missed && lagGap < needLag) return counted;
  if (!missed && inBlind && nb.db < CAR.length + 1) return counted;   // somebody beside: a driver who looked does not go

  /* GO. The steering axis decides the blend. */
  const steer = deficitOf(out.ratings ?? {}, "steering").deficit ?? 0;
  const L0 = -best.dir * LANE;   // the old lane, relative to the new: moving right (to a higher index) leaves it on the left
  return {
    ...counted,
    route: best.route,
    s: best.s2,
    lcCount: (out.lcCount ?? 0) + 1,
    lc: {
      from: out.route, fromLeg: path.from, t0: t,
      T: T0 * (1 + 0.5 * steer),
      L0, ov: weaveRoom(LANE) * steer,
      missed, blind: !!inBlind, noticeAfter: REACTION_FLOOR + obs * REGISTER_SPAN,
      caution, gap: Math.min(leadGap, lagGap),
      /* How tight, against what a COMPETENT driver (caution 1) would
         need: below 1 is a gap they would have refused. */
      tight: Math.min(
        leadGap / Math.max(1.5, wantedGap(out, nb.ahead ?? { v: out.v })),
        lagGap / Math.max(1.5, wantedGap(nb.behind ?? { v: 0 }, out)),
      ),
    },
  };
}
