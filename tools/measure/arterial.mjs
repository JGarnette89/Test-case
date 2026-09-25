/* THE BIG ARTERIAL AT E, IN TRAFFIC (25 September): does anybody drive
   through anybody, do the lefts use the bays, how many turns are missed,
   and what the arrows do. Every overlap anywhere on the map is counted
   and those at E named, since E is the new thing.
   Run: node tools/measure/arterial.mjs [target] [seconds] [seeds...]
   SIMULATOR.md 1.1.18. */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step, overlapping } from "../../src/sim/crossing.js";
const [target = 300, secs = 180, ...seedArgs] = process.argv.slice(2).map(Number);
const seeds = seedArgs.length ? seedArgs : [3, 4, 5];
const loaded = loadMap(testMap1());
const total = { overlaps: 0, atE: 0, leftsE: 0, leftsFromBay: 0, rightsE: 0, rightsFromBay: 0, missed: 0, met: 0, turnChanges: 0, tickMs: [] };
const examples = [];
for (const seed of seeds) {
  let w = seedGraph(seed, 50, loaded, { target, posted: true });
  const kE = w.course.at.findIndex((s) => Object.values(s.layout.legs).some((l) => l.road === "E-north"));
  const counted = new Set();
  const lastSeen = new Map();
  for (let i = 0; i < 20 * secs; i++) {
    const a = performance.now(); w = step(w); total.tickMs.push(performance.now() - a);
    if (i % 5 === 0) {
      for (const { a: p, b: q } of overlapping(w)) {
        total.overlaps++;
        const A = w.actors.find((x) => x.id === p), B = w.actors.find((x) => x.id === q);
        if ((A?.k ?? -1) === kE || (B?.k ?? -1) === kE) { total.atE++; if (examples.length < 6) examples.push(`seed ${seed} t=${w.t.toFixed(1)} ${A?.route} s=${A?.s?.toFixed(1)} v=${A?.v?.toFixed(1)} | ${B?.route} s=${B?.s?.toFixed(1)} v=${B?.v?.toFixed(1)}`); }
      }
    }
    for (const a of w.actors) {
      const key = `${seed}/${a.id}`;
      lastSeen.set(key, a);
      if ((a.k ?? 0) !== kE || counted.has(`${key}@${a.route}`)) continue;
      const L = w.course.at[kE].layout, p = L.paths[a.route];
      if (!p || a.s < p.stopAt) continue;   // count each movement once, as it enters the box
      counted.add(`${key}@${a.route}`);
      const leg = L.legs[p.from];
      if (p.intent === "left") { total.leftsE++; if (leg.bay) total.leftsFromBay++; }
      if (p.intent === "right") { total.rightsE++; if (leg.bay) total.rightsFromBay++; }
    }
  }
  for (const a of lastSeen.values()) { total.missed += a.missedTurns ?? 0; total.met += a.turnsMet ?? 0; total.turnChanges += a.turnChanges ?? 0; }
}
total.tickMs.sort((x, y) => x - y);
const q = (f) => total.tickMs[Math.floor(f * (total.tickMs.length - 1))].toFixed(2);
console.log(`target ${target}, ${secs}s x seeds ${seeds.join(",")}`);
console.log(`  overlapping car-ticks (sampled every 5th tick): ${total.overlaps} on the map, ${total.atE} at E`);
for (const e of examples) console.log(`    ${e}`);
console.log(`  lefts through E: ${total.leftsE}, from a bay ${total.leftsFromBay}; rights: ${total.rightsE}, from a bay ${total.rightsFromBay}`);
console.log(`  turns met by changing lane ${total.met}, missed ${total.missed} (whole map, last-seen actors)`);
console.log(`  sim tick median ${q(0.5)} ms, p95 ${q(0.95)} ms`);
