/* =====================================================================
   COURTESY GAPS: a driver who sees the player signalling to come into
   their lane eases off and lets them in -- or does not.

   The flow ruling's second item (SIMULATOR.md, "GOOD DRIVING IS PAID IN
   FLOW"): a timely signal is rewarded by the traffic, not by a score.
   Nobody owes a lane-changer the gap -- the law gives the lane to the
   car already in it -- so this is courtesy, and courtesy is temperament.

   WHO OFFERS IS DERIVED FROM THE AXES, NO NEW PARAMETER (as the horn's
   patience was). Letting somebody in costs you road you were entitled to
   for the sake of the traffic's flow, which is two dispositions at once:
     COMPLIANCE -- a driver who does the done thing when nobody makes
       them. A scofflaw keeps their road.
     CONFIDENCE -- the bold tail never gives road away (the same tail that
       honks soonest and takes the tightest gaps); a sound driver does,
       and the timid tail does it readily -- over-yielding is what the
       timid tail IS.
   Both held to the one threshold the driver model already has for
   "competent on this axis", COMPETENT_AT. Measured in
   tools/measure/courtesy.mjs and reported in SIMULATOR.md.

   AND THEY HAVE TO SEE IT: the signal counts once it has been on for
   this driver's own time to notice something (`noticeAfter`, the
   observation axis and nothing else). So a signal put on as the wheel
   turns is noticed by nobody in time, and a timely one -- the
   established two to three seconds -- is the one that gets the gap.

   AND IT HAS TO BE COMFORTABLE: offered only by a driver who can drop in
   behind the player at their own braking rate, and the easing is never
   harder than that rate. Courtesy never stands on the brakes; a driver
   who would have to is not asked.

   What it does: the driver follows the player as though they were
   already in the lane, through the same following model, braking no
   harder than their own comfortable rate -- and never less than the
   real traffic in front of them demands (it is a minimum, not a
   replacement). It lasts until the player is in, stops signalling, or
   has not taken it in the undue-delay time (UNDUE_AT, 4 s) from when it
   opened: a gap that is not used is withdrawn.

   ONE DRIVER IS ASKED: the nearest car in the lane being signalled into
   whose centre is behind the player's. They are the one whose space the
   player needs; a driver behind them is not being asked anything yet.

   AND NOT ONLY THE PLAYER, AND NOT ONLY BEFORE THE LINE (21 October). A
   car in an ACCELERATION LANE (map/accel.js) is asking the same thing of
   the curb lane, and a motorway merge is where courtesy is most visible
   and most felt: a considerate driver lifts off and lets the joiner in,
   and in slow traffic that is the zipper. Without it, a driver stopped at
   the end of the lane needed eighty metres clear behind to go from rest
   into 60 km/h traffic, and the entrances backed up. So an ASK is
   anybody's: the player's, on an approach or past the box, and each
   joining car's, from the moment it is on the lane. Past the box the
   coordinate is DISTANCE REMAINING, as everywhere on an exit stretch. The
   offer is the same offer, by the same people, under the same limits.
   ===================================================================== */
import { soundnessOf, cautionOf, COMPETENT_AT } from "../core/driver.js";
import { decide, clearBetween, vehicleOf, wantedGap } from "./traffic.js";
import { mergePlan, laneEndRoom, lagNeed } from "./lanechange.js";
import { changeTime } from "../core/motion.js";
import { LANE } from "../map/format.js";
import { exitAlong } from "./graph.js";

export const GENTLE = 0.5;     // of a vehicle's comfortable braking: easing off for somebody with no deadline -- a flagged design constant
export const COURTESY_FOR = 4.0;   // s: the undue-delay standard (crossing.js UNDUE_AT) -- a gap not taken in that long is withdrawn

/* Would this driver let somebody in at all -- their temperament, nothing else. */
export function courteous(d) {
  const caution = d.caution ?? cautionOf(d.ratings ?? {});
  return soundnessOf(d.ratings ?? {}, "compliance") >= COMPETENT_AT && caution >= COMPETENT_AT;
}

/* WHAT THE PLAYER IS ASKING FOR, if anything: signalling toward a lane of
   the same approach that is beside them, before their line. The signal's
   onset is the world's to remember (`world.signalOn`). */
