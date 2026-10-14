/* =====================================================================
   THE BENCH: THE GAME AS IT NOW IS, FOR MEASURING ON THE PHONE.

   The budget ramp on #/iso ran stage 0's two roads with cars and
   stand-in boxes -- no trucks, buses, walkers, people crossing, parked
   cars, buildings, sidewalks or sight blocking -- so the cap it found
   was the ceiling of a scene simpler than the game (the maintainer, 6
   October: "visually the same, no buses or anything newer"). The bench
   is the real thing: the real sim on a map made to hold everything,
   stepped and drawn the way #/map does it.

   One module for the phone (`apps/Bench.jsx`) and the desk
   (`tools/measure/frame-cost.mjs`), so the two measure the same scene.

   Pure. No React, no DOM.
   ===================================================================== */
import { groundFor } from "../map/load.js";
import { step, poseOf, seedGraph } from "../sim/crossing.js";
import { merge } from "../sim/remote.js";
import { newPace, paceFrame, paceReply, carryOf } from "../sim/pace.js";
import { junctionsOf } from "../sim/graph.js";
import { parkedPoses } from "../sim/parking.js";
import { pedPose } from "../sim/peds.js";
import { walkerPose } from "../sim/walkers.js";
import { DT } from "../sim/traffic.js";
import { sidewalksOf } from "../map/sidewalks.js";
import { terrain } from "./road.js";
import { deviceLines, stallLines, HITCH } from "./perf.js";
import { drawFrame } from "./draw.js";

/* The map, what can be switched off and the world for a step: iso/benchworld.js, where the sim's worker can build it too. */
export { BENCH_BRIEF, OFF, benchMap, worldKey, benchWorld } from "./benchworld.js";
import { OFF, benchMap, worldKey, benchWorld } from "./benchworld.js";

/* What only the map decides -- the ground, the sidewalks, the buildings --
   built once per loaded map: on a phone a rebuild per step is seconds. */
const statics = new WeakMap();
function staticsOf(loaded) {
  if (!statics.has(loaded)) {
    const b = loaded.bounds, ground = groundFor(loaded, { cell: 20 });
    statics.set(loaded, {
      ground, centre: downtownOf(loaded),
      roads: loaded.roads.map((road) => ({ road, cars: [] })),
      terrain: terrain({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h, cell: 20, ground }),
      sidewalks: sidewalksOf(loaded), stops: loaded.stops ?? [],
      props: (loaded.props ?? []).map((p) => ({ x: p.at.x, y: p.at.y, heading: p.heading, l: p.l, w: p.w, h: p.h })),
    });
  }
  return statics.get(loaded);
}

/* A world and the scene that draws it, for a fleet of cars and a set
   of things switched off. */
export function benchScene(fleet, off = {}, { shell = false } = {}) {
  const loaded = benchMap({ parking: !off.parked });
  /* Sight is switched by withOff on the base world, so the base has it on.
     With the sim in a worker the worker builds the world, and the page
     holds only a SHELL -- the course, and nobody on it -- until the
     worker's world arrives: building it here too froze the page for the
     whole warm-up, 6-21 s a step on the phone (14 October). */
  const world = shell ? shellOf(loaded) : benchWorld(fleet, { ...off, sight: false });
  const st = staticsOf(loaded);
  return withOff({ loaded, world, base: world, key: worldKey(fleet, off), ...st, junctions: junctionsOf(world.course), full: st }, off);
}

/* An empty world on the map: its course built once per map, the warm-up
   over an empty road -- the page's copy, for the worker's to be laid over. */
const shells = new WeakMap();
function shellOf(loaded) {
  if (!shells.has(loaded)) shells.set(loaded, seedGraph(1, 50, loaded, { every: 2.0, target: 0, posted: true, walkers: false, trucks: 0, buses: 0, pedEvery: Infinity, gapRate: 0 }));
  return shells.get(loaded);
}

/* The switches that need no new world: they RESTART the world the scene
   was built with (`base`), never carry on the one in hand. A bench world
   is not stationary -- people crossing grow from 35 to 73 over its first
   minute and the step from 6.4 to 9.9 ms (tools/scratch/drift.mjs) -- so a
   switch run later in a world's life read as making the sim SLOWER:
   sidewalks -3.3 ms, buildings -4.5, the wide view -5.5 on the phone,
   6 October. The step is pure (it never changes the world it is given),
   so the same object is the same moment, every time.

   Sight blocking is read by the step
   itself (crossing.js `tallNow`) rather than a seed option -- a seed
   option here would be silently ignored, which is how the desk script's
   first "see-through" comparison measured nothing -- and what is drawn. */
