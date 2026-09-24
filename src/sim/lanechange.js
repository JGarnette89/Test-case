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
import { CAR, DT, wantedGap, weaveRoom } from "./traffic.js";
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
/* The hardest a car brakes -- traffic.js's clamp, an emergency stop. */
const MOST_BRAKE = 8.0;

/* KEEP RIGHT: THE KNOWLEDGE AXIS, ON THE LINK. The maintainer's ruling
   (SIMULATOR.md 1.1.17): "that would be a measure of law adherence,
   since in Ontario drivers should be moving into the driving (curb) lane
   unless there's something in the way or they are making an upcoming
   left turn." So a driver out of the curb lane is either there for a
   reason -- overtaking, somebody in the way, a turn the lane to the
   right does not make -- or failing to keep right, and which one is a
   fact the model holds (`reasonToStayOut`), not a guess.

   HOW LONG AFTER THE REASON HAS PASSED. A driver completing a pass does
   not snap back the instant the lane is clear; they take about the time
   a lane change itself takes to decide it is done. So the prompt return
   is LC_TIME after the reason passed -- a flagged design constant, the
   same number that times the change -- and knowledge stretches it:
   `RETURN_AFTER / (1 - deficit)`. A sound driver (deficit 0.13, the
   traffic's median) returns in 4.4 s; the weak-on-knowledge quarter
   (0.7) take 13 s, longer than most of an approach, so they sit out
   there; and a driver who does not know the rule at all never returns.
   Continuous, no threshold typed in. */
export const RETURN_AFTER = LC_TIME;
/* WHEN IT IS A FAULT: out of the curb lane with no reason for longer than
   this. Twice the prompt return -- a driver at knowledge deficit 0.5
   reaches it exactly, and every driver on the sound side of the ratings'
   profile (deficit 0.2 or less: 4.8 s) returns well inside it. A design
   constant and a domain question, flagged for the maintainer: how long an
   examiner lets a driver sit out of the curb lane before it is marked. */
export const KEEP_RIGHT_FAULT = 2 * RETURN_AFTER;

/* WHY A DRIVER IS OUT OF THE CURB LANE, if they have a reason, as a word;
   or, if they have none, the move back that the rule asks of them. The
   three exceptions are the maintainer's, and each is a fact about the
   road right now:
     "turn"     the lane to the right does not make the movement this car
                is making here -- sitting left before a left turn is the
                law, not hogging;
     "passing"  somebody in the lane to the right beside or just behind:
                the overtake is not finished;
     "inTheWay" a slower car ahead in the lane to the right, near enough
                to hold them up -- moving back would only mean passing
                again;
     "noGap"    no gap to move back into that a COMPETENT driver would
                take (gapFor at caution 1): a driver waiting for one is
                keeping right as soon as the road lets them. Without it,
                sound drivers were marked for a car in the next lane a
                little further back than the blind spot -- measured, 7 of
                their 162 occasions.
   And "noLane" where there is no lane to the right to be had: the
   overpass's lanes are separate one-lane roads, so nobody changes lane
   on them at all. */
