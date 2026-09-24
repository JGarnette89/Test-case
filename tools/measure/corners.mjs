/* TRAFFIC THROUGH CORNERS, controlled: the same world with cars slowing
   for corners and without -- harsh braking, the speed turning cars carry
   into the arc, and touching -- on the signalised crossroads (where lane
   changes exposed it) and on the test map. Run: node
   tools/measure/corners.mjs. SIMULATOR.md 1.1.14. */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step, overlapping } from "../../src/sim/crossing.js";
import { HARSH_AT } from "../../src/sim/traffic.js";
import { cornerOf } from "../../src/sim/corner.js";
const line = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: 0 }));
const m = emptyMap("s", "s"); m.bounds = { x: 0, y: 0, w: 1000, h: 1000 }; const c = { x: 500, y: 500 };
for (const [id, far] of [["N", { x: 500, y: 100 }], ["S", { x: 500, y: 900 }], ["E", { x: 900, y: 500 }], ["W", { x: 100, y: 500 }]]) m.roads.push(road({ id, kind: "collector", points: line(far, c), control: { start: "none", end: "signal" } }));
const pct = (xs, q) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN; };
for (const [name, loaded, opts] of [["signal crossroads", loadMap(m), { every: 1.6 }], ["test map, 120 cars", loadMap(testMap1()), { target: 120, posted: true }]]) {
  for (const corners of [false, true]) {
    let w = seedGraph(4, 50, loaded, { ...opts, corners });
    let harsh = 0, ticks = 0, ov = 0, done = 0;
    const entry = { left: [], right: [] }, overClean = { left: 0, right: 0 };
    for (let i = 0; i < 20 * 300; i++) {
      const prev = new Map(w.actors.map((a) => [a.id, a]));
      w = step(w); ticks += w.actors.length;
      if (i % 5 === 0) ov += overlapping(w).length;
      for (const a of w.actors) {
        if (-(a.a ?? 0) > HARSH_AT) harsh++;
        const p = w.course.at[a.k].layout.paths[a.route], cn = cornerOf(p), was = prev.get(a.id);
        if (cn && was && was.k === a.k && was.s < cn.from && a.s >= cn.from && entry[p.intent]) { entry[p.intent].push(a.v * 3.6); if (a.v > cn.grip + 0.01) overClean[p.intent]++; }
        if (was && was.k !== a.k) done++;
      }
    }
    const say = (k) => `${k}s into the arc at median ${pct(entry[k], 0.5).toFixed(0)}, p95 ${pct(entry[k], 0.95).toFixed(0)}, max ${Math.max(...entry[k]).toFixed(0)} km/h (${overClean[k]} of ${entry[k].length} past grip)`;
    console.log(`${name}, corners ${corners ? "on " : "off"}: harsh ${harsh} car-ticks (${((100 * harsh) / ticks).toFixed(3)}%) | ${say("left")} | ${say("right")} | ${done} nodes passed | overlapping car-ticks (sampled) ${ov}`);
  }
}
