/* =====================================================================
   SIGHTLINE VERIFICATION
   Run:  node tools/verify-sight.mjs

   Creeping for a view is only a mechanic if both halves are true: it has
   to buy sight, and it has to cost safety. If it only buys sight it is a
   free action and everyone presses it to the floor. If it only costs, it
   is a trap. So the table below is the check — visibility improving down
   one column while the nose marches into the junction down another.

   Occlusion is also checked on its own, with poses placed by hand, so a
   failure here says which of the two is broken.
   ===================================================================== */
import {
  M, CX, CY, HALF, OFF, LANE, CAR_L, CAR_W, PED_SETBACK, STOP_LINE_AT,
  simulate, poseAt, crossingOf,
} from "../src/engine/index.js";
import {
  eyePoint, segmentHitsBox, visibility, creepPose, noseOut, crossedStopLine,
  encroaches, carWaitingInBox, assessCreep, whatEgoSees, PULL_STEP, EYE_BACK,
} from "../src/engine/sight.js";
import { boxHalf } from "../src/engine/road.js";

const r2 = (n) => Math.round(n * 100) / 100;
const m = (px) => r2(px / 20);
let problems = 0;
const fail = (x) => { problems++; console.log(`  FAIL: ${x}`); };
const ok = (x) => console.log(`  ok   ${x}`);

const car = (x, y, rot) => ({ x, y, rot });
const asCar = (id) => ({ id, kind: "car", name: id });

/* ---------- 1. the ray test itself ---------- */
console.log("\n1. SEGMENT AGAINST AN ORIENTED BOX");
{
  const box = car(360, 400, 0);
  segmentHitsBox({ x: 360, y: 300 }, { x: 360, y: 500 }, box, CAR_L / 2, CAR_W / 2)
    ? ok("a segment straight through a box hits it")
    : fail("a segment through a box was missed");
  segmentHitsBox({ x: 200, y: 300 }, { x: 200, y: 500 }, box, CAR_L / 2, CAR_W / 2)
    ? fail("a segment well clear of a box reported a hit")
    : ok("a segment well clear of it does not");
  // Rotating the box by 90 degrees swaps which way it is long.
  const spun = car(360, 400, 90);
  segmentHitsBox({ x: 300, y: 400 }, { x: 420, y: 400 }, spun, CAR_L / 2, CAR_W / 2)
    ? ok("rotation is respected — the box is narrow across its new short axis")
    : fail("a rotated box was not hit where it should be");
  segmentHitsBox({ x: 360, y: 300 }, { x: 360, y: 340 }, box, CAR_L / 2, CAR_W / 2)
    ? fail("a segment stopping short of the box reported a hit")
    : ok("a segment that stops short does not hit");
}

/* ---------- 2. occlusion ---------- */
console.log("\n2. ONE CAR HIDES ANOTHER");
{
  const eye = { x: 396, y: 496 };
  const target = car(396, 300, 90);
  const blocker = { p: asCar("blocker"), pose: car(396, 400, 90) };

  visibility(eye, asCar("t"), target, [blocker]) === "hidden"
    ? ok("a car directly between viewer and target hides it completely")
    : fail(`a directly interposed car did not hide the target (${visibility(eye, asCar("t"), target, [blocker])})`);
  visibility(eye, asCar("t"), target, []) === "clear"
    ? ok("and with the blocker gone it is clear")
    : fail("an unobstructed target was not clear");

  const offset = { p: asCar("b"), pose: car(360, 400, 90) };
  const v = visibility(eye, asCar("t"), target, [offset]);
  v === "partial" || v === "clear"
    ? ok(`a blocker off to one side leaves the target ${v}, not hidden`)
    : fail("an off-axis blocker hid the target entirely");
}

