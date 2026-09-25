/* =====================================================================
   STAGE 0 OF THE REBUILD: one road, cars that follow each other.

   See REBUILD.md. The whole of this stage is one question, and it is a
   question for a person rather than for a check: does traffic that
   queues, closes up and spreads out read as ALIVE? If it does not
   immediately look better than what ships today, the premise is wrong
   and we have spent a day rather than a month finding out.

   So the scope is held hard. One road. Six cars. Following distance.
   No intersections, no candidate, no ratings, no faults, no scoring, no
   camera. Every one of those is a later stage and pulling any of them
   forward is how a rebuild turns into a long silence.

   THE ONE STRUCTURAL RULE THIS FILE EXISTS TO ESTABLISH:

     every actor decides from what it can see of the PREVIOUS committed
     state, and nothing else.

   That is the whole difference from `src/engine/`, where `poseAt(p, t)`
   is a pure function of one participant and the clock, so nobody ever
   looks at anybody while moving. Car-following and yielding could not be
   added there because there was no moment at which a car could decide to
   do either. Here there is a moment, and it is every tick.

   It is also, deliberately, ONE FILE. REBUILD.md section 7.1 says the
   specific way a rewrite fails is by slowly rebuilding the same thing,
   and that stage 0 is protected by having no engine in it: it is
   impossible to accidentally rebuild `schedule()` in a file this size.

   METRES AND SECONDS, NOT PIXELS. The old engine works in pixels and
   converts at the edges; this works in SI and converts only to draw.
   That removes a class of bug for free.
   ===================================================================== */

import { composeDriver, deficitOf, lackingIn, LACKING_AT, severityOf, pressureOf, skillUnderPressure, cautionOf } from "../core/driver.js";
import { rng } from "../core/rng.js";

/* The project's scale, and the one thing here that must agree with the
   old engine while both exist: verify-sim checks it against `M(1)`. */
export const PX_PER_M = 20;
export const M = (m) => m * PX_PER_M;

/* The tick. 0.05s is already this project's resolution floor -- `STEP`
   in the old engine -- so nothing is being made coarser. 20 Hz over an
   80-second drive is 1600 ticks with a dozen actors, which is cheap
   enough to run many times over. That matters later: the controlled
   comparison that derives a fault becomes "run it again with one rating
   changed". */
export const DT = 0.05;

/* ONE ROAD, with traffic flowing along it: cars arrive at one end and
   leave at the other. The camera never moves, which is what keeps camera
   work out of stage 0.

   THIS WAS A LOOP FIRST AND THE LOOP WAS WRONG. Six cars circulating
   settle into a uniform ring at the slowest car's speed and stay there --
   measured, all six at 20 km/h after seven seconds -- so after the first
   transient there is nothing to watch. That is a fact about rings, not
   about the model, and it would have misrepresented the model to
   somebody judging it by eye.

   A stream keeps producing the thing worth seeing: a faster driver
   catches a slower one, closes up, sits behind them, and opens out again
   once they have gone. Close-up AND spread-out, indefinitely. */
export const ROAD = { lanes: 2, laneWidth: 3.6 };

/* HOW MUCH ROAD IS ON SCREEN IS A DURATION, NOT A DISTANCE.

   A distance is right at one speed and wrong at every other: 90m is six
   seconds of road at 60 km/h and three at 100, so the same road that
   reads as a street at one limit reads as a glimpse at the other. The
   old engine reached the same conclusion about its camera -- `LOOK_AHEAD`
   is ten seconds, not a hundred metres -- for the same reason.

   Six seconds is about three times as long as it takes a driver to shed
   an ordinary speed difference (5 m/s at the comfortable braking rate is
   1.9s), so it is long enough to watch one following interaction begin
   and finish. Holding it fixed also holds the number of cars on screen
   fixed -- measured 3.8 to 4.2 from 30 km/h to 100 -- because arrivals
   are drawn in seconds too.

   THE TRADE IT CANNOT ESCAPE: a fixed camera showing a fixed duration
   shows more metres at a higher limit, so the cars get smaller. At 60
   km/h the road is 100m and a car is 27px on a phone; at 100 it is 167m
   and 16px. Showing six cars instead of four would need nine seconds of
   road and take a car at 100 km/h down to 10px. There is no arrangement
   of a FIXED camera that gives both, which is what the chase camera
   exists for and why it is a later stage rather than an oversight. */
