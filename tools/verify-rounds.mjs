/* =====================================================================
   THE SHORT GAME'S OWN CHECK (WORK-game-slice2 section 8; GAME.md).
   A round is one frozen decision: the car at its line, hold or go.

   THE POLICIES (tools/lib/round-drive.mjs) READ THE OPENINGS THEMSELVES, tick
   by tick, with crossing.js openTo -- never the round's own record -- so the
   round's timing is compared with a second statement of the same quantity.

   1. EVERY POOLED SEED BUILDS, and what the freeze shows is the pool's.
   2. THE ORACLE PASSES EVERY POOLED SEED, and in the wait pool it waited.
   3. GOING AT ONCE IS RIGHT IN `now` AND WRONG IN `wait`.
   4. GO WORKS WHEN THE WAY IS SHUT.
   5. THE TIMING TABLE, on real runs.
   6. THE RESTATED CONSTANT, held to crossing.js's own text.
   7. DETERMINISTIC.
   8. failedToYield (slice 1's rule, unchanged): the eager policy is the GO.
   9. THE VERDICT TABLE, on stated inputs.

   Every negative assertion carries its own line asserting the case arose.
   ===================================================================== */
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { TYPES, POOLS_RUN, drawSet, SET_SIZE } from "../src/game/rounds.js";
import { toDecision, verdictOf, timingStars, UNDUE, LAUNCH_SPAN, AT_LINE, FRONT_CLEAR } from "../src/game/round.js";
import { driveDecision, oracle, eager, late, tracker } from "./lib/round-drive.mjs";
import { loadMap } from "../src/map/load.js";
import { openTo, AT_REST, atNode, blockedBy } from "../src/sim/crossing.js";
import { lenOf } from "../src/sim/traffic.js";
import { aheadOf } from "../src/sim/drive.js";
import { REACTION_FLOOR } from "../src/core/perception.js";
import { END_WORDS, WORDS, delayWords } from "../src/game/words.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const ids = (v) => v.faults.map((f) => f.id);
const pathOf = (rs) => rs.world.course.at[rs.me.k].layout.paths[rs.me.route];
const pct = (a, b) => `${a} of ${b}`;
const stat = (xs) => { const s = xs.slice().sort((a, b) => a - b); return xs.length ? `min ${s[0].toFixed(2)}, median ${s[s.length >> 1].toFixed(2)}, max ${s[s.length - 1].toFixed(2)}` : "none"; };

/* Every pooled seed, as { type, pool, seed }. */
const POOLED = TYPES.flatMap((type) => ["now", "wait"].flatMap((pool) => type.pools[pool].map((seed) => ({ type, pool, seed }))));
const tag = (x) => `${x.type.id}/${x.pool ?? "-"}#${x.seed}`;

console.log(`\n0. THE POOLS (${POOLS_RUN})`);
for (const type of TYPES) {
  console.log(`        ${type.id}: ${type.cars} cars, now ${type.pools.now.length}, wait ${type.pools.wait.length}`);
  check(type.pools.now.length >= 5 && type.pools.wait.length >= 5, `${type.id}: at least 5 seeds in each pool (now ${type.pools.now.length}, wait ${type.pools.wait.length})`);
  const l = loadMap(type.map());
  const odd = (l.warnings ?? []).filter((w) => w.code !== "snapped-join");
  check(l.ok === true && odd.length === 0, `${type.id}: the map loads ok with no warning but the loader's note that roads end at the intersection`);
}

