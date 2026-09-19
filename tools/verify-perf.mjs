/* =====================================================================
   THE PERFORMANCE INSTRUMENT, PROVEN BEFORE A PHONE IS ASKED TO RUN IT.

   The budget ramp runs inside the screen's animation loop, and the
   preview pane this project is developed in delivers no animation
   frames (CLAUDE.md item 7), so the ramp has never been watched to
   completion here. This drives it with synthetic frames instead: it
   must terminate, run past a hitch but stop at a steady-state failure,
   start each step's clock after the scene build rather than before it,
   log every stall with what the gap was doing, and derive both caps
   from what passed.

   What it cannot check is a real frame time -- that is the phone's job,
   and the report it produces is the number that matters.
   ===================================================================== */
import { perfMeter, budgetRamp, rampSteps, reportText, gcProbe, taskProbe, deviceIdentity, BUDGET, HITCH, INSTRUMENT, BUILD } from "../src/iso/perf.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const N = rampSteps().length;

/* Drive a ramp: `frameMs(stepIndex, frameInStep)` gives each frame's
   length, `flagsFor(stepIndex, frameInStep)` what the gap was doing.
   The screen builds a scene when told to load, and that frame is a
   stall of `build` ms, as the real one is -- seconds, on a phone at
   the heavy steps. */
