/* =====================================================================
   THE PERFORMANCE INSTRUMENT, PROVEN BEFORE A PHONE IS ASKED TO RUN IT.

   The budget ramp runs inside the screen's animation loop, and the
   preview pane this project is developed in delivers no animation
   frames (CLAUDE.md item 7), so the ramp has never been watched to
   completion here. This drives it with synthetic frames instead: it
   must terminate, stop at the first failing step, keep the scene-build
   stall out of the record, and derive the cap from what passed.

   What it cannot check is a real frame time -- that is the phone's job,
   and the report it produces is the number that matters.
   ===================================================================== */
import { perfMeter, budgetRamp, rampSteps, reportText, BUDGET, HITCH } from "../src/iso/perf.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };

/* Drive a ramp at a given frame time per step, with a stall on the
   frame after each load, as the real screen produces one. */
function drive(frameMsForStep, { settle = 1, hold = 8 } = {}) {
  const ramp = budgetRamp({ settle, hold });
  let now = 0, pending = null, stepIndex = -1, frames = 0;
  const drew = () => ({ cars: 10 * (stepIndex + 1), items: 100 * (stepIndex + 1) });
  for (let guard = 0; guard < 100000; guard++) {
    const out = ramp.frame(now, drew());
    frames++;
    if (out.done) return { ...out, frames, seconds: now / 1000 };
    if (out.load) { stepIndex++; pending = 400; }         // the scene build: a stall
    const dt = pending != null ? pending : frameMsForStep(stepIndex, frames);
    pending = null;
    now += dt;
  }
  throw new Error("the ramp did not terminate");
}

/* 1. Every step passes: the ramp runs the whole way and the cap is the last step. */
{
  const r = drive(() => 16.7);
  check(r.done, "a ramp of passing steps terminates");
  check(r.results.length === rampSteps().length, `it records every step (${r.results.length} of ${rampSteps().length})`);
  check(r.results.every((x) => x.pass), "every step passes at 60 fps");
  check(r.cap && r.cap.step === rampSteps().length && r.cap.brokeAt === null, `the cap is the last step (${r.cap?.step}), nothing broke`);
  check(r.results.every((x) => x.worst < HITCH), `the scene-build stall is kept out of every step's record (worst ${Math.max(...r.results.map((x) => x.worst))} ms)`);
  check(r.seconds > rampSteps().length * 9 && r.seconds < rampSteps().length * 9 + 5, `the whole ramp takes about ${rampSteps().length * 9} s (${r.seconds.toFixed(1)} s)`);
  check(r.results[2].cars === 30 && r.results[2].items === 300, "each step records what it drew");
}

/* 2. A step fails: the ramp stops there, and the cap is the step before. */
{
  const r = drive((i) => (i === 2 ? 30 : 16.7));   // step 3 runs at 33 fps: p95 over budget
  check(r.results.length === 3, `the ramp stops at the first failing step (${r.results.length} recorded)`);
  check(!r.results[2].pass && r.results[1].pass, "step 3 fails, step 2 passed");
  check(r.cap?.step === 2 && r.cap?.brokeAt === 3, `the cap is step 2 and it broke at 3 (${r.cap?.step}, ${r.cap?.brokeAt})`);
}

/* 3. A single hitch fails a step, because the budget says no hitching. */
{
  const r = drive((i, f) => (i === 0 && f % 200 === 100 ? HITCH + 5 : 16.7));
  check(r.results.length === 1 && !r.results[0].pass, "one hitch in an otherwise clean step fails it");
  check(r.cap === null, "no step passed, so there is no cap");
}

/* 4. A slow second fails a step even when the p95 would pass. */
{
  const m = perfMeter();
  for (let i = 0; i < 300; i++) m.record(16.7);
  for (let i = 0; i < 25; i++) m.record(40);      // one second at 25 fps
  for (let i = 0; i < 300; i++) m.record(16.7);
  const s = m.summary();
  check(s.slowSeconds === 1 && !m.passes(s), `a second under 30 fps is counted and fails (${s.slowSeconds} slow second, p95 ${s.p95})`);
}

/* 5. The report says what the budget was and what the cap is. */
{
  const r = drive((i) => (i === 3 ? 30 : 16.7));
  const text = reportText({ device: { ua: "test", cores: 8, memoryGB: 8, dpr: 2, screen: "1x1", viewport: "1x1" }, results: r.results, cap: r.cap, canvas: "1x1" });
  check(text.includes(`p95 <= ${BUDGET.p95}ms`) && text.includes(`${BUDGET.max}ms`), "the report states the budget");
  check(/cap: the budget held up to 30 cars/.test(text) && /broke at step 4/.test(text), "the report states the cap and where it broke");
  check(text.split("\n").length === 6 + r.results.length, "one line per step, plus five of header and one of cap");
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the budget ramp terminates, stops at the first failure, ignores the scene build, and derives the cap.");
