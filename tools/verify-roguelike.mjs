/* =====================================================================
   ROGUELIKE VERIFICATION
   Run:  node tools/verify-roguelike.mjs

   The trait system's whole promise is that it cannot touch safety: no
   trait may move legalAt/safeAt, change collision detection, or reach
   the generator's own audit. That is not something to assert in a
   comment and hope — it is checked here the same way everything else in
   this engine is: numerically, and by re-deriving rather than trusting
   the code that makes the claim.

   Five things, matching the plan:
     1. drafts are valid — no repeat offers, no duplicate options, and
        reproducible from (seed, milestone).
     2. every critical-tier fault this game defines ends a run, and
        nothing else does — an exhaustive table, not a sample.
     3. every trait in the catalog measurably does something.
     4. the safety wall holds under the heaviest trait combination,
        swept across many seeds, checked against an independent
        re-derivation of windowIsSafe.
     5. the dependency only ever runs one way: compose.js and
        generate.js never import this system.
   ===================================================================== */
import {
  TRAIT_CATALOG, emptyMods, applyTrait, draftFor, rng,
} from "../src/engine/traits.js";
import {
  isCritical, startRun, recordSituation, applyDraft, drawForRun, chooseBranch,
} from "../src/engine/roguelike.js";
import { grade } from "../src/engine/score.js";
import { FAULT } from "../src/engine/actions.js";
import { simulate, poseAt, conflicts, spanOf, STEP } from "../src/engine/index.js";
import { readFileSync } from "node:fs";

let problems = 0;
const fail = (m) => { problems++; console.log("  FAIL: " + m); };
const ok = (m) => console.log("  ok   " + m);

/* ---------- 1. drafts are valid ---------- */
console.log("\n1. DRAFTS ARE VALID");
{
  let dupWithinDraft = 0, repeatOffer = 0, nondeterministic = 0;
  const active = [];
  for (let i = 0; i < TRAIT_CATALOG.length; i++) {
    // Simulate drafting one trait at a time, checking each draft along
    // the way never re-offers what is already active.
    const r = rng(1000 + i);
    const draft = draftFor(r, active, 3);
    const ids = draft.map((t) => t.id);
    if (new Set(ids).size !== ids.length) dupWithinDraft++;
    if (ids.some((id) => active.includes(id))) repeatOffer++;
    if (draft.length) active.push(draft[0].id);
  }
  dupWithinDraft === 0 ? ok("no draft ever offers the same trait twice") : fail(`${dupWithinDraft} draft(s) had a duplicate option`);
  repeatOffer === 0 ? ok("no draft ever re-offers an already-active trait") : fail(`${repeatOffer} draft(s) re-offered an active trait`);

  for (let seed = 1; seed <= 20; seed++) {
    const a = draftFor(rng(seed), [], 3).map((t) => t.id).join(",");
    const b = draftFor(rng(seed), [], 3).map((t) => t.id).join(",");
    if (a !== b) nondeterministic++;
  }
  nondeterministic === 0
    ? ok("the same (seed, active set) always drafts the same three")
    : fail(`${nondeterministic} seed(s) drafted differently on repeat`);

  const exhausted = draftFor(rng(1), TRAIT_CATALOG.map((t) => t.id), 3);
  exhausted.length === 0
    ? ok("drafting with the whole catalog already active returns nothing, not a crash")
    : fail("draftFor returned traits that were supposedly all already active");
}

