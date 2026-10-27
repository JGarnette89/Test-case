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
  cars: 120,            // how many cars the map is kept topped up to (the maintainer: "a way for me to directly determine how many cars are in the map") -- test map 1's; kept for it
  carsByMap: {},
  assist: "gentle",     // lane-keeping assist (sim/player.js): "off" | "gentle" | "firm" -- the maintainer asked for it, so it starts on, lightly
  keepAwake: false,
  simWorker: false,     // the sim in a Web Worker: OFF by default since 15 October -- on the phone its answers cost 6-9x the step they carried (SIMULATOR.md); on, to measure the fix against    // keep the phone's screen on while testing (src/wake.js) -- the maintainer, 14 October
  shapeOn: true,        // density shaping where a map asks for it (sim/shaping.js, DECISIONS 10.17): off only to compare against, on one build
  clean: false,         // clean mode on #/map: no diagnostic readout, debug controls behind "More" -- for showing the game
  checksOn: false,      // drivers check their mirrors and blind spots and look left-right-left (sim/checks.js) -- built 27 October, off until its gates pass (SIMULATOR IN FLIGHT 31)
  lookAwayOn: false,    // drivers who look away now and then (sim/attention.js) -- OFF AGAIN 22 October: on 3e77206 the maintainer's crossroads at 260 gridlocked with no crash (step 21 -> 72.5 ms, sim 0.56x) -- late starts off the line and a junction held whole by one late car (SIMULATOR item 21). Before that it was on, as the maintainer ruled once it behaved: a glance is never blindness, is taken when it fits, and is the observation axis (DECISIONS 10.19). Off from earlier the same day, when it was blind and random and gridlocked the crossroads; renamed from lookAway then so a saved "on" reset        // the same, PER MAP: a count chosen for one map is not a count for another (the city has 2.5x test map 1's road)
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
