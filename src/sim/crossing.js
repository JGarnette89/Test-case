/* =====================================================================
   STAGE 1: CARS ARRIVING AT AN INTERSECTION AND SORTING THEMSELVES OUT.

   The scene is new; the DECISION IS NOT. `decide` and `wantedGap` are
   imported from stage 0 unchanged, because a driver working out what to
   do about an intersection is not doing something different from a
   driver working out what to do about the car in front. Both are "how
   fast may I go, given the nearest thing in my way". Two copies of that
   would be two answers to one question, which is the pattern that has
   caused most of this project's bugs.

   THE WHOLE TRICK, AND IT IS WHY THIS IS CHEAP:

     A YIELDING DRIVER IS FOLLOWING SOMETHING THAT ISN'T MOVING.

   A conflict point becomes a stationary obstacle at a known distance,
   and the same car-following model that keeps a car off the bumper in
   front keeps it behind the stop line. Yielding needs no second
   mechanism, no search, and no post-hoc rewriting of anybody's path --
   which is exactly what the old engine could not do, and why giving way
   had to be built there as a binary search after the fact.

   The right-of-way rules are the maintainer's and are unchanged
   (DECISIONS.md 5.3-5.5). What changed is WHO EVALUATES THEM: each
   driver, every tick, from what they can see, rather than an omniscient
   scheduler once before anybody moves.
   ===================================================================== */
import {
  decide, wantedGap, driver, timeToCover, weaveAt, wantedSpeed, stoppingRoom, underLoad,
  CAR, DT, PX_PER_M, M, vehicleOf, lenOf, widthOf, clearBetween, wantedFor,
} from "./traffic.js";
import {
  layoutFor, intersectionFor, poseAt, SIDES, INTENTS,
  ALL_WAY, TWO_WAY, cornersOf, boxesOverlap,
  bendSeenBy, amplitudeFor,
} from "./intersection.js";
import {
  courseOf, laneSpan, nextFor, joinedTo, poseOn,
  radiusFor,
} from "./course.js";
import { onRightOf, oncoming, graphOf, edgesOfGraph, poseOnGraph, postedAt, postedOutAt } from "./graph.js";
import { controlUnder, movementLight } from "./signal.js";
import { laneStep, lateralOf, lateralRate, changing } from "./lanechange.js";
import { cornerAccel, speedBy, fits } from "./corner.js";
export { fits };
import { stepPeds, heldAhead, strikes, strikePed, pedPose, crosswalksOf } from "./peds.js";
import { seedWalkers, stepWalkers } from "./walkers.js";
import { BUS_SHARE, stopsOf, nextStop, atStop, ridersFor, pullOf, inBay, mayPullOut, laneAt } from "./buses.js";
import { planPass, passOffset, passerAhead } from "./passing.js";
import { rng } from "../core/rng.js";
import { townOf } from "./towns.js";
import { knownControl, theirControl } from "./reading.js";
import { reads } from "../core/driver.js";
import { BAY } from "../map/format.js";
import { lookingAway } from "./attention.js";
import { parkingOf, initialParked } from "./parking.js";
import { tallerThanEye, boxOf, eyeOf, hiddenFrom, blocked, segHitsBox, conesFrom, blockedFrom } from "./sight.js";
import { REACTION_FLOOR, REGISTER_FLOOR, REGISTER_SPAN, JITTER } from "../core/perception.js";

/* =====================================================================
   PERCEPTION, STAGE 4: THE WORLD AS THIS DRIVER HAS TAKEN IT IN

   Layer 2 (DECISIONS.md 3): what the candidate REGISTERED, as distinct
   from what happened. In the old engine that was a query after the fact
   -- a registration delay per road user, and a departure decided on the
   set the driver had taken in. Here it is the actor's actual input: a
   driver looks away now and then, for `lag` seconds, and decides
   meanwhile from the picture they had, carried forward
   (sim/attention.js) -- so a poor observer pulls out on a gap that closed
   while they were looking at the mirror and brakes late for a leader
   that slowed, and neither is scripted. (Until 28 September `lag` was a
   constant delay, every driver living that far behind the world; the
   measurements below are of that model.)

   The world keeps its last few committed states for exactly this, and
   only when perception is switched on (`road.perceive`), so the default
   world carries nothing extra and moves by nothing.

   What is NOT perceived late: the opening the competent standard judges
   undue delay against (`openTo`), because whether the road was open is a
   fact about the road, and whether the driver saw it is the axis.

   WHO PERCEIVES LATE, WHEN IT IS ON, IS THE CANDIDATE AND ONLY THE
   CANDIDATE, and that is measured rather than a shortcut. With everybody
   lagged -- ordinary traffic at the floor and its poor observers up to
   two seconds behind -- traffic touches: one pair in fifteen minutes,
   with harsh braking tripled (tools/measure/lag.mjs). The candidate
   lagged alone touched nobody in forty-five minutes on the course at any
   rating, and takes gaps that are a lag tighter than they look -- the
   axis expressing where the game can read it. It does NOT read through
   braking: the braking distribution is the same at every observation
   rating, because leaders here brake gently and following gaps are
   comfortable. And on the crossing the bold candidate, lagged, rear-ends
   the car ahead -- 47 car-ticks in eight hours -- because the headway
   they choose is shorter than the lag they perceive behind; which is
   why it is off by default until contact has a response. Traffic
   perceives the present, as it always has: the same asymmetry the old
   engine had, stated.
   ===================================================================== */
export const PERCEIVE = { floor: REGISTER_FLOOR, span: REGISTER_SPAN, jitter: JITTER, who: "candidate" };
/* The longest lag anybody can have, in ticks: how much past the world
   has to keep. */
const LAG_TICKS = Math.ceil((PERCEIVE.floor + PERCEIVE.span * (1 + PERCEIVE.jitter)) / DT);

/* The actors as this driver currently has them: the present, or the
   committed state from their lag ago. Never further back than the world
   remembers, so a driver in a freshly made world sees the present. */
/* =====================================================================
   WHO CAN MATTER TO A CAR AT NODE k (SIMULATOR.md stage 5, the spatial
   index). Every scan here asked every car about every other car on the
   map, which is quadratic: measured on the stand-in city, 8 ms a step at
   200 cars and 18 ms at 300, four fifths of it this scan -- over a
   phone's budget at a city's traffic. But the rules already say who can
   matter. Right of way is settled only between cars at the SAME
   intersection (`blockedBy` returns false otherwise), and following
   across a boundary is along a lane, and a lane runs between two
   neighbouring intersections only. So a car at k need only ask the cars
   at k and at the nodes joined to k: the same answer, from a list built
   once per list of cars rather than scanned whole for every car.

   Exact, not approximate: `verify-generate` runs the same worlds with the
   index on and off and asks for the identical world, tick for tick.
   `world.noIndex` switches it off for exactly that. */
const hoodCache = new WeakMap();
function hoodOf(course, k) {
  let m = hoodCache.get(course);
  if (!m) {
    m = new Map();
    for (let i = 0; i < course.at.length; i++) m.set(i, new Set([i]));
    for (const l of course.links ?? []) { m.get(l.a)?.add(l.b); m.get(l.b)?.add(l.a); }
    hoodCache.set(course, m);
  }
  return m.get(k) ?? new Set([k]);
}
const byKCache = new WeakMap();
function byK(list) {
  let m = byKCache.get(list);
  if (!m) {
    m = new Map();
    for (const a of list) { const k = a.k ?? 0; if (!m.has(k)) m.set(k, []); m.get(k).push(a); }
    byKCache.set(list, m);
  }
  return m;
}
/* The cars in `list` at node k alone. */
export function atNode(world, list, k) {
  if (world.noIndex || !world.course?.graph) return list;
  return byK(list).get(k) ?? [];
}
/* The cars in `list` at node k and the nodes joined to it. */
export function nearNode(world, list, k) {
  if (world.noIndex || !world.course?.graph) return list;
  const m = byK(list), out = [];
  for (const j of hoodOf(world.course, k)) { const xs = m.get(j); if (xs) for (const a of xs) out.push(a); }
  return out;
}

/* The present, while they are looking; while they are looking away, the
   picture they had when they looked away, carried forward
   (sim/attention.js). */
export function seenBy(world, me) {
  const back = Math.round(lookingAway(world.t, me) / DT);
  if (!back || !world.past?.length) return world.actors;
  const i = Math.min(back, world.past.length);
  return carriedForward(world, world.past[i - 1], i * DT);
}

/* WHAT A DRIVER WHO LOOKED AWAY STILL BELIEVES about another car: where it
   was when they looked away, CARRIED FORWARD at the speed it had then --
   not where it was, frozen. Nobody acts on a car being where it was a
   moment ago; everybody assumes a moving car carries on moving. So the
   picture is wrong exactly where somebody CHANGED what they were doing.
   Along the car's own path, never past its end: a seam is a decision the
   perceiver cannot know. Cached per remembered tick and interval, so every
   driver who looked away at the same instant shares one list (and the
   neighbour index its buckets). */
const carriedCache = new WeakMap();
function carriedForward(world, snap, ago) {
  let byAgo = carriedCache.get(snap);
  if (!byAgo) { byAgo = new Map(); carriedCache.set(snap, byAgo); }
  let out = byAgo.get(ago);
  if (!out) {
    out = snap.map((a) => (a.player || a.crash || !(a.v > 0) ? a : { ...a, s: Math.min(a.s + a.v * ago, pathOf(world, a).length) }));
    byAgo.set(ago, out);
  }
  return out;
}

/* Slow enough to count as stopped. Not zero: a car creeping at a
   centimetre a second has stopped, and a threshold of exactly zero would
   make coming to rest depend on floating point. */
const AT_REST = 0.3;
/* How close to the line counts as being AT it. */
const AT_LINE = 2.0;
/* Two cars that stopped within this of each other arrived together, and
   the right-hand rule decides. */
const SAME_MOMENT = 0.4;
/* Moving out of the line rather than creeping in it. */
const LAUNCHED = 1.5;
/* What a rolling stop actually is: slowing to a crawl and carrying on,
   rather than coming to rest. About 8 km/h -- slow enough to have looked,
   fast enough that it was never a stop. */
const ROLLING = 2.2;

/* HOW SLOW THIS DRIVER THINKS IS SLOW ENOUGH. A driver who rolls stops
   treats a crawl as having discharged the obligation; everybody else
   comes to rest. They still YIELD -- a rolling stop is a failure to obey
   the law, not a failure to look, and the maintainer's mechanism is a
   driver confident in their own read rather than a reckless one. */
/* WHETHER THEY ROLL THIS ONE. A driver who does not know the rule rolls
   every stop; one who knows it and does not care rolls when nobody is about
   (traffic.js `rollsStops`). */
/* ...and one who does not READ the stop -- the stop sign, by the sign's
   own difficulty, or the full stop a right on red needs -- rolls it
   whoever is about: nothing is being weighed (core/driver.js `reads`). */
const rollsHere = (me, world) => {
  const L = layoutOf(world, me), p = pathOf(world, me);
  const kind = L.signal ? "right-on-red" : "stop";
  if (!reads(me, kind, L.signal ? undefined : L.legs[p.from]?.sign?.difficulty)) return true;
  return me.rollsStops === true || (me.rollsStops === "unwatched" && nobodyAbout(world, me));
};

/* SOMEBODY ABOUT: anybody this driver can see at this intersection who is
   not behind them on their own approach -- a car within ABOUT of its own
   line on either side of it, or somebody on foot at one of its crossings.
   COMPLIANCE IS SITUATIONAL and this is its situation: a rule broken when
   it is free, kept when anybody would see or be put out. ABOUT is a flagged
   design constant -- about a block's approach, within which a car at the
   line is plainly in view. */
export const ABOUT = 40;
export function nobodyAbout(world, me) {
  const k = me.k ?? 0, layout = layoutOf(world, me), mine = pathOf(world, me);
  const myBase = layout.legs[mine.from]?.base ?? mine.from;
  for (const b of atNode(world, seenBy(world, me), k)) {
    if (b.id === me.id || (b.k ?? 0) !== k) continue;
    const p = layout.paths[b.route];
    if (!p) continue;
    if ((layout.legs[p.from]?.base ?? p.from) === myBase && b.s <= me.s) continue;
    if (Math.abs(waitAt(p, b) - b.s) < ABOUT) return false;
  }
  const cws = world.peds?.length ? crosswalksOf(world.course) : null;
  for (const q of world.peds ?? []) if (q.state !== "struck" && cws[q.cw]?.k === k) return false;
  return true;
}

/* WHERE THE COMPETENT DRIVER SITS ON THE CONFIDENCE AXIS. `cautionOf`
   returns 1 at the optimum, 0 maximally bold, 2 maximally timid, so this
   is not a tuning knob -- it is the name of a point the ratings model
   already defines. Undue delay is judged from here rather than from the
   waiting driver's own standard, for a reason that would otherwise gut
   the fault: a timid driver's own gap requirement says the opening was
   never there, so measured against themselves they could never be late.
   ONE EXPRESSION, TWO VALUES OF ONE PARAMETER -- not a second definition
   of what an opening is. */
const COMPETENT = 1;
/* And the far tail, which is what an approach has to be long enough to
   hold. */
const MOST_CAUTION = 2;

/* UNDUE DELAY IS MARKABLE. The maintainer, on the Ontario scoresheet:
   "waiting 4-5 seconds beyond when the opening is there to turn is
   marked on the test." The band is his; the opening is derived.

   READ AS TIME SINCE THE OPENING APPEARED, NOT AS ONE UNBROKEN OPENING,
   and the difference is the whole fault. Measured both ways over 251
   drivers who came to rest at a line: no opening ever stayed open for
   four seconds -- the longest was 3.0s -- because an opening on a busy
   road is a rapid series of brief ones. Under the unbroken reading the
   fault fires never, while the behaviour it is supposed to catch is
   plainly there: a timid driver sits 15.9s where a competent one sits
   3.7s. The examiner's sentence is about a MOMENT ("beyond WHEN the
   opening is there"), so the clock starts at the first opening this
   driver could have acted on and runs while they are still sitting.

   THIS IS A READING OF A RULING RATHER THAN THE RULING ITSELF, and it
   is the one thing here worth putting back to him.

   `REACTION_FLOOR` is the old engine's, not a new number: an opening
   that flickers for less time than anybody can react to was never an
   opening, and marking somebody for missing it would punish physics. */
const UNDUE_AT = 4.0;

/* WHAT CONTROL IS THIS DRIVER UNDER, RIGHT NOW.

   Control used to be a standing fact about a leg, read straight off the
   layout. A signal is a control that changes with time, so the question
   is asked per driver per tick instead -- and it resolves to the
   vocabulary that was already here plus one new state (signal.js):

     "none"  the leg does not stop: an uncontrolled leg, or a green.
     "stop"  stop, then take a gap: a stop sign, or a right on red.
     "hold"  wait, gap or no gap. Only a red or an amber produces it,
             and it is the only genuinely new thing a signal adds.

   Everything below treats "hold" as stopping for right-of-way purposes,
   because a car held at a red IS a car at a line claiming nothing --
   what it must not do is go, and that is `whatStops`'s business. */
/* `viewer` is who is asking: the actor about their own approach reads it
   (sim/reading.js); anybody else expects the rule as posted. */
function controlOf(actor, layout, path, t = 0, viewer = actor) {
  const standing = viewer === actor ? knownControl(actor, layout, path, t) : theirControl(layout, path);
  if (!layout.signal) return standing === "stop" || standing === "yield" ? standing : "none";
  /* COMMITTED ON THE AMBER. A driver who found at the amber that they
     could not stop comfortably carries on -- and that decision has to
     STICK, or the red that follows seconds later orders them to stop two
     metres from the line at speed. It did: with cars slowing for turns
     (corner.js) a turning car committed on the amber was still short of
     the line when the red came, and sound drivers stood on the brakes at
     the line 183 times in five minutes. Entering on an amber you could
     not stop for is what the rule asks; the red after it does not undo
     it. */
  if (actor.amberGo) return "none";
  return controlUnder(layout.signal, layout.legs[path.from]?.base, path.intent, t, {
    v: actor.v ?? 0,
    toLine: waitAt(path, actor) - (actor.s ?? 0),
    standing,
    brake: vehicleOf(actor).brake,
    /* A NO RIGHT ON RED sign misread is a right on red after stopping. */
    readsNoRightOnRed: viewer !== actor || reads(actor, "no-right-on-red"),
  });
}

