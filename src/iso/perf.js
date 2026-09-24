/* =====================================================================
   THE PERFORMANCE BUDGET, MEASURED WHERE IT COUNTS.

   The budget (SIMULATOR.md, stage 1): 60 fps in ordinary play on the
   reference phone, dips tolerated when the scene is busy, never
   sustained below 30, and NO HITCHING -- a steady 40 feels better than a
   60 that stutters, so consistency is what is optimised for and a
   stutter is the failure, not the average.

   So this measures the things that ARE the budget, per second of play:

     p95 frame     the frame time 19 of 20 frames beat -- the "feel"
     max frame     the worst single frame -- a hitch is a frame over
                   HITCH ms, a stall a frame over STALL ms
     slow seconds  whole seconds whose average was under 30 fps --
                   "sustained below 30"

   and it ramps the scene's load in steps so the cap on visible vehicles
   is DERIVED from where the budget breaks on the device in hand rather
   than picked. Pure: it records frame times and reports; the screen
   decides what to ramp.

   WHAT THE PHONE HAS SAID SO FAR (Pixel 7 Pro, the dev server):

     run 1, 19 Sep   p50 16.7 / p95 16.8 at 39 cars, and eight frames of
                     100-208 ms in eight seconds. Stalls, not load.
     run 3, 19 Sep   the same step twice, with and without a React state
                     update once a second from the frame loop: 8 stalls
                     of 133-158 ms a second apart, then ZERO with a worst
                     frame of 16.8 ms. Cause confirmed. Steps 2-4 then
                     held a locked 60 fps to 114 cars and 120 props, and
                     step 5 (154 cars) had p50 16.7 / p95 16.8 -- and one
                     frame of 2642 ms with no cause flag. A second stall
                     bug, not a ceiling; the ceiling has not been found.

   A stall is a different class of thing from a slow frame and needs
   its own instrument, so a ramp step keeps a STALL LOG: every frame
   over HITCH, when in the hold it landed, and what was going on --
   how long our own callback ran (a stall inside it is our code), how
   much of the gap the browser reports as long tasks (busy main thread
   outside our code, or none at all: the page got no frames), a full
   garbage collection seen by a WeakRef sentinel, a DOM/React update
   issued within the last two frames (the cost lands one or two frames
   after the update, measured), the tab going hidden, input arriving,
   sim ticks, a canvas resize. The ramp does not stop at a hitch,
   because a stutter says nothing about capacity; it stops when a
   step's steady state fails, and the report derives two caps.
   ===================================================================== */
/* WHICH INSTRUMENT. Bumped whenever the ramp or the report changes
   shape, and printed with the build stamp on the screen and in the
   report, so a report from a stale tab says so on its first line. */
export const INSTRUMENT = 4;
export const BUILD = typeof __BUILD__ !== "undefined" ? __BUILD__ : "unbundled";   // vite.config.js bakes it in; bare node has none

export const HITCH = 50;     // ms: a frame long enough to see as a stutter (three missed vsyncs at 60)
export const STALL = 100;    // ms: a frame long enough to feel as a freeze
/* "No hitching" is taken at its word: the worst frame of a step must
   stay under HITCH, not merely under a freeze. A phone browser's garbage
   collector can produce a 50 ms frame on its own, and if it does, the
   report says so and the answer is engineering -- an allocation-free
   step and draw -- rather than a looser bar. */
export const BUDGET = { p95: 25, max: HITCH, slowSeconds: 0 };   // 40 fps steady, no hitch, never a slow second

