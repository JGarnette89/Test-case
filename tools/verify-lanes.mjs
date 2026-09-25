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
import { lateralOf, changing, LC_TIME, LC_EVERY, RETURN_AFTER, KEEP_RIGHT_FAULT } from "../src/sim/lanechange.js";
import { weaveRoom, DT, CAR, wantedGap } from "../src/sim/traffic.js";
import { noticing } from "../src/sim/marking.js";
import { deficitOf } from "../src/core/driver.js";

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
        starts.push({ id: a.id, run: seed, caution: a.caution, obs: deficitOf(a.ratings, "observation").deficit, steer: deficitOf(a.ratings, "steering").deficit,
          gap: a.lc.gap, tight: a.lc.tight, missed: a.lc.missed, blind: a.lc.blind, mandatory: a.lc.mandatory, keepRight: a.lc.keepRight, ov: a.lc.ov, keptIntent: fromPath?.intent === p.intent });
      }
      if (changing(a.lc, w.t) && a.s > p.stopAt) pastLine++;
      if (a.lc) worstPast = Math.max(worstPast, Math.abs(lateralOf(a.lc, w.t)) - Math.abs(a.lc.L0));
      /* No jump: the drawn pose moves no further than the car drives in a tick, allowing for the sideways blend. */
      const q = poseOf(w, a), pq = last.get(a.id);
      if (pq && pq.k === a.k && Math.hypot(q.x - pq.x, q.y - pq.y) > Math.max(pq.v, a.v) * DT + 0.6) jumps++;
      last.set(a.id, { x: q.x, y: q.y, k: a.k, v: a.v });
    }
  }
  return { starts, drivers: [...drivers.values()].map((d) => ({ ...d, run: seed })), overlaps, pastLine, jumps, worstPast };
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
  check(starts.filter((s) => !s.mandatory).every((s) => s.keptIntent), `no driver changed lane BY CHOICE out of the lane their turn needs: all ${starts.filter((s) => !s.mandatory).length} discretionary changes kept the turn the car was making (the ${starts.filter((s) => s.mandatory).length} made FOR a turn are checked below)`);
  check(runs.every((r) => r.pastLine === 0), `every change finished before the line (${runs.reduce((s, r) => s + r.pastLine, 0)} car-ticks mid-change past it)`);
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
  check(runs.every((r) => r.overlaps === 0), `at 200 cars over three seeds: ${runs.reduce((s, r) => s + r.overlaps, 0)} overlapping car-ticks (sampled)`);
  const top = watch(3, 300, 120), dflt = watch(7, 120, 120);
  check(top.overlaps === 0 && dflt.overlaps === 0, `at 120 and at 300: ${dflt.overlaps} and ${top.overlaps} overlapping car-ticks (sampled)`);
}

