/* =====================================================================
   LOOKING AWAY, AS A DRIVER DOES IT (22 October, DECISIONS 10.19). The
   maintainer's repro: test map 1's crossroads at 260 cars, look-away on,
   watched -- "a lot of similar crashes at the turn lanes". Measured: 12 in
   ten minutes over two seeds, every one a rear-end with the follower
   looking away, because a glance was TOTAL blindness (the picture from
   its start, carried forward) and fell on a fixed phase whatever the
   driver was doing. His ruling: a glance is never total blindness, it is
   not random, and it is the observation axis. Built in three parts:

     0. THE REPRO. The old glance -- blind, taken any time -- crashes; the
        world as built does not, on the same windows.
     1. Peripheral vision (attention.js LOOMING): the car ahead looming
        brings the eyes back a reaction time later -- for part of the time
        a driver spends looking away, never most of it (a cue, not an off
        switch).
     2. Demand gating (crossing.js timeFree): a due glance is taken when
        the road leaves at least its length before the driver must act, so
        the long glances move off the box, the line and the car in front
        onto clear road.
     3. Skill (crossing.js heedsRoad): a poor observer takes a due glance
        on the schedule, whatever the road asks, their deficit of the time;
        their glances fail to fit several times as often as a sound
        observer's, and it is the skill -- with everybody waiting for the
        road, theirs fit.

   WHY THE PARTS ARE HELD BY THEIR MECHANISM AND NOT BY CRASHES (22
   October). Measured over twenty minutes each (tools/measure/
   lookaway-crashes.mjs, four seeds of 300 s): the old glance 18 crashes,
   peripheral vision alone 1, gating alone 3, all three 0. Each part does
   most of the work and neither alone reaches zero -- and at 260 cars the
   traffic is chaotic, so a change anywhere that perturbs a trajectory
   moves a count of one or two in a short window. A first version asserted
   zero for each part alone on one short run apiece and broke the moment
   the skill changed the warm-up (worldFor warms the world before these
   flags apply): CLAUDE.md item 3, an implied sample size nobody stated.
   The mechanisms are read over thousands of glances instead; crashes only
   where they are far from any floor.

   THE SAMPLE: the old glance crashes 4 times in seed 1's first 60 s and
   once in seed 2's -- five on the floor of three; the world as built is
   read on the same two windows; gating's shares need 120 s (at 60 s the
   clear-road share fell to its floor, 75% against 83%).

   Usage: node tools/verify-lookaway.mjs
   ===================================================================== */
import { worldFor } from "../src/sim/scene.js";
import { step, seenBy, pathOf, whatStops } from "../src/sim/crossing.js";
import { lookingAway } from "../src/sim/attention.js";
import { DT } from "../src/sim/traffic.js";
import { deficitOf } from "../src/core/driver.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const pct = (x) => `${(100 * x).toFixed(0)}%`;

const CARS = 260, SHORT = 60, LONG = 120;
/* The world #/map builds for watching test map 1, look-away on, with parts
   switched off by the checks' own controlled-comparison flags. */
function run(seed, { blind = false, anyTime = false, heedAll = false, secs = SHORT } = {}) {
  let { world: w } = worldFor(seed, 50, 2.0, false, CARS, null, null, true);
  w = { ...w, ...(blind ? { noPeriphery: true } : {}), ...(anyTime ? { glanceAnyTime: true } : {}), ...(heedAll ? { heedAll: true } : {}) };
  let away = 0, back = 0;
  const where = { box: 0, line: 0, following: 0, clear: 0 };
  /* DID A GLANCE FIT WHEN IT WAS TAKEN -- stated here, not read from
     crossing.js: it did not if it began inside a box, or lasted longer
     than the time headway to the car ahead or the time to the next stop
     line. By observation: sound (deficit under 0.2), poor (0.5 or more). */
  const fit = { sound: [0, 0], poor: [0, 0] };
  for (let i = 0; i < secs / DT; i++) {
    const prev = w;
    w = step(w);
    if (i < 200) continue;
    const was = new Map(prev.actors.map((a) => [a.id, a]));
    for (const a of w.actors) {
      const b = was.get(a.id);
      if (!b || a.player || !(a.lag > 0) || a.glanceAt !== prev.t || !(b.v > 1)) continue;
      const d = deficitOf(a.ratings ?? {}, "observation").deficit ?? 0, k = d < 0.2 ? "sound" : d >= 0.5 ? "poor" : null;
      if (!k) continue;
      const p = pathOf(prev, b), v = whatStops(b, { ...prev, noPeriphery: true });
      const unfit = (b.s > p.stopAt && b.s < p.clearAt) || (b.s <= p.stopAt && (p.stopAt - b.s) / b.v < a.lag) || (v.leader && v.gap / b.v < a.lag);
      fit[k][1]++; if (unfit) fit[k][0]++;
    }
    if (i % 4) continue;
    for (const a of w.actors) {
      if (a.player || !(a.v > 1) || !(lookingAway(w.t, a) >= DT)) continue;
      away++;
      if (seenBy(w, a) === w.actors) back++;
      /* Where the long glances fall: inside a box, within 3 s of a line,
         under 2 s behind the car ahead, or clear road. */
      if (!(a.lag >= 1.5)) continue;
      const p = pathOf(w, a), v = whatStops(a, { ...w, noPeriphery: true });
      where[a.s > p.stopAt && a.s < p.clearAt ? "box" : a.s <= p.stopAt && (p.stopAt - a.s) / a.v < 3 ? "line" : v.leader && v.gap / a.v < 2 ? "following" : "clear"]++;
    }
  }
  return { crashes: (w.crashes ?? []).length, away, back, where, fit };
}
const pool = (rs) => {
  const where = { box: 0, line: 0, following: 0, clear: 0 }, fit = { sound: [0, 0], poor: [0, 0] };
  let away = 0, back = 0, crashes = 0;
  for (const r of rs) {
    for (const k in where) where[k] += r.where[k];
    for (const k in fit) { fit[k][0] += r.fit[k][0]; fit[k][1] += r.fit[k][1]; }
    away += r.away; back += r.back; crashes += r.crashes;
  }
  const long = Object.values(where).reduce((s, x) => s + x, 0);
  return { crashes, away, back, fit, share: Object.fromEntries(Object.entries(where).map(([k, n]) => [k, n / Math.max(long, 1)])) };
};

