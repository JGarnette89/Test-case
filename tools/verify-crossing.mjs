/* Stage 1 of the rebuild: an intersection, and where paths meet.
 *
 * Two halves. Sections 1-4 are the GEOMETRY: where a car goes and where
 * two of them would meet. Section 5 is the DECISION, which lives in the
 * traffic loop and is made by each driver every tick from what they can
 * see -- not by a scheduler, once, before anybody moves.
 *
 * The properties are the maintainer's own rules, and the point of
 * checking them here is that they should FALL OUT of the geometry rather
 * than be enforced by a rule table. "Two vehicles going straight from
 * opposite legs do not conflict" is not a special case if their paths
 * genuinely never cross -- and if it ever needs to become a special
 * case, that means the geometry is wrong.
 */
import {
  layoutFor, pathFor, poseAt, conflictsBetween, intersectionFor,
  exitFor, rightOf, OPPOSITE, SIDES, INTENTS,
} from "../src/sim/intersection.js";
import {
  seedCrossing, step, overlapping, blockedBy, whatStops, gapNeeded, DT,
  ALL_WAY, TWO_WAY, COMPETENT, UNDUE_AT,
} from "../src/sim/crossing.js";
import { timeToCover, CAR } from "../src/sim/traffic.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

console.log("\n" + "=".repeat(70));
console.log("SIM STAGE 1: an intersection, and where paths meet");
console.log("=".repeat(70));

const L = layoutFor();

console.log("\n1. A CAR LEAVES BY THE LEG IT SHOULD");
{
  /* Arriving from the north is travelling SOUTH, so the driver's left
     hand points east and their right points west. Getting this backwards
     is the kind of mistake that looks fine until somebody watches it. */
  const wrong = [];
  for (const from of SIDES) {
    if (exitFor(from, "straight") !== OPPOSITE[from]) wrong.push(`${from} straight`);
  }
  exitFor("N", "left") === "E" && exitFor("N", "right") === "W"
    && exitFor("E", "left") === "S" && exitFor("E", "right") === "N"
    ? ok("a car from the north turning left leaves east and right leaves west, and it holds all the way round")
    : fail(`turning is mirrored: from N, left goes ${exitFor("N", "left")} and right goes ${exitFor("N", "right")}`);
  wrong.length === 0
    ? ok("and straight on is always the opposite leg")
    : fail(`${wrong.join(", ")} do not go straight on`);

  /* The right-hand rule needs to know who is on whose right. Travelling
     south, the traffic on your right is the traffic coming from the WEST
     leg -- it is crossing left to right in front of you. */
  rightOf("N") === "W" && rightOf("W") === "S" && rightOf("S") === "E" && rightOf("E") === "N"
    ? ok("and the leg on your right is the one the right-hand rule means")
    : fail(`rightOf is wrong: from N it says ${rightOf("N")}, which is not the traffic crossing in front of you`);
}

console.log("\n2. THE RULES FALL OUT OF THE GEOMETRY, NOT OUT OF A TABLE");
{
  /* DECISIONS.md 5.3: right of way is PATH CONFLICT, not intersection
     occupancy. So the model needs to know where two lines cross, and the
     rules that follow should need no special casing at all. */
  let opposite = 0, crossing = 0, lefts = 0;
  for (const from of SIDES) {
    if (L.conflicts[`${from}/straight|${OPPOSITE[from]}/straight`]) opposite++;
    if (L.conflicts[`${from}/straight|${rightOf(from)}/straight`]) crossing++;
    if (L.conflicts[`${from}/left|${OPPOSITE[from]}/straight`]) lefts++;
  }
  opposite === 0
    ? ok("two cars going straight from opposite legs never conflict — they pass on their own sides, and no rule had to say so")
    : fail([
        `${opposite} of 4 opposite-straight pairs are reported as conflicting.`,
        "They pass on their own sides of the road and their paths do not cross.",
        "If this needs a special case the LANES are wrong, not the rule.",
        "DECISIONS.md 5.3.",
      ].join(" "));
  crossing === 4
    ? ok("two cars going straight across each other always conflict")
    : fail(`only ${crossing} of 4 crossing pairs conflict, so cars would drive through each other`);
  lefts === 4
    ? ok("and a left turn always crosses the oncoming traffic, which is what makes it the hard one")
    : fail(`only ${lefts} of 4 left turns cross the oncoming straight`);

  console.log(`   ${Object.keys(L.paths).length} paths, ${Object.keys(L.conflicts).length} conflicting ordered pairs`);
}

