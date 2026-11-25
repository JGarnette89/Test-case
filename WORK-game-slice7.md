# WORK: game slice 7, no clipping, the thumb sets the speed, ghost cars at the edge (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first.** Ignore CLAUDE.md. Read WORK-game-slice6.md and its REVIEW OUTCOME for what exists.

**Jay, after playing slice 6:**
- "I just saw the player car teleport through another car to the stop line, it's okay to be in a queue but clipping through traffic is a no-go."
- "The streaks and numbers are... interesting but the player doesn't have a good frame of reference for how to use them."
- "The car still doesn't quite fully launch from the stop position making the turn unpredictable. Maybe we can add some speed controls? Hold to wait, drag up to move drag up further to move faster?"

**Asked and answered:**
- **Letting go keeps the speed.** The car holds the speed the player dragged to, the autopilot carries it through, and dragging back down brakes.
- **For the cues, Jay:** "Could you implement a ghost car at the edge of the screen that becomes real once the car enters the players actual view? This could simulate the driver simply looking left or right."

**What not to do:**
- no change under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`;
- do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`;
- no merge rounds.

---

## 1. NO CLIPPING DURING THE ARRIVAL

The player's car screeches in along its recorded trail on a warped clock, while the world replays on its own clock (slice 6). So at some instants the player's drawn car stands where another car is drawn.

