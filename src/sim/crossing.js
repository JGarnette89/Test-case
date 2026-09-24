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
  CAR, DT, PX_PER_M, M,
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
import { onRightOf, oncoming, graphOf, edgesOfGraph, poseOnGraph, postedAt } from "./graph.js";
import { controlUnder, lightAt } from "./signal.js";
import { laneStep, lateralOf, lateralRate, changing } from "./lanechange.js";
import { rng } from "../engine/index.js";
import { REACTION_FLOOR } from "../engine/score.js";
import { REGISTER_FLOOR, REGISTER_SPAN, JITTER } from "../engine/awareness.js";

/* =====================================================================
   PERCEPTION, STAGE 4: THE WORLD AS THIS DRIVER HAS TAKEN IT IN

   Layer 2 (DECISIONS.md 3): what the candidate REGISTERED, as distinct
   from what happened. In the old engine that was a query after the fact
   -- a registration delay per road user, and a departure decided on the
   set the driver had taken in. Here it is the actor's actual input: a
   driver decides from the world as it was `lag` seconds ago, so a poor
   observer pulls out on a gap that has since closed and brakes for a
   leader that slowed a moment back, and neither is scripted.

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
export function seenBy(world, me) {
  const back = Math.round((me.lag ?? 0) / DT);
  if (!back || !world.past?.length) return world.actors;
  return world.past[Math.min(back, world.past.length) - 1];
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
const restFor = (me) => (me.rollsStops ? ROLLING : AT_REST);

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
function controlOf(actor, layout, path, t = 0) {
  const standing = layout.place.control[path.from];
  if (!layout.signal) return standing === "stop" ? "stop" : "none";
  return controlUnder(layout.signal, layout.legs[path.from]?.base, path.intent, t, {
    v: actor.v ?? 0,
    toLine: waitAt(path) - (actor.s ?? 0),
    standing,
  });
}

/* Does this leg stop -- a sign, a red, or an amber this driver can
   still make? Control is per leg, so one intersection shape is an
   all-way stop or a two-way stop depending only on this. */
const stops = (layout, path, actor = null, t = 0) => (actor ? controlOf(actor, layout, path, t) !== "none" : layout.place.control[path.from] === "stop");

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
const waitAt = (path) => path.stopAt - CAR.length / 2;

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
  return timeToCover(me.v, run, me.v0) * (1 + caution);
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
  const reach = (meet.a - them.s) / Math.max(them.v, 0.5);
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
  if (them.s > hit.clearOf + CAR.length / 2) return false;

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

  const iStop = stops(layout, mine, me, t), theyStop = stops(layout, theirs, them, t);

  /* NEITHER OF US STOPS. Nobody has an arrival order to appeal to, so
     the standing rules do the work. Left-yields-to-oncoming comes FIRST
     here rather than last, and that is a real difference from the
     all-way stop rather than a shortcut: at a stop, arriving first earns
     you the intersection even if you are turning left, because the
     ordering is made of stops. With nobody stopping there is no such
     ordering, and a left turn yields to the oncoming whether it got
     there first or not. */
  if (!iStop && !theyStop) {
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
    const head = leftYields(mine, theirs, layout);
    if (head === false) return false;
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
  return !world.actors.some((a) => a.id !== me.id && blockedBy(me, a, layout, caution, world.t ?? 0));
}

/* What is in this driver's way: the nearest of the car in front and the
   line they are not allowed past yet. Both come back in the shape
   `decide` already understands, so nothing downstream knows the
   difference between a queue and a right-of-way. */
export function whatStops(me, world) {
  const layout = layoutOf(world, me);
  const mine = layout.paths[me.route];
  let leader = null, gap = Infinity;

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
  const others = seenBy(world, me);
  for (const them of others) {
    if (them.id === me.id) continue;
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
        const d = on.along - my.along - CAR.length;
        if (d >= 0 && d < gap) { gap = d; leader = them; }
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
    if (shareLane && them.s > me.s) {
      const d = them.s - me.s - CAR.length;
      if (d < gap) { gap = d; leader = them; }
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
      if (theirLeft < myLeft && me.s > mine.clearAt - CAR.length) {
        const d = myLeft - theirLeft - CAR.length;
        if (d < gap) { gap = d; leader = them; }
      }
    }
  }

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

  const short = !me.going && me.s < waitAt(mine) + AT_LINE && me.s < mine.clearAt;
  const held = short && others.some((a) => a.id !== me.id && blockedBy(me, a, layout, me.caution, world.t ?? 0));
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
      const d = waitAt(mine) - me.s;
      /* A stationary obstacle exactly where the driver must not pass. */
      if (d < gap) { gap = d; leader = { id: "line", v: 0, headway: me.headway }; }
    }
  }
  return { leader, gap, held, queued, hold: short && under === "hold" };
}

