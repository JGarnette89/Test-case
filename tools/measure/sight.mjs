/* SIGHT LINES, MEASURED BEFORE BUILT. From the eye of a driver at each
   stop or yield line, how far back along every other approach to that
   intersection can they see before a building's footprint cuts the line
   of sight (plan only, no heights) -- against how far away a car at that
   road's limit is when it is SIX seconds out, about what pulling out
   across it takes. And along the driver's own road: how far back from the
   sign can it first be seen, bends and buildings both.
   Run: node tools/measure/sight.mjs */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { graphOf } from "../../src/sim/graph.js";
import { poseAt } from "../../src/sim/intersection.js";

const NEED_S = 6;
/* Does segment p-q cross building b's footprint? Liang-Barsky in its frame. */
function blocks(b, p, q) {
  const a = (b.heading * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const to = (x, y) => { const dx = x - b.at.x, dy = y - b.at.y; return [dx * c + dy * s, -dx * s + dy * c]; };
  const [u0, v0] = to(p.x, p.y), [u1, v1] = to(q.x, q.y);
  let t0 = 0, t1 = 1;
  const du = u1 - u0, dv = v1 - v0;
  for (const [pp, qq] of [[-du, u0 + b.l / 2], [du, b.l / 2 - u0], [-dv, v0 + b.w / 2], [dv, b.w / 2 - v0]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

for (const id of ["test-1", "city"]) {
  const loaded = loadMap(TEST_MAPS.find((t) => t.id === id).build());
  const course = graphOf(loaded, { lane: 3.6 });
  const props = loaded.props;
  const rows = [], own = [];
  for (const spot of course.at) {
    if (spot.through) continue;
    const L = spot.layout;
    const near = props.filter((b) => Math.hypot(b.at.x - L.place.at.x, b.at.y - L.place.at.y) < 250);
    for (const [legId, leg] of Object.entries(L.legs)) {
      const ctl = L.place.control[legId];
      if (ctl !== "stop" && ctl !== "yield") continue;
      const mine = Object.values(L.paths).find((p) => p.from === legId);
      if (!mine) continue;
      const eye = poseAt(mine, mine.stopAt);
      /* Every other approach, once per road end (its curb lane). */
      for (const [oid, o] of Object.entries(L.legs)) {
        if (o.base === leg.base || !o.curb) continue;
        const theirs = Object.values(L.paths).find((p) => p.from === oid);
        if (!theirs) continue;
        const need = (o.speed ?? 50 / 3.6) * NEED_S;
        let seen = 0, blockedBy = null, cut = false;
        for (let d = 0; d <= Math.min(need, theirs.stopAt); d += 2) {
          const pt = poseAt(theirs, theirs.stopAt - d);
          const b = near.find((q) => blocks(q, eye, pt));
          if (b) { blockedBy = b.id; cut = true; break; }
          seen = d;
        }
        const avail = theirs.stopAt;   // the approach the graph gives: to the seam, or the road's far end
        rows.push({ node: spot.node, from: legId, to: oid, seen, need, avail, cut, blockedBy, ctl });
      }
      /* Own road: the sign from back along the approach. */
      const signAt = mine.stopAt - (leg.sign?.back ?? 0);
      const sp = poseAt(mine, signAt);
      let first = signAt;
      for (let d = 0; d <= Math.min(100, signAt); d += 2) {
        const e = poseAt(mine, signAt - d);
        if (near.some((q) => blocks(q, e, sp))) break;
        first = d;
      }
      own.push({ node: spot.node, leg: legId, seen: first, speed: leg.speed });
    }
  }
  const short = rows.filter((r) => r.cut && r.seen < r.need);
  console.log(`\n${id}: ${props.length} buildings; ${rows.length} (stop/yield line, other approach) pairs`);
  console.log(`  cut short by a building before ${NEED_S} s of the other road: ${short.length}`);
  const bySeen = short.map((r) => r.seen).sort((a, b) => a - b);
  if (short.length) console.log(`  seen instead: min ${bySeen[0]} m, median ${bySeen[Math.floor(bySeen.length / 2)]} m (needed ${Math.round(short[0].need)} m); e.g. ${short.slice(0, 5).map((r) => `${r.from}->${r.to} ${r.seen}m by ${r.blockedBy}`).join("; ")}`);
  const noRoad = rows.filter((r) => !r.cut && r.avail < r.need);
  console.log(`  not cut, but the approach itself is shorter than ${NEED_S} s: ${noRoad.length}`);
  const ownSecs = own.map((o) => o.seen / o.speed).sort((a, b) => a - b);
  console.log(`  own sign, seconds of view from back along the approach (bends and buildings, capped 100 m or the seam): min ${ownSecs[0]?.toFixed(1)} s, p10 ${ownSecs[Math.floor(ownSecs.length / 10)]?.toFixed(1)} s, median ${ownSecs[Math.floor(ownSecs.length / 2)]?.toFixed(1)} s over ${own.length}`);
}
