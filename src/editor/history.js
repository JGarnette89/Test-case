/* =====================================================================
   UNDO AND REDO FOR THE WHOLE DRAFT. The model is pure -- every edit
   returns a new map and leaves the old one intact -- so history is a
   list of maps and nothing else: no inverse operations, nothing to keep
   in step with the model as it grows.

   The one judgment in it is COALESCING. Typing "60" into a speed field
   is two changes and one intention; tapping five points of a road
   quickly is five changes and five intentions. So consecutive changes
   merge into one step only when they touch the same single object,
   leave its point count alone, and land within COALESCE_MS of each
   other -- a field being typed into, a heading nudged up and down.
   Anything that adds or removes a point, a road, a zone or a building
   is always its own step, however fast.

   Pure, like the model, so verify-editor.mjs can check it where the
   screen cannot be driven.
   ===================================================================== */
export const HISTORY_MAX = 100;
export const COALESCE_MS = 600;

export function emptyHistory() {
  return { past: [], future: [], last: null };
}

const LISTS = [["roads", "points"], ["zones", "polygon"], ["props", null]];

/* What one change touched, as a key two changes can share, or null for
   a change that must stand alone. Relies on the model's own habit of
   returning untouched objects by reference. */
export function changeKey(prev, now) {
  let key = null;
  for (const [list, pts] of LISTS) {
    const a = prev[list] ?? [], b = now[list] ?? [];
    if (a.length !== b.length) return null;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (key || a[i].id !== b[i].id) return null;
      if (pts && (a[i][pts]?.length ?? 0) !== (b[i][pts]?.length ?? 0)) return null;
      key = `${list}:${a[i].id}`;
    }
  }
  if (key) return key;
  return prev.name !== now.name ? "name" : null;
}

/* `prev` became `now` at time `at`: the history with that recorded. */
export function record(h, prev, now, at) {
  if (prev === now) return h;
  const key = changeKey(prev, now);
  const merge = key && h.last && h.last.key === key && at - h.last.at < COALESCE_MS && h.past.length;
  const past = merge ? h.past : [...h.past, prev].slice(-HISTORY_MAX);
  return { past, future: [], last: { key, at } };
}

/* Step back from `current`: `{ history, draft }`, or null with nothing to undo. */
export function undo(h, current) {
  if (!h.past.length) return null;
  return { history: { past: h.past.slice(0, -1), future: [current, ...h.future], last: null }, draft: h.past.at(-1) };
}
export function redo(h, current) {
  if (!h.future.length) return null;
  return { history: { past: [...h.past, current], future: h.future.slice(1), last: null }, draft: h.future[0] };
}
