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
import { playerAt, stepDriver, driverPose, carriedPlayer, withDriver } from "../src/sim/drive.js";
import { holdAt } from "../src/sim/player.js";

const LAT_LIMIT = 0.005, HEAD_LIMIT = 0.2;   // [instrument] the 95th-percentile boundary step: sideways from the measured 2.6 mm (the held-still car 153 mm); heading 0.2 degrees against the measured 0.134 (held still 0.35, see the note on the path's own kinks)
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

console.log("\n2. THE PLAYER'S DRAWN CAR DOES NOT STEP AT A TICK, SIDEWAYS OR IN HEADING");
{
  /* The player's `off` (offset from the route's line) and `psi` (heading against it) change every tick while the wheel is turned, and the screen carried only `s`: they were held still for 50 ms and then stepped, twenty times a
     second (tools/measure/player-carry.mjs: 208 mm off the line and 0.77 degrees in one tick of a steered weave at 80 km/h). WHAT A SMOOTH PICTURE NEEDS IS NO JUMP AT THE BOUNDARY: the pose drawn at the very end of one tick
     (carry = DT) and the pose of the next tick (carry = 0) are the same place. (A first version compared the drawn car with the straight line between the two ticks' poses; that is a hindsight no extrapolation has at the tick
     where the wheel reverses, and read WORSE for the fix in heading, 0.72 degrees against 0.54, at exactly that tick.) The jump is judged at its 95th percentile, and its worst is reported against what holding still gives. */
  const course = { ...seedGraph(1, 50, loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build()), { every: 2 }), actors: [] };
  const route = Object.keys(course.course.at[0].layout.paths).find((r) => /^loop-7\|end#1/.test(r)), turnOf = (a, b) => ((a - b + 540) % 360) - 180;
  let me = { ...playerAt(course.course, 0, route), s: 300, v: 80 / 3.6, going: true, accepted: true, signal: null, off: 0 }, world = withDriver(course, me);
  /* TWO DRIVES: a SMOOTH one (a sine of the wheel, as a lane change is steered: no wheel reversal inside a tick), which is what is asserted; and a BANG-BANG one (the wheel flipped from +0.5 to -0.5 in a tick), which is reported, not asserted: no extrapolation knows the wheel is about to reverse, and a thumb does not do it. */
  const drive = (steerAt) => { let m = { ...me }, wd = world; const out = []; for (let i = 0; i < 8 / DT; i++) { out.push(m); m = stepDriver(m, { steer: steerAt(i * DT), slider: holdAt(m.v, m.grade ?? 0), assist: 0 }, wd, DT); wd = withDriver(wd, m); } return out; };
  const states = drive((t) => (t < 6.4 ? 0.12 * Math.sin((2 * Math.PI * t) / 3.2) : 0)), bang = drive((t) => (t < 1.2 ? 0.5 : t < 2.4 ? -0.5 : 0));
  const jump = (carryOf, states = smooth) => { const lat = [], head = []; for (let i = 0; i + 1 < states.length; i++) { if (states[i + 1].route !== states[i].route) continue; const end = driverPose(carryOf(states[i]), course.course), next = driverPose(states[i + 1], course.course), h = (next.heading * Math.PI) / 180; lat.push(Math.abs((end.x - next.x) * -Math.sin(h) + (end.y - next.y) * Math.cos(h))); head.push(Math.abs(turnOf(end.heading, next.heading))); } const q = (x, f) => [...x].sort((a, b) => a - b)[Math.floor(f * (x.length - 1))]; return { n: lat.length, lat95: q(lat, 0.95), latMax: Math.max(...lat), head95: q(head, 0.95), headMax: Math.max(...head) }; };
  const smooth = states, held = jump((m) => ({ ...m, s: m.s + m.v * DT })), carried = jump((m) => carriedPlayer(m, DT)), bangHeld = jump((m) => ({ ...m, s: m.s + m.v * DT }), bang), bangCarried = jump((m) => carriedPlayer(m, DT), bang);
  check(held.latMax > 0.05 && held.headMax > 0.3, `the case arose: held still, the car steps ${(held.latMax * 1000).toFixed(0)} mm sideways and ${held.headMax.toFixed(2)} degrees at a tick boundary (95th percentile ${(held.lat95 * 1000).toFixed(0)} mm and ${held.head95.toFixed(2)}; ${held.n} ticks of a smoothly steered drive at 80 km/h)`);
  check(carried.lat95 < LAT_LIMIT && carried.head95 < HEAD_LIMIT, `[instrument: ${LAT_LIMIT * 1000} mm and ${HEAD_LIMIT} degrees at the 95th percentile] carried, the step at a tick boundary is ${(carried.lat95 * 1000).toFixed(2)} mm sideways and ${carried.head95.toFixed(3)} degrees (worst ${(carried.latMax * 1000).toFixed(1)} mm and ${carried.headMax.toFixed(3)})`);
  /* WHAT THE HEADING RESIDUAL IS, found taking this apart (13 November): the carried heading's remaining boundary step is all in `psi`, not in the path's heading, and it comes from `psiDot` itself, which is erratic from tick to tick
     (-0.012 then +0.071 rad/s with the wheel moving by hundredths): `psiDot = yawRate - kappa v cos(psi)` and `kappa` (player.js curvatureOf, read from the path's headings a little either side) steps at the loop's 5 m path vertices, while
     the path's own heading steps there too and the two do not cancel. THE SIM'S OWN ABSOLUTE HEADING THEREFORE WOBBLES ABOUT 0.1 TO 0.2 DEGREES AT EACH VERTEX. Not caused by the carry and not fixed by it; the carry removes the other, larger part (holding still). */
  check(carried.latMax < held.latMax / 5 && carried.headMax < 0.6 * held.headMax, `and its worst is under a fifth of holding still sideways (${(carried.latMax * 1000).toFixed(1)} against ${(held.latMax * 1000).toFixed(1)} mm) and under 0.6 of it in heading (${carried.headMax.toFixed(3)} against ${held.headMax.toFixed(2)}; the rest is the sim's own heading kinks at path vertices, see the comment)`);
  console.log(`       REPORTED, NOT ASSERTED: the bang-bang wheel (+0.5 to -0.5 in one tick): worst step at a boundary held still ${(bangHeld.latMax * 1000).toFixed(0)} mm and ${bangHeld.headMax.toFixed(2)} degrees, carried ${(bangCarried.latMax * 1000).toFixed(0)} mm and ${bangCarried.headMax.toFixed(2)} (a reversal costs one tick of overshoot: an extrapolation cannot know)`);
}

