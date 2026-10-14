/* =====================================================================
   THE SIM IN A WEB WORKER (SIMULATOR.md 1.2.9, lever 1).

   At 150 cars a frame that steps the sim is step + poses + draw =
   13.6 + 1.6 + 4.2 ms on the phone, over the 16.7 ms budget; off the main
   thread the frame is poses + draw every frame, and the step has a whole
   50 ms tick on another core.

   THE SPLIT. Both sides build the same world from the same arguments
   (sim/scene.js `worldFor`, deterministic), so the course -- 7 MB of
   graph, with functions in it -- never crosses. Each tick the screen
   steps the PLAYER against the world it has (as it always did) and sends
   them; the worker writes them in, steps the world, judges the player's
   contact (`playerContact`), and sends back only the parts of the world
   whose reference changed -- the actors, the lights, the people, the
   clock -- which the screen lays over its own copy. One tick in flight at
   most: the screen never steps the player again until the world that
   answers its last step has arrived, so the order of events is exactly
   the synchronous loop's (`verify-worker` holds the two tick for tick).

   `handle` is the whole protocol and is pure, so it is checked headlessly
   where a Worker cannot run; `sim.worker.js` is the shell around it, and
   `remoteSim` the screen's end. Where a Worker cannot be made -- under
   SSR, or a browser without module workers -- the screen steps in its
   own thread, exactly as before.
   ===================================================================== */
import { step } from "./crossing.js";
import { withDriver } from "./drive.js";
import { worldFor, playerContact } from "./scene.js";
import { benchWorld } from "../iso/benchworld.js";

/* What never changes once the world is built, so is never sent. */
const STATIC = new Set(["course", "layout", "road"]);

/* The parts of `w` whose reference differs from `was` -- what the other side lacks. */
export function changed(w, was) {
  const out = {};
  for (const k of Object.keys(w)) if (!STATIC.has(k) && (!was || w[k] !== was[k])) out[k] = w[k];
  if (was) for (const k of Object.keys(was)) if (!(k in w)) out[k] = undefined;
  return out;
}

/* The screen's copy with the worker's changes laid over it. */
export function merge(w, dyn) {
  const out = { ...w };
  for (const [k, v] of Object.entries(dyn)) { if (v === undefined) delete out[k]; else out[k] = v; }
  return out;
}

/* ONE MESSAGE, ONE STATE: returns the new state and the reply (or null).
     init  {args} | {bench}    -- worldFor(...args), or the bench's world for {fleet, off}; reply the whole world but the course
     step  {me}                -- the player written in (when driving), one tick, their contact
     set   {key, value}        -- a setting on the world (the car count)
     honk  {id, to}            -- a test horn: that car honks at `to` now
   The reply's `seq` is the message's, so the screen knows which step it answers. */
export function handle(state, msg) {
  if (msg.type === "init") {
    const world = msg.bench ? benchWorld(msg.bench.fleet, msg.bench.off) : worldFor(...msg.args).world;
    return { state: { world, sent: world }, reply: { type: "world", seq: msg.seq, dyn: changed(world, null), hit: false } };
  }
  if (!state) return { state, reply: null };
  let w = state.world;
  if (msg.type === "set") { w = { ...w, [msg.key]: msg.value }; return { state: { ...state, world: w }, reply: null }; }
  if (msg.type === "honk") {
    w = { ...w, actors: w.actors.map((a) => (a.id === msg.id ? { ...a, honkAt: w.t, honkTo: msg.to } : a)) };
    return { state: { ...state, world: w }, reply: null };
  }
  if (msg.type === "step") {
    if (msg.me) w = withDriver(w, msg.me);
    w = step(w);
    let hit = false;
    if (msg.me) ({ world: w, hit } = playerContact(w, msg.me));
    return { state: { world: w, sent: w }, reply: { type: "world", seq: msg.seq, dyn: changed(w, state.sent), hit } };
  }
  return { state, reply: null };
}

/* THE SCREEN'S END. `recipe` is { args } for a map (sim/scene.js) or { bench: { fleet, off } }. `onWorld(dyn, hit, seq)` is called with each answer,
   `onError(message)` if the worker throws -- the screen then carries on
   in-thread from its own copy. Null when no Worker can be made. */
export function remoteSim(recipe, onWorld, onError = () => {}) {
  if (typeof Worker === "undefined") return null;
  let worker;
  try { worker = new Worker(new URL("./sim.worker.js", import.meta.url), { type: "module" }); }
  catch { return null; }
  let seq = 0, waiting = 0;
  worker.onmessage = (e) => {
    const r = e.data;
    if (r.type === "error") { worker.terminate(); onError(r.message); return; }
    if (r.seq === waiting) waiting = 0;
    onWorld(r.dyn, r.hit, r.seq);
  };
  worker.onerror = (e) => { worker.terminate(); onError(String(e.message ?? e)); };
  const post = (m) => { worker.postMessage({ ...m, seq: ++seq }); return seq; };
  waiting = post({ type: "init", ...recipe });
  return {
    /* Whether the last step's answer is still out. */
    get busy() { return waiting !== 0; },
    step(me) { waiting = post({ type: "step", me }); },
    set(key, value) { post({ type: "set", key, value }); },
    honk(id, to) { post({ type: "honk", id, to }); },
    stop() { worker.terminate(); },
  };
}