export function perfMeter() {
  const all = [];              // every frame since the reset (a ramp step, or the page)
  let second = [], seconds = 0, slowSeconds = 0, hitches = 0, stalls = 0, frames = 0;
  let worst = 0;

  const percentile = (arr, q) => {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };

  return {
    /* One frame of `dt` milliseconds. */
    record(dt) {
      frames++;
      all.push(dt); if (all.length > 6000) all.shift();   // a hundred seconds at 60 fps
      second.push(dt);
      if (dt > HITCH) hitches++;
      if (dt > STALL) stalls++;
      worst = Math.max(worst, dt);
      const sum = second.reduce((t, x) => t + x, 0);
      if (sum >= 1000) {
        seconds++;
        if (second.length / (sum / 1000) < 30) slowSeconds++;
        second = [];
      }
    },
    reset() { all.length = 0; second = []; seconds = 0; slowSeconds = 0; hitches = 0; stalls = 0; frames = 0; worst = 0; },
    /* The percentiles over the last `window` frames -- the whole run
       since the reset by default, which is what a ramp step wants; the
       live readout asks for the last couple of seconds. The counts are
       always since the reset. */
    summary(window = Infinity) {
      const recent = window < all.length ? all.slice(all.length - window) : all;
      const mean = recent.length ? recent.reduce((t, x) => t + x, 0) / recent.length : 0;
      return {
        fps: mean ? Math.round(1000 / mean) : 0,
        p50: Math.round(percentile(recent, 0.5) * 10) / 10,
        p95: Math.round(percentile(recent, 0.95) * 10) / 10,
        max: Math.round(percentile(recent, 1) * 10) / 10,
        worst: Math.round(worst * 10) / 10,
        hitches, stalls, slowSeconds, seconds, frames,
      };
    },
    /* Whether a step of the ramp passed the budget, and whether its
       steady state alone did -- the fill-rate question, with stutter
       set aside. */
    passes(sum = this.summary()) {
      return sum.p95 <= BUDGET.p95 && sum.worst <= BUDGET.max && sum.slowSeconds <= BUDGET.slowSeconds;
    },
    steady(sum = this.summary()) {
      return sum.p95 <= BUDGET.p95 && sum.slowSeconds <= BUDGET.slowSeconds;
    },
  };
}

/* A FULL GARBAGE COLLECTION, SEEN FROM INSIDE. Allocate a sentinel each
   frame and hold it only weakly; when the sentinel from two frames ago
   has been collected, the collector ran in between. Two frames rather
   than one because a WeakRef's target is kept alive to the end of the
   job that created it.

   Measured in node, not assumed: V8 clears a WeakRef in a full
   (mark-sweep) collection and NOT in a young-generation scavenge. So
   this sees the expensive kind only -- which is the kind that could be
   a 100 ms frame; a scavenge is a millisecond or two and cannot be a
   stall. A frame flagged here followed a full collection. */
export function gcProbe() {
  let prev = null, older = null;
  return {
    tick() {
      const collected = older != null && older.deref() === undefined;
      /* Both sentinels clear at once, so report the collection once. */
      older = collected ? null : prev;
      prev = typeof WeakRef === "function" ? new WeakRef({}) : null;
      return collected;
    },
  };
}

/* WHAT THE BROWSER SAYS THE MAIN THREAD WAS DOING. Long tasks are the
   browser's own record of the main thread being blocked for over 50 ms
   by anything -- script, style, layout, paint, its own work. A stall
   with a long task across it was a busy main thread; a stall with NONE
   was a page that got no frames: hidden, frozen, or waiting on the GPU.
   Visibility and input are recorded the same way, for the same reason.
   Everything here degrades to "unknown" where the API is missing. */
export function taskProbe() {
  const tasks = [], hidden = [], inputs = [], frames = [];
  /* Support is what the platform LISTS, not whether observe() throws:
     node accepts an unknown entry type silently and never delivers it. */
  const listed = typeof PerformanceObserver !== "undefined" ? (PerformanceObserver.supportedEntryTypes ?? []) : [];
  let supported = false, loaf = false;
  if (listed.includes("longtask")) {
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) { tasks.push({ start: e.startTime, ms: e.duration, name: e.name }); if (tasks.length > 400) tasks.shift(); }
      });
      po.observe({ type: "longtask", buffered: true });
      supported = true;
    } catch { supported = false; }
  }
  /* LONG ANIMATION FRAMES say what a long frame was doing: how much was
     script and WHICH script, by file and function, and how much was
     style, layout and paint. Chrome 123+. A stall's attribution comes
     from here when it is available. */
  if (listed.includes("long-animation-frame")) {
    try {
      const po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          const end = e.startTime + e.duration;
          const scripts = (e.scripts ?? []).map((s) => ({
            ms: Math.round(s.duration), where: `${(s.sourceURL ?? "").split("/").pop().split("?")[0] || "?"}:${s.sourceFunctionName || s.invoker || "?"}`, kind: s.invokerType ?? "",
            layout: Math.round(s.forcedStyleAndLayoutDuration ?? 0),
          })).sort((a, b) => b.ms - a.ms).slice(0, 3);
          frames.push({
            start: e.startTime, ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration ?? 0),
            script: Math.round(scripts.reduce((t, s) => t + s.ms, 0)),
            render: e.renderStart ? Math.round(end - e.renderStart) : 0,
            styleLayout: e.styleAndLayoutStart ? Math.round(end - e.styleAndLayoutStart) : 0,
            scripts,
          });
          if (frames.length > 200) frames.shift();
        }
      });
      po.observe({ type: "long-animation-frame", buffered: true });
      loaf = true;
    } catch { loaf = false; }
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") hidden.push(performance.now()); });
    for (const ev of ["pointerdown", "pointerup", "touchmove", "wheel", "scroll", "keydown"]) {
      window.addEventListener(ev, () => { inputs.push(performance.now()); if (inputs.length > 400) inputs.shift(); }, { capture: true, passive: true });
    }
  }
  return {
    supported,
    /* The gap between two frame timestamps: long-task milliseconds in
       it, the longest one, whether the tab went hidden, input events. */
    loaf,
    during(t0, t1) {
      const within = tasks.filter((t) => t.start + t.ms > t0 - 5 && t.start < t1 + 5);
      const ms = within.reduce((s, t) => s + Math.min(t.start + t.ms, t1) - Math.max(t.start, t0), 0);
      /* The long animation frame that covers the gap, if the browser
         reported one: the biggest overlapping it. */
      const lf = frames.filter((f) => f.start + f.ms > t0 - 5 && f.start < t1 + 5).sort((a, b) => b.ms - a.ms)[0] ?? null;
      return {
        tasks: supported ? Math.round(Math.max(0, ms)) : null,
        longest: within.length ? Math.round(Math.max(...within.map((t) => t.ms))) : 0,
        hidden: hidden.some((h) => h >= t0 - 5 && h <= t1 + 5),
        input: inputs.filter((x) => x >= t0 && x <= t1).length,
        frame: lf ? { ms: lf.ms, script: lf.script, render: lf.render, styleLayout: lf.styleLayout, scripts: lf.scripts } : null,
      };
    },
  };
}

