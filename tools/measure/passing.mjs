/* Going round a stopped bus (passing.js), measured: on the Buses map, the
   same traffic with passing on and off -- passes made, crashes, how hard
   anybody braked, how long cars sat behind a standing bus, and the margin
   each pass left the oncoming traffic, by the passer's confidence.
   Usage: node tools/measure/passing.mjs [minutes=15] [seeds=5,6] [target=90] */
import { loadMap } from "../../src/map/load.js";
import { testBuses } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";

const mins = Number(process.argv[2] ?? 15), seeds = String(process.argv[3] ?? "5,6").split(",").map(Number), target = Number(process.argv[4] ?? 90);
const loaded = loadMap(testBuses());
for (const passing of [false, true]) {
  let passes = 0, crashes = 0, hard = 0, worst = 0, behind = 0;
  const byCaution = [];
  for (const seed of seeds) {
    let w = seedGraph(seed, 50, loaded, { every: 2.0, target, posted: true, buses: 0.3, passing });
    const seen = new Set();
    for (let k = 0; k < (mins * 60) / DT; k++) {
      w = step(w);
      for (const a of w.actors) {
        if (a.pass && !seen.has(a.id + "|" + a.pass.s0)) { seen.add(a.id + "|" + a.pass.s0); passes++; byCaution.push(a.caution ?? 1); }
        if (a.kind !== "bus" && (a.a ?? 0) < -4.5) { hard++; worst = Math.min(worst, a.a); }
      }
      /* Seconds of cars standing within 25 m behind a bus standing at a curb stop. */
      for (const b of w.actors) if (b.kind === "bus" && b.dwellFrom != null && !b.busStop?.bay)
        behind += w.actors.filter((c) => c.kind === "car" && c.k === b.k && c.route === b.route && c.s < b.s && b.s - c.s < 25 && c.v < 0.3).length * DT;
    }
    crashes += (w.crashes ?? []).length;
  }
  byCaution.sort((a, b) => a - b);
  console.log(`passing ${passing ? "on " : "off"}: ${passes} passes over ${seeds.length} x ${mins} min, ${crashes} crashes, ${hard} car-ticks braking past 4.5 m/s^2 (worst ${worst.toFixed(1)}), ${behind.toFixed(0)} car-seconds stood behind a curb bus${passes ? `; passers' caution ${byCaution[0].toFixed(2)}..${byCaution[byCaution.length - 1].toFixed(2)}, median ${byCaution[Math.floor(byCaution.length / 2)].toFixed(2)}` : ""}`);
}
