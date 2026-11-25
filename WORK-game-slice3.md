# WORK: game slice 3, the snap decision's staging (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first.** Its rules hold for every line of this. Ignore CLAUDE.md. Read [WORK-game-slice2.md](WORK-game-slice2.md) for what exists, and its REVIEW OUTCOME for what changed in review.

**Jay's direction, after playing slice 2:** "It should feel like a snap decision, the game state begins with the world waiting, and an extreme zoomed out view. The player should see their car screech into the hold position, and see the relevant traffic."

**Asked and answered:** after the screech, the world STAYS FROZEN until the player acts. There is no timer. The snap comes from the staging.

**This slice is PRESENTATION ONLY.** The round's rules, its verdict, its pools and `failedToYield` do not change.

**What not to do in this slice:**
- no change under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`;
- do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`;
- no audio (it may come later; note in the report anything you would need for it).

---

## 1. What the player sees, in order

1. **THE WORLD WAITING, FROM FAR AWAY.**
   - The round opens on the frozen decision state (`toDecision`, as now), seen from an extreme zoom-out.
   - The whole round map (its loaded bounds, about 500 m across) fits the screen. Use `iso/freecam.js` `fitK` for the zoom.
   - Rotation: the player's heading points up.
   - Everything is still, and the relevant cars are marked (section 2). The player's car is NOT at the line yet: it is at the start of its screech (section 3).
2. **THE SCREECH.**
   - The player's car plays its arrival into the hold position quickly and hard: fast, an abrupt stop, the nose diving, a bounce as it settles, skid marks on the road behind it.
   - Over the same time the camera dives from the far view into the decision view, landing as the car settles.
   - The rest of the world stays frozen throughout: the world is waiting.
3. **THE DECISION,** exactly as now: `HOLD TO WAIT · LET GO TO GO`, the frozen world, the task on screen.
   - The button is shown and accepted only once the screech has ended.
   - A tap DURING the intro skips to its end. It does not count as a decision.
4. After GO, as now.

**Durations, all `[invented]`, to dial with Jay:**
- the far shot holds for `HOLD_FAR` = 0.5 s;
- the screech and the camera dive take `SCREECH` = 0.8 s;
- the settle bounce takes 0.4 s more.
- The whole intro is about 1.7 s. Keep these in one place, with their marks.

---

## 2. THE RELEVANT TRAFFIC, `src/game/stage.js` (new, pure)

