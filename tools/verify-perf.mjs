/* =====================================================================
   THE PERFORMANCE INSTRUMENT, PROVEN BEFORE A PHONE IS ASKED TO RUN IT.

   The budget ramp runs inside the screen's animation loop, and the
   preview pane this project is developed in delivers no animation
   frames (CLAUDE.md item 7), so the ramp has never been watched to
   completion here. This drives it with synthetic frames instead: it
   must terminate, run past a hitch but stop at a steady-state failure,
   keep the scene-build stall out of the record, log every stall with
   what the frame was doing, and derive both caps from what passed.

   What it cannot check is a real frame time -- that is the phone's job,
   and the report it produces is the number that matters.
   ===================================================================== */
import { perfMeter, budgetRamp, rampSteps, reportText, gcProbe, deviceIdentity, BUDGET, HITCH } from "../src/iso/perf.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const N = rampSteps().length;

/* Drive a ramp: `frameMs(stepIndex, frameInStep)` gives each frame's
   length, `flagsFor(stepIndex, frameInStep)` what the frame did. A
   stall follows every load, as the real scene build produces one. */
function drive(frameMs, flagsFor = () => ({}), { settle = 1, hold = 8 } = {}) {
  const ramp = budgetRamp({ settle, hold });
  let now = 0, pending = null, stepIndex = -1, frames = 0, inStep = 0;
  const drew = () => ({ cars: 10 * (stepIndex + 1), items: 100 * (stepIndex + 1) });
  for (let guard = 0; guard < 100000; guard++) {
    const out = ramp.frame(now, drew(), flagsFor(stepIndex, inStep));
    frames++; inStep++;
    if (out.done) return { ...out, frames, seconds: now / 1000 };
    if (out.load) { stepIndex++; inStep = 0; pending = 400; }
    const dt = pending != null ? pending : frameMs(stepIndex, inStep);
    pending = null;
    now += dt;
  }
  throw new Error("the ramp did not terminate");
}

/* 1. Every step passes: the ramp runs the whole way and both caps are the last step. */
{
  const r = drive(() => 16.7);
  check(r.done, "a ramp of passing steps terminates");
  check(r.results.length === N, `it records every step (${r.results.length} of ${N})`);
  check(r.results.every((x) => x.pass && x.steady), "every step passes, strictly and steadily, at 60 fps");
  check(r.cap?.label === rampSteps()[N - 1].label && r.cap?.brokeAt === null, `the strict cap is the last step (${r.cap?.label}), nothing broke`);
  check(r.steadyCap?.label === r.cap?.label, "and the steady cap agrees");
  check(r.results.every((x) => x.worst < HITCH && x.stallLog.length === 0), `the scene-build stall is kept out of every step's record (worst ${Math.max(...r.results.map((x) => x.worst))} ms, no stalls logged)`);
  check(r.seconds > N * 9 && r.seconds < N * 9 + 5, `the whole ramp takes about ${N * 9} s (${r.seconds.toFixed(1)} s)`);
  check(r.results[2].cars === 30 && r.results[2].items === 300, "each step records what it drew");
  check(r.results[0].hud === true && r.results.slice(1).every((x) => x.hud === false), "the first step is the HUD-on probe and the rest run with it off");
}

/* 2. A steady failure stops the ramp; the caps are the step before. */
{
  const r = drive((i) => (i === 2 ? 30 : 16.7));   // step 3 runs at 33 fps: p95 over budget
  check(r.results.length === 3, `the ramp stops at the first steady-state failure (${r.results.length} recorded)`);
  check(!r.results[2].steady && r.results[1].steady, "step 3 fails its steady state, step 2 passed");
  const [, before, broke] = rampSteps();
  check(r.cap?.label === before.label && r.cap?.brokeAt === broke.label && r.steadyCap?.label === before.label, `both caps are the step before (${r.cap?.label}) and it broke at the next (${r.cap?.brokeAt})`);
}

