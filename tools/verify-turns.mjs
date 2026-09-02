/* Turns: that a car steers rather than cutting the corner.
 *
 * This exists because the fault was caught by eye, not by a check. Every
 * turn in the game used to be one quadratic Bezier from the stop line to
 * an off-board exit with its control point at the corner — legs of 2.7m
 * against 20m, so all of the bending happened at the stop line and none
 * of it at the corner. Cars turned across their own approach lane on the
 * way out and left the carriageway entirely on a right.
 *
 * So the invariants here are the ones a driving examiner would actually
 * watch for, and they are measured on the path the engine really builds:
 *
 *   1. Nobody steers tighter than a car physically can.
 *   2. Nobody is on the wrong side of the road while still on the approach.
 *      (Inside the junction box, crossing the centreline extension is what
 *      turning left IS, so the box is excluded rather than forgiven.)
 *   3. Everybody finishes in the lane they turned into.
 *   4. Bad driving still exists, but only where a scenario asked for it —
 *      and a trait whose tell claims a fault has to actually produce one.
 */
import { movementOf, applyTraits, TRAITS, M, CX, CY, LANE } from "../src/engine/index.js";
import { pointOn } from "../src/engine/paths.js";
import { boxHalf, crossSpec } from "../src/engine/road.js";

const m = (px) => Math.round((px / 20) * 100) / 100;
const OFF = LANE / 2;
const { vx, hy } = boxHalf(crossSpec(), LANE);

/* A car's tightest steer at full lock, and the floor movementOf clamps to.
   Kept as a local literal on purpose: if the engine's constant is edited,
   this check should notice rather than agree with it. */
const LOCK_R = M(5.5);

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

function pathFor(from, intent, traits = []) {
  const p = applyTraits({ from, intent, arriveAt: 0, departAt: 0, stops: true, kind: "car", traits });
  return movementOf(p).traverse;
}

/* Radius through three points, measured over a ~1.5m baseline rather than
   over adjacent samples: the path is a polyline, so neighbouring samples
   are either exactly collinear or straddle a vertex, and a three-point
   circle on those measures the discretisation, not the turn. */
function radiusAt(a, b, c) {
  const A = Math.hypot(b.x - a.x, b.y - a.y);
  const B = Math.hypot(c.x - b.x, c.y - b.y);
  const C = Math.hypot(c.x - a.x, c.y - a.y);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  if (area < 1e-9) return Infinity;
  return (A * B * C) / (4 * area);
}

console.log("1. A TURN IS STEERABLE, AND STAYS ON ITS OWN SIDE ON THE APPROACH");
{
  let worstR = Infinity, breaches = 0, offRoad = 0;
  for (const from of ["S", "N", "E", "W"]) {
    for (const intent of ["left", "right"]) {
      const path = pathFor(from, intent);
      const step = M(1.5);
      const n = Math.max(6, Math.round(path.length / step));
      const pts = Array.from({ length: n + 1 }, (_, i) => pointOn(path, i / n));
      for (let i = 1; i < n; i++) worstR = Math.min(worstR, radiusAt(pts[i - 1], pts[i], pts[i + 1]));

      const vertIn = from === "S" || from === "N";
      const sgn = from === "S" || from === "E" ? 1 : -1;
      let breach = 0, over = 0;
      for (let i = 0; i <= 600; i++) {
        const q = pointOn(path, i / 600);
        const along = vertIn ? (q.y - CY) * sgn : (q.x - CX) * sgn;
        if (along <= hy) continue;                                   // in the box, or past it
        const lateral = vertIn ? (q.x - CX) * sgn : (CY - q.y) * sgn; // + = correct side
        if (lateral < 0) breach = Math.max(breach, -lateral);
        if (lateral > vx) over = Math.max(over, lateral - vx);
      }
      /* A 10cm tolerance on the carriageway edge: the junction is modelled
         with square 90-degree kerbs and real ones are rounded, so a clean
         right clips the corner of a shape that does not exist. */
      if (breach > 1) breaches++;
      if (over > M(0.1)) offRoad++;
    }
  }
  if (worstR >= LOCK_R) ok(`tightest turn anywhere is ${m(worstR)}m, at or above the ${m(LOCK_R)}m steering lock`);
  else fail(`something steers at ${m(worstR)}m, tighter than a car can (${m(LOCK_R)}m)`);
  if (breaches === 0) ok("no approach is driven on the wrong side of the road");
  else fail(`${breaches} approach(es) driven on the wrong side of the road`);
  if (offRoad === 0) ok("no turn leaves the carriageway on its approach");
  else fail(`${offRoad} turn(s) leave the carriageway`);
}

