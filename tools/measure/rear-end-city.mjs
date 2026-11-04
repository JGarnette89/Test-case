/* THE CITY'S CAR-ON-CAR CRASHES: HOW MANY ARE A FOLLOWER RUNNING INTO A CAR BRAKING? (5 November; DECISIONS 10.44 item 0, RE4.) Every crash between two vehicles, read from the tick before and the 3 s before: in one lane (occupancy.js), one behind the other, and how hard the one ahead was braking. Also every moment anybody at all braked past 5.4 m/s^2 with a car behind within 15 m, and what became of the car behind.
   Usage: node rear-end-city.mjs seeds(comma) [cars=150] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, layoutOf, poseOf } from "../../src/sim/crossing.js";
import { sharesLane } from "../../src/sim/occupancy.js";
import { DT, lenOf } from "../../src/sim/traffic.js";
import { followerOf } from "../../src/sim/courtesy.js";
const [seedsArg, carsArg = "150"] = process.argv.slice(2);
const city = loadMap(TEST_MAPS.find((m) => m.id === "city").build());
const out = { seeds: seedsArg, crashes: 0, carOnCar: 0, sameLane: 0, rows: [], hardWithFollower: 0, followerHit: 0, followerHardToo: 0 };
for (const seed of seedsArg.split(",").map(Number)) {
  let w = seedGraph(seed, 50, city, { target: Number(carsArg), posted: true, rivals: true });
  const hist = [], watch = new Map();
  for (let i = 0; i < 600 / DT; i++) {
    const prev = w, n0 = (prev.crashes ?? []).length;
    hist.push(prev); if (hist.length > 61) hist.shift();
    w = step(w);
    for (const c of (w.crashes ?? []).slice(n0)) {
      out.crashes++;
      const A = prev.actors.find((x) => x.id === c.a), B = prev.actors.find((x) => x.id === c.b);
      if (!A || !B) continue;
      out.carOnCar++;
      const L = layoutOf(prev, A), same = (A.k ?? 0) === (B.k ?? 0) && sharesLane(L, A, B);
      if (same) out.sameLane++;
      const [back, front] = A.s < B.s ? [A, B] : [B, A];
      const old = hist[0]?.actors.find((x) => x.id === front.id);
      out.rows.push({ seed, t: +w.t.toFixed(1), same, a: c.a, b: c.b, kinds: [A.kind, B.kind].join("+"), backV: +back.v.toFixed(1), frontV: +front.v.toFixed(1), frontA: +(front.a ?? 0).toFixed(1), frontV3sAgo: old ? +old.v.toFixed(1) : null, lc: !!(A.lc || B.lc) });
      for (const [id, wh] of watch) if ((id === c.a || id === c.b) && w.t - wh <= 5) out.followerHit++;
    }
    if (i % 2) continue;
    for (const a of w.actors) {
      if (a.player || a.crash || -(a.a ?? 0) <= 5.4) continue;
      const f = followerOf(w, a);
      if (f && f.gap < 15 && !watch.has(f.id)) { out.hardWithFollower++; watch.set(f.id, w.t); if (-(f.a ?? 0) > 5.4) out.followerHardToo++; }
    }
    for (const [id, wh] of watch) if (w.t - wh > 5) watch.delete(id);
  }
}
console.log(JSON.stringify(out));
