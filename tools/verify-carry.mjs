/* =====================================================================
   A LANE-CHANGING CAR MOVES SIDEWAYS CONTINUOUSLY BETWEEN TICKS (13 November, DECISIONS 10.70).

   The sim steps at 20 Hz and the screen draws between ticks, carrying every car along its road at the tick's
   speed (MapRoad `actorsOf` -> crossing.js `carriedPose`). The pose also has a TIME-DEPENDENT part, a lane change's
   lateral offset (`lateralOf(lc, t)`), and `poseOf` read it at the tick's `world.t`, not the carried time: a car
   changing lane moved along the road at the frame rate and sideways in 50 ms steps, twenty times a second, in
   every game on the build Jay was driving. No check had looked because every check asked where a car IS at a
   tick. This asks where it is DRAWN at the frames in between: its sideways offset from the same pose without the
   lane change must equal the analytic offset at the carried time, to a millimetre.
   ===================================================================== */
import fs from "node:fs";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, carriedWorld, carriedPose, DT } from "../src/sim/crossing.js";
import { lateralOf } from "../src/sim/lanechange.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

console.log("\n1. THE DRAWN SIDEWAYS OFFSET IS THE ANALYTIC ONE AT THE CARRIED TIME");
{
  let w = seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build()), { target: 200, posted: true });
  const samples = []; let steppedBy = 0;
  for (let i = 0; i < 90 / DT && samples.length < 400; i++) {
    w = step(w);
    if (i % 4) continue;
    for (const a of w.actors) {
      if (!a.lc || a.player || a.crash || w.t >= a.lc.t0 + a.lc.T) continue;
      for (const frac of [0, 0.25, 0.5, 0.75, 0.999]) {
        const carry = frac * DT, wc = carriedWorld(w, carry);
        const p1 = carriedPose(wc, a, carry), p0 = carriedPose(wc, { ...a, lc: null }, carry), r = (p0.rot * Math.PI) / 180;
        const offset = (p1.x - p0.x) * -Math.sin(r) + (p1.y - p0.y) * Math.cos(r);
        const want = lateralOf(a.lc, w.t + carry), atTick = lateralOf(a.lc, w.t);
        samples.push({ err: Math.abs(offset - want), moved: Math.abs(want - atTick), carry });
      }
    }
  }
  const worst = Math.max(0, ...samples.map((s) => s.err)), moving = samples.filter((s) => s.carry > 0 && s.moved > 0.005);
  check(moving.length >= 40, `the case arose: ${moving.length} drawn frames of cars part-way through a lane change, each more than 5 mm sideways of where the tick has them (of ${samples.length} sampled)`);
  check(worst < 0.001, `[instrument: 1 mm] the drawn offset is the lane change's analytic offset at the carried time: worst ${(worst * 1000).toFixed(3)} mm over ${samples.length} frames (read at the tick's time instead, it is up to ${(1000 * Math.max(0, ...samples.map((s) => s.moved))).toFixed(0)} mm out)`);
}

console.log("\n2. THE SCREEN DRAWS THROUGH THAT ONE IMPLEMENTATION");
{
  /* A source-level assertion, as verify-core's: `actorsOf` is in a React component no headless check can mount to the point of a frame (verify-screens renders it once, at t = 0). Two implementations of one pose is this project's recurring defect. */
  const src = fs.readFileSync(new URL("../src/apps/MapRoad.jsx", import.meta.url), "utf8");
  check(/carriedPose\(wc, a, carry\)/.test(src) && /carriedWorld\(w, carry\)/.test(src), "MapRoad's actorsOf draws traffic through carriedWorld / carriedPose");
  check(!/poseOf\(w, \{ \.\.\.a, s: Math\.min\(a\.s \+ a\.v \* carry/.test(src), "and no second copy of the carried pose is left in it");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nOK: a lane-changing car's drawn sideways offset is the analytic one at the carried time, so it moves smoothly between ticks, and the screen draws through the one implementation.");
process.exit(failed ? 1 : 0);
