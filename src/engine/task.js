/* =====================================================================
   TASKS — more than one thing to get right

   Pressing GO at the right moment is one action judged against one window.
   A real manoeuvre is a sequence: signal, then slow, then turn. Doing all
   of it in the wrong order is not the same as doing none of it, and a road
   test does not mark pass/fail on each item — it takes marks off.

   So: a task is an ordered list of steps, each with a window the engine
   derives, and each worth marks. Nothing here decides when a road is
   yours; it grades what the player did against what the situation asked.

   Two kinds of step, and the difference matters:

     DEADLINE  signal, slow. Something you must have done BY a moment.
               Early is fine within reason; late costs marks. Signalling
               is the archetype: it exists to inform other people, so it
               is worthless once you have already acted on it.

     WINDOW    go. Something you must not do BEFORE a moment. Early is a
               failure to yield, late is undue delay. This is the existing
               model, unchanged.
   ===================================================================== */
import { GRACE, REACTION_FLOOR, EARLY_TOLERANCE, grade } from "./score.js";
import { PROPER_SIGNAL_LEAD } from "./index.js";

/* Kept deliberately short. Every one of these is a button on a phone, and
   a task that needs six of them is a task nobody can play one-handed. */
export const ACTIONS = {
  signal: { id: "signal", label: "SIGNAL", kind: "deadline", weight: 25 },
  slow: { id: "slow", label: "SLOW", kind: "deadline", weight: 25 },
  mirror: { id: "mirror", label: "MIRROR", kind: "deadline", weight: 20 },
  blindspot: { id: "blindspot", label: "SHOULDER", kind: "deadline", weight: 20 },
  go: { id: "go", label: "GO", kind: "window", weight: 50 },
};

/* No task may put more than this many buttons on screen. A hard limit,
   because the alternative is a control panel rather than a decision. */
export const MAX_BUTTONS = 4;

/* How long before a manoeuvre you should be off the gas. Separate from the
   signal lead because they are different acts: you signal to tell people,
   then you slow to do the thing. */
export const SLOW_LEAD = 2.0;

/* Doing the right thing in the wrong order still shows you knew to do it,
   so it keeps some marks — but not many, because a signal after the fact
   informed nobody. */
export const OUT_OF_ORDER_CREDIT = 0.35;

/* Signalling absurdly early is its own fault on a test, but the band is
   generous: nobody is marked down for a tidy early indicator. */
export const EARLY_DEADLINE_GRACE = 6.0;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ---------------------------------------------------------------------
   Deriving the deadlines.

   Anchored to the manoeuvre and worked backwards, exactly as the rule is
   taught: signal before any change of direction or motion, and slowing
   counts as a change of motion when it leads into a turn. So the order
   falls out of the anchor rather than being asserted.
   --------------------------------------------------------------------- */
export function deriveTask(spec, { manoeuvreAt, legalAt = null }) {
  const steps = [];
  const wants = spec.steps;

  const slowBy = manoeuvreAt - SLOW_LEAD;

  /* Before ANY change of direction or motion — so the signal anchors to
     whichever act comes first, not to the manoeuvre by default. Anchor it
     to the turn alone and a task that pulls away from a line puts the
     signal deadline after the moving-off, which is backwards. */
  const acts = [manoeuvreAt];
  if (wants.includes("slow")) acts.push(slowBy);
  if (wants.includes("go") && legalAt != null) acts.push(legalAt);
  const signalBy = Math.min(...acts) - PROPER_SIGNAL_LEAD;

  const at = {
    signal: signalBy,
    // Mirror and shoulder check belong before the signal: you look, then
    // you tell people, then you move.
    mirror: signalBy - 0.6,
    blindspot: signalBy - 0.3,
    slow: slowBy,
    go: legalAt,
  };

  for (const id of wants) {
    const def = ACTIONS[id];
    if (!def) continue;
    steps.push({ ...def, at: at[id] });
  }
  return { steps, manoeuvreAt };
}

/* ---------------------------------------------------------------------
   Marking.

   `performed` is { actionId: time } — each button presses once, so there
   is at most one time per action.
   --------------------------------------------------------------------- */
function markDeadline(step, t) {
  if (t == null) return { marks: 0, fault: "omitted" };
  const late = t - step.at;
  if (late > GRACE) return { marks: 0, fault: "far too late" };
  if (late > 0) {
    // Same decay the press score uses, so one curve governs everything.
    const q = clamp(1 - (late - Math.min(late, REACTION_FLOOR)) / (GRACE - REACTION_FLOOR), 0, 1);
    return { marks: q, fault: late > REACTION_FLOOR ? "late" : null };
  }
  if (-late > EARLY_DEADLINE_GRACE) return { marks: 0.5, fault: "far too early" };
  return { marks: 1, fault: null };
}

function markWindow(step, t) {
  if (t == null) return { marks: 0, fault: "never went" };
  const g = grade({ legalAt: step.at, pressedAt: t });
  if (g.verdict === "early") return { marks: 0, fault: "failure to yield" };
  return { marks: g.score / 100, fault: g.verdict === "late" ? "undue delay" : null };
}

/* Order is judged on the sequence the player actually produced, against
   the sequence the task asked for. Anything performed before something it
   should have followed is out of order. */
function orderFaults(steps, performed) {
  const done = steps
    .filter((s) => performed[s.id] != null)
    .sort((a, b) => performed[a.id] - performed[b.id])
    .map((s) => s.id);

  const wanted = steps.map((s) => s.id).filter((id) => done.includes(id));
  const bad = new Set();
  for (let i = 0; i < done.length; i++) {
    if (done[i] !== wanted[i]) bad.add(done[i]);
  }
  return bad;
}

export function gradeTask(task, performed) {
  const outOfOrder = orderFaults(task.steps, performed);

  let earned = 0, total = 0;
  const marks = task.steps.map((step) => {
    const t = performed[step.id] ?? null;
    const base = step.kind === "window" ? markWindow(step, t) : markDeadline(step, t);

    // Out of order keeps a little credit: you knew to do it.
    const wrongOrder = outOfOrder.has(step.id);
    const ratio = wrongOrder ? Math.min(base.marks, OUT_OF_ORDER_CREDIT) : base.marks;

    const got = ratio * step.weight;
    earned += got;
    total += step.weight;

    return {
      id: step.id,
      label: step.label,
      at: step.at == null ? null : Math.round(step.at * 100) / 100,
      done: t == null ? null : Math.round(t * 100) / 100,
      marks: Math.round(got),
      outOf: step.weight,
      fault: wrongOrder ? "out of order" : base.fault,
    };
  });

  const score = total === 0 ? 0 : Math.round((earned / total) * 100);
  return {
    marks,
    score,
    earned: Math.round(earned),
    total,
    faults: marks.filter((m) => m.fault).map((m) => `${m.label.toLowerCase()}: ${m.fault}`),
    clean: marks.every((m) => !m.fault),
  };
}
