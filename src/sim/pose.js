/* =====================================================================
   WHERE THE PLAYER'S CAR IS, IN THE WORLD -- THE ONE PLACE THAT SAYS SO
   (DECISIONS 10.66, 10.67).

   The player's car is kept as a distance along its route, an offset from
   its line and a heading relative to it. Two things turned that into a
   pose: `driverPose` (drive.js), and the traffic's `poseOf` (crossing.js),
   which has no player's case -- it built the offset from the weave, the
   lane change, the bay and the pass, none of which the player has, so it
   put the player on their route's centreline pointing along it, wrong by
   exactly `off`. encounters.js, shaping.js, placement.js and what a truck
   hides all read that one. Both read this now.

   Imports only the graph, so the traffic can read it without reaching
   for the player's own modules.
   ===================================================================== */
import { poseOnGraph } from "./graph.js";

/* { x, y, z, heading }: the path's pose at their distance along, moved
   across by their line, turned by their heading against the road's. */
export function playerPoseOn(course, me) {
  /* ON NO LANE (drive.js, DECISIONS 10.67): the car's pose is kept in the world itself, and
     its route says only where the traffic last had it. */
  if (me.noLane && me.at) return { x: me.at.x, y: me.at.y, z: me.at.z ?? 0, heading: me.at.heading };
  const p = poseOnGraph(course, me.k ?? 0, me.route, Math.min(me.s, course.at[me.k ?? 0].layout.paths[me.route].length));
  const h = (p.rot * Math.PI) / 180, off = me.off ?? 0;
  return { x: p.x - Math.sin(h) * off, y: p.y + Math.cos(h) * off, z: p.z ?? 0, heading: p.rot + ((me.psi ?? 0) * 180) / Math.PI };
}
