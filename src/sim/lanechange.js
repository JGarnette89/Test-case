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
import { deficitOf, knows, soundnessOf, COMPETENT_AT, anticipates } from "../core/driver.js";
import { rng } from "../core/rng.js";
import { REACTION_FLOOR, REGISTER_SPAN } from "../core/perception.js";
import { CAR, DT, MOST_BRAKE, wantedGap, weaveRoom, vehicleOf, lenOf, widthOf, clearBetween, stoppingRoom } from "./traffic.js";
import { changeTime } from "../core/motion.js";
import { poseAt } from "./intersection.js";
import { atNode } from "./crossing.js";
import { exitRouteInto, exitAlong, approachAlong } from "./graph.js";
import { fits } from "./corner.js";
import { lcChecks } from "./checks.js";

/* THE LANE BESIDE, by place across the approach (graph.js `legAt`):
   `d` = -1 toward the centre line, +1 toward the curb. A turn bay sits
   between lanes without renumbering them, so this -- never the id's
   number -- is how a car finds its neighbour. */
const beside = (layout, leg, d) =>
  layout.legAt ? layout.legAt(leg.base, (leg.pos ?? leg.lane) + d) : (layout.legs[`${leg.base}#${leg.lane + d}`] ? `${leg.base}#${leg.lane + d}` : null);
/* A turn bay is open to a car at `s` along its path only from where its
   taper begins; before that its lane lies on its neighbour's. */
const closedBay = (layout, legId, s) => {
  const l = layout.legs[legId];
  return !!l?.bay && s < (l.opensAt ?? 0);
};

const LANE = 3.6;
/* HOW LONG A CLEAN CHANGE TAKES: core/motion.js `changeTime`, for a lane
   this wide -- about 3.8 s. */
export const LC_TIME = changeTime(LANE);
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
/* After the looks, how long the decision waits to be taken up: the next
   time the driver considers a change (every LC_EVERY ticks), and a tick. */
/* ...and while the driver keeps their eyes on the lane they mean to join,
   for PREP_HOLD more: a driver waiting for a gap to open goes when it does,
   rather than starting the looks again each time one closes (27 October:
   without it, fewer got over for their turn and joiners stood at the end
   of an acceleration lane for minutes). A flagged design constant. */
const PREP_HOLD = 2.0;
const PREP_GRACE = (LC_EVERY + 1) * DT + PREP_HOLD;
/* Once changed, not again for this long: a driver settles in a lane. */
const SETTLE = 6;

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
   same number that times the change -- and COMPLIANCE stretches it:
   `RETURN_AFTER / (1 - deficit)`. A sound driver (deficit 0.13) returns
   in 4.4 s; a weak one (0.7) takes 13 s, longer than most of an approach,
   so they sit out there -- unless somebody faster comes up behind, which
   makes it cost and brings anybody who knows the rule back promptly. A
   driver who does not READ the rule (core/driver.js `DIFFICULTY`) never
   returns, whoever is behind: the split of R2-DESIGN 17, knowing against
   bothering. Continuous, no threshold typed in. */
export const RETURN_AFTER = LC_TIME;
/* WHEN IT IS A FAULT: out of the curb lane with no reason for longer than
   this. Twice the prompt return -- a driver at compliance deficit 0.5
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
  /* In a turn bay the reason is the turn; a left bay is the law, and a
     right bay IS the curb side. */
  if (leg.bay === "left") return "turn";
  if (leg.bay === "right") return "curb";
  if (leg.lane >= (leg.lanes ?? 1) - 1) return "curb";
  const toLeg = beside(layout, leg, 1);
  if (!toLeg || !layout.legs[toLeg]) return "noLane";
  const exitOf = (r) => layout.legs[layout.paths[r].to]?.base ?? layout.paths[r].to;
  const exit = exitOf(out.route);
  /* ...by a turn THIS vehicle can make from there: a truck in the second
     lane for a right the curb lane takes too tightly for it is there for
     its turn, not hogging (corner.js `fits`). */
  const route = layout.routesFrom(toLeg).find((r) => exitOf(r) === exit && fits(out, layout.paths[r], world.road?.lane));
  if (!route) return "turn";
  const s2 = out.s * (layout.paths[route].stopAt / path.stopAt);
  const nb = neighbours(world, out, toLeg, s2);
  if ((nb.behind && nb.db < BLIND_BEHIND) || (nb.ahead && clearBetween(nb.da, out, nb.ahead) < 2)) return "passing";
  if (nb.ahead && clearBetween(nb.da, out, nb.ahead) < look && (nb.ahead.v ?? 0) < want - 1) return "inTheWay";
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
export const LC_SPEED = 3;   // m/s: nobody begins a change slower than this (laneStep), and below it the blend runs at the car's share

/* The car in the lane `legId` of this node nearest ahead of s, and
   nearest behind, from the actors at this node. A changer counts in
   both of its lanes while the blend lasts. */
/* EVERY CAR AHEAD THAT CAN DEMAND A GAP, not only the nearest (SIMULATOR
   IN FLIGHT 26, 22 October). A change was judged against the nearest car
   ahead in the lane joined, and a faster one there -- the player
   overtaking -- hid a car 16 m beyond it doing 13 m/s less: rear-ended 1.8 s
   later. The farthest any car can demand room is the lead need against one
   standing still (the slower, the more), so that and a car's length is how
   far each search collects. */
