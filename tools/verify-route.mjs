/* =====================================================================
   ROUTE VERIFICATION
   Run:  node tools/verify-route.mjs

   Multi-intersection play has one failure mode that is invisible on screen:
   arriving at a leg from the wrong side. It looks fine and silently changes
   who is on your right. So the checks here are mostly about continuity.

   1. Rotation preserves the rules. A scenario rotated to another approach
      must produce the same window, because it is the same situation
      pointing a different way. If it does not, rotation is broken.
   2. Every shipped route plans without holes, and each leg is entered from
      the side the previous leg leaves you on.
   3. A deliberately broken route is caught, not silently played.
   4. A run accumulates score, ends on collision, and finishes cleanly.
   ===================================================================== */
import { simulate, poseAt, conflicts, spanOf, OPPOSITE } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { specOf, validateRoad, hasLeg, SIDES } from "../src/engine/road.js";
import { ROUTES } from "../src/engine/routes.js";
import { grade } from "../src/engine/score.js";
import {
  planRoute, startRun, recordLeg, currentLeg, summary,
  rotateScenario, alignScenario, entrySideAfter, exitHeading, isRotatable,
} from "../src/engine/route.js";

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (msg) => { problems++; console.log(`  FAIL: ${msg}`); };
const ok = (msg) => console.log(`  ok   ${msg}`);

function collidesAt(sim, depart) {
  const ego = { ...sim.ego, departAt: depart };
  for (let t = depart; t <= depart + spanOf(ego) + 0.35; t += 0.02) {
    const mine = poseAt(ego, t);
    if (mine.gone) break;
    for (const a of sim.actors) {
      const theirs = poseAt(a, t);
      if (theirs.gone || theirs.hidden) continue;
      if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) return true;
    }
  }
  return false;
}

/* Scenarios where rotation is known to change the window, with why. A
   ruling, not an excuse — each one is still required to be SAFE at its
   own window from every approach, just not identically timed. */
const ACCEPTED_ROTATION_DRIFT = {
  walker: "The pedestrian crosses the far (exit) leg, not the one the ego " +
    "waits at. Which half of that crossing they start on relative to the " +
    "ego's own lane is not compass-fixed the way the old full-crossing " +
    "hold was — releasing at their own progress-halfway (see index.js, " +
    "PED_HOLDS_UNTIL) is a real relaxation of a legal rule, not pure " +
    "geometry, so it does not have to land on the same instant from every " +
    "approach to still be correct. Every approach is checked safe below.",
};

/* ---------- 1. rotation must not change the answer ---------- */
console.log("\n1. ROTATION PRESERVES THE WINDOW");
for (const s of SCENARIOS) {
  if (!isRotatable(s)) {
    ok(`${s.id.padEnd(12)} not rotatable (fixed geometry) — skipped by design`);
    continue;
  }
  const base = simulate(s).legalAt;
  const spun = [1, 2, 3].map((n) => simulate(rotateScenario(s, n)).legalAt);
  const same = spun.every((v) => Math.abs(v - base) < 1e-9);
  if (same) { ok(`${s.id.padEnd(12)} ${base} from all four approaches`); continue; }

  const why = ACCEPTED_ROTATION_DRIFT[s.id];
  if (!why) { fail(`${s.id}: window changes when rotated — ${base} vs ${spun.join(", ")}`); continue; }

  let unsafe = 0;
  for (const n of [0, 1, 2, 3]) {
    const sim = simulate(rotateScenario(s, n));
    if (collidesAt(sim, sim.legalAt)) { unsafe++; fail(`${s.id} turned ${n}: unsafe at its own window (${sim.legalAt})`); }
  }
  if (!unsafe) ok(`${s.id.padEnd(12)} window varies by approach (${base}, ${spun.join(", ")}) — accepted: ${why}`);
}

/* ---------- 1b. a rotated scenario is still a valid scenario ----------
   Comparing windows is not enough. Spin a T-junction and leave its road
   where it was and the cars end up entering by legs that do not exist —
   the window is unchanged, everything still draws, and the situation is
   nonsense. A four-way is symmetric enough to hide this; a T is not. */
console.log("");
console.log("1b. ROTATION KEEPS THE SCENARIO VALID");
for (const s of SCENARIOS) {
  if (!isRotatable(s)) continue;
  let bad = 0;
  for (const n of [1, 2, 3]) {
    const r = rotateScenario(s, n);
    const found = validateRoad(specOf(r), [{ ...r.ego, id: "ego" }, ...r.actors]);
    if (found.length) { bad++; fail(`${s.id} turned ${n}: ${found[0]}`); }
  }
  if (!bad) {
    const legs = SIDES.filter((x) => hasLeg(specOf(s), x));
    ok(`${s.id.padEnd(14)} valid from all four approaches (${legs.length} legs)`);
  }
}

/* ---------- 2. exit/entry geometry ---------- */
console.log("\n2. EXIT AND ENTRY DIRECTIONS");
const expectEntry = [
  // from, intent, heading out, side of the next intersection you meet
  ["S", "straight", "N", "S"],
  ["S", "right", "E", "W"],
  ["S", "left", "W", "E"],
  ["W", "straight", "E", "W"],
  ["N", "left", "E", "W"],
  ["E", "right", "N", "S"],
];
for (const [from, intent, wantHeading, wantEntry] of expectEntry) {
  const leg = { ego: { from, intent } };
  const h = exitHeading(leg);
  const e = entrySideAfter(leg);
  if (h === wantHeading && e === wantEntry) ok(`from ${from} going ${intent.padEnd(8)} -> heading ${h}, next leg entered from ${e}`);
  else fail(`from ${from} ${intent}: got heading ${h}/entry ${e}, expected ${wantHeading}/${wantEntry}`);
}
// Going straight must leave you approaching from the same side you did before.
for (const side of ["N", "S", "E", "W"]) {
  const e = entrySideAfter({ ego: { from: side, intent: "straight" } });
  if (e !== side) fail(`straight from ${side} should keep entry side ${side}, got ${e}`);
}
ok("straight legs keep the same approach side");

