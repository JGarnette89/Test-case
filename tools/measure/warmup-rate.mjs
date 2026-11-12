/* THE WARM-UP'S CRASH RATE AGAINST THE RUN'S (12 November, DECISIONS 10.70). NEEDS A TREE BEFORE THE LEAK FIX (the crash list must still hold the warm-up's crashes, on the warm-up's clock) AND ONE HOOK that is not in
   the tree: in `warmed()` in src/sim/crossing.js, after `const shift = w.t;`, add `globalThis.__warmShift = shift; globalThis.__warmActors = w.actors.length;`. It was run in a scratch worktree at the commit before the fix,
   which has been removed. Reads the warm-up's length and the cars on the road when it ended, and the crash list per second of warm-up. Usage: node tools/measure/warmup-rate.mjs MAP CARS FIRST LAST. */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph } from "../../src/sim/crossing.js";
const [mapId = "test-loop", cars = "300", a = "1", b = "50"] = process.argv.slice(2);
const rows = [];
for (let seed = +a; seed <= +b; seed++) {
  const w = seedGraph(seed, 50, loadMap(TEST_MAPS.find((m) => m.id === mapId).build()), { target: +cars, posted: true, perceive: false, brakeReaction: true, walkers: true, rivals: true });
  const list = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-"));
  const route = (id) => w.actors.find((x) => x.id === id)?.route ?? "?";
  rows.push({ seed, warmSecs: +globalThis.__warmShift.toFixed(1), carsAtEnd: globalThis.__warmActors, crashes: list.map((c) => ({ t: +c.t.toFixed(1), frac: +(c.t / globalThis.__warmShift).toFixed(2), route: route(c.a) })) });
}
const secs = rows.reduce((p, r) => p + r.warmSecs, 0), n = rows.reduce((p, r) => p + r.crashes.length, 0);
console.log(JSON.stringify({ map: mapId, cars: +cars, seeds: rows.length, totalWarmSecs: +secs.toFixed(0), meanWarmSecs: +(secs / rows.length).toFixed(1), warmCrashes: n, perSecond: +(n / secs).toExponential(2), perHour: +(n / secs * 3600).toFixed(1), seedsWithCrash: rows.filter((r) => r.crashes.length).length }));
for (const r of rows.filter((x) => x.crashes.length)) console.log(JSON.stringify(r));
