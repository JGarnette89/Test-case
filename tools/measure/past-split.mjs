/* WHAT THE LANE-OCCUPANCY FIX REMOVES, COUNTED IN THE OLD WORLD (28 October;
   IN FLIGHT 38's "what moved and why"). Run against a tree that still has the
   old rule (whatStops sharing a lane by origin for the whole path), it counts
   the following decisions whose leader is from the same leg on a DIFFERENT
   route with either car already past where their paths come a lane apart --
   exactly the decisions occupancy.js no longer makes. A world should move if
   and only if this is above zero. The split is borrowed from occupancy.js (it
   reads only the layout's paths). Built as world-hash.mjs builds a world.
   Usage: node tools/measure/past-split.mjs <oldTreeRoot> map secs cars seed trucks */
import { splitOf } from "../../src/sim/occupancy.js";
const [root, map, secs, cars, seed, trucks] = process.argv.slice(2);
const { loadMap } = await import(`file:///${root}/src/map/load.js`);
const { TEST_MAPS } = await import(`file:///${root}/src/map/samples.js`);
const { seedGraph, step, whatStops } = await import(`file:///${root}/src/sim/crossing.js`);
const { DT } = await import(`file:///${root}/src/sim/traffic.js`);
let w = seedGraph(Number(seed), 50, loadMap(TEST_MAPS.find((t) => t.id === map).build()), { target: Number(cars), posted: true, trucks: Number(trucks), checks: false });
let decisions = 0, pastSplit = 0, cars_ = new Set();
for (let i = 0; i < Number(secs) / DT; i++) {
  w = step(w);
  const byId = new Map(w.actors.map((a) => [a.id, a]));
  for (const a of w.actors) {
    if (a.player) continue;
    const L = whatStops(a, w).leader, it = L && byId.get(L.id);
    if (!it) continue;
    decisions++;
    if ((it.k ?? 0) !== (a.k ?? 0) || it.route === a.route) continue;
    const lay = w.course.at[a.k ?? 0].layout, P = lay.paths;
    if (P[it.route]?.from !== P[a.route]?.from) continue;
    const sp = splitOf(lay, a.route, it.route);
    if (!(a.s < sp.a && it.s < sp.b)) { pastSplit++; cars_.add(a.id); }
  }
}
console.log(JSON.stringify({ map, secs: Number(secs), cars: Number(cars), seed: Number(seed), followingDecisions: decisions, leaderPastSplit: pastSplit, pct: +(100 * pastSplit / Math.max(1, decisions)).toFixed(2), driversAffected: cars_.size }));
