/* =====================================================================
   THE PLAYER STARTS CLEAR, WHEREVER THEY START (drive.js `placePlayer`).

   Twice now a new start put the player on top of the traffic: stage 1's
   wheel screen, and on 8 October the endless highway's slip road -- the
   one place that map's traffic enters, filled by the warm-up before the
   player was placed, so they appeared on a car and the drive ended on its
   first frame. A collision before the player has had any chance to act is
   made impossible by construction, and this holds it across every start
   there is -- enumerated here, not listed, so a start added tomorrow is
   checked without anybody remembering to add it:

   - every section of every test map (TEST_MAPS, whatever it holds);
   - the start the editor's "Drive it" takes on a map with none (firstEdge);
   - every road end where traffic enters the map (the edges);
   - and a generated map (the bench's brief).

   For each, over seeds, the world is seeded and warmed exactly as the
   screen does it (MapRoad `sceneFor`), the player placed, and then:
   nobody within START_NEAR of them, and -- holding the player still for
   five seconds, the worst they can do on the first frame -- nobody touches
   them. The traffic treats a standing player as a stopped car; nobody it
   could not stop for may be there to begin with.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { mapFromBrief } from "../src/map/brief.js";
import { BENCH_BRIEF } from "../src/iso/bench.js";
import { carsFor } from "../src/map/cars.js";
import { firstEdge } from "../src/map/edges.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";
import { edgesOfGraph } from "../src/sim/graph.js";
import { playerOn, placePlayer, withDriver, driverPose, START_NEAR } from "../src/sim/drive.js";
import { cornersOf, boxesOverlap } from "../src/sim/intersection.js";
import { DT } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const SEEDS = [1, 2, 3];

/* The player's box, and every other road user's, in the plane. */
const touching = (w, me) => {
  const p = driverPose(me, w.course), box = cornersOf({ x: p.x, y: p.y, rot: p.heading, length: 4.5, width: 1.8 });
  return w.actors.filter((a) => !a.player && Math.abs((poseOf(w, a).z ?? 0) - p.z) < 2 && boxesOverlap(box, cornersOf(poseOf(w, a)))).map((a) => a.id);
};
const nearest = (w, me) => { const p = driverPose(me, w.course); let d = Infinity; for (const a of w.actors) { if (a.player) continue; const q = poseOf(w, a); if (Math.abs((q.z ?? 0) - p.z) < 4) d = Math.min(d, Math.hypot(q.x - p.x, q.y - p.y)); } return d; };

const maps = [...TEST_MAPS.map((t) => ({ id: t.id, raw: t.build() })), { id: "bench (generated)", raw: mapFromBrief(BENCH_BRIEF, 1) }];
let starts = 0, placements = 0;
const bad = [];
for (const { id, raw } of maps) {
  const loaded = loadMap(raw);
  if (!loaded.ok) { bad.push(`${id}: does not load`); continue; }
  /* Every start this map offers: its sections, the editor's default, and every edge where traffic enters. */
  const want = new Map();
  for (const sec of loaded.sections ?? []) if (sec.start) want.set(`section ${sec.id}`, sec.start);
  const fe = firstEdge(loaded); if (fe) want.set("the editor's default start", fe);
  for (const seed of SEEDS) {
    let w0 = seedGraph(seed, 50, loaded, { every: 2.0, target: carsFor(loaded), posted: true, walkers: true });
    if (seed === SEEDS[0]) for (const e of edgesOfGraph(w0.course)) { const leg = w0.course.at[e.k].layout.legs[e.side]; if (leg?.curb && !leg.bay) want.set(`edge ${leg.road}|${leg.end}`, { road: leg.road, end: leg.end }); }
    for (const [name, start] of want) {
      const me0 = playerOn(w0.course, start.road, start.end, { through: !!start.through });
      if (!me0) continue;
      if (seed === SEEDS[0]) starts++;
      placements++;
      let w = placePlayer(w0, me0);
      const near = nearest(w, me0), hits = touching(w, me0);
      if (near < START_NEAR || hits.length) { bad.push(`${id} ${name}, seed ${seed}: ${hits.length ? `on top of ${hits.join(",")}` : `a car ${near.toFixed(1)} m away`} at the start`); continue; }
      for (let i = 0; i < 5 / DT; i++) {
        w = withDriver(step(w), me0);
        const t = touching(w, me0);
        if (t.length) { bad.push(`${id} ${name}, seed ${seed}: touched by ${t.join(",")} ${(i * DT).toFixed(2)} s in, the player standing still`); break; }
      }
    }
  }
}
check(starts >= 30, `${starts} starts across ${maps.length} maps -- every section, every map's default, every edge where traffic enters`);
check(bad.length === 0, `at every one, over ${SEEDS.length} seeds (${placements} placements), the player appears with nobody within ${START_NEAR} m, and standing still for five seconds nobody touches them${bad.length ? `: ${bad.slice(0, 6).join("; ")}${bad.length > 6 ? ` (+${bad.length - 6})` : ""}` : ""}`);

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
