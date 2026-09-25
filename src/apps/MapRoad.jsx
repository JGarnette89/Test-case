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
import { loadMap, groundFor } from "../map/load.js";
import { testMap1 } from "../map/samples.js";
import { seedGraph, step, poseOf, DT } from "../sim/crossing.js";
import { playerOn, stepDriver, driverPose, withDriver, aheadOf } from "../sim/drive.js";
import { junctionsOf, postedAt } from "../sim/graph.js";
import { touching } from "../sim/player.js";
import { controls } from "../iso/controls.js";
import { drawFrame } from "../iso/draw.js";
import { terrain } from "../iso/road.js";
import { drawSlider, drawWheelBar, drawSignals, drawReadout, drawCorner, drawStop } from "../iso/hud.js";
import { newChase, chaseStep, zoomFor } from "../iso/chase.js";
import { perfMeter } from "../iso/perf.js";
import { loadSettings, setSetting } from "../settings.js";

const LIMITS = [40, 50, 60];
const DIM = "#9AA3B2", TEXT = "#E6E8EC";
const DPR_CAP = 2;
const START = { road: "A-north", end: "end" };   // the player begins at the map's north edge, driving down to the crossroads

/* The scene for one map: roads with their ribbons from the loader, the
   land the roads imply (load.js `groundFor` -- a map carries no terrain
   yet, so the land meets every road that is on it and stays under the
   one that spans another), the sim's world, and -- when driving -- the
   player at the start. */
/* THE CAR COUNT: the maintainer's own dial. The map is topped up to it
   rather than fed at a rate (crossing.js `target`), so the number is
   the number. The range is measured, not guessed (tools/measure/
   density.mjs): the sim's own cost is 1.1 ms a tick at 120 cars and
   6 ms at 300 on the desk machine, and 300 is where this map saturates
   -- beyond it the edges cannot get cars in fast enough to hold the
   count. The default is five times what the screen used to carry,
   because the phone ran 114 cars at a locked 60 fps on the SLOW build. */
export const CARS = { min: 10, max: 300, step: 10, start: 120 };