export function withOff(sc, off = {}) {
  const { seeThrough, ...rest } = sc.base;
  return {
    ...sc, off,
    world: off.sight ? { ...rest, seeThrough: true } : rest,
    sidewalks: off.sidewalks ? [] : sc.full.sidewalks,
    props: off.buildings ? [] : sc.full.props,
  };
}

/* The middle of downtown, where the people are: the wide view looks
   at it and the camera's first car is the one nearest it. */
function downtownOf(L) {
  const z = (L.zones ?? []).find((q) => q.kind === "commercial");
  if (!z) return { x: L.bounds.x + L.bounds.w / 2, y: L.bounds.y + L.bounds.h / 2, z: 0 };
  const xs = z.polygon.map((p) => p.x), ys = z.polygon.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, z: 0 };
}

/* Advance the world by whatever whole ticks `owed` seconds hold. */
export function benchStep(sc, owed) {
  let n = 0;
  while (owed >= DT) { owed -= DT; sc.world = step(sc.world); n++; }
  return { owed, ticks: n };
}
export { DT };

/* #/map's actorsOf (apps/MapRoad.jsx), without the player -- the same
   poses, carried forward the same way. */
export function benchActors(sc, carry) {
  const w = sc.world;
  const out = w.parked ? parkedPoses(w.course, w.parked).slice() : [];
  for (const a of w.actors) {
    const p = poseOf(w, { ...a, s: Math.min(a.s + a.v * carry, w.course.at[a.k].layout.paths[a.route].length) });
    const colour = a.crash ? (Math.floor(w.t * 2) % 2 ? "#ff8a1e" : "#5a2a08") : a.colour;
    out.push({ id: a.id, n: a.n ?? 0, x: p.x, y: p.y, z: p.z ?? 0, heading: p.rot, colour, crashed: !!a.crash, kind: a.kind, length: p.length, width: p.width, height: p.height, brakeLamp: !!a.brakeLamp, blinker: a.blinker ?? null, honkAt: a.honkAt ?? null, honkTo: a.honkTo ?? null });
  }
  for (const q of w.peds ?? []) out.push({ id: q.id, n: q.look ?? q.n, ...pedPose(w, q), ped: true, struck: q.state === "struck" });
  for (const q of w.walkers ?? []) out.push({ id: q.id, n: q.look ?? q.n, ...walkerPose(w, q), ped: true });
  return out;
}

/* THE CAMERA, as #/map's Watch has it: following a car at street zoom,
   picking another when it leaves (the one nearest downtown first), or
   looking at a place from further out. Eased the way #/map eases. */
export function benchCamera(cam, sc, actors, view, size, dt) {
  let want = sc.centre;
  if (view !== "place") {
    let target = cam.id != null ? actors.find((a) => a.id === cam.id) : null;
    if (!target) {
      let best = Infinity;
      for (const a of actors) {
        if (a.ped || String(a.id).startsWith("parked-")) continue;
        const d = Math.hypot(a.x - sc.centre.x, a.y - sc.centre.y);
        if (d < best) { best = d; target = a; }
      }
      cam = { ...cam, id: target?.id ?? null, snap: true };
    }
    if (target) want = target;
  }
  const f = cam.snap ? 1 : 1 - Math.exp(-4 * dt);
  const x = (cam.x ?? want.x), y = (cam.y ?? want.y), z = (cam.z ?? 0);
  const next = { ...cam, x: x + (want.x - x) * f, y: y + (want.y - y) * f, z: z + ((want.z ?? 0) - z) * f, snap: false };
  const k = Math.max(1, size.w / (view === "place" ? 110 : 60));
  return { cam: next, k };
}

/* What the world holds right now, by kind -- the report's proof that
   each thing is there, and that each switch took it away. */
export function benchCounts(sc) {
  const w = sc.world;
  let trucks = 0, buses = 0;
  for (const a of w.actors) { if (a.kind === "truck") trucks++; else if (a.kind === "bus") buses++; }
  return {
    moving: w.actors.length, trucks, buses,
    walkers: (w.walkers ?? []).length, crossing: (w.peds ?? []).length,
    parked: Object.keys(w.parked ?? {}).length,
    buildings: sc.props.length, sidewalks: sc.sidewalks.length,
    sight: w.seeThrough ? "off" : "on",
  };
}

