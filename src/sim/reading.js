/* =====================================================================
   WHAT A DRIVER KNOWS ABOUT THE RULES AT AN INTERSECTION (the signs
   design, SIMULATOR.md). Every question a DRIVER asks of the form "what is
   the rule here" is asked here and nowhere else, so that when observation
   arrives -- a sign too far to read, behind a parked van, missed by an
   inattentive driver, known by heart to a local -- it is a change to this
   file and not a hunt through every place that reads a control.

   Two questions, because they are two different acts of perception:

     knownControl   the rule at MY approach -- read off my own sign;
     theirControl   the rule at SOMEBODY ELSE's approach -- which a real
                    driver knows from the back of their octagon, the
                    markings, or the fact that they stopped. Used in right
                    of way: who has to wait for whom.

   What is NOT a driver's question stays outside: where traffic spawns
   (crossing.js `edgesOf`) and what the examiner's sheet counts
   (marking.js) read the map as it is.

   TODAY A PERFECT READER on both: every driver knows every rule, which is
   exactly what the sim did before signs were objects. `verify-signs` holds
   the traffic to identical, tick for tick.
   ===================================================================== */
export const knownControl = (actor, layout, path) => layout.place.control[path.from];
export const theirControl = (layout, path) => layout.place.control[path.from];
