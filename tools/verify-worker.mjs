/* =====================================================================
   THE SIM IN A WEB WORKER (sim/remote.js): the same world, a thread away.

   1. The protocol is the synchronous loop: the screen's copy, built by
      worldFor and laid over with what the worker sends back, is the world
      the in-thread loop makes -- every actor, every tick, the player's
      contact included -- with the player driven at full throttle into
      whatever is there.
   2. What crosses is data: never the course, the layout or the road, and
      it survives a structured clone (a function in it would throw), and
      the test horn and the car count reach the worker's world exactly as
      the screen used to write them.
   3. How much crosses: bytes and clone time per tick at 150 cars in the
      city, reported.
   5. The motion drawn is smooth: the page's pacing driven headlessly
      against a worker's latency, and the pacing it replaced as the control.
   4. The bench's worker (Bench.jsx, "Sim in a worker") builds and steps
      the bench's own world, with sight and the traffic switched as it is.
   ===================================================================== */
import { worldFor, playerContact } from "../src/sim/scene.js";
import { handle, merge, changed } from "../src/sim/remote.js";
import { step, DT } from "../src/sim/crossing.js";
import { stepDriver, withDriver } from "../src/sim/drive.js";
import { testCityReady } from "../src/map/samples.js";
import { benchScene, withOff } from "../src/iso/bench.js";
import { newPace, paceFrame, paceReply, carryOf, OWED_CAP } from "../src/sim/pace.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const key = (w) => JSON.stringify(w.actors.map((a) => [a.id, a.k, a.route, a.s, a.v, a.crash ? 1 : 0, a.honkAt ?? null])) + JSON.stringify(w.peds ?? []) + JSON.stringify(w.lights ?? null) + w.t;

/* A value as text with every object's keys in order, leaving out `skip` at the top. */
const canon = (v, skip = null) => {
  const top = skip ? Object.fromEntries(Object.entries(v).filter(([q]) => q !== skip)) : v;
  return JSON.stringify(top, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((q) => [q, x[q]])) : x));
};

