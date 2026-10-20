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
       finished before the line -- or, past the box on the road joined (the
       exit stretch, 20 October), before the seam -- never a jump;
     nobody drives through anybody, at the default car count and at the
       top of the dial;
     and it costs the sim a few percent, by controlled comparison -- the
       same map, seed and count with the behaviour switched off.

   Over three seeds, because a temperament read off one run is a sample
   size nobody stated (CLAUDE.md, the second shape of a check passing for
   the wrong reason).
   ===================================================================== */
import { Session } from "node:inspector/promises";
import { loadMap } from "../src/map/load.js";
import { testMap1 } from "../src/map/samples.js";
import { seedGraph, step, overlapping, poseOf } from "../src/sim/crossing.js";
import { lateralOf, changing, LC_TIME, LC_EVERY, RETURN_AFTER, KEEP_RIGHT_FAULT } from "../src/sim/lanechange.js";
import { weaveRoom, DT, CAR, wantedGap } from "../src/sim/traffic.js";
import { noticing } from "../src/sim/marking.js";
import { deficitOf, knows } from "../src/core/driver.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const loaded = loadMap(testMap1());
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/* Run a world and record every lane change as it starts and as it ends. */
function watch(seed, target, secs) {
  let w = seedGraph(seed, 50, loaded, { target, posted: true });
  /* WARM-UP IS ALREADY IN PROGRESS: seedGraph runs the world for a while
     before handing it back (crossing.js `warmed`), so some actors arrive
     here already mid-lane-change, and a few will already have aborted --
     3 to 4 of them a run, measured. Those aborts have no `starts` entry,
     because `starts` only begins recording on the first tick below; at
     lighter traffic that leakage never tipped the abort count past the
     window's own missed-check count, but it is not bounded by the
     window and does not belong compared against it. `aborts0` is each
     driver's count at this instant, so what gets compared is what
     happened IN the window, on both sides of the ratio. */
  const aborts0 = new Map(w.actors.map((a) => [a.id, a.aborts ?? 0]));
  /* A driver already mid-a-missed-check at t=0 is the same leak one
     tick deeper: their `starts` entry, if any, is before this loop and
     invisible to it, but a driver can hold only one lc at a time, so an
     abort of THEIRS during the window is that carried change resolving,
     not a new one this window recorded. */
  const carriedMissed = new Set(w.actors.filter((a) => a.lc?.missed && !a.lc.abort).map((a) => a.id));
  const starts = [], drivers = new Map();
  let overlaps = 0, pastLine = 0, pastSeam = 0, exitChanges = 0, jumps = 0, worstPast = 0, background = 0;
  const last = new Map();
  for (let i = 0; i < secs * 20; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    w = step(w);
    /* WHAT A LANE CHANGE COULD HAVE DONE, not every crash in the world
       (30 September): an overlap nobody recorded, or a crash with a car
       that was changing lanes. Attentive traffic has a background of
       crashes of its own -- an open item, counted separately -- and when
       trucks started hiding things it moved these seeds onto one: a bold
       left-turner at 72 km/h past its line into a car going straight, no
       lane change anywhere near it. */
    if (i % 5 === 0) {
      const byId = new Map(w.actors.map((x) => [x.id, x]));
      overlaps += overlapping(w).filter((o) => !(byId.get(o.a)?.crash && byId.get(o.b)?.crash)).length;
    }
    for (const c of (w.crashes ?? []).filter((x) => Math.abs(x.t - w.t) < 1e-9)) {
      const A = before.get(c.a), B = before.get(c.b);
      if ((A && A.lc) || (B && B.lc)) overlaps++; else background++;
    }
    for (const a of w.actors) {
      drivers.set(a.id, a);
      const was = before.get(a.id), L = w.course.at[a.k].layout, p = L.paths[a.route];
      if (a.lc && !a.lc.abort && (!was || !was.lc || was.lc.t0 !== a.lc.t0)) {
        const fromPath = L.paths[a.lc.from];
        starts.push({ id: a.id, run: seed, caution: a.caution, obs: deficitOf(a.ratings, "observation").deficit, steer: deficitOf(a.ratings, "steering").deficit,
          gap: a.lc.gap, tight: a.lc.tight, missed: a.lc.missed, blind: a.lc.blind, mandatory: a.lc.mandatory, keepRight: a.lc.keepRight, ov: a.lc.ov, exit: !!a.lc.exit, keptIntent: fromPath?.intent === p.intent });
        if (a.lc.exit) exitChanges++;
      }
      /* An approach change finishes before the line; one on the exit stretch (past the box, on the road joined) before the seam to the next intersection. */
      if (changing(a.lc, w.t) && !a.lc.exit && a.s > p.stopAt) pastLine++;
      if (was && was.k !== a.k && changing(was.lc, w.t - DT)) pastSeam++;
      if (a.lc) worstPast = Math.max(worstPast, Math.abs(lateralOf(a.lc, w.t)) - Math.abs(a.lc.L0));
      /* No jump: the drawn pose moves no further than the car drives in a tick, allowing for the sideways blend. */
      const q = poseOf(w, a), pq = last.get(a.id);
      if (pq && pq.k === a.k && Math.hypot(q.x - pq.x, q.y - pq.y) > Math.max(pq.v, a.v) * DT + 0.6) jumps++;
      last.set(a.id, { x: q.x, y: q.y, k: a.k, v: a.v });
    }
  }
  return { starts, drivers: [...drivers.values()].map((d) => ({ ...d, run: seed,
    aborts: Math.max(0, (d.aborts ?? 0) - (aborts0.get(d.id) ?? 0) - (carriedMissed.has(d.id) ? 1 : 0)) })), overlaps, pastLine, pastSeam, exitChanges, jumps, worstPast, background };
}

