# WORK: game slice 10, a game look for people, signs and intersections (spec, 26 November 2026)

**Read [GAME.md](GAME.md) first.** Ignore CLAUDE.md. Read WORK-game-slice7.md and WORK-game-slice8.md, with their REVIEW OUTCOMEs, for what exists.

**Jay, after slice 8:** "Pedestrians are barely visible. Intersections need a major visual overhaul. Signage is basically unrecognizable."

**What the planner measured** `[M, a Playwright screenshot of play.html at the decision freeze, Pixel 7 viewport, build 31a9d3d]`:
- The decision frame is about 36 m across a 412 px wide phone, about 11 CSS px per metre.
- **A person** is a 0.5 m square box (`src/iso/draw.js`, "A PERSON"), about 6 px across, coloured like the bollards and posts beside them. They cannot be told from street furniture.
- **A stop sign** is a 0.9 m square face seen from above: a dark red sliver on a post. There is no octagon and no word. Signal heads are as small.
- **The intersection** has square corners and no curb. The crosswalk is a few 0.5 m ticks. The stop line is thin.
- Peds and signs are drawn by `src/iso/draw.js` `drawFrame`, which the game calls from `Game.jsx`. That renderer is shared with every developer screen and with the checks.

**THIS SLICE RUNS BESIDE SLICE 9, which is still in review.** Slice 9 also edits `Game.jsx`, including near the `drawFrame` call. Keep your Game.jsx change as small as you can; the planner resolves the conflict at merge.

