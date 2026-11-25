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
  (slice 5: 12 holds the decision FRAME and the time filter, 13 the stopping order, 14 forcedBrake and threading the needle, 15 the playback and
   the gestures as source text.)

   Every negative assertion carries its own line asserting the case arose.
   ===================================================================== */
import { BODY, resolveBody } from "../src/iso/body.js";
import { GAME_BODY, withGameBody } from "../src/game/look.js";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { TYPES, POOLS_RUN, drawSet, SET_SIZE } from "../src/game/rounds.js";
import { toDecision, toDecisionFrom, startRound, roundTick, press, release, roundWorld, verdictOf, timingStars, timingOf, UNDUE, LAUNCH_SPAN, AT_LINE, FRONT_CLEAR } from "../src/game/round.js";
import { HARSH_AT } from "../src/sim/traffic.js";
import { DT } from "../src/sim/crossing.js";
import { pageMore, pageLeft, PAGE_STEPS } from "../src/sim/pace.js";
import { driveDecision, oracle, eager, late, tracker } from "./lib/round-drive.mjs";
import { loadMap } from "../src/map/load.js";
import { openTo, AT_REST, atNode, blockedBy, conflictOf, CAR, poseOf, carriedWorld, carriedPose } from "../src/sim/crossing.js";
import { viewOf } from "../src/iso/project.js";
import { UP_HEADING } from "../src/iso/chase.js";
import { driverPose } from "../src/sim/drive.js";
import { relevantIds, screechAt, settleAt, introAt, frameCamera, decisionFrame, skidLines, stopOrder, arrivalSeconds, SAME_MOMENT, FAST, speedOf, SCREECH, SETTLE, INTRO_END, edgePoint, replayAt, streakOf, streaksFor, STREAK_S, REPLAY, REPLAY_RATE } from "../src/game/stage.js";
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

/* THE RELEVANT CARS, THE CHECK'S OWN STATEMENT (slice 5): another road user at the player's node whose path conflicts with the player's route
   and which is not yet past that conflict (the sim's own test, stated here from conflictOf and CAR), AND one of: standing at its line with its
   stop counted (`stoppedAt`) and not going; in the box (past its stop line) or going; or arriving -- its distance to ITS conflict over its speed
   at most 4.0 s [invented, the spec's]. Stated here and not read from stage.js, which is what is under test. Returns [{ a, why, secs }] for
   the conflicting cars not yet past, `why` null for the ones the time filter drops. */
const ARRIVE = 4.0;
function conflictingNow(rs) {
  const k = rs.me.k ?? 0, L = rs.world.course.at[k].layout, out = [];
  for (const a of atNode(rs.world, rs.world.actors, k)) {
    if (a.id === rs.me.id || a.shadow || a.player || a.route == null) continue;
    const hit = conflictOf(L, rs.me.route, a.route);
    if (!hit || a.s > hit.clearOf + CAR.length / 2 + (lenOf(a) - CAR.length)) continue;
    const q = L.paths[a.route], meet = conflictOf(L, a.route, rs.me.route), secs = meet && a.v > AT_REST ? (meet.a - a.s) / a.v : Infinity;
    let why = null;
    if (a.going || a.s >= q.stopAt) why = "box";
    else if (a.v < AT_REST && a.stoppedAt != null) why = "line";
    else if (secs <= ARRIVE) why = "arriving";
    /* ...or the sim's own sound driver must yield to it, however far out (review, 25 November): the car that makes it a wait round is shown. */
    else if (blockedBy({ ...rs.me, caution: 1 }, a, L, 1, rs.world.t)) why = "holds";
    out.push({ a, why, secs });
  }
  return out;
}

/* THE RING, READ BY THE CHECK ITSELF (section 11): one observation of a round state. The expectations are stated here from the sim's own
   calls (atNode, conflictOf, blockedBy) and not read from stage.js, which only supplies the ringed set under test. */
const relScan = { ticks: 0, holds: 0, farHolds: 0, missed: [], pastCars: 0, ringedPast: [], ringedNoConflict: [], withRing: 0, mismatch: [], dropped: 0, kept: 0 };
function observeRing(rs, acc) {
  const k = rs.me.k ?? 0, L = rs.world.course.at[k].layout, sound = { ...rs.me, caution: 1 }, t = rs.world.t;
  const ringed = new Set(relevantIds(rs.world, rs.me));
  const own = conflictingNow(rs), want = new Set(own.filter((c) => c.why).map((c) => c.a.id));
  acc.ticks++;
  acc.dropped += own.filter((c) => !c.why).length; acc.kept += want.size;
  if (ringed.size) acc.withRing++;
  if (ringed.size !== want.size || [...ringed].some((id) => !want.has(id))) acc.mismatch.push(`${rs.def.id}@${t.toFixed(2)}`);
  for (const a of atNode(rs.world, rs.world.actors, k)) {
    if (a.id === rs.me.id || a.shadow || a.player) continue;
    const hit = conflictOf(L, rs.me.route, a.route);
    /* PAST ITS CONFLICT: a car's `s` beyond where its path stops conflicting with the player's, with its length (the sim's own reading, blockedBy). */
    const past = !!hit && a.s > hit.clearOf + CAR.length / 2 + (lenOf(a) - CAR.length);
    if (blockedBy(sound, a, L, 1, t)) {
      acc.holds++;
      /* A holding car the time filter dropped is one the sound driver's CONSERVATIVE gap still waits for, further out than 4 s: counted, not a miss. */
      if (!ringed.has(a.id)) { if (own.some((c) => c.a.id === a.id && !c.why)) acc.farHolds++; else acc.missed.push(`${a.id}@${t.toFixed(2)}`); }
    }
    if (past) { acc.pastCars++; if (ringed.has(a.id)) acc.ringedPast.push(`${a.id}@${t.toFixed(2)}`); }
  }
  for (const id of ringed) {
    const a = rs.world.actors.find((c) => c.id === id);
    if (!a || !conflictOf(L, rs.me.route, a.route)) acc.ringedNoConflict.push(`${id}@${t.toFixed(2)}`);
  }
}

/* THE STOPPING ORDER, READ BY THE CHECK ITSELF (section 13): one observation of a round state at an all-way stop. Every pair of numbered cars with
   different numbers i < j: the later one stopped more than 0.4 s [stated here] after the earlier, and the sim's own blockedBy says (where their
   paths conflict at all) that j must yield to i and i need not yield to j. Pairs sharing a number are exempt (the right-hand rule settles them). */
const orderAcc = { freezes: 0, ticks: 0, numbered: 0, pairs: 0, pairsFreeze: 0, same: 0, flat: 0, youMissing: [], notSorted: [], wrong: [], reverse: [] };
function orderScan(rs, acc, name, atFreeze) {
  const L = rs.world.course.at[rs.me.k].layout, t = rs.world.t, rows = stopOrder(rs.world, rs.me);
  const byId = (id) => rs.world.actors.find((a) => a.id === id) ?? (rs.me.id === id ? rs.me : null);
  if (atFreeze) acc.freezes++; else acc.ticks++;
  acc.numbered += rows.length;
  if (atFreeze && !rows.some((r) => r.you && r.id === rs.me.id)) acc.youMissing.push(name);
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < rows.length; j++) {
    const ri = rows[i], rj = rows[j];
    if (ri.n >= rj.n) { if (i < j && ri.n === rj.n) acc.same++; continue; }
    const ci = byId(ri.id), cj = byId(rj.id);
    if (!(cj.stoppedAt - ci.stoppedAt > 0.4)) acc.notSorted.push(`${name}:${ri.id}<${rj.id}`);
    if (!conflictOf(L, cj.route, ci.route)) { acc.flat++; continue; }
    acc.pairs++; if (atFreeze) acc.pairsFreeze++;
    if (!blockedBy({ ...cj, caution: 1 }, ci, L, 1, t)) acc.wrong.push(`${name}@${t.toFixed(2)}:${rj.id} should yield to ${ri.id}`);
    if (blockedBy({ ...ci, caution: 1 }, cj, L, 1, t)) acc.reverse.push(`${name}@${t.toFixed(2)}:${ri.id} should not yield to ${rj.id}`);
  }
}

