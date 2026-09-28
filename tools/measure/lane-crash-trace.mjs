/* The one lane-change crash in verify-lanes' seed-9 run at 200 cars:
   both cars, tick by tick, for the five seconds before contact.
   Run: node tools/measure/lane-crash-trace.mjs [a] [b] [t] */
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";

const [A, B, T] = [process.argv[2] ?? "car-187", process.argv[3] ?? "car-352", Number(process.argv[4] ?? 109.35)];
let w = seedGraph(9, 50, seedLoaded(), { target: 200, posted: true });
function seedLoaded() { return loadMap(testMap1()); }
while (w.t < T - 5) w = step(w);
while (w.t < T + 0.1) {
  w = step(w);
  const row = [A, B].map((id) => {
    const a = w.actors.find((q) => q.id === id);
    if (!a) return `${id} --`;
    const p = poseOf(w, a);
    const lc = a.lc ? `lc{from ${a.lc.from.split("/")[0]} t0 ${a.lc.t0.toFixed(2)}${a.lc.missed ? " MISSED" : ""}${a.lc.abort ? " ABORT" : ""}}` : "";
    return `${id} k${a.k} ${a.route.split("/")[0]}->${a.route.split("/")[1]} s${a.s.toFixed(1)} v${a.v.toFixed(1)} a${(a.a ?? 0).toFixed(1)} xy(${p.x.toFixed(1)},${p.y.toFixed(1)}) ${lc}${a.crash ? " CRASH" : ""}`;
  });
  if (Math.round(w.t * 20) % 5 === 0 || w.t > T - 0.6) console.log(`t${w.t.toFixed(2)}  ${row.join("  |  ")}`);
}