/* WHICH DEVICE, REALLY. Chrome's User-Agent Reduction freezes the
   Android version at 10 and the model at "K" for every device -- a
   privacy measure -- so "Android 10; K" in a UA string says nothing
   about a phone, and the first report was misread from it as an older
   phone than it was (it was the Pixel 7 Pro). The sanctioned route to
   the real model is the client hints API: asynchronous, Chromium only,
   and it may be refused. When it is missing the report says so rather
   than guessing from the string. Fetched once when a test starts. */
export async function deviceIdentity() {
  const none = (note) => ({ model: null, platformVersion: null, platform: null, note });
  try {
    const uad = typeof navigator !== "undefined" ? navigator.userAgentData : null;
    /* Client hints are a secure-context API: over plain HTTP on the LAN
       (measured: http://192.168.2.17:4173) they are missing in Chromium
       too, and saying "not Chromium" there would blame the wrong thing. */
    if (!uad?.getHighEntropyValues) {
      const insecure = typeof window !== "undefined" && window.isSecureContext === false;
      return none(insecure ? "no client hints: not a secure context (plain HTTP over the LAN); the UA string below is reduced and says nothing about the model" : "no client hints (not Chromium): the UA string below is reduced and says nothing about the model");
    }
    const v = await uad.getHighEntropyValues(["model", "platformVersion", "platform"]);
    return { model: v.model || null, platformVersion: v.platformVersion || null, platform: v.platform || uad.platform || null, note: v.model ? null : "client hints gave no model" };
  } catch {
    return none("client hints refused");
  }
}

/* What the report has to say about the device, so a number means
   something when it is pasted somewhere else. */
