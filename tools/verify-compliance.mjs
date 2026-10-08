/* =====================================================================
   VERIFY -- knowledge and compliance are two axes (R2-DESIGN.md 17), and
   knowledge is checked against how hard a sign is

   The maintainer: "well experienced drivers may know they are required to
   fully stop for a right turn on a red, but will roll through anyways. a
   new driver might not know that they can't do that and instead think
   it's right." And (30 September): "what if there was a sign difficulty
   level for each sign and the knowledge stat was a check against it?"
   KNOWLEDGE is whether a driver reads a sign right, checked against its
   difficulty; COMPLIANCE is whether they follow one they read.

     1. The draw: compliance for everybody, beside the five skills, as
        common a failing as any skill and independent of knowledge.
     2. Knowledge against difficulty: every sign kind carries one; a stop
        sign is read by everybody; the harder the sign the more misread
        it; a driver's reading of a kind is one draw, so a harder sign of
        that kind is misread by everybody who misread the easier one and
        more; and sound drivers read every everyday sign.
     3. THE READABILITY TEST, the split's own acceptance criterion:
        "COMPLIANCE IS SITUATIONAL. KNOWLEDGE IS CONSISTENT." Where
        knowledge now shows -- a right on red, which needs a full stop
        first -- the driver who does not read it rolls it whoever is
        about, the scofflaw only alone, with the cost of an occasion
        measured by its own instrument (the true world, time to the box),
        never the sim's `nobodyAbout`. And at stop signs nobody rolls for
        want of reading one.
     4. A sign's own difficulty: the same map with its stop signs made
        hard has drivers who read an ordinary one rolling them.

   Run: node tools/verify-compliance.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { emptyMap, road } from "../src/map/format.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { SIGN_KINDS } from "../src/map/format.js";
import { seedGraph, step, pathOf, layoutOf, DT } from "../src/sim/crossing.js";
import { movementLight } from "../src/sim/signal.js";
import { crosswalksOf } from "../src/sim/peds.js";
import { CAR, driver } from "../src/sim/traffic.js";
import { composeDriver, AXES, SKILLS, COMPLY_WEAK, DIFFICULTY, reads, deficitOf, soundnessOf, LACKING_AT } from "../src/core/driver.js";
import { townOf } from "../src/sim/towns.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

console.log("\n1. THE DRAW: COMPLIANCE BESIDE THE FIVE SKILLS");
{
  const N = 4000, ds = [];
  for (let s = 1; s <= N; s++) ds.push(composeDriver(s * 13 + 1));
  check(AXES.length === SKILLS.length + 1 && AXES.includes("compliance") && !SKILLS.includes("compliance"),
    `six axes: ${AXES.join(", ")} -- compliance drawn beside the learner's profile, not in it`);
  check(ds.every((d) => typeof d.ratings.compliance === "number" && d.ratings.compliance >= 0 && d.ratings.compliance <= 1 && Object.keys(DIFFICULTY).every((k) => d.stuck[k] >= 0 && d.stuck[k] <= 1)),
    "every driver carries a compliance rating, and one draw per kind of sign for how well it has stuck");
  const weak = ds.filter((d) => d.weakOn.includes("compliance")).length / N;
  const town = townOf("rolling-stops"), inTown = Array.from({ length: N }, (_, i) => composeDriver(i * 13 + 1, town)).filter((d) => d.weakOn.includes("compliance")).length / N;
  check(Math.abs(weak - COMPLY_WEAK) < 0.03 && inTown > 0.6,
    `compliance is as common a failing as any one skill (${(100 * weak).toFixed(0)}% weak, against ${(100 * COMPLY_WEAK).toFixed(0)}% derived from the profile), and most of a scofflaw town (${(100 * inTown).toFixed(0)}%)`);
  const xs = ds.map((d) => d.ratings.knowledge), ys = ds.map((d) => d.ratings.compliance);
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length, mx = mean(xs), my = mean(ys);
  const r = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * ys.reduce((s, y) => s + (y - my) ** 2, 0));
  const knowsNotCares = ds.filter((d) => reads(d, "right-on-red") && d.weakOn.includes("compliance")).length;
  const caresNotKnows = ds.filter((d) => !reads(d, "right-on-red") && !d.weakOn.includes("compliance")).length;
  check(Math.abs(r) < 0.1 && knowsNotCares > 100 && caresNotKnows > 100,
    `independent axes: correlation ${r.toFixed(3)}; at a right on red ${knowsNotCares} read it and do not care, ${caresNotKnows} care and do not read it`);
}

console.log("\n2. KNOWLEDGE IS CHECKED AGAINST HOW HARD A SIGN IS");
{
  const N = 20000, road = { speed: 13.9 };
  const ds = Array.from({ length: N }, (_, n) => driver(road, 1, n));
  check(SIGN_KINDS.every((k) => DIFFICULTY[k] != null), `every sign kind the map format has carries a difficulty (${SIGN_KINDS.join(", ")})`);
  const miss = (kind, d) => ds.filter((x) => !reads(x, kind, d)).length / N;
  check(miss("stop") === 0, `a stop sign is read by all ${N} drawn drivers`);
  const sweep = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((d) => miss("stop", d));
  check(sweep.every((x, i) => i === 0 || x >= sweep[i - 1]) && sweep[8] > 0.3 && sweep[0] < 0.01,
    `the harder the sign the more misread it: ${sweep.map((x) => (100 * x).toFixed(0) + "%").join(" ")} at difficulty 0.1 to 0.9`);
  let notNested = 0;
  for (const x of ds) for (const kind of Object.keys(DIFFICULTY)) if (!reads(x, kind, 0.3) && reads(x, kind, 0.6)) notNested++;
  check(notNested === 0, "a driver's reading of a kind is one draw: nobody who misreads a sign of it reads a harder one");
  const sound = ds.filter((x) => soundnessOf(x.ratings, "knowledge") > LACKING_AT);
  check(Object.entries(DIFFICULTY).every(([kind]) => sound.every((x) => reads(x, kind))),
    `and every driver sound on knowledge (${sound.length}) reads every everyday sign; the misreadings are the weak third's and the hard signs'`);
  console.log("   misread at the default difficulty: " + Object.entries(DIFFICULTY).map(([k, d]) => `${k} ${d} ${(100 * miss(k)).toFixed(1)}%`).join(", "));
}

console.log("\n3. COMPLIANCE IS SITUATIONAL, KNOWLEDGE IS CONSISTENT: THE READABILITY TEST");
{
  /* THE COST OF AN OCCASION, measured here and nowhere else: anybody in
     the true world within WITNESS seconds of this intersection's box, in
     it, or on foot at one of its crossings. Not the sim's rule. */
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
  const tally = {}, byDriver = new Map();
  const bump = (g, key) => { tally[g] = tally[g] ?? {}; tally[g][key] = (tally[g][key] ?? 0) + 1; };
  /* Stop signs on the city; a RIGHT ON RED on a signalled crossroads of
     its own, light and busy, twelve seeds -- the city's signals gave 35
     such occasions in fifteen minutes, too few to read a rate from. A car
     that went on the amber and crosses as it turns red is not one. */
  const P = (x, y) => ({ x, y, z: 0 });
  const lit = emptyMap("lit-x");
  lit.bounds = { x: 0, y: 0, w: 600, h: 600 };
  for (const [id, a] of [["w", P(0, 300)], ["e", P(600, 300)], ["n", P(300, 0)], ["s", P(300, 600)]]) lit.roads.push(road({ id, points: [a, P(300, 300)], control: { start: "none", end: "signal" } }));
  const litMap = loadMap(lit);
  /* SEVENTY-TWO SEEDS, not twenty-four (7 October). A quiet red is rare, so
     the right-on-red rows rest on a few DOZEN occasions, and the bound on
     alone against in company (25 points) is read off them: the lane-change
     floor moved every world, the sample moved with it, and 100% of 10
     against 73% of 15 failed it by two points -- inside the noise of ten.
     More road time, not a looser bound. */
  const MANY = Array.from({ length: 72 }, (_, i) => 3 + i);
  const RUNS = [[city, 200, [3, 5, 7]], [litMap, 4, MANY], [litMap, 40, MANY]];
  for (const [map, cars, seeds] of RUNS) for (const seed of seeds) {
    let w = seedGraph(seed, 50, map, { target: cars, posted: true, trucks: 0 });
    const open = new Map();
    for (let i = 0; i < 300 / DT; i++) {
      w = step(w);
      for (const a of w.actors) {
        if (a.player || a.crash) continue;
        const path = pathOf(w, a), L = layoutOf(w, a);
        /* The two occasions: a stop sign, and a right on red. */
        const kind = L.signal ? (path.intent === "right" && movementLight(L.signal, L.legs[path.from]?.base, "right", w.t, w.lights?.[a.k ?? 0]?.live) === "red" ? "right-on-red" : null)
          : L.place.control[path.from] === "stop" ? "stop" : null;
        const key = `${a.id}@${a.k}@${a.route}`;
        let o = open.get(key);
        const toLine = path.stopAt - CAR.length / 2 - a.s;
        /* An occasion is watched from its start: a car that stopped during
           the world's warm-up, before t = 0, was never seen to stop. (Not
           any earlier stop mark: a roller marks its crawl at the line.) */
        if (!o && kind && toLine < 2 && toLine > -1) open.set(key, o = { kind, seen: witnessed(w, a), rested: false, before: a.stoppedAt != null && a.stoppedAt < 0 });
        if (!o) continue;
        if (a.v < 0.3) o.rested = true;
        if (a.s >= path.stopAt && !o.done) {
          o.done = true;
          if (o.before) continue;
          /* A right on red is one only if it is still red at the line --
             a light gone green on the way in asks for no stop. */
          if (o.kind === "right-on-red" && (movementLight(L.signal, L.legs[path.from]?.base, "right", w.t, w.lights?.[a.k ?? 0]?.live) !== "red" || a.amberGo)) continue;
          const g = !reads(a, o.kind) ? "unread" : a.rollsStops === "unwatched" ? "scofflaw" : deficitOf(a.ratings, "compliance").deficit < 0.2 ? "sound" : null;
          if (!g) continue;
          bump(`${o.kind}:${g}`, `${o.seen ? "seen" : "alone"}.${o.rested ? "rest" : "roll"}`);
          if (g === "scofflaw") {
            const d = byDriver.get(`${seed}:${a.id}`) ?? { rolledAlone: 0, restedSeen: 0, seen: 0 };
            if (!o.seen && !o.rested) d.rolledAlone++;
            if (o.seen) { d.seen++; if (o.rested) d.restedSeen++; }
            byDriver.set(`${seed}:${a.id}`, d);
          }
        }
      }
    }
  }
  const rate = (g, where) => { const t = tally[g] ?? {}; const r = t[`${where}.roll`] ?? 0, s = t[`${where}.rest`] ?? 0; return { r: r / Math.max(1, r + s), n: r + s }; };
  const row = (g) => `alone ${(100 * rate(g, "alone").r).toFixed(0)}% of ${rate(g, "alone").n}, in company ${(100 * rate(g, "seen").r).toFixed(0)}% of ${rate(g, "seen").n}`;
  for (const g of ["right-on-red:unread", "right-on-red:scofflaw", "right-on-red:sound", "stop:unread", "stop:scofflaw", "stop:sound"]) console.log(`   ${g.padEnd(24)} rolled: ${row(g)}`);
  const A = rate("right-on-red:unread", "alone"), As = rate("right-on-red:unread", "seen");
  const U = rate("right-on-red:scofflaw", "alone"), Us = rate("right-on-red:scofflaw", "seen");
  /* A QUIET RED IS RARE: a red for me is a green for the cross street, so
     somebody is nearly always about -- 5 scofflaw occasions alone in 48
     runs. What a right on red has to show is what knowledge alone shows
     there: the driver who does not read it rolls it alone and in company
     alike, and in company that driver and the scofflaw come apart. That a
     scofflaw rolls when alone is carried by the stop signs below, 400
     occasions each way; here it is reported. */
  check(A.n >= 10 && As.n >= 10 && Us.n >= 10, `enough at a right on red: ${A.n} and ${As.n} occasions for the driver who does not read it, alone and in company; ${Us.n} for the scofflaw in company`);
  check(A.r > 0.5 && As.r > 0.5 && Math.abs(A.r - As.r) < 0.25 && As.r > 3 * Us.r && Us.r < 0.2,
    `at a right on red, a driver who does not read it rolls it alone ${(100 * A.r).toFixed(0)}% and in company ${(100 * As.r).toFixed(0)}% -- consistent; a scofflaw in company ${(100 * Us.r).toFixed(0)}% (alone ${(100 * U.r).toFixed(0)}% of ${U.n}) -- situational`);
  const SA = rate("stop:scofflaw", "alone"), SS = rate("stop:scofflaw", "seen");
  check(rate("stop:unread", "alone").n + rate("stop:unread", "seen").n === 0 && SA.n >= 30 && SA.r > 3 * SS.r,
    `at stop signs nobody rolls for want of reading one; the scofflaws roll ${(100 * SA.r).toFixed(0)}% alone against ${(100 * SS.r).toFixed(0)}% in company`);
  const both = [...byDriver.values()].filter((d) => d.rolledAlone > 0 && d.seen > 0);
  check(both.length >= 10 && both.filter((d) => d.restedSeen > 0).length >= 0.8 * both.length,
    `and it is the same people: of ${both.length} scofflaws seen both alone and in company, ${both.filter((d) => d.restedSeen > 0).length} who rolled alone stopped properly with somebody there`);
  const S = rate("stop:sound", "alone"), Ss = rate("stop:sound", "seen");
  check(S.n >= 30 && S.r < 0.05 && Ss.r < 0.05, `and a driver sound on both rests at a stop sign, alone (${(100 * S.r).toFixed(0)}% rolled) and in company (${(100 * Ss.r).toFixed(0)}%)`);
}

