# GAME.md: the short game ("Your Turn", working title)

**Read this instead of CLAUDE.md when you work on the game.** CLAUDE.md is the project's long history, and much of it describes code that no longer exists. This page is what holds for the game. When the two disagree about the game, this page wins. Everything about the simulator itself still follows CLAUDE.md and DECISIONS.md.

The reasoning and Jay's rulings are in [PROPOSAL-SHORT-GAME-2026-11-24.md](PROPOSAL-SHORT-GAME-2026-11-24.md).

## What it is

- **A round is ONE DECISION (Jay, 25 November).** His words: "Boring. The gameplay needs to be even faster... just a cut to the car pulling up to the decision point and the scene freezes. The player press go immediately or they can hold 'wait' and the simulation continues so the player can wait for their correct timing."
  - The car is already stopped at the line, and the scene is frozen.
  - The player either goes now, or holds WAIT while the sim runs and lets go when it is their turn.
  - The car then drives itself through, and the traffic answers the decision.
  - This supersedes slice 1's driven round (24 November), which stays in git history.
- **A set:** five rounds.
- **Its own app:** `play.html` -> `src/game/`. It is not a route in `App.jsx`'s developer menu.
- **It sits on the simulator** (`src/sim/`, `src/iso/`, `src/core/`, `src/map/`) and changes nothing inside it unless a spec says so.

## What the player sees (Jay, 25 November)

Jay: "The wide shot still includes way too much information... cars shown at the extremes of the road are completely irrelevant but we are sacrificing what we need to actually see (the stopping order of cars at the intersection or decision point)... realism in speed and acceleration/stopping isn't a primary concern here, read the scene, thread the needle if need be and get into traffic... An extreme wide shot is hard to read at a glance on a phone unless the user can pan around."

- **Show only what decides the decision:**
  - who is at the lines and in what order they stopped;
  - who is in the box;
  - who arrives in the next few seconds.
  The rest of the road is scenery, not information.
- **Speed is arcade.** Fast in, fast out. The rules of the road are not arcade: right of way is what the round is about.
- **Panning is the player's choice,** never the default framing.
- **The arrival is the busiest moment, not a still one (Jay, 25 November, after slice 5).** His words: "The player is the only car moving when they arrive... a truck was frozen in the middle of the intersection the whole time... it should actually be the most visually busy moment with the user trying to keep track of everything." The traffic is seen moving into the freeze, and a car that was moving still reads as moving once frozen.

## The merge as the same test (design, NOT BUILT)

The decision point is the end of an acceleration lane, or the point where a merge has to be judged.

- **Frozen,** as at an intersection, with the player's car in the acceleration lane.
- **Shown:** only the target lane's cars beside and behind the player within a few seconds, with the gaps between them, and a courtesy offer if a driver gives one (`sim/courtesy.js` exists).
- **Prompts, not driving:**
  - SIGNAL (tap). The traffic reads the signal, since courtesy gaps answer only a signalling player.
  - Then SPEED UP or EASE OFF (two zones) to line up with a gap.
  - Then MERGE (let go) when the gap is beside you.
- **The verdict comes from the same places as at an intersection:**
  - whether the signal came first;
  - whether a driver in the target lane had to brake harder than comfortable;
  - the time margin to the car behind;
  - whether the lane ran out (`sim/lanechange.js`, `map/accel.js`, `verify-merge` hold the sim's side).
- **Not built.** It waits on the intersection version being right.

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