console.log("\n3. THE PATHS ARE DRIVEABLE");
{
  /* A turn is an arc that starts at the car and is tangent to the lane
     it is leaving, with the radius derived from where the centrelines
     cross. Every turn in the old game cut the corner for the whole life
     of the project and nothing noticed until somebody watched it, which
     is why this is measured rather than assumed. */
  const place = intersectionFor();
  let worstJump = 0, shortest = Infinity;
  for (const from of SIDES) {
    for (const intent of INTENTS) {
      const p = pathFor(place, from, intent);
      shortest = Math.min(shortest, p.length);
      for (let s = 0; s < p.length; s += 0.5) {
        const a = poseAt(p, s), b = poseAt(p, s + 0.5);
        worstJump = Math.max(worstJump, Math.hypot(b.x - a.x, b.y - a.y));
      }
    }
  }
  worstJump < 0.7
    ? ok(`no path jumps: half a metre along is at most ${worstJump.toFixed(2)}m of travel, so a car never teleports mid-turn`)
    : fail(`a path jumps ${worstJump.toFixed(2)}m in half a metre of travel, so it is not a continuous line`);

  const left = pathFor(place, "N", "left"), rightP = pathFor(place, "N", "right");
  const straight = pathFor(place, "N", "straight");
  left.length > straight.length && rightP.length < straight.length
    ? ok(`a left is the long way round and a right is the short one (${left.length.toFixed(1)}m, ${straight.length.toFixed(1)}m, ${rightP.length.toFixed(1)}m)`)
    : fail(`turn lengths are wrong: left ${left.length.toFixed(1)}m, straight ${straight.length.toFixed(1)}m, right ${rightP.length.toFixed(1)}m`);

  /* Everybody stops at the same line, because the box is square. */
  const stops = SIDES.flatMap((f) => INTENTS.map((i) => pathFor(place, f, i).stopAt));
  Math.max(...stops) - Math.min(...stops) < 0.01
    ? ok(`and every approach stops at the same distance out (${stops[0].toFixed(1)}m), because the box is square`)
    : fail(`stop lines differ by ${(Math.max(...stops) - Math.min(...stops)).toFixed(2)}m across the legs`);
}

console.log("\n4. A CONFLICT IS SOMEWHERE, NOT JUST SOMETHING");
{
  /* A driver has to yield AT a place. "These paths conflict" is not
     enough -- the model needs how far along each of them, or a car
     cannot know where to wait. */
  const hit = L.conflicts["N/straight|W/straight"];
  const bad = Object.entries(L.conflicts).filter(([, c]) =>
    !Number.isFinite(c.a) || !Number.isFinite(c.b) || c.a < 0 || c.b < 0);
  bad.length === 0 && hit
    ? ok(`every conflict says how far along each path it is (N and W meet ${hit.a.toFixed(1)}m along one and ${hit.b.toFixed(1)}m along the other)`)
    : fail(`${bad.length} conflicts have no usable position, so a car could not know where to wait`);

  /* AND THE CONFLICT IS AT OR BEYOND THE STOP LINE. A car yields by
     waiting at its line; a conflict reported behind the line would mean
     yielding somewhere it has already been. */
  const early = Object.entries(L.conflicts)
    .filter(([k, c]) => c.a < L.paths[k.split("|")[0]].stopAt - 0.01);
  early.length === 0
    ? ok("and never behind the stop line, so waiting at the line is always enough")
    : fail(`${early.length} conflicts sit behind the stop line of the path they belong to`);
}