export function deviceInfo(extra = {}) {
  if (typeof navigator === "undefined") return { ...extra };
  return {
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGB: navigator.deviceMemory ?? null,   // secure contexts only: null over plain HTTP
    secure: typeof window !== "undefined" ? window.isSecureContext : null,
    dpr: window.devicePixelRatio ?? 1,
    screen: `${window.screen?.width}x${window.screen?.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    ...extra,
  };
}

/* A ramp: each step holds a load for `hold` seconds and records the
   budget's numbers for that load. Steps are whatever the screen can
   ramp -- here, a traffic multiplier (each unit is four worlds of cars,
   about forty on a phone's screen at the overpass) and stand-in
   buildings scattered where the camera looks. It runs well past the
   loads a phone has already carried, because the ceiling has not been
   found: 154 cars on screen were still at a locked 60 fps.

   The first step is a PROBE, a positive control: the same load as the
   second, with a React state update issued once a second from the
   frame loop, which is the thing that stalled the first phone run. It
   must show stalls -- if it stops showing them, either the device or
   the framework has changed, and either is worth knowing -- and it
   proves the instrument still sees a stall at all. */
export function rampSteps() {
  return [
    { traffic: 1, props: 0, probe: true, label: "1 (DOM probe)" },
    { traffic: 1, props: 0, label: "1" },
    { traffic: 2, props: 0, label: "2" },
    { traffic: 2, props: 60, label: "3" },
    { traffic: 3, props: 120, label: "4" },
    { traffic: 4, props: 200, label: "5" },
    { traffic: 6, props: 300, label: "6" },
    { traffic: 8, props: 400, label: "7" },
    { traffic: 12, props: 500, label: "8" },
    { traffic: 16, props: 600, label: "9" },
    { traffic: 24, props: 800, label: "10" },
  ];
}

/* THE RAMP AS A STATE MACHINE, so it can be driven by synthetic frames
   in node and proven to terminate before a phone is asked to run it.
   The screen calls `frame(now, counts, flags)` once per animation frame
   with the frame timestamp, what that frame drew, and what else went
   on; the result says what to do: nothing, `load` a new step (the
   screen rebuilds its scene), or `done` with the report's inputs.

   A STEP'S CLOCK STARTS ON THE FRAME AFTER THE LOAD, not on the frame
   that asked for it: the scene build runs inside that frame and takes
   seconds at the heavy steps on a phone, and a settle that had already
   started would have counted the build as a stall. Then `settle`
   seconds are discarded and `hold` seconds recorded. The ramp stops
   when a step's STEADY state fails -- a heavier load cannot pass where
   a lighter one did not -- and a hitch fails the step without stopping
   the ramp, because a stutter says nothing about how much the device
   can draw. */
export function budgetRamp({ steps = rampSteps(), settle = 1, hold = 8, meter = perfMeter() } = {}) {
  let i = 0, at = null, settled = false, started = false, last = null, counts = null;
  let log = [], gcFrames = 0, gcMs = 0;
  const results = [];
  const finish = () => {
    const strict = results.filter((x) => x.pass);
    const steadyOnes = results.filter((x) => x.steady);
    /* The DOM probe is a POSITIVE CONTROL -- it issues one React update a
       second on purpose, so it hitches by design -- and it is never where
       the budget "broke". Counting it made the 24 September report say
       "held up to 322 cars; broke at step 1", which reads as a
       contradiction and was one. Its own result is reported on its own
       line instead. */
    const capOf = (list, key) => (list.length ? { ...list[list.length - 1], brokeAt: results.find((x) => !x.probe && !x[key])?.label ?? null } : null);
    return { done: true, results, cap: capOf(strict, "pass"), steadyCap: capOf(steadyOnes, "steady") };
  };
  return {
    get step() { return steps[i]; },
    get index() { return i; },
    results,
    frame(now, drew, flags = {}) {
      let dt = null;
      if (last != null) { dt = now - last; meter.record(dt); }
      last = now;
      if (drew) counts = { cars: drew.cars, items: drew.items };
      if (!started) { started = true; return { load: steps[0] }; }
      if (at == null) { at = now; settled = false; meter.reset(); log = []; gcFrames = 0; gcMs = 0; return {}; }
      const held = (now - at) / 1000;
      if (!settled && held >= settle) { settled = true; meter.reset(); log = []; gcFrames = 0; gcMs = 0; }
      if (settled && dt != null) {
        if (flags.gc) { gcFrames++; gcMs += dt; }
        if (dt > HITCH) {
          log.push({
            t: Math.round((held - settle) * 100) / 100, dt: Math.round(dt),
            tickMs: flags.tickMs != null ? Math.round(flags.tickMs) : null,
            tasks: flags.tasks ?? null, longest: flags.longest ?? 0,
            gc: !!flags.gc, dom: !!flags.dom, hidden: !!flags.hidden, input: flags.input ?? 0,
            ticks: flags.ticks ?? 0, resized: !!flags.resized,
            frame: flags.frame ?? null,
          });
        }
      }
      if (!settled || held < settle + hold) return {};
      const sum = meter.summary();
      results.push({
        step: i + 1, ...steps[i], ...sum, ...(counts ?? {}),
        pass: meter.passes(sum), steady: meter.steady(sum),
        stallLog: log, gcFrames, gcMeanMs: gcFrames ? Math.round((gcMs / gcFrames) * 10) / 10 : 0,
      });
      i++;
      if (i >= steps.length || !results[results.length - 1].steady) return finish();
      at = null;
      return { load: steps[i] };
    },
  };
}

export function reportText({ device, results, cap, steadyCap, canvas }) {
  const lines = [];
  lines.push(`performance report ${new Date().toISOString()} · instrument v${INSTRUMENT} · build ${BUILD}`);
  const platform = [device.platform, device.platformVersion].filter(Boolean).join(" ");
  const who = device.model ? `${device.model} · ${platform}`.trim() : `model unknown${device.note ? ` (${device.note})` : ""}${platform ? ` · ${platform}` : ""}`;
  lines.push(`device: ${who}`);
  lines.push(`ua: ${device.ua} (a Chrome UA is reduced: "Android 10; K" is every Android device)`);
  lines.push(`cores ${device.cores} · memory ${device.memoryGB != null ? `${device.memoryGB}GB` : "n/a (secure contexts only)"} · ${device.secure === false ? "plain http, not a secure context" : device.secure ? "secure context" : "context unknown"} · dpr ${device.dpr}${device.canvasDpr != null ? ` (canvas at ${device.canvasDpr})` : ""} · screen ${device.screen} · viewport ${device.viewport} · canvas ${canvas}${device.build ? ` · ${device.build}` : ""}${device.longTasks === false ? " · no long-task API" : ""}${device.loaf === false ? " · no long-animation-frame API" : ""}`);
  lines.push(`budget: p95 <= ${BUDGET.p95}ms, no frame over ${BUDGET.max}ms (a hitch), no second under 30 fps`);
  lines.push("step           traffic  props  cars(drawn)  things  fps  p50   p95   worst  hitches  stalls  slow-s  gc-frames(mean ms)  steady  pass");
  for (const r of results) {
    lines.push(`${String(r.label ?? r.step).padEnd(14)} ${String(r.traffic).padStart(7)}  ${String(r.props).padStart(5)}  ${String(r.cars).padStart(11)}  ${String(r.items).padStart(6)}  ${String(r.fps).padStart(3)}  ${String(r.p50).padStart(4)}  ${String(r.p95).padStart(4)}  ${String(r.worst).padStart(5)}  ${String(r.hitches).padStart(7)}  ${String(r.stalls).padStart(6)}  ${String(r.slowSeconds).padStart(6)}  ${String(`${r.gcFrames ?? 0} (${r.gcMeanMs ?? 0})`).padStart(18)}  ${r.steady ? "yes" : "NO "}     ${r.pass ? "yes" : "NO"}`);
  }
  const stalls = results.flatMap((r) => (r.stallLog ?? []).map((s) => ({ step: r.label ?? r.step, ...s })));
  if (stalls.length) {
    lines.push("stalls: every frame over the hitch line, and what was going on in the gap");
    lines.push("  step           t(s)   dt(ms)  ours(ms)  tasks(ms)  longest  gc   dom  hidden  input  ticks  resized");
    for (const s of stalls) {
      lines.push(`  ${String(s.step).padEnd(14)} ${String(s.t.toFixed(2)).padStart(5)}  ${String(s.dt).padStart(6)}  ${String(s.tickMs ?? "?").padStart(8)}  ${String(s.tasks ?? "?").padStart(9)}  ${String(s.longest).padStart(7)}  ${s.gc ? "yes" : "no "}  ${s.dom ? "yes" : "no "}  ${s.hidden ? "yes " : "no  "}   ${String(s.input).padStart(5)}  ${String(s.ticks).padStart(5)}  ${s.resized ? "yes" : "no"}`);
      if (s.frame) {
        const top = s.frame.scripts.map((x) => `${x.where} ${x.ms}ms${x.kind ? ` (${x.kind})` : ""}${x.layout ? ` forced-layout ${x.layout}ms` : ""}`).join(", ");
        lines.push(`                 long animation frame ${s.frame.ms}ms: script ${s.frame.script}ms, style+layout ${s.frame.styleLayout}ms, render ${s.frame.render}ms${top ? `; ${top}` : ""}`);
      }
    }
    lines.push("  ours = time inside our frame callback; tasks = long tasks the browser saw in the gap (0 with a long gap = the page got no frames);");
    lines.push("  the long-animation-frame line, where Chrome gives one, says what the frame was doing and which script");
  } else {
    lines.push("stalls: none");
  }
  const probe = results.find((x) => x.probe);
  if (probe) lines.push(`dom probe (positive control, hitches on purpose): ${probe.hitches ?? 0} hitches -- ${(probe.hitches ?? 0) > 0 ? "the instrument still sees a React update from the frame loop, so the rule against them still matters on this device" : "NO hitches: either this device absorbs a React update per second, or the probe did not run"}`);
  lines.push(cap ? `cap (budget, no hitching): held up to ${cap.cars} cars drawn with ${cap.props} props (step ${cap.label}); broke at step ${cap.brokeAt ?? "-"}` : "cap (budget, no hitching): the budget did not hold at any step");
  lines.push(steadyCap ? `cap (steady state, stutter set aside): held up to ${steadyCap.cars} cars drawn with ${steadyCap.props} props (step ${steadyCap.label}); broke at step ${steadyCap.brokeAt ?? "-"}` : "cap (steady state): did not hold at any step");
  return lines.join("\n");
}
