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
import { pedPose, pedAt, strikePed } from "../sim/peds.js";
import { walkerPose } from "../sim/walkers.js";
import { sidewalksOf } from "../map/sidewalks.js";
import { panFree, zoomFree, pinchFree, fitK, extentOf } from "../iso/freecam.js";
import { isTap } from "../editor/gesture.js";
import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { loadMap, groundFor } from "../map/load.js";
import { testMap1 } from "../map/samples.js";
import { firstEdge } from "../map/edges.js";
import { seedGraph, step, poseOf, DT, crashWith } from "../sim/crossing.js";
import { playerOn, stepDriver, driverPose, withDriver, aheadOf, playerHonk } from "../sim/drive.js";
import { junctionsOf, postedAt } from "../sim/graph.js";
import { touching } from "../sim/player.js";
import { parkedPoses, contactWith } from "../sim/parking.js";
import { controls } from "../iso/controls.js";
import { drawFrame } from "../iso/draw.js";
import { terrain } from "../iso/road.js";
import { drawSlider, drawWheelBar, drawSignals, drawReadout, drawCorner, drawStop, drawHorn } from "../iso/hud.js";
import { HONK_FOR } from "../sim/horn.js";
import { newChase, chaseStep, zoomFor } from "../iso/chase.js";
import { perfMeter } from "../iso/perf.js";
import { loadSettings, setSetting, settings } from "../settings.js";
import { ASSIST } from "../sim/player.js";

const LIMITS = [40, 50, 60];
const DIM = "#9AA3B2", TEXT = "#E6E8EC";
const DPR_CAP = 2;
export const START = { road: "A-north", end: "end" };   // the player begins at the map's north edge, driving down to the crossroads

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
/* How many cars a map gets: map/cars.js, where a check can hold it. */
export { CARS, carsFor, carsMaxFor } from "../map/cars.js";
import { CARS, carsFor, carsMaxFor } from "../map/cars.js";

/* THE EDITOR DRIVES THE SAME SCREEN (src/apps/Editor.jsx "drive it"):
   `rawMap`, unloaded, in place of the hardcoded test map, and
   `startAt` for where the player begins on it. With neither, this is
   exactly the call it always was -- testMap1(), the hardcoded START --
   so #/map is untouched. Without an explicit `startAt` on a supplied
   map, the player starts at the first edge `loadMap` finds
   (`map/edges.js` -- a plain module, not this one, so a headless check
   can ask the same question without Node trying to parse JSX). */
export function sceneFor(seed, kmh, every, drive, cars = null, rawMap = null, startAt = null, lookAway = false) {
  const loaded = loadMap(rawMap ?? testMap1());
  if (cars == null) cars = carsFor(loaded);
  if (!loaded.ok) throw new Error(`${rawMap ? "map" : "test map"}: ${loaded.error}`);
  const b = loaded.bounds;
  const start = rawMap ? (startAt ?? firstEdge(loaded) ?? START) : START;
  /* POSTED SPEEDS ON (SIMULATOR.md 1.1.6): every road is driven at the
     limit it posts, so an arterial and a residential street are not the
     same road to drive -- which is the first thing that makes them feel
     different. The `kmh` passed in is then only what sizes the geometry
     (the fastest road's), never what anybody drives at. */
  /* DRIVERS WHO LOOK AWAY (sim/attention.js): everybody glances off the
     road now and then, for as long as their observation lets them, and
     misses what changed meanwhile. Off by default -- it makes crashes,
     which stay where they happened for the player to see. */
  let world = seedGraph(seed, kmh, loaded, { every, target: cars, posted: true, perceive: !!lookAway, walkers: true });
  let me = null;
  if (drive) {
    me = playerOn(world.course, start.road, start.end, { through: !!start.through });   // the curb lane, driving down to the crossroads
    /* A map with no drivable curb leg at its own chosen start -- a
       lone one-way road backwards, say -- refuses cleanly rather than
       pushing a null driver into the world, where every downstream
       reader of `a.player` would throw on it instead. The editor
       catches this and says so; #/map's own hardcoded start can never
       hit it. */
    if (!me) throw new Error("nowhere to start driving from on this map");
    world = withDriver(world, me);
  }
  const ground = groundFor(loaded, { cell: 20 });
  return {
    loaded,
    ground,
    centre: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
    roads: loaded.roads.map((road) => ({ road, cars: [] })),
    terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }),
    junctions: junctionsOf(world.course),
    sidewalks: sidewalksOf(loaded),
    stops: loaded.stops ?? [],
    /* The map's buildings, in the shape drawFrame's stand-in boxes
       already take. The loader has dropped any standing on a road. */
    props: (loaded.props ?? []).map((p) => ({ x: p.at.x, y: p.at.y, heading: p.heading, l: p.l, w: p.w, h: p.h })),
    world, me,
  };
}

