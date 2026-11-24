/* =====================================================================
   YOUR TURN (working title): the short game's screen (GAME.md;
   WORK-game-slice1 section 6). Four driven rounds at one intersection
   each, a verdict after each, a summary at the end.

   REACT STATE CHANGES ONLY BETWEEN ROUNDS (GAME.md rule 3): the world, the
   player and the controls live in `runRound`'s own variables, the readouts
   are drawn on the canvas, and when a round ends the loop is stopped FIRST
   and the result set after.

   The scene and the drawn poses are MapRoad's own (`sceneFor`, `actorsOf`):
   one implementation of the quantity (GAME.md rule 4). The canvas loop,
   sizing and chase camera follow ExamRide and MapRoad.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, ChevronRight } from "lucide-react";
import { sceneFor, actorsOf } from "../apps/MapRoad.jsx";
import { ROUNDS } from "./rounds.js";
import { sceneArgs, startRound, roundTick, verdictOf, PLAYER_ASSIST } from "./round.js";
import { END_WORDS, TASK_WORDS } from "./words.js";
import { DT } from "../sim/crossing.js";
import { pageMore, pageLeft } from "../sim/pace.js";
import { driverPose, carriedPlayer, aheadOf, headwayOf, followTarget } from "../sim/drive.js";
import { HONK_FOR } from "../sim/horn.js";
import { controls } from "../iso/controls.js";
import { drawFrame } from "../iso/draw.js";
import { drawSlider, drawWheelBar, drawSignals, drawHorn } from "../iso/hud.js";
import { newChase, chaseStep, zoomFor } from "../iso/chase.js";
import { newBody } from "../iso/body.js";
import { BUILD } from "../iso/perf.js";

const DPR_CAP = 2;
const AFTER_END = 1000;   // ms the round keeps drawing after it ends, so the player sees what happened [invented]
const TEXT = "#E6E8EC", DIM = "#9AA3B2", AMBER = "#F2B84B", BG = "#1A1C20";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/* ONE ROUND ON A CANVAS. The world, the player and the camera are this function's own variables, never React state.
   `ctl` is iso/controls.js's controls; `onEnd(verdict)` is called once, AFTER the loop has been stopped. Returns a stop. */
