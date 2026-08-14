/* =====================================================================
   TASK VERIFICATION
   Run:  node tools/verify-task.mjs

   The task model encodes rules the maintainer stated, so the checks are
   written as those rules rather than as assertions about code:

     signal before any change of direction or motion, and slowing counts
     as a change of motion when it leads into a turn;

     partial success is partial marks, the way a road test works —
     perfection is rewarded, not required;

     doing the right things in the wrong order is worth something, but
     not much, because a signal after the fact informed nobody.

   Also checks the constraint that has nothing to do with driving: no task
   may put more buttons on screen than a thumb can use.
   ===================================================================== */
import {
  ACTIONS, MAX_BUTTONS, SLOW_LEAD, OUT_OF_ORDER_CREDIT,
  deriveTask, gradeTask,
} from "../src/engine/task.js";
import { PROPER_SIGNAL_LEAD } from "../src/engine/index.js";

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log(`  FAIL: ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);

/* A turn approached from a distance: signal, then slow, then turn. */
const TURN = { steps: ["signal", "slow"] };
const task = deriveTask(TURN, { manoeuvreAt: 8.0 });
const by = Object.fromEntries(task.steps.map((s) => [s.id, s.at]));

/* ---------- 1. the deadlines fall out of the rule ---------- */
console.log("\n1. DEADLINES DERIVED FROM THE MANOEUVRE");
console.log(`  turn at 8.0   slow by ${r2(by.slow)}   signal by ${r2(by.signal)}`);
by.slow === 8.0 - SLOW_LEAD
  ? ok(`slowing is due ${SLOW_LEAD}s before the turn`)
  : fail(`slow deadline is ${by.slow}, expected ${8.0 - SLOW_LEAD}`);
r2(by.signal) === r2(by.slow - PROPER_SIGNAL_LEAD)
  ? ok(`the signal precedes the slow by the proper ${PROPER_SIGNAL_LEAD}s lead`)
  : fail(`signal deadline is ${by.signal}, expected ${by.slow - PROPER_SIGNAL_LEAD}`);
by.signal < by.slow
  ? ok("signal comes before any change of motion, as the rule says")
  : fail("the signal is not required before the slow");

/* ---------- 2. partial marks, not pass/fail ---------- */
console.log("\n2. PARTIAL SUCCESS IS PARTIAL MARKS");
const perfect = gradeTask(task, { signal: by.signal, slow: by.slow });
perfect.score === 100 && perfect.clean
  ? ok("doing both, on time and in order, is full marks")
  : fail(`a perfect run scored ${perfect.score} with faults ${JSON.stringify(perfect.faults)}`);

const halfDone = gradeTask(task, { signal: by.signal });
halfDone.score > 0 && halfDone.score < 100
  ? ok(`signalling but never slowing still earns ${halfDone.score} — partial, not zero`)
  : fail(`omitting one step scored ${halfDone.score}, expected partial credit`);

const nothing = gradeTask(task, {});
nothing.score === 0 ? ok("doing nothing earns nothing") : fail(`an empty run scored ${nothing.score}`);

const slightlyLate = gradeTask(task, { signal: by.signal + 0.8, slow: by.slow });
slightlyLate.score > halfDone.score && slightlyLate.score < 100
  ? ok(`a slightly late signal costs marks without failing the task (${slightlyLate.score})`)
  : fail(`a late signal scored ${slightlyLate.score}`);

/* ---------- 3. order ---------- */
console.log("\n3. ORDER");
const reversed = gradeTask(task, { slow: by.signal, signal: by.slow });
const bothFlagged = reversed.marks.filter((m) => m.fault === "out of order").length;
bothFlagged > 0
  ? ok(`slowing before signalling is flagged out of order (${reversed.score} marks)`)
  : fail("reversing the order was not penalised");
reversed.score < perfect.score
  ? ok("and scores below doing it properly")
  : fail(`out of order scored ${reversed.score} against a proper ${perfect.score}`);
reversed.score > 0
  ? ok("but not zero — the player knew to do both")
  : fail("out of order scored nothing; partial credit was intended");

const cap = Math.round(OUT_OF_ORDER_CREDIT * 100);
reversed.score <= cap + 1
  ? ok(`out-of-order credit is capped near ${cap}%`)
  : fail(`out of order kept ${reversed.score}%, above the ${cap}% cap`);

/* ---------- 4. a window step still behaves ---------- */
console.log("\n4. WINDOW STEPS ARE UNCHANGED");
{
  const t = deriveTask({ steps: ["signal", "go"] }, { manoeuvreAt: 6.0, legalAt: 4.0 });
  const goStep = t.steps.find((s) => s.id === "go");
  goStep.at === 4.0 ? ok("the go step takes the engine's window") : fail(`go anchored at ${goStep.at}`);

  const early = gradeTask(t, { signal: 0.5, go: 2.0 });
  early.marks.find((m) => m.id === "go").fault === "failure to yield"
    ? ok("going before the window is a failure to yield, worth nothing")
    : fail("an early press was not marked as a failure to yield");

  const late = gradeTask(t, { signal: 0.5, go: 4.0 + 3.0 });
  late.marks.find((m) => m.id === "go").fault === "undue delay"
    ? ok("going far too late is undue delay")
    : fail("a very late press was not marked as undue delay");

  const good = gradeTask(t, { signal: 0.5, go: 4.1 });
  good.score === 100 ? ok("signalling then going on the window is full marks") : fail(`scored ${good.score}`);
}

/* ---------- 5. it has to be playable on a phone ---------- */
console.log("\n5. PLAYABLE ONE-HANDED");
{
  const biggest = deriveTask({ steps: ["mirror", "blindspot", "signal", "go"] }, { manoeuvreAt: 9, legalAt: 6 });
  biggest.steps.length <= MAX_BUTTONS
    ? ok(`the largest task uses ${biggest.steps.length} buttons, cap is ${MAX_BUTTONS}`)
    : fail(`${biggest.steps.length} buttons exceeds the ${MAX_BUTTONS} cap`);

  const order = biggest.steps.map((s) => s.at);
  const ascending = order.every((v, i) => i === 0 || v >= order[i - 1]);
  ascending
    ? ok("look, then signal, then act — deadlines are in the order taught")
    : fail(`deadlines are out of sequence: ${order.map(r2).join(", ")}`);

  Object.values(ACTIONS).every((a) => a.label.length <= 8)
    ? ok("every button label fits a narrow screen")
    : fail("a button label is too long for a phone");
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: tasks verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