/* THE LOAD WINDOW. A step that builds a new world settles for this long
   before it records, and anything over the hitch line in that time is
   reported as a LOAD-TIME hitch rather than failing the play budget
   (perf.js `loadHitches`). The maintainer's question, 6 October: one
   hitch on every step that rebuilt, 3.9 to 5.8 s after the build, our
   own callback 6-30 ms of a 67-133 ms frame and no long task seen -- is
   that something a player meets once, when a map opens, or in play?
   A CHOSEN number, flagged: past the latest load hitch the phone has
   shown. The soak step and every built step's recorded play are what
   would show a play-time hitch it had wrongly swallowed. */
export const LOAD_WINDOW = 8;

/* Which steps build a new world, from the order they run in, and the
   load window for those. `prevKey`: the world before the first. */
function withLoad(steps, prevKey = null) {
  let prev = prevKey;
  return steps.map((st) => {
    const key = worldKey(st.fleet, st.off ?? {}), builds = key !== prev;
    prev = key;
    return builds ? { ...st, builds: true, settle: LOAD_WINDOW } : { ...st, builds: false };
  });
}

/* THE RAMP: the whole game at more and more cars, street zoom, until a
   step's steady state fails. The first step is the DOM probe, the
   positive control (perf.js). */
export function benchSteps() {
  return withLoad([
    { fleet: 50, probe: true, label: "1 (DOM probe)" },
    ...[50, 100, 150, 200, 250, 300, 400].map((fleet) => ({ fleet, label: String(fleet) })),
  ]);
}

/* THE SPLIT: at a load the device held, the same scene with each kind
   of thing switched off in turn, and once from further out. Every step
   is run, pass or fail -- the differences are the point. The switches
   that keep the world come first, so they ride the baseline's world
   and only the five that change the traffic build one. */
const KEEPS_WORLD = ["sight", "sidewalks", "buildings"];
export function categorySteps(fleet) {
  const no = (key) => ({ fleet, label: `no ${key}`, off: { [key]: true }, without: key });
  return withLoad([
    { fleet, label: "everything", off: {} },
    ...KEEPS_WORLD.map(no),
    { fleet, label: "wide view", off: {}, view: "place" },
    ...Object.keys(OFF).filter((k) => !KEEPS_WORLD.includes(k)).map(no),
    /* THE SOAK: the cap's city, built fresh, then half a minute of play
       with construction well behind it. A hitch here is a play-time
       hitch, whatever the load window says. */
    { fleet, label: "soak", off: {}, hold: SOAK },
  ]);
}
export const SOAK = 30;

/* THE TWO CONTROLS, which answer different questions. Can this run see a
   hitch at all: stalls made on purpose, every one of which must be seen.
   Does a React update from the frame loop cost anything on this device:
   updates issued, and the frames they land on against the rest -- a
   number whether or not anything crosses the hitch line. */
export function controlLines(probe) {
  const c = probe.control ?? {};
  const lines = [];
  lines.push(c.injected
    ? `control 1, can this run see a hitch: ${c.injected} stalls of 80 ms made on purpose, ${c.injectedSeen} seen over ${HITCH} ms -- ${c.injectedSeen === c.injected ? "every one, so the hitch counts can be believed" : "NOT every one: the hitch counts in this report cannot be believed"}`
    : "control 1, can this run see a hitch: NO stalls were made -- the probe step did not run its control, so the hitch counts cannot be believed");
  lines.push(c.issued
    ? `control 2, does a React update from the loop cost here: ${c.issued} updates issued; the frames they land on ${c.domMean} ms on average (worst ${c.domMax}) against ${c.restMean} ms for the rest`
    : "control 2, does a React update from the loop cost here: NO updates were issued -- the probe did not run");
  return lines;
}

/* THE REPORT. The ramp with what the world held at each step, so the
   numbers are visibly for the whole game; where each frame's time went
   (the sim step, the poses, the draw); the stalls and the probe; the
   cap; and the split -- what each kind of thing costs at the cap, on the
   sim side and the draw side, beside the count proving it was gone. */
