/* =====================================================================
   STAGE 2: THE EDITOR -- DRAW, SET KINDS AND ELEVATION, VALIDATE, SAVE,
   DRIVE IT. SIMULATOR.md section 4 and stage 2's deliverable, in one
   screen: "the maintainer draws a map and drives it in the same
   session. The first throwaway test maps are his."

   THE DRAFT IS A MAP, LITERALLY. Every edit here goes through
   `src/editor/model.js`'s pure functions, which mutate nothing and
   return the same shape `map/format.js` already defines -- so save is
   `JSON.stringify`, nothing to strip, and the one format the editor and
   the simulator agree on (section 3) is never a second representation
   pretending to be the first.

   V1 SCOPE, DELIBERATELY. The doc's own list for stage 2: draw a road,
   set its kind/lanes/one-way/speed/parking, elevation per point,
   control per approach, zones, validate, save/load, drive it. Turn
   overrides, turn bays and protected-left arrows exist in the format
   (map/bays.js, sim/signal.js, the big arterial) but are NOT editable
   here yet -- the doc's own "what is not built" for lane profiles and
   per-lane turns says that is content for a later pass, and a map
   wanting them is still hand-authored in map/samples.js meanwhile.

   THE CANVAS IS TOP-DOWN, NOT ISOMETRIC. Drawing a road is placing
   points in plan; the isometric view is what "drive it" switches into,
   reusing MapRoad.jsx wholesale (the same screen #/map runs), which is
   the whole reason MapRoad now takes a `mapData` prop instead of
   hardcoding the test map. Metres to pixels is a plain affine map
   (`x0,y0,scale`), because the format's own coordinates already are
   plan metres, y southward -- there is nothing to project.

   No React state from a drag: `view` (pan, zoom, which point if any is
   being dragged, the road/zone mid-draw) lives in a ref and the canvas
   is redrawn imperatively on every pointer move, the same discipline
   MapRoad's frame loop keeps and for the same reason (CLAUDE.md,
   Conventions) -- a drag is not a frame loop, but it is just as
   continuous, and committing every pixel of it into React state would
   re-render the whole panel tree at pointer-move rate for no reason. A
   COMMITTED edit (pointer up, a property changed, Finish clicked) is
   ordinary React state, because those are ordinary clicks.
   ===================================================================== */
import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Route, MousePointer2, Hexagon, Move, ZoomIn, ZoomOut,
  Trash2, Download, Upload, FolderOpen, Play, CheckCircle2, AlertTriangle, Undo2, X,
} from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { readJSON, writeJSON } from "../storage.js";
import { KINDS, CONTROLS, ZONES } from "../map/format.js";
import { testMap1 } from "../map/samples.js";
import {
  newDraft, addRoad, addPoint, updatePoint, removeLastPoint, deleteRoad,
  setRoadProps, setRoadControl, setPointZ, nearestRoadEnd, cumulative,
  addZone, addZonePoint, setZoneProps, deleteZone, serialize, parse,
} from "../editor/model.js";
import { validateDraft } from "../editor/validate.js";
import MapRoad from "./MapRoad.jsx";
import { firstEdge } from "../map/edges.js";
import ErrorBoundary from "./ErrorBoundary.jsx";

const DIM = "#9AA3B2", TEXT = "#E6E8EC";
const AUTOSAVE_KEY = "row.editor.draft.v1";
const SNAP_PX = 12;      // screen pixels a click may be from a point/end and still hit it
const KIND_COLOR = { residential: "#8A93A6", collector: C.blue, arterial: C.amber, highway: C.red, service: "#5B6270" };
const ZONE_COLOR = { residential: "#8A93A6", commercial: "#A264E0", industrial: "#E08A3B", park: C.green, water: C.blue, highway: C.red };

/* --- world <-> screen, in a plain ref so a drag never touches React --- */
function makeView(draft) {
  const roads = draft.roads.filter((r) => r.points.length);
  const pts = roads.flatMap((r) => r.points);
  if (!pts.length) return { x0: -20, y0: -20, scale: 4, cursor: null, dragging: null, drawKind: "collector" };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const w = Math.max(40, Math.max(...xs) - Math.min(...xs)), h = Math.max(40, Math.max(...ys) - Math.min(...ys));
  const scale = Math.max(0.5, Math.min(8, 300 / Math.max(w, h)));
  return { x0: Math.min(...xs) - w * 0.15, y0: Math.min(...ys) - h * 0.15, scale, cursor: null, dragging: null, drawKind: "collector" };
}

