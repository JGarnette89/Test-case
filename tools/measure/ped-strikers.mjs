/* WHO STRIKES A CAREFUL PEDESTRIAN, AND WHAT THEY WERE LOOKING AT (27
   October; the verify-walkers failure with checks on). verify-walkers' own
   world -- test-peds, 120 cars, walkers, perception off -- for 15 minutes,
   with checks on or off; per careful pedestrian struck: the driver who
   struck them, their observation soundness, whether they were mid-look (a
   check) at any tick in the three seconds before, and their speed and
   distance when the pedestrian stepped off.
   Usage: node tools/measure/ped-strikers.mjs seed checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { pedPose } from "../../src/sim/peds.js";
import { DT } from "../../src/sim/traffic.js";
import { soundnessOf } from "../../src/core/driver.js";
const [seed, chk] = process.argv.slice(2).map(Number);
const loaded = loadMap(TEST_MAPS.find((t) => t.id === "test-peds").build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: 120, posted: true, walkers: true, checks: chk === 1 });
const hist = [], done = new Set(), out = [];
for (let k = 0; k < 15 * 60 / DT; k++) {
  w = step(w); hist.push(w); if (hist.length > 80) hist.shift();
  for (const q of w.peds ?? []) {
    /* Careful only: trusting and heedless people take risks by design (peds.js). */
    if (q.state !== "struck" || done.has(q.id) || (q.manner ?? "careful") !== "careful") continue;
    done.add(q.id);
    const c = (w.crashes ?? []).find((x) => x.a === q.id || x.b === q.id), cid = c && (c.a === q.id ? c.b : c.a);
    const a = w.actors.find((x) => x.id === cid);
    const looks = new Set(hist.slice(-60).map((h) => h.actors.find((x) => x.id === cid)?.look?.kind).filter(Boolean));
    /* When they stepped off: the last tick they were not yet crossing. */
    let stepOff = null;
    for (let i = hist.length - 1; i > 0; i--) { const p = (hist[i - 1].peds ?? []).find((x) => x.id === q.id); if (p && p.state !== "crossing" && p.state !== "struck") { stepOff = hist[i]; break; } }
    let at = "";
    if (stepOff) { const p = stepOff.peds.find((x) => x.id === q.id), car = stepOff.actors.find((x) => x.id === cid); if (p && car) { const pp = pedPose(stepOff, p), cp = poseOf(stepOff, car); at = `stepped off ${Math.hypot(pp.x - cp.x, pp.y - cp.y).toFixed(1)} m ahead of it at ${car.v.toFixed(1)} m/s`; } } else at = "stepped off more than 4 s before";
    out.push(`  t ${w.t.toFixed(0)} ${cid}: observation ${a ? soundnessOf(a.ratings ?? {}, "observation").toFixed(2) : "?"}, looks in the 3 s before: ${looks.size ? [...looks].join(",") : "none"}; ${at}`);
  }
}
console.log(`seed ${seed} checks ${chk}: ${out.length} careful struck${out.length ? "\n" + out.join("\n") : ""}`);
