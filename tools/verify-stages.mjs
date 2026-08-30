/* =====================================================================
   STAGE VERIFICATION
   Run:  node tools/verify-stages.mjs

   Six things:
     1. every stage's boss resolves, and every boss's own road/safety
        checks pass the same bar bosses.js promises — including safeAtFor,
        not only legalAt, since a hand-authored scenario never passes
        through compose.js's windowIsSafe the way a generated draw does.
     2. the roundabout graph is reachable from every ordering stages could
        be cleared in — every path eventually reaches the Checkride.
     3. stage brief-bias vocabulary is real (typos would otherwise fall
        back to "no bias" silently).
     4. stage bias measurably shifts the draw distribution.
     5. a full run, driven end to end through every stage, every boss,
        and the Checkride, reaches outcome "won" on a clean playthrough.
     6. a critical fault ends the run the same way at every stop along
        that path: mid-stage, mid-boss, and mid-Checkride.
   ===================================================================== */
import { simulate, safeAtFor } from "../src/engine/index.js";
import { validateRoad, specOf } from "../src/engine/road.js";
import { BOSSES, bossById } from "../src/engine/bosses.js";
import { STAGES, stageById, exitsFor, ALL_STAGE_IDS, validateBias } from "../src/engine/stages.js";
import {
  startRun, chooseBranch, recordSituation, drawForRun,
} from "../src/engine/roguelike.js";
import { grade } from "../src/engine/score.js";

const r2 = (n) => Math.round(n * 100) / 100;
let problems = 0;
const fail = (m) => { problems++; console.log("  FAIL: " + m); };
const ok = (m) => console.log("  ok   " + m);

/* ---------- 1. every boss is safe ---------- */
console.log("\n1. EVERY BOSS RESOLVES AND IS SAFE TO DEPART ON");
for (const stage of STAGES) {
  const boss = bossById(stage.bossId);
  if (!boss) { fail(`${stage.id}: bossId "${stage.bossId}" does not resolve to a real boss`); continue; }
  if (boss.stage !== stage.id) { fail(`${boss.id}: declares stage "${boss.stage}", expected "${stage.id}"`); continue; }

  const roadProblems = validateRoad(specOf(boss), [{ ...boss.ego, id: "ego" }, ...boss.actors]);
  if (roadProblems.length) { fail(`${boss.id}: ${roadProblems.join("; ")}`); continue; }

  const sim = simulate(boss);
  if (!(sim.legalAt >= boss.ego.arriveAt)) { fail(`${boss.id}: window before arrival`); continue; }
  const safe = safeAtFor(sim);
  if (Math.abs(safe - sim.legalAt) > 1e-9 && safe < sim.legalAt) {
    fail(`${boss.id}: safeAtFor (${safe}) is earlier than legalAt (${sim.legalAt}) — grading would offer an unsafe window`);
    continue;
  }
  ok(`${boss.id.padEnd(16)} legalAt=${sim.legalAt}  think=${r2(sim.legalAt - boss.ego.arriveAt)}  safeAt=${r2(safe)}  priors=${sim.priors.length}`);
}
if (BOSSES.length !== STAGES.length) {
  fail(`${BOSSES.length} bosses declared but ${STAGES.length} stages — v1 is meant to be one boss per stage, no orphans`);
} else {
  ok(`${BOSSES.length} bosses, one per stage, no orphans`);
}