/* ---------- 2. the criticality table is exhaustive ---------- */
console.log("\n2. A CRITICAL FAULT ENDS THE RUN — EXHAUSTIVELY, NOT BY SAMPLE");
{
  const legalAt = 2.0;
  const cases = [
    { label: "collision", result: grade({ legalAt, pressedAt: legalAt + 0.5, collided: true }), sheet: null, critical: true },
    { label: "early (failure to yield)", result: grade({ legalAt, pressedAt: legalAt - 1.0 }), sheet: null, critical: true },
    { label: "good", result: grade({ legalAt, pressedAt: legalAt + 0.1 }), sheet: null, critical: false },
    { label: "late", result: grade({ legalAt, pressedAt: legalAt + 5 }), sheet: null, critical: false },
    { label: "missed", result: grade({ legalAt, pressedAt: null }), sheet: null, critical: false },
  ];
  for (const [id, f] of Object.entries(FAULT)) {
    const sheet = { criticalCount: f.tier === "critical" ? 1 : 0, faults: [f] };
    cases.push({ label: `sheet with ${id} (${f.tier})`, result: grade({ legalAt, pressedAt: legalAt + 0.1 }), sheet, critical: f.tier === "critical" });
  }
  let wrong = 0;
  for (const c of cases) {
    const got = isCritical(c.result, c.sheet);
    if (got !== c.critical) { wrong++; fail(`${c.label}: isCritical returned ${got}, expected ${c.critical}`); }
  }
  wrong === 0 ? ok(`all ${cases.length} verdict/fault combinations classified correctly`) : null;

  // And the state transition itself: a critical result ends the run;
  // a non-critical one keeps it going and updates the tally. A fresh run
  // starts at the roundabout, so a stage has to be chosen before any
  // situation can be recorded against it — the roundabout/boss/Checkride
  // state machine itself is covered separately in verify-stages.mjs.
  let run = startRun(1);
  run = chooseBranch(run, "basics");
  run = recordSituation(run, grade({ legalAt, pressedAt: legalAt + 0.1 }));
  (!run.over && run.tally.played === 1) ? ok("a clean result keeps the run alive and tallies it") : fail("a clean result should not end the run");
  run = recordSituation(run, grade({ legalAt, pressedAt: legalAt + 5 }));
  !run.over ? ok("a late result keeps the run alive too — undue delay is not critical") : fail("late wrongly ended the run");
  run = recordSituation(run, grade({ legalAt, pressedAt: legalAt, collided: true }));
  run.over && run.outcome === "ended" ? ok("a collision ends the run") : fail("a collision did not end the run");
  const after = recordSituation(run, grade({ legalAt, pressedAt: legalAt + 0.1 }));
  after === run ? ok("recording after the run is over is a no-op") : fail("recordSituation kept mutating an ended run");
}

/* ---------- 3. every trait measurably does something ---------- */
console.log("\n3. EVERY TRAIT MEASURABLY MATTERS");
{
  const base = emptyMods();
  let dead = 0;
  for (const t of TRAIT_CATALOG) {
    const withIt = t.apply(base);
    const changed = JSON.stringify(withIt) !== JSON.stringify(base);
    if (!changed) { dead++; fail(`${t.id}: applying it produces an identical mods object — it does nothing`); continue; }

    /* Scoring traits: prove the curve actually moved, not just the
       number — and probed at the point that trait actually governs.
       reactionFloor only bites near the default floor (0.45s); grace
       only bites near the default grace boundary (2.7s, "late" under
       the old 2.6s ceiling). One fixed probe point would pass
       steady-hands and rubber-stamp extra-beat without ever really
       testing it — caught for real building this check. */
    if (t.category === "scoring") {
      const legalAt = 2.0;
      const probes = [0.45, 2.7];
      let improved = false, worsened = false;
      const detail = [];
      for (const reactionTime of probes) {
        const before = grade({ legalAt, pressedAt: legalAt + reactionTime, reactionFloor: base.reactionFloor, grace: base.grace });
        const after = grade({ legalAt, pressedAt: legalAt + reactionTime, reactionFloor: withIt.reactionFloor, grace: withIt.grace });
        if (after.score > before.score) improved = true;
        if (after.score < before.score) worsened = true;
        detail.push(`${reactionTime}s: ${before.score}->${after.score}`);
      }
      if (worsened) fail(`${t.id}: score got WORSE at some probe point (${detail.join(", ")}) — a trait must only help`);
      else if (improved) ok(`${t.id}: measurably raises the score (${detail.join(", ")})`);
      else fail(`${t.id}: no probe point showed any improvement (${detail.join(", ")}) — pick a probe that actually exercises it`);
    } else {
      ok(`${t.id}: applying it changes the run's modifiers`);
    }
  }
  dead === 0 ? null : fail(`${dead} trait(s) had no measurable effect`);

  // Generation-bias traits, checked against real composition: a biased
  // draw should shift the measured distribution, not just set a flag.
  const rushHour = applyTrait(emptyMods(), "rush-hour");
  const rushRun = { mods: rushHour };
  const plainRun = { mods: emptyMods() };
  let rushHeavy = 0, plainHeavy = 0, samples = 60;
  for (let seed = 1; seed <= samples; seed++) {
    const r1 = drawForRun(rushRun, seed, []);
    const r2 = drawForRun(plainRun, seed + 100000, []);
    if (r1?.conditions?.traffic === "heavy") rushHeavy++;
    if (r2?.conditions?.traffic === "heavy") plainHeavy++;
  }
  rushHeavy > plainHeavy
    ? ok(`rush-hour draws heavy traffic more often (${rushHeavy}/${samples} vs ${plainHeavy}/${samples} unbiased)`)
    : fail(`rush-hour did not measurably shift toward heavy traffic (${rushHeavy}/${samples} vs ${plainHeavy}/${samples})`);

  const guardRun = { mods: applyTrait(emptyMods(), "crossing-guard") };
  let guardPed = 0, plainPed = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const r1 = drawForRun(guardRun, seed, []);
    const r2 = drawForRun(plainRun, seed + 200000, []);
    if (r1?.actors?.some((a) => a.kind === "ped")) guardPed++;
    if (r2?.actors?.some((a) => a.kind === "ped")) plainPed++;
  }
  guardPed > plainPed
    ? ok(`crossing-guard draws a pedestrian more often (${guardPed}/${samples} vs ${plainPed}/${samples} unbiased)`)
    : fail(`crossing-guard did not measurably shift toward pedestrians (${guardPed}/${samples} vs ${plainPed}/${samples})`);

  // Quick Study: proven against the run state machine's own milestone math.
  let quickRun = startRun(1);
  quickRun = applyDraft({ ...quickRun, pendingDraft: [{ id: "quick-study" }] }, "quick-study");
  quickRun.mods.draftEvery === 2
    ? ok("quick-study lowers the clean-clear gap between drafts (3 -> 2)")
    : fail(`quick-study should set draftEvery to 2, got ${quickRun.mods.draftEvery}`);
}