console.log("\n1. EVERY POOLED SEED BUILDS, AND THE FREEZE SHOWS THE POOL'S OWN CASE");
const frozenOf = new Map();
{
  const bad = [], notAtLine = [], notStopped = [], notFront = [], wrongOpen = [];
  let openNow = 0, shutWait = 0;
  for (const x of POOLED) {
    const rs = toDecision(x.type, x.seed, x.type.cars);
    if (!rs) { bad.push(tag(x)); continue; }
    frozenOf.set(tag(x), rs);
    const p = pathOf(rs);
    if (!(rs.me.v < AT_REST && Math.abs(p.stopAt - (rs.me.s + lenOf(rs.me) / 2)) <= AT_LINE)) notAtLine.push(tag(x));
    if (rs.me.stoppedAt == null) notStopped.push(tag(x));
    /* The check's own statement of "at the front": no other car of this leg ahead within FRONT_CLEAR bumper to bumper. */
    const L = rs.world.course.at[rs.me.k].layout;
    const ahead = rs.world.actors.some((a) => a.id !== rs.me.id && !a.shadow && L.paths[a.route]?.from === p.from && (a.k ?? 0) === (rs.me.k ?? 0) && a.s > rs.me.s && a.s - rs.me.s - lenOf(a) / 2 - lenOf(rs.me) / 2 < FRONT_CLEAR);
    if (ahead) notFront.push(tag(x));
    const open = openTo({ ...rs.me, caution: 1 }, rs.world, 1);
    if (open === (x.pool === "now")) { if (open) openNow++; else shutWait++; } else wrongOpen.push(tag(x));
  }
  check(POOLED.length >= 40, `EXPOSURE: ${POOLED.length} pooled seeds, at least 40`);
  check(bad.length === 0, `every pooled seed reaches its decision point${bad.length ? ` -- not ${bad.slice(0, 6).join(" ")}` : ""}`);
  check(notAtLine.length === 0, `the car is at rest with its front bumper within ${AT_LINE} m of the line in every one${notAtLine.length ? ` -- not ${notAtLine.slice(0, 6).join(" ")}` : ""}`);
  check(notStopped.length === 0, `its stop is counted in every one${notStopped.length ? ` -- not ${notStopped.slice(0, 6).join(" ")}` : ""}`);
  check(notFront.length === 0, `it is at the front in every one (no car of its leg within ${FRONT_CLEAR} m ahead)${notFront.length ? ` -- not ${notFront.slice(0, 6).join(" ")}` : ""}`);
  check(openNow >= 20 && shutWait >= 20, `EXPOSURE: open at the freeze in ${openNow} now seeds, shut in ${shutWait} wait seeds, at least 20 each`);
  check(wrongOpen.length === 0, `the way is open at the freeze in every now seed and shut in every wait seed (pools are not stale)${wrongOpen.length ? ` -- not ${wrongOpen.slice(0, 6).join(" ")}` : ""}`);
}

console.log("\n2. THE ORACLE (hold until the first opening has run REACTION_FLOOR, then go) PASSES EVERY POOLED SEED");
const holds = [];
{
  const bad = [];
  for (const x of POOLED) {
    const r = driveDecision(x.type, x.seed, x.type.cars, oracle);
    const v = r.verdict;
    if (!(r.rs.end?.why === "through" && v.made === x.type.task && v.stars === 3 && v.faults.length === 0)) bad.push(`${tag(x)}(${r.rs.end?.why},${v.stars}*,[${ids(v)}])`);
    if (x.pool === "wait") holds.push(r.rs.goAt - r.rs.decideAt);
  }
  check(bad.length === 0, `all ${POOLED.length} end through, make the task, earn 3 stars with no fault${bad.length ? ` -- not ${bad.slice(0, 6).join(" ")}` : ""}`);
  check(holds.length >= 20 && holds.every((h) => h >= 1.0 - 1e-6), `EXPOSURE: in the ${holds.length} wait seeds the oracle held at least 1.0 s (shortest ${Math.min(...holds).toFixed(2)} s)`);
  console.log(`        oracle hold times in the wait pool: ${stat(holds)} s [M, this run]`);
}

