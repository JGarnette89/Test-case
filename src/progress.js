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

export const emptyProgress = { passed: {}, daily: {} };

let cache = emptyProgress;
let loaded = false;
const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(cache);
}

export async function load() {
  if (loaded) return cache;
  const stored = await readJSON(KEY, emptyProgress);
  cache = { ...emptyProgress, ...stored, passed: stored.passed || {}, daily: stored.daily || {} };
  loaded = true;
  emit();
  return cache;
}

/* =====================================================================
   The daily
   One logged score per day, and it is the FIRST attempt. Replays are
   welcome but they never touch it — a score you can grind at until it is
   good is not a score, and a leaderboard built on one would be a list of
   who had the most spare time.

   Stored per day rather than as a running total so that a leaderboard,
   when it arrives, has something to submit and something to verify
   against. Nothing here goes near a network.
   ===================================================================== */
export function dailyResult(progress, day) {
  return progress?.daily?.[day] ?? null;
}

export function hasPlayedDaily(progress, day) {
  return Boolean(dailyResult(progress, day));
}

/* Records the day's attempt if there is not one already, and reports
   whether this one counted. Returns { counted, result }. */
export async function logDaily(day, entry) {
  if (day == null) return { counted: false, result: null };
  const existing = cache.daily?.[day];
  if (existing) return { counted: false, result: existing };

  const record = { ...entry, at: Date.now() };
  cache = { ...cache, daily: { ...cache.daily, [day]: record } };
  emit();
  await writeJSON(KEY, cache);
  return { counted: true, result: record };
}

/* Consecutive days ending today. What a leaderboard would rank alongside
   the score, and the reason to come back tomorrow. */
export function dailyStreak(progress, today) {
  let n = 0;
  for (let d = today; d >= 0; d--) {
    if (!progress?.daily?.[d]) break;
    n++;
  }
  return n;
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
