/* =====================================================================
   ROGUELIKE RUN
   A run of Endless situations with drafted traits and a real ending —
   mirrors route.js's startRun/recordLeg/summary shape deliberately, but
   is not an extension of it: a route has a fixed plan of legs, a run
   has no plan at all, and what counts as fatal is broader here than
   route.js's own DEFAULT_END_ON (see isCritical below).

   One-way dependency, checked by tools/verify-roguelike.mjs: this file
   and traits.js may import from compose.js's exported vocabulary, but
   compose.js and generate.js never import from here. A trait can lean
   the generator toward a kind of situation; it can never reach into how
   the generator decides a draw is safe.
   ===================================================================== */
import { emptyMods, applyTrait, draftFor, rng } from "./traits.js";
import { emptyTally, tally } from "./score.js";
import { ENDLESS_BRIEFS, composeScenario, signatureOf } from "./compose.js";

/* Every critical-tier fault this game defines, not just a literal
   collision: a single-press scenario reports through grade()'s verdict
   (collision or early — going before the road was legally yours is a
   failure to yield, and that is critical on a road test same as a
   crash); a multi-action manoeuvre additionally reports through
   gradeTask()'s sheet (encroach, blocked-box). route.js's own
   DEFAULT_END_ON only ever checks the first of these — copying it here
   uninspected would silently let a run survive a failure to yield. */
export function isCritical(result, sheet) {
  if (!result) return false;
  if (result.verdict === "collision" || result.verdict === "early") return true;
  return Boolean(sheet && sheet.criticalCount > 0);
}

export function startRun(seed) {
  return {
    seed,
    situationsCleared: 0,
    traits: [],
    mods: emptyMods(),
    tally: emptyTally,
    over: false,
    outcome: null,      // null | "ended"
    pendingDraft: null, // null | trait[]
    draftCount: 0,       // how many drafts offered so far — the milestone clock
  };
}

export function recordSituation(run, result, sheet = null) {
  if (run.over) return run;

  if (isCritical(result, sheet)) {
    return { ...run, over: true, outcome: "ended" };
  }

  const clean = result.verdict === "good";
  const situationsCleared = run.situationsCleared + (clean ? 1 : 0);
  const nextTally = tally(run.tally, result);

  /* Milestone: every mods.draftEvery clean clears, counted from the last
     draft rather than from the start of the run — Quick Study shortens
     the *next* gap, it does not retroactively move earlier ones. */
  const dueClears = (run.draftCount + 1) * run.mods.draftEvery;
  const due = clean && run.pendingDraft == null && situationsCleared >= dueClears;

  let pendingDraft = run.pendingDraft;
  let draftCount = run.draftCount;
  if (due) {
    const r = rng((run.seed * 2654435761 + draftCount * 40503) >>> 0);
    pendingDraft = draftFor(r, run.traits, 3);
    draftCount += 1;
  }

  return { ...run, situationsCleared, tally: nextTally, pendingDraft, draftCount };
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
  };
}

/* ---------------------------------------------------------------------
   Drawing a scenario for a run
   Bias never touches composeScenario's own safety gate (windowIsSafe,
   inside compose.js) — it only chooses which BRIEF gets asked for, and
   which of several already-safe draws gets kept. Every scenario that
   comes back from here has passed exactly the same audit an unbiased
   Endless draw would have.
   --------------------------------------------------------------------- */

// Each brief starts at weight 1; a matching bias multiplies it, so a
// biased situation comes up more often without the others disappearing
// — specialization, not a locked-in category.
const BIAS_WEIGHT = 3;
function weightedBriefs(mods) {
  return ENDLESS_BRIEFS.map((brief) => {
    let weight = 1;
    if (mods.trafficBias && brief.traffic === mods.trafficBias) weight *= BIAS_WEIGHT;
    if (mods.visibilityBias && brief.visibility === mods.visibilityBias) weight *= BIAS_WEIGHT;
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

/* Draws one scenario for this run. `recent` is the same shape
   endlessScenario already takes — a list of recent signatureOf() values
   to avoid repeats. Priority, softest requirement first: a fresh draw
   that matches every active preference; failing that within budget, any
   fresh draw; failing that, whatever composed at all. Never returns
   null while composeScenario ever succeeds once in the budget. */
export function drawForRun(run, seed, recent = []) {
  const r = rng(seed);
  const weighted = weightedBriefs(run.mods);
  const seen = new Set(recent);
  let anyDraw = null, freshDraw = null;

  for (let i = 0; i < 20; i++) {
    const brief = pickWeighted(r, weighted);
    const scn = composeScenario(brief, (seed * 2654435761 + i * 40503) >>> 0);
    if (!scn) continue;
    if (!anyDraw) anyDraw = scn;
    if (seen.has(signatureOf(scn))) continue;
    if (!freshDraw) freshDraw = scn;
    const hasPed = scn.actors.some((a) => a.kind === "ped");
    if (!run.mods.preferPedestrian || hasPed) return scn;
  }
  return freshDraw ?? anyDraw;
}
