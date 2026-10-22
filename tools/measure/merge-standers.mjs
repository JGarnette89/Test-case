/* THE MERGE JAM, AS PHOTOGRAPHED (the maintainer, 22 October): cars queued
   nose to tail in the acceleration lane while the lane beside sat empty.
   For every second a joiner stands (under 0.5 m/s) on an acceleration lane,
   the room in the lane it wants at its own place: the clear road to the car
   ahead and behind there (placement.js neighboursAt), against the gap it
   would accept (lanechange.js lagNeed / leadNeed at its own caution) -- so
   "was there a gap it would take, and was it in the lane at all".
   Usage: node tools/measure/merge-standers.mjs [cars=280] [secs=240] [seed=1] [perceive=1] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
import { placeOf, neighboursAt } from "../../src/sim/placement.js";
import { leadNeed, lagNeed } from "../../src/sim/lanechange.js";

import { exitRouteInto, exitAlong } from "../../src/sim/graph.js";

const [carsArg = "280", secsArg = "240", seedArg = "1", perArg = "1"] = process.argv.slice(2);
const map = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
let w = seedGraph(Number(seedArg), 50, map, { every: 2.0, target: Number(carsArg), posted: true, perceive: perArg === "1" });
for (let i = 0; i < 60 / DT; i++) w = step(w);
const rows = [];   // one per stander-second: { id, clearAhead, clearBehind, takeable, empty, lc }
const LOOK = 150;
for (let i = 0; i < Number(secsArg) / DT; i++) {
  w = step(w);
  if (i % 20) continue;
  for (const a of w.actors) {
    if (a.player || a.parked || !(a.v < 0.5)) continue;
    const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p?.to];
    if (!p || !to?.accel || a.s <= p.clearAt) continue;
    const toLeg = L.legAt?.(to.base, to.pos - 1), route = toLeg && exitRouteInto(L, toLeg, "straight");
    const lane = toLeg && L.legs[toLeg]?.outLane;
    if (!route || !lane) continue;
    const c = exitAlong(w.course, a.k, a.route, a.s);
    if (c == null) continue;
    const nb = neighboursAt(w, lane.id, c, a);

    const ahead = nb.ahead?.clear ?? Infinity, behind = nb.behind?.clear ?? Infinity;
    const takeable = (!nb.ahead || ahead >= leadNeed(a, nb.ahead.car)) && (!nb.behind || behind >= lagNeed(a, nb.behind.car));
    rows.push({ id: a.id, ahead, behind, takeable, empty: ahead > LOOK && behind > LOOK, lc: !!a.lc });
  }
}
const ids = new Set(rows.map((r) => r.id));
const n = rows.length, pc = (f) => `${((100 * rows.filter(f).length) / Math.max(n, 1)).toFixed(0)}%`;
const q = (xs, f) => { const s = xs.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.floor(f * (s.length - 1))].toFixed(0) : "-"; };
console.log(`test-loop, ${carsArg} cars, seed ${seedArg}, look-away ${perArg === "1" ? "on" : "off"}: ${n} stander-seconds from ${ids.size} joiners`);
console.log(`   the lane beside empty for ${LOOK} m both ways: ${pc((r) => r.empty)}; a gap there the joiner would take at its own caution: ${pc((r) => r.takeable)}; mid lane change: ${pc((r) => r.lc)}`);
console.log(`   clear road beside, m: ahead median ${q(rows.map((r) => r.ahead), 0.5)}, behind median ${q(rows.map((r) => r.behind), 0.5)} (Infinity = nobody in the lane)`);
console.log(`   takeable but standing, by caution: ${[...new Set(rows.filter((r) => r.takeable).map((r) => r.id))].length} joiners`);
