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
import { mergePlan } from "./lanechange.js";
import { exitAlong } from "./graph.js";

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
    return { k, toLeg, exit: true, rem: path.length - pl.s, along: exitAlong(world.course, k, pl.route, pl.s), v: pl.v ?? 0, since, id: pl.id, forPlayer: true };
  }
  if (pl.s > path.stopAt) return null;
  const leg = layout.legs[path.from];
  if (!leg || (leg.across ?? leg.lanes ?? 1) < 2) return null;
  const d = pl.signal === "left" ? -1 : 1;
  const here = leg.pos ?? leg.lane;
  const toLeg = layout.legAt ? layout.legAt(leg.base, here + d) : `${leg.base}#${leg.lane + d}`;
  if (!toLeg || !layout.legs[toLeg] || layout.legs[toLeg].bay) return null;
  return { k, toLeg, s: pl.s, stopAt: path.stopAt, v: pl.v ?? 0, since, id: pl.id, forPlayer: true };
}

/* A JOINING CAR'S ASK: on an acceleration lane, toward the lane beside
   it, while it is trying to move over (lanechange.js mergePlan). Asking
   since about when it came onto the lane. */
export function mergeAskOf(world, a, layout, path, leg) {
  if (!layout.legAt || !mergePlan(world, a, layout, path, leg)) return null;
  const toLeg = layout.legAt(leg.base, leg.pos - 1);
  if (!toLeg || !layout.legs[toLeg]) return null;
  return { k: a.k ?? 0, toLeg, exit: true, rem: path.length - a.s, along: exitAlong(world.course, a.k ?? 0, a.route, a.s), v: a.v ?? 0, since: world.t - (a.s - path.clearAt) / Math.max(1, a.v ?? 0), id: a.id };
}

/* The player's position along a follower's own path (paths from one
   approach share it up to the line, scaled as lanechange.js scales a
   change), and the clear road between them. */
export function gapTo(world, me, ask, pl) {
  const fp = world.course.at[me.k ?? 0].layout.paths[me.route];
  if (ask.exit) {
    const mine = ask.along != null ? exitAlong(world.course, me.k ?? 0, me.route, me.s) : null;
    return { d: clearBetween(mine != null ? ask.along - mine : fp.length - me.s - ask.rem, me, pl) };
  }
  const s2 = ask.s * (fp.stopAt / ask.stopAt);
  return { s2, d: clearBetween(s2 - me.s, me, pl) };
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
    const open = was.open ?? (gapTo(world, me, ask, pl).d >= wantedGap(me, { v: ask.v }) ? world.t : null);
    /* ...and a gap that has not opened in twice that standard is not going to be taken. */
    const done = open != null ? world.t - open >= COURTESY_FOR : world.t - was.since >= 2 * COURTESY_FOR;
    return done ? { ...was, open, done: true } : open !== was.open ? { ...was, open } : was;
  }
  if (!courteous(me) || world.t - ask.since < noticed) return null;
  const { d } = gapTo(world, me, ask, pl);
  /* Only a driver actually in the way: already a following gap back, there is nothing to give. */
  if (d >= wantedGap(me, { v: ask.v })) return null;
  const closing = Math.max(0, (me.v ?? 0) - ask.v), b = me.brake ?? vehicleOf(me).brake;
  /* Coming up from BEHIND faster than the player, they need the room to shed
     it at their own rate before they are alongside; level with the player
     or slower, they fall back at leisure (the easing never brakes harder
     than their own rate). The first version refused anybody closing at all
     unless 1.5 m back, so a car level with the player -- the case the
     courtesy is for -- was refused for a fraction of a metre a second
     (verify-courtesy, 14 October: 2 offers from 8 courteous drivers). */
  if (closing > 0 && d > 0 && d < (closing * closing) / (2 * b)) return null;
  return { since: world.t, leg: ask.toLeg, for: ask.id, forPlayer: !!ask.forPlayer };
}

/* What the offer asks of their pedal: follow the player as if already in
   the lane, no harder than their own comfortable braking. */
export function courtesyAccel(world, me, ask, pl) {
  const { d } = gapTo(world, me, ask, pl);
  const a = decide(me, { leader: { v: ask.v, id: pl.id }, gap: d });
  return Math.max(a, -(me.brake ?? vehicleOf(me).brake));
}
