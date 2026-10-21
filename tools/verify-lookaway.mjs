/* =====================================================================
   LOOKING AWAY, AS A DRIVER DOES IT (22 October). The maintainer's
   repro: test map 1's crossroads at 260 cars, look-away on, watched --
   "a lot of similar crashes at the turn lanes". Measured: 12 in ten
   minutes over two seeds, every one a rear-end with the follower looking
   away, because a glance was TOTAL blindness (crossing.js seenBy: the
   picture from the glance's start, carried forward). His ruling: a glance
   is never total blindness, it is not random, and it is the observation
   axis. Built in that order, measured after each, and held here:

     1. Peripheral vision (attention.js LOOMING): the car ahead looming
        brings the eyes back a reaction time later. On the repro the
        glances' crashes go -- and the same world with the edge of the eye
        removed (noPeriphery) still crashes, so the instrument sees glance
        crashes when there are any. Not a disguised off switch: most of
        the time a moving driver spends looking away is still away.

   Usage: node tools/verify-lookaway.mjs
   ===================================================================== */
import { worldFor } from "../src/sim/scene.js";
import { step, seenBy } from "../src/sim/crossing.js";
import { lookingAway } from "../src/sim/attention.js";
import { DT } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

/* The world #/map builds for watching test map 1, look-away on. 120 s per
   seed: the blind control's first crashes on seed 1 come at 67-91 s. */
const CARS = 260, SECS = 120, SEEDS = [1, 2];
function run(seed, blind) {
  let { world: w } = worldFor(seed, 50, 2.0, false, CARS, null, null, true);
  if (blind) w = { ...w, noPeriphery: true };
  let away = 0, still = 0;
  for (let i = 0; i < SECS / DT; i++) {
    w = step(w);
    if (blind || i % 4) continue;
    for (const a of w.actors) {
      if (a.player || !(a.v > 1) || !(lookingAway(w.t, a) >= DT)) continue;
      away++;
      if (seenBy(w, a) !== w.actors) still++;
    }
  }
  return { crashes: (w.crashes ?? []).length, away, still };
}

console.log(`\n1. PERIPHERAL VISION, ON THE MAINTAINER'S REPRO (test map 1, ${CARS} cars, ${SECS} s, seeds ${SEEDS.join(" and ")})`);
{
  let on = 0, blind = 0, away = 0, still = 0;
  for (const seed of SEEDS) {
    const r = run(seed, false), b = run(seed, true);
    console.log(`       seed ${seed}: ${r.crashes} crashes looking away as drivers do, ${b.crashes} with the glance blind`);
    on += r.crashes; blind += b.crashes; away += r.away; still += r.still;
  }
  check(blind >= 3, `blind glances crash on the repro (${blind}): the instrument sees glance crashes when there are any`);
  check(on === 0, `with the edge of the eye, ${on} crashes`);
  check(still >= 0.5 * away, `a moving driver looking away is still away ${(100 * still / Math.max(away, 1)).toFixed(0)}% of the time: the cue is a cue, not an off switch`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: a glance away is never total blindness -- the car ahead looming brings the eyes back -- and on the maintainer's repro the glances' crashes go.");
process.exit(failed ? 1 : 0);