export const ON_SCREEN = 6.0;

/* A road at a given limit. The limit is a PARAMETER, not a constant: the
   maintainer needs to try 30, 50, 60 and eventually 100 without a round
   trip through anybody. */
export function roadFor(kmh = 60) {
  const speed = kmh / 3.6;
  return { ...ROAD, kmh, speed, length: speed * ON_SCREEN };
}

export const CAR = { length: 4.5, width: 1.8 };

/* =====================================================================
   THE DECISION MODEL

   The Intelligent Driver Model, which is the standard car-following
   model and is four terms. It is chosen over something hand-rolled for
   one reason that matters at this stage: it does not oscillate. A naive
   "brake if too close, accelerate if too far" produces concertina
   judder that would make the demo unwatchable for reasons having nothing
   to do with whether the idea is right.

   THE CONSTANTS ARE THE PROJECT'S OWN WHERE IT HAS THEM, and where it
   does not they are real-world figures rather than fitted ones. None of
   them has been tuned to make anything look right, and they are the
   first thing to derive properly once this exists -- see REBUILD.md.
   ===================================================================== */

/* A brisk-but-ordinary pull-away. The old engine's `ACCEL`. Exported
   because how long a crossing takes from rest is derived from it. */
export const ACCEL = 2.4;
/* Comfortable braking. The old engine derives 2.70 m/s^2 as the rate
   that brings a car from cruise to rest in the approach run it uses.

   It is the COMFORTABLE rate, not a limit, which is what makes it a
   place the braking axis can land: a driver who brakes badly is not one
   who cannot stop, it is one who plans on stopping harder than is
   comfortable and therefore leaves it later. See `driver`. */
const BRAKE = 2.7;
/* And twice it is where a stop stops being controlled -- the old
   engine's `ABRUPT_AT`, which is derived as double the comfortable rate
   rather than picked. It is the far end of the braking axis here for the
   same reason: the worst braker in the model plans on exactly the
   deceleration an examiner would call abrupt, and no worse. */
const ABRUPT = 2;
/* WHERE A STOP STOPS BEING CONTROLLED, as a rate. Exported because the
   marking sheet has to ask the same question the driver model answers --
   one definition of "abrupt", read in both places. */
export const HARSH_AT = BRAKE * ABRUPT;
/* THE GAP A DRIVER CHOOSES TO LEAVE, which is NOT the same thing as the
   gap they are owed -- and this is the one place stage 0 knowingly parts
   company with the old engine, on the maintainer's instruction to close
   it up for pace.

   `ENTITLED` (= `LOOKAHEAD` = 0.9s) is what the law grants a moving
   vehicle ahead of it, and it is what encroachment is marked against.
   Setting a driver's chosen headway to exactly that put every following
   car permanently ON the fault boundary, which is wrong in both
   directions: a careful driver leaves more, and real traffic routinely
   leaves less.

   So they are two quantities now. THIS ONE IS A CHARACTER NUMBER; the
   entitled gap is a rule and has not moved. The consequence lands at
   stage 4 rather than here: traffic following at 0.7s sits slightly
   inside the gap it is owed, so once encroachment is marked again,
   ordinary following traffic reads as a mild encroachment unless the two
   are reconciled. Flagged rather than solved. */
const HEADWAY = 0.7;
/* Bumper-to-bumper gap at a standstill. A real figure, not derived. */
const STANDSTILL = 2.0;
/* Nobody brakes harder than this. An emergency stop is about 8 m/s^2. */
export const MOST_BRAKE = 8.0;

/* =====================================================================
   Setting up

   SIX CARS THAT ALL WANT TO GO THE SAME SPEED WOULD SPREAD OUT AND NEVER
   INTERACT. What makes a platoon is somebody slower in front, so each
   driver gets their own desired speed. That is the only per-driver
   variation in stage 0 and it is deliberately not the ratings model --
   ratings are stage 2, and putting them here would be exactly the
   scope creep this file is meant to resist.
   ===================================================================== */
/* One driver, drawn from their own seed so the stream is replayable
   however long it runs. The ONLY per-driver variation in stage 0 is how
   fast they want to go -- ratings are stage 2, and putting them here
   would be exactly the scope creep this file exists to resist. */