function drive(frameMs, flagsFor = () => ({}), { settle = 1, hold = 8, build = 3000 } = {}) {
  const ramp = budgetRamp({ settle, hold });
  let now = 0, pending = null, stepIndex = -1, frames = 0, inStep = 0;
  const drew = () => ({ cars: 10 * (stepIndex + 1), items: 100 * (stepIndex + 1) });
  for (let guard = 0; guard < 200000; guard++) {
    const out = ramp.frame(now, drew(), flagsFor(stepIndex, inStep));
    frames++; inStep++;
    if (out.done) return { ...out, frames, seconds: now / 1000 };
    if (out.load) { stepIndex++; inStep = 0; pending = build; }
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
  check(r.results.every((x) => x.worst < HITCH && x.stallLog.length === 0), `a three-second scene build before every step is kept out of every step's record (worst ${Math.max(...r.results.map((x) => x.worst))} ms, no stalls logged)`);
  check(r.seconds > N * 12 && r.seconds < N * 12.5, `each step is build, settle and hold: about ${N * 12} s in all (${r.seconds.toFixed(1)} s)`);
  check(r.results[2].cars === 30 && r.results[2].items === 300, "each step records what it drew");
  check(r.results[0].probe === true && r.results.slice(1).every((x) => !x.probe), "the first step is the DOM probe and the rest run without it");
  const loads = rampSteps().map((s) => s.traffic);
  check(loads.every((t, i) => i === 0 || t >= loads[i - 1]) && loads[N - 1] >= 24, `the ramp runs well past the loads a phone has already carried (to traffic ${loads[N - 1]})`);
}

/* 2. A steady failure stops the ramp; the caps are the step before. */
{
  const r = drive((i) => (i === 2 ? 30 : 16.7));   // the third step runs at 33 fps: p95 over budget
  check(r.results.length === 3, `the ramp stops at the first steady-state failure (${r.results.length} recorded)`);
  check(!r.results[2].steady && r.results[1].steady, "the third step fails its steady state, the second passed");
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

/* 4. The stall log says what the gap was doing, and the GC frames are counted. */
{
  const r = drive(
    (i, f) => (i === 0 && (f === 100 || f === 300) ? 180 : 16.7),
    (i, f) => ({ gc: i === 0 && f === 100, dom: i === 0 && f === 300, tickMs: f === 100 ? 170 : 3, tasks: f === 300 ? 160 : 0, longest: f === 300 ? 160 : 0, hidden: false, input: f === 300 ? 2 : 0, ticks: f % 3 === 0 ? 1 : 0, resized: false,
      frame: f === 300 ? { ms: 160, script: 14, render: 140, styleLayout: 120, scripts: [{ where: "react-dom_client.js:performWorkUntilDeadline", ms: 14, kind: "user-callback", layout: 0 }] } : null }),
  );
  const log = r.results[0].stallLog;
  check(log.length === 2, `two stalls logged in the probe step (${log.length})`);
  check(log[0].gc && !log[0].dom && !log[1].gc && log[1].dom, "one is flagged as a collection, the other as a DOM update");
  check(log[0].tickMs === 170 && log[1].tasks === 160 && log[1].longest === 160 && log[1].input === 2, "each carries our own callback time, the browser's long tasks, and the input in the gap");
  check(log[0].t > 0 && log[1].t > log[0].t && log[1].t < 8, `each stall carries when in the hold it landed (${log[0].t}s, ${log[1].t}s)`);
  check(r.results[0].gcFrames === 1 && r.results[0].gcMeanMs === 180, `frames flagged as collections are counted with their mean length (${r.results[0].gcFrames}, ${r.results[0].gcMeanMs} ms)`);
  const text = reportText({ device: { ua: "test", cores: 8, memoryGB: 8, dpr: 3.5, canvasDpr: 2, screen: "1x1", viewport: "1x1", build: "test", longTasks: true }, results: r.results, cap: r.cap, steadyCap: r.steadyCap, canvas: "1x1" });
  const rows = text.split(String.fromCharCode(10)).filter((l) => /^  1 \(DOM probe\)/.test(l));
  check(rows.length === 2 && /\byes\b\s+no\b/.test(rows[0]) && /\bno\b\s+yes\b/.test(rows[1]), "the report lists the stalls with their flags");
  check(/ours\(ms\)/.test(text) && /tasks\(ms\)/.test(text) && /hidden/.test(text), "and its stall table has the callback, long-task and hidden columns");
  check(text.includes("long animation frame 160ms: script 14ms, style+layout 120ms, render 140ms; react-dom_client.js:performWorkUntilDeadline 14ms (user-callback)"), "a stall with a long animation frame prints what the frame was doing and which script");
  check(/canvas at 2/.test(text) && /cap \(budget, no hitching\)/.test(text) && /cap \(steady state/.test(text), "the report states the canvas scale and both caps");
  check(/device: model unknown/.test(text) && /ua: test/.test(text) && /reduced/.test(text), "without a model the report says the model is unknown and warns that the UA is reduced");
  const lan = reportText({ device: { ua: "x", cores: 8, memoryGB: null, secure: false, dpr: 3.5, screen: "1x1", viewport: "1x1" }, results: r.results, cap: r.cap, steadyCap: r.steadyCap, canvas: "1x1" });
  check(/memory n\/a \(secure contexts only\)/.test(lan) && /plain http, not a secure context/.test(lan), "over plain HTTP the report says why memory is missing and that the context is insecure");
  const first = text.slice(0, text.indexOf(String.fromCharCode(10)));
  check(first.includes(`instrument v${INSTRUMENT}`) && first.includes(`build ${BUILD}`) && BUILD === "unbundled", `the first line carries the instrument version and the build stamp (v${INSTRUMENT}, ${BUILD} here in bare node)`);
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

/* 6. The probes: quiet when nothing happens, and they never throw where an API is missing. */
{
  const p = gcProbe();
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(p.tick());
  check(seen.every((x) => x === false), "with nothing collected between frames the collection probe stays quiet");
  const saved = globalThis.WeakRef;
  globalThis.WeakRef = undefined;
  let threw = false;
  try { const q = gcProbe(); q.tick(); q.tick(); q.tick(); } catch { threw = true; }
  globalThis.WeakRef = saved;
  check(!threw, "without WeakRef the collection probe reports nothing rather than throwing");
  const t = taskProbe();
  const gap = t.during(0, 1000);
  check(t.supported === false && t.loaf === false && gap.tasks === null && gap.frame === null && gap.hidden === false && gap.input === 0, "without the long-task APIs the task probe reports unknown rather than zero, and no hidden tab or input");
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the budget ramp terminates, runs past a hitch, stops at a steady failure, starts each clock after the build, logs every stall with what the gap was doing, and derives both caps.");