`relevantIds(world, me)` returns the ids of the cars that matter to the player's decision at this node:
- other road users at the player's node (`crossing.js` `atNode`);
- whose path CONFLICTS with the player's route there (`crossing.js` `conflictOf(layout, me.route, them.route)` is non-null);
- who are not yet past that conflict (their `s` is at most the conflict's `clearOf`, as `blockedBy` reads it).

It is derived from the sim's own geometry and never typed in. No other car is ringed.

**Drawn:**
- an amber ring round each relevant car, as MapRoad draws its picked-driver ring: `viewOf(k, cam, rot, size).P` and `ctx.arc`;
- the ring's radius in SCREEN pixels at least 14 px, so a car a few pixels long at the far zoom still reads;
- the player's own car in a white ring during the far shot only.

**Recomputed every frame from the drawn world,** so a car that passes the conflict while the player waits loses its ring, and a new one arriving gains one.

---

## 3. THE SCREECH, in `src/game/round.js` and `stage.js`

1. **Record the arrival.** `toDecision` keeps the player's drawn pose (`drive.js` `driverPose(me, course)`) and speed on each of the last `TRAIL` = 3.0 s `[invented]` of sim ticks before the freeze, as `rs.trail = [{ x, y, z, heading, v, t }]`.
   - The last entry IS the frozen pose.
   - Recording changes nothing in the sim.
2. **Play it back fast.** `screechAt(trail, u)` for `u` in [0, 1] returns `{ x, y, z, heading, pitch, roll }`. It is the trail resampled by distance along it, with a time warp so the car arrives FAST and stops ABRUPTLY. Take `u' = 1 - (1 - u)^3` as the share of the trail's length covered: fast at the start, abrupt at the end.
   - **This is a cinematic,** stated in the code: the sim's own approach braked comfortably and is untouched. No `harshBraking` comes of it, because the approach's events are not the player's (slice 2).
3. **The body during the screech:**
   - the nose dives hard: pitch about -10 degrees `[invented]` at full braking, as the playback decelerates;
   - after `u = 1`, the car SETTLES: a damped bounce of the pitch back to level over 0.4 s (one overshoot nose-up, then rest).
   - Pass it to `drawFrame` as the player actor's `body: { roll: 0, pitch, pivot: 0.35 }` (radians; see `iso/body.js` `bodyOf` for the shape it returns). Replace the player's body only during the intro. Every other car keeps its own (`withGameBody`).
4. **Skid marks:**
   - two dark lines (the rear wheels, about 0.8 m either side of the car's centre line);
   - on the road along the last `SKID` = 12 m `[invented]` of the trail;
   - drawn under the car if you can, otherwise over the road at low alpha, and say which.
   - They stay for the rest of the round.

---

## 4. The intro camera, `stage.js`

`introCamera(t, far, decision)` returns `{ cam, rot, k }`:
- for `t` from 0 to `HOLD_FAR`, the far view;
- then, over `SCREECH`, eased into the decision camera (the one Game.jsx already computes), with zoom and position eased TOGETHER so the player's car stays on screen throughout.
- **The far view's centre is the map's centre,** or the point that keeps the player's car and the intersection both on screen if that differs; say which you used.

---

## 5. The check, additions to `tools/verify-rounds.mjs` (a new section)

State the expectations in the check. Do not read them from `stage.js`.

1. **The trail.**
   - On every pooled seed: its last entry is the frozen pose, to 1 cm.
   - It covers at least 10 m of road (EXPOSURE that there is an arrival to show). Print the shortest `[M]`.
   - Its distance along is non-decreasing.
2. **`screechAt`:**
   - `u = 0` is the trail's first pose and `u = 1` the frozen pose, each to 1 cm;
   - the distance covered is non-decreasing in `u`;
   - the last tenth of `u` covers less than a tenth of the distance (the stop is abrupt).
3. **Relevance, over every pooled `wait` seed:**
   - every car `blockedBy` says holds the sound driver at the freeze is ringed;
   - no ringed car's path fails to conflict with the player's (`conflictOf` non-null, stated in the check by its own call);
   - EXPOSURE: at least one car is ringed at the freeze in at least 80% of wait seeds `[invented]`. Print the share `[M]`.
4. **The camera.**
   - At `t = 0` all four corners of the map's bounds project inside the screen (a 400 x 800 box and an 800 x 400 box), through `viewOf`.
   - At the intro's end it equals the decision camera to 1 cm and 1e-6 in `k`.
   - The player's car projects inside the screen at every 1/20th of the intro.

**Sabotage, two, restored byte-identical** (record the SHA-1 before and after). Report which lines fired:
- (a) `relevantIds` without the "not yet past the conflict" test;
- (b) `screechAt` linear in `u`.

---

## 6. Done means

- `npx vite build` succeeds with both entries. If the worktree has no `node_modules`, `npm ci` there, and do not commit it.
- `node tools/check.mjs` (the derived set) passes. Paste its `N of M passed` line. It should be verify-core, verify-screens, verify-rounds and perhaps verify-check-runner; if it lists more, find out why before running it.
- Commit in your worktree, with the attribution lines as in slice 2 (Co-Authored-By naming your own model, and the Claude-Session line). **Do not push.**

## 7. Report

Report back briefly:
- the files changed;
- each check's summary line, verbatim;
- the trail's shortest length and the relevance share `[M]`;
- the sabotage results;
- where the skid marks are drawn;
- **anything that did not work or that this spec got wrong, said plainly.**