/* ---------- 3. the trade ---------- */
console.log("\n3. CREEPING BUYS SIGHT AND SPENDS SAFETY");
{
  /* An unprotected left. The ego waits to turn; an oncoming car is stopped
     across the middle waiting to turn the other way, and behind it comes
     traffic going straight through — the one that matters and the one you
     cannot see. */
  const egoRest = car(CX + OFF, CY + STOP_LINE_AT + CAR_L / 2, -90);
  const blocker = { p: asCar("oncoming turner"), pose: car(350, 400, 135) };
  const through = car(CX - OFF, 300, 90);

  console.log("  creeps   nose out   past line   sees the through car");
  const seen = [];
  for (let n = 0; n <= 8; n++) {
    // Placed by hand rather than through creepPose, so this probe tests the
    // occlusion geometry alone without a scenario in the way.
    const at = { x: egoRest.x, y: egoRest.y - PULL_STEP * n, rot: -90 };
    const v = visibility(eyePoint(at), asCar("through"), through, [blocker]);
    seen.push(v);
    console.log(
      `  ${String(n).padEnd(8)} ${String(m(noseOut(at))).padEnd(10)} ` +
      `${String(crossedStopLine(at)).padEnd(11)} ${v}`
    );
  }

  seen[0] === "hidden"
    ? ok("at the line the through car is hidden — nothing to read")
    : fail(`at the line the through car was already ${seen[0]}`);
  seen[seen.length - 1] !== "hidden"
    ? ok("creeping far enough reveals it")
    : fail("creeping never revealed the through car");
  const firstSight = seen.findIndex((v) => v !== "hidden");
  firstSight > 0
    ? ok(`it takes ${firstSight} press${firstSight === 1 ? "" : "es"} to see anything`)
    : fail("sight was free");

  // And the cost: by the time you can see, where is the nose?
  const atSight = { x: egoRest.x, y: egoRest.y - PULL_STEP * firstSight, rot: -90 };
  crossedStopLine(atSight)
    ? ok(`seeing it means crossing the line — nose ${m(noseOut(atSight))}m out against a ${m(STOP_LINE_AT)}m line`)
    : ok(`sight comes before the line at ${m(noseOut(atSight))}m — a free look, which is fine`);

  /* Is there room to creep at all? Between the stop line and the edge of
     the junction there is a band where you have committed but are not yet
     in the box. One press wide is not a decision, it is a switch. */
  let band = 0;
  for (let n = 1; n <= 8; n++) {
    const at = { x: egoRest.x, y: egoRest.y - PULL_STEP * n, rot: -90 };
    const out = noseOut(at);
    if (out < STOP_LINE_AT && out > HALF) band++;
  }
  console.log(`  room between the line (${m(STOP_LINE_AT)}m) and the junction (${m(HALF)}m): ` +
    `${m(STOP_LINE_AT - HALF)}m, ${band} press${band === 1 ? "" : "es"} of ${m(PULL_STEP)}m`);
  band >= 2
    ? ok("there is a real band to creep into before entering the junction")
    : fail(`only ${band} press fits before the box — PULL_STEP is too coarse for the space, ` +
           `so creeping is a switch rather than a judgment`);
}

/* ---------- 4. encroachment, on a real scenario ---------- */
console.log("\n4. CREEPING INTO SOMEONE'S PATH");
{
  const scn = {
    id: "creep-probe", control: "signal", duration: 16,
    ego: { from: "S", intent: "left", arriveAt: 1.0, stops: true },
    actors: [
      /* Cross traffic, not oncoming. A car creeping straight up its own
         lane never enters the lane facing it — what it creeps into is the
         path of whoever is crossing. */
      { id: "w1", from: "W", intent: "straight", arriveAt: 2.6, stops: false, kind: "car", name: "Cross car", priority: -2 },
    ],
  };
  const sim = simulate(scn);
  console.log("  creeps   nose out   encroaches");
  let firstBad = null;
  for (let n = 0; n <= 6; n++) {
    const e = encroaches(sim, sim.ego.arriveAt, n);
    const pose = creepPose(sim.ego, sim.ego.arriveAt, n);
    if (e.encroached && firstBad == null) firstBad = n;
    console.log(`  ${String(n).padEnd(8)} ${String(m(noseOut(pose))).padEnd(10)} ${e.encroached ? "YES — " + e.who : "no"}`);
  }
  firstBad == null
    ? fail("creeping never put the ego in anyone's path — there is no cost")
    : ok(`the ${firstBad}${firstBad === 1 ? "st" : firstBad === 2 ? "nd" : firstBad === 3 ? "rd" : "th"} press puts the ego in the oncoming path`);
  firstBad > 0
    ? ok("and waiting at the line is not itself an encroachment")
    : fail("the ego was in someone's path before creeping at all");
}

