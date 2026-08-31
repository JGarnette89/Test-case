/* =====================================================================
   ROGUELIKE RUN
   A run of Endless situations with drafted traits and a real ending —
   mirrors route.js's startRun/recordLeg/summary shape deliberately, but
   is not an extension of it: a route has a fixed plan of legs, a run
   has no plan at all, and what counts as fatal is broader here than
   route.js's own DEFAULT_END_ON (see isCritical below).

   Restructured around a driving-test framing: the run moves through
   named STAGES (stages.js), each capped by a hand-authored BOSS
   (bosses.js), with a roundabout branch screen between them standing in
   for a level-select map. Clearing every stage hands the run off to a
   multi-leg "Checkride" finale built from route.js's own rotation and
   continuity machinery, reusing already-proven scenarios rather than
   authoring new ones. Winning the Checkride is the run's one win state;
   any critical fault anywhere — a regular situation, a boss, or a
   Checkride leg — is still the same loss it always was.

   One-way dependency, checked by tools/verify-roguelike.mjs: this file
   and traits.js may import from compose.js's exported vocabulary, but
   compose.js and generate.js never import from here. A trait can lean
   the generator toward a kind of situation; it can never reach into how
   the generator decides a draw is safe.
   ===================================================================== */
import { emptyMods, applyTrait, draftFor, rng, CONSUMABLES, consumableById } from "./traits.js";
import { emptyTally, tally } from "./score.js";
import { ENDLESS_BRIEFS, composeScenario, signatureOf } from "./compose.js";
import { STAGES, stageById, exitsFor, ALL_STAGE_IDS, INSIGHT_CACHE } from "./stages.js";
import { BOSSES, bossById } from "./bosses.js";
import { planRoute, currentLeg as routeCurrentLeg } from "./route.js";
import { routeById } from "./routes.js";
import { SCENARIOS } from "./scenarios.js";

/* Every critical-tier fault this game defines, not just a literal
   collision: a single-press scenario reports through grade()'s verdict
   (collision or early — going before the road was legally yours is a
   failure to yield, and that is critical on a road test same as a
   crash); a multi-action manoeuvre additionally reports through
   gradeTask()'s sheet (encroach, blocked-box). route.js's own
   DEFAULT_END_ON only ever checks the first of these — copying it here
   uninspected would silently let a run survive a failure to yield, and
   the Checkride's own legs deliberately reuse this same function rather
   than route.js's recordLeg, for exactly that reason (see
   recordCheckrideLeg below — one of its four legs, "unprotected", is a
   manoeuvre, and route.js's default would miss a failure there). */
export function isCritical(result, sheet) {
  if (!result) return false;
  if (result.verdict === "collision" || result.verdict === "early") return true;
  return Boolean(sheet && sheet.criticalCount > 0);
}

function startCheckride() {
  const plan = planRoute(routeById("checkride"), SCENARIOS);
  return { plan, index: 0, results: [] };
}

export function startRun(seed) {
  return {
    seed,
    situationsCleared: 0,
    traits: [],
    mods: emptyMods(),
    tally: emptyTally,
    over: false,
    outcome: null,       // null | "ended" | "won"
    pendingDraft: null,  // null | trait[]
    draftCount: 0,       // how many drafts offered so far — the milestone clock

    stage: "roundabout",     // stage id | "roundabout" | "checkride"
    clearedStages: [],
    stageProgress: 0,        // clean clears in the current stage toward its boss
    pendingBoss: null,       // null | bossId — the next draw is the boss, not a regular one
    pendingBranch: { options: ALL_STAGE_IDS }, // the roundabout's exits, when stage === "roundabout"
    checkrideRun: null,      // { plan, index, results } once stage === "checkride"

    insight: 0,              // spendable resource — see CONSUMABLES in traits.js
    branchRerollCount: 0,    // feeds the cache's seeded appearance — see branchOptionsFor
    revealBurstPrior: null,  // { revealHiddenOpacity, partialOpacity } while a one-shot burst is active, else null
  };
}

/* The Insight Cache doesn't show up at the very first roundabout — with
   nothing cleared yet there is nothing to protect a reroll against, per
   the plan. After that it is a seeded maybe, not a certainty: rerolling
   would otherwise have nothing to actually change, since the stage exits
   themselves are always every stage still uncleared, never a subset. */
