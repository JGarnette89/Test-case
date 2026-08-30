/* =====================================================================
   STAGES
   The roguelike's driving-test framing: a run moves through named stages,
   each biasing generation toward what it teaches and capped by a boss
   from bosses.js. Data, like everything else this project sequences —
   roguelike.js is what turns this into a running state machine.

   The roundabout graph lives here too: which stages are on offer where.
   v1 is a flat fan-out (every stage reachable from the first roundabout,
   remaining ones offered again after each clear) rather than a real
   branching map — see CLAUDE.md-adjacent plan notes for why a bigger map
   waits on more stage content.
   ===================================================================== */
import { TRAFFIC, VISIBILITY } from "./compose.js";

export const STAGES = [
  {
    id: "basics",
    name: "Basics",
    theme: "Path-conflict reading: arrival order and the right-hand rule.",
    briefBias: { traffic: ["light", "busy"], visibility: ["open"] },
    situationsToBoss: 3,
    bossId: "boss-fourway",
  },
  {
    id: "pedestrians",
    name: "Sharing the Road",
    theme: "Pedestrians hold the near half of a crossing, not the whole thing.",
    briefBias: { traffic: ["light", "busy"], visibility: ["open"] },
    forcePedestrian: true,
    situationsToBoss: 3,
    bossId: "boss-crossing",
  },
  {
    id: "visibility",
    name: "Restricted Visibility",
    theme: "Creeping buys a sightline, and spends your margin doing it.",
    briefBias: { traffic: ["heavy"], visibility: ["restricted"] },
    situationsToBoss: 3,
    bossId: "boss-blind-rush",
  },
];

export const stageById = (id) => STAGES.find((s) => s.id === id) || null;

/* A flat-only cost: whichever stages have not been cleared yet are the
   exits on offer, every time. A branching map with paths that do not all
   reconverge is future content once there are enough stages to fill it. */
export function exitsFor(clearedStages) {
  return STAGES.filter((s) => !clearedStages.includes(s.id)).map((s) => s.id);
}

export const ALL_STAGE_IDS = STAGES.map((s) => s.id);

/* The rest-stop node: not a stage, grants Insight instead of gating on a
   boss. Only worth offering once there is more than one real exit to
   choose between — see roguelike.js's branchFor. */
export const INSIGHT_CACHE = { id: "cache", name: "Insight Cache", insightAward: 6 };

/* Sanity for verify-stages.mjs: every bias value must be a real key in
   compose.js's own vocabulary, so a typo here cannot silently fall back
   to "no bias" without being caught. */
export function validateBias(stage) {
  const problems = [];
  for (const t of stage.briefBias?.traffic ?? []) {
    if (!(t in TRAFFIC)) problems.push(`${stage.id}: unknown traffic bias "${t}"`);
  }
  for (const v of stage.briefBias?.visibility ?? []) {
    if (!(v in VISIBILITY)) problems.push(`${stage.id}: unknown visibility bias "${v}"`);
  }
  return problems;
}