function reasonToStayOut(world, out, layout, path, leg, look, want) {
  if (leg.lane >= (leg.lanes ?? 1) - 1) return "curb";
  const toLeg = `${leg.base}#${leg.lane + 1}`;
  if (!layout.legs[toLeg]) return "noLane";
  const exitOf = (r) => layout.legs[layout.paths[r].to]?.base ?? layout.paths[r].to;
  const exit = exitOf(out.route);
  const route = layout.routesFrom(toLeg).find((r) => exitOf(r) === exit);
  if (!route) return "turn";
  const s2 = out.s * (layout.paths[route].stopAt / path.stopAt);
  const nb = neighbours(world, out, toLeg, s2);
  if ((nb.behind && nb.db < BLIND_BEHIND) || (nb.ahead && nb.da < CAR.length + 2)) return "passing";
  if (nb.ahead && nb.da - CAR.length < look && (nb.ahead.v ?? 0) < want - 1) return "inTheWay";
  const g = gapFor(out, nb, 1);
  if (!g.leadOk || !g.lagOk) return "noGap";
  return { dir: 1, toLeg, route, s2, nb };
}

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

  /* Out of the curb lane with no reason is only ever judged on the
     stretch where a change could be made; anywhere else the clock stops. */
  const quiet = (o) => (o.hogSince != null ? { ...o, hogSince: null } : o);

  /* A MANOEUVRE IN PROGRESS: finished, or noticed to be wrong. A driver
     mid-change is where they mean to be, and nobody's clock runs. */
  if (out.lc) {
    out = quiet(out);
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
  const path = layout.paths[out.route];
  const leg = layout.legs[path.from];
  /* A WANT ALREADY MET: arriving in a lane that makes the movement this
     driver is heading for, they take it. */
  if (out.want && out.want.k === out.k) {
    const met = layout.routesFrom(path.from).find((r) => layout.legs[layout.paths[r].to]?.base === out.want.to);
    if (met && met !== out.route) return { ...out, route: met, s: out.s * (layout.paths[met].stopAt / path.stopAt), want: null, turnsMet: (out.turnsMet ?? 0) + 1 };
    if (met) return { ...out, want: null, turnsMet: (out.turnsMet ?? 0) + 1 };
  }
  if (out.going || out.stoppedAt != null || out.v < 3) return quiet(out);
  if (!leg || (leg.lanes ?? 1) < 2) return quiet(out);
  const T0 = LC_TIME;
  if (out.s < BLIND_BEHIND + 30) return quiet(out);

  /* THE LANE THE TURN NEEDS -- a MANDATORY change. The driver chose where
     they are going at the last node (crossing.js `routeFor`), and the
     lane they arrived in does not make that movement: they move toward
     one that does, as soon as the gap lets them, with no speed gain
     asked for. If it cannot be done before the line at this speed, they
     give up and go where their lane goes -- a missed turn, which is what
     a real driver who could not get over does, and counted. The same
     machinery is what a lane that ENDS will need (SIMULATOR.md 1.1.15):
     a forced change with a deadline set by the road instead of the turn. */
  if (out.want && out.want.k === out.k) {
    /* The deadline is THIS driver's: a poor steerer's blend takes longer,
       and one begun with only a clean driver's distance left finished
       past the line (verify-lanes). */
    const mine = T0 * (1 + 0.5 * (deficitOf(out.ratings ?? {}, "steering").deficit ?? 0));
    if (path.stopAt - out.s < out.v * mine * 1.2 + 10) return { ...out, want: null, missedTurns: (out.missedTurns ?? 0) + 1 };
    const okLanes = Object.values(layout.legs).filter((l) => l.base === leg.base && layout.routesFrom(l.id).some((r) => layout.legs[layout.paths[r].to]?.base === out.want.to)).map((l) => l.lane);
    if (!okLanes.length) return { ...out, want: null };
    const nearest = okLanes.reduce((b, l) => (Math.abs(l - leg.lane) < Math.abs(b - leg.lane) ? l : b), okLanes[0]);
    const dir = Math.sign(nearest - leg.lane);
    const toLeg = `${leg.base}#${leg.lane + dir}`;
    if (!layout.legs[toLeg]) return out;
    const routes = layout.routesFrom(toLeg);
    const route = routes.find((r) => layout.legs[layout.paths[r].to]?.base === out.want.to)
      ?? routes.find((r) => layout.paths[r].intent === "straight") ?? routes[0];
    if (!route) return out;
    const s2 = out.s * (layout.paths[route].stopAt / path.stopAt);
    return attempt(world, out, path, { dir, toLeg, route, s2, nb: neighbours(world, out, toLeg, s2), mandatory: true }, T0);
  }

  /* Room to finish before the line at THIS driver's pace: their own blend
     time, and the speed they may be doing by the end of it. */
  const ownT = T0 * (1 + 0.5 * (deficitOf(out.ratings ?? {}, "steering").deficit ?? 0));
  if (path.stopAt - out.s < Math.max(out.v, out.v0 ?? out.v) * ownT * 1.2 + 15) return quiet(out);
  const want = out.v0 ?? out.v;
  const look = Math.max(30, want * LOOK);
  const settling = out.lcDone != null && t - out.lcDone < SETTLE;

  /* KEEP RIGHT. With no reason to be out of the curb lane, the clock
     runs from the moment the reason passed; at this driver's own return
     interval they move back, through the same gap acceptance and
     blind-spot check as any change. Until then -- and for good, for a
     driver who does not know the rule -- they stay where they are. */
  /* Off only for the controlled comparison (verify-lanes). */
  const keep = world.keepRight === false ? "off" : reasonToStayOut(world, out, layout, path, leg, look, want);
  if (typeof keep === "string") out = quiet(out);
  else {
    const since = out.hogSince ?? t;
    out = { ...out, hogSince: since, hogTime: (out.hogTime ?? 0) + (out.hogSince != null ? LC_EVERY * DT : 0) };
    const kd = deficitOf(out.ratings ?? {}, "knowledge").deficit ?? 0;
    if (!settling && t - since >= RETURN_AFTER / Math.max(1e-9, 1 - kd)) {
      const moved = attempt(world, out, path, { ...keep, keepRight: true }, T0);
      if (moved.route !== out.route) return { ...moved, hogSince: null, keptRight: (out.keptRight ?? 0) + 1, returnDelay: t - since };
      out = moved;
    }
  }

  /* A driver settles in a lane before choosing to leave it again. (A
     change they NEED is not held back by this: the car crossing two
     lanes for a turn goes on as soon as the first is done.) */
  if (settling) return out;

  /* THE MOTIVE: held back by a slower car in this lane. */
  const leader = view?.leader;
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
  return attempt(world, out, path, best, T0);
}
export { reasonToStayOut };