console.log("\n1. THE SAME WORLD, A THREAD AWAY");
{
  const args = [3, 50, 1.1, true, 120, null, null, false];
  /* In-thread, as MapRoad stepped before the worker. */
  let { world: sw, me: sme } = worldFor(...args);
  /* Through the protocol: the screen's copy and the worker's state. */
  let { world: mw, me: mme } = worldFor(...args);
  let { state, reply } = handle(null, { type: "init", args, seq: 1 });
  mw = merge(mw, structuredClone(reply.dyn));
  const inp = { steer: 0, slider: 1, assist: 0 };   // full throttle, straight on, into whatever is there
  let same = true, firstDiff = null, hitsS = 0, hitsM = 0, ticks = 0, honked = false, fieldsSame = true, fieldDiff = null, fieldChecks = 0;
  for (let n = 0; n < 90 / DT; n++) {
    ticks++;
    /* Half way, the test horn and a new car count, written both ways, before the tick, as the screen sends them. */
    if (n === 600) {
      const id = sw.actors.find((a) => !a.player)?.id;
      sw = { ...sw, target: 90, actors: sw.actors.map((a) => (a.id === id ? { ...a, honkAt: sw.t, honkTo: "player" } : a)) };
      ({ state } = handle(state, { type: "set", key: "target", value: 90 }));
      ({ state } = handle(state, { type: "honk", id, to: "player" }));
      mw = { ...mw, target: 90 };
      honked = true;
    }
    if (!sme.stopped) {
      sme = stepDriver(sme, inp, sw, DT);
      sw = step(withDriver(sw, sme));
      const c = playerContact(sw, sme); sw = c.world; if (c.hit) { hitsS++; sme = { ...sme, stopped: true }; }
    } else sw = step(withDriver(sw, sme));
    if (!mme.stopped) {
      mme = stepDriver(mme, inp, mw, DT);
      ({ state, reply } = handle(state, { type: "step", me: mme, seq: n + 2 }));
      mw = merge(mw, structuredClone(reply.dyn));
      if (reply.hit) { hitsM++; mme = { ...mme, stopped: true }; }
    } else { ({ state, reply } = handle(state, { type: "step", me: mme, seq: n + 2 })); mw = merge(mw, structuredClone(reply.dyn)); }
    if (key(sw) !== key(mw) || key(state.world) !== key(sw)) { same = false; firstDiff = n; break; }
    /* EVERY FIELD, not the key's few: the answer leaves out a driver's
       private memory and re-sends who they are only when they first appear
       (remote.js), so the page's copy must still be the worker's world in
       every other respect -- held every 15 ticks, keys in any order. */
    if (n % 15 === 0) {
      const wk = new Map(state.world.actors.map((a) => [a.id, a]));
      for (const a of mw.actors) {
        const b = wk.get(a.id);
        if (!b || canon(a) !== canon(b, "memo")) { fieldsSame = false; if (!fieldDiff) { const ks = new Set([...Object.keys(a), ...Object.keys(b ?? {})]); ks.delete("memo"); fieldDiff = `tick ${n}, ${a.id}: ${[...ks].filter((q) => JSON.stringify(a[q]) !== JSON.stringify(b?.[q])).map((q) => `${q} ${JSON.stringify(a[q])?.slice(0, 60)} vs ${JSON.stringify(b?.[q])?.slice(0, 60)}`).join("; ")}`; } }
      }
      fieldChecks++;
    }
  }
  check(fieldsSame && fieldChecks > 50, `and field by field: every actor on the screen's copy is the worker's, all but its private memory, at ${fieldChecks} ticks${fieldDiff ? ` -- first differs at ${fieldDiff}` : ""}`);
  check(same, `${ticks} ticks driven both ways, the screen's copy and the worker's world the in-thread world every tick${firstDiff != null ? ` -- first differs at tick ${firstDiff}` : ""}`);
  check(hitsS === hitsM && hitsS > 0, `the player's contact judged the same: ${hitsS} in-thread, ${hitsM} through the worker (full throttle finds something)`);
  check(honked, "the test horn and the car count reached the worker's world as the screen writes them");
}

console.log("\n2. WHAT CROSSES IS DATA");
{
  const { world } = worldFor(1, 50, 1.1, false, 150, testCityReady(), null, false);
  let { state, reply } = handle(null, { type: "init", args: [1, 50, 1.1, false, 150, testCityReady(), null, false], seq: 1 });
  check(!("course" in reply.dyn) && !("layout" in reply.dyn) && !("road" in reply.dyn), "the course, layout and road never cross");
  let cloned = true;
  try { structuredClone(reply.dyn); for (let i = 0; i < 40; i++) { ({ state, reply } = handle(state, { type: "step", me: null, seq: i + 2 })); structuredClone(reply.dyn); } } catch (e) { cloned = false; console.log("   ", e.message); }
  check(cloned, "every message survives a structured clone");
  /* 3. How much. */
  let bytes = 0, ms = 0;
  for (let i = 0; i < 100; i++) {
    ({ state, reply } = handle(state, { type: "step", me: null, seq: i + 50 }));
    const t0 = performance.now(); structuredClone(reply.dyn); ms += performance.now() - t0;
    bytes += JSON.stringify(reply.dyn).length;
  }
  console.log(`\n3. HOW MUCH CROSSES: the city at 150 cars, ${(bytes / 100 / 1024).toFixed(0)} KB a tick as JSON, ${(ms / 100).toFixed(2)} ms to clone on this machine`);
  check(Object.keys(changed(world, world)).length === 0, "a world unchanged sends nothing");
}

