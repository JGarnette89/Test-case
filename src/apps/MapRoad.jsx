/* =====================================================================
   STAGE 1: THE MAP, WITH TRAFFIC ON IT.

   SIMULATOR.md stage 1's traffic half: a hand-written map (map/samples.js
   testMap1 -- a loop with a hill, a T, a crossroads, a skewed five-way,
   an overpass), loaded through the format, run by the sim on a graph
   (sim/graph.js: intersections at their own bearings, the same rules),
   drawn isometrically. Traffic enters at every dangling end, picks a
   way out at every node, and is endless. The player at the wheel on
   this map is the next increment, with the turn-commit control.

   No React state is written from the frame loop (CLAUDE.md,
   Conventions): the world lives in a ref, the readout is drawn on the
   canvas, React draws the chrome.
   ===================================================================== */
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { loadMap } from "../map/load.js";
import { testMap1 } from "../map/samples.js";
import { seedGraph, step, poseOf, DT } from "../sim/crossing.js";
import { drawFrame } from "../iso/draw.js";
import { terrain } from "../iso/road.js";
import { perfMeter } from "../iso/perf.js";

const LIMITS = [40, 50, 60];
const DIM = "#9AA3B2", TEXT = "#E6E8EC";
const DPR_CAP = 2;
const flat = () => 0;

/* The scene for one map: roads with their ribbons from the loader, a
   flat ground over the map's bounds, and the sim's world. */
function sceneFor(seed, kmh, every) {
  const loaded = loadMap(testMap1());
  if (!loaded.ok) throw new Error(`test map: ${loaded.error}`);
  const b = loaded.bounds;
  return {
    loaded,
    roads: loaded.roads.map((road) => ({ road, cars: [] })),
    terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground: flat }),
    world: seedGraph(seed, kmh, loaded, { every }),
  };
}

/* Where every car is, carried forward by the time since the last
   tick, as poses the renderer draws directly. */
function actorsOf(scene, carry) {
  const w = scene.world;
  return w.actors.map((a) => {
    const p = poseOf(w, { ...a, s: Math.min(a.s + a.v * carry, w.course.at[a.k].layout.paths[a.route].length) });
    return { id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour: a.colour };
  });
}