export function runRound({ canvas, def, ctl, onEnd, raf: schedule = requestAnimationFrame, cancel = cancelAnimationFrame, win = typeof window !== "undefined" ? window : null }) {
  const ctx = canvas.getContext("2d");
  const held = new Set();
  const sc = sceneFor(...sceneArgs(def));
  let rs = startRound(def, { world: sc.world, me: sc.me });
  let cam = newChase();
  /* BODY MOTION: on, as MapRoad's default (settings.js bodyMotion: true). Its saved setting is async to load and is not read here, so a player who switched it off on #/map still sees it. */
  const body = newBody();
  let owed = 0, lastAt = 0, handle = 0, endAt = null, stopped = false;

  const fit = () => {
    const dpr = Math.min(DPR_CAP, (win && win.devicePixelRatio) || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  };
  const onKey = (e) => {
    if (e.type === "keydown" && !e.repeat && (e.key === "q" || e.key === "e")) ctl.signal(e.key === "q" ? "left" : "right");
    if (e.type === "keydown" && !e.repeat && e.key === "h") ctl.horn();
    if (e.type === "keydown") held.add(e.key); else held.delete(e.key);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
  };
  win?.addEventListener("keydown", onKey);
  win?.addEventListener("keyup", onKey);
  const stop = () => {
    stopped = true;
    cancel(handle);
    win?.removeEventListener("keydown", onKey);
    win?.removeEventListener("keyup", onKey);
  };

  const tick = (now) => {
    if (stopped) return;
    const size = fit();
    const dt = lastAt ? Math.min(0.25, Math.max(0, (now - lastAt) / 1000)) : 0;
    lastAt = now;
    const st = ctl.state;
    if (held.size) ctl.keys(held, dt);

    /* THE SIM STEPS AT 20 Hz FROM AN ACCUMULATOR, as #/map does (sim/pace.js). */
    owed += dt;
    const sp0 = performance.now();
    for (let steps = 0; pageMore(owed, steps, performance.now() - sp0); steps++) {
      owed -= DT;
      const r = roundTick(rs, { steer: st.steer, slider: st.slider, signal: st.signal, horn: st.horn, assist: PLAYER_ASSIST });
      rs = r.rs;
      st.signal = r.signal;   // spent by the turn it caused
      if (rs.end && endAt == null) endAt = now;
    }
    owed = pageLeft(owed);
    sc.world = rs.world; sc.me = rs.me;

    /* THE END: keep drawing for a second, THEN stop the loop, THEN tell the screen. */
    if (endAt != null && now - endAt >= AFTER_END) { stop(); onEnd(verdictOf(rs)); return; }

    const me = rs.me, world = rs.world;
    body.dt = dt;
    const actors = actorsOf(sc, owed, body);
    const p = driverPose(carriedPlayer(me, owed), world.course);
    cam = { ...chaseStep(cam, { ...p, v: me.v }, dt, { rotate: true }), id: null };
    const k = zoomFor(size.w, size.h, cam.lead, 0.55, 30);
    drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam, rot: cam.rot, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t: world.t + owed, lights: world.lights });

    /* THE HUD, all on the canvas. */
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = "#ffffff"; ctx.font = `700 26px ${FONT}`;
    ctx.fillText(`${Math.round(me.v * 3.6)}`, size.w / 2, 6);
    ctx.fillStyle = "rgba(230,232,236,0.8)"; ctx.font = `12px ${FONT}`;
    ctx.fillText("km/h", size.w / 2, 38);
    /* The task, always. */
    ctx.fillStyle = AMBER; ctx.font = `600 15px ${FONT}`;
    ctx.fillText(def.say, size.w / 2, 56);
    /* What the car will do at the line, said back, so the signal is a control and not only a light. */
    const ahead = aheadOf(me, world.course, world);
    if (ahead.node) {
      const word = ahead.intent === "left" ? "turning left" : ahead.intent === "right" ? "turning right" : "straight on";
      ctx.fillStyle = ahead.committed ? "#6cc070" : me.signal ? AMBER : "rgba(230,232,236,0.6)";
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`${word}${ahead.committed ? " — committed" : ` in ${Math.round(ahead.toLine)} m`}`, size.w / 2, 78);
    }
    const hw = headwayOf(me, world);
    drawSlider(ctx, size, st.slider, me.v, me.grade ?? 0, ahead.stop, ahead.stop ? null : followTarget(me, hw));
    drawWheelBar(ctx, size, st.steer);
    drawSignals(ctx, size, st.signal, now);
    drawHorn(ctx, size, me.honkAt != null && world.t - me.honkAt < HONK_FOR);
    /* The round is over: say so on the canvas for the second it is still drawn. */
    if (endAt != null) {
      ctx.fillStyle = "rgba(20,22,26,0.7)"; ctx.fillRect(0, size.h / 2 - 28, size.w, 56);
      ctx.fillStyle = "#ffffff"; ctx.font = `700 24px ${FONT}`; ctx.textBaseline = "middle";
      ctx.fillText(rs.end.why === "through" ? "Through" : END_WORDS[rs.end.why] ?? rs.end.why, size.w / 2, size.h / 2);
    }
    handle = schedule(tick);
  };
  handle = schedule(tick);
  return stop;
}

