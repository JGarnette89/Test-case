/* =====================================================================
   ROGUELIKE VERIFICATION
   Run:  node tools/verify-roguelike.mjs

   The trait system's whole promise is that it cannot touch safety: no
   trait may move legalAt/safeAt, change collision detection, or reach
   the generator's own audit. That is not something to assert in a
   comment and hope — it is checked here the same way everything else in
   this engine is: numerically, and by re-deriving rather than trusting
   the code that makes the claim.

   Six things, matching the plan:
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
     6. Insight — every consumable's own modifier shape is exactly what a
        trait could already produce, spending never drives the balance
        negative, and each of the four spends does what it claims.
   ===================================================================== */
import {
  TRAIT_CATALOG, emptyMods, applyTrait, draftFor, rng, CONSUMABLES,
  RARITIES, rarityOf, rarityRank,
} from "../src/engine/traits.js";
import {
  isCritical, startRun, recordSituation, applyDraft, drawForRun, chooseBranch,
  spendConsumable, INSIGHT_CACHE,
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
       head-up-display and rubber-stamp acoustic-glass without ever really
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
  const rushHour = applyTrait(emptyMods(), "traffic-routing");
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
    ? ok(`traffic-routing draws heavy traffic more often (${rushHeavy}/${samples} vs ${plainHeavy}/${samples} unbiased)`)
    : fail(`traffic-routing did not measurably shift toward heavy traffic (${rushHeavy}/${samples} vs ${plainHeavy}/${samples})`);

  const guardRun = { mods: applyTrait(emptyMods(), "school-zone-routing") };
  let guardPed = 0, plainPed = 0;
  for (let seed = 1; seed <= samples; seed++) {
    const r1 = drawForRun(guardRun, seed, []);
    const r2 = drawForRun(plainRun, seed + 200000, []);
    if (r1?.actors?.some((a) => a.kind === "ped")) guardPed++;
    if (r2?.actors?.some((a) => a.kind === "ped")) plainPed++;
  }
  guardPed > plainPed
    ? ok(`school-zone-routing draws a pedestrian more often (${guardPed}/${samples} vs ${plainPed}/${samples} unbiased)`)
    : fail(`school-zone-routing did not measurably shift toward pedestrians (${guardPed}/${samples} vs ${plainPed}/${samples})`);

  // Quick Study: proven against the run state machine's own milestone math.
  let quickRun = startRun(1);
  quickRun = applyDraft({ ...quickRun, pendingDraft: [{ id: "extended-warranty" }] }, "extended-warranty");
  quickRun.mods.draftEvery === 2
    ? ok("extended-warranty lowers the clean-clear gap between drafts (3 -> 2)")
    : fail(`extended-warranty should set draftEvery to 2, got ${quickRun.mods.draftEvery}`);
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

/* ---------- 6. Insight ---------- */
console.log("\n6. INSIGHT");
{
  // 6a. Every consumable's own modifier shape is exactly what a trait
  // could already produce — same keys, nothing smuggled in.
  const baseKeys = Object.keys(emptyMods()).sort().join(",");
  let badShape = 0;
  for (const c of CONSUMABLES) {
    const applied = c.apply(emptyMods());
    const keys = Object.keys(applied).sort().join(",");
    if (keys !== baseKeys) { badShape++; fail(`${c.id}: apply() produced a different key set than a trait would (${keys})`); }
  }
  badShape === 0 ? ok(`all ${CONSUMABLES.length} consumables produce a mods object with exactly a trait's own shape`) : null;

  // 6b. Earning: flat, plus restricted/pedestrian bonuses, only on a
  // clean clear, read off the scenario actually played.
  const legalAt = 2.0;
  const good = grade({ legalAt, pressedAt: legalAt + 0.1 });
  const late = grade({ legalAt, pressedAt: legalAt + 5 });
  let run = chooseBranch(startRun(1), "basics");
  const plain = recordSituation(run, good, null, { actors: [] });
  const restricted = recordSituation(run, good, null, { actors: [], sightBlockers: [{ id: "van" }] });
  const withPed = recordSituation(run, good, null, { actors: [{ kind: "ped" }] });
  const notClean = recordSituation(run, late, null, { actors: [] });
  if (plain.insight === 1 && restricted.insight === 3 && withPed.insight === 2 && notClean.insight === 0) {
    ok(`clean clears earn Insight (plain 1, +2 restricted, +1 pedestrian), a non-clean clear earns none`);
  } else {
    fail(`Insight earning wrong: plain=${plain.insight} restricted=${restricted.insight} ped=${withPed.insight} notClean=${notClean.insight}`);
  }

  // 6c. reveal-burst: folds in immediately, unaffordable is a no-op,
  // and it reverts the instant the next situation is graded.
  let richRun = { ...run, insight: 10 };
  let burstRun = spendConsumable(richRun, "reveal-burst");
  const burstApplied = burstRun.mods.revealHiddenOpacity === 1 && burstRun.mods.partialOpacity === 1 && burstRun.insight === 5;
  const afterGraded = recordSituation(burstRun, good, null, { actors: [] });
  const reverted = afterGraded.mods.revealHiddenOpacity === run.mods.revealHiddenOpacity
    && afterGraded.mods.partialOpacity === run.mods.partialOpacity
    && afterGraded.revealBurstPrior === null;
  burstApplied && reverted
    ? ok(`reveal-burst folds into mods for one situation and reverts once it is graded`)
    : fail(`reveal-burst applied=${burstApplied} reverted=${reverted}`);
  const poorRun = spendConsumable({ ...run, insight: 1 }, "reveal-burst");
  poorRun.insight === 1 && poorRun.revealBurstPrior === null
    ? ok("reveal-burst is a no-op without enough Insight")
    : fail("reveal-burst should refuse to spend below its cost");

  // 6d. early-draft: triggers a draft immediately, milestone or not.
  const earlyRun = spendConsumable({ ...run, insight: 10 }, "early-draft");
  Array.isArray(earlyRun.pendingDraft) && earlyRun.pendingDraft.length === 3 && earlyRun.insight === 4
    ? ok("early-draft triggers a 3-option draft on demand")
    : fail(`early-draft should have drafted immediately, got pendingDraft=${JSON.stringify(earlyRun.pendingDraft)}`);
  // Well-funded this time, so it is the pending-draft guard being
  // tested, not a second insufficient-funds refusal.
  const blockedEarly = spendConsumable({ ...earlyRun, insight: 20 }, "early-draft");
  blockedEarly.pendingDraft === earlyRun.pendingDraft && blockedEarly.insight === 20
    ? ok("early-draft refuses to stack a second draft on top of a pending one, even when affordable")
    : fail("early-draft should be a no-op while a draft is already pending");

  // 6e. The cache and reroll-branch, driven through a real second
  // roundabout (one stage cleared) — the only point the cache can appear.
  // 3 clean clears queues the stage's boss (pendingBoss set, still in the
  // stage); a 4th clear resolves that boss and is what actually reaches
  // the roundabout.
  let cacheRun = chooseBranch(startRun(2), "basics");
  for (let i = 0; i < 4; i++) cacheRun = recordSituation(cacheRun, good, null, { actors: [] });
  if (cacheRun.stage !== "roundabout" || cacheRun.clearedStages.length !== 1) {
    fail(`expected a second roundabout after clearing one stage, got stage=${cacheRun.stage} cleared=${cacheRun.clearedStages.length}`);
  } else {
    let sawCache = 0, sawDifferentAfterReroll = 0, tries = 30;
    for (let seed = 10; seed < 10 + tries; seed++) {
      // Rebuilt per seed: pendingBranch.options is derived from run.seed
      // at the moment the boss clears, so overriding .seed after the
      // fact on an already-computed run would not actually change it.
      let seeded = chooseBranch(startRun(seed), "basics");
      for (let i = 0; i < 4; i++) seeded = recordSituation(seeded, good, null, { actors: [] });
      const before = spendConsumable({ ...seeded, insight: 0 }, "reroll-branch"); // unaffordable: must be inert
      if (before.pendingBranch.options.join(",") !== seeded.pendingBranch.options.join(",")) {
        fail(`seed ${seed}: reroll-branch changed the offer without enough Insight`);
      }
      const rerolled = spendConsumable({ ...seeded, insight: 10 }, "reroll-branch");
      if (rerolled.pendingBranch.options.join(",") !== seeded.pendingBranch.options.join(",")) sawDifferentAfterReroll++;
      if (seeded.pendingBranch.options.includes(INSIGHT_CACHE.id)) sawCache++;
    }
    sawCache > 0 && sawCache < tries
      ? ok(`the cache appears at a second roundabout some of the time, not always or never (${sawCache}/${tries})`)
      : fail(`the cache should appear sometimes but not always at a second roundabout, saw ${sawCache}/${tries}`);
    sawDifferentAfterReroll > 0
      ? ok(`reroll-branch measurably changes what's on offer at least sometimes (${sawDifferentAfterReroll}/${tries})`)
      : fail("reroll-branch never changed the offered options across 30 seeds");

    // Taking the cache grants Insight, stays at the roundabout, and
    // removes itself — it does not advance the stage.
    const seeded = { ...cacheRun, seed: 10, branchRerollCount: 0, pendingBranch: { options: [...cacheRun.pendingBranch.options, INSIGHT_CACHE.id] } };
    const tookCache = chooseBranch(seeded, INSIGHT_CACHE.id);
    if (tookCache.stage === "roundabout" && tookCache.insight === seeded.insight + INSIGHT_CACHE.insightAward
      && !tookCache.pendingBranch.options.includes(INSIGHT_CACHE.id)) {
      ok(`taking the cache grants ${INSIGHT_CACHE.insightAward} Insight, stays at the roundabout, and removes itself from this stop`);
    } else {
      fail(`taking the cache behaved wrong: ${JSON.stringify({ stage: tookCache.stage, insight: tookCache.insight, options: tookCache.pendingBranch?.options })}`);
    }
    // A real stage choice still advances normally alongside the cache.
    const tookStage = chooseBranch(seeded, seeded.pendingBranch.options[0]);
    tookStage.stage === seeded.pendingBranch.options[0] && tookStage.pendingBranch === null
      ? ok("a real stage choice still advances the run even when a cache was also on offer")
      : fail("choosing a real stage alongside a cache option did not advance the run correctly");
  }

  // 6f. Never negative, across a long sequence of over-eager spending.
  let poorest = { ...run, insight: 2 };
  let negative = 0;
  for (let i = 0; i < 50; i++) {
    const id = CONSUMABLES[i % CONSUMABLES.length].id;
    poorest = spendConsumable(poorest, id);
    if (poorest.insight < 0) negative++;
  }
  negative === 0 ? ok("50 spend attempts against a near-empty balance never drive Insight negative") : fail(`Insight went negative ${negative} time(s)`);
}

/* ---------- 7. rarity ------------------------------------------------
   Rarity is presentation plus scarcity and nothing else, so there are
   exactly two things to prove: that no upgrade smuggled a stronger
   effect in behind a tier label the engine does not read, and that the
   tier is not decoration — a rare part has to actually turn up less
   often than a common one when the draft is run enough times. */
console.log("\n7. RARITY");
{
  let bad = 0;
  for (const t of TRAIT_CATALOG) {
    if (rarityRank(t.rarity) < 0) { bad++; fail(`${t.id}: rarity "${t.rarity}" is not a tier in RARITIES`); }
  }
  bad === 0 ? ok(`all ${TRAIT_CATALOG.length} upgrades carry a real rarity tier`) : null;

  /* No palette in the engine — rarity is named and weighted here, and
     painted by the renderer. Guards the same one-way rule section 5
     guards for compose.js. */
  const src = readFileSync(new URL("../src/engine/traits.js", import.meta.url), "utf8");
  // An import of the palette, or a literal colour anywhere. Prose may say
  // the word "theme" — the point is that no colour ever reaches this file.
  const importsTheme = /^\s*import[^\n]*["'][^"']*theme[^"']*["']/m.test(src);
  const hasColour = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/.test(src);
  importsTheme || hasColour
    ? fail(`traits.js has picked up ${importsTheme ? "a theme import" : "a literal colour"} — rarity is painted by the renderer`)
    : ok("traits.js names and weights rarity but never colours it");

  /* Scarcity, measured over many independent drafts from an empty run.
     Counting appearances-on-offer rather than picks, since what rarity
     governs is what you are SHOWN. */
  const seen = Object.fromEntries(RARITIES.map((r) => [r.id, 0]));
  const RUNS = 4000;
  for (let s = 1; s <= RUNS; s++) for (const t of draftFor(rng(s), [], 3)) seen[t.rarity]++;
  const perEntry = {};
  for (const r of RARITIES) {
    const n = TRAIT_CATALOG.filter((t) => t.rarity === r.id).length;
    perEntry[r.id] = n ? seen[r.id] / n : null;   // per-entry, so tier size does not confound it
  }
  const tiers = RARITIES.filter((r) => perEntry[r.id] !== null);
  let monotone = true;
  for (let i = 1; i < tiers.length; i++) {
    if (!(perEntry[tiers[i].id] < perEntry[tiers[i - 1].id])) {
      monotone = false;
      fail(`${tiers[i].id} is offered as often as ${tiers[i - 1].id} (${perEntry[tiers[i].id].toFixed(0)} vs ${perEntry[tiers[i - 1].id].toFixed(0)} per entry) — the tier is decoration`);
    }
  }
  if (monotone) ok(`rarer is scarcer, per entry across ${RUNS} drafts: ${tiers.map((r) => `${r.id} ${perEntry[r.id].toFixed(0)}`).join(", ")}`);

  /* Scarce, but reachable: a tier nobody ever sees is content that does
     not exist. */
  const rarest = RARITIES[RARITIES.length - 1].id;
  seen[rarest] > 0
    ? ok(`the rarest tier is still reachable (${seen[rarest]} offers in ${RUNS} drafts)`)
    : fail(`no ${rarest} upgrade was offered once in ${RUNS} drafts`);

  /* Weighting must not have cost the draft its two structural promises. */
  let dupes = 0, short = 0;
  for (let s = 1; s <= 400; s++) {
    const picks = draftFor(rng(s * 7), [], 3);
    if (new Set(picks.map((p) => p.id)).size !== picks.length) dupes++;
    if (picks.length !== 3) short++;
  }
  dupes === 0 && short === 0
    ? ok("400 weighted drafts each offered 3 distinct upgrades")
    : fail(`${dupes} draft(s) repeated an upgrade, ${short} returned the wrong count`);

  const a = draftFor(rng(99), [], 3).map((t) => t.id).join(",");
  const b = draftFor(rng(99), [], 3).map((t) => t.id).join(",");
  a === b ? ok("a weighted draft is still deterministic for a given seed") : fail(`same seed gave different offers: ${a} vs ${b}`);

  const exhausted = draftFor(rng(5), TRAIT_CATALOG.map((t) => t.id), 3);
  exhausted.length === 0 ? ok("an exhausted catalog offers nothing rather than looping") : fail(`exhausted catalog returned ${exhausted.length}`);
}

console.log("\n" + "=".repeat(66));
console.log(problems === 0 ? "OK: roguelike verified." : `${problems} PROBLEM(S) FOUND.`);
process.exit(problems === 0 ? 0 : 1);
