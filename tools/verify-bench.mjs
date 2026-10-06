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
   6. a load is not play: a long frame in the window after a world is
      built is reported as a load-time hitch and does not fail the play
      budget, one in play does, and the split ends with a soak.

   Usage: node tools/verify-bench.mjs */
import { budgetRamp } from "../src/iso/perf.js";
import { benchState, loadStep, benchFrame, benchSteps, categorySteps, benchReport, controlLines, OFF, LOAD_WINDOW, SOAK } from "../src/iso/bench.js";

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

console.log(failed ? `\n${failed} FAILED` : "\nOK: the bench is the whole game at every step, each switch takes away only its own thing, and the report says where the frame went.");
process.exit(failed ? 1 : 0);
