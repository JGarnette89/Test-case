/* =====================================================================
   THE RIVALS, CHEAPLY: four named drivers in the world that exists
   (CHARACTERS.md; PLAN.md item 3). Each is an AXIS PROFILE and nothing
   else -- the same five skills and compliance every driver has, set
   rather than drawn -- so the sim turns them into behaviour by the rules
   that apply to anybody. Who they are is cheap; where they live is not,
   and is not here. The point is the maintainer's test: do they read as
   PEOPLE, by their driving alone, before their worlds are built?

   The scale: every skill 0..1, 1 sound; confidence 0..1 with the optimum
   at 0.5 (core/driver.js CONFIDENT_ENOUGH), above it bold, below timid;
   compliance 0..1. What each profile should show, from the sim's own
   mechanisms:

   VICTOR BRAGA -- confidence 1.0 (no caution: the boldest gaps, the
     tightest following, 1.35x the limit, lane changes for any gain into
     a third of a competent gap), compliance 0.15 (rolls stops with nobody
     about, honks soonest, never keeps right, never lets anybody in),
     braking 0.6 (leaves it late and stands on it).
   BRENDA BRAGA -- confidence 0.0 (the timid tail: 0.65x the limit, 1.45x
     the gap, gaps twice anybody's, never honks, lets everybody in),
     compliance 1.0, knowledge 0.3 (stops well short of the line -- a
     controlled stop in the wrong place is KNOWLEDGE, the maintainer's
     ruling -- 2.2 m by the old engine's own 3.2 m).
   MASON "SWERVE" LIN -- confidence 0.85 (bold) with every skill sound:
     fast, changing lane for small gains into tight gaps and making them,
     blending cleanly; compliance 0.5 (neither courteous nor a scofflaw).
   "GRIZZLY" HANNAH MILLER -- every skill sound, observation and steering
     at the top, confidence at the optimum, compliance 0.8: the steady
     expert -- no lag, a line that does not stray, stops where she means
     to, lets you in. Her own ground (gravel, the county) is unbuilt.

   THEY COME AND GO LIKE ANYBODY: when one is not on the map, the next car
   to arrive -- at an edge, or out of a district's curb -- is them, and
   they have no trip to end, so they drive on until they leave by an edge.
   ===================================================================== */
export const RIVALS = [
  { id: "rival-victor", name: "Victor", colour: "#c8202c", ratings: { observation: 0.8, confidence: 1.0, steering: 0.8, braking: 0.6, knowledge: 0.8, compliance: 0.15 } },
  { id: "rival-brenda", name: "Brenda", colour: "#e7c6d9", ratings: { observation: 0.9, confidence: 0.0, steering: 0.9, braking: 0.9, knowledge: 0.3, compliance: 1.0 } },
  { id: "rival-mason", name: "Mason", colour: "#20b8d8", ratings: { observation: 1.0, confidence: 0.85, steering: 1.0, braking: 1.0, knowledge: 0.9, compliance: 0.5 } },
  { id: "rival-hannah", name: "Hannah", colour: "#7a5a2e", ratings: { observation: 1.0, confidence: 0.5, steering: 1.0, braking: 0.95, knowledge: 1.0, compliance: 0.8 } },
];

/* The first rival not on the map, or null. Only cars are rivals. */
export function rivalDue(world, actors, kind = "car") {
  if (!world.rivals || kind !== "car") return null;
  const here = new Set(actors.map((a) => a.id));
  return RIVALS.find((r) => !here.has(r.id)) ?? null;
}

/* A drawn driver made into the rival: their profile's ratings, their name
   and colour, no trip to end. `who` is the result of traffic.js `driver`
   called WITH the rival's ratings, so caution, speed, gap and the rest
   are derived exactly as for anybody. */
export function asRival(car, rival) {
  return { ...car, id: rival.id, rival: rival.name, colour: rival.colour, tripLen: null };
}