/* Does this leg stop -- a sign, a red, or an amber this driver can
   still make? Control is per leg, so one intersection shape is an
   all-way stop or a two-way stop depending only on this. */
const stops = (layout, path, actor = null, t = 0, viewer = actor) => (actor ? controlOf(actor, layout, path, t, viewer) !== "none" : theirControl(layout, path) === "stop");

/* WHICH INTERSECTION AN ACTOR IS AT, AND WHICH PATH THROUGH IT.

   A world is a COURSE now -- one intersection or several -- and an actor
   carries the index of the one they are currently negotiating. A course
   of ONE is exactly the single intersection every earlier stage had, so
   nothing below has a special case for it: the single intersection is the
   general thing with `n = 1`, rather than the general thing being an
   extension of it. */
export const layoutOf = (world, a) => world.course.at[a.k ?? 0].layout;
export const pathOf = (world, a) => layoutOf(world, a).paths[a.route];

/* WHERE A CAR ACTUALLY WAITS. `s` is a car's centre -- stage 0 defines
   the gap as `ahead - CAR.length`, which is only right for centres -- so
   a driver whose centre is on the line has 2.25m of bonnet inside the
   intersection. One expression, used by the constraint that stops them
   and by the test that notices they have stopped, because the first
   version had those two disagreeing by exactly this much and the result
   was total deadlock: nobody was ever recorded as having stopped, so
   nobody ever got priority, so nobody ever moved. */
const waitAt = (path, a) => path.stopAt - lenOf(a) / 2;

/* THE YIELD APPROACH: slow, so as to be able to give way. A driver who has
   read a yield sign arrives at the line no faster than YIELD_AT, scaled by
   their temperament exactly as their road speed and their corners are
   (traffic.js `wantedSpeed`) -- so a bold driver arrives hotter, which is
   theirs to be marked for -- braking for it at the rate they plan on
   (corner.js `speedBy`). With nobody to give way to they carry on at that
   speed; with somebody, the line holds them (`whatStops`), from a speed a
   comfortable stop can be made from. YIELD_AT is a design constant,
   flagged: the maintainer's ruling says slow, not how slow. */
export const YIELD_AT = 20 / 3.6;
function yieldAccel(me, world) {
  if (me.going || me.crash) return Infinity;
  const layout = layoutOf(world, me), path = layout.paths[me.route];
  if (!path || me.s > waitAt(path, me) || controlOf(me, layout, path, world.t ?? 0) !== "yield") return Infinity;
  return speedBy(me, wantedSpeed(YIELD_AT, me.caution ?? 1), waitAt(path, me));
}

/* =====================================================================
   THE GAP A DRIVER ACCEPTS IS DERIVED, NOT ASKED FOR.

   DECISIONS.md 5.13.8. The rule is one sentence: THE GAP YOU NEED IS THE
   TIME IT TAKES YOU TO CLEAR, PLUS AS MUCH AGAIN SCALED BY HOW CAUTIOUS
   YOU ARE. Everything in it is already a quantity this model holds --
   how far the conflict region runs, how hard a car pulls away, and where
   the driver sits on the confidence axis -- so nothing is typed in, and
   a bold driver takes gaps a timid one refuses without a second
   parameter existing to say so.

   At the optimum it doubles the crossing time, which is the ordinary
   "clear it in half the gap" a driver is actually taught.
   ===================================================================== */
export function gapNeeded(me, run, caution = me.caution) {
  /* A longer vehicle is clear later: `run` is to where a car is clear. */
  return timeToCover(me.v, run + lenOf(me) - CAR.length, me.v0, vehicleOf(me).accel) * (1 + caution);
}

/* Is there room to go in front of this one? Time until they reach the
   region, against the time I need to be out of it.

   `conflicts[them|me]` carries both halves of that in one lookup: `a` is
   how far along THEIR path the region begins, `clearOf` is how far along
   MINE I have to be to be out of it. */
function hasGap(me, them, layout, caution) {
  const meet = layout.conflicts[them.route + "|" + me.route];
  if (!meet) return true;
  /* A driver judges a gap on the speed they can SEE, which is the speed
     the other car is doing rather than the speed it might work up to.
     The floor keeps a car stopped in a queue from reading as infinitely
     far away in time -- which it very nearly is, correctly: if the
     through road is stopped, you go. */
  /* From THEIR FRONT, which on a long vehicle is further ahead of its
     centre than a car's: the region is where a car's centre meets it.
     Measured from a bus's centre, a bold driver turned left with 1.22 s to
     spare that was really 0.93 and met it (verify-buses, 1 October) --
     the one place the other vehicle's length was not counted (see `hit`
     below, which counts it). */
  const reach = (meet.a - (lenOf(them) - CAR.length) / 2 - them.s) / Math.max(them.v, 0.5);
  return reach >= gapNeeded(me, meet.clearOf - me.s, caution);
}

/* A LEFT TURN YIELDS TO THE ONCOMING -- head to head, the one crossing
   the other's path gives way. Returns null where the pair is not head to
   head at all, because there the rule has nothing to say and something
   else has to decide. */
function leftYields(mine, theirs, layout) {
  /* "Oncoming" is a bearing question the layout answers (graph.js):
     the opposite leg on the compass, the leg within ONCOMING_TOL of
     straight across on a map. */
  if (mine.intent === "left" && oncoming(layout, mine.from, theirs.from)
      && theirs.intent !== "left") return true;
  if (theirs.intent === "left" && oncoming(layout, theirs.from, mine.from)
      && mine.intent !== "left") return false;
  return null;
}

/* WHO GIVES WAY WHEN THE RULES HAVE RUN OUT.

   The right-hand rule decides adjacent legs and says NOTHING AT ALL
   about opposite ones -- two opposing left turns are on nobody's right.
   Written as a single `rightOf` test it answered "no" to both of them,
   and a tie-break that leaves NEITHER driver yielding is not a
   tie-break: measured, two opposing lefts each read the other as
   somebody else's problem and drove through each other at 16 and
   21 m/s, four and a half metres between centres.

   So: the car on the right, then whoever has further to go to the
   meeting point, then the id. The last of those is arbitrary and is
   MEANT to be -- it is there to guarantee the relation is TOTAL, not
   because a driver would reason that way, and if it is ever what
   decides in ordinary traffic something above it is not doing its job. */
function settle(me, them, mine, theirs, layout) {
  /* The car on the right, in bearings: the leg clockwise-short of my
     own, whatever the compass says (graph.js onRightOf). */
  if (onRightOf(layout, mine.from, theirs.from)) return true;
  if (onRightOf(layout, theirs.from, mine.from)) return false;
  const mineIn = layout.conflicts[me.route + "|" + them.route].a - me.s;
  const theirsIn = layout.conflicts[them.route + "|" + me.route].a - them.s;
  if (Math.abs(mineIn - theirsIn) > 0.5) return mineIn > theirsIn;
  return me.id > them.id;
}

/* =====================================================================
   MUST I WAIT FOR THIS ONE?

   Asked of one driver about one other, every tick, from what is visible.
   Order matters and follows the law:

     1. Do our paths even cross? If not there is nothing to discuss --
        which is how two cars going straight from opposite legs pass each
        other with no rule needing to say so.
     2. Have they already gone past the point where we would meet?
     3. Are they in the box? Then they finish; you do not drive into
        somebody who is already committed.
     4. Am I? Then I finish too.
     5. And now it depends on WHAT KIND OF PLACE THIS IS, which is the
        only thing the two-way stop adds:
          - neither of us stops: the ordinary rules of an uncontrolled
            crossing -- left yields to oncoming, otherwise whoever gets
            there first, otherwise the car on the right.
          - they stop and I do not: I am the through road, and I owe a
            waiting driver nothing.
          - I stop and they do not: this is not arrival order at all. It
            is GAP ACCEPTANCE, and it is the whole of a two-way stop.
          - both of us stop: the all-way stop, unchanged. Whoever
            stopped first goes.
   ===================================================================== */
export function blockedBy(me, them, layout, caution = me.caution, t = 0) {
  /* RIGHT OF WAY IS A QUESTION ABOUT ONE INTERSECTION. Two cars at
     different ones are half a kilometre apart and have nothing to settle
     between them; what they may have to do is FOLLOW each other, which is
     `whatStops`'s business and is about the lane rather than the box. */
  if ((me.k ?? 0) !== (them.k ?? 0)) return false;
  const hit = layout.conflicts[me.route + "|" + them.route];
  if (!hit) return false;

  const mine = layout.paths[me.route];
  const theirs = layout.paths[them.route];

  /* Clear of the whole region where our paths interact, not merely past
     the first point of it. Two paths run alongside each other for
     several metres and a car that has passed the nominal meeting point
     can still be right beside me. */
  if (them.s > hit.clearOf + CAR.length / 2 + (lenOf(them) - CAR.length)) return false;

  /* ALREADY COMMITTED, AND COMMITMENT BEGINS AT THE LAUNCH RATHER THAN
     AT THE LINE. A driver who has stopped, judged it clear and started to
     move does not stop again halfway across, and everybody else treats
     them as gone.

     Defining it at the line instead let one car in 596 cross while
     somebody who outranked them was still waiting: they had begun their
     launch, the other car's standing changed underneath them, and they
     were still nominally short of the line. Committing at the line is
     also physically dishonest -- a car under way cannot stop in the two
     metres it has left.

     For a leg that never stops this is the ONLY commitment test, and it
     is the right one: a through car is committed once it reaches the
     line, because that is the point at which it can do nothing else. */
  if (them.going || them.s >= theirs.stopAt) return true;
  if (me.going || me.s >= mine.stopAt) return false;

  /* What I expect of them is their posted rule, not whether they read it. */
  const iCtl = controlOf(me, layout, mine, t), theyCtl = controlOf(them, layout, theirs, t, me);
  const iStop = iCtl !== "none", theyStop = theyCtl !== "none";
  /* A YIELD SIGN (the maintainer's ruling: slow, give way, stop only if
     needed) gives way to a road with no sign exactly as a stop does, by
     gap acceptance -- the two branches below -- but it makes no stop to
     be ordered by. So where a yield meets another yield or a stop, neither
     is the through road and there is no stopping order to appeal to: they
     meet as equals, under the rules of an uncontrolled crossing. A default,
     flagged for the maintainer; no map mixes them yet. */
  const equals = (!iStop && !theyStop) || (iStop && theyStop && (iCtl === "yield" || theyCtl === "yield"));

  /* NEITHER OF US STOPS. Nobody has an arrival order to appeal to, so
     the standing rules do the work. Left-yields-to-oncoming comes FIRST
     here rather than last, and that is a real difference from the
     all-way stop rather than a shortcut: at a stop, arriving first earns
     you the intersection even if you are turning left, because the
     ordering is made of stops. With nobody stopping there is no such
     ordering, and a left turn yields to the oncoming whether it got
     there first or not. */
  if (equals) {
    /* AND YIELDING IS GAP ACCEPTANCE HERE TOO, which is the unification
       worth having: the rules decide WHO has to find a gap, and finding
       one is always the same act. Reading "a left turn yields to the
       oncoming" as an unconditional hold instead deadlocked the whole
       through road -- measured, both major approaches headed by a
       left-turner, 35 cars queued behind each, four cars through in five
       minutes -- because a car stopped two hundred metres back is
       oncoming traffic by every test except the one that matters.

       CLAUDE.md already states the rule this restores: A MOVING VEHICLE
       CLAIMS THE ROAD AHEAD OF IT, PROPORTIONAL TO SPEED. A STOPPED
       VEHICLE CLAIMS NOTHING. */
    /* BOTH STANDING AT OUR LINES, AND NO LIGHT: "whoever gets there
       first" is whoever STOPPED first. Read as distance over speed, two
       cars at rest arrive at the same moment -- both at the 0.5 m/s floor
       -- and every head car at a busy uncontrolled crossroads fell through
       to the car on its right, all the way round: measured (28 September,
       tools/measure/deadlock.mjs), one car across in four minutes at 40
       cars. Standing at the line is what an all-way stop is made of, and
       it is ordered the same way, arrivals together falling to the
       left-turn rule and then the right. Not at a signal, where standing
       at the red says nothing about who has the green. */
    if (!layout.signal && me.stoppedAt != null && them.stoppedAt != null && !them.going) {
      if (them.stoppedAt < me.stoppedAt - SAME_MOMENT) return true;
      if (me.stoppedAt < them.stoppedAt - SAME_MOMENT) return false;
      const tied = leftYields(mine, theirs, layout);
      if (tied != null) return tied;
      return settle(me, them, mine, theirs, layout);
    }
    /* AND A CAR AT REST THAT IS NOT AT ITS LINE -- queued behind somebody
       -- claims nothing: it is not arriving, it is waiting for the car in
       front. Distance over the 0.5 m/s floor had it arriving before a car
       standing at its own line, which then waited for a car that could not
       move until the jam cleared: the same four minutes, one car in six. */
    if (them.stoppedAt == null && them.v < AT_REST) return false;
    /* AND A CAR STANDING AT ITS LINE GOT THERE FIRST: arriving while it
       stands there, I give way to it if I can stop comfortably -- the same
       "whoever gets there first" as above, for a driver still rolling in.
       Reading it as claiming nothing let a slow left-turner roll on while
       the oncoming car it faced judged a gap and went, and they met in the
       box (tools/measure/ped-miss.mjs, seed 7). Too close to stop, I go on,
       and its own gap check sees me coming. Not at a signal. */
    const firstThere = !layout.signal && me.stoppedAt == null && them.stoppedAt != null && !them.going && stoppingRoom(me.v) <= Math.max(0, waitAt(mine, me) - me.s);
    const head = leftYields(mine, theirs, layout);
    /* ...but never where the turn rule already says they give way to me:
       a left-turner standing at its line on a through road is waiting FOR
       the oncoming traffic, and read as "there first" it stopped the
       through road 700 times in a check's run (verify-crossing). */
    /* ...UNLESS THEY PLAINLY CANNOT. Standing at my line, a left-turner
       already too close to stop comfortably short of where our paths meet
       is going to turn in front of me whatever the rule says -- their own
       gap check saw me at rest, which claims nothing, and went. The law
       gives me the road; I still wait for the gap (30 September: a truck
       pulling away at its 1 m/s^2 met exactly that left-turner on the
       Pedestrians map, where a car would usually have been clear). */
    if (head === false) {
      const meet = layout.conflicts[them.route + "|" + me.route];
      const theirIn = meet ? meet.a - them.s : -Infinity;
      if (me.stoppedAt != null && me.v < AT_REST && them.v > AT_REST && theirIn > 0 && stoppingRoom(them.v, vehicleOf(them).brake) > theirIn) return !hasGap(me, them, layout, caution);
      return false;
    }
    if (firstThere) return true;
    /* AN ONCOMING CAR AT REST AT ITS LINE HAS NOT GIVEN UP ITS PRIORITY
       -- the same exception the two-way stop already makes, and at a
       signal it is not the exception but the ordinary case: when a
       light goes green the whole queue is standing at the line, and
       "a stopped vehicle claims nothing" read it as an open road. The
       left-turner and the oncoming straight both launched in the same
       tick and met in the box (verify-graph, five minutes on the varied
       map: one such meeting, eight car-ticks). A car standing at its
       line is about to go, and the left turn waits to see it go.

       ONLY FOR A LEFT-TURNER WHO IS ALSO STANDING AT THEIR LINE, which
       is the green-onset case and nothing wider. Applied to one still
       rolling up, it made yielding depend on whether somebody across
       the box happened to be at rest this tick -- a flag that switches
       on without warning -- and drivers 1.7 m from the line at 17 km/h
       found themselves suddenly held: 800 car-ticks at full braking in
       five minutes, against 4 without the clause. A moving left-turner
       is judged on the gap, as before, and the oncoming car claims the
       road the moment it moves. */
    if (head === true) return (me.stoppedAt != null && them.stoppedAt != null && !them.going) || !hasGap(me, them, layout, caution);
    /* AND ONE STANDING AT MY LINE, AGAINST A CAR STILL MOVING: I am there
       first, and the question is only whether I have the gap. Arrival as
       distance over the 0.5 m/s floor made 15 m at rest thirty seconds
       away, so a car 108 m off at 50 km/h arrived "first", and a steady
       stream held a car at its line for three minutes. */
    if (!layout.signal && me.stoppedAt != null && me.v < AT_REST) return !hasGap(me, them, layout, caution);
    const mineIn = hit.a - me.s;
    const theirsIn = layout.conflicts[them.route + "|" + me.route].a - them.s;
    const dm = mineIn / Math.max(me.v, 0.5), dt = theirsIn / Math.max(them.v, 0.5);
    if (dt < dm - SAME_MOMENT) return true;
    if (dm < dt - SAME_MOMENT) return false;
    return settle(me, them, mine, theirs, layout);
  }

  /* THE THROUGH ROAD DOES NOT STOP, and owes a stop-controlled leg
     nothing. Note what has already been asked above this line: a car
     that is committed still gets finished. A through driver who drove
     into somebody who had legitimately pulled out would be modelling a
     right of way as a right to hit people. */
  if (!iStop) return false;

  /* AND THE MIRROR IMAGE, WHICH IS THE WHOLE OF A TWO-WAY STOP. Waiting
     at a line for a road that never stops is not arrival order. Nobody
     is coming to rest for me to be ahead of; the question is whether
     there is room, and it is a question about TIME. */
  if (!theyStop) {
    /* WITH ONE EXCEPTION, AND IT IS THE ONE THAT STOPS BOTH OF US GOING
       AT ONCE. A car on the through road that has come to REST at the
       line has not given up its priority -- it is waiting for something
       of its own and it will go the moment that clears.

       Reading it as an ordinary stopped vehicle, which claims nothing,
       made the two of us disagree about who was giving way: I read them
       as claiming nothing and went, they read me as owing them
       everything and went, and we arrived in the same three metres of
       road in the same tick. Both had decided from the same previous
       state, and neither decision was wrong on its own.

       An uncontrolled driver only ever records `stoppedAt` at the line,
       so this is exactly the case it names and nothing wider. */
    if (them.stoppedAt != null) return true;
    return !hasGap(me, them, layout, caution);
  }

  /* Both still on the approach, both stopping. Anybody who has not
     stopped yet has no claim at all -- at an all-way stop the queue is
     made of people who have actually stopped. */
  if (them.stoppedAt == null) return false;
  if (me.stoppedAt == null) return true;

  if (them.stoppedAt < me.stoppedAt - SAME_MOMENT) return true;
  if (me.stoppedAt < them.stoppedAt - SAME_MOMENT) return false;

  /* Arrived together. */
  const head = leftYields(mine, theirs, layout);
  if (head != null) return head;
  return settle(me, them, mine, theirs, layout);
}

