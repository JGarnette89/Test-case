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
  SHOWN_ENOUGH, CALL_GRACE, FALSE_COST, LATE_CREDIT,
} from "../src/engine/detect.js";
import { faultsIn } from "../src/engine/faults.js";
import { simulate } from "../src/engine/index.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { readFileSync } from "node:fs";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

/* A drive with real, derived faults on it to grade against. */
const base = SCENARIOS.find((s) => s.id === "creeper");
const faults = faultsIn(base);
const allShown = (f) => f.duration;
const mid = (f) => (f.from + f.to) / 2;

console.log(`Grading against ${faults.length} derived fault(s) in "${base.id}".`);

/* ---------- 1. the two ways to be a bad examiner -------------------- */
console.log("\n1. THE TWO WAYS TO GET IT WRONG BOTH LOSE");
{
  const perfect = scoreDetection({ faults, marks: faults.map((f) => ({ at: mid(f) })), shownFor: allShown });
  perfect.score === 100 && perfect.missed.length === 0 && perfect.invented.length === 0
    ? ok(`catching everything, promptly, scores ${perfect.score}`)
    : fail(`a perfect drive scored ${perfect.score} (${summarise(perfect)})`);

  const silent = scoreDetection({ faults, marks: [], shownFor: allShown });
  silent.score === 0 && silent.recall === 0
    ? ok("marking nothing scores 0 — watching is not optional")
    : fail(`marking nothing scored ${silent.score}`);

  /* The one that matters most: spraying marks must be worse than playing
     properly, or the dominant strategy is to hold the button down. */
  const spray = scoreDetection({
    faults,
    marks: Array.from({ length: 40 }, (_, i) => ({ at: i * 0.3 })),
    shownFor: allShown,
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
    shownFor: allShown,
  });
  farm.hits.length === 1 && farm.invented.length === 3
    ? ok("one fault pays once; the other three calls are recorded as invented")
    : fail(`repeat-marking one fault produced ${farm.hits.length} hits`);
}

/* ---------- 2. you are not marked for what you could not see -------- */
console.log("\n2. A FAULT YOU COULD NOT SEE IS NOT ONE YOU MISSED");
{
  const blind = scoreDetection({ faults, marks: [], shownFor: () => 0 });
  blind.unmarkable.length === faults.length && blind.missed.length === 0
    ? ok(`with everything hidden, all ${faults.length} faults report as unmarkable, none as missed`)
    : fail(`blind drive reported ${blind.missed.length} missed, ${blind.unmarkable.length} unmarkable`);
  blind.score === 100
    ? ok("and a drive where nothing was observable is a clean sheet, not a failure")
    : fail(`a drive with nothing visible scored ${blind.score}`);

  /* The boundary is a real one, not a formality. */
  const just = scoreDetection({ faults, marks: [], shownFor: () => SHOWN_ENOUGH + 0.01 });
  const under = scoreDetection({ faults, marks: [], shownFor: () => SHOWN_ENOUGH - 0.01 });
  just.missed.length > 0 && under.missed.length === 0
    ? ok(`the ${SHOWN_ENOUGH}s on-screen floor decides missed from unmarkable`)
    : fail("the sight threshold does not separate missed from unmarkable");

  /* Half-seen faults still count. Seeing most of something is seeing it. */
  const partial = scoreDetection({
    faults, marks: faults.map((f) => ({ at: mid(f) })), shownFor: () => SHOWN_ENOUGH * 2,
  });
  partial.score === 100
    ? ok("a fault briefly shown and called correctly still scores full")
    : fail(`a briefly-shown fault, called correctly, scored ${partial.score}`);
}

