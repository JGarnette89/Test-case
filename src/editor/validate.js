/* =====================================================================
   VALIDATE: can a badly drawn map break the sim?

   SIMULATOR.md stage 2 poses this as the question the editor exists to
   answer, and the answer the format was built to guarantee is no
   (section 3.2): `loadMap` normalises, warns, and refuses only an empty
   map or one with no drivable road. This module is the thin bridge
   that lets the editor ask the question of a DRAFT -- a map that may be
   mid-edit, a road with one point, a zone that never closed -- without
   the editor screen importing `map/load.js` and `sim/graph.js`
   directly and without pretending those two are one call.

   Two failure classes, kept distinct on purpose:
     - a WARNING is `loadMap`'s or `graphOf`'s own, a fact about the
       drawn geometry (a bend too tight, a lane with nowhere to land);
     - a CRASH is this module's own job to prevent, because a map still
       being drawn is not yet a map `loadMap` was written to expect
       (points: [] on a road not yet clicked, for instance), and
       "cannot yet be validated" must read as a quiet result, never an
       exception reaching the screen.
   ===================================================================== */
import { loadMap } from "../map/load.js";
import { graphOf } from "../sim/graph.js";

/* Roads and zones too thin to mean anything yet are left out rather
   than handed to `loadMap`, which is written for a finished stroke and
   free to assume at least two points -- a road with zero or one is
   "still being drawn", not "badly drawn", and reporting it as a
   warning on every keystroke would bury the warnings that matter. */
function readyFor(map) {
  return { ...map, roads: map.roads.filter((r) => r.points.length >= 2), zones: (map.zones ?? []).filter((z) => z.polygon.length >= 3) };
}

/* `{ ok, loaded, errors, warnings, crash }`. `crash` is set only if
   something in `loadMap`/`graphOf` threw despite the guard above --
   which validate.mjs's own adversarial battery exists to find, so this
   module can be fixed rather than the screen taught to survive it. */
export function validateDraft(map) {
  const ready = readyFor(map);
  if (!ready.roads.length) return { ok: false, loaded: null, warnings: [], errors: [], reason: "no road has two points yet" };
  let loaded;
  try {
    loaded = loadMap(ready);
  } catch (e) {
    return { ok: false, loaded: null, warnings: [], errors: [], crash: { stage: "loadMap", message: String(e?.message ?? e) } };
  }
  if (!loaded.ok) return { ok: false, loaded: null, warnings: loaded.warnings, errors: [], reason: loaded.error };
  try {
    /* Without the conflict table: the editor needs the authoring errors,
       which are decided before any path exists, and the table is ~99% of
       graphOf's cost -- 600 ms a tap on the test map on a desktop, two or
       three seconds of frozen screen on a phone. "Drive it" builds its
       own full graph through seedGraph, so nothing drives this one. */
    const graph = graphOf(loaded, { conflicts: false });
    return { ok: true, loaded, warnings: loaded.warnings, errors: graph.errors };
  } catch (e) {
    return { ok: false, loaded, warnings: loaded.warnings, errors: [], crash: { stage: "graphOf", message: String(e?.message ?? e) } };
  }
}