console.log("\n3. THE SCREEN DRAWS THROUGH THAT ONE IMPLEMENTATION");
{
  /* A source-level assertion, as verify-core's: `actorsOf` is in a React component no headless check can mount to the point of a frame (verify-screens renders it once, at t = 0). Two implementations of one pose is this project's recurring defect. */
  const src = fs.readFileSync(new URL("../src/apps/MapRoad.jsx", import.meta.url), "utf8");
  check(/carriedPose\(wc, a, carry\)/.test(src) && /carriedWorld\(w, carry\)/.test(src), "MapRoad's actorsOf draws traffic through carriedWorld / carriedPose");
  check(!/poseOf\(w, \{ \.\.\.a, s: Math\.min\(a\.s \+ a\.v \* carry/.test(src), "and no second copy of the carried pose is left in it");
  check(/driverPose\(carriedPlayer\(a, carry\)/.test(src) && /driverPose\(carriedPlayer\(sc\.me, carry\)/.test(src) && !/s: sc\.me\.s \+ \(sc\.me\.v \?\? 0\) \* carry/.test(src), "the player and the camera that follows them are carried through carriedPlayer, with no copy of the old arithmetic");
  const bench = fs.readFileSync(new URL("../src/iso/bench.js", import.meta.url), "utf8");
  check(/carriedPose\(wc, a, carry\)/.test(bench) && !/poseOf\(w, \{ \.\.\.a, s: Math\.min\(a\.s \+ a\.v \* carry/.test(bench), "and the bench (#/bench), which draws traffic as the map screen does, uses the same carried pose and not a copy of it");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nOK: a lane-changing car's drawn sideways offset is the analytic one at the carried time, so it moves smoothly between ticks, and the screen draws through the one implementation.");
process.exit(failed ? 1 : 0);