/* Where every car is, carried forward by the time since the last
   tick, as poses the renderer draws directly; the player in their own
   colour. */
export function actorsOf(scene, carry) {
  const w = scene.world;
  /* Parked cars first: they are part of the world the traffic drives past
     and the player can hit (sim/parking.js). */
  const out = w.parked ? parkedPoses(w.course, w.parked).slice() : [];   // the cached poses are shared (parking.js): copy before adding
  for (const a of w.actors) {
    if (a.player) {
      const p = driverPose({ ...a, s: a.s + a.v * carry }, w.course);
      /* The player's lamps: the turn tap IS their signal, and the brake lamp follows the car slowing as theirs does. */
      out.push({ id: a.id, n: -1, ...p, colour: "#f4f4f2", player: true, blinker: a.signal ?? null, brakeLamp: (a.a ?? 0) < -0.6 || (a.v ?? 0) < 0.1, honkAt: a.honkAt ?? null, honkTo: a.honkTo ?? null });
      continue;
    }
    const p = poseOf(w, { ...a, s: Math.min(a.s + a.v * carry, w.course.at[a.k].layout.paths[a.route].length) });
    /* A CRASHED car flashes its hazards: orange and dark, twice a second,
       so a wreck is never just another stopped car. */
    const colour = a.crash ? (Math.floor(w.t * 2) % 2 ? "#ff8a1e" : "#5a2a08") : a.colour;
    out.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour, crashed: !!a.crash, kind: a.kind, length: p.length, width: p.width, height: p.height, brakeLamp: !!a.brakeLamp, blinker: a.blinker ?? null, honkAt: a.honkAt ?? null, honkTo: a.honkTo ?? null });
  }
  /* PEOPLE ON FOOT (sim/peds.js): waiting at the curb or crossing. */
  for (const q of w.peds ?? []) out.push({ id: q.id, n: q.look ?? q.n, ...pedPose(w, q), ped: true, struck: q.state === "struck" });
  /* And the people walking along (sim/walkers.js), drawn exactly as the
     ones who cross: nothing tells you which is which until one steps off. */
  for (const q of w.walkers ?? []) out.push({ id: q.id, n: q.look ?? q.n, ...walkerPose(w, q), ped: true });
  return out;
}

/* `initialMode` and `initialFollow` open the screen watching or driving a
   named section (the Test maps screen); given, they win over the mode the
   player last chose, which is a preference for #/map, not for a section
   somebody asked to see. */