console.log("\n3. GOING AT ONCE IS RIGHT IN now AND WRONG IN wait");
const eagerRuns = [];
{
  for (const x of POOLED) eagerRuns.push({ x, r: driveDecision(x.type, x.seed, x.type.cars, eager) });
  const now = eagerRuns.filter((e) => e.x.pool === "now"), wait = eagerRuns.filter((e) => e.x.pool === "wait");
  check(now.length >= 20 && now.every((e) => e.r.T.freezeOpen === true), `EXPOSURE: ${now.length} now seeds, the way open at the freeze in every one (the check's own openTo)`);
  const notThree = now.filter((e) => e.r.verdict.stars !== 3);
  check(notThree.length === 0, `eager in every now seed: 3 stars${notThree.length ? ` -- not ${notThree.slice(0, 6).map((e) => `${tag(e.x)}(${e.r.rs.end?.why},${e.r.verdict.stars}*,[${ids(e.r.verdict)}])`).join(" ")}` : ""}`);
  check(wait.length >= 20 && wait.every((e) => e.r.T.freezeOpen === false), `EXPOSURE: ${wait.length} wait seeds, the way shut at the freeze in every one (the check's own openTo)`);
  const three = wait.filter((e) => e.r.verdict.stars === 3);
  check(three.length === 0, `eager in every wait seed: never 3 stars${three.length ? ` -- 3 stars in ${three.slice(0, 6).map(tag).join(" ")}` : ""}`);
  const fty = wait.filter((e) => ids(e.r.verdict).includes("failedToYield")), hit = wait.filter((e) => e.r.rs.end?.why === "contact" || ids(e.r.verdict).some((f) => f === "collision" || f === "struckPerson")), early = wait.filter((e) => e.r.verdict.notes.some((n) => n.id === "early"));
  const hard = wait.filter((e) => ids(e.r.verdict).includes("failedToYield") || e.r.rs.end?.why === "contact");
  console.log(`        eager in the ${wait.length} wait seeds [M, this run]: failedToYield ${fty.length}; contact or a collision ${hit.length}; the note early ${early.length}; failedToYield or contact ${hard.length} (${((100 * hard.length) / wait.length).toFixed(0)}%); 0 stars ${wait.filter((e) => e.r.verdict.stars === 0).length}, 1 star ${wait.filter((e) => e.r.verdict.stars === 1).length}, 2 stars ${wait.filter((e) => e.r.verdict.stars === 2).length}`);
  if (hard.length * 2 < wait.length) console.log(`        FINDING: fewer than half of the wait seeds flag going at once by failedToYield or contact (${hard.length} of ${wait.length}): going now is a real mistake in the rest only by the note "early" (2 stars)`);
}

console.log("\n4. GO WORKS WHEN THE WAY IS SHUT");
{
  const wait = eagerRuns.filter((e) => e.x.pool === "wait");
  const times = wait.filter((e) => e.r.rs.crossedAt != null).map((e) => e.r.rs.crossedAt - e.r.rs.goAt);
  const noCross = wait.filter((e) => e.r.rs.crossedAt == null);
  check(wait.length >= 20 && wait.every((e) => e.r.T.freezeOpen === false), `EXPOSURE: ${wait.length} wait seeds, the way shut at the freeze in every one`);
  check(noCross.length === 0, `the car crossed its line in every one of them${noCross.length ? ` -- not ${noCross.slice(0, 6).map((e) => `${tag(e.x)}(${e.r.rs.end?.why})`).join(" ")}` : ""}`);
  check(times.length > 0 && times.every((t) => t <= 3.0 + 1e-6), `...within 3.0 s of GO in every one (worst ${times.length ? Math.max(...times).toFixed(2) : "-"} s; ${stat(times)}) [M, this run]`);
}

{
  /* THE AUTOPILOT'S RULE "ignore a line stop marker before the line while going" is exercised only if such a marker ever appears in `go`
     before the line. Counted on the eager runs, tick by tick (aheadOf on the world before the tick). Zero means the rule is dead code on
     these seeds and a sabotage of it cannot fail anything: CANNOT TELL, reported, never a pass. */
  let markers = 0, goTicks = 0;
  const waitSeeds = POOLED.filter((p) => p.pool === "wait");
  for (const x of waitSeeds) {
    driveDecision(x.type, x.seed, x.type.cars, eager, { onTick: (before) => {
      if (before.phase !== "gone" || before.crossedAt != null || before.me.v < 0.3) return;
      goTicks++;
      if (aheadOf(before.me, before.world.course, before.world).stop?.line) markers++;
    } });
  }
  console.log(`        line stop markers met in go before the line: ${markers} in ${goTicks} moving ticks of ${waitSeeds.length} eager runs [M, this run]`);
  if (markers === 0) console.log("        CANNOT TELL: no line marker ever appeared before the line in go, so the autopilot's rule to ignore it is not exercised here and nothing above would fail if it were removed");
}

