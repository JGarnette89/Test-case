/* =====================================================================
   MERGES JUDGED (sim/encounters.js), split from verify-encounters on 22
   October -- four 3-minute drives at 280 cars took that check past its
   timeout, and the sample cannot come down: four seeds give 20 events
   against a floor of 10, and 9 on an exit stretch against 3.

   The maintainer's readout showed 0 merges judged over 3.1 minutes of
   overtaking. The counter read a lane change as the route's `from` lane
   changing, which caught a change on an approach and missed most on an exit
   stretch -- where most highway driving is. It now reads the lane under the
   player by the road's centreline (placement.js). Held here against an
   independent statement, event by event.
   ===================================================================== */
import { worldFor } from "../src/sim/scene.js";
import { step, poseOf } from "../src/sim/crossing.js";
import { withDriver } from "../src/sim/drive.js";
import { newEncounters, encounterTick, MERGE } from "../src/sim/encounters.js";
import { goodStep } from "./lib/good-driver.mjs";
import { TEST_MAPS } from "../src/map/samples.js";
import { DT } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

console.log("\nMERGES JUDGED: EVERY LANE CHANGE NEAR A CAR, ON AN APPROACH OR AN EXIT STRETCH");
{
  /* WRITTEN 22 OCTOBER, when the maintainer's readout showed 0 merges judged
     over 3.1 minutes of overtaking: the counter read a lane change as the
     route's `from` lane changing, which misses most changes on an exit
     stretch -- where most highway driving is -- 5 counted against 7 measured.
     It now reads the lane under the player by the road's centreline. The
     second statement here is independent of that: a lane change is the
     player's ROUTE changing at the same node, outside the box, other than the
     join out of an acceleration lane; near is any car whose POSE is within
     MERGE of the player's, in line with the player (across under half a
     lane) and heading the same way, the tick after. MATCHED EVENT BY EVENT,
     not in total: by totals over ~10 events the old counter passed (8
     against 10) -- a counter that misses exit-stretch changes has to be
     seen missing them. */
  const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
  const events = [], counted = [];
  for (const seed of [1, 2, 3, 4]) {
    let { world: w, me } = worldFor(seed, 50, 2.0, true, 280, raw, raw.sections?.[0]?.start ?? null, false);
    const sc = { me, args: [1], saveWallet: false }, enc = newEncounters();
    for (let n = 0; n < 180 / DT; n++) {
      const was = me, before = enc.merges;
      me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
      w = step(withDriver(w, me));
      encounterTick(enc, me, w);
      if (enc.merges > before) counted.push({ seed, t: w.t });
      const L = w.course.at[me.k ?? 0].layout, p = L.paths[me.route], q = L.paths[was.route];
      if ((was.k ?? 0) !== (me.k ?? 0) || was.route === me.route || !p || !q) continue;
      if (me.s > p.stopAt && me.s < p.clearAt) continue;
      if (L.legs[q.to]?.accel && !L.legs[p.to]?.accel) continue;
      const mp = poseOf(w, me), h = ((mp.rot ?? 0) * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h);
      const near = w.actors.some((a) => {
        if (a.player) return false;
        const ap = poseOf(w, a), dx = ap.x - mp.x, dy = ap.y - mp.y;
        /* MERGE is clear road between bodies: centre to centre, that is MERGE and two half car lengths. */
        if (Math.hypot(dx, dy) >= MERGE + 4.5) return false;
        const same = Math.cos((((ap.rot ?? 0) - (mp.rot ?? 0)) * Math.PI) / 180) > 0.7;
        return same && Math.abs(-dx * fy + dy * fx) < 1.8;
      });
      if (near) events.push({ seed, t: w.t, exit: me.s > p.clearAt });
    }
  }
  const hit = (e) => counted.some((c) => c.seed === e.seed && Math.abs(c.t - e.t) <= 1.0);
  const matched = events.filter(hit), exits = events.filter((e) => e.exit), exitHit = exits.filter(hit);
  console.log(`   four 3-minute drives on the endless highway, 280 cars, the maintainer's pace: ${events.length} lane changes near a car counted here (${exits.length} on an exit stretch); the counter ${counted.length}, matching ${matched.length} of them within a second (${exitHit.length} of the exit-stretch ones)`);
  check(events.length >= 10 && matched.length >= 0.8 * events.length, `merges judged catches the lane changes near a car: ${matched.length} of ${events.length}`);
  check(exits.length >= 3 && exitHit.length >= 0.8 * exits.length, `including those on an exit stretch, where most highway driving is: ${exitHit.length} of ${exits.length}`);
}


console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