/* =====================================================================
   EVERY CAR IS A RATED DRIVER, AND THERE IS ONLY ONE DRIVER MODEL.

   The maintainer asked for NPC traits -- "a speeder or a tailgater" --
   and answered it in the same breath: "we are already building something
   like this into our candidates." So this imports `composeDriver` rather
   than growing a second vocabulary beside it.

   That is not tidiness. The old engine HAD two pools and they had already
   drifted: `generate.js` attached driver traits from five, `compose.js`
   from seven, and neither of them was the ratings model. This is the same
   bug declined rather than predicted.

   A SPEEDER AND A TAILGATER ARE THE SAME PERSON IN DIFFERENT SITUATIONS.
   Both are a bold driver -- low caution -- and which one you see depends
   on whether the road ahead is clear. That falls out of mapping one axis
   to both knobs, and it is a better answer than two labels would have
   been.

   ONLY CONFIDENCE HAS ANYTHING TO SAY AT STAGE 0. The other four axes are
   carried on every actor because the model is one model, and they are
   inert until the stages that give them something to do: observation
   needs perception (stage 4), steering needs a lane to hold (stage 2),
   braking needs somewhere to stop (stage 1), knowledge needs a rule to
   know. Carrying them now costs nothing and means nobody has to invent
   them later.
   ===================================================================== */

/* HOW LONG TO COVER `d` METRES, starting at `v` and pulling away at the
   same ACCEL everything else here uses, levelling off at `v0`.

   This is not a new physics model. It is the closed-form answer to the
   question the stepped loop answers numerically, and it exists because
   a driver deciding whether to pull out has to ANTICIPATE -- they need
   how long the crossing will take BEFORE they commit to it, which is not
   something a tick can tell them. Every number in it is one the loop
   already uses, so the two cannot drift.
   ===================================================================== */
export function timeToCover(v, d, v0) {
  if (d <= 0) return 0;
  const cap = Math.max(v0, v);
  const spent = (cap - v) / ACCEL;                     // time spent getting up to speed
  const covered = v * spent + 0.5 * ACCEL * spent * spent;
  if (d <= covered) return (Math.sqrt(v * v + 2 * ACCEL * d) - v) / ACCEL;
  return spent + (d - covered) / cap;
}

/* The whole of confidence in one number lives in core/driver.js. */
export { cautionOf };

/* THE TWO KNOBS THE FOLLOWING MODEL ALREADY HAD, now driven by who the
   driver is rather than by a random number.

   A bold driver wants 1.35x the limit and leaves 0.55x the gap; a timid
   one wants 0.65x and leaves 1.45x; the ordinary majority sit near 1.0 on
   both. At 60 km/h that is 39 to 81 km/h and a headway of 0.39s to
   1.02s. Measured over 300 drawn drivers, `composeDriver` puts 16% in the
   bold tail and 14% in the timid one, which is the mix the maintainer
   asked for arriving from the driver model rather than from a
   distribution written to produce it. */
