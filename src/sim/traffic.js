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
export const ROAD = {
  length: 90,
  lanes: 2,
  laneWidth: 3.6,
  /* THE ROAD'S OWN SPEED, and it is the maintainer's call on pace rather
     than a figure derived from anything: 60 km/h. The old engine's roads
     ran at 30 to 50 and the drive read as a crawl. */
  speed: 60 / 3.6,
};

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

/* A brisk-but-ordinary pull-away. The old engine's `ACCEL`. */
const ACCEL = 2.4;
/* Comfortable braking. The old engine derives 2.70 m/s^2 as the rate
   that brings a car from cruise to rest in the approach run it uses. */
const BRAKE = 2.7;
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
const MOST_BRAKE = 8.0;

/* mulberry32, the same reproducible draw the old engine uses. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
/* HOW FAST THIS ONE WANTS TO GO, as a share of the road's own speed.

   Maintainer's call, and it is about pace rather than about realism:
   most drivers sit near the limit, and a real minority are EXCESSIVELY
   slow or excessively fast. The tails are not decoration -- a bunched
   distribution gives everybody roughly the same speed, so nobody ever
   catches anybody and there is no following to watch. The outliers are
   what make the road worth looking at.

   Rolled once per driver from their own seed, so the stream replays
   however long it runs. */
function wants(r) {
  const roll = r();
  if (roll < 0.12) return 0.55 + r() * 0.25;   // 33-48 km/h, holding people up
  if (roll > 0.88) return 1.15 + r() * 0.25;   // 69-84 km/h, coming up behind
  return 0.85 + r() * 0.22;                    // 51-73 km/h, ordinary
}

function driver(seed, n) {
  const r = rng(seed * 7919 + n);
  const v0 = ROAD.speed * wants(r);
  return {
    id: `car-${n}`,
    s: 0,
    /* Arriving at roughly the speed they want, so nobody joins the road
       accelerating from nothing. */
    v: v0 * (0.85 + r() * 0.15),
    v0,
    /* How long after this one before the next arrives. Drawn now so the
       schedule is a property of the seed rather than of the clock.

       SWEPT RATHER THAN PICKED, against how much following it produces:
       0.9-2.7s gives 4.1 cars on the road and somebody following 44% of
       the time, 0.8-2.0s gives 5.1 and 56%, 0.7-1.7s gives 5.6 and 60%.
       The middle one is the road that is busy enough to watch without
       being a permanent queue. */
    headway: 0.8 + r() * 1.2,
  };
}

export function seedTraffic(seed = 1) {
  /* Start with a road that already has traffic on it, so the first thing
     anybody sees is a street rather than an empty road filling up. Warmed
     for twice the time it takes to drive the length of it, which is long
     enough for the arrivals to have reached the far end and for the first
     platoons to have formed. */
  const warm = Math.round((2 * ROAD.length) / ROAD.speed / DT);
  let w = { t: 0, tick: 0, seed, spawned: 0, nextAt: 0, actors: [] };
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
export function wantedGap(me, leader) {
  const closing = me.v - leader.v;
  return STANDSTILL
    + Math.max(0, me.v * HEADWAY + (me.v * closing) / (2 * Math.sqrt(ACCEL * BRAKE)));
}

function decide(me, view) {
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
      const a = decide(me, perceive(me, world));
      const v = Math.max(0, me.v + a * DT);
      return { ...me, v, a, s: me.s + v * DT };
    })
    /* Off the end of the road, and gone. */
    .filter((me) => me.s <= ROAD.length + CAR.length);

  const t = world.t + DT;
  let { spawned, nextAt } = world;
  /* ARRIVALS ARE A PROPERTY OF THE SEED, not of the clock, so the same
     seed produces the same stream however it is stepped. A new car is
     only let on if there is actually room for it -- otherwise the queue
     would be fed by the spawner rather than by the traffic. */
  if (t >= nextAt) {
    const car = driver(world.seed, spawned);
    const last = next.reduce((lo, a) => (a.s < lo.s ? a : lo), { s: Infinity });
    if (last.s > CAR.length + STANDSTILL + car.v * HEADWAY) {
      next.push(car);
      spawned += 1;
      nextAt = t + car.headway;
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
    x: ROAD.laneWidth / 2,
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
