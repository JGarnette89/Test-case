/* =====================================================================
   ACTIONS
   The game used to ask one question — when do you go — and grade it
   against one number. A real manoeuvre is a sequence: signal, then slow,
   then turn; or mirror, signal, shoulder, move. Order is marked as well
   as timing, because doing the right things in the wrong order is its own
   fault on a road test.

   Pure. No React, no DOM, no colour. It composes score.js rather than
   re-implementing it: each action is graded on its own window by the same
   curve a single GO always was, so the old game is simply the degenerate
   case of one required action.
   ===================================================================== */
import { grade, GRACE, REACTION_FLOOR } from "./score.js";
import { PROPER_SIGNAL_LEAD } from "./index.js";

/* Two ways an action can be judged, and the difference is the whole
   design:

     deadline  something you must have done BY a moment. Early is fine
               within reason, late costs marks. A signal exists to inform
               other people, so it is worth nothing once you have already
               acted on it.

     window    something you must not do BEFORE a moment. Early is a
               failure to yield, late is undue delay. The original model,
               unchanged.

   `kind` is what the action IS, `mark` is how it is judged. They are not
   the same axis: slowing is a motion but it is judged on a deadline.

   The catalogue is deliberately short: this has to be playable one-thumbed
   on a phone, so a scenario shows at most four of these. A control panel
   is not a driving test. */
export const ACTIONS = {
  mirror: { label: "MIRROR", kind: "observation", mark: "deadline", weight: 20 },
  blindSpot: { label: "SHOULDER", kind: "observation", mark: "deadline", weight: 20 },
  signal: { label: "SIGNAL", kind: "announce", mark: "deadline", weight: 25 },
  slow: { label: "SLOW", kind: "motion", mark: "deadline", weight: 25 },
  go: { label: "GO", kind: "motion", mark: "window", weight: 50 },
  // Creeping for a sightline is judged by what it exposes you to, not by
  // the clock, so it carries no window and no marks of its own.
  pullUp: { label: "PULL UP", kind: "motion", mark: "free", weight: 0, repeatable: true },
};

export const MAX_BUTTONS = 4;

/* How long before a manoeuvre you should be off the gas. Separate from
   the signal lead because they are different acts: you signal to tell
   people, then you slow to do the thing. */
export const SLOW_LEAD = 2.0;

/* Doing the right thing in the wrong order still shows you knew to do it,
   so it keeps half marks — but no more, because a signal after the fact
   informed nobody. */
export const OUT_OF_ORDER_CREDIT = 0.5;

/* Signalling absurdly early is its own fault, but the band is generous:
   nobody is marked down for a tidy early indicator. */
export const EARLY_DEADLINE_GRACE = 6.0;

/* Spacing between a look and whatever it precedes. A shoulder check three
   seconds before you move is not the check the sequence asked for. */
export const OBSERVE_GAP = 0.4;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
  /* Anywhere the view is short. No signal, because going straight ahead
     announces nothing — but the option to edge forward has to be there,
     or the player is being asked to read something they cannot see and
     given no way to fix that. */
  blindApproach: ["pullUp", "go"],
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
   Deriving the windows
   Anchored to the manoeuvre and worked backwards, exactly as the rule is
   taught, so the order falls out of the anchor rather than being
   asserted: look, then signal, then act.

   The signal anchors to whichever act comes FIRST — the slow, the
   moving-off, or the manoeuvre. Anchor it to the manoeuvre alone and a
   task that pulls away from a line ends up wanting the signal after the
   moving-off, which is backwards.
   ===================================================================== */
