/* COURTESY GAPS, measured (sim/courtesy.js).
   A. Who is courteous: over the drawn traffic of the highway and the city,
      the share, and what the courteous and the rest look like on the axes.
   B. What it buys: the player on the endless highway, level with a car in
      the lane beside and at its speed, signals to move over (the shared
      trial, courtesy-trial.mjs); time until that lane offers a gap a
      competent driver would take -- `wantedGap` both ways -- with courtesy
      on and off, same seeds, same moments.
   node tools/measure/courtesy.mjs [trials=24] [AB] */
import { loadMap } from "../../src/map/load.js";
import { testLoop, testCityReady } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { courteous } from "../../src/sim/courtesy.js";
import { cautionOf, soundnessOf } from "../../src/core/driver.js";
import { trial } from "./courtesy-trial.mjs";

const TRIALS = +(process.argv[2] ?? 24);
const only = process.argv[3] ?? "AB";

if (only.includes("A")) {
  console.log("A. WHO IS COURTEOUS");
  for (const [name, map, opts] of [["highway", testLoop(), { target: 200, posted: true }], ["city", testCityReady(), { target: 250, posted: true }]]) {
    let w = seedGraph(3, 50, loadMap(map), opts);
    const seen = new Map();
    while (w.t < 400) { w = step(w); if (w.tick % 100 === 0) for (const a of w.actors) if (!a.player && a.ratings) seen.set(a.id, a); }
    const all = [...seen.values()], yes = all.filter(courteous), no = all.filter((a) => !courteous(a));
    const mean = (xs, f) => (xs.reduce((s, a) => s + f(a), 0) / Math.max(1, xs.length)).toFixed(2);
    const bold = (a) => (a.caution ?? cautionOf(a.ratings)) < 0.75, timid = (a) => (a.caution ?? cautionOf(a.ratings)) > 1.25, lowC = (a) => soundnessOf(a.ratings, "compliance") < 0.75;
    console.log(`  ${name}: ${yes.length} of ${all.length} drivers courteous (${((100 * yes.length) / all.length).toFixed(0)}%)`);
    console.log(`    courteous: compliance ${mean(yes, (a) => a.ratings.compliance ?? 1)}, caution ${mean(yes, (a) => a.caution)}, timid ${yes.filter(timid).length}`);
    console.log(`    the rest:  compliance ${mean(no, (a) => a.ratings.compliance ?? 1)}, caution ${mean(no, (a) => a.caution)}; bold ${no.filter(bold).length}, low compliance ${no.filter(lowC).length}, both ${no.filter((a) => bold(a) && lowC(a)).length}`);
  }
}

if (only.includes("B")) {
  console.log("\nB. WHAT IT BUYS: the player level with a car in the lane beside, signalling to move over");
  const loop = loadMap(testLoop());
  const on = [], off = [], cars = [];
  let offers = 0;
  const bases = [];
  for (let i = 0; i < TRIALS; i++) {
    /* Each seed warmed once and carried on 37 s between its trials. */
    let base = bases[i % 6] ?? seedGraph(1 + (i % 6), 50, loop, { target: 200, posted: true });
    while (base.t < 90 + 37 * Math.floor(i / 6)) base = step(base);
    bases[i % 6] = base;
    const r = trial(base, i, true, (was, w) => { for (const c of w.actors) if (c.courtesy && !was.actors.find((x) => x.id === c.id)?.courtesy) offers++; });
    if (r == null) continue;
    on.push(r.t); off.push(trial(base, i, false).t); cars.push(r.car);
  }
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  for (const [m, xs] of [["on", on], ["off", off]]) console.log(`  courtesy ${m}: median ${med(xs).toFixed(2)} s to a gap; within 3 s in ${xs.filter((x) => x <= 3).length} of ${xs.length}; none before the line ${xs.filter((x) => x >= 30).length}`);
  console.log(`  offers ${offers}; on ${on.map((x) => x.toFixed(1)).join(" ")} | off ${off.map((x) => x.toFixed(1)).join(" ")}`);
}
