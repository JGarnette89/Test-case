# WORK: game slice 6, the world arrives with you, and a frame of the intersection only (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first,** including "What the player sees". Ignore CLAUDE.md. Read WORK-game-slice5.md and its REVIEW OUTCOME for what exists.

**Jay, after playing slice 5:** "The player is the only car moving when they arrive, i just saw a scene where the user pulled up to the stop line and a truck was frozen in the middle of the intersection the whole time. This plus the wide view makes it impossible to actually see anything right away when it should actually be the most visually busy moment with the user trying to keep track of everything."

**What not to do:**
- no change under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`;
- do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`;
- no merge rounds.
- **The round's rules, verdict and pools do not change.** This slice is what the player sees.

---

## 1. THE WORLD MOVES WHILE THE PLAYER ARRIVES

The freeze stays: the world stops at the decision state and waits for the player (unchanged). What changes is the arrival before it. The traffic must be seen MOVING into the moment it freezes, so the player's eye already has who is going where.

1. **Record the world's arrival.**
   - `toDecisionFrom` keeps the sim's world on each tick of the last `REPLAY` = 2.0 s `[invented]` before the freeze, as `rs.decision.replay = [world, ...]`.
   - The last entry IS the frozen world (the same object, or one equal to it).
   - Recording changes nothing in the sim: the pools' first 30 seeds and every verdict stay as they are.
   - Store what drawing needs and no more. If a world is too large to keep 40 of, say so with its measured size.
2. **Play it during the intro.** Over the intro (`INTRO_END`), the screen draws the recorded worlds in order, from the first to the last.
   - The playback is faster than real time: `REPLAY / INTRO_END` `[D]`. This is arcade, as the screech is (Jay: "realism in speed... isn't a primary concern").
   - **Every other road user moves and its body moves with it** (`withGameBody`, through `actorsOf` as now), so a car braking for its line dives and a truck crossing the box is seen crossing.
   - The player's own car is still the screech (`introAt`), not the replay.
   - At the intro's end the drawn world is the frozen world exactly, so nothing jumps when the button appears.
   - A tap during the intro still skips to its end (the frozen world).
   - **Lengthen `SCREECH` to 0.8 s `[invented]`** so the player has time to take it in (intro 1.05 s with `SETTLE`).
3. **While frozen, a moving car reads as moving.** The frozen frame must keep the motion the player just saw.
   - Every other road user moving faster than `AT_REST` gets a MOTION STREAK: 3 fading lines behind it along its heading, of a length proportional to its speed, `STREAK_S` = 0.5 s of travel `[invented]`.
   - Draw it from the drawn world, every frame, so it fades out as a car stops while the player waits.
   - A pure function in `stage.js`, `streakOf(pose, v)`, returns the line segments in world coordinates. Game.jsx draws them.

---

## 2. THE FRAME IS THE INTERSECTION

Slice 5's frame grew to hold every car arriving within 4 s. At 50 km/h that is 55 m out, so the frame was 50-108 m across and the cars at the lines were small. Jay: "the wide view".

1. **`decisionFrame` fits only:**
   - the box;
   - the player's stop pose;
   - every relevant car whose reason is `line` or `box` (stage.js `whyRelevant`);
   - grown by `FRAME_MARGIN` = 4 m `[invented]`, and never less than `FRAME_MIN_R` = 14 m round the box's centre `[invented]`.
2. **An `arriving` or `holds` car does not shape the frame.** When it is off the screen, it gets the edge badge `holds` cars already have (`edgePoint`, its seconds and a pointer). When it is on the screen, it gets its ring and its seconds as now.
   - Its streak is drawn too when it is on the screen.
3. **The camera holds the frame as now** (eased while waiting, panned by the player, chase after GO).

---

## 3. The check, `tools/verify-rounds.mjs`

Keep every section passing. Change slice 5's frame lines to this frame, and add:

1. **The frame.**
   - The stop pose and every `line` and `box` car project inside the screen (400 x 800 and 800 x 400) on every pooled seed.
   - The frame's longer side is at most 50 m `[invented]` in at least 95% of seeds. Print the median and the widest `[M]`.
   - EXPOSURE: in at least 20% of seeds an `arriving` car is off the screen and gets its edge badge inside the screen by 20 px. Print the count `[M]`.
2. **The replay.**
   - On every pooled seed: the replay spans at least 1.9 s of ticks, its last world's actors equal the frozen world's to 1 cm, and its ticks are in order.
   - EXPOSURE that the world moves in it: in at least 80% of seeds some other road user moves at least 3 m over the replay `[invented]`. Print the share `[M]`.
   - The replay drawn at `t` (the function Game.jsx uses to pick the world for the intro's time, in `stage.js`, pure) is the first world at `t = 0` and the frozen world at `t >= INTRO_END`.
3. **The streak:** `streakOf` returns nothing at rest, and a length of `STREAK_S x v` (stated here) behind the car along its heading. EXPOSURE: some car is streaked at the freeze in at least 50% of seeds. Print the share `[M]`.
4. **Source text:** Game.jsx draws the replay during the intro and the streaks while frozen or waiting.

**Sabotage, two, restored byte-identical** (SHA-1 before and after). Report which lines fired:
- (a) the intro drawing the frozen world throughout (no replay);
- (b) `decisionFrame` fitting `arriving` cars again.

---

## 4. Done and report

As slice 5:
- the build;
- `node tools/check.mjs` (derived), with its `N of M passed` line;
- commit in your worktree; do not push.

Report:
- each check's summary line;
- the frame sizes, the off-screen arriving share, the moving share in the replay, the streak share, and the memory of one replay, all `[M]`;
- the sabotages;
- **every departure from this spec, said plainly.**
