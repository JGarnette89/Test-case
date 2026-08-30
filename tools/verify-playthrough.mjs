/* =====================================================================
   PLAYTHROUGH VERIFICATION
   Run:  node tools/verify-playthrough.mjs

   Every other harness checks the engine. This one checks the sequence of
   engine calls the renderer actually makes during a run, because that loop
   is driven by requestAnimationFrame and has never been exercised in a
   headless environment — which is exactly where bugs get to hide until
   somebody is holding the phone.

   It mirrors the loop in RightOfWayTiming.begin(): step time forward, move
   the ego from the moment GO was pressed, watch for a collision, and stop
   when the ego is clear or the clock runs out. Then it checks the result
   against what the scorer says it should be.

   It is a mirror, not the component, so it cannot catch a React mistake.
   It can catch the run never terminating, throwing, missing a collision,
   or disagreeing with the verdict — and it covers every scenario at every
   press time rather than the handful a person would try by hand.
   ===================================================================== */
import { simulate, poseAt, conflicts, spanOf, STEP, safeAtFor } from "../src/engine/index.js";
import { grade, GRACE } from "../src/engine/score.js";
import { SCENARIOS } from "../src/engine/scenarios.js";
import { ROUTES } from "../src/engine/routes.js";
import { planRoute } from "../src/engine/route.js";
import { dailyScenario } from "../src/engine/generate.js";

const FRAME = 1 / 60;
const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log(`  FAIL: ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);

/* One run, exactly as the component drives it. `pressAt` is null for a
   player who never goes. */
function play(scn, pressAt) {
  const sim = simulate(scn);
  let frames = 0;
  const cap = Math.ceil((scn.duration + spanOf(sim.ego) + 4) / FRAME);

  for (let el = 0; ; el += FRAME) {
    if (++frames > cap) return { outcome: "HUNG", frames };
    const P = pressAt != null && el >= pressAt ? pressAt : null;

    if (P != null) {
      const egoLive = { ...sim.ego, departAt: P };
      const mine = poseAt(egoLive, el);
      for (const a of sim.actors) {
        const theirs = poseAt(a, el);
        if (theirs.gone || theirs.hidden) continue;
        if (conflicts(egoLive, mine, a, theirs, 0, 0, 0, "crash")) {
          return { outcome: "collision", at: P, el: r2(el), frames, who: a.name, sim };
        }
      }
      if (mine.gone || el > P + spanOf(sim.ego) + 0.35) {
        return { outcome: "cleared", at: P, el: r2(el), frames, sim };
      }
    } else if (el >= scn.duration) {
      return { outcome: "missed", at: null, el: r2(el), frames, sim };
    }
  }
}

/* ---------- 1. every scenario, every press time ---------- */
console.log("\n1. EVERY SCENARIO, SWEPT ACROSS EVERY PRESS TIME");
let runs = 0, hung = 0, threw = 0, mismatched = 0, collisions = 0;
const perScenario = [];

for (const scn of SCENARIOS) {
  const sim = simulate(scn);
  // What the app actually scores against — see safeAtFor's own comment.
  // Equal to legalAt for every scenario except one that deliberately
  // authors a driver who fails to yield (wontstop).
  const safeAt = safeAtFor(sim);
  let crashes = 0, cleared = 0;
  for (let p = 0; p <= scn.duration; p = r2(p + 0.1)) {
    runs++;
    let res;
    try {
      res = play(scn, p);
    } catch (e) {
      threw++;
      fail(`${scn.id} threw at press ${p}: ${e.message}`);
      continue;
    }
    if (res.outcome === "HUNG") { hung++; fail(`${scn.id} never terminated at press ${p}`); continue; }
    if (res.outcome === "collision") crashes++; else cleared++;

    // The verdict the player is shown must agree with the scorer.
    const g = grade({ legalAt: safeAt, pressedAt: p, collided: res.outcome === "collision" });
    if (res.outcome === "collision" && g.verdict !== "collision") {
      mismatched++;
      fail(`${scn.id} press ${p}: hit a car but was not graded as a collision`);
    }
    // Anything that collides must have been at or before the window, or the
    // engine has promised a window that is not actually safe.
    if (res.outcome === "collision" && p > safeAt + 1e-9) {
      mismatched++;
      fail(`${scn.id} press ${p}: collided AFTER the window opened at ${safeAt}`);
    }
  }
  collisions += crashes;
  perScenario.push({ id: scn.id, crashes, cleared, legalAt: safeAt });
}

console.log(`  ${runs} runs across ${SCENARIOS.length} scenarios`);
hung === 0 ? ok("every run terminated") : fail(`${hung} run(s) never terminated`);
threw === 0 ? ok("no run threw") : fail(`${threw} run(s) threw`);
mismatched === 0 ? ok("collisions always agree with the scorer and never happen after the window") : null;

console.log("\n  scenario         window   crashed  cleared");
for (const s of perScenario) {
  console.log(`  ${s.id.padEnd(16)} ${String(s.legalAt).padEnd(8)} ${String(s.crashes).padEnd(8)} ${s.cleared}`);
}
collisions > 0
  ? ok(`${collisions} of ${runs} runs ended in a collision — going early has teeth`)
  : fail("no press time anywhere caused a collision; nothing is at stake");

/* ---------- 2. never going ---------- */
console.log("\n2. NEVER PRESSING GO");
for (const scn of SCENARIOS) {
  const res = play(scn, null);
  if (res.outcome !== "missed") { fail(`${scn.id}: not pressing gave "${res.outcome}"`); }
}
ok("every scenario ends by itself if the player never goes");

/* ---------- 3. the daily, and every route leg ---------- */
console.log("\n3. TODAY'S DAILY AND EVERY ROUTE LEG");
{
  const daily = dailyScenario();
  if (!daily) fail("today's daily produced nothing");
  else {
    const sim = simulate(daily);
    const res = play(daily, safeAtFor(sim) + 0.2);
    res.outcome === "cleared"
      ? ok(`today's daily (${daily.id}, difficulty ${daily.difficulty}) plays through cleanly on its window`)
      : fail(`today's daily ends "${res.outcome}" when played on its own window`);
  }

  let legProblems = 0;
  for (const route of ROUTES) {
    const plan = planRoute(route, SCENARIOS);
    if (!plan.ok) { fail(`route ${route.id} will not plan`); legProblems++; continue; }
    for (const leg of plan.legs) {
      const sim = simulate(leg);
      const res = play(leg, safeAtFor(sim) + 0.2);
      if (res.outcome !== "cleared") {
        legProblems++;
        fail(`route ${route.id}, leg ${leg.id}: "${res.outcome}" when played on its window`);
      }
    }
  }
  if (legProblems === 0) ok(`every leg of all ${ROUTES.length} routes plays through on its window`);
}

