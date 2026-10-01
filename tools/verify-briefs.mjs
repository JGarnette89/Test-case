/* =====================================================================
   MAPS BUILT TO TEST SOMETHING (map/brief.js).

   1. The same brief and seed make the same map; another seed another.
   2. What a brief asks for is what the map measurably contains, counted
      from the LOADED map: the number of signals asked for, a long
      arterial running the city's width, every intersection type, a
      downtown with crosswalks at its intersections, curb stops and bays.
   3. Each map loads with no graph error, a minute of traffic touches no
      vehicle, and every section it carries is somewhere to look and, with
      a start, somewhere the player can start driving.
   4. A brief the map cannot meet says so: asking a small city for more
      signals than it has crossings is reported short, never claimed.

   Usage: node tools/verify-briefs.mjs
   ===================================================================== */
import { mapFromBrief, typeOfNode } from "../src/map/brief.js";
import { loadMap } from "../src/map/load.js";
import { graphOf } from "../src/sim/graph.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { playerOn } from "../src/sim/drive.js";
import { DT } from "../src/sim/traffic.js";

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ok  " : "  FAIL"} ${msg}`); if (!cond) fails++; };

console.log("1. a map is its brief and its seed");
{
  const a = JSON.stringify(mapFromBrief({ everyType: true }, 3)), b = JSON.stringify(mapFromBrief({ everyType: true }, 3)), c = JSON.stringify(mapFromBrief({ everyType: true }, 4));
  ok(a === b, "the same brief and seed make the same map, byte for byte");
  ok(a !== c, "another seed makes another layout");
}

console.log("2. what was asked for is there -- measured from the loaded map");
const CASES = [
  { brief: { arterials: "long", signals: 3 }, want: (r, L) => r.signals === 3 && r.longestArterialKm >= 1.5, say: (r) => `three signals and a long arterial: ${r.signals} signals, the longest arterial ${r.longestArterialKm} km` },
  { brief: { arterials: "loop", signals: 0 }, want: (r) => r.signals === 0, say: (r) => `no signals when none are asked for: ${r.signals}` },
  { brief: { everyType: true }, want: (r) => ["signal", "signal-arrow", "all-stop", "minor-stop", "minor-yield", "none"].every((t) => r.types[t] > 0), say: (r) => `every intersection type: ${JSON.stringify(r.types)}` },
  { brief: { downtown: true }, want: (r, L) => downtownCovered(L) === 1, say: (r, L) => `downtown: crosswalks at ${(downtownCovered(L) * 100).toFixed(0)}% of its intersections (${r.crosswalks} ends)` },
  { brief: { buses: true, arterials: "cross" }, want: (r) => r.stops.curb > 0 && r.stops.bay > 0, say: (r) => `buses: ${r.stops.curb} curb stops and ${r.stops.bay} bays` },
];
/* Every intersection of three or more roads inside a commercial district has a crosswalk on every leg. */
function downtownCovered(L) {
  const roads = Object.fromEntries(L.roads.map((r) => [r.id, r]));
  const z = L.zones.find((q) => q.kind === "commercial");
  if (!z) return 0;
  const [x0, x1] = [Math.min(...z.polygon.map((p) => p.x)) - 1, Math.max(...z.polygon.map((p) => p.x)) + 1], [y0, y1] = [Math.min(...z.polygon.map((p) => p.y)) - 1, Math.max(...z.polygon.map((p) => p.y)) + 1];
  const inside = L.nodes.filter((n) => n.legs.length >= 3 && n.at.x >= x0 && n.at.x <= x1 && n.at.y >= y0 && n.at.y <= y1);
  const covered = inside.filter((n) => n.legs.every((l) => roads[l.road]?.crosswalk?.[l.end]));
  return inside.length ? covered.length / inside.length : 0;
}
const built = [];
for (const c of CASES) {
  const m = mapFromBrief(c.brief, 1), L = loadMap(m);
  built.push({ c, m, L });
  ok(c.want(m.report, L) && m.report.missing.length === 0, c.say(m.report, L));
  /* The report is the map's, not the plan's: recount the signals from the loaded nodes. */
  const recount = L.nodes.filter((n) => n.legs.length >= 3 && n.legs.every((l) => /^[hv]\d/.test(l.road)) && typeOfNode(L, n).startsWith("signal")).length;
  if (c.brief.signals != null) ok(recount === c.brief.signals, `   recounted from the loaded intersections: ${recount}`);
}

console.log("3. each map drives: no graph error, no vehicle touching, every section opens");
for (const { c, m, L } of built) {
  const g = graphOf(L);
  let w = seedGraph(1, 50, L, { every: 2.0, target: 80, posted: true });
  for (let i = 0; i < 60 / DT; i++) w = step(w);
  const veh = (w.crashes ?? []).filter((q) => !String(q.a).startsWith("ped") && !String(q.b).startsWith("ped")).length;
  const starts = m.sections.filter((s) => s.start);
  const drivable = starts.filter((s) => !!playerOn(w.course, s.start.road, s.start.end, {}));
  const looks = m.sections.every((s) => Number.isFinite(s.look?.x) && Number.isFinite(s.look?.y));
  ok(g.errors.length === 0 && veh === 0 && w.actors.length > 20, `${JSON.stringify(c.brief)}: ${g.errors.length} graph errors, ${veh} vehicle crashes in a minute, ${w.actors.length} on the road`);
  ok(looks && starts.length > 0 && drivable.length === starts.length, `   ${m.sections.length} sections, all somewhere to look; ${drivable.length} of ${starts.length} starts drivable`);
}

console.log("4. a brief the map cannot meet says so");
{
  const m = mapFromBrief({ size: "small", signals: 20 }, 1);
  ok(m.report.signals < 20 && m.report.missing.some((x) => /signals/.test(x)), `a small city asked for 20 signals got ${m.report.signals}, and says: "${m.report.missing.join("; ")}"`);
  ok(m.sections.find((s) => s.id === "whole")?.judge.includes("not got"), "and its whole-map section says what was not got");
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