export function driver(road, seed, n, ratings = null) {
  const who = ratings ? { ratings, weakOn: lackingIn({ ratings }) } : composeDriver(seed * 7919 + n);
  const r = rng(seed * 104729 + n + 1);
  const caution = cautionOf(who.ratings);
  const v0 = wantedSpeed(road.speed, caution);

  /* WHO ROLLS A STOP, and it is two axes rather than one.

     The maintainer's ruling: "rolling stops are a failure to obey the law
     not necessarily a skill issue. a high confidence driver might feel
     strong in their observation that it's clear to go and will disregard
     the stopping portion prematurely." So it is KNOWLEDGE-DOMINANT WITH
     CONFIDENCE A REAL CONTRIBUTOR -- not knowledge alone, and not the
     control failure the old weighting had it as.

     The split within "dominant plus real" is mine and is PROVISIONAL:
     `CAUSES` in ratings.js is the one table this project authors on
     purpose and it is the maintainer's, so the real weighting lands there
     when the fault model is rebuilt. Measured at 0.7/0.3: 16% of drawn
     drivers roll, which is a visible minority rather than a curiosity.
     The threshold is the project's own `LACKING_AT` rather than a new
     number.

     Carried on the driver rather than on the scene, because it is a fact
     about the person. It means nothing on a straight road and everything
     at a stop line. */
  const boldness = Math.max(0, 1 - caution);
  const rollsStops =
    0.7 * deficitOf(who.ratings, "knowledge").deficit + 0.3 * boldness > LACKING_AT;

  /* HOW HARD THEY PLAN ON BRAKING, which is the whole of the braking
     axis and is ONE PARAMETER RATHER THAN A NEW MECHANISM.

     The following model already asks how hard a driver is willing to
     brake -- it is the `b` in the desired-gap term -- and a larger one
     means a smaller gap wanted, so they close in further before doing
     anything about it and then have to brake harder than they meant to.
     That is what a braking fault looks like from outside: not an
     inability to stop, but leaving it late and then standing on it.

     The span is derived rather than chosen. A perfect braker plans on
     the comfortable rate; the worst plans on twice it, which is exactly
     where the old engine's `ABRUPT_AT` says a stop stops being
     controlled. So the axis runs from "comfortable" to "abrupt" and has
     no room to be anything else. */
  const brake = BRAKE * (1 + (ABRUPT - 1) * deficitOf(who.ratings, "braking").deficit);

  /* AND HOW STEADY A LINE THEY HOLD. The steering axis's unambiguous
     fault (CLAUDE.md: only `wander` and `wideTurn` belong to one axis
     without argument), and the one of the two that this geometry can
     express honestly -- a wide turn needs a next lane to be wide INTO,
     and every road here is one lane each way. Deferred rather than
     dropped; see DECISIONS.md.

     THE AMPLITUDE IS THE ROOM THAT EXISTS, not a number, and it is HALF
     the room rather than all of it. A car is 1.8m in a 3.6m lane, so
     there is 0.9m of air on each side -- but the driver in the next lane
     has exactly the same claim on it, so a driver who takes all of it is
     not failing to hold a line, they are taking somebody else's. Half
     each is the most two drivers can both be wrong by and still pass.

     That bound is load-bearing rather than cosmetic. It is what lets the
     conflict geometry stay true of a car that is not on its own
     centreline -- see `weaveRoom` and `conflictsBetween`.

     Held in DISTANCE rather than time so a pose stays a pure function of
     how far along the car is -- the same discipline the paths are under
     -- and so that a driver's weave does not speed up when they do. */
  const weave = weaveRoom(road.lane ?? ROAD.laneWidth) * deficitOf(who.ratings, "steering").deficit;

  /* HOW FAR BEHIND THE WORLD THEY PERCEIVE IT, in seconds: the whole of
     the observation axis (stage 4). Everything here is visible all the
     time, so the old engine's registration delay -- how long after a
     road user appears before this driver has taken them in -- becomes a
     LAG: the driver decides from the world as it was that long ago. A
     good observer is a reaction floor behind; a poor one adds up to the
     old engine's REGISTER_SPAN on top, with its jitter.

     OFF UNLESS THE ROAD SAYS HOW (`road.perceive`), so nothing that ran
     before this moves by a byte, and drawn from its own stream so
     switching it on changes nothing else about the driver either --
     which is what makes lag-on against lag-off a controlled comparison.
     The constants are the old engine's and arrive through the road
     rather than being imported here, because awareness.js drags most of
     the old engine with it and stage 0 stays small. */
  const lag = road.perceive ? lagFor(who.ratings, road.perceive, rng(seed * 7 + n + 3)) : 0;

  return {
    id: `car-${n}`,
    ratings: who.ratings,
    weakOn: who.weakOn,
    caution,
    rollsStops,
    brake,
    weave,
    lag,
    /* Where in the weave they happen to be, so two equally poor drivers
       are not in lockstep. */
    weavePhase: r() * WEAVE_OVER,
    s: 0,
    /* Joining at roughly the speed they want, so nobody enters the road
       accelerating from nothing. */
    v: v0 * (0.85 + r() * 0.15),
    v0,
    /* The gap this one keeps, as a multiple of the road's own. */
    headway: HEADWAY * (0.55 + 0.45 * caution),
    /* How long after this one before the next arrives. Drawn now so the
       schedule is a property of the seed rather than of the clock.

       AND THE DENSITY IS CAPACITY-LIMITED, NOT ARRIVAL-LIMITED, which is
       worth knowing before anybody tries to make the road busier by
       asking for more cars. Swept at three rates: 0.8-2.0s gives 4.0 cars
       on the road at 60 km/h, 0.6-1.6s gives 4.2, 0.5-1.3s gives 4.4.
       Halving the interval buys a tenth of a car, because the spawn gate
       refuses anybody there is no room for and the extra arrivals simply
       queue at the entrance. To show more, show more road -- and that
       costs size on a fixed camera. See ON_SCREEN. */
    arriveIn: 0.6 + r() * 1.0,
  };
}

