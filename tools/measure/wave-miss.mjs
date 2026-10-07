/* Why the bench's wave does not land: for cars released by a timed light by
   the timed exit, the real travel time to the next timed line against the
   time the offsets assumed, and the light they find 60 m out. */
import { loadMap } from "../../src/map/load.js";
import { mapFromBrief } from "../../src/map/brief.js";
import { graphOf } from "../../src/sim/graph.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { lightAt } from "../../src/sim/signal.js";
import { BENCH_BRIEF } from "../../src/iso/bench.js";
const id = process.argv[2] ?? "bench";
const raw = id === "long" ? mapFromBrief({ arterials: "long", signals: 3 }, 1) : id === "highway" ? (await import("../../src/map/samples.js")).testHighway() : mapFromBrief(BENCH_BRIEF, 1);
const loaded = loadMap(raw);
const g = graphOf(loaded);
const edges = g.waves.tree;
let w = seedGraph(1, 50, loaded, { every: 2.0, target: 120, posted: true });
const left = new Map(), seen = new Set(), rows = [];
for (let i = 0; i < 15 * 60 * 20; i++) {
  w = step(w);
  for (const a of w.actors) {
    const k = a.k ?? 0, L = w.course.at[k].layout, p = L.paths[a.route];
    if (!p) continue;
    const inBase = L.legs[p.from]?.base, outBase = L.legs[p.to]?.base;
    for (const e of edges) {
      if (k === e.to && inBase === e.toSide) {
        const l = left.get(a.id), key = `${a.id}@${k}@${l?.t}`;
        if (l && l.node === e.from && l.side === e.side && !seen.has(key) && p.stopAt - a.s < 60) {
          seen.add(key);
          rows.push({ edge: `${e.from}->${e.to}`, assumed: e.time, took: w.t - l.t, light: lightAt(L.signal, e.toSide, w.t), v: a.v * 3.6 });
        }
      }
    }
    /* Released: past the line of a signal, leaving by an exit. */
    if (L.signal && a.s > p.stopAt && outBase) { const l = left.get(a.id); if (!l || l.node !== k) left.set(a.id, { node: k, side: outBase, t: w.t }); }
  }
}
const by = {};
for (const r of rows) (by[r.edge] ??= []).push(r);
for (const [edge, rs] of Object.entries(by)) {
  const took = rs.map((r) => r.took).sort((x, y) => x - y), q = (f) => took[Math.floor(f * (took.length - 1))].toFixed(0);
  const lights = rs.reduce((o, r) => ((o[r.light] = (o[r.light] ?? 0) + 1), o), {});
  console.log(`${edge}: assumed ${rs[0].assumed.toFixed(0)} s; took p10 ${q(0.1)} p50 ${q(0.5)} p90 ${q(0.9)} s (${rs.length} cars); light 60 m out: ${JSON.stringify(lights)}; speed there p50 ${rs.map((r) => r.v).sort((x, y) => x - y)[Math.floor(rs.length / 2)].toFixed(0)} km/h`);
}
