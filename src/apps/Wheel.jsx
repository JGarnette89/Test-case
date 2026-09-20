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
import { newPlayer, stepPlayer, playerPose, touching } from "../sim/player.js";
import { controls, SLIDER_W } from "../iso/controls.js";
import { drawSlider, drawWheelBar, drawSignals } from "../iso/hud.js";
import { newChase, chaseStep, zoomFor } from "../iso/chase.js";
import { perfMeter } from "../iso/perf.js";
import { loadSettings, setSetting } from "../settings.js";

const LIMITS = [50, 60, 100];
const DIM = "#9AA3B2", TEXT = "#E6E8EC";

export default function Wheel() {
  const canvasRef = useRef(null);
  const [seed, setSeed] = useState(1);
  const [limit, setLimit] = useState(60);
  const [spring, setSpring] = useState(false);
  const [rotate, setRotate] = useState(true);   // the view turns with the car; off is the fixed view, for comparison
  /* NO REACT STATE IS WRITTEN FROM THE FRAME LOOP: the readout is
     drawn on the canvas. A state update from the loop cost 133-158 ms a
     time on the Pixel 7 Pro (IsoRoad.jsx, perf.js), and this one ran
     four times a second while the player was driving. */
  const hud = useRef({ kmh: 0, fps: 0, offRoad: false, laps: 0, cars: 0 });
  const [stopped, setStopped] = useState(false);   // after a contact, until restarted

  /* The world and the player live in refs: the canvas is painted
     directly, and React draws only the chrome (IsoRoad.jsx). */
  const START = 40;
  const scene = useRef(clearAround(seedScene(1, 60), START));
  const me = useRef(newPlayer(START, LANE / 2, 0));
  const input = useRef(controls());
  const held = useRef(new Set());
  const cam = useRef(newChase());
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
    cam.current = newChase();
    owed.current = 0;
    tally.current = { contacts: 0, laps: 0, flash: 0 };
  };

  useEffect(() => { input.current.state.spring = spring; }, [spring]);

  /* What the player chose last time: the slider's manner and the
     traffic's speed, kept through settings.js. Applied once, after the
     first render, and only where it differs from what shipped. */
  useEffect(() => {
    let live = true;
    loadSettings().then((s) => {
      if (!live) return;
      if ((s.slider === "spring") !== spring) setSpring(s.slider === "spring");
      if (LIMITS.includes(s.limit) && s.limit !== limit) restart(seed, s.limit);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (e.type === "keydown" && !e.repeat && (e.key === "q" || e.key === "e")) input.current.signal(e.key === "q" ? "left" : "right");
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

      /* THE CHASE CAMERA (iso/chase.js): behind the car, leading it by
         seconds of travel, the road ahead up the screen. */
      cam.current = chaseStep(cam.current, { ...pose, v: me.current.v }, dt, { rotate });
      const k = zoomFor(size.w, size.h, cam.current.lead);
      const drew = drawFrame(ctx, size, { roads, terrain: sc.terrain, cam: cam.current, rot: cam.current.rot, k, tilt: false, props: sc.props });
      if (now - fpsAt > 250) {
        const sum = meter.current.summary(120);
        hud.current = { kmh: Math.round(me.current.v * 3.6), fps: sum.fps, offRoad: Math.abs(me.current.off) > road.width / 2 + 0.5, laps: tally.current.laps, cars: drew.cars };
        fpsAt = now;
      }
      drawControls(ctx, size, inp, tally.current, { ...hud.current, kmh: Math.round(me.current.v * 3.6), limit, signal: input.current.state.signal, now });
      if (tally.current.flash > 0) tally.current.flash = Math.max(0, tally.current.flash - dt * 2);
      raf.current = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, [stopped, seed, limit, rotate]);

  /* Pointer events straight off the canvas, captured so a drag that
     leaves it keeps steering. */
  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, { w: r.width, h: r.height }]; };
  const onDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y, box] = at(e); input.current.pointer("down", e.pointerId, x, y, box, performance.now()); };
  const onMove = (e) => { const [x, y, box] = at(e); input.current.pointer("move", e.pointerId, x, y, box, performance.now()); };
  const onUp = (e) => { const [x, y, box] = at(e); input.current.pointer("up", e.pointerId, x, y, box, performance.now()); };

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>At the wheel</span>
        <span style={S.sub}>steer by dragging on the left; the slider on the right is throttle at the top, brake at the bottom, coasting between.</span>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
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
              onClick={() => { setSetting("limit", kmh); restart(seed, kmh); }}>{kmh}</button>
          ))}
          <button className="btn" style={{ ...S.chip, borderColor: spring ? C.blue : "rgba(255,255,255,0.12)", color: spring ? C.white : DIM }}
            onClick={() => { setSpring((s) => { setSetting("slider", !s ? "spring" : "hold"); return !s; }); }}>{spring ? "Slider springs back to neutral" : "Slider holds where it is left"}</button>
          <button className="btn" style={{ ...S.chip, borderColor: rotate ? C.amber : "rgba(255,255,255,0.12)", color: rotate ? C.white : DIM }}
            onClick={() => setRotate((r) => !r)}>{rotate ? "View turns with the car" : "Fixed view"}</button>
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

/* THE CONTROLS AND THE READOUT ARE DRAWN ON THE CANVAS (iso/hud.js):
   the speed and the state of play top centre, the slider on the
   right, the wheel along the bottom left, the indicators in the top
   corners -- nothing to turn into on this road, but the signal is the
   turn commit on a map and the same control is here to be felt -- and
   a red wash for a contact. */
function drawControls(ctx, size, inp, tally, hud) {
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff"; ctx.font = "700 26px system-ui, sans-serif";
  ctx.fillText(`${hud.kmh}`, size.w / 2, 6);
  ctx.fillStyle = "rgba(230,232,236,0.8)"; ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`km/h · limit ${hud.limit} · ${hud.cars} cars in view · ${hud.fps} fps${hud.laps > 0 ? ` · lap ${hud.laps + 1}` : ""}`, size.w / 2, 38);
  if (hud.offRoad) { ctx.fillStyle = "#F2B84B"; ctx.fillText("OFF THE ROAD", size.w / 2, 54); }
  drawSlider(ctx, size, inp.slider);
  drawWheelBar(ctx, size, inp.steer);
  drawSignals(ctx, size, hud.signal, hud.now);
  if (tally.flash > 0) { ctx.fillStyle = `rgba(224,87,79,${0.35 * tally.flash})`; ctx.fillRect(0, 0, size.w, size.h); }
}

const S = {
  page: { minHeight: "100dvh", display: "flex", flexDirection: "column", background: C.bg, color: TEXT },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: DIM },
  view: { position: "relative", height: "68vh", minHeight: 360, margin: "0 8px", borderRadius: 8, overflow: "hidden", background: "#1b1e23" },
  banner: { position: "absolute", left: 16, right: 16 + SLIDER_W, top: "40%", padding: 14, borderRadius: 10, background: "rgba(20,22,26,0.92)", border: "1px solid rgba(255,255,255,0.15)", color: TEXT },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  btn: { width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: C.white },
  chip: { minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13, color: TEXT },
  label: { fontFamily: FONT_D, fontSize: 13, color: DIM, marginLeft: 6 },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
};