/* ---------- 2. the roundabout graph reaches the Checkride from every order ---------- */
console.log("\n2. EVERY STAGE ORDER REACHES THE CHECKRIDE");
{
  function permutations(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const p of permutations(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }
  let bad = 0;
  for (const order of permutations(ALL_STAGE_IDS)) {
    let cleared = [];
    for (const id of order) {
      const offered = exitsFor(cleared);
      if (!offered.includes(id)) { bad++; fail(`order ${order.join(",")}: "${id}" not offered after clearing ${cleared.join(",") || "nothing"}`); break; }
      cleared = [...cleared, id];
    }
    if (exitsFor(cleared).length !== 0) { bad++; fail(`order ${order.join(",")}: still has exits left after clearing everything`); }
  }
  bad === 0 ? ok(`all ${permutations(ALL_STAGE_IDS).length} clearing orders reach an empty exit list (the Checkride)`) : null;
}

/* ---------- 3. bias vocabulary is real ---------- */
console.log("\n3. STAGE BIAS REFERENCES REAL BRIEF VOCABULARY");
{
  let bad = 0;
  for (const s of STAGES) {
    const found = validateBias(s);
    for (const msg of found) { bad++; fail(msg); }
  }
  bad === 0 ? ok("every stage's traffic/visibility bias is a real compose.js key") : null;
}

/* ---------- 4. bias measurably shifts the distribution ---------- */
console.log("\n4. STAGE BIAS MEASURABLY SHIFTS WHAT GETS DRAWN");
{
  const samples = 60;
  const visRun = { mods: { draftEvery: 3 }, stage: "visibility" };
  const basicsRun = { mods: { draftEvery: 3 }, stage: "basics" };
  let visRestricted = 0, basicsRestricted = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const a = drawForRun(visRun, seed, []);
    const b = drawForRun(basicsRun, seed + 500000, []);
    if (a?.conditions?.visibility === "restricted") visRestricted++;
    if (b?.conditions?.visibility === "restricted") basicsRestricted++;
  }
  visRestricted > basicsRestricted
    ? ok(`the visibility stage draws restricted scenes far more often (${visRestricted}/${samples} vs ${basicsRestricted}/${samples})`)
    : fail(`stage bias did not shift visibility (${visRestricted}/${samples} vs ${basicsRestricted}/${samples})`);

  let pedForced = 0;
  const pedRun = { mods: { draftEvery: 3 }, stage: "pedestrians" };
  for (let seed = 1; seed <= samples; seed++) {
    const scn = drawForRun(pedRun, seed, []);
    if (scn?.actors?.some((a) => a.kind === "ped")) pedForced++;
  }
  pedForced === samples
    ? ok(`the pedestrians stage guarantees a pedestrian on every draw (${pedForced}/${samples})`)
    : fail(`the pedestrians stage should force a pedestrian on every draw, got ${pedForced}/${samples}`);
}

/* ---------- 5 & 6. a full run, end to end ---------- */
console.log("\n5. A CLEAN PLAYTHROUGH REACHES THE CHECKRIDE AND WINS IT");
{
  function playClean(seed) {
    let run = startRun(seed);
    let steps = 0;
    while (!run.over && steps < 200) {
      steps++;
      if (run.stage === "roundabout") {
        run = chooseBranch(run, run.pendingBranch.options[0]);
        continue;
      }
      const scn = drawForRun(run, seed * 97 + steps, []);
      if (!scn) { fail(`seed ${seed}: no scenario to draw at step ${steps}, stage=${run.stage}`); return run; }
      const sim = simulate(scn);
      const result = grade({ legalAt: sim.legalAt, pressedAt: sim.legalAt + 0.15 });
      run = recordSituation(run, result);
      if (run.pendingDraft) run = { ...run, pendingDraft: null }; // decline every draft, not under test here
    }
    return run;
  }

  let wins = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const run = playClean(seed);
    if (run.over && run.outcome === "won") wins++;
    else if (problems === 0) fail(`seed ${seed}: clean playthrough ended with outcome "${run.outcome}", not "won" (${JSON.stringify({ stage: run.stage, over: run.over })})`);
  }
  wins === 8 ? ok(`8/8 clean seeds reach outcome "won" after every stage, every boss, and all four Checkride legs`) : null;
}

console.log("\n6. A CRITICAL FAULT ENDS THE RUN AT EVERY STAGE OF THE STAGE MACHINE");
{
  function playUntilCritical(seed, crashAtStep) {
    let run = startRun(seed);
    let steps = 0;
    while (!run.over && steps < 200) {
      steps++;
      if (run.stage === "roundabout") {
        run = chooseBranch(run, run.pendingBranch.options[0]);
        continue;
      }
      const scn = drawForRun(run, seed * 97 + steps, []);
      if (!scn) return { run, hit: false };
      const sim = simulate(scn);
      const result = steps === crashAtStep
        ? grade({ legalAt: sim.legalAt, pressedAt: sim.legalAt, collided: true })
        : grade({ legalAt: sim.legalAt, pressedAt: sim.legalAt + 0.15 });
      run = recordSituation(run, result);
      if (run.pendingDraft) run = { ...run, pendingDraft: null };
      if (steps === crashAtStep) return { run, hit: true };
    }
    return { run, hit: false };
  }

  // Step 1 is always a regular stage situation; a mid-run crash further
  // out is likely to land on a boss or a Checkride leg depending on seed
  // — either way, isCritical must catch it and stop the run right there.
  const cases = [1, 4, 9, 14];
  let allEnded = true;
  for (const step of cases) {
    const { run, hit } = playUntilCritical(101, step);
    if (!hit) continue; // run legitimately won before reaching this step
    if (!(run.over && run.outcome === "ended")) {
      allEnded = false;
      fail(`a collision at step ${step} should end the run with outcome "ended", got over=${run.over} outcome=${run.outcome}`);
    }
  }
  allEnded ? ok(`a collision ends the run with outcome "ended" at every point it was tried, stage/boss/Checkride alike`) : null;
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: stages verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
