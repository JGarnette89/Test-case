/* =====================================================================
   SETTINGS: what the player chose, kept across visits.

   Through src/storage.js, never localStorage directly (CLAUDE.md, Do
   not): the adapter degrades to forgetting where storage is refused,
   and a private window will hand you a localStorage that throws on
   first write. One document, read once at load and written on every
   change, so a setting is a plain field and nothing waits on storage
   in a frame loop. Defaults are the values the screens shipped with,
   so a first visit is what it always was.
   ===================================================================== */
import { readJSON, writeJSON } from "./storage.js";

const KEY = "row.settings.v1";
export const DEFAULTS = {
  slider: "hold",       // "hold" | "spring": whether the slider stays where it is left
  limit: 50,            // km/h the traffic drives at, where a screen offers a choice
  mode: "drive",        // "drive" | "watch" on the map
};

let current = { ...DEFAULTS };
let loaded = false;

/* Load once. Safe to call more than once; safe under SSR, where there
   is nothing to load from. */
export async function loadSettings() {
  if (loaded) return current;
  try {
    const stored = await readJSON(KEY, null);
    if (stored && typeof stored === "object") current = { ...DEFAULTS, ...stored };
  } catch { /* forgetting is the fallback */ }
  loaded = true;
  return current;
}

export const settings = () => current;

/* Set one field and persist the document. Returns the new settings;
   never throws, because a setting that cannot be kept is still a
   setting for this visit. */
export async function setSetting(key, value) {
  if (!(key in DEFAULTS)) return current;
  current = { ...current, [key]: value };
  try { await writeJSON(KEY, current); } catch { /* kept for this visit only */ }
  return current;
}