/* 7. KEEP RIGHT: THE KNOWLEDGE AXIS ON THE LINK. The maintainer's ruling:
   "a measure of law adherence, since in Ontario drivers should be moving
   into the driving (curb) lane unless there's something in the way or
   they are making an upcoming left turn" (SIMULATOR.md 1.1.17).

   The properties, not the formula:
     - THE EXCEPTIONS ARE THE RULE. Every time the model says a driver is
       out of the curb lane with no reason, a restatement written here
       from the ruling -- not imported -- must agree that no exception
       held: no turn the lane to the right cannot make, nobody beside or
       just behind (a pass not finished), no slower car ahead there, a gap
       a competent driver would take. Judged on the driver's own decision
       tick, against the world they decided from. And it must be
       EXERCISED: the rule has to have found hundreds of such moments.
     - KNOWLEDGE DECIDES IT, and it is a comparison: weak-on-knowledge
       drivers are marked on far more of their occasions than sound ones.
     - THE RETURN IS NOT A SNAP: no driver moves back sooner after the
       reason passed than RETURN_AFTER.
     - THE LEFT LANE CLEARS: cruising out of the curb lane with no reason
       falls against the same seeds with the rule off.
     - IT IS MARKABLE, AND THE MARK IS KNOWLEDGE'S: every driver watched,
       the sheet carries keepRight faults; strip knowledge from every
       driver and they (nearly) vanish.

   Sample: three seeds, 150 s each, 200 cars -- about 70 occasions for
   the weak quarter and 150 for the sound half. The mark rates are
   comparisons across that many occasions, not one drive's
   (CLAUDE.md, cold start 3). */
{
  const SEEDS = [3, 4, 5], SECS = 150, CARS = 200;
  const kd = (a) => deficitOf(a.ratings ?? {}, "knowledge").deficit ?? 0;
  const exceptionHolds = (w, a) => {
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p.from];
    const right = `${leg.base}#${leg.lane + 1}`;
    if (!L.legs[right]) return "noLane";
    const exit = L.legs[p.to]?.base ?? p.to;
    const r2 = L.routesFrom(right).find((r) => (L.legs[L.paths[r].to]?.base ?? L.paths[r].to) === exit);
    if (!r2) return "turn";
    const s2 = a.s * (L.paths[r2].stopAt / p.stopAt), want = a.v0 ?? a.v;
    let ahead = null, behind = null;
    for (const b of w.actors) {
      if (b.id === a.id || (b.k ?? 0) !== (a.k ?? 0)) continue;
      if (L.paths[b.route].from !== right && !(changing(b.lc, w.t) && b.lc.fromLeg === right)) continue;
      const d = b.s - s2;
      if (d >= 0 && (!ahead || d < ahead.d)) ahead = { b, d };
      if (d < 0 && (!behind || -d < behind.d)) behind = { b, d: -d };
    }
    if ((behind && behind.d < 10) || (ahead && ahead.d < CAR.length + 2)) return "passing";
    if (ahead && ahead.d - CAR.length < Math.max(30, want * 4) && ahead.b.v < want - 1) return "inTheWay";
    const stop = (v, vl) => Math.max(0, (v * v - vl * vl) / 16);
    if (ahead && ahead.d - CAR.length < Math.max(1.5 + stop(a.v, ahead.b.v), wantedGap(a, ahead.b))) return "noGap";
    if (behind && behind.d - CAR.length < Math.max(1.5 + stop(behind.b.v, a.v), wantedGap(behind.b, a))) return "noGap";
    return null;
  };
  /* One run answers several questions. `mode` is "on", "off" (the rule
     switched off) or "stripped" (every driver's knowledge made perfect). */
  const run = (mode) => {
    let flagged = 0, cruising = 0, noReason = 0;
    const disagree = {}, delays = [], marks = { sound: 0, weak: 0, other: 0 };
    const occ = { sound: { n: 0, marked: 0 }, weak: { n: 0, marked: 0 } }, open = new Map();
    for (const seed of SEEDS) {
      let w = seedGraph(seed, 50, loaded, { target: CARS, posted: true, keepRight: mode !== "off" });
      /* Knowledge as DRAWN, recorded before any stripping, so a mark can
         be put down to the driver it belongs to. */
      const drawnKd = new Map();
      for (let i = 0; i < SECS * 20; i++) {
        const prev = w;
        w = step(w);
        /* Every driver watched from the tick they arrive, so the sheet is
           the whole population's, not a group chosen at one moment. */
        const fresh = w.actors.filter((a) => !drawnKd.has(a.id));
        if (fresh.length) {
          for (const a of fresh) drawnKd.set(a.id, kd(a));
          const ids = new Set(fresh.map((a) => a.id));
          w = { ...w,
            actors: w.actors.map((a) => (ids.has(a.id) ? { ...a, candidate: a.id, trip: 0, ...(mode === "stripped" ? { ratings: { ...a.ratings, knowledge: 1 } } : {}) } : a)),
            watching: [...(w.watching ?? []), ...fresh.map((a) => ({ id: a.id }))] };
        }
        w = noticing(w);
        const here = new Set();
        for (const a of w.actors) {
          here.add(a.id);
          const band = kd(a) < 0.2 ? "sound" : kd(a) > 0.5 ? "weak" : null;
          const was = prev.actors.find((x) => x.id === a.id);
          if (was && (a.keptRight ?? 0) > (was.keptRight ?? 0)) delays.push(a.returnDelay);
          const o = open.get(a.id);
          if (a.hogSince != null && !o && band) open.set(a.id, { since: a.hogSince, band });
          if (o && a.hogSince != null && w.t - o.since > KEEP_RIGHT_FAULT) o.marked = true;
          if (o && a.hogSince == null) { occ[o.band].n++; if (o.marked) occ[o.band].marked++; open.delete(a.id); }
          if (!was || (prev.tick + (a.n ?? 0)) % LC_EVERY !== 0 || a.lc) continue;
          const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p.from];
          if (!leg || (leg.lanes ?? 1) < 2 || a.v < 3 || a.s < 40 || a.s > p.stopAt - 60) continue;
          cruising++;
          if (leg.lane < leg.lanes - 1 && !exceptionHolds(prev, a)) noReason++;
          if (a.hogSince != null) { flagged++; const why = exceptionHolds(prev, a); if (why) disagree[why] = (disagree[why] ?? 0) + 1; }
        }
        for (const [id, o] of open) if (!here.has(id)) { occ[o.band].n++; if (o.marked) occ[o.band].marked++; open.delete(id); }
      }
      /* Occasions still open when the run ends are counted as they stand,
         and the map cleared: ids repeat in the next seed. */
      for (const o of open.values()) { occ[o.band].n++; if (o.marked) occ[o.band].marked++; }
      open.clear();
      for (const f of w.faults ?? []) {
        if (f.trait !== "keepRight") continue;
        const k = drawnKd.get(f.who) ?? 0;
        marks[k < 0.2 ? "sound" : k > 0.5 ? "weak" : "other"]++;
      }
    }
    return { flagged, disagree, cruising, noReason, occ, delays, marks };
  };
  const on = run("on"), off = run("off"), bare = run("stripped");
  const disagreements = Object.values(on.disagree).reduce((s, x) => s + x, 0);
  check(on.flagged >= 500 && disagreements === 0,
    `the exceptions are the rule: of ${on.flagged} decisions the model judged out of the curb lane with no reason, a restatement from the ruling found an exception holding in ${disagreements} ${JSON.stringify(on.disagree)}`);
  const rate = (b) => (b.n ? b.marked / b.n : NaN);
  check(on.occ.weak.n >= 40 && on.occ.sound.n >= 80 && rate(on.occ.weak) > 4 * rate(on.occ.sound) && rate(on.occ.sound) < 0.05,
    `knowledge decides it: weak-on-knowledge drivers (deficit over 0.5) were marked on ${(100 * rate(on.occ.weak)).toFixed(0)}% of ${on.occ.weak.n} occasions out of the curb lane with no reason, sound ones (under 0.2) on ${(100 * rate(on.occ.sound)).toFixed(0)}% of ${on.occ.sound.n}`);
  const sorted = on.delays.slice().sort((a, b) => a - b);
  check(sorted.length >= 50 && sorted[0] >= RETURN_AFTER - 1e-9,
    `the return is not a snap: ${sorted.length} returns, the soonest ${sorted[0]?.toFixed(1)} s after the reason passed (median ${sorted[sorted.length >> 1]?.toFixed(1)} s), against RETURN_AFTER ${RETURN_AFTER.toFixed(1)} s`);
  const share = (r) => r.noReason / r.cruising;
  check(share(on) < 0.75 * share(off),
    `the left lane clears: cruising out of the curb lane with no reason ${(100 * share(on)).toFixed(1)}% of the time with the rule, ${(100 * share(off)).toFixed(1)}% without it, same seeds`);
  const markedOn = on.marks.sound + on.marks.weak + on.marks.other, markedBare = bare.marks.sound + bare.marks.weak + bare.marks.other;
  check(markedOn >= 20 && on.marks.weak > 4 * on.marks.sound && markedBare <= 0.15 * markedOn,
    `markable, and knowledge's: every driver watched, the sheet carried ${markedOn} keepRight faults (${on.marks.weak} on weak-knowledge drivers, ${on.marks.sound} on sound); with every driver's knowledge made perfect, ${markedBare}`);
}

/* 6. THE HEADROOM KEPT, by controlled comparison: the same map, seed and
   count, the behaviour on and off, warmed and interleaved so neither
   pays for the other's cold start. */
{
  const tick = (target, laneChanges, seed, keepRight = true) => {
    let w = seedGraph(seed, 50, loaded, { target, posted: true, laneChanges, keepRight });
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
    /* ...of which keeping right is part: the same comparison with only it off. */
    const noKeep = [];
    for (const seed of [3, 5]) noKeep.push(tick(target, true, seed, false));
    const keepCost = mean(on) / mean(noKeep) - 1;
    check(keepCost < 0.1, `and keeping right is ${(keepCost * 100).toFixed(0)}% of it (${mean(noKeep).toFixed(2)} -> ${mean(on).toFixed(2)} ms)`);
  }
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: lane changes are temperament -- confidence decides whether and how tight, observation whether it was seen, steering how cleanly, knowledge whether they keep right -- honest, touch-free, and cheap.");