console.log("\n5. AND CARS ACTUALLY SORT THEMSELVES OUT AT IT");
{
  /* The decision is stage 0's, unchanged: `decide` and `wantedGap` are
     imported rather than copied, because a driver working out what to do
     about an intersection is not doing something different from one
     working out what to do about the car in front.

     A YIELDING DRIVER IS FOLLOWING SOMETHING THAT ISN'T MOVING. The
     conflict point becomes a stationary obstacle and the car-following
     model does the rest -- no second mechanism, no search, and nobody's
     path rewritten after the fact, which is what the old engine had to do
     because it had no tick in which anybody could decide anything. */
  /* ORDINARY TRAFFIC, DELIBERATELY BELOW CAPACITY. This section asks
     whether the thing works at all; section 6 asks whether it holds when
     it cannot cope. An intersection passes about 15 cars a minute, so a
     car offered every 5 seconds is a busy junction rather than a jammed
     one, and a long wait here would mean something is wrong rather than
     that the queue is simply long. */
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8], MINUTES = 4, EVERY = 5;
  const TICKS = Math.round((MINUTES * 60) / DT);
  let overlaps = 0, through = 0, stillest = 0, worstPair = null;
  const waits = [];
  for (const seed of SEEDS) {
    let w = seedCrossing(seed, 50, { every: EVERY });
    const since = new Map();
    for (let i = 0; i < TICKS; i++) {
      const before = new Map(w.actors.map((a) => [a.id, a]));
      w = step(w);
      const bad = overlapping(w);
      overlaps += bad.length;
      if (bad.length && !worstPair) worstPair = { seed, tick: w.tick, ...bad[0] };
      for (const a of w.actors) {
        if (a.v < 0.3) since.set(a.id, (since.get(a.id) ?? 0) + DT);
        stillest = Math.max(stillest, since.get(a.id) ?? 0);
      }
      for (const [id] of before) {
        if (!w.actors.some((x) => x.id === id)) waits.push(since.get(id) ?? 0);
      }
    }
  }
  waits.sort((a, b) => a - b);
  const q = (p) => waits[Math.min(waits.length - 1, Math.floor(waits.length * p))];
  console.log(`   ${waits.length} cars through ${SEEDS.length} intersections over ${MINUTES} minutes each`);
  console.log(`   stopped for: median ${q(0.5).toFixed(1)}s, p90 ${q(0.9).toFixed(1)}s, worst ${waits[waits.length - 1].toFixed(1)}s`);

  overlaps === 0
    ? ok(`nobody ever shares tarmac with anybody: ${(SEEDS.length * TICKS).toLocaleString()} ticks, every car against every other, by footprint`)
    : fail([
        `${worstPair.a} and ${worstPair.b} are inside each other`,
        `(seed ${worstPair.seed}, tick ${worstPair.tick}, ${worstPair.apart.toFixed(1)}m between centres).`,
        "This is the one property the rebuild exists to have. DO NOT WEAKEN THIS CHECK",
        "to make a yield rule pass -- the yield rule is what is wrong. REBUILD.md 7.1.",
      ].join(" "));

  /* DEADLOCK IS THE FAILURE MODE OF A PRIORITY RULE, and it is silent:
     four cars each waiting for the one on their right wait forever, and
     nothing throws. */
  stillest < 45
    ? ok(`and nobody deadlocks: the longest anybody sat still was ${stillest.toFixed(1)}s`)
    : fail([
        `somebody sat still for ${stillest.toFixed(1)}s at a junction offered only ${(60 / EVERY).toFixed(0)} cars a minute against a capacity of about 15.`,
        "That is not congestion, it is a deadlock or a starved approach.",
        "Four cars each yielding to the one on their right will wait for each other",
        "forever and nothing will throw. The right-hand rule needs a tie-break that",
        "cannot cycle -- arrival order is what provides it.",
      ].join(" "));

  through = waits.length;
  through / (SEEDS.length * MINUTES) > 8
    ? ok(`and it keeps flowing: ${(through / (SEEDS.length * MINUTES)).toFixed(1)} cars a minute through the intersection`)
    : fail(`only ${(through / (SEEDS.length * MINUTES)).toFixed(1)} cars a minute get through, so the rule is too timid to be traffic`);

  /* AND THE PRIORITY RULES ARE THE MAINTAINER'S, evaluated by drivers
     rather than by a scheduler. Checked directly rather than inferred
     from the traffic: two cars that stopped together, and who goes. */
  const L = layoutFor();
  const pair = (aRoute, bRoute, aStop, bStop) => ({
    me: { id: "a", route: aRoute, s: L.paths[aRoute].stopAt - 3, stoppedAt: aStop, v: 0 },
    them: { id: "b", route: bRoute, s: L.paths[bRoute].stopAt - 3, stoppedAt: bStop, v: 0 },
  });
  const first = pair("N/straight", "W/straight", 5.0, 2.0);
  blockedBy(first.me, first.them, L) && !blockedBy(first.them, first.me, L)
    ? ok("whoever stopped first goes first, and exactly one of the two is held")
    : fail("arrival order does not decide, so the queue at an all-way stop has no order");

  const tie = pair("N/straight", "W/straight", 2.0, 2.0);
  blockedBy(tie.me, tie.them, L) && !blockedBy(tie.them, tie.me, L)
    ? ok("arriving together, the car on the right goes — and only one of them yields, which is what stops it deadlocking")
    : fail("the right-hand rule is not deciding a simultaneous arrival, or it is holding both of them");

  const lefts = pair("N/left", "S/straight", 2.0, 2.0);
  blockedBy(lefts.me, lefts.them, L) && !blockedBy(lefts.them, lefts.me, L)
    ? ok("and a left turn yields to the oncoming, head to head, as it does in law")
    : fail("a left turn is not yielding to the oncoming straight (DECISIONS.md 5.5)");
}


