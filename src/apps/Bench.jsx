/* =====================================================================
   THE BENCH (#/bench): the budget test, on the game as it now is.

   The ramp on #/iso measures stage 0's roads with cars and boxes; the
   maintainer ran it on the phone on 6 October and saw "no buses or
   anything newer", so its cap was for a scene simpler than the game.
   This runs the real sim on a map with everything in it (iso/bench.js)
   and the same ramp and meter (iso/perf.js): first more and more cars
   until the frame budget breaks, then, at a load the device held, each
   kind of thing switched off in turn to say what it costs -- on the
   sim's side and the draw's.

   The screen owns the canvas, the animation frames and React; the
   frame itself is bench.js's, which tools/verify-bench.mjs drives.
   NO REACT STATE IS WRITTEN FROM THE FRAME LOOP except the probe's,
   which is the point of the probe (perf.js).
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { budgetRamp, perfMeter, deviceInfo, deviceIdentity, gcProbe, taskProbe, BUDGET, INSTRUMENT, BUILD } from "../iso/perf.js";
import { benchState, loadStep, benchFrame, benchSteps, categorySteps, benchReport, benchMap } from "../iso/bench.js";
import { copyText } from "../copy.js";

const DPR_CAP = 2;   // as #/iso and #/map: two device pixels per CSS pixel is all a phone can show
const DIM = "#9AA3B2", TEXT = "#E6E8EC";

export default function Bench() {
  const canvasRef = useRef(null);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(null);
  const [probe, setProbe] = useState(0);
  const reportRef = useRef(null);
  const run = useRef(null);       // { phase, ramp, st, rampOut, identity }
  const readout = useRef("");
  const flags = useRef({ domTtl: 0, resized: false, tickMs: 0 });
  const tasks = useRef(null);
  const gc = useRef(null);

  const start = () => {
    setReport(null); setCopied(null); setRunning(true);
    run.current = { phase: "ramp", ramp: budgetRamp({ steps: benchSteps(), meter: perfMeter() }), st: null, rampOut: null, identity: {} };
    deviceIdentity().then((id) => { if (run.current) run.current.identity = id; });
  };

  useEffect(() => {
    if (!running) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!tasks.current) tasks.current = taskProbe();
    if (!gc.current) gc.current = gcProbe();
    let raf = 0, last = 0, fpsAt = performance.now(), frames = 0;

    const fit = () => {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        flags.current.resized = true;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    const tick = (now) => {
      const t0 = performance.now();
      const before = flags.current;
      flags.current = { domTtl: Math.max(0, (before.domTtl ?? 0) - 1), resized: false, tickMs: 0 };
      const size = fit();
      const r = run.current;
      if (!r) return;
      /* The frame: nothing to draw until the first step has built its world. */
      let fr = null;
      if (r.st) fr = benchFrame(r.st, last ? now - last : 16.7, ctx, size);
      else { ctx.fillStyle = "#1b1e23"; ctx.fillRect(0, 0, size.w, size.h); }
      const gap = last ? tasks.current.during(last, now) : {};
      const want = r.ramp.frame(now, fr?.drew, {
        gc: gc.current.tick(), dom: (before.domTtl ?? 0) > 0, ticks: fr?.ticks ?? 0, resized: before.resized, tickMs: before.tickMs,
        tasks: gap.tasks, longest: gap.longest, hidden: gap.hidden, input: gap.input, frame: gap.frame, split: fr?.split,
      });
      if (want.load) {
        r.st = r.st ? loadStep(r.st, want.load) : benchState(want.load);
      } else if (want.done && r.phase === "ramp") {
        /* The split runs at the steady cap -- the most the device held --
           and at least the first step's fleet. */
        r.rampOut = want;
        const fleet = want.steadyCap?.fleet ?? benchSteps()[1].fleet;
        r.phase = "split";
        r.ramp = budgetRamp({ steps: categorySteps(fleet), meter: perfMeter(), stopOnFail: false });
      } else if (want.done) {
        const device = deviceInfo({ ...r.identity, canvasDpr: Math.min(DPR_CAP, window.devicePixelRatio || 1), longTasks: tasks.current.supported, loaf: tasks.current.loaf, build: import.meta.env?.DEV ? "dev server (unminified React, StrictMode)" : "production build" });
        setReport(benchReport({ device, canvas: `${size.w}x${size.h}`, ramp: r.rampOut, split: want, loaded: benchMap() }));
        run.current = null; setRunning(false);
        return;
      }
      last = now;
      frames++;
      if (now - fpsAt > 1000) {
        const step = r.ramp.step;
        readout.current = `${r.phase === "ramp" ? "ramp" : "where it goes"} · step ${step?.label ?? ""} · ${fr?.drew?.extra?.moving ?? "-"} cars, ${fr?.drew?.extra?.walkers ?? "-"} walking, ${fr?.drew?.extra?.parked ?? "-"} parked · ${Math.round((frames * 1000) / (now - fpsAt))} fps`;
        /* THE PROBE: the ramp's first step issues a React update once a second, on purpose. */
        if (step?.probe) { setProbe((p) => p + 1); flags.current.domTtl = 2; }
        frames = 0; fpsAt = now;
      }
      ctx.fillStyle = "rgba(230,232,236,0.85)"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(readout.current, 8, 6);
      flags.current.tickMs = performance.now() - t0;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>The bench — the budget test on the whole game</span>
        <span style={S.sub}>trucks, buses, people walking and crossing, parked cars, buildings, sidewalks and sight blocking, on a city built to hold all of them</span>
      </div>
      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
        {probe > 0 && running && <div style={S.probe}>probe {probe}</div>}
        {!running && !report && <div style={S.idle}>Press Run. The city is built before the first step, so the screen stays dark for a few seconds, and again between steps.</div>}
      </div>
      <div style={S.panel}>
        <div style={S.row}>
          <button className="btn" style={{ ...S.chip, borderColor: running ? C.amber : C.green, color: C.white }} onClick={start} disabled={running}>
            {running ? "Running (about five minutes)…" : "Run the bench on this device"}
          </button>
          {report && (
            <button className="btn" style={{ ...S.chip, borderColor: copied ? C.green : copied === false ? C.amber : "rgba(255,255,255,0.12)" }}
              onClick={async () => { setCopied(await copyText(report, { selectIn: reportRef.current })); }}>
              {copied ? "Copied" : copied === false ? "Could not copy — the report is selected below, copy it by hand" : "Copy report"}
            </button>
          )}
          <span style={S.label}>instrument v{INSTRUMENT} · build {BUILD} — if this is not the latest, reload the page</span>
        </div>
        {report && <pre ref={reportRef} style={S.report}>{report}</pre>}
        <div style={S.note}>
          <b>What it does.</b> First a ramp: the whole game at 50 cars,
          then 100, 150 and on up to 400, each held for eight seconds while
          the frame times are recorded, until a step misses the budget
          (19 frames in 20 inside {BUDGET.p95} ms, no frame over {BUDGET.max} ms,
          no second under 30 fps). Then, at the most cars the phone held,
          the same scene with one kind of thing switched off at a time —
          trucks, buses, walkers, people crossing, parked cars, sight
          blocking, sidewalks, buildings — and once from further out, so
          the report says what each one costs. The first step updates the
          page once a second on purpose; it should show hitches, and that
          proves the test can see one. Keep the screen on and the phone
          still until the report appears, then copy it.
        </div>
      </div>
    </div>
  );
}

const S = {
  page: { minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg, color: TEXT },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: DIM },
  view: { position: "relative", height: "62vh", minHeight: 320, margin: "0 8px", borderRadius: 8, overflow: "hidden", background: "#1b1e23" },
  probe: { position: "absolute", right: 8, top: 6, fontFamily: FONT_D, fontSize: 12, color: DIM, pointerEvents: "none" },
  idle: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: FONT_U, fontSize: 14, color: DIM },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13 },
  label: { fontFamily: FONT_D, fontSize: 13, color: DIM, marginLeft: 6 },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
  report: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11, color: TEXT, whiteSpace: "pre", overflowX: "auto", background: "rgba(255,255,255,0.05)", padding: 8, borderRadius: 8, userSelect: "text" },
};