export function benchReport({ device, canvas, ramp, split, loaded }) {
  const L = deviceLines(device, canvas, "bench report");
  const pad = (x, n) => String(x ?? "-").padStart(n);
  const part = (r, key) => (r.split?.[key] ? `${r.split[key].p50}/${r.split[key].p95}` : "-");
  L.push(`scene: the bench map (src/iso/bench.js BENCH_BRIEF) -- ${loaded.roads.length} roads, ${loaded.props.length} buildings, ${(loaded.stops ?? []).length} bus stops, ${loaded.laneKm.toFixed(0)} lane-km; watching a car at #/map's street zoom`);
  L.push("");
  L.push("THE RAMP: the whole game, more cars each step");
  const head = "step           fleet  trucks buses walking crossing parked  drawn things  back  fps  p50   p95   worst hitch stall slow-s gc(ms)     step p50/p95  poses p50/p95  draw p50/p95  build-s load-h  steady pass";
  const row = (r) => `${String(r.label).padEnd(14)} ${pad(r.fleet, 5)}  ${pad(r.trucks, 6)} ${pad(r.buses, 5)} ${pad(r.walkers, 7)} ${pad(r.crossing, 8)} ${pad(r.parked, 6)}  ${pad(r.cars, 5)} ${pad(r.items, 6)}  ${pad(r.back, 4)}  ${pad(r.fps, 3)}  ${pad(r.p50, 4)}  ${pad(r.p95, 4)}  ${pad(r.worst, 5)} ${pad(r.hitches, 5)} ${pad(r.stalls, 5)} ${pad(r.slowSeconds, 6)} ${pad(`${r.gcFrames ?? 0}(${r.gcMeanMs ?? 0})`, 8)}  ${pad(part(r, "step"), 12)}  ${pad(part(r, "poses"), 13)}  ${pad(part(r, "draw"), 12)}  ${pad(r.buildS, 7)} ${pad(r.builds ? (r.loadHitches ?? []).length : "-", 6)}  ${r.steady ? "yes" : "NO "}    ${r.pass ? "yes" : "NO"}${r.invalid ? "  INVALID (page hidden)" : ""}`;
  L.push(head);
  for (const r of ramp.results) L.push(row(r));
  L.push("  back = frames that drew the world at an earlier moment than the frame before -- cars jumping backwards, a stutter no frame time shows; it must be 0");
  L.push("  step = the sim step, on the frames that ran one (a third of them at 60 fps); poses and draw every frame; ms, median/95th");
  L.push(`  hitch, worst, p95, pass: PLAY only. A step that built a new world settles ${LOAD_WINDOW} s first, and load-h is the hitches in that time (- where nothing was built)`);
  L.push(...stallLines([...ramp.results, ...(split?.results ?? [])]));
  const probe = ramp.results.find((x) => x.probe);
  if (probe) L.push(...controlLines(probe));
  const cap = ramp.cap, steady = ramp.steadyCap;
  /* A CAP IS THE LAST STEP THAT HELD BEFORE THE FIRST THAT DID NOT. A
     hitch fails a step without ending the ramp, so a later step can pass
     again, and "the last step that passed" read "held at 400, broke at
     150" -- a cap above the break. */
  const capBy = (holds) => {
    let held = null;
    for (const r of ramp.results.filter((x) => !x.probe && !x.invalid)) { if (holds(r)) held = r; else return { held, broke: r }; }
    return { held, broke: null };
  };
  const capLine = (what, { held, broke }) => (held ? `${what}: held at ${held.fleet} cars with everything in (step ${held.label}); broke at step ${broke?.label ?? "-"}` : `${what}: the budget did not hold at any step`);
  L.push(capLine("cap (budget, no hitching in play)", capBy((r) => r.pass)));
  L.push(capLine("cap (budget, load-time hitches counted too)", capBy((r) => r.pass && !(r.loadHitches ?? []).length)));
  L.push(steady ? `cap (steady state, stutter set aside): held at ${steady.fleet} cars (step ${steady.label}); broke at step ${steady.brokeAt ?? "-"}` : "cap (steady state): did not hold at any step");
  const loads = [...ramp.results, ...(split?.results ?? [])].flatMap((r) => (r.loadHitches ?? []).map((h) => ({ step: r.label, ...h })));
  L.push(loads.length ? "load-time hitches: frames over the hitch line in a step's load window, seconds since the step began (the frame after the build)" : "load-time hitches: none");
  for (const h of loads) L.push(`  ${String(h.step).padEnd(14)} ${String(h.since.toFixed(2)).padStart(6)} s  ${String(h.dt).padStart(5)} ms  ours ${h.tickMs ?? "?"} ms  tasks ${h.tasks ?? "?"} ms  gc ${h.gc ? "yes" : "no"}`);
  /* A step the page was hidden during: restarted, or past that INVALID (perf.js HIDDEN_RESTARTS). */
  for (const r of [...ramp.results, ...(split?.results ?? [])]) {
    if (r.invalid) L.push(`step ${r.label}: INVALID -- the page went hidden (screen off or app switched) ${r.restarts + 1} times; a hidden page gets no frames, so its numbers are the gap, not the game, and it counts for no cap`);
    else if (r.restarts) L.push(`step ${r.label}: restarted ${r.restarts} time${r.restarts > 1 ? "s" : ""} after the page went hidden; its numbers are from a visible run`);
  }
  const soak = split?.results?.find((r) => r.label === "soak");
  if (soak?.invalid) L.push(`soak: INVALID -- the page went hidden; no verdict on play at ${soak.fleet} cars`);
  else if (soak) L.push(`soak: ${soak.hold ?? SOAK} s of play at ${soak.fleet} cars after a ${soak.settle ?? LOAD_WINDOW} s load window -- ${soak.hitches} hitches in play, ${(soak.loadHitches ?? []).length} in the load window; worst frame in play ${soak.worst} ms, p95 ${soak.p95}${soak.hitches ? " -- A PLAY-TIME HITCH: the cap is not clean" : ""}`);
  if (split?.results?.length) {
    const all = split.results.find((r) => r.label === "everything") ?? split.results[0];
    L.push("");
    L.push(`WHERE THE BUDGET GOES, at ${all.fleet} cars: each kind of thing switched off in turn, and what that saved`);
    L.push("without                 count gone        fps  p95   worst hitch  step p50 (saved)   draw p50 (saved)   things");
    const ms = (r, key) => r.split?.[key]?.p50 ?? 0;
    const COUNT = { trucks: "trucks", buses: "buses", walkers: "walkers", crossers: "crossing", parked: "parked", sight: "sight", sidewalks: "sidewalks", buildings: "buildings" };
    for (const r of split.results) {
      const key = r.without, c = key ? COUNT[key] : null;
      const gone = c ? `${all[c]} -> ${r[c]}` : r.label === "wide view" ? "(further out)" : r.label === "soak" ? `(${r.hold ?? SOAK} s of play)` : "(baseline)";
      const saved = (k) => (r === all ? "" : ` (${(ms(all, k) - ms(r, k)).toFixed(1)})`);
      L.push(`${(key ? OFF[key] : r.label).slice(0, 22).padEnd(22)}  ${gone.padEnd(16)}  ${pad(r.fps, 3)}  ${pad(r.p95, 4)}  ${pad(r.worst, 5)} ${pad(r.hitches, 5)}  ${pad(`${ms(r, "step")}${saved("step")}`, 16)}   ${pad(`${ms(r, "draw")}${saved("draw")}`, 16)}   ${pad(r.items, 6)}${r.invalid ? "  INVALID (page hidden)" : ""}`);
    }
    L.push("  a switch whose count did not go to its 'off' value did nothing, and its row says nothing");
  }
  return L.join("\n");
}