1. **Measure first.** On every pooled seed, at every 1/60 of the intro, test the player's drawn footprint against every other drawn road user's footprint, as oriented rectangles (each vehicle's own length and width: `lenOf`, and `VEHICLES` or `CAR` for the width).
   - Report how many seeds overlap, and in which configuration (a car ahead, a car behind, a crossing car) `[M]`.
2. **The fix, in this order of preference:**
   - (a) keep the screech, but start it later on the trail (a shorter trail) until no instant overlaps;
   - (b) where no screech of at least 6 m is clear, draw the player at its own pose in the replayed world. That is the sim's own motion, and the sim never overlaps two cars.
   - Decide per decision, in `toDecisionFrom` or `stage.js`, never per frame on the screen.
3. **The invariant, in the check:** on every pooled seed, at every 1/60 of the intro, the player's drawn footprint overlaps no other drawn road user's.
   - EXPOSURE: print how many seeds needed (a) and (b). If none did, the check must still show that some other road user came within 2 m of the player's drawn footprint during an intro, in at least 10 seeds, or say CANNOT TELL.

---

## 2. THE THUMB SETS THE SPEED (Jay's control)

Steering stays automatic (the autopilot keeps its route). The player controls only the speed the car aims for.

1. **A pure function, `src/game/control.js`, `targetOf(dy, size)`:** the drag up from the press point, in pixels, to a TARGET SPEED in m/s.
   - At or under `DEAD` = 14 px `[invented]`: 0 (waiting).
   - Rising to the posted limit (`KMH` from round.js) at `DEAD + RANGE`, with `RANGE` = 0.3 of the screen height `[invented]`. Linear is fine.
   - Never negative, never above the limit.
   - A drag back down lowers it, to 0 at or under `DEAD`.
2. **The input, in Game.jsx:**
   - The first touch on the frozen scene starts the sim (as press does now).
   - While held, the target is `targetOf` of the current drag.
   - **Releasing keeps the last target** (Jay's ruling). A later touch takes over from the target it had: the drag is read from the new press point, added to that target's equivalent offset.
   - The pan and pinch from slice 5 stay outside the control's zone. The control's zone is the lower part of the screen where the button is; make it at least the button's rectangle, extending up by `RANGE`. Say what you chose.
   - **Drawn:** a vertical bar from the press point showing the target (0 to the limit), and the car's current speed beside it, on the canvas. No React state from the frame loop.
3. **The car, in `autopilot.js`:** in the go phase the autopilot aims for the player's target speed, not for full speed.
   - It accelerates at up to `ACCEL_MAX` (as the launch now does) and brakes at up to `HARSH_AT` from traffic.js, so a drag down is felt `[invented: the sim's own harsh threshold as the arcade brake]`.
   - It still slows for the corner (its own corner limit caps the target) and still stops for a car ahead (the stop marker wins). The player can never drive into a queue.
   - A target of 0 stops the car wherever it is. Stopping in the box is the player's doing, and the sim's detectors notice it as for anybody.
4. **GO is when the car starts to move.** The round's GO (`release` today) becomes the first tick at which the target is above 0.
   - Everything that reads GO (timing, `launch`, `failedToYield`, `forcedBrake`, threading) reads it there, unchanged.
   - Keep `press` and `release` as the round's API if that is simplest, called by the control. Say what you did.
5. **`FAST` applies only once the car is clear of the box,** since the player's thumb is driving before that.
6. **The checks' policies** (`tools/lib/round-drive.mjs`): oracle and eager become target speeds, full limit at their moment.
   - The pools' criteria are unchanged.
   - Report whether the first 30 of each pool are unchanged; rebuild with `round-seeds.mjs` if not, and report the sizes.
   - Add a `creep` policy: target 1/3 of the limit from the oracle's moment.

---

## 3. GHOST CARS AT THE EDGE (Jay's cue)

**Remove the motion streaks and the edge badges** (slice 5 and 6) and their check lines. The stopping-order numbers stay, for Jay to judge again.

1. **A relevant car off the screen** (an `arriving` or `holds` car, slice 5, whose drawn pose projects outside the screen) is drawn as a GHOST:
   - a translucent silhouette of that car (its own length, width and heading);
   - standing at the point on ITS OWN PATH, ahead of it toward the conflict, where the path first comes `GHOST_INSET` = 24 px `[invented]` inside the screen.
   - Its opacity rises as the car closes: `GHOST_ALPHA` = 0.25 at `ARRIVE_WITHIN` (4 s) out, to 0.6 as it reaches the edge `[invented]`. Cars further than 4 s (only `holds` cars) are at 0.25.
   - No number on it. It simulates a glance left or right.
2. **The moment the car's own drawn pose is on the screen, the ghost is gone** and the car is drawn as itself (with its ring, as now).
3. **A pure function in `stage.js`, `ghostOf(world, me, a, view, size)`,** returns `{ x, y, z, heading, alpha }` or null. It finds the entry point by walking the car's path (`L.paths[a.route]` geometry, whatever function the sim already uses to pose a distance along a path; import it, do not copy it).
4. **Drawing:** through `drawFrame` with `ctx.globalAlpha` for a second pass of only the ghosts if drawFrame allows it cleanly. Otherwise as a filled footprint quad and a roof quad via `view.P`. Say which.

---

## 4. The check, `tools/verify-rounds.mjs`

Keep every section passing, with the removed lines gone. Add:

1. **No clipping** (section 1 above).
2. **The control:**
   - `targetOf` is 0 at and under `DEAD`, non-decreasing in `dy`, reaches the limit at `DEAD + RANGE` and never exceeds it (stated here).
   - Under the `creep` policy, on every wait seed: the car's speed settles to within 10% of a third of the limit before the box (if the corner allows); the round ends; and there is no contact.
   - Under oracle and eager: the verdicts are those of slice 6 on every pooled seed, or the differences are listed `[M]`.
   - Source text: Game.jsx keeps the target on release, and a drag inside the control zone never pans.
3. **The ghosts:**
   - EXPOSURE: in at least 10 seeds, a relevant car is off the screen at the freeze and gets a ghost.
   - Every ghost projects inside the screen by at least `GHOST_INSET - 1` px, and lies on that car's own path (within 0.5 m of a point on it).
   - Its heading is the path's heading there, to 5 degrees.
   - No car on the screen has a ghost.
   - The alpha is in [0.25, 0.6] and non-decreasing as the car closes, over a waiting run of at least 5 seeds.

**Sabotage, three, restored byte-identical** (SHA-1 before and after). Report which lines fired:
- (a) the intro without the clipping fix;
- (b) release resetting the target to 0;
- (c) a ghost placed at the car's own pose clamped to the screen (not on its path).

---

## 5. Done and report

As slice 6:
- the build;
- `node tools/check.mjs` (derived), with its `N of M passed` line;
- commit in your worktree; do not push.

Report:
- the clipping counts before and after, and how many seeds took (a) or (b);
- the control's constants and the zone you chose;
- the verdict differences;
- the ghost exposure;
- the sabotages;
- **every departure from this spec, said plainly.**

---

## REVIEW OUTCOME (25 November 2026, the planner)

**Built by the executor in `4e3b96f`; the check was adjusted in review in the commit after it.** The derived set passed: `3 of 3 passed` (verify-core, verify-screens, verify-rounds; verify-check-runner was not selected) `[M, node tools/check.mjs --base 90a55f7]`.

### Changed in review (the check only)

- **The creep bar was mine and it was false.** "Within 10% of a third of the limit before the box" cannot happen. The car is at rest at its line, so it crosses the line at 2.71 m/s in every seed and first reaches the target 8.56 m past it. Boxes are 6.05 to 17.35 m deep `[M]`.
  - The executor left it red rather than loosen it, which was right.
  - It is now two lines: the creeping car reaches within 10% of the target in every wait seed (108 of 108), and never goes over 1.1x it (peak 4.47 to 4.60 m/s against 5.09) `[M]`.
  - The executor's extra line ("within 10% by the box's far edge", 90 of 108) is removed. It measured box depth, not the control.
  - **Sabotage of the new lines:** the autopilot aiming for full pace whatever the target (`autopilot.js`, SHA-1 `a124bbe5...` before and after). Fired: the never-over line (peak 9.10 m/s against 5.09), the speed-follows-target line, the brake line and the harsh-threshold line.

### Measured `[M, the executor's runs and the review run]`

- **Clipping:** slice 6's whole trail overlapped another car in 35 of 228 seeds (worst 1.80 m; 23 behind, 12 ahead). After the fix, 0. 193 seeds keep the whole trail, 14 take a shortened screech (6.1 to 21.2 m) and 21 draw the player at its own pose.
- **Verdicts:** oracle and eager are unchanged from slice 6 on all 456 seed-policy pairs. The first 30 of every pool are unchanged.
- **Ghosts:** 47 of 228 seeds have a relevant car off the screen. Every ghost is at least 24.0 px inside, at most 0.137 m off its path, and its heading is exact.
- **The brake is soft:** from 5 m/s a drag to 0 stops the car in 4.75 s, peak 3.01 m/s^2. The autopilot's pull toward the target is proportional, so the braking eases as the car slows. The executor's report said 0.40 s; the check prints 4.75 s.

### Accepted deviations

- Ghost opacity is by distance along the path, not by time.
- The autopilot caps the target at the posted limit, not at PACE times it.
- Lifting the thumb without dragging no longer means GO. GO is the first drag above the dead zone, and a thumb lifted at 0 leaves the car waiting while the world runs.
- Sabotage (c) as the spec wrote it cannot fail on these maps, where every approach projects axis-aligned. The executor's (c2), a ghost 1.5 m off its path and turned 20 degrees, fired the path and heading lines.

### Not verified

How it looks and feels: the drag scale, the bar, the ghosts, the soft brake. The first look is Jay's.