/* IS THE WAY OPEN. The same question `whatStops` asks on the driver's
   own behalf, asked again at somebody else's caution -- which is what
   lets undue delay be measured without a second opinion about what an
   opening is. */
export function openTo(me, world, caution) {
  const layout = layoutOf(world, me);
  /* A RED IS NOT AN OPENING, and this is where that has to be said or
     it is said nowhere: the undue-delay clock runs on `openTo`, so
     without it every driver waiting properly at a red would be marked
     for the wait the light imposed on them. */
  if (controlOf(me, layout, layout.paths[me.route], world.t ?? 0) === "hold") return false;
  /* Nor is a crosswalk somebody holds where this driver would cross it:
     waiting for them is not undue delay. */
  if (heldAhead(world, me, layout.paths[me.route])) return false;
  return !atNode(world, world.actors, me.k ?? 0).some((a) => a.id !== me.id && blockedBy(me, a, layout, caution, world.t ?? 0));
}

/* What is in this driver's way: the most constraining of the car in front and the
   line they are not allowed past yet. Both come back in the shape
   `decide` already understands, so nothing downstream knows the
   difference between a queue and a right-of-way. */
/* CAN THIS DRIVER STOP COMFORTABLY SHORT OF THEM, in the lane they share:
   giving way to a bus pulling out is for a driver who can, not one who
   would have to stand on the brakes (the same test a pedestrian's
   `cannotStop` asks). */
function canStopFor(world, me, them) {
  const mine = laneAt(world.course, me), theirs = laneAt(world.course, them);
  for (const my of mine) {
    const on = theirs.find((q) => q.lane === my.lane);
    if (!on) continue;
    const d = clearBetween(on.along - my.along, me, them);
    if (d >= 0) return d >= ((me.v ?? 0) ** 2) / (2 * (me.brake ?? 2.7));
  }
  return false;
}

export function whatStops(me, world) {
  const layout = layoutOf(world, me);
  const mine = layout.paths[me.route];
  let leader = null, gap = Infinity;
  /* THE ONE THAT CONSTRAINS ME MOST, NOT THE NEAREST. In a single queue
     they are the same car, so nothing changes there. They differ when
     the candidates are in different lanes or on different paths -- a
     driver changing lane is in both (lanechange.js), and following a car
     at 13 m/s eight metres ahead in the lane being left said nothing
     about a STOPPED car seventeen metres ahead in the lane being
     entered. Chosen by nearest, the stopped car counted only once it was
     the nearer of the two, at 7.8 m and 12 m/s -- past stopping, and 180
     overlaps in two minutes at 300 cars. The measure is the interaction
     term `decide` itself reads, `wantedGap / gap`, so the leader picked
     is by construction the one that brakes the driver hardest. */
  const press = (d, them) => wantedGap(me, them) / Math.max(d, 0.01);
  const consider = (d, them) => {
    if (leader == null || press(d, them) > press(gap, leader)) { gap = d; leader = them; }
  };

  /* MY LANE, AND HOW FAR ALONG IT I AM.

     A LANE IS A PIECE OF ROAD AND IT DOES NOT STOP AT AN INTERSECTION'S
     BOUNDARY. The exit of one and the approach of the next are the same
     street (course.js), so two cars nose to tail across that boundary are
     filed under different intersections and would otherwise be invisible
     to each other -- and the one behind would drive into the one in
     front at the exact moment it changed hands. */
  const course = world.course;
  const mineAt = me.k ?? 0;
  /* My two lanes and how far along each I am (course.js laneSpan). */
  const mySpan = laneSpan(course, mineAt, me.route, me.s);

  /* Everybody else, as THIS driver has them -- the present for a driver
     with no lag, their lag ago otherwise. */
  let others = nearNode(world, seenBy(world, me), mineAt);
  /* ...AS THEY LAST SAW ANYBODY A TRUCK NOW HIDES (sim/sight.js). Somebody
     a truck hides is in their picture where they last saw them, carried
     forward at the speed they had -- exactly as somebody they looked away
     from is (sim/attention.js) -- for MEMORY seconds, and then not at all.
     Deleting them outright made two drivers stopped at their lines, both
     waiting their turn, each forget the other the moment a truck passed
     between them; both went, and met (30 September). Only where a truck
     stands near, so a world of cars is unchanged. */
  /* Only trucks near enough to stand between this driver and anybody they
     decide about (SIGHT_NEAR); poses taken once per actor per tick
     (`poseOnce`): measured, recomputing them per pair made a step at 300
     cars thirteen times slower. */
  const myPose = poseOnce(world, me), layout0 = layoutOf(world, me), mine0 = pathOf(world, me);
  const tall = (world.tall ?? []).filter((b) => b.id !== me.id && Math.abs(b.x - myPose.x) < SIGHT_NEAR && Math.abs(b.y - myPose.y) < SIGHT_NEAR);
  let eye = null, seenNow = null;
  if (tall.length) {
    eye = eyeOf(myPose, me);
    const memo = me.memo ?? {}, kept = [];
    /* Remembered only by a driver near their line, and only somebody on
       ANOTHER approach to this intersection -- the ones a go is decided
       against. Remembering everybody, for everybody near a truck, was
       most of what sight cost: 22 ms of a step at 300 cars. */
    const nearLine = !me.going && me.s > waitAt(mine0, me) - 40 && me.s < mine0.clearAt;
    const myBase0 = layout0.legs[mine0.from]?.base ?? mine0.from;
    seenNow = nearLine ? [] : null;
    for (const o of others) {
      if (o.id === me.id || tall.some((b) => b.id === o.id)) { kept.push(o); continue; }
      /* Hiding matters only for the decision at this intersection, against
         somebody on another approach: traffic at the neighbouring ones is
         here for following across the seam, and anybody ahead in my own
         lane is behind whoever is in front of me anyway. (Testing everybody
         was most of a step at 300 cars.) */
      const oPath = pathOf(world, o);
      if ((o.k ?? 0) !== mineAt || (layout0.legs[oPath?.from]?.base ?? null) === myBase0) { kept.push(o); continue; }
      /* ...and only while BOTH are still approaching: once either is into
         the intersection they are close, and following somebody into a
         shared exit is not a decision a truck can hide (30 September: two
         cars merging into one exit lane lost each other behind a truck and
         met there). */
      if (me.going || me.s > mine0.stopAt || o.going || o.s > (oPath?.stopAt ?? Infinity)) { kept.push(o); continue; }
      /* Only a truck nearer than they are can stand between us. */
      const po = poseOnce(world, o), dO = Math.hypot(po.x - eye.x, po.y - eye.y);
      const between = tall.filter((b) => b.id !== o.id && Math.hypot(b.x - eye.x, b.y - eye.y) - b.l / 2 < dO);
      if (!between.length || !hiddenFrom(eye, po, o, between, null)) {
        kept.push(o);
        if (seenNow && (o.k ?? 0) === mineAt && (layout0.legs[pathOf(world, o)?.from]?.base ?? null) !== myBase0) seenNow.push(o);
        continue;
      }
      const m = memo[o.id], ago = m ? (world.t ?? 0) - m.t : Infinity;
      if (m && ago < MEMORY && m.k === (o.k ?? 0) && m.route === o.route) {
        kept.push({ ...o, s: Math.min(m.s + m.v * ago, pathOf(world, o).length), v: m.v, stoppedAt: m.stoppedAt, going: m.going, accepted: m.accepted });
      }
    }
    others = kept;
  }
  for (const them of others) {
    if (them.id === me.id) continue;
    /* GOING ROUND A STOPPED BUS (passing.js): out in the oncoming lane, the
       bus being passed is not in front of me -- and somebody passing
       toward me in MY lane is, as a stopped thing to stop short of: they
       are committed, I am the one who can give way. */
    if (me.pass && them.id === me.pass.bus && me.s < me.pass.s3) continue;
    const head = them.pass ? passerAhead(world.course, me, them) : null;
    if (head != null) { consider(head, { v: 0, id: "passer" }); continue; }
    /* A BUS IN ITS BAY is out of every lane (buses.js) -- except, while it
       signals to pull out, to a driver who knows to give way to it and can
       stop for it comfortably: to them it is the car in front. */
    /* ...and never to another bus bound for the same stop, which has to
       stop behind it (two buses met in one bay). */
    if (inBay(them) && me.busStop?.id !== them.busStop?.id && !(them.wantsOut != null && !me.player && reads(me, "yield-to-bus") && canStopFor(world, me, them))) continue;
    const theirs = pathOf(world, them);

    /* THE CAR IN FRONT ON THE ROAD I AM ON, WHEREVER THEY ARE FILED.
       Only ACROSS a boundary: within one intersection the two rules
       below are finer, because they can use the path's own distance and
       so keep following a leader THROUGH the box, which a projection onto
       a straight lane cannot -- a car turning off my lane stops advancing
       along it, and a follower reading that would think it had stopped. */
    if ((them.k ?? 0) !== mineAt) {
      const theirSpan = laneSpan(course, them.k ?? 0, them.route, them.s);
      for (const my of mySpan) {
        const on = theirSpan.find((t) => t.lane === my.lane);
        if (!on) continue;
        const d = clearBetween(on.along - my.along, me, them);
        if (d >= 0) consider(d, them);
      }
      continue;
    }

    /* THE CAR IN FRONT ON MY OWN APPROACH. Same leg, same lane, so this
       is stage 0's queue arriving unchanged.

       A CAR CHANGING LANE IS IN BOTH LANES until the blend is over
       (lanechange.js): the followers in the lane it is entering see it
       from the moment it starts, which is what makes them ease off for
       a car cutting in, and the ones in the lane it is leaving keep
       seeing it until it has gone -- and so does the changer, of the car
       it was behind. Without the second half a car half across the lane
       line is invisible to the car behind it. */
    const shareLane = theirs.from === mine.from
      || (changing(them.lc, world.t) && them.lc.fromLeg === mine.from)
      || (changing(me.lc, world.t) && (theirs.from === me.lc.fromLeg || (changing(them.lc, world.t) && them.lc.fromLeg === me.lc.fromLeg)));
    /* EXCEPT THE CAR THEY MISSED. A driver who skipped the blind-spot
       check has not registered the car beside them, and until they do
       (lanechange.js, the abort) they cannot brake for it either. They
       did: measured (28 September, tools/measure/lane-crash-trace.mjs),
       a changer who missed a car level with them followed it as a leader
       at MOST_BRAKE, fell back while the time-driven blend carried on
       across, and was nearly sideways and into it 1.2 s later, before the
       notice that would have swung them back. */
    const unseen = me.lc?.missed && !me.lc.abort && them.id === me.lc.unseen && world.t < me.lc.t0 + me.lc.noticeAfter;
    if (shareLane && them.s > me.s && !unseen) {
      consider(clearBetween(them.s - me.s, me, them), them);
    }

    /* SOMEBODY ALREADY ACROSS MY PATH IS IN FRONT OF ME, committed or not.
       Right of way says who goes first; it does not let a car drive into
       one that is physically in its way. Without this, a driver past their
       own line counted as committed and finished whatever was there:
       measured (8 October, the city at 15% trucks), a bold driver turning
       left took a one-second gap in front of an oncoming car; the oncoming
       car braked, could not stop short of its line, rolled over it at 20
       km/h -- and, past the line and so "committed", let go of the brake
       and drove into the turner still crossing its lane. So: once they are
       into the region where our paths overlap (`back.a` along theirs) and
       until they are clear of it, the point where I would first touch
       them (`hit.a` along mine) is a stopped car to stop short of. Only
       ever the one INSIDE the region holds the other, so two cars cannot
       hold each other here. */
    if (theirs.from !== mine.from && !me.player) {
      const hit = layout.conflicts[me.route + "|" + them.route], back = hit && layout.conflicts[them.route + "|" + me.route];
      if (back && me.s < hit.a && them.s >= back.a && them.s <= hit.clearOf) consider(Math.max(0, hit.a - me.s - 1), { v: 0, s: hit.a, id: them.id });
    }

    /* AND THE CAR IN FRONT ON MY WAY OUT, which is a different car and
       was the bug. Two paths that leave by the same leg share their whole
       final stretch -- a car going straight from the north and one
       turning left from the east both end up in the same southbound lane
       -- and once both are through the box neither yields to the other,
       because yielding is about the conflict point they have already
       passed. Nothing was making them follow, so they drove through each
       other: measured, 151 overlaps in six intersections over four
       minutes.

       On a shared exit the honest measure is DISTANCE REMAINING, because
       the tail of both paths is the same piece of road. Whoever has less
       left is in front. */
    if (theirs.to === mine.to && theirs.from !== mine.from) {
      const myLeft = mine.length - me.s;
      const theirLeft = theirs.length - them.s;
      /* ...and only a car that is on its way out, past its own line. A car
         still WAITING at its line has less of the shared path left than a
         car already in the box -- its approach is shorter -- and read as
         being in front, it held the car in the box, which held it at its
         line: a gridlock at the five-way -- lowered from 120 cars to 40,
         the map was still at 44 two minutes later. */
      if (theirLeft < myLeft && me.s > mine.clearAt - lenOf(me) && them.s > theirs.stopAt) {
        consider(clearBetween(myLeft - theirLeft, me, them), them);
      }
    }
  }

  /* WHERE I AM PULLING IN (a district trip's end, below): a stopped
     place at the curb, braked for by exactly the rule that brakes for a
     stopped car -- no second braking law. */
  if (me.leaveAt != null && me.leaveAt > me.s - 1) consider(Math.max(0, me.leaveAt - me.s), { v: 0, s: me.leaveAt, id: "curb" });
  /* A BUS'S STOP (buses.js): the same stopped place, by the same rule. */
  if (me.busStop) consider(Math.max(0, me.busStop.at - me.s), { v: 0, s: me.busStop.at, id: "stop" });

  /* AND THE LINE. Only while I am short of it and not yet through: once
     past the stop line I am committed, and a car that stopped halfway
     across would be worse than one that never yielded.

     WHAT A STOP SIGN ACTUALLY IS, in one expression: a driver on a
     controlled leg stops whether or not anybody is there, and a driver
     on an uncontrolled leg stops only for somebody. Same obstacle, same
     place, different reason -- so the through road runs uninterrupted
     without a second code path saying so, and still brakes for a car
     that has legitimately pulled out in front of it. */
  /* AN OPENING YOU CANNOT MOVE INTO IS NOT AN OPENING. Whether the car
     in front is still in the way is stage 0's question and `wantedGap`
     is stage 0's answer, asked here rather than restated -- a driver
     shuffling up behind somebody who is still clearing the box is
     following, not delaying, and marking them for undue delay would be
     marking them for the intersection's queue. Measured: five of ten
     marks were exactly that. */
  const queued = leader != null && gap <= wantedGap(me, leader);

  const short = !me.going && me.s < waitAt(mine, me) + AT_LINE && me.s < mine.clearAt;
  /* SOMEBODY ON A CROSSWALK THIS CAR WOULD CROSS, on the half it would
     cross it (peds.js, the near-half rule): short of the line they hold
     the car at the line; past it -- in the box, turning across the exit
     crosswalk -- they are an obstacle it stops short of. */
  const walker = heldAhead(world, me, mine);
  /* A crosswalk at the intersection lies past the stop line: hold at the
     line. A MID-BLOCK crossing lies before it: stop short of the paint
     itself -- holding at the line had a car registering somebody and
     driving through them to reach its own stop line. */
  const walkerAtLine = !!walker && walker.s >= waitAt(mine, me);
  const held = short && (walkerAtLine || others.some((a) => a.id !== me.id && blockedBy(me, a, layout, me.caution, world.t ?? 0))
    /* The margin, only for the driver at the head of the queue: one behind
       somebody is held by them, and what the head can see decides. */
    || (tall.length > 0 && !(leader && leader.id !== "line" && gap < 15) && phantomHolds(world, me, layout, mine, eye, tall)));
  if (walker && (!short || !walkerAtLine)) consider(walker.s - me.s - lenOf(me) / 2 - 0.5, { id: "ped", v: 0, headway: me.headway });
  /* THE THREE CONTROLS, AND THE ONLY PLACE THAT KNOWS A SIGNAL EXISTS.
     A red or an unmakeable amber HOLDS -- gap or no gap; a sign or a
     right on red waits for a stop and then a gap; a green or an
     uncontrolled leg waits only for somebody. */
  const under = controlOf(me, layout, mine, world.t ?? 0);
  if (short) {
    const waiting = under === "hold" ? true : under === "stop" ? (!me.stoppedAt || held) : held;
    if (waiting) {
      /* THE NOSE STOPS AT THE LINE, NOT THE MIDDLE OF THE CAR. `s` is a
         car's centre -- stage 0 defines the gap as `ahead - CAR.length`,
         which is only right for centres -- so stopping with `s` on the
         line leaves 2.25m of bonnet inside the intersection.

         That is not a cosmetic difference. It is where the remaining
         overlaps were coming from: 16 of 21 were a waiting car and a
         crossing car, and the waiting one was sticking into the box. */
      const d = waitAt(mine, me) - me.s;
      /* A stationary obstacle exactly where the driver must not pass. */
      consider(d, { id: "line", v: 0, headway: me.headway });
    }
  }
  /* THE NEXT INTERSECTION'S LINE, SEEN FROM THIS SIDE OF THE SEAM (29
     September). A driver's path ends at the middle of the link, so a
     stop line or a red a few metres past that seam was invisible until
     the car crossed it -- on a short link a car arrived at 60 km/h 20 m
     from a red and stood on the brakes at 8 m/s^2, and a truck, which
     cannot, ran the red into a crossing car. Within this driver's own
     comfortable stopping distance, the next line is braked for exactly as
     the line on this path is, under the control as this driver would read
     it there -- the straight movement's, the one a red means for most. */
  const toEnd = mine.length - me.s;
  if (world.course.graph && toEnd < stoppingRoom(me.v, me.brake ?? vehicleOf(me).brake) + 15) {
    const j = joinedTo(world.course, me.k ?? 0, mine.to);
    const L2 = j && world.course.at[j.k]?.layout;
    const routes = L2 ? L2.routesFrom(j.side) : [];
    const r2 = routes.find((r) => L2.paths[r].intent === "straight") ?? routes[0];
    if (r2) {
      const p2 = L2.paths[r2];
      const there = { ...me, k: j.k, route: r2, s: me.s - mine.length, stoppedAt: null, going: false, amberGo: false };
      const u = controlOf(there, L2, p2, world.t ?? 0);
      if (u === "hold" || u === "stop") consider(toEnd + waitAt(p2, me), { id: "line", v: 0, headway: me.headway });
    }
  }
  return { leader, gap, held, queued, hold: short && under === "hold", ...(seenNow ? { seen: seenNow } : {}) };
}

