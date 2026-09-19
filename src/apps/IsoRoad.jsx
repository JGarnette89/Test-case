/* =====================================================================
   STAGE 0 OF THE SIMULATOR: the traffic that works, rendered
   isometrically on a curved road with a hill in it and one overpass.

   SIMULATOR.md section 6, stage 0. The deliverable is the maintainer's
   opinion, on two questions he judges by eye: does an isometric world
   with free-drawn curves and real elevation look right, and does the
   draw order survive an overpass. Everything else is deliberately
   absent: no editor, no map format, no city, no player controls, no
   sprites.

   Canvas, not SVG (SIMULATOR.md 5.2). The sim steps at its fixed 20 Hz
   from an accumulator, as the SVG screens do; the canvas repaints at the
   display's rate with positions carried forward by the time since the
   last tick, so motion is smooth without the sim knowing about frames.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { seedScene, stepScene, carsOf, DT } from "../iso/world.js";
import { drawFrame } from "../iso/draw.js";
import { poseAt } from "../iso/road.js";
import { perfMeter, deviceInfo, deviceIdentity, budgetRamp, reportText, gcProbe, BUDGET } from "../iso/perf.js";

/* THE CANVAS IS CAPPED AT TWO DEVICE PIXELS PER CSS PIXEL. A 3.5x phone
   would otherwise rasterise 1383x1845 for a 395x527 view -- twelve
   device pixels per CSS pixel -- for no difference a phone screen can
   show. Free headroom for when the scene is busy. */
const DPR_CAP = 2;

const LIMITS = [50, 60, 100];
/* The palette has no dim or body text tone; these are the ones the other
   sim screens end up with by default. */
const DIM = "#9AA3B2", TEXT = "#E6E8EC";