const CACHE_CHANCE = 0.6;
function branchOptionsFor(clearedStages, remaining, seed, rerollCount) {
  if (clearedStages.length === 0 || !remaining.length) return remaining;
  const r = rng((seed * 2654435761 + clearedStages.length * 97 + rerollCount * 131) >>> 0);
  return r() < CACHE_CHANCE ? [...remaining, INSIGHT_CACHE.id] : remaining;
}

/* Picking an exit at a roundabout screen. Silently a no-op on a stale or
   unknown choice — the caller only ever offers what pendingBranch.options
   actually lists, so this is a defensive floor, not a real path. The
   cache is not a stage: taking it grants Insight and removes itself from
   this stop's options (a real stage still has to be picked next), rather
   than advancing the run — it reappears, maybe, at the next roundabout. */
export function chooseBranch(run, choice) {
  if (!run.pendingBranch || !run.pendingBranch.options.includes(choice)) return run;
  if (choice === INSIGHT_CACHE.id) {
    const options = run.pendingBranch.options.filter((o) => o !== INSIGHT_CACHE.id);
    return { ...run, insight: run.insight + INSIGHT_CACHE.insightAward, pendingBranch: { options } };
  }
  return { ...run, stage: choice, pendingBranch: null, stageProgress: 0, pendingBoss: null };
}

/* What a clean clear is worth: a flat amount, plus a bonus for the
   harder categories — restricted visibility, a pedestrian in play — read
   straight off the scenario that was actually played rather than any
   label attached at generation time, so it works identically for a
   composed situation, a hand-authored boss, or a Checkride leg. Reveal
   traits add their own bonus on top via mods.insightBonus. */
const INSIGHT_PER_CLEAR = 1;
const INSIGHT_RESTRICTED_BONUS = 2;
const INSIGHT_PEDESTRIAN_BONUS = 1;
function insightFrom(scn, mods, clean) {
  if (!clean) return 0;
  let n = INSIGHT_PER_CLEAR + (mods.insightBonus || 0);
  if (scn?.sightBlockers?.length) n += INSIGHT_RESTRICTED_BONUS;
  if (scn?.actors?.some((a) => a.kind === "ped")) n += INSIGHT_PEDESTRIAN_BONUS;
  return n;
}

/* A reveal burst is scoped to exactly one played situation. Reverting it
   here, unconditionally and before anything else, means it applies to
   whatever situation was actually drawn when it was bought — including
   across a peek-reroll spent afterward — and is gone the instant that
   situation is graded, win or lose. */
function revertBurst(run) {
  if (!run.revealBurstPrior) return run;
  return { ...run, mods: { ...run.mods, ...run.revealBurstPrior }, revealBurstPrior: null };
}

export function recordSituation(run, result, sheet = null, scn = null) {
  if (run.over) return run;
  run = revertBurst(run);
  if (run.stage === "checkride") return recordCheckrideLeg(run, result, sheet, scn);
  if (isCritical(result, sheet)) return { ...run, over: true, outcome: "ended" };

  const clean = result.verdict === "good";
  const nextTally = tally(run.tally, result);
  const insight = run.insight + insightFrom(scn, run.mods, clean);

  /* A boss was just cleared: the stage is done. Either hand off to a
     fresh roundabout with whatever stages remain, or — once every stage
     is cleared — straight into the Checkride. No roundabout in between:
     the map's whole job is choosing which stage comes next, and once
     none do there is nothing left to choose. */
  if (run.pendingBoss) {
    const clearedStages = [...run.clearedStages, run.stage];
    const situationsCleared = run.situationsCleared + (clean ? 1 : 0);
    const remaining = exitsFor(clearedStages);
    const base = { ...run, situationsCleared, tally: nextTally, insight, clearedStages, pendingBoss: null, stageProgress: 0 };
    if (remaining.length === 0) {
      return { ...base, stage: "checkride", checkrideRun: startCheckride() };
    }
    const options = branchOptionsFor(clearedStages, remaining, run.seed, run.branchRerollCount);
    return { ...base, stage: "roundabout", pendingBranch: { options } };
  }

  const situationsCleared = run.situationsCleared + (clean ? 1 : 0);
  const stageProgress = run.stageProgress + (clean ? 1 : 0);
  const stage = stageById(run.stage);
  const bossDue = clean && stageProgress >= stage.situationsToBoss;

  const dueClears = (run.draftCount + 1) * run.mods.draftEvery;
  const draftDue = clean && run.pendingDraft == null && situationsCleared >= dueClears;
  let pendingDraft = run.pendingDraft;
  let draftCount = run.draftCount;
  if (draftDue) {
    const r = rng((run.seed * 2654435761 + draftCount * 40503) >>> 0);
    pendingDraft = draftFor(r, run.traits, 3);
    draftCount += 1;
  }

  return {
    ...run, situationsCleared, stageProgress, tally: nextTally, insight, pendingDraft, draftCount,
    pendingBoss: bossDue ? stage.bossId : null,
  };
}