export function seedTraffic(seed = 1, kmh = 60) {
  /* Start with a road that already has traffic on it, so the first thing
     anybody sees is a street rather than an empty road filling up. Warmed
     for twice the time it takes to drive the length of it, which is long
     enough for the arrivals to have reached the far end and for the first
     platoons to have formed. */
  const road = roadFor(kmh);
  const warm = Math.round((2 * ON_SCREEN) / DT);
  let w = { t: 0, tick: 0, seed, road, spawned: 0, nextAt: 0, actors: [] };
  for (let i = 0; i < warm; i++) w = step(w);
  /* The clock goes back to zero and THE ARRIVAL SCHEDULE COMES WITH IT.
     Zeroing `t` alone left `nextAt` thirty seconds in the future, so the
     road drained and stood empty until the clock caught up -- measured, 0
     cars at t=30s on every seed. */
  return { ...w, t: 0, tick: 0, nextAt: w.nextAt - w.t };
}

/* How far ahead `b` is of `a`. Negative means behind. */
const ahead = (a, b) => b.s - a.s;

/* =====================================================================
   PERCEIVE: what this actor can see of the world as it was last tick.

   Stage 0 sees one thing -- the car in front -- because that is the one
   behaviour being demonstrated. Occlusion, registration delay and
   everything else `sight.js` and `awareness.js` already know how to do
   arrive at stage 4, and they arrive as INPUTS TO THIS FUNCTION rather
   than as a separate layer bolted alongside.
   ===================================================================== */
export function perceive(me, world) {
  let leader = null, gap = Infinity;
  for (const other of world.actors) {
    if (other.id === me.id) continue;
    const d = ahead(me, other) - CAR.length;
    if (d >= 0 && d < gap) { gap = d; leader = other; }
  }
  return { leader, gap };
}

/* =====================================================================
   DECIDE: an acceleration, from that view alone.

   No reference to the world's clock, to a schedule, or to anybody's
   plan. This function is the entire reason the rebuild exists.
   ===================================================================== */
/* The gap this driver wants right now: their standstill gap, plus the
   road they claim ahead at this speed, plus extra while they are closing
   on somebody. Exported because anything asking "was that car actually
   following?" has to ask against the same number the driver used, not a
   second opinion about what close means. */
/* THE MOST ANYBODY MAY BE OFF THEIR OWN LINE. Exported because two
   different files need it to agree: the driver model, which decides how
   far a poor steerer strays, and the intersection geometry, which has to
   know how far ANYBODY could stray before it can say which paths
   interact. Two numbers here would be two answers to one question, and
   the symptom would be a pair of cars overlapping in a place the
   conflict table says they never meet -- which is exactly how this was
   found. */
export const weaveRoom = (lane) => (lane - CAR.width) / 4;

/* =====================================================================
   A LOADED DRIVER IS A WORSE DRIVER

   The maintainer's ruling, and the other half of `directions.js`, which
   stage 3 brought across only as far as the sheet reads it. Stacking
   instructions is a trade: calling ahead buys the candidate time and
   buys the examiner attention back, and it costs the candidate's
   concentration. Without this half the "stacked" verdict is a label
   with nothing behind it, which is exactly how the old drive's stacking
   meter shipped inert.

   WHAT IS HELD is every instruction beyond the one being executed. The
   one for the next intersection is discharged at the handoff into it, so
   it is never carried; the ones for the intersections after that are.
   Told three ahead, a candidate carries two.

   HOW MUCH IT COSTS is the old engine's own curve, imported rather than
   restated: pressure per instruction held, composure lost under it, and
   the severity multiplier on the size of whatever a driver gets wrong.
   Applied here to the DEFICIT on each axis -- the weave, the planned
   braking, and how far caution sits from the competent optimum -- so a
   loaded driver's weaknesses are the same weaknesses, larger. A sound
   driver has nothing to amplify and is unmoved, which is the old engine's
   property too: skill decides how badly a habit shows, never which
   habits a driver has.

   Each is still bounded by what bounded it unloaded. The weave cannot
   exceed the room between lanes, braking cannot plan past abrupt, and
   caution cannot leave the axis; so a heavy-footed driver under full
   load plans on exactly the rate an examiner calls abrupt, and a bend
   driven under load runs no wider than the centre line.

   LIVE, NOT FROZEN PER LEG. The old drive froze load at the start of a
   leg because reading it live would have re-simulated the intersection
   under the candidate. A stepped world has no such problem: the loaded
   disposition is read every tick from what is held right now, so the
   cost lands on the driving done while holding it and lifts when the
   instruction is discharged. One honest artifact: the weave's amplitude
   changes in the tick an instruction is given, which steps the car
   sideways by at most the amplitude change times the phase -- 16cm for
   the worst steerer told two ahead at once -- and verify-course measures
   it rather than hiding it.

   The unloaded case returns the actor itself, so nothing about a driver
   with nothing held has moved by a byte.
   ===================================================================== */
