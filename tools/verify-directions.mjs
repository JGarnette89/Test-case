/* Directions: the instruction window, and what stacking costs.
 *
 * The maintainer's rule is that an instruction is given as early as it is
 * clear what it is specifically asking, and that stacking instructions
 * buys the examiner attention at the cost of the candidate's
 * concentration. Both halves have to be true of the code, not just of the
 * comments:
 *
 *   1. The window is DERIVED — it opens when the phrase stops being
 *      ambiguous and closes when the candidate must already be acting.
 *      A manoeuvre that needs more of the driver gets an earlier deadline
 *      on its own, without anything being typed in per scenario.
 *   2. Stacking actually loads the driver. Not "a number goes up" —
 *      measurably worse driving, read through the same fault derivation
 *      the examiner marks against.
 *   3. A late instruction is the examiner's fault and the candidate
 *      carries on straight, because silence means straight on.
 *   4. An unloaded candidate is exactly today's candidate.
 */
import {
  instructionWindow, pressureOf, skillUnderPressure, severityUnder,
  loadCandidate, attribute, phraseFor, runwayNeeded, FOLLOW_LAG, DEFAULT_INTENT,
} from "../src/engine/directions.js";
import { faultsIn } from "../src/engine/faults.js";
import { simulate } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

const m = (px) => Math.round((px / 20) * 100) / 100;
let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

/* ---------- 1. the window is derived ------------------------------- */
console.log("1. THE INSTRUCTION WINDOW IS DERIVED, NOT TYPED IN");
{
  console.log("\n   situation    asks for     opens   must act   deadline   room");
  console.log("   " + "-".repeat(65));
  let bad = 0, viable = 0;
  const byIntent = { left: [], right: [], straight: [] };

  for (const scn of SCENARIOS) {
    if (scn.layout === "roundabout") continue;
    const w = instructionWindow(simulate(scn));
    if (w.viable) viable++; else bad++;
    byIntent[w.intent]?.push(w.deadline - w.opensAt);
    console.log(
      `   ${scn.id.padEnd(12)} ${w.intent.padEnd(12)} ` +
      `${w.opensAt.toFixed(2).padStart(5)}  ${w.mustActBy.toFixed(2).padStart(8)}   ` +
      `${w.deadline.toFixed(2).padStart(8)}   ${(w.deadline - w.opensAt).toFixed(2).padStart(5)}s`
    );
  }
  /* A situation is directable only if it carries enough approach for the
     manoeuvre it asks for. Straight-on legs need 1s and all of them have
     it. Turns need 5.5s and NONE of the shipped set has any, because
     every existing situation was authored for a driver who only had to
     press GO — its clock starts at the stop line. That is the re-timing
     the examiner game needs, and it is reported here as a shortfall in
     seconds rather than hidden behind a passing check.

     What is actually asserted: straight-on legs must stay directable, and
     every turn must fail for exactly the derived reason and by exactly
     the derived amount. A turn that failed by some OTHER amount would
     mean the requirement is not really derived. */
  const straights = SCENARIOS.filter((s) => s.layout !== "roundabout" && (s.ego.intent ?? "straight") === "straight");
  const badStraights = straights.filter((s) => !instructionWindow(simulate(s)).viable);
  badStraights.length === 0
    ? ok(`all ${straights.length} straight-on situations are directable today`)
    : fail(`${badStraights.length} straight-on situation(s) cannot be directed: ${badStraights.map((s) => s.id).join(", ")}`);

  const turnLegs = SCENARIOS.filter((s) => s.layout !== "roundabout" && ["left", "right"].includes(s.ego.intent));
  let mismatched = 0;
  const shortfalls = [];
  for (const scn of turnLegs) {
    const sim = simulate(scn);
    const w = instructionWindow(sim);
    const need = runwayNeeded(w.intent);
    const have = w.mustActBy + need - FOLLOW_LAG;   // departure, in leg time
    const shortBy = need - have;
    shortfalls.push(`${scn.id} short ${shortBy.toFixed(2)}s`);
    // The window should miss by exactly the runway it lacks.
    if (Math.abs((w.opensAt - w.deadline) - shortBy) > 1e-9) mismatched++;
  }
  mismatched === 0
    ? ok(`every turn misses by exactly the runway it lacks, ${runwayNeeded("left")}s needed (${shortfalls.join(", ")})`)
    : fail(`${mismatched} turn(s) miss by an amount the requirement does not explain`);
  console.log(`   note: no shipped situation carries approach for a turn — examiner content must.`);

  /* Derived means it responds to the manoeuvre. A turn asks the candidate
     for a signal and a slow before the act; going straight asks for
     neither, so its deadline sits later. If both came out the same, the
     window would be a constant wearing a derivation's clothes. */
  const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const turns = [...byIntent.left, ...byIntent.right];
  if (turns.length && byIntent.straight.length) {
    avg(turns) < avg(byIntent.straight)
      ? ok(`a turn must be called earlier than a straight-on (${avg(turns).toFixed(2)}s of room vs ${avg(byIntent.straight).toFixed(2)}s)`)
      : fail(`turns and straights get the same room (${avg(turns).toFixed(2)}s vs ${avg(byIntent.straight).toFixed(2)}s) - not really derived`);
  }

  let tooLate = 0;
  for (const scn of SCENARIOS) {
    if (scn.layout === "roundabout") continue;
    const w = instructionWindow(simulate(scn));
    if (w.deadline > w.mustActBy - FOLLOW_LAG + 1e-9) tooLate++;
  }
  tooLate === 0
    ? ok(`every deadline lands a full ${FOLLOW_LAG}s before the candidate must act on it`)
    : fail(`${tooLate} deadline(s) leave no time to follow the instruction`);
}

