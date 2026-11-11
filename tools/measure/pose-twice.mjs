/* THE PLAYER'S POSE, ASKED TWICE (DECISIONS 10.66, 10.67 P1-P2): what the player meets, counted in ONE driven
   world from the player's own pose and from their route's centreline (the pose the traffic's poseOf gave before
   it had a player's case: the same player with `off` and `psi` zeroed). One world, so the difference is the
   pose's and not chaos's. Usage: node tools/measure/pose-twice.mjs [map=test-1] [minutes=5] [seeds=1,2,3] [driver] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, driverPose } from "../../src/sim/drive.js";
import { placesOf, routeTo } from "../../src/sim/route.js";
import { noticeTick } from "../../src/sim/session.js";
import { newEncounters, encounterTick, encounterSummary } from "../../src/sim/encounters.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test-1", minArg = "5", seedArg = "1,2,3", driverArg = "keep-right"] = process.argv.slice(2);
const opts = { overtake: driverArg === "overtake", pace: 0.95 };
const def = TEST_MAPS.find((m) => m.id === mapId);
for (const seed of seedArg.split(",").map(Number)) {
  const raw = mapId === "test-1" ? null : def.build();
  let { loaded, world: w, me } = worldFor(seed, 50, 2.0, true, null, raw, raw?.sections?.[0]?.start ?? null, false);
  /* REAL=1: the car's real position on (drive.js), with the traffic seeing the body (DECISIONS 10.67, 10.68). */
  if (process.env.REAL === "1") w = { ...w, realPos: true };
  let noLane = 0, shadowTicks = 0;
  const me0 = me, places = placesOf(w.course, loaded), sc = { me, args: [1], saveWallet: false };
  const mine = newEncounters(), line = newEncounters();
  let shell = 0, trip = 0, apart = 0, apartMax = 0, offMax = 0, n = 0;
  const pick = () => { for (let i = 0; i < 80; i++) { const p = places[(++trip * 7919 + i * 104729) % places.length]; const r = routeTo(w.course, me, p); if (r && r.length > 300) return p; } return null; };
  for (let i = 0; i < (Number(minArg) * 60) / DT; i++) {
    if (!sc.dest) { sc.dest = pick(); sc.routeKey = null; }
    if (me.atEdge || !sc.dest) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; sc.dest = pick(); sc.routeKey = null; }
    const prev = { me, world: w };
    me = goodStep(me, w, sc, opts);
    w = step(withDriver(w, me));
    noticeTick(sc, prev, { me, world: w });
    sc.me = me;
    if (me.noLane) noLane++;
    if (me.shadows) shadowTicks++;
    encounterTick(mine, me, w);
    encounterTick(line, { ...me, off: 0, psi: 0 }, w);
    const a = driverPose(me, w.course), b = poseOf(w, me), d = Math.hypot(a.x - b.x, a.y - b.y);
    /* Is the difference ever live? Car-ticks where the two poses disagree on "within 30 m". */
    { const c = poseOf(w, { ...me, off: 0, psi: 0 }); for (const o of w.actors) { if (o.player) continue; const q = poseOf(w, o); if ((Math.hypot(q.x - a.x, q.y - a.y) < 30) !== (Math.hypot(q.x - c.x, q.y - c.y) < 30)) shell++; } }
    apart += d; apartMax = Math.max(apartMax, d); offMax = Math.max(offMax, Math.abs(me.off)); n++;
  }
  const hash = w.actors.filter((a) => !a.player).reduce((h, a) => h + a.s * ((a.k ?? 0) + 1), 0).toFixed(6);
  const A = encounterSummary(mine), B = encounterSummary(line);
  const row = (s, e) => `met ${s.metPerMin}/min (${e.met.size} cars), following ${s.followingShare}%, followed ${s.followedShare}%, overtook ${e.overtook}, overtaken ${e.overtaken}, merges ${e.merges}`;
  console.log(`seed ${seed} ${mapId} ${minArg} min, ${w.actors.length} cars. driverPose and the traffic's poseOf of the player: mean ${(apart / n).toFixed(3)} m apart, worst ${apartMax.toFixed(2)} m (|off| worst ${offMax.toFixed(2)} m); ${shell} car-ticks where the two disagree on within-30 m; traffic hash ${hash}, on no lane ${noLane} ticks, a stand-in on ${shadowTicks} ticks, re-located ${me.relocated ?? 0}x, ${(w.crashes ?? []).length} crashes`);
  console.log(`   own pose:   ${row(A, mine)}`);
  console.log(`   centreline: ${row(B, line)}`);
}