console.log("\n6. UNDER A STREAM THAT NEVER LETS UP, THE ORDERING STAYS RIGHT");
{
  /* The maintainer's own framing: "we should start with an all way stop
     with cars that just keep coming, so we can prove our right of way
     ordering stays consistent."

     So the question is not whether precedence resolves once. It is
     whether it stays correct INDEFINITELY, under demand the intersection
     cannot satisfy. A rule that is right for one cycle and drifts under
     load is worse than one that is obviously wrong, because it looks
     fine in a demo. */
  const SEEDS = [1, 2, 3, 4], MINUTES = 10, EVERY = 0.6;
  const TICKS = Math.round((MINUTES * 60) / DT);
  let entered = 0, jumped = 0, overlaps = 0, offered = 0, admitted = 0;
  let firstJump = null;
  const early = [], late = [];

  for (const seed of SEEDS) {
    let w = seedCrossing(seed, 50, { every: EVERY });
    const since = new Map();
    for (let i = 0; i < TICKS; i++) {
      const prev = w;
      const was = new Map(prev.actors.map((a) => [a.id, a]));
      w = step(w);
      overlaps += overlapping(w).length;

      for (const me of w.actors) {
        const before = was.get(me.id);
        if (!before) continue;
        const mine = w.layout.paths[me.route];

        /* THE MOMENT OF COMMITMENT: the tick a car crosses its own stop
           line. Judged on the state it DECIDED from -- the previous one --
           because once it is over the line `blockedBy` rightly reports it
           as committed, and asking then would be asking after the fact. */
        if (before.s < mine.stopAt && me.s >= mine.stopAt) {
          entered++;
          const held = prev.actors.find((t) => t.id !== me.id && blockedBy(before, t, prev.layout));
          if (held) {
            jumped++;
            if (!firstJump) {
              firstJump = { seed, tick: w.tick, who: me.route, held: held.route };
            }
          }
        }
        if (me.v < 0.3) since.set(me.id, (since.get(me.id) ?? 0) + DT);
      }
      for (const [id] of was) {
        if (!w.actors.some((x) => x.id === id)) {
          (i < TICKS / 2 ? early : late).push(since.get(id) ?? 0);
        }
      }
    }
    offered += w.spawned;
    admitted += w.spawned - (w.turnedAway ?? 0);
  }

  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  console.log(`   ${SEEDS.length} intersections, ${MINUTES} minutes each, a car offered every ${EVERY}s`);
  console.log(`   ${offered} offered, ${admitted} got on the road, ${entered} crossed the line`);
  console.log(`   mean wait: ${mean(early).toFixed(1)}s in the first half, ${mean(late).toFixed(1)}s in the second`);

  jumped === 0
    ? ok(`nobody ever goes out of turn: ${entered.toLocaleString()} crossings of a stop line, and not one with somebody who outranked them still waiting`)
    : fail([
        `${jumped} of ${entered} cars entered the box while somebody who outranked them was still waiting`,
        firstJump ? `(first: a ${firstJump.who} went while a ${firstJump.held} was held, seed ${firstJump.seed} tick ${firstJump.tick}).` : "",
        "Precedence that resolves once but drifts under load is worse than one that is",
        "obviously wrong, because it looks right in a demo. DECISIONS.md 5.13.1.",
      ].join(" "));

  overlaps === 0
    ? ok(`and nobody touches anybody, at a demand of ${(60 / EVERY).toFixed(0)} cars a minute against an intersection that can pass about 15`)
    : fail(`${overlaps} overlapping ticks under load, so the ordering holds only while the intersection is quiet`);

  /* STARVATION IS THE SLOW FAILURE. A rule can be locally correct and
     still leave one approach permanently last, and the signature is a
     wait that grows with the length of the run rather than settling. */
  const growth = mean(late) - mean(early);
  Math.abs(growth) < 6
    ? ok(`and nobody is starved: the mean wait in the second half is ${growth >= 0 ? "+" : ""}${growth.toFixed(1)}s against the first, so the queue settles rather than growing`)
    : fail([
        `the mean wait grew by ${growth.toFixed(1)}s between the first half of the run and the second.`,
        "That is starvation rather than congestion: some approach is being served last",
        "every time and never catching up. Check the tie-break can't cycle.",
      ].join(" "));
}