/* The lag a driver perceives the world behind by. The old engine's
   `registrationDelay`, shape for shape: a floor everybody has, a span the
   observation deficit buys, and a jitter so two equally poor observers
   are not in lockstep. */
export function lagFor(ratings, { floor, span, jitter = 0 }, r) {
  const { deficit } = deficitOf(ratings, "observation");
  if (deficit <= 0) return floor;
  const wobble = 1 + (r() - 0.5) * 2 * jitter;
  return floor + deficit * span * wobble;
}

export const heldBy = (me) =>
  (me.plan ?? []).slice((me.leg ?? 0) + 2).filter((x) => x != null).length;

export function underLoad(me, road) {
  /* Idempotent: a view is never loaded twice, however many hands it
     passes through in one tick. */
  if (me.held != null) return me;
  const held = heldBy(me);
  if (!held) return me;
  const composure = skillUnderPressure(1, pressureOf(held));
  const sev = severityOf({ skill: composure });
  const caution = Math.min(2, Math.max(0, 1 + (me.caution - 1) * sev));
  return {
    ...me,
    held, composure,
    caution,
    v0: wantedSpeed(road.speed, caution),
    headway: HEADWAY * (0.55 + 0.45 * caution),
    brake: Math.min(BRAKE * ABRUPT, BRAKE + (me.brake - BRAKE) * sev),
    weave: Math.min(weaveRoom(road.lane ?? ROAD.laneWidth), (me.weave ?? 0) * sev),
  };
}

/* HOW FAST THIS DRIVER WANTS TO GO. One expression, because three
   different places need it and two of them are not the driver model:
   how long a crossing takes for the slowest driver, and how much road
   the fastest one needs to stop in. A second copy of "1.35" would be the
   recurring bug in its plainest form. */
export const wantedSpeed = (roadSpeed, caution) => roadSpeed * (1.35 - 0.35 * caution);

/* AND HOW MUCH ROAD IT TAKES THEM TO STOP, at the comfortable rate. The
   mirror of `timeToCover` and it exists for the same reason: a driver
   has to be able to anticipate, and an approach has to be long enough to
   be an approach. */
export const stoppingRoom = (v) => (v * v) / (2 * BRAKE);

/* ONE WEAVE PER WAVELENGTH, and the wavelength is a real one: about
   three and a half seconds at 60 km/h, which is the pace of a driver
   correcting, losing it, and correcting again. Faster than that reads as
   a fault in the renderer rather than in the driver. */
export const WEAVE_OVER = 55;
export const weaveAt = (me, s) =>
  (me.weave ?? 0) * Math.sin(((s + (me.weavePhase ?? 0)) / WEAVE_OVER) * 2 * Math.PI);

export function wantedGap(me, leader) {
  const closing = me.v - leader.v;
  /* THIS DRIVER'S OWN HEADWAY, not the road's. A tailgater's desired gap
     really is smaller, which is what makes them visibly a tailgater
     rather than a car that happens to be close. */
  const t = me.headway ?? HEADWAY;
  /* AND THIS DRIVER OWN WILLINGNESS TO BRAKE, for the same reason. */
  const b = me.brake ?? BRAKE;
  return STANDSTILL
    + Math.max(0, me.v * t + (me.v * closing) / (2 * Math.sqrt(ACCEL * b)));
}

/* EXPORTED because stage 1 uses the same decision. A driver deciding
   what to do about an intersection is not doing something different from
   a driver deciding what to do about the car in front -- both are "how
   fast may I go, given the nearest thing in my way". Two copies of this
   would be two answers to one question. */