console.log("\n5. THE TIMING TABLE, ON REAL RUNS (late(x): go at the first opening plus x)");
{
  const waitSeeds = POOLED.filter((x) => x.pool === "wait");
  for (const [x, stars, undue] of [[0.5, 3, false], [1.8, 2, false], [3.0, 1, false], [4.5, 1, true]]) {
    const runs = waitSeeds.map((s) => ({ s, r: driveDecision(s.type, s.seed, s.type.cars, () => late(x)) }));
    const kept = runs.filter((e) => e.r.T.goneIn === true), skipped = runs.length - kept.length;
    const wrong = kept.filter((e) => e.r.verdict.timingStars !== stars || ids(e.r.verdict).includes("undueDelay") !== undue);
    const off = kept.filter((e) => Math.abs(e.r.verdict.delay - (e.r.T.goAt - e.r.T.first.from)) > 1e-6 || Math.abs(e.r.verdict.delay - x) > 0.051);
    console.log(`        late(${x}): kept ${kept.length}, skipped ${skipped} (the opening did not stay open) [M, this run]`);
    check(kept.length >= 10, `late(${x}): EXPOSURE ${kept.length} wait seeds where the opening stays open long enough, at least 10`);
    check(wrong.length === 0, `late(${x}): ${stars} timing stars${undue ? " and undueDelay" : " and no undueDelay"} in every one of ${kept.length}${wrong.length ? ` -- not ${wrong.slice(0, 4).map((e) => `${tag(e.s)}(${e.r.verdict.timingStars}*, delay ${e.r.verdict.delay?.toFixed(2)})`).join(" ")}` : ""}`);
    check(off.length === 0, `late(${x}): the round's delay is the check's own (go minus the first opening's start) and within a tick of ${x} s in every one${off.length ? ` -- not ${off.slice(0, 4).map((e) => tag(e.s)).join(" ")}` : ""}`);
  }
  /* The praise and the notes on the table's two ends, said. */
  const r = driveDecision(waitSeeds[0].type, waitSeeds[0].seed, waitSeeds[0].type.cars, () => late(0.5));
  check(r.verdict.delay != null && delayWords(r.verdict.delay, r.verdict.openAtFreeze).startsWith("You went 0.5 s after the road was clear"), `the delay is said: "${delayWords(r.verdict.delay, r.verdict.openAtFreeze)}"`);
  check(delayWords(1.44, true) === "The road was clear when you arrived; you went after 1.4 s.", "and, when the way was open at the freeze, as the spec words it");
}

console.log("\n6. THE RESTATED CONSTANT");
{
  /* round.js's UNDUE restates crossing.js's `const UNDUE_AT = 4.0;` (not exported; exporting it is an edit under src/sim). This is the one place the two are held together. */
  const src = readFileSync(new URL("../src/sim/crossing.js", import.meta.url), "utf8");
  const m = /const UNDUE_AT = ([0-9.]+);/.exec(src);
  check(!!m, "crossing.js has a line `const UNDUE_AT = <n>;` (the exposure: the text was found)");
  check(m && Number(m[1]) === UNDUE, `round.js UNDUE (${UNDUE}) equals crossing.js UNDUE_AT (${m?.[1]})`);
}