/* THE MARGIN FOR WHAT YOU CANNOT SEE IS CONFIDENCE (CLAUDE.md: occlusion
   is perceptible, inattention is not). A driver whose view of a road they
   would cross is blocked by a truck can see that it is blocked, so they
   assume something could be there: on each conflicting route, at the
   nearest point to where our paths meet that the truck hides, a vehicle
   at that road's speed scaled by their own caution -- the timid assume it
   at full speed, the bold assume nothing. Whether it would hold them is
   the same `blockedBy` every real road user is asked, so it gives way
   exactly where a real car there would be given way to, and nowhere
   else. */
const PHANTOM_LOOK = 8;
/* How near a truck must be to hide anything this driver decides about: the
   neighbourhood of one intersection, generously. */
const SIGHT_NEAR = 120;
/* One pose per actor object per tick: actor objects are made anew each
   tick, so the object is the key and nothing goes stale. */
const poseMemo = new WeakMap();
function poseOnce(world, a) {
  let p = poseMemo.get(a);
  if (!p) { p = poseOf(world, a); poseMemo.set(a, p); }
  return p;
}
/* How long a road user a truck hides stays in a driver's picture where they
   last saw it, carried forward: a flagged figure, about the time a truck
   takes to pass between two cars. */
const MEMORY = 6;   // seconds of road back from the meeting point, at its speed
/* THE POINTS phantomHolds LOOKS AT: every 3 m back from where a crossing
   path meets mine. A path and a meeting point are fixed for the life of
   the map, so the poses are too; worked out the first time and kept, they
   were 1,470 `poseAt` calls a tick at 150 cars on the bench (6 October).
   `poseAt` returns a fresh object nobody changes, so sharing them is safe. */
/* An intersection's paths as a list, once: `Object.entries` was a new
   array of arrays on every call, for every driver near a truck. */
const pathListOf = new WeakMap();
const pathList = (layout) => pathListOf.get(layout.paths) ?? (pathListOf.set(layout.paths, Object.entries(layout.paths)), pathListOf.get(layout.paths));
/* Each actor by id, once a tick (actors are new objects each tick, so the
   array is the key): the trucks a box stands for, without walking the
   whole world for every driver near one. */
const byIdOf = new WeakMap();
const actorById = (actors) => byIdOf.get(actors) ?? (byIdOf.set(actors, new Map(actors.map((a) => [a.id, a]))), byIdOf.get(actors));
const samplesOf = new WeakMap();
function sampleAt(p2, from, j) {
  let byFrom = samplesOf.get(p2);
  if (!byFrom) samplesOf.set(p2, (byFrom = new Map()));
  let list = byFrom.get(from);
  if (!list) byFrom.set(from, (list = { at: [from], pose: [] }));
  /* Each s is the one before less 3, exactly as the loop counts, so the
     same floating-point s is asked of poseAt. */
  while (list.at.length <= j) list.at.push(list.at[list.at.length - 1] - 3);
  return list.pose[j] ?? (list.pose[j] = poseAt(p2, list.at[j]));
}
function phantomHolds(world, me, layout, mine, eye, tall) {
  const assume = Math.max(0, Math.min(1, me.caution ?? 1));
  if (assume <= 0) return false;
  /* Only a driver near enough their line to be deciding: further back
     they are still approaching, and what is hidden changes before they
     get there (scanning for every approaching car was a fifth of a step). */
  if (me.s < waitAt(mine, me) - Math.max(10, stoppingRoom(me.v ?? 0) + 5)) return false;
  const myBase = layout.legs[mine.from]?.base ?? mine.from;
  const ids = actorById(world.actors);
  const trucksHere = [];
  for (const b of tall) { const a = ids.get(b.id); if (a && (a.k ?? 0) === (me.k ?? 0)) trucksHere.push(a); }
  /* Every point below is tested from this one eye: the trucks' cones once (sight.js `conesFrom`). */
  const cones = conesFrom(eye, tall);
  for (const [r2, p2] of pathList(layout)) {
    if (r2 === me.route || (layout.legs[p2.from]?.base ?? p2.from) === myBase) continue;
    const meet = layout.conflicts[r2 + "|" + me.route];
    if (!meet) continue;
    const speed = (world.road.posted ? postedAt(world.course, me.k ?? 0, r2) : null) ?? world.road.speed;
    /* Nothing comes THROUGH a truck: in the truck's own lane, the road it
       hides behind itself holds only whoever is queued behind it. (Without
       this a truck waiting at its line held every driver whose path it
       crossed: drivers at a line held 26% of the time against 14%.) */
    const inLane = trucksHere.filter((a) => pathOf(world, a)?.from === p2.from);
    for (let s = meet.a, j = 0; s >= Math.max(0, meet.a - speed * PHANTOM_LOOK); s -= 3, j++) {
      if (inLane.some((a) => a.s > s)) break;
      const q = sampleAt(p2, meet.a, j);
      if (!blockedFrom(eye, q, cones)) continue;
      /* ...nor where a truck itself stands: road a truck covers is hidden
         and has no room for anybody (a truck crossing the box ahead held
         the car behind it for the stretch of cross road it stood on). */
      if (tall.some((b) => segHitsBox(q, q, { ...b, l: b.l + 5, w: b.w + 5 }))) continue;
      /* OBJECT PERMANENCE. A vehicle can be in the hidden stretch only if it
         got there unseen: where the road beyond the stretch is in view,
         anything in it came through the part this driver is watching, so
         once they have stood at the line for as long as it takes to cross
         the stretch, nothing unseen is left in it. Without this a driver
         who had the right of way waited for ever on a stretch a waiting
         truck hid, while the truck and everybody else waited for them --
         a lock that grew for five minutes (30 September). */
      let far = null;
      for (let s2 = s - 3, j2 = j + 1; s2 >= Math.max(0, meet.a - speed * PHANTOM_LOOK); s2 -= 3, j2++) if (!blockedFrom(eye, sampleAt(p2, meet.a, j2), cones)) { far = s2; break; }
      const waited = me.stoppedAt != null ? (world.t ?? 0) - me.stoppedAt : 0;
      if (far != null && waited > (s - far) / Math.max(speed, 1) + REACTION_FLOOR) break;
      /* AND WHERE THE WHOLE APPROACH IS HIDDEN, not for ever: past the
         wait the maintainer marks as undue delay (UNDUE_AT), scaled by
         this driver's own caution, they conclude nothing is coming -- the
         timid hold out longer, which is their fault to commit. A real
         driver edges forward to see past the truck; creeping for a view is
         not modelled yet, and without this a driver with the right of way
         and a truck that waited for them stood each other off for ever. */
      if (far == null && waited > UNDUE_AT * (me.caution ?? 1)) break;
      const ghost = { id: "phantom", k: me.k ?? 0, route: r2, s, v: speed * assume, stoppedAt: null, going: false, accepted: false, kind: "car", caution: 1 };
      if (blockedBy(me, ghost, layout, me.caution, world.t ?? 0)) return true;
      break;
    }
  }
  return false;
}

/* =====================================================================
   The tick. Same four phases as stage 0, and the same order: perceive
   and decide from the PREVIOUS committed state, integrate, commit.
   ===================================================================== */
