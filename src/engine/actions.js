/* =====================================================================
   ACTIONS
   The game used to ask one question — when do you go — and grade it
   against one number. A real manoeuvre is a sequence: signal, then slow,
   then turn; or mirror, signal, shoulder, move. Order is marked as well
   as timing, because doing the right things in the wrong order is its own
   fault on a road test.

   Pure. No React, no DOM, no colour. It composes score.js rather than
   re-implementing it: each action in a sequence is graded on its own
   window by the same curve a single GO always was, so the old game is
   simply the degenerate case of one required action.
   ===================================================================== */
import { grade } from "./score.js";

/* The catalogue. Deliberately short: this has to be playable one-thumbed
   on a phone, so a scenario shows at most four of these and each is
   pressed once. A control panel is not a driving test. */
export const ACTIONS = {
  mirror: { label: "MIRROR", kind: "observation" },
  blindSpot: { label: "SHOULDER", kind: "observation" },
  signal: { label: "SIGNAL", kind: "announce" },
  slow: { label: "SLOW", kind: "motion" },
  go: { label: "GO", kind: "motion" },
  pullUp: { label: "PULL UP", kind: "motion", repeatable: true },
};

export const MAX_BUTTONS = 4;

/* =====================================================================
   Canonical sequences
   Derived from the manoeuvre, never written per scenario — the same rule
   the rest of the engine follows. The maintainer's rule, verbatim:
   signalling is done before any change of direction or motion, slowing
   included when the slowing leads into a turn.

   So `signal` precedes every motion action in any manoeuvre that changes
   direction. Going straight ahead announces nothing, so it has no signal.
   ===================================================================== */
const SEQUENCES = {
  straight: ["go"],
  turn: ["signal", "slow", "go"],
  laneChange: ["mirror", "signal", "blindSpot", "go"],
  // Pulling into a driveway or lot is a turn across a path, same order.
  enterLot: ["signal", "slow", "go"],
  // An unprotected left: you may creep for a sightline before committing.
  unprotectedLeft: ["signal", "pullUp", "go"],
};

export function sequenceFor(manoeuvre) {
  return SEQUENCES[manoeuvre] || SEQUENCES.straight;
}

export function changesDirection(manoeuvre) {
  return manoeuvre !== "straight";
}

/* Every motion action must come after the signal, when there is one. This
   is generated rather than listed so a new sequence cannot forget it. */
export function orderingRules(sequence) {
  const rules = [];
  const hasSignal = sequence.includes("signal");
  for (let i = 1; i < sequence.length; i++) {
    // Each step follows the one before it.
    rules.push({ action: sequence[i], after: sequence[i - 1] });
  }
  if (hasSignal) {
    for (const a of sequence) {
      if (ACTIONS[a]?.kind === "motion") rules.push({ action: a, after: "signal" });
    }
  }
  return rules;
}

/* =====================================================================
   Faults
   Two tiers, as on the road test. Marked faults cost points and you can
   still pass. A critical fault ends it regardless of how the rest went —
   entering the path of traffic that has right of way is not something a
   good score elsewhere makes up for.
   ===================================================================== */
export const FAULT = {
  MISSED: { id: "missed", tier: "marked", text: "Did not do it at all" },
  OUT_OF_ORDER: { id: "order", tier: "marked", text: "Done out of order" },
  LATE: { id: "late", tier: "marked", text: "Left it too long" },
  EARLY: { id: "early", tier: "critical", text: "Moved before it was yours" },
  ENCROACHED: { id: "encroach", tier: "critical", text: "Crept into the path of other traffic" },
  COLLISION: { id: "collision", tier: "critical", text: "Collision" },
  BLOCKED_BOX: { id: "blockedBox", tier: "critical", text: "Crossed the line with a vehicle already waiting to turn ahead" },
};

/* =====================================================================
   Grading a whole manoeuvre.

     sequence  ordered action ids the manoeuvre requires
     windows   { action: legalAt } — derived by the engine, never authored
     performed [{ action, at }] in the order the player pressed them
     faults    critical findings the simulation observed (encroachment,
               collision) that no button press can describe

   Partial marks throughout: each action is scored on its own, exactly as
   a single GO always was, and the manoeuvre mark is their average. Doing
   three of four things well is worth three quarters, not nothing.
   ===================================================================== */
export function gradeTask({ sequence, windows, performed = [], faults = [] }) {
  const done = new Map();
  for (const p of performed) if (!done.has(p.action)) done.set(p.action, p.at);

  const rules = orderingRules(sequence);
  const steps = [];
  const found = [];

  for (const action of sequence) {
    const at = done.get(action);
    if (at == null) {
      steps.push({ action, score: 0, fault: FAULT.MISSED });
      found.push({ ...FAULT.MISSED, action });
      continue;
    }

    // Order first: a correctly timed action in the wrong place is still wrong.
    const broken = rules.filter((r) => {
      if (r.action !== action) return false;
      const prior = done.get(r.after);
      return prior == null || prior > at;
    });

    const window = windows?.[action];
    const g = window == null
      ? { verdict: "good", score: 100, reaction: null }
      : grade({ legalAt: window, pressedAt: at });

    if (broken.length) {
      // Half marks: they did the thing, and did it at a sensible moment,
      // but the sequence is part of the skill.
      steps.push({ action, score: Math.round(g.score / 2), fault: FAULT.OUT_OF_ORDER, timing: g });
      found.push({ ...FAULT.OUT_OF_ORDER, action, after: broken[0].after });
      continue;
    }

    if (g.verdict === "early") found.push({ ...FAULT.EARLY, action });
    else if (g.verdict === "late") found.push({ ...FAULT.LATE, action });

    steps.push({ action, score: g.score, fault: null, timing: g });
  }

  for (const f of faults) found.push(f);

  const marks = steps.length
    ? Math.round(steps.reduce((a, s) => a + s.score, 0) / steps.length)
    : 0;

  const critical = found.filter((f) => f.tier === "critical");
  const marked = found.filter((f) => f.tier === "marked");

  return {
    steps,
    marks,
    faults: found,
    criticalCount: critical.length,
    markedCount: marked.length,
    // A critical fault fails the manoeuvre whatever the marks say.
    passed: critical.length === 0 && marks >= 60,
    outcome: critical.length ? "failed" : marks >= 60 ? "passed" : "below standard",
  };
}

/* A run of manoeuvres, scored the way a road test is: every marked fault
   counted, any critical fault fatal, and a sheet at the end rather than a
   verdict after each one. */
export const emptySheet = { items: [], marks: 0, marked: 0, critical: 0 };

export function addToSheet(sheet, name, result) {
  const items = [...sheet.items, { name, ...result }];
  return {
    items,
    marks: Math.round(items.reduce((a, i) => a + i.marks, 0) / items.length),
    marked: sheet.marked + result.markedCount,
    critical: sheet.critical + result.criticalCount,
  };
}

export function sheetOutcome(sheet) {
  if (sheet.critical > 0) return "failed";
  if (sheet.marks < 60) return "below standard";
  return "passed";
}
