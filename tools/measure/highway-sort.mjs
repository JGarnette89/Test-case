/* DO DRIVERS SORT THEMSELVES INTO LANES BY SPEED? (the lead's hypothesis, 14 November: the inner lane is held 29-36% at about the curb lane's speed on both generated roads, which is the signature of an UNSORTED road).
   Three things, through traffic on the multi-lane spans only (cars bound for an exit ramp left out), the played world:
   1. the Spearman correlation of a car's WANTED speed (v0) with its lane position (0 = inner), in 60 s windows after the warm-up -- negative is sorted, zero is not;
      and the mean lane by wanted-speed tercile (slow / middle / fast);
   2. lane changes per car-minute, by kind (discretionary = the overtake; keep-right; for a turn), and how many car-seconds were HELD (headway under 2 s, under 90% of wanted)
      for each discretionary change;
   3. the same on the endless loop, which does sort (108/104/96 km/h by lane), as the control.
   Usage: node tools/measure/highway-sort.mjs <mapId> [cars] [seed=1] [seconds=300] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { carsFor } from "../../src/map/cars.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
/* THE PLAYED WORLD, stated here so this script stands on its own: what worldFor (scene.js) turns on. */
const playedGraph = (seed, kmh, loaded, o = {}) => seedGraph(seed, kmh, loaded, { posted: true, walkers: true, rivals: true, brakeReaction: true, ...o });
const [id, carsArg, seedArg = "1", secsArg = "300", spawnSort] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build()), cars = carsArg ? +carsArg : carsFor(loaded);
const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const pearson = (a, b) => { const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb || 1); };
const spearman = (a, b) => (a.length < 10 ? NaN : pearson(rank(a), rank(b)));
let w = playedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, ...(spawnSort != null ? { spawnSort: +spawnSort } : {}) });
for (let i = 0; i < 3600; i++) w = step(w);
const win = [], lcs = { discretionary: 0, keepRight: 0, turn: 0 }; let heldSecs = 0, carSecs = 0, cur = { v0: [], pos: [] };
const all = { v0: [], pos: [] };
for (let i = 0; i < +secsArg * 20; i++) {
  const before = w; w = step(w);
  for (const a of w.actors) {
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p?.from];
    if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > p.stopAt || a.crash) continue;
    const exitBound = /^offb?-/.test(L.legs[p.to]?.road ?? "");
    if (exitBound) continue;
    if (a.lc && a.lc.at === before.t && !a.lc.abort) {
      const was = before.actors.find((b) => b.id === a.id);
      if (a.keptRight !== was?.keptRight) lcs.keepRight++; else if (was?.want && was.want.k === was.k) lcs.turn++; else lcs.discretionary++;
    }
    if (i % 20 === 0) {
      carSecs++; const pos = leg.pos ?? leg.lane ?? 0;
      if (a.headway != null && a.v < 0.9 * a.v0 && a.headway / Math.max(a.v, 1) < 2) heldSecs++;
      cur.v0.push(a.v0); cur.pos.push(pos); all.v0.push(a.v0); all.pos.push(pos);
    }
  }
  if (i % 1200 === 1199) { win.push(cur); cur = { v0: [], pos: [] }; }
}
const mins = carSecs / 60;
console.log(`${id}, ${cars} cars, seed ${seedArg}${spawnSort != null ? `, spawnSort ${spawnSort}` : ""}: ${carSecs} through car-seconds on multi-lane road`);
console.log(`  Spearman(wanted speed, lane position) by 60 s window: ${win.map((x) => spearman(x.v0, x.pos).toFixed(2)).join("  ")}   (negative = fast drivers in the inner lanes; 0 = unsorted)   overall ${spearman(all.v0, all.pos).toFixed(2)}`);
const order = all.v0.map((v, i) => [v, all.pos[i]]).sort((a, b) => a[0] - b[0]), third = Math.floor(order.length / 3);
const mean = (xs) => (xs.reduce((s, x) => s + x[1], 0) / Math.max(1, xs.length)).toFixed(2);
console.log(`  mean lane position by wanted-speed tercile: slowest ${mean(order.slice(0, third))}, middle ${mean(order.slice(third, 2 * third))}, fastest ${mean(order.slice(2 * third))}   (curb is the highest number)`);
console.log(`  lane changes per car-minute: discretionary (the overtake) ${(lcs.discretionary / mins).toFixed(3)}, keep-right ${(lcs.keepRight / mins).toFixed(3)}, for a turn ${(lcs.turn / mins).toFixed(3)}; held car-seconds per discretionary change ${(heldSecs / Math.max(1, lcs.discretionary)).toFixed(1)} (${(100 * heldSecs / carSecs).toFixed(1)}% of car-seconds held)`);
