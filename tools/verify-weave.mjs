/* =====================================================================
   THE WEAVE BELONGS TO A CAR IN MOTION (17 November 2026; DECISIONS 10.70 "a defect, not a modelling oddity"; backlog item 8). `weaveAt` was a spatial wave with no speed term, so a car at rest wore
   the wave's value where it happened to stop and a car creeping forward swung sideways with its position. Expectations are stated here, not read from the module:
     1. AT REST THE OFFSET IS A CONSTANT: for a car at v = 0 the lateral offset is the same at every position along the road (checked at 40 positions), and zero for a car with no weave.
     2. IT IS BOUNDED AND VARIED: a parked offset is at most half the car's weave amplitude, and cars with different phases do not all park at the same offset (a spread of at least a quarter of the amplitude).
     3. IN MOTION IT IS THE OLD WAVE, EXACTLY: at 3 m/s and above the offset is weave * sin(2 pi (s + phase) / 55), restated here from the 55 m wavelength (the project's "one weave per wavelength"), and a car with no `v` is read as moving.
     4. NO STEP: between rest and 3 m/s the offset changes by at most the full amplitude, smoothly (no two readings 0.1 m/s apart differ by more than a thirtieth of the amplitude over the range), so nothing jumps as a car comes to a stop.
     5. IN A REAL WORLD, every car actually at rest sits within half its weave amplitude of its line, and the same car a metre further on, still at rest, is at the same offset.
   Sabotage: the speed term removed fails 1 and 5. Usage: node tools/verify-weave.mjs
   ===================================================================== */
// BARE WORLD: the subject is how a standing car sits on its line; section 5 builds `seedGraph` with the options it needs stated one by one, because walkers, rivals and brake reaction would change which cars are standing, not how a standing car sits (DECISIONS 10.120).
import { loadMap } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { weaveAt } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const WAVE = 55, old = (c, s) => (c.weave ?? 0) * Math.sin(((s + (c.weavePhase ?? 0)) / WAVE) * 2 * Math.PI);

console.log("1. AT REST THE OFFSET IS A CONSTANT");
{
  const c = { weave: 0.3, weavePhase: 12.5, v: 0 };
  const vals = Array.from({ length: 40 }, (_, i) => weaveAt(c, i * 5.3));
  check(vals.every((x) => Math.abs(x - vals[0]) < 1e-12), `a car at rest has one offset at every position (${vals[0].toFixed(3)} m at 40 positions)`);
  check(Array.from({ length: 40 }, (_, i) => weaveAt({ weave: 0, weavePhase: 9, v: 0 }, i * 5.3)).every((x) => x === 0), "and a car with no weave sits on its line");
}
console.log("\n2. IT IS BOUNDED AND VARIED");
{
  const amp = 0.4, offs = Array.from({ length: 60 }, (_, i) => weaveAt({ weave: amp, weavePhase: (i * WAVE) / 60, v: 0 }, 0));
  check(offs.every((x) => Math.abs(x) <= 0.5 * amp + 1e-12), `every parked offset is within half the amplitude (largest ${Math.max(...offs.map(Math.abs)).toFixed(3)} against ${(0.5 * amp).toFixed(2)})`);
  check(Math.max(...offs) - Math.min(...offs) >= 0.25 * amp, `and cars with different phases park at different offsets (a spread of ${(Math.max(...offs) - Math.min(...offs)).toFixed(3)} m, at least ${(0.25 * amp).toFixed(2)})`);
}
console.log("\n3. IN MOTION IT IS THE OLD WAVE, EXACTLY");
{
  const c = { weave: 0.35, weavePhase: 20 };
  const fast = [3, 5, 12, 30].every((v) => [0, 7.7, 31, 99.9, 300].every((s) => Math.abs(weaveAt({ ...c, v }, s) - old(c, s)) < 1e-12));
  check(fast, "at 3 m/s and above the offset is weave * sin(2 pi (s + phase) / 55), at five positions and four speeds");
  check([0, 7.7, 31, 99.9].every((s) => Math.abs(weaveAt(c, s) - old(c, s)) < 1e-12), "and a car with no speed recorded is read as moving, as it always was");
}
console.log("\n4. NO STEP");
{
  const c = { weave: 0.4, weavePhase: 5 };
  let worst = 0, prev = weaveAt({ ...c, v: 0 }, 17);
  for (let v = 0.1; v <= 3.0001; v += 0.1) { const x = weaveAt({ ...c, v }, 17); worst = Math.max(worst, Math.abs(x - prev)); prev = x; }
  check(worst <= c.weave / 30, `between rest and 3 m/s no two readings 0.1 m/s apart differ by more than ${(c.weave / 30).toFixed(3)} m (worst ${worst.toFixed(4)})`);
}
console.log("\n5. IN A REAL WORLD");
{
  const loaded = loadMap(testMap1());
  let w = seedGraph(3, 50, loaded, { every: 2.0, target: 120, posted: true });
  for (let i = 0; i < 400; i++) w = step(w);
  const still = w.actors.filter((a) => !a.player && (a.v ?? 0) === 0 && (a.weave ?? 0) > 0 && !a.parked);
  const within = still.filter((a) => Math.abs(weaveAt(a, a.s)) <= 0.5 * a.weave + 1e-9), same = still.filter((a) => Math.abs(weaveAt(a, a.s + 1) - weaveAt(a, a.s)) < 1e-12);
  check(still.length >= 5 && within.length === still.length && same.length === still.length, `${still.length} cars standing with a weave: ${within.length} within half their amplitude of the line, ${same.length} at the same offset a metre on`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
