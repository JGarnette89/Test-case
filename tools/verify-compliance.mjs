/* =====================================================================
   VERIFY -- knowledge and compliance are two axes (R2-DESIGN.md 17)

   The maintainer: "well experienced drivers may know they are required to
   fully stop for a right turn on a red, but will roll through anyways. a
   new driver might not know that they can't do that and instead think
   it's right." KNOWLEDGE is whether a driver knows a rule, held as the set
   of rules they do not; COMPLIANCE is whether they follow one they know.

     1. The draw: the five skills exactly as before the split (verify-
        generate 10 holds that against an independent restatement), a
        compliance rating for everybody, as common a failing as any skill,
        independent of knowledge; knowledge a set, empty for a sound driver
        and full for the worst, and patchy in between.
     2. THE READABILITY TEST, the design's own acceptance criterion:
        "COMPLIANCE IS SITUATIONAL. KNOWLEDGE IS CONSISTENT." A driver who
        knows the rule and ignores it breaks it when it is free; one who
        does not know it breaks it whoever is about, because nothing is
        being weighed. So on the city's stop signs, with the cost of an
        occasion measured by an instrument of its own -- the TRUE world,
        by time to the box, not the driver's picture and not the sim's
        `ABOUT` -- the two roll alike when nobody is about and apart when
        somebody is; the same scofflaw who rolls alone stops in company;
        and a driver sound on both rests.
     3. Keep right is split the same way: verify-lanes 5.

   Run: node tools/verify-compliance.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, pathOf, layoutOf } from "../src/sim/crossing.js";
import { crosswalksOf } from "../src/sim/peds.js";
import { DT, CAR } from "../src/sim/traffic.js";
import { composeDriver, AXES, SKILLS, RULES, COMPLY_WEAK, rulesUnknown, deficitOf, WEAK_RANGE, SOUND_RANGE } from "../src/core/driver.js";
import { townOf } from "../src/sim/towns.js";
import { rng } from "../src/core/rng.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

console.log("\n1. THE DRAW: COMPLIANCE BESIDE THE FIVE SKILLS, KNOWLEDGE A SET");
{
  const N = 4000, ds = [];
  for (let s = 1; s <= N; s++) ds.push(composeDriver(s * 13 + 1));
  check(AXES.length === SKILLS.length + 1 && AXES.includes("compliance") && !SKILLS.includes("compliance"),
    `six axes: ${AXES.join(", ")} -- compliance drawn beside the learner's profile, not in it`);
  check(ds.every((d) => typeof d.ratings.compliance === "number" && d.ratings.compliance >= 0 && d.ratings.compliance <= 1 && d.unknown.every((r) => RULES.includes(r))),
    "every driver carries a compliance rating and a set of unknown rules drawn from the named vocabulary");
  const weak = ds.filter((d) => d.weakOn.includes("compliance")).length / N;
  const town = townOf("rolling-stops"), inTown = Array.from({ length: N }, (_, i) => composeDriver(i * 13 + 1, town)).filter((d) => d.weakOn.includes("compliance")).length / N;
  check(Math.abs(weak - COMPLY_WEAK) < 0.03 && inTown > 0.6,
    `compliance is as common a failing as any one skill (${(100 * weak).toFixed(0)}% weak, against ${(100 * COMPLY_WEAK).toFixed(0)}% derived from the profile), and most of a scofflaw town (${(100 * inTown).toFixed(0)}%)`);
  /* Independent: a driver can be strong on one and weak on the other. */
  const xs = ds.map((d) => d.ratings.knowledge), ys = ds.map((d) => d.ratings.compliance);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0), r = cov / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  const knowsNotCares = ds.filter((d) => d.unknown.length === 0 && d.weakOn.includes("compliance")).length;
  const caresNotKnows = ds.filter((d) => d.unknown.length > 0 && !d.weakOn.includes("compliance")).length;
  check(Math.abs(r) < 0.1 && knowsNotCares > 100 && caresNotKnows > 100,
    `independent axes: correlation ${r.toFixed(3)}; ${knowsNotCares} know every rule and do not care, ${caresNotKnows} care and do not know them all`);
  /* The set: empty in the sound range, full at the bottom of the weak one,
     patchy between -- a driver knows some rules and not others. */
  const at = (k) => Array.from({ length: 500 }, (_, i) => rulesUnknown({ knowledge: k }, rng(i + 1)).length);
  const soundAt = at(SOUND_RANGE[0]), worst = at(WEAK_RANGE[0]), mid = at((WEAK_RANGE[0] + WEAK_RANGE[1]) / 2);
  check(soundAt.every((n) => n === 0) && worst.every((n) => n === RULES.length) && mid.some((n) => n > 0 && n < RULES.length),
    `knowledge is a set: sound drivers know every rule, the worst know none, and at ${((WEAK_RANGE[0] + WEAK_RANGE[1]) / 2).toFixed(2)} ${mid.filter((n) => n > 0 && n < RULES.length).length} of 500 know some and not others`);
}

