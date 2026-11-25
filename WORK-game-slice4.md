# WORK: game slice 4, framing the decision point and a faster launch (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first.** Its rules hold for every line of this. Ignore CLAUDE.md. Read [WORK-game-slice3.md](WORK-game-slice3.md) and its REVIEW OUTCOME for what exists.

**Jay, after playing slice 3:** "Far shot too wide, it should be easier to see the car approach and stop point. Think how this would need to exist in a round with 2 decision points. Also I'd like to see the user car launch faster to speed up gameplay."

**What not to do in this slice:**
- no change under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`;
- do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`;
- **no two-decision rounds yet.** Section 1 is the design this slice makes room for, not content to build (GAME.md and the maintainer's standing "avoid 50 half-cooked features").

---

## 1. THE DESIGN FOR SEVERAL DECISION POINTS, which this slice must not paint itself out of

A round may later hold several decision points: intersections along the car's route, each with its own task.

**EVERY DECISION POINT IS A CUT, and round start is simply the first:**
1. **Run ahead, off screen.** The sim, unseen, runs the car on its autopilot from wherever it is to rest at that intersection's line, recording its trail. For the first decision that is from the round's start, as `toDecision` does now; for a later one it is from the moment the previous decision's car is clear.
2. **Cut to the decision point's own framing** (section 2): the frozen world at the moment the car came to rest, with the car drawn at its trail's start.
3. **The screech,** the dive in, the settle (slice 3).
4. **The decision,** and its own openings, timing verdict and `failedToYield`.
5. **After GO,** the car drives on; the chase camera follows it until the next cut.

**What that asks of this slice's code:**
- **Split `toDecision` in two.** `toDecision(def, seed, cars)` keeps its signature and calls a new `toDecisionFrom(rs, k)`: from ANY running round state, run on to rest at the line of node `k`, record the trail, freeze, and return the decision state (or `null`).
- **A decision's framing is derived from that decision,** never from the map. It is section 2, called per decision.
- **The per-decision state** (the openings, `decideAt`, `goAt`, the trail, `launch`, `made`, `crossedAt`, the timing) sits in ONE object, `rs.decision`, so that a later slice can keep a list of them.
  - `verdictOf` reads it there.
  - Moving the fields is a refactor: every check line that reads them moves with it, and nothing it judges may change.
  - **If this refactor would touch more than `round.js`, `stage.js`, `Game.jsx` and `verify-rounds.mjs`, stop and report instead.**

---

## 2. THE FAR SHOT FRAMES THE DECISION, NOT THE MAP

`decisionFrame(rs)` in `stage.js` returns the bounds the far shot fits. It is the box holding:
- **the car's trail start** (where its arrival begins) **and its stop point** (the frozen pose);
- **the intersection box:** the node's position, plus or minus the layout's box half-size (`legs[*].boxHalf`, or read how `stage.js` already finds the decision centre);
- **every RELEVANT car at the freeze** (`relevantIds`), each by its drawn pose;
- grown by `FRAME_MARGIN` = 12 m `[invented]` on each side;
- **and never smaller than the decision view's own circle** (slice 2's 45 m radius): the far shot must be at least as wide as where it dives to, or the dive is a zoom-out.

The far shot fits that box (`farCamera`, with the anchor cap the executor found in slice 3), rotated with the player's heading up, centred on the box.