/* =====================================================================
   The tick. Same four phases as stage 0, and the same order: perceive
   and decide from the PREVIOUS committed state, integrate, commit.
   ===================================================================== */
export function step(world) {
  const next = world.actors
    .map((raw) => {
      /* A PLAYER AT THE WHEEL is an actor everybody else perceives,
         yields to and follows, but nobody decides for: the screen
         steps them from the controls and writes them in before each
         tick (sim/drive.js), and hands them on at the seam itself. */
      if (raw.player) return raw;
      /* THE DRIVER AS THEY ARE RIGHT NOW: their disposition under
         whatever instructions they are carrying (traffic.js,
         `underLoad`). Decided from, never written back -- the actor keeps
         its unloaded self, and the load is re-read every tick. */
      const me = underLoad(raw, world.road);
      const view = whatStops(me, world);
      const a = decide(me, view);
      const v = Math.max(0, me.v + a * DT);
      const s = me.s + v * DT;
      const mine = pathOf(world, me);
      /* WHEN THEY STOPPED, remembered because the queue at an all-way
         stop is made of arrival order and nothing else can reconstruct
         it after the fact. */
      const atLine = Math.abs(s - waitAt(mine)) < AT_LINE;
      const stoppedAt = me.stoppedAt ?? (v < restFor(me) && atLine ? world.t : null);
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
      const going = me.going || accepted || (stoppedAt != null && v > LAUNCHED);

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
      const at = { ...raw, v, s, stoppedAt, going, accepted };
      const sitting = stoppedAt != null && !going;
      /* How long the opening in front of them has been there this time,
         and -- latched -- when the first one they could have acted on
         appeared. */
      const openFor = sitting && !view.queued && openTo(at, world, COMPETENT)
        ? (me.openFor || 0) + DT : 0;
      const openedAt = me.openedAt ?? (openFor >= REACTION_FLOOR ? world.t : null);
      const waited = sitting && openedAt != null ? world.t - openedAt : (me.waited || 0);
      const out = { ...at, a, accepted, openFor, openedAt, waited, delayed: me.delayed || waited > UNDUE_AT };
      /* LANE CHANGES (lanechange.js): only where a leg has more than one
         lane, so every course the sim had before is untouched. Decided
         from `raw` for who they are -- the ratings, the caution -- and
         from the tick's own view for what is in front of them. */
      return world.course.graph && world.laneChanges !== false ? laneStep(world, { ...raw, v: me.v }, out, view) : out;
    })
    /* AND OFF THE END OF ONE PATH IS THE START OF THE NEXT, rather than
       the end of the world. The two intersections are placed so those are
       the same metre (course.js), so a car crossing the boundary keeps
       its speed, its place in the queue and whoever it was following --
       it is the SAME CAR, which is the whole of what this stage adds.

       A leg with nothing beyond it is still the edge of the world, and a
       course of one intersection is made entirely of those. */
    .map((me) => {
      if (me.player || me.s <= pathOf(world, me).length) return me;
      const on = nextFor(world.course, me.k ?? 0, me.route, (k, side) => routeFor(world, me, k, side));
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
      return {
        ...me, k: on.k, route: on.route, s: 0,
        ...(posted == null ? {} : { v0: wantedSpeed(posted, me.caution) }),
        /* How many intersections they have been through, which is what a
           plan is indexed by and what a section of a drive is counted
           in. Everybody carries it, not only a candidate. */
        leg: (me.leg ?? 0) + 1,
        stoppedAt: null, going: false, accepted: false,
        openFor: 0, openedAt: null,
        lc: null,   // a lane change finishes before the line; never carried over a seam
      };
    })
    .filter(Boolean);

  const t = world.t + DT;
  let { spawned, nextAt, turnedAway = 0 } = world;
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
    const car = arriving(world, spawned);
    const joining = joinAt(world, next, car);
    if (joining) {
      next.push(joining);
      spawned += 1;
      nextAt = t + (topUp ? FILL : car.arriveIn);
    } else if (topUp) {
      /* No room on that leg this instant: try another next time. Not an
         arrival turned away, because nobody was arriving -- the map is
         only short of a car. */
      spawned += 1;
      nextAt = t + FILL;
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
      nextAt = t + car.arriveIn;
    }
  }
  /* What the world remembers of itself, for drivers who perceive it
     late. Only with perception on: a world without it keeps nothing. */
  const past = world.road.perceive
    ? [world.actors, ...(world.past ?? [])].slice(0, LAG_TICKS)
    : world.past;
  return { ...world, t, tick: world.tick + 1, spawned, nextAt, turnedAway, actors: next, ...(past ? { past } : {}) };
}

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
  const room = behind.s - CAR.length;
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
  const layout = world.course.at[k].layout;
  const routes = layout.routesFrom(side);
  if (me.plan) {
    const want = me.plan[(me.leg ?? 0) + 1] ?? "straight";
    return routes.find((r) => layout.paths[r].intent === want) ?? routes.find((r) => layout.paths[r].intent === "straight") ?? routes[0];
  }
  const r = rng(world.seed * 96181 + (me.n ?? 0) * 7919 + k + 1);
  return routes[Math.floor(r() * routes.length) % routes.length];
}