console.log("\n2. THE ORACLE (hold until the first opening has run REACTION_FLOOR, then go) PASSES EVERY POOLED SEED");
const holds = [], oracleForced = [], goToEnd = [];
{
  const bad = [];
  for (const x of POOLED) {
    /* Slice 3: every waiting tick of a wait seed is also read for who is ringed (section 11), so the relevance is judged on the road as
       it changes and not at the freeze alone. */
    const r = driveDecision(x.type, x.seed, x.type.cars, oracle, x.pool === "wait" ? { onTick: (before) => { if (before.phase === "waiting") { observeRing(before, relScan); if (x.type.id.startsWith("four-way")) orderScan(before, orderAcc, tag(x), false); } } } : {});
    const v = r.verdict;
    if (!(r.rs.end?.why === "through" && v.made === x.type.task && v.stars === 3 && v.faults.length === 0)) bad.push(`${tag(x)}(${r.rs.end?.why},${v.stars}*,[${ids(v)}])`);
    if (ids(v).includes("forcedBrake")) oracleForced.push(tag(x));
    if (x.pool === "wait") holds.push(r.rs.decision.goAt - r.rs.decision.decideAt);
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
  /* SLICE 5 (section 4): going early is no longer a star penalty in itself, so slice 4's "never 3 stars" and "at most 1 star" lines are gone;
     what the early GO did to the traffic is judged in section 14 (forcedBrake, threaded). */
  const fty = wait.filter((e) => ids(e.r.verdict).includes("failedToYield")), hit = wait.filter((e) => e.r.rs.end?.why === "contact" || ids(e.r.verdict).some((f) => f === "collision" || f === "struckPerson"));
  const hard = wait.filter((e) => ids(e.r.verdict).includes("failedToYield") || e.r.rs.end?.why === "contact");
  console.log(`        eager in the ${wait.length} wait seeds [M, this run]: failedToYield ${fty.length}; contact or a collision ${hit.length}; failedToYield or contact ${hard.length} (${((100 * hard.length) / wait.length).toFixed(0)}%);  0 stars ${wait.filter((e) => e.r.verdict.stars === 0).length}, 1 star ${wait.filter((e) => e.r.verdict.stars === 1).length}, 2 stars ${wait.filter((e) => e.r.verdict.stars === 2).length}, 3 stars ${wait.filter((e) => e.r.verdict.stars === 3).length}`);
}

console.log("\n4. GO WORKS WHEN THE WAY IS SHUT");
{
  const wait = eagerRuns.filter((e) => e.x.pool === "wait");
  const times = wait.filter((e) => e.r.rs.decision.crossedAt != null).map((e) => e.r.rs.decision.crossedAt - e.r.rs.decision.goAt);
  const noCross = wait.filter((e) => e.r.rs.decision.crossedAt == null);
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
      if (before.phase !== "gone" || before.decision.crossedAt != null || before.me.v < 0.3) return;
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
  /* stage.js's SAME_MOMENT restates crossing.js's `const SAME_MOMENT = 0.4;` (line 661, not exported), the sim's own tie tolerance between two stops. */
  const sm = /const SAME_MOMENT = ([0-9.]+);/.exec(src);
  check(!!sm, "crossing.js has a line `const SAME_MOMENT = <n>;` (the exposure: the text was found)");
  check(sm && Number(sm[1]) === SAME_MOMENT, `stage.js SAME_MOMENT (${SAME_MOMENT}) equals crossing.js SAME_MOMENT (${sm?.[1]})`);
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
        if (!before.me || before.decision.crossedAt != null || before.phase !== "gone") return;
        const L = before.world.course.at[before.me.k].layout, p = L.paths[before.me.route];
        if (before.me.k === before.targetK && (before.me.v ?? 0) < AT_REST && (after.me.v ?? 0) >= AT_REST && before.me.s <= p.stopAt && p.stopAt - before.me.s < LAUNCH_SPAN) {
          const sound = { ...before.me, caution: 1 };
          const holders = atNode(before.world, before.world.actors, before.me.k).filter((a) => a.id !== before.me.id && blockedBy(sound, a, L, 1, before.world.t));
          launch = { open: openTo(sound, before.world, 1), byStop: holders.some((a) => !a.going && posted[L.legs[L.paths[a.route].from].road] === "stop") };
        }
        if (after.decision.crossedAt != null) {
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
  const pulled = oracleRuns.filter((r) => r.rs.decision.launch != null);
  check(pulled.length >= 30 && pulled.every((r) => !ids(r.verdict).includes("failedToYield")), `oracle control: it pulled away from rest at the line in ${pulled.length} of ${oracleRuns.length} runs, at least 30, and has failedToYield in none`);
}

console.log("\n9. THE VERDICT TABLE, ON STATED INPUTS");
{
  const type = TYPES[0];
  const ev = (id, severity, extra = {}) => ({ id, t: 1, severity, praise: false, ...extra });
  const rs = (events, { made = type.task, end = { why: "through" }, timing = null, openings = [], decideAt = 0 } = {}) => ({ def: type, events, end, decision: { made, timing, openings, decideAt } });
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
  check(timingStars({ kind: "early" }) === 3 && timingStars(null) === 3, "going early is not a timing fault (3 timing stars: what it did to the traffic is the verdict's); no timing yet: no limit");
  const u = verdictOf(rs([], { timing: inside(UNDUE) })), u2 = verdictOf(rs([], { timing: inside(UNDUE - 0.05) }));
  check(u.faults.some((f) => f.id === "undueDelay" && f.severity === 2) && u.stars === 1 && !u2.faults.some((f) => f.id === "undueDelay"), `undueDelay (severity 2) at ${UNDUE} s and not a tick before; 1 star`);
  check(stars([ev("underLimit", 1)], { timing: inside(0.2) }) === 2 && stars([ev("harshBraking", 3)], { timing: inside(0.2) }) === 1, "the lower of the timing and the fault table: a quick go with a fault keeps the fault's stars");
  const early = { kind: "early", delay: null, missedGap: false };
  const e1 = verdictOf(rs([], { timing: early })), e2 = verdictOf(rs([ev("failedToYield", 5)], { timing: early })), e3 = verdictOf(rs([ev("forcedBrake", 3)], { timing: early })), e4 = verdictOf(rs([ev("collision", 5)], { timing: early })), e5 = verdictOf(rs([], { timing: early, end: { why: "contact" } })), e6 = verdictOf(rs([], { timing: inside(0.3) }));
  check(e1.stars === 3 && e1.praise.some((x) => x.id === "threaded" && x.words === "Threaded the needle.") && !e1.notes.some((n) => n.id === "early"), "early with nothing forced: threaded, 3 stars, praised in the words, and no note");
  check(e2.stars === 0 && !e2.praise.some((x) => x.id === "threaded") && e4.stars === 0 && !e4.praise.some((x) => x.id === "threaded") && e5.stars === 0 && !e5.praise.some((x) => x.id === "threaded"), "early with failedToYield, a collision or an ended-by-contact round: 0 stars and not threaded");
  check(e3.stars === 1 && e3.faults.some((f) => f.id === "forcedBrake" && f.severity === 3 && f.words === "You made another driver brake hard.") && !e3.praise.some((x) => x.id === "threaded"), "forcedBrake is a severity-3 fault in the words, 1 star, and the GO is not threaded");
  check(!e6.praise.some((x) => x.id === "threaded") && stars([ev("forcedBrake", 3)], { timing: inside(0.2) }) === 1, "a GO inside an opening is never threaded; a forcedBrake costs a timely GO its stars too (a consequence is a consequence)");
  check(!verdictOf(rs([ev("dawdling", 2)], { timing: inside(4.2) })).faults.some((f) => f.id === "dawdling") && verdictOf(rs([ev("dawdling", 2)], { timing: inside(4.2) })).faults.some((f) => f.id === "undueDelay"), "waiting is said once: with a timing verdict, dawdling is not a fault beside undueDelay");
  check(verdictOf(rs([], { timing: inside(0.3, { missedGap: true }) })).notes.some((n) => n.id === "missedGap"), "missedGap is a note");
  /* THE DELAY RUNS FROM THE FIRST OPENING, as the sim reads Jay's undue-delay band (crossing.js, above UNDUE_AT), not from the stretch
     finally taken. Stated, because the pooled runs cannot tell the two apart: sabotaged to the stretch taken, every real run still
     passed (review, 25 November). */
  const fo = timingOf([{ from: 10, to: 11 }, { from: 13, to: null }], 10, 13.5), late = timingOf([{ from: 10.2, to: 10.3 }, { from: 12, to: null }], 10, 12.5);
  check(fo.kind === "inside" && Math.abs(fo.delay - 3.5) < 1e-6 && fo.missedGap === false, `an opening let pass and a later one taken: the delay is from the first (3.5 s, not 0.5; got ${fo.delay?.toFixed(2)})`);
  check(late.kind === "inside" && Math.abs(late.delay - 0.5) < 1e-6, `a flicker shorter than REACTION_FLOOR was never an opening: the delay is from the real one (0.5 s; got ${late.delay?.toFixed(2)})`);
  check(verdictOf(rs([], { timing: inside(0.3) })).praise.some((p) => p.id === "quick" && p.words === "Right on time.") && !verdictOf(rs([], { timing: inside(2) })).praise.some((p) => p.id === "quick"), "quick is praise at 3 timing stars and at no other");
  check(verdictOf(rs([], { timing: inside(0), openings: [{ from: 0, to: null }], decideAt: 0 })).openAtFreeze === true && verdictOf(rs([], { timing: inside(1), openings: [{ from: 2, to: null }], decideAt: 0 })).openAtFreeze === false, "openAtFreeze says whether the first opening is the freeze moment");
  check(["undueDelay", "forcedBrake", "threaded", "missedGap", "quick"].every((id) => WORDS[id]) && !("early" in WORDS), "the words exist, and the dropped note `early` has none");
}

console.log("\n10. THE GAME'S BODY MOTION (Jay, 25 November: overemphasize it, so arrivals and movement read at a glance)");
{
  /* Stated here, not read from look.js: at least double the amplitude, less damping than the shared table, for every vehicle kind. */
  for (const kind of Object.keys(BODY)) {
    const base = BODY[kind], g = resolveBody(kind, GAME_BODY);
    check(g.roll >= 2 * base.roll - 1e-9 && g.pitch >= 2 * base.pitch - 1e-9 && g.rollZeta < base.rollZeta && g.pitchZeta < base.pitchZeta,
      `${kind}: the game's body moves at least twice as far (roll ${base.roll} to ${g.roll.toFixed(2)}, pitch ${base.pitch} to ${g.pitch.toFixed(2)} degrees per m/s^2) and is less damped (${base.rollZeta} to ${g.rollZeta.toFixed(2)})`);
  }
  const T0 = TYPES[0], { world } = roundWorld({ ...T0, seed: T0.pools.wait[0], cars: T0.cars });
  const sc = { world }, out = withGameBody(sc);
  check(world.actors.length > 0, `EXPOSURE: a round's world has ${world.actors.length} actors to dress`);
  check(out.world.actors.every((a) => a.bodyMods === GAME_BODY) && world.actors.every((a) => a.bodyMods === undefined), "every actor drawn carries the game's modifiers, and the sim's own world is untouched");
  const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8");
  check(/actorsOf\(withGameBody\(rp \? \{ \.\.\.sc, world \} : sc\), carry, body\)/.test(src), "the screen draws through withGameBody (slice 6: of the replayed world while the intro plays, of the sim's own otherwise) (source text: a React screen no check can run to a frame)");
}

console.log("\n11. THE STAGING (slice 3): the arrival recorded, the screech, the ringed traffic, the cameras");
{
  const rsOf = (x) => frozenOf.get(tag(x));
  const frozen = POOLED.map((x) => ({ x, rs: rsOf(x) })).filter((e) => e.rs);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lenTrail = (tr) => tr.slice(1).reduce((s, p, i) => s + dist(p, tr[i]), 0);
  check(frozen.length >= 40, `EXPOSURE: ${frozen.length} frozen rounds read, at least 40`);

  /* 1. THE TRAIL. */
  const lastOff = [], short = [], back = [], sShort = [], spans = [];
  for (const { x, rs } of frozen) {
    const tr = rs.decision.trail, p = driverPose(rs.me, rs.world.course);
    if (!tr?.length) { lastOff.push(tag(x)); continue; }
    const e = tr[tr.length - 1];
    if (!(dist(e, p) <= 0.01 && Math.abs(e.z - (p.z ?? 0)) <= 0.01 && Math.abs(e.heading - p.heading) <= 0.5)) lastOff.push(tag(x));
    spans.push(e.t - tr[0].t);
    for (let i = 1; i < tr.length; i++) {
      /* distance along, stated twice: the car's own `s`, and the displacement along the heading it was pointing */
      const h = (tr[i - 1].heading * Math.PI) / 180, along = (tr[i].x - tr[i - 1].x) * Math.cos(h) + (tr[i].y - tr[i - 1].y) * Math.sin(h);
      if (tr[i].s < tr[i - 1].s - 1e-9 || along < -1e-6) { back.push(`${tag(x)}[${i}]`); break; }
    }
  }
  const lens = frozen.filter((e) => e.rs.decision.trail?.length).map((e) => lenTrail(e.rs.decision.trail));
  for (const e of frozen) if (e.rs.decision.trail?.length && lenTrail(e.rs.decision.trail) < 10) short.push(tag(e.x));
  check(lens.length === frozen.length, `every frozen round carries a trail (${lens.length} of ${frozen.length})`);
  check(lastOff.length === 0, `the trail's last entry is the frozen pose, to 1 cm, in every one${lastOff.length ? ` -- not ${lastOff.slice(0, 6).join(" ")}` : ""}`);
  check(lens.length > 0 && short.length === 0, `EXPOSURE: every trail covers at least 10 m of road (shortest ${Math.min(...lens).toFixed(2)} m)${short.length ? ` -- not ${short.slice(0, 6).join(" ")}` : ""}`);
  check(back.length === 0, `its distance along is non-decreasing, by the car's s and by the displacement along its heading, in every one${back.length ? ` -- not ${back.slice(0, 6).join(" ")}` : ""}`);
  check(spans.every((s) => s >= 3.0 - 1e-6), `each trail spans at least 3.0 s of ticks (shortest ${Math.min(...spans).toFixed(2)} s)`);
  console.log(`        trail lengths over ${lens.length} pooled seeds: ${stat(lens)} m; spans ${stat(spans)} s [M, this run]`);

  /* 2. screechAt. */
  const bad0 = [], bad1 = [], notMono = [], notAbrupt = [], notFast = [], notDive = [];
  for (const { x, rs } of frozen) {
    const tr = rs.decision.trail, a = screechAt(tr, 0), b = screechAt(tr, 1), D = dist(tr[0], tr[tr.length - 1]);
    if (!(dist(a, tr[0]) <= 0.01)) bad0.push(tag(x));
    if (!(dist(b, tr[tr.length - 1]) <= 0.01)) bad1.push(tag(x));
    const covered = []; for (let i = 0; i <= 100; i++) covered.push(dist(screechAt(tr, i / 100), tr[0]));
    if (covered.some((c, i) => i && c < covered[i - 1] - 1e-9)) notMono.push(tag(x));
    if (!((covered[100] - covered[90]) / D < 0.1 - 1e-6)) notAbrupt.push(tag(x));
    if (!(covered[10] / D > 0.1 + 1e-6)) notFast.push(tag(x));
    if (!(screechAt(tr, 1).pitch <= (-8 * Math.PI) / 180 && screechAt(tr, 0.5).pitch <= (-8 * Math.PI) / 180 && screechAt(tr, 0).pitch >= -1e-9)) notDive.push(tag(x));
  }
  check(bad0.length === 0 && bad1.length === 0, `screechAt(0) is the trail's first pose and screechAt(1) the frozen pose, each to 1 cm, in every one${bad0.length + bad1.length ? ` -- not ${[...bad0, ...bad1].slice(0, 6).join(" ")}` : ""}`);
  check(notMono.length === 0, `the distance covered is non-decreasing in u (101 samples) in every one${notMono.length ? ` -- not ${notMono.slice(0, 6).join(" ")}` : ""}`);
  check(notAbrupt.length === 0, `the last tenth of u covers less than a tenth of the distance (the stop is abrupt) in every one${notAbrupt.length ? ` -- not ${notAbrupt.slice(0, 6).join(" ")}` : ""}`);
  check(notFast.length === 0, `the first tenth of u covers more than a tenth (the arrival is fast) in every one${notFast.length ? ` -- not ${notFast.slice(0, 6).join(" ")}` : ""}`);
  check(notDive.length === 0, `the nose is down at least 8 degrees at u = 0.5 and at the stop, and level at u = 0, in every one${notDive.length ? ` -- not ${notDive.slice(0, 6).join(" ")}` : ""}`);
  {
    const taus = Array.from({ length: 41 }, (_, i) => (i * SETTLE) / 40), ps = taus.map(settleAt);
    const signs = ps.map((p) => Math.sign(p)).filter((s) => s !== 0);
    let changes = 0; for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) changes++;
    check(ps[0] <= (-8 * Math.PI) / 180 && ps.some((p) => p > 0) && changes === 1 && settleAt(SETTLE) === 0 && settleAt(SETTLE + 1) === 0, `the settle starts nose-down, overshoots nose-up once (${(Math.max(...ps) * 180 / Math.PI).toFixed(2)} degrees at most) and is level at ${SETTLE} s and after [M, this run]`);
  }
  console.log(`        the durations [invented]: screech ${SCREECH} s, settle ${SETTLE} s, intro ${INTRO_END.toFixed(2)} s (no far shot)`);
  check(SCREECH === 0.8 && SETTLE === 0.25 && Math.abs(INTRO_END - 1.05) < 1e-9 && introAt(frozen[0].rs.decision.trail, SCREECH - 0.01).phase === "screech" && introAt(frozen[0].rs.decision.trail, SCREECH + 0.01).phase === "settle" && introAt(frozen[0].rs.decision.trail, INTRO_END).phase === "done", "the intro is a screech of 0.8 s (slice 6, from 0.6) then a settle of 0.25 s, with no far phase (stated here, the spec's)");

  /* THE SKID MARKS. */
  {
    const off = [], notLateral = [], farEnough = [];
    let marked = 0;
    for (const { x, rs } of frozen) {
      const [l, r] = skidLines(rs.decision.trail, 1), e = rs.decision.trail[rs.decision.trail.length - 1];
      if (l.length < 2 || r.length !== l.length) { off.push(tag(x)); continue; }
      marked++;
      if (l.some((q, i) => Math.abs(dist(q, r[i]) - 1.6) > 0.01)) notLateral.push(tag(x));
      const ds = l.concat(r).map((q) => dist(q, e));
      if (Math.max(...ds) > 12 + 1 || Math.min(...ds) < 2.25) farEnough.push(tag(x));
    }
    check(marked === frozen.length && off.length === 0, `EXPOSURE: two skid lines in every one (${marked} of ${frozen.length})`);
    check(notLateral.length === 0 && farEnough.length === 0, `the lines are 1.6 m apart (0.8 m either side of the centre line), lie within the last 12 m, and stop clear of the car's own body (2.25 m from its centre)${notLateral.length + farEnough.length ? ` -- not ${[...notLateral, ...farEnough].slice(0, 6).join(" ")}` : ""}`);
    check(skidLines(frozen[0].rs.decision.trail, 0).every((l) => l.length === 0) && skidLines(frozen[0].rs.decision.trail, 1)[0].length > skidLines(frozen[0].rs.decision.trail, 0.5)[0].length, "the marks grow as the car covers the road: none at u = 0, more at u = 1 than at 0.5");
  }

  /* 3. RELEVANCE (slice 5: the time filter). */
  {
    const waitFrozen = frozen.filter((e) => e.x.pool === "wait"), atFreeze = { ticks: 0, holds: 0, farHolds: 0, missed: [], pastCars: 0, ringedPast: [], ringedNoConflict: [], withRing: 0, mismatch: [], dropped: 0, kept: 0 };
    let firstRinged = 0;
    for (const { rs } of waitFrozen) { const before = atFreeze.withRing; observeRing(rs, atFreeze); if (atFreeze.withRing > before) firstRinged++; }
    const all = { missed: [...atFreeze.missed, ...relScan.missed], ringedPast: [...atFreeze.ringedPast, ...relScan.ringedPast], ringedNoConflict: [...atFreeze.ringedNoConflict, ...relScan.ringedNoConflict], mismatch: [...atFreeze.mismatch, ...relScan.mismatch] };
    check(atFreeze.holds + relScan.holds >= 20, `EXPOSURE: the sim says a car holds the sound driver in ${atFreeze.holds} observations at the freeze and ${relScan.holds} on ${relScan.ticks} waiting ticks (at least 20)`);
    check(all.missed.length === 0, `every car blockedBy says holds the sound driver is ringed, however far out, at the freeze and on every waiting tick${all.missed.length ? ` -- not ${all.missed.slice(0, 6).join(" ")}` : ""}`);
    console.log(`        holding cars further out than 4 s and so not ringed: ${atFreeze.farHolds + relScan.farHolds} of ${atFreeze.holds + relScan.holds} holding observations (the sound driver's gap is conservative) [M, this run]`);
    check(all.mismatch.length === 0, `the ringed set is exactly the check's own relevant set (conflicting, not past, and at its line, in the box, arriving within 4 s, or holding the sound driver) at the freeze and on every waiting tick${all.mismatch.length ? ` -- not ${all.mismatch.slice(0, 6).join(" ")}` : ""}`);
    check(all.ringedNoConflict.length === 0, `no ringed car's path fails to conflict with the player's (conflictOf, the check's own call)${all.ringedNoConflict.length ? ` -- not ${all.ringedNoConflict.slice(0, 6).join(" ")}` : ""}`);
    check(atFreeze.pastCars + relScan.pastCars > 0, `EXPOSURE: ${atFreeze.pastCars + relScan.pastCars} car-observations of a car conflicting but already past its conflict (the case the not-yet-past test is for)`);
    check(all.ringedPast.length === 0, `no car already past its conflict is ringed${all.ringedPast.length ? ` -- ringed past: ${all.ringedPast.slice(0, 6).join(" ")}` : ""}`);
    const share = firstRinged / waitFrozen.length;
    check(waitFrozen.length >= 20 && share >= 0.8, `EXPOSURE: at least one car is ringed at the freeze in ${(100 * share).toFixed(0)}% of ${waitFrozen.length} wait seeds (at least 80% [invented])`);
    if (share < 0.8) console.log(`        FINDING: ${waitFrozen.length - firstRinged} of ${waitFrozen.length} wait seeds show NO ringed car at the freeze: the car the sound driver waits for is more than 4 s out (${atFreeze.farHolds + relScan.farHolds} of ${atFreeze.holds + relScan.holds} holding observations were dropped by the time filter). The 80% line above is slice 3's [invented] floor, left as it was and left RED: the spec's time filter makes it false`);
    console.log(`        ringed at the freeze: ${firstRinged} of ${waitFrozen.length} wait seeds (${(100 * share).toFixed(0)}%); ${relScan.withRing} of ${relScan.ticks} waiting ticks had a ring [M, this run]`);
  }

  /* 4. THE SOURCE: the intro and its rings, as text (a React screen no check can run to a frame). The camera itself is section 12's. */
  {
    const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8");
    check(/frameCamera\(decisionFrame\(rs\), p, size\)/.test(src) && !/farCamera|introCamera|decisionCamera/.test(src) && /relevantIds\(world, drawMe\)/.test(src) && /skidLines\(trail/.test(src) && /intro >= INTRO_END/.test(src) && /intro < INTRO_END\) \{ if \(ev\.type === "down"/.test(src), "the screen holds the decision frame from the first frame (no far shot, no introCamera), draws the rings and the skid marks, shows the button only after the intro, and a tap during it only skips (source text)");
  }
}

console.log("\n12. THE DECISION FRAME AND THE LAUNCH (slice 5): only what decides the decision, the trail, the launch, toDecisionFrom");
{
  const frozen = POOLED.map((x) => ({ x, rs: frozenOf.get(tag(x)) })).filter((e) => e.rs);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const sizes = [{ w: 400, h: 800 }, { w: 800, h: 400 }];
  const onScreen = (v, size, [x, y, z]) => { const [px, py] = v.P(x, y, z); return px >= 0 && px <= size.w && py >= 0 && py <= size.h; };

  /* 1. THE FRAME. The cars that matter are read here by the check's own statement (conflictingNow: atNode, conflictOf, the time filter),
     not through stage.js relevantIds; the points are the player's stop pose and those cars as the world poses them. */
  const missed = [], notEqual = [], boxMissed = [], widths = [], edgeBad = [];
  let relSeen = 0, seedsDropping = 0, droppedCars = 0, farHolders = 0, farOff = 0, arrivers = 0, arriveOff = 0, seedsArriveOff = 0, seedsFarOff = 0, seedsEitherOff = 0;
  for (const { x, rs } of frozen) {
    const k = rs.me.k ?? 0, L = rs.world.course.at[k].layout, p = driverPose(rs.me, rs.world.course);
    const pts = [[p.x, p.y, p.z ?? 0, "stop pose"]];
    const own = conflictingNow(rs);
    /* SLICE 6: the frame holds only the stop pose and the cars `line` and `box`; an `arriving` or `holds` car moving (it has seconds to show)
       is read separately, as one the frame does NOT hold and the screen badges at its edge when it is off it. */
    const far = [];
    for (const c of own) if (c.why === "line" || c.why === "box") { const q = poseOf(rs.world, c.a); pts.push([q.x, q.y, q.z ?? 0, `car ${c.a.id}`]); relSeen++; }
      else if ((c.why === "arriving" || c.why === "holds") && c.a.v > AT_REST) { const q = poseOf(rs.world, c.a); far.push([q.x, q.y, q.z ?? 0, `car ${c.a.id}`, c.why]); if (c.why === "holds") farHolders++; else arrivers++; }
    const dropped = own.filter((c) => !c.why && c.secs > ARRIVE && c.secs !== Infinity);   // conflicting, not past, MORE THAN 4 s out and moving
    if (dropped.length) { seedsDropping++; droppedCars += dropped.length; }
    if (new Set(relevantIds(rs.world, rs.me)).size !== own.filter((c) => c.why).length) notEqual.push(tag(x));
    const f = decisionFrame(rs);
    widths.push(Math.max(f.w, f.h));
    const half = 8;   // the box's own corners, from the layout: a frame must hold the whole intersection (the check reads place.at and a 6 m half-size at least)
    let seedArriveOff = false, seedFarOff = false;
    for (const size of sizes) {
      const fc = frameCamera(f, p, size), v = viewOf(fc.k, { ...fc.cam, id: null }, fc.rot, size);
      for (const q of pts) if (!onScreen(v, size, q)) missed.push(`${tag(x)}/${size.w}x${size.h}:${q[3]}`);
      /* A FAR HOLDER is badged at the screen's edge when off it: the badge's point is inside the screen by at least 20 px [stated here], and a car on screen keeps its own point. */
      for (const q of far) {
        const [qx, qy] = v.P(q[0], q[1], q[2]), e = edgePoint(qx, qy, size), inside = qx >= 0 && qx <= size.w && qy >= 0 && qy <= size.h;
        if (e.off) { if (q[4] === "holds") { farOff++; seedFarOff = true; } else { arriveOff++; seedArriveOff = true; } }
        if (!(e.x >= 20 && e.x <= size.w - 20 && e.y >= 20 && e.y <= size.h - 20) && e.off) edgeBad.push(`${tag(x)}/${size.w}x${size.h}:${q[3]}`);
        if (inside && qx >= 28 && qx <= size.w - 28 && qy >= 28 && qy <= size.h - 28 && (e.off || e.x !== qx || e.y !== qy)) edgeBad.push(`${tag(x)}/${size.w}x${size.h}:${q[3]} moved`);
      }
      const at = L.place.at;
      for (const [dx, dy] of [[-half, -half], [half, -half], [half, half], [-half, half]]) if (!onScreen(v, size, [at.x + dx, at.y + dy, 0])) boxMissed.push(`${tag(x)}/${size.w}x${size.h}`);
    }
    if (seedArriveOff) seedsArriveOff++;
    if (seedFarOff) seedsFarOff++;
    if (seedArriveOff || seedFarOff) seedsEitherOff++;
  }
  check(frozen.length >= 40 && relSeen >= 20, `EXPOSURE: ${frozen.length} frozen rounds and ${relSeen} relevant cars read (at least 40 and 20)`);
  check(missed.length === 0, `the player's stop pose and every relevant car AT ITS LINE OR IN THE BOX project inside the screen, 400x800 and 800x400, in every pooled seed${missed.length ? ` -- not ${missed.slice(0, 5).join(" ")}` : ""}`);
  check(farHolders >= 10 && farOff >= 10, `EXPOSURE: ${farHolders} cars the sound driver waits for further out than 4 s (relevant, kept out of the frame), ${farOff} badge placements off the screen (at least 10 each) [M, this run]`);
  const arriveShare = seedsArriveOff / frozen.length;
  check(arriveShare >= 0.2, `EXPOSURE: in ${(100 * arriveShare).toFixed(1)}% of ${frozen.length} seeds an ARRIVING car (moving, within 4 s of its conflict, not in the frame) is off the screen and gets its edge badge (at least 20%); ${seedsFarOff} seeds have a holding car off it too [M, this run]`);
  console.log(`        arriving cars: ${arrivers} observations kept out of the frame, ${arriveOff} badge placements off the screen, in ${seedsArriveOff} of ${frozen.length} seeds (${(100 * arriveShare).toFixed(1)}%); an arriving OR a holding car is badged at the edge in ${seedsEitherOff} seeds (${(100 * seedsEitherOff / frozen.length).toFixed(1)}%) [M, this run]`);
  if (arriveShare < 0.2) console.log(`        FINDING: the spec's 20% of seeds with an ARRIVING car off the screen is false on these pools: ${seedsArriveOff} of ${frozen.length} (${(100 * arriveShare).toFixed(1)}%). The frame (median ${widths.slice().sort((a, b) => a - b)[widths.length >> 1].toFixed(1)} m) holds most cars arriving within 4 s, which is the frame doing its job. The line is left as written and RED; counting a holding car as well it would be ${(100 * seedsEitherOff / frozen.length).toFixed(1)}%`);
  check(edgeBad.length === 0, `each such car (arriving or holding) off the screen is badged at least 20 px inside its edge, and one well inside keeps its own point${edgeBad.length ? ` -- not ${edgeBad.slice(0, 5).join(" ")}` : ""}`);
  check(boxMissed.length === 0, `the intersection's own box (8 m either side of its centre [instrument]) projects inside the screen in every one${boxMissed.length ? ` -- not ${boxMissed.slice(0, 5).join(" ")}` : ""}`);
  check(notEqual.length === 0, `stage.js relevantIds is the check's own relevant set in every one (the time filter applied: at its line, in the box, within 4 s, or holding the sound driver)${notEqual.length ? ` -- not ${notEqual.slice(0, 5).join(" ")}` : ""}`);
  const ws = widths.slice().sort((a, b) => a - b), within = widths.filter((w) => w <= 50).length / widths.length;
  check(within >= 0.95, `the frame's longer side is at most 50 m [invented, slice 6; slice 5's was 120] in ${(100 * within).toFixed(1)}% of ${widths.length} seeds (at least 95%)`);
  console.log(`        frame size (the longer side): median ${ws[ws.length >> 1].toFixed(1)} m, widest ${ws[ws.length - 1].toFixed(1)} m, over ${widths.length} seeds [M, this run]`);
  const dshare = seedsDropping / frozen.length;
  check(dshare >= 0.2, `EXPOSURE: the time filter bites -- in ${(100 * dshare).toFixed(1)}% of ${frozen.length} seeds a conflicting, not-yet-past car is NOT relevant because it is more than 4 s out (at least 20%)`);
  console.log(`        time filter: ${seedsDropping} of ${frozen.length} seeds (${(100 * dshare).toFixed(1)}%) drop a conflicting car, ${droppedCars} cars in all [M, this run]`);

  /* 2. THE TRAIL, at least 20 m, stated here and not as stage.js's TRAIL_MIN_M. */
  const trLens = frozen.map(({ rs }) => rs.decision.trail.slice(1).reduce((s, q, i) => s + dist(q, rs.decision.trail[i]), 0));
  check(trLens.length >= 40 && trLens.every((l) => l >= 20), `every trail is at least 20 m of road over ${trLens.length} seeds (${stat(trLens)} m [M, this run])`);

  /* 3. THE LAUNCH: in every wait seed under the oracle, the car's speed one second after GO. The old autopilot capped the wanted
     acceleration at 1.2 m/s^2 and its median here was 1.20 m/s [M, tools/scratch/launch.mjs on the 108 wait seeds of the pools of
     run 2026-11-25, before this change]. */
  const speeds = [], waitRuns = [];
  for (const x of POOLED.filter((e) => e.pool === "wait")) {
    let goAt = null, v1 = null;
    const r = driveDecision(x.type, x.seed, x.type.cars, oracle, { onTick: (b, a) => { if (b.phase === "gone" && goAt == null) goAt = b.decision.goAt; if (goAt != null && v1 == null && a.world.t - goAt >= 1.0 - 1e-6) v1 = a.me.v; } });
    waitRuns.push(r); if (v1 != null) speeds.push(v1);
    goToEnd.push(r.rs.world.t - r.rs.decision.goAt);
  }
  check(speeds.length >= 20 && speeds.length === waitRuns.length, `EXPOSURE: the car was still driving 1.0 s after GO in ${speeds.length} of ${waitRuns.length} wait seeds (at least 20, all of them)`);
  check(speeds.every((v) => v >= 2.2), `in every wait seed the car's speed 1.0 s after GO is at least 2.2 m/s (${stat(speeds)} m/s [M, this run]; 2.2 is 0.8 of ACCEL_MAX for 1 s, allowing for the slider's response [invented])`);
  console.log(`        speed 1.0 s after GO: median ${speeds.slice().sort((a, b) => a - b)[speeds.length >> 1].toFixed(2)} m/s [M, this run]; the old autopilot's, on the same kind of seeds: 1.20 m/s [M, before the change]`);

  /* 4. toDecisionFrom FROM A RUNNING STATE. The only exercise the multi-decision path gets until there is content for it: a state
     3 s past GO has its car past the line, so there is no decision at that node and it must return null. A positive control shows the
     function is not simply always null: from a state before the decision it gives the same decision toDecision does. */
  const x0 = POOLED.find((e) => e.pool === "wait"), type0 = x0.type;
  let past = null;
  { let rs = toDecision(type0, x0.seed, type0.cars), t = null; const { policy } = oracle();
    while (rs && !rs.end && (t == null || rs.world.t - t < 3.0 - 1e-6)) {
      if (rs.phase !== "gone") { if (policy(rs) === "go") rs = release(rs); else if (rs.phase === "frozen") rs = press(rs); }
      rs = roundTick(rs); if (rs.phase === "gone" && t == null) t = rs.decision.goAt;
    }
    past = rs; }
  const p0 = past.world.course.at[past.targetK].layout.paths[past.me.route];
  check(past.phase === "gone" && !past.end && past.me.k === past.targetK && past.me.s > p0.stopAt, `EXPOSURE: the state is running, 3 s past GO, not ended, and the car is past its stop line (s ${past.me.s.toFixed(1)} > ${p0.stopAt.toFixed(1)} [M, this run])`);
  check(toDecisionFrom(past, past.targetK) === null, "toDecisionFrom toward the same node from that state returns null (the car is past that line)");
  const fresh = startRound({ ...type0, seed: x0.seed, cars: type0.cars }, roundWorld({ ...type0, seed: x0.seed, cars: type0.cars }));
  let mid = fresh; for (let i = 0; i < 40; i++) mid = roundTick(mid);
  const ref = frozenOf.get(tag(x0)), a1 = toDecisionFrom(fresh, fresh.me.k), a2 = toDecisionFrom(mid, mid.me.k);
  check(a1 != null && a2 != null && a1.phase === "frozen" && a2.phase === "frozen" && a1.decision.decideAt === ref.decision.decideAt && a2.decision.decideAt === ref.decision.decideAt, `POSITIVE CONTROL: from the start, and from 2 s into the approach, toDecisionFrom freezes at the same moment toDecision does (${a1?.decision.decideAt?.toFixed(2)}, ${a2?.decision.decideAt?.toFixed(2)}, ${ref.decision.decideAt.toFixed(2)} s)`);
  check(a1 != null && isDeepStrictEqual(Object.keys(a1.decision).sort(), ["crossedAt", "decideAt", "goAt", "launch", "made", "openings", "replay", "timing", "trail"]), "the per-decision state is ONE object, rs.decision, holding the openings, decideAt, goAt, the trail, the replay (slice 6), launch, made, crossedAt and the timing");
  check(a1 != null && ["decideAt", "goAt", "openings", "timing", "trail", "replay", "launch", "made", "crossedAt"].every((f) => !(f in a1)), "and none of those fields is left on the round itself");
}

console.log("\n13. THE STOPPING ORDER (slice 5): numbered from stoppedAt, held to the sim's own blockedBy");
{
  const freezes = POOLED.map((x) => ({ x, rs: frozenOf.get(tag(x)) })).filter((e) => e.rs);
  const allWay = freezes.filter((e) => e.x.type.id.startsWith("four-way"));
  for (const { x, rs } of allWay) orderScan(rs, orderAcc, tag(x), true);
  const A = orderAcc;
  check(A.freezes >= 20 && A.numbered >= A.freezes, `EXPOSURE: ${A.freezes} all-way freezes and ${A.ticks} waiting ticks read, ${A.numbered} car-observations numbered`);
  check(A.youMissing.length === 0, `the player's car is numbered at every freeze${A.youMissing.length ? ` -- not ${A.youMissing.slice(0, 5).join(" ")}` : ""}`);
  check(A.notSorted.length === 0, `a lower number always stopped earlier, by more than 0.4 s, by the cars' own stoppedAt${A.notSorted.length ? ` -- not ${A.notSorted.slice(0, 5).join(" ")}` : ""}`);
  check(A.pairs >= 20, `EXPOSURE: ${A.pairs} pairs of numbered cars with different numbers whose paths conflict (${A.pairsFreeze} at the freeze, the rest on the waiting ticks of the oracle's wait runs) (at least 20); ${A.same} pair-observations share a number and are exempt, ${A.flat} do not conflict and have nothing to yield [M, this run]`);
  check(A.wrong.length === 0, `blockedBy (the sim's own call) says the car numbered j must yield to the one numbered i, in all ${A.pairs} pairs${A.wrong.length ? ` -- not ${A.wrong.slice(0, 5).join(" ")}` : ""}`);
  check(A.reverse.length === 0, `...and never the other way round, in any of them${A.reverse.length ? ` -- not ${A.reverse.slice(0, 5).join(" ")}` : ""}`);
  console.log(`        order pairs [M, this run]: ${A.pairs} over ${A.freezes} all-way freezes and ${A.ticks} waiting ticks (only ${A.pairsFreeze} at the freeze itself: the player has usually just stopped and the others are not yet at their lines)`);
  const twoWay = freezes.filter((e) => e.x.type.id.startsWith("two-way")), secsWrong = [];
  /* THE SECONDS, at a road with no stop: whole seconds of the car's own distance over its speed, for the arriving cars that are not numbered. */
  let secsN = 0;
  const scan = [...twoWay.map((e) => e.rs), ...twoWay.filter((e) => e.x.pool === "wait").slice(0, 20).map((e) => { let w = press(e.rs); for (let i = 0; i < 20 && !w.end; i++) w = roundTick(w); return w; })];
  for (const rs of scan) {
    const mine = arrivalSeconds(rs.world, rs.me), ownArr = conflictingNow(rs).filter((c) => c.why === "arriving" || (c.why === "holds" && c.a.v > AT_REST)), numberedIds = new Set(stopOrder(rs.world, rs.me).map((r) => r.id));
    const want = ownArr.filter((c) => !numberedIds.has(c.a.id));
    secsN += mine.length;
    if (mine.length !== want.length || want.some((c) => !mine.some((m) => m.id === c.a.id && m.secs === Math.round(c.secs)))) secsWrong.push(`${rs.def.id}@${rs.world.t.toFixed(2)}`);
  }
  check(secsN >= 20, `EXPOSURE: ${secsN} arriving cars labelled with their seconds over ${scan.length} two-way observations (at least 20) [M, this run]`);
  check(secsWrong.length === 0, `each is labelled with its own distance to the conflict over its speed, in whole seconds, and no other car is${secsWrong.length ? ` -- not ${secsWrong.slice(0, 5).join(" ")}` : ""}`);
}

console.log("\n14. FORCED BRAKING AND THREADING THE NEEDLE (slice 5): the traffic's own tick-to-tick braking, past HARSH_AT");
{
  /* THE CHECK'S OWN READING, tick by tick on every eager run: from GO until the player is clear of the box, any other road user at the node
     whose path conflicts with the player's, not yet past the conflict and not yet stopped at its line, whose speed fell by more than HARSH_AT
     over one tick (the speed before the tick minus the speed after it, over DT). */
  const rows = [];
  for (const x of POOLED) {
    let hard = false;
    const r = driveDecision(x.type, x.seed, x.type.cars, eager, { onTick: (before, after) => {
      if (before.phase !== "gone" || before.me.k !== before.targetK) return;
      const L = before.world.course.at[before.targetK].layout, q = L.paths[after.me.route];
      if (!(after.me.s < q.clearAt)) return;
      const next = new Map(after.world.actors.map((a) => [a.id, a]));
      for (const a of atNode(before.world, before.world.actors, before.targetK)) {
        if (a.id === before.me.id || a.shadow || a.player || a.route == null || a.stoppedAt != null) continue;
        const hit = conflictOf(L, before.me.route, a.route);
        if (!hit || a.s > hit.clearOf + CAR.length / 2 + (lenOf(a) - CAR.length)) continue;
        const b = next.get(a.id);
        if (b && (a.v - b.v) / DT > HARSH_AT) hard = true;
      }
    } });
    rows.push({ x, r, hard });
  }
  const has = (e, id) => ids(e.r.verdict).includes(id), wait = rows.filter((e) => e.x.pool === "wait");
  const hardRuns = rows.filter((e) => e.hard), calm = rows.filter((e) => !e.hard);
  check(wait.length >= 20 && rows.length >= 40, `EXPOSURE: ${rows.length} eager runs, ${wait.length} in the wait pools`);
  check(hardRuns.length >= 3, `EXPOSURE: ${hardRuns.length} eager runs (${hardRuns.filter((e) => e.x.pool === "wait").length} in the wait pools) where an entitled car's tick-to-tick deceleration passed HARSH_AT (${HARSH_AT.toFixed(1)} m/s^2) after GO, read by the check itself (at least 3) [M, this run]`);
  check(hardRuns.every((e) => has(e, "forcedBrake")), `forcedBrake in every one of those ${hardRuns.length} runs${hardRuns.filter((e) => !has(e, "forcedBrake")).length ? ` -- not ${hardRuns.filter((e) => !has(e, "forcedBrake")).slice(0, 5).map((e) => tag(e.x)).join(" ")}` : ""}`);
  check(calm.length >= 20 && calm.every((e) => !has(e, "forcedBrake")), `...and in none of the ${calm.length} where it did not happen${calm.filter((e) => has(e, "forcedBrake")).length ? ` -- in ${calm.filter((e) => has(e, "forcedBrake")).slice(0, 5).map((e) => tag(e.x)).join(" ")}` : ""}`);
  check(hardRuns.every((e) => { const f = e.r.verdict.faults.find((q) => q.id === "forcedBrake"); return f && f.severity === 3 && f.words === "You made another driver brake hard."; }), "forcedBrake is severity 3 with the spec's words in every one");
  check(oracleForced.length === 0, `the oracle has forcedBrake in none of the ${POOLED.length} pooled seeds${oracleForced.length ? ` -- FINDING, in ${oracleForced.slice(0, 8).join(" ")}` : ""}`);

  /* THREADED: an early GO, through, with neither forcedBrake, failedToYield nor contact. */
  const bad = (e) => ["forcedBrake", "failedToYield", "collision", "struckPerson"].some((id) => has(e, id)) || e.r.rs.end?.why === "contact";
  const early = wait.filter((e) => e.r.T.freezeOpen === false), threaded = early.filter((e) => !bad(e) && e.r.rs.end?.why === "through"), notThreaded = early.filter(bad);
  check(threaded.length >= 3, `EXPOSURE: ${threaded.length} eager wait runs were early and drew neither forcedBrake, failedToYield nor contact (at least 3) [M, this run]`);
  const wrongT = threaded.filter((e) => !e.r.verdict.praise.some((p) => p.id === "threaded" && p.words === "Threaded the needle.") || e.r.verdict.timingStars !== 3 || e.r.verdict.stars !== 3);
  check(wrongT.length === 0, `each of them gets the praise threaded, 3 timing stars and 3 stars${wrongT.length ? ` -- not ${wrongT.slice(0, 5).map((e) => `${tag(e.x)}(${e.r.verdict.stars}*,[${ids(e.r.verdict)}])`).join(" ")}` : ""}`);
  check(notThreaded.length >= 3 && notThreaded.every((e) => !e.r.verdict.praise.some((p) => p.id === "threaded") && e.r.verdict.stars <= 1), `EXPOSURE: ${notThreaded.length} early runs did draw one (at least 3), and none of them is threaded or has more than 1 star`);
  check(!rows.filter((e) => e.x.pool === "now").some((e) => e.r.verdict.praise.some((p) => p.id === "threaded")), "a GO into an open road (the now pool) is never threaded");
  const dist = [0, 1, 2, 3].map((n) => wait.filter((e) => e.r.verdict.stars === n).length);
  console.log(`        eager outcomes in the ${wait.length} wait runs [M, this run]: 0 stars ${dist[0]}, 1 star ${dist[1]}, 2 stars ${dist[2]}, 3 stars ${dist[3]}; forcedBrake in ${wait.filter((e) => has(e, "forcedBrake")).length}, failedToYield in ${wait.filter((e) => has(e, "failedToYield")).length}, threaded ${threaded.length}`);
}

console.log("\n15. THE PLAYBACK AND THE GESTURES (slice 5), as source text and the pace budget");
{
  check(FAST === 2 && speedOf("gone") === FAST && speedOf("waiting") === 1 && speedOf("frozen") === 1, `after GO the sim runs ${FAST} ticks per tick of real time, and only after GO (stated here: 2 [invented])`);
  const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8");
  check(/owed \+= dt \* speedOf\(rs\.phase\)/.test(src) && /pageMore\(owed, steps/.test(src) && /owed = pageLeft\(owed\)/.test(src), "Game.jsx adds FAST ticks' worth of time a tick after GO and still steps through pageMore / pageLeft (source text)");
  const down = /const onDown = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "", move = /const onMove = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "", up = /const onUp = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "";
  check(down.length > 0 && move.length > 0 && up.length > 0, "EXPOSURE: onDown, onMove and onUp were found in the source");
  const dragBranch = /if \(canPan\(\)[\s\S]*?return;\s*\}/.exec(down)?.[0] ?? "";
  check(/!inRect\(buttonRect\(/.test(dragBranch) && dragBranch.length > 0, "a finger that lands OUTSIDE the button's rectangle takes the drag branch (source text)");
  check(/panFree\(/.test(move) && /pinchFree\(/.test(move), "a drag outside the button routes to panFree and pinchFree (source text)");
  { const gsrc = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8"); check(/edgePoint\(qx, qy/.test(gsrc) && /if \(e\.off\)/.test(gsrc), "a badge whose car is off the screen is pinned to the edge with a pointer (Game.jsx calls edgePoint and draws when off; source text)"); }
  check(!/decide\(|press\(|release\(/.test(dragBranch) && !/decide\(|press\(|release\(/.test(move), "the drag branch and the move handler never call decide, press or release (source text)");
  check(/if \(ptrs\.delete\(e\.pointerId\)\) \{[^}]*return;/.test(up), "a drag finger lifting never reaches decide (source text)");
  check(/userCam = null/.test(src) && /goCam/.test(src), "after GO the player's camera is dropped and the chase blends in from where it was (source text)");
  /* THE PAGE BUDGET at FAST: frames of 60, 30 and 20 fps, ticks per second of real time, and no frame over PAGE_STEPS ticks. */
  for (const fps of [60, 30, 20]) {
    let owed = 0, total = 0, most = 0;
    for (let f = 0; f < fps * 10; f++) { owed += (1 / fps) * FAST; let steps = 0; while (pageMore(owed, steps, 0)) { owed -= DT; steps++; total++; } owed = pageLeft(owed); most = Math.max(most, steps); }
    check(most <= PAGE_STEPS && Math.abs(total / 10 - FAST / DT) <= 1.5, `at ${fps} fps the page steps ${(total / 10).toFixed(1)} ticks per second (${(FAST / DT).toFixed(0)} wanted) and no frame more than ${PAGE_STEPS} (most ${most}) [M, this run]`);
  }
  /* GO TO THE RESULT CARD [D]: the oracle's sim seconds from GO to the end, over FAST, plus AFTER_END. */
  const after = Number(/const AFTER_END = (\d+)/.exec(src)?.[1]);
  const sorted = goToEnd.slice().sort((a, b) => a - b), med = sorted[sorted.length >> 1], worst = sorted[sorted.length - 1];
  check(goToEnd.length >= 20 && Number.isFinite(after), `EXPOSURE: ${goToEnd.length} oracle wait runs timed from GO to their end, AFTER_END read from the source (${after} ms)`);
  console.log(`        GO to the result card [D: the oracle's GO-to-end in sim seconds / ${FAST} + AFTER_END ${after} ms, assuming the page keeps up]: median ${(med / FAST + after / 1000).toFixed(2)} s (sim ${med.toFixed(2)} s), worst ${(worst / FAST + after / 1000).toFixed(2)} s (sim ${worst.toFixed(2)} s) over ${goToEnd.length} runs [M for the sim seconds, this run]`);
}

console.log("\n16. THE WORLD ARRIVES WITH YOU (slice 6): the replay, which world is drawn when, the streaks, as source text");
{
  const frozen = POOLED.map((x) => ({ x, rs: frozenOf.get(tag(x)) })).filter((e) => e.rs);
  const posOf = (w, a) => { const q = poseOf(w, a); return { x: q.x, y: q.y }; };
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  check(frozen.length >= 40, `EXPOSURE: ${frozen.length} frozen rounds read, at least 40`);
  console.log(`        REPLAY ${REPLAY} s [invented], played over the intro ${INTRO_END.toFixed(2)} s: ${REPLAY_RATE.toFixed(2)}x real time [D: REPLAY / INTRO_END]`);

  /* 1. THE RECORDING, read by the check's own statements. */
  const short = [], order = [], notLast = [], jump = [], spans = [], moved = [], nWorlds = [];
  let ticksRead = 0, maxStep = 0;
  for (const { x, rs } of frozen) {
    const rp = rs.decision.replay;
    if (!Array.isArray(rp) || !rp.length) { short.push(tag(x)); continue; }
    nWorlds.push(rp.length);
    const span = rp[rp.length - 1].t - rp[0].t;
    spans.push(span);
    if (!(span >= 1.9 - 1e-6)) short.push(`${tag(x)}(${span.toFixed(2)})`);
    for (let i = 1; i < rp.length; i++) if (!(Math.abs(rp[i].t - rp[i - 1].t - DT) < 1e-6 && rp[i].world.t === rp[i].t)) { order.push(`${tag(x)}[${i}]`); break; }
    /* the last world is the frozen world: the same actors, at the same places to 1 cm */
    const lw = rp[rp.length - 1].world;
    if (!(lw.t === rs.world.t && lw.actors.length === rs.world.actors.length && rs.world.actors.every((a) => { const b = lw.actors.find((c) => c.id === a.id); return b && dist(posOf(rs.world, a), posOf(lw, b)) <= 0.01; }))) notLast.push(tag(x));
    /* consecutive recorded ticks are CONSECUTIVE STATES of the sim: no car jumps between two (a car at 25 m/s moves 1.25 m a tick; 3 m is generous [instrument]) */
    for (let i = 1; i < rp.length; i++) {
      for (const a of rp[i].world.actors) {
        const b = rp[i - 1].world.actors.find((c) => c.id === a.id);
        if (!b) continue;
        const d = dist(posOf(rp[i].world, a), posOf(rp[i - 1].world, b)); ticksRead++; maxStep = Math.max(maxStep, d);
        if (d > 3) jump.push(`${tag(x)}[${i}]:${a.id}`);
      }
    }
    /* does the world MOVE in it: the largest displacement of any OTHER road user between the first world and the last */
    let most = 0;
    for (const a of rs.world.actors) {
      if (a.player || a.shadow) continue;
      const b = rp[0].world.actors.find((c) => c.id === a.id);
      if (b) most = Math.max(most, dist(posOf(rp[0].world, b), posOf(rs.world, a)));
    }
    moved.push(most);
  }
  check(short.length === 0 && spans.length === frozen.length, `every pooled seed's replay spans at least 1.9 s of ticks (${stat(spans)} s, ${stat(nWorlds)} worlds [M, this run])${short.length ? ` -- not ${short.slice(0, 5).join(" ")}` : ""}`);
  check(order.length === 0, `its ticks are in order, one DT apart, each world stamped with its own time${order.length ? ` -- not ${order.slice(0, 5).join(" ")}` : ""}`);
  check(notLast.length === 0, `its last world's actors are the frozen world's, every one within 1 cm${notLast.length ? ` -- not ${notLast.slice(0, 5).join(" ")}` : ""}`);
  check(ticksRead >= 1000 && jump.length === 0, `EXPOSURE: ${ticksRead} car-ticks read across consecutive recorded worlds (at least 1000), none moving more than 3 m in a tick (largest ${maxStep.toFixed(2)} m [M, this run])${jump.length ? ` -- not ${jump.slice(0, 5).join(" ")}` : ""}`);
  const share = moved.filter((m) => m >= 3).length / moved.length;
  check(moved.length === frozen.length && share >= 0.8, `EXPOSURE: some other road user moves at least 3 m [invented] over the replay in ${(100 * share).toFixed(1)}% of ${moved.length} seeds (at least 80%) [M, this run]`);
  console.log(`        the most any other road user moves over the replay: ${stat(moved)} m [M, this run]`);

  /* 2. replayAt: the world drawn at t, stated here. */
  {
    const bad0 = [], badEnd = [], notMono = [], notCovered = [], badCarry = [];
    for (const { x, rs } of frozen) {
      const rp = rs.decision.replay, last = rp.length - 1;
      if (replayAt(rp, 0).world !== rp[0].world) bad0.push(tag(x));
      for (const t of [INTRO_END, INTRO_END + 0.01, INTRO_END + 5]) { const r = replayAt(rp, t); if (r.world !== rs.world || r.carry !== 0) badEnd.push(`${tag(x)}@${t}`); }
      let prev = -1, seen = new Set();
      for (let i = 0; i <= 200; i++) {
        const t = (INTRO_END * i) / 200, r = replayAt(rp, t);
        if (r.i < prev) notMono.push(`${tag(x)}@${t.toFixed(3)}`);
        prev = r.i; seen.add(r.i);
        if (!(r.carry >= 0 && r.carry < DT + 1e-9 && r.world === rp[r.i].world)) badCarry.push(`${tag(x)}@${t.toFixed(3)}`);
      }
      if (!(seen.has(0) && seen.has(last))) notCovered.push(tag(x));
    }
    check(bad0.length === 0, `the replay drawn at t = 0 is the first recorded world, in every seed${bad0.length ? ` -- not ${bad0.slice(0, 5).join(" ")}` : ""}`);
    check(badEnd.length === 0, `at t = INTRO_END and after it the drawn world is the frozen world itself, with no carry, in every seed (nothing jumps when the button appears)${badEnd.length ? ` -- not ${badEnd.slice(0, 5).join(" ")}` : ""}`);
    check(notMono.length === 0 && badCarry.length === 0, `between them the world drawn only moves forward through the replay, and its carry is within one tick (201 samples a seed)${notMono.length + badCarry.length ? ` -- not ${[...notMono, ...badCarry].slice(0, 5).join(" ")}` : ""}`);
    check(notCovered.length === 0, `EXPOSURE: the intro passes through the first world and the last of every seed's replay (so the whole arrival is drawn)${notCovered.length ? ` -- not ${notCovered.slice(0, 5).join(" ")}` : ""}`);
  }

  /* 3. THE REPLAY IS DRAWABLE: every world of every replay can be read by the rings and the order as the screen reads it, with the player as THAT world has them. */
  {
    let worlds = 0, threw = [], ringedWorlds = 0, orderedWorlds = 0;
    for (const { x, rs } of frozen) for (const { world } of rs.decision.replay) {
      const meAt = world.actors.find((a) => a.player && !a.shadow);
      try { relevantIds(world, meAt); stopOrder(world, meAt); arrivalSeconds(world, meAt); worlds++; if (relevantIds(world, meAt).length) ringedWorlds++; if (stopOrder(world, meAt).length) orderedWorlds++; }
      catch (err) { threw.push(`${tag(x)}@${world.t.toFixed(2)}:${String(err.message).slice(0, 40)}`); }
    }
    check(worlds >= 1000 && threw.length === 0, `${worlds} replayed worlds are read by relevantIds, stopOrder and arrivalSeconds without throwing (at least 1000) [M, this run]${threw.length ? ` -- threw ${threw.slice(0, 4).join(" ")}` : ""}`);
    check(ringedWorlds > 0 && orderedWorlds > 0, `EXPOSURE: ${ringedWorlds} of those worlds have a ringed car and ${orderedWorlds} a numbered one (so the reading was of something)`);
  }

  /* 4. THE STREAK, stated here. */
  {
    const pose = { x: 10, y: -4, z: 0, heading: 30, length: 4.5 }, h = (30 * Math.PI) / 180, dir = [Math.cos(h), Math.sin(h)];
    check(streakOf(pose, 0).length === 0 && streakOf(pose, AT_REST).length === 0 && streakOf(pose, AT_REST * 0.5).length === 0, "streakOf returns nothing for a car at rest (v at or under AT_REST)");
    check(STREAK_S === 0.5, `STREAK_S is 0.5 s of travel (stated here, [invented])`);
    const lines = streakOf(pose, 10), len = lines.map((l) => Math.hypot(l.x1 - l.x0, l.y1 - l.y0));
    check(lines.length === 3 && len.every((l) => Math.abs(l - 0.5 * 10) < 1e-9), `a car at 10 m/s gets 3 lines, each STREAK_S x v = 5 m long (${len.map((l) => l.toFixed(3)).join(", ")} [M, this run])`);
    check(lines.every((l) => { const ux = (l.x1 - l.x0) / 5, uy = (l.y1 - l.y0) / 5, back = (l.x0 - pose.x) * dir[0] + (l.y0 - pose.y) * dir[1]; return Math.abs(ux + dir[0]) < 1e-9 && Math.abs(uy + dir[1]) < 1e-9 && Math.abs(back + 2.25) < 1e-9; }), "each runs straight BACK along the heading, starting at the rear bumper (half a car length behind the centre)");
    check(new Set(lines.map((l) => ((l.x0 - pose.x) * -dir[1] + (l.y0 - pose.y) * dir[0]).toFixed(6))).size === 3 && lines.every((l) => l.alpha > 0 && l.alpha <= 1), "the three lines sit at three different offsets across the car, each with an alpha in (0, 1]");
    const l20 = streakOf(pose, 20);
    check(Math.abs(Math.hypot(l20[0].x1 - l20[0].x0, l20[0].y1 - l20[0].y0) - 10) < 1e-9, "twice the speed, twice the length (proportional to speed)");
    /* over the freezes, through the function the screen calls (streaksFor on the drawn poses) */
    let streaked = 0, movingSeeds = 0, noStreakWhileMoving = [], streakAtRest = [];
    for (const { x, rs } of frozen) {
      const w = rs.world, wc = carriedWorld(w, 0), poses = [];
      for (const a of w.actors) if (!a.shadow) { const q = carriedPose(wc, a, 0); poses.push({ id: a.id, x: q.x, y: q.y, z: q.z ?? 0, heading: q.rot, length: q.length, player: !!a.player }); }
      const got = streaksFor(poses, w), gotIds = new Set(got.map((g) => g.id));
      const movers = w.actors.filter((a) => !a.player && !a.shadow && a.v > AT_REST);
      if (movers.length) movingSeeds++;
      if (got.length) streaked++;
      for (const a of movers) if (!gotIds.has(a.id)) noStreakWhileMoving.push(`${tag(x)}:${a.id}`);
      for (const g of got) { const a = w.actors.find((c) => c.id === g.id); if (!(a.v > AT_REST) || a.player) streakAtRest.push(`${tag(x)}:${g.id}`); }
    }
    const share = streaked / frozen.length;
    check(share >= 0.5, `EXPOSURE: some car is streaked at the freeze in ${(100 * share).toFixed(1)}% of ${frozen.length} seeds (at least 50%) [M, this run]; ${movingSeeds} seeds have another road user above AT_REST`);
    check(noStreakWhileMoving.length === 0, `every other road user moving at the freeze has its streaks${noStreakWhileMoving.length ? ` -- not ${noStreakWhileMoving.slice(0, 5).join(" ")}` : ""}`);
    check(streakAtRest.length === 0, `...and no car at rest, and not the player's, has one${streakAtRest.length ? ` -- ${streakAtRest.slice(0, 5).join(" ")}` : ""}`);
  }

  /* 5. THE SOURCE: the screen plays the replay in the intro and draws the streaks while frozen or waiting. */
  {
    const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8");
    check(/replayAt\(rs\.decision\.replay, intro\)/.test(src) && /const it = rs\.phase === "frozen" && intro < INTRO_END \? introAt\(trail, intro\) : null;\s*\n\s*const rp = it && rs\.decision\.replay\?\.length/.test(src) && /const world = rp \? rp\.world : rs\.world/.test(src) && /actorsOf\(withGameBody\(rp \? \{ \.\.\.sc, world \} : sc\), carry, body\)/.test(src), "Game.jsx draws the recorded worlds over the intro (replayAt on rs.decision.replay at the intro clock, the world and carry from it, through actorsOf and withGameBody) and the frozen world after it (source text)");
    check(/body\.dt = dt \* \(rp \? REPLAY_RATE : speedOf\(rs\.phase\)\)/.test(src), "the body's clock runs at the replay's rate while it plays (source text)");
    const streakBlock = /if \(rs\.phase !== "gone"\) \{[\s\S]*?streaksFor\(actors, world\)/.exec(src)?.[0] ?? "";
    check(streakBlock.length > 0 && /createLinearGradient/.test(src), "Game.jsx draws the streaks (streaksFor on the drawn actors and the drawn world) in every phase but gone, so while frozen and waiting (source text)");
    check(/relevantIds\(world, drawMe\)/.test(src) && /stopOrder\(world, drawMe\)/.test(src) && /px < 0 \|\| px > size\.w/.test(src), "the rings and the order are read from the drawn world, and a car off the screen is not ringed (source text)");
    check(/it \? it\.u : 1/.test(src) && !/replay[^\n]*roundTick|roundTick[^\n]*replay/.test(src), "the replay is never stepped through the sim: nothing in Game.jsx feeds a recorded world to roundTick (source text)");
  }
}

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}`);
process.exit(failed ? 1 : 0);
void REACTION_FLOOR; void tracker;