export function askOf(world, pl) {
  if (!pl || !pl.signal || pl.crash) return null;
  const k = pl.k ?? 0, layout = world.course.at[k]?.layout;
  const path = layout?.paths[pl.route];
  if (!path) return null;
  const since = world.signalOn?.dir === pl.signal ? world.signalOn.since : world.t;
  if (pl.s > path.clearAt) {
    /* Past the box: the lanes are the exit's. */
    const out = layout.legs[path.to];
    if (!out || !layout.legAt) return null;
    const toLeg = layout.legAt(out.base, (out.pos ?? out.lane) + (pl.signal === "left" ? -1 : 1));
    if (!toLeg || !layout.legs[toLeg] || layout.legs[toLeg].bay || layout.legs[toLeg].accel) return null;
    /* ON AN ACCELERATION LANE THE PLAYER HAS A JOINER'S DEADLINE (22 October):
       the gap is needed by the time the lane makes them stop, exactly as
       for a joining car (mergeAskOf). With none, an offerer eased off at
       GENTLE, and against a player standing at the end of the lane that
       never opens a gap -- it needs about 270 m to stop from 100 km/h at
       that rate, so every offerer arrived alongside still doing 60 km/h and
       the next car was asked (traced, tools/measure/stranded.mjs). */
    const by = out.accel ? world.t + Math.max(0, path.length - out.accelClose - pl.s - laneEndRoom(pl)) / Math.max(1, pl.v ?? 0) : undefined;
    return { k, toLeg, exit: true, rem: path.length - pl.s, along: exitAlong(world.course, k, pl.route, pl.s), v: pl.v ?? 0, since, id: pl.id, forPlayer: true, ...(by != null ? { by } : {}) };
  }
  if (pl.s > path.stopAt) return null;
  const leg = layout.legs[path.from];
  if (!leg || (leg.across ?? leg.lanes ?? 1) < 2) return null;
  const d = pl.signal === "left" ? -1 : 1;
  const here = leg.pos ?? leg.lane;
  const toLeg = layout.legAt ? layout.legAt(leg.base, here + d) : `${leg.base}#${leg.lane + d}`;
  if (!toLeg || !layout.legs[toLeg] || layout.legs[toLeg].bay) return null;
  /* ON AN APPROACH THERE IS A DEADLINE: across before the line, with a lane
     change's own length to spare (the rule the traffic's changes live by,
     lanechange.js). Declaring none here eased off so gently that the road
     ran out first (verify-courtesy, 22 October: 3 of 8 never opened). */
  const v = Math.max(1, pl.v ?? 0), room = path.stopAt - pl.s - v * changeTime(LANE);
  return { k, toLeg, s: pl.s, stopAt: path.stopAt, v: pl.v ?? 0, since, by: world.t + Math.max(0.5, room / v), id: pl.id, forPlayer: true };
}

/* A JOINING CAR'S ASK: on an acceleration lane, toward the lane beside
   it, while it is trying to move over (lanechange.js mergePlan). Asking
   since about when it came onto the lane. */
export function mergeAskOf(world, a, layout, path, leg) {
  if (!layout.legAt || !mergePlan(world, a, layout, path, leg)) return null;
  const toLeg = layout.legAt(leg.base, leg.pos - 1);
  if (!toLeg || !layout.legs[toLeg]) return null;
  /* NEEDED BY THE TIME IT MUST BEGIN TO STOP, not by the taper (22 October,
     DECISIONS 10.15): from there on the joiner is braking for its lane's
     end, and an offerer whose plan assumed it held speed to the taper
     slowed alongside it until the lane ran out -- traced, the offerer
     paced the joiner 15 m back and finally drove past it. The onset again:
     lift off early enough that the gap is open before it is needed. */
  return { k: a.k ?? 0, toLeg, exit: true, rem: path.length - a.s, along: exitAlong(world.course, a.k ?? 0, a.route, a.s), v: a.v ?? 0, since: world.t - (a.s - path.clearAt) / Math.max(1, a.v ?? 0), by: world.t + Math.max(0, path.length - leg.accelClose - a.s - laneEndRoom(a)) / Math.max(1, a.v ?? 0), id: a.id };
}

/* The player's position along a follower's own path (paths from one
   approach share it up to the line, scaled as lanechange.js scales a
   change), and the clear road between them. */
/* THE GAP AN OFFER HAS TO OPEN: for a car joining from an acceleration
   lane, the room it would itself accept behind it (lanechange.js
   `lagNeed`) -- an offer is open when the joiner would take it, not when
   the offerer would be content to follow. For the player, who decides for
   themselves, the room a COMPETENT driver would take (caution 1): the
   player's ask was a following gap behind them, which for a player standing
   at the end of an acceleration lane is far short of what joining a stream
   at 100 km/h from rest needs -- measured, a player stopped there waited a
   median 16 s for a gap with courtesy and without (tools/measure/stranded.mjs). */