/* A driver, on a leg, with somewhere to be. The person comes from stage
   0's `driver` -- the same five ratings the candidate is drawn from -- and
   only the route is new. */
function arriving(world, n) {
  const r = rng(world.seed * 31337 + n + 1);
  /* Traffic perceives the present unless perception is for everybody. */
  const base = world.road.perceive?.who === "all" ? world.road : { ...world.road, perceive: null };
  const where = edgeFor(world.course, r());
  /* The route out of that leg, drawn from the routes it offers: on the
     compass those are the three intents in INTENTS order, so the draw
     is the one it always was. */
  const routes = world.course.at[where.k].layout.routesFrom(where.side);
  const route = routes[Math.floor(r() * routes.length) % routes.length];
  /* A car enters the world already driving to the limit of the road it
     enters on, not to the map's fastest. Drawn BEFORE the driver so
     `driver` derives `v0` from it once, rather than deriving it from
     one number and having it corrected a line later -- two
     implementations of one quantity is the recurring bug here. */
  const posted = world.road.posted ? postedAt(world.course, where.k, route) : null;
  const road = posted == null ? base : { ...base, speed: posted, kmh: Math.round(posted * 3.6) };
  const who = driver(road, world.seed, n);
  return {
    ...who,
    n,
    k: where.k,
    route,
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
  };
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
export function seedGraph(seed = 1, kmh = 50, loaded, { every = 1.1, control = null, perceive = false, posted = false, target = null, laneChanges = true } = {}) {
  const course = graphOf(loaded, { lane: 3.6, control });
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
  const w = { t: 0, tick: 0, seed, road, course, layout, every, target, laneChanges, spawned: 0, nextAt: 0, actors: [] };
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

/* Run a fresh world until it has traffic on it, then put the clock
   back to zero -- moving everything that is on that clock. A world
   with a target is warmed until it is nearly full rather than for a
   fixed time, capped so a target the map cannot hold still returns. */
function warmed(w0, acrossIt) {
  let w = w0;
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
  const { past: _warm, ...rebased } = w;
  return {
    ...rebased, t: 0, tick: 0, nextAt: Math.max(0, w.nextAt - shift),
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
export function poseOf(world, actor) {
  /* On a map the pose has a height, from the road's own profile. */
  const p = world.course.graph
    ? poseOnGraph(world.course, actor.k ?? 0, actor.route, actor.s)
    : poseOn(world.course, actor.k ?? 0, actor.route, actor.s);
  /* A LANE CHANGE IS WHERE THE CAR IS, NOT A STRAY: it is added here, to
     the pose that is drawn and checked for overlap, and deliberately not
     to `strayOf`, which is what the marking sheet reads as lane-keeping.
     A car changing lane is not failing to hold one. The heading turns
     with the move, so the car points across the lane line rather than
     sliding sideways. */
  const lat = actor.lc ? lateralOf(actor.lc, world.t) : 0;
  const off = strayOf(world, actor) + lat;
  if (!off) return p;
  const a = (p.rot * Math.PI) / 180;
  const turn = lat ? (Math.atan2(lateralRate(actor.lc, world.t), Math.max(1, actor.v ?? 0)) * 180) / Math.PI : 0;
  return { ...p, rot: p.rot + turn, x: p.x - Math.sin(a) * off, y: p.y + Math.cos(a) * off };
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
