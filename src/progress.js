/* =====================================================================
   PROGRESS
   What the player has cleared. Small enough not to need a state library:
   a module-level record, a persist on write, and a subscription so the
   home screen and the game see the same thing without prop drilling.

   A situation is "cleared" on a clean verdict — not on a collision, not
   on going early, not on undue delay. Scoring low but legally is still a
   pass, because the thing being taught is the judgment; speed is what the
   score is for.
   ===================================================================== */
import { readJSON, writeJSON, isPersistent } from "./storage.js";

const KEY = "row.progress.v1";

export const emptyProgress = { passed: {} };

let cache = emptyProgress;
let loaded = false;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(cache);
}

export async function load() {
  if (loaded) return cache;
  const stored = await readJSON(KEY, emptyProgress);
  cache = { ...emptyProgress, ...stored, passed: stored.passed || {} };
  loaded = true;
  emit();
  return cache;
}

export function isPassed(progress, id) {
  return Boolean(progress?.passed?.[id]);
}

export function passedCount(progress) {
  return Object.keys(progress?.passed || {}).length;
}

export function bestScore(progress, id) {
  return progress?.passed?.[id]?.best ?? null;
}

/* Records a clean run. Keeps the best score rather than the latest, so
   replaying a situation can never take a result away from you. */
export async function markPassed(id, score) {
  if (!id) return cache;
  const prev = cache.passed[id];
  const best = Math.max(prev?.best ?? 0, score ?? 0);
  cache = {
    ...cache,
    passed: { ...cache.passed, [id]: { best, cleared: (prev?.cleared ?? 0) + 1 } },
  };
  emit();
  await writeJSON(KEY, cache);
  return cache;
}

export async function reset() {
  cache = emptyProgress;
  emit();
  await writeJSON(KEY, cache);
  return cache;
}

export { isPersistent };

/* React binding. Deliberately not a context: there is one progress record
   for the whole app and nothing to scope it to. */
import { useState, useEffect } from "react";

export function useProgress() {
  const [p, setP] = useState(cache);
  useEffect(() => {
    listeners.add(setP);
    load().then(setP);
    return () => listeners.delete(setP);
  }, []);
  return p;
}
