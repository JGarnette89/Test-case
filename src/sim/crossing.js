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
import { decide, wantedGap, driver, CAR, DT, PX_PER_M, M } from "./traffic.js";
import {
  layoutFor, poseAt, rightOf, OPPOSITE, SIDES, INTENTS,
} from "./intersection.js";
import { rng } from "../engine/index.js";

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
   MUST I WAIT FOR THIS ONE?

   Asked of one driver about one other, every tick, from what is visible.
   Order matters and follows the law:

     1. Do our paths even cross? If not there is nothing to discuss --
        which is how two cars going straight from opposite legs pass each
        other with no rule needing to say so.
     2. Have they already gone past the point where we would meet?
     3. Are they in the box? Then they finish; you do not drive into
        somebody who is already committed.
     4. Otherwise we are both waiting, and whoever stopped first goes.
     5. Arrived together: a left turn yields to the oncoming, and
        everything else yields to the car on the right.
   ===================================================================== */
export function blockedBy(me, them, layout) {
  const hit = layout.conflicts[`${me.route}|${them.route}`];
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
     metres it has left. */
  if (them.going || them.s >= theirs.stopAt) return true;
  if (me.going || me.s >= mine.stopAt) return false;

  /* Both still on the approach. Anybody who has not stopped yet has no
     claim at all -- at an all-way stop the queue is made of people who
     have actually stopped. */
  if (them.stoppedAt == null) return false;
  if (me.stoppedAt == null) return true;

  if (them.stoppedAt < me.stoppedAt - SAME_MOMENT) return true;
  if (me.stoppedAt < them.stoppedAt - SAME_MOMENT) return false;

  /* Arrived together. A LEFT TURN YIELDS TO THE ONCOMING -- head to
     head, the one crossing the other's path gives way. */
  if (mine.intent === "left" && theirs.from === OPPOSITE[mine.from]
      && theirs.intent !== "left") return true;
  if (theirs.intent === "left" && mine.from === OPPOSITE[theirs.from]
      && mine.intent !== "left") return false;

  /* And otherwise the car on the right. */
  return rightOf(mine.from) === theirs.from;
}

/* What is in this driver's way: the nearest of the car in front and the
   line they are not allowed past yet. Both come back in the shape
   `decide` already understands, so nothing downstream knows the
   difference between a queue and a right-of-way. */
