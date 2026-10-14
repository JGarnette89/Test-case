/* THE BENCH MEASURES THE GAME AS IT IS (src/iso/bench.js, #/bench).

   The budget ramp before it ran stage 0's two roads with cars and boxes,
   so its cap was the ceiling of a scene simpler than the game, and
   nothing said so (6 October). This drives the bench's own frame --
   the one the phone runs -- through the ramp and the category split on
   a synthetic clock, on a canvas that only counts, and holds it to:

   1. every step of the ramp is the whole game: trucks, buses, people
      walking and crossing, parked cars, buildings, sidewalks, sight on;
   2. each switch in the split takes away its own thing and leaves the
      rest -- a switch that silently does nothing is how the desk
      script's first "see-through" row measured nothing;
   3. the split runs every step whatever it finds, the ramp stops at a
      steady failure, and only the steps that change the traffic build
      a new world;
   4. the controls: every stall made on purpose is seen, and the React
      updates are counted, so a run that cannot see a hitch says so;
   5. every frame says where its time went, and the report renders;
   7. what other drivers are about to do is drawn -- brake lamps, turn
      signals -- and every signal's stop line in the light its lane obeys;
   6. a load is not play: a long frame in the window after a world is
      built is reported as a load-time hitch and does not fail the play
      budget, one in play does, and the split ends with a soak.

   Usage: node tools/verify-bench.mjs */