/* Turning from the S leg, a right finishes eastbound in the lane at
   y = CY+OFF and a left westbound at y = CY-OFF. For both, a smaller y is
   wide of that lane and a larger y is inside it, so one signed number
   reads the same way for each: + wide, - cut. Measured only once the car
   has straightened onto the exit heading — while it is still mid-arc it
   is not off its lane, it is turning. */
function finishingError(intent, traits = []) {
  const path = pathFor("S", intent, traits);
  const laneY = intent === "right" ? CY + OFF : CY - OFF;
  const outX = intent === "right" ? 1 : -1;
  let worst = 0;
  const N = 1200;
  for (let i = 1; i < N; i++) {
    const a = pointOn(path, (i - 1) / N), b = pointOn(path, (i + 1) / N);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    if ((dx / len) * outX < Math.cos((12 * Math.PI) / 180)) continue;
    const err = laneY - pointOn(path, i / N).y;
    if (Math.abs(err) > Math.abs(worst)) worst = err;
  }
  return worst;
}

console.log("\n2. A WELL-DRIVEN TURN FINISHES IN THE LANE IT TURNED INTO");
for (const intent of ["left", "right"]) {
  const e = finishingError(intent);
  if (Math.abs(e) < LANE / 2) ok(`${intent} finishes ${m(Math.abs(e))}m off the lane centre, inside the lane`);
  else fail(`a clean ${intent} finishes ${m(e)}m off its lane centre`);
}

console.log("\n3. BAD DRIVING IS DELIBERATE, AND ITS TELL IS TRUE");
{
  /* A trait whose tell describes a fault has to produce that fault, or it
     is lying to the player — the same standard that got wideTurn pulled
     out of `lateflag` when its 1.1m bend was under the resolution floor. */
  const expect = [
    { trait: "wideTurn", intent: "left", want: "wide" },
    { trait: "wideTurn", intent: "right", want: "wide" },
    { trait: "cutsCorner", intent: "left", want: "cut" },
  ];
  for (const { trait, intent, want } of expect) {
    const e = finishingError(intent, [trait]);
    const isWide = e > LANE / 2, isCut = e < -LANE / 2;
    const got = isWide ? "wide" : isCut ? "cut" : "in lane";
    if (got === want) ok(`${trait} on a ${intent}: ${m(e)}m — ${want} of the lane, as its tell says`);
    else fail(`${trait} on a ${intent} claims "${TRAITS[trait].tell}" but finishes ${m(e)}m (${got})`);
  }

  /* cutsCorner is left-only by design, and this is the reason rather than
     a shortcut: a right turns around the near kerb where the clean radius
     is already near the steering lock, so the floor absorbs the bias and
     the tell would claim a fault nobody could see. */
  const r = finishingError("right", ["cutsCorner"]);
  if (Math.abs(r) < LANE / 2) ok(`cutsCorner correctly declines a right turn (${m(r)}m, still in lane)`);
  else fail(`cutsCorner moved a right turn ${m(r)}m — it is meant to be left-only`);

  /* And the traits must differ from each other, not merely from zero. */
  const clean = finishingError("left");
  const wide = finishingError("left", ["wideTurn"]);
  const cut = finishingError("left", ["cutsCorner"]);
  if (wide > clean + LANE / 2 && cut < clean - LANE / 2)
    ok(`the two faults sit on opposite sides of a clean line (${m(cut)}m / ${m(clean)}m / ${m(wide)}m)`);
  else fail("wideTurn and cutsCorner do not straddle the clean line");
}

console.log("\n" + "=".repeat(66));
if (problems === 0) console.log("OK: turns are steered, not cut.");
else console.log(`${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