const reachAhead = (me) => leadNeed(me, { v: 0 }, kappaOf(me)) + 10;
function neighbours(world, me, legId, s) {
  let ahead = null, behind = null, da = Infinity, db = Infinity;
  const reach = reachAhead(me), aheads = [];
  const layout = world.course.at[me.k ?? 0].layout;
  for (const a of atNode(world, world.actors, me.k ?? 0)) {
    if (a.id === me.id || (a.k ?? 0) !== (me.k ?? 0)) continue;
    const from = layout.paths[a.route]?.from;
    const inLane = from === legId || (changing(a.lc, world.t) && a.lc.fromLeg === legId);
    if (!inLane) continue;
    const d = a.s - s;
    if (d >= 0 && d < da) { da = d; ahead = a; }
    if (d >= 0 && d <= reach) aheads.push({ car: a, d });
    if (d < 0 && -d < db) { db = -d; behind = a; }
  }
  return { ahead, behind, da, db, aheads };
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
    /* A CAR MOVES SIDEWAYS ONLY AS IT MOVES ON (21 October). The blend ran
       on the clock, so a car that stopped part-way across slid sideways on
       the spot and its heading -- the sideways rate over the speed -- swung
       round: a truck pivoted its 9 m over the centre line (20 October) and
       a car merging from a standstill swung into the next lane and was
       struck. Below LC_SPEED, the speed under which nobody begins a change,
       the blend's clock runs at the car's share of it. */
    if (out.v < LC_SPEED) out = { ...out, lc: { ...out.lc, t0: out.lc.t0 + DT * (1 - out.v / LC_SPEED) } };
    /* THE ABORT. A driver who skipped the check registers the car they
       missed after their registration delay; if it is still in the
       blind spot, they swing back to the lane they left, from wherever
       they are -- continuous, no jump. */
    if (out.lc.missed && !out.lc.abort && t >= (out.lc.at ?? out.lc.t0) + out.lc.noticeAfter) {
      const path = layout.paths[out.route];
      /* On the exit stretch the lanes are the `to` legs and the coordinate is distance remaining. */
      const exit = !!out.lc.exit, rem = path.length - out.s;
      const nb = exit ? exitNeighbours(world, out, layout, path.to, rem) : neighbours(world, out, path.from, out.s);
      const beside = (nb.behind && nb.db < BLIND_BEHIND) || (nb.ahead && nb.da < BLIND_AHEAD);
      /* NO SWINGING BACK INTO A LANE THAT IS ENDING (21 October): an abort
         out of a merge put the car back in its acceleration lane at the very
         end, across the curb lane, held by the end and unable to finish going
         back -- and the curb lane stood behind it for good. Without room to
         get back before the taper, the merge goes on; the car they missed
         sees them and brakes. */
      const backLeg = exit ? layout.legs[layout.paths[out.lc.from].to] : null;
      const noRoomBack = backLeg?.accel && layout.paths[out.lc.from].length - backLeg.accelClose - besideOn(path, out.s, layout.paths[out.lc.from], layout.paths[out.lc.from].length - rem).s2 < out.v * (out.lc.T / 2) + lenOf(out);
      /* ...AND NOT ONCE COMMITTED: past the point where the old lane stops
         seeing them (crossing.js `protrudes`, against the narrowest car that
         could be following there), the car behind in it has moved up into
         the space, and swinging back lands on it -- measured, 21 October,
         the day the old lane began letting go. */
      const tapered = !!(layout.legs[path.from]?.bay || layout.legs[path.to]?.accel || layout.legs[out.lc.fromLeg]?.bay || layout.legs[out.lc.fromTo]?.accel);
      const committed = !tapered && Math.abs(lateralOf(out.lc, t)) <= LANE - (widthOf(out) + CAR.width) / 2 - 2 * weaveRoom(LANE);
      if (beside && !noRoomBack && !committed) {
        const back = layout.paths[out.lc.from];
        const here = lateralOf(out.lc, t);
        return {
          ...out,
          route: out.lc.from,
          s: exit ? besideOn(path, out.s, back, back.length - rem).s2 : out.s * (back.stopAt / path.stopAt),
          aborts: (out.aborts ?? 0) + 1,
          lc: { ...out.lc, from: out.route, fromLeg: exit ? null : path.from, fromTo: path.to, t0: t, at: t, T: out.lc.T / 2, L0: here - out.lc.L0, ov: 0, abort: true },
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
  if (out.want && out.want.k === out.k && out.s <= path.stopAt) {
    /* Reached from here only by a turn this vehicle can make (corner.js `fits`): a truck's curb lane may reach the exit by a right too tight for it. */
    const met = layout.routesFrom(path.from).find((r) => layout.legs[layout.paths[r].to]?.base === out.want.to && fits(out, layout.paths[r], world.road?.lane));
    if (met && met !== out.route) return { ...out, route: met, s: out.s * (layout.paths[met].stopAt / path.stopAt), want: null, turnsMet: (out.turnsMet ?? 0) + 1 };
    if (met) return { ...out, want: null, turnsMet: (out.turnsMet ?? 0) + 1 };
  }
  /* PAST THE BOX, ON THE ROAD JOINED: the exit stretch (exitStep, below). */
  if (out.s > path.clearAt + EXIT_FROM && (out.v >= LC_SPEED || layout.legs[path.to]?.accel) && world.course.graph) return exitStep(world, quiet(out), layout, path, view);
  if (out.going || out.stoppedAt != null || out.v < LC_SPEED) return quiet(out);
  if (!leg || (leg.across ?? leg.lanes ?? 1) < 2) return quiet(out);
  /* At this vehicle's own sideways comfort: changeTime scales with 1/sqrt(lateral). */
  const T0 = LC_TIME / Math.sqrt(vehicleOf(out).lateral ?? 1);
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
    const here = leg.pos ?? leg.lane;
    const okLanes = Object.values(layout.legs).filter((l) => l.base === leg.base && layout.routesFrom(l.id).some((r) => layout.legs[layout.paths[r].to]?.base === out.want.to && fits(out, layout.paths[r], world.road?.lane))).map((l) => l.pos ?? l.lane);
    if (!okLanes.length) return { ...out, want: null };
    const nearest = okLanes.reduce((b, l) => (Math.abs(l - here) < Math.abs(b - here) ? l : b), okLanes[0]);
    const dir = Math.sign(nearest - here);
    const toLeg = beside(layout, leg, dir);
    if (!toLeg || !layout.legs[toLeg]) return out;
    const routes = layout.routesFrom(toLeg);
    const route = routes.find((r) => layout.legs[layout.paths[r].to]?.base === out.want.to && fits(out, layout.paths[r], world.road?.lane))
      ?? routes.find((r) => layout.legs[layout.paths[r].to]?.base === out.want.to)
      ?? routes.find((r) => layout.paths[r].intent === "straight") ?? routes[0];
    if (!route) return out;
    const s2 = out.s * (layout.paths[route].stopAt / path.stopAt);
    /* A bay not open yet: stay put and keep wanting it. */
    if (closedBay(layout, toLeg, s2)) return out;
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
    /* Not knowing the rule, never; knowing it, at their compliance --
       except that somebody faster coming up behind makes it cost, and then
       anybody who knows the rule goes back at the prompt interval. */
    const nb = neighbours(world, out, path.from, out.s);
    const pressed = !!nb.behind && nb.db < look && (nb.behind.v0 ?? nb.behind.v ?? 0) > want + 1;
    const cd = pressed ? 0 : deficitOf(out.ratings ?? {}, "compliance").deficit ?? 0;
    const after = knows(out, "keep-right") ? RETURN_AFTER / Math.max(1e-9, 1 - cd) : Infinity;
    if (!settling && t - since >= after) {
      const moved = attempt(world, out, path, { ...keep, keepRight: true }, T0);
      if (moved.route !== out.route) return { ...moved, hogSince: null, keptRight: (out.keptRight ?? 0) + 1, returnDelay: t - since };
      out = moved;
    }
  }
  /* A BUS KEEPS TO THE CURB LANE: back toward it, as above, and for a turn
     its route needs -- never out of it to pass. One that changed lanes with
     a stop ahead pulled "into the bay" from the middle lane, across the
     curb lane, and a car in that lane met it (verify-editor, 1 October). */
  if (out.kind === "bus") return out;

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
    const toLeg = beside(layout, leg, dir);
    if (!toLeg || !layout.legs[toLeg]) continue;
    /* A turn bay is for the turn, never for getting past somebody. */
    if (layout.legs[toLeg].bay) continue;
    const to = layout.legs[toLeg].pos ?? layout.legs[toLeg].lane;
    /* ...and never out of the lane the turn needs. */
    const route = layout.routesFrom(toLeg).find((r) => layout.paths[r].intent === path.intent && fits(out, layout.paths[r], world.road?.lane));
    if (!route) continue;
    const target = layout.paths[route];
    const s2 = out.s * (target.stopAt / path.stopAt);
    const nb = neighbours(world, out, toLeg, s2);
    const there = nb.ahead && clearBetween(nb.da, out, nb.ahead) < look ? Math.min(want, nb.ahead.v) : want;
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
/* HOW MUCH ROOM BEHIND A DRIVER MOVING OVER NEEDS before the car that
   would follow -- the half of `gapFor` a car letting them in has to open
   (courtesy.js). ONE definition: courtesy used to call a gap open at the
   offerer's own following gap behind a car at the joiner's speed, while
   the joiner, standing at the end of its lane, needed the closing speed
   shed as well, scaled by its caution -- traced, an offer "open" at 90 m
   behind a timid joiner who needed 170, withdrawn four seconds later
   (22 October). */
export const kappaOf = (out) => Math.max(0.3, Math.min(1.7, out.caution ?? 1));
const shedOf = (dv, rate) => (dv > 0 ? (dv * dv) / (2 * rate) : 0);
/* ...and ahead of them, before the car they would follow: the following distance plus the closing speed shed at their own comfortable braking (the car in front may not speed up), never under the floor of stopping behind it at their hardest. */
export function leadNeed(out, ahead, kappa = kappaOf(out)) {
  const va = ahead?.v ?? out.v;
  const stop = Math.max(0, (out.v * out.v - va * va) / (2 * vehicleOf(out).most));
  return Math.max(1.5 + stop, kappa * (wantedGap(out, ahead ?? { v: out.v }) + shedOf(out.v - va, vehicleOf(out).brake)));
}
export function lagNeed(out, behind, kappa = kappaOf(out)) {
  const v0 = Math.max(out.v0 ?? out.v, 0.1), mineAccel = vehicleOf(out).accel * Math.max(0, 1 - (out.v / v0) ** 4);
  const stop = Math.max(0, ((behind?.v ?? 0) ** 2 - out.v * out.v) / (2 * vehicleOf(behind).most));
  return Math.max(1.5 + stop, kappa * (wantedGap(behind ?? { v: 0 }, out) + shedOf((behind?.v ?? 0) - out.v, vehicleOf(behind).brake + mineAccel)));
}
function gapFor(out, nb, kappa) {
  /* At the FOLLOWER's hardest braking: a truck behind stops longer. */
  const stopIn = (v, vl, who) => Math.max(0, (v * v - vl * vl) / (2 * vehicleOf(who).most));
  const leadGap = nb.ahead ? clearBetween(nb.da, out, nb.ahead) : Infinity;
  const lagGap = nb.behind ? clearBetween(nb.db, nb.behind, out) : Infinity;
  /* THE COMFORTABLE GAP INCLUDES THE CLOSING SPEED (21 October). It was
     the following distance at equal speeds, with the closing speed only in
     the floor (the hardest braking): so a driver joining a 100 km/h stream
     at 50 called a gap 45 m ahead of a car doing 100 comfortable -- a gap
     in which that car has to brake at about 6 m/s^2. A merge is judged on
     whether the car behind will have to brake HARD, so the comfortable
     gap is the following distance plus the room the closing speed takes to
     shed: ahead, by this driver's own comfortable braking (the car in front
     may not speed up); behind, by the follower's comfortable braking AND
     this driver's own acceleration, since a joiner keeps accelerating and
     the two close from both ends. Behind by braking alone, it throttled
     every entrance: measured over three seeds, joiners stood at the end of
     the lane for minutes on a near-empty highway, and the entrances did
     worse than the yield signs they replaced. The
     driver's confidence scales all of it, as before: a bold driver still
     takes less than comfortable, and makes somebody brake; the floor holds
     for everybody. */
  const shed = (dv, rate) => (dv > 0 ? (dv * dv) / (2 * rate) : 0);
  /* This driver's acceleration still available at this speed (the following model's own shape). */
  const v0 = Math.max(out.v0 ?? out.v, 0.1), mineAccel = vehicleOf(out).accel * Math.max(0, 1 - (out.v / v0) ** 4);
  const needLead = leadNeed(out, nb.ahead, kappa);
  const needLag = lagNeed(out, nb.behind, kappa);
  /* The floor alone, for the car behind: whether it can stop behind this one at all. */
  const lagSurvivable = lagGap >= 1.5 + stopIn(nb.behind?.v ?? 0, out.v, nb.behind);
  return { leadGap, lagGap, leadOk: leadGap >= needLead, lagOk: lagGap >= needLag, lagSurvivable };
}

/* THE GAP, THE LOOK AND THE GO -- the same for a change a driver wants
   and one they need. */
/* =====================================================================
   THE EXIT STRETCH (20 October). A path runs from an intersection's
   approach, through the box, along the road it leaves by to the seam where
   the next intersection takes over -- and lane changes lived only on the
   approach, so on HALF of every multi-lane road nobody could overtake or
   keep right: 50% of the highway, 51% of the city (SIMULATOR.md 1.2.15).
   Here the lane is the path's `to` leg, every path leaving by it shares the
   stretch, and the coordinate is DISTANCE REMAINING to the seam -- the
   measure `whatStops` already uses for a shared exit. The motive, the gain,
   the gap and the blend are the approach's own (`attempt`); a change is not
   begun with the seam too near to finish it, and the next approach takes
   over from there.
   ===================================================================== */
export const EXIT_FROM = 10;
const BESIDE_TURN = 5;     // degrees between the car's heading and the target lane's: straightened out
const BESIDE_SEP = 0.6;    // m off a lane's width across: in its own lane, not still swinging out of the box   // m past the box before the exit stretch counts as road to change lane on
/* The cars in an exit lane, ahead and behind, by distance remaining -- and,
   ahead, those already past the seam on the next intersection's approach. */
function exitNeighbours(world, me, layout, toLeg, rem) {
  let ahead = null, behind = null, da = Infinity, db = Infinity;
  const reach = reachAhead(me), aheads = [];
  /* Past the box, places are compared along the road's centreline
     (graph.js exitAlong), which agrees across lanes; distance remaining
     only where a car is not yet on this road. */
  const course = world.course, myAlong = exitAlong(course, me.k ?? 0, me.route, me.s);
  for (const a of atNode(world, world.actors, me.k ?? 0)) {
    if (a.id === me.id) continue;
    const p = layout.paths[a.route];
    /* EVERYBODY bound for this lane, measured by distance remaining -- the
       ones still short of their line too. Excluding them (until 21 October)
       made the traffic coming up behind through the intersection invisible:
       on a highway node the line is far back, and merging cars cut in front
       of followers sixty metres behind -- fifteen crashes in three minutes
       at 300 cars. A car still waiting at another approach's line counts
       as behind, at its own speed, which costs a changer nothing it should
       not. */
    if (!p) continue;
    if (!(p.to === toLeg || (changing(a.lc, world.t) && a.lc.fromTo === toLeg))) continue;
    const theirs = myAlong != null && a.s > p.clearAt ? exitAlong(course, a.k ?? 0, a.route, a.s) : null;
    const d = theirs != null ? theirs - myAlong : rem - (p.length - a.s);
    if (d >= 0 && d < da) { da = d; ahead = a; }
    if (d >= 0 && d <= reach) aheads.push({ car: a, d });
    if (d < 0 && -d < db) { db = -d; behind = a; }
  }
  const j = world.course.joins[(me.k ?? 0) + "|" + toLeg];
  if (j) {
    const there = world.course.at[j.k].layout;
    for (const a of atNode(world, world.actors, j.k)) {
      if (a.id === me.id || there.paths[a.route]?.from !== j.side) continue;
      const theirs = myAlong != null ? approachAlong(course, j.k, a.route, a.s) : null;
      const d = theirs != null ? theirs - myAlong : rem + a.s;
      if (d < da) { da = d; ahead = a; }
      if (d >= 0 && d <= reach) aheads.push({ car: a, d });
    }
  }
  return { ahead, behind, da, db, aheads };
}
/* The place on `target` nearest the car at `s` on `path`, searched about `guess`, and how far across it is. */
function besideOn(path, s, target, guess) {
  const here = poseAt(path, s), at = (x) => Math.max(0, Math.min(target.length, x));
  let s2 = at(guess), sep = Infinity;
  for (const step of [2, 0.5, 0.1]) {
    const c = s2;
    for (let d = -10 * step; d <= 10 * step; d += step) {
      const q = poseAt(target, at(c + d)), e = Math.hypot(q.x - here.x, q.y - here.y);
      if (e < sep) { sep = e; s2 = at(c + d); }
    }
  }
  const turn = Math.abs(((((poseAt(target, s2).rot ?? 0) - (here.rot ?? 0)) % 360) + 540) % 360 - 180);
  return { s2, sep, turn };
}
/* =====================================================================
   THE MERGE, out of an acceleration lane (map/accel.js; 21 October). A
   change the driver NEEDS -- the lane ends -- made while MOVING, into a gap
   alongside: the gap is `gapFor`'s, which already is a moving judgement
   (the space ahead at this driver's speed against the car in front, the
   space behind at the follower's speed against this one -- a joiner slower
   than the traffic needs a longer gap behind, which is the physics of a
   merge). It is NOT the stop-line gap acceptance: that judges crossing
   traffic from standstill, and nothing here crosses.

   Nothing is authored about how it goes. The driver's confidence sets the
   gap they take (the same kappa as any change), so a bold driver goes
   early into a tight gap and a timid one waits for a long one; the
   floor -- the car behind able to stop -- holds for everybody. A change
   is only begun if it can be finished before the lane ends; a driver who
   has not found one by then is stopped short of the end (crossing.js
   whatStops), and from a standstill needs a gap a stream doing the limit
   rarely leaves. A hard shoulder is not modelled, so running on is not
   one of the outcomes.
   ===================================================================== */
/* WHERE A JOINER MUST BEGIN TO STOP FOR ITS LANE'S END: a comfortable
   stop from its speed, its length and ten metres short of the taper. ONE
   definition -- crossing.js brakes the joiner from here, and a car letting
   it in (courtesy.js) has to have the gap open by the time it is reached,
   not by the taper: past this point the joiner is slowing, and an offerer
   planning against the taper slows with it (DECISIONS 10.15). */
export const laneEndRoom = (me, v = me.v) => stoppingRoom(v) + lenOf(me) + 10;
const MATCH = 0.9;   // "up to the traffic's speed": within a tenth of it -- a flagged design constant
/* WHETHER A JOINING CAR IS TRYING TO MOVE OVER NOW, and how: null while it
   is not (still accelerating, not yet beside, too late to begin), else the
   change it would make. The one test, read by the merge itself and by the
   courtesy it asks for (courtesy.js) -- a joiner asks with its signal when
   it is ready to go, not while it is still getting up to speed, or the car
   that lets it in follows it at 50 km/h and the curb lane with it
   (measured: 19 km/h in the curb lane at 150 cars). */
export function mergePlan(world, out, layout, path, outLeg) {
  const T0 = LC_TIME / Math.sqrt(vehicleOf(out).lateral ?? 1);
  const ownT = T0 * (1 + 0.5 * (deficitOf(out.ratings ?? {}, "steering").deficit ?? 0));
  const toEnd = path.length - outLeg.accelClose - out.s;   // to where the taper begins
  /* BEGUN BEFORE THE TAPER, FINISHED BY ITS END (22 October). Finished by
     where the taper BEGINS, the last ~90 m of the lane at 72 km/h were no
     use for merging at all, and every joiner without a gap by then stood at
     the taper -- 1101 car-s at 150 cars, against the yield sign's 730. A
     taper is where a lane slides into the next: moving across it is what
     it is for. Standing in it is still never allowed (crossing.js stops a
     car short of where it begins). */
  const toGone = path.length - outLeg.accelEnd - out.s;
  const standing = out.v < 0.5;
  if (!standing && (toEnd <= 0 || toGone < out.v * ownT + lenOf(out))) return null;
  /* FROM REST, ONLY FROM THE HEAD OF THE QUEUE (22 October). A joiner
     standing behind another standing joiner began its merge from two metres
     back: mid-change it is in both lanes, so it followed the car in front in
     the lane it was leaving and could not move, while its body held the
     lane it was entering -- and the head joiner could not merge with it
     standing there. Each waited on the other for over a minute, the through
     lane queued behind (verify-merge, seed 4, traced). A driver second in a
     standing queue at a ramp's end waits for the one in front to go. */
  if (standing) {
    const own = exitNeighbours(world, out, layout, path.to, path.length - out.s);
    if (own.ahead && (own.ahead.v ?? 0) < 0.5 && own.da < toEnd) return null;
  }
  if (!layout.legAt) return null;
  const toLeg = layout.legAt(outLeg.base, outLeg.pos - 1);
  if (!toLeg || !layout.legs[toLeg] || layout.legs[toLeg].bay || layout.legs[toLeg].accel) return null;
  const route = exitRouteInto(layout, toLeg, "straight");
  if (!route) return null;
  const target = layout.paths[route], rem = path.length - out.s;
  const { s2, sep, turn } = besideOn(path, out.s, target, target.length - rem);
  if (turn > BESIDE_TURN || Math.abs(sep - LANE) > BESIDE_SEP || s2 <= target.clearAt + 1) return null;
  const nb = exitNeighbours(world, out, layout, toLeg, target.length - s2);
  /* UP TO SPEED FIRST -- for a driver who knows what the lane is for
     (core/driver.js "accel-lane"): moving over below the traffic's speed
     hands the car behind the difference. The traffic's speed is the car
     alongside's, ahead or behind within LOOK, else the road's limit. Not
     once the lane is running out: from the point a comfortable stop for
     its end would have to begin, matching gives way to finding a gap. */
  if (!standing && knows(out, "accel-lane")) {
    const near = [nb.ahead && nb.da < 100 ? nb.ahead : null, nb.behind && nb.db < 100 ? nb.behind : null].filter(Boolean);
    const flow = near.length ? Math.min(...near.map((c) => c.v ?? 0)) : (layout.legs[toLeg].speed ?? out.v);
    const late = toEnd < stoppingRoom(out.v) + lenOf(out) + 10 + out.v * ownT;
    /* Matched to the gap they are making for, where they picked one (gapTarget): hanging back to drop in behind a car is not arriving slow. */
    if (!late && out.v < MATCH * Math.min(flow, out.v0 ?? flow, out.mergeV ?? Infinity)) return null;
  }
  return { T0, best: { dir: -1, to: outLeg.pos - 1, toLeg, route, s2, sep, nb, mandatory: true, exit: true, merge: true } };
}
function mergeStep(world, out, layout, path, outLeg) {
  const plan = mergePlan(world, out, layout, path, outLeg);
  const moved = plan ? attempt(world, out, path, plan.best, plan.T0) : out;
  if (moved.lc) return moved.mergeV != null ? { ...moved, mergeV: null } : moved;
  const mergeV = gapTarget(world, out, layout, path, outLeg);
  return mergeV === (moved.mergeV ?? null) ? moved : { ...moved, mergeV };
}

/* =====================================================================
   PICKING A GAP AND MEETING IT (22 October; DECISIONS 10.15). A joiner who
   is SCANNING -- competent on the observation axis -- looks along the lane
   it is joining, picks the gap it can reach with the least change of speed,
   and adjusts to arrive level with it by the time its lane begins to close:
   hanging back to drop in behind a car, or pressing on to get ahead of one.
   One who is not, accelerates to the traffic's speed and takes whatever hole
   is beside it when it looks -- and at 150 cars, measured, often none, and
   stood at the taper. Nothing about the gap is authored: which one, and the
   speed, come from where the traffic is.

   Returns the speed to hold, or null (not scanning, or nobody near).
   ===================================================================== */
const GAP_LOOK = 150;   // m along the lane joined, either way: what a scanning driver weighs -- a flagged design constant
function gapTarget(world, out, layout, path, outLeg) {
  /* ANTICIPATION (core/driver.js `anticipates`, DECISIONS 10.20): the
     occasion is this join. Anticipating, the joiner plans from when the
     lane it joins is knowable -- on the lane, after its registration lag;
     reacting, it plans nothing and takes the hole beside it when it looks.
     Was a gate on the DRIVER at COMPETENT_AT: 0.74 never scanned, 0.76
     always did. */
  if (!anticipates(out, `join:${out.k ?? 0}:${out.route}`, world)) return null;
  if (out.s - path.clearAt < (out.notices ?? 0) * Math.max(out.v ?? 0, 1)) return null;
  /* SOMEBODY IS LETTING THEM IN: take it -- do not hang back as well. Both
     dropping back together kept a joiner level with the car making room
     for it until its lane ran out (measured, 22 October). */
  if (world.actors.some((a) => a.courtesy && !a.courtesy.done && a.courtesy.for === out.id)) return null;
  const toLeg = layout.legAt?.(outLeg.base, outLeg.pos - 1);
  const mine = exitAlong(world.course, out.k ?? 0, out.route, out.s);
  if (!toLeg || mine == null) return null;
  const cars = [];
  for (const a of atNode(world, world.actors, out.k ?? 0)) {
    if (a.id === out.id || a.crash) continue;
    const p = layout.paths[a.route];
    if (!p || a.s <= p.clearAt || !(p.to === toLeg || (changing(a.lc, world.t) && a.lc.fromTo === toLeg))) continue;
    const al = exitAlong(world.course, a.k ?? 0, a.route, a.s);
    if (al != null && Math.abs(al - mine) < GAP_LOOK) cars.push({ al, v: a.v ?? 0, half: lenOf(a) / 2 });
  }
  if (!cars.length) return null;
  cars.sort((x, y) => x.al - y.al);
  const toEnd = path.length - outLeg.accelClose - out.s;
  const T = Math.max(1, toEnd / Math.max(out.v ?? 0, 5));
  const v0 = out.v0 ?? out.v, me = lenOf(out) / 2;
  /* A gap is room for this car with a competent following gap either side, at the speed of the car that would follow. */
  const room = (v) => 2 * wantedGap({ ...out, v }, { v }) + 2 * me;
  const gaps = [];
  gaps.push({ c: cars[0].al - cars[0].half - room(cars[0].v) / 2, v: cars[0].v });                                   // behind the last of them
  for (let i = 0; i + 1 < cars.length; i++) {
    const B = cars[i], A = cars[i + 1], clear = A.al - A.half - (B.al + B.half);
    if (clear >= room(B.v)) gaps.push({ c: (A.al - A.half + B.al + B.half) / 2, v: B.v });
  }
  const last = cars[cars.length - 1];
  gaps.push({ c: last.al + last.half + room(last.v) / 2, v: last.v });                                                // ahead of the first
  let best = null;
  for (const g of gaps) {
    /* Level with the gap's centre in T: hold the gap's speed plus the distance to it over the time. */
    const want = Math.max(0.5 * g.v, Math.min(v0, g.v + (g.c - mine) / T));
    if (!best || Math.abs(want - out.v) < Math.abs(best - out.v)) best = want;
  }
  return best;
}
function exitStep(world, out, layout, path, view) {
  const t = world.t;
  const outLeg = layout.legs[path.to];
  if (outLeg?.accel) return mergeStep(world, out, layout, path, outLeg);
  if (!outLeg || (outLeg.across ?? outLeg.lanes ?? 1) < 2 || !layout.legAt || out.kind === "bus") return out;
  const T0 = LC_TIME / Math.sqrt(vehicleOf(out).lateral ?? 1);
  const ownT = T0 * (1 + 0.5 * (deficitOf(out.ratings ?? {}, "steering").deficit ?? 0));
  const rem = path.length - out.s;
  /* The seam too near to finish a change: the next approach takes over. */
  if (rem < Math.max(out.v, out.v0 ?? out.v) * ownT * 1.2 + 15) return out;
  if (out.lcDone != null && t - out.lcDone < SETTLE) return out;
  const want = out.v0 ?? out.v, look = Math.max(30, want * LOOK);
  const pos = outLeg.pos ?? outLeg.lane;
  const option = (dir) => {
    const toLeg = layout.legAt(outLeg.base, pos + dir);
    if (!toLeg || !layout.legs[toLeg] || layout.legs[toLeg].bay || layout.legs[toLeg].accel) return null;
    const route = exitRouteInto(layout, toLeg, path.intent, layout.legs[path.from]?.base, true);
    if (!route) return null;
    /* BESIDE, NOT THE SAME DISTANCE OUT: on a bend the inner lane is the
       shorter, so equal distance remaining is not side by side -- measured,
       a 2 m jump at the start of every change on test map 1's curves. The
       place on the target lane nearest the car, and how far across it is. */
    const target = layout.paths[route], { s2, sep, turn } = besideOn(path, out.s, target, target.length - rem);
    if (s2 <= target.clearAt + 1 || target.length - s2 < 15) return null;
    /* AND ACTUALLY BESIDE IT: straightened out of the turn, a lane across
       -- not still swinging out of the box. Measured, 20 October: a car
       10 m out of a 45-degree turn at a five-way began a change from
       nearly two lanes across and blended over the centre line into a car
       waiting at the light. */
    if (turn > BESIDE_TURN || Math.abs(sep - LANE) > BESIDE_SEP) return null;
    return { dir, to: pos + dir, toLeg, route, s2, sep, nb: exitNeighbours(world, out, layout, toLeg, target.length - s2) };
  };
  /* THE MOTIVE, as on the approach: held back by a slower car in this lane. */
  const leader = view?.leader;
  const held = leader && leader.id !== "line" && view.gap <= look && Math.min(want, leader.v ?? 0) <= want - 1;
  if (held) {
    const closing = Math.max(0, out.v - (leader.v ?? 0));
    if (view.gap < closing * LC_TIME * 0.5 + 2) return out;
    const here = Math.min(want, leader.v ?? 0);
    let best = null;
    for (const dir of [-1, 1]) {
      const o = option(dir);
      if (!o) continue;
      const there = o.nb.ahead && clearBetween(o.nb.da, out, o.nb.ahead) < look ? Math.min(want, o.nb.ahead.v ?? 0) : want;
      const gain = there - here;
      if (gain < LC_GAIN * Math.max(0.2, out.caution ?? 1)) continue;
      if (!best || gain > best.gain) best = { ...o, gain };
    }
    return best ? attempt(world, out, path, { ...best, exit: true }, T0) : out;
  }
  /* KEEP RIGHT, here too: a driver who knows the rule, settled, back toward
     the curb into a lane with nobody slower just ahead. */
  if (!outLeg.curb && knows(out, "keep-right") && (out.lcDone == null || t - out.lcDone >= RETURN_AFTER)) {
    const o = option(1);
    if (o && !(o.nb.ahead && clearBetween(o.nb.da, out, o.nb.ahead) < look && (o.nb.ahead.v ?? 0) < want - 1)) {
      const moved = attempt(world, out, path, { ...o, keepRight: true, exit: true }, T0);
      if (moved.route !== out.route) return { ...moved, keptRight: (out.keptRight ?? 0) + 1 };
    }
  }
  return out;
}

function attempt(world, out, path, best, T0) {
  const t = world.t;
  const caution = out.caution ?? 1;
  /* The gap, at this driver's confidence (gapFor). */
  const kappa = kappaOf(out);
  const { nb } = best;
  /* ROOM TO GET ACROSS (21 October). A car moves sideways only as it moves
     on (the blend above), so a change begun with the car ahead in its OWN
     lane too close to get past half-way before reaching it leaves it
     stopped across the line -- still behind that car, and in the way of
     the lane it was moving into. Measured: at the end of an acceleration
     lane, a car half out sat behind the car stopped at the end, which
     waited for a gap the first one's body was filling -- both for good,
     and the through lanes jammed behind. So the car ahead in this lane
     must be a car's length off, or as far as this car closes on it in half
     the change -- the CLOSING speed, since a car ahead moving at this one's
     speed moves away as fast as this one moves over (by distance alone,
     every car behind another in an acceleration lane was held until it was
     too late, and stopped at the end). */
  {
    const here = world.course.at[out.k ?? 0].layout;
    const own = best.exit ? exitNeighbours(world, out, here, path.to, path.length - out.s) : neighbours(world, out, path.from, out.s);
    if (own.ahead && clearBetween(own.da, out, own.ahead) < Math.max(lenOf(out), Math.max(0, out.v - (own.ahead.v ?? 0)) * T0 * 0.5)) return out;
  }
  const { leadGap, lagGap, leadOk, lagOk, lagSurvivable } = gapFor(out, nb, kappa);

  /* THE BLIND-SPOT CHECK, AT THIS DRIVER'S OBSERVATION. Drawn once per
     manoeuvre from the driver's own seed, so a run replays exactly. */
  const obs = deficitOf(out.ratings ?? {}, "observation").deficit ?? 0;
  const r = rng((world.seed ?? 1) * 7919 + (out.n ?? 0) * 104729 + (out.lcCount ?? 0) * 31 + 7);
  const inBlind = nb.behind && nb.db < BLIND_BEHIND;
  /* THE CHECKS AS EVENTS (checks.js, 27 October): the mirror and the
     shoulder check toward the move are LOOKS the driver makes before
     moving, decided here -- observation whether they look at all (the same
     draw, at the same rate, as the roll this replaced), knowledge whether
     the shoulder check is made, and in time. The blind spot is missed
     exactly when nobody looked over the shoulder before the move. Decided
     now, the change WAITS for the looks (`lcPrep`) and is judged again
     when it can begin. `world.checks !== true`: the roll as it was. */
  let missed, plan = null;
  if (world.checks !== true) missed = !!inBlind && r() < obs * 0.6;
  else {
    if (out.lcPrep && t < out.lcPrep.ready) return out;   // still looking
    const p = out.lcPrep;
    /* A change the driver MUST make -- a merge, a lane for their turn -- is
       looked for while they seek the gap, not once they have found one: they
       watch the lane they must join, and go the moment a gap comes. Begun
       only once a gap was acceptable, the looks outlasted it in dense
       traffic: at 300 cars on the endless highway joiners stood 3,389 s in
       all over three seeds against 1,372 without the checks, eleven over a
       minute on one seed (verify-merge, 27 October). So for those the looks
       begin when the change is wanted, and the driver stays prepared for as
       long as they keep wanting it (`seen`); a change of choice is still
       looked for when its gap is there. */
    const must = !!(best.mandatory || best.merge);
    const prepared = p && p.dir === best.dir && t <= (must ? (p.seen ?? p.ready) : p.ready) + PREP_GRACE;
    plan = prepared ? p : lcChecks(out, best.dir, t, r());
    missed = !!inBlind && !plan.shoulder;
    if (!prepared && plan.steps.length && must) return { ...out, lcPrep: { dir: best.dir, at: t, steps: plan.steps, ready: plan.ready, shoulder: plan.shoulder, late: plan.late, wrong: plan.wrong ?? null, seen: t } };
    if (prepared && must) out = { ...out, lcPrep: { ...p, seen: t } };
    if (!prepared && plan.steps.length) plan = { ...plan, begin: true };
  }
  if (!leadOk) return out;
  /* ...and every car beyond it that can demand room, each at its own lead need (above). */
  for (const { car, d } of nb.aheads ?? []) if (car !== nb.ahead && clearBetween(d, out, car) < leadNeed(out, car, kappa)) return out;
  /* Every time a driver got this far with somebody in the blind spot is
     an occasion to look or not -- counted whether they went or not, so
     a miss RATE can be read (verify-lanes.mjs), not only the misses. */
  const counted = inBlind ? { ...out, blindOcc: (out.blindOcc ?? 0) + 1, blindMiss: (out.blindMiss ?? 0) + (missed ? 1 : 0) } : out;
  if (!missed && !lagOk) return counted;
  if (!missed && inBlind && clearBetween(nb.db, nb.behind, out) < 1) return counted;   // somebody beside: a driver who looked does not go
  /* ...AND A MISSED CHECK STILL CANNOT DEFY PHYSICS. Not looking costs a
     driver the margin their temperament would have left the car behind
     (`lagOk`), never the floor under it: whether that car can stop behind
     this one at its hardest braking. A missed check is meant to be FOUND
     OUT -- the driver registers the car and swings back, and the lanes
     check holds that nobody touches -- and below the floor there is no
     time for that. Measured, 6 October, both on test map 1 once the green
     waves moved the traffic: a car crawling to a red moved over with the
     car behind 0.8 m back at 8 m/s (180 overlapping car-ticks at 300
     cars), and another with the car behind 6.2 m back closing at 6 m/s,
     which braked as hard as it could and stopped overlapping it. The same
     rule as a bold gap (gapFor): an observation failure is a car missed,
     never one that cannot be survived. */
  if (missed && !lagSurvivable) return counted;

  /* DECIDED, NOT YET BEGUN: the looks first, the turn signal on from now
     (crossing.js), the gap judged again when they are done. */
  if (plan?.begin) return { ...out, lcPrep: { dir: best.dir, at: t, steps: plan.steps, ready: plan.ready, shoulder: plan.shoulder, late: plan.late, wrong: plan.wrong ?? null } };
  /* GO. The steering axis decides the blend. */
  const steer = deficitOf(out.ratings ?? {}, "steering").deficit ?? 0;
  /* The old lane, relative to the new: moving right (toward the curb)
     leaves it on the left. A lane apart -- except into or out of a turn
     bay on its taper, where the two lanes are closer than that, and the
     blend has to start from where the car actually is or it would jump. */
  const layoutHere = world.course.at[out.k ?? 0].layout;
  const bayInvolved = !!(layoutHere.legs[path.from]?.bay || layoutHere.legs[best.toLeg]?.bay);
  const sep = best.sep != null ? best.sep : bayInvolved
    ? Math.min(LANE, Math.hypot(poseAt(path, out.s).x - poseAt(layoutHere.paths[best.route], best.s2).x, poseAt(path, out.s).y - poseAt(layoutHere.paths[best.route], best.s2).y))
    : LANE;
  const L0 = -best.dir * sep;
  return {
    ...counted,
    route: best.route,
    s: best.s2,
    lcCount: (out.lcCount ?? 0) + 1,
    ...(best.mandatory ? { turnChanges: (out.turnChanges ?? 0) + 1 } : {}),
    ...(plan ? { lcPrep: null } : {}),
    lc: {
      /* The checks that went with it (checks.js): whether the shoulder was looked over in time, a look that came late, and how the driver got it wrong, for the sheet to read. */
      /* A late look is timed from the move itself, which begins at the next consideration after the looks -- up to PREP_GRACE later; timed from the looks, "late" could land before the move (verify-checks, 27 October). */
      ...(plan ? { checked: !!plan.shoulder, late: plan.late ? plan.late.map(([k, a, b]) => [k, t + 0.3, t + 0.3 + (b - a)]) : null, wrong: plan.wrong ?? (plan.skipped ? "skipped" : null), prepAt: plan.at ?? t } : {}),
      /* fromLeg is the APPROACH lane left, which holds the car in both approach lanes (crossing.js); an exit change is in both exit lanes by fromTo alone. */
      /* t0 is the blend's clock, which stands still with the car (above);
         `at` is when the change began, and does not move. */
      from: out.route, fromLeg: best.exit ? null : path.from, fromTo: path.to, t0: t, at: t,
      T: T0 * (1 + 0.5 * steer),
      L0, ov: weaveRoom(LANE) * steer,
      missed, blind: !!inBlind, exit: !!best.exit, merge: !!best.merge,
      /* A late shoulder check finds the car missed when it is made, if that is sooner than noticing it anyway. */
      noticeAfter: plan?.late?.length ? Math.min(REACTION_FLOOR + obs * REGISTER_SPAN, 0.3 + (plan.late[0][2] - plan.late[0][1]) + REACTION_FLOOR) : REACTION_FLOOR + obs * REGISTER_SPAN,
      /* Who they missed: until they notice, they do not brake for that car
         either (crossing.js, following). */
      unseen: missed ? nb.behind.id : null,
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
