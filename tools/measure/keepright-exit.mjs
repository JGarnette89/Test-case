/* KEEP-RIGHT ON THE EXIT STRETCH, BY WHO LOOKED (28 October; the keep-right
   trace). The endless highway, 150 cars, one seed, checks off or on (stated),
   0 s to 180 s: every lane change begun, split approach/exit and by kind, and
   for exit keep-right moves whether the driver had skipped their checks.
   Usage: node tools/measure/keepright-exit.mjs seed checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
const [seed, chk] = process.argv.slice(2).map(Number);
let w = seedGraph(seed, 50, loadMap(testLoop()), { target: 150, posted: true, checks: chk === 1 });
const out = {}, seen = new Set();
while (w.t < 180) {
  w = step(w);
  for (const a of w.actors) {
    if (!a.lc || seen.has(a.id + "@" + a.lc.at)) continue;
    seen.add(a.id + "@" + a.lc.at);
    const kind = (a.lc.exit ? "exit." : "appr.") + (a.lc.merge ? "merge" : a.lc.keepRight ? "keepRight" : a.lc.mandatory ? "forTurn" : "overtake");
    out[kind] = (out[kind] ?? 0) + 1;
    if (a.lc.keepRight) out[kind + ".skipped"] = (out[kind + ".skipped"] ?? 0) + (a.lc.wrong === "skipped" ? 1 : 0);
  }
}
console.log(JSON.stringify({ seed, checks: chk, ...out }));