console.log("\n7. SOME DRIVERS ROLL THE STOP, AND IT COSTS THE ORDERING NOTHING");
{
  /* The maintainer's ruling: "rolling stops are a failure to obey the law
     not necessarily a skill issue. a high confidence driver might feel
     strong in their observation that it's clear to go and will disregard
     the stopping portion prematurely."

     Knowledge-dominant with confidence a real contributor, and it falls
     out of every car being a rated driver rather than being authored --
     nobody decided WHICH cars roll stops, only what kind of person does.

     THE PROPERTY THAT MATTERS IS NOT THAT IT HAPPENS. It is that it
     happens WHEN THE WAY IS CLEAR and not otherwise, and that the
     ordering survives a population that does not all stop -- because the
     precedence rule is built on arrival order, and a driver who never
     comes to rest is exactly the case that could break it. */
  const AT_REST_ISH = 0.5;
  const look = (every) => {
    let rollers = 0, rolledThrough = 0, others = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      let w = seedCrossing(seed, 50, { every });
      const low = new Map(), isRoller = new Map();
      for (let i = 0; i < 4800; i++) {
        const before = new Map(w.actors.map((a) => [a.id, a]));
        w = step(w);
        for (const a of w.actors) {
          low.set(a.id, Math.min(low.get(a.id) ?? 99, a.v));
          isRoller.set(a.id, Boolean(a.rollsStops));
        }
        for (const [id] of before) {
          if (w.actors.some((x) => x.id === id)) continue;
          const never = (low.get(id) ?? 99) > AT_REST_ISH;
          if (isRoller.get(id)) { rollers++; if (never) rolledThrough++; }
          else { others++; }
        }
      }
    }
    return { rollers, rolledThrough, others };
  };

  const quiet = look(5.0), busy = look(1.6);
  const share = (x) => Math.round((100 * x.rolledThrough) / Math.max(1, x.rollers));
  console.log(`   quiet: ${quiet.rollers} rollers through, ${quiet.rolledThrough} never came to rest (${share(quiet)}%)`);
  console.log(`   busy:  ${busy.rollers} rollers through, ${busy.rolledThrough} never came to rest (${share(busy)}%)`);

  quiet.rolledThrough > 0
    ? ok(`the behaviour happens: ${quiet.rolledThrough} of ${quiet.rollers} rollers cleared the line without ever coming to rest`)
    : fail([
        "nobody ever rolled a stop, so this is an untested code path rather than a behaviour.",
        "It falls out of a weak knowledge axis and a bold confidence axis (DECISIONS.md 5.13.5)",
        "-- if no drawn driver has both, the occurrence rule is asking for too much.",
      ].join(" "));

  share(quiet) > share(busy)
    ? ok(`and it happens when the way is CLEAR rather than at random: ${share(quiet)}% of rollers roll at a quiet junction against ${share(busy)}% at a busy one`)
    : fail([
        `rollers roll ${share(quiet)}% of the time when quiet and ${share(busy)}% when busy.`,
        "A rolling stop is a driver deciding the legal requirement is surplus BECAUSE they",
        "can see it is clear. If it happens as often in traffic, they are not judging",
        "anything -- they are just not stopping, which is a different and worse driver.",
      ].join(" "));

  /* AND THE ORDERING SURVIVES THEM -- checked in section 6, which runs
     against the same population. Stated here so the connection is not
     lost: a driver who never comes to rest has no arrival time, and
     arrival order is what the precedence rule is built on. */
  ok("and they still yield: section 6's ordering runs against this same population, rollers included");
}