export function decide(me, view) {
  const free = 1 - Math.pow(me.v / me.v0, 4);
  if (!view.leader) return ACCEL * free;
  const gap = Math.max(view.gap, 0.1);
  return Math.max(-MOST_BRAKE, ACCEL * (free - Math.pow(wantedGap(me, view.leader) / gap, 2)));
}

/* =====================================================================
   One tick. Pure: state in, state out, nothing mutated.

   PERCEIVE AND DECIDE READ THE PREVIOUS COMMITTED STATE; INTEGRATE
   WRITES THE NEXT. So no actor ever sees another half-updated, the order
   they are stepped in cannot matter, and the result is deterministic
   without anybody having to think about it.
   ===================================================================== */
export function step(world) {
  const next = world.actors
    .map((me) => {
      /* A player at the wheel is an actor everybody else perceives and
         follows, but nobody decides for: the screen integrates it from
         the controls and writes it in before each tick (iso/world.js).
         Its owner wraps it at the road's end, so it is never filtered. */
      if (me.player) return me;
      const a = decide(me, perceive(me, world));
      const v = Math.max(0, me.v + a * DT);
      return { ...me, v, a, s: me.s + v * DT };
    })
    /* Off the end of the road, and gone. */
    .filter((me) => me.player || me.s <= world.road.length + CAR.length);

  const t = world.t + DT;
  let { spawned, nextAt } = world;
  /* ARRIVALS ARE A PROPERTY OF THE SEED, not of the clock, so the same
     seed produces the same stream however it is stepped. A new car is
     only let on if there is actually room for it -- otherwise the queue
     would be fed by the spawner rather than by the traffic. */
  if (t >= nextAt) {
    const car = driver(world.road, world.seed, spawned);
    const last = next.reduce((lo, a) => (a.s < lo.s ? a : lo), { s: Infinity, v: Infinity });
    /* ROOM MEANS THE GAP THIS DRIVER WOULD ACTUALLY WANT, asked of the
       same expression they will use a tick later -- including the closing
       term, because a car joining at 60 behind one doing 40 needs far
       more room than the raw headway says.

       The first version left out the closing term and used a hand-written
       sum instead. It produced cars materialising inside their own
       stopping distance, and the tell was unmistakable: worst braking
       pinned at exactly -8.0 m/s^2, the emergency-stop clamp, at EVERY
       speed limit including 30 km/h. A number that is exactly saturated
       is a statement about the measurement, not about the traffic
       (DECISIONS.md 10.0). */
    if (last.s - CAR.length > wantedGap(car, last)) {
      next.push(car);
      spawned += 1;
      nextAt = t + car.arriveIn;
    }
  }
  return { ...world, t, tick: world.tick + 1, spawned, nextAt, actors: next };
}

/* Run n ticks. Used by the screen to catch up after a frame, and by the
   check to walk a whole run. */
export function run(world, ticks) {
  let w = world;
  for (let i = 0; i < ticks; i++) w = step(w);
  return w;
}

/* =====================================================================
   Where a car is, for something that draws.

   The road is straight and vertical, s increasing UP the screen, so this
   is the whole of the geometry at stage 0. It is a separate function
   from the simulation on purpose: the sim knows distance along a road,
   and only this knows which way that road points.
   ===================================================================== */
export function poseOf(actor) {
  return {
    /* THE RIGHT-HAND LANE. Travel is up the screen, so the driver's right
       is +x. Stage 0 uses one lane of a two-lane street and leaves the
       oncoming one empty -- lane CHOICE is a later stage, but a car has
       to be somewhere real, and a single-track ribbon does not read as a
       street. */
    x: ROAD.laneWidth / 2 + weaveAt(actor, actor.s),
    y: -actor.s,
    rot: -90,
    v: actor.v,
  };
}

/* THE ONE PROPERTY STAGE 0 HAS TO HAVE. Every structural defect the
   rebuild exists to fix violates it, it is impossible to satisfy by
   accident, and if it ever needs weakening that is the old architecture
   growing back. See REBUILD.md section 7.1. */
export function overlapping(world) {
  const out = [];
  const cars = [...world.actors].sort((a, b) => a.s - b.s);
  for (let i = 1; i < cars.length; i++) {
    const d = cars[i].s - cars[i - 1].s;
    if (d < CAR.length) {
      out.push({ a: cars[i - 1].id, b: cars[i].id, overlap: CAR.length - d });
    }
  }
  return out;
}
