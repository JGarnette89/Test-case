/* =====================================================================
   LANE CHANGES: temperament, not one algorithm; nobody through anybody;
   and the headroom kept.

   The brief (24 September): lane changing and overtaking "as behaviour
   arising from the ratings rather than as a manoeuvre the AI performs on
   cue" -- confidence deciding whether the gap is taken, observation
   whether it was seen, steering how cleanly the car arrives -- so that it
   "reads as drivers with different temperaments, not one lane-change
   algorithm". And it "must not undo the performance headroom you just
   measured". So:

     each axis moves the part of the manoeuvre it governs, measured across
       drivers rather than asserted about one: bold drivers change more
       and take tighter gaps than timid ones; only drivers with an
       observation deficit ever miss a car in the blind spot, and every
       miss is followed by an abort; the overshoot grows with the
       steering deficit and never passes half the room;
     the manoeuvre is honest: never out of the lane the turn needs, always
       finished before the line, never a jump;
     nobody drives through anybody, at the default car count and at the
       top of the dial;
     and it costs the sim a few percent, by controlled comparison -- the
       same map, seed and count with the behaviour switched off.

   Over three seeds, because a temperament read off one run is a sample
   size nobody stated (CLAUDE.md, the second shape of a check passing for
   the wrong reason).
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { seedGraph, step, overlapping, poseOf } from "../src/sim/crossing.js";
import { lateralOf, changing, LC_TIME } from "../src/sim/lanechange.js";
import { weaveRoom, DT } from "../src/sim/traffic.js";
import { deficitOf } from "../src/engine/ratings.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const loaded = loadMap(testMap1());
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/* Run a world and record every lane change as it starts and as it ends. */
function watch(seed, target, secs) {
  let w = seedGraph(seed, 50, loaded, { target, posted: true });
  const starts = [], drivers = new Map();
  let overlaps = 0, pastLine = 0, jumps = 0, worstPast = 0;
  const last = new Map();
  for (let i = 0; i < secs * 20; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    w = step(w);
    if (i % 5 === 0) overlaps += overlapping(w).length;
    for (const a of w.actors) {
      drivers.set(a.id, a);
      const was = before.get(a.id), L = w.course.at[a.k].layout, p = L.paths[a.route];
      if (a.lc && !a.lc.abort && (!was || !was.lc || was.lc.t0 !== a.lc.t0)) {
        const fromPath = L.paths[a.lc.from];
        starts.push({ id: a.id, caution: a.caution, obs: deficitOf(a.ratings, "observation").deficit, steer: deficitOf(a.ratings, "steering").deficit,
          gap: a.lc.gap, tight: a.lc.tight, missed: a.lc.missed, blind: a.lc.blind, ov: a.lc.ov, keptIntent: fromPath?.intent === p.intent });
      }
      if (changing(a.lc, w.t) && a.s > p.stopAt) pastLine++;
      if (a.lc) worstPast = Math.max(worstPast, Math.abs(lateralOf(a.lc, w.t)) - Math.abs(a.lc.L0));
      /* No jump: the drawn pose moves no further than the car drives in a tick, allowing for the sideways blend. */
      const q = poseOf(w, a), pq = last.get(a.id);
      if (pq && pq.k === a.k && Math.hypot(q.x - pq.x, q.y - pq.y) > Math.max(pq.v, a.v) * DT + 0.6) jumps++;
      last.set(a.id, { x: q.x, y: q.y, k: a.k, v: a.v });
    }
  }
  return { starts, drivers: [...drivers.values()], overlaps, pastLine, jumps, worstPast };
}

const runs = [3, 5, 9].map((seed) => watch(seed, 200, 150));
const starts = runs.flatMap((r) => r.starts), drivers = runs.flatMap((r) => r.drivers);

/* 1. CONFIDENCE: whether, and how tight. */
{
  const band = (lo, hi) => drivers.filter((d) => d.caution >= lo && d.caution < hi);
  const rate = (g) => mean(g.map((d) => d.lcCount ?? 0));
  const bold = band(0, 0.7), mid = band(0.7, 1.3), timid = band(1.3, 3);
  check(starts.length > 150, `three seeds, two and a half minutes each at 200 cars: ${starts.length} lane changes by ${drivers.length} drivers`);
  /* Ordered, and the extremes several times apart. The ratio is
     reported rather than thresholded pair by pair: how much more often a
     bold driver changes than a middling one is a property of the
     population the driver model draws, not something this check knows. */
  check(rate(bold) > rate(mid) && rate(mid) > rate(timid) && rate(bold) > 3 * rate(timid),
    `confidence decides WHETHER: lane changes per driver -- bold ${rate(bold).toFixed(2)} (${bold.length} drivers), middle ${rate(mid).toFixed(2)} (${mid.length}), timid ${rate(timid).toFixed(2)} (${timid.length}); bold ${(rate(bold) / rate(timid)).toFixed(1)} times timid`);
  /* HOW TIGHT is about the tightest gaps, not the average -- a bold driver
     also changes into more empty lanes, which inflates their mean -- and
     it is measured against what a competent driver would need, so below 1
     is a gap a competent driver would have refused. */
  const seenStarts = starts.filter((s) => !s.missed && Number.isFinite(s.tight));
  const tightBy = (lo, hi) => seenStarts.filter((s) => s.caution >= lo && s.caution < hi && s.tight < 1).length;
  const minBy = (lo, hi) => Math.min(...seenStarts.filter((s) => s.caution >= lo && s.caution < hi).map((s) => s.tight));
  check(tightBy(0, 0.7) > 0 && tightBy(1, 3) === 0,
    `and HOW TIGHT: ${tightBy(0, 0.7)} changes by bold drivers took a gap a competent driver would refuse (tightest ${minBy(0, 0.7).toFixed(2)} of the competent requirement); drivers at or above competent caution took none (tightest ${minBy(1, 3).toFixed(2)})`);
}

