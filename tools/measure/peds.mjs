/* Pedestrians on a crossroads with a crosswalk on every road end.
   Run: node tools/measure/peds.mjs [secs] [cars] [control stop|none] [seed] */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { seedGraph, step, overlapping, poseOf, pathOf } from "../../src/sim/crossing.js";
import { pedPose, crosswalksOf } from "../../src/sim/peds.js";
import { CAR, DT } from "../../src/sim/traffic.js";

const P = (x, y) => ({ x, y, z: 0 });
export function walkedCrossroads(ctl = "stop") {
  const m = emptyMap("peds-x");
  m.bounds = { x: 0, y: 0, w: 600, h: 600 };
  const cw = { start: false, end: true };
  m.roads.push(
    road({ id: "w", points: [P(0, 300), P(300, 300)], crosswalk: cw }),
    road({ id: "e", points: [P(600, 300), P(300, 300)], crosswalk: cw }),
    road({ id: "n", points: [P(300, 0), P(300, 300)], control: { start: "none", end: ctl }, crosswalk: cw }),
    road({ id: "s", points: [P(300, 600), P(300, 300)], control: { start: "none", end: ctl }, crosswalk: cw }),
  );
  return m;
}
/* Is a pedestrian (a 0.6 m disc) inside a car's footprint? */
export function touching(world) {
  const hits = [];
  for (const p of world.peds ?? []) {
    if (p.state !== "crossing") continue;
    const q = pedPose(world, p);
    for (const a of world.actors) {
      const c = poseOf(world, a), h = (c.rot ?? c.heading ?? 0) * Math.PI / 180;
      const dx = q.x - c.x, dy = q.y - c.y, u = dx * Math.cos(h) + dy * Math.sin(h), v = -dx * Math.sin(h) + dy * Math.cos(h);
      if (Math.abs(u) < CAR.length / 2 + 0.3 && Math.abs(v) < CAR.width / 2 + 0.3) hits.push({ ped: p.id, car: a.id });
    }
  }
  return hits;
}

if (process.argv[1]?.endsWith("peds.mjs") && process.argv[1].includes("measure")) {
  const secs = Number(process.argv[2] ?? 300), cars = Number(process.argv[3] ?? 40), ctl = process.argv[4] ?? "stop", seed = Number(process.argv[5] ?? 3);
  let w = seedGraph(seed, 50, loadMap(walkedCrossroads(ctl)), { target: cars, posted: true });
  let crossed = 0, touch = 0, over = 0, stoppedFor = 0, maxWait = 0, cars0 = 0;
  const seen = new Set();
  for (let i = 0; i < secs / DT; i++) {
    const before = new Map((w.peds ?? []).map((p) => [p.id, p]));
    w = step(w);
    const now = new Set((w.peds ?? []).map((p) => p.id));
    for (const [id, p] of before) if (!now.has(id) && p.state === "crossing") crossed++;
    for (const p of w.peds ?? []) if (p.state === "waiting") maxWait = Math.max(maxWait, w.t - p.since);
    if (i % 5 === 0) { touch += touching(w).length; over += overlapping(w).length; }
    for (const a of w.actors) if (a.v < 0.3 && !seen.has(a.id + "@" + a.k)) {
      /* stopped with a pedestrian holding their way */
    }
  }
  console.log(`${ctl}, ${cars} cars, ${secs}s: ${crosswalksOf(w.course).length} crosswalks, ${crossed} people across, longest wait at the curb ${maxWait.toFixed(1)}s, car-pedestrian touches ${touch}, car overlaps ${over}, crashes ${(w.crashes ?? []).length}, cars on the map ${w.actors.length}`);
}