export function step(world) {
  const parkedNow = [];   // cars that pulled into a slot this tick (parking.js)
  const next = world.actors
    .map((raw) => {
      /* A PLAYER AT THE WHEEL is an actor everybody else perceives,
         yields to and follows, but nobody decides for: the screen
         steps them from the controls and writes them in before each
         tick (sim/drive.js), and hands them on at the seam itself. */
      if (raw.player) return raw;
      /* CRASHED: stopped where it hit, deciding nothing, until cleared. */
      if (raw.crash) return raw.v === 0 && raw.a === 0 ? raw : { ...raw, v: 0, a: 0 };
      /* THE DRIVER AS THEY ARE RIGHT NOW: their disposition under
         whatever instructions they are carrying (traffic.js,
         `underLoad`). Decided from, never written back -- the actor keeps
         its unloaded self, and the load is re-read every tick. */
      let me = underLoad(raw, world.road);
      let view = whatStops(me, world);
      /* GOING ROUND A BUS standing at its stop, where the road allows it
         and the oncoming gap is one this driver takes (passing.js). Decided
         once, then driven: the view is re-read without the bus in it. */
      let pass = raw.pass && me.s <= raw.pass.s3 ? raw.pass : null;
      if (!pass && world.course.graph && world.passing !== false) {
        pass = planPass(world, me, view.leader, pathOf(world, me));
        if (pass) { me = { ...me, pass }; view = whatStops(me, world); }
      }
      /* THE EXAMINER'S HAND (exam.js), on the one car that carries it.
         `ease` is being TOLD to slow: the candidate wants less speed and
         sheds it at their OWN braking rate (`brake`, the braking axis) --
         dropping the wanted speed alone made the following model stand
         on the brakes at its ceiling, which is not what "slow down,
         please" gets from anybody. Whatever the traffic demands is still
         the traffic's. `dual` is the instructor's brake, which is not
         theirs at all. Read from `raw`, never written back. */
      const own = decide(me, view);
      const told = raw.ease ? Math.min(own, Math.max(decide({ ...me, v0: me.v0 * (1 - raw.ease) }, view), -(me.brake ?? 2.7))) : own;
      /* THE CORNER (corner.js): on a map, a turning path slows the car to
         the speed this driver takes it at, through the same following
         model. The real `view` still decides right of way below. */
      const a = Math.min(told, world.course.graph && world.corners !== false ? cornerAccel(me, pathOf(world, me)) : Infinity, raw.dual ? -raw.dual : Infinity, yieldAccel(me, world));
      const v = Math.max(0, me.v + a * DT);
      const s = me.s + v * DT;
      const mine = pathOf(world, me);
      /* WHEN THEY STOPPED, remembered because the queue at an all-way
         stop is made of arrival order and nothing else can reconstruct
         it after the fact. */
      const atLine = Math.abs(s - waitAt(mine, me)) < AT_LINE;
      const stoppedAt = me.stoppedAt ?? (atLine && (v < AT_REST || (v < ROLLING && rollsHere(me, world))) ? world.t : null);
      /* ACCEPTING A GAP IS A DECISION, AND IT STICKS. `LAUNCHED` alone
         made commitment a matter of SPEED, so a driver who had judged the
         gap and started to move spent the two thirds of a second it takes
         to reach 1.5 m/s re-deciding from scratch every tick -- and an
         opening that was ample at the moment of the decision closes
         underneath them while they are still under a metre a second.

         Measured: five drivers no more cautious than competent were
         marked for undue delay having correctly started and correctly
         aborted, several times each. That is dithering, not caution, and
         it is not what any of them decided.

         The gap they accepted already accounts for their own pull-away
         (`timeToCover` reads `me.v` and `me.v0`), so a gap that was
         adequate when they took it stays adequate. */
      /* AND A RED IS NOT A GAP. Accepting is about the traffic; the
         light is about permission, and a driver with no conflicting
         traffic in front of them at a red has a clear road and no right
         to it. Without this a car stopped at a red launched the instant
         nothing was crossing -- measured, 20 of 56 launches were on a
         red, 13 of them left turns. */
      const accepted = me.accepted || (me.stoppedAt != null && !view.held && !view.hold);
      /* `LAUNCHED` stays as the physical backstop, for a driver who
         never came to a decision because they never came to a stop. */
      /* NOT WHILE HELD. A rolling stopper counts as stopped below ROLLING
         (2.2 m/s), which is above LAUNCHED (1.5), so the instant their stop
         latched the backstop called them launched -- even while traffic was
         holding them and they were still braking to a real stop. Measured:
         a bold rolling stopper yielding to oncoming traffic at an arterial
         T was declared going at 2.0 m/s, the oncoming car stood on the
         brakes for a car now "committed" in its path, and they met. The
         established rule is the opposite: held by traffic, a rolling
         stopper stops like everybody else; the rolling stop is for a sign
         with nobody there. */
      const going = me.going || accepted || (stoppedAt != null && v > LAUNCHED && !view.held && !view.hold);

      /* UNDUE DELAY. The clock starts at the first opening this driver
         could have acted on and runs while they are still sitting there
         -- the same `blockedBy` they use to decide, asked at `COMPETENT`
         instead of at their own caution.

         It follows from `accepted` above that a driver no more cautious
         than competent can NEVER be marked: they take the opening in the
         tick it appears, which stops them sitting, which stops the clock
         before it can latch. That is a property rather than a tuning --
         the fault belongs to the confidence axis by construction.

         Frozen once they go, so what they did stays inspectable. */
      /* The amber decision, remembered (see `controlOf`): released at an
         amber while still short of the line is committed to going. */
      const amberGo = me.amberGo || (!!layoutOf(world, me).signal && s < waitAt(mine, me) + AT_LINE
        && movementLight(layoutOf(world, me).signal, layoutOf(world, me).legs[mine.from]?.base, mine.intent, world.t) === "amber"
        && controlOf(me, layoutOf(world, me), mine, world.t) === "none");
      /* THE LAMPS OTHER DRIVERS READ (6 October, the maintainer: "world
         needs signals and brake lights"). Information for the player and
         nothing else: no rule here reads them, so the traffic is the
         traffic it was. Threading traffic is reading what the drivers
         round you are about to do.

         BRAKE LIGHTS: on while braking firmly -- past what letting off the
         pedal does -- and while standing or creeping without pulling away,
         as a driver holds the brake in a queue; and held for half a second
         after, as a foot stays on the pedal. Thresholds on speed alone
         flickered: a queue's cars hover on them tick to tick (measured on
         the bench, nearly half of all lamp changes came within 0.3 s of
         the last).

         TURN SIGNALS: for the turn this path makes, from three seconds
         before the line (the established rule: two to three seconds
         before a change of direction) or 25 m, whichever is further out,
         until the car is through the intersection; and for a lane change,
         toward the lane being entered while the move lasts. */
      const decel = ((me.v ?? 0) - v) / DT;
      const pressing = decel > BRAKE_LAMP_ON || (v < 0.5 && decel > -0.5);
      /* NOT `brake`: that name is the driver's own braking rate (traffic.js), and a lamp written over it made every car brake at 1 m/s^2. */
      const brakeLampAt = pressing ? world.t : me.brakeLampAt;
      const brakeLamp = pressing || (brakeLampAt != null && world.t - brakeLampAt < BRAKE_LAMP_HOLD);
      const turning = (mine.intent === "left" || mine.intent === "right") && s < (mine.clearAt ?? mine.stopAt) + 2 && mine.stopAt - s < Math.max(25, 3 * v);
      const changing = raw.lc && !raw.lc.abort && world.t < raw.lc.t0 + raw.lc.T;
      const blinker = turning ? mine.intent : changing ? (raw.lc.L0 < 0 ? "right" : "left") : null;
      const at = { ...raw, v, s, stoppedAt, going, accepted, ...(amberGo ? { amberGo } : {}), pass: pass && s <= pass.s3 ? pass : null, brakeLamp, brakeLampAt: brakeLampAt ?? null, blinker };
      const sitting = stoppedAt != null && !going;
      /* How long the opening in front of them has been there this time,
         and -- latched -- when the first one they could have acted on
         appeared. */
      const openFor = sitting && !view.queued && openTo(at, world, COMPETENT)
        ? (me.openFor || 0) + DT : 0;
      const openedAt = me.openedAt ?? (openFor >= REACTION_FLOOR ? world.t : null);
      const waited = sitting && openedAt != null ? world.t - openedAt : (me.waited || 0);
      const out = { ...at, a, accepted, openFor, openedAt, waited, delayed: me.delayed || waited > UNDUE_AT };
      /* WHAT THEY SAW THIS TICK, remembered for when a truck hides it (see
         `whatStops`); nothing to remember with no truck near. */
      if (view.seen) {
        const t0 = world.t ?? 0, memo = {};
        for (const [id, m] of Object.entries(me.memo ?? {})) if (t0 - m.t < MEMORY) memo[id] = m;
        for (const o of view.seen) memo[o.id] = { k: o.k ?? 0, route: o.route, s: o.s, v: o.v, t: t0, stoppedAt: o.stoppedAt, going: o.going, accepted: o.accepted };
        out.memo = memo;
      } else if (out.memo) delete out.memo;
      /* LANE CHANGES (lanechange.js): only where a leg has more than one
         lane, so every course the sim had before is untouched. Decided
         from `raw` for who they are -- the ratings, the caution -- and
         from the tick's own view for what is in front of them. */
      const stepped = world.course.graph && world.laneChanges !== false ? laneStep(world, { ...raw, v: me.v }, out, view) : out;
      /* A BUS'S STOP IS ITS LANE'S: one that is in another lane than the
         stop it was heading for -- a change its route needed -- looks for
         the next stop on the lane it is actually in. */
      if (stepped.kind === "bus" && stepped.busStop && stepped.route !== out.route && stepped.dwellFrom == null) {
        const p = world.course.at[stepped.k ?? 0].layout.paths[stepped.route];
        return { ...stepped, busStop: nextStop(world.course, stepped, p, stepped.s, Math.max(15, stoppingRoom(stepped.v))) };
      }
      return stepped;
    })
    /* AND OFF THE END OF ONE PATH IS THE START OF THE NEXT, rather than
       the end of the world. The two intersections are placed so those are
       the same metre (course.js), so a car crossing the boundary keeps
       its speed, its place in the queue and whoever it was following --
       it is the SAME CAR, which is the whole of what this stage adds.

       A leg with nothing beyond it is still the edge of the world, and a
       course of one intersection is made entirely of those. */
    .map((me) => {
      /* HOME: at rest where they meant to pull in, and gone. Never while
         moving -- a car vanishing at speed is a state nothing could
         honestly draw. */
      /* A crash is cleared -- towed, details exchanged -- after CRASH_CLEAR,
         and until then it is where it is, not crossing any seam. */
      if (me.crash) return world.t - me.crash.t >= CRASH_CLEAR ? null : me;
      /* A bus at its stop: standing with its doors open, then on (buses.js). */
      if (me.busStop && !me.player) me = atStop(me, world.t, world.course, pathOf(world, me), (world.walkers ?? []).filter((q) => q.stop === me.busStop.id && (q.state === "waiting" || q.state === "boarding" || q.state === "returning")).length, () => mayPullOut(world, me));
      /* Out of the bay and back in the lane: the pull is done with. */
      if (me.bay && me.s - lenOf(me) / 2 > me.bay.post + BAY.ahead + BAY.taper) me = { ...me, bay: null };
      if (me.leaveAt != null && !me.player && !me.candidate && me.v < 0.3 && me.s >= me.leaveAt - CAR.length - 3) {
        if (me.parkSlot) parkedNow.push(me);
        return null;
      }
      /* PAST THE BOX, THE NEW ROAD'S LIMIT. The seam below is where the
         next intersection's path begins, which can be most of a kilometre
         along the road just joined: measured on the highway, a car that
         turned onto it from a 50 km/h side road drove the next 940 m at
         52 km/h. The limit is the road's, from the box's far edge. */
      if (me && !me.player && !me.crash && world.road.posted && me.held == null && me.s > pathOf(world, me).clearAt) {
        const out = postedOutAt(world.course, me.k ?? 0, me.route);
        if (out != null) { const v0 = wantedFor(me, out, me.caution); if (v0 !== me.v0) me = { ...me, v0 }; }
      }
      if (!me || me.player || me.s <= pathOf(world, me).length) return me;
      let wanted = null;
      const on = nextFor(world.course, me.k ?? 0, me.route, (k, side) => { const w = wantFor(world, me, k, side); wanted = w.want; return w.route; });
      if (!on) return null;
      /* AND THE NEW ROAD'S LIMIT COMES WITH IT. A driver turning off an
         arterial onto a residential street slows to that street's
         posted speed, by the same `wantedSpeed` the spawn used, so a
         bold driver is still bold and a timid one still timid -- it is
         the LIMIT that moved, not the person. `caution` is the driver
         and is carried untouched.

         `underLoad` recomputes `v0` from the world's road for a loaded
         candidate, so a loaded view is left alone here rather than
         being corrected twice. */
      const posted = world.road.posted && me.held == null ? postedAt(world.course, on.k, on.route) : null;
      /* A TRIP THAT ENDS HERE: past its length and on a district street,
         a place to pull in far enough ahead to stop for comfortably and
         well short of the next line. */
      const legNow = (me.leg ?? 0) + 1;
      let leaveAt = null, parkSlot = null;
      if (!me.candidate && me.tripLen != null && legNow >= me.tripLen && isDistrictSide(world.course, on.k, world.course.at[on.k].layout.paths[on.route]?.from)) {
        const p = world.course.at[on.k].layout.paths[on.route];
        const lo = Math.max(15, stoppingRoom(me.v) + 10), hi = p.stopAt - 30;
        const pick = rng(world.seed * 6151 + (me.n ?? 0) * 31 + legNow);
        const lane = parkingOf(world.course).byLane.get(p.laneIn.id);
        if (lane) {
          /* INTO A FREE SLOT: nobody parked there, nobody already heading
             for it, far enough ahead to stop for and short of the line. On
             a street with no free slot they drive on and try the next. */
          const taken = new Set(atNode(world, world.actors, on.k).map((a) => a.parkSlot).filter(Boolean));
          const free = lane.filter((sl) => !world.parked?.[sl.key] && !taken.has(sl.key) && sl.along - p.laneIn.at0 >= lo && sl.along - p.laneIn.at0 <= hi);
          if (free.length) { const sl = free[Math.floor(pick() * free.length) % free.length]; leaveAt = sl.along - p.laneIn.at0; parkSlot = sl.key; }
        } else if (hi > lo && !parkingOf(world.course).slots.length) leaveAt = lo + pick() * (hi - lo);   // a map with no parking at all: in the lane, as before
      }
      return {
        ...me, k: on.k, route: on.route, s: 0, leaveAt, parkSlot,
        /* The next stop a bus makes on the way through (buses.js). */
        ...(me.kind === "bus" ? { busStop: nextStop(world.course, me, world.course.at[on.k].layout.paths[on.route], 0, Math.max(15, stoppingRoom(me.v))), dwellFrom: null, wantsOut: null, bay: null } : {}),
        pass: null,   // a pass ends before the seam (passing.js `planPass`)
        ...(posted == null ? {} : { v0: wantedFor(me, posted, me.caution) }),
        /* How many intersections they have been through, which is what a
           plan is indexed by and what a section of a drive is counted
           in. Everybody carries it, not only a candidate. */
        leg: (me.leg ?? 0) + 1,
        stoppedAt: null, going: false, accepted: false,
        openFor: 0, openedAt: null,
        lc: null,   // a lane change finishes before the line; never carried over a seam
        amberGo: false,   // an amber decision belongs to the intersection it was made at
        want: wanted,     // where they are going here, if their lane does not get them there (wantFor)
      };
    })
    .filter(Boolean);

  const t = world.t + DT;
  let { spawned, nextAt, turnedAway = 0 } = world;
  let lastJoin = null;
  /* A POPULATION RATHER THAN A RATE, when the world is given one. The
     maintainer asked for "a way for me to directly determine how many
     cars are in the map", and a spawn interval does not say that: the
     number on the road is what the interval, the map and the queues
     happen to settle to. With a `target` the edges top the map up to it
     -- an arrival every FILL seconds while there are fewer, none while
     there are enough -- so the count on screen is the count he chose,
     and a car leaving at one edge is replaced at another. */
  const topUp = world.target != null;
  const wanted = !topUp || next.length < world.target;
  if (topUp && !wanted) nextAt = t;
  if (wanted && t >= nextAt) {
    /* FROM INSIDE THE CITY OR FROM ITS EDGE (SIMULATOR.md 5.6). A car
       pulling out of a district street joins at rest where there is room
       ahead and behind, or not at all this time. */
    const fromDistrict = topUp && districtStreetsOf(world.course).length > 0 && rng(world.seed * 92821 + spawned + 1)() < districtShare(world.course);
    const car = fromDistrict ? null : arriving(world, spawned);
    let joining = fromDistrict ? pullingOut(world, spawned, next) : car && joinAt(world, next, car);
    /* NOBODY PULLS OUT ONTO A PERSON: a car leaving the curb beside somebody
       crossing from between the parked cars waits (peds.js). It was placed
       straight onto her. */
    if (joining && (world.peds ?? []).some((q) => q.state !== "struck")) {
      const at = poseOf({ ...world, actors: next }, joining);
      if ((world.peds ?? []).some((q) => { const pp = pedPose(world, q); return Math.hypot(pp.x - at.x, pp.y - at.y) < 8; })) joining = null;
    }
    lastJoin = joining;
    if (joining) {
      next.push(joining);
      spawned += 1;
      nextAt = t + (topUp ? (world.fill ?? FILL) : (car?.arriveIn ?? world.every));
    } else if (topUp) {
      /* No room on that leg this instant: try another next time. Not an
         arrival turned away, because nobody was arriving -- the map is
         only short of a car. */
      spawned += 1;
      nextAt = t + (world.fill ?? FILL);
    } else {
      /* NO ROOM ON THAT LEG, SO THAT ARRIVAL IS GONE. Holding it back
         until the leg clears would block every LATER arrival too --
         head-of-line blocking, because the next car in the stream is
         drawn from the same counter and would keep picking the same
         blocked leg. Measured: demand of 133 cars a minute produced 6.1
         cars on the road, because one full approach was stalling the
         whole stream.

         Dropping it is the honest model. Traffic that cannot get in
         queues somewhere upstream, and upstream is outside this world.
         Counted rather than silent, so the difference between what was
         offered and what got in is visible. */
      spawned += 1;
      turnedAway += 1;
      nextAt = t + (car?.arriveIn ?? world.every);
    }
  }
  /* What the world remembers of itself, for drivers who perceive it
     late. Only with perception on: a world without it keeps nothing. */
  /* CONTACT IS A CRASH, AND A CRASH IS RECORDED (DECISIONS.md 5.12: a
     state the sim can produce and the screen cannot show is a lie). Any
     two cars whose footprints now overlap have crashed: both stop where
     they are and stay, an obstacle, until cleared, and the world logs it
     with where it happened so a screen can say so and take you there.
     `verify-crashes` holds the invariant: no two cars ever overlap unless
     they are a recorded crash. */
  let crashes = world.crashes;
  /* A LONG VEHICLE'S TAIL, where it really is along its path this tick,
     for whoever follows it (traffic.js `clearBetween`). Cars carry none. */
  for (let i = 0; i < next.length; i++) {
    const a = next[i];
    if (a && !a.player && lenOf(a) > CAR.length) next[i] = { ...a, rear: rearOf(world, a) };
  }
  /* REPLACED IN PLACE, so whatever the neighbour index grouped from this
     array is stale: drop it (byK). The same after a crash, below. Measured,
     6 October: a car crashed at tick 435 and, the next tick, every driver
     asking the index saw it still moving at 0.91 m/s while one scanning
     everybody saw the wreck -- the index and the full scan disagreed only
     when somebody crashed. */
  byKCache.delete(next);
  /* At the NEW clock: `next` is where everybody is at t + DT, and a car
     changing lanes is placed across by the clock -- tested at the old one,
     its lateral position lagged a tick behind everything else, and a
     contact showed as an overlap for a tick before it was a crash
     (verify-crashes, 30 September). */
  const hits = contactsIn({ ...world, t: world.t + DT, actors: next });
  if (hits.length) {
    const hit = new Map();
    for (const c of hits) { if (!hit.has(c.a)) hit.set(c.a, c); if (!hit.has(c.b)) hit.set(c.b, c); }
    for (let i = 0; i < next.length; i++) {
      const c = hit.get(next[i].id);
      if (c && !next[i].crash && !next[i].player) next[i] = { ...next[i], v: 0, a: 0, crash: { t: world.t + DT, with: c.a === next[i].id ? c.b : c.a, at: c.at } };
    }
    byKCache.delete(next);
    crashes = [...(crashes ?? []), ...hits.filter((c) => c.fresh).map((c) => ({ t: world.t + DT, a: c.a, b: c.b, at: c.at }))].slice(-50);
  }

  /* WHO IS PARKED NOW: the cars that pulled in, and not the one that
     pulled out. A new object only when something changed. */
  let parked = world.parked;
  if (parkedNow.length || lastJoin?.fromSlot) {
    parked = { ...parked };
    for (const me of parkedNow) parked[me.parkSlot] = { n: me.n, colour: me.colour };
    if (lastJoin?.fromSlot) delete parked[lastJoin.fromSlot];
  }
  const past = world.road.perceive
    ? [world.actors, ...(world.past ?? [])].slice(0, LAG_TICKS)
    : world.past;
  /* WHAT STANDS TALLER THAN A DRIVER'S EYE (sim/sight.js), as committed:
     every driver deciding from this state sees the same trucks. None, and
     the world carries none -- a world of cars is the world it was. */
  const tallNow = world.seeThrough ? [] : next.filter(tallerThanEye);
  const tall = tallNow.length ? tallNow.map((a) => boxOf(poseOf({ ...world, t, actors: next }, a), a.id)) : null;
  /* EVERYBODY ON FOOT (peds.js), deciding from the traffic as it now is. */
  const walked = world.course.graph ? stepPeds({ ...world, t, tick: world.tick + 1, actors: next, ...(tall ? { tall } : { tall: undefined }) }) : null;
  /* PEOPLE WALKING ALONG (walkers.js): on the sidewalks, reading nobody and read by nobody. */
  /* Some of them turned to cross this tick, and some came back onto a
     sidewalk from one (peds.js, `walkersTaken`/`walkersFreed`). */
  const { walkersTaken, walkersFreed, ...walkedRest } = walked ?? {};
  const away = (walkedRest.peds ?? []).filter((q) => q.fromWalker && q.state !== "struck").length;
  const strolled = world.walkers ? stepWalkers({ ...world, t, actors: next, walkersTaken, walkersFreed: (walkersFreed ?? []).map((q) => ({ ...q, pose: pedPose({ ...world, t }, q) })), walkersAway: away }) : null;
  let out = { ...world, t, tick: world.tick + 1, spawned, nextAt, turnedAway, actors: next, ...(parked ? { parked } : {}), ...(crashes ? { crashes } : {}), ...(past ? { past } : {}), ...(walked ? walkedRest : {}), ...(strolled ? strolled : {}) };
  if (tall) out.tall = tall; else if (out.tall) delete out.tall;
  /* A CAR THAT REACHES SOMEBODY ON FOOT has struck them (peds.js
     `strikes`): they fall where they are, the car stops as a wreck, and
     it is logged like any crash. Only a driver who did not see them can. */
  if (walked) for (const hit of strikes(out, poseOf)) out = crashWith(strikePed(out, hit.ped), hit.car, hit.at, hit.ped);
  return out;
}

