/* =====================================================================
   STAGE 1, FIRST SLICE: THE PLAYER AT THE WHEEL.

   SIMULATOR.md 1.1 and stage 1. The two controls -- steering by a drag
   on the left of the canvas, the throttle-to-brake slider on the right
   -- on a car that is otherwise an ordinary member of the stage-0
   traffic: the car behind it follows it with the same following model
   that follows everybody else. On the stage-0 roads, so it can be felt
   on a phone before the map format and the intersections exist; turns
   committed at intersections arrive with the intersections.

   The one question this screen exists to answer is the caution in 1.1:
   does it feel right to drive? Nothing here is shaped for the exam mode.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { seedScene, carsOf, stepWithPlayer, clearAround, DT } from "../iso/world.js";
import { drawFrame } from "../iso/draw.js";
import { poseAt, LANE } from "../iso/road.js";
import { newPlayer, stepPlayer, playerPose, touching, NEUTRAL } from "../iso/player.js";
import { controls, SLIDER_W } from "../iso/controls.js";
import { perfMeter } from "../iso/perf.js";

const LIMITS = [50, 60, 100];
const DIM = "#9AA3B2", TEXT = "#E6E8EC";

export default function Wheel() {
  const canvasRef = useRef(null);
  const [seed, setSeed] = useState(1);
  const [limit, setLimit] = useState(60);
  const [spring, setSpring] = useState(false);
  const [hud, setHud] = useState({ kmh: 0, contacts: 0, fps: 0, offRoad: false, laps: 0, cars: 0 });
  const [stopped, setStopped] = useState(false);   // after a contact, until restarted

  /* The world and the player live in refs: the canvas is painted
     directly, and React draws only the chrome (IsoRoad.jsx). */
  const START = 40;
  const scene = useRef(clearAround(seedScene(1, 60), START));
  const me = useRef(newPlayer(START, LANE / 2, 0));
  const input = useRef(controls());
  const held = useRef(new Set());
  const cam = useRef({ x: 0, y: 0, z: 0 });
  const owed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const meter = useRef(perfMeter());
  const tally = useRef({ contacts: 0, laps: 0, flash: 0 });

  const restart = (s = seed, kmh = limit) => {
    setSeed(s); setLimit(kmh); setStopped(false);
    scene.current = clearAround(seedScene(s, kmh), START);
    me.current = newPlayer(START, LANE / 2, 0);
    input.current.state.steer = 0; input.current.state.slider = 0;
    cam.current = { x: 0, y: 0, z: 0 };
    owed.current = 0;
    tally.current = { contacts: 0, laps: 0, flash: 0 };
  };

  useEffect(() => { input.current.state.spring = spring; }, [spring]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let fpsAt = performance.now();

    const fit = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    const onKey = (e) => {
      if (e.type === "keydown") held.current.add(e.key); else held.current.delete(e.key);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);

    const tick = (now) => {
      const size = fit();
      const dt = last.current ? Math.min(0.25, Math.max(0, (now - last.current) / 1000)) : 0;
      if (last.current) meter.current.record(now - last.current);
      last.current = now;
      if (held.current.size) input.current.keys(held.current, dt);
      const inp = { steer: input.current.state.steer, slider: input.current.state.slider };

      /* THE SIM STEPS AT 20 Hz FROM AN ACCUMULATOR; the player is stepped
         in the same ticks and written into the traffic world before each,
         so the car behind sees where the player really is. */
      if (!stopped) {
        owed.current += dt;
        const road = scene.current.valley;
        while (owed.current >= DT) {
          owed.current -= DT;
          let p = stepPlayer(me.current, inp, road, poseAt, DT);
          if (p.s >= road.length) { p = { ...p, s: p.s - road.length }; tally.current.laps++; }
          me.current = p;
          scene.current = stepWithPlayer(scene.current, me.current);
          /* Contact stops the car where it is. What a collision IS in
             this game is still the maintainer's question; until it has
             an answer, driving through somebody is not on offer. */
          const pose = playerPose(me.current, road, poseAt);
          let hit = false;
          for (const { road: r, cars } of carsOf(scene.current, 0)) {
            for (const c of cars) {
              if (c.player) continue;
              const along = c.dir > 0 ? c.s : r.length - c.s;
              const q = poseAt(r, along);
              const heading = c.dir > 0 ? q.heading : q.heading + 180;
              const h = (heading * Math.PI) / 180;
              const off = LANE / 2 + (c.weave ?? 0);
              const other = { x: q.x - Math.sin(h) * off, y: q.y + Math.cos(h) * off, z: q.z, heading };
              if (touching(pose, other)) hit = true;
            }
          }
          if (hit) { tally.current.contacts++; tally.current.flash = 1; setStopped(true); break; }
        }
      }

      const sc = scene.current;
      const carry = stopped ? 0 : owed.current;
      const roads = carsOf(sc, carry);
      const road = sc.valley;
      const pose = playerPose(me.current, road, poseAt);

      /* THE CAMERA RIDES THE PLAYER and looks a second ahead, so the
         road coming gets the screen at speed and the car sits central
         at rest. Eased, and snapped on the first frame. */
      const h = (pose.heading * Math.PI) / 180, look = Math.min(25, me.current.v * 1.0);
      const want = { x: pose.x + Math.cos(h) * look, y: pose.y + Math.sin(h) * look, z: pose.z };
      const ease = cam.current.x === 0 && cam.current.y === 0 ? 1 : 0.12;
      cam.current.x += (want.x - cam.current.x) * ease;
      cam.current.y += (want.y - cam.current.y) * ease;
      cam.current.z += (want.z - cam.current.z) * ease;

      const k = Math.max(3, size.w / 60);
      const drew = drawFrame(ctx, size, { roads, terrain: sc.terrain, cam: cam.current, k, tilt: false, props: sc.props });
      drawControls(ctx, size, inp, tally.current);
      if (tally.current.flash > 0) tally.current.flash = Math.max(0, tally.current.flash - dt * 2);

      if (now - fpsAt > 250) {
        const sum = meter.current.summary(120);
        setHud({ kmh: Math.round(me.current.v * 3.6), contacts: tally.current.contacts, fps: sum.fps, offRoad: Math.abs(me.current.off) > road.width / 2 + 0.5, laps: tally.current.laps, cars: drew.cars });
        fpsAt = now;
      }
      raf.current = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, [stopped, seed, limit]);

  /* Pointer events straight off the canvas, captured so a drag that
     leaves it keeps steering. */
  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, { w: r.width, h: r.height }]; };
  const onDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y, box] = at(e); input.current.pointer("down", e.pointerId, x, y, box); };
  const onMove = (e) => { const [x, y, box] = at(e); input.current.pointer("move", e.pointerId, x, y, box); };
  const onUp = (e) => { const [x, y, box] = at(e); input.current.pointer("up", e.pointerId, x, y, box); };

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>At the wheel</span>
        <span style={S.sub}>steer by dragging on the left; the slider on the right is throttle at the top, brake at the bottom, coasting between.</span>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        <div style={S.readout}>
          <span style={S.speed}>{hud.kmh}</span> km/h · limit {limit} · {hud.cars} cars in view · {hud.fps} fps
          {hud.offRoad && <span style={{ color: C.amber }}> · OFF THE ROAD</span>}
          {hud.laps > 0 && <span> · lap {hud.laps + 1}</span>}
        </div>
        {stopped && (
          <div style={S.banner}>
            <div style={{ fontFamily: FONT_D, fontSize: 18, fontWeight: 700 }}>Contact.</div>
            <div style={{ fontFamily: FONT_U, fontSize: 13, color: DIM, margin: "4px 0 10px" }}>You hit another car. What a collision means here is still open; for now it stops you.</div>
            <button className="btn" style={S.chip} onClick={() => restart()}>Restart</button>
          </div>
        )}
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)} title="restart with new traffic"><RotateCcw size={16} /></button>
          <span style={S.label}>Traffic</span>
          {LIMITS.map((kmh) => (
            <button key={kmh} className="btn" style={{ ...S.chip, minWidth: 0, padding: "0 10px", borderColor: limit === kmh ? C.green : "rgba(255,255,255,0.12)", color: limit === kmh ? C.white : DIM }}
              onClick={() => restart(seed, kmh)}>{kmh}</button>
          ))}
          <button className="btn" style={{ ...S.chip, borderColor: spring ? C.blue : "rgba(255,255,255,0.12)", color: spring ? C.white : DIM }}
            onClick={() => setSpring((s) => !s)}>{spring ? "Slider springs back to neutral" : "Slider holds where it is left"}</button>
          <span style={S.label}>keys: arrows or WASD, space brakes</span>
        </div>
        <div style={S.note}>
          <b>What to feel for.</b> The bends are driven: hold the wheel
          straight and the road turns out from under you. Ease the slider
          into the neutral band and the car slows on its own; below it the
          brakes come in gradually, full at the bottom. The car behind you
          is following you with the same model that follows everybody.
          <br />
          <b>What it deliberately does not do yet.</b> No intersections, so
          no turns to commit to; that arrives with the map. The road wraps
          at its end. Traffic in the other lane does not react to you being
          in it. A contact stops you rather than meaning anything, because
          what a collision is in this game is still an open question.
          Nothing is scored.
        </div>
      </div>
    </div>
  );
}

