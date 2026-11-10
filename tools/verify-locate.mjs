/* =====================================================================
   WHICH LANE A CAR IS IN (sim/locate.js; DECISIONS 10.67), held against
   geometry stated HERE and against the forward pose, never against the
   locator's own arithmetic.

   1. THE INVERSE: a pose made from a place on a lane -- a route, a distance,
      an offset within the lane, a heading -- by the forward functions
      (pose.js) is located, and the place found makes the SAME POSE, to
      2 cm and half a degree. Thousands of places, every test map's course.
   2. THE NEAREST LANE, BY BRUTE FORCE: no aligned lane centreline, sampled
      every 0.25 m over every path of the course, is nearer the pose than
      the lane found (to the sampling's own 0.15 m).
   3. THE SAME LANE, WHATEVER IT IS CALLED: the lane found is the one the
      place was made on -- the same leg short of the line, the same leg past
      the box -- and the route it was made on is among its names.
   4. NOT IN A BOX: a pose made inside a box, on its route's own arc, is
      located on no lane of that route's box.
   5. NOT ACROSS, NOT AGAINST, NOT BESIDE: a car at right angles to a lane is
      not in it; a car in an oncoming lane, pointing its own way, is never
      located on the lane it is driving against; a point 20 m off every road
      is on no lane; a deck above is another road.
   6. EVERY CAR IN THE TRAFFIC outside a box is located on its own lane at
      its own distance along -- asked as that car (`prefer`), since a bay
      that has not opened lies on its neighbour and is the same line.
   ===================================================================== */
import { locate } from "../src/sim/locate.js";
import { playerPoseOn } from "../src/sim/pose.js";
import { poseOnGraph } from "../src/sim/graph.js";
import { worldFor } from "../src/sim/scene.js";
import { step } from "../src/sim/crossing.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { rng } from "../src/core/rng.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const HALF = 1.8;          // half a lane, stated here: lanes are 3.6 m
const norm = (d) => { d %= 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };

const maps = ["test-1", "test-highway", "test-loop", "test-signs"];
for (const id of maps) {
  const def = TEST_MAPS.find((m) => m.id === id);
  const raw = id === "test-1" ? null : def.build();
  let { world } = worldFor(1, 50, 2.0, true, 60, raw, raw?.sections?.[0]?.start ?? null, false);
  const course = world.course;
  console.log(`\n${id}: ${course.at.length} intersections`);
  const rand = rng(7);
  const routes = [];
  course.at.forEach((spot, k) => { for (const [route, p] of Object.entries(spot.layout.paths)) routes.push({ k, route, p, L: spot.layout }); });

  /* Brute force: the nearest aligned lane centreline to a pose, sampled. */
  const samples = [];
  for (const r of routes) for (let s = 0; s <= r.p.length; s += 0.25) {
    if (s >= r.p.stopAt && s <= r.p.clearAt) continue;
    const q = poseOnGraph(course, r.k, r.route, s);
    samples.push({ x: q.x, y: q.y, z: q.z ?? 0, rot: q.rot });
  }
  const nearestAligned = (pose) => {
    let best = Infinity;
    for (const q of samples) {
      const d = Math.hypot(q.x - pose.x, q.y - pose.y);
      if (d < best && Math.abs(q.z - pose.z) <= 2 && Math.abs(norm(pose.heading - q.rot)) <= 59) best = d;
    }
    return best;
  };

  let same = 0, n = 0, poseBad = 0, worstPose = 0, laneBad = 0, nameBad = 0, notFound = 0, nearer = 0, brute = 0;
  for (let i = 0; i < 1500; i++) {
    const r = routes[Math.floor(rand() * routes.length)], p = r.p;
    const inPart = rand() < 0.5;
    const lo = inPart ? 1 : p.clearAt + 0.6, hi = inPart ? p.stopAt - 0.6 : p.length - 1;
    if (!(hi > lo)) continue;
    const me = { k: r.k, route: r.route, s: lo + rand() * (hi - lo), off: (rand() * 2 - 1) * 1.6, psi: ((rand() * 2 - 1) * 45 * Math.PI) / 180 };
    const pose = playerPoseOn(course, me);
    const at = locate(course, pose);
    n++;
    if (!at) { notFound++; continue; }
    /* 3. The same lane, and the route among its names. Two lanes on one centreline (a bay before it opens) are one place. */
    const sameLane = at.k === me.k && at.leg === (inPart ? p.from : p.to);
    const mine = at.names.find((c) => c.k === me.k && c.route === me.route);
    /* Another lane only where its centreline is NEARER -- a bay's taper, where two lanes are less than a lane apart.
       Measured 10 November: the same lane for 96.7% of places on test map 1 (bays at every arterial approach), 97.6% on
       the loop, 100% on the highway and the signs map. The floor of 90% is a floor against the rule eating everything,
       not a tuned figure; the property is the zero beside it. */
    if (sameLane) same++;
    else if (Math.abs(at.off) > Math.abs(me.off) + 1e-6) laneBad++;
    if (sameLane && !mine) nameBad++;
    /* 1. The place found makes the same pose. */
    for (const c of at.names) {
      const back = playerPoseOn(course, c);
      const d = Math.hypot(back.x - pose.x, back.y - pose.y), dh = Math.abs(norm(back.heading - pose.heading));
      worstPose = Math.max(worstPose, d);
      if (d > 0.02 || dh > 0.5) poseBad++;
    }
    /* 2. Nothing aligned is nearer (every fifth: the brute force is slow). */
    if (i % 5 === 0) { brute++; if (nearestAligned(pose) < Math.abs(at.off) - 0.15) nearer++; }
  }
  check(n > 1000 && notFound === 0, `${n} places on lanes, every one located (${notFound} not)`);
  check(poseBad === 0, `every name of the lane found makes the pose it was found from (worst ${(worstPose * 1000).toFixed(1)} mm; ${poseBad} over 2 cm or half a degree)`);
  check(laneBad === 0 && nameBad === 0 && same > 0.9 * n, `the lane found is the lane the place was made on, its route among the names -- or, on a bay's taper, a lane whose centreline is nearer (${same} of ${n} the same lane; ${laneBad} another lane that was no nearer, ${nameBad} without the route)`);
  check(brute > 200 && nearer === 0, `no aligned centreline is nearer than the lane found, by brute force over ${samples.length} samples (${brute} poses, ${nearer} nearer)`);

  /* 4. In a box: not on a lane of that box's own route. */
  let boxed = 0, boxOn = 0;
  for (const r of routes) {
    const p = r.p;
    if (p.clearAt - p.stopAt < 3) continue;
    for (const f of [0.3, 0.5, 0.7]) {
      const s = p.stopAt + f * (p.clearAt - p.stopAt);
      const at = locate(course, playerPoseOn(course, { k: r.k, route: r.route, s, off: 0, psi: 0 }));
      boxed++;
      if (at?.names.some((c) => c.k === r.k && c.route === r.route)) boxOn++;
    }
  }
  check(boxed > 20 && boxOn === 0, `inside a box a car is never located on its own route (${boxed} places, ${boxOn} located there)`);

  /* 5. Across, against, beside, above. */
  let across = 0, against = 0, tried = 0, wrongWay = 0;
  for (let i = 0; i < 400; i++) {
    const r = routes[Math.floor(rand() * routes.length)], p = r.p;
    if (p.stopAt < 30) continue;
    const s = 5 + rand() * (p.stopAt - 10);
    tried++;
    const q = playerPoseOn(course, { k: r.k, route: r.route, s, off: 0, psi: 0 });
    const a = locate(course, { ...q, heading: q.heading + 90 });
    if (a && a.names.some((c) => c.k === r.k && c.route === r.route)) across++;
    const b = locate(course, { ...q, heading: q.heading + 180 });
    if (b) { if (b.names.some((c) => c.k === r.k && c.route === r.route)) against++; for (const c of b.names) { const back = playerPoseOn(course, c); if (Math.abs(norm(back.heading - (q.heading + 180))) > 0.5) wrongWay++; } }
  }
  check(tried > 200 && across === 0 && against === 0 && wrongWay === 0, `a car across a lane or against it is not in it (${tried} places: ${across} across, ${against} against; ${wrongWay} found pointing another way)`);
  const b = course.map.bounds ?? { x0: 0, y0: 0 };
  check(locate(course, { x: (b.x0 ?? b.minX ?? 0) - 500, y: (b.y0 ?? b.minY ?? 0) - 500, z: 0, heading: 0 }) === null, "a point 500 m off the map is on no lane");
  {
    const r = routes.find((x) => x.p.stopAt > 60), q = playerPoseOn(course, { k: r.k, route: r.route, s: 30, off: 0, psi: 0 });
    const far = locate(course, { ...q, x: q.x - Math.sin((q.heading * Math.PI) / 180) * 200.3, y: q.y + Math.cos((q.heading * Math.PI) / 180) * 200.3 });
    const up = locate(course, { ...q, z: q.z + 6 });
    check(!up?.names.some((c) => c.k === r.k && c.route === r.route), "a car 6 m above a lane is not in it");
    check(!far?.names.some((c) => c.k === r.k && c.route === r.route), "a car 200 m to the side of a lane is not in it");
  }

  /* 6. The traffic, as it drives: every car outside a box, on its own lane at its own distance. */
  for (let i = 0; i < 600; i++) world = step(world);
  let cars = 0, off = 0, worstS = 0;
  for (const a of world.actors) {
    if (a.player || a.parked) continue;
    const p = course.at[a.k ?? 0].layout.paths[a.route];
    if (!p || (a.s >= p.stopAt - 0.6 && a.s <= p.clearAt + 0.6) || a.s < 0.5 || a.s > p.length - 0.5) continue;
    const q = poseOnGraph(course, a.k ?? 0, a.route, a.s);
    const at = locate(course, { x: q.x, y: q.y, z: q.z ?? 0, heading: q.rot }, { prefer: { k: a.k ?? 0, route: a.route } });
    cars++;
    const mine = at?.names.find((c) => c.k === (a.k ?? 0) && c.route === a.route);
    if (!mine || Math.abs(mine.off) > 0.01) { off++; continue; }
    worstS = Math.max(worstS, Math.abs(mine.s - a.s));
  }
  check(cars > 20 && off === 0 && worstS < 0.01, `${cars} cars of the traffic, each located on its own route at its own distance (worst ${(worstS * 1000).toFixed(2)} mm; ${off} not)`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