export default function IsoRoad() {
  /* `/?crash#/iso` throws on render, so the error boundary around every
     screen can be seen to work rather than believed to. */
  if (typeof location !== "undefined" && /crash/.test(location.search)) throw new Error("deliberate crash for the error boundary");
  const canvasRef = useRef(null);
  const [seed, setSeed] = useState(1);
  const [limit, setLimit] = useState(60);
  const [playing, setPlaying] = useState(true);
  const [follow, setFollow] = useState("valley");   // which road the camera rides, or a fixed place
  const [tilt, setTilt] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [stats, setStats] = useState({ cars: 0, items: 0, fps: 0, p95: 0, worst: 0, hitches: 0 });
  /* THE BUDGET TEST. A ramp of loads, each held for a few seconds while
     the meter records; the cap on visible cars is whatever step last
     passed. Runs from a ref so the frame loop can drive it; the report
     lands in state when it is done. */
  const [report, setReport] = useState(null);
  const [testing, setTesting] = useState(false);
  const ramp = useRef(null);
  const drewLast = useRef(null);   // what the last frame drew, for the ramp's record

  /* THE SCENE LIVES IN A REF, NOT IN STATE. Sixty repaints a second
     through React would be sixty reconciliations of nothing; the canvas
     is painted directly and React only draws the controls around it. */
  const scene = useRef(seedScene(1, 60));
  const cam = useRef({ x: 0, y: 0, z: 0, id: null });
  const owed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const meter = useRef(perfMeter());
  const gc = useRef(gcProbe());
  /* What the previous frame did, for the ramp's stall log: a React
     state update issued (it renders in the task after the frame, so its
     cost lands on the NEXT frame's time), and whether the canvas was
     resized. */
  const flags = useRef({ hud: false, resized: false });
  const identity = useRef({});   // the real model, from client hints, fetched when a test starts

  const startTest = () => {
    ramp.current = budgetRamp();
    deviceIdentity().then((id) => { identity.current = id; });
    setReport(null); setTesting(true);
    setPlaying(true); setFollow("overpass"); setZoom(0.8);
    cam.current = { x: 0, y: 0, z: 0, id: null };
    meter.current.reset();
  };

  const restart = (s = seed, kmh = limit) => {
    setSeed(s); setLimit(kmh);
    scene.current = seedScene(s, kmh);
    cam.current = { x: 0, y: 0, z: 0, id: null };
    owed.current = 0;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let frames = 0, fpsAt = performance.now();

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

    /* Two fixed places to look at, because a viewer should not have to
       wait for a car to reach the bridge or the crest to judge them. The
       ramp looks at the overpass and scatters its props around it. */
    const PLACES = { overpass: { x: 140, y: 257, z: 3 }, crest: { x: 470, y: 166, z: 10 } };

    const tick = (now) => {
      /* The flags describe the frame that just ended, whose cost is the
         dt recorded now; a fresh set collects what THIS frame does. */
      const before = flags.current;
      flags.current = { hud: false, resized: false, ticks: 0 };
      const size = fit();
      if (last.current) meter.current.record(now - last.current);
      /* The ramp, if one is running: it says when to load the next step
         and when it is done (perf.js). It is told what the frame before
         did -- a collection seen by the probe, a HUD update, the sim
         ticks, a resize -- so a stall can be read against a cause. */
      const collected = gc.current.tick();
      const r = ramp.current;
      if (r) {
        const want = r.frame(now, drewLast.current, { gc: collected, hud: before.hud, ticks: before.ticks ?? 0, resized: before.resized });
        if (want.done) {
          const device = deviceInfo({ ...identity.current, canvasDpr: Math.min(DPR_CAP, window.devicePixelRatio || 1), build: import.meta.env?.DEV ? "dev server (unminified React, StrictMode)" : "production build" });
          setReport(reportText({ device, results: want.results, cap: want.cap, steadyCap: want.steadyCap, canvas: `${size.w}x${size.h}` }));
          ramp.current = null; setTesting(false);
          scene.current = seedScene(seed, limit);
          meter.current.reset();
        } else if (want.load) {
          scene.current = seedScene(seed, limit, { ...want.load, focus: PLACES.overpass });
        }
      }
      if (last.current && playing) {
        owed.current += Math.min(0.25, (now - last.current) / 1000);
        const n = Math.floor(owed.current / DT);
        if (n > 0) { owed.current -= n * DT; scene.current = stepScene(scene.current, n); flags.current.ticks = n; }
      }
      last.current = now;

      const sc = scene.current;
      const carry = playing ? owed.current : 0;
      const roads = carsOf(sc, carry);

      /* THE CAMERA FOLLOWS ONE CAR, and picks another when it leaves.
         Smoothed, so a car that despawns at the far end does not snap
         the world; the followed car sits a little below centre so the
         road ahead of it gets the screen. The camera never rotates: an
         isometric world faces one way (SIMULATOR.md 5.2). */
      const wanted = PLACES[follow] ? null : roads.find((r) => r === (follow === "bridge" ? roads[1] : roads[0]));
      let target = null;
      if (PLACES[follow]) {
        const p = PLACES[follow];
        const ease = cam.current.x === 0 && cam.current.y === 0 ? 1 : 0.08;
        cam.current.x += (p.x - cam.current.x) * ease;
        cam.current.y += (p.y - cam.current.y) * ease;
        cam.current.z += (p.z - cam.current.z) * ease;
      }
      if (wanted) {
        target = wanted.cars.find((c) => c.id === cam.current.id && c.dir === 1) ?? null;
        if (!target) {
          const ahead = wanted.cars.filter((c) => c.dir === 1).sort((a, b) => a.s - b.s);
          target = ahead[Math.floor(ahead.length * 0.35)] ?? ahead[0] ?? null;
          cam.current.id = target?.id ?? null;
        }
      }
      if (target) {
        const p = poseAt(wanted.road, target.dir > 0 ? target.s : wanted.road.length - target.s);
        const ease = cam.current.x === 0 && cam.current.y === 0 ? 1 : 0.08;
        cam.current.x += (p.x - cam.current.x) * ease;
        cam.current.y += (p.y - cam.current.y) * ease;
        cam.current.z += (p.z - cam.current.z) * ease;
      }

      /* Pixels per metre: about seventy metres of road across the
         canvas at zoom 1, whatever the device. */
      const k = Math.max(3, (size.w / 70) * zoom);
      /* `/?bare#/iso` drops the ground, for telling a drawing bug from
         an ordering bug. */
      const bare = typeof location !== "undefined" && /bare/.test(location.search);
      const drew = drawFrame(ctx, size, { roads, terrain: bare ? [] : sc.terrain, cam: cam.current, k, tilt, props: sc.props });
      drewLast.current = drew;

      frames++;
      /* The once-a-second readout is a React state update issued from
         inside the frame loop. During the budget test it runs only on a
         step that asks for it (the HUD-on probe), so its cost can be
         told from everything else's. */
      if (now - fpsAt > 1000 && (!ramp.current || ramp.current.step?.hud)) {
        const sum = meter.current.summary(120);
        setStats({ cars: drew.cars, items: drew.items, fps: sum.fps, p95: sum.p95, worst: sum.worst, hitches: sum.hitches });
        flags.current.hud = true;
        frames = 0; fpsAt = now;
      }
      raf.current = requestAnimationFrame(tick);
    };
    /* The first frame is painted NOW, not on the first animation frame:
       a screen that only ever draws inside requestAnimationFrame is
       blank anywhere frames do not arrive, which includes the preview
       pane this project has lost sessions to (CLAUDE.md item 7). */
    tick(performance.now());
    return () => cancelAnimationFrame(raf.current);
  }, [playing, follow, tilt, zoom, seed, limit]);

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 0 — isometric, a curve, a hill, an overpass</span>
        <span style={S.sub}>
          the traffic that already works, drawn from above and to the side, on a road with real height in it.
        </span>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
        <div style={S.readout}>
          {stats.cars} cars on screen · {stats.items} things drawn · {stats.fps} fps · p95 {stats.p95}ms · worst {stats.worst}ms · {stats.hitches} hitches · {limit} km/h
          {testing && " · BUDGET TEST RUNNING"}
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)}>
            <RotateCcw size={16} />
          </button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
            <ZoomOut size={16} />
          </button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.min(3, z * 1.25))}>
            <ZoomIn size={16} />
          </button>
          <span style={S.label}>Follow</span>
          {[["valley", "a car on the valley road"], ["bridge", "a car on the bridge road"], ["overpass", "the overpass"], ["crest", "the crest"]].map(([id, label]) => (
            <button key={id} className="btn" style={{
              ...S.chip,
              borderColor: follow === id ? C.amber : "rgba(255,255,255,0.12)",
              color: follow === id ? C.white : DIM,
            }} onClick={() => { cam.current = { x: 0, y: 0, z: 0, id: null }; setFollow(id); }}>{label}</button>
          ))}
          <button className="btn" style={{
            ...S.chip,
            borderColor: tilt ? C.blue : "rgba(255,255,255,0.12)",
            color: tilt ? C.white : DIM,
          }} onClick={() => setTilt((t) => !t)}>{tilt ? "Cars tilt with the road" : "Cars level (as sprites would be)"}</button>
          <span style={S.label}>Limit</span>
          {LIMITS.map((kmh) => (
            <button key={kmh} className="btn" style={{
              ...S.chip, minWidth: 0, padding: "0 10px",
              borderColor: limit === kmh ? C.green : "rgba(255,255,255,0.12)",
              color: limit === kmh ? C.white : DIM,
            }} onClick={() => restart(seed, kmh)}>{kmh}</button>
          ))}
        </div>

        <div style={S.row}>
          <button className="btn" style={{ ...S.chip, borderColor: testing ? C.amber : C.green, color: C.white }}
            onClick={startTest} disabled={testing}>
            {testing ? "Budget test running (about a minute)…" : "Run the budget test on this device"}
          </button>
          {report && (
            <button className="btn" style={S.chip} onClick={() => { try { navigator.clipboard?.writeText(report); } catch { /* selectable below */ } }}>
              Copy report
            </button>
          )}
        </div>
        {report && <pre style={S.report}>{report}</pre>}
        <div style={S.note}>
          <b>The budget test.</b> Ramps the load on this device — more
          traffic, then stand-in buildings — holding each step for eight
          seconds and recording the frame times that ARE the budget: the
          frame 19 of 20 beat (p95 ≤ {BUDGET.p95} ms), the worst frame
          (no hitch over {BUDGET.max} ms), and whether any whole second
          fell under 30 fps. The cap on visible cars is the last step
          that passed. Run it on the phone, then copy the report.
          <br />
          <b>What to look at.</b> Two roads. The valley road bends twice
          and climbs a hill in its second half; the bridge road crosses
          it on an embankment with a span over the top. Cars follow each
          other in both directions on both — the same following model as
          stage 0, on roads that are curves with height instead of a
          straight line.
          <br />
          <b>The two questions.</b> Does an isometric world with free-drawn
          curves and real height look right — the bend, the crest, the
          ramps? And does the draw order survive the overpass: a car
          passing under the span must vanish behind the deck and appear
          on the other side, a car on the span must stay on top of it,
          and a car beyond the crest must be hidden by the crest.
          <br />
          <b>What it deliberately does not do.</b> Cars are code-drawn
          boxes at 32 headings, not sprites — so what you see of the
          heading steps is what a 32-heading sprite set will give. They
          are drawn <i>level</i> by default because sprites have no
          pitch; the tilt button shows what pitching would add. No
          intersection between the two roads, no player controls, no map,
          no editor, no textures, no shadows, no scenery. The projection
          angle and the hill's height are chosen to look right, not
          derived.
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
  readout: { position: "absolute", left: 8, top: 6, fontFamily: FONT_D, fontSize: 12, color: DIM, pointerEvents: "none" },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  btn: { width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: C.white },
  chip: { minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13 },
  label: { fontFamily: FONT_D, fontSize: 13, color: DIM, marginLeft: 6 },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
  report: { fontFamily: "ui-monospace, Menlo, Consolas, monospace", fontSize: 11, color: TEXT, whiteSpace: "pre", overflowX: "auto", background: "rgba(255,255,255,0.05)", padding: 8, borderRadius: 8, userSelect: "text" },
};