console.log("\n7. DETERMINISTIC");
{
  const x = POOLED.find((p) => p.pool === "wait");
  const a = driveDecision(x.type, x.seed, x.type.cars, () => late(1.8)), b = driveDecision(x.type, x.seed, x.type.cars, () => late(1.8));
  check(a.ticks > 100 && a.rs.end != null, `the run arose (${a.ticks} ticks, ended ${a.rs.end?.why})`);
  check(isDeepStrictEqual(a.verdict, b.verdict) && isDeepStrictEqual(a.rs.me, b.rs.me) && a.rs.world.t === b.rs.world.t, `the same type, seed, cars and policy twice: the same verdict, car and clock (${a.rs.world.t.toFixed(2)} s)`);
  const s1 = drawSet(12345), s2 = drawSet(12345), s3 = drawSet(54321);
  check(s1.length === SET_SIZE && isDeepStrictEqual(s1.map((r) => [r.type.id, r.pool, r.seed]), s2.map((r) => [r.type.id, r.pool, r.seed])), `a set seed draws the same ${SET_SIZE} rounds twice`);
  check(!isDeepStrictEqual(s1.map((r) => r.seed), s3.map((r) => r.seed)) || !isDeepStrictEqual(s1.map((r) => r.type.id), s3.map((r) => r.type.id)), "and another set seed draws other rounds");
  check(TYPES.every((t) => s1.some((r) => r.type.id === t.id)), "a set holds one of each type");
  /* Over many sets: wait drawn at about P_WAIT. [instrument: a tolerance wide enough for 400 draws] */
  let w = 0, n = 0;
  for (let i = 1; i <= 80; i++) for (const r of drawSet(i)) { n++; if (r.pool === "wait") w++; r.type.pools[r.pool].includes(r.seed) || failed++; }
  check(n === 80 * SET_SIZE && Math.abs(w / n - 0.7) < 0.08, `over 80 sets, the wait pool is drawn ${((100 * w) / n).toFixed(0)}% of the time (0.7 asked), every seed from its own pool [M, this run]`);
}

