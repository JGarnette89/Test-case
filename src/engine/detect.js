/* =====================================================================
   DETECTION — grading the examiner, not the driver

   The fourth scoring shape, and it is not one of the three that exist.
   `deadline` asks "had you done it by when". `window` asks "not before
   when". Merging asks "how soon did you start". This asks something none
   of them can express: of the things that actually happened, which did
   you catch, what did you invent, and were you watching at the time.

   So it is precision and recall with a clock on it.

   THREE RULES DO ALL THE WORK.

   1. A fault the screen showed you is a fault you could have caught.
      Recall counts every fault that was displayed for at least
      SHOWN_ENOUGH, and nothing else — not where within the screen you
      were looking, which is no longer modelled at all.

      A fault behind a van is struck off, because the renderer hid it from
      you too. A fault off the edge of the viewport is struck off, because
      you were looking elsewhere and could see that you were. A fault that
      was on screen and unobstructed is yours to catch or miss.

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
import { attribute } from "./directions.js";
import { MIN_DURATION } from "./faults.js";

/* How long the screen has to have SHOWN a fault before failing to call it
   counts against you.

   A duration, not a share of the fault's life, and that distinction is
   the whole fairness rule. A share reintroduces exactly what the view
   cone got wrong: a fault visible for a fifth of its duration was shown
   plainly on screen, and calling it unmarkable tells the player they did
   not see something they watched. The honest question is whether it was
   ever on screen long enough to register, and REACTION_FLOOR already
   answers what long enough means -- nobody registers a visual cue faster
   than that.

   Occlusion still gates, because being hidden behind a van is core to
   the game. It is fair only because the renderer is obliged to hide it
   too: THE SCORER MUST NEVER KNOW SOMETHING THE SCREEN DID NOT SHOW.
   See EXAMINER-REDESIGN.md and sight.js. */
export const SHOWN_ENOUGH = REACTION_FLOOR;

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
     shownFor    (fault) -> seconds the screen actually showed it. Injected
                 rather than computed here because it depends on the
                 viewport as well as on sightlines, and the viewport is the
                 camera's business. Defaults to "shown throughout", so a
                 headless caller grading a fault list need not supply it.

   Each fault is matched by at most one mark and each mark to at most one
   fault, nearest-first, so spraying marks cannot farm a single fault. A
   mark only ever pairs with a fault from the same junction, where both
   say which -- see the note in the pairing loop.
   ===================================================================== */
export function scoreDetection({
  faults = [], marks = [],
  shownFor = (f) => f.duration,
}) {
  const markable = [], unmarkable = [];
  for (const f of faults) {
    const shown = shownFor(f);
    // Too brief to be a fault at all, or never on screen long enough to
    // register. Nothing here asks where the player was looking WITHIN the
    // screen -- if it was shown, it was on offer.
    (f.duration >= MIN_DURATION && shown >= SHOWN_ENOUGH ? markable : unmarkable)
      .push({ fault: f, shown });
  }

  /* Pair marks to faults. Best pairing first — the strongest available
     match wins — so the result does not depend on the order either list
     happens to arrive in. */
  const pairs = [];
  for (const m of marks) {
    for (const cand of markable) {
      /* A mark belongs to the junction it was made at. Every leg's clock
         starts near zero, so without this a call at 0.4s on junction 3 is
         indistinguishable from one on junction 1 and gets credited
         against whichever fault the sort happens to reach first -- while
         the fault it was actually for reads as missed and the mark itself
         as invented. Guarded on both being defined, so a caller grading a
         single scene needs neither. */
      if (m.junction != null && cand.fault.junction != null && m.junction !== cand.fault.junction) continue;
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
    hits.push({ fault: p.cand.fault, at: p.mark.at, value: p.value, shown: p.cand.shown });
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
/* =====================================================================
   THE SECTION SHEET

   What the player recorded against what actually happened, for one
   section of a drive — the deferred marking sheet, which is the piece
   that makes the job memory as well as attention.

   Two gradings, kept apart because they are graded against different
   people. The FAULTS are the candidate's and the player is graded on
   catching them. The DIRECTIONS are the player's own, and a late one is
   the examiner's fault rather than the candidate's — which is the
   interlock the whole design rests on: being busy marking makes you late
   with an instruction, and the resulting error is then yours and
   unmarkable.

   Pure, and out of the renderer on purpose: this is the loop's core, and
   a component is the one place in this project nothing can check.
   ===================================================================== */
export function sectionSheet({
  legs = [],            // [{ faults, window, intent }] for this section
  marks = [],           // [{ at, junction, what? }]
  given = {},           // junction -> { at, intent }
  shownFor = (f) => f.duration,
  from = 0,
}) {
  const faults = [];
  legs.forEach((leg, i) => {
    for (const f of leg.faults) faults.push({ ...f, junction: from + i });
  });

  const result = scoreDetection({ faults, marks, shownFor });

  const calls = legs.map((leg, i) => {
    const j = from + i;
    const g = given[j] ?? null;
    const a = attribute(g ? g.at : null, leg.window);
    return {
      junction: j,
      wanted: leg.intent,
      said: g?.intent ?? null,
      verdict: a.verdict,
      blame: a.blame,
      /* Silence means straight on, so a direction never given is a missed
         turn rather than a pause — and one that names the wrong turn is a
         different failure from one that came too late. */
      wrongTurn: Boolean(g) && g.intent !== leg.intent,
      followed: a.followed,
    };
  });

  const onYou = calls.filter((c) => c.blame === "examiner" || c.wrongTurn).length;
  return { from, upTo: from + legs.length, result, calls, directionsOnYou: onYou };
}

export function summarise(r) {
  const bits = [];
  bits.push(`${r.hits.length} caught`);
  if (r.missed.length) bits.push(`${r.missed.length} missed`);
  if (r.invented.length) bits.push(`${r.invented.length} called that never happened`);
  if (r.unmarkable.length) bits.push(`${r.unmarkable.length} you had no sight of`);
  return bits.join(", ");
}