/* The Checkride's own leg-by-leg grading. Deliberately does not call
   route.js's recordLeg: that function's fatal check is route.js's own
   DEFAULT_END_ON, which only ever looks at result.verdict === "collision"
   — exactly the gap isCritical exists to close for the rest of this
   module, and the Checkride is the one place in this file that plays a
   manoeuvre-graded leg ("unprotected"), where a real critical fault
   (encroachment, blocked box) would never surface as a verdict string at
   all. planRoute/currentLeg are still reused for what they are actually
   good at — resolving each leg's rotation so it is entered from the
   correct side of the previous one. */
function recordCheckrideLeg(run, result, sheet, scn) {
  const cr = run.checkrideRun;
  const fatal = isCritical(result, sheet);
  const nextIndex = cr.index + 1;
  const exhausted = nextIndex >= cr.plan.legs.length;
  const checkrideRun = { ...cr, results: [...cr.results, result], index: fatal ? cr.index : nextIndex };
  const clean = result.verdict === "good";
  const situationsCleared = run.situationsCleared + (clean ? 1 : 0);
  const nextTally = tally(run.tally, result);
  const insight = run.insight + insightFrom(scn, run.mods, clean);
  const base = { ...run, checkrideRun, situationsCleared, tally: nextTally, insight };

  if (fatal) return { ...base, over: true, outcome: "ended" };
  if (exhausted) return { ...base, over: true, outcome: "won" };
  return base;
}

/* ---------------------------------------------------------------------
   Spending Insight
   Every consumable is a no-op if unaffordable or inapplicable right now
   — the same defensive-floor shape as chooseBranch/applyDraft, so the UI
   only has to decide when to disable a button, never guard correctness.
   reveal-burst folds straight into run.mods (revertBurst above unwinds
   it); the other three are pure state actions with nothing to fold, so
   their own CONSUMABLES.apply is the identity — see traits.js.
   --------------------------------------------------------------------- */
export function spendConsumable(run, id) {
  const c = consumableById(id);
  if (!c || run.over || run.insight < c.cost) return run;
  const insight = run.insight - c.cost;

  if (id === "reveal-burst") {
    if (run.revealBurstPrior) return run; // already active for the situation in hand
    return {
      ...run, insight,
      revealBurstPrior: { revealHiddenOpacity: run.mods.revealHiddenOpacity, partialOpacity: run.mods.partialOpacity },
      mods: c.apply(run.mods),
    };
  }
  if (id === "early-draft") {
    if (run.pendingDraft) return run;
    const r = rng((run.seed * 2654435761 + run.draftCount * 40503 + 11) >>> 0);
    return { ...run, insight, pendingDraft: draftFor(r, run.traits, 3), draftCount: run.draftCount + 1 };
  }
  if (id === "reroll-branch") {
    if (!run.pendingBranch) return run;
    const remaining = run.pendingBranch.options.filter((o) => o !== INSIGHT_CACHE.id);
    const branchRerollCount = run.branchRerollCount + 1;
    const options = branchOptionsFor(run.clearedStages, remaining, run.seed, branchRerollCount);
    return { ...run, insight, branchRerollCount, pendingBranch: { options } };
  }
  if (id === "peek-reroll") {
    // The redraw itself is the caller's job (bump the seed that feeds
    // drawForRun) — this file has no seed of its own to bump.
    return { ...run, insight };
  }
  return run;
}

export function applyDraft(run, traitId) {
  if (!run.pendingDraft || !run.pendingDraft.some((t) => t.id === traitId)) return run;
  return {
    ...run,
    traits: [...run.traits, traitId],
    mods: applyTrait(run.mods, traitId),
    pendingDraft: null,
  };
}

