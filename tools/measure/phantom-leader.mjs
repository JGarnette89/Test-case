/* A LEADER THAT IS NOT THERE (28 October; IN FLIGHT 38 traced). whatStops
   counts two cars from the same leg as sharing a lane for their WHOLE paths,
   past where the paths split, comparing distance along two different paths.
   For every moving car each second: its leader; whether that leader is
   bound for a different leg; and whether it is a PHANTOM -- the straight-line
   distance between the two cars more than 5 m beyond what the gap says (the
   gap plus both half-lengths). With it: the share of those car-seconds braking
   past 3 m/s^2, against the same share with a real leader. Settings stated.
   Usage: node tools/measure/phantom-leader.mjs map cars seed secs */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, whatStops, poseOf } from "../../src/sim/crossing.js";
import { DT, lenOf } from "../../src/sim/traffic.js";
const [id, cars, seed, secs] = process.argv.slice(2);
let w = seedGraph(Number(seed), 50, loadMap(TEST_MAPS.find((t) => t.id === id).build()), { every: 2.0, target: Number(cars), posted: true, ...(process.env.IMPOSED === "0" ? { imposed: false } : {}) });
for (let i = 0; i < 60 / DT; i++) w = step(w);
const C = { samples: 0, withLeader: 0, otherLeg: 0, phantom: 0, phantomHard: 0, realHard: 0, real: 0 };
for (let i = 0; i < Number(secs) / DT; i++) {
  w = step(w);
  if (i % 20) continue;
  const byId = new Map(w.actors.map((a) => [a.id, a]));
  for (const a of w.actors) {
    if (a.player || (a.v ?? 0) < 3) continue;
    C.samples++;
    const v = whatStops(a, w), L = v.leader && byId.get(v.leader.id);
    if (!L) continue;
    C.withLeader++;
    const P = w.course.at[a.k ?? 0].layout.paths, other = (L.k ?? 0) === (a.k ?? 0) && P[L.route] && P[a.route] && P[L.route].to !== P[a.route].to;
    if (other) C.otherLeg++;
    const me = poseOf(w, a), it = poseOf(w, L), straight = Math.hypot(it.x - me.x, it.y - me.y);
    const hard = -(a.a ?? 0) > 3;
    if (straight > v.gap + (lenOf(a) + lenOf(L)) / 2 + 5) { C.phantom++; if (hard) C.phantomHard++; }
    else { C.real++; if (hard) C.realHard++; }
  }
}
const pct = (x, n) => +(100 * x / Math.max(1, n)).toFixed(1);
console.log(JSON.stringify({ map: id, cars: Number(cars), seed: Number(seed), secs: Number(secs), imposed: process.env.IMPOSED !== "0", carSeconds: C.samples, withLeader: C.withLeader, leaderBoundElsewherePct: pct(C.otherLeg, C.withLeader), phantomPct: pct(C.phantom, C.withLeader), hardWhenPhantomPct: pct(C.phantomHard, C.phantom), hardWhenRealPct: pct(C.realHard, C.real), phantoms: C.phantom }));
