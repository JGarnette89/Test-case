/* =====================================================================
   DETECTION — grading the examiner, not the driver

   The fourth scoring shape, and it is not one of the three that exist.
   `deadline` asks "had you done it by when". `window` asks "not before
   when". Merging asks "how soon did you start". This asks something none
   of them can express: of the things that actually happened, which did
   you catch, what did you invent, and were you watching at the time.

   So it is precision and recall with a clock on it.

   THREE RULES DO ALL THE WORK.

   1. A fault you could not see is not a fault you missed. Recall is
      computed only over faults that were genuinely observable — in the
      cone, not behind a van, for long enough to call. Missing one
      because a van hid it is the scenario's doing. Missing one because
      you were looking the other way is yours, and sight.js already tells
      these apart. Without this rule the game punishes players for its own
      geometry.

   2. Marking a fault that did not happen has to cost. Otherwise the
      dominant strategy is to mark constantly, and the whole thing
      collapses into a button-masher. An examiner who fails candidates for
      things they did not do is not a strict examiner, they are a bad one.

   3. Late is worth less than prompt, but not nothing. You are marking
      what you observe as you observe it; noticing on the way out of the
      junction is still noticing.

   WHAT A MARK IS is deliberately left open. Pass a `what` and it is
   scored as a categorised call; leave it out and only the timing is
   graded. That question — whether a player picks a category one-thumbed
   mid-drive or just flags the moment — is the maintainer's, and this
   module refuses to pre-empt it.

   Pure. No React, no DOM, no colour.
   ===================================================================== */
import { REACTION_FLOOR } from "./score.js";
import { MIN_DURATION } from "./faults.js";

/* How much of a fault has to have been visible before failing to call it
   counts against you. A glimpse is not an observation: the same standard
   faults.js applies to a fault's own duration, applied to your sight of
   it. Below this the fault goes on the sheet as unmarkable rather than
   missed. */
export const SEEN_ENOUGH = 0.35;

/* You cannot call a fault faster than you can register one, so the window
   opens a reaction after it starts. It stays open past the end because
   marking on the way out of a junction is still marking. */
export const CALL_GRACE = 2.0;

/* What inventing a fault costs, as a fraction of what catching one earns.
   Deliberately less than 1: an examiner who over-calls is worse than one
   who is merely quiet, but a single mistaken mark should not wipe out a
   correct one. */
export const FALSE_COST = 0.75;

/* The floor a correct-but-late call is worth. Late marking is still
   marking. */
export const LATE_CREDIT = 0.4;

/* When a fault can be called, given how long it lasted. */
export function callWindow(fault) {
  return { opens: fault.from + REACTION_FLOOR, closes: fault.to + CALL_GRACE };
}

/* What a call is worth inside that window: full while it is happening,
   easing to LATE_CREDIT by the time the window shuts. */
export function promptness(fault, at) {
  const w = callWindow(fault);
  if (at < w.opens || at > w.closes) return 0;
  if (at <= fault.to) return 1;
  const k = (at - fault.to) / (w.closes - fault.to || 1);
  return 1 - (1 - LATE_CREDIT) * k;
}

/* =====================================================================
   Grading a drive.

     faults      what actually happened, from faultsIn()
     marks       [{ at, what? }] — when the player called, and optionally
                 which fault they thought it was
     seenShare   (fault) -> 0..1, how much of it they actually saw, from
                 sight.js's faultVisibility. Injected rather than computed
                 here, because how much you saw depends on where you were
                 looking, which is the renderer's record, not the engine's.

   Each fault is matched by at most one mark and each mark to at most one
   fault, nearest-first, so spraying marks cannot farm a single fault.
   ===================================================================== */
export function scoreDetection({ faults = [], marks = [], seenShare = () => 1 }) {
  const markable = [], unmarkable = [];
  for (const f of faults) {
    const seen = seenShare(f);
    // Too brief to call, or you never really had sight of it.
    (f.duration >= MIN_DURATION && seen >= SEEN_ENOUGH ? markable : unmarkable)
      .push({ fault: f, seen });
  }

  /* Pair marks to faults. Best pairing first — the strongest available
     match wins — so the result does not depend on the order either list
     happens to arrive in. */
  const pairs = [];
  for (const m of marks) {
    for (const cand of markable) {
      const value = promptness(cand.fault, m.at);
      if (value <= 0) continue;
      // A categorised call must name the right fault to count as one.
      if (m.what != null && m.what !== cand.fault.trait) continue;
      pairs.push({ mark: m, cand, value });
    }
  }
  pairs.sort((a, b) => b.value - a.value);

  const usedMarks = new Set(), usedFaults = new Set();
  const hits = [];
  for (const p of pairs) {
    if (usedMarks.has(p.mark) || usedFaults.has(p.cand)) continue;
    usedMarks.add(p.mark);
    usedFaults.add(p.cand);
    hits.push({ fault: p.cand.fault, at: p.mark.at, value: p.value, seen: p.cand.seen });
  }

  const missed = markable.filter((c) => !usedFaults.has(c)).map((c) => c.fault);
  const invented = marks.filter((m) => !usedMarks.has(m));

  /* Precision and recall, reported separately because they fail in
     opposite directions and a single number hides which. */
  const caught = hits.reduce((a, h) => a + h.value, 0);
  const precision = marks.length ? hits.length / marks.length : 1;
  const recall = markable.length ? hits.length / markable.length : 1;
  const timeliness = hits.length ? caught / hits.length : 1;

  /* The sheet mark. Credit for what you caught, weighted by how promptly,
     against everything that was there to catch — then charged for what
     you made up. A drive with nothing to find and nothing called is a
     clean sheet rather than a division by zero. */
  const earned = caught - invented.length * FALSE_COST;
  const outOf = markable.length;
  const score = outOf === 0
    ? (invented.length ? Math.max(0, 100 - invented.length * FALSE_COST * 100) : 100)
    : Math.max(0, Math.min(100, Math.round((earned / outOf) * 100)));

  return {
    hits, missed, invented, unmarkable,
    precision: round(precision), recall: round(recall), timeliness: round(timeliness),
    score,
  };
}

const round = (v) => Math.round(v * 1000) / 1000;

/* A plain-language sheet line, the way the mark sheet already reads.
   Nothing here decides pass or fail: that is a road-test standard and it
   belongs with the maintainer, not in a scoring helper. */
export function summarise(r) {
  const bits = [];
  bits.push(`${r.hits.length} caught`);
  if (r.missed.length) bits.push(`${r.missed.length} missed`);
  if (r.invented.length) bits.push(`${r.invented.length} called that never happened`);
  if (r.unmarkable.length) bits.push(`${r.unmarkable.length} you had no sight of`);
  return bits.join(", ");
}
