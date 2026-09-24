/* =====================================================================
   PERMITTED MOVEMENTS AND LANE CONNECTIVITY: properties of the network.

   Until 24 September one rule was applied at every intersection: a right
   from the curb lane, a left from beside the centre line, straight on in
   the same lane "or the nearest the road ahead has" -- which, for three
   lanes going straight into two, quietly merged two lanes into one
   INSIDE the box. The maintainer's rulings:

     "left turns should be from the lane beside the center line (unless
     it's a double left turn intersection) and right turns from the
     furthest right lane (again, unless it's a double turning lane). the
     intersection and connecting roads really make the final
     determination there, but in general left turns from the furthest
     left, right from the far right."

     "middle lane should be able to turn left or right, and these will
     always need to be connected to roads that can accommodate these
     turns, or the lanes need to converge ahead of the intersection."

   So a lane's PERMITTED MOVEMENTS are a property it carries, defaulting
   to the general rule (`defaultTurns`) and overridden where the map says
   so (a road end's `turns`, one list per lane from the centre line out:
   a double left is two lanes that list "left"). And every permitted
   movement has to LAND somewhere: the lanes making a movement are paired
   with the destination's lanes in order from their own side (`receive`)
   -- the k-th left lane into the k-th lane from the centre line, the
   k-th right lane into the k-th from the curb, straight lanes in order
   from the centre -- and a lane with nowhere to land is an AUTHORING
   ERROR, named, at the lane and the intersection. It is refused when the
   map is written, the way a tile's runway is (verify-tiles), rather than
   discovered when a car drives into a wall -- and it matters most once
   the people drawing maps are not the people who wrote this.

   What this does not build, and SIMULATOR.md 1.1.15 designs: a lane
   count that changes ALONG a road -- the lane drop or merge ahead of an
   intersection that is the maintainer's other legal answer ("or the
   lanes need to converge ahead"). Until it exists, the only fixes an
   author has are the destination's lanes and the approach's permitted
   movements.
   ===================================================================== */
export const MOVES = ["left", "straight", "right"];

/* THE GENERAL RULE, for an approach of `count` lanes at a node offering
   the movements in `exits`. Lane 0 is beside the centre line. */
export function defaultTurns(count, exits) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = [];
    if (exits.has("left") && (i === 0 || count === 1)) t.push("left");
    if (exits.has("straight")) t.push("straight");
    if (exits.has("right") && (i === count - 1 || count === 1)) t.push("right");
    /* A lane the rule leaves with nothing -- the middle lane at a T, where
       there is no straight on -- may turn either way (the maintainer). */
    if (!t.length) { if (exits.has("left")) t.push("left"); if (exits.has("right")) t.push("right"); }
    out.push(t);
  }
  return out;
}

/* WHERE EACH LANE MAKING `move` LANDS, in a destination of `toLanes`
   lanes: `map[fromLane] = toLane`, and `excess` the lanes with nowhere
   to go. Paired in order from the movement's own side, so a double left
   fills the two lanes beside the centre line and a double right the two
   at the curb. */
export function receive(turns, move, toLanes) {
  const from = [];
  turns.forEach((t, i) => { if (t.includes(move)) from.push(i); });
  const order = move === "right" ? from.slice().sort((a, b) => b - a) : from;
  const map = {}, excess = [];
  order.forEach((i, k) => {
    if (k >= toLanes) excess.push(i);
    else map[i] = move === "right" ? toLanes - 1 - k : k;
  });
  return { map, excess };
}

/* An override read off the map, checked: one list per lane, only
   movements that exist here. Returns the lists, or null and why. */
export function checkTurns(given, count, exits) {
  if (given == null) return { turns: null };
  if (!Array.isArray(given) || given.length !== count) return { turns: null, why: `lists ${Array.isArray(given) ? given.length : "no"} lanes' movements for a ${count}-lane approach` };
  const bad = given.flatMap((t, i) => (Array.isArray(t) ? t : []).filter((m) => !MOVES.includes(m) || !exits.has(m)).map((m) => `lane ${i} "${m}"`));
  if (bad.length) return { turns: null, why: `names a movement this intersection does not offer (${bad.join(", ")})` };
  return { turns: given.map((t) => (Array.isArray(t) ? t.slice() : [])) };
}