import { budgetRamp } from "../src/iso/perf.js";
import { benchState, loadStep, benchFrame, benchSteps, categorySteps, benchReport, controlLines, OFF, LOAD_WINDOW, SOAK, benchScene, benchStep, benchActors, benchMap } from "../src/iso/bench.js";
import { handle } from "../src/sim/remote.js";
import { drawFrame } from "../src/iso/draw.js";
import { movementLight } from "../src/sim/signal.js";

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? " ok " : " FAIL"} ${msg}`); if (!c) failed++; };
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 412, h: 560 };

/* Drive a ramp to its end on a synthetic clock: `dtFor(step, k)` is the
   frame time to pretend, k frames after the step's world was loaded, so
   pass, fail and a hitch at a chosen moment can be steered. The load
   window and the soak are shortened to keep the check quick; which
   steps carry them is the bench's own. */
function run(steps, { stopOnFail = true, dtFor = () => 16.7 } = {}) {
  const short = steps.map((x) => ({ ...x, ...(x.settle != null ? { settle: 0.5 } : {}), ...(x.hold != null ? { hold: 1 } : {}) }));
  const ramp = budgetRamp({ steps: short, settle: 0.2, hold: 0.6, stopOnFail });
  let st = null, now = 0, out = null, builds = [], stall = false, issued = false, k = 0;
  for (let f = 0; f < 200000 && !out; f++, k++) {
    const step = ramp.step;
    /* The screen's controls in the probe step: a React update every 60
       frames, and an 80 ms stall every 120 (denser here), which lengthens the gap the
       NEXT frame closes -- exactly as Bench.jsx makes them. */
    const dt = dtFor(step ?? {}, k) + (stall ? 80 : 0);
    now += dt;
    let fr = null;
    if (st) fr = benchFrame(st, dt, ctx, size);
    const want = ramp.frame(now, fr?.drew, { split: fr?.split, injected: stall, issued, dom: issued });
    stall = !!step?.probe && f % 12 === 5; issued = !!step?.probe && f % 6 === 0;   // denser than the screen: the check holds a step for well under a second
    if (want.done) out = want;
    else if (want.load) { st = st ? loadStep(st, want.load) : benchState(want.load); builds.push({ label: want.load.label, built: st.buildS > 0 }); k = 0; }
  }
  return { ...out, builds };
}

console.log("1. the ramp is the whole game at every step");
/* Two planted long frames: one ten frames after step 100's world is
   built -- inside its load window -- and one sixty frames into step 150,
   in play. */
const ramp = run(benchSteps(), { dtFor: (s, k) => (s.label === "100" && k === 10 ? 120 : s.label === "150" && k === 60 ? 120 : 16.7) });
ok(ramp.results.length === benchSteps().length, `every step ran (${ramp.results.length} of ${benchSteps().length}) on a clock that never fails`);
for (const r of ramp.results) {
  const have = r.trucks > 0 && r.buses > 0 && r.walkers > 0 && r.crossing > 0 && r.parked > 0 && r.buildings > 0 && r.sidewalks > 0 && r.sight === "on";
  ok(have, `${r.label.padEnd(14)} ${r.moving} moving, ${r.trucks} trucks, ${r.buses} buses, ${r.walkers} walking, ${r.crossing} crossing, ${r.parked} parked, ${r.buildings} buildings, ${r.sidewalks} sidewalks, sight ${r.sight}; ${r.cars} drawn`);
}
const fleets = ramp.results.filter((r) => !r.probe).map((r) => r.moving);
ok(fleets.every((x, i) => i === 0 || x >= fleets[i - 1]), `the fleet grows step by step (${fleets.join(", ")} moving)`);
ok(ramp.results.find((r) => r.probe)?.probe === true, "the first step is the DOM probe");

console.log("\n2. each switch takes away its own thing and leaves the rest");
const split = run(categorySteps(100), { stopOnFail: false });
const base = split.results.find((r) => r.label === "everything");
const COUNT = { trucks: "trucks", buses: "buses", walkers: "walkers", crossers: "crossing", parked: "parked", sidewalks: "sidewalks", buildings: "buildings" };
for (const key of Object.keys(OFF)) {
  const r = split.results.find((x) => x.without === key);
  if (key === "sight") { ok(r.sight === "off" && base.sight === "on", `no sight: trucks see-through on the world the step reads (${base.sight} -> ${r.sight})`); continue; }
  const c = COUNT[key];
  const others = Object.values(COUNT).filter((x) => x !== c && !(c === "walkers" && x === "crossing") && !(c === "crossing" && x === "walkers"));
  ok(base[c] > 0 && r[c] === 0, `no ${key}: ${c} ${base[c]} -> ${r[c]}`);
  ok(others.every((x) => r[x] > 0), `   and everything else is still there (${others.map((x) => `${x} ${r[x]}`).join(", ")})`);
}
/* What is only DRAWN cannot change the sim: a step that switches off only
   drawing, or looks from further out, starts from the baseline's own world
   at the same moment and must end it identically. A step that carried the
   baseline's world on instead ran later in a world that grows busier, and
   on the phone read as drawing making the sim slower (6 October). */
const same = (r) => ["moving", "trucks", "buses", "walkers", "crossing", "parked"].every((k) => r[k] === base[k]);
for (const label of ["no sidewalks", "no buildings", "wide view"]) {
  const r = split.results.find((x) => x.label === label);
  ok(same(r), `${label}: the sim ends exactly where the baseline's did (${r.crossing} crossing, ${r.walkers} walking, ${r.moving} moving against ${base.crossing}, ${base.walkers}, ${base.moving})`);
}
const wide = split.results.find((r) => r.label === "wide view");
ok(wide.cars > base.cars, `the wide view draws more of the city (${base.cars} -> ${wide.cars} road users on screen)`);

console.log("\n3. the split runs every step; the ramp stops; a world is built only when the traffic changes");
ok(split.results.length === categorySteps(100).length, `the split ran all ${split.results.length} steps`);
const failing = run(categorySteps(50), { stopOnFail: false, dtFor: (s) => (s.label === "no trucks" ? 40 : 16.7) });
ok(failing.results.length === categorySteps(50).length && failing.results.some((r) => !r.steady), `with one step failing the split still ran all ${failing.results.length}`);
const stopped = run(benchSteps(), { dtFor: (s) => (s.fleet >= 150 ? 40 : 16.7) });
ok(stopped.results.at(-1)?.fleet === 150 && !stopped.results.at(-1).steady, `the ramp stops at its first unsteady step (${stopped.results.at(-1)?.label}), and the steady cap is the step before (${stopped.steadyCap?.label})`);
const rebuilt = split.builds.filter((b) => b.built).map((b) => b.label);
const want = ["everything", "no trucks", "no buses", "no walkers", "no crossers", "no parked", "soak"];   // the five that change the traffic, the baseline, and the soak's fresh city
ok(rebuilt.length === want.length && want.every((x) => rebuilt.includes(x)), `new worlds only for: ${rebuilt.join(", ")}`);