console.log("\n8. THE SAME INTERSECTION, TWO-WAY: ONE ROAD STOPS AND THE OTHER DOES NOT");
{
  /* CONTROL IS PER LEG (DECISIONS.md 5.4), so this is the SAME
     intersection and the same rules -- nothing about the geometry
     changed, and no second decision function exists. What changed is two
     entries in a table, and everything below is what falls out of that.

     The interesting half is that arrival order stops being available.
     Nobody on the through road comes to rest, so there is no queue of
     stops to be third in, and the waiting driver's question becomes the
     one a two-way stop is actually about: IS THERE ROOM. */
  const world = seedCrossing(1, 60, { every: 2.5, control: TWO_WAY });
  const L = world.layout;

  /* --- the gap, measured off the model rather than off the constant --- */
  const speed = 60 / 3.6;
  const runFor = (route) => {
    let run = 0;
    for (const other of SIDES.filter((x) => L.place.control[x] !== "stop")) {
      for (const oi of INTENTS) {
        const meet = L.conflicts[`${other}/${oi}|${route}`];
        if (meet) run = Math.max(run, meet.clearOf - (L.paths[route].stopAt - CAR.length / 2));
      }
    }
    return run;
  };
  const cross = {};
  for (const intent of INTENTS) cross[intent] = timeToCover(0, runFor(`N/${intent}`), speed);

  console.log("   the gap a driver needs, derived from how long the crossing takes:");
  for (const intent of INTENTS) {
    console.log(`     ${intent.padEnd(8)} clear in ${cross[intent].toFixed(2)}s  ->  ` +
      `bold ${cross[intent].toFixed(1)}s, competent ${(cross[intent] * 2).toFixed(1)}s, timid ${(cross[intent] * 3).toFixed(1)}s`);
  }

  cross.right < cross.straight && cross.straight < cross.left
    ? ok("a right needs the least room, a left the most, and straight on sits between — nobody wrote that order down")
    : fail(`the manoeuvres do not order right < straight < left (${cross.right.toFixed(2)}, ${cross.straight.toFixed(2)}, ${cross.left.toFixed(2)})`);

  /* AN INDEPENDENT NUMBER, FROM OUTSIDE THIS PROJECT. The Highway
     Capacity Manual's base critical headways for a two-way stop are
     measured from real traffic: 6.2s for a minor right, 6.5s minor
     through, 7.1s minor left. Nothing here was fitted to them -- the
     derivation is crossing time doubled -- so agreeing with them is a
     genuine outside check rather than a restatement. */
  const HCM = { right: 6.2, straight: 6.5, left: 7.1 };
  const off = INTENTS.map((i) => cross[i] * (1 + COMPETENT) - HCM[i]);
  console.log(`   against the Highway Capacity Manual's measured critical headways: ` +
    `${INTENTS.map((i) => `${i} ${(cross[i] * 2).toFixed(1)} v ${HCM[i]}`).join(", ")}`);
  Math.max(...off.map(Math.abs)) < 1.5
    ? ok(`and a competent driver's derived gap lands within ${Math.max(...off).toFixed(1)}s of what real drivers are measured to accept`)
    : fail(`the derived gaps are ${off.map((x) => x.toFixed(1)).join("/")}s off the measured ones, which is too far to call agreement`);

  /* --- and it is really the gap that decides, not the presence of a car --- */
  /* A car that has NOT stopped, deliberately: a through car standing at
     the line is a case of its own (it is waiting, not yielding) and is
     not what a gap is measured against. */
  const at = (route, s, v, extra = {}) => ({ id: route, route, s, v, going: false, stoppedAt: null, ...extra });
  const held = (caution) => {
    const me = at("N/straight", L.paths["N/straight"].stopAt - CAR.length / 2, 0,
      { v0: speed, caution, id: "me", stoppedAt: 1 });
    /* Walk the oncoming car back until this driver will go. */
    for (let d = 0; d < 400; d += 0.5) {
      const them = at("E/straight", L.paths["E/straight"].stopAt - d, speed);
      if (!blockedBy(me, them, L)) return d / speed;
    }
    return Infinity;
  };
  const bold = held(0), fair = held(COMPETENT), timid = held(2);
  /* THE GAP IS PER CONFLICT, NOT PER DRIVER, so the number to compare
     against is the one for THIS pair -- how far this driver has to
     travel to be clear of a car coming straight through from the east --
     and not the worst over every major movement printed above. Comparing
     against the worst is what made this check disagree with the model by
     two seconds while both were right. */
  const meet = L.conflicts["E/straight|N/straight"];
  const pairRun = meet.clearOf - (L.paths["N/straight"].stopAt - CAR.length / 2);
  const pairCross = timeToCover(0, pairRun, speed);
  console.log(`   the gap actually accepted at the line, against a car coming straight through: ` +
    `bold ${bold.toFixed(1)}s, competent ${fair.toFixed(1)}s, timid ${timid.toFixed(1)}s ` +
    `(the crossing itself takes ${pairCross.toFixed(1)}s)`);
  bold < fair && fair < timid
    ? ok("a bolder driver takes a gap a timid one refuses, and the same expression produces all three")
    : fail(`caution does not order the gap accepted (${bold.toFixed(1)}, ${fair.toFixed(1)}, ${timid.toFixed(1)})`);
  Math.abs(fair - pairCross * (1 + COMPETENT)) < 0.6
    ? ok("and what a driver does at the line is exactly what the derivation says they need, so there is one gap and not two")
    : fail(`the accepted gap (${fair.toFixed(1)}s) is not the derived one (${(pairCross * 2).toFixed(1)}s) — two definitions of one quantity, DECISIONS.md 10`);

  /* --- the through road runs uninterrupted --- */
  const SEEDS = [1, 2, 3], MINUTES = 3;
  const TICKS = Math.round((MINUTES * 60) / DT);
  let overlaps = 0, minorThrough = 0, majorThrough = 0, stoppedForNobody = 0, worstPair = null;
  const minorWaits = [];
  for (const seed of SEEDS) {
    let w = seedCrossing(seed, 60, { every: 2.5, control: TWO_WAY });
    const still = new Map();
    for (let i = 0; i < TICKS; i++) {
      const before = new Map(w.actors.map((a) => [a.id, a]));
      w = step(w);
      if (i % 4 === 0) {
        const bad = overlapping(w);
        overlaps += bad.length;
        if (bad.length && !worstPair) worstPair = { seed, tick: w.tick, ...bad[0] };
      }
      /* NOBODY IS COMMITTED ANYWHERE, so there is nothing for a car on
         the through road to be stopping for. */
      const anyoneIn = w.actors.some((a) => a.going || a.s >= w.layout.paths[a.route].stopAt);
      for (const a of w.actors) {
        const path = w.layout.paths[a.route];
        const stops = w.layout.place.control[path.from] === "stop";
        if (stops) { if (a.v < 0.3) still.set(a.id, (still.get(a.id) ?? 0) + DT); }
        else if (a.v < 0.3 && !anyoneIn) stoppedForNobody += 1;
      }
      for (const [id, a] of before) {
        if (w.actors.some((x) => x.id === id)) continue;
        if (w.layout.place.control[w.layout.paths[a.route].from] === "stop") {
          minorThrough += 1; minorWaits.push(still.get(id) ?? 0);
        } else majorThrough += 1;
      }
    }
  }
  minorWaits.sort((a, b) => a - b);
  const mq = (k) => (minorWaits.length ? minorWaits[Math.floor(minorWaits.length * k)] : 0);
  console.log(`   ${majorThrough} cars along the through road, ${minorThrough} out of the side street, over ${SEEDS.length * MINUTES} intersection-minutes`);
  console.log(`   the side street waits: median ${mq(0.5).toFixed(1)}s, p90 ${mq(0.9).toFixed(1)}s, worst ${(minorWaits[minorWaits.length - 1] ?? 0).toFixed(1)}s`);

  overlaps === 0
    ? ok("nobody shares tarmac with anybody, with two roads of traffic and only one of them stopping")
    : fail(`${worstPair.a} and ${worstPair.b} are inside each other (seed ${worstPair.seed}, tick ${worstPair.tick}) — a gap was accepted that was not there`);

  stoppedForNobody === 0
    ? ok("and the through road is never interrupted: no car on it ever came to rest with the intersection empty")
    : fail(`a car on the through road stopped ${stoppedForNobody} times with nobody committed in the intersection — it is treating a stop sign it does not have`);

  minorThrough > 0 && majorThrough > minorThrough
    ? ok(`and the side street still gets out — ${minorThrough} of them — while carrying less of the traffic, which is what a two-way stop is`)
    : fail(`the side street contributed ${minorThrough} of ${minorThrough + majorThrough} crossings, which is not a two-way stop`);

  /* Same seed, same trace. Determinism is a property of the loop. */
  const trace = (n) => {
    let w = seedCrossing(9, 60, { every: 2.5, control: TWO_WAY });
    for (let i = 0; i < n; i++) w = step(w);
    return w.actors.map((a) => `${a.id}:${a.s.toFixed(6)}:${a.v.toFixed(6)}`).join("|");
  };
  trace(900) === trace(900)
    ? ok("and it is deterministic: the same seed replays to the same metre")
    : fail("the same seed produced two different traces, so nothing measured here can be trusted");
}


