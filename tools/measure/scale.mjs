/* HOW BIG THE MAPS ARE, against the world SIMULATOR.md aims at (one
   continuous handmade ~8 km^2). Lane-km from the loader; area two ways:
   the map's bounds (what the camera can roam), and the area its roads
   actually cover (the bounding box of every road point). */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS, testCity0 } from "../../src/map/samples.js";
import { mapFromBrief } from "../../src/map/brief.js";
import { BENCH_BRIEF } from "../../src/iso/bench.js";
const rows = [...TEST_MAPS.map((m) => [m.id, m.build()]), ["bench (brief)", mapFromBrief(BENCH_BRIEF, 1)], ["large brief", mapFromBrief({ ...BENCH_BRIEF, size: "large" }, 1)]];
const TARGET = 8;   // km^2
console.log("map                 roads  lane-km  road-km  bounds km^2  roads span km^2  share of 8 km^2  lane-km per km^2");
for (const [id, raw] of rows) {
  const L = loadMap(raw);
  const pts = L.roads.flatMap((r) => r.pts);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const span = ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 1e6;
  const bounds = (L.bounds.w * L.bounds.h) / 1e6;
  const roadKm = L.roads.reduce((s, r) => s + r.length, 0) / 1000;
  console.log(`${id.padEnd(19)} ${String(L.roads.length).padStart(5)}  ${L.laneKm.toFixed(0).padStart(7)}  ${roadKm.toFixed(1).padStart(7)}  ${bounds.toFixed(2).padStart(11)}  ${span.toFixed(2).padStart(15)}  ${(100 * span / TARGET).toFixed(0).padStart(14)}%  ${(L.laneKm / span).toFixed(0).padStart(16)}`);
}
