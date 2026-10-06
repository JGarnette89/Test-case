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
   4. every frame says where its time went, and the report renders.

   Usage: node tools/verify-bench.mjs */
import { budgetRamp } from "../src/iso/perf.js";
import { benchState, loadStep, benchFrame, benchSteps, categorySteps, benchReport, OFF } from "../src/iso/bench.js";

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? " ok " : " FAIL"} ${msg}`); if (!c) failed++; };
const noop = () => {};
const ctx = new Proxy({}, { get: (t, p) => (p in t ? t[p] : noop), set: (t, p, v) => { t[p] = v; return true; } });
const size = { w: 412, h: 560 };

/* Drive a ramp to its end on a synthetic clock: `dtFor(step)` is the
   frame time to pretend, so pass and fail can be steered. */
function run(steps, { stopOnFail = true, dtFor = () => 16.7 } = {}) {
  const ramp = budgetRamp({ steps, settle: 0.2, hold: 0.6, stopOnFail });
  let st = null, now = 0, out = null, builds = [];
  for (let f = 0; f < 200000 && !out; f++) {
    const step = ramp.step;
    const dt = dtFor(step ?? {});
    now += dt;
    let fr = null;
    if (st) fr = benchFrame(st, dt, ctx, size);
    const want = ramp.frame(now, fr?.drew, { split: fr?.split });
    if (want.done) out = want;
    else if (want.load) { st = st ? loadStep(st, want.load) : benchState(want.load); builds.push({ label: want.load.label, built: st.buildS > 0 }); }
  }
  return { ...out, builds };
}

console.log("1. the ramp is the whole game at every step");
const ramp = run(benchSteps());
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
const wide = split.results.find((r) => r.label === "wide view");
ok(wide.cars > base.cars, `the wide view draws more of the city (${base.cars} -> ${wide.cars} road users on screen)`);

console.log("\n3. the split runs every step; the ramp stops; a world is built only when the traffic changes");
ok(split.results.length === categorySteps(100).length, `the split ran all ${split.results.length} steps`);
const failing = run(categorySteps(50), { stopOnFail: false, dtFor: (s) => (s.label === "no trucks" ? 40 : 16.7) });
ok(failing.results.length === categorySteps(50).length && failing.results.some((r) => !r.steady), `with one step failing the split still ran all ${failing.results.length}`);
const stopped = run(benchSteps(), { dtFor: (s) => (s.fleet >= 150 ? 40 : 16.7) });
ok(stopped.results.at(-1)?.fleet === 150 && !stopped.results.at(-1).steady, `the ramp stops at its first unsteady step (${stopped.results.at(-1)?.label}), and the steady cap is the step before (${stopped.steadyCap?.label})`);
const rebuilt = split.builds.filter((b) => b.built).map((b) => b.label);
const want = ["everything", "no trucks", "no buses", "no walkers", "no crossers", "no parked"];   // the five that change the traffic, and the baseline
ok(rebuilt.length === want.length && want.every((x) => rebuilt.includes(x)), `new worlds only for: ${rebuilt.join(", ")}`);

console.log("\n4. every frame says where its time went, and the report renders");
ok(ramp.results.every((r) => r.split?.step?.p50 > 0 && r.split?.draw?.p50 > 0 && r.split?.poses?.p50 > 0), "sim step, poses and draw timed at every step");
ok(ramp.results.every((r) => r.split.step.share > 15 && r.split.step.share < 50), `the sim steps on about a third of the frames (${ramp.results.map((r) => r.split.step.share).join(", ")}%)`);
const text = benchReport({ device: { ua: "test", cores: 8, memoryGB: 8, secure: true, dpr: 3, screen: "1x1", viewport: "1x1" }, canvas: "412x560", ramp, split, loaded: ramp.results.length ? (await import("../src/iso/bench.js")).benchMap() : null });
ok(/THE RAMP/.test(text) && /WHERE THE BUDGET GOES/.test(text) && benchSteps().every((s) => text.includes(s.label)), "the report has the ramp, every step, and the split");
ok(Object.values(OFF).every((label) => text.includes(label.slice(0, 22))), "the split names every switch");
console.log("\n" + text.split("\n").slice(4).join("\n"));

console.log(failed ? `\n${failed} FAILED` : "\nOK: the bench is the whole game at every step, each switch takes away only its own thing, and the report says where the frame went.");
process.exit(failed ? 1 : 0);