/* THE CONTROLS ARE DRAWN ON THE CANVAS: the slider's track and thumb on
   the right, the wheel's deflection along the bottom left, and a red
   wash for a contact. Drawn after the world, so they are always on top. */
function drawControls(ctx, size, inp, tally) {
  const margin = 24, x = size.w - SLIDER_W / 2, top = margin, bottom = size.h - margin, mid = (top + bottom) / 2;
  /* The track: throttle above the band, brake below. */
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  const band = (NEUTRAL * (bottom - top)) / 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath(); ctx.moveTo(x, mid - band); ctx.lineTo(x, mid + band); ctx.stroke();
  /* The thumb, coloured by what it is doing. */
  const y = mid - (inp.slider * (bottom - top)) / 2;
  ctx.fillStyle = inp.slider > NEUTRAL ? "#6cc070" : inp.slider < -NEUTRAL ? "#e0574f" : "#cfd3da";
  ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.font = "600 10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(inp.slider > NEUTRAL ? "GO" : inp.slider < -NEUTRAL ? "BRK" : "--", x, y);
  /* The wheel: a bar that fills left or right of centre. */
  const wx = 24, wy = size.h - 22, ww = Math.min(180, size.w * 0.4);
  ctx.strokeStyle = "rgba(255,255,255,0.14)"; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy); ctx.stroke();
  ctx.strokeStyle = "#cfd3da";
  ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2 + (inp.steer * ww) / 2, wy); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "600 10px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
  ctx.fillText("steer: drag here", wx, wy - 8);
  if (tally.flash > 0) { ctx.fillStyle = `rgba(224,87,79,${0.35 * tally.flash})`; ctx.fillRect(0, 0, size.w, size.h); }
}

const S = {
  page: { minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg, color: TEXT },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: DIM },
  view: { position: "relative", height: "68vh", minHeight: 360, margin: "0 8px", borderRadius: 8, overflow: "hidden", background: "#1b1e23" },
  readout: { position: "absolute", left: 10, top: 8, fontFamily: FONT_D, fontSize: 12, color: DIM, pointerEvents: "none" },
  speed: { fontSize: 26, fontWeight: 700, color: C.white },
  banner: { position: "absolute", left: 16, right: 16 + SLIDER_W, top: "40%", padding: 14, borderRadius: 10, background: "rgba(20,22,26,0.92)", border: "1px solid rgba(255,255,255,0.15)", color: TEXT },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  btn: { width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: C.white },
  chip: { minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13, color: TEXT },
  label: { fontFamily: FONT_D, fontSize: 13, color: DIM, marginLeft: 6 },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
};