**The trail is longer,** so the approach is something to see: at least `TRAIL_MIN_M` = 24 m `[invented]`.
- `SCREECH` = 1.1 s `[invented]`, quadratic (a constant deceleration, as in slice 3's review).
- That enters at about 44 m/s and stops at about 40 m/s^2 `[D: 2 x 24 m / 1.1 s, and 2 x 24 m / 1.1^2 s^2]`. It is a cinematic; flag it if it looks like a jump.
- `HOLD_FAR` = 0.35 s `[invented]`: shorter now that the shot is close.

---

## 3. A FASTER LAUNCH, AND A SHORTER TAIL

1. **Full throttle from the line.** In `go`, until the car reaches `PACE` of the posted limit, the autopilot asks for the car's full pull-away: `slider = 1`, or `sliderFor(ACCEL_MAX, ...)` from `src/sim/player.js` (2.72 m/s^2 on the flat), where today it caps the wanted acceleration at 1.2 m/s^2. The stop marker for a car ahead still wins, so it never drives into a queue.
   - **This is a fairness change, stated:** the sim's sound driver judges a gap assuming an ordinary launch. Launching at the car's full pull-away gets the player across sooner, so a decision that was safe is still safe.
   - Report, measured, how the pools' oracle and eager results move (section 5).
2. **The round ends sooner after the box:** `CLEAR_BY` from 25 m to 10 m `[invented]`, and `AFTER_END` from 1000 ms to 600 ms `[invented]`.
   - **Report the oracle's time from GO to the end of the round**, before and after `[M]`.

---

## 4. The pools

The launch can change which seeds the oracle passes, so rebuild the pools with `tools/measure/round-seeds.mjs` (same criteria, same car counts) and store them with a new run mark.
- If any type's pool falls under 5, report it.
- **Do not change the criteria.**

---

## 5. The check, `tools/verify-rounds.mjs`

Keep every section passing, with the fields moved (section 1). Add:

1. **The far shot frames the decision.** On every pooled seed, at the far shot's camera:
   - the trail's start, the stop point and every relevant car project inside the screen (400 x 800 and 800 x 400);
   - **the map's bounds do NOT fit inside the screen** (the shot is not the whole map) in at least 90% of seeds `[invented]`. Print the share `[M]`.
   - The decision view's circle fits inside the far shot (the dive is never a zoom-out).
2. **The trail** is at least 20 m (stated here, independent of `TRAIL_MIN_M`).
3. **The launch:**
   - in every `wait` seed under the oracle, the car's speed 1.0 s after GO is at least 2.2 m/s `[invented: 0.8 of ACCEL_MAX for 1 s, allowing for the slider's response]`;
   - print the median `[M]` and the old autopilot's figure measured on the same seeds before your change.
4. **`toDecisionFrom` from a running state.** Take one pooled seed's decision state, step it 3 s past GO with the oracle, and call `toDecisionFrom` toward the same node again. It must return `null`: the car is past that line, so there is no decision there.
   - This is the only exercise the multi-decision path gets until there is content for it. Say so in the check.

**Sabotage, two, restored byte-identical** (SHA-1 before and after). Report which lines fired:
- (a) `decisionFrame` returning the map's bounds;
- (b) the launch capped back at 1.2 m/s^2.

---

## 6. Done means and the report

As slice 3's sections 6 and 7:
- the build;
- the derived `node tools/check.mjs`, pasting its `N of M passed` line;
- commit in your worktree with the attribution lines; do not push.

Report, beyond slice 3's list:
- the oracle's time from GO to the end, before and after;
- the launch speed at 1.0 s, before and after;
- the share of seeds whose far shot is narrower than the map;
- the new pool sizes;
- **whether the field refactor stayed inside the four files.**

---

## REVIEW OUTCOME (25 November 2026, the planner)

**Built by the executor in `464201b`. Accepted without code changes.** The derived set passed: `4 of 4 passed` (verify-check-runner, verify-core, verify-screens, verify-rounds) `[M, node tools/check.mjs --base 48490f2]`.

### Measured `[M, the executor's runs, re-run in review]`

- **The launch:** 1.20 m/s one second after GO before, 2.72 after (oracle, 108 wait seeds).
- **GO to the end of the round:** median 8.05 s before, 4.65 s after (CLEAR_BY 25 to 10 m included).
- **Fairness held:** all 228 oracle runs and 120 eager `now` runs still end through, with 3 stars and no fault.
- **The far shot is narrower than the map in 228 of 228 seeds.**
- **The pools are unchanged by the launch:** their first 30 seeds are slice 3's.

### Sabotages

- **(a) The map's bounds as the frame** fired the map-share line and its exposure line. The other framing lines pass with it, because the whole map holds every point: the share line is the one that catches it.
- **(b) The launch capped at 1.2** fired the 2.2 m/s line.

### Accepted deviations

- `tools/measure/round-seeds.mjs` was a fifth file touched by the refactor: two print lines read the moved fields.
- `toDecisionFrom`'s guard is covered by a positive control and a past-the-line state, not by a sabotage.

### Not verified

How the closer far shot and the 1.1 s screech look. The screech enters at about 44 m/s `[D]`; flag it if it reads as a jump.
