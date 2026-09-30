/* Walkers on every test map, without traffic: how many, whether any
   stands on a road's surface, whether anybody appears or vanishes away
   from a door or the map's edge, and what a step costs.
   Usage: node tools/measure/walkers.mjs [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedWalkers, stepWalkers, walkerPose, walkNetOf } from "../../src/sim/walkers.js";
import { onRoadSurface } from "../../src/map/sidewalks.js";
import { DT } from "../../src/sim/traffic.js";

const secs = Number(process.argv[2] ?? 300);
for (const tm of TEST_MAPS) {
  const loaded = loadMap(tm.build());
  const net = walkNetOf(loaded);
  let w = { course: { map: loaded }, t: 0, ...seedWalkers(loaded, 3) };
  if (!w.walkers) { console.log(tm.id, "no walkers"); continue; }
  const ends = [];
  net.edge.forEach((e, i) => e.forEach((on, end) => on && ends.push(walkerPose(w, { state: "walking", w: i, s: end ? net.walks[i].length : 0, dir: 1 }))));
  const nearDoorOrEdge = (q) => net.doors.some((d) => Math.hypot(d.face.x - q.x, d.face.y - q.y) < 1.5) || ends.some((e) => Math.hypot(e.x - q.x, e.y - q.y) < 2.5);
  let onRoad = 0, pops = 0, vanish = 0, samples = 0, ms = 0, minN = Infinity, maxN = 0, standing = 0, inOut = 0;
  let prev = new Map(w.walkers.map((p) => [p.id, walkerPose(w, p)]));
  for (let k = 0; k < secs / DT; k++) {
    const t0 = performance.now();
    const nx = stepWalkers({ ...w, t: w.t + DT });
    ms += performance.now() - t0;
    w = { ...w, ...nx, t: w.t + DT };
    const now = new Map(w.walkers.map((p) => [p.id, walkerPose(w, p)]));
    for (const [id, q] of now) if (!prev.has(id) && !nearDoorOrEdge(q)) pops++;
    for (const [id, q] of prev) if (!now.has(id) && !nearDoorOrEdge(q)) vanish++;
    if (k % 20 === 0) for (const p of w.walkers) {
      const q = now.get(p.id); samples++;
      if (p.state === "standing") standing++;
      if (p.state === "in" || p.state === "out") inOut++;
      if (loaded.roads.some((r) => onRoadSurface(r, q) && !r.pts.some((pt) => pt.bridge && Math.hypot(pt.x - q.x, pt.y - q.y) < 12))) onRoad++;
    }
    minN = Math.min(minN, w.walkers.length); maxN = Math.max(maxN, w.walkers.length);
    prev = now;
  }
  console.log(`${tm.id}: ${net.people} people, ${net.doors.length} doors, ${ends.length} map-edge ends; ${minN}-${maxN} on foot; ${onRoad}/${samples} samples on a road, ${pops} appeared and ${vanish} vanished away from a door or edge; ${(100 * standing / samples).toFixed(0)}% standing, ${(100 * inOut / samples).toFixed(0)}% on a front walk; step ${(ms / (secs / DT) * 1000).toFixed(0)} us`);
}