export function modifiersFor(run) {
  return run.mods;
}

export function summary(run) {
  return {
    situationsCleared: run.situationsCleared,
    traits: run.traits,
    points: run.tally.points,
    average: run.tally.average,
    best: run.tally.best,
    over: run.over,
    outcome: run.outcome,
    stagesCleared: run.clearedStages.length,
    insight: run.insight,
  };
}

/* ---------------------------------------------------------------------
   Drawing a scenario for a run
   Dispatches on where the run actually is: a Checkride leg (from the
   plan built in startCheckride), a queued boss (bosses.js, verbatim,
   never composed), or a regular stage-biased composition. Bias never
   touches composeScenario's own safety gate (windowIsSafe, inside
   compose.js) — it only chooses which BRIEF gets asked for, and which of
   several already-safe draws gets kept. Every scenario that comes back
   from here has passed exactly the same audit an unbiased Endless draw
   would have.
   --------------------------------------------------------------------- */

// Trait bias up-weights a match; stage bias down-weights a miss. Both are
// multiplicative on the same starting weight of 1, so they compose rather
// than override each other — a build leaning "heavy" inside the
// Restricted Visibility stage gets more of the already-favoured brief,
// not a fight between the two.
const BIAS_WEIGHT = 3;
const STAGE_MISS_WEIGHT = 0.08;

function weightedBriefs(mods, stage) {
  return ENDLESS_BRIEFS.map((brief) => {
    let weight = 1;
    if (mods.trafficBias && brief.traffic === mods.trafficBias) weight *= BIAS_WEIGHT;
    if (mods.visibilityBias && brief.visibility === mods.visibilityBias) weight *= BIAS_WEIGHT;
    if (stage?.briefBias?.traffic && !stage.briefBias.traffic.includes(brief.traffic)) weight *= STAGE_MISS_WEIGHT;
    if (stage?.briefBias?.visibility && !stage.briefBias.visibility.includes(brief.visibility)) weight *= STAGE_MISS_WEIGHT;
    return { brief, weight };
  });
}

function pickWeighted(r, weighted) {
  const total = weighted.reduce((sum, w) => sum + w.weight, 0);
  let x = r() * total;
  for (const w of weighted) {
    x -= w.weight;
    if (x <= 0) return w.brief;
  }
  return weighted[weighted.length - 1].brief;
}

/* Priority, softest requirement first: a fresh draw that matches every
   active preference; failing that within budget, any fresh draw; failing
   that, whatever composed at all. Never returns null while composeScenario
   ever succeeds once in the budget. */
function drawRegular(run, seed, recent) {
  const r = rng(seed);
  const stage = stageById(run.stage);
  const weighted = weightedBriefs(run.mods, stage);
  const seen = new Set(recent);
  const preferPed = run.mods.preferPedestrian || Boolean(stage?.forcePedestrian);
  let anyDraw = null, freshDraw = null;

  for (let i = 0; i < 20; i++) {
    const brief = pickWeighted(r, weighted);
    const scn = composeScenario(brief, (seed * 2654435761 + i * 40503) >>> 0);
    if (!scn) continue;
    if (!anyDraw) anyDraw = scn;
    if (seen.has(signatureOf(scn))) continue;
    if (!freshDraw) freshDraw = scn;
    const hasPed = scn.actors.some((a) => a.kind === "ped");
    if (!preferPed || hasPed) return scn;
  }
  return freshDraw ?? anyDraw;
}

/* Draws whatever the run should be looking at right now. `recent` is the
   same shape endlessScenario already takes — a list of recent
   signatureOf() values to avoid repeats — and is only consulted for a
   regular stage draw; a boss and a Checkride leg are fixed content, so
   there is nothing to vary. Returns null at a roundabout screen, where
   there is no scenario to draw at all. */
export function drawForRun(run, seed, recent = []) {
  if (run.stage === "roundabout") return null;
  if (run.stage === "checkride") return routeCurrentLeg(run.checkrideRun);
  if (run.pendingBoss) return bossById(run.pendingBoss);
  return drawRegular(run, seed, recent);
}

export { ENDLESS_BRIEFS, STAGES, BOSSES, stageById, bossById, CONSUMABLES, INSIGHT_CACHE };