console.log("\n4. THE BENCH'S WORKER RUNS THE BENCH'S WORLD");
{
  for (const off of [{}, { sight: true }, { trucks: true }]) {
    const sc = withOff(benchScene(60, off), off);
    let w = sc.world;
    let { state, reply } = handle(null, { type: "init", bench: { fleet: 60, off }, seq: 1 });
    let mw = merge(w, structuredClone(reply.dyn));
    let same = key(mw) === key(w) && !!mw.seeThrough === !!off.sight;
    for (let i = 0; i < 100 && same; i++) {
      w = step(w);
      ({ state, reply } = handle(state, { type: "step", me: null, seq: i + 2 }));
      mw = merge(mw, structuredClone(reply.dyn));
      same = key(mw) === key(w);
    }
    check(same, `switched off ${JSON.stringify(off)}: the worker's world is the page's, 100 ticks`);
  }
}

console.log("\n5. THE MOTION DRAWN IS SMOOTH (sim/pace.js) -- what a frame-time meter cannot see");
{
  /* The page's pacing, driven headlessly: frames at a phone's ragged 60 Hz,
     a worker answering each step after a latency, a car at a steady speed.
     The drawn position is the answered world carried on by `carry`. What is
     measured is the MOTION: each frame's drawn advance against v * dt. A
     frame that draws the car behind where the last one did is a judder,
     whatever the frame cost. THE CONTROL is the pacing this replaced --
     DT taken off at send -- which must judder, or the check sees nothing. */
  const v = 12;
  const run = (scheme, latencyMs, seed) => {
    let r = seed >>> 0 || 1;
    const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const p = newPace();
    let owed = 0, inFlight = false, worldS = 0, t = 0, arriveAt = Infinity, lastDrawn = null, back = 0, worst = 0, frames = 0;
    for (let f = 0; f < 3600; f++) {
      const dt = (rand() < 0.03 ? 33.3 : 16.7 + (rand() - 0.5) * 6) / 1000;
      t += dt;
      /* The answer lands between frames: the world is a tick on. */
      if (t >= arriveAt) { worldS += v * DT; arriveAt = Infinity; if (scheme === "pace") paceReply(p); else inFlight = false; }
      let carry;
      if (scheme === "pace") {
        if (paceFrame(p, dt, true)) arriveAt = t + latencyMs / 1000;
        carry = carryOf(p);
      } else {
        owed = Math.min(owed + dt, OWED_CAP);
        if (!inFlight && owed >= DT) { owed -= DT; inFlight = true; arriveAt = t + latencyMs / 1000; }
        carry = owed;
      }
      const drawn = worldS + v * carry;
      if (lastDrawn != null && f > 60) {
        const d = drawn - lastDrawn;
        if (d < -1e-6) back++;
        worst = Math.max(worst, Math.abs(d - v * dt) / (v * DT));
        frames++;
      }
      lastDrawn = drawn;
    }
    return { back, worst, frames };
  };
  const rows = [];
  for (const L of [3, 15, 35, 70]) {
    const a = run("pace", L, 7 + L), b = run("old", L, 7 + L);
    rows.push({ L, a, b });
    console.log(`    worker answers in ${String(L).padStart(2)} ms: drawn backwards on ${a.back} of ${a.frames} frames (the old pacing ${b.back}), worst frame off steady by ${a.worst.toFixed(2)} of a tick's travel (old ${b.worst.toFixed(2)})`);
  }
  check(rows.every((x) => x.a.back === 0), "with the pacing as shipped no frame draws a car behind where the last frame drew it, at any worker latency up to beyond a tick");
  check(rows.filter((x) => x.L < 50).every((x) => x.a.worst < 0.5), "and while the worker keeps up, no frame's advance is off a steady car's by half a tick's travel -- the bench's frame times would never show the difference");
  check(rows.filter((x) => x.L < 50).every((x) => x.b.back > 100), "THE CONTROL: the pacing it replaced (DT off at send) draws cars backwards on hundreds of frames whenever the worker keeps up -- the stutter seen on the phone (slower than a tick it only slowed)");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