/* When a brake lamp comes on and goes off (m/s^2 of deceleration): past
   letting off the pedal, which sheds well under one, and clearly over. */
const BRAKE_LAMP_ON = 0.6, BRAKE_LAMP_HOLD = 0.5;   // m/s^2; s

/* JOINING THE ROAD, AT THE SPEED THE ROAD IS DOING.

   A driver arriving behind a queue does not arrive at the speed they
   FEEL like, they arrive at the speed there is room for -- which is
   ordinary merging, and it is what the first version of this was
   missing. It asked only whether the arriving car fitted AT ITS OWN
   PREFERRED SPEED and dropped it otherwise, so the faster a driver
   wanted to go the less often they could get on at all: a bold candidate
   completed 3 trips in fifteen minutes where a timid one completed 13,
   which reads as a fact about the driver and is a fact about the
   entrance. Their pace was being decided by the queue rather than by
   them.

   Bisected rather than stepped because `wantedGap` rises with speed
   smoothly, so the fastest speed that fits is exactly findable and there
   is no reason to guess at it. Returns null only when even a standing
   start will not fit, which is a genuinely full approach.

   Exported because a candidate joins the way anybody else does; they are
   not a special kind of traffic. */
export function joinAt(world, actors, car) {
  const mine = pathOf(world, car);
  const behind = actors
    .filter((a) => (a.k ?? 0) === (car.k ?? 0) && pathOf(world, a).from === mine.from)
    .reduce((lo, a) => (a.s < lo.s ? a : lo), { s: Infinity, v: Infinity });
  const room = behind.s - (lenOf(car) + lenOf(behind)) / 2;
  const fits = (v) => room > wantedGap({ ...car, v }, behind);
  if (fits(car.v)) return car;
  if (!fits(0)) return null;
  let lo = 0, hi = car.v;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return { ...car, v: lo };
}

/* WHERE TRAFFIC ENTERS THE WORLD, AND WHY IT IS ONLY THE EDGES.

   A leg with another intersection on the end of it is not a source: the
   traffic on it arrived from that intersection, and creating more there
   would be conjuring cars out of the middle of a street. So arrivals
   happen only where the course stops, which for one intersection is all
   four legs and for a row of them is the two ends plus every side road.

   A THROUGH ROAD CARRIES MORE TRAFFIC THAN THE STREET THAT STOPS FOR IT
   -- that is most of what makes it the through road, and a two-way stop
   with traffic split evenly four ways is not a two-way stop, it is a
   coincidence. With every leg controlled the weights are all equal and
   this reduces EXACTLY to the uniform draw it replaces. */
const BUSIER = 2;
export function edgesOf(course) {
  if (course.graph) return edgesOfGraph(course, BUSIER);
  const out = [];
  for (let k = 0; k < course.n; k++) {
    for (const side of SIDES) {
      if (joinedTo(course, k, side)) continue;
      out.push({ k, side, weight: course.at[k].layout.place.control[side] === "stop" ? 1 : BUSIER });
    }
  }
  return out;
}

function edgeFor(course, x) {
  const edges = edgesOf(course);
  let left = x * edges.reduce((sum, e) => sum + e.weight, 0);
  for (const e of edges) {
    if (left < e.weight) return e;
    left -= e.weight;
  }
  return edges[edges.length - 1];
}

/* WHAT THEY DO AT THE NEXT ONE. Drawn from this driver's own number and
   the intersection they have reached, so it is a property of the person
   and the place rather than of the clock -- the same rule every other
   roll in this file lives under, and the reason a course replays. */
/* THE ROUTE OUT OF THE LEG THEY ARRIVE ON.

   A DRIVER WITH A PLAN FOLLOWS IT, AND SILENCE MEANS STRAIGHT ON. That
   second half is the project's own rule (CLAUDE.md, Directions): a
   candidate told nothing carries on ahead, which is what makes a LATE
   instruction a missed turn rather than a pause. It falls out here
   rather than being enforced -- a plan that has run out, or never said
   anything about this intersection, produces `straight` because that
   is what the absence of an instruction means. Indexed by how many
   intersections they have negotiated rather than by WHICH one, so a
   route that doubles back or crosses itself is expressible.

   A plan names an INTENT; the route is the one out of this leg that
   carries it -- the compass names routes by intent, a map node names
   them by the leg they go to and carries the intent on the path. With
   no plan the draw is from the routes the leg offers, from this
   driver's own number and the place, as it always was: on the compass
   the routes are the three intents in INTENTS order, so the draw is
   the same draw. */
function routeFor(world, me, k, side) {
  return wantFor(world, me, k, side).route;
}

/* WHERE A DRIVER IS GOING AT THIS NODE, AND WHETHER THEIR LANE GETS THEM
   THERE. With lanes that can change (a map, lane changes on), a driver
   chooses an EXIT from everything the approach offers, whatever lane
   they happen to arrive in -- a car that turned right into the curb
   lane may want to turn left at the next one -- and if their lane does
   not make that movement they take the route their lane does make for
   now, and carry a `want` that lanechange.js acts on: move over, or miss
   the turn. Before per-lane permissions (lanes.js) every car only ever
   chose among its own lane's routes, so no car ever had to change lane
   to make a turn and a restricted lane changed nothing about traffic.

   Without lane changes, or on the compass, the old choice: among the
   routes out of the lane arrived in. */
/* `told`, when given, is the intent to aim for in place of the plan --
   an examiner's direction arriving on the approach itself (exam.js),
   after the route was chosen at the seam. */
export function wantFor(world, me, k, side, told = null) {
  const layout = world.course.at[k].layout;
  const all0 = layout.routesFrom(side);
  const ok = all0.filter((r) => fits(me, layout.paths[r], world.road?.lane));
  const routes = ok.length ? ok : all0;
  const lanesMove = !!world.course.graph && world.laneChanges !== false && layout.legs[side]?.base != null;
  const exitOf = (r) => layout.legs[layout.paths[r].to]?.base ?? layout.paths[r].to;
  if (!lanesMove) {
    if (told || me.plan) {
      const want = told ?? me.plan[(me.leg ?? 0) + 1] ?? "straight";
      return { route: routes.find((r) => layout.paths[r].intent === want) ?? routes.find((r) => layout.paths[r].intent === "straight") ?? routes[0], want: null };
    }
    const r = rng(world.seed * 96181 + (me.n ?? 0) * 7919 + k + 1);
    return { route: routes[Math.floor(r() * routes.length) % routes.length], want: null };
  }
  const base = layout.legs[side].base;
  const all1 = Object.keys(layout.paths).filter((r) => layout.legs[layout.paths[r].from]?.base === base);
  const allOk = all1.filter((r) => fits(me, layout.paths[r], world.road?.lane));
  const all = allOk.length ? allOk : all1;
  const exits = [...new Set(all.map(exitOf))];
  let target;
  if (told || me.plan) {
    const intent = told ?? me.plan[(me.leg ?? 0) + 1] ?? "straight";
    target = exitOf(all.find((r) => layout.paths[r].intent === intent) ?? all.find((r) => layout.paths[r].intent === "straight") ?? all[0]);
  } else {
    const r = rng(world.seed * 96181 + (me.n ?? 0) * 7919 + k + 1);
    target = exits[Math.floor(r() * exits.length) % exits.length];
  }
  /* This lane's way to it only if this vehicle can make it; a truck in a
     curb lane whose right is too tight for it wants the next lane's. */
  const mine = routes.find((r) => exitOf(r) === target && fits(me, layout.paths[r], world.road?.lane));
  if (mine) return { route: mine, want: null };
  /* Not from this lane: for now, the way this lane goes -- straight on
     if it can -- and the want to act on. */
  const meanwhile = routes.find((r) => layout.paths[r].intent === "straight") ?? routes[0];
  return { route: meanwhile, want: { k, to: target } };
}

/* A driver, on a leg, with somewhere to be. The person comes from stage
   0's `driver` -- the same five ratings the candidate is drawn from -- and
   only the route is new. */
function arriving(world, n) {
  const r = rng(world.seed * 31337 + n + 1);
  /* Traffic perceives the present unless perception is for everybody. */
  const base = world.road.perceive?.who === "all" ? world.road : { ...world.road, perceive: null };
  let where = edgeFor(world.course, r());
  /* A MAP WITH NO OPEN END -- a closed network, every road meeting
     another at both ends -- has nowhere for anybody to arrive from. No
     arrival, rather than a throw: traffic from inside the districts is
     SIMULATOR.md stage 5's, and until then such a map is simply empty. */
  if (!where) return null;
  /* The route out of that leg, drawn from the routes it offers: on the
     compass those are the three intents in INTENTS order, so the draw
     is the one it always was. */
  const routes = world.course.at[where.k].layout.routesFrom(where.side);
  const drawn = routes[Math.floor(r() * routes.length) % routes.length];
  /* ON A MAP, A CAR ENTERING CHOOSES LIKE ONE ARRIVING: an exit from
     everything the approach offers, and a `want` if its lane does not
     make it (wantFor). Drawing from the spawn lane's own routes meant a
     car entering at an edge never turned where the turn is made from a
     lane nobody enters in -- a turn bay -- and at the big arterial not one
     left came from the three edge approaches (25 September). The draw
     above is still taken, so every later draw is the one it was, and
     the compass, where lanes do not change, keeps it. */
  const lanesMove = !!world.course.graph && world.laneChanges !== false;
  /* A TRUCK, now and then (`TRUCK_SHARE`), from its own stream so a world
     without trucks draws every other number exactly as it did. Only as
     traffic arriving from outside: a truck does not fit a curb slot. Drawn
     before the route, so the route is one it can make (`fits`). */
  let kind = (world.trucks ?? 0) > 0 && rng(world.seed * 7717 + n + 5)() < world.trucks ? "truck" : "car";
  /* A BUS, on a map with stops (buses.js), from a stream of its own: a map
     without stops draws exactly what it did. */
  if (kind === "car" && (world.buses ?? 0) > 0 && stopsOf(world.course).size && rng(world.seed * 4441 + n + 9)() < world.buses) kind = "bus";
  /* A BUS ENTERS IN THE CURB LANE, where its stops are. */
  if (lanesMove && kind === "bus") {
    const L = world.course.at[where.k].layout, base = L.legs[where.side]?.base;
    const curb = Object.keys(L.legs).find((id) => L.legs[id].base === base && L.legs[id].curb);
    if (curb) where = { ...where, side: curb };
  }
  /* A truck enters in a lane with a turn it can make, where the edge it
     arrives at has one: a curb lane whose only way on is a right too tight
     for it left it to make that turn over the curb (verify-trucks 7). */
  if (lanesMove && kind !== "car") {
    const L = world.course.at[where.k].layout, can = (side) => L.routesFrom(side).some((q) => fits({ kind }, L.paths[q], world.road?.lane));
    if (!can(where.side)) {
      const base = L.legs[where.side]?.base;
      const other = Object.keys(L.legs).find((id) => L.legs[id].base === base && can(id));
      if (other) where = { ...where, side: other };
    }
  }
  const chosen = lanesMove ? wantFor(world, { n, kind }, where.k, where.side) : { route: drawn, want: null };
  const route = chosen.route;
  /* A car enters the world already driving to the limit of the road it
     enters on, not to the map's fastest. Drawn BEFORE the driver so
     `driver` derives `v0` from it once, rather than deriving it from
     one number and having it corrected a line later -- two
     implementations of one quantity is the recurring bug here. */
  const posted = world.road.posted ? postedAt(world.course, where.k, route) : null;
  const road = posted == null ? base : { ...base, speed: posted, kmh: Math.round(posted * 3.6) };
  const who = driver(road, world.seed, n, null, null, kind);
  return {
    ...who,
    n,
    k: where.k,
    route,
    ...(chosen.want ? { want: chosen.want } : {}),
    leg: 0,
    s: 0,
    stoppedAt: null,
    going: false,
    accepted: false,
    openFor: 0,
    openedAt: null,
    waited: 0,
    delayed: false,
    /* THE INTERSECTION SETS ITS OWN DEMAND rather than borrowing the
       straight road's. The maintainer wants this run as a stress test --
       "cars that just keep coming, so we can prove our right of way
       ordering stays consistent" -- and a rate tuned for one road is not
       a rate that saturates four approaches. */
    arriveIn: world.every * (0.6 + r() * 0.8),
    /* A bus runs its route; it does not end a trip at a parking slot. */
    tripLen: kind === "bus" ? null : tripLenFor(world, n),
    ...(kind === "bus" ? { busStop: nextStop(world.course, { kind }, world.course.at[where.k].layout.paths[route], 0, 15), riders: ridersFor(n) } : {}),
  };
}