export default function Editor() {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const view = useRef(null);
  const loadedAutosave = useRef(false);

  const [draft, setDraft] = useState(() => newDraft("draft", "Untitled map"));
  const [tool, setTool] = useState("road");           // "road" | "select" | "zone" | "pan"
  const [newRoadKind, setNewRoadKind] = useState("collector");
  const [newZoneKind, setNewZoneKind] = useState("residential");
  const [drawing, setDrawing] = useState(null);        // { type: "road"|"zone", id }
  const [selected, setSelected] = useState(null);       // { type: "road"|"zone", id }
  const [validation, setValidation] = useState(null);
  const [driving, setDriving] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);

  if (!view.current) view.current = makeView(draft);

  /* Autosave, the same adapter chain settings.js uses: load once, then
     every committed change writes. Loading first and only THEN turning
     autosave on stops the load's own arrival from being overwritten by
     the blank draft that was on screen while it was in flight. */
  useEffect(() => {
    let live = true;
    readJSON(AUTOSAVE_KEY, null).then((saved) => {
      if (!live) return;
      if (saved && Array.isArray(saved.roads)) { setDraft(saved); view.current = makeView(saved); }
      loadedAutosave.current = true;
    });
    return () => { live = false; };
  }, []);
  useEffect(() => { if (loadedAutosave.current) writeJSON(AUTOSAVE_KEY, draft); }, [draft]);

  /* VALIDATE ON EVERY COMMITTED CHANGE, not on demand -- it is cheap
     (loadMap + graphOf on a handful of roads), and "can this be driven
     yet" is exactly what the maintainer needs to see change as he
     draws, not something he has to remember to ask for. */
  useEffect(() => { setValidation(validateDraft(draft)); }, [draft]);

  const roadOf = (id) => draft.roads.find((r) => r.id === id);
  const zoneOf = (id) => (draft.zones ?? []).find((z) => z.id === id);

  /* --- drawing ------------------------------------------------------- */
  const toWorld = (px, py) => ({ x: view.current.x0 + px / view.current.scale, y: view.current.y0 + py / view.current.scale });
  const toScreen = (wx, wy) => ({ x: (wx - view.current.x0) * view.current.scale, y: (wy - view.current.y0) * view.current.scale });

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1b1e23"; ctx.fillRect(0, 0, w, h);
    const v = view.current;

    /* A 20 m grid, for scale -- the format's own chunk-adjacent unit,
       cheap to draw and the only thing that makes "how big is this"
       readable before anything is on the canvas at all. */
    ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
    const g = 20 * v.scale;
    if (g > 6) {
      const ox = -((v.x0 * v.scale) % g), oy = -((v.y0 * v.scale) % g);
      for (let x = ox; x < w; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = oy; y < h; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }

    /* Zones: filled, under everything. */
    for (const z of draft.zones ?? []) {
      if (z.polygon.length < 2) continue;
      ctx.beginPath();
      z.polygon.forEach((p, i) => { const s = toScreen(p.x, p.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      if (z.polygon.length >= 3) ctx.closePath();
      const col = ZONE_COLOR[z.kind] ?? "#8A93A6";
      ctx.fillStyle = col + "26"; ctx.fill();
      ctx.strokeStyle = selected?.type === "zone" && selected.id === z.id ? C.white : col;
      ctx.lineWidth = selected?.type === "zone" && selected.id === z.id ? 2.5 : 1.5;
      ctx.stroke();
    }

    /* Nodes, once the draft loads -- where roads actually snap together,
       which is the thing a person drawing cannot otherwise see: two
       ends a metre apart LOOK joined and are not. */
    if (validation?.ok) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (const n of validation.loaded.nodes) { const s = toScreen(n.at.x, n.at.y); ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, 7); ctx.fill(); }
    }

    /* Roads. */
    for (const r of draft.roads) {
      if (r.points.length < 2) continue;
      const isSel = selected?.type === "road" && selected.id === r.id;
      const isDraw = drawing?.type === "road" && drawing.id === r.id;
      ctx.beginPath();
      r.points.forEach((p, i) => { const s = toScreen(p.x, p.y); i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y); });
      ctx.strokeStyle = isSel ? C.white : (KIND_COLOR[r.kind] ?? C.blue);
      ctx.lineWidth = Math.max(2, Math.min(10, (r.lanes ?? 1) * (r.oneWay ? 1 : 2) * v.scale * 0.6));
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.globalAlpha = isDraw ? 0.85 : 1;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1;
      ctx.stroke();
      if (isSel || isDraw) {
        ctx.fillStyle = C.white;
        for (const p of r.points) { const s = toScreen(p.x, p.y); ctx.beginPath(); ctx.arc(s.x, s.y, 4, 0, 7); ctx.fill(); }
      }
    }

    /* The road or zone being drawn: a rubber-band line to the cursor,
       and the snap target it would land on right now, so the click
       that joins two roads is a promise kept rather than a surprise
       discovered at Validate. */
    if (drawing && v.cursor) {
      const last = drawing.type === "road" ? roadOf(drawing.id)?.points.at(-1) : zoneOf(drawing.id)?.polygon.at(-1);
      if (last) {
        const a = toScreen(last.x, last.y), b = toScreen(v.cursor.x, v.cursor.y);
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      }
      if (drawing.type === "road") {
        const snap = nearestRoadEnd(draft, v.cursor, { within: 6, excludeRoad: drawing.id });
        if (snap) {
          const s = toScreen(snap.at.x, snap.at.y);
          ctx.strokeStyle = C.green; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(s.x, s.y, 8, 0, 7); ctx.stroke();
        }
      }
    }

    /* A jumped-to warning, briefly rung. */
    if (v.ping) {
      const s = toScreen(v.ping.x, v.ping.y);
      ctx.strokeStyle = C.amber; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(s.x, s.y, 14, 0, 7); ctx.stroke();
    }
  }, [draft, selected, drawing, validation]);

  useEffect(paint, [paint]);
  useEffect(() => {
    const onResize = () => paint();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint]);

  /* --- committing a draw / edit --------------------------------------- */
  const finishDrawing = (discardIfShort = true) => {
    if (!drawing) return;
    if (drawing.type === "road") {
      const r = roadOf(drawing.id);
      if (discardIfShort && (!r || r.points.length < 2)) setDraft((m) => deleteRoad(m, drawing.id));
    } else {
      const z = zoneOf(drawing.id);
      if (discardIfShort && (!z || z.polygon.length < 3)) setDraft((m) => deleteZone(m, drawing.id));
    }
    setDrawing(null);
  };
  const cancelDrawing = () => {
    if (!drawing) return;
    setDraft((m) => (drawing.type === "road" ? deleteRoad(m, drawing.id) : deleteZone(m, drawing.id)));
    setDrawing(null);
  };
  const undoPoint = () => {
    if (!drawing || drawing.type !== "road") return;
    setDraft((m) => removeLastPoint(m, drawing.id));
  };

  useEffect(() => {
    const onKey = (e) => {
      /* Not while a form field has focus: the property panel's own
         number inputs use Backspace and Enter for what they always
         mean, and a road left mid-draw while the panel is open (still
         showing the PREVIOUS selection -- switching tool does not
         clear it) must not steal a keystroke meant for a z field. */
      if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target?.tagName)) return;
      if (e.key === "Escape") cancelDrawing();
      if (e.key === "Enter") finishDrawing();
      if (e.key === "Backspace" && drawing?.type === "road") undoPoint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);

  /* --- pointer --------------------------------------------------------- */
  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const hitPoint = (px, py) => {
    for (const r of draft.roads) {
      for (let i = 0; i < r.points.length; i++) {
        const s = toScreen(r.points[i].x, r.points[i].y);
        if (Math.hypot(s.x - px, s.y - py) <= SNAP_PX) return { road: r.id, index: i };
      }
    }
    return null;
  };
  const distToSeg = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
  };
  const hitRoad = (px, py) => {
    for (const r of draft.roads) {
      for (let i = 0; i + 1 < r.points.length; i++) {
        if (distToSeg({ x: px, y: py }, toScreen(r.points[i].x, r.points[i].y), toScreen(r.points[i + 1].x, r.points[i + 1].y)) <= 8) return r.id;
      }
    }
    return null;
  };
  const hitZone = (wx, wy) => {
    for (const z of draft.zones ?? []) {
      if (z.polygon.length < 3) continue;
      let inside = false;
      for (let i = 0, j = z.polygon.length - 1; i < z.polygon.length; j = i++) {
        const a = z.polygon[i], b = z.polygon[j];
        if ((a.y > wy) !== (b.y > wy) && wx < ((b.x - a.x) * (wy - a.y)) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) return z.id;
    }
    return null;
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = at(e), w = toWorld(p.x, p.y);
    if (tool === "pan") { view.current.dragging = { mode: "pan", startPx: p, x0: view.current.x0, y0: view.current.y0 }; return; }
    if (tool === "road") {
      const snap = nearestRoadEnd(draft, w, { within: 6 / view.current.scale, excludeRoad: drawing?.id });
      const pt = snap ? snap.at : { x: w.x, y: w.y, z: 0 };
      if (!drawing) {
        /* `addRoad` is pure and returns its new id synchronously --
           read straight from `draft`, no need for the functional
           updater form (that is for when the update depends on a state
           React has not yet applied; a fresh road never does). */
        const { map: m1, id } = addRoad(draft, { kind: newRoadKind });
        setDraft(addPoint(m1, id, pt));
        setDrawing({ type: "road", id });
      } else {
        setDraft(addPoint(draft, drawing.id, pt));
        if (snap) finishDrawing(false);   // joining another road's end is a natural stop
      }
      return;
    }
    if (tool === "zone") {
      if (!drawing) {
        const { map: m1, id } = addZone(draft, { kind: newZoneKind });
        setDraft(addZonePoint(m1, id, w));
        setDrawing({ type: "zone", id });
      } else {
        setDraft(addZonePoint(draft, drawing.id, w));
      }
      return;
    }
    if (tool === "select") {
      const hp = hitPoint(p.x, p.y);
      if (hp) { view.current.dragging = { mode: "point", ...hp }; setSelected({ type: "road", id: hp.road }); return; }
      const hr = hitRoad(p.x, p.y);
      if (hr) { setSelected({ type: "road", id: hr }); return; }
      const hz = hitZone(w.x, w.y);
      if (hz) { setSelected({ type: "zone", id: hz }); return; }
      setSelected(null);
    }
  };
  const onMove = (e) => {
    const p = at(e), w = toWorld(p.x, p.y);
    view.current.cursor = w;
    const d = view.current.dragging;
    if (d?.mode === "pan") {
      view.current.x0 = d.x0 - (p.x - d.startPx.x) / view.current.scale;
      view.current.y0 = d.y0 - (p.y - d.startPx.y) / view.current.scale;
    } else if (d?.mode === "point") {
      /* Live, in the ref only -- committed on release. */
      d.live = w;
    }
    paint();
  };
  const onUp = () => {
    const d = view.current.dragging;
    if (d?.mode === "point" && d.live) {
      const snap = (d.index === 0 || d.index === roadOf(d.road)?.points.length - 1)
        ? nearestRoadEnd(draft, d.live, { within: 6 / view.current.scale, excludeRoad: d.road })
        : null;
      const pt = snap ? snap.at : d.live;
      setDraft((m) => updatePoint(m, d.road, d.index, pt));
    }
    view.current.dragging = null;
  };
  const onWheel = (e) => {
    e.preventDefault();
    const p = at({ currentTarget: e.currentTarget, clientX: e.clientX, clientY: e.clientY });
    const before = toWorld(p.x, p.y);
    view.current.scale = Math.max(0.3, Math.min(20, view.current.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    const after = toWorld(p.x, p.y);
    view.current.x0 += before.x - after.x; view.current.y0 += before.y - after.y;
    paint();
  };

  const jumpTo = (pt) => {
    if (!pt) return;
    view.current.x0 = pt.x - 60; view.current.y0 = pt.y - 60; view.current.scale = Math.max(view.current.scale, 3);
    view.current.ping = pt;
    paint();
    setTimeout(() => { view.current.ping = null; paint(); }, 1400);
  };

  /* --- save / load ------------------------------------------------------ */
  const download = () => {
    const blob = new Blob([serialize(draft)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${draft.id || "map"}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const openFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const m = parse(String(reader.result));
      if (!m) { setFileError(`"${file.name}" is not a map this editor can read.`); return; }
      setFileError(null); setDraft(m); setSelected(null); setDrawing(null);
      view.current = makeView(m);
    };
    reader.readAsText(file);
  };
  const loadSample = (which) => {
    const m = which === "test" ? testMap1() : newDraft();
    setDraft(m); setSelected(null); setDrawing(null); view.current = makeView(m);
  };

  const startAt = validation?.ok ? firstEdge(validation.loaded) : null;

  /* --- drive it ----------------------------------------------------------
     A separate top-level render, not nested inside the editing layout:
     MapRoad is a full page in its own right (the same one #/map is),
     and asking it to share a container with the editor's own chrome
     would fight it on height for no reason. The way back is a floating
     button on top of it instead. */
  if (driving) {
    return (
      <div style={{ position: "fixed", inset: 0 }}>
        <ErrorBoundary name="editor drive">
          <MapRoad mapData={draft} startAt={startAt} />
        </ErrorBoundary>
        <button className="btn" style={S.driveBack} onClick={() => setDriving(false)}>
          <X size={16} /> Back to editing
        </button>
      </div>
    );
  }

  const selRoad = selected?.type === "road" ? roadOf(selected.id) : null;
  const selZone = selected?.type === "zone" ? zoneOf(selected.id) : null;

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>The editor</span>
        <span style={S.sub}>Draw roads and zones, set what they are, then Drive it — the same screen #/map runs, on the map you just drew.</span>
      </div>

      <div style={S.toolbar}>
        {[["road", "Draw road", Route], ["select", "Select / edit", MousePointer2], ["zone", "Draw zone", Hexagon], ["pan", "Pan", Move]].map(([id, label, Icon]) => (
          <button key={id} className="btn" title={label}
            style={{ ...S.btn, borderColor: tool === id ? C.amber : "rgba(255,255,255,0.12)", color: tool === id ? C.white : DIM }}
            onClick={() => { if (drawing) finishDrawing(); if (id !== "select") setSelected(null); setTool(id); }}>
            <Icon size={18} />
          </button>
        ))}
        {tool === "road" && (
          <select style={S.select} value={newRoadKind} onChange={(e) => setNewRoadKind(e.target.value)}>
            {Object.keys(KINDS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        {tool === "zone" && (
          <select style={S.select} value={newZoneKind} onChange={(e) => setNewZoneKind(e.target.value)}>
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        )}
        {drawing && (
          <>
            <button className="btn" style={S.chip} onClick={() => finishDrawing()}>Finish</button>
            {drawing.type === "road" && <button className="btn" style={S.btn} title="undo last point" onClick={undoPoint}><Undo2 size={16} /></button>}
            <button className="btn" style={S.btn} title="cancel" onClick={cancelDrawing}><X size={16} /></button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" style={S.btn} onClick={() => { view.current.scale = Math.max(0.3, view.current.scale / 1.25); paint(); }}><ZoomOut size={16} /></button>
        <button className="btn" style={S.btn} onClick={() => { view.current.scale = Math.min(20, view.current.scale * 1.25); paint(); }}><ZoomIn size={16} /></button>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} />
      </div>

      <div style={S.panel}>
        {selRoad && (
          <RoadPanel road={selRoad}
            onChange={(patch) => setDraft((m) => setRoadProps(m, selRoad.id, patch))}
            onControl={(end, v) => setDraft((m) => setRoadControl(m, selRoad.id, end, v))}
            onZ={(i, z) => setDraft((m) => setPointZ(m, selRoad.id, i, z))}
            onDelete={() => { setDraft((m) => deleteRoad(m, selRoad.id)); setSelected(null); }}
          />
        )}
        {selZone && (
          <ZonePanel zone={selZone}
            onChange={(patch) => setDraft((m) => setZoneProps(m, selZone.id, patch))}
            onDelete={() => { setDraft((m) => deleteZone(m, selZone.id)); setSelected(null); }}
          />
        )}

        <ValidatePanel validation={validation} onJump={jumpTo} />

        <div style={S.row}>
          <button className="btn" style={S.chip} onClick={download}><Download size={15} style={{ marginRight: 6 }} />Save (download)</button>
          <button className="btn" style={S.chip} onClick={() => fileRef.current?.click()}><Upload size={15} style={{ marginRight: 6 }} />Open</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={openFile} />
          <button className="btn" style={S.chip} onClick={() => loadSample("test")}><FolderOpen size={15} style={{ marginRight: 6 }} />Load test map 1</button>
          <button className="btn" style={S.chip} onClick={() => loadSample("blank")}>New blank map</button>
        </div>
        {fileError && <div style={{ ...S.note, color: C.red }}>{fileError}</div>}

        <button className="btn" style={{ ...S.chip, minHeight: 48, borderColor: validation?.ok ? C.green : "rgba(255,255,255,0.12)", color: validation?.ok ? C.white : DIM, opacity: validation?.ok ? 1 : 0.5 }}
          disabled={!validation?.ok} onClick={() => setDriving(true)}>
          <Play size={16} style={{ marginRight: 6 }} />
          {validation?.ok ? (startAt ? "Drive it" : "Drive it — no open end to start from") : "Draw a road to drive it"}
        </button>

        <div style={S.note}>
          Draw: click to place points, Finish to end the road (or click
          near another road's end to join and finish automatically).
          Select: drag a point to move it, click a road or zone to edit
          its properties below. Wheel to zoom, Pan to move around.
          Autosaves as you go.
        </div>
      </div>
    </div>
  );
}

/* --- side panels --------------------------------------------------------- */
function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontFamily: FONT_D, fontSize: 12, color: DIM, minWidth: 90 }}>
      {label}
      {children}
    </label>
  );
}
const inputStyle = { minHeight: 32, fontSize: 16, background: "#22262c", color: TEXT, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "2px 6px" };

function RoadPanel({ road, onChange, onControl, onZ, onDelete }) {
  const at = cumulative(road.points);
  const total = at.at(-1) ?? 0;
  const zs = road.points.map((p) => p.z ?? 0);
  const zMax = Math.max(1, ...zs.map(Math.abs));
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span>Road · {road.id}</span>
        <button className="btn" style={S.iconBtn} onClick={onDelete} title="delete road"><Trash2 size={15} /></button>
      </div>
      <div style={S.row}>
        <Field label="Kind">
          <select style={inputStyle} value={road.kind} onChange={(e) => onChange({ kind: e.target.value })}>
            {Object.keys(KINDS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Lanes / dir"><input type="number" min={1} max={4} style={inputStyle} value={road.lanes} onChange={(e) => onChange({ lanes: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })} /></Field>
        <Field label="Speed (km/h)"><input type="number" min={10} max={110} step={5} style={inputStyle} value={road.speed} onChange={(e) => onChange({ speed: Number(e.target.value) || road.speed })} /></Field>
        <Field label="Parking">
          <select style={inputStyle} value={road.parking} onChange={(e) => onChange({ parking: e.target.value })}>
            <option value="none">none</option><option value="parallel">parallel</option>
          </select>
        </Field>
        <Field label="One-way">
          <input type="checkbox" style={{ width: 22, height: 22, marginTop: 4 }} checked={!!road.oneWay} onChange={(e) => onChange({ oneWay: e.target.checked })} />
        </Field>
      </div>
      <div style={S.row}>
        <Field label="Control at start">
          <select style={inputStyle} value={road.control?.start ?? "none"} onChange={(e) => onControl("start", e.target.value)}>
            {CONTROLS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Control at end">
          <select style={inputStyle} value={road.control?.end ?? "none"} onChange={(e) => onControl("end", e.target.value)}>
            {CONTROLS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ fontFamily: FONT_D, fontSize: 12, color: DIM, marginTop: 4 }}>Elevation ({total.toFixed(0)} m long)</div>
      {road.points.length >= 2 && (
        <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ background: "#22262c", borderRadius: 4 }}>
          <polyline fill="none" stroke={C.amber} strokeWidth="1.5" vectorEffect="non-scaling-stroke"
            points={road.points.map((p, i) => `${(at[i] / (total || 1)) * 100},${38 - ((p.z ?? 0) / zMax) * 17 - 1}`).join(" ")} />
        </svg>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {road.points.map((p, i) => (
          <Field key={i} label={`pt ${i} z (m)`}>
            <input type="number" step={0.1} style={{ ...inputStyle, width: 64 }} value={p.z ?? 0} onChange={(e) => onZ(i, Number(e.target.value) || 0)} />
          </Field>
        ))}
      </div>
    </div>
  );
}

function ZonePanel({ zone, onChange, onDelete }) {
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span>Zone · {zone.id}</span>
        <button className="btn" style={S.iconBtn} onClick={onDelete} title="delete zone"><Trash2 size={15} /></button>
      </div>
      <div style={S.row}>
        <Field label="Kind">
          <select style={inputStyle} value={zone.kind} onChange={(e) => onChange({ kind: e.target.value })}>
            {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </Field>
        <Field label="Density (0-1)">
          <input type="number" min={0} max={1} step={0.05} style={inputStyle} value={zone.density ?? 0.5} onChange={(e) => onChange({ density: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })} />
        </Field>
      </div>
    </div>
  );
}

function ValidatePanel({ validation, onJump }) {
  if (!validation) return null;
  const items = [...(validation.warnings ?? []).map((w) => ({ ...w, kind: "warning" })), ...(validation.errors ?? []).map((e) => ({ ...e, kind: "error" }))];
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        {validation.ok
          ? <span style={{ color: C.green, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={15} /> Loads clean{items.length ? `, ${items.length} note${items.length === 1 ? "" : "s"}` : ""}</span>
          : <span style={{ color: validation.crash ? C.red : DIM, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={15} /> {validation.crash ? `Internal error (${validation.crash.stage}): ${validation.crash.message}` : validation.reason ?? "Not ready to validate yet"}</span>}
      </div>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflow: "auto" }}>
          {items.map((it, i) => (
            <button key={i} className="btn" style={S.warnRow} onClick={() => onJump(it.at)}>
              <span style={{ color: it.kind === "error" ? C.red : C.amber, fontFamily: FONT_D, fontSize: 11, textTransform: "uppercase" }}>{it.kind}</span>
              <span style={{ fontSize: 12, color: TEXT, textAlign: "left", flex: 1 }}>{it.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const S = {
  page: { minHeight: "100dvh", display: "flex", flexDirection: "column", background: "#16181C", color: TEXT },
  head: { padding: "10px 12px 6px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: DIM },
  toolbar: { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "0 10px 6px" },
  view: { position: "relative", height: "44vh", minHeight: 260, margin: "0 8px", borderRadius: 8, overflow: "hidden", background: "#1b1e23" },
  panel: { padding: 10, display: "flex", flexDirection: "column", gap: 8, overflow: "auto", flex: 1 },
  row: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" },
  btn: { width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: C.white },
  iconBtn: { width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: C.red },
  chip: { minHeight: 44, minWidth: 44, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", fontFamily: FONT_D, fontSize: 13, color: TEXT, display: "inline-flex", alignItems: "center" },
  select: { minHeight: 44, fontSize: 16, background: "#22262c", color: TEXT, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "0 8px" },
  note: { fontFamily: FONT_U, fontSize: 12, color: DIM, lineHeight: 1.45 },
  card: { display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" },
  cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: FONT_D, fontSize: 13, color: TEXT },
  warnRow: { display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", minHeight: 32, textAlign: "left" },
  driveBack: { position: "fixed", top: 10, left: 10, zIndex: 20, minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(20,22,26,0.85)", color: C.white, fontFamily: FONT_D, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 },
};
