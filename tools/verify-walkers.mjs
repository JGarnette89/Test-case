/* =====================================================================
   PEOPLE WALKING ALONG (SIMULATOR.md, ambient pedestrians, steps 1-2).

   1. Sidewalks are derived from the road: both sides of every road people
      walk beside, never on any road's surface, and at an intersection
      where every road is walked, every sidewalk end meets another -- the
      corner is covered, nobody walks into a wall of grass.
   2. Walkers keep to the sidewalks and front walks, never on a road; the
      number of people on foot holds all day; nobody appears or vanishes
      anywhere but at a door or where a sidewalk leaves the map; and they
      do come out, go in and stop a while.
   3. The traffic is exactly the traffic it was: a world with walkers is
      tick for tick the same world of cars as one without.

   Usage: node tools/verify-walkers.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { sidewalksOf, onRoadSurface, WALKED } from "../src/map/sidewalks.js";
import { seedWalkers, stepWalkers, walkerPose, walkNetOf } from "../src/sim/walkers.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { DT } from "../src/sim/traffic.js";

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ok  " : "  FAIL"} ${msg}`); if (!cond) fails++; };
const maps = TEST_MAPS.map((tm) => ({ id: tm.id, loaded: loadMap(tm.build()) }));
/* Under a deck is not on it: a sidewalk runs under an overpass. */
const onARoad = (loaded, q, except = null) => loaded.roads.some((r) => r.id !== except && onRoadSurface(r, q) && !r.pts.some((pt) => pt.bridge && Math.hypot(pt.x - q.x, pt.y - q.y) < 12));

console.log("1. sidewalks, derived from the road");
for (const { id, loaded } of maps) {
  const walks = sidewalksOf(loaded);
  let samples = 0, hits = 0;
  for (const w of walks) for (let i = 0; i + 1 < w.pts.length; i++) for (let f = 0; f < 1; f += 0.25) for (const [e, g] of [[w.inner, 0.02], [w.pts, 0], [w.outer, 0]]) {
    const a = e[i], b = e[i + 1], o = w.outer[i], n = w.inner[i];
    /* A curb-edge point is pulled 2 cm toward the far edge, so touching the curb is not lying on the road. */
    const q = { x: a.x + (b.x - a.x) * f + (o.x - n.x) * g, y: a.y + (b.y - a.y) * f + (o.y - n.y) * g };
    samples++;
    if (onARoad(loaded, q, w.road)) hits++;
  }
  ok(hits === 0, `${id}: ${walks.length} sidewalks, ${hits} of ${samples} samples on another road's surface`);
  const walked = loaded.roads.filter((r) => WALKED.has(r.kind));
  const sides = walked.filter((r) => walks.some((w) => w.road === r.id && w.side === "left") && walks.some((w) => w.road === r.id && w.side === "right"));
  ok(sides.length === walked.length, `${id}: ${sides.length} of ${walked.length} walked roads have a sidewalk each side`);
  /* Every end at an intersection whose roads are all walked meets another end. */
  const net = walkNetOf(loaded);
  const kinds = Object.fromEntries(loaded.roads.map((r) => [r.id, r.kind]));
  let ends = 0, dead = 0;
  const deadAt = [];
  for (const n of loaded.nodes) {
    if (!n.legs.every((l) => WALKED.has(kinds[l.road]))) continue;
    net.walks.forEach((w, i) => [0, 1].forEach((e) => {
      const p = w.pts[e === 0 ? 0 : w.pts.length - 1];
      if (Math.hypot(p.x - n.at.x, p.y - n.at.y) > 40) return;
      if (net.edge[i][e]) return;
      ends++;
      if (!net.joins[i][e].length) { dead++; if (deadAt.length < 3) deadAt.push(`${w.id} at ${n.id}`); }
    }));
  }
  ok(dead === 0, `${id}: ${ends - dead} of ${ends} sidewalk ends at walked intersections meet another${deadAt.length ? " -- " + deadAt.join(", ") : ""}`);
}

console.log("2. walkers keep to the sidewalks, and come and go only at doors and the map's edge");
{
  const { loaded } = maps.find((m) => m.id === "city");
  const net = walkNetOf(loaded);
  let w = { course: { map: loaded }, t: 0, ...seedWalkers(loaded, 5) };
  const edges = [];
  net.edge.forEach((e, i) => e.forEach((on, end) => on && edges.push(walkerPose(w, { state: "walking", w: i, s: end ? net.walks[i].length : 0, dir: 1 }))));
  const atDoorOrEdge = (q) => net.doors.some((d) => Math.hypot(d.face.x - q.x, d.face.y - q.y) < 1.5) || edges.some((e) => Math.hypot(e.x - q.x, e.y - q.y) < 2.5);
  let onRoad = 0, samples = 0, pops = 0, vanish = 0, lo = Infinity, hi = 0, wentIn = 0, cameOut = 0, stood = 0;
  let prev = new Map(w.walkers.map((p) => [p.id, { q: walkerPose(w, p), p }]));
  const SECS = 1200;
  for (let k = 0; k < SECS / DT; k++) {
    w = { ...w, ...stepWalkers({ ...w, t: w.t + DT }), t: w.t + DT };
    const now = new Map(w.walkers.map((p) => [p.id, { q: walkerPose(w, p), p }]));
    for (const [id, { q, p }] of now) {
      if (!prev.has(id)) { if (!atDoorOrEdge(q)) pops++; if (p.state === "out") cameOut++; }
      else if (p.state === "standing" && prev.get(id).p.state !== "standing") stood++;
    }
    for (const [id, { q, p }] of prev) if (!now.has(id)) { if (!atDoorOrEdge(q)) vanish++; if (p.state === "in") wentIn++; }
    if (k % 40 === 0) for (const { q } of now.values()) { samples++; if (onARoad(loaded, q)) onRoad++; }
    lo = Math.min(lo, w.walkers.length); hi = Math.max(hi, w.walkers.length);
    prev = now;
  }
  ok(net.people > 100, `the stand-in city has ${net.people} people walking its ${(net.walks.reduce((a, x) => a + x.length, 0) / 1000).toFixed(1)} km of sidewalk`);
  ok(onRoad === 0, `${onRoad} of ${samples} samples of somebody walking along stand on a road`);
  ok(lo === net.people && hi === net.people, `people on foot held at ${net.people} all day (${lo}-${hi} over ${SECS / 60} minutes)`);
  ok(pops === 0 && vanish === 0, `${pops} appeared and ${vanish} vanished anywhere but a door or the map's edge`);
  ok(wentIn > 0 && cameOut > 0 && stood > 0, `in ${SECS / 60} minutes ${cameOut} came out of a door, ${wentIn} went in, and somebody stopped a while ${stood} times`);
}

console.log("3. the traffic is the traffic it was");
{
  const { loaded } = maps.find((m) => m.id === "city");
  let a = seedGraph(4, 50, loaded, { every: 2.0, target: 120, posted: true });
  let b = seedGraph(4, 50, loaded, { every: 2.0, target: 120, posted: true, walkers: true });
  ok(!a.walkers && b.walkers?.length > 0, `walkers are asked for (${b.walkers?.length ?? 0} with, none without)`);
  const key = (w) => JSON.stringify(w.actors.map((x) => [x.id, x.k, x.route, x.s.toFixed(6), x.v.toFixed(6)]));
  let same = key(a) === key(b), ticks = 0;
  for (; ticks < 60 / DT && same; ticks++) { a = step(a); b = step(b); same = key(a) === key(b); }
  ok(same, `a minute of traffic with walkers is tick for tick the traffic without (${ticks} ticks compared)`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