console.log("\n8. failedToYield (SLICE 1's RULE): THE EAGER POLICY IS THE GO");
{
  /* The rule, stated here from the sim's own calls, on every pooled seed (and the extra seeds of each type, so the stop rule and the gap rule
     are each exposed): read tick by tick -- the last pull-away from rest within LAUNCH_SPAN of the line before the crossing: whether a
     sound driver standing there had an opening (openTo), who the sim says it had to yield to, each with the control their road POSTS in
     the round's own map data -- and whether the way was open on the crossing tick. */
  const postedOf = (type) => Object.fromEntries(type.map().roads.map((r) => [r.id, r.control?.end ?? "none"]));
  const seeds = [...POOLED.map((x) => ({ type: x.type, seed: x.seed }))];
  for (const type of TYPES) for (let s = 1; s <= 40; s++) if (!type.pools.now.includes(s) && !type.pools.wait.includes(s)) seeds.push({ type, seed: s });
  const rows = [];
  for (const x of seeds) {
    const posted = postedOf(x.type);
    let cross = null, launch = null;
    const r = driveDecision(x.type, x.seed, x.type.cars, eager, {
      onTick: (before, after) => {
        if (!before.me || before.crossedAt != null || before.phase !== "gone") return;
        const L = before.world.course.at[before.me.k].layout, p = L.paths[before.me.route];
        if (before.me.k === before.targetK && (before.me.v ?? 0) < AT_REST && (after.me.v ?? 0) >= AT_REST && before.me.s <= p.stopAt && p.stopAt - before.me.s < LAUNCH_SPAN) {
          const sound = { ...before.me, caution: 1 };
          const holders = atNode(before.world, before.world.actors, before.me.k).filter((a) => a.id !== before.me.id && blockedBy(sound, a, L, 1, before.world.t));
          launch = { open: openTo(sound, before.world, 1), byStop: holders.some((a) => !a.going && posted[L.legs[L.paths[a.route].from].road] === "stop") };
        }
        if (after.crossedAt != null) {
          const open = openTo({ ...before.me, caution: 1 }, before.world, 1);
          cross = { open, launchOpen: launch?.open ?? null, byStop: !!launch?.byStop, launched: !!launch, expected: launch ? launch.byStop || (!launch.open && !open) : !open };
        }
      },
    });
    if (r) rows.push({ ...x, r, cross });
  }
  const crossed = rows.filter((x) => x.cross), flagged = (x) => ids(x.r.verdict).includes("failedToYield");
  const byStop = crossed.filter((x) => x.cross.byStop), bothShut = crossed.filter((x) => !x.cross.byStop && x.cross.launched && x.cross.launchOpen === false && !x.cross.open);
  const gapOnly = crossed.filter((x) => !x.cross.byStop && x.cross.launchOpen === false && x.cross.open), openBoth = crossed.filter((x) => x.cross.launchOpen === true && x.cross.open);
  console.log(`        eager runs that crossed: ${crossed.length} of ${rows.length}; held by a waiting driver at a stop sign at the pull-away ${byStop.length}; shut by a gap at the pull-away and still at the entry ${bothShut.length}; shut at the pull-away and open by the entry ${gapOnly.length}; open at both ${openBoth.length} [M, this run]`);
  check(byStop.length >= 3, `eager: EXPOSURE the stop rule held the way at the pull-away in ${byStop.length} runs, at least 3`);
  check(byStop.every(flagged), `eager: failedToYield in every one of them${byStop.filter((x) => !flagged(x)).length ? ` -- not ${byStop.filter((x) => !flagged(x)).slice(0, 6).map(tag).join(" ")}` : ""}`);
  check(gapOnly.length >= 3 && openBoth.length >= 3, `eager: EXPOSURE a gap shut at the pull-away but open by the entry in ${gapOnly.length} runs and open at both in ${openBoth.length}, at least 3 each`);
  check(![...gapOnly, ...openBoth].some(flagged), `eager: failedToYield in none of those ${gapOnly.length + openBoth.length}${[...gapOnly, ...openBoth].filter(flagged).length ? ` -- in ${[...gapOnly, ...openBoth].filter(flagged).slice(0, 6).map(tag).join(" ")}` : ""}`);
  const disagree = crossed.filter((x) => x.cross.expected !== flagged(x));
  check(disagree.length === 0, `eager: the verdict is the rule, run by run, in all ${crossed.length} (shut-at-both cases: ${bothShut.length})${disagree.length ? ` -- not ${disagree.slice(0, 6).map(tag).join(" ")}` : ""}`);
  const oracleRuns = POOLED.slice(0, 60).map((x) => driveDecision(x.type, x.seed, x.type.cars, oracle));
  const pulled = oracleRuns.filter((r) => r.rs.launch != null);
  check(pulled.length >= 30 && pulled.every((r) => !ids(r.verdict).includes("failedToYield")), `oracle control: it pulled away from rest at the line in ${pulled.length} of ${oracleRuns.length} runs, at least 30, and has failedToYield in none`);
}

