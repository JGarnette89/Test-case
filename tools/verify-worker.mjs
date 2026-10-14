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
   4. The bench's worker (Bench.jsx, "Sim in a worker") builds and steps
      the bench's own world, with sight and the traffic switched as it is.
   ===================================================================== */
import { worldFor, playerContact } from "../src/sim/scene.js";
import { handle, merge, changed } from "../src/sim/remote.js";
import { step, DT } from "../src/sim/crossing.js";
import { stepDriver, withDriver } from "../src/sim/drive.js";
import { testCityReady } from "../src/map/samples.js";
import { benchScene, withOff } from "../src/iso/bench.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const key = (w) => JSON.stringify(w.actors.map((a) => [a.id, a.k, a.route, a.s, a.v, a.crash ? 1 : 0, a.honkAt ?? null])) + JSON.stringify(w.peds ?? []) + JSON.stringify(w.lights ?? null) + w.t;

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
  let same = true, firstDiff = null, hitsS = 0, hitsM = 0, ticks = 0, honked = false;
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
  }
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

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