/* ---------- 4. the window is the boundary ---------- */
console.log("\n4. THE WINDOW IS A REAL BOUNDARY");
{
  let safeOnWindow = 0, riskyBefore = 0, checked = 0;
  for (const scn of SCENARIOS) {
    const sim = simulate(scn);
    const safeAt = safeAtFor(sim);
    if (safeAt - scn.ego.arriveAt < 0.3) continue; // nothing to be early for
    checked++;
    if (play(scn, safeAt).outcome === "cleared") safeOnWindow++;
    // Going a full second early should at least sometimes end badly.
    if (play(scn, Math.max(0, safeAt - 1.0)).outcome === "collision") riskyBefore++;
  }
  safeOnWindow === checked
    ? ok(`all ${checked} scenarios that require a wait are safe exactly on the window`)
    : fail(`${checked - safeOnWindow} scenario(s) collide when departing exactly on the window`);
  console.log(`  going 1s early collides in ${riskyBefore} of ${checked} — the rest are yield breaches without contact`);
}

/* ---------- 5. cost of a frame ---------- */
console.log("\n5. FRAME COST");
{
  const scn = SCENARIOS.find((s) => s.layout === "roundabout") || SCENARIOS[0];
  const sim = simulate(scn);
  const ego = { ...sim.ego, departAt: 1 };
  const t0 = process.hrtime.bigint();
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const el = 1 + (i % 600) * 0.016;
    const mine = poseAt(ego, el);
    for (const a of sim.actors) conflicts(ego, mine, a, poseAt(a, el), 0, 0, 0, "crash");
  }
  const us = Number(process.hrtime.bigint() - t0) / 1000 / N;
  console.log(`  ${r2(us)}us per frame of collision work (${scn.id}, ${sim.actors.length} actors)`);
  us < 1000
    ? ok("comfortably inside a 16ms frame budget")
    : fail(`${r2(us)}us per frame is too slow for 60fps`);
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: playthrough verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
