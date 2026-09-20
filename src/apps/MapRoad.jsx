/* =====================================================================
   STAGE 1: THE MAP -- DRIVE IT, IN TRAFFIC.

   SIMULATOR.md stage 1's deliverable: a hand-written map (map/samples.js
   testMap1 -- a loop with a hill, a T, a crossroads, a skewed five-way,
   an overpass), loaded through the format, run by the sim on a graph
   (sim/graph.js: intersections at their own bearings, the same rules),
   drawn isometrically, and driven. The player is an ordinary member of
   the traffic (sim/drive.js): everybody yields to them, follows them
   and waits for them by the rules that apply to anybody.

   THE CONTROLS ARE THE THREE OF SIMULATOR.md 1.1: steer by dragging on
   the left, the throttle-to-brake slider on the right, and the turn
   signal -- a tap in a top corner -- which is how a turn is committed
   to: indicate before the line and the car takes that corner; no
   signal means straight on. Watch mode is the same world with nobody
   at the wheel.

   No React state is written from the frame loop (CLAUDE.md,
   Conventions): the world and the player live in refs, the readout and
   the controls are drawn on the canvas, React draws the chrome and the
   contact banner, which is an event.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { loadMap } from "../map/load.js";
import { testMap1 } from "../map/samples.js";
import { seedGraph, step, poseOf, DT } from "../sim/crossing.js";
import { playerAt, stepDriver, driverPose, withDriver, aheadOf, routeForSignal } from "../sim/drive.js";
import { touching } from "../sim/player.js";
import { controls } from "../iso/controls.js";
import { drawFrame } from "../iso/draw.js";
import { terrain } from "../iso/road.js";
import { drawSlider, drawWheelBar, drawSignals, drawReadout } from "../iso/hud.js";
import { perfMeter } from "../iso/perf.js";

const LIMITS = [40, 50, 60];
const DIM = "#9AA3B2", TEXT = "#E6E8EC";
const DPR_CAP = 2;
const flat = () => 0;
const START = { road: "A-north", end: "end" };   // the player begins at the map's north edge, driving down to the crossroads

/* The scene for one map: roads with their ribbons from the loader, a
   flat ground over the map's bounds, the sim's world, and -- when
   driving -- the player at the start. */
function sceneFor(seed, kmh, every, drive) {
  const loaded = loadMap(testMap1());
  if (!loaded.ok) throw new Error(`test map: ${loaded.error}`);
  const b = loaded.bounds;
  let world = seedGraph(seed, kmh, loaded, { every });
  let me = null;
  if (drive) {
    const legId = `${START.road}|${START.end}`;
    const k = world.course.at.findIndex((s) => s.layout.legs[legId]);
    me = playerAt(world.course, k, routeForSignal(world.course.at[k].layout, legId, null));
    world = withDriver(world, me);
  }
  return {
    loaded,
    roads: loaded.roads.map((road) => ({ road, cars: [] })),
    terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground: flat }),
    world, me,
  };
}

/* Where every car is, carried forward by the time since the last
   tick, as poses the renderer draws directly; the player in their own
   colour. */
function actorsOf(scene, carry) {
  const w = scene.world;
  const out = [];
  for (const a of w.actors) {
    if (a.player) {
      const p = driverPose({ ...a, s: a.s + a.v * carry }, w.course);
      out.push({ id: a.id, n: -1, ...p, colour: "#f4f4f2", player: true });
      continue;
    }
    const p = poseOf(w, { ...a, s: Math.min(a.s + a.v * carry, w.course.at[a.k].layout.paths[a.route].length) });
    out.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: a.colour });
  }
  return out;
}