console.log("\n2. COMPLIANCE IS SITUATIONAL, KNOWLEDGE IS CONSISTENT: THE READABILITY TEST");
{
  /* THE COST OF AN OCCASION, measured here and nowhere else: at the moment
     the car reaches its line, is anybody -- in the true world -- within
     WITNESS seconds of this intersection's box, in it, or on foot at one of
     its crossings? Not the sim's rule: a time rather than a distance, and
     the world as it is rather than as the driver pictures it. Cars behind
     on the same approach are not a cost. */
  const WITNESS = 4;
  const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
  const witnessed = (w, a) => {
    const k = a.k ?? 0, L = layoutOf(w, a), mine = pathOf(w, a), base = L.legs[mine.from]?.base ?? mine.from;
    for (const b of w.actors) {
      if (b.id === a.id || (b.k ?? 0) !== k) continue;
      const p = L.paths[b.route];
      if (!p) continue;
      if ((L.legs[p.from]?.base ?? p.from) === base && b.s <= a.s) continue;
      const toBox = p.stopAt - b.s;
      if (toBox < 0 ? -toBox < 12 + CAR.length : toBox / Math.max(b.v, 0.5) < WITNESS) return true;
    }
    const cws = crosswalksOf(w.course);
    return (w.peds ?? []).some((q) => q.state !== "struck" && cws[q.cw]?.k === k);
  };
  const tally = { always: {}, unwatched: {}, sound: {} };
  const bump = (g, key) => { tally[g][key] = (tally[g][key] ?? 0) + 1; };
  const byDriver = new Map();
  for (const seed of [3, 5, 7]) {
    let w = seedGraph(seed, 50, city, { target: 200, posted: true });
    const open = new Map();
    for (let i = 0; i < 300 / DT; i++) {
      w = step(w);
      for (const a of w.actors) {
        if (a.player || a.crash) continue;
        const path = pathOf(w, a);
        if (!path || layoutOf(w, a).place.control[path.from] !== "stop") continue;
        const key = `${a.id}@${a.k}@${a.route}`;
        let o = open.get(key);
        const toLine = path.stopAt - CAR.length / 2 - a.s;
        if (!o && toLine < 2 && toLine > -1) open.set(key, o = { seen: witnessed(w, a), rested: false });
        if (!o) continue;
        if (a.v < 0.3) o.rested = true;
        if (a.s >= path.stopAt && !o.done) {
          o.done = true;
          const g = a.rollsStops === "always" ? "always" : a.rollsStops === "unwatched" ? "unwatched" : deficitOf(a.ratings, "compliance").deficit < 0.2 && !(a.unknown ?? []).length ? "sound" : null;
          if (!g) continue;
          bump(g, `${o.seen ? "seen" : "alone"}.${o.rested ? "rest" : "roll"}`);
          if (g === "unwatched") {
            const d = byDriver.get(`${seed}:${a.id}`) ?? { rolledAlone: 0, restedSeen: 0, seen: 0 };
            if (!o.seen && !o.rested) d.rolledAlone++;
            if (o.seen) { d.seen++; if (o.rested) d.restedSeen++; }
            byDriver.set(`${seed}:${a.id}`, d);
          }
        }
      }
    }
  }
  const rate = (g, where) => { const r = tally[g][`${where}.roll`] ?? 0, s = tally[g][`${where}.rest`] ?? 0; return { r: r / Math.max(1, r + s), n: r + s }; };
  const row = (g) => `alone ${(100 * rate(g, "alone").r).toFixed(0)}% of ${rate(g, "alone").n}, in company ${(100 * rate(g, "seen").r).toFixed(0)}% of ${rate(g, "seen").n}`;
  console.log(`   rolled: does not know the rule -- ${row("always")}`);
  console.log(`           knows it, does not care -- ${row("unwatched")}`);
  console.log(`           sound on both           -- ${row("sound")}`);
  const A = rate("always", "alone"), As = rate("always", "seen"), U = rate("unwatched", "alone"), Us = rate("unwatched", "seen");
  check(A.n >= 30 && U.n >= 30 && As.n >= 30 && Us.n >= 30, "enough of each: at least 30 stop signs for each driver alone and in company");
  check(U.r > 0.5 && A.r > 0.5 && Math.max(A.r, U.r) < 1.5 * Math.min(A.r, U.r),
    `alone, the two are the same fault: a scofflaw rolls ${(100 * U.r).toFixed(0)}% of stop signs with nobody about, a driver who does not know the rule ${(100 * A.r).toFixed(0)}%`);
  check(As.r > 3 * Us.r && Us.r < 0.5 * U.r,
    `in company they come apart: the scofflaw rolls ${(100 * Us.r).toFixed(0)}% with somebody about, the unknowing driver ${(100 * As.r).toFixed(0)}% -- compliance faults cluster on the cheap occasions, knowledge faults do not`);
  const both = [...byDriver.values()].filter((d) => d.rolledAlone > 0 && d.seen > 0);
  const keptInCompany = both.filter((d) => d.restedSeen > 0).length;
  check(both.length >= 10 && keptInCompany >= 0.8 * both.length,
    `and it is the same people: of ${both.length} scofflaws seen both alone and in company, ${keptInCompany} who rolled alone stopped properly with somebody there`);
  const S = rate("sound", "alone"), Ss = rate("sound", "seen");
  check(S.n >= 30 && S.r < 0.05 && Ss.r < 0.05, `and a driver sound on both rests, alone (${(100 * S.r).toFixed(0)}% rolled) and in company (${(100 * Ss.r).toFixed(0)}%)`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: knowledge and compliance are two axes: knowledge a set of rules, compliance a disposition, independent; and on the city's stop signs the unknowing driver rolls whoever is about while the scofflaw rolls only alone.");
process.exit(failed ? 1 : 0);