function sceneFor(seed, kmh, every, drive, cars = CARS.start) {
  const loaded = loadMap(testMap1());
  if (!loaded.ok) throw new Error(`test map: ${loaded.error}`);
  const b = loaded.bounds;
  /* POSTED SPEEDS ON (SIMULATOR.md 1.1.6): every road is driven at the
     limit it posts, so an arterial and a residential street are not the
     same road to drive -- which is the first thing that makes them feel
     different. The `kmh` passed in is then only what sizes the geometry
     (the fastest road's), never what anybody drives at. */
  let world = seedGraph(seed, kmh, loaded, { every, target: cars, posted: true });
  let me = null;
  if (drive) {
    me = playerOn(world.course, START.road, START.end);   // the curb lane, driving down to the crossroads
    world = withDriver(world, me);
  }
  const ground = groundFor(loaded, { cell: 20 });
  return {
    loaded,
    ground,
    roads: loaded.roads.map((road) => ({ road, cars: [] })),
    terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }),
    junctions: junctionsOf(world.course),
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
  const [rotate, setRotate] = useState(true);   // driving: the view turns with the car; off is the fixed view, for comparison
  const [warnings, setWarnings] = useState([]);
  const [stopped, setStopped] = useState(false);     // after a contact, until restarted

  const scene = useRef(null);
  const cam = useRef({ ...newChase(), id: null });
  const owed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const meter = useRef(perfMeter());
  const readout = useRef("");
  const input = useRef(controls());
  const held = useRef(new Set());
  const flash = useRef(0);
  const judged = useRef({ last: null, at: 0 });   // the last turn's verdict and when it landed, for the fade
  const judgedStop = useRef({ last: null, at: 0 });   // and the last stop's
  const contacts = useRef(0);
  const [cars, setCars] = useState(CARS.start);
  if (!scene.current) scene.current = sceneFor(1, 50, 2.0, true, CARS.start);

  const restart = (s = seed, kmh = limit, m = mode, n = cars) => {
    setSeed(s); setLimit(kmh); setMode(m); setStopped(false); setCars(n);
    scene.current = sceneFor(s, kmh, 2.0, m === "drive", n);
    input.current.state.steer = 0; input.current.state.slider = 0; input.current.state.signal = null;
    cam.current = { ...newChase(), id: null };
    owed.current = 0; contacts.current = 0; flash.current = 0;
  };

  useEffect(() => { setWarnings(scene.current.loaded.warnings); }, []);

  /* What the player chose last time (settings.js), applied once after
     the first render, only where it differs from what shipped. */
  useEffect(() => {
    let live = true;
    loadSettings().then((s) => {
      if (!live) return;
      const kmh = LIMITS.includes(s.limit) ? s.limit : limit;
      const m = s.mode === "watch" ? "watch" : "drive";
      const n = Number.isFinite(s.cars) ? Math.max(CARS.min, Math.min(CARS.max, s.cars)) : cars;
      if (kmh !== limit || m !== mode || n !== cars) restart(seed, kmh, m, n);
      if (s.slider === "spring") input.current.state.spring = true;
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

      const carry = playing && !stopped ? owed.current : 0;
      const actors = actorsOf(sc, carry);

      /* THE CAMERA. Driving: the chase camera (iso/chase.js), behind
         the player, leading them by seconds of travel, the road ahead
         up the screen. Watching: a fixed place -- one of each kind of
         node and the overpass -- or a car, picking another when it
         leaves, from the fixed isometric view. */
      const PLACES = {
        crossroads: { x: 400, y: 400, z: 0 }, tee: { x: 800, y: 400, z: 0 }, fiveway: { x: 400, y: 800, z: 0 },
        overpass: { x: 600, y: 800, z: 3 }, hill: { x: 600, y: 400, z: 3 }, arterial: { x: 1250, y: 400, z: 0 },
      };
      let k, rot = 0;
      if (sc.me) {
        const p = driverPose(sc.me, sc.world.course);
        cam.current = { ...chaseStep(cam.current, { ...p, v: sc.me.v }, dt, { rotate }), id: null };
        k = zoomFor(size.w, size.h, cam.current.lead) * zoom;
        rot = cam.current.rot;
      } else {
        let want = PLACES[follow] ?? PLACES.crossroads;
        if (follow === "car") {
          let target = actors.find((a) => a.id === cam.current.id);
          if (!target) { target = actors[Math.floor(actors.length / 2)] ?? null; cam.current.id = target?.id ?? null; }
          if (target) want = target;
        }
        const f = cam.current.snap ? 1 : 1 - Math.exp(-4 * dt);
        cam.current = { ...cam.current, x: cam.current.x + (want.x - cam.current.x) * f, y: cam.current.y + (want.y - cam.current.y) * f, z: cam.current.z + ((want.z ?? 0) - cam.current.z) * f, rot: 0, snap: false };
        k = Math.max(1, (size.w / (follow === "car" ? 60 : 110)) * zoom);
      }
      const drew = drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam: cam.current, rot, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, t: sc.world.t + carry });

      if (now - fpsAt > 1000) {
        const sum = meter.current.summary(120);
        readout.current = `${sc.world.actors.length} cars on the map · ${drew.cars} in view · ${sum.fps} fps · p95 ${sum.p95}ms`;
        fpsAt = now;
      }
      if (sc.me) {
        const me = sc.me;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.fillStyle = "#ffffff"; ctx.font = "700 26px system-ui, sans-serif";
        ctx.fillText(`${Math.round(me.v * 3.6)}`, size.w / 2, 6);
        ctx.fillStyle = "rgba(230,232,236,0.8)"; ctx.font = "12px system-ui, sans-serif";
        ctx.fillText("km/h", size.w / 2, 38);
        /* THE LIMIT OF THE ROAD YOU ARE ON, as a sign beside the speed:
           white face, black figure, red when you are over it by more
           than a speedometer's error. It is the road's, from the same
           posted speed the traffic drives to (graph.js postedAt). */
        const posted = postedAt(sc.world.course, me.k, me.route);
        if (posted) {
          const lim = Math.round((posted * 3.6) / 10) * 10, over = me.v * 3.6 > lim + 3;
          const sx = size.w / 2 + 46, sy = 8, sw = 30, sh = 38;
          ctx.fillStyle = over ? "#e0574f" : "#f4f4f2"; ctx.fillRect(sx, sy, sw, sh);
          ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.strokeRect(sx + 2, sy + 2, sw - 4, sh - 4);
          ctx.fillStyle = over ? "#fff" : "#111"; ctx.font = "700 7px system-ui, sans-serif"; ctx.textBaseline = "top";
          ctx.fillText("MAX", sx + sw / 2, sy + 5);
          ctx.font = "700 15px system-ui, sans-serif"; ctx.fillText(String(lim), sx + sw / 2, sy + 15);
          ctx.textBaseline = "top";
        }
        /* WHAT THE CAR IS ABOUT TO DO, said back: the turn the signal
           has committed it to at the node ahead, and once past the line
           that it is committed. The feedback that makes the indicator a
           control rather than a light. */
        const ahead = aheadOf(me, sc.world.course, sc.world);
        if (ahead.node) {
          const word = ahead.intent === "left" ? "turning left" : ahead.intent === "right" ? "turning right" : "straight on";
          ctx.fillStyle = ahead.committed ? "#6cc070" : me.signal ? "#f2b84b" : "rgba(230,232,236,0.6)";
          ctx.fillText(`${word} at the ${ahead.node === "n0" ? "crossroads" : ahead.node === "n1" ? "T" : ahead.node === "n2" ? "five-way" : ahead.node === "n4" ? "arterial" : "T"}${ahead.committed ? " — committed" : ` in ${Math.round(ahead.toLine)} m`}`, size.w / 2, 54);
          if (ahead.hint) { ctx.fillStyle = "#f2b84b"; ctx.fillText(ahead.hint, size.w / 2, 70); }
        }
        if (me.atEdge) { ctx.fillStyle = "#F2B84B"; ctx.fillText("THE EDGE OF THE MAP — restart", size.w / 2, 72); }
        /* The corner's speed while a turn is ahead and not yet committed; the verdict for a few seconds after. */
        if (me.lastTurn !== judged.current.last) { judged.current = { last: me.lastTurn, at: now }; }
        if (me.lastStop !== judgedStop.current.last) { judgedStop.current = { last: me.lastStop, at: now }; }
        const said = (o) => (o ? Object.entries(o).map(([k, n]) => `${n} ${k}`).join(" · ") : "");
        const tally = [me.turns && `turns: ${said(me.turns)}`, me.stops && `stops: ${said(me.stops)}`].filter(Boolean).join("   ");
        /* One verdict line: the corner's speed while a turn is ahead,
           otherwise whichever of the turn and the stop was judged last. */
        const turnAhead = ahead.node && ahead.intent !== "straight" && !ahead.committed ? ahead.cornerSpeed : null;
        if (turnAhead == null && judgedStop.current.at > judged.current.at) drawStop(ctx, size, 86, me.lastStop, (now - judgedStop.current.at) / 1000);
        else drawCorner(ctx, size, 86, Math.round(me.v * 3.6), turnAhead, me.lastTurn, (now - judged.current.at) / 1000);
        if (tally) { ctx.fillStyle = "rgba(230,232,236,0.6)"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(tally, size.w / 2, 104); }
        drawSlider(ctx, size, inp.slider, me.v, me.grade ?? 0, ahead.stop);
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
  }, [playing, follow, zoom, seed, limit, mode, stopped, rotate]);

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
              onClick={() => { setSetting("mode", id); restart(seed, limit, id); }}>{label}</button>
          ))}
          {mode === "watch" && <span style={S.label}>View</span>}
          {mode === "watch" && [["crossroads", "the crossroads"], ["tee", "the T"], ["fiveway", "the five-way"], ["arterial", "the arterial"], ["overpass", "the overpass"], ["hill", "the hill"], ["car", "ride a car"]].map(([id, label]) => (
            <button key={id} className="btn" style={{ ...S.chip, borderColor: follow === id ? C.amber : "rgba(255,255,255,0.12)", color: follow === id ? C.white : DIM }}
              onClick={() => { cam.current = { x: 0, y: 0, z: 0, id: null }; setFollow(id); }}>{label}</button>
          ))}
          {mode === "drive" && (
            <button className="btn" style={{ ...S.chip, borderColor: rotate ? C.amber : "rgba(255,255,255,0.12)", color: rotate ? C.white : DIM }}
              onClick={() => setRotate((r) => !r)}>{rotate ? "View turns with the car" : "Fixed view"}</button>
          )}
          {/* LIVE, not a restart: the edges top the map up to the new
              count, or stop adding while cars leave, so moving the dial
              never rebuilds the world under the driver. */}
          <label style={{ ...S.label, display: "inline-flex", alignItems: "center", gap: 8 }}>
            Cars <b style={{ color: C.white, minWidth: 28, textAlign: "right" }}>{cars}</b>
            <input type="range" min={CARS.min} max={CARS.max} step={CARS.step} value={cars} style={{ width: 140, fontSize: 16 }}
              onChange={(e) => { const n = Number(e.target.value); setCars(n); setSetting("cars", n); if (scene.current) scene.current.world = { ...scene.current.world, target: n }; }} />
          </label>
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
          <b>Lanes.</b> Most roads here are two lanes each way. Drift
          across the line into the next lane and you are in it; right
          turns are made from the right lane and left turns from the lane
          beside the centre line, and the line under the speed says so
          when your signal asks for a turn your lane cannot make. The
          traffic keeps its lane for now.
          <br />
          <b>What it deliberately does not do yet.</b> Nobody changes lane
          but you. Nobody reads your signal but the car. Nothing is scored, nothing
          is a fault. The edge of the map is the end of the road. Signs
          are boxes on posts, not sprites. The roads are three kinds -- an arterial through the lights at
          60, collectors at 50, residential streets at 40 -- and every car,
          yours included on the sign by the speed, is on the road's own
          limit.
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
