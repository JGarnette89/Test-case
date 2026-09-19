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

   THE FIRST PHONE RUN (19 Sep) FAILED ON STALLS ALONE: p50 16.7, p95
   16.8, and eight frames of 100-208 ms in eight seconds. A stall is a
   different class of thing from a slow frame and needs a different
   instrument, so a ramp step now also keeps a STALL LOG -- for every
   frame over HITCH, when in the step it landed and what the screen
   was doing in that frame: a garbage collection detected between
   frames (a WeakRef sentinel), a React state update issued the frame
   before, how many sim ticks ran, a canvas resize. And the ramp no
   longer stops at a hitch: a stutter with a clean steady state says
   nothing about capacity, so it runs on and the report derives two
   caps, the strict one the budget asks for and the steady one the
   fill rate allows.
   ===================================================================== */
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
    if (!uad?.getHighEntropyValues) return none("no client hints (not Chromium): the UA string below is reduced and says nothing about the model");
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
    memoryGB: navigator.deviceMemory ?? null,
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
   buildings scattered where the camera looks. The prop counts are what
   a city view might hold, not a stress figure: a phone screen at this
   zoom shows a couple of hundred metres of street.

   The first step is a PROBE, the same load twice: once with the
   screen's once-a-second React state update left on, once with it
   off. The first phone run stalled exactly as many times as that
   update fired inside the recorded window, which is a suspect and not
   a finding until the two halves of this step differ. */
export function rampSteps() {
  return [
    { traffic: 1, props: 0, hud: true, label: "1 (HUD on)" },
    { traffic: 1, props: 0, hud: false, label: "1" },
    { traffic: 2, props: 0, hud: false, label: "2" },
    { traffic: 2, props: 60, hud: false, label: "3" },
    { traffic: 3, props: 120, hud: false, label: "4" },
    { traffic: 4, props: 200, hud: false, label: "5" },
    { traffic: 6, props: 300, hud: false, label: "6" },
  ];
}

/* THE RAMP AS A STATE MACHINE, so it can be driven by synthetic frames
   in node and proven to terminate before a phone is asked to run it.
   The screen calls `frame(now, counts, flags)` once per animation frame
   with the frame timestamp, what that frame drew, and what else the
   frame did (gc, hud, ticks, resized); the result says what to do:
   nothing, `load` a new step (the screen rebuilds its scene), or `done`
   with the report's inputs. Each step settles for `settle` seconds --
   the scene build is a stall and must not be counted -- then holds for
   `hold` seconds of recording. The ramp stops when a step's STEADY
   state fails: a heavier load cannot pass where a lighter one did not.
   A hitch fails the step but does not stop the ramp, because a stutter
   says nothing about how much the device can draw. */
export function budgetRamp({ steps = rampSteps(), settle = 1, hold = 8, meter = perfMeter() } = {}) {
  let i = 0, at = null, settled = false, last = null, counts = null;
  let log = [], gcFrames = 0, gcMs = 0;
  const results = [];
  const finish = () => {
    const strict = results.filter((x) => x.pass);
    const steadyOnes = results.filter((x) => x.steady);
    const capOf = (list, key) => (list.length ? { ...list[list.length - 1], brokeAt: results.find((x) => !x[key])?.label ?? null } : null);
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
      if (at == null) { at = now; meter.reset(); return { load: steps[0] }; }
      const held = (now - at) / 1000;
      if (!settled && held >= settle) { settled = true; meter.reset(); log = []; gcFrames = 0; gcMs = 0; }
      if (settled && dt != null) {
        if (flags.gc) { gcFrames++; gcMs += dt; }
        if (dt > HITCH) log.push({ t: Math.round((held - settle) * 100) / 100, dt: Math.round(dt), gc: !!flags.gc, hud: !!flags.hud, ticks: flags.ticks ?? 0, resized: !!flags.resized });
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
      at = now; settled = false; meter.reset();
      return { load: steps[i] };
    },
  };
}

export function reportText({ device, results, cap, steadyCap, canvas }) {
  const lines = [];
  lines.push(`performance report ${new Date().toISOString()}`);
  const platform = [device.platform, device.platformVersion].filter(Boolean).join(" ");
  const who = device.model ? `${device.model} · ${platform}`.trim() : `model unknown${device.note ? ` (${device.note})` : ""}${platform ? ` · ${platform}` : ""}`;
  lines.push(`device: ${who}`);
  lines.push(`ua: ${device.ua} (a Chrome UA is reduced: "Android 10; K" is every Android device)`);
  lines.push(`cores ${device.cores} · memory ${device.memoryGB}GB · dpr ${device.dpr}${device.canvasDpr != null ? ` (canvas at ${device.canvasDpr})` : ""} · screen ${device.screen} · viewport ${device.viewport} · canvas ${canvas}${device.build ? ` · ${device.build}` : ""}`);
  lines.push(`budget: p95 <= ${BUDGET.p95}ms, no frame over ${BUDGET.max}ms (a hitch), no second under 30 fps`);
  lines.push("step        traffic  props  cars(drawn)  things  fps  p50   p95   worst  hitches  stalls  slow-s  gc-frames(mean ms)  steady  pass");
  for (const r of results) {
    lines.push(`${String(r.label ?? r.step).padEnd(11)} ${String(r.traffic).padStart(7)}  ${String(r.props).padStart(5)}  ${String(r.cars).padStart(11)}  ${String(r.items).padStart(6)}  ${String(r.fps).padStart(3)}  ${String(r.p50).padStart(4)}  ${String(r.p95).padStart(4)}  ${String(r.worst).padStart(5)}  ${String(r.hitches).padStart(7)}  ${String(r.stalls).padStart(6)}  ${String(r.slowSeconds).padStart(6)}  ${String(`${r.gcFrames ?? 0} (${r.gcMeanMs ?? 0})`).padStart(18)}  ${r.steady ? "yes" : "NO "}     ${r.pass ? "yes" : "NO"}`);
  }
  const stalls = results.flatMap((r) => (r.stallLog ?? []).map((s) => ({ step: r.label ?? r.step, ...s })));
  if (stalls.length) {
    lines.push("stalls: every frame over the hitch line, with what the frame was doing");
    lines.push("  step        t(s)   dt(ms)  gc   hud  ticks  resized");
    for (const s of stalls) lines.push(`  ${String(s.step).padEnd(11)} ${String(s.t.toFixed(2)).padStart(5)}  ${String(s.dt).padStart(6)}  ${s.gc ? "yes" : "no "}  ${s.hud ? "yes" : "no "}  ${String(s.ticks).padStart(5)}  ${s.resized ? "yes" : "no"}`);
  } else {
    lines.push("stalls: none");
  }
  lines.push(cap ? `cap (budget, no hitching): held up to ${cap.cars} cars drawn with ${cap.props} props (step ${cap.label}); broke at step ${cap.brokeAt ?? "-"}` : "cap (budget, no hitching): the budget did not hold at any step");
  lines.push(steadyCap ? `cap (steady state, stutter set aside): held up to ${steadyCap.cars} cars drawn with ${steadyCap.props} props (step ${steadyCap.label}); broke at step ${steadyCap.brokeAt ?? "-"}` : "cap (steady state): did not hold at any step");
  return lines.join("\n");
}
