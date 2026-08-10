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
import { simulate, OPPOSITE } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
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
  if (same) ok(`${s.id.padEnd(12)} ${base} from all four approaches`);
  else fail(`${s.id}: window changes when rotated — ${base} vs ${spun.join(", ")}`);
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

// walker holds a pedestrian pinned to the north crossing, so it cannot be
// rotated. Following a left turn it would need a different approach.
const ped = planRoute({ id: "y", legs: ["gap", "walker"] }, SCENARIOS);
if (!ped.ok && ped.problems[0].kind === "unrotatable") {
  ok("a leg with fixed pedestrian geometry is refused rather than silently misplaced");
} else {
  fail("expected the pedestrian scenario to be refused after a turn");
}
if (alignScenario(SCENARIOS.find((s) => s.id === "walker"), "E") !== null) {
  fail("walker should not be alignable to another approach");
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
