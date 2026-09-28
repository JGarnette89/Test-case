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
  Trash2, Download, Upload, FolderOpen, Play, CheckCircle2, AlertTriangle, Undo2, Redo2, X, Save, Library, Building2,
} from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { readJSON, writeJSON } from "../storage.js";
import { CLEARANCE_MIN } from "../map/load.js";
import { KINDS, CONTROLS, ZONES, PROP_KINDS, CHARACTERS } from "../map/format.js";
import { testMap1, testCity0 } from "../map/samples.js";
import { fillZone, clearZone, BLOCKS, fillLots, clearLots, LOTS } from "../map/generate.js";
import {
  newDraft, addRoad, addPoint, updatePoint, removeLastPoint, deleteRoad,
  setRoadProps, setRoadControl, setRoadBays, setLeftArrow, setPointZ, nearestRoadEnd, cumulative,
  nearestOnRoad, joinCrossing, setRoadRamp, setRoadHump, deletePoint, subdivideRoad, smoothRoad,
  addZone, addZonePoint, setZoneProps, deleteZone, serialize, parse, setRoadTurns,
  addProp, setPropProps, deleteProp, propAt, footprintOf, headingToRoad, setSignBack, controlAt, setNoLeft, noLeftAt, setCrosswalk,
} from "../editor/model.js";
import { validateDraft } from "../editor/validate.js";
import { listMaps, saveMap, openMap, deleteMap, prunedList } from "../editor/library.js";
import { zoomAbout as zoomView, pinchView, panView, isTap, TAP_PX } from "../editor/gesture.js";
import MapRoad from "./MapRoad.jsx";
import { firstEdge } from "../map/edges.js";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { emptyHistory, record, undo as undoStep, redo as redoStep } from "../editor/history.js";

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
  /* HISTORY (editor/history.js): every committed draft change is recorded
     against the one before it, except the ones history itself makes (an
     undo, a redo) and a whole new map arriving (autosave, open, new),
     which start history afresh -- undoing into a different map would be
     a surprise, not an undo. The ref holds the list; the state is only
     what the two buttons need to know. */
  const hist = useRef(emptyHistory());
  const prevDraft = useRef(draft);
  const skipHistory = useRef(true);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [canStep, setCanStep] = useState([false, false]);
  const [tool, setTool] = useState("road");           // "road" | "select" | "zone" | "building" | "pan"
  const [newPropKind, setNewPropKind] = useState("house");
  const [newRoadKind, setNewRoadKind] = useState("collector");
  const [newZoneKind, setNewZoneKind] = useState("residential");
  const [drawing, setDrawing] = useState(null);        // { type: "road"|"zone", id }
  const [selected, setSelected] = useState(null);       // { type: "road"|"zone"|"prop", id }
  const [validation, setValidation] = useState(null);
  const [driving, setDriving] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [mapName, setMapName] = useState("Untitled map");
  const [genReport, setGenReport] = useState(null);   // what the last Generate streets made, for the zone panel to say
  const [savedId, setSavedId] = useState(null);          // the library id this draft was last saved/opened as, null for never-saved
  const [library, setLibrary] = useState([]);
  const [showLibrary, setShowLibrary] = useState(false);
  const [, force] = useState(0);
  const redraw = useCallback(() => force((n) => n + 1), []);

  const refreshLibrary = useCallback(() => { prunedList().then(setLibrary); }, []);
  useEffect(() => { refreshLibrary(); }, [refreshLibrary]);

  if (!view.current) view.current = makeView(draft);

  /* Autosave, the same adapter chain settings.js uses: load once, then
     every committed change writes. Loading first and only THEN turning
     autosave on stops the load's own arrival from being overwritten by
     the blank draft that was on screen while it was in flight. */
  useEffect(() => {
    let live = true;
    readJSON(AUTOSAVE_KEY, null).then((saved) => {
      if (!live) return;
      if (saved && Array.isArray(saved.roads)) { freshHistory(); setDraft(saved); setMapName(saved.name ?? "Untitled map"); view.current = makeView(saved); }
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

  useEffect(() => {
    if (skipHistory.current) skipHistory.current = false;
    else hist.current = record(hist.current, prevDraft.current, draft, Date.now());
    prevDraft.current = draft;
    setCanStep([hist.current.past.length > 0, hist.current.future.length > 0]);
  }, [draft]);
  const freshHistory = () => { hist.current = emptyHistory(); skipHistory.current = true; };
  const stepHistory = (back) => {
    const r = (back ? undoStep : redoStep)(hist.current, draftRef.current);
    if (!r) return;
    hist.current = r.history; skipHistory.current = true;
    setDraft(r.draft);
  };

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

    /* Buildings: the footprint as the loader will build it. One the
       loader dropped for standing on a road is drawn in red, so the
       warning has something to point at. */
    const dropped = new Set((validation?.warnings ?? []).filter((w) => w.code === "prop-on-road").map((w) => `${w.at?.x},${w.at?.y}`));
    const movingProp = v.dragging?.mode === "prop" && v.dragging.live ? v.dragging : null;
    for (const p0 of draft.props ?? []) {
      const p = movingProp && movingProp.prop.id === p0.id ? { ...p0, at: movingProp.live } : p0;
      const { l, w } = footprintOf(p);
      const a = ((p.heading ?? 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath();
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([u, v], i) => {
        const q = toScreen(p.at.x + (u * l / 2) * c - (v * w / 2) * s, p.at.y + (u * l / 2) * s + (v * w / 2) * c);
        i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
      });
      ctx.closePath();
      const bad = dropped.has(`${p.at.x},${p.at.y}`);
      ctx.fillStyle = bad ? C.red + "55" : "rgba(160,166,180,0.55)"; ctx.fill();
      const sel = selected?.type === "prop" && selected.id === p.id;
      ctx.strokeStyle = sel ? C.white : bad ? C.red : "rgba(220,224,232,0.8)"; ctx.lineWidth = sel ? 2.5 : 1; ctx.stroke();
    }

    /* Nodes, once the draft loads -- where roads actually snap together,
       which is the thing a person drawing cannot otherwise see: two
       ends a metre apart LOOK joined and are not. */
    if (validation?.ok) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (const n of validation.loaded.nodes) { const s = toScreen(n.at.x, n.at.y); ctx.beginPath(); ctx.arc(s.x, s.y, 3.5, 0, 7); ctx.fill(); }
    }

    /* Roads -- with the point being dragged drawn where the finger is,
       not where it was: the drag lives in the ref until release, so
       reading `draft` alone would leave the road still until then. */
    const drag = v.dragging?.mode === "point" && v.dragging.live ? v.dragging : null;
    const ptsOf = (r) => (drag && drag.point.road === r.id
      ? r.points.map((p, i) => (i === drag.point.index ? { ...p, x: drag.live.x, y: drag.live.y } : p))
      : r.points);
    for (const r0 of draft.roads) {
      if (r0.points.length < 2) continue;
      const r = { ...r0, points: ptsOf(r0) };
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
      /* The selected APPROACH: a ring on the end whose control, bays
         and arrow the panel is showing. */
      if (isSel && selected.end) {
        const p = selected.end === "start" ? r.points[0] : r.points.at(-1);
        const s = toScreen(p.x, p.y);
        ctx.strokeStyle = C.amber; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, 7); ctx.stroke();
      }
    }

    /* OVERPASSES: a gap in the plan drawing of whichever road is
       UNDER, at every crossing with real clearance -- the one thing a
       flat top-down view cannot show for free, since two lines
       crossing read identically whether they are one road passing
       over another or the same road joined. `crossings` is
       load.js's own computed quantity (`over`, `gap`, `CLEARANCE_MIN`),
       not re-derived here; a crossing UNDER clearance stays a plain
       overlap on screen, which is correct -- load.js is refusing to
       call it an overpass either, and it is already in the warning
       list below for that reason. */
    if (validation?.ok) {
      for (const c of validation.loaded.crossings) {
        if (c.gap < CLEARANCE_MIN) continue;
        const underId = c.roads.find((id) => id !== c.over);
        const under = validation.loaded.roads.find((r) => r.id === underId);
        if (!under) continue;
        let i = 0, best = Infinity;
        for (let j = 0; j < under.pts.length; j++) { const d = Math.hypot(under.pts[j].x - c.at.x, under.pts[j].y - c.at.y); if (d < best) { best = d; i = j; } }
        const a = under.pts[Math.max(0, i - 1)], b = under.pts[Math.min(under.pts.length - 1, i + 1)];
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;   // perpendicular to the road, in world units
        /* A canvas stroke's WIDTH runs perpendicular to the path it
           traces. So the eraser's own path runs perpendicular to the
           road (a short reach, `half`, just enough to clear the
           road's full drawn thickness) and its LINE WIDTH -- along the
           road -- is what actually sets how long the visible break is:
           a fixed 12 screen px, not scaled by the road's own width, so
           a six-lane arterial does not get a gap wide enough to read
           as a second intersection. */
        const roadPx = Math.max(2, Math.min(10, (under.lanes ?? 1) * (under.oneWay ? 1 : 2) * v.scale * 0.6));
        const half = (roadPx / 2 + 2) / v.scale;
        const p1 = toScreen(c.at.x + nx * half, c.at.y + ny * half), p2 = toScreen(c.at.x - nx * half, c.at.y - ny * half);
        ctx.strokeStyle = "#1b1e23";
        ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
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
        /* Green for an end, blue for a line (a T): what the next tap
           will join, before it is made. */
        const within = SNAP_PX / v.scale;
        const end = nearestRoadEnd(draft, v.cursor, { within, excludeRoad: drawing.id });
        const on = end ? null : nearestOnRoad(draft, v.cursor, { within, excludeRoad: drawing.id });
        const snap = end ?? on;
        if (snap) {
          const s = toScreen(snap.at.x, snap.at.y);
          ctx.strokeStyle = end ? C.green : C.blue; ctx.lineWidth = 2;
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
      /* Undo and redo of the whole draft -- not while drawing, where the
         road's own point undo is the one meant. */
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !drawing && e.key.toLowerCase() === "z") { e.preventDefault(); stepHistory(!e.shiftKey); }
      if (mod && !drawing && e.key.toLowerCase() === "y") { e.preventDefault(); stepHistory(false); }
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

  /* --- pointer: a phone first ------------------------------------------
     Jay draws on a phone, so every gesture has to work with fingers and
     no modifier keys:
       - a TAP places a point (road, zone) or selects (select);
       - a one-finger DRAG pans, in any tool -- except starting on a
         point in the select tool, which drags that point;
       - TWO fingers pinch-zoom and pan together, in any tool;
       - a tap on a road's END in the select tool selects that APPROACH,
         for its control, bays and arrow (SIMULATOR.md 4: "control per
         approach set by clicking the approach").
     So a point is placed on RELEASE, not on press: a press that turns
     into a drag or a pinch must not have already dropped a point where
     the finger first landed. TAP_PX is how far a finger may wander and
     still be a tap. */
  const zoomAbout = (px, py, factor) => { Object.assign(view.current, zoomView(view.current, px, py, factor)); };

  /* WHERE A TAP JOINS: another road's END first, else a point on
     another road's LINE -- a T -- snapped exactly onto it so the
     loader's own join is certain rather than a fingertip's luck. */
  const snapFor = (w, exclude) => {
    const within = SNAP_PX / view.current.scale;
    const end = nearestRoadEnd(draft, w, { within, excludeRoad: exclude });
    if (end) return { kind: "end", at: end.at };
    const on = nearestOnRoad(draft, w, { within, excludeRoad: exclude });
    return on ? { kind: "line", at: on.at } : null;
  };
  const tapAt = (p) => {
    const w = toWorld(p.x, p.y);
    if (tool === "road") {
      const snap = snapFor(w, drawing?.id);
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
        /* A second tap on the same spot (a double-tap, or a double-click
           on a desktop) finishes rather than adding a point on top of
           the last one, which the loader would only thin away again. */
        const last = roadOf(drawing.id)?.points.at(-1);
        if (last && Math.hypot(last.x - pt.x, last.y - pt.y) * view.current.scale < TAP_PX) { finishDrawing(); return; }
        setDraft(addPoint(draft, drawing.id, pt));
        if (snap) finishDrawing(false);   // joining another road, at an end or mid-line, is a natural stop
      }
      return;
    }
    if (tool === "zone") {
      if (!drawing) {
        const { map: m1, id } = addZone(draft, { kind: newZoneKind });
        setDraft(addZonePoint(m1, id, w));
        setDrawing({ type: "zone", id });
      } else {
        const last = zoneOf(drawing.id)?.polygon.at(-1);
        if (last && Math.hypot(last.x - w.x, last.y - w.y) * view.current.scale < TAP_PX) { finishDrawing(); return; }
        setDraft(addZonePoint(draft, drawing.id, w));
      }
      return;
    }
    if (tool === "building") {
      /* A tap on an existing building selects it rather than stacking a
         second on top; anywhere else places one. */
      const hit = propAt(draft, w);
      if (hit) { setSelected({ type: "prop", id: hit }); return; }
      const { map: m1, id } = addProp(draft, { kind: newPropKind, at: w });
      setDraft(m1);
      setSelected({ type: "prop", id });
      return;
    }
    if (tool === "select") {
      const hp = hitPoint(p.x, p.y);
      if (hp) {
        const r = roadOf(hp.road);
        const end = hp.index === 0 ? "start" : hp.index === r.points.length - 1 ? "end" : null;
        setSelected({ type: "road", id: hp.road, end });
        return;
      }
      const hr = hitRoad(p.x, p.y);
      if (hr) { setSelected({ type: "road", id: hr }); return; }
      const hb = propAt(draft, w);
      if (hb) { setSelected({ type: "prop", id: hb }); return; }
      const hz = hitZone(w.x, w.y);
      if (hz) { setSelected({ type: "zone", id: hz }); return; }
      setSelected(null);
    }
  };

  const onDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = at(e);
    const v = view.current;
    v.pointers = v.pointers ?? new Map();
    v.pointers.set(e.pointerId, p);
    if (v.pointers.size === 2) {
      /* A second finger: whatever the first was doing becomes a pinch. */
      const [a, b] = [...v.pointers.values()];
      v.dragging = { mode: "pinch", start: { a, b, view: { x0: v.x0, y0: v.y0, scale: v.scale } } };
      return;
    }
    if (v.pointers.size > 2) return;
    const hp = tool === "select" ? hitPoint(p.x, p.y) : null;
    /* A press on a building, in the tools that can select one, grabs it:
       a drag moves it (held by the spot grabbed, so it does not jump to
       the finger), a tap still selects it. */
    const w = toWorld(p.x, p.y);
    const hb = !hp && (tool === "select" || tool === "building") ? propAt(draft, w) : null;
    const grab = hb ? (() => { const q = draft.props.find((x) => x.id === hb); return { id: hb, dx: w.x - q.at.x, dy: w.y - q.at.y }; })() : null;
    v.dragging = { mode: tool === "pan" ? "pan" : "pending", startPx: p, x0: v.x0, y0: v.y0, point: hp, prop: grab };
  };
  const onMove = (e) => {
    const p = at(e), v = view.current;
    v.cursor = toWorld(p.x, p.y);
    if (v.pointers?.has(e.pointerId)) v.pointers.set(e.pointerId, p);
    const d = v.dragging;
    if (d?.mode === "pinch" && v.pointers.size >= 2) {
      const [a, b] = [...v.pointers.values()];
      Object.assign(v, pinchView(d.start, a, b));
    } else if (d && (d.mode === "pending" || d.mode === "pan" || d.mode === "point" || d.mode === "prop")) {
      if (d.mode === "pending" && !isTap(d.startPx, p)) d.mode = d.point ? "point" : d.prop ? "prop" : "pan";
      if (d.mode === "prop") d.live = { x: v.cursor.x - d.prop.dx, y: v.cursor.y - d.prop.dy };
      if (d.mode === "pan") {
        Object.assign(v, panView({ x0: d.x0, y0: d.y0, scale: v.scale }, d.startPx, p));
      } else if (d.mode === "point") {
        /* Live, in the ref only -- committed on release, drawn now. */
        d.live = v.cursor;
      }
    }
    paint();
  };
  const onUp = (e) => {
    const v = view.current, d = v.dragging;
    v.pointers?.delete(e.pointerId);
    if (d?.mode === "pinch") {
      /* Lifting one finger of a pinch ends the gesture; nothing is
         placed, and the other finger does not become a stray tap. */
      if ((v.pointers?.size ?? 0) === 0) v.dragging = null;
      return;
    }
    if (d?.mode === "pending") tapAt(d.startPx);
    if (d?.mode === "point" && d.live) {
      const { road, index } = d.point;
      const snap = (index === 0 || index === roadOf(road)?.points.length - 1)
        ? nearestRoadEnd(draft, d.live, { within: SNAP_PX / v.scale, excludeRoad: road })
        : null;
      const pt = snap ? snap.at : d.live;
      setDraft((m) => updatePoint(m, road, index, { x: pt.x, y: pt.y }));
      setSelected({ type: "road", id: road });
    }
    if (d?.mode === "prop" && d.live) {
      const { id } = d.prop, to = { x: d.live.x, y: d.live.y };
      setDraft((m) => setPropProps(m, id, { at: to }));
      setSelected({ type: "prop", id });
    }
    v.dragging = null;
    paint();
  };
  /* The wheel, NATIVE and non-passive: React attaches its own wheel
     listener passive, so `preventDefault` there cannot stop the page
     scrolling under the canvas while zooming it. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAbout(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.15 : 1 / 1.15);
      paint();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paint, driving]);

  /* The loader names roads by its own split ids ("road0#b" once a T has
     split road0); the draft's own road is the part before the first "#".
     The crossing at `at` is found in the loader's own list, not guessed. */
  const joinAt = (at) => {
    const c = validation?.loaded?.crossings.find((x) => Math.hypot(x.at.x - at.x, x.at.y - at.y) < 0.5);
    if (!c) return;
    const [a, b] = c.roads.map((id) => id.split("#")[0]);
    if (a === b) return;
    setDraft((m) => joinCrossing(m, a, b, c.at));
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
    const named = { ...draft, name: mapName || draft.name };
    const blob = new Blob([serialize(named)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const file = (mapName || draft.id || "map").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "map";
    a.href = url; a.download = `${file}.json`; a.click();
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
      setFileError(null); freshHistory(); setDraft(m); setSelected(null); setDrawing(null); setSavedId(null); setMapName(m.name ?? "Opened map");
      view.current = makeView(m);
    };
    reader.readAsText(file);
  };
  const loadSample = (which) => {
    const m = which === "test" ? testMap1() : which === "city" ? testCity0() : newDraft();
    freshHistory(); setDraft(m); setSelected(null); setDrawing(null); setSavedId(null); setMapName(m.name ?? "Untitled map"); view.current = makeView(m);
  };

  /* --- library ----------------------------------------------------------
     Separate from autosave: autosave is one scratch slot that follows
     WHATEVER is on screen so a reload never loses work; the library is
     "multiple maps as data" (SIMULATOR.md section 4/1) -- named,
     switchable, and kept until deleted on purpose. Saving again under
     the id a draft was opened from overwrites it in place; the first
     save of a fresh draft gets a new one. */
  const doSave = () => {
    saveMap(draft, mapName || "Untitled map", savedId).then((saved) => {
      setSavedId(saved.id); setDraft((d) => ({ ...d, id: saved.id, name: saved.name })); refreshLibrary();
    });
  };
  const doOpen = (id) => {
    openMap(id).then((m) => {
      if (!m) { refreshLibrary(); return; }   // pruned since the list was drawn
      freshHistory(); setDraft(m); setSelected(null); setDrawing(null); setSavedId(id); setMapName(m.name ?? "Untitled map"); setShowLibrary(false);
      view.current = makeView(m);
    });
  };
  const doDelete = (id) => {
    deleteMap(id).then(() => { if (id === savedId) setSavedId(null); refreshLibrary(); });
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
  const selProp = selected?.type === "prop" ? (draft.props ?? []).find((p) => p.id === selected.id) ?? null : null;

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>The editor</span>
        <span style={S.sub}>Draw roads and zones, set what they are, then Drive it — the same screen #/map runs, on the map you just drew.</span>
      </div>

      <div style={S.toolbar}>
        {[["road", "Draw road", Route], ["select", "Select / edit", MousePointer2], ["zone", "Draw zone", Hexagon], ["building", "Place building", Building2], ["pan", "Pan", Move]].map(([id, label, Icon]) => (
          <button key={id} className="btn" title={label}
            style={{ ...S.btn, borderColor: tool === id ? C.amber : "rgba(255,255,255,0.12)", color: tool === id ? C.white : DIM }}
            onClick={() => { if (drawing) finishDrawing(); if (id !== "select" && id !== "building") setSelected(null); setTool(id); }}>
            <Icon size={18} />
          </button>
        ))}
        {tool === "road" && (
          <select style={S.select} value={newRoadKind} onChange={(e) => setNewRoadKind(e.target.value)}>
            {Object.keys(KINDS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        {tool === "building" && (
          <select style={S.select} value={newPropKind} onChange={(e) => setNewPropKind(e.target.value)}>
            {Object.keys(PROP_KINDS).map((k) => <option key={k} value={k}>{k}</option>)}
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
        {!drawing && (
          <>
            <button className="btn" style={{ ...S.btn, opacity: canStep[0] ? 1 : 0.35 }} title="undo" disabled={!canStep[0]} onClick={() => stepHistory(true)}><Undo2 size={16} /></button>
            <button className="btn" style={{ ...S.btn, opacity: canStep[1] ? 1 : 0.35 }} title="redo" disabled={!canStep[1]} onClick={() => stepHistory(false)}><Redo2 size={16} /></button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn" style={S.btn} onClick={() => { const c = canvasRef.current; zoomAbout((c?.clientWidth ?? 0) / 2, (c?.clientHeight ?? 0) / 2, 1 / 1.25); paint(); }}><ZoomOut size={16} /></button>
        <button className="btn" style={S.btn} onClick={() => { const c = canvasRef.current; zoomAbout((c?.clientWidth ?? 0) / 2, (c?.clientHeight ?? 0) / 2, 1.25); paint(); }}><ZoomIn size={16} /></button>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      </div>

      <div style={S.panel}>
        {selRoad && (
          <RoadPanel key={selRoad.id} road={selRoad} end={selected?.end ?? null}
            onChange={(patch) => setDraft((m) => setRoadProps(m, selRoad.id, patch))}
            onControl={(end, v) => setDraft((m) => setRoadControl(m, selRoad.id, end, v))}
            onBays={(end, b) => setDraft((m) => setRoadBays(m, selRoad.id, end, b))}
            signs={draft.signs}
            onSignBack={(end, back) => setDraft((m) => setSignBack(m, selRoad.id, end, back))}
            approaches={validation?.approaches}
            onTurns={(end, t) => setDraft((m) => setRoadTurns(m, selRoad.id, end, t))}
            onArrow={(end, on) => setDraft((m) => setLeftArrow(m, selRoad.id, end, on))}
            onNoLeft={(end, on) => setDraft((m) => setNoLeft(m, selRoad.id, end, on))}
            onCrosswalk={(end, on) => setDraft((m) => setCrosswalk(m, selRoad.id, end, on))}
            onRamp={(z0, z1) => setDraft((m) => setRoadRamp(m, selRoad.id, z0, z1))}
            onHump={(peak) => setDraft((m) => setRoadHump(m, selRoad.id, peak))}
            onSmooth={() => setDraft((m) => smoothRoad(m, selRoad.id))}
            onSubdivide={() => setDraft((m) => subdivideRoad(m, selRoad.id))}
            onDeletePoint={(i) => setDraft((m) => deletePoint(m, selRoad.id, i))}
            onZ={(i, z) => setDraft((m) => setPointZ(m, selRoad.id, i, z))}
            onDelete={() => { setDraft((m) => deleteRoad(m, selRoad.id)); setSelected(null); }}
          />
        )}
        {selProp && (
          <PropPanel key={selProp.id} prop={selProp}
            canFace={headingToRoad(draft, selProp.at) != null}
            onFace={() => setDraft((m) => { const h = headingToRoad(m, selProp.at); return h == null ? m : setPropProps(m, selProp.id, { heading: h }); })}
            onChange={(patch) => setDraft((m) => setPropProps(m, selProp.id, patch))}
            onDelete={() => { setDraft((m) => deleteProp(m, selProp.id)); setSelected(null); }} />
        )}
        {selZone && (
          <ZonePanel zone={selZone}
            generated={draft.roads.filter((r) => r.gen === selZone.id).length}
            onGenerate={() => { const r = fillZone(draft, selZone.id); setDraft(r.map); setGenReport({ zone: selZone.id, ...r.report }); }}
            onClear={() => { setDraft((m) => clearZone(m, selZone.id)); setGenReport(null); }}
            buildings={(draft.props ?? []).filter((p) => p.gen === selZone.id).length}
            onLots={() => { const r = fillLots(draft, selZone.id); setDraft(r.map); setGenReport({ zone: selZone.id, lots: true, ...r.report }); }}
            onClearLots={() => { setDraft((m) => clearLots(m, selZone.id)); setGenReport(null); }}
            report={genReport?.zone === selZone.id ? genReport : null}
            onChange={(patch) => setDraft((m) => setZoneProps(m, selZone.id, patch))}
            onDelete={() => { setDraft((m) => deleteZone(m, selZone.id)); setSelected(null); }}
          />
        )}

        <ValidatePanel validation={validation} onJump={jumpTo} onJoin={joinAt} />

        <div style={S.card}>
          <div style={S.cardHead}><span>This map</span></div>
          <div style={S.row}>
            <input style={{ ...inputStyle, flex: 1, minWidth: 140 }} value={mapName} onChange={(e) => setMapName(e.target.value)} placeholder="Name this map" />
            <button className="btn" style={S.chip} onClick={doSave}><Save size={15} style={{ marginRight: 6 }} />{savedId ? "Save" : "Save to library"}</button>
            <button className="btn" style={{ ...S.chip, borderColor: showLibrary ? C.amber : "rgba(255,255,255,0.12)" }} onClick={() => { setShowLibrary((s) => !s); if (!showLibrary) refreshLibrary(); }}>
              <Library size={15} style={{ marginRight: 6 }} />My maps{library.length ? ` (${library.length})` : ""}
            </button>
          </div>
          {showLibrary && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
              {library.length === 0 && <div style={S.note}>Nothing saved yet — Save to library keeps this draft under a name, as many as you like, separate from the autosave that just follows what's on screen.</div>}
              {library.map((e) => (
                <div key={e.id} style={{ ...S.warnRow, justifyContent: "space-between" }}>
                  <button className="btn" style={{ background: "transparent", border: "none", color: e.id === savedId ? C.amber : TEXT, textAlign: "left", flex: 1, fontFamily: FONT_D, fontSize: 13, minHeight: 32 }} onClick={() => doOpen(e.id)}>
                    {e.name || "(untitled)"}{e.id === savedId ? " · open" : ""}
                  </button>
                  <button className="btn" style={S.iconBtn} title="delete" onClick={() => doDelete(e.id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={S.row}>
          <button className="btn" style={S.chip} onClick={download}><Download size={15} style={{ marginRight: 6 }} />Download JSON</button>
          <button className="btn" style={S.chip} onClick={() => fileRef.current?.click()}><Upload size={15} style={{ marginRight: 6 }} />Open a file</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={openFile} />
          <button className="btn" style={S.chip} onClick={() => loadSample("test")}><FolderOpen size={15} style={{ marginRight: 6 }} />Load test map 1</button>
          <button className="btn" style={S.chip} onClick={() => loadSample("city")}><FolderOpen size={15} style={{ marginRight: 6 }} />Load stand-in city</button>
          <button className="btn" style={S.chip} onClick={() => loadSample("blank")}>New blank map</button>
        </div>
        {fileError && <div style={{ ...S.note, color: C.red }}>{fileError}</div>}

        <button className="btn" style={{ ...S.chip, minHeight: 48, borderColor: validation?.ok ? C.green : "rgba(255,255,255,0.12)", color: validation?.ok ? C.white : DIM, opacity: validation?.ok ? 1 : 0.5 }}
          disabled={!validation?.ok} onClick={() => setDriving(true)}>
          <Play size={16} style={{ marginRight: 6 }} />
          {validation?.ok ? (startAt ? "Drive it" : "Drive it — nowhere to start from") : "Draw a road to drive it"}
        </button>

        <div style={S.note}>
          Draw: click to place points, Finish to end the road (or click
          near another road's end to join and finish automatically).
          Select: drag a point to move it, click a road or zone to edit
          its properties below. Wheel to zoom, Pan to move around.
          Two roads crossing at real clearance, one raised in elevation,
          draw as an overpass — a gap opens in the lower one where the
          higher one crosses. Autosaves as you go; "Save to library"
          keeps a named copy on top of that, as many as you like.
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

/* ONE APPROACH -- a road end where it meets an intersection: how it is
   controlled, the turn bays that open before it, and whether its signal
   shows a protected left. Everything the big arterial at E was hand-
   authored with (map/bays.js, sim/signal.js), now drawable. A bay is
   meaningless at an end that meets no intersection, and the loader
   drops it there with a warning; the panel does not second-guess that,
   it lets Validate say so. */
/* LANE ARROWS: one group per lane at the line, centre line out, showing
   what the SIM will let that lane do -- the general rule until a toggle is
   touched, then the road end's own override, which is exactly the
   format's `turns`. A movement the intersection does not offer is not a
   button. Only an approach into a node has any of this. */
const MOVE_GLYPH = { left: "←", straight: "↑", right: "→" };
function LaneTurns({ info, onTurns }) {
  if (!info) return null;
  const toggle = (i, mv) => {
    const next = info.turns.map((t, k) => (k !== i ? t.slice() : t.includes(mv) ? t.filter((x) => x !== mv) : [...t, mv]));
    onTurns(next.map((t) => ["left", "straight", "right"].filter((m) => t.includes(m))));
  };
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: DIM, marginBottom: 4 }}>
        Lanes at the line, centre → curb · {info.given ? "set here" : "general rule"}
        {info.given && <span role="button" style={{ ...S.joinBtn, marginLeft: 8, padding: "2px 6px" }} onClick={() => onTurns(null)}>Reset to rule</span>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {info.turns.map((t, i) => (
          <span key={i} style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: 6, border: `1px solid ${t.length ? "rgba(255,255,255,0.15)" : C.red}` }}>
            {["left", "straight", "right"].filter((m) => info.offered.includes(m)).map((m) => (
              <button key={m} className="btn" title={`lane ${i}: ${m}`} onClick={() => toggle(i, m)}
                style={{ width: 32, height: 32, borderRadius: 4, border: "none", fontSize: 16, background: t.includes(m) ? (info.given ? C.amber : "rgba(255,255,255,0.22)") : "transparent", color: t.includes(m) ? "#000" : DIM }}>
                {MOVE_GLYPH[m]}
              </button>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

function Approach({ road, end, active, onControl, onBays, onArrow, info, onTurns, sign, rule, onSignBack, noLeft, onNoLeft, onCrosswalk }) {
  const b = road.bays?.[end] ?? null;
  const left = b?.left ?? 0, right = b?.right ?? 0;
  /* The rule at this approach: its sign where there is one (model.js
     `controlAt`), the road end's own control otherwise. */
  const ctl = rule ?? road.control?.[end] ?? "none";
  const lit = typeof ctl === "string" && ctl.startsWith("signal");
  const setBays = (l, r) => onBays(end, l || r ? { left: l, right: r } : null);
  return (
    <div style={{ ...S.approach, borderColor: active ? C.amber : "rgba(255,255,255,0.10)" }}>
      <div style={{ fontFamily: FONT_D, fontSize: 12, color: active ? C.amber : DIM }}>Approach at the {end} {active ? "· selected" : ""}</div>
      <div style={S.row}>
        <Field label="Control">
          <select style={inputStyle} value={ctl} onChange={(e) => onControl(end, e.target.value)}>
            {CONTROLS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        {sign && (
          <Field label="Sign set back (m)">
            <input type="number" min={0} max={40} step={1} style={{ ...inputStyle, width: 64 }} value={sign.back ?? 0}
              title="how far before the stop line the sign stands" onChange={(e) => onSignBack(end, e.target.value)} />
          </Field>
        )}
        <Field label="Left bays">
          <select style={inputStyle} value={left} onChange={(e) => setBays(Number(e.target.value), right)}>
            <option value={0}>none</option><option value={1}>1</option><option value={2}>2 (double left)</option>
          </select>
        </Field>
        <Field label="Right bay">
          <select style={inputStyle} value={right} onChange={(e) => setBays(left, Number(e.target.value))}>
            <option value={0}>none</option><option value={1}>1</option>
          </select>
        </Field>
        <Field label="Left arrow">
          <input type="checkbox" disabled={!lit} title={lit ? "a protected left arrow on this signal" : "only a signal has an arrow"}
            style={{ width: 22, height: 22, marginTop: 4, opacity: lit ? 1 : 0.4 }}
            checked={!!road.leftArrow?.[end] && lit} onChange={(e) => onArrow(end, e.target.checked)} />
        </Field>
        <Field label="No left turn">
          <input type="checkbox" title="a no-left-turn sign: nobody turns left from this approach"
            style={{ width: 22, height: 22, marginTop: 4 }} checked={!!noLeft} onChange={(e) => onNoLeft(end, e.target.checked)} />
        </Field>
        <Field label="Crosswalk">
          <input type="checkbox" title="a painted crosswalk across this road end; the stop line moves back to clear it"
            style={{ width: 22, height: 22, marginTop: 4 }} checked={!!road.crosswalk?.[end]} onChange={(e) => onCrosswalk(end, e.target.checked)} />
        </Field>
      </div>
      <LaneTurns info={info} onTurns={(t) => onTurns(end, t)} />
    </div>
  );
}

function RoadPanel({ road, end, approaches, signs, onSignBack, onNoLeft, onCrosswalk, onTurns, onChange, onControl, onBays, onArrow, onZ, onRamp, onHump, onSmooth, onSubdivide, onDeletePoint, onDelete }) {
  const [ramp, setRamp] = React.useState({ z0: road.points[0]?.z ?? 0, z1: road.points.at(-1)?.z ?? 0, peak: 7 });
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
      {["start", "end"].map((e) => (
        <Approach key={e} road={road} end={e} active={end === e} onControl={onControl} onBays={onBays} onArrow={onArrow} info={approaches?.[`${road.id}|${e}`]} onTurns={onTurns}
          sign={(signs ?? []).find((q) => q.road === road.id && q.end === e && (q.kind === "stop" || q.kind === "yield")) ?? null}
          rule={controlAt({ signs }, road, e)} onSignBack={onSignBack}
          noLeft={noLeftAt({ signs }, road, e)} onNoLeft={onNoLeft} onCrosswalk={onCrosswalk} />
      ))}

      <div style={{ fontFamily: FONT_D, fontSize: 12, color: DIM, marginTop: 4 }}>Elevation ({total.toFixed(0)} m long)</div>
      {/* A whole road's height from two numbers (section 4's "road-wide
          ramp"): a straight ramp between its ends, or a hump over what
          the ends already are -- a bridge over another road is one
          number, 7 m being comfortably over the loader's clearance. */}
      <div style={S.row}>
        <Field label="Ramp from (m)"><input type="number" step={0.5} style={{ ...inputStyle, width: 64 }} value={ramp.z0} onChange={(e) => setRamp({ ...ramp, z0: Number(e.target.value) || 0 })} /></Field>
        <Field label="to (m)"><input type="number" step={0.5} style={{ ...inputStyle, width: 64 }} value={ramp.z1} onChange={(e) => setRamp({ ...ramp, z1: Number(e.target.value) || 0 })} /></Field>
        <button className="btn" style={S.chip} onClick={() => onRamp(ramp.z0, ramp.z1)}>Ramp</button>
        <Field label="Bridge (m)"><input type="number" step={0.5} style={{ ...inputStyle, width: 64 }} value={ramp.peak} onChange={(e) => setRamp({ ...ramp, peak: Number(e.target.value) || 0 })} /></Field>
        <button className="btn" style={S.chip} onClick={() => onHump(ramp.peak)}>Hump</button>
      </div>
      {/* Shape: a tapped road is straight segments; Smooth rounds its
          corners (ends stay put, so a junction stays joined), Add points
          gives more handles to drag it into a curve by. */}
      <div style={S.row}>
        <button className="btn" style={S.chip} disabled={road.points.length < 3} onClick={onSmooth}>Smooth</button>
        <button className="btn" style={S.chip} onClick={onSubdivide}>Add points</button>
      </div>
      {road.points.length >= 2 && (
        <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none" style={{ background: "#22262c", borderRadius: 4 }}>
          <polyline fill="none" stroke={C.amber} strokeWidth="1.5" vectorEffect="non-scaling-stroke"
            points={road.points.map((p, i) => `${(at[i] / (total || 1)) * 100},${38 - ((p.z ?? 0) / zMax) * 17 - 1}`).join(" ")} />
        </svg>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {road.points.map((p, i) => (
          <Field key={i} label={`pt ${i} z (m)`}>
            <span style={{ display: "inline-flex", gap: 2 }}>
              <input type="number" step={0.1} style={{ ...inputStyle, width: 58 }} value={p.z ?? 0} onChange={(e) => onZ(i, Number(e.target.value) || 0)} />
              <button className="btn" style={{ ...S.iconBtn, width: 28, height: 32 }} title="delete this point" disabled={road.points.length <= 2} onClick={() => onDeletePoint(i)}><X size={13} /></button>
            </span>
          </Field>
        ))}
      </div>
    </div>
  );
}

/* A building: its kind, which way its long side runs, and its size --
   blank fields fall back to the kind's own. */
function PropPanel({ prop, canFace, onFace, onChange, onDelete }) {
  const f = footprintOf(prop);
  const num = (key, v) => onChange({ [key]: v === "" ? undefined : Math.max(1, Math.min(200, Number(v) || 1)) });
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <span>Building · {prop.id}</span>
        <button className="btn" style={S.iconBtn} onClick={onDelete} title="delete building"><Trash2 size={15} /></button>
      </div>
      <div style={S.row}>
        <Field label="Kind">
          <select style={inputStyle} value={prop.kind} onChange={(e) => onChange({ kind: e.target.value, l: undefined, w: undefined, h: undefined })}>
            {Object.keys(PROP_KINDS).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Heading (°)">
          <input type="number" step={5} style={inputStyle} value={Math.round(prop.heading ?? 0)} onChange={(e) => onChange({ heading: Number(e.target.value) || 0 })} />
        </Field>
        <Field label="Long (m)"><input type="number" min={1} max={200} style={inputStyle} value={prop.l ?? ""} placeholder={String(f.l)} onChange={(e) => num("l", e.target.value)} /></Field>
        <Field label="Deep (m)"><input type="number" min={1} max={200} style={inputStyle} value={prop.w ?? ""} placeholder={String(f.w)} onChange={(e) => num("w", e.target.value)} /></Field>
        <Field label="Tall (m)"><input type="number" min={1} max={200} style={inputStyle} value={prop.h ?? ""} placeholder={String(f.h)} onChange={(e) => num("h", e.target.value)} /></Field>
      </div>
      <div style={S.row}>
        <button className="btn" style={S.chip} disabled={!canFace} title={canFace ? "turn it to face the nearest road" : "no road within 40 m"} onClick={onFace}>Face nearest road</button>
        <span style={{ fontSize: 11, color: DIM, alignSelf: "center" }}>Drag it on the map to move it.</span>
      </div>
    </div>
  );
}

function ZonePanel({ zone, generated = 0, buildings = 0, report = null, onGenerate, onClear, onLots, onClearLots, onChange, onDelete }) {
  const subdivides = !!BLOCKS[zone.kind], hasLots = !!LOTS[zone.kind];
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
        <Field label="Drivers here">
          <select style={inputStyle} value={zone.character ?? "ordinary"} onChange={(e) => onChange({ character: e.target.value })}>
            {CHARACTERS.map((c) => <option key={c} value={c}>{c.replace("-", " ")}</option>)}
          </select>
        </Field>
        <Field label="Density (0-1)">
          <input type="number" min={0} max={1} step={0.05} style={inputStyle} value={zone.density ?? 0.5} onChange={(e) => onChange({ density: Math.max(0, Math.min(1, Number(e.target.value) || 0)) })} />
        </Field>
      </div>
      {/* STREETS INSIDE THE DISTRICT (map/generate.js): ordinary roads,
          tagged with this zone, so they can be edited by hand, cleared, or
          generated again after the shape or the density changes. */}
      <div style={S.row}>
        <button className="btn" style={S.chip} disabled={!subdivides} title={subdivides ? "fill this district with local streets joined to the roads around it" : `a ${zone.kind} zone is not subdivided`} onClick={onGenerate}>
          {generated ? "Generate streets again" : "Generate streets"}
        </button>
        {generated > 0 && <button className="btn" style={S.chip} onClick={onClear}>Clear streets ({generated})</button>}
      </div>
      {/* BUILDINGS ALONG THE FRONTAGES (map/generate.js fillLots): after
          the streets, since they front the streets. */}
      <div style={S.row}>
        <button className="btn" style={S.chip} disabled={!hasLots} title={hasLots ? "put buildings along every street in this district, facing it" : `a ${zone.kind} zone has no lots`} onClick={onLots}>
          {buildings ? "Place buildings again" : "Place buildings"}
        </button>
        {buildings > 0 && <button className="btn" style={S.chip} onClick={onClearLots}>Clear buildings ({buildings})</button>}
      </div>
      {report && (
        <div style={{ fontSize: 12, color: DIM }}>
          {report.reason ?? (report.lots
            ? `${report.buildings} buildings on ${report.lots} lots. Move or delete any by hand; placing again replaces them.`
            : `${report.streets} streets as ${report.roads} road pieces${report.dropped ? `; ${report.dropped} dropped that could not reach a road` : ""}. Hand-edit them freely; generating again replaces them.`)}
        </div>
      )}
    </div>
  );
}

/* A loader WARNING carries its own location (`at`); a graph ERROR --
   a lane with nowhere to land, a bad turns list -- names its NODE
   instead, since the lane is inside it. Both jump: the node's own
   location stands in for the error's. */
/* The loader's JOIN notes (`snapped-join`, `snapped-split`) are the
   join the person drew, not a problem, so they are counted, not listed
   -- a list of every T on the map would bury the warnings that matter.
   A crossing with no intersection offers its fix: make it one. */
const JOIN_NOTES = new Set(["snapped-join", "snapped-split"]);
function ValidatePanel({ validation, onJump, onJoin }) {
  if (!validation) return null;
  const joins = (validation.warnings ?? []).filter((w) => JOIN_NOTES.has(w.code)).length;
  const items = [...(validation.warnings ?? []).filter((w) => !JOIN_NOTES.has(w.code)).map((w) => ({ ...w, kind: "warning" })), ...(validation.errors ?? []).map((e) => ({ ...e, kind: "error" }))];
  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        {validation.ok
          ? <span style={{ color: C.green, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle2 size={15} /> Loads{items.length ? `, ${items.length} to look at` : " clean"}{joins ? ` · ${joins} join${joins === 1 ? "" : "s"} made` : ""}</span>
          : <span style={{ color: validation.crash ? C.red : DIM, display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={15} /> {validation.crash ? `Internal error (${validation.crash.stage}): ${validation.crash.message}` : validation.reason ?? "Not ready to validate yet"}</span>}
      </div>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflow: "auto" }}>
          {items.map((it, i) => (
            <button key={i} className="btn" style={S.warnRow} onClick={() => onJump(it.at ?? validation.loaded?.nodes.find((n) => n.id === it.node)?.at)}>
              <span style={{ color: it.kind === "error" ? C.red : C.amber, fontFamily: FONT_D, fontSize: 11, textTransform: "uppercase" }}>{it.kind}</span>
              <span style={{ fontSize: 12, color: TEXT, textAlign: "left", flex: 1 }}>{it.message}</span>
              {it.code === "cross-no-node" && onJoin && (
                <span role="button" style={S.joinBtn} onClick={(e) => { e.stopPropagation(); onJoin(it.at); }}>Make intersection</span>
              )}
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
  joinBtn: { padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.green}`, color: C.green, fontFamily: FONT_D, fontSize: 12, whiteSpace: "nowrap" },
  approach: { display: "flex", flexDirection: "column", gap: 6, padding: 8, borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)" },
  warnRow: { display: "flex", gap: 8, alignItems: "center", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", background: "transparent", minHeight: 32, textAlign: "left" },
  driveBack: { position: "fixed", top: 10, left: 10, zIndex: 20, minHeight: 44, padding: "0 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(20,22,26,0.85)", color: C.white, fontFamily: FONT_D, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 },
};