/* THE BENCH'S STATE AND ITS FRAME, shared by the screen and the checks:
   the screen owns only the canvas, the animation frames and React. */
/* `makeRemote(recipe, onWorld)`, when given, runs the sim in a worker
   (sim/remote.js `remoteSim`); the screen passes it, the checks do not. */
export function benchState(step = { fleet: 50, off: {} }, makeRemote = null) {
  const st = { sc: null, owed: 0, cam: {}, view: "car", counts: null, frames: 0, buildS: 0, makeRemote, remote: null, mergeMs: 0, merged: 0 };
  return loadStep(st, step);
}

/* A WORKER FOR THIS STEP'S WORLD: the same recipe the page's world came
   from, so the worker's world is the page's (verify-worker); every load
   starts it afresh, as the page's own world is restarted. What the main
   thread still spends on the sim is laying the answer over its copy --
   timed, and reported as the step. */
function restartRemote(st, step, same) {
  if (!st.makeRemote) return;
  st.remoteReady = false; st.mergeMs = 0; st.merged = 0; st.pace = newPace();
  /* THE SAME WORLD, SEEN DIFFERENTLY: the worker goes back to the world it
     built, sight switched -- never a rebuild, which on the phone is seconds
     with nothing moving. */
  if (same && st.remote) { st.remote.rewind(step.off ?? {}); return; }
  st.remote?.stop();
  st.remote = st.makeRemote({ bench: { fleet: step.fleet, off: step.off ?? {} } }, (dyn, hit, seq, fresh) => {
    if (!st.sc) return;
    const t0 = clock();
    st.sc.world = merge(st.sc.world, dyn);
    if (fresh) st.remoteReady = true;
    else { st.mergeMs += clock() - t0; st.merged++; paceReply(st.pace); }
  });
}