export default function MapRoad() {
  const canvasRef = useRef(null);
  const [seed, setSeed] = useState(1);
  const [limit, setLimit] = useState(50);
  const [playing, setPlaying] = useState(true);
  const [mode, setMode] = useState("drive");        // "drive" or "watch"
  const [follow, setFollow] = useState("crossroads");   // watch mode: a place to look at, or "car" to ride one
  const [zoom, setZoom] = useState(1);
  const [warnings, setWarnings] = useState([]);
  const [stopped, setStopped] = useState(false);     // after a contact, until restarted

  const scene = useRef(null);
  const cam = useRef({ x: 0, y: 0, z: 0, id: null });
  const owed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const meter = useRef(perfMeter());
  const readout = useRef("");
  const input = useRef(controls());
  const held = useRef(new Set());
  const flash = useRef(0);
  const contacts = useRef(0);
  if (!scene.current) scene.current = sceneFor(1, 50, 2.0, true);

  const restart = (s = seed, kmh = limit, m = mode) => {
    setSeed(s); setLimit(kmh); setMode(m); setStopped(false);
    scene.current = sceneFor(s, kmh, 2.0, m === "drive");
    input.current.state.steer = 0; input.current.state.slider = 0; input.current.state.signal = null;
    cam.current = { x: 0, y: 0, z: 0, id: null };
    owed.current = 0; contacts.current = 0; flash.current = 0;
  };

  useEffect(() => { setWarnings(scene.current.loaded.warnings); }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    let fpsAt = performance.now();

    const fit = () => {
      const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
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
      const sc = scene.current;

      /* THE SIM STEPS AT 20 Hz FROM AN ACCUMULATOR. Driving, the player
         is stepped first and written into the world, so this tick's
         traffic sees where they really are. */
      if (playing && !stopped) {
        owed.current += dt;
        while (owed.current >= DT) {
          owed.current -= DT;
          let w = sc.world;
          if (sc.me) {
            sc.me = stepDriver({ ...sc.me, signal: input.current.state.signal }, inp, w, DT);
            input.current.state.signal = sc.me.signal;   // spent by the turn it caused
            w = withDriver(w, sc.me);
          }
          w = step(w);
          sc.world = w;
          /* Contact stops the car where it is: what a collision IS in
             this game is still the maintainer's question. */
          if (sc.me) {
            const mine = driverPose(sc.me, w.course);
            let hit = false;
            for (const a of w.actors) {
              if (a.player) continue;
              const p = poseOf(w, a);
              if (touching(mine, { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot })) hit = true;
            }
            if (hit) { contacts.current++; flash.current = 1; setStopped(true); break; }
          }
        }
      }

      const actors = actorsOf(sc, playing && !stopped ? owed.current : 0);

      /* THE CAMERA. Driving: it rides the player and looks a second
         ahead. Watching: a fixed place -- one of each kind of node and
         the overpass -- or a car, picking another when it leaves. It
         never rotates. */
      const PLACES = {
        crossroads: { x: 400, y: 400, z: 0 }, tee: { x: 800, y: 400, z: 0 }, fiveway: { x: 400, y: 800, z: 0 },
        overpass: { x: 600, y: 800, z: 3 }, hill: { x: 600, y: 400, z: 3 },
      };
      let want = PLACES[follow] ?? PLACES.crossroads;
      if (sc.me) {
        const p = driverPose(sc.me, sc.world.course);
        const h = (p.heading * Math.PI) / 180, look = Math.min(25, sc.me.v * 1.0);
        want = { x: p.x + Math.cos(h) * look, y: p.y + Math.sin(h) * look, z: p.z };
      } else if (follow === "car") {
        let target = actors.find((a) => a.id === cam.current.id);
        if (!target) { target = actors[Math.floor(actors.length / 2)] ?? null; cam.current.id = target?.id ?? null; }
        if (target) want = target;
      }
      const ease = cam.current.x === 0 && cam.current.y === 0 ? 1 : 0.12;
      cam.current.x += (want.x - cam.current.x) * ease;
      cam.current.y += (want.y - cam.current.y) * ease;
      cam.current.z += ((want.z ?? 0) - cam.current.z) * ease;

      const k = Math.max(1, (size.w / (sc.me || follow === "car" ? 60 : 110)) * zoom);
      const drew = drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam: cam.current, k, tilt: false, actors, groundAt: flat });

      if (now - fpsAt > 1000) {
        const sum = meter.current.summary(120);
        readout.current = `${sc.world.actors.length} cars on the map · ${drew.cars} in view · ${sum.fps} fps · p95 ${sum.p95}ms · limit ${limit}`;
        fpsAt = now;
      }
      if (sc.me) {
        const me = sc.me;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillStyle = "#ffffff"; ctx.font = "700 26px system-ui, sans-serif";
        ctx.fillText(`${Math.round(me.v * 3.6)}`, size.w / 2, 6);
        ctx.fillStyle = "rgba(230,232,236,0.8)"; ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("km/h", size.w / 2, 38);
        /* WHAT THE CAR IS ABOUT TO DO, said back: the turn the signal
           has committed it to at the node ahead, and once past the line
           that it is committed. The feedback that makes the indicator a
           control rather than a light. */
        const ahead = aheadOf(me, sc.world.course);
        if (ahead.node) {
          const word = ahead.intent === "left" ? "turning left" : ahead.intent === "right" ? "turning right" : "straight on";
          ctx.fillStyle = ahead.committed ? "#6cc070" : me.signal ? "#f2b84b" : "rgba(230,232,236,0.6)";
          ctx.fillText(`${word} at the ${ahead.node === "n0" ? "crossroads" : ahead.node === "n1" ? "T" : ahead.node === "n2" ? "five-way" : "T"}${ahead.committed ? " — committed" : ` in ${Math.round(ahead.toLine)} m`}`, size.w / 2, 54);
        }
        if (me.atEdge) { ctx.fillStyle = "#F2B84B"; ctx.fillText("THE EDGE OF THE MAP — restart", size.w / 2, 72); }
        drawSlider(ctx, size, inp.slider);
        drawWheelBar(ctx, size, inp.steer);
        drawSignals(ctx, size, input.current.state.signal, now);
        drawReadout(ctx, readout.current, 8, size.h - 44);
        if (flash.current > 0) { ctx.fillStyle = `rgba(224,87,79,${0.35 * flash.current})`; ctx.fillRect(0, 0, size.w, size.h); flash.current = Math.max(0, flash.current - dt * 2); }
      } else {
        drawReadout(ctx, readout.current);
      }
      raf.current = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, [playing, follow, zoom, seed, limit, mode, stopped]);

  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, { w: r.width, h: r.height }]; };
  const onDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y, box] = at(e); input.current.pointer("down", e.pointerId, x, y, box, performance.now()); };
  const onMove = (e) => { const [x, y, box] = at(e); input.current.pointer("move", e.pointerId, x, y, box, performance.now()); };
  const onUp = (e) => { const [x, y, box] = at(e); input.current.pointer("up", e.pointerId, x, y, box, performance.now()); };

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 1 — the map: drive it, in traffic</span>
        <span style={S.sub}>steer by dragging on the left, the slider on the right is throttle to brake, and a tap in a top corner is the turn signal — indicate before the line and the car takes that corner. No signal means straight on.</span>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={mode === "drive" ? onDown : undefined} onPointerMove={mode === "drive" ? onMove : undefined} onPointerUp={mode === "drive" ? onUp : undefined} onPointerCancel={mode === "drive" ? onUp : undefined} />
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
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)} title="restart with new traffic"><RotateCcw size={16} /></button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}><ZoomOut size={16} /></button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.min(4, z * 1.25))}><ZoomIn size={16} /></button>
          {[["drive", "you drive"], ["watch", "watch the traffic"]].map(([id, label]) => (
            <button key={id} className="btn" style={{ ...S.chip, borderColor: mode === id ? C.green : "rgba(255,255,255,0.12)", color: mode === id ? C.white : DIM }}
              onClick={() => restart(seed, limit, id)}>{label}</button>
          ))}
          {mode === "watch" && <span style={S.label}>View</span>}
          {mode === "watch" && [["crossroads", "the crossroads"], ["tee", "the T"], ["fiveway", "the five-way"], ["overpass", "the overpass"], ["hill", "the hill"], ["car", "ride a car"]].map(([id, label]) => (
            <button key={id} className="btn" style={{ ...S.chip, borderColor: follow === id ? C.amber : "rgba(255,255,255,0.12)", color: follow === id ? C.white : DIM }}
              onClick={() => { cam.current = { x: 0, y: 0, z: 0, id: null }; setFollow(id); }}>{label}</button>
          ))}
          <span style={S.label}>Limit</span>
          {LIMITS.map((kmh) => (
            <button key={kmh} className="btn" style={{ ...S.chip, minWidth: 0, padding: "0 10px", borderColor: limit === kmh ? C.green : "rgba(255,255,255,0.12)", color: limit === kmh ? C.white : DIM }}
              onClick={() => restart(seed, kmh)}>{kmh}</button>
          ))}
          <span style={S.label}>keys: arrows or WASD, space brakes, q and e signal</span>
        </div>
        {warnings.length > 0 && (
          <div style={S.note}>
            <b>What the loader said about this map:</b> {warnings.map((w) => w.message).join("; ")}.
          </div>
        )}
        <div style={S.note}>
          <b>What to feel for.</b> You start at the top of the map, driving
          down to the crossroads, which is an all-way stop: stop at the
          line, and the others take their turns with you. Tap a top corner
          to signal before the line and the car takes that corner; the
          line under the speed says what it is about to do. On the road
          the bends are driven — hold the wheel straight on the curve and
          it drifts you. Inside an intersection the car takes the corner
          it committed to, and your wheel only trims the line.
          <br />
          <b>What it deliberately does not do yet.</b> One lane each way.
          Nobody reads your signal but the car. Nothing is scored, nothing
          is a fault. The edge of the map is the end of the road.
          Intersections are drawn as overlapping road ribbons, without
          stop lines or signs — the sim knows where the lines are; the
          renderer does not draw them yet. Flat ground under a road that
          climbs. Every car drives at the one limit chosen here.
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
  view: { position: "relative", height: "66vh", minHeight: 360, margin: "0 8px", borderRadius: 8, overflow: "hidden", background: "#1b1e23" },
  banner: { position: "absolute", left: 16, right: 80, top: "40%", padding: 14, borderRadius: 10, background: "rgba(20,22,26,0.92)", border: "1px solid rgba(255,255,255,0.15)", color: TEXT },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  btn: { width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: C.white },
  chip: { minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13, color: TEXT },
  label: { fontFamily: FONT_D, fontSize: 13, color: DIM, marginLeft: 6 },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
};
