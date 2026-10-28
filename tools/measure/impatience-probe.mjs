/* REQUIRES the probe patch (tools/scratch/kr/patch-probe2.mjs, never committed): world.impProbe computes impatience's two decisions and discards them, so the world is identical and the time is the evaluation alone. Usage: node tools/measure/impatience-probe.mjs map cars */
/* PROBE, not a build: does reading impatience from quantities already in hand move the step cost? */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const L = loadMap(TEST_MAPS.find((t) => t.id === process.argv[2]).build()), cars = Number(process.argv[3]);
const run = (probe) => {
  let w = seedGraph(1, 50, L, { every: 2.0, target: cars, posted: true });
  w = { ...w, impProbe: probe, aggression: 0.6 };
  for (let i = 0; i < 60 / DT; i++) w = step(w);
  const seen = new Set(); let ms = 0;
  for (let i = 0; i < 60 / DT; i++) { const t0 = performance.now(); w = step(w); ms += performance.now() - t0; for (const a of w.actors) if (a.lc) seen.add(a.id + "@" + a.lc.at); }
  return { ms: ms / (60 / DT), changes: seen.size, cars: w.actors.length, pos: w.actors.reduce((t, a) => t + a.s, 0) };
};
const res = { off: [], on: [] };
for (let k = 0; k < 5; k++) { res.off.push(run(false)); res.on.push(run(true)); }
const m = (xs) => xs.reduce((a, x) => a + x.ms, 0) / xs.length;
console.log(JSON.stringify({ map: process.argv[2], cars, offMs: res.off.map((x) => +x.ms.toFixed(2)), onMs: res.on.map((x) => +x.ms.toFixed(2)), meanOff: +m(res.off).toFixed(2), meanOn: +m(res.on).toFixed(2), changesOff: res.off[0].changes, changesOn: res.on[0].changes, sameWorld: res.on[0].pos === res.off[0].pos, evaluations: globalThis.__sink }));
