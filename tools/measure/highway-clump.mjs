/* IS THE TRAFFIC CLUMPED INTO PLATOONS (the lead, 14 November: typical gaps are a quarter of what a lane change needs while the mean spacing is about 3.6 s, so the traffic must be clumped)?
   For every pair of consecutive cars in one lane (through traffic, multi-lane road, both moving), the TIME headway: bumper-to-bumper-ish distance along the lane over the follower's speed.
   Per 60 s window: pairs, mean headway, the coefficient of variation (1.0 is random spacing, below 1 is more even than random, ABOVE 1 is clumped), the share under 1.5 s and what random spacing at that mean would give (1 - exp(-1.5/mean)), and the share over 8 s.
   Also the headway a car has behind it in the lane NEXT to it, which is what a lane change is refused on (the lag gap): its median, in seconds.
   Usage: node tools/measure/highway-clump.mjs <mapId> [cars] [seed=1] [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { laneSpan } from "../../src/sim/course.js";
const [id, carsArg, seedArg = "1", secsArg = "300", spawnSort] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), cars = carsArg ? +carsArg : carsFor(loaded);
let w = seedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true, rivals: true, brakeReaction: true, ...(spawnSort != null ? { spawnSort: +spawnSort } : {}) });
for (let i = 0; i < 3600; i++) w = step(w);
const wins = []; let cur = { h: [], lag: [] };
for (let i = 0; i < +secsArg * 20; i++) {
  w = step(w);
  if (i % 20 === 0) {
    const lanes = new Map();
    for (const a of w.actors) {
      const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p?.from];
      if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > p.stopAt || a.crash || /^offb?-/.test(L.legs[p.to]?.road ?? "")) continue;
      const span = laneSpan(w.course, a.k ?? 0, a.route, a.s)[0], pos = leg.pos ?? leg.lane ?? 0;
      const key = `${span.lane.split("#")[0]}|${pos}`; (lanes.get(key) ?? lanes.set(key, []).get(key)).push({ a, along: span.along, pos, group: span.lane.split("#")[0], n: leg.across ?? leg.lanes });
    }
    for (const xs of lanes.values()) xs.sort((p, q) => p.along - q.along);
    for (const xs of lanes.values()) for (let k = 1; k < xs.length; k++) { const f = xs[k - 1], l = xs[k], v = f.a.v; if (v > 3 && l.a.v > 3) cur.h.push(Math.max(0, l.along - f.along - 4.5) / v); }
    for (const [key, xs] of lanes) for (const f of xs) for (const dp of [-1, 1]) {   // the headway of the nearest car BEHIND f's position in the adjacent lane
      const nk = `${f.group}|${f.pos + dp}`, ys = lanes.get(nk); if (!ys) continue;
      let behind = null; for (const y of ys) if (y.along < f.along) behind = y; else break;
      if (behind && behind.a.v > 3) cur.lag.push(Math.max(0, f.along - behind.along - 4.5) / behind.a.v);
    }
  }
  if (i % 1200 === 1199) { wins.push(cur); cur = { h: [], lag: [] }; }
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length), med = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? NaN;
console.log(`${id}, ${cars} cars, seed ${seedArg}${spawnSort != null ? `, spawnSort ${spawnSort}` : ""}: time headways between consecutive cars in one lane, by 60 s window`);
wins.forEach((x, i) => { const m = mean(x.h), sd = Math.sqrt(mean(x.h.map((v) => (v - m) ** 2))); console.log(`  window ${i + 1}: ${x.h.length} pairs, mean ${m.toFixed(1)} s, CV ${(sd / m).toFixed(2)} (random 1.00), under 1.5 s ${(100 * x.h.filter((v) => v < 1.5).length / x.h.length).toFixed(0)}% (random at that mean ${(100 * (1 - Math.exp(-1.5 / m))).toFixed(0)}%), over 8 s ${(100 * x.h.filter((v) => v > 8).length / x.h.length).toFixed(0)}% (random ${(100 * Math.exp(-8 / m)).toFixed(0)}%); headway behind in the NEXT lane: median ${med(x.lag).toFixed(1)} s`); });