console.log("\n9. AND WAITING TOO LONG IS A FAULT, MEASURED AGAINST THE SAME OPENING");
{
  /* The maintainer, on the Ontario scoresheet: "waiting 4-5 seconds
     beyond when the opening is there to turn is marked on the test."

     The trap this section exists to avoid is a SECOND DEFINITION of the
     opening -- one expression deciding when a driver goes and a
     different one deciding when they were late, which would drift the
     first time either was touched (DECISIONS.md 10). There is one:
     `blockedBy`, asked at the driver's own caution to decide, and at
     COMPETENT to judge. The only thing that differs is one parameter. */
  /* WIDE ENOUGH TO BE A RATE RATHER THAN A HANDFUL. At four
     intersections the fault turned up twice, which is not a sample you
     can read a gradient off -- and a check that reports noise as a
     finding is worse than no check. */
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], EVERY = 3.0;
  const TICKS = Math.round(420 / DT);

  const sweep = (clamp) => {
    const bands = { bold: [0, 0], "as competent": [0, 0], cautious: [0, 0], timid: [0, 0] };
    let queued = 0, overlaps = 0, marked = 0, crossings = 0, tooCalm = 0;
    const cautionOfMarked = [], cautionOfRest = [];
    for (const seed of SEEDS) {
      let w = seedCrossing(seed, 60, { every: EVERY, control: TWO_WAY });
      /* THE WARM-UP IS NOT PART OF EITHER ARM. Cars already on the road
         at t=0 drove their approach before the clamp existed, so counting
         them would be comparing two different populations and calling the
         difference a result. */
      const warm = new Set(w.actors.map((a) => a.id));
      if (clamp) w = { ...w, actors: w.actors.map((a) => ({ ...a, caution: Math.min(a.caution, COMPETENT) })) };
      const seen = new Map();
      for (let i = 0; i < TICKS; i++) {
        const before = w.actors;
        w = step(w);
        if (clamp) w = { ...w, actors: w.actors.map((a) => ({ ...a, caution: Math.min(a.caution, COMPETENT) })) };
        if (i % 8 === 0) overlaps += overlapping(w).length;
        for (const a of w.actors) {
          if (warm.has(a.id)) continue;
          if (w.layout.place.control[w.layout.paths[a.route].from] !== "stop") continue;
          /* A DRIVER MARKED FOR WAITING MUST HAVE BEEN ABLE TO GO. Anybody
             stuck behind somebody else is not delaying anything.

             Asked ONCE, at the tick the mark lands. `delayed` is sticky,
             so asking every tick counts one driver hundreds of times and
             turns a clean result into a number nobody can read. */
          const was = seen.get(a.id);
          if (a.delayed && !(was && was.delayed) && whatStops(a, w).queued) queued += 1;
          seen.set(a.id, a);
        }
        for (const a of before) if (!warm.has(a.id) && !w.actors.some((x) => x.id === a.id) && a.stoppedAt != null) crossings += 1;
      }
      for (const a of seen.values()) {
        /* BANDED AT `COMPETENT` EXACTLY, because that is the point the
           fault is judged from and the property below is exact rather
           than statistical: a driver no more cautious than competent
           takes the opening in the tick it appears, so the clock never
           latches. Bands drawn anywhere else blur that into a rate. */
        const band = a.caution < 0.7 ? "bold" : a.caution <= COMPETENT ? "as competent"
          : a.caution < 1.5 ? "cautious" : "timid";
        bands[band][0] += 1;
        (a.delayed ? cautionOfMarked : cautionOfRest).push(a.caution);
        if (a.delayed) {
          bands[band][1] += 1; marked += 1;
          if (a.caution <= COMPETENT) tooCalm += 1;
        }
      }
    }
    const mean = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);
    return { bands, queued, overlaps, marked, crossings, tooCalm,
             markedCaution: mean(cautionOfMarked), restCaution: mean(cautionOfRest) };
  };

  const drawn = sweep(false);
  console.log(`   ${drawn.crossings} drivers came to rest at the line across ${SEEDS.length} intersections`);
  for (const [band, [n, bad]] of Object.entries(drawn.bands)) {
    console.log(`     ${band.padEnd(10)} ${String(bad).padStart(3)} of ${String(n).padStart(4)} marked  ${n ? ((bad / n) * 100).toFixed(0) : 0}%`);
  }

  const rate = (b) => (drawn.bands[b][0] ? drawn.bands[b][1] / drawn.bands[b][0] : 0);
  drawn.marked > 0
    ? ok(`the fault exists at all: ${drawn.marked} drivers sat more than ${UNDUE_AT}s past an opening a competent driver would have taken`)
    : fail("nobody was ever marked for undue delay, so the fault is decoration");

  /* EXACT, NOT STATISTICAL. Accepting a gap sticks, so a driver at or
     below competent goes in the tick the opening appears and stops
     sitting before the clock can latch. One counter-example means the
     opening the fault is judged against is not the opening the driver
     is deciding on -- which is the two-implementations bug wearing this
     section's costume. */
  drawn.tooCalm === 0
    ? ok(`and nobody up to the competent mark is ever late: ${drawn.bands["as competent"][0] + drawn.bands.bold[0]} such drivers, none marked`)
    : fail(`${drawn.tooCalm} drivers no more cautious than competent were marked, so the opening being judged is not the opening being decided on`);

  rate("timid") > rate("cautious") && drawn.markedCaution > drawn.restCaution + 0.3
    ? ok(`and it is graded by confidence rather than by luck: a marked driver averages ${drawn.markedCaution.toFixed(2)} caution against ${drawn.restCaution.toFixed(2)} for everybody else`)
    : fail(`the marking does not follow caution (cautious ${(rate("cautious") * 100).toFixed(0)}%, timid ${(rate("timid") * 100).toFixed(0)}%; marked mean ${drawn.markedCaution.toFixed(2)} against ${drawn.restCaution.toFixed(2)})`);

  drawn.queued === 0
    ? ok("and nobody is marked for a wait they could not have ended — every marked driver was at the head of their own approach")
    : fail(`${drawn.queued} drivers were marked while queued behind somebody else, which is the intersection's fault rather than theirs`);

  /* THE CONTROLLED COMPARISON, which is this project's own standard for
     a fault: strip the cause and it has to vanish. Confidence is the
     cause claimed here, so clamping every driver to the competent end
     must remove the fault -- and must not buy it by driving worse. */
  const clamped = sweep(true);
  clamped.marked === 0
    ? ok(`strip the timidity and the fault disappears: ${drawn.marked} marked as drawn, ${clamped.marked} with every driver clamped to competent`)
    : fail(`${clamped.marked} drivers were still marked with nobody more cautious than competent, so the fault is not confidence's`);
  clamped.overlaps === 0 && drawn.overlaps === 0
    ? ok("and neither population touches anybody, so the fault was not being bought with a collision")
    : fail(`${drawn.overlaps}/${clamped.overlaps} overlaps — going sooner is not allowed to mean going into somebody`);
}



console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: the paths are right, the rules fall out of them, and cars take turns.");
console.log("\n   Stage 1's real test is somebody watching it.");
