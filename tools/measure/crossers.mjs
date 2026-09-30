/* Crossers drawn from walkers (SIMULATOR.md ambient pedestrians, step 3)
   against the old source (created 10 m back): crossings completed, people
   struck, and -- with walkers -- anybody on foot who appears or vanishes
   anywhere but a door, the map's edge, or by turning from walking to
   crossing and back. Usage: node tools/measure/crossers.mjs [map=city] [minutes=20] [seed=3] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { pedPose } from "../../src/sim/peds.js";
import { walkerPose } from "../../src/sim/walkers.js";
import { DT } from "../../src/sim/traffic.js";

const [id = "city", mins = 20, seed = 3] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build());
for (const walkers of [false, true]) {
  const t0 = performance.now();
  let w = seedGraph(Number(seed), 50, loaded, { every: 2.0, target: 120, posted: true, walkers });
  const across0 = w.pedsAcross ?? 0;
  const where = (x) => new Map([...(x.peds ?? []).map((q) => [q.id, pedPose(x, q)]), ...(x.walkers ?? []).map((q) => [q.id, walkerPose(x, q)])]);
  let prev = where(w), jumps = 0, worst = 0, struck = new Set(), fromWalk = 0, rejoined = 0;
  for (let k = 0; k < (Number(mins) * 60) / DT; k++) {
    const before = w;
    w = step(w);
    const now = where(w);
    for (const [pid, q] of now) {
      const p = prev.get(pid);
      if (p) { const d = Math.hypot(q.x - p.x, q.y - p.y); worst = Math.max(worst, d); if (d > 0.5) jumps++; }
    }
    for (const q of w.peds ?? []) if (q.state === "struck") struck.add(q.id);
    const had = new Set((before.peds ?? []).map((q) => q.id));
    for (const q of w.peds ?? []) if (!had.has(q.id) && q.fromWalker) {
      fromWalk++;
      /* Continuity across the turn: where the walker was is where the crosser starts. */
      const d = Math.hypot(q.origin.x - pedPose(w, { ...q, u: q.u0 }).x, q.origin.y - pedPose(w, { ...q, u: q.u0 }).y);
      worst = Math.max(worst, d);
    }
    rejoined += (before.peds ?? []).filter((q) => q.fromWalker && q.state === "leaving" && !(w.peds ?? []).some((x) => x.id === q.id)).length;
    prev = now;
  }
  const done = (w.pedsAcross ?? 0) - across0;
  console.log(`${id} ${walkers ? "walkers" : "old    "}: ${done} crossings in ${mins} min (${(done / (mins / 60)).toFixed(0)}/h), ${struck.size} struck, ${walkers ? `${fromWalk} turned from walking, ${rejoined} walked on, ` : ""}largest step by anybody on foot ${worst.toFixed(2)} m (${jumps} over 0.5 m), ${((performance.now() - t0) / 1000).toFixed(0)} s`);
}
