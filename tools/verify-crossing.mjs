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
  seedCrossing, step, overlapping, blockedBy, DT,
} from "../src/sim/crossing.js";

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

console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: the paths are right, the rules fall out of them, and cars take turns.");
console.log("\n   Stage 1's real test is somebody watching it.");