const runs = [3, 5, 9].map((seed) => watch(seed, 200, 150));
const starts = runs.flatMap((r) => r.starts), drivers = runs.flatMap((r) => r.drivers);

/* 1. CONFIDENCE: whether, and how tight. */
{
  const band = (lo, hi) => drivers.filter((d) => d.caution >= lo && d.caution < hi);
  /* WHETHER is about the change a driver CHOOSES: getting round somebody.
     A change for a turn is needed, and a return to the curb lane is the
     law -- knowledge's, not confidence's. Measured over seeds 3, 4 and 5,
     counting every change put bold at 2.1x timid with keeping right off
     and 1.4x with it on, while overtakes alone were 5.0x and 8.1x: the
     other two kinds do not separate by temperament (changes for a turn
     1.2x and 0.9x, returns to the curb lane 0.6x), and they drown the
     axis. So overtakes only.

     Keyed by run AND id: actor ids repeat between seeds, and a count
     joined by id alone credited one seed's car-5 with another's lane
     changes -- the first version of this read 2.0x. */
  const chose = new Map();
  for (const s of starts) if (!s.mandatory && !s.keepRight) chose.set(`${s.run}/${s.id}`, (chose.get(`${s.run}/${s.id}`) ?? 0) + 1);
  const rate = (g) => mean(g.map((d) => chose.get(`${d.run}/${d.id}`) ?? 0));
  const bold = band(0, 0.7), mid = band(0.7, 1.3), timid = band(1.3, 3);
  check(starts.length > 150, `three seeds, two and a half minutes each at 200 cars: ${starts.length} lane changes by ${drivers.length} drivers`);
  /* Ordered, and the extremes several times apart. The ratio is
     reported rather than thresholded pair by pair: how much more often a
     bold driver changes than a middling one is a property of the
     population the driver model draws, not something this check knows. */
  check(rate(bold) > rate(mid) && rate(mid) > rate(timid) && rate(bold) > 3 * rate(timid),
    `confidence decides WHETHER: overtaking changes per driver -- bold ${rate(bold).toFixed(2)} (${bold.length} drivers), middle ${rate(mid).toFixed(2)} (${mid.length}), timid ${rate(timid).toFixed(2)} (${timid.length}); bold ${(rate(bold) / rate(timid)).toFixed(1)} times timid`);
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
  check(starts.filter((s) => !s.mandatory && !s.exit).every((s) => s.keptIntent), `no driver changed lane BY CHOICE out of the lane their turn needs: all ${starts.filter((s) => !s.mandatory && !s.exit).length} discretionary changes on an approach kept the turn the car was making (the ${starts.filter((s) => s.mandatory).length} made FOR a turn are checked below)`);
  check(runs.every((r) => r.pastLine === 0), `every change on an approach finished before the line (${runs.reduce((s, r) => s + r.pastLine, 0)} car-ticks mid-change past it)`);
  check(runs.every((r) => r.pastSeam === 0) && runs.reduce((s, r) => s + r.exitChanges, 0) > 0, `and every change on an exit stretch before the seam to the next intersection (${runs.reduce((s, r) => s + r.exitChanges, 0)} exit changes, ${runs.reduce((s, r) => s + r.pastSeam, 0)} carried over a seam)`);
  check(runs.every((r) => r.jumps === 0), `and no car jumped: the drawn position moves no further than the car drives in a tick (${runs.reduce((s, r) => s + r.jumps, 0)} jumps)`);
  check(Math.abs(LC_TIME - Math.sqrt((6 * 3.6) / (0.15 * 9.81))) < 1e-9, `a clean change takes ${LC_TIME.toFixed(1)} s, derived from the road's own sideways comfort limit`);
}