/* 3. A hitch fails the step but does NOT stop the ramp, and the two caps then differ. */
{
  const r = drive((i, f) => (i === 1 && f === 200 ? HITCH + 5 : 16.7));   // one hitch in step "1"
  check(r.results.length === N, `one hitch does not stop the ramp (${r.results.length} of ${N} steps ran)`);
  check(!r.results[1].pass && r.results[1].steady, "the hitched step fails the budget but its steady state passes");
  check(r.cap?.label === rampSteps()[N - 1].label && r.cap?.brokeAt === rampSteps()[1].label, `the strict cap is the last step that passed the budget, and it names the step that broke it (${r.cap?.brokeAt})`);
  check(r.steadyCap?.brokeAt === null, "the steady cap saw nothing break");
  check(r.results[1].stallLog.length === 1 && r.results[1].stallLog[0].dt === HITCH + 5, "the hitch is in the step's stall log with its length");
}

/* 4. The stall log says what the frame was doing, and the GC frames are counted. */
{
  const r = drive(
    (i, f) => (i === 0 && (f === 100 || f === 300) ? 180 : 16.7),
    (i, f) => ({ gc: i === 0 && f === 100, hud: i === 0 && f === 300, ticks: f % 3 === 0 ? 1 : 0, resized: false }),
  );
  const log = r.results[0].stallLog;
  check(log.length === 2, `two stalls logged in the probe step (${log.length})`);
  check(log[0].gc && !log[0].hud && !log[1].gc && log[1].hud, "one is flagged as a collection, the other as a HUD update");
  check(log[0].t > 0 && log[1].t > log[0].t && log[1].t < 8, `each stall carries when in the hold it landed (${log[0].t}s, ${log[1].t}s)`);
  check(r.results[0].gcFrames === 1 && r.results[0].gcMeanMs === 180, `frames flagged as collections are counted with their mean length (${r.results[0].gcFrames}, ${r.results[0].gcMeanMs} ms)`);
  const text = reportText({ device: { ua: "test", cores: 8, memoryGB: 8, dpr: 3.5, canvasDpr: 2, screen: "1x1", viewport: "1x1", build: "test" }, results: r.results, cap: r.cap, steadyCap: r.steadyCap, canvas: "1x1" });
  check(/stalls: every frame/.test(text) && /yes  no /.test(text) && /no   yes/.test(text), "the report lists the stalls with their flags");
  check(/canvas at 2/.test(text) && /cap \(budget, no hitching\)/.test(text) && /cap \(steady state/.test(text), "the report states the canvas scale and both caps");
  check(/device: model unknown/.test(text) && /ua: test/.test(text) && /reduced/.test(text), "without a model the report says the model is unknown and warns that the UA is reduced");
  const named = reportText({ device: { ua: "x", model: "Pixel 7 Pro", platform: "Android", platformVersion: "14.0.0", cores: 8, memoryGB: 8, dpr: 3.5, screen: "1x1", viewport: "1x1" }, results: r.results, cap: r.cap, steadyCap: r.steadyCap, canvas: "1x1" });
  check(/device: Pixel 7 Pro · Android 14.0.0/.test(named), "with client hints the report names the model and platform version");
}

/* 4b. The identity call never throws and never guesses where client hints are missing. */
{
  const id = await deviceIdentity();
  check(id.model === null && typeof id.note === "string" && /no client hints/.test(id.note), `in node, no model and a note saying why (${id.note})`);
}

/* 5. A slow second fails a step even when the p95 would pass. */
{
  const m = perfMeter();
  for (let i = 0; i < 300; i++) m.record(16.7);
  for (let i = 0; i < 25; i++) m.record(40);      // one second at 25 fps
  for (let i = 0; i < 300; i++) m.record(16.7);
  const s = m.summary();
  check(s.slowSeconds === 1 && !m.passes(s) && !m.steady(s), `a second under 30 fps is counted and fails both tests (${s.slowSeconds} slow second, p95 ${s.p95})`);
}

/* 6. The collection probe: quiet when nothing is collected, and it never throws where WeakRef is missing. */
{
  const p = gcProbe();
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(p.tick());
  check(seen.every((x) => x === false), "with nothing collected between frames the probe stays quiet");
  const saved = globalThis.WeakRef;
  globalThis.WeakRef = undefined;
  let threw = false;
  try { const q = gcProbe(); q.tick(); q.tick(); q.tick(); } catch { threw = true; }
  globalThis.WeakRef = saved;
  check(!threw, "without WeakRef the probe reports nothing rather than throwing");
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the budget ramp terminates, runs past a hitch, stops at a steady failure, ignores the scene build, logs every stall with its cause flags, and derives both caps.");