console.log("\n4. the controls: every stall made on purpose is seen, and the React updates are counted");
const pc = ramp.results.find((r) => r.probe).control;
ok(pc.injected > 0 && pc.injectedSeen === pc.injected, `control 1: ${pc.injected} stalls made, ${pc.injectedSeen} seen`);
ok(pc.issued > 0 && pc.domMean != null && pc.restMean != null, `control 2: ${pc.issued} updates issued, their frames ${pc.domMean} ms against ${pc.restMean}`);
ok(ramp.results.filter((r) => !r.probe).every((r) => r.control.injected === 0 && r.control.issued === 0), "and no other step makes either");
ok(/every one, so the hitch counts can be believed/.test(controlLines(ramp.results[0]).join(" ")), "the report says the hitch counts can be believed");
ok(/cannot be believed/.test(controlLines({ control: { injected: 4, injectedSeen: 3, issued: 8, domMean: 17, domMax: 20, restMean: 17 } }).join(" ")) && /cannot be believed/.test(controlLines({ control: {} }).join(" ")), "and says they cannot when a stall was missed, or none was made");

console.log("\n5. every frame says where its time went, and the report renders");
ok(ramp.results.every((r) => r.split?.step?.p50 > 0 && r.split?.draw?.p50 > 0 && r.split?.poses?.p50 > 0), "sim step, poses and draw timed at every step");
ok(ramp.results.every((r) => r.split.step.share > 15 && r.split.step.share < 50), `the sim steps on about a third of the frames (${ramp.results.map((r) => r.split.step.share).join(", ")}%)`);
const text = benchReport({ device: { ua: "test", cores: 8, memoryGB: 8, secure: true, dpr: 3, screen: "1x1", viewport: "1x1" }, canvas: "412x560", ramp, split, loaded: ramp.results.length ? (await import("../src/iso/bench.js")).benchMap() : null });
ok(/THE RAMP/.test(text) && /WHERE THE BUDGET GOES/.test(text) && benchSteps().every((s) => text.includes(s.label)), "the report has the ramp, every step, and the split");
ok(Object.values(OFF).every((label) => text.includes(label.slice(0, 22))), "the split names every switch");
console.log("\n6. a load is not play: hitches in a step's load window are reported apart, and do not fail the play budget");
const r100 = ramp.results.find((r) => r.label === "100"), r150 = ramp.results.find((r) => r.label === "150");
ok(r100.builds && r100.loadHitches.length === 1 && r100.hitches === 0 && r100.pass, `step 100 built a world: its long frame in the load window is a load-time hitch (${r100.loadHitches.length}), not a play hitch (${r100.hitches}), and the step passes`);
ok(r150.loadHitches.length === 0 && r150.hitches === 1 && !r150.pass, `step 150's long frame in play is a play hitch (${r150.hitches}) and fails the budget`);
ok(/no hitching in play\): held at 100 cars .*broke at step 150/.test(text) && /load-time hitches counted too\): held at 50 cars .*broke at step 100/.test(text), "the play cap is 100, broken at 150 -- never a later step that passed again; counted with load-time hitches it would be 50, broken at 100");
ok(/load-time hitches: frames over/.test(text) && /^  100 /m.test(text), "the report lists the load-time hitch under its step");
ok(benchSteps().filter((x) => x.builds).every((x) => x.settle === LOAD_WINDOW) && benchSteps().filter((x) => !x.builds).every((x) => x.settle == null), `every step that builds a world, and only those, has the ${LOAD_WINDOW} s load window`);
const soak = split.results.find((r) => r.label === "soak");
ok(soak && categorySteps(100).at(-1).hold === SOAK && soak.builds, `the split ends with a soak: a fresh city, then ${SOAK} s of play (shortened here)`);
ok(/^soak: /m.test(text), "and the report says what the soak found");

