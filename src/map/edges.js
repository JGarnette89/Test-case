/* =====================================================================
   THE FIRST DANGLING END: where a car starts on a map nobody wrote a
   fixed START for. `map/load.js` marks every road end that joined
   nothing as `edge: { start, end }` -- a spawn or despawn point -- and
   this picks the first one it finds, in road order, the same way the
   test map's own start is simply its own north edge.

   Plain JS, no React: `src/apps/MapRoad.jsx` (drive it) and
   `src/apps/Editor.jsx` (is there anywhere to drive from yet) both need
   it, and so does `tools/verify-editor.mjs` -- which could not import
   it from a `.jsx` file at all, since Node's own loader cannot parse
   JSX and every other check already avoids that trap (CLAUDE.md, "the
   import lines at the top of each check ARE the dependency map").
   ===================================================================== */
export function firstEdge(loaded) {
  for (const r of loaded?.roads ?? []) {
    /* `curbLegOf(course, roadId, end)`'s `end` is which end of the ROAD
       touches a NODE -- the leg it returns is the whole approach INTO
       that node, however far back the road runs. So the drivable end
       is the one WITHOUT the dangling flag, not the one with it: for
       "A-north", the north edge is `edge.start`, and the player starts
       at `end: "end"`, the approach into the crossroads it dangles
       from. Gotten backwards once already -- graphOf never builds a
       leg at a dangling end at all, since nothing needs a path from
       there, so asking for one returns nothing and playerOn returns
       null; verify-editor.mjs section 7 is what caught it. A road with
       BOTH ends dangling (an isolated stretch with no node at all,
       stage 0's own two roads' shape) is only a start if no road meets
       a node: it is the first thing anybody draws, and "Drive it" on it
       has to work, but an intersection is the more interesting start
       whenever there is one. The forward curb lane, from the road's
       own start, asked for as a through spot (`curbLegOf` only hands
       those out when asked). */
    if (r.edge?.start && !r.edge?.end) return { road: r.id, end: "end" };
    if (r.edge?.end && !r.edge?.start) return { road: r.id, end: "start" };
  }
  for (const r of loaded?.roads ?? []) {
    if (r.edge?.start && r.edge?.end) return { road: r.id, end: "end", through: true };
  }
  return null;
}