console.log("\n4. A SIGN'S OWN DIFFICULTY IS AUTHORED DIFFICULTY");
{
  /* The same map and seed, its stop signs as drawn and then made hard: the
     drivers are the same people, and more of them roll. */
  /* The city's stops are written in the road shorthand; the hard version
     places a stop SIGN at every one of those ends, carrying its own
     difficulty -- the sign is the rule at its approach (verify-signs), so
     nothing else about the map moves. */
  const base = TEST_MAPS.find((t) => t.id === "city").build();
  const signs = base.roads.flatMap((r) => ["start", "end"].filter((e) => r.control?.[e] === "stop").map((e) => ({ kind: "stop", road: r.id, end: e, difficulty: 0.9 })));
  const hard = { ...base, signs };
  const rolls = (m) => {
    let w = seedGraph(3, 50, loadMap(m), { target: 150, posted: true, trucks: 0 });
    let n = 0, of = 0;
    const open = new Map();
    for (let i = 0; i < 240 / DT; i++) {
      w = step(w);
      for (const a of w.actors) {
        if (a.rollsStops) continue;   // compliance held out: this is reading alone
        const p = pathOf(w, a), L = layoutOf(w, a);
        if (L.place.control[p.from] !== "stop") continue;
        const key = `${a.id}@${a.k}@${a.route}`, toLine = p.stopAt - CAR.length / 2 - a.s;
        let o = open.get(key);
        if (!o && toLine < 2 && toLine > -1) open.set(key, o = { rested: false, before: a.stoppedAt != null && a.stoppedAt < 0 });
        if (!o) continue;
        if (a.v < 0.3) o.rested = true;
        if (a.s >= p.stopAt && !o.done) { o.done = true; if (o.before) continue; of++; if (!o.rested) n++; }
      }
    }
    return { n, of };
  };
  const plain = rolls(base), made = rolls(hard);
  check(signs.length > 50 && plain.of >= 30 && plain.n === 0 && made.n > 0.1 * made.of,
    `the same drivers at the same stop signs: ${plain.n} of ${plain.of} rolled as drawn, ${made.n} of ${made.of} with the signs made hard (difficulty 0.9) -- compliance held out`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: knowledge is checked against how hard a sign is -- a stop sign read by everybody, a hard sign by fewer, one draw per driver per kind -- and compliance is a disposition beside it: where knowledge shows, the driver who does not read a rule breaks it whoever is about, the scofflaw only alone.");
process.exit(failed ? 1 : 0);