/* ---------- 4. the safety wall holds under the heaviest trait combo --
   Every draw returned to a run, however biased, must still be a
   scenario that is genuinely safe to depart on — re-derived here
   independently rather than trusting composeScenario's own internal
   windowIsSafe call, the same "independent re-derivation" standard the
   rest of this suite holds new engine logic to. */
console.log("\n4. THE SAFETY WALL HOLDS UNDER THE HEAVIEST TRAIT COMBINATION");
{
  let mods = emptyMods();
  for (const t of TRAIT_CATALOG) mods = t.apply(mods);
  const heavyRun = { mods };

  function collidesAt(sim, depart) {
    const ego = { ...sim.ego, departAt: depart };
    for (let t = depart; t <= depart + spanOf(ego) + 0.35; t += STEP) {
      const mine = poseAt(ego, t);
      if (mine.gone) break;
      for (const a of sim.actors) {
        const theirs = poseAt(a, t);
        if (theirs.gone || theirs.hidden) continue;
        if (conflicts(ego, mine, a, theirs, 0, 0, 0, "crash")) return true;
      }
    }
    return false;
  }

  let checked = 0, unsafe = 0, empty = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const scn = drawForRun(heavyRun, seed, []);
    if (!scn) { empty++; continue; }
    checked++;
    const sim = simulate(scn);
    if (!(sim.legalAt >= scn.ego.arriveAt)) { unsafe++; fail(`seed ${seed}: window before arrival`); continue; }
    if (collidesAt(sim, sim.legalAt)) { unsafe++; fail(`seed ${seed}: departing on the derived window collides`); }
  }
  empty === 0 ? ok(`every seed produced a scenario (0 of ${checked + empty} empty)`) : fail(`${empty} seed(s) produced nothing at all`);
  unsafe === 0
    ? ok(`all ${checked} biased draws are independently confirmed safe to depart on`)
    : null;
}

/* ---------- 5. the dependency only ever runs one way ---------- */
console.log("\n5. COMPOSE.JS AND GENERATE.JS NEVER IMPORT THE TRAIT SYSTEM");
{
  const guarded = ["../src/engine/compose.js", "../src/engine/generate.js"];
  let leaked = 0;
  for (const path of guarded) {
    const src = readFileSync(new URL(path, import.meta.url), "utf8");
    if (/roguelike\.js|traits\.js/.test(src)) {
      leaked++;
      fail(`${path} references the trait system — the dependency is supposed to run only the other way`);
    }
  }
  leaked === 0
    ? ok("compose.js and generate.js carry no reference to roguelike.js or traits.js")
    : null;
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: roguelike verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
