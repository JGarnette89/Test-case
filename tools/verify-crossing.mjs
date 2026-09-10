/* Stage 1 of the rebuild: an intersection, and where paths meet.
 *
 * GEOMETRY ONLY. Nothing here decides who yields -- that is a decision a
 * driver makes every tick, and it goes in the traffic loop where it can
 * be made from what a driver can see. This checks the thing the decision
 * will be made ON.
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

console.log("\n" + "=".repeat(70));
if (problems) { console.log(`FAILED: ${problems} problem(s).`); process.exit(1); }
console.log("OK: the paths are right and the rules fall out of them.");
console.log("\n   Nothing decides anything yet. The yield decision is next.");
