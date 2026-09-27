/* =====================================================================
   THE MAP LIBRARY: multiple maps as data, throwaway test maps
   first-class. SIMULATOR.md's own requirement for the editor -- one
   autosave slot is not that, it is a single scratch pad. Each map is
   stored under its own key by id; a small INDEX (id, name, when saved)
   is kept separately so listing what exists does not mean loading
   every map's full geometry just to show its name.

   Through src/storage.js, the same adapter chain everything else here
   uses -- degrades to forgetting rather than throwing, the same
   discipline `settings.js` already keeps and for the same reason
   (CLAUDE.md, Do not: never localStorage directly).

   Pure async functions, no React: `src/apps/Editor.jsx` is the only
   caller, and keeping this file free of hooks means the library's own
   logic -- upsert by id, prune the index when a map's own key goes
   missing -- can be checked headlessly (tools/verify-editor.mjs).
   ===================================================================== */
import { readJSON, writeJSON, Storage } from "../storage.js";

const INDEX_KEY = "row.editor.library.v1";
const mapKey = (id) => `row.editor.map.${id}`;

async function readIndex() {
  const idx = await readJSON(INDEX_KEY, []);
  return Array.isArray(idx) ? idx : [];
}
async function writeIndex(idx) {
  await writeJSON(INDEX_KEY, idx);
}

/* Every saved map, newest first. Each entry is `{ id, name, savedAt }`
   -- exactly what a library list needs to draw itself, and nothing a
   caller has to load the full map to get. */
export async function listMaps() {
  const idx = await readIndex();
  return idx.slice().sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

/* Save (or overwrite) a map under `id`, or a fresh one if `id` is
   null -- generated here, not left to the caller, the same discipline
   `editor/model.js`'s own `nextId` keeps for the same reason: two
   drafts saved in the same session must never collide. Returns the
   map as actually stored (id and name set on it, the format's own
   fields carrying the library's bookkeeping rather than a second
   place to keep it). */
export async function saveMap(map, name, id = null) {
  let useId = id;
  if (!useId) {
    /* `Date.now()` alone collides: two saves in the same millisecond
       -- exactly what happened the first time this ran twice in a
       row headlessly -- produced the same id and the second save
       silently overwrote the first instead of creating a new entry.
       Checked against the index, the same "scan what exists, never
       just trust the generator" rule `editor/model.js`'s own `nextId`
       already keeps. */
    const idx = await readIndex();
    const used = new Set(idx.map((e) => e.id));
    let base = `map-${Date.now().toString(36)}`, n = 0;
    useId = base;
    while (used.has(useId)) { n++; useId = `${base}-${n}`; }
  }
  const toSave = { ...map, id: useId, name };
  await writeJSON(mapKey(useId), toSave);
  const idx = await readIndex();
  const savedAt = Date.now();
  const without = idx.filter((e) => e.id !== useId);
  await writeIndex([...without, { id: useId, name, savedAt }]);
  return toSave;
}

/* The map itself, or null if its own key is gone (storage was
   cleared, or refused after the index was written) -- the same
   "corrupt or missing is a fallback, never a throw" rule
   `storage.js readJSON` already keeps. */
export async function openMap(id) {
  return readJSON(mapKey(id), null);
}

export async function deleteMap(id) {
  await Storage.remove(mapKey(id));
  const idx = await readIndex();
  await writeIndex(idx.filter((e) => e.id !== id));
}

/* THE INDEX CAN GO STALE -- a map deleted some other way, or a
   library carried over from before a key changed -- and a library
   screen showing an entry that then fails to open is exactly the kind
   of dead end this project does not ship (CLAUDE.md item 6). Drops
   any index entry whose own map key is missing, and returns the
   pruned list; call it once when the library opens, not on every
   render. */
export async function prunedList() {
  const idx = await listMaps();
  const alive = [];
  for (const e of idx) { if ((await readJSON(mapKey(e.id), null)) != null) alive.push(e); }
  if (alive.length !== idx.length) await writeIndex(alive);
  return alive;
}