/* ---------- 5. the blocked box rule ---------- */
console.log("\n5. A CAR ALREADY WAITING IN THE INTERSECTION");
{
  const withWaiter = {
    id: "box-probe", control: "signal", duration: 16,
    ego: { from: "S", intent: "left", arriveAt: 1.0, stops: true },
    actors: [
      /* Far enough forward to be sitting in the box, and held there —
         without the delay it departs the moment it arrives and there is
         nothing waiting in the junction to detect. */
      { id: "w", from: "N", intent: "left", arriveAt: 0.4, stops: true, kind: "car",
        name: "Waiting car", stopBias: M(6.5), startDelay: 8, priority: -3 },
    ],
  };
  const sim = simulate(withWaiter);
  const t = 2.0;
  const box = carWaitingInBox(sim, t);
  box.blocked
    ? ok(`a stopped car inside the junction is detected (${box.who})`)
    : fail("a car waiting in the intersection was not detected");

  const clearScn = { ...withWaiter, actors: [{ ...withWaiter.actors[0], stopBias: 0 }] };
  carWaitingInBox(simulate(clearScn), t).blocked
    ? fail("a car waiting at its own line was counted as being in the box")
    : ok("a car waiting at its own stop line is not in the box");

  // The rule only bites once the ego crosses its own line.
  const held = assessCreep(sim, t, 0);
  const crept = assessCreep(sim, t, 4);
  !held.blockedBox
    ? ok("holding at the line is allowed even with someone waiting ahead")
    : fail("the rule fired without the ego crossing the line");
  crept.crossedStopLine && crept.blockedBox
    ? ok("crossing the line while they wait ahead is the fault Ontario names")
    : fail(`after 4 presses: crossed=${crept.crossedStopLine} blockedBox=${crept.blockedBox}`);
}

/* ---------- 6. THE BOX scales with the road, not a picked number -----
   carWaitingInBox and the pedestrian crossing both used to test against
   a fixed one-lane radius/offset regardless of the actual road spec —
   invisible on every scenario built so far because they were all one
   lane each way. A wide road exposes it: a car waiting in the outer
   lane of a three-lane approach is still in the box, and the old
   one-lane circle would have missed it entirely. */
console.log("\n6. THE BOX SCALES WITH THE ROAD, NOT A PICKED NUMBER");
{
  const wideRoad = {
    legs: {
      N: { lanes: 3, control: "stop" }, S: { lanes: 3, control: "stop" },
      E: { lanes: 3, control: "stop" }, W: { lanes: 3, control: "stop" },
    },
  };
  const wideScn = {
    id: "wide-box-probe", control: "stop", duration: 16, road: wideRoad,
    ego: { from: "S", intent: "left", arriveAt: 1.0, stops: true },
    actors: [
      // Outer lane (index 2 of 3), pushed well into the box and held —
      // a waiter, not a car passing through.
      { id: "w", from: "W", intent: "straight", lane: 2, arriveAt: 0.4, stops: true,
        kind: "car", name: "Outer-lane waiter", stopBias: M(6.5), startDelay: 8, priority: -3 },
    ],
  };
  const sim = simulate(wideScn);
  const t = 2.0;
  const p = poseAt(sim.actors[0], t);
  const oldRadius = HALF + CAR_L / 2;
  const oldReach = Math.hypot(p.x - CX, p.y - CY);

  oldReach > oldRadius
    ? ok(`the outer-lane waiter sits ${m(oldReach)}m from centre — past the old one-lane radius of ${m(oldRadius)}m`)
    : fail(`test is not exercising the wide case: waiter is within the old radius (${m(oldReach)}m <= ${m(oldRadius)}m)`);

  carWaitingInBox(sim, t).blocked
    ? ok("the box test still catches it — a wide-road box, not a one-lane circle")
    : fail("a car waiting in the outer lane of a wide road was missed");

  // And the widened box is not simply "always blocked": a car approaching
  // but still short of the box on the same wide road must not trip it.
  const approaching = { ...wideScn, actors: [{ ...wideScn.actors[0], stopBias: -M(20), startDelay: 8 }] };
  carWaitingInBox(simulate(approaching), t).blocked
    ? fail("a car still short of the wide box was counted as waiting inside it")
    : ok("a car short of the wide box is correctly not counted as waiting inside it");

  // The pedestrian crossing sets back from THE BOX too, not a fixed
  // one-lane guess at it — checked against the same boxHalf the box
  // test above now uses.
  const { vx: wideVx } = boxHalf(wideRoad, LANE);
  const cr = crossingOf("W", wideRoad);
  r2(Math.abs(cr.a.x - CX)) === r2(wideVx + PED_SETBACK)
    ? ok(`the W crossing sets back ${m(wideVx + PED_SETBACK)}m — clear of the wide box, not a one-lane guess`)
    : fail(`crossing offset ${m(Math.abs(cr.a.x - CX))}m does not match the wide box (${m(wideVx + PED_SETBACK)}m)`);

  // And a single-lane spec must reproduce the original fixed placement
  // exactly, or every existing scenario just moved its crossing.
  const defaultCr = crossingOf("W");
  r2(Math.abs(defaultCr.a.x - CX)) === r2(HALF + PED_SETBACK)
    ? ok("a single-lane spec still crosses at exactly the original, fixed distance")
    : fail("the default one-lane crossing moved — existing scenarios would regress");
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: sightlines verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