export default function MapRoad() {
  const canvasRef = useRef(null);
  const [seed, setSeed] = useState(1);
  const [limit, setLimit] = useState(50);
  const [playing, setPlaying] = useState(true);
  const [follow, setFollow] = useState("crossroads");   // a place to look at, or "car" to ride one
  const [zoom, setZoom] = useState(1);
  const [warnings, setWarnings] = useState([]);

  const scene = useRef(null);
  const cam = useRef({ x: 0, y: 0, z: 0, id: null });
  const owed = useRef(0);
  const last = useRef(0);
  const raf = useRef(0);
  const meter = useRef(perfMeter());
  const readout = useRef("");
  if (!scene.current) { scene.current = sceneFor(1, 50, 2.0); }

  const restart = (s = seed, kmh = limit) => {
    setSeed(s); setLimit(kmh);
    scene.current = sceneFor(s, kmh, 2.0);
    cam.current = { x: 0, y: 0, z: 0, id: null };
    owed.current = 0;
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

    const tick = (now) => {
      const size = fit();
      if (last.current) meter.current.record(now - last.current);
      if (last.current && playing) {
        owed.current += Math.min(0.25, (now - last.current) / 1000);
        const n = Math.floor(owed.current / DT);
        if (n > 0) {
          owed.current -= n * DT;
          let w = scene.current.world;
          for (let i = 0; i < n; i++) w = step(w);
          scene.current.world = w;
        }
      }
      last.current = now;

      const sc = scene.current;
      const actors = actorsOf(sc, playing ? owed.current : 0);

      /* THE CAMERA: a fixed place to look at -- one of each kind of node
         and the overpass, because a kilometre-square map in isometric
         projection at a scale where cars read is not one view -- or
         riding one car and picking another when it leaves. Never
         rotates. */
      const PLACES = {
        crossroads: { x: 400, y: 400, z: 0 }, tee: { x: 800, y: 400, z: 0 }, fiveway: { x: 400, y: 800, z: 0 },
        overpass: { x: 600, y: 800, z: 3 }, hill: { x: 600, y: 400, z: 3 },
      };
      let want = PLACES[follow] ?? PLACES.crossroads;
      if (follow === "car") {
        let target = actors.find((a) => a.id === cam.current.id);
        if (!target) { target = actors[Math.floor(actors.length / 2)] ?? null; cam.current.id = target?.id ?? null; }
        if (target) want = target;
      }
      const ease = cam.current.x === 0 && cam.current.y === 0 ? 1 : 0.1;
      cam.current.x += (want.x - cam.current.x) * ease;
      cam.current.y += (want.y - cam.current.y) * ease;
      cam.current.z += ((want.z ?? 0) - cam.current.z) * ease;

      /* Pixels per metre: about a hundred metres of road across the
         canvas at a place, seventy riding a car. */
      const k = Math.max(1, (size.w / (follow === "car" ? 70 : 110)) * zoom);
      const drew = drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam: cam.current, k, tilt: false, actors, groundAt: flat });

      if (now - fpsAt > 1000) {
        const sum = meter.current.summary(120);
        readout.current = `${sc.world.actors.length} cars on the map · ${drew.cars} in view · ${drew.items} things drawn · ${sum.fps} fps · p95 ${sum.p95}ms · ${limit} km/h`;
        fpsAt = now;
      }
      ctx.fillStyle = "rgba(230,232,236,0.85)"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(readout.current, 8, 6);
      raf.current = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => cancelAnimationFrame(raf.current);
  }, [playing, follow, zoom, seed, limit]);

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 1 — the map, with traffic on it</span>
        <span style={S.sub}>a hand-written map: a loop with a hill, a T, a crossroads, a skewed five-way, an overpass. Traffic enters at every dangling end and turns where it likes.</span>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }} />
      </div>

      <div style={S.panel}>
        <div style={S.row}>
          <button className="btn" style={S.btn} onClick={() => setPlaying((p) => !p)}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
          <button className="btn" style={S.btn} onClick={() => restart(seed + 1)}><RotateCcw size={16} /></button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}><ZoomOut size={16} /></button>
          <button className="btn" style={S.btn} onClick={() => setZoom((z) => Math.min(4, z * 1.25))}><ZoomIn size={16} /></button>
          <span style={S.label}>View</span>
          {[["crossroads", "the crossroads"], ["tee", "the T"], ["fiveway", "the five-way"], ["overpass", "the overpass"], ["hill", "the hill"], ["car", "ride a car"]].map(([id, label]) => (
            <button key={id} className="btn" style={{ ...S.chip, borderColor: follow === id ? C.amber : "rgba(255,255,255,0.12)", color: follow === id ? C.white : DIM }}
              onClick={() => { cam.current = { x: 0, y: 0, z: 0, id: null }; setFollow(id); }}>{label}</button>
          ))}
          <span style={S.label}>Limit</span>
          {LIMITS.map((kmh) => (
            <button key={kmh} className="btn" style={{ ...S.chip, minWidth: 0, padding: "0 10px", borderColor: limit === kmh ? C.green : "rgba(255,255,255,0.12)", color: limit === kmh ? C.white : DIM }}
              onClick={() => restart(seed, kmh)}>{kmh}</button>
          ))}
        </div>
        {warnings.length > 0 && (
          <div style={S.note}>
            <b>What the loader said about this map:</b> {warnings.map((w) => w.message).join("; ")}.
          </div>
        )}
        <div style={S.note}>
          <b>What to look at.</b> The four-way stop at the top left takes
          turns; the T on the right lets its through road run; the
          five-way at the bottom left has legs at five different bearings
          and settles every pair the same way a crossroads does; the
          bend between them and the hill on the top road are the road's
          own shape; the short north–south road at the centre crosses
          the bottom road seven metres up with no intersection.
          <br />
          <b>What it deliberately does not do yet.</b> No player: that is
          the next increment, with the turn-commit control. One lane each
          way everywhere. Nodes are drawn as overlapping road ribbons, not
          as junction surfaces. Flat ground under a road that climbs.
          Posted speeds are the map's, but every car drives at the one
          limit chosen here.
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
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
  btn: { width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: C.white },
  chip: { minHeight: 44, minWidth: 64, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13 },
  label: { fontFamily: FONT_D, fontSize: 13, color: DIM, marginLeft: 6 },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
};
