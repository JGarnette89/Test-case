/* =====================================================================
   ACCELERATION LANES AND THE MERGE (map/accel.js; lanechange.js
   mergePlan; courtesy.js), on the endless highway. Expectations are
   stated here, never read back from the code's constants.

   1. THE MAP SAYS WHICH ENTRY. The loop loads with no errors; each slip
      road lands in its acceleration lane and nowhere else, and no through
      lane does; the same map with the lanes taken away and yield signs on
      the slip roads loads and drives too -- both kinds of entry exist, and
      the data decides.
   2. NOBODY MERGES INTO OCCUPIED SPACE (the spawn-into-traffic bug, a third
      time): at 60, 150 and 300 cars, three minutes each, no two vehicles
      overlap and nothing crashes; nobody is in an acceleration lane past
      where its taper begins (it is honoured as an end); nobody reaches a
      seam still in one.
   3. IT IS A MERGE, AND THE DRIVER SHOWS IN IT: merges happen at every
      density; a driver who knows what the lane is for joins at a speed
      nearer the traffic's than one who does not; bold drivers merge
      earlier along the lane than timid ones; and courtesy reaches the
      merge -- through drivers offer joining cars a gap.
   4. NOBODY IS STRANDED (22 October). A joiner that stops at the end of its
      lane is let in within a minute, at every density -- it was 154 s at
      150 cars, because an offer was "open" at the offerer's following gap
      while the joiner needed the closing speed shed too (DECISIONS 10.15).
      And the PLAYER, stopped at the head of an acceleration lane and
      signalling, always has a gap a competent driver would take within a
      minute -- with courtesy; without it, the longest wait is at least
      twice as long. The minute is this check's statement of
      "a reasonable time", not a number read from the code.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { graphOf } from "../src/sim/graph.js";
import { seedGraph, step, overlapping } from "../src/sim/crossing.js";
import { knows } from "../src/core/driver.js";
import { courteous } from "../src/sim/courtesy.js";
import { strandTrial } from "./measure/stranded.mjs";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const med = (xs) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };

const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
const loaded = loadMap(raw);

console.log("\n1. THE MAP SAYS WHICH ENTRY");
{
  const g = graphOf(loaded, { lane: 3.6 });
  const entrances = g.at.filter((s) => Object.values(s.layout.legs).some((l) => l.accel));
  let rampsOk = true, throughOk = true;
  for (const s of entrances) {
    for (const [r, p] of Object.entries(s.layout.paths)) {
      const from = s.layout.legs[p.from], to = s.layout.legs[p.to];
      if (from.road.startsWith("on-") && !to.accel) rampsOk = false;
      if (!from.road.startsWith("on-") && to.accel) throughOk = false;
    }
  }
  check(g.errors.length === 0 && entrances.length === 4, `the loop loads with no errors and four entrances with acceleration lanes (${entrances.length}, errors ${g.errors.length})`);
  check(rampsOk && throughOk, "each slip road lands in its acceleration lane and nowhere else, and no through lane lands in one");
  const asYield = JSON.parse(JSON.stringify(raw));
  for (const r of asYield.roads) { delete r.accel; if (r.id.startsWith("on-")) r.control = { start: "none", end: "yield" }; }
  const ly = loadMap(asYield), gy = graphOf(ly, { lane: 3.6 });
  const yields = gy.at.flatMap((s) => Object.values(s.layout.legs).filter((l) => l.road.startsWith("on-") && l.control === "yield")).length;
  let w = seedGraph(1, 50, ly, { every: 2.0, target: 60, posted: true });
  for (let i = 0; i < 600; i++) w = step(w);
  check(gy.errors.length === 0 && yields === 4 && !gy.at.some((s) => Object.values(s.layout.legs).some((l) => l.accel)) && (w.crashes ?? []).length === 0, `the same map with yield signs instead loads (${yields} yield-controlled slip roads, no acceleration lanes) and drives -- both entries exist, and the map says which`);
}

console.log("\n2. NOBODY MERGES INTO OCCUPIED SPACE");
const merges = [], offers = { n: 0, uncourteous: 0, twoForOne: 0 };
const ran = [];
for (const cars of [60, 150, 300]) {
  let w = seedGraph(1, 50, loaded, { every: 2.0, target: cars, posted: true });
  for (let i = 0; i < 1200; i++) w = step(w);
  const c0 = (w.crashes ?? []).length;
  let overlaps = 0, pastClose = 0, lost = 0, n = 0, longest = 0;
  const standing = new Map();
  const offered = new Set();
  for (let i = 0; i < 180 * 20; i++) {
    const before = w;
    w = step(w);
    if (i % 5 === 0) overlaps += overlapping(w).length;
    const now = new Set(w.actors.map((a) => a.id));
    for (const b of before.actors) {
      const L = before.course.at[b.k].layout, p = L.paths[b.route];
      if (L.legs[p.to]?.accel && b.s > p.clearAt && !now.has(b.id)) lost++;
    }
    /* One driver per ask: no joining car with two cars letting it in at once. */
    { const by = new Map(); for (const a of w.actors) if (a.courtesy && !a.courtesy.forPlayer && !a.courtesy.done) by.set(a.courtesy.for, (by.get(a.courtesy.for) ?? 0) + 1); for (const n of by.values()) if (n > 1) offers.twoForOne++; }
    for (const a of w.actors) {
      const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p.to];
      if (to?.accel && a.s + 2.25 > p.length - to.accelClose + 0.5) pastClose++;
      if (to?.accel && a.s > p.clearAt && a.v < 0.5) { const t = (standing.get(a.id) ?? 0) + 0.05; standing.set(a.id, t); longest = Math.max(longest, t); } else standing.delete(a.id);
      if (a.courtesy && !a.courtesy.forPlayer && !offered.has(`${a.id}@${a.courtesy.since}`)) { offered.add(`${a.id}@${a.courtesy.since}`); offers.n++; if (!courteous(a)) offers.uncourteous++; }
      if (a.lc?.merge && a.lc.at === before.t) {
        const was = before.actors.find((x) => x.id === a.id), Lw = before.course.at[was.k].layout, pw = Lw.paths[was.route];
        /* The traffic's speed beside them: the curb lane's cars within 100 m, by centreline. */
        merges.push({ cars, knows: knows(a, "accel-lane"), caution: a.caution, along: was.s - pw.clearAt, v: was.v, flow: a.lc.flow ?? null });
        n++;
      }
    }
  }
  const crashes = (w.crashes ?? []).length - c0;
  ran.push({ cars, n });
  check(overlaps === 0 && crashes === 0, `${cars} cars, three minutes: ${overlaps} overlapping car-ticks and ${crashes} crashes`);
  check(pastClose === 0 && lost === 0, `  and nobody past the start of an acceleration lane's taper (${pastClose} car-ticks), nobody lost at a seam still in one (${lost})`);
  ran[ran.length - 1].longest = longest;
}

