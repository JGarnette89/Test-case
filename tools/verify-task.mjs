/* =====================================================================
   MANOEUVRE VERIFICATION
   Run:  node tools/verify-task.mjs

   Covers src/engine/actions.js, which encodes rules the maintainer stated,
   so the checks are written as those rules rather than as assertions about
   code:

     signal before any change of direction or motion, and slowing counts
     as a change of motion when it leads into a turn;

     partial success is partial marks, the way a road test works —
     perfection is rewarded, not required;

     doing the right things in the wrong order is worth something, but
     not much, because a signal after the fact informed nobody;

     a critical fault ends the manoeuvre whatever the marks say, and a
     marked fault only costs points.

   Also checks the constraint that has nothing to do with driving: no
   manoeuvre may put more buttons on screen than a thumb can use.
   ===================================================================== */
import {
  ACTIONS, MAX_BUTTONS, SLOW_LEAD, OUT_OF_ORDER_CREDIT, FAULT,
  sequenceFor, orderingRules, deriveWindows, gradeTask,
  emptySheet, addToSheet, sheetOutcome,
} from "../src/engine/actions.js";
import { PROPER_SIGNAL_LEAD } from "../src/engine/index.js";

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log(`  FAIL: ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);

const press = (o) => Object.entries(o).map(([action, at]) => ({ action, at }));

/* A turn approached from a distance: signal, slow, then go. */
const TURN = sequenceFor("turn");
const w = deriveWindows(TURN, { manoeuvreAt: 8.0, legalAt: 6.5 });

/* ---------- 1. windows derived from the manoeuvre ---------- */
console.log("\n1. WINDOWS DERIVED FROM THE MANOEUVRE");
console.log(`  turn at 8.0   slow by ${r2(w.slow)}   signal by ${r2(w.signal)}   go from ${r2(w.go)}`);
w.slow === 8.0 - SLOW_LEAD
  ? ok(`slowing is due ${SLOW_LEAD}s before the turn`)
  : fail(`slow deadline ${w.slow}, expected ${8.0 - SLOW_LEAD}`);
r2(w.signal) === r2(Math.min(w.slow, w.go) - PROPER_SIGNAL_LEAD)
  ? ok(`the signal leads the first act by the proper ${PROPER_SIGNAL_LEAD}s`)
  : fail(`signal deadline ${w.signal}`);
w.signal < w.slow && w.signal < w.go
  ? ok("signal comes before any change of direction or motion, as the rule says")
  : fail("the signal is not required before every act");

/* The bug this check exists for: with a GO and no SLOW, anchoring the
   signal to the manoeuvre put its deadline after the moving-off. */
{
  const seq = ["mirror", "signal", "blindSpot", "go"];
  const lw = deriveWindows(seq, { manoeuvreAt: 9.0, legalAt: 6.0 });
  const order = seq.map((a) => lw[a]).filter((v) => v != null);
  order.every((v, i) => i === 0 || v >= order[i - 1])
    ? ok("look, then signal, then act — deadlines ascend even when GO is the first act")
    : fail(`deadlines out of sequence: ${order.map(r2).join(", ")}`);
}

/* ---------- 2. partial marks, not pass/fail ---------- */
console.log("\n2. PARTIAL SUCCESS IS PARTIAL MARKS");
const perfect = gradeTask({ sequence: TURN, windows: w, performed: press({ signal: w.signal, slow: w.slow, go: w.go + 0.1 }) });
perfect.marks === 100 && perfect.outcome === "passed" && perfect.faults.length === 0
  ? ok("all three, on time and in order, is full marks and a pass")
  : fail(`a perfect run marked ${perfect.marks}, ${perfect.outcome}, faults ${perfect.faults.length}`);

const noSlow = gradeTask({ sequence: TURN, windows: w, performed: press({ signal: w.signal, go: w.go + 0.1 }) });
noSlow.marks > 0 && noSlow.marks < 100
  ? ok(`omitting the slow still earns ${noSlow.marks} — partial, not zero`)
  : fail(`omitting one step marked ${noSlow.marks}`);
noSlow.faults.some((f) => f.id === "missed")
  ? ok("and the omission is recorded as a marked fault")
  : fail("omitting a step raised no fault");

const nothing = gradeTask({ sequence: TURN, windows: w, performed: [] });
nothing.marks === 0 ? ok("doing nothing earns nothing") : fail(`an empty run marked ${nothing.marks}`);

const lateSignal = gradeTask({ sequence: TURN, windows: w, performed: press({ signal: w.signal + 0.9, slow: w.slow, go: w.go + 0.1 }) });
lateSignal.marks > noSlow.marks && lateSignal.marks < 100
  ? ok(`a late signal costs marks without failing the manoeuvre (${lateSignal.marks})`)
  : fail(`a late signal marked ${lateSignal.marks}`);

/* ---------- 3. order ---------- */
console.log("\n3. ORDER");
const reversed = gradeTask({ sequence: TURN, windows: w, performed: press({ slow: w.signal, signal: w.slow, go: w.go + 0.1 }) });
reversed.faults.some((f) => f.id === "order")
  ? ok(`slowing before signalling is flagged out of order (${reversed.marks} marks)`)
  : fail("reversing the order was not penalised");
reversed.marks < perfect.marks && reversed.marks > 0
  ? ok("it scores below doing it properly, but not zero — the player knew to do both")
  : fail(`out of order marked ${reversed.marks} against a proper ${perfect.marks}`);

/* Half marks on the steps involved, per OUT_OF_ORDER_CREDIT. */
{
  const s = reversed.steps.find((x) => x.action === "slow");
  s && s.score <= Math.round(100 * OUT_OF_ORDER_CREDIT)
    ? ok(`an out-of-order step keeps at most ${Math.round(OUT_OF_ORDER_CREDIT * 100)}% of its own marks`)
    : fail(`out-of-order step kept ${s?.score}`);
}

/* ---------- 4. window steps and the two fault tiers ---------- */
console.log("\n4. CRITICAL FAULTS END IT, MARKED FAULTS COST POINTS");
const early = gradeTask({ sequence: TURN, windows: w, performed: press({ signal: w.signal, slow: w.slow, go: w.go - 2.0 }) });
early.faults.some((f) => f.id === "early" && f.tier === "critical")
  ? ok("going before the window is a critical fault")
  : fail("an early press was not critical");
early.outcome === "failed"
  ? ok("and fails the manoeuvre whatever the other marks were")
  : fail(`an early press left the outcome ${early.outcome}`);

const undue = gradeTask({ sequence: TURN, windows: w, performed: press({ signal: w.signal, slow: w.slow, go: w.go + 3.2 }) });
undue.faults.some((f) => f.id === "late" && f.tier === "marked")
  ? ok("undue delay is a marked fault, not a critical one")
  : fail("a very late press was not marked as undue delay");

const crept = gradeTask({ sequence: TURN, windows: w, performed: press({ signal: w.signal, slow: w.slow, go: w.go + 0.1 }), faults: [FAULT.ENCROACHED] });
crept.outcome === "failed" && crept.marks === 100
  ? ok("encroaching fails the manoeuvre even on otherwise perfect marks")
  : fail(`encroachment left ${crept.outcome} at ${crept.marks} marks`);

FAULT.BLOCKED_BOX.tier === "critical"
  ? ok("crossing the line with a car already waiting to turn ahead is critical")
  : fail("the blocked-box rule is not a critical fault");

/* ---------- 5. the sheet ---------- */
console.log("\n5. THE SHEET");
{
  let sheet = addToSheet(emptySheet, "Left turn", perfect);
  sheet = addToSheet(sheet, "Lane change", noSlow);
  sheet.items.length === 2 && sheet.marks > 0
    ? ok(`two vignettes aggregate to ${sheet.marks} marks, ${sheet.marked} marked faults`)
    : fail("the sheet did not aggregate");
  sheetOutcome(sheet) === (sheet.marks >= 60 ? "passed" : "below standard")
    ? ok(`a clean sheet reads "${sheetOutcome(sheet)}"`)
    : fail("sheet outcome disagrees with its own marks");

  const withCritical = addToSheet(sheet, "Unprotected left", early);
  sheetOutcome(withCritical) === "failed"
    ? ok("one critical fault anywhere fails the whole sheet")
    : fail(`a sheet containing a critical fault read ${sheetOutcome(withCritical)}`);
}

/* ---------- 6. playable one-handed ---------- */
console.log("\n6. PLAYABLE ONE-HANDED");
for (const name of ["straight", "turn", "laneChange", "enterLot", "unprotectedLeft"]) {
  const seq = sequenceFor(name);
  if (seq.length > MAX_BUTTONS) fail(`${name} needs ${seq.length} buttons, cap is ${MAX_BUTTONS}`);
}
ok(`every canonical sequence fits the ${MAX_BUTTONS}-button cap`);
Object.values(ACTIONS).every((a) => a.label.length <= 8)
  ? ok("every button label fits a narrow screen")
  : fail("a button label is too long for a phone");

/* Ordering rules must put the signal before every motion, generated
   rather than listed, so a new sequence cannot forget it. */
{
  const rules = orderingRules(sequenceFor("laneChange"));
  const motionsAfterSignal = rules.filter((r) => r.after === "signal").map((r) => r.action);
  motionsAfterSignal.includes("go")
    ? ok("motion actions are generated as following the signal")
    : fail("a motion action was not required to follow the signal");
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: manoeuvres verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