/* =====================================================================
   THE DISTRICTS AS PLACES CARS COME FROM AND GO TO (SIMULATOR.md 5.6).

   A city whose every road meets another at both ends has no edge for
   traffic to arrive from, and a city whose only traffic comes in at its
   edges has nobody who lives there. So a car can also PULL OUT from the
   curb on a district street -- a local street inside a residential,
   commercial or industrial zone -- and a car whose trip is over PULLS IN
   on one: slows to a stop at the curb, through the ordinary following
   model, and is gone once at rest.

   A map with no districts is untouched: no district street, so nobody
   pulls out or in, and the new draws come from their own streams, so
   every draw that was made before is the draw it was.
   ===================================================================== */
const DISTRICTS = new Set(["residential", "commercial", "industrial"]);
const BIG = new Set(["arterial", "highway"]);
/* The share of the city's cars that start inside it when it has both
   districts and edges. A design constant, flagged: the town profile
   (5.4) is where a place gets to say how much of its traffic is its own. */
export const DISTRICT_SHARE = 0.5;
export const TRIP = { min: 3, span: 8 };   // intersections a trip lasts, drawn per car
const inPoly = (poly, p) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};
const districtCache = new WeakMap();
/* Every curb lane arriving at a node along a district street, weighted by
   its length. Computed once per course. */
export function districtStreetsOf(course) {
  if (!course?.graph) return [];
  if (districtCache.has(course)) return districtCache.get(course);
  const zones = (course.map?.zones ?? []).filter((z) => DISTRICTS.has(z.kind));
  const roads = Object.fromEntries((course.map?.roads ?? []).map((r) => [r.id, r]));
  const out = [];
  if (zones.length) {
    course.at.forEach((spot, k) => {
      if (spot.through) return;
      for (const leg of Object.values(spot.layout.legs)) {
        const r = roads[leg.road];
        if (!leg.curb || leg.bay || !r || BIG.has(r.kind)) continue;
        const mid = r.pts[Math.floor(r.pts.length / 2)];
        const z = zones.find((q) => inPoly(q.polygon, mid));
        if (z) out.push({ k, side: leg.id, weight: r.length, zone: z.id, character: z.character ?? "ordinary" });
      }
    });
  }
  districtCache.set(course, out);
  return out;
}
const isDistrictSide = (course, k, side) => side != null && districtStreetsOf(course).some((d) => d.k === k && d.side === side);
export const districtShare = (course) => (districtStreetsOf(course).length === 0 ? 0 : edgesOf(course).length === 0 ? 1 : DISTRICT_SHARE);
const tripLenFor = (world, n) => TRIP.min + Math.floor(rng(world.seed * 6007 + n * 13 + 5)() * TRIP.span);

/* A car pulling out from the curb, at rest, mid-street -- or null where
   there is no room this time. Room is measured along the lane itself
   (course.js `laneSpan`, the same measure following uses across a seam),
   against everybody on it: a car's length clear ahead, and behind as
   much as the car behind would want and needs to stop. */
function pullingOut(world, n, actors) {
  const spots = districtStreetsOf(world.course);
  const r = rng(world.seed * 48271 + n + 3);
  const total = spots.reduce((s, x) => s + x.weight, 0);
  let left = r() * total, at = spots[spots.length - 1];
  for (const x of spots) { if (left < x.weight) { at = x; break; } left -= x.weight; }
  const chosen = wantFor(world, { n }, at.k, at.side);
  const path = world.course.at[at.k].layout.paths[chosen.route];
  const lo = 15, hi = path.stopAt - 40;
  if (hi <= lo) return null;
  /* FROM A PARKED CAR, where the street has parking: somebody who was
     parked there is the one who leaves, and their slot empties. With
     nobody parked on this street there is nobody to leave. */
  const lane = parkingOf(world.course).byLane.get(path.laneIn.id);
  let s, fromSlot = null;
  if (lane) {
    const full = lane.filter((sl) => world.parked?.[sl.key] && sl.along - path.laneIn.at0 >= lo && sl.along - path.laneIn.at0 <= hi);
    if (!full.length) return null;
    const sl = full[Math.floor(r() * full.length) % full.length];
    s = sl.along - path.laneIn.at0; fromSlot = sl.key;
  } else if (parkingOf(world.course).slots.length) return null;   // a map with parking: nobody comes from nowhere
  else s = lo + r() * (hi - lo);
  const posted = world.road.posted ? postedAt(world.course, at.k, chosen.route) : null;
  const base = world.road.perceive?.who === "all" ? world.road : { ...world.road, perceive: null };
  const road = posted == null ? base : { ...base, speed: posted, kmh: Math.round(posted * 3.6) };
  /* FROM HERE: a car that pulls out of a district is one of its people,
     drawn from its character. Traffic arriving at the city's edge is from
     elsewhere and is drawn as it always was. */
  const car = {
    ...driver(road, world.seed, n, null, townOf(at.character)),
    home: at.zone,
    n, k: at.k, route: chosen.route, ...(chosen.want ? { want: chosen.want } : {}),
    leg: 0, s, v: 0,
    stoppedAt: null, going: false, accepted: false, openFor: 0, openedAt: null, waited: 0, delayed: false,
    arriveIn: world.every, tripLen: tripLenFor(world, n), fromCurb: true, ...(fromSlot ? { fromSlot } : {}),
  };
  const mine = laneSpan(world.course, at.k, chosen.route, s)[0];
  for (const a of actors) {
    const on = laneSpan(world.course, a.k ?? 0, a.route, a.s).find((x) => x.lane === mine.lane);
    if (!on) continue;
    const d = on.along - mine.along;
    if (d >= 0 && d < (lenOf(a) + lenOf(car)) / 2 + 6) return null;
    if (d < 0 && -d < (lenOf(a) + lenOf(car)) / 2 + Math.max(wantedGap(a, car), stoppingRoom(a.v ?? 0)) + 6) return null;
  }
  return car;
}

/* =====================================================================
   HOW MUCH ROAD THERE HAS TO BE.

   Stage 0's road is a DURATION rather than a distance, and an approach is
   the same idea against a different clock: it has to be long enough to
   HOLD the longest gap anybody waiting on it could need. Otherwise "is
   there a gap" is answered by the edge of the world instead of by the
   traffic -- every approach reads as closed the moment a car appears on
   it, and gap acceptance collapses into "is anybody visible at all".

   Derived from the same `gapNeeded` the driver uses, at the timid end of
   the confidence axis and the slowest cruise, against the fastest car
   that could be coming. Nothing is chosen. At 60 km/h it asks for about
   two hundred metres, which is roughly what a real two-way stop needs a
   driver to be able to see, and is why sight lines at one are a real
   engineering concern rather than a detail.

   AND IT HAS TO BE LONG ENOUGH TO STOP ON, which is the other half and
   applies wherever anybody stops at all. It was missing, and the tell
   was DECISIONS.md 10.0's exactly: five car-ticks in a hundred and fifty
   thousand sat at EXACTLY the maximum braking the model allows -- not
   near it, on it. Every one was a fast driver arriving 52m from a line
   they needed 87m to stop at comfortably, so they were spawned inside
   their own stopping distance and the clamp was the only thing standing
   between the model and a car that could not stop. A 60m approach was
   never long enough for a 60 km/h road.

   Where nothing stops, nobody accepts a gap and the gap term is inert. */
const REACH_MIN = 60;
export function reachFor(control, speed) {
  const line = intersectionFor().lineAt;
  /* The fastest driver this road produces, stopping comfortably. */
  const room = line + stoppingRoom(wantedSpeed(speed, 0));

  const waits = SIDES.filter((side) => control[side] === "stop");
  const runs = SIDES.filter((side) => control[side] !== "stop");
  if (!waits.length || !runs.length) return Math.max(REACH_MIN, Math.ceil(room));

  /* A provisional layout, only to measure the crossing itself. How far a
     driver has to travel to be clear is local to the box, so it does not
     depend on the approach length being solved for. */
  const draft = layoutFor({ control, reach: REACH_MIN });
  const slowest = { v: 0, v0: wantedSpeed(speed, MOST_CAUTION), caution: MOST_CAUTION };
  let worst = 0;
  for (const from of waits) {
    for (const intent of INTENTS) {
      const route = from + "/" + intent;
      for (const other of runs) {
        for (const oi of INTENTS) {
          const meet = draft.conflicts[other + "/" + oi + "|" + route];
          if (!meet) continue;
          const run = meet.clearOf - (draft.paths[route].stopAt - CAR.length / 2);
          worst = Math.max(worst, gapNeeded(slowest, run));
        }
      }
    }
  }
  return Math.max(REACH_MIN, Math.ceil(room), Math.ceil(worst * wantedSpeed(speed, 0)));
}

export const seedCrossing = (seed = 1, kmh = 50, opts = {}) =>
  seedCourse(seed, kmh, { ...opts, n: 1 });

export function seedCourse(seed = 1, kmh = 50, { every = 1.1, control = ALL_WAY, n = 1, cols, rows, bends = 0, perceive = false } = {}) {
  const speed = kmh / 3.6;
  /* WHICH LINKS BEND: a share, drawn from the seed, each way round with
     equal chance, and every bend as tight as this road's speed allows.
     Zero by default, so every course that existed before the bend is the
     same course to the byte. Drawn from its own stream so the traffic
     that follows is unchanged by whether the road bends. */
  const bowing = rng((seed * 7919 + 17) >>> 0);
  const bend = bends
    ? (link, g) => (bowing() < bends ? (bowing() < 0.5 ? 1 : -1) * amplitudeFor(g.reach, g.lineAt, g.radius) : 0)
    : null;
  const course = courseOf({ n, cols, rows, kmh, control, reachFor, bends: bend });
  const layout = course.at[0].layout;
  /* Perception lag: OFF by default, and the reason is measured rather
     than cautious. `"candidate"` lags the candidate alone; `true` lags
     everybody (a measurement). Even the candidate alone, on the
     crossing verify-telling drives, touches somebody: the BOLD one, 47
     car-ticks in eight hours, every one a rear-ending on the through
     road -- because a bold driver keeps 0.55 of the road's headway,
     0.39s at 60 km/h, which is shorter than the 0.47-0.55s they perceive
     behind, and a driver aiming for a gap they cannot see in time closes
     it. Honest, and exactly the dangerous candidate the design names
     (bold and blind); but a contact nothing draws and nothing responds
     to is the lie DECISIONS.md 5.12 names. It switches on when contact
     ends a drive (stage 5), and the mechanism is verified meanwhile so
     that day costs nothing new.
     Traffic drivers are made through `arriving`, which strips the lag
     unless it is for everybody. */
  const road = {
    kmh, speed, lane: layout.place.lane,
    perceive: !perceive ? null : perceive === true ? { ...PERCEIVE, who: "all" } : PERCEIVE,
  };
  const w = { t: 0, tick: 0, seed, road, course, layout, every, spawned: 0, nextAt: 0, actors: [] };
  /* WARMED LONG ENOUGH FOR A CAR TO HAVE CROSSED THE WHOLE COURSE, so
     the first thing anybody sees is a street with traffic on it rather
     than one filling up from the ends. A fixed forty seconds was right
     for one intersection and is not for a row of them. */
  const acrossIt = course.at.reduce((sum, a) => sum + 2 * a.layout.place.reach, 0) / speed;
  return warmed(w, acrossIt);
}

/* THE SAME WORLD ON A MAP: every node an intersection at its own
   bearings, every road a link, traffic entering at every dangling end
   and picking a way out at every node (graph.js). `control` overrides
   the map's per-leg controls -- `{ "*": "stop" }` makes every node an
   all-way stop -- and is a convenience for checks and screens. */
export function seedGraph(seed = 1, kmh = 50, loaded, { every = 1.1, control = null, perceive = false, posted = false, target = null, laneChanges = true, corners = true, keepRight = true, pedRisk = null, gapRate = null, gapHeedless = null, pedEvery = null, trucks: trucksAsked = null, buses = BUS_SHARE, walkers = false, passing = true, progression = true } = {}) {
  /* The truck share: asked for, else the map's own (map/load.js `traffic`), else TRUCK_SHARE. */
  const trucks = trucksAsked ?? loaded?.traffic?.trucks ?? TRUCK_SHARE;
  /* `progression: false`: every light on one shared cycle, as before green waves (progression.js) -- for comparing against. */
  const course = graphOf(loaded, { lane: 3.6, control, progression });
  const layout = course.at[0].layout;
  /* POSTED SPEEDS, OR ONE LIMIT FOR THE WHOLE MAP. The loader has
     carried a speed per road since the format existed and the sim drove
     every car at one number, which made a residential street and an
     arterial the same road to drive. With `posted` the limit a car
     drives to is the road's own (graph.js `postedAt`).

     `road.speed` stays, and it is the FASTEST road on the map rather
     than the argument: it is what sizes the geometry -- `reachFor`, the
     warm-up, how much road there has to be -- and those are bounds. A
     bound taken from the fastest road is long enough for every slower
     one; taken from an average it would be short for the fastest, which
     is the failure that actually bites. So `posted` can only ever make
     the approach generous, never short, and no geometry moves that was
     not meant to.

     Off by default, so every existing caller passing a kmh gets exactly
     the world it always got. */
  const fastest = Math.max(...loaded.roads.map((r) => (r.speed ?? 50) / 3.6));
  const speed = posted ? fastest : kmh / 3.6;
  const road = {
    kmh: posted ? Math.round(fastest * 3.6) : kmh, speed, lane: 3.6, posted: !!posted,
    perceive: !perceive ? null : perceive === true ? { ...PERCEIVE, who: "all" } : PERCEIVE,
  };
  const w = { t: 0, tick: 0, seed, road, course, layout, every, target, laneChanges, corners, keepRight, trucks, buses, ...(passing ? {} : { passing: false }), spawned: 0, nextAt: 0, actors: [],
    /* People on foot: how many take risks, and how often mid-block (peds.js); from the start, warm-up included. */
    ...(pedRisk ? { pedRisk } : {}), ...(gapRate != null ? { gapRate } : {}), ...(gapHeedless != null ? { gapHeedless } : {}), ...(pedEvery != null ? { pedEvery } : {}) };
  if (parkingOf(course).slots.length) w.parked = initialParked(course, seed);
  /* People walking the sidewalks (walkers.js): asked for by the screen,
     off for the checks until one of them crosses (SIMULATOR.md, ambient
     pedestrians, step 3). Their own random stream either way. */
  if (walkers) { const ws = seedWalkers(loaded, seed); if (ws) Object.assign(w, ws); }
  /* Long enough for a car to have crossed the longest road twice: the
     sum of every road would be an upper bound and cost six seconds of
     seeding on a desktop for a kilometre-square map, which on a phone
     is a screen that takes half a minute to open. */
  const acrossIt = (2 * Math.max(...loaded.roads.map((r) => r.length))) / speed;
  return warmed(w, acrossIt);
}

/* How often the edges try to add a car when a world is short of its
   target: fast enough that a map fills in well under a minute, slow
   enough that one edge is not handed a platoon in a single tick. */
export const FILL = 0.2;

/* THE SHARE OF TRAFFIC ARRIVING FROM OUTSIDE THAT IS A TRUCK. A flagged
   design constant for the maintainer: urban arterials carry roughly five
   to ten percent heavy vehicles, and this is the low end of that. Per
   world (`seedGraph`'s `trucks`), so a check can hold a world of cars as
   its control. */
export const TRUCK_SHARE = 0.06;

/* Run a fresh world until it has traffic on it, then put the clock
   back to zero -- moving everything that is on that clock. A world
   with a target is warmed until it is nearly full rather than for a
   fixed time, capped so a target the map cannot hold still returns. */