export default function MapRoad({ mapData = null, startAt = null, initialMode = null, initialFollow = null } = {}) {
  const canvasRef = useRef(null);
  const [seed, setSeed] = useState(1);
  const [limit, setLimit] = useState(50);
  const [playing, setPlaying] = useState(true);
  const [lookAway, setLookAway] = useState(false);
  const [assist, setAssist] = useState("gentle");   // lane assist (settings.js); the frame loop reads assistRef
  const assistRef = useRef("gentle");
  /* THE FREE CAMERA (iso/freecam.js). Watching, it is the view called
     "free look" and any drag on the map enters it. Driving, the canvas is
     the wheel and the pedal, so it is "Look around": the world pauses and
     the canvas becomes the camera until "Back to the car". */
  const [look, setLook] = useState(false);
  const free = useRef(null);          // { x, y, z, k, rot } while the free camera is on
  const lastView = useRef(null);      // the view as last drawn, where a free camera starts from
  const gesture = useRef({ pointers: new Map(), start: null });
  const [mode, setMode] = useState(initialMode ?? "drive");        // "drive" or "watch"
  const [follow, setFollow] = useState(initialFollow ?? (mapData ? "car" : "crossroads"));   // watch mode: a section of the map to look at, or "car" to ride one
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
  if (!scene.current) scene.current = sceneFor(1, 50, 2.0, (initialMode ?? "drive") === "drive", null, mapData, startAt);
  const [cars, setCars] = useState(scene.current.world.target);
  const mapId = scene.current.loaded.id;
  const carsMax = carsMaxFor(scene.current.loaded);

  const restart = (s = seed, kmh = limit, m = mode, n = cars, look = lookAway) => {
    setSeed(s); setLimit(kmh); setMode(m); setStopped(false); setCars(n); setLookAway(look);
    scene.current = sceneFor(s, kmh, 2.0, m === "drive", n, mapData, startAt, look);
    input.current.state.steer = 0; input.current.state.slider = 0; input.current.state.signal = null;
    cam.current = { ...newChase(), id: null };
    owed.current = 0; contacts.current = 0; flash.current = 0; free.current = null; setLook(false);
  };

  useEffect(() => { setWarnings(scene.current.loaded.warnings); }, []);

  /* What the player chose last time (settings.js), applied once after
     the first render, only where it differs from what shipped. */
  useEffect(() => {
    let live = true;
    loadSettings().then((s) => {
      if (!live) return;
      const kmh = LIMITS.includes(s.limit) ? s.limit : limit;
      const m = initialMode ?? (s.mode === "watch" ? "watch" : "drive");
      /* This map's own saved count; test map 1 also honours the one saved
         before counts were per map. */
      const saved = s.carsByMap?.[mapId] ?? (mapId === "test-1" ? s.cars : undefined);
      const n = Number.isFinite(saved) ? Math.max(CARS.min, Math.min(carsMax, saved)) : cars;
      const look = s.lookAway === true;
      if (kmh !== limit || m !== mode || n !== cars || look !== lookAway) restart(seed, kmh, m, n, look);
      if (s.slider === "spring") input.current.state.spring = true;
      if (s.assist in ASSIST) { assistRef.current = s.assist; setAssist(s.assist); }
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
      if (e.type === "keydown" && !e.repeat && e.key === "h") input.current.horn();
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
      const inp = { steer: input.current.state.steer, slider: input.current.state.slider, assist: ASSIST[assistRef.current] ?? 0 };
      const sc = scene.current;

      /* THE SIM STEPS AT 20 Hz FROM AN ACCUMULATOR. Driving, the player
         is stepped first and written into the world, so this tick's
         traffic sees where they really are. */
      if (playing && !stopped && !(mode === "drive" && look)) {
        owed.current += dt;
        while (owed.current >= DT) {
          owed.current -= DT;
          let w = sc.world;
          if (sc.me) {
            /* THE PLAYER'S HORN: a tap (or h) since the last tick honks, at whoever is holding them up (drive.js). */
            if (input.current.state.horn !== (sc.hornSeen ?? 0)) { sc.hornSeen = input.current.state.horn; sc.me = { ...sc.me, ...playerHonk(sc.me, w) }; }
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
              /* The car the player hit has crashed too -- it stops and is
                 logged -- rather than driving on through them. */
              if (touching(mine, { x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, length: p.length, width: p.width })) { hit = true; w = crashWith(w, a.id, { x: p.x, y: p.y, z: p.z ?? 0 }); sc.world = w; }
            }
            /* A parked car is as solid as a moving one. */
            if (!hit && w.parked && contactWith(w.course, w.parked, mine, touching)) hit = true;
            /* And a person on foot: they fall where they are (sim/peds.js). */
            const struck = hit ? null : pedAt(w, mine);
            if (struck) { hit = true; w = strikePed(w, struck); sc.world = w; }
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
      /* The places are the map's own sections (map/samples.js), not a
         table here. */
      const PLACES = Object.fromEntries((sc.loaded.sections ?? []).map((q) => [q.id, q.look]));
      const lastCrash = sc.world.crashes?.at(-1) ?? null;
      if (lastCrash) PLACES.crash = lastCrash.at;
      let k, rot = 0;
      const freeOn = (mode === "watch" && follow === "free") || (mode === "drive" && look);
      if (freeOn && !free.current && lastView.current) free.current = { ...lastView.current };
      if (freeOn && free.current) {
        cam.current = { ...cam.current, x: free.current.x, y: free.current.y, z: free.current.z ?? 0 };
        k = free.current.k; rot = free.current.rot ?? 0;
      } else if (sc.me) {
        const p = driverPose(sc.me, sc.world.course);
        cam.current = { ...chaseStep(cam.current, { ...p, v: sc.me.v }, dt, { rotate }), id: null };
        k = zoomFor(size.w, size.h, cam.current.lead) * zoom;
        rot = cam.current.rot;
      } else {
        let want = PLACES[follow] ?? { x: sc.centre.x, y: sc.centre.y, z: 0 };
        if (follow === "car") {
          let target = actors.find((a) => a.id === cam.current.id);
          if (!target) { const cars = actors.filter((a) => !a.ped); target = cars[Math.floor(cars.length / 2)] ?? null; cam.current.id = target?.id ?? null; }
          if (target) want = target;
        }
        const f = cam.current.snap ? 1 : 1 - Math.exp(-4 * dt);
        cam.current = { ...cam.current, x: cam.current.x + (want.x - cam.current.x) * f, y: cam.current.y + (want.y - cam.current.y) * f, z: cam.current.z + ((want.z ?? 0) - cam.current.z) * f, rot: 0, snap: false };
        k = Math.max(1, (size.w / (follow === "car" ? 60 : 110)) * zoom);
      }
      lastView.current = { x: cam.current.x, y: cam.current.y, z: cam.current.z ?? 0, k, rot };
      const drew = drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam: cam.current, rot, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t: sc.world.t + carry, lights: sc.world.lights });

      if (now - fpsAt > 1000) {
        const sum = meter.current.summary(120);
        const nCrash = sc.world.crashes?.length ?? 0;
        readout.current = `${sc.world.actors.length} cars on the map · ${drew.cars} in view · ${nCrash ? `${nCrash} crash${nCrash === 1 ? "" : "es"} · ` : ""}${sum.fps} fps · p95 ${sum.p95}ms`;
        fpsAt = now;
      }
      /* A CRASH ANYWHERE IS SAID, for eight seconds, with where it is from
         here -- the screen never lets one happen unseen. */
      if (lastCrash && sc.world.t - lastCrash.t < 8) {
        const from = sc.me ? driverPose(sc.me, sc.world.course) : cam.current;
        const d = Math.round(Math.hypot(lastCrash.at.x - from.x, lastCrash.at.y - from.y));
        ctx.fillStyle = "rgba(20,22,26,0.85)"; ctx.fillRect(size.w / 2 - 130, size.h - 64, 260, 26);
        ctx.fillStyle = "#ff8a1e"; ctx.font = "600 13px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(`Crash ${d < 15 ? "here" : `${d} m away`}${sc.me ? "" : " -- View: the last crash"}`, size.w / 2, size.h - 51);
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
        drawHorn(ctx, size, sc.me?.honkAt != null && sc.world.t - sc.me.honkAt < HONK_FOR);
        drawReadout(ctx, readout.current, 8, size.h - 44);
        if (flash.current > 0) { ctx.fillStyle = `rgba(224,87,79,${0.35 * flash.current})`; ctx.fillRect(0, 0, size.w, size.h); flash.current = Math.max(0, flash.current - dt * 2); }
      } else {
        drawReadout(ctx, readout.current);
      }
      raf.current = requestAnimationFrame(tick);
    };
    tick(performance.now());
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); };
  }, [playing, follow, zoom, seed, limit, mode, stopped, rotate, look]);

  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, { w: r.width, h: r.height }]; };
  const onDown = (e) => { e.currentTarget.setPointerCapture?.(e.pointerId); const [x, y, box] = at(e); input.current.pointer("down", e.pointerId, x, y, box, performance.now()); };
  const onMove = (e) => { const [x, y, box] = at(e); input.current.pointer("move", e.pointerId, x, y, box, performance.now()); };
  const onUp = (e) => { const [x, y, box] = at(e); input.current.pointer("up", e.pointerId, x, y, box, performance.now()); };

  /* THE CAMERA'S GESTURES: one finger drags the ground under it, two pinch
     and pan together, the wheel zooms about the cursor. The same arithmetic
     the checks hold (iso/freecam.js). */
  const freeOn = (mode === "watch" && follow === "free") || (mode === "drive" && look);
  const enterFree = () => { if (!free.current && lastView.current) free.current = { ...lastView.current }; if (mode === "watch" && follow !== "free") setFollow("free"); };
  const camDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const [x, y, box] = at(e), g = gesture.current;
    g.pointers.set(e.pointerId, { x, y });
    g.box = box;
    if (g.pointers.size === 2) { const [a, b] = [...g.pointers.values()]; enterFree(); g.start = { mode: "pinch", a, b, cam: { ...(free.current ?? lastView.current) } }; }
    else if (g.pointers.size === 1) g.start = { mode: "pending", from: { x, y }, last: { x, y } };
  };
  const camMove = (e) => {
    const g = gesture.current;
    if (!g.pointers.has(e.pointerId) || !g.start) return;
    const [x, y, box] = at(e);
    g.pointers.set(e.pointerId, { x, y });
    if (g.start.mode === "pinch" && g.pointers.size >= 2) {
      const [a, b] = [...g.pointers.values()];
      free.current = pinchFree(g.start, box, a, b);
    } else if (g.start.mode !== "pinch") {
      if (g.start.mode === "pending" && !isTap(g.start.from, { x, y })) { enterFree(); g.start.mode = "pan"; }
      if (g.start.mode === "pan" && free.current) { free.current = panFree(free.current, box, g.start.last, { x, y }); g.start.last = { x, y }; }
    }
  };
  const camUp = (e) => {
    const g = gesture.current;
    g.pointers.delete(e.pointerId);
    /* Lifting one finger of a pinch ends it; the other does not become a pan. */
    if (g.pointers.size === 0) g.start = null;
    else if (g.start?.mode === "pinch") g.start = { mode: "done" };
  };
  /* The wheel: native and non-passive, so zooming the map does not scroll
     the page (the editor's rule). */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (e) => {
      if (!(mode === "watch" || look)) return;
      e.preventDefault();
      enterFree();
      const r = canvas.getBoundingClientRect();
      if (free.current) free.current = zoomFree(free.current, { w: r.width, h: r.height }, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, look, follow]);
  const zoomBy = (factor) => {
    if (!freeOn || !free.current) { setZoom((z) => Math.max(0.5, Math.min(4, z * factor))); return; }
    const c = canvasRef.current, box = { w: c?.clientWidth ?? 400, h: c?.clientHeight ?? 700 };
    free.current = zoomFree(free.current, box, box.w / 2, box.h * 0.55, factor);
  };
  /* The whole map in view: its real extent (roads and buildings), not the
     declared bounds a generated map leaves at one chunk. */
  const wholeMap = () => {
    const ext = extentOf(scene.current.loaded), c = canvasRef.current, box = { w: c?.clientWidth ?? 400, h: c?.clientHeight ?? 700 };
    enterFree();
    free.current = { x: ext.x + ext.w / 2, y: ext.y + ext.h / 2, z: 0, k: fitK(ext, box), rot: 0 };
  };

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Stage 1 — the map: drive it, in traffic</span>
        <span style={S.sub}>steer by dragging on the left, the slider on the right is throttle to brake, and a tap in a top corner is the turn signal — indicate before the line and the car takes that corner. No signal means straight on.</span>
      </div>

      <div style={S.view}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
          onPointerDown={mode === "drive" && !look ? onDown : camDown} onPointerMove={mode === "drive" && !look ? onMove : camMove}
          onPointerUp={mode === "drive" && !look ? onUp : camUp} onPointerCancel={mode === "drive" && !look ? onUp : camUp} />
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
          <button className="btn" style={S.btn} onClick={() => zoomBy(1 / 1.25)}><ZoomOut size={16} /></button>
          <button className="btn" style={S.btn} onClick={() => zoomBy(1.25)}><ZoomIn size={16} /></button>
          <button className="btn" style={S.chip} onClick={wholeMap} title="the whole map in view, to pan and zoom from">Whole map</button>
          {mode === "drive" && (
            <button className="btn" style={{ ...S.chip, borderColor: look ? C.amber : "rgba(255,255,255,0.12)", color: look ? C.white : DIM }}
              onClick={() => { if (look) { free.current = null; setLook(false); } else setLook(true); }}>
              {look ? "Back to the car" : "Look around (pauses)"}</button>
          )}
          {[["drive", "you drive"], ["watch", "watch the traffic"]].map(([id, label]) => (
            <button key={id} className="btn" style={{ ...S.chip, borderColor: mode === id ? C.green : "rgba(255,255,255,0.12)", color: mode === id ? C.white : DIM }}
              onClick={() => { setSetting("mode", id); restart(seed, limit, id); }}>{label}</button>
          ))}
          {mode === "watch" && <span style={S.label}>View</span>}
          {mode === "watch" && [...(scene.current.loaded.sections ?? []).map((q) => [q.id, q.name]), ["car", "ride a car"], ["crash", "the last crash"], ["free", "free look"]].map(([id, label]) => (
            <button key={id} className="btn" style={{ ...S.chip, borderColor: follow === id ? C.amber : "rgba(255,255,255,0.12)", color: follow === id ? C.white : DIM }}
              onClick={() => { if (id === "free") { if (!free.current && lastView.current) free.current = { ...lastView.current }; } else { free.current = null; cam.current = { x: 0, y: 0, z: 0, id: null }; } setFollow(id); }}>{label}</button>
          ))}
          {/* LANE ASSIST (sim/player.js assistSteer): off, gentle, firm. Read by the
              frame loop from a ref, never from React state. */}
          {mode === "drive" && (
            <button className="btn" style={{ ...S.chip, borderColor: assist !== "off" ? C.green : "rgba(255,255,255,0.12)", color: assist !== "off" ? C.white : DIM }}
              onClick={() => { const next = { off: "gentle", gentle: "firm", firm: "off" }[assist] ?? "gentle"; assistRef.current = next; setAssist(next); setSetting("assist", next); }}>
              Lane assist: {assist}</button>
          )}
          {/* TEST HORN: the nearest car honks at the player, now -- so the
              badge and its pointer can be seen to render before anybody
              judges when the traffic honks (the maintainer could not tell,
              8 October, whether the horn never fired or was missed). A
              real horn by the sim's own rule: the world is not otherwise
              touched. */}
          {mode === "drive" && (
            <button className="btn" style={S.chip} onClick={() => {
              const sc = scene.current;
              if (!sc?.me) return;
              const me = driverPose(sc.me, sc.world.course);
              let best = null, bd = Infinity;
              for (const a of sc.world.actors) { if (a.player || a.crash) continue; const p = poseOf(sc.world, a); const d = Math.hypot(p.x - me.x, p.y - me.y); if (d < bd) { bd = d; best = a; } }
              if (best) sc.world = { ...sc.world, actors: sc.world.actors.map((a) => (a.id === best.id ? { ...a, honkAt: sc.world.t, honkTo: "player" } : a)) };
            }}>Test horn</button>
          )}
          {mode === "drive" && (
            <button className="btn" style={{ ...S.chip, borderColor: rotate ? C.amber : "rgba(255,255,255,0.12)", color: rotate ? C.white : DIM }}
              onClick={() => setRotate((r) => !r)}>{rotate ? "View turns with the car" : "Fixed view"}</button>
          )}
          {/* LIVE, not a restart: the edges top the map up to the new
              count, or stop adding while cars leave, so moving the dial
              never rebuilds the world under the driver. */}
          <label style={{ ...S.label, display: "inline-flex", alignItems: "center", gap: 8 }}>
            Cars <b style={{ color: C.white, minWidth: 28, textAlign: "right" }}>{cars}</b>
            <input type="range" min={CARS.min} max={carsMax} step={CARS.step} value={cars} style={{ width: 140, fontSize: 16 }}
              onChange={(e) => { const n = Number(e.target.value); setCars(n); setSetting("carsByMap", { ...(settings().carsByMap ?? {}), [mapId]: n }); if (scene.current) scene.current.world = { ...scene.current.world, target: n }; }} />
          </label>
          {/* A restart: a world keeps its drivers' recent past only when they can look away. */}
          <button className="btn" style={{ ...S.chip, borderColor: lookAway ? C.amber : "rgba(255,255,255,0.12)", color: lookAway ? C.white : DIM }}
            onClick={() => { setSetting("lookAway", !lookAway); restart(seed, limit, mode, cars, !lookAway); }}>
            {lookAway ? "Drivers look away: on" : "Drivers look away: off"}</button>
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