/* ---------- 2b. THE REGRESSION THIS RULE EXISTS FOR ----------------- */
console.log("\n2b. A BRIEF LOOK IS STILL A LOOK");
{
  /* Twice now this has been got wrong the same way: gating markability on
     a SHARE of the fault duration. First it was the share the player had
     in the view cone, which made every correct call an invention for
     anyone who looked around. Now the cone is gone and the temptation is
     to gate on the share of the fault the screen showed, which fails the
     same way: a fault shown for a fifth of its life was shown PLAINLY for
     that fifth, and telling the player they did not see it is the exact
     unfairness the redesign exists to remove.

     The rule is a duration. Was it ever on screen long enough to
     register? */
  const long = faults.find((f) => f.duration > 4) || faults[0];
  const glimpse = scoreDetection({
    faults: [long],
    marks: [{ at: mid(long) }],
    shownFor: () => SHOWN_ENOUGH,       // a fraction of a long fault
  });
  glimpse.hits.length === 1 && glimpse.invented.length === 0
    ? ok(`a ${long.duration}s fault shown for only ${SHOWN_ENOUGH}s is still markable, and calling it lands`)
    : fail(`a briefly shown fault scored ${glimpse.hits.length} hits -- the share rule has crept back`);

  const never = scoreDetection({
    faults: [long], marks: [{ at: mid(long) }], shownFor: () => 0,
  });
  never.hits.length === 0 && never.unmarkable.length === 1 && never.missed.length === 0
    ? ok("a fault the screen never showed is unmarkable, and calling it is not a catch")
    : fail(`a never-shown fault produced ${never.hits.length} hits, ${never.missed.length} missed`);

  /* And nothing anywhere may ask where within the screen the player was
     looking. If that argument comes back, so does the bug. */
  const src = readFileSync(new URL("../src/engine/detect.js", import.meta.url), "utf8");
  // Prose may discuss the cone as history; CODE may not read gaze.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  /gaze|cone|lastSeenAt|LOOK_MEMORY/i.test(code)
    ? fail("detect.js code still reads gaze -- attention within the screen must not gate scoring")
    : ok("the scorer has no notion of where within the screen you were looking");
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

  const prompt = scoreDetection({ faults: [f], marks: [{ at: mid(f) }], shownFor: allShown });
  const tardy = scoreDetection({ faults: [f], marks: [{ at: f.to + CALL_GRACE * 0.9 }], shownFor: allShown });
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
      faults, marks: faults.slice(0, n).map((f) => ({ at: mid(f) })), shownFor: allShown,
    });
    scores.push(r.score);
    if (n && r.score < scores[n - 1]) monotone = false;
  }
  monotone
    ? ok(`score rises with every extra fault caught: ${scores.join(" -> ")}`)
    : fail(`score went down when more faults were caught: ${scores.join(" -> ")}`);

  /* And an invented call always costs, whatever else you did. */
  const clean = scoreDetection({ faults, marks: faults.map((f) => ({ at: mid(f) })), shownFor: allShown });
  const plusOne = scoreDetection({
    faults, marks: [...faults.map((f) => ({ at: mid(f) })), { at: 13.7 }], shownFor: allShown,
  });
  plusOne.score < clean.score && plusOne.invented.length === 1
    ? ok(`one invented call on a perfect drive costs ${clean.score - plusOne.score} marks`)
    : fail(`inventing a fault cost ${clean.score - plusOne.score}`);
}

/* ---------- 5. categorised calls, if that is the design ------------- */
console.log("\n5. NAMING THE FAULT IS OPTIONAL, AND SCORED IF GIVEN");
{
  const f = faults[0];
  const right = scoreDetection({ faults: [f], marks: [{ at: mid(f), what: f.trait }], shownFor: allShown });
  const wrong = scoreDetection({ faults: [f], marks: [{ at: mid(f), what: "notAThing" }], shownFor: allShown });
  const untyped = scoreDetection({ faults: [f], marks: [{ at: mid(f) }], shownFor: allShown });

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
    const r = scoreDetection({ faults: fs, marks: fs.map((f) => ({ at: mid(f) })), shownFor: allShown });
    graded++;
    if (!(r.score >= 0 && r.score <= 100) || Number.isNaN(r.score)) { broke++; fail(`${scn.id}: score ${r.score}`); }
  }
  broke === 0 ? ok(`${graded} situations grade cleanly, faults or none`) : null;

  const empty = scoreDetection({ faults: [], marks: [], shownFor: allShown });
  empty.score === 100
    ? ok("a faultless drive, correctly left unmarked, is a clean sheet")
    : fail(`a drive with no faults scored ${empty.score}`);
}

console.log("\n" + "=".repeat(70));
console.log(problems === 0 ? "OK: the examiner is graded on what they caught and what they invented." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