function warmed(w0, acrossIt) {
  /* THE WARM-UP FILLS AS FAST AS THE ROAD WILL TAKE IT: a car a tick,
     every one still through `joinAt`'s room test. FILL is paced for a
     person watching -- and it is one interval for every map, so the city,
     with 300 to fill and 222 places to fill from, opened at 152 and took
     a further minute to reach its count at FILL's 5 a second (28
     September, tools/measure/fill.mjs). Nobody watches the warm-up; the
     only thing that bounds it is room on the road. */
  let w = { ...w0, fill: DT };
  const warm = Math.round(Math.max(40, acrossIt) / DT);
  for (let i = 0; i < warm; i++) {
    w = step(w);
    if (w.target != null && i > 20 / DT && w.actors.length >= 0.95 * w.target) break;
  }
  /* AND THE REBASE HAS TO MOVE EVERYTHING THAT IS ON THAT CLOCK, which
     is not only `t`. Drivers carry two instants -- when they stopped and
     when the opening in front of them appeared -- and leaving those at
     the warm-up's reading while the clock went back to zero produced a
     driver who had been waiting MINUS 28.5 seconds. That is DECISIONS.md
     10.0's tell exactly: a measurement that cannot mean anything.

     Arrival ordering survived it because it only ever compares two
     stops with each other, which is what kept it hidden. */
  const shift = w.t;
  const back = (x) => (x == null ? null : x - shift);
  /* AND THE PAST IS DROPPED, because it is on the old clock too: a
     lagged driver reading a warm-up snapshot would compare a stopped-at
     instant a hundred seconds out. The first lag's worth of ticks after
     seeding sees the present instead, which `seenBy` does on its own. */
  const { past: _warm, fill: _fill, ...rebased } = w;
  return {
    ...rebased, t: 0, tick: 0, nextAt: Math.max(0, w.nextAt - shift),
    ...(w.peds ? { peds: w.peds.map((p) => ({ ...p, since: back(p.since) })) } : {}),
    /* ...and so are the people walking: how long somebody stands, and the
       ease onto a sidewalk -- left on the warm-up's clock it lay in the
       future and a walker's pose ran backwards past where it began, a
       1.5 m jump a tick (tools/measure/crossers.mjs, 30 September). */
    ...(w.walkers ? { walkers: w.walkers.map((p) => ({ ...p, ...(p.until != null ? { until: p.until - shift } : {}), ...(p.blend ? { blend: { ...p.blend, t: p.blend.t - shift } } : {}) })) } : {}),
    ...(w.pedWant ? { pedWant: Object.fromEntries(Object.entries(w.pedWant).map(([k, v]) => [k, { ...v, t: v.t - shift }])) } : {}),
    /* ...and a lane change is on that clock too: one begun in the warm-up
       kept a start forty seconds in the future, so its car sat a whole
       lane off, in both lanes, until the clock caught up -- found as a
       3.6 m jump at a seam (SIMULATOR.md 1.1.13). */
    actors: w.actors.map((a) => ({
      ...a, stoppedAt: back(a.stoppedAt), openedAt: back(a.openedAt),
      lcDone: back(a.lcDone ?? null),
      ...(a.lc ? { lc: { ...a.lc, t0: a.lc.t0 - shift } } : {}),
    })),
  };
}

export function run(world, ticks) {
  let w = world;
  for (let i = 0; i < ticks; i++) w = step(w);
  return w;
}

/* Where a car is -- for something that draws, and for the check that
   nobody is inside anybody. ONE POSE, both jobs: a driver who does not
   hold a steady line has to really not hold it, or the weave is a
   drawing rather than a fault, and the overlap test would be measuring a
   car that is not where the screen says it is (DECISIONS.md 0). */
/* Where along its path a rigid body's tail is, its front `half` ahead of
   `s`: the point a body's length behind the front IN A STRAIGHT LINE --
   further back than s - half on an arc, since the chord is shorter. */
function rearOn(end, s, half, prefer = null) {
  /* Every point back along the path a body's length from the front (stepped,
     then bisected within the step): a bisection over a fixed range clamped
     when the tail lay beyond it (a 1.9 m jump deep in a right turn). On a
     turn sharper than a right angle there can be two such points, and
     taking whichever was found first switched between them from one tick
     to the next (a 3.6 m jump) -- so the one nearest where the tail was
     last tick (`prefer`, metres behind the centre) is taken; the first
     otherwise. */
  const f = end(s + half), L = 2 * half, dist = (x) => { const q = end(x); return Math.hypot(f.x - q.x, f.y - q.y); };
  const roots = [];
  let prev = dist(s - half) >= L;
  if (prev) roots.push(s - half);
  for (let b = s - half - 0.5; b > s - 6 * half; b -= 0.5) {
    const now = dist(b) >= L;
    if (now !== prev) {
      let lo = b, hi = b + 0.5;
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if ((dist(mid) >= L) === now) lo = mid; else hi = mid; }
      roots.push((lo + hi) / 2);
      if (prefer == null) break;
    }
    prev = now;
  }
  if (!roots.length) return s - 6 * half;
  if (prefer == null) return roots[0];
  return roots.reduce((b, r) => (Math.abs(s - r - prefer) < Math.abs(s - b - prefer) ? r : b), roots[0]);
}
/* How far behind its centre, along its path, a long vehicle's tail is: its
   half-length on the straight, more in a turn (`clearBetween`). */
export function rearOf(world, actor) {
  const half = lenOf(actor) / 2, path = pathOf(world, actor);
  if (!path) return half;
  const at = (s) => (world.course.graph ? poseOnGraph(world.course, actor.k ?? 0, actor.route, s) : poseOn(world.course, actor.k ?? 0, actor.route, s));
  const len = path.length;
  const end = (s) => { const c = Math.max(0, Math.min(len, s)), q = at(c), h = (q.rot * Math.PI) / 180; return { x: q.x + Math.cos(h) * (s - c), y: q.y + Math.sin(h) * (s - c) }; };
  const r = actor.s - rearOn(end, actor.s, half, actor.rear ?? null);
  /* NEVER A JUMP. Where the tail's place on the path vanishes under it -- a
     truck forced into a corner sharper than its body can follow, which
     `fits` keeps it off wherever there is another way on -- it moves to
     the new place over a few ticks at a pace tied to its own, rather than
     in one. The body is approximate for that moment, and continuous. */
  if (actor.rear == null) return r;
  const most = Math.max(0.3, ((actor.v ?? 0) + 0.5) * DT * 3);
  return Math.max(actor.rear - most, Math.min(actor.rear + most, r));
}

export function poseOf(world, actor) {
  /* On a map the pose has a height, from the road's own profile. */
  const at = (s) => (world.course.graph
    ? poseOnGraph(world.course, actor.k ?? 0, actor.route, s)
    : poseOn(world.course, actor.k ?? 0, actor.route, s));
  let p = at(actor.s);
  /* A VEHICLE LONGER THAN THE PATHS WERE DRAWN FOR SPANS THEM (29
     September). A path's turn is sized for a car, whose centre rides it;
     a truck's centre on the arc, facing along it, swung its rear 1.9 m into
     the next lane 25 degrees into a right turn and struck the car turning
     left beside it. A long vehicle's front and rear both follow the path,
     so its body is the chord between the two -- it cuts inside a turn, as
     a truck's rear wheels do, and never swings out. Past either end of
     the path the point carries on straight. */
  const half = lenOf(actor) / 2;
  if (half > CAR.length / 2) {
    const len = pathOf(world, actor)?.length ?? Infinity;
    const end = (s) => {
      const c = Math.max(0, Math.min(len, s)), q = at(c), h = (q.rot * Math.PI) / 180;
      return { x: q.x + Math.cos(h) * (s - c), y: q.y + Math.sin(h) * (s - c), z: q.z ?? 0 };
    };
    /* The front on the path; the rear the point on the path a rigid body's
       length behind it IN A STRAIGHT LINE -- on an arc that is further
       back along the path than the length, since the chord is shorter. */
    /* The tail where this tick put it (`rear`, kept continuous), or found. */
    const f = end(actor.s + half), r = end(actor.rear != null ? actor.s - actor.rear : rearOn(end, actor.s, half));
    p = { ...p, x: (f.x + r.x) / 2, y: (f.y + r.y) / 2, z: ((f.z ?? 0) + (r.z ?? 0)) / 2, rot: (Math.atan2(f.y - r.y, f.x - r.x) * 180) / Math.PI };
  }
  /* A LANE CHANGE IS WHERE THE CAR IS, NOT A STRAY: it is added here, to
     the pose that is drawn and checked for overlap, and deliberately not
     to `strayOf`, which is what the marking sheet reads as lane-keeping.
     A car changing lane is not failing to hold one. The heading turns
     with the move, so the car points across the lane line rather than
     sliding sideways. */
  const lat = actor.lc ? lateralOf(actor.lc, world.t) : 0;
  /* A bus pulling into or out of its bay (buses.js), toward the curb; a
     car going round it (passing.js), the other way. */
  /* FRONT AND BACK EACH ON THE LINE, the chord between them the heading --
     as a truck spans its path through a turn. Rotated about its middle
     instead, a 12 m bus pulling out of a bay swung its nose 1.5 m into the
     oncoming lane and met the bus coming the other way (1 October). */
  const sideOf = actor.kind === "bus" && (actor.bay || actor.busStop?.bay) ? (q) => pullOf(actor, q)
    : actor.pass ? (q) => -passOffset({ ...actor, s: q }) : null;
  const halfL = vehicleOf(actor).length / 2;
  const front = sideOf ? sideOf(actor.s + halfL) : 0, back = sideOf ? sideOf(actor.s - halfL) : 0;
  const pull = sideOf ? (front + back) / 2 : 0;
  const off = strayOf(world, actor) + lat + pull;
  /* THE VEHICLE'S OWN SIZE travels with its pose, so the footprint that is
     checked for contact and the box that is drawn are this vehicle's. */
  const { length, width, height } = vehicleOf(actor);
  if (!off) return { ...p, length, width, height };
  const a = (p.rot * Math.PI) / 180;
  const turn = (lat ? (Math.atan2(lateralRate(actor.lc, world.t), Math.max(1, actor.v ?? 0)) * 180) / Math.PI : 0) + (sideOf ? (Math.atan2(front - back, 2 * halfL) * 180) / Math.PI : 0);
  return { ...p, length, width, height, rot: p.rot + turn, x: p.x - Math.sin(a) * off, y: p.y + Math.cos(a) * off };
}

/* HOW FAR OFF THEIR LINE A DRIVER IS, signed, to the right. The one
   place the steering axis becomes a distance, so the pose that is drawn,
   the pose that is checked for overlap and the deviation the marking
   sheet reads are the same number (DECISIONS.md 0): the weave, and on a
   bend the wide line. */
export function strayOf(world, actor) {
  const me = underLoad(actor, world.road);
  return weaveAt(me, me.s) - wideAt(world, me);
}

/* THE WIDE LINE: THE OTHER HALF OF THE STEERING AXIS, AND IT LIVES ON A
   BEND. A driver who cannot hold a line weaves on a straight road and
   runs wide on a curve -- steers less than the bend asks for and drifts
   toward its outside -- and both are one deficit. The weave's amplitude
   is half the room between a car and the next lane, because the driver
   over there has the same claim on the other half (5.14.4); the wide
   line takes THIS driver's other half, with the same deficit, so at the
   tightest bend the road allows a driver at the worst of the axis puts
   their side of the car on the centre line and no further. Nobody
   touches by construction, and the two together clear the old engine's
   visibility floor where the weave alone cannot -- which is what makes
   lane-keeping markable at all (marking.js).

   ONLY WHERE THE OUTSIDE IS A LANE. On a right-hand bend the outside is
   the oncoming lane and the wide line is a real fault into real space;
   on a left-hand bend it is the curb, and the maintainer's ruling on the
   wide turn (DECISIONS.md 5.8) is that off-road is rare and not this
   model's -- so the wide line declines there, exactly as `wideTurn`
   declines a road with no next lane. Every bow here gives each driver
   one of each, so no bent link is silent.

   AND IT SCALES WITH THE BEND. Full at the radius the road's own speed
   allows (course.js), in proportion on a gentler one, never more than
   the room on a tighter one; zero on a straight and in the box, where the
   turn arcs' radius is still an open question and must not be read as a
   bend (intersection.js, `bendSeenBy`). */
export function wideAt(world, actor) {
  const amp = actor.weave ?? 0;
  if (!amp || !world.course?.radius) return 0;
  const layout = layoutOf(world, actor);
  const k = bendSeenBy(layout.place, layout.paths[actor.route], actor.s);
  if (k <= 0) return 0;
  return amp * Math.min(1, k * world.course.radius);
}

/* THE ONE PROPERTY, same as stage 0 and for the same reason: nobody may
   occupy the same piece of road as anybody else. At an intersection that
   is a real test rather than a formality, because two paths crossing is
   exactly where it could happen. */
/* Do two cars share any tarmac? `cornersOf` and `boxesOverlap` come from
   the geometry rather than being written again here: the question "are
   these two inside each other" is the same one `conflictsBetween` asks of
   two paths, and two implementations of it is the bug this project keeps
   finding.

   A check that reports overlaps where there are none is worse than no
   check, because it trains you to ignore it. */
/* HOW LONG A CRASH STANDS IN THE ROAD before it is cleared: details
   exchanged, the cars moved. A design constant, flagged -- long enough to
   be seen and to back traffic up, short enough that a map does not fill
   with wrecks. */
export const CRASH_CLEAR = 45;

/* Pairs of cars in contact now, among cars that could meet (the neighbour
   index), on the same level; `fresh` when this is not a crash already
   recorded between the same two. The player is left out: the screen tests
   the player with the player's own pose (MapRoad) and calls `crashWith`. */
export function contactsIn(world) {
  const out = [];
  const pose = new Map();
  const poseFor = (a) => { if (!pose.has(a.id)) { const p = poseOf(world, a); pose.set(a.id, { p, box: cornersOf(p) }); } return pose.get(a.id); };
  for (const a of world.actors) {
    if (a.player) continue;
    for (const b of nearNode(world, world.actors, a.k ?? 0)) {
      if (b.player || !(a.id < b.id)) continue;
      const A = poseFor(a), B = poseFor(b);
      const near = Math.max(6, (lenOf(a) + lenOf(b)) / 2 + 1);
      if (Math.abs(A.p.x - B.p.x) > near || Math.abs(A.p.y - B.p.y) > near) continue;
      if (Math.abs((A.p.z ?? 0) - (B.p.z ?? 0)) > 2.0) continue;
      if (!boxesOverlap(A.box, B.box)) continue;
      const known = a.crash?.with === b.id || b.crash?.with === a.id;
      out.push({ a: a.id, b: b.id, at: { x: (A.p.x + B.p.x) / 2, y: (A.p.y + B.p.y) / 2, z: A.p.z ?? 0 }, fresh: !known });
    }
  }
  return out;
}

/* The car the player hit has crashed too: it stops, and it is logged. */
export function crashWith(world, id, at, other = "player") {
  const t = world.t;
  let found = false;
  const actors = world.actors.map((a) => { if (a.id !== id || a.crash) return a; found = true; return { ...a, v: 0, a: 0, crash: { t, with: other, at } }; });
  if (!found) return world;
  return { ...world, actors, crashes: [...(world.crashes ?? []), { t, a: other, b: id, at }].slice(-50) };
}

export function overlapping(world) {
  const out = [];
  const at = world.actors.map((a) => {
    const p = poseOf(world, a);
    return { a, p, box: cornersOf(p) };
  });
  for (let i = 0; i < at.length; i++) {
    for (let j = i + 1; j < at.length; j++) {
      /* TWO CARS ON DIFFERENT LEVELS ARE NOT TOUCHING. The footprint
         test is in plan, and an overpass puts two roads in the same
         plan seven metres apart: every "overlap" on the first map was a
         car on the deck above a car beneath it. More than a car's
         height apart is two levels. */
      if (Math.abs((at[i].p.z ?? 0) - (at[j].p.z ?? 0)) > 2.0) continue;
      if (boxesOverlap(at[i].box, at[j].box)) {
        out.push({
          a: at[i].a.id, b: at[j].a.id,
          apart: Math.hypot(at[i].p.x - at[j].p.x, at[i].p.y - at[j].p.y),
        });
      }
    }
  }
  return out;
}

/* Who is being marked for it, for something that wants to draw or count
   it. Sticky, so a driver who has been late is still late after they go. */
export const delayed = (world) => world.actors.filter((a) => a.delayed);

/* The line-region and rest thresholds, for the marking sheet: whether a
   driver came to rest before a line is judged by the same numbers that
   decide it here. */
export { PX_PER_M, M, CAR, DT, ALL_WAY, TWO_WAY, COMPETENT, UNDUE_AT, AT_REST, AT_LINE, waitAt, radiusFor };
