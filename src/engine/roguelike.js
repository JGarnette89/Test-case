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
import { emptyMods, applyTrait, draftFor, rng } from "./traits.js";
import { emptyTally, tally } from "./score.js";
import { ENDLESS_BRIEFS, composeScenario, signatureOf } from "./compose.js";
import { STAGES, stageById, exitsFor, ALL_STAGE_IDS } from "./stages.js";
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
  };
}

/* Picking an exit at a roundabout screen. Silently a no-op on a stale or
   unknown choice — the caller only ever offers what pendingBranch.options
   actually lists, so this is a defensive floor, not a real path. */
export function chooseBranch(run, choice) {
  if (!run.pendingBranch || !run.pendingBranch.options.includes(choice)) return run;
  return { ...run, stage: choice, pendingBranch: null, stageProgress: 0, pendingBoss: null };
}

export function recordSituation(run, result, sheet = null) {
  if (run.over) return run;
  if (run.stage === "checkride") return recordCheckrideLeg(run, result, sheet);
  if (isCritical(result, sheet)) return { ...run, over: true, outcome: "ended" };

  const clean = result.verdict === "good";
  const nextTally = tally(run.tally, result);

  /* A boss was just cleared: the stage is done. Either hand off to a
     fresh roundabout with whatever stages remain, or — once every stage
     is cleared — straight into the Checkride. No roundabout in between:
     the map's whole job is choosing which stage comes next, and once
     none do there is nothing left to choose. */
  if (run.pendingBoss) {
    const clearedStages = [...run.clearedStages, run.stage];
    const situationsCleared = run.situationsCleared + (clean ? 1 : 0);
    const remaining = exitsFor(clearedStages);
    const base = { ...run, situationsCleared, tally: nextTally, clearedStages, pendingBoss: null, stageProgress: 0 };
    if (remaining.length === 0) {
      return { ...base, stage: "checkride", checkrideRun: startCheckride() };
    }
    return { ...base, stage: "roundabout", pendingBranch: { options: remaining } };
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
    ...run, situationsCleared, stageProgress, tally: nextTally, pendingDraft, draftCount,
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
function recordCheckrideLeg(run, result, sheet) {
  const cr = run.checkrideRun;
  const fatal = isCritical(result, sheet);
  const nextIndex = cr.index + 1;
  const exhausted = nextIndex >= cr.plan.legs.length;
  const checkrideRun = { ...cr, results: [...cr.results, result], index: fatal ? cr.index : nextIndex };
  const situationsCleared = run.situationsCleared + (result.verdict === "good" ? 1 : 0);
  const nextTally = tally(run.tally, result);
  const base = { ...run, checkrideRun, situationsCleared, tally: nextTally };

  if (fatal) return { ...base, over: true, outcome: "ended" };
  if (exhausted) return { ...base, over: true, outcome: "won" };
  return base;
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

export { ENDLESS_BRIEFS, STAGES, BOSSES, stageById, bossById };
