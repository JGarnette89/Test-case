/* WHAT THE PLAYER MEETS, FROM THE PLAYER'S SEAT (20 October; sim/encounters.js).
   A good driver (tools/lib/good-driver.mjs) driving the map for N minutes,
   on random trips ("Go somewhere" places one after another), at the map's
   default traffic and at the counts given; per minute: distinct cars met
   within NEAR, share of time following and followed, gaps judged.
   Usage: node tools/measure/encounters.mjs [map=test-1] [cars=default,200] [minutes=5] [driver=keep-right|overtake] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { placesOf, routeTo } from "../../src/sim/route.js";
import { noticeTick } from "../../src/sim/session.js";
import { newEncounters, encounterTick, encounterSummary } from "../../src/sim/encounters.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test-1", carsArg = "default,200", minArg = "5", driverArg = "keep-right"] = process.argv.slice(2);
const opts = { overtake: driverArg === "overtake" || driverArg.startsWith("cruise"), pace: driverArg === "cruise-limit" ? 1.0 : 0.95 };
/* "cruise": no destination at all -- round and round the road it is on, as a player swimming the highway does. */
const cruise = driverArg.startsWith("cruise");
const def = TEST_MAPS.find((m) => m.id === mapId);
for (const c of carsArg.split(",")) {
  const cars = c === "default" ? null : Number(c);
  const raw = mapId === "test-1" ? null : def.build();
  let { loaded, world: w, me } = worldFor(1, 50, 2.0, true, cars, raw, raw?.sections?.[0]?.start ?? null, false);
  const me0 = me;
  let restarts = 0;
  const places = placesOf(w.course, loaded);
  const sc = { me, args: [1], saveWallet: false };
  const enc = newEncounters();
  let trip = 0, multi = 0, ticks = 0;
  const pick = () => { for (let i = 0; i < 80; i++) { const p = places[(++trip * 7919 + i * 104729) % places.length]; const r = routeTo(w.course, me, p); if (r && r.length > 300) return p; } return null; };
  for (let n = 0; n < (Number(minArg) * 60) / DT; n++) {
    if (!cruise && !sc.dest) { sc.dest = pick(); sc.routeKey = null; }
    /* A dead end: the map's edge, or nowhere reachable from here -- a player would turn round; the
       harness starts a new trip from the map's start, so the minutes measured are minutes driven. */
    if (me.atEdge || (!cruise && !sc.dest)) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; sc.dest = pick(); sc.routeKey = null; restarts++; }
    const prev = { me, world: w };
    me = goodStep(me, w, sc, opts);
    w = step(withDriver(w, me));
    noticeTick(sc, prev, { me, world: w });
    sc.me = me;
    encounterTick(enc, me, w);
    { const L = w.course.at[me.k ?? 0].layout, lg = L.legs[L.paths[me.route].from]; ticks++; if ((lg?.across ?? lg?.lanes ?? 1) >= 2) multi++; }
  }
  const s = encounterSummary(enc);
  console.log(`${mapId}, ${w.actors.length} cars on ${loaded.laneKm.toFixed(0)} lane-km, ${s.minutes} min driven: met ${s.metPerMin} cars/min within 30 m, following ${s.followingShare}% of the time, followed ${s.followedShare}%, ${s.gapsPerMin} gaps judged/min; overtook ${s.overtookPerMin}/min, overtaken ${s.overtakenPerMin}/min, ${s.mergesPerMin} merges judged/min (${driverArg} driver, ${restarts} restarts, ${Math.round((100 * multi) / ticks)}% of the time on a multi-lane road)`);
}