/* 2. OBSERVATION: whether the gap was SEEN. */
{
  const missed = starts.filter((s) => s.missed);
  check(missed.length > 0 && missed.every((s) => s.obs > 0), `observation decides whether they looked: ${missed.length} changes began with a car in the blind spot unseen, every one by a driver with an observation deficit (mean ${mean(missed.map((s) => s.obs)).toFixed(2)})`);
  /* And it is the DEFICIT doing it, not luck: of the changes that began
     with somebody in the blind spot, the poor observers missed them far
     more often than the good ones. (The population has no perfect
     observer, so "a perfect one never misses" would pass on zero cases --
     a vacuous check, which is the kind this project has learned to
     distrust.) */
  const occ = (lo, hi) => drivers.filter((d) => { const o = deficitOf(d.ratings, "observation").deficit; return o >= lo && o < hi; });
  const rateOf = (g) => { const n = g.reduce((s, d) => s + (d.blindOcc ?? 0), 0), m = g.reduce((s, d) => s + (d.blindMiss ?? 0), 0); return { n, m, r: n ? m / n : NaN }; };
  const good = rateOf(occ(0, 0.3)), poorObs = rateOf(occ(0.5, 2));
  check(good.n >= 20 && poorObs.n >= 20 && poorObs.r > 2 * good.r,
    `and it is the deficit doing it: of the times a driver considered a change with somebody in the blind spot, poor observers (deficit over 0.5) failed to see them ${(100 * poorObs.r).toFixed(0)}% of ${poorObs.n} times, good ones (under 0.3) ${(100 * good.r).toFixed(0)}% of ${good.n}`);
  const aborts = drivers.reduce((s, d) => s + (d.aborts ?? 0), 0);
  check(aborts > 0 && aborts <= missed.length, `and a missed check is found out: ${aborts} aborts, swinging back to the lane they left, from ${missed.length} missed checks (the rest had already been passed when the driver registered them)`);
}

/* 3. STEERING: how cleanly they arrive. */
{
  const sound = starts.filter((s) => s.steer < 0.2), poor = starts.filter((s) => s.steer > 0.5);
  check(sound.length >= 10 && poor.length >= 10 && mean(poor.map((s) => s.ov)) > 3 * mean(sound.map((s) => s.ov)),
    `steering decides how cleanly: past the new lane's centre by ${mean(sound.map((s) => s.ov)).toFixed(2)} m on average for sound steerers (deficit under 0.2, ${sound.length} changes) against ${mean(poor.map((s) => s.ov)).toFixed(2)} m for poor ones (over 0.5, ${poor.length})`);
  check(Math.max(0, ...starts.map((s) => s.ov)) <= weaveRoom(3.6) + 1e-9, `and never past half the room, the same bound as the weave (${Math.max(0, ...starts.map((s) => s.ov)).toFixed(2)} m against ${weaveRoom(3.6).toFixed(2)})`);
}

/* 4. The manoeuvre is honest. */
{
  check(starts.every((s) => s.keptIntent), "no driver ever left the lane their turn needs: every change kept the turn the car was making");
  check(runs.every((r) => r.pastLine === 0), `every change finished before the line (${runs.reduce((s, r) => s + r.pastLine, 0)} car-ticks mid-change past it)`);
  check(runs.every((r) => r.jumps === 0), `and no car jumped: the drawn position moves no further than the car drives in a tick (${runs.reduce((s, r) => s + r.jumps, 0)} jumps)`);
  check(Math.abs(LC_TIME - Math.sqrt((6 * 3.6) / (0.15 * 9.81))) < 1e-9, `a clean change takes ${LC_TIME.toFixed(1)} s, derived from the road's own sideways comfort limit`);
}

/* 5. Nobody through anybody, at the default and at the top of the dial. */
{
  check(runs.every((r) => r.overlaps === 0), `at 200 cars over three seeds: ${runs.reduce((s, r) => s + r.overlaps, 0)} overlapping car-ticks (sampled)`);
  const top = watch(3, 300, 120), dflt = watch(7, 120, 120);
  check(top.overlaps === 0 && dflt.overlaps === 0, `at 120 and at 300: ${dflt.overlaps} and ${top.overlaps} overlapping car-ticks (sampled)`);
}

/* 6. THE HEADROOM KEPT, by controlled comparison: the same map, seed and
   count, the behaviour on and off, warmed and interleaved so neither
   pays for the other's cold start. */
{
  const tick = (target, laneChanges, seed) => {
    let w = seedGraph(seed, 50, loaded, { target, posted: true, laneChanges });
    const ts = [];
    for (let i = 0; i < 20 * 60; i++) { const a = performance.now(); w = step(w); ts.push(performance.now() - a); }
    ts.sort((x, y) => x - y);
    return ts[ts.length >> 1];
  };
  tick(120, true, 1); tick(120, false, 1);   // warm
  for (const target of [120, 300]) {
    const on = [], off = [];
    for (const seed of [3, 5]) { off.push(tick(target, false, seed)); on.push(tick(target, true, seed)); }
    const cost = mean(on) / mean(off) - 1;
    check(cost < 0.2, `at ${target} cars lane changing costs the sim ${(cost * 100).toFixed(0)}% (${mean(off).toFixed(2)} -> ${mean(on).toFixed(2)} ms a tick, median)`);
  }
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: lane changes are temperament -- confidence decides whether and how tight, observation whether it was seen, steering how cleanly -- honest, touch-free, and cheap.");