console.log("\n9. THE VERDICT TABLE, ON STATED INPUTS");
{
  const type = TYPES[0];
  const ev = (id, severity, extra = {}) => ({ id, t: 1, severity, praise: false, ...extra });
  const rs = (events, { made = type.task, end = { why: "through" }, timing = null, openings = [], decideAt = 0 } = {}) => ({ def: type, events, made, end, timing, openings, decideAt });
  const stars = (events, o) => verdictOf(rs(events, o)).stars;
  const inside = (delay, extra = {}) => ({ kind: "inside", delay, from: 0, missedGap: false, atFreeze: false, ...extra });
  check(stars([]) === 3, "no event, through: 3 stars");
  check(stars([ev("underLimit", 1)]) === 2 && stars([ev("stoppedShort", 2)]) === 2, "worst fault severity 1 or 2: 2 stars");
  check(stars([ev("harshBraking", 3)]) === 1 && stars([ev("rolledStop", 4)]) === 1, "worst fault severity 3 or 4: 1 star");
  check(stars([ev("failedToYield", 5)]) === 0 && stars([ev("collision", 5), ev("underLimit", 1)]) === 0, "any fault of severity 5: 0 stars, whatever else");
  check(stars([], { end: { why: "time" } }) === 0 && stars([], { end: { why: "contact" } }) === 0 && stars([], { end: { why: "edge" } }) === 0, "a round that did not end through: 0 stars, with no fault at all");
  check(stars([ev("underLimit", 1)], { made: "left" }) === 2 && verdictOf(rs([], { made: "left" })).faults.some((f) => f.id === "wrongTurn" && f.severity === 2), "another turn than the task adds wrongTurn at severity 2");
  const two = verdictOf(rs([ev("harshBraking", 3), ev("harshBraking", 3), ev("underLimit", 1)]));
  check(two.faults.length === 2 && two.faults.find((f) => f.id === "harshBraking").count === 2, "each id once, with a count (two harshBraking is one entry of 2)");
  const by = verdictOf(rs([{ id: "struckBy", t: 1, severity: 4, praise: false, noFault: true }]));
  check(by.faults.length === 0 && by.stars === 3 && by.notes.length === 1, "being struck through no fault is no fault: 3 stars, said as a note");
  const pr = verdictOf(rs([{ id: "letIn", t: 1, severity: 1, praise: true }, { id: "streak", t: 1, severity: 2, praise: true }]));
  check(pr.praise.length === 1 && pr.praise[0].words === WORDS.letIn, "praise with words is shown, praise with none is not");
  check(Object.keys(END_WORDS).sort().join() === "contact,edge,time", "the three not-finished reasons have words");
  /* THE TIMING, stated: the stars by delay, the lower of timing and faults, the notes. */
  check([0, 1.0].every((d) => stars([], { timing: inside(d) }) === 3) && [1.01, 2.5].every((d) => stars([], { timing: inside(d) }) === 2) && [2.51, 3.9].every((d) => stars([], { timing: inside(d) }) === 1), "stars by delay: up to 1.0 s 3, up to 2.5 s 2, later 1");
  check(timingStars({ kind: "early" }) === 2 && timingStars(null) === 3, "went before the first opening: 2 stars; no timing yet: no limit");
  const u = verdictOf(rs([], { timing: inside(UNDUE) })), u2 = verdictOf(rs([], { timing: inside(UNDUE - 0.05) }));
  check(u.faults.some((f) => f.id === "undueDelay" && f.severity === 2) && u.stars === 1 && !u2.faults.some((f) => f.id === "undueDelay"), `undueDelay (severity 2) at ${UNDUE} s and not a tick before; 1 star`);
  check(stars([ev("underLimit", 1)], { timing: inside(0.2) }) === 2 && stars([ev("harshBraking", 3)], { timing: inside(0.2) }) === 1, "the lower of the timing and the fault table: a quick go with a fault keeps the fault's stars");
  const e1 = verdictOf(rs([], { timing: { kind: "early", delay: null, missedGap: false } })), e2 = verdictOf(rs([ev("failedToYield", 5)], { timing: { kind: "early", delay: null, missedGap: false } }));
  check(e1.notes.some((n) => n.id === "early") && e1.stars === 2 && !e2.notes.some((n) => n.id === "early") && e2.stars === 0, "early: the note and 2 stars when failedToYield did not flag it; no note, and 0 stars, when it did");
  check(verdictOf(rs([], { timing: inside(0.3, { missedGap: true }) })).notes.some((n) => n.id === "missedGap"), "missedGap is a note");
  check(verdictOf(rs([], { timing: inside(0.3) })).praise.some((p) => p.id === "quick" && p.words === "Right on time.") && !verdictOf(rs([], { timing: inside(2) })).praise.some((p) => p.id === "quick"), "quick is praise at 3 timing stars and at no other");
  check(verdictOf(rs([], { timing: inside(0), openings: [{ from: 0, to: null }], decideAt: 0 })).openAtFreeze === true && verdictOf(rs([], { timing: inside(1), openings: [{ from: 2, to: null }], decideAt: 0 })).openAtFreeze === false, "openAtFreeze says whether the first opening is the freeze moment");
  check(["undueDelay", "early", "missedGap", "quick"].every((id) => WORDS[id]), "the new words exist");
}

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}`);
process.exit(failed ? 1 : 0);
void REACTION_FLOOR; void tracker;
