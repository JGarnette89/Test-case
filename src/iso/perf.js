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
    /* Whether a step of the ramp passed the budget. */
    passes(sum = this.summary()) {
      return sum.p95 <= BUDGET.p95 && sum.worst <= BUDGET.max && sum.slowSeconds <= BUDGET.slowSeconds;
    },
  };
}

/* What the report has to say about the device, so a number means
   something when it is pasted somewhere else. */
export function deviceInfo() {
  if (typeof navigator === "undefined") return {};
  return {
    ua: navigator.userAgent,
    cores: navigator.hardwareConcurrency ?? null,
    memoryGB: navigator.deviceMemory ?? null,
    dpr: window.devicePixelRatio ?? 1,
    screen: `${window.screen?.width}x${window.screen?.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

/* A ramp: each step holds a load for `hold` seconds and records the
   budget's numbers for that load. Steps are whatever the screen can
   ramp -- here, a traffic multiplier (each unit is four worlds of cars,
   about forty on a phone's screen at the overpass) and stand-in
   buildings scattered where the camera looks. The prop counts are what
   a city view might hold, not a stress figure: a phone screen at this
   zoom shows a couple of hundred metres of street. */
export function rampSteps() {
  return [
    { traffic: 1, props: 0 },
    { traffic: 2, props: 0 },
    { traffic: 2, props: 60 },
    { traffic: 3, props: 120 },
    { traffic: 4, props: 200 },
    { traffic: 6, props: 300 },
  ];
}

/* THE RAMP AS A STATE MACHINE, so it can be driven by synthetic frames
   in node and proven to terminate before a phone is asked to run it.
   The screen calls `frame(now, counts)` once per animation frame with
   the frame timestamp and what that frame drew; the result says what
   to do: nothing, `load` a new step (the screen rebuilds its scene),
   or `done` with the report's inputs. Each step settles for `settle`
   seconds -- the scene build is a stall and must not be counted -- then
   holds for `hold` seconds of recording. The ramp stops at the first
   step that fails: a heavier load cannot pass where a lighter one did
   not, and every step past the break is a minute of the tester's time. */
export function budgetRamp({ steps = rampSteps(), settle = 1, hold = 8, meter = perfMeter() } = {}) {
  let i = 0, at = null, settled = false, last = null, counts = null;
  const results = [];
  const finish = () => {
    const passed = results.filter((x) => x.pass);
    const cap = passed.length
      ? { ...passed[passed.length - 1], brokeAt: results.find((x) => !x.pass)?.step ?? null }
      : null;
    return { done: true, results, cap };
  };
  return {
    get step() { return steps[i]; },
    get index() { return i; },
    results,
    frame(now, drew) {
      if (last != null) meter.record(now - last);
      last = now;
      if (drew) counts = { cars: drew.cars, items: drew.items };
      if (at == null) { at = now; meter.reset(); return { load: steps[0] }; }
      const held = (now - at) / 1000;
      if (!settled && held >= settle) { settled = true; meter.reset(); }
      if (!settled || held < settle + hold) return {};
      const sum = meter.summary();
      results.push({ step: i + 1, ...steps[i], ...sum, ...(counts ?? {}), pass: meter.passes(sum) });
      i++;
      if (i >= steps.length || !results[results.length - 1].pass) return finish();
      at = now; settled = false; meter.reset();
      return { load: steps[i] };
    },
  };
}

export function reportText({ device, results, cap, canvas }) {
  const lines = [];
  lines.push(`performance report ${new Date().toISOString()}`);
  lines.push(`device: ${device.ua}`);
  lines.push(`cores ${device.cores} · memory ${device.memoryGB}GB · dpr ${device.dpr} · screen ${device.screen} · viewport ${device.viewport} · canvas ${canvas}`);
  lines.push(`budget: p95 <= ${BUDGET.p95}ms, no frame over ${BUDGET.max}ms (a hitch), no second under 30 fps`);
  lines.push("step  traffic  props  cars(drawn)  things  fps  p50   p95   worst  hitches  stalls  slow-s  pass");
  for (const r of results) {
    lines.push(`${String(r.step).padStart(4)}  ${String(r.traffic).padStart(7)}  ${String(r.props).padStart(5)}  ${String(r.cars).padStart(11)}  ${String(r.items).padStart(6)}  ${String(r.fps).padStart(3)}  ${String(r.p50).padStart(4)}  ${String(r.p95).padStart(4)}  ${String(r.worst).padStart(5)}  ${String(r.hitches).padStart(7)}  ${String(r.stalls).padStart(6)}  ${String(r.slowSeconds).padStart(6)}  ${r.pass ? "yes" : "NO"}`);
  }
  lines.push(cap ? `cap: the budget held up to ${cap.cars} cars drawn with ${cap.props} props (step ${cap.step}); it broke at step ${cap.brokeAt ?? "-"}` : "cap: the budget did not hold at the first step");
  return lines.join("\n");
}