export default function Game() {
  const canvasRef = useRef(null);
  const input = useRef(controls());
  const [phase, setPhase] = useState("title");   // title | intro | driving | result | summary
  const [ix, setIx] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [verdict, setVerdict] = useState(null);
  const [stars, setStars] = useState([]);          // the last verdict's stars per round
  const def = ROUNDS[ix];

  useEffect(() => {
    if (phase !== "driving" || !canvasRef.current) return undefined;
    const ctl = controls();
    input.current = ctl;
    return runRound({
      canvas: canvasRef.current, def, ctl,
      /* The loop has stopped; only now does React hear of the round. */
      onEnd: (v) => { setVerdict(v); setStars((s) => { const n = s.slice(); n[ix] = v.stars; return n; }); setPhase("result"); },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ix, attempt]);

  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, { w: r.width, h: r.height }]; };
  const onDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y, box] = at(e); input.current.pointer("down", e.pointerId, x, y, box, performance.now()); };
  const onMove = (e) => { const [x, y, box] = at(e); input.current.pointer("move", e.pointerId, x, y, box, performance.now()); };
  const onUp = (e) => { const [x, y, box] = at(e); input.current.pointer("up", e.pointerId, x, y, box, performance.now()); };

  const total = stars.reduce((s, n) => s + (n ?? 0), 0);
  const isLast = ix === ROUNDS.length - 1;

  if (phase === "driving") {
    return (
      <div style={S.fill}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>
    );
  }

  return (
    <div style={S.page}>
      {phase === "title" && (
        <div style={S.card}>
          <div style={S.big}>Your Turn</div>
          <div style={S.sub}>Four intersections. Drive each one, and see how you did.</div>
          <button style={S.btn} onClick={() => { setIx(0); setStars([]); setPhase("intro"); }}><Play size={18} /> Play</button>
          <div style={S.stamp}>{BUILD}</div>
        </div>
      )}

      {phase === "intro" && (
        <div style={S.card}>
          <div style={S.dim}>Round {ix + 1} of {ROUNDS.length} · {def.title}</div>
          <div style={S.big}>{TASK_WORDS[def.task]}</div>
          <div style={S.sub}>{def.brief}</div>
          {ix === 0 && <div style={S.hint}>Drag on the left to steer. Slide the right edge up to go, down to brake. Tap a top corner to signal.</div>}
          <button style={S.btn} onClick={() => { setAttempt((a) => a + 1); setPhase("driving"); }}><Play size={18} /> Drive</button>
        </div>
      )}

      {phase === "result" && verdict && (
        <div style={S.card}>
          <div style={S.dim}>Round {ix + 1} of {ROUNDS.length} · {def.title}</div>
          <div style={S.starsRow} aria-label={`${verdict.stars} of 3 stars`}>{[0, 1, 2].map((i) => (i < verdict.stars ? "★" : "☆")).join(" ")}</div>
          {verdict.why !== "through" && <div style={S.fault}>{END_WORDS[verdict.why] ?? verdict.why}</div>}
          {verdict.faults.map((f) => <div key={f.id} style={S.fault}>{f.words}{f.count > 1 ? ` (×${f.count})` : ""}</div>)}
          {verdict.notes.map((f) => <div key={f.id} style={S.note}>{f.words}</div>)}
          {verdict.praise.map((f) => <div key={f.id} style={S.praise}>{f.words}{f.count > 1 ? ` (×${f.count})` : ""}</div>)}
          {verdict.why === "through" && !verdict.faults.length && !verdict.praise.length && <div style={S.praise}>A clean round.</div>}
          <div style={S.row}>
            <button style={S.btnGhost} onClick={() => { setAttempt((a) => a + 1); setPhase("driving"); }}><RotateCcw size={18} /> Try again</button>
            <button style={S.btn} onClick={() => { if (isLast) setPhase("summary"); else { setIx(ix + 1); setPhase("intro"); } }}>{isLast ? "See your set" : "Next"} <ChevronRight size={18} /></button>
          </div>
        </div>
      )}

      {phase === "summary" && (
        <div style={S.card}>
          <div style={S.big}>Your set</div>
          {ROUNDS.map((r, i) => (
            <div key={r.id} style={S.sumRow}><span>{r.title}</span><span style={S.starsSmall}>{[0, 1, 2].map((j) => (j < (stars[i] ?? 0) ? "★" : "☆")).join("")}</span></div>
          ))}
          <div style={S.sub}>{total} of {ROUNDS.length * 3} stars</div>
          <button style={S.btn} onClick={() => { setIx(0); setStars([]); setVerdict(null); setPhase("intro"); }}><RotateCcw size={18} /> Play again</button>
        </div>
      )}
    </div>
  );
}

const pad = "max(16px, env(safe-area-inset-left))";
const S = {
  fill: { position: "fixed", inset: 0, height: "100dvh", background: BG },
  page: { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: BG, color: TEXT, fontFamily: FONT, padding: `max(16px, env(safe-area-inset-top)) ${pad} max(16px, env(safe-area-inset-bottom)) ${pad}` },
  card: { width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 14, alignItems: "stretch", textAlign: "center" },
  big: { fontSize: 36, fontWeight: 700, color: "#fff" },
  sub: { fontSize: 16, color: TEXT, lineHeight: 1.4 },
  dim: { fontSize: 13, color: DIM },
  hint: { fontSize: 14, color: AMBER, lineHeight: 1.4 },
  stamp: { fontSize: 11, color: "rgba(154,163,178,0.6)" },
  btn: { minHeight: 48, padding: "0 20px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, border: "none", background: AMBER, color: "#1a1c20", fontSize: 17, fontWeight: 700, fontFamily: FONT },
  btnGhost: { minHeight: 48, padding: "0 20px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: TEXT, fontSize: 16, fontFamily: FONT },
  row: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" },
  starsRow: { fontSize: 48, color: AMBER, letterSpacing: 6 },
  starsSmall: { fontSize: 20, color: AMBER, letterSpacing: 3 },
  fault: { fontSize: 16, color: "#ff9a8f", lineHeight: 1.35 },
  note: { fontSize: 15, color: DIM, lineHeight: 1.35 },
  praise: { fontSize: 16, color: "#8fd694", lineHeight: 1.35 },
  sumRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 17, padding: "6px 4px", borderBottom: "1px solid rgba(255,255,255,0.1)" },
};