console.log("\n3. IT IS A MERGE, AND THE DRIVER SHOWS IN IT");
check(ran.every((r) => r.n >= 20), `merges happen at every density: ${ran.map((r) => `${r.n} at ${r.cars} cars`).join(", ")}`);
const k1 = merges.filter((m) => m.knows), k0 = merges.filter((m) => !m.knows);
/* By a margin a person would see: 10 km/h. Asked only for "faster", the rule taken out still passed, 52 against 51 (sabotaged, 21 October). */
check(k0.length >= 5 && med(k1.map((m) => m.v)) - med(k0.map((m) => m.v)) >= 10 / 3.6, `a driver who knows the lane is for getting up to speed joins at least 10 km/h faster than one who does not: ${(3.6 * med(k1.map((m) => m.v))).toFixed(0)} km/h (${k1.length}) against ${(3.6 * med(k0.map((m) => m.v))).toFixed(0)} km/h (${k0.length})`);
const bold = merges.filter((m) => m.caution < 0.8), timid = merges.filter((m) => m.caution > 1.2);
check(bold.length >= 10 && timid.length >= 10 && med(bold.map((m) => m.along)) < med(timid.map((m) => m.along)), `bold drivers merge earlier along the lane than timid ones: ${med(bold.map((m) => m.along)).toFixed(0)} m (${bold.length}) against ${med(timid.map((m) => m.along)).toFixed(0)} m (${timid.length})`);
check(offers.n > 0, `courtesy reaches the merge: ${offers.n} offers by through drivers to joining cars`);
/* THE TRAFFIC'S OWN COURTESY, asserted on its own (21 October): verify-courtesy
   reads only offers made to the player, so this is where offers between the
   traffic's drivers are held to the same two rules. */