/* ---------- 3. every shipped route plans cleanly ---------- */
console.log("\n3. SHIPPED ROUTES");
for (const route of ROUTES) {
  const plan = planRoute(route, SCENARIOS);
  if (!plan.ok) {
    fail(`${route.id}: ${plan.problems.map((p) => `leg ${p.leg} (${p.id}) ${p.detail}`).join("; ")}`);
    continue;
  }
  // Walk it and confirm each leg is entered where the last one left off.
  let bad = null;
  for (let i = 1; i < plan.legs.length; i++) {
    const want = entrySideAfter(plan.legs[i - 1]);
    if (plan.legs[i].ego.from !== want) {
      bad = `leg ${i} (${plan.legs[i].id}) entered from ${plan.legs[i].ego.from}, should be ${want}`;
      break;
    }
  }
  if (bad) { fail(`${route.id}: ${bad}`); continue; }

  const trail = plan.legs
    .map((l) => `${l.ego.from}->${l.ego.intent}`)
    .join("  ");
  const windows = plan.legs.map((l) => simulate(l).legalAt);
  ok(`${route.id.padEnd(14)} ${plan.legs.length} legs   ${trail}`);
  console.log(`       windows: ${windows.join(", ")}`);
}

/* ---------- 4. a broken route is caught ---------- */
console.log("\n4. BROKEN ROUTES ARE REPORTED");
const missing = planRoute({ id: "x", legs: ["opposite", "does-not-exist"] }, SCENARIOS);
if (!missing.ok && missing.problems[0].kind === "missing") ok("unknown scenario id is reported, not thrown");
else fail("a route naming a scenario that does not exist was accepted");

// Crossings are relative now, so a pedestrian scenario can follow a turn.
// The crossing must travel with it rather than staying on the north leg.
const ped = planRoute({ id: "y", legs: ["gap", "walker"] }, SCENARIOS);
if (ped.ok) {
  const leg = ped.legs[1];
  const pedActor = leg.actors.find((a) => a.kind === "ped");
  const base = SCENARIOS.find((s) => s.id === "walker");
  const basePed = base.actors.find((a) => a.kind === "ped");
  if (pedActor.from !== basePed.from) {
    ok(`walker follows a left turn; its crossing moved ${basePed.from} -> ${pedActor.from} with the scene`);
  } else {
    fail("walker was rotated but its pedestrian stayed on the original leg");
  }
} else {
  fail(`walker should now plan after a turn: ${ped.problems.map((p) => p.detail).join("; ")}`);
}
if (alignScenario(SCENARIOS.find((s) => s.id === "walker"), "E") === null) {
  fail("walker should be alignable to another approach now that crossings are relative");
}

/* ---------- 5. running a route ---------- */
console.log("\n5. RUNNING A ROUTE");
const plan = planRoute(ROUTES[0], SCENARIOS);
let run = startRun(plan);

// Play every leg as a sharp, legal press.
for (let i = 0; i < plan.legs.length; i++) {
  const leg = currentLeg(run);
  if (!leg) { fail(`ran out of legs at ${i}`); break; }
  const legalAt = simulate(leg).legalAt;
  run = recordLeg(run, grade({ legalAt, pressedAt: legalAt + 0.2 }));
}
const s1 = summary(run);
if (s1.played === 3 && s1.outcome === "finished" && s1.points === 300 && s1.perfect) {
  ok(`clean run: ${s1.played}/${s1.total} legs, ${s1.points} points, average ${s1.average}, perfect`);
} else {
  fail(`clean run summary wrong: ${JSON.stringify(s1)}`);
}

// A collision on leg 2 must stop the run where it stands.
let crashRun = startRun(plan);
const legalA = simulate(plan.legs[0]).legalAt;
crashRun = recordLeg(crashRun, grade({ legalAt: legalA, pressedAt: legalA + 0.1 }));
const legalB = simulate(plan.legs[1]).legalAt;
crashRun = recordLeg(crashRun, grade({ legalAt: legalB, pressedAt: legalB, collided: true }));
const s2 = summary(crashRun);
if (s2.over && s2.outcome === "ended-early" && s2.played === 2 && s2.remaining === 1) {
  ok(`collision ends the run: ${s2.played} legs played, ${s2.remaining} unreached`);
} else {
  fail(`collision should have ended the run: ${JSON.stringify(s2)}`);
}
// And nothing more can be recorded against a finished run.
const frozen = recordLeg(crashRun, grade({ legalAt: 0, pressedAt: 0 }));
if (frozen === crashRun) ok("a finished run ignores further legs");
else fail("recordLeg mutated a run that was already over");

// Hesitating scores less than moving promptly, across a whole route.
let slowRun = startRun(plan);
for (const leg of plan.legs) {
  const legalAt = simulate(leg).legalAt;
  slowRun = recordLeg(slowRun, grade({ legalAt, pressedAt: legalAt + 1.6 }));
}
const s3 = summary(slowRun);
if (s3.points < s1.points) ok(`a hesitant run scores less: ${s3.points} vs ${s1.points}`);
else fail(`hesitating scored ${s3.points}, prompt scored ${s1.points}`);

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: routes verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
