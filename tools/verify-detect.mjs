/* Detection scoring: grading the examiner.
 *
 * Property-based on purpose. Restating the formula back at itself would
 * prove nothing, so what is checked here is the behaviour the design
 * claims — the things that would have to be true of ANY correct
 * implementation of "precision and recall with a clock on it":
 *
 *   - marking everything must lose, or the game is a button-masher
 *   - marking nothing must lose, or watching is optional
 *   - a fault you could not see must not count against you
 *   - more correct calls must never score worse
 *   - prompt must beat late, and late must beat silent
 */
import {
  scoreDetection, promptness, callWindow, summarise,
  CLEAR_ENOUGH, LOOK_MEMORY, CALL_GRACE, FALSE_COST, LATE_CREDIT,
} from "../src/engine/detect.js";
import { faultsIn } from "../src/engine/faults.js";
import { simulate } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

/* A drive with real, derived faults on it to grade against. */
const base = SCENARIOS.find((s) => s.id === "creeper");
const faults = faultsIn(base);
const allClear = () => 1;
const mid = (f) => (f.from + f.to) / 2;

console.log(`Grading against ${faults.length} derived fault(s) in "${base.id}".`);

/* ---------- 1. the two ways to be a bad examiner -------------------- */
console.log("\n1. THE TWO WAYS TO GET IT WRONG BOTH LOSE");
{
  const perfect = scoreDetection({ faults, marks: faults.map((f) => ({ at: mid(f) })), clearOf: allClear });
  perfect.score === 100 && perfect.missed.length === 0 && perfect.invented.length === 0
    ? ok(`catching everything, promptly, scores ${perfect.score}`)
    : fail(`a perfect drive scored ${perfect.score} (${summarise(perfect)})`);

  const silent = scoreDetection({ faults, marks: [], clearOf: allClear });
  silent.score === 0 && silent.recall === 0
    ? ok("marking nothing scores 0 — watching is not optional")
    : fail(`marking nothing scored ${silent.score}`);

  /* The one that matters most: spraying marks must be worse than playing
     properly, or the dominant strategy is to hold the button down. */
  const spray = scoreDetection({
    faults,
    marks: Array.from({ length: 40 }, (_, i) => ({ at: i * 0.3 })),
    clearOf: allClear,
  });
  spray.score < perfect.score
    ? ok(`spraying 40 marks scores ${spray.score}, well under a real drive's ${perfect.score}`)
    : fail(`spraying scored ${spray.score} vs ${perfect.score} — marking everything is viable`);
  spray.precision < 0.5
    ? ok(`and it shows in precision (${spray.precision}), which is the number that exposes it`)
    : fail(`spraying kept precision at ${spray.precision}`);

  /* A single fault cannot be farmed by marking it repeatedly. */
  const f0 = faults[0];
  const farm = scoreDetection({
    faults: [f0],
    marks: [0, 0.1, 0.2, 0.3].map((d) => ({ at: mid(f0) + d })),
    clearOf: allClear,
  });
  farm.hits.length === 1 && farm.invented.length === 3
    ? ok("one fault pays once; the other three calls are recorded as invented")
    : fail(`repeat-marking one fault produced ${farm.hits.length} hits`);
}

/* ---------- 2. you are not marked for what you could not see -------- */
console.log("\n2. A FAULT YOU COULD NOT SEE IS NOT ONE YOU MISSED");
{
  const blind = scoreDetection({ faults, marks: [], clearOf: () => 0 });
  blind.unmarkable.length === faults.length && blind.missed.length === 0
    ? ok(`with everything obstructed, all ${faults.length} faults report as unmarkable, none as missed`)
    : fail(`blind drive reported ${blind.missed.length} missed, ${blind.unmarkable.length} unmarkable`);
  blind.score === 100
    ? ok("and a drive where nothing was observable is a clean sheet, not a failure")
    : fail(`a drive with nothing visible scored ${blind.score}`);

  /* The boundary is a real one, not a formality. */
  const just = scoreDetection({ faults, marks: [], clearOf: () => CLEAR_ENOUGH + 0.01 });
  const under = scoreDetection({ faults, marks: [], clearOf: () => CLEAR_ENOUGH - 0.01 });
  just.missed.length > 0 && under.missed.length === 0
    ? ok(`the ${CLEAR_ENOUGH} obstruction threshold decides missed from unmarkable`)
    : fail("the sight threshold does not separate missed from unmarkable");

  /* Half-seen faults still count. Seeing most of something is seeing it. */
  const partial = scoreDetection({
    faults, marks: faults.map((f) => ({ at: mid(f) })), clearOf: () => 0.6,
  });
  partial.score === 100
    ? ok("a fault half-obstructed and called correctly still scores full")
    : fail(`a 60%-clear fault, called correctly, scored ${partial.score}`);
}

