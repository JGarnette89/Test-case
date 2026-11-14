/* IS THE 2 m/s THE LOCK (the lead, 14 November)? laneStep (lanechange.js) lets a held car change lane only if the best adjacent lane is faster by LC_GAIN x caution: gain = there - here, where here = min(wanted, leader's speed) and there = min(wanted, the speed of the next lane's leader within 4 s of its wanted speed) or its wanted speed if that lane is clear that far.
   Computed here from the poses, the same way, for every HELD car (headway under 2 s, under 90% of wanted; through traffic on multi-lane road), once a second:
   the distribution of the best gain on offer in either adjacent lane against the car's own threshold, and whether a change then began within 5 s, for those who qualified and those who did not.
   The comparison "my speed here against my wanted speed there" is also printed: how often a held car's neighbouring lane has a leader slower than ITS OWN leader (a negative gain) -- the lane really is no better.
   Usage: node tools/measure/held-gain.mjs <mapId> [cars] [seed=1] [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { laneSpan } from "../../src/sim/course.js";
import { LC_GAIN } from "../../src/sim/lanechange.js";
const [id, carsArg, seedArg = "1", secsArg = "300"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), cars = carsArg ? +carsArg : carsFor(loaded);
let w = seedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true, rivals: true, brakeReaction: true });
for (let i = 0; i < 3600; i++) w = step(w);
const edges = [-Infinity, -2, 0, 1, 2, 4, 8, Infinity], hist = edges.slice(1).map(() => 0);
let held = 0, qual = 0, qualChanged = 0, nonChanged = 0, nonQual = 0, noNeighbour = 0, lcStarts = new Map(), pending = [];
const labels = ["< -2", "-2..0", "0..1", "1..2", "2..4", "4..8", ">= 8"];
for (let i = 0; i < +secsArg * 20; i++) {
  const before = w; w = step(w);
  for (const a of w.actors) if (a.lc && a.lc.at === before.t && !a.lc.abort) lcStarts.set(a.id, w.t);
  if (i % 20) continue;
  const lanes = new Map(), info = new Map();
  for (const a of w.actors) {
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p?.from];
    if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > p.stopAt || a.crash) continue;
    const span = laneSpan(w.course, a.k ?? 0, a.route, a.s)[0];
    const group = span.lane.split("#")[0], pos = leg.pos ?? leg.lane ?? 0, exitBound = /^offb?-/.test(L.legs[p.to]?.road ?? "");
    info.set(a.id, { a, group, pos, along: span.along, exitBound, lanes: leg.across ?? leg.lanes });
    const key = `${group}|${pos}`; (lanes.get(key) ?? lanes.set(key, []).get(key)).push(info.get(a.id));
  }
  for (const xs of lanes.values()) xs.sort((a, b) => a.along - b.along);
  const ahead = (x, key) => { const xs = lanes.get(key); if (!xs) return null; for (const o of xs) if (o.along > x.along + 0.5 && o.a.id !== x.a.id) return o; return null; };
  for (const x of info.values()) {
    const a = x.a; if (x.exitBound) continue;
    if (!(a.headway != null && a.v < 0.9 * a.v0 && a.headway / Math.max(a.v, 1) < 2)) continue;
    held++;
    const want = a.v0, look = Math.max(30, want * 4), lead = ahead(x, `${x.group}|${x.pos}`);
    const here = Math.min(want, lead && lead.along - x.along < look ? lead.a.v : want);
    let best = null;
    for (const dp of [-1, 1]) { const np = x.pos + dp; if (np < 0 || np >= x.lanes) continue; const nb = ahead(x, `${x.group}|${np}`); const there = nb && nb.along - x.along < look ? Math.min(want, nb.a.v) : want; const g = there - here; if (best == null || g > best) best = g; }
    if (best == null) { noNeighbour++; continue; }
    hist[edges.slice(1).findIndex((e) => best < e)]++;
    const thr = LC_GAIN * Math.max(0.2, a.caution ?? 1), q = best >= thr;
    pending.push({ id: a.id, t: w.t, q });
    if (q) qual++; else nonQual++;
  }
  pending = pending.filter((p) => { if (w.t - p.t < 5) return true; const s = lcStarts.get(p.id); const did = s != null && s >= p.t && s <= p.t + 5; if (p.q) { if (did) qualChanged++; } else if (did) nonChanged++; return false; });
}
const tot = hist.reduce((s, x) => s + x, 0);
console.log(`${id}, ${cars} cars: ${held} held car-seconds sampled (${noNeighbour} with no adjacent lane); best gain on offer in either adjacent lane, m/s (LC_GAIN ${LC_GAIN} x the car's caution is its bar)`);
console.log("  " + hist.map((n, i) => `${labels[i]}: ${(100 * n / tot).toFixed(0)}%`).join("   "));
console.log(`  qualified (best gain at or above the bar): ${(100 * qual / tot).toFixed(0)}% of held car-seconds; a change began within 5 s for ${(100 * qualChanged / Math.max(1, qual - 0)).toFixed(0)}% of those, and for ${(100 * nonChanged / Math.max(1, nonQual)).toFixed(0)}% of the ones that did not qualify`);