export function whatStops(me, world) {
  const layout = world.layout;
  const mine = layout.paths[me.route];
  let leader = null, gap = Infinity;

  for (const them of world.actors) {
    if (them.id === me.id) continue;
    const theirs = layout.paths[them.route];

    /* THE CAR IN FRONT ON MY OWN APPROACH. Same leg, same lane, so this
       is stage 0's queue arriving unchanged. */
    if (theirs.from === mine.from && them.s > me.s) {
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
     across would be worse than one that never yielded. */
  if (!me.going && me.s < waitAt(mine) + AT_LINE && me.s < mine.clearAt) {
    const waiting = !me.stoppedAt || world.actors.some((t) => t.id !== me.id && blockedBy(me, t, layout));
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
  return { leader, gap };
}

/* =====================================================================
   The tick. Same four phases as stage 0, and the same order: perceive
   and decide from the PREVIOUS committed state, integrate, commit.
   ===================================================================== */
export function step(world) {
  const next = world.actors
    .map((me) => {
      const a = decide(me, whatStops(me, world));
      const v = Math.max(0, me.v + a * DT);
      const s = me.s + v * DT;
      const mine = world.layout.paths[me.route];
      /* WHEN THEY STOPPED, remembered because the queue at an all-way
         stop is made of arrival order and nothing else can reconstruct
         it after the fact. */
      const atLine = Math.abs(s - waitAt(mine)) < AT_LINE;
      const stoppedAt = me.stoppedAt ?? (v < AT_REST && atLine ? world.t : null);
      /* Under way from the line, and past the point of thinking better of
         it. `LAUNCHED` is well above the "stopped" threshold so that a car
         inching forward has not committed to anything. */
      const going = me.going || (stoppedAt != null && v > LAUNCHED);
      return { ...me, v, a, s, stoppedAt, going };
    })
    .filter((me) => me.s <= world.layout.paths[me.route].length);

  const t = world.t + DT;
  let { spawned, nextAt, turnedAway = 0 } = world;
  if (t >= nextAt) {
    const car = arriving(world, spawned);
    const behind = next
      .filter((a) => world.layout.paths[a.route].from === world.layout.paths[car.route].from)
      .reduce((lo, a) => (a.s < lo.s ? a : lo), { s: Infinity, v: Infinity });
    if (behind.s - CAR.length > wantedGap(car, behind)) {
      next.push(car);
      spawned += 1;
      nextAt = t + car.arriveIn;
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
  return { ...world, t, tick: world.tick + 1, spawned, nextAt, turnedAway, actors: next };
}

/* A driver, on a leg, with somewhere to be. The person comes from stage
   0's `driver` -- the same five ratings the candidate is drawn from -- and
   only the route is new. */
function arriving(world, n) {
  const r = rng(world.seed * 31337 + n + 1);
  const who = driver(world.road, world.seed, n);
  const from = SIDES[Math.floor(r() * SIDES.length) % SIDES.length];
  const intent = INTENTS[Math.floor(r() * INTENTS.length) % INTENTS.length];
  return {
    ...who,
    route: `${from}/${intent}`,
    s: 0,
    stoppedAt: null,
    going: false,
    /* THE INTERSECTION SETS ITS OWN DEMAND rather than borrowing the
       straight road's. The maintainer wants this run as a stress test --
       "cars that just keep coming, so we can prove our right of way
       ordering stays consistent" -- and a rate tuned for one road is not
       a rate that saturates four approaches. */
    arriveIn: world.every * (0.6 + r() * 0.8),
  };
}

export function seedCrossing(seed = 1, kmh = 50, { every = 1.1 } = {}) {
  const layout = layoutFor();
  const road = { kmh, speed: kmh / 3.6, lane: layout.place.lane };
  let w = { t: 0, tick: 0, seed, road, layout, every, spawned: 0, nextAt: 0, actors: [] };
  /* Warmed until the approaches have traffic on them and the first cars
     have had to take turns. */
  const warm = Math.round(40 / DT);
  for (let i = 0; i < warm; i++) w = step(w);
  return { ...w, t: 0, tick: 0, nextAt: Math.max(0, w.nextAt - w.t) };
}

export function run(world, ticks) {
  let w = world;
  for (let i = 0; i < ticks; i++) w = step(w);
  return w;
}

/* Where a car is, for something that draws. */
export function poseOf(world, actor) {
  return poseAt(world.layout.paths[actor.route], actor.s);
}

/* THE ONE PROPERTY, same as stage 0 and for the same reason: nobody may
   occupy the same piece of road as anybody else. At an intersection that
   is a real test rather than a formality, because two paths crossing is
   exactly where it could happen. */
/* Do two cars share any tarmac? A DISTANCE THRESHOLD CANNOT ANSWER THIS
   and the first version of this check used one, which was wrong in both
   directions: two cars side by side in opposite lanes are 3.6m apart and
   perfectly fine, while two nose to tail at 4.0m are inside each other.
   No single number separates those, so this is a real footprint test --
   the separating-axis theorem on two 4.5 x 1.8m rectangles.

   A check that reports overlaps where there are none is worse than no
   check, because it trains you to ignore it. */
function corners(p) {
  const a = (p.rot * Math.PI) / 180, c = Math.cos(a), s2 = Math.sin(a);
  const hl = CAR.length / 2, hw = CAR.width / 2;
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([u, v]) => ({
    x: p.x + c * hl * u - s2 * hw * v,
    y: p.y + s2 * hl * u + c * hw * v,
  }));
}

function boxesOverlap(pa, pb) {
  const A = corners(pa), B = corners(pb);
  for (const [P, Q] of [[A, B], [B, A]]) {
    for (let i = 0; i < 4; i++) {
      const ax = P[(i + 1) % 4].x - P[i].x, ay = P[(i + 1) % 4].y - P[i].y;
      const nx = -ay, ny = ax;
      let pMin = Infinity, pMax = -Infinity, qMin = Infinity, qMax = -Infinity;
      for (const v of P) { const d = v.x * nx + v.y * ny; pMin = Math.min(pMin, d); pMax = Math.max(pMax, d); }
      for (const v of Q) { const d = v.x * nx + v.y * ny; qMin = Math.min(qMin, d); qMax = Math.max(qMax, d); }
      if (pMax < qMin || qMax < pMin) return false;   // a gap on this axis
    }
  }
  return true;
}

export function overlapping(world) {
  const out = [];
  const at = world.actors.map((a) => ({ a, p: poseOf(world, a) }));
  for (let i = 0; i < at.length; i++) {
    for (let j = i + 1; j < at.length; j++) {
      if (boxesOverlap(at[i].p, at[j].p)) {
        out.push({
          a: at[i].a.id, b: at[j].a.id,
          apart: Math.hypot(at[i].p.x - at[j].p.x, at[i].p.y - at[j].p.y),
        });
      }
    }
  }
  return out;
}

export { PX_PER_M, M, CAR, DT };
