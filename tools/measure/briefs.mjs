/* Maps from briefs: for each sample request, what came out -- measured
   from the loaded map -- how long it took, whether the sim takes the
   graph, and a stretch of traffic on it.
   Usage: node tools/measure/briefs.mjs [seconds=60] */
import { mapFromBrief } from "../../src/map/brief.js";
import { loadMap } from "../../src/map/load.js";
import { graphOf } from "../../src/sim/graph.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";

const secs = Number(process.argv[2] ?? 60);
const BRIEFS = [
  { arterials: "long", signals: 3 },
  { downtown: true, size: "medium" },
  { everyType: true },
  { buses: true, arterials: "cross", drivers: "mixed" },
];
for (const b of BRIEFS) {
  const t0 = performance.now();
  const m = mapFromBrief(b, 1);
  const ms = performance.now() - t0;
  const L = loadMap(m), g = graphOf(L);
  let w = seedGraph(1, 50, L, { every: 2.0, target: 80, posted: true, buses: b.buses ? 0.1 : undefined });
  for (let i = 0; i < secs / DT; i++) w = step(w);
  const veh = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped") && !String(c.b).startsWith("ped")).length;
  console.log(JSON.stringify(b), `-> ${m.name}: ${ms.toFixed(0)} ms, graph errors ${g.errors.length}${g.errors.length ? " " + g.errors.slice(0, 2).map((e) => e.code ?? e.message ?? JSON.stringify(e)).join("; ") : ""}, ${w.actors.length} cars after ${secs}s, ${veh} vehicle crashes`);
  const r = m.report;
  console.log(`   signals ${r.signals}, types ${JSON.stringify(r.types)}, arterial ${r.arterialKm} km (longest ${r.longestArterialKm}), crosswalks ${r.crosswalks}, stops ${JSON.stringify(r.stops)}, streets ${r.streets}, warnings ${r.warnings}; missing: ${r.missing.join("; ") || "nothing"}`);
  console.log(`   sections: ${m.sections.map((s) => s.id + (s.start ? "*" : "")).join(", ")}`);
}
