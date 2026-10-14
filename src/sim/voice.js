/* =====================================================================
   THE VOICE: what, of everything the game noticed, is actually said --
   THE RATE LIMITER (DIALOGUE.md, "the real design problem").

   Twenty-odd triggers firing freely make A.U.T.O. a stream of
   notifications the player learns to ignore, and then the lines that
   matter are ignored too. So speaking is a BUDGET:

   - AT MOST ONE LINE PER GAP (12 s); a severe event (4 and up: a crash, a
     red run, a rolled stop, a blocked box) may speak after URGENT_GAP (4 s).
   - THE MOST SEVERE PENDING EVENT WINS, the most recent among equals.
   - NOTHING STALE: an event not spoken within STALE (3 s) is dropped -- a
     remark about something three seconds ago is about nothing.
   - NOTHING REPEATS IN A SESSION: a line once said is never said again,
     and a trigger, once spoken to, rests TRIGGER_REST (2 min).
   - SPEAKING CLEARS THE QUEUE: what was not said is not saved up.

   Who says it: a fault is A.U.T.O.'s most often, then Jay's, then -- when a
   rival is the other party -- the rival's; praise is Jay's more than
   A.U.T.O.'s. Drawn from the session's own seeded stream, so a session
   replays. Lines carry an optional `when` (day, night, race); a line whose
   context does not hold is not a candidate (Mason's collision line is a
   race's).

   Pure: `speak(state, events, t, lines, ctx)` -> { state, said }.
   ===================================================================== */
import { rng } from "../core/rng.js";

/* Flagged design constants. */
export const GAP = 12;            // s between lines
export const URGENT = 4;          // severity that may speak sooner
export const URGENT_GAP = 4;      // s
export const STALE = 3;           // s an event may wait
export const TRIGGER_REST = 120;  // s before a trigger is spoken to again

export const newVoice = (seed = 1) => ({ seed, n: 0, lastAt: -Infinity, pending: [], rested: {}, used: {} });

const WEIGHTS = { fault: [["auto", 0.6], ["jay", 0.3], ["rival", 0.1]], praise: [["jay", 0.6], ["auto", 0.4]] };

/* The candidate lines for an event, by speaker, in context and unused. */
export function candidates(lines, ev, ctx, used) {
  const all = (lines?.[ev.id] ?? []).filter((l) => !used[l.id] && (!l.when || l.when === ctx?.when || (l.when === "race" && ctx?.race)));
  const by = (sp) => all.filter((l) => l.speaker === sp);
  const rival = ev.rival ? ev.rival.toLowerCase() : null;
  return { auto: by("auto"), jay: by("jay"), rival: rival ? by(rival) : [] };
}

export function speak(state, events, t, lines, ctx = {}) {
  const st = { ...state, pending: [...state.pending, ...events].filter((e) => t - e.t <= STALE && !(t - (state.rested[e.id] ?? -Infinity) < TRIGGER_REST)), rested: state.rested, used: state.used };
  if (!st.pending.length) return { state: st, said: null };
  /* An event with nothing left to say in this context is dropped first: it
     can neither be spoken nor hold the voice for something it outranks. */
  st.pending = st.pending.filter((e) => { const c = candidates(lines, e, ctx, st.used); return c.auto.length + c.jay.length + c.rival.length > 0; });
  const order = [...st.pending].sort((a, b) => b.severity - a.severity || b.t - a.t);
  /* The most severe pending event, and ONLY it: its own gap decides --
     the urgent gap is the urgent event's, never borrowed by a lesser one. */
  for (const ev of order.slice(0, 1)) {
    if (t - st.lastAt < (ev.severity >= URGENT ? URGENT_GAP : GAP)) return { state: st, said: null };
    const c = candidates(lines, ev, ctx, st.used);
    const r = rng(st.seed * 7919 + st.n * 104729 + 13);
    const weights = WEIGHTS[ev.praise ? "praise" : "fault"].filter(([sp]) => c[sp]?.length);
    if (!weights.length) continue;
    const total = weights.reduce((s, [, x]) => s + x, 0);
    let pick = r() * total, speaker = weights[0][0];
    for (const [sp, x] of weights) { if (pick < x) { speaker = sp; break; } pick -= x; }
    const options = c[speaker];
    const line = options[Math.floor(r() * options.length) % options.length];
    return {
      state: { ...st, n: st.n + 1, lastAt: t, pending: [], rested: { ...st.rested, [ev.id]: t }, used: { ...st.used, [line.id]: true } },
      said: { trigger: ev.id, speaker: line.speaker, text: line.text, id: line.id, t },
    };
  }
  /* Nothing left to say to any of them: they go, and the clock does not move. */
  return { state: { ...st, pending: [] }, said: null };
}