/* Move to a step: a new world only when the fleet or the traffic's make-up
   changed; sight and what is drawn are switched on the world in hand. */
export function loadStep(st, step) {
  const off = step.off ?? {};
  const same = !!(st.sc && st.sc.key === worldKey(step.fleet, off));
  if (same) {
    st.sc = withOff(st.sc, off);
    st.buildS = 0;
    st.cam = {}; st.owed = 0; st.frames = 0; st.lastDrawnT = null;   // the same moment, seen the same way
  } else {
    const t0 = clock();
    st.sc = benchScene(step.fleet, off, { shell: !!st.makeRemote });
    st.buildS = Math.round((clock() - t0) / 100) / 10;
    st.cam = {}; st.owed = 0; st.frames = 0; st.lastDrawnT = null;
  }
  st.view = step.view ?? "car";
  st.counts = benchCounts(st.sc);
  restartRemote(st, step, same);
  return st;
}

const clock = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/* One frame: the sim's owed ticks, the poses, the camera, the draw --
   each timed, the way #/map runs them. */
export function benchFrame(st, dtMs, ctx, size) {
  const t0 = clock();
  let r, stepMs = null;
  /* WAITING FOR THE WORKER'S WORLD: nothing is stepped and the ramp's
     clock is held (perf.js `loading`), so no step is measured over a
     world standing still -- which the 14 October report was, at 300 and
     400 cars, for most of its hold. */
  const loading = !!st.remote && !st.remoteReady;
  if (loading) {
    r = { ticks: 0 }; stepMs = 0;
  } else if (st.remote) {
    /* One tick in flight, owed time held to two ticks, the clock down when
       the answer arrives -- as #/map does it (sim/pace.js). */
    if (paceFrame(st.pace, Math.min(0.25, dtMs / 1000), st.remoteReady && !st.remote.busy)) st.remote.step(null);
    st.owed = carryOf(st.pace);
    r = { ticks: st.merged }; stepMs = st.mergeMs;
    st.merged = 0; st.mergeMs = 0;
  } else {
    r = benchStep(st.sc, st.owed + Math.min(0.25, dtMs / 1000));
    st.owed = r.owed;
  }
  const t1 = clock();
  /* THE MOTION, not the cost: the moment this frame draws the world at.
     It must never be earlier than the last frame's, or every car is drawn
     behind where it just was -- the worker's stutter of 13-14 October,
     which cost nothing and so showed in no frame time (sim/pace.js). */
  const drawnT = st.sc.world.t + st.owed;
  const back = st.lastDrawnT != null && drawnT < st.lastDrawnT - 1e-9;
  st.lastDrawnT = drawnT;
  const actors = benchActors(st.sc, st.owed);
  const t2 = clock();
  const { cam, k } = benchCamera(st.cam, st.sc, actors, st.view, size, dtMs / 1000);
  st.cam = cam;
  const sc = st.sc;
  const drew = drawFrame(ctx, size, { roads: sc.roads, terrain: sc.terrain, cam, rot: 0, k, tilt: false, actors, groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t: sc.world.t + st.owed, lights: sc.world.lights });
  const t3 = clock();
  /* The counts walk every parked car: twice a second, not every frame. */
  if (++st.frames % 30 === 0) st.counts = benchCounts(sc);
  /* A frame that ran no tick spent no time on the sim: zero, so it is not counted as a step. */
  if (loading && ctx.fillText) {
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, size.h / 2 - 22, size.w, 44);
    ctx.fillStyle = "#fff"; ctx.font = "15px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("building the world in the worker -- not measured", size.w / 2, size.h / 2 + 5); ctx.restore();
  }
  return { loading, back, drew: { ...drew, extra: { ...st.counts, buildS: st.buildS } }, split: { step: r.ticks ? stepMs ?? t1 - t0 : 0, poses: t2 - t1, draw: t3 - t2 }, ticks: r.ticks };
}