/* ---------- 2. stacking really loads the driver -------------------- */
console.log("\n2. STACKING BUYS YOUR ATTENTION AND SPENDS THEIRS");
{
  pressureOf(0) === 0
    ? ok("carrying one instruction is free - the correct common play costs nothing")
    : fail(`an unstacked candidate is already under ${pressureOf(0)} pressure`);

  let monotone = true;
  for (let n = 1; n <= 4; n++) {
    if (!(pressureOf(n) > pressureOf(n - 1) || pressureOf(n) === 1)) monotone = false;
  }
  monotone ? ok("each extra instruction held raises the load") : fail("pressure is not monotone in instructions held");

  let dropping = true;
  for (let n = 1; n <= 3; n++) {
    if (!(skillUnderPressure(1, pressureOf(n)) < skillUnderPressure(1, pressureOf(n - 1)))) dropping = false;
  }
  dropping ? ok("load lowers composure") : fail("pressure does not lower skill");

  /* The measurement that matters: not that a number moved, but that the
     candidate demonstrably drives worse - read through the very same
     derivation the examiner is marking against. */
  console.log("\n   held  pressure  skill  severity   wideTurn error   slowStart error");
  console.log("   " + "-".repeat(66));
  const base = SCENARIOS.find((s) => s.id === "gap");
  const rows = [];
  for (const held of [0, 1, 2, 3]) {
    const line = {
      held,
      p: pressureOf(held),
      s: skillUnderPressure(1, pressureOf(held)),
      sev: severityUnder(held),
    };
    for (const trait of ["wideTurn", "slowStart"]) {
      const scn = loadCandidate({ ...base, ego: { ...base.ego, traits: [trait] } }, { held });
      const f = faultsIn(scn).find((x) => x.who === "ego" && x.trait === trait);
      line[trait] = f ? f.peakPos : 0;
    }
    rows.push(line);
    console.log(
      `   ${String(line.held).padStart(4)}  ${line.p.toFixed(2).padStart(8)}  ${line.s.toFixed(2).padStart(5)}  ` +
      `${line.sev.toFixed(2).padStart(8)}   ${(m(line.wideTurn) + "m").padStart(13)}   ${(m(line.slowStart) + "m").padStart(14)}`
    );
  }

  for (const trait of ["wideTurn", "slowStart"]) {
    const first = rows[0][trait], last = rows[rows.length - 1][trait];
    let rising = true;
    for (let i = 1; i < rows.length; i++) if (!(rows[i][trait] > rows[i - 1][trait])) rising = false;
    rising && last > first
      ? ok(`${trait} gets steadily worse under load (${m(first)}m clear-headed, ${m(last)}m at full stack, ${((last / first - 1) * 100).toFixed(0)}% worse)`)
      : fail(`${trait} did not worsen monotonically under load (${m(first)}m to ${m(last)}m)`);
  }
}

/* ---------- 3. silence, and whose fault it was --------------------- */
console.log("\n3. SILENCE MEANS STRAIGHT ON, AND LATENESS IS YOURS");
{
  const w = instructionWindow(simulate(SCENARIOS.find((s) => s.id === "opposite")));

  const never = attribute(null, w);
  never.blame === "examiner" && never.followed === DEFAULT_INTENT
    ? ok("never given: the candidate carries on straight, and it is the examiner's error")
    : fail(`never-given resolved to blame=${never.blame} followed=${never.followed}`);

  const late = attribute(w.deadline + 0.5, w);
  late.blame === "examiner" && late.followed === DEFAULT_INTENT
    ? ok("given late: a missed turn, charged to the examiner, not markable against the candidate")
    : fail(`a late instruction resolved to blame=${late.blame} followed=${late.followed}`);

  const good = attribute((w.opensAt + w.deadline) / 2, w);
  good.verdict === "in-window" && good.blame === null && good.followed === w.intent
    ? ok("given in the window: no blame, and the candidate does what was asked")
    : fail(`an in-window instruction resolved to ${good.verdict}`);

  const early = attribute(w.opensAt - 2, w);
  early.verdict === "stacked" && early.blame === null
    ? ok("given early: allowed and blameless, the cost lands as load rather than as a mark")
    : fail(`an early instruction resolved to ${early.verdict}/${early.blame}, it should be a free trade`);

  phraseFor("left").toLowerCase().includes("left") && phraseFor("straight").toLowerCase().includes("ahead")
    ? ok("the phrase says what it asks for")
    : fail("phraseFor does not name the direction it means");
}

/* ---------- 4. an unloaded candidate is today's candidate ---------- */
console.log("\n4. NOTHING CHANGES FOR A CANDIDATE UNDER NO LOAD");
{
  const base = SCENARIOS.find((s) => s.id === "creeper");
  const plain = JSON.stringify(faultsIn(base));
  const loaded0 = JSON.stringify(faultsIn(loadCandidate(base, { held: 0 })));
  plain === loaded0
    ? ok("held=0 reproduces the unloaded drive exactly, fault for fault")
    : fail("applying zero load changed the drive");

  skillUnderPressure(1, 0) === 1
    ? ok("skill defaults to 1, so every existing scenario is untouched")
    : fail(`skillUnderPressure(1, 0) returned ${skillUnderPressure(1, 0)}`);
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: directions derive, and stacking is a real trade." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