**What not to do:**
- No change under `src/sim/`, `src/core/` or `src/map/`.
- `src/iso/draw.js` may change ONLY behind the opt-in below. With the option absent, every pixel, call and item is what it was.
- Do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`. No merge rounds.
- Do not change sim geometry (the junction surface, the sidewalks, where a sign stands). This is paint: the sim's places, drawn legibly.

---

## 1. THE OPT-IN

`drawFrame(ctx, canvas, scene, { ..., look = null })`.
- `look: "game"` turns on everything below. Only `Game.jsx` passes it.
- With `look` absent or null, `drawFrame` must take exactly the old code path: no new allocations and no new calls. Put each change behind one `const game = look === "game"` test, read once per frame.

## 2. PEOPLE ON FOOT (game look)

A person reads as a PERSON at a glance, never as a post.
- **A map symbol, larger than life** (as signs already are):
  - a body box of about 0.9 m by 0.6 m by 1.8 m, its colour from a high-visibility palette that no car, post or bollard uses `[invented]`;
  - a head, a skin-toned disc or small box on top;
  - a dark outline;
  - a soft ground shadow, as cars have.
- **A floor in pixels:** the figure is never under 18 px tall on screen, whatever the zoom `[invented]`.
- **A walking person shows it,** by a leg swing or a bob from the sim's own clock (`scene.t`), never from React state.
- **Struck:** keep the existing lying, flashing figure, at the new size.
- **Depth:** a person is still sorted as layer 1 by its foot, so a car in front still hides them. `verify-paint`'s person audit must still pass with the game look (section 5).

## 3. SIGNS (game look)

A sign reads as its real-world shape at a glance. Draw each as a **flat face turned to the camera** (a billboard) at the head of its post, the post still drawn in the world.
- **Size:** at least 26 px across on screen and at most 56 px `[invented]`, scaled with zoom in between.
- **STOP:** a red octagon with a thin white border and a white "STOP" in bold sans-serif.
- **ALL WAY:** where `s.allWay`, a small plate under the octagon reading "ALL WAY", white letters on red `[invented, for Jay to confirm the Ontario tab's colours]`.
- **YIELD:** a downward-pointing triangle, a red border on white, with no text `[invented, for Jay]`.
- **SIGNAL:** a vertical black housing with three round lenses, red at the top. The lit lens is bright, with a glow; the dark ones are dim. Where `hasArrow`, a fourth small lens carries a green arrow. The light comes from the same calls as now (`lightAt`, `arrowAt`), never a second implementation. The stop line keeps its colour in its light, as it has now.
- **SPEED LIMIT:** a white upright rectangle, "MAXIMUM" small and the number large, in black.
- **ONE WAY, DO NOT ENTER, NO LEFT TURN:** their real shapes:
  - one way: a black rectangle with a white arrow and the words;
  - do not enter: a red disc with a white bar;
  - no left turn: a white square with a black left arrow and a red ring and slash.
- **Depth:** a sign face is painted at its post's depth, layer 1, as now, so a truck in front still hides it. A face over a car behind it is correct.
- **Cache** the face's path or offscreen canvas per kind and per size bucket. Do not build text glyphs every frame for every sign. Say what you cache.

## 4. THE INTERSECTION (game look)

It should read as a real Ontario intersection at a glance.
- **Curb returns:** each corner where two legs' sidewalks meet is ROUNDED. Paint an asphalt fillet into the corner and a curb line along the arc.
  - The radius is about 5 m `[invented]`, never more than the corner allows.
  - Derive the corners from the junction's own surface and the legs' edges. Do not move the sim's surface.
  - If the sidewalk would then show over the fillet, paint the fillet after the sidewalks and before layer 1.
- **A curb:** a light concrete edge line between the asphalt and the sidewalk, along each leg in view and round each return.
- **Crosswalks:** "continental" bars, wide white blocks running in the direction of travel and spanning the whole crossing.
  - Each bar is about 0.6 m wide with 0.6 m gaps `[invented]`, never under 3 px wide on screen.
  - Use the sim's own crosswalk lines (`j.lines` that are neither stop, yield nor signal) for where they are and how long. Draw them bolder and denser; never somewhere else.
  - `[invented, for Jay: Ontario intersections also use two parallel lines; continental is chosen for reading at a glance]`.
- **Stop lines:** a solid white bar about 0.6 m deep, floored at 6 px `[invented]`.
  - A signal's line stays in its light.
  - A yield line becomes the "shark's teeth", a row of white triangles pointing at the driver who yields `[invented, for Jay]`.
- **Everything is paint on layer 0 or 0.5**, under every car and person, as the current lines are.

## 5. THE CHECK, `tools/verify-rounds.mjs` (and verify-paint)

Keep every section passing. Add, with a recording canvas stub that logs calls (verify-paint has one to start from):

1. **The default is untouched.** On the same scene, `drawFrame` with no `look` and with `look: null` gives the same call log, and the source shows every game branch behind the one `game` test.
   - Run the derived set, `node tools/check.mjs`. Since draw.js changes, it will select `verify-paint`, `verify-screens` and others. Quote its `N of M passed` line and the names it ran.
2. **People are visible:** on a decision scene with people on foot in view, under the game look, every person's painted extent is at least 18 px tall `[M]`. Print the smallest.
3. **Signs are their shapes:** every sign in view paints a face at least 26 px across `[M]`.
   - A stop sign's face is an 8-vertex path filled red, with the text "STOP".
   - A signal's face has three lenses, and exactly the one `lightAt` returns is the bright colour.
   - Print counts per kind. Assert the case arose: at least one stop sign, and a signal if a pooled seed has one (else say "cannot tell" for signals).
4. **The intersection:** at least one curb-return arc is painted per corner in view; the crosswalk bars are at least 3 px wide; and every layer-0 game item is painted before every layer-1 item `[M]`.
5. **Depth still holds:** `verify-paint`'s person and car audits pass with the game look as well as without. Add the game look to its scenes, or say why not.

**Sabotage, two, restored byte-identical** (SHA-1 before and after). Report which lines fired:
- (a) the game not passing `look: "game"`;
- (b) one game-look branch running without the `game` test, the person's size say.

## 6. SEE IT

Take screenshots and read them yourself: Playwright and Chromium run here, and a headless page DOES get animation frames.
- Run `npx vite --port 5180`.
- Open `/play.html` in a Pixel 7 device profile, press Play, and screenshot at the freeze. Repeat for at least 3 rounds, including one with a person on foot near the crossing.
- Save them in `tools/scratch/slice10/` (ignored, never committed).
- The screenshot script lives in tools/scratch too.
- Look at each one before reporting: can you tell a person, a stop sign and the crosswalk at a glance?

## 7. Done and report

As slice 8:
- the build;
- `node tools/check.mjs` (derived), with its `N of M passed` line;
- commit in your worktree; do not push.

Report:
- what each element looks like now;
- the screenshot paths;
- the measured sizes;
- the sabotages;
- what you could not do;
- **every departure from this spec, said plainly.**