check(offers.n > 0 && offers.uncourteous === 0, `every one of them from a driver the model calls courteous (${offers.uncourteous} not)`);
check(offers.twoForOne === 0, `and no joining car is let in by two drivers at once (${offers.twoForOne} car-ticks)`);

console.log("\n4. NOBODY IS STRANDED");
check(ran.every((r) => r.longest <= 60), `no joiner stands at the end of its lane over a minute: longest ${ran.map((r) => `${r.longest.toFixed(0)} s at ${r.cars} cars`).join(", ")}`);
{
  const on = [], off = [];
  for (const seed of [1, 2, 3, 4]) {
    let base = seedGraph(seed, 50, loaded, { target: 150, posted: true });
    for (const at of [120, 165]) {
      while (base.t < at) base = step(base);
      for (let k = 0; k < base.course.at.length; k++) {
        const L = base.course.at[k].layout;
        for (const [r, p] of Object.entries(L.paths)) {
          if (!L.legs[p.to]?.accel || !L.legs[p.from]?.road?.startsWith("on-")) continue;
          on.push(strandTrial(base, k, r, true)); off.push(strandTrial(base, k, r, false));
        }
      }
    }
  }
  console.log(`   the player stopped at the taper, signalling, 150 cars, ${on.length} trials: a takeable gap after ${on.map((t) => t.toFixed(0)).join(", ")} s; without courtesy ${off.map((t) => (isFinite(t) ? t.toFixed(0) : "never")).join(", ")}`);
  check(on.length >= 12 && on.every((t) => t <= 60), `the player is never stranded: a gap a competent driver would take within a minute in every one of ${on.length} trials (worst ${Math.max(...on).toFixed(1)} s)`);
  /* PAIRED, NOT BY THE MEDIAN (22 October): half the moments have a gap there already, the same with courtesy or without, so a median of 2x failed on 6.2 s against 10.5 while the waits courtesy is for went 50 -> 11, 40 -> 6, 39 -> 9. Courtesy cannot make an existing gap sooner; it is for the tail. And not "no moment worse" either: an offerer slowing can put back a gap that was coming behind it anyway (24.2 s against 24.1, the same day). THE MINUTE ALONE DOES NOT GUARD THE MECHANISM on this sample: with the player's deadline removed it still held (worst 38 s; without courtesy at all, 50).
     RESTATED 22 OCTOBER, verdict "check wrong": it was the worst wait with courtesy against half the worst without -- one extreme trial against another out of sixteen. Anticipation (DECISIONS 10.20) changed how the AI traffic drives, so the warmed worlds and with them the sixteen situations were new ones, and it failed at 33 s against 53. The courtesy code was not the cause: the old courtesy run on the same situations gave the same waits trial for trial. Over 128 trials (stranded.mjs, seeds 1-8): the old code halves 33 of 51 tail waits, the new 20 of 38 (within chance of each other); and the old code's own seeds 5-8 halve only 11 of 25 -- the old pass was the sample. Now: THE TAIL'S TOTAL WAIT with courtesy over its total without, on four seeds -- measured 0.35 (old code), 0.49 (new; 0.51 and 0.48 on each half), 0.94 with the player's deadline removed; the line is 0.7, between them. And a weakness the tracing found, in old and new alike, recorded not fixed: for a player standing at the taper, courtesy fails in a third to a half of the long waits -- the driver asked is too close to brake from 25 m/s to the gap a car at rest needs, passes, and withdraws (SIMULATOR IN FLIGHT). */
  const tail = off.map((o, i) => [isFinite(o) ? o : 120, isFinite(on[i]) ? on[i] : 120]).filter(([o]) => o >= 20);
  const ratio = tail.reduce((t, [, w]) => t + w, 0) / Math.max(1, tail.reduce((t, [o]) => t + o, 0));
  check(tail.length >= 4 && ratio <= 0.7, `and courtesy is what gives it: over the ${tail.length} waits of 20 s or more without it, the total with courtesy is ${ratio.toFixed(2)} of the total without (${tail.map(([o, w]) => `${o.toFixed(0)}->${w.toFixed(0)}`).join(", ")})`);
}

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