/* ---------- 2b. THE REGRESSION THIS FIX EXISTS FOR ------------------ */
console.log("\n2b. LOOKING AWAY MOST OF THE TIME MUST NOT BLOCK A GOOD CALL");
{
  /* The bug: markability was decided from the share of a fault the player
     had WATCHED, so anyone scanning for traffic — which the game asks for
     — fell under the threshold and had every correct, well-timed call
     recorded as invented. Measured at 5-24% share on faults they were
     staring straight at when they pressed.

     The rule now: obstruction decides whether a fault was on offer;
     whether you were looking decides whether a given mark counts. */
  const f = faults[0];
  const at = mid(f);
  const glance = scoreDetection({
    faults: [f],
    marks: [{ at }],
    clearOf: () => 1,                    // nothing was in the way
    lastSeenAt: () => at - 0.1,          // and you were looking, just then
  });
  glance.hits.length === 1 && glance.invented.length === 0
    ? ok("a mark lands when you were watching at the moment you called it, however little you watched overall")
    : fail(`a well-timed call on an unobstructed fault scored ${glance.hits.length} hits`);

  const guess = scoreDetection({
    faults: [f], marks: [{ at }],
    clearOf: () => 1,
    lastSeenAt: () => at - LOOK_MEMORY - 0.5,   // you had not looked in a while
  });
  guess.hits.length === 0 && guess.invented.length === 1
    ? ok(`calling a fault you have not looked at for ${LOOK_MEMORY}s is a guess, not an observation`)
    : fail("marking without looking still counted as a catch");

  const never = scoreDetection({
    faults: [f], marks: [], clearOf: () => 1, lastSeenAt: () => null,
  });
  never.missed.length === 1 && never.unmarkable.length === 0
    ? ok("and never looking at an unobstructed fault is a MISS, not an exemption — looking away is your call")
    : fail(`never looking produced ${never.missed.length} missed, ${never.unmarkable.length} unmarkable`);
}

/* ---------- 3. prompt beats late beats silent ----------------------- */
console.log("\n3. PROMPT BEATS LATE, AND LATE BEATS SILENT");
{
  const f = faults[0];
  const w = callWindow(f);
  const early = promptness(f, w.opens - 0.01);
  const during = promptness(f, mid(f));
  const late = promptness(f, f.to + CALL_GRACE * 0.9);
  const after = promptness(f, w.closes + 0.01);

  early === 0 && after === 0
    ? ok("outside the window a call is worth nothing at either end")
    : fail(`window edges leak (${early} before, ${after} after)`);
  during === 1
    ? ok("calling it while it is happening is worth full marks")
    : fail(`a call during the fault scored ${during}`);
  late > LATE_CREDIT - 0.01 && late < during
    ? ok(`calling it on the way out still earns ${late.toFixed(2)}, down from ${during}`)
    : fail(`late credit is ${late}, expected between ${LATE_CREDIT} and ${during}`);

  const prompt = scoreDetection({ faults: [f], marks: [{ at: mid(f) }], clearOf: allClear });
  const tardy = scoreDetection({ faults: [f], marks: [{ at: f.to + CALL_GRACE * 0.9 }], clearOf: allClear });
  prompt.score > tardy.score && tardy.score > 0
    ? ok(`so a prompt drive beats a late one (${prompt.score} vs ${tardy.score}), and late still beats nothing`)
    : fail(`prompt ${prompt.score}, late ${tardy.score} — the ordering is wrong`);
}

/* ---------- 4. more right answers never score worse ----------------- */
console.log("\n4. CATCHING MORE IS NEVER WORSE");
{
  let monotone = true;
  const scores = [];
  for (let n = 0; n <= faults.length; n++) {
    const r = scoreDetection({
      faults, marks: faults.slice(0, n).map((f) => ({ at: mid(f) })), clearOf: allClear,
    });
    scores.push(r.score);
    if (n && r.score < scores[n - 1]) monotone = false;
  }
  monotone
    ? ok(`score rises with every extra fault caught: ${scores.join(" -> ")}`)
    : fail(`score went down when more faults were caught: ${scores.join(" -> ")}`);

  /* And an invented call always costs, whatever else you did. */
  const clean = scoreDetection({ faults, marks: faults.map((f) => ({ at: mid(f) })), clearOf: allClear });
  const plusOne = scoreDetection({
    faults, marks: [...faults.map((f) => ({ at: mid(f) })), { at: 13.7 }], clearOf: allClear,
  });
  plusOne.score < clean.score && plusOne.invented.length === 1
    ? ok(`one invented call on a perfect drive costs ${clean.score - plusOne.score} marks`)
    : fail(`inventing a fault cost ${clean.score - plusOne.score}`);
}

/* ---------- 5. categorised calls, if that is the design ------------- */
console.log("\n5. NAMING THE FAULT IS OPTIONAL, AND SCORED IF GIVEN");
{
  const f = faults[0];
  const right = scoreDetection({ faults: [f], marks: [{ at: mid(f), what: f.trait }], clearOf: allClear });
  const wrong = scoreDetection({ faults: [f], marks: [{ at: mid(f), what: "notAThing" }], clearOf: allClear });
  const untyped = scoreDetection({ faults: [f], marks: [{ at: mid(f) }], clearOf: allClear });

  right.hits.length === 1 && untyped.hits.length === 1
    ? ok("a call counts whether or not it names the fault")
    : fail("an uncategorised call did not register");
  wrong.hits.length === 0 && wrong.invented.length === 1
    ? ok("naming the wrong fault is an invented call, not a free hit")
    : fail(`a miscategorised call produced ${wrong.hits.length} hits`);
}

/* ---------- 6. it works on the situations that exist ---------------- */
console.log("\n6. ACROSS THE SHIPPED SET");
{
  let graded = 0, broke = 0;
  for (const scn of SCENARIOS) {
    if (scn.layout === "roundabout") continue;
    const fs = faultsIn(scn);
    const r = scoreDetection({ faults: fs, marks: fs.map((f) => ({ at: mid(f) })), clearOf: allClear });
    graded++;
    if (!(r.score >= 0 && r.score <= 100) || Number.isNaN(r.score)) { broke++; fail(`${scn.id}: score ${r.score}`); }
  }
  broke === 0 ? ok(`${graded} situations grade cleanly, faults or none`) : null;

  const empty = scoreDetection({ faults: [], marks: [], clearOf: allClear });
  empty.score === 100
    ? ok("a faultless drive, correctly left unmarked, is a clean sheet")
    : fail(`a drive with no faults scored ${empty.score}`);
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: the examiner is graded on what they caught and what they invented." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
