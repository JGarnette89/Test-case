/* =====================================================================
   LOOKING AWAY, AS A DRIVER DOES IT (22 October, DECISIONS 10.19). The
   maintainer's repro: test map 1's crossroads at 260 cars, look-away on,
   watched -- "a lot of similar crashes at the turn lanes". Measured: 12 in
   ten minutes over two seeds, every one a rear-end with the follower
   looking away, because a glance was TOTAL blindness (the picture from
   its start, carried forward) and fell on a fixed phase whatever the
   driver was doing. His ruling: a glance is never total blindness, it is
   not random, and it is the observation axis. Built in that order, and
   each part measured ALONE against the old glance, so it is known which
   part does the work:

     0. The control: the old glance -- blind, any time -- still crashes on
        the repro. Without it every zero below could be the instrument.
     1. Peripheral vision (attention.js LOOMING): the car ahead looming
        brings the eyes back a reaction time later. Alone, the glances'
        crashes go. Not a disguised off switch: most of the time a moving
        driver spends looking away is still away.
     2. Demand gating (crossing.js timeFree): a due glance is taken when
        the road leaves at least its length before the driver must act.
        Alone, the crashes go; and the long glances move off the box, the
        line and the car in front onto clear road.
     Both together -- the world as built -- crash nowhere.

   THE SAMPLE, MEASURED (22 October; six runs of 120 s took it past its
   20-minute ceiling under the suite's load): the old glance's crashes on
   seed 1 come at 19, 26, 54, 54 and 95 s, so peripheral vision alone runs
   seed 1 for 60 s (against four); the control and gating alone keep 120 s,
   because at 60 s the long glances' clear-road share fell to 75% -- on its
   floor -- against 83% at 120; the world as built runs both seeds for 60 s,
   a window in which the old glance crashes four times on seed 1.

   Usage: node tools/verify-lookaway.mjs
   ===================================================================== */
import { worldFor } from "../src/sim/scene.js";
import { step, seenBy, pathOf, whatStops } from "../src/sim/crossing.js";
import { lookingAway } from "../src/sim/attention.js";
import { DT } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

const CARS = 260, SHORT = 60, LONG = 120;
/* The world #/map builds for watching test map 1, look-away on, with the
   parts switched off by the checks' own controlled-comparison flags. */
function run(seed, { blind = false, anyTime = false, secs = SHORT } = {}) {
  let { world: w } = worldFor(seed, 50, 2.0, false, CARS, null, null, true);
  w = { ...w, ...(blind ? { noPeriphery: true } : {}), ...(anyTime ? { glanceAnyTime: true } : {}) };
  let away = 0, still = 0;
  const where = { box: 0, line: 0, following: 0, clear: 0 };
  for (let i = 0; i < secs / DT; i++) {
    w = step(w);
    if (i < 200 || i % 4) continue;
    for (const a of w.actors) {
      if (a.player || !(a.v > 1) || !(lookingAway(w.t, a) >= DT)) continue;
      away++;
      if (seenBy(w, a) !== w.actors) still++;
      /* Where the long glances fall: inside a box, within 3 s of a line,
         under 2 s behind the car ahead, or clear road. */
      if (!(a.lag >= 1.5)) continue;
      const p = pathOf(w, a), v = whatStops(a, { ...w, noPeriphery: true });
      where[a.s > p.stopAt && a.s < p.clearAt ? "box" : a.s <= p.stopAt && (p.stopAt - a.s) / a.v < 3 ? "line" : v.leader && v.gap / a.v < 2 ? "following" : "clear"]++;
    }
  }
  const long = Object.values(where).reduce((s, x) => s + x, 0);
  const share = Object.fromEntries(Object.entries(where).map(([k, n]) => [k, n / Math.max(long, 1)]));
  return { crashes: (w.crashes ?? []).length, away, still, share };
}
const pct = (x) => `${(100 * x).toFixed(0)}%`;

console.log(`\n0. THE CONTROL: THE OLD GLANCE -- BLIND, ANY TIME -- ON THE REPRO (test map 1, ${CARS} cars, seed 1, ${LONG} s)`);
const old = [run(1, { blind: true, anyTime: true, secs: LONG })];
console.log(`       crashes: ${old[0].crashes}`);
check(old[0].crashes >= 3, `the old glance crashes on the repro (${old[0].crashes}): the instrument sees glance crashes when there are any`);

console.log(`\n1. PERIPHERAL VISION, ALONE (the glance taken any time; seed 1, ${SHORT} s)`);
{
  const r = run(1, { anyTime: true });
  console.log(`       seed 1: ${r.crashes} crashes, against ${old[0].crashes} blind`);
  check(r.crashes === 0, `the car ahead looming brings the eyes back: ${r.crashes} crashes`);
  check(r.still >= 0.5 * r.away, `a moving driver looking away is still away ${pct(r.still / Math.max(r.away, 1))} of the time: the cue is a cue, not an off switch`);
}

console.log(`\n2. DEMAND GATING, ALONE (the glance blind; seed 1, ${LONG} s)`);
{
  const r = run(1, { blind: true, secs: LONG });
  const s = r.share, o = old[0].share;
  console.log(`       seed 1: ${r.crashes} crashes, against ${old[0].crashes} taken any time`);
  console.log(`       long glances (1.5 s or more) by where they fall, gated against any time: box ${pct(s.box)} / ${pct(o.box)}, near a line ${pct(s.line)} / ${pct(o.line)}, following under 2 s ${pct(s.following)} / ${pct(o.following)}, clear road ${pct(s.clear)} / ${pct(o.clear)}`);
  check(r.crashes === 0, `a glance taken when it fits: ${r.crashes} crashes`);
  /* The ruling's words: a long glance belongs on "a straight stretch of
     road that doesn't anticipate steering actions or braking". Stated
     here, not read from the module: three quarters of long glance time on
     clear road, and the box -- steering -- next to none of it. */
  check(s.clear >= 0.75 && s.clear > o.clear, `long glances on clear road: ${pct(s.clear)} (any time: ${pct(o.clear)})`);
  check(s.box <= 0.02 && s.following < o.following, `and off the box (${pct(s.box)}) and the car in front (${pct(s.following)}, against ${pct(o.following)})`);
}

console.log("\n3. BOTH, THE WORLD AS BUILT");
{
  const rs = [1, 2].map((seed) => run(seed));
  const n = rs[0].crashes + rs[1].crashes;
  console.log(`       crashes: seed 1 ${rs[0].crashes}, seed 2 ${rs[1].crashes}, over ${SHORT} s each`);
  check(n === 0, `looking away as drivers do: ${n} crashes on the repro`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: on the maintainer's repro the old glance crashes; a glance with the edge of the eye, or taken only when it fits, does not; the long glances fall on clear road; and the world as built crashes nowhere.");
process.exit(failed ? 1 : 0);