export function deriveWindows(sequence, { manoeuvreAt, legalAt = null }) {
  const slowBy = manoeuvreAt - SLOW_LEAD;

  const acts = [manoeuvreAt];
  if (sequence.includes("slow")) acts.push(slowBy);
  if (sequence.includes("go") && legalAt != null) acts.push(legalAt);
  const signalBy = Math.min(...acts) - PROPER_SIGNAL_LEAD;

  /* Only the acts have anchors of their own. The observations do not:
     where a mirror or shoulder check belongs depends entirely on where the
     sequence puts it, and on a lane change the shoulder check comes AFTER
     the signal — mirror, signal, shoulder, move. Pinning them to fixed
     offsets around the signal contradicted the sequence that declared
     them, so they are placed by walking the sequence instead. */
  const at = { signal: signalBy, slow: slowBy, go: legalAt };

  // Backwards from the last step: every earlier step must land before the
  // one that follows it, whatever its own anchor said.
  for (let i = sequence.length - 2; i >= 0; i--) {
    const cur = sequence[i], next = sequence[i + 1];
    if (at[next] == null) continue;
    const latest = at[next] - OBSERVE_GAP;
    at[cur] = at[cur] == null ? latest : Math.min(at[cur], latest);
  }

  const out = {};
  for (const a of sequence) if (at[a] != null) out[a] = at[a];
  return out;
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
  PREMATURE: { id: "premature", tier: "marked", text: "So early it told nobody anything" },
  EARLY: { id: "early", tier: "critical", text: "Moved before it was yours" },
  ENCROACHED: { id: "encroach", tier: "critical", text: "Crept into the path of other traffic" },
  COLLISION: { id: "collision", tier: "critical", text: "Collision" },
  BLOCKED_BOX: { id: "blockedBox", tier: "critical", text: "Crossed the line with a vehicle already waiting to turn ahead" },
};

/* One action against its own window. */
function markStep(action, at, window) {
  const def = ACTIONS[action];
  if (at == null) return { score: 0, fault: FAULT.MISSED };
  // Nothing to time it against — pulling up is judged by what it exposes.
  if (window == null || def.mark === "free") return { score: 100, fault: null };

  if (def.mark === "window") {
    const g = grade({ legalAt: window, pressedAt: at });
    if (g.verdict === "early") return { score: 0, fault: FAULT.EARLY, timing: g };
    return { score: g.score, fault: g.verdict === "late" ? FAULT.LATE : null, timing: g };
  }

  // deadline: late costs marks on the same curve the press score uses.
  const late = at - window;
  if (late > GRACE) return { score: 0, fault: FAULT.LATE };
  if (late > REACTION_FLOOR) {
    const q = clamp(1 - (late - REACTION_FLOOR) / (GRACE - REACTION_FLOOR), 0, 1);
    return { score: Math.round(q * 100), fault: FAULT.LATE };
  }
  if (late > -EARLY_DEADLINE_GRACE) return { score: 100, fault: null };
  return { score: 50, fault: FAULT.PREMATURE };
}

/* =====================================================================
   Grading a whole manoeuvre.

     sequence  ordered action ids the manoeuvre requires
     windows   { action: at } from deriveWindows — never authored
     performed [{ action, at }] in the order the player pressed them
     faults    critical findings the simulation observed (encroachment,
               collision) that no button press can describe

   Partial marks throughout: each action is scored on its own, exactly as
   a single GO always was, and the manoeuvre mark is their weighted mean.
   Doing three of four things well is worth three quarters, not nothing.
   ===================================================================== */
export function gradeTask({ sequence, windows, performed = [], faults = [] }) {
  const done = new Map();
  for (const p of performed) if (!done.has(p.action)) done.set(p.action, p.at);

  const rules = orderingRules(sequence);
  const steps = [];
  const found = [];

  for (const action of sequence) {
    const at = done.get(action);
    const base = markStep(action, at, windows?.[action]);

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

    /* Both faults are recorded, never one instead of the other. Being out
       of order must not launder a critical fault into a marked one:
       moving before the road is yours is critical whether or not you also
       did it in the wrong place, and an earlier version of this quietly
       downgraded exactly that case. */
    if (broken.length) found.push({ ...FAULT.OUT_OF_ORDER, action, after: broken[0].after });
    if (base.fault) found.push({ ...base.fault, action });

    steps.push({
      action,
      score: broken.length ? Math.round(base.score * OUT_OF_ORDER_CREDIT) : base.score,
      fault: broken.length ? FAULT.OUT_OF_ORDER : base.fault,
      timing: base.timing,
    });
  }

  for (const f of faults) found.push(f);

  // Weighted, because a shoulder check and a GO are not the same size of
  // decision. pullUp weighs nothing: it is a means, not an item.
  let earned = 0, total = 0;
  for (const s of steps) {
    const w = ACTIONS[s.action]?.weight ?? 0;
    earned += s.score * w;
    total += w;
  }
  const marks = total === 0 ? 0 : Math.round(earned / total);

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