const old = pool([1, 2].map((seed) => run(seed, { blind: true, anyTime: true })));
const built = pool([1, 2].map((seed) => run(seed)));
const heeding = pool([run(1, { heedAll: true, secs: LONG })]);

console.log(`\n0. THE REPRO (test map 1, ${CARS} cars, seeds 1 and 2, ${SHORT} s each)`);
console.log(`       crashes: the old glance (blind, any time) ${old.crashes}, the world as built ${built.crashes}`);
check(old.crashes >= 3, `the old glance crashes on the repro (${old.crashes}): the instrument sees glance crashes when there are any`);
check(built.crashes === 0, `looking away as drivers do: ${built.crashes} crashes on the same windows`);

console.log("\n1. PERIPHERAL VISION: A CUE, NOT AN OFF SWITCH");
{
  const f = built.back / Math.max(built.away, 1);
  console.log(`       of ${built.away} driver-ticks spent looking away while moving, the car ahead looming had the eyes back for ${pct(f)}`);
  check(f >= 0.05, `the looming car ahead brings the eyes back: ${pct(f)} of glance time`);
  check(f <= 0.5, `and most of the time looking away is still away: ${pct(1 - f)}`);
}

console.log(`\n2. DEMAND GATING: WHERE THE LONG GLANCES (1.5 s OR MORE) FALL (every driver waiting for the road, seed 1, ${LONG} s, against the old glance)`);
{
  const s = heeding.share, o = old.share;
  console.log(`       box ${pct(s.box)} / ${pct(o.box)}, near a line ${pct(s.line)} / ${pct(o.line)}, following under 2 s ${pct(s.following)} / ${pct(o.following)}, clear road ${pct(s.clear)} / ${pct(o.clear)}`);
  /* The ruling's words: a long glance belongs on "a straight stretch of
     road that doesn't anticipate steering actions or braking". Stated
     here, not read from the module: three quarters of long glance time on
     clear road, and the box -- steering -- next to none of it. */
  check(s.clear >= 0.75 && s.clear > o.clear, `long glances on clear road: ${pct(s.clear)} (any time: ${pct(o.clear)})`);
  check(s.box <= 0.02 && s.following < o.following, `and off the box (${pct(s.box)}) and the car in front (${pct(s.following)}, against ${pct(o.following)})`);
}

console.log("\n3. SKILL: WHO TAKES A GLANCE THAT DOES NOT FIT (the world as built, against every driver waiting for the road)");
{
  /* The ruling's third part: "good drivers look away when it is safe; poor
     observers look away when it isn't". Measured first (glance-fit.mjs,
     180 s): unfit glances, sound / poor -- any time 8% / 28%, every driver
     waiting 0% / 1%, as built 1% / 17%. Stated here: a sound observer's
     glances almost always fit; a poor observer's do not, several times as
     often, and that is the skill and not the road -- with every driver
     waiting for it, the poor observer's glances fit too. */
  const ratio = ([u, n]) => u / Math.max(n, 1);
  const S = ratio(built.fit.sound), P = ratio(built.fit.poor), H = ratio(heeding.fit.poor);
  console.log(`       glances that did not fit: sound ${pct(S)} of ${built.fit.sound[1]}, poor ${pct(P)} of ${built.fit.poor[1]}; poor observers with everybody waiting for the road ${pct(H)} of ${heeding.fit.poor[1]}`);
  check(S <= 0.03, `a sound observer's glance almost always fits: ${pct(S)} do not`);
  check(P >= 0.08 && P >= 3 * S, `a poor observer's often does not: ${pct(P)}`);
  check(H * 3 <= P, `and it is the skill, not the road: waiting for the road like everybody, ${pct(H)}`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: on the maintainer's repro the old glance crashes and the world as built does not; the looming car ahead brings the eyes back for part of a glance; the long glances fall on clear road; and poor observers take the glances that do not fit.");
process.exit(failed ? 1 : 0);
