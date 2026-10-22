/* TURN PATHS ACROSS EVERY MAP (22 October; SIMULATOR IN FLIGHT 22). On test
   map 1's skewed approach a right-turner from the curb lane and a
   left-turner from the inner lane of the SAME approach are in the conflict
   table, so one waits on the other. Is that one junction or a class? For
   every test map, every node, every turn path: the angle turned and the
   arc's radius against a car's full lock (5.5 m, the old engine's
   TURN_R_MIN); and every pair of paths from the same approach, in
   different lanes, that the conflict table says meet -- which two lanes of
   one approach never should. Per pair: the two movements, each one's angle
   and radius.
   Usage: node tools/measure/turn-audit.mjs [maps=all] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { graphOf } from "../../src/sim/graph.js";
import { conflictOf } from "../../src/sim/crossing.js";

const LOCK = 5.5;
const want = (process.argv[2] ?? "all").split(",");
const maps = TEST_MAPS.filter((m) => want.includes("all") || want.includes(m.id));
/* The arc's radius, read from the path itself: three points on the arc. */
function radiusOf(p) {
  const pts = p.pts.filter((_, i) => p.at[i] > p.stopAt + 0.01 && p.at[i] < p.clearAt - 0.01);
  if (pts.length < 3) return Infinity;
  const [a, b, c] = [pts[0], pts[Math.floor(pts.length / 2)], pts[pts.length - 1]];
  const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  return area < 1e-6 ? Infinity : (ab * bc * ca) / (4 * area);
}
function angleOf(p) {
  const i0 = p.at.findIndex((s) => s >= p.stopAt), i1 = p.at.findIndex((s) => s >= p.clearAt);
  const a = p.pts[Math.max(0, i0 - 1)], b = p.pts[i0], c = p.pts[i1], d = p.pts[Math.min(p.pts.length - 1, i1 + 1)];
  const h0 = Math.atan2(b.y - a.y, b.x - a.x), h1 = Math.atan2(d.y - c.y, d.x - c.x);
  return Math.abs(((((h1 - h0) * 180) / Math.PI + 540) % 360) - 180);
}
let totalTurns = 0, tight = 0, pairsAll = 0;
for (const m of maps) {
  const g = graphOf(loadMap(m.build()));
  let turns = 0, under = 0;
  const pairs = [];
  for (const [k, spot] of g.at.entries()) {
    const L = spot.layout;
    for (const [r, p] of Object.entries(L.paths)) {
      if (p.intent === "left" || p.intent === "right") { turns++; if (radiusOf(p) < LOCK) under++; }
    }
    const routes = Object.keys(L.paths);
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
      const p = L.paths[routes[i]], q = L.paths[routes[j]];
      if (p.from === q.from || (L.legs[p.from]?.base ?? p.from) !== (L.legs[q.from]?.base ?? q.from)) continue;
      if (!conflictOf(L, routes[i], routes[j]) && !conflictOf(L, routes[j], routes[i])) continue;
      if (p.to === q.to) continue;   // bound for the same lane: a merge, not this
      pairs.push(`node ${k}: ${p.intent} from lane ${L.legs[p.from]?.pos} (${angleOf(p).toFixed(0)} deg, r ${radiusOf(p).toFixed(1)} m) x ${q.intent} from lane ${L.legs[q.from]?.pos} (${angleOf(q).toFixed(0)} deg, r ${radiusOf(q).toFixed(1)} m)`);
    }
  }
  totalTurns += turns; tight += under; pairsAll += pairs.length;
  console.log(`${m.id}: ${g.at.length} nodes, ${turns} turn paths, ${under} tighter than a car's ${LOCK} m lock; ${pairs.length} same-approach pairs in different lanes that conflict`);
  for (const s of pairs.slice(0, 8)) console.log("   " + s);
  if (pairs.length > 8) console.log(`   ... and ${pairs.length - 8} more`);
}
console.log(`ALL: ${totalTurns} turn paths, ${tight} under lock; ${pairsAll} conflicting same-approach pairs`);
