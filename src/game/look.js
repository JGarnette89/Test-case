/* =====================================================================
   HOW THE GAME'S CARS MOVE ON SCREEN, beyond what the shared renderer does (Jay, 25 November: "I want to really overemphasize
   the body motion of the cars, making it easy for the player to see the arrival and movement of vehicles quickly").

   Through the body-motion system's own modifier path (iso/body.js `resolveBody`, `modsOf` reads `a.bodyMods`): no edit to the
   shared renderer, and #/map is unchanged. Every car the game draws, the player's included, gets the same modifiers:
   - `gain` doubles the dive under braking, the squat under power and the lean in a turn: "that one is stopping", "that one
     is going", read at a glance. A real braking stop already reaches the renderer's 10-degree pitch cap at 2 (BODY.car.pitch
     2.0 per m/s^2 x 2.7 m/s^2 x 2 = 10.8); lifting the caps is an edit to iso/body.js, held back until Jay says it is not enough.
   - `zeta` below 1 lets the body bounce and settle after a stop, so a car that has COME TO REST visibly settles.
   All [invented], to dial with Jay.
   ===================================================================== */
export const GAME_BODY = Object.freeze([Object.freeze({ gain: 2.0, zeta: 0.6 })]);

/* The scene as `actorsOf` (apps/MapRoad.jsx) reads it, with every actor carrying the game's body modifiers. A shallow copy a frame
   of a world of a dozen cars: the sim's own world is never touched. */
export function withGameBody(sc) {
  const w = sc.world;
  return { ...sc, world: { ...w, actors: w.actors.map((a) => (a.bodyMods ? a : { ...a, bodyMods: GAME_BODY })) } };
}