console.log("\n" + text.split("\n").slice(4).join("\n"));


console.log("\n7. what other drivers are about to do is drawn: brake lamps, turn signals, and every signal's line in its light");
{
  /* A canvas that remembers every colour it was handed. */
  const seen = new Map();
  const tally = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { if (p === "fillStyle" || p === "strokeStyle") seen.set(v, (seen.get(v) ?? 0) + 1); t[p] = v; return true; } });
  const sc = benchScene(100, {});
  benchStep(sc, 30);
  const sigs = sc.junctions.filter((j) => j.signal);
  const LIT = { red: "#ff3b30", amber: "#ffa600", green: "#2fd468" };   // draw.js LINE_LIT
  const lampSeen = new Map();
  let lineMatch = 0, lineAll = 0;
  for (const j of sigs) for (const dt of [0, 0.34]) {
    const t = sc.world.t + dt;
    seen.clear();
    drawFrame(tally, size, { roads: sc.roads, terrain: sc.terrain, cam: { x: j.at.x, y: j.at.y, z: 0 }, rot: 0, k: 8, tilt: false, actors: benchActors(sc, 0), groundAt: sc.ground, junctions: sc.junctions, sidewalks: sc.sidewalks, stops: sc.stops, props: sc.props, t });
    /* Every signal line at this node drew in the light its lane obeys. */
    for (const l of j.lines.filter((x) => x.kind === "signal")) {
      lineAll++;
      const want = LIT[movementLight(j.signal, l.base, l.intent, t) ?? "red"];
      if (seen.has(want)) lineMatch++;
    }
    for (const [c, n] of seen) lampSeen.set(c, (lampSeen.get(c) ?? 0) + n);
  }
  const cars = benchActors(sc, 0).filter((a) => !a.ped && !String(a.id).startsWith("parked-"));
  ok(cars.some((a) => a.brakeLamp) && cars.some((a) => !a.brakeLamp) && cars.some((a) => a.blinker), `the traffic carries its lamps: ${cars.filter((a) => a.brakeLamp).length} of ${cars.length} braking, ${cars.filter((a) => a.blinker).length} signalling`);
  ok((lampSeen.get("#ff2a1e") ?? 0) > 0 && (lampSeen.get("#5c1714") ?? 0) > 0, `brake lamps drawn lit (${lampSeen.get("#ff2a1e") ?? 0}) and dim (${lampSeen.get("#5c1714") ?? 0}) round ${sigs.length} signals`);
  ok((lampSeen.get("#ffb020") ?? 0) > 0, `turn signals drawn blinking (${lampSeen.get("#ffb020") ?? 0} lit lamps across the two phases)`);
  ok(lineAll > 0 && lineMatch === lineAll, `every signal's stop line drawn in the light its lane obeys: ${lineMatch} of ${lineAll}`);
}
console.log("\nthe motion drawn, through a worker: no frame draws the world at an earlier moment than the one before");
{
  /* The bench's "sim in a worker" path, with a stand-in for the worker: the
     real protocol (sim/remote.js `handle`) answering each step one frame
     later, as a worker that keeps up does. The `back` column counts frames
     drawn at an earlier moment than the last -- cars jumping backwards,
     which costs nothing and so no frame time shows. The pacing of 13-14
     October (DT off at send) made one every few frames; sim/pace.js makes
     none. */
  let api = null, inits = 0;
  const makeRemote = (recipe, onWorld) => {
    inits++;
    let state = null, seq = 0, waiting = 0;
    const out = [];
    const post = (m) => { const r = handle(state, { ...m, seq: ++seq }); state = r.state; if (r.reply) out.push(r.reply); return seq; };
    waiting = post({ type: "init", ...recipe });
    api = {
      get busy() { return waiting !== 0; },
      step(me) { waiting = post({ type: "step", me }); },
      set() {}, honk() {}, stop() {},
      rewind(off) { waiting = post({ type: "rewind", off }); },
      deliver() { for (const x of out.splice(0)) { if (x.seq === waiting) waiting = 0; onWorld(structuredClone(x.dyn), x.hit, x.seq, !!x.fresh); } },
    };
    return api;
  };
  const st = benchState(benchSteps()[1], makeRemote);
  /* THE PAGE HOLDS A SHELL, the worker builds the world: building it on
     the page as well froze the phone for 6-21 s a step (14 October). */
  const shellActors = st.sc.world.actors.length, shellWalkers = (st.sc.world.walkers ?? []).length;
  const firstLoading = benchFrame(st, 16.7, ctx, size).loading;
  ok(shellActors === 0 && shellWalkers === 0 && firstLoading, `with a worker the page builds no traffic of its own (${shellActors} cars, ${shellWalkers} walking) and the bench says it is waiting for the worker's world`);
  let back = 0, frames = 0, ticks = 0, asBuilt = null;
  const keyOf = (w) => JSON.stringify(w.actors.map((a) => [a.id, a.k, a.route, a.s, a.v]));
  for (let f = 0; f < 600; f++) {
    api.deliver();
    if (f === 0) asBuilt = keyOf(st.sc.world);
    const fr = benchFrame(st, 16.7 + ((f * 7) % 5) - 2, ctx, size);
    if (f > 10) { frames++; if (fr.back) back++; ticks += fr.ticks; }
  }
  ok(ticks > 150, `the stand-in worker stepped the bench's world ${ticks} times in ${frames} frames`);
  ok(back === 0, `and no frame drew it at an earlier moment than the one before (${back} of ${frames})`);
  const built = inits;
  /* A DRAW-ONLY STEP REWINDS, never rebuilds: the same world, sight switched. */
  const moved = keyOf(st.sc.world) !== asBuilt;
  loadStep(st, { ...benchSteps()[1], off: { sidewalks: true } });
  api.deliver();
  benchFrame(st, 16.7, ctx, size);
  ok(inits === built && st.remoteReady && moved && keyOf(st.sc.world) === asBuilt, `a step that changes only what is drawn goes back to the worker's world exactly as built -- no new worker, no new world (${inits - built} built)`);
  /* THE CLOCK WAITS FOR THE WORLD: a worker that takes 15 s to build must
     not have its first 15 s measured -- the 14 October report's 300 and 400
     rows were mostly a world standing still. */
  {
    let slowApi = null;
    const slowRemote = (recipe, onWorld) => { const a = makeRemote(recipe, onWorld); slowApi = a; return a; };
    const steps = [{ ...benchSteps()[1], settle: 0.5, hold: 1 }];
    const ramp = budgetRamp({ steps, settle: 0.5, hold: 1, stopOnFail: false });
    let sst = null, now = 0, out = null, deliveredAt = null, doneAt = null;
    for (let f = 0; f < 3000 && !out; f++) {
      now += 16.7;
      if (f === 900) { slowApi.deliver(); deliveredAt = now; }   // the world arrives 15 s in
      else if (f > 900) slowApi.deliver();
      const fr = sst ? benchFrame(sst, 16.7, ctx, size) : null;
      const want = ramp.frame(now, fr?.drew, { split: fr?.split, loading: fr?.loading, back: fr?.back });
      if (want.load) sst = benchState(want.load, slowRemote);
      if (want.done) { out = want; doneAt = now; }
    }
    const measuredFrom = doneAt - (0.5 + 1) * 1000;
    ok(out && deliveredAt != null && measuredFrom >= deliveredAt - 50, `the ramp's clock waits for the worker's world: delivered at ${deliveredAt == null ? "(not yet -- measured before it arrived)" : (deliveredAt / 1000).toFixed(1) + " s"}, the step's settle and hold from ${(measuredFrom / 1000).toFixed(1)} s`);
  }
  ok(/back = frames that drew the world at an earlier moment/.test(benchReport({ device: {}, canvas: "1x1", ramp: { results: [], cap: null, steadyCap: null }, split: null, loaded: benchMap() })), "the report carries the back column and says what it means");
}

console.log(failed ? `\n${failed} FAILED` : "\nOK: the bench is the whole game at every step, each switch takes away only its own thing, and the report says where the frame went.");
process.exit(failed ? 1 : 0);
