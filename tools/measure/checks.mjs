/* THE CANDIDATE'S CHECKS, MEASURED (SIMULATOR IN FLIGHT 31): what checks as
   events change in the traffic, against `world.checks = false` (today's
   world). Per run: lane changes a minute, blind-spot occasions and misses
   (lanechange.js counters, summed per car by id so cars that leave are
   counted), aborts, crashes, the wait at a stop line (from coming to rest at
   it to moving off, each stop once), undue-delay marks among sound drivers,
   checks made by kind, and the mean step.
   Usage: node tools/measure/checks.mjs [map=test-loop] [cars=180] [secs=180] [seed=1] [checks=1] [perceive=0] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { soundnessOf } from "../../src/core/driver.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id = "test-loop", cars = "180", secs = "180", seed = "1", chk = "1", perceive = "0"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(Number(seed), 50, 2.0, true, Number(cars), raw, raw.sections?.[0]?.start ?? null, Number(perceive) === 1, false, { checks: Number(chk) === 1 });
const me0 = me, sc = { me, args: [1], saveWallet: false };
const last = new Map(), tot = { lc: 0, occ: 0, miss: 0, aborts: 0, missedTurns: 0, turnChanges: 0, prepWasted: 0, begun: 0, begunMissed: 0 }, wrong = {}, waits = [], looks = {}, delayedSound = new Set();
let ms = 0, n = 0;
const WARM = 30 / DT;
for (let i = 0; i < Number(secs) / DT; i++) {
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
  const x = withDriver(w, me), t0 = performance.now();
  w = step(x);
  if (i < WARM) { for (const a of w.actors) last.set(a.id, a); continue; }
  ms += performance.now() - t0; n++;
  for (const a of w.actors) {
    if (a.player) continue;
    const b = last.get(a.id);
    if (b) {
      tot.lc += Math.max(0, (a.lcCount ?? 0) - (b.lcCount ?? 0));
      tot.occ += Math.max(0, (a.blindOcc ?? 0) - (b.blindOcc ?? 0));
      tot.miss += Math.max(0, (a.blindMiss ?? 0) - (b.blindMiss ?? 0));
      tot.aborts += Math.max(0, (a.aborts ?? 0) - (b.aborts ?? 0));
      tot.missedTurns += Math.max(0, (a.missedTurns ?? 0) - (b.missedTurns ?? 0));
      tot.turnChanges += Math.max(0, (a.turnChanges ?? 0) - (b.turnChanges ?? 0));
      /* Looks made for a change that was then not begun: the prep ran out with no change. */
      if (b.lcPrep && !a.lc && a.lcPrep === b.lcPrep && w.t > b.lcPrep.ready + 0.6 && w.t - DT <= b.lcPrep.ready + 0.6) tot.prepWasted++;
      /* A lane change BEGUN, and whether somebody in the blind spot went unseen (lc.missed) -- the same quantity with checks on and off, where the occasion counters are not (27 October: checkers now decline before the move, uncounted). */
      if (a.lc && !a.lc.abort && (!b.lc || b.lc.at !== a.lc.at)) { tot.begun++; if (a.lc.missed) tot.begunMissed++; const k = a.lc.wrong ?? (a.lc.checked ? "checked" : a.lc.checked === false ? "unchecked" : "n/a"); wrong[k] = (wrong[k] ?? 0) + 1; }
      /* A stop at the line, from rest to moving off. */
      if (b.stoppedAt != null && !b.going && a.going && a.k === b.k) waits.push(w.t - b.stoppedAt);
      if (a.look && (!b.look || b.look.t0 !== a.look.t0 || b.look.kind !== a.look.kind)) looks[a.look.kind] = (looks[a.look.kind] ?? 0) + 1;
    }
    if (a.delayed && soundnessOf(a.ratings ?? {}, "confidence") >= 0.75) delayedSound.add(a.id);
    last.set(a.id, a);
  }
}
const mins = (Number(secs) - 30) / 60, med = (xs) => { const s = [...xs].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log(`${id} ${cars} cars seed ${seed} checks ${chk} perceive ${perceive}: lane changes ${(tot.lc / mins).toFixed(1)}/min, ${tot.begun} begun of which ${tot.begunMissed} with somebody unseen in the blind spot (${(1000 * tot.begunMissed / Math.max(1, tot.begun)).toFixed(1)} per 1000) ${JSON.stringify(wrong)}; blind spot ${tot.occ} occasions, ${tot.miss} missed (${(100 * tot.miss / Math.max(1, tot.occ)).toFixed(1)}%), ${tot.aborts} aborts; turns: ${tot.turnChanges} changes made for one, ${tot.missedTurns} missed; looks made and no change ${tot.prepWasted}; crashes ${(w.crashes ?? []).length}; stop-line wait median ${med(waits).toFixed(2)} s (${waits.length} stops); sound drivers marked for undue delay ${delayedSound.size}; checks ${JSON.stringify(looks)}; step ${(ms / n).toFixed(2)} ms`);
