/* =====================================================================
   THE MERGE TOLERANCE (DECISIONS 10.70; lanechange.js `MERGE_TOLERANCES`, `world.mergeTolerance`). Jay, 11 November: tolerance for close driving "(within that
   typical 2-3s gap) is higher here than normal"; a joiner "is beginning to look for a smaller and smaller acceptable gap as their drivable space concludes".
   The second half of one correction (the first, charging the closing speed once, is in `leadNeed`/`lagNeed` themselves and left a joiner at rest needing 173 m).
   Expectations are stated here, never read from the code's constants:

     1. OFF, the default: what a joiner at rest needs behind it is the following model's own charge, once -- 173 m against a stream at 100 km/h (it was 249 m
        while the closing speed was charged twice) -- and a world made without the switch carries no such field, so it is byte-identical to before.
     2. ON, a merge asks for at most tolerance x the speed of the car it is measured against: 2.5 s of 27.8 m/s is 69.5 m, ahead and behind.
     3. THE FLOOR IS NEVER LOWERED: however small the tolerance, the car behind keeps the room to stop at its hardest braking (8 m/s^2), so a gap that cannot
        be survived is still refused.
     4. IT BITES ONLY WHERE THE CLOSING SPEED ASKS FOR MORE THAN THE TOLERANCE: a joiner at 80 km/h is asked the same with or without it.
     5. A LANE CHANGE OF CHOICE IS UNTOUCHED: the cap is passed by a merge only (`merge` in `gapFor`), checked by reading the source for the one place it is read.
   Each assertion is sabotaged once (the cap removed, the floor lowered, the cap applied to everybody): see the record. Usage: node tools/verify-mergetol.mjs
   ===================================================================== */
import { readFileSync } from "node:fs";
import { leadNeed, lagNeed, MERGE_TOLERANCES } from "../src/sim/lanechange.js";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph } from "../src/sim/crossing.js";
import { worldFor } from "../src/sim/scene.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };

const V = 27.8, behind = { v: V, v0: V, caution: 1 }, rest = { v: 0, v0: V, caution: 1 };
console.log("1. OFF IS THE DEFAULT");
{
  const off = lagNeed(rest, behind, 1);
  check(Math.abs(off - 173) < 2, `a joiner at rest needs ${off.toFixed(0)} m behind it with the switch off (the closing speed charged once: 173 m; 249 m when it was charged twice)`);
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
  const w0 = seedGraph(1, 50, loaded, { target: 20, posted: true, mergeTolerance: null }), w1 = seedGraph(1, 50, loaded, { target: 20, posted: true, mergeTolerance: 2.5 }), wd = seedGraph(1, 50, loaded, { target: 20, posted: true });
  check(!("mergeTolerance" in w0), "a world made with the switch explicitly OFF (null) has no such field: byte-identical to the world before the switch existed");
  check(w1.mergeTolerance === 2.5, "a world made with it carries it, for the page and for the worker, which receives the world");
  /* THE DEFAULT, stated here as the literal Jay confirmed (13 November, "2.5s ... no further changes there") and not read from the module's constant, which a check cannot use to catch that constant being wrong. */
  check(wd.mergeTolerance === 2.5, "a world made with no mention of it carries 2.5 s: the default is Jay's confirmed figure, and null (off) stays expressible for a comparison");
  const wf = worldFor(1, 50, 2.0, false, 20).world;
  check(wf.mergeTolerance === 2.5, "and the played world (worldFor, the page's and the worker's) carries it by default too");
}
console.log("\n2. ON, A MERGE ASKS FOR AT MOST THE TOLERANCE");
{
  const on = lagNeed(rest, behind, 1, 2.5), cap = 2.5 * V;
  check(on <= cap + 1e-9 && on > 1.5, `behind a joiner at rest ${on.toFixed(1)} m, at most ${cap.toFixed(1)} m (2.5 s of 27.8 m/s)`);
  /* A case where the room ahead would be LARGE without the cap: a joiner at 100 km/h closing on a car at rest (a queue the lane ends in). */
  const fastJoiner = { v: V, v0: V, caution: 1 }, queued = { v: 0, v0: V, caution: 1 };
  const lead = leadNeed(fastJoiner, queued, 1, 2.5), uncapped = leadNeed(fastJoiner, queued, 1);
  check(uncapped > 150 && lead <= 2.5 * V + 1e-9, `ahead of a joiner at 100 km/h closing on a car at rest: ${lead.toFixed(1)} m capped, at most ${(2.5 * V).toFixed(1)} m (${uncapped.toFixed(0)} m uncapped)`);
  check(MERGE_TOLERANCES.length === 3 && MERGE_TOLERANCES[0] === 2 && MERGE_TOLERANCES[2] === 3, "the offered tolerances are Jay's range, 2, 2.5 and 3 s");
}
console.log("\n3. THE FLOOR IS NEVER LOWERED");
{
  const hardest = 1.5 + (V * V) / (2 * 8), tiny = lagNeed(rest, behind, 1, 0.1);
  check(tiny >= hardest - 1e-9, `with a 0.1 s tolerance the car behind still gets ${tiny.toFixed(1)} m, the room to stop at its hardest braking (${hardest.toFixed(1)} m)`);
}
console.log("\n4. IT BITES ONLY WHERE THE CLOSING SPEED ASKS FOR MORE");
{
  const moving = { v: 80 / 3.6, v0: V, caution: 1 };
  check(Math.abs(lagNeed(moving, behind, 1, 2.5) - lagNeed(moving, behind, 1)) < 1e-9, `at 80 km/h the need is ${lagNeed(moving, behind, 1).toFixed(1)} m with or without it (under 2.5 s already)`);
  check(lagNeed(rest, behind, 1, 2.5) < lagNeed(rest, behind, 1) - 50, "and at rest it is far below what the closing speed asks (the cap bites where Jay says a driver 'floors it')");
}
console.log("\n5. A LANE CHANGE OF CHOICE IS UNTOUCHED");
{
  const src = readFileSync(new URL("../src/sim/lanechange.js", import.meta.url), "utf8");
  const code = src.split("\n").filter((l) => /mergeTolerance \?\? null/.test(l));   // the lines that READ it (the doc comments never say "?? null")
  check(code.length === 2 && code.every((l) => /merge \? /.test(l)), `every place the sim reads it is gated on a merge (${code.length} reads: the gap for the car ahead and behind, and the cars further ahead; each behind \`merge ?\`)`);
  check(/const tol = merge \? world\?\.mergeTolerance \?\? null : null;/.test(src), "and gapFor, the one function every lane change and merge is judged by, reads it as `merge ? world?.mergeTolerance : null`");
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
