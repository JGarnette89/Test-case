# GAME.md: the short game ("Your Turn", working title)

**Read this instead of CLAUDE.md when you work on the game.** CLAUDE.md is the project's long history, and much of it describes code that no longer exists. This page is what holds for the game. When the two disagree about the game, this page wins. Everything about the simulator itself still follows CLAUDE.md and DECISIONS.md.

The reasoning and Jay's rulings are in [PROPOSAL-SHORT-GAME-2026-11-24.md](PROPOSAL-SHORT-GAME-2026-11-24.md).

## What it is

- **A round:** 20-30 seconds, DRIVEN by the player with the two existing controls, through ONE intersection. The player is put about 100-150 m before it, given a task ("turn left"), and the round ends once they are through it.
- **A set:** five rounds.
- **Its own app:** `play.html` -> `src/game/`. It is not a route in `App.jsx`'s developer menu.
- **It sits on the simulator** (`src/sim/`, `src/iso/`, `src/core/`, `src/map/`) and changes nothing inside it unless a spec says so.

## Rules that hold for every change

1. **NEVER AUTHOR THE ANSWER.** What happened in a round is what the sim's traffic did and what the player's detectors (`src/sim/events.js`) noticed. No round says "the player must wait 3 s". A round is a map plus a seed plus a car count, and when a round needs tension, the seed or the car count is chosen by a MEASURED property of the run, never typed in as a time.
2. **THE MARKING LOGIC EXAMINERS USE IS NOT PUBLIC AND STAYS OUT** (Jay). Faults come from the law and the sim. Anything that turns faults into a grade (stars, a pass) is marked `[invented]` in the code, beside the constant, until Jay rules on it.
3. **NO REACT STATE FROM THE FRAME LOOP.**
   - Measured on Jay's phone: a setState once a second inside `requestAnimationFrame` cost a 133-158 ms frame each time.
   - The world lives in refs, and readouts are drawn on the canvas.
   - React state changes only between rounds: stop the loop first, then set state.
4. **ONE IMPLEMENTATION OF ONE QUANTITY.** Do not copy a function from the sim or the map screen. Import it.
   - The scene and the drawn poses come from `sceneFor` and `actorsOf` in `src/apps/MapRoad.jsx`, as `ExamRide.jsx` already does.
   - Do NOT move those two functions: `verify-carry`, `verify-body` and `verify-preroll` read MapRoad.jsx's source text.
5. **A NUMBER IS MARKED.** Any number in a report or a comment is `[M]` (a run printed it, and say which), or `[D: from..., assuming...]` (derived).
   - Any threshold about what a driver does is `[Jay]` (with his words) or `[invented]`.
   - An instrument's own parameter is `[instrument]`.
6. **A CHECK MUST BE ABLE TO FAIL.**
   - Every negative assertion carries its own line asserting the case arose.
   - Every new check is sabotaged once, by breaking the real code, and the report says WHICH assertion fired.
   - Never loosen a check or a number to make it pass. Report the failure instead.
7. **PHONE FIRST.** 44 px touch targets, `100dvh`, safe-area insets, `touch-action: none` on the canvas.
   - Plain HTTP on the LAN has no clipboard and no wake lock; feature-test those.
   - Storage goes through `src/storage.js`, never `localStorage` directly.
8. **NO ADS, ANALYTICS OR NETWORK CALLS** until Jay asks for them.

## How to check a change

- `npx vite build` must succeed and emit both `index.html` and `play.html`.
- `node tools/verify-screens.mjs` must render the game's screen.
- `node tools/verify-rounds.mjs` is the game's own check.
- `node tools/check.mjs --direct` while iterating. Use `node tools/check.mjs` (the derived set) before saying done; it refuses with `NOTHING CHANGED` on a clean tree.
- You cannot watch the game run here: the preview delivers no animation frames. Verify by reading, by the checks, and by asking Jay to open it.

## Language

North American road terms, American spelling: intersection, curb, crosswalk, yield, turn signal, color, center. Ontario's "licence" for the noun.