const wantOf = (me, ask, pl) => (ask.exit && pl ? lagNeed(pl, me, pl.player ? 1 : undefined) : wantedGap(me, { v: ask.v }));

export function gapTo(world, me, ask, pl) {
  const fp = world.course.at[me.k ?? 0].layout.paths[me.route];
  if (ask.exit) {
    const mine = ask.along != null ? exitAlong(world.course, me.k ?? 0, me.route, me.s) : null;
    return { d: clearBetween(mine != null ? ask.along - mine : fp.length - me.s - ask.rem, me, pl) };
  }
  const s2 = ask.s * (fp.stopAt / ask.stopAt);
  return { s2, d: clearBetween(s2 - me.s, me, pl) };
}

/* The car behind this one in its own lane, and the clear road between: by
   the centreline past the box, along the approach before it. */
export function followerOf(world, me) {
  const k = me.k ?? 0, layout = world.course.at[k].layout, mine = layout.paths[me.route];
  const myAl = me.s > mine.clearAt ? exitAlong(world.course, k, me.route, me.s) : null;
  let best = null, bd = Infinity;
  for (const a of world.actors) {
    if (a.id === me.id || (a.k ?? 0) !== k || a.crash) continue;
    const p = layout.paths[a.route];
    if (!p) continue;
    let d = null;
    if (myAl != null && p.to === mine.to && a.s > p.clearAt) { const al = exitAlong(world.course, k, a.route, a.s); if (al != null) d = myAl - al; }
    else if (myAl == null && p.from === mine.from && me.s <= mine.stopAt) d = me.s - a.s;
    if (d != null && d > 0 && d < bd) { bd = d; best = a; }
  }
  return best && { ...best, gap: clearBetween(bd, best, me) };
}

/* The nearest car in the lane asked for whose centre is behind the player. */
export function askedOf(world, ask, cars) {
  const layout = world.course.at[ask.k].layout;
  let best = null, bs = -Infinity;
  for (const a of cars) {
    if (a.player || a.crash || a.parked || (a.k ?? 0) !== ask.k || a.id === ask.id) continue;
    const p = layout.paths[a.route];
    if (ask.exit) {
      /* Past the box: bound for that lane, behind the asker by distance remaining. */
      if (!p || p.to !== ask.toLeg) continue;
      const al = ask.along != null && a.s > p.clearAt ? exitAlong(world.course, a.k ?? 0, a.route, a.s) : null;
      const behind = al != null ? al - ask.along : ask.rem - (p.length - a.s);   // negative: behind
      if (behind < 0 && behind > bs) { bs = behind; best = a; }
      continue;
    }
    if (!p || p.from !== ask.toLeg || a.s > p.stopAt) continue;
    const s2 = ask.s * (p.stopAt / ask.stopAt);
    if (a.s < s2 && a.s > bs) { bs = a.s; best = a; }
  }
  return best;
}

/* THE OFFER, for the one driver asked: begun when they have noticed and
   can drop back comfortably, kept while the ask stands and the player has
   not left it untaken COURTESY_FOR after it opened. Returns the offer
   (`open` once the gap is there, `done` once withdrawn) or null. */
