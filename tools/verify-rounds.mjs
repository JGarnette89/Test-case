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
import { toDecision, toDecisionFrom, startRound, roundTick, press, release, setTarget, clearOfBox, roundWorld, verdictOf, timingStars, timingOf, UNDUE, LAUNCH_SPAN, AT_LINE, FRONT_CLEAR, LIMIT, KMH } from "../src/game/round.js";
import { DEAD, RANGE_OF, rangeOf, targetOf, offsetOf, thumbTarget, zoneRect } from "../src/game/control.js";
import { autoInput } from "../src/game/autopilot.js";
import { HARSH_AT } from "../src/sim/traffic.js";
import { DT } from "../src/sim/crossing.js";
import { pageMore, pageLeft, PAGE_STEPS } from "../src/sim/pace.js";
import { driveDecision, oracle, eager, late, creep, tracker } from "./lib/round-drive.mjs";
import { loadMap } from "../src/map/load.js";
import { openTo, AT_REST, atNode, blockedBy, conflictOf, CAR, poseOf, carriedWorld, carriedPose } from "../src/sim/crossing.js";
import { viewOf } from "../src/iso/project.js";
import { UP_HEADING } from "../src/iso/chase.js";
import { driverPose, carriedPlayer } from "../src/sim/drive.js";
import { poseOnGraph } from "../src/sim/graph.js";
import { relevantIds, screechAt, settleAt, introAt, frameCamera, decisionFrame, skidLines, stopOrder, arrivalSeconds, SAME_MOMENT, FAST, speedOf, SCREECH, SETTLE, INTRO_END, replayAt, ghostOf, GHOST_INSET, GHOST_ALPHA, ARRIVE_WITHIN, SCREECH_MIN_M, REPLAY, REPLAY_RATE } from "../src/game/stage.js";
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
  const missed = [], notEqual = [], boxMissed = [], widths = [];
  let relSeen = 0, seedsDropping = 0, droppedCars = 0;
  for (const { x, rs } of frozen) {
    const k = rs.me.k ?? 0, L = rs.world.course.at[k].layout, p = driverPose(rs.me, rs.world.course);
    const pts = [[p.x, p.y, p.z ?? 0, "stop pose"]];
    const own = conflictingNow(rs);
    /* Slice 7: the frame holds only the stop pose and the cars `line` and `box`; an `arriving` or `holds` car is not in it and is shown by its GHOST at the
       screen's edge when off the screen (section 19). The edge badges of slices 5 and 6 are gone. */
    for (const c of own) if (c.why === "line" || c.why === "box") { const q = poseOf(rs.world, c.a); pts.push([q.x, q.y, q.z ?? 0, `car ${c.a.id}`]); relSeen++; }
    const dropped = own.filter((c) => !c.why && c.secs > ARRIVE && c.secs !== Infinity);   // conflicting, not past, MORE THAN 4 s out and moving
    if (dropped.length) { seedsDropping++; droppedCars += dropped.length; }
    if (new Set(relevantIds(rs.world, rs.me)).size !== own.filter((c) => c.why).length) notEqual.push(tag(x));
    const f = decisionFrame(rs);
    widths.push(Math.max(f.w, f.h));
    const half = 8;   // the box's own corners, from the layout: a frame must hold the whole intersection (the check reads place.at and a 6 m half-size at least)
    for (const size of sizes) {
      const fc = frameCamera(f, p, size), v = viewOf(fc.k, { ...fc.cam, id: null }, fc.rot, size);
      for (const q of pts) if (!onScreen(v, size, q)) missed.push(`${tag(x)}/${size.w}x${size.h}:${q[3]}`);
      const at = L.place.at;
      for (const [dx, dy] of [[-half, -half], [half, -half], [half, half], [-half, half]]) if (!onScreen(v, size, [at.x + dx, at.y + dy, 0])) boxMissed.push(`${tag(x)}/${size.w}x${size.h}`);
    }
  }
  check(frozen.length >= 40 && relSeen >= 20, `EXPOSURE: ${frozen.length} frozen rounds and ${relSeen} relevant cars read (at least 40 and 20)`);
  check(missed.length === 0, `the player's stop pose and every relevant car AT ITS LINE OR IN THE BOX project inside the screen, 400x800 and 800x400, in every pooled seed${missed.length ? ` -- not ${missed.slice(0, 5).join(" ")}` : ""}`);
  check(boxMissed.length === 0, `the intersection's own box (8 m either side of its centre [instrument]) projects inside the screen in every one${boxMissed.length ? ` -- not ${boxMissed.slice(0, 5).join(" ")}` : ""}`);
  check(notEqual.length === 0, `stage.js relevantIds is the check's own relevant set in every one (the time filter applied: at its line, in the box, within 4 s, or holding the sound driver)${notEqual.length ? ` -- not ${notEqual.slice(0, 5).join(" ")}` : ""}`);
  const ws = widths.slice().sort((a, b) => a - b), within = widths.filter((w) => w <= 40).length / widths.length;
  /* REVIEW: tightened from the spec's 50 m in 95% (sabotage (b) cleared it by only 3 points) to 40 m in every seed; clean widest 31.1 m [M]. */
  check(within === 1, `the frame's longer side is at most 40 m [invented, slice 6 review; slice 5's was 120] in ${(100 * within).toFixed(1)}% of ${widths.length} seeds (all of them)`);
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
  check(a1 != null && isDeepStrictEqual(Object.keys(a1.decision).sort(), ["crossedAt", "decideAt", "goAt", "launch", "made", "openings", "replay", "screech", "timing", "trail"]), "the per-decision state is ONE object, rs.decision, holding the openings, decideAt, goAt, the trail, the replay (slice 6), the screech chosen (slice 7), launch, made, crossedAt and the timing");
  check(a1 != null && ["decideAt", "goAt", "openings", "timing", "trail", "replay", "screech", "launch", "made", "crossedAt"].every((f) => !(f in a1)), "and none of those fields is left on the round itself");
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
  check(/owed \+= dt \* speedOf\(rs\.phase, clearOfBox\(rs\)\)/.test(src) && /pageMore\(owed, steps/.test(src) && /owed = pageLeft\(owed\)/.test(src), "Game.jsx adds FAST ticks' worth of time a tick after GO once the car is clear of the box, and still steps through pageMore / pageLeft (source text)");
  const down = /const onDown = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "", move = /const onMove = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "", up = /const onUp = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "";
  check(down.length > 0 && move.length > 0 && up.length > 0, "EXPOSURE: onDown, onMove and onUp were found in the source");
  const dragBranch = /if \(canPan\(\)[\s\S]*?return;\s*\}/.exec(down)?.[0] ?? "";
  check(/!inRect\(zone, q\.x, q\.y\)/.test(dragBranch) && dragBranch.length > 0, "a finger that lands OUTSIDE the control's zone takes the drag branch (source text)");
  check(/panFree\(/.test(move) && /pinchFree\(/.test(move), "a drag outside the button routes to panFree and pinchFree (source text)");
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

console.log("\n16. THE WORLD ARRIVES WITH YOU (slice 6): the replay, which world is drawn when, as source text");
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

  /* 5. THE SOURCE: the screen plays the replay in the intro. (Slice 7: the streaks of slice 6 are gone.) */
  {
    const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8");
    check(/replayAt\(rs\.decision\.replay, intro\)/.test(src) && /const it = rs\.phase === "frozen" && intro < INTRO_END \? introAt\(trail, intro\) : null;\s*\n\s*const rp = it && rs\.decision\.replay\?\.length/.test(src) && /const world = rp \? rp\.world : rs\.world/.test(src) && /actorsOf\(withGameBody\(rp \? \{ \.\.\.sc, world \} : sc\), carry, body\)/.test(src), "Game.jsx draws the recorded worlds over the intro (replayAt on rs.decision.replay at the intro clock, the world and carry from it, through actorsOf and withGameBody) and the frozen world after it (source text)");
    check(/body\.dt = dt \* \(rp \? REPLAY_RATE : speedOf\(rs\.phase, clearOfBox\(rs\)\)\)/.test(src), "the body's clock runs at the replay's rate while it plays (source text)");
    check(/relevantIds\(world, drawMe\)/.test(src) && /stopOrder\(world, drawMe\)/.test(src) && /px < 0 \|\| px > size\.w/.test(src), "the rings and the order are read from the drawn world, and a car off the screen is not ringed (source text)");
    check(/it \? it\.u : 1/.test(src) && !/replay[^\n]*roundTick|roundTick[^\n]*replay/.test(src), "the replay is never stepped through the sim: nothing in Game.jsx feeds a recorded world to roundTick (source text)");
  }
}

console.log("\n17. NO CLIPPING IN THE ARRIVAL (slice 7): the player's drawn footprint overlaps no other drawn road user's, at every 1/60 of the intro");
const clipKinds = { full: 0, shortened: 0, own: 0 };
{
  const frozen = POOLED.map((x) => ({ x, rs: frozenOf.get(tag(x)) })).filter((e) => e.rs);
  const SAMPLES = 60;   // [the spec's]
  /* The check's own statement of two oriented rectangles' overlap: the half-extent of each on each of the four axes (stage.js tests the corners). */
  const rectOf = (p) => { const h = (p.heading * Math.PI) / 180; return { cx: p.x, cy: p.y, ux: Math.cos(h), uy: Math.sin(h), hl: p.length / 2, hw: p.width / 2 }; };
  const depthOf = (A, B) => {
    const a = rectOf(A), b = rectOf(B);
    let least = Infinity;
    for (const r of [a, b]) for (const [ax, ay] of [[r.ux, r.uy], [-r.uy, r.ux]]) {
      const ext = (q) => q.hl * Math.abs(q.ux * ax + q.uy * ay) + q.hw * Math.abs(-q.uy * ax + q.ux * ay);
      const pen = ext(a) + ext(b) - Math.abs((b.cx - a.cx) * ax + (b.cy - a.cy) * ay);
      if (pen <= 0) return 0;
      least = Math.min(least, pen);
    }
    return least;
  };
  /* How far apart two footprints are (0 when they overlap): perimeter points of each, 0.25 m apart, against the other's rectangle. */
  const gapBetween = (A, B) => {
    if (depthOf(A, B) > 0) return 0;
    let m = Infinity;
    for (const [P, Q] of [[A, B], [B, A]]) {
      const q = rectOf(Q), p = rectOf(P);
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        if (i % 8 && j % 8) continue;
        const lx = (i / 8 - 0.5) * 2 * p.hl, ly = (j / 8 - 0.5) * 2 * p.hw;
        const wx = p.cx + p.ux * lx - p.uy * ly, wy = p.cy + p.uy * lx + p.ux * ly;
        const dx = wx - q.cx, dy = wy - q.cy, along = dx * q.ux + dy * q.uy, across = -dx * q.uy + dy * q.ux;
        m = Math.min(m, Math.hypot(Math.max(Math.abs(along) - q.hl, 0), Math.max(Math.abs(across) - q.hw, 0)));
      }
    }
    return m;
  };
  /* What the screen draws at `t`, from the calls it makes: the replayed world at t with each car carried (actorsOf's), and the player as introAt
     poses them over the screech trail given, else as that world has them. */
  const drawnAt = (rs, trail, t) => {
    const r = replayAt(rs.decision.replay, t), w = r.world, wc = carriedWorld(w, r.carry), others = [];
    for (const a of w.actors) if (!a.shadow && !a.player) { const q = carriedPose(wc, a, r.carry); others.push({ id: a.id, x: q.x, y: q.y, heading: q.rot, length: q.length, width: q.width }); }
    const me = w.actors.find((a) => a.player && !a.shadow), it = introAt(trail, t), mp = it.pose ?? driverPose(carriedPlayer(me, r.carry), w.course);
    return { me: { x: mp.x, y: mp.y, heading: mp.heading, length: lenOf(me), width: CAR.width }, others, parked: w.parked?.length ?? 0 };
  };
  const worstOver = (rs, trail) => {
    let worst = 0, at = null, nearest = Infinity;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = (INTRO_END * i) / SAMPLES, d = drawnAt(rs, trail, t);
      for (const o of d.others) { const dp = depthOf(d.me, o); if (dp > worst) { worst = dp; at = { t, id: o.id }; } nearest = Math.min(nearest, gapBetween(d.me, o)); }
    }
    return { worst, at, nearest };
  };
  const rows = frozen.map(({ x, rs }) => {
    const sc = rs.decision.screech, after = worstOver(rs, sc.trail), before = worstOver(rs, rs.decision.trail);
    return { x, rs, sc, after, before };
  });
  for (const r of rows) clipKinds[r.sc.kind]++;
  const hitBefore = rows.filter((r) => r.before.worst > 0.01), hitAfter = rows.filter((r) => r.after.worst > 0.01);
  check(rows.length >= 40 && rows.every((r) => r.rs.decision.replay.length > 1 && r.sc), `EXPOSURE: ${rows.length} frozen rounds, each with a replay and a screech decision, the intro read at ${SAMPLES + 1} instants (at least 40)`);
  check(hitAfter.length === 0, `the player's drawn footprint overlaps no other drawn road user's at any of the ${SAMPLES + 1} instants of the intro, in every pooled seed${hitAfter.length ? ` -- not ${hitAfter.slice(0, 5).map((r) => `${tag(r.x)}(${r.after.worst.toFixed(2)} m with ${r.after.at.id})`).join(" ")}` : ""}`);
  const needed = clipKinds.shortened + clipKinds.own, near2 = rows.filter((r) => r.after.nearest <= 2).length;
  console.log(`        slice 6's whole trail overlapped another car in ${hitBefore.length} of ${rows.length} seeds (worst ${Math.max(0, ...hitBefore.map((r) => r.before.worst)).toFixed(2)} m); the screech chosen: ${clipKinds.full} whole, ${clipKinds.shortened} shortened (${rows.filter((r) => r.sc.kind === "shortened").map((r) => r.sc.meters.toFixed(1)).join(" ")} m), ${clipKinds.own} drawn at the player's own pose; ${near2} seeds had another road user within 2 m of the player's drawn footprint [M, this run]`);
  check(needed >= 1 ? hitBefore.length === needed : near2 >= 10, `EXPOSURE: ${needed > 0 ? `the fix was needed (a: ${clipKinds.shortened}, b: ${clipKinds.own}) in exactly the ${hitBefore.length} seeds where the whole trail overlaps, so the line above had a case to pass` : `no seed needed the fix, and another road user came within 2 m of the player's drawn footprint in ${near2} seeds (at least 10), else CANNOT TELL`}`);
  /* (a) keeps at least SCREECH_MIN_M of road; (b) is chosen only when no screech of that length clears. */
  const cut = (trail, L) => { const d = [0]; for (let i = 1; i < trail.length; i++) d.push(d[i - 1] + Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y)); let i = trail.length - 1; while (i > 0 && d[d.length - 1] - d[i] < L - 1e-9) i--; return trail.slice(i); };
  const short = rows.filter((r) => r.sc.kind === "shortened" && !(r.sc.meters >= 6 - 1e-9 && r.sc.trail.length > 1 && r.before.worst > 0.01));
  check(clipKinds.shortened >= 1 && short.length === 0, `EXPOSURE: ${clipKinds.shortened} seeds took a shortened screech; each keeps at least 6 m of road (stated here [the spec's]) and is one the whole trail needed${short.length ? ` -- not ${short.slice(0, 5).map((r) => tag(r.x)).join(" ")}` : ""}`);
  const unjust = rows.filter((r) => r.sc.kind === "own").filter((r) => {
    const tr = r.rs.decision.trail; let total = 0; for (let i = 1; i < tr.length; i++) total += Math.hypot(tr[i].x - tr[i - 1].x, tr[i].y - tr[i - 1].y);
    for (let L = 6; L <= total; L += 1) if (!(worstOver(r.rs, cut(tr, L)).worst > 0.01)) return true;   // a clean screech of at least 6 m existed
    return r.sc.trail.length !== 0;
  });
  check(clipKinds.own >= 1 && unjust.length === 0, `EXPOSURE: ${clipKinds.own} seeds draw the player at its own pose; in each, every screech of 6 m or more (1 m steps up to the whole trail) overlaps, and the decision's screech is empty${unjust.length ? ` -- not ${unjust.slice(0, 5).map((r) => tag(r.x)).join(" ")}` : ""}`);
  /* Nothing jumps when the button appears: the player at INTRO_END is the frozen pose, whichever screech. */
  const jump = rows.filter((r) => { const d = drawnAt(r.rs, r.sc.trail, INTRO_END), p = driverPose(r.rs.me, r.rs.world.course); return Math.hypot(d.me.x - p.x, d.me.y - p.y) > 0.01; });
  check(jump.length === 0, `at INTRO_END the player is drawn at the frozen pose to 1 cm in every seed (nothing jumps when the button appears)${jump.length ? ` -- not ${jump.slice(0, 5).map((r) => tag(r.x)).join(" ")}` : ""}`);
  const parked = rows.filter((r) => drawnAt(r.rs, r.sc.trail, 0).parked > 0).length;
  check(parked === 0, `PRECONDITION: no round's world has parked cars (${parked} do), so every road user a footprint could meet is among the world's actors`);
  { const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8"); check(/const trail = rs0\.decision\.screech\?\.trail \?\? rs0\.decision\.trail \?\? \[\];/.test(src), "Game.jsx screeches along the decision's chosen trail, not the whole recorded one (source text)"); }
}

console.log("\n18. THE THUMB SETS THE SPEED (slice 7): the control, the car's answer, the creep policy, the verdicts");
const dragSizes = [{ w: 400, h: 800 }, { w: 800, h: 400 }];
{
  /* 1. targetOf, stated here. */
  check(DEAD === 14 && RANGE_OF === 0.3 && Math.abs(LIMIT - 50 / 3.6) < 1e-12, `the constants: DEAD 14 px [invented], RANGE 0.3 of the screen height [invented], the top the round's limit ${LIMIT.toFixed(3)} m/s = ${KMH} km/h (stated here)`);
  for (const size of dragSizes) {
    const R = 0.3 * size.h, ys = Array.from({ length: 1601 }, (_, i) => -400 + i), ts = ys.map((dy) => targetOf(dy, size));
    check(ys.filter((dy) => dy <= 14).every((dy) => targetOf(dy, size) === 0), `${size.w}x${size.h}: targetOf is 0 at and under 14 px of drag (waiting)`);
    check(ts.every((v, i) => v >= 0 && v <= LIMIT + 1e-12 && (i === 0 || v >= ts[i - 1] - 1e-12)), `${size.w}x${size.h}: it is never negative, never above the limit and non-decreasing in dy (1601 samples)`);
    check(Math.abs(targetOf(14 + R, size) - LIMIT) < 1e-9 && ts[ys.indexOf(Math.round(14 + R)) + 5] === targetOf(14 + R + 5, size) && targetOf(2000, size) === LIMIT, `${size.w}x${size.h}: it reaches the limit at 14 + ${R} px and holds it above`);
    check(ts.filter((v) => v > 0 && v < LIMIT).length >= 100, `EXPOSURE: ${ts.filter((v) => v > 0 && v < LIMIT).length} of the samples are strictly between waiting and the limit (at least 100), so the monotone line saw a rising stretch`);
    /* A later touch takes over from the target it had: the offset is the inverse, and dragging back down brakes. */
    const back = [0.1, 0.4, 0.75, 1].map((f) => f * LIMIT).every((T) => Math.abs(targetOf(offsetOf(T, size), size) - T) < 1e-9 && Math.abs(thumbTarget({ y: 500, base: offsetOf(T, size) }, 500, size) - T) < 1e-9);
    const down = thumbTarget({ y: 500, base: offsetOf(LIMIT, size) }, 500 + 14 + R, size), up = thumbTarget({ y: 500, base: offsetOf(0.4 * LIMIT, size) }, 500 - 30, size);
    check(back && down === 0 && up > 0.4 * LIMIT && thumbTarget({ y: 500, base: 0 }, 500 - 10, size) === 0, `${size.w}x${size.h}: a later touch reads its drag from the target the last one left (a press at the same place keeps it; a drag of the whole range down is 0; up from 0.4 of the limit is faster)`);
    const zone = zoneRect(size, { x: 16, y: size.h - 120, w: size.w - 32, h: 96 });
    check(zone.x === 16 && zone.w === size.w - 32 && Math.abs(zone.y - (size.h - 120 - R)) < 1e-9 && Math.abs(zone.y + zone.h - (size.h - 24)) < 1e-9, `${size.w}x${size.h}: the control's zone is the button's rectangle extended up by the range (${R} px)`);
  }

  /* 2. The round's API. */
  /* The car's own answers are read on a `now` seed of a straight task (an open road: nobody to hit), where a thumb that drags to the limit really
     can go, and not on a `wait` seed, where going is a collision (the car stopping there is the crash, not the brake). */
  const x0 = POOLED.find((e) => e.pool === "now" && e.type.task === "straight"), fz = frozenOf.get(tag(x0));
  check(!!x0 && fz.phase === "frozen", `EXPOSURE: the car tests run on ${tag(x0)}, a straight task with the way open at the freeze`);
  const z0 = setTarget(fz, 0), w1 = setTarget(press(fz), 0), g1 = setTarget(press(fz), 3);
  check(z0.phase === "frozen" && w1.phase === "waiting" && z0.target === 0 && g1.phase === "gone" && g1.target === 3 && g1.decision.goAt === fz.world.t, "a target of 0 is not GO (frozen stays frozen, waiting stays waiting); the first target above 0 is GO, at that tick's world time, with the target kept");
  const g2 = setTarget(g1, 0), g3 = setTarget(g1, 1e9);
  check(g2.phase === "gone" && g2.target === 0 && g2.decision.goAt === g1.decision.goAt && g3.target === LIMIT, "after GO the target moves freely: back to 0 (still gone, GO not re-stamped) and never above the limit");

  /* 3. The car answers: speed after GO is the target's, a drag down brakes, a 0 stops it where it is, and the corner still caps it. */
  {
    const run = (target, down) => {
      let rs = setTarget(press(fz), target), v = [], mx = 0, dec = 0, at = null;
      for (let i = 0; i < 400 && !rs.end; i++) {
        const before = rs.me.v;
        rs = roundTick(rs);
        v.push(rs.me.v); mx = Math.max(mx, rs.me.v); dec = Math.max(dec, (before - rs.me.v) / DT);
        if (down && at == null && rs.me.v >= down.v) { at = { s: rs.me.s, v: rs.me.v }; rs = setTarget(rs, 0); down = null; at.mark = v.length; }
      }
      return { rs, v, mx, dec, at };
    };
    const pathX = fz.world.course.at[fz.targetK].layout.paths[fz.me.route];
    const slow = run(2.5), fast = run(LIMIT);
    check(slow.mx <= 2.5 * 1.1 + 0.05 && fast.mx > slow.mx + 2 && slow.rs.end?.why !== "contact" && fast.rs.end?.why !== "contact", `the speed follows the target: a 2.5 m/s target peaks at ${slow.mx.toFixed(2)} m/s, the full limit at ${fast.mx.toFixed(2)} m/s [M, this run, ${tag(x0)}]`);
    const stop = run(LIMIT, { v: 5 });
    const after = stop.v.slice(stop.at?.mark ?? 0), rest = after.findIndex((q) => q < 0.1);
    check(stop.at != null && stop.at.v >= 5 && rest > 0 && rest * DT <= 6, `EXPOSURE + the brake: from ${stop.at?.v.toFixed(1)} m/s (at least 5) a drag to 0 stops the car in ${(rest * DT).toFixed(2)} s (at most 6 s) [M, this run]`);
    check(stop.dec <= HARSH_AT + 0.5 && stop.dec > 0, `it brakes at the sim's own harsh threshold at most, not harder: peak ${stop.dec.toFixed(2)} m/s^2 against HARSH_AT ${HARSH_AT.toFixed(2)} (+0.5 slack [instrument]) [M, this run]`);
  }

  /* 4. The creep policy, on every wait seed: a third of the limit from the oracle's moment. */
  {
    const T3 = LIMIT / 3, rows = [];
    for (const x of POOLED.filter((e) => e.pool === "wait")) {
      let atLine = null, cap = null, settledAt = null;
      const r = driveDecision(x.type, x.seed, x.type.cars, creep, { onTick: (b, a) => {
        const p = a.world.course.at[a.me.k]?.layout.paths[a.me.route];
        if (b.phase === "gone" && p && a.me.k === a.targetK) {
          if (atLine == null && a.me.s > p.stopAt) atLine = { v: a.me.v, s: a.me.s - p.stopAt };
          if (settledAt == null && Math.abs(a.me.v - T3) <= 0.1 * T3) settledAt = { s: a.me.s - p.stopAt, box: p.clearAt - p.stopAt };
        }
        if (b.phase === "gone") cap = Math.max(cap ?? 0, a.me.v);
      } });
      rows.push({ x, r, atLine, settledAt, peak: cap });
    }
    const ended = rows.filter((q) => q.r.rs.end), noContact = rows.filter((q) => q.r.rs.end?.why !== "contact" && !q.r.verdict.faults.some((f) => f.id === "collision" || f.id === "struckPerson"));
    check(rows.length >= 20 && ended.length === rows.length, `EXPOSURE: the creep policy (${T3.toFixed(2)} m/s from the oracle's moment) drove ${rows.length} wait seeds and the round ended in every one`);
    check(noContact.length === rows.length, `...and with no contact in any of them (${rows.length - noContact.length} had one)`);
    const reached = rows.filter((q) => q.settledAt);
    const peaks = rows.map((q) => q.peak).filter((v) => v != null);
    console.log(`        creep (a third of the limit, ${T3.toFixed(2)} m/s): speed when the car's front axle reaches the line (the box): ${stat(rows.filter((q) => q.atLine).map((q) => q.atLine.v))} m/s; first within 10% of the target ${reached.length} of ${rows.length} seeds, at ${stat(reached.map((q) => q.settledAt.s))} m past the line (the box is ${stat(reached.map((q) => q.settledAt.box))} m deep); peak ${stat(peaks)} m/s [M, this run]`);
    /* Revised in review (the planner's own [invented] bar, on evidence): "within 10% before the box" is unreachable.
       The car is at rest at its line and pulls away at ACCEL_MAX, so it crosses the line at 2.71 m/s in every seed and first
       reaches the target 8.56 m past it, while boxes are 6.05-17.35 m deep [M, the executor's run]. What the line must show is
       that the autopilot aims for the player's target and not for full speed: it reaches the target and never overshoots it. */
    check(reached.length === rows.length, `in every wait seed the creeping car reaches within 10% of a third of the limit (${reached.length} of ${rows.length})`);
    check(peaks.length === rows.length && peaks.every((v) => v <= 1.1 * T3), `...and never goes faster than 10% over it (peak ${stat(peaks)} m/s against ${(1.1 * T3).toFixed(2)})`);
  }

  /* 5. The verdicts under the thumb are slice 6's: the stored table (made on slice 6's code, tools/lib/slice6-verdicts.json) against this run. */
  {
    const old = JSON.parse(readFileSync(new URL("./lib/slice6-verdicts.json", import.meta.url), "utf8"));
    const diff = [];
    let n = 0;
    for (const x of POOLED) for (const [name, make] of [["oracle", oracle], ["eager", eager]]) {
      const r = driveDecision(x.type, x.seed, x.type.cars, make), v = r.verdict, key = `${x.type.id}/${x.pool}#${x.seed}/${name}`;
      const now = { end: r.rs.end?.why, stars: v.stars, faults: ids(v).sort().join(","), praise: v.praise.map((f) => f.id).sort().join(","), delay: v.delay == null ? null : +v.delay.toFixed(2) };
      n++;
      if (!isDeepStrictEqual(old[key], now)) diff.push(`${key}: ${JSON.stringify(old[key])} -> ${JSON.stringify(now)}`);
    }
    check(n >= 400 && Object.keys(old).length === n, `EXPOSURE: ${n} (seed, policy) pairs compared with slice 6's stored verdicts (${Object.keys(old).length} stored; at least 400)`);
    check(diff.length === 0, `under the thumb at the full limit, oracle and eager end, star, fault, praise and delay exactly as in slice 6 in every pooled seed: ${n - diff.length} of ${n} the same${diff.length ? ` -- differ: ${diff.slice(0, 5).join(" | ")}` : ""}`);
  }

  /* 6. Source text: the thumb is drawn, releasing keeps the speed, and a drag inside the zone never pans. */
  {
    const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8");
    const down = /const onDown = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "", move = /const onMove = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "", up = /const onUp = [\s\S]*?\n  \};/.exec(src)?.[0] ?? "";
    check(down.length > 0 && move.length > 0 && up.length > 0, "EXPOSURE: onDown, onMove and onUp were found in the source");
    check(!/aim\(|setTarget\(|\.target = |press\(/.test(up) && /grab = null/.test(up), "releasing the finger keeps the target: onUp ends the grab and sets no speed (source text)");
    check(/inRect\(zone, q\.x, q\.y\)\) \{[\s\S]*?return;\s*\}/.test(down) && down.indexOf("grab = {") > -1 && down.indexOf("grab = {") < down.indexOf("canPan()") && /canPan\(\) && !inRect\(zone, q\.x, q\.y\)/.test(down), "a touch inside the control's zone starts the grab and returns before the pan branch; the pan branch needs a touch outside the zone (source text)");
    check(/if \(grab && e\.pointerId === grab\.id\) \{[^}]*aim\(thumbTarget\(grab, q\.y, size\)\)[^}]*return;/.test(move) && move.indexOf("grab") < move.indexOf("panFree("), "the grabbing finger's moves set the speed and return before any pan or pinch (source text)");
    check(/offsetOf\(rs\.target, size\)/.test(src) && /offsetOf\(me\.v, size\)/.test(src) && /bar = \{ x: q\.x, y: q\.y \}/.test(src), "the bar is drawn from the press point on the canvas, the target and the car's own speed on one scale (source text)");
    check(/const go = \(\) =>/.test(src) && /if \(was !== "gone" && rs\.phase === "gone"\) go\(\)/.test(src), "the camera's GO runs when setTarget makes the round gone, wherever the finger is (source text)");
    check(speedOf("gone", false) === 1 && speedOf("gone", true) === FAST && speedOf("waiting", true) === 1, "FAST applies only once the car is clear of the box: speedOf(gone, not clear) is 1, (gone, clear) is FAST");
    {
      const fz2 = frozenOf.get(tag(x0)); let rs = setTarget(press(fz2), LIMIT), seenIn = false, seenClear = false, wrong = 0;
      for (let i = 0; i < 400 && !rs.end; i++) { rs = roundTick(rs); const p = pathOf(rs), inBox = rs.me.k === rs.targetK && rs.me.s > p.stopAt && rs.me.s < p.clearAt; if (inBox) { seenIn = true; if (clearOfBox(rs)) wrong++; } else if (rs.me.s >= p.clearAt || rs.me.k !== rs.targetK) { seenClear = true; if (!clearOfBox(rs)) wrong++; } }
      check(seenIn && seenClear && wrong === 0, `EXPOSURE: clearOfBox is false while the car is in the box and true once it is out, over a whole round (seen in the box: ${seenIn}, seen clear: ${seenClear})`);
    }
  }
}

console.log("\n19. GHOST CARS AT THE EDGE (slice 7): an arriving or holding car off the screen, on its own path, 24 px in, gone when it is on");
{
  const frozen = POOLED.map((x) => ({ x, rs: frozenOf.get(tag(x)) })).filter((e) => e.rs);
  const sizes = [{ w: 400, h: 800 }, { w: 800, h: 400 }];
  const viewFor = (rs, size) => { const p = driverPose(rs.me, rs.world.course), fc = frameCamera(decisionFrame(rs), p, size); return viewOf(fc.k, { ...fc.cam, id: null }, fc.rot, size); };
  const inside = (v, size, q, m = 0) => { const [px, py] = v.P(q.x, q.y, q.z ?? 0); return px >= m && px <= size.w - m && py >= m && py <= size.h - m; };
  const pathPts = (rs, a) => { const L = rs.world.course.at[a.k ?? 0].layout, path = L.paths[a.route], out = []; for (let s = 0; s <= path.length; s += 0.1) out.push({ s, ...poseOnGraph(rs.world.course, a.k ?? 0, a.route, s) }); return { path, out }; };
  check(GHOST_INSET === 24 && GHOST_ALPHA[0] === 0.25 && GHOST_ALPHA[1] === 0.6 && ARRIVE_WITHIN === 4, "the constants: inset 24 px, opacity 0.25 to 0.6, 4 s (stated here, [invented])");
  const offGhosts = [], notOnScreen = [], notOnPath = [], badHeading = [], badAlpha = [], ghostOnScreen = [], ghostIrrelevant = [], missing = [];
  let seedsOff = 0, placements = 0, onScreenRel = 0, offIrrelevant = 0, worstPath = 0, worstHead = 0, worstIn = Infinity;
  for (const { x, rs } of frozen) {
    const own = conflictingNow(rs);
    let any = false;
    for (const size of sizes) {
      const v = viewFor(rs, size);
      for (const c of own) {
        const a = c.a, q = poseOf(rs.world, a), rel = c.why === "arriving" || c.why === "holds", on = inside(v, size, q), g = ghostOf(rs.world, rs.me, a, v, size);
        if (rel && !on) {
          placements++; any = true;
          if (!g) { missing.push(`${tag(x)}/${size.w}x${size.h}:${a.id}`); continue; }
          const [gx, gy] = v.P(g.x, g.y, g.z), inset = Math.min(gx, size.w - gx, gy, size.h - gy);
          worstIn = Math.min(worstIn, inset);
          if (!(inset >= GHOST_INSET - 1)) notOnScreen.push(`${tag(x)}/${size.w}x${size.h}:${a.id}(${inset.toFixed(1)})`);
          const { path, out } = pathPts(rs, a);
          let best = Infinity, bs = 0;
          for (const o of out) { if (o.s < a.s - 0.5) continue; const d = Math.hypot(o.x - g.x, o.y - g.y); if (d < best) { best = d; bs = o.s; } }
          worstPath = Math.max(worstPath, best);
          if (!(best <= 0.5)) notOnPath.push(`${tag(x)}/${size.w}x${size.h}:${a.id}(${best.toFixed(2)} m)`);
          const e0 = poseOnGraph(rs.world.course, a.k ?? 0, a.route, Math.max(0, bs - 0.25)), e1 = poseOnGraph(rs.world.course, a.k ?? 0, a.route, Math.min(path.length, bs + 0.25));
          const ph = (Math.atan2(e1.y - e0.y, e1.x - e0.x) * 180) / Math.PI, dh = Math.abs((((g.heading - ph) % 360) + 540) % 360 - 180);
          worstHead = Math.max(worstHead, dh);
          if (!(dh <= 5)) badHeading.push(`${tag(x)}/${size.w}x${size.h}:${a.id}(${dh.toFixed(1)})`);
          if (!(g.alpha >= 0.25 - 1e-9 && g.alpha <= 0.6 + 1e-9)) badAlpha.push(`${tag(x)}:${a.id}(${g.alpha})`);
        } else if (rel && on) { onScreenRel++; if (g) ghostOnScreen.push(`${tag(x)}/${size.w}x${size.h}:${a.id}`); }
        else if (!rel) { if (!on) offIrrelevant++; if (g) ghostIrrelevant.push(`${tag(x)}/${size.w}x${size.h}:${a.id}`); }
      }
    }
    if (any) seedsOff++;
  }
  check(seedsOff >= 10 && placements >= 20, `EXPOSURE: in ${seedsOff} of ${frozen.length} seeds (${(100 * seedsOff / frozen.length).toFixed(1)}%) an arriving or holding car is off the screen at the freeze, ${placements} placements over 400x800 and 800x400 (at least 10 seeds, 20 placements) [M, this run]`);
  check(missing.length === 0, `every such car gets a ghost${missing.length ? ` -- not ${missing.slice(0, 5).join(" ")}` : ""}`);
  check(notOnScreen.length === 0, `every ghost projects at least ${GHOST_INSET - 1} px inside the screen (the closest was ${worstIn.toFixed(1)} px) [M, this run]${notOnScreen.length ? ` -- not ${notOnScreen.slice(0, 5).join(" ")}` : ""}`);
  check(notOnPath.length === 0, `every ghost lies on that car's own path, ahead of it, within 0.5 m of a point on it (the furthest was ${worstPath.toFixed(3)} m) [M, this run]${notOnPath.length ? ` -- not ${notOnPath.slice(0, 5).join(" ")}` : ""}`);
  check(badHeading.length === 0, `its heading is the path's there to 5 degrees (the largest was ${worstHead.toFixed(2)}) [M, this run]${badHeading.length ? ` -- not ${badHeading.slice(0, 5).join(" ")}` : ""}`);
  check(badAlpha.length === 0, `its opacity is in [0.25, 0.6]${badAlpha.length ? ` -- not ${badAlpha.slice(0, 5).join(" ")}` : ""}`);
  check(onScreenRel >= 10, `EXPOSURE: ${onScreenRel} arriving or holding cars are ON the screen at the freeze (at least 10), and ${offIrrelevant} other cars are off it`);
  check(ghostOnScreen.length === 0 && ghostIrrelevant.length === 0, `no car on the screen has a ghost, and no car that is neither arriving nor holding has one${ghostOnScreen.length + ghostIrrelevant.length ? ` -- not ${[...ghostOnScreen, ...ghostIrrelevant].slice(0, 5).join(" ")}` : ""}`);

  /* The opacity rises as the car closes, over a waiting run (the camera held where it was at the freeze). */
  {
    const series = [];
    for (const { x, rs: rs0 } of frozen.filter((e) => e.x.pool === "wait")) {
      const size = sizes[0], v = viewFor(rs0, size), by = new Map();
      let rs = press(rs0);
      for (let i = 0; i < 200 && !rs.end && rs.world.t - rs0.decision.decideAt < 10; i++) {
        for (const a of rs.world.actors) {
          if (a.player || a.shadow) continue;
          const g = ghostOf(rs.world, rs.me, a, v, size);
          if (g) { if (!by.has(a.id)) by.set(a.id, []); by.get(a.id).push({ alpha: g.alpha, s: a.s }); }
        }
        rs = roundTick(rs);
      }
      for (const [id, xs] of by) if (xs.length >= 3) series.push({ x, id, xs });
    }
    const seeds = new Set(series.map((q) => tag(q.x))), bad = series.filter((q) => q.xs.some((p, i) => i && p.alpha < q.xs[i - 1].alpha - 1e-9 && p.s >= q.xs[i - 1].s));
    const rising = series.filter((q) => q.xs[q.xs.length - 1].alpha > q.xs[0].alpha + 0.02);
    check(seeds.size >= 5 && series.length >= 5, `EXPOSURE: ${series.length} ghosted cars followed over a waiting run (3 or more ticks each), in ${seeds.size} seeds (at least 5)`);
    check(rising.length >= 3, `EXPOSURE: the opacity actually rises in ${rising.length} of them (at least 3), so the line below has a rise to hold`);
    check(bad.length === 0, `while a ghosted car closes (its distance along the path grows) its ghost's opacity never falls${bad.length ? ` -- not ${bad.slice(0, 5).map((q) => `${tag(q.x)}:${q.id}`).join(" ")}` : ""}`);
  }

  /* Source text: the ghost is drawn as a silhouette through the view, with no number; the slice-5/6 streaks and edge badges are gone. */
  {
    const src = readFileSync(new URL("../src/game/Game.jsx", import.meta.url), "utf8"), st = readFileSync(new URL("../src/game/stage.js", import.meta.url), "utf8");
    check(/ghostOf\(world, drawMe, a, view, size, carry\)/.test(src) && /ctx\.globalAlpha = g\.alpha/.test(src) && /ghostBox\(g\)/.test(src), "Game.jsx draws each ghost as a filled silhouette of its box through the view with its own opacity (source text)");
    const block = /const g = ghostOf\([\s\S]*?ctx\.restore\(\);/.exec(src)?.[0] ?? "";
    check(block.length > 0 && !/fillText|measureText/.test(block), "...and no number goes with it (source text)");
    check(!/streaksFor|streakOf|edgePoint|createLinearGradient/.test(src) && !/export (const|function) (streakOf|streaksFor|edgePoint|STREAK_S|EDGE_INSET)\b/.test(st), "the motion streaks and the edge badges are gone from the screen and from stage.js (source text)");
  }
}

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}`);
process.exit(failed ? 1 : 0);
void REACTION_FLOOR; void tracker;