/* THE GAP A CHANGE NEEDS, at a given boldness `kappa` (1 is a competent
   driver). One statement, used by the change itself and by keep-right's
   question of whether the move back was there to be taken -- a driver
   waiting for a gap to move right into is not failing to keep right.

   THE GAP, AT THIS DRIVER'S CONFIDENCE. What the car behind in the
   target lane would want to leave them, and what they would want to
   leave the car ahead, both from stage 0's own following model,
   scaled by caution: a competent driver moves only into the gap the
   car behind is comfortable with; a bold one takes a third of it.

   ...AND A FLOOR FROM PHYSICS, whatever the temperament: the gap ahead
   must let this car stop behind the car it moves in behind, and the gap
   behind must let that car stop behind this one, at the hardest braking
   a car can do. Without it a bold driver moving over for a turn cut in
   three metres behind a car STANDING in a queue, at 14 km/h, and could
   not stop in time -- 187 overlapping car-ticks at 300 cars. Boldness
   is a tight gap, never one that cannot be survived. */
function gapFor(out, nb, kappa) {
  const stopIn = (v, vl) => Math.max(0, (v * v - vl * vl) / (2 * MOST_BRAKE));
  const leadGap = nb.ahead ? nb.da - CAR.length : Infinity;
  const lagGap = nb.behind ? nb.db - CAR.length : Infinity;
  const needLead = Math.max(1.5 + stopIn(out.v, nb.ahead?.v ?? out.v), kappa * wantedGap(out, nb.ahead ?? { v: out.v }));
  const needLag = Math.max(1.5 + stopIn(nb.behind?.v ?? 0, out.v), kappa * wantedGap(nb.behind ?? { v: 0 }, out));
  return { leadGap, lagGap, leadOk: leadGap >= needLead, lagOk: lagGap >= needLag };
}

/* THE GAP, THE LOOK AND THE GO -- the same for a change a driver wants
   and one they need. */
function attempt(world, out, path, best, T0) {
  const t = world.t;
  const caution = out.caution ?? 1;
  /* The gap, at this driver's confidence (gapFor). */
  const kappa = Math.max(0.3, Math.min(1.7, caution));
  const { nb } = best;
  const { leadGap, lagGap, leadOk, lagOk } = gapFor(out, nb, kappa);

  /* THE BLIND-SPOT CHECK, AT THIS DRIVER'S OBSERVATION. Drawn once per
     manoeuvre from the driver's own seed, so a run replays exactly. */
  const obs = deficitOf(out.ratings ?? {}, "observation").deficit ?? 0;
  const r = rng((world.seed ?? 1) * 7919 + (out.n ?? 0) * 104729 + (out.lcCount ?? 0) * 31 + 7);
  const inBlind = nb.behind && nb.db < BLIND_BEHIND;
  const missed = !!inBlind && r() < obs * 0.6;
  if (!leadOk) return out;
  /* Every time a driver got this far with somebody in the blind spot is
     an occasion to look or not -- counted whether they went or not, so
     a miss RATE can be read (verify-lanes.mjs), not only the misses. */
  const counted = inBlind ? { ...out, blindOcc: (out.blindOcc ?? 0) + 1, blindMiss: (out.blindMiss ?? 0) + (missed ? 1 : 0) } : out;
  if (!missed && !lagOk) return counted;
  if (!missed && inBlind && nb.db < CAR.length + 1) return counted;   // somebody beside: a driver who looked does not go

  /* GO. The steering axis decides the blend. */
  const steer = deficitOf(out.ratings ?? {}, "steering").deficit ?? 0;
  const L0 = -best.dir * LANE;   // the old lane, relative to the new: moving right (to a higher index) leaves it on the left
  return {
    ...counted,
    route: best.route,
    s: best.s2,
    lcCount: (out.lcCount ?? 0) + 1,
    ...(best.mandatory ? { turnChanges: (out.turnChanges ?? 0) + 1 } : {}),
    lc: {
      from: out.route, fromLeg: path.from, t0: t,
      T: T0 * (1 + 0.5 * steer),
      L0, ov: weaveRoom(LANE) * steer,
      missed, blind: !!inBlind, noticeAfter: REACTION_FLOOR + obs * REGISTER_SPAN,
      caution, gap: Math.min(leadGap, lagGap), mandatory: !!best.mandatory, keepRight: !!best.keepRight,
      /* How tight, against what a COMPETENT driver (caution 1) would
         need: below 1 is a gap they would have refused. */
      tight: Math.min(
        leadGap / Math.max(1.5, wantedGap(out, nb.ahead ?? { v: out.v })),
        lagGap / Math.max(1.5, wantedGap(nb.behind ?? { v: 0 }, out)),
      ),
    },
  };
}