/* 4b. CHANGING LANE TO MAKE A TURN. A driver chooses where they are going
   from everything the approach offers; if the lane they arrived in does
   not make that movement they move over, with the same gap acceptance
   and blind-spot check, or miss the turn if they cannot get over before
   the line. Confidence is in it: a timid driver refuses gaps a bold one
   takes, so misses more turns. */
{
  const need = drivers.reduce((s, d) => s + (d.turnsMet ?? 0) + (d.missedTurns ?? 0), 0);
  const met = drivers.reduce((s, d) => s + (d.turnsMet ?? 0), 0), missedT = drivers.reduce((s, d) => s + (d.missedTurns ?? 0), 0);
  const forTurn = starts.filter((s) => s.mandatory).length;
  check(need > 30 && forTurn > 20 && met / need > 0.6,
    `drivers in the wrong lane for their turn: ${need} of them, ${met} got over and made it (${(100 * met / need).toFixed(0)}%), ${missedT} could not before the line and went where their lane went; ${forTurn} lane changes were made for a turn`);
  const missRate = (lo, hi) => { const g = drivers.filter((d) => d.caution >= lo && d.caution < hi); const n = g.reduce((s, d) => s + (d.turnsMet ?? 0) + (d.missedTurns ?? 0), 0); return { n, r: n ? g.reduce((s, d) => s + (d.missedTurns ?? 0), 0) / n : NaN }; };
  const b = missRate(0, 0.7), tm = missRate(1.3, 3);
  check(b.n >= 10 && tm.n >= 10 && tm.r > b.r, `and confidence decides who makes it: timid drivers missed ${(100 * tm.r).toFixed(0)}% of the turns they needed a lane for (${tm.n}), bold ones ${(100 * b.r).toFixed(0)}% (${b.n})`);
}

/* 5. Nobody through anybody, at the default and at the top of the dial. */
{
  check(runs.every((r) => r.overlaps === 0), `at 200 cars over three seeds: ${runs.reduce((s, r) => s + r.overlaps, 0)} silent overlapping car-ticks (sampled) or crashes with a car changing lanes (the attentive background, not lane changes: ${runs.reduce((s, r) => s + r.background, 0)})`);
  const top = watch(3, 300, 120), dflt = watch(7, 120, 120);
  check(top.overlaps === 0 && dflt.overlaps === 0, `at 120 and at 300: ${dflt.overlaps} and ${top.overlaps} silent overlapping car-ticks or lane-change crashes (sampled; background ${dflt.background + top.background})`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: lane changes are temperament -- confidence decides whether and how tight, observation whether it was seen, steering how cleanly, -- honest and touch-free. Keeping right is verify-keepright, the cost verify-lanecost.");