export function offerOf(world, me, ask, pl, noticed) {
  const was = me.courtesy && me.courtesy.leg === ask.toLeg && me.courtesy.for === ask.id ? me.courtesy : null;
  /* Withdrawn, it stays withdrawn for as long as this ask stands: a driver who gave up does not offer again. */
  if (was?.done) return was;
  if (was) {
    /* THE CLOCK RUNS FROM WHEN THE GAP IS THERE TO TAKE, not from the offer:
       dropping back from level to a following gap at a comfortable rate
       takes about four and a half seconds at highway speed (measured,
       tools/measure/courtesy.mjs), longer than the wait itself. */
    const open = was.open ?? (gapTo(world, me, ask, pl).d >= wantOf(me, ask, pl) ? world.t : null);
    /* ...and a gap that has not opened in the time the offerer's own plan
       needs to open it, and the standard on top, is not going to be taken.
       It was twice the standard, fixed -- written when courtesy dropped
       back at the offerer's hardest; eased off gently (10.15) a full gap at
       highway speed takes about eight seconds, and offers withdrew
       themselves a moment before they opened (22 October, verify-courtesy:
       3 of 8 never opened). */
    const done = open != null ? world.t - open >= COURTESY_FOR : world.t - was.since >= (was.needs ?? COURTESY_FOR) + COURTESY_FOR;
    return done ? { ...was, open, done: true } : open !== was.open ? { ...was, open } : was;
  }
  if (!courteous(me) || world.t - ask.since < noticed) return null;
  const { d } = gapTo(world, me, ask, pl);
  /* Only a driver actually in the way: already a following gap back, there is nothing to give. */
  if (d >= wantOf(me, ask, pl)) return null;
  const closing = Math.max(0, (me.v ?? 0) - ask.v), b = me.brake ?? vehicleOf(me).brake;
  /* Coming up from BEHIND faster than the player, they need the room to shed
     it at their own rate before they are alongside; level with the player
     or slower, they fall back at leisure (the easing never brakes harder
     than their own rate). The first version refused anybody closing at all
     unless 1.5 m back, so a car level with the player -- the case the
     courtesy is for -- was refused for a fraction of a metre a second
     (verify-courtesy, 14 October: 2 offers from 8 courteous drivers). */
  if (closing > 0 && d > 0 && d < (closing * closing) / (2 * b)) return null;
  /* AND A DRIVER WHO LOOKS BEHIND (the maintainer: "danger behind can be
     more pressing than ahead"): one who checks -- competent on the
     observation axis -- does not offer a gap that would make the car behind
     them brake harder than that car's own comfortable rate. One who does
     not check offers anyway, and the braking lands on whoever follows: the
     fault (DECISIONS 10.12). */
  if (soundnessOf(me.ratings ?? {}, "observation") >= COMPETENT_AT) {
    const need = courtesyPlan(world, me, ask, pl).need ?? 0;
    const f = followerOf(world, me);
    if (f && need > (f.brake ?? vehicleOf(f).brake) && f.gap < 2 * wantedGap(f, me)) return null;
  }
  /* How long the plan takes to open the gap: `want - d` dropped back at its rate. */
  const p0 = courtesyPlan(world, me, ask, pl);
  const needs = p0.open || !(p0.need > 0) ? 0 : Math.sqrt((2 * Math.max(0, wantOf(me, ask, pl) - p0.d)) / Math.min(p0.need, me.brake ?? vehicleOf(me).brake));
  return { since: world.t, leg: ask.toLeg, for: ask.id, forPlayer: !!ask.forPlayer, needs };
}

/* WHAT THE OFFER ASKS OF THEIR PEDAL -- planned, not reacted (22 October;
   the maintainer's ruling, DECISIONS 10.12 and 10.15). It was: follow the
   asker as though already in the lane, no harder than their own braking --
   which wants the whole gap at once, so every offerer braked at exactly its
   own rate, the good brakers and the poor alike (measured, 7 of 7). Now:
   open the gap by the time it is needed (`ask.by`), at the steady
   deceleration that does that from here -- so a driver who noticed early
   has time and eases off gently, and one who noticed late has to brake
   hard. Never harder than their own braking; once the gap is there, it is
   held as a following gap. The onset is the observation axis
   (`noticeAfter`); the rate is what is left of the time. */
export function courtesyPlan(world, me, ask, pl) {
  const { d } = gapTo(world, me, ask, pl);
  const want = wantOf(me, ask, pl);
  if (d >= want) return { open: true, d };
  /* NO DEADLINE -- the player signalling past the box, mid-road -- and nothing presses:
     they ease off gently from the moment they notice, at GENTLE of their
     vehicle's comfortable braking. A made-up deadline (four seconds from the
     signal, the first version) asked for 10 m/s^2 at highway speed and put
     every offerer back on its own cap. */
  if (ask.by == null) return { open: false, d, need: GENTLE * vehicleOf(me).brake };
  const T = Math.max(0.5, ask.by - world.t);
  const closing = (me.v ?? 0) - ask.v;
  /* Dropping back `want - d` more over T, closing now at `closing`, the asker holding speed. */
  return { open: false, d, need: (2 * (want - d + closing * T)) / (T * T) };
}
export function courtesyAccel(world, me, ask, pl) {
  const own = me.brake ?? vehicleOf(me).brake;
  const plan = courtesyPlan(world, me, ask, pl);
  if (plan.open) return Math.max(decide(me, { leader: { v: ask.v, id: pl.id }, gap: plan.d }), -own);
  /* Already dropping back fast enough: hold the speed, do not take the space
     back -- "no braking needed" read as "no constraint" let the offerer
     accelerate straight back into the gap it was opening (22 October). */
  return plan.need > 0 ? -Math.min(plan.need, own) : 0;
}
