/* =====================================================================
   ROUTES
   Data, like the scenarios. A route names intersections in order; the
   planner works out which way you arrive at each one and rotates it to
   suit, so a scenario written for a southern approach is reusable from
   all four.

   `endOn` lists the verdicts that stop a run where it stands. A collision
   is a fail on a road test, so it is the default. Undue delay and going
   early cost you points but the drive continues, which is also what
   happens in real life.
   ===================================================================== */

export const ROUTES = [
  {
    id: "test-drive",
    title: "Test drive",
    blurb:
      "Three intersections, straight through each one. Built to check that a route runs end to end and keeps score.",
    legs: ["opposite", "signalled", "liar"],
  },
  {
    id: "turning-run",
    title: "Across town",
    blurb:
      "A left turn mid-route, so the next intersection is met from the far side and the right-hand rule changes with it.",
    legs: ["silent", "gap", "wanderer"],
  },
  {
    id: "read-the-room",
    title: "Read the room",
    blurb:
      "Every leg carries a driver who is telling you something. Nothing here is decided by arithmetic alone.",
    legs: ["wanderer", "sleeper", "creeper", "lateflag"],
  },
];

export const routeById = (id) => ROUTES.find((r) => r.id === id) || null;
