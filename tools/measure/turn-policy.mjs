/* THE THREE WAYS A TIGHT CORNER COULD BE DRIVEN, MEASURED (22 October;
   SIMULATOR IN FLIGHT 22, DECISIONS 5.15.12 -- the maintainer's ruling is
   open). Only the turns whose arc today (graph.js "tangent") is tighter
   than a car's lock (TURN_LOCK); the same paths under each policy:
     radius          the arc's radius (three points on it)
     off the lane    where the arc ends, against its exit lane's centre --
                     how wide it finishes
     before the line how far before the stop line the bending begins
                     (searched only within 40 m of the line)
   and, per map, the pairs from the same approach in different lanes that
   the conflict table says meet -- the capacity drain at the crossroads.
   Usage: node tools/measure/turn-policy.mjs */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { graphOf, TURN_LOCK } from "../../src/sim/graph.js";
import { conflictOf } from "../../src/sim/crossing.js";

function radiusOf(p) {
  const pts = p.pts.filter((_, i) => p.at[i] > p.stopAt - 30 && p.at[i] < p.clearAt - 0.01);
  /* The tightest three-point radius along the bend. */
  let r = Infinity;
  for (let i = 2; i < pts.length; i++) {
    const [a, b, c] = [pts[i - 2], pts[i - 1], pts[i]];
    const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
    if (area > 1e-6) r = Math.min(r, (ab * bc * ca) / (4 * area));
  }
  return r;
}
function offLane(p, lane) {
  const i1 = p.at.findIndex((s) => s >= p.clearAt), e = p.pts[i1];
  let best = Infinity;
  for (let j = 1; j < lane.pts.length; j++) {
    const a = lane.pts[j - 1], b = lane.pts[j], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((e.x - a.x) * dx + (e.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a.x + t * dx - e.x, a.y + t * dy - e.y));
  }
  return best;
}
function beforeLine(p) {
  const h = (j) => Math.atan2(p.pts[j].y - p.pts[j - 1].y, p.pts[j].x - p.pts[j - 1].x);
  let j0 = p.at.findIndex((s) => s >= p.stopAt - 40);
  j0 = Math.max(1, j0);
  for (let j = j0 + 1; j < p.pts.length && p.at[j] <= p.clearAt; j++) {
    if (Math.abs(((((h(j) - h(j0)) * 180) / Math.PI + 540) % 360) - 180) > 2) return Math.max(0, p.stopAt - p.at[j - 1]);
  }
  return 0;
}
const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(f * (s.length - 1))] : NaN; };
const rows = {};
const pairs = {};
for (const policy of ["tangent", "wide", "early"]) {
  rows[policy] = { r: [], off: [], before: [] }; pairs[policy] = {};
  for (const m of TEST_MAPS) {
    const loaded = loadMap(m.build());
    const gT = graphOf(loaded), g = policy === "tangent" ? gT : graphOf(loaded, { turn: policy });
    let n = 0;
    for (const [k, spot] of g.at.entries()) {
      const L = spot.layout, LT = gT.at[k].layout;
      for (const [route, p] of Object.entries(L.paths)) {
        if (p.intent !== "left" && p.intent !== "right") continue;
        if (!(radiusOf(LT.paths[route]) < TURN_LOCK - 0.05)) continue;
        const lane = L.legs[p.to]?.outLane;
        rows[policy].r.push(radiusOf(p));
        if (lane) rows[policy].off.push(offLane(p, lane));
        rows[policy].before.push(beforeLine(p));
      }
      const routes = Object.keys(L.paths);
      for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
        const a = L.paths[routes[i]], b = L.paths[routes[j]];
        if (a.from === b.from || a.to === b.to || (L.legs[a.from]?.base ?? a.from) !== (L.legs[b.from]?.base ?? b.from)) continue;
        if (conflictOf(L, routes[i], routes[j]) || conflictOf(L, routes[j], routes[i])) n++;
      }
    }
    pairs[policy][m.id] = n;
  }
}
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "-");
console.log(`the ${rows.tangent.r.length} turns tighter than a car's ${TURN_LOCK} m lock today, the same paths under each policy:`);
console.log(`  policy    radius min/median          finishes off its exit lane, m: median / p90 / max     bends before the line, m: share / max     same-approach conflicting pairs`);
for (const p of ["tangent", "wide", "early"]) {
  const R = rows[p], b = R.before.filter((x) => x > 0.1);
  console.log(`  ${p.padEnd(8)}  ${f2(q(R.r, 0))} / ${f2(q(R.r, 0.5))}                  ${f2(q(R.off, 0.5))} / ${f2(q(R.off, 0.9))} / ${f2(Math.max(...R.off))}                          ${(100 * b.length / R.before.length).toFixed(0)}% / ${f2(Math.max(0, ...b))}                   ${Object.entries(pairs[p]).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
}
