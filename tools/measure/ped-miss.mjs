/* Drivers who look away, against people on foot: how often somebody is struck,
   and that every strike is a recorded crash. Run: node tools/measure/ped-miss.mjs [secs] [perceive 1|0] [seed] */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { testPeds } from "../../src/map/samples.js";
import { touching } from "./peds.mjs";
import { DT } from "../../src/sim/traffic.js";
const secs = Number(process.argv[2] ?? 300), perceive = process.argv[3] !== "0", seed = Number(process.argv[4] ?? 3);
let w = seedGraph(seed, 50, loadMap(testPeds()), { target: 60, posted: true, perceive });
let silent = 0, across = 0;
const struck = new Set();
for (let i = 0; i < secs / DT; i++) {
  const before = new Map((w.peds ?? []).map((q) => [q.id, q]));
  w = step(w);
  const now = new Set((w.peds ?? []).map((q) => q.id));
  for (const q of w.peds ?? []) if (q.state === "leaving" && before.get(q.id)?.state === "crossing") across++;
  for (const q of w.peds ?? []) if (q.state === "struck") struck.add(q.id);
  silent += touching(w).length;
}
const pedCrashes = (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-")).length;
console.log(`seed ${seed}, perceive ${perceive}, ${secs}s: ${across} people across, ${struck.size} struck, ${pedCrashes} logged as crashes, silent touches ${silent}, all crashes ${(w.crashes ?? []).length}`);
