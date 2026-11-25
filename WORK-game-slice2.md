# WORK: game slice 2, the round as one frozen decision (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first.** Its rules hold for every line of this. Ignore CLAUDE.md. Read [WORK-game-slice1.md](WORK-game-slice1.md) section "REVIEW OUTCOME" for why `failedToYield` is written the way it is.

**Jay's ruling, after playing slice 1:** "Boring. The gameplay needs to be even faster, let's try just a cut to the car pulling up to the (decision point) and the scene freezes. The player press go immediately or they can hold 'wait' and the simulation continues so the player can wait for their correct timing." He also said slice 1 "ran butter smooth" and he "didn't notice any wrong calls".

**What not to do in this slice:**
- no ads, no daily set, no sharing, no new art;
- no change to anything under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`. Any edit there puts dozens of slow checks in the derived set; if you find you need one, STOP and report why;
- do not touch `sceneFor` or `actorsOf` in `src/apps/MapRoad.jsx`;
- do not change `tools/lib/good-driver.mjs`.

---

## 1. The round, as the player sees it

1. **The cut.** The round opens with the player's car ALREADY AT REST AT ITS STOP LINE, at the front, its stop counted. The scene is FROZEN. The task is on screen ("Turn left"), and the car's turn signal is already on for it.
2. **The decision.** One large button with the label `HOLD TO WAIT · LET GO TO GO`:
   - **while it is held, the sim runs** and the car stays at the line;
   - **letting go is GO**, so a quick tap is "go now";
   - on a desk, the space bar does the same.
   - Before the first press the scene stays frozen as long as the player likes.
   - **This reading of the ruling is the planner's, `[invented]`.** Releasing does not re-freeze, so the waiting is done in real time. Jay may want a separate GO button with a WAIT that re-freezes on release; keep the input handling in one small function so that is a one-line change.
3. **After GO, the car drives itself** through the intersection on the task's route, at the pace a sound driver would. The traffic answers whatever the player decided. The round ends `through`, on contact, or on the time cap.
4. **The result,** then the next round. A set of five rounds should take about a minute.

---

## 2. Files

| file | what |
|---|---|
| `src/game/autopilot.js` | NEW, pure. `autoInput(me, world, { task, phase })` returns `{ steer, slider, signal }`: the player's car driven as a sound driver. See section 3. |
| `src/game/round.js` | REWRITE around phases (section 4). Keep `failedToYield` exactly as it is now: the pull-away is the GO. Keep `sceneArgs`, `roundWorld` and `verdictOf`'s shape. |
| `src/game/rounds.js` | REWRITE: four round TYPES, each with seed POOLS chosen by measurement (section 5). |
| `src/game/words.js` | ADD the new words (section 6). |
| `src/game/Game.jsx` | REWRITE the round screen (section 7). Keep the title and summary phases. |
| `tools/lib/round-drive.mjs` | REWRITE: drive a round with a scripted decision (section 8). |
| `tools/measure/round-seeds.mjs` | REWRITE: build the pools (section 5). |
| `tools/verify-rounds.mjs` | REWRITE (section 8). |

---

## 3. The autopilot, `src/game/autopilot.js`

It drives the player's car through `stepDriver`, as the player's two controls would. Base it on `tools/lib/good-driver.mjs` `goodInput`:
- cruise by `sliderFor` toward 0.95 of the posted limit;
- `aheadOf(me, course, world).stop` as the slider marker, `slider = min(slider, stop.at)`;
- lane-keeping `steer = -(me.off) * 0.25 - me.psi * 2.5`;
- `assist: 0`.

**Do not import from `tools/`**: `src/` must not depend on it. In a comment at the top, list what you took from `goodInput` and what you left out.

Phases:
- **`approach`:** drive to the stop line and come to rest there. Signal the task from the start, which is more than the 2-3 s ahead the law asks. Be at rest within 2 m of the line (`path.stopAt`) with `me.stoppedAt` set.
- **`hold`:** brake (`slider = -0.3` or lower), signal on.
- **`go`:** pull away and drive the route.
  - **Until the car is past its stop line, IGNORE a stop marker whose `line` is true.** The player decided to go; the sim's own right-of-way line must not stop them. `stopFor` builds its marker from `whatStops`, which can put the line back.
  - KEEP following a car ahead in the lane (a marker with `line` false).
  - Past the line, everything as normal.
  - Report, measured, whether the car really does go when the way is shut: section 8, item 4.

---

## 4. A round, in `src/game/round.js`

### Building to the decision point

`toDecision(def, seed, cars)` builds the world (`roundWorld`), then steps it with the autopilot in `approach` until the car is at rest at its line, at the front, with its stop counted. That is the frozen frame.
- "At the front" means no car ahead in its lane within 10 m `[invented]`.
- Cap it at 60 s of sim time. If the cap is reached, return `null`: the seed is not a round.
- Run `detect` throughout, as now, but the approach's events are NOT the player's. Start the round's event list empty at the decision point.

### The round state from there

The round state carries, beyond slice 1's: `phase` (`"frozen" | "waiting" | "gone"`), `decideAt` (`world.t` at the freeze), `goAt`, and the openings (below).
- `roundTick(rs, { held })` is one sim tick.
  - In `frozen` it does nothing and returns `rs` unchanged. The screen does not call it while frozen.
  - In `waiting` the autopilot is in `hold`.
  - In `gone` it is in `go`.
- `press(rs)`: `frozen` to `waiting`.
- `release(rs)`: `frozen` or `waiting` to `gone`, with `goAt = world.t`.
- The tick is otherwise slice 1's: step, contact, detect, `afterContact`, the end conditions. Keep `CLEAR_BY`, `TIME_CAP` (counted from `decideAt`) and the `failedToYield` rule exactly. The pull-away from rest is now the GO's.

### THE OPENINGS: when the road became the player's

On the freeze tick, and on every tick from then until GO, compute `open = openTo({ ...me, caution: 1 }, world, 1)` for the car standing at the line. That is the question the sim's undue-delay clock asks (`crossing.js` around line 735).
- Keep the list of open stretches: `{ from, to }` in `world.t`.
- **An opening is a stretch at least `REACTION_FLOOR` long** (import it from `src/core/perception.js`; the sim's own comment explains the floor). A shorter one was never an opening.

### THE TIMING VERDICT, at GO

- **Before the first opening:** that is the existing `failedToYield` rule's business. If the rule did not flag it, add the note `early` (section 6). The detector deliberately lets a gap that clears by the entry pass.
- **Inside an opening:** `delay = goAt - opening.from`, where `opening` is the stretch the GO fell in.
  - If the way was open at the freeze, `opening.from` is the freeze moment: going at once is the right answer, and waiting costs time.
  - If an EARLIER opening of at least 1.5 s `[invented]` was let pass, add the note `missedGap`.
- **Undue delay at `UNDUE = 4.0` s after the opening.** The sim's `UNDUE_AT` (`crossing.js` line 745) is not exported, and exporting it would mean editing `crossing.js`. So restate the number in `round.js`, with a comment naming the line. `verify-rounds` will hold the two equal by reading `crossing.js`'s text (section 8, item 6).
  - At or past it, add the fault `undueDelay`, severity 2 `[invented]`.

### Stars

All `[invented]` until Jay rules. A round's stars are the LOWER of the timing stars and slice 1's fault table, unchanged.

| timing | stars |
|---|---|
| `delay <= 1.0` s | 3 |
| `delay <= 2.5` s | 2 |
| later | 1 |
| went before the first opening, not flagged | 2, with the note `early` |

Contact the player is at fault for, a person struck, `failedToYield`, or not through: 0, as now.

`verdictOf` returns, beyond slice 1's: `delay` (or `null`), `notes` (ids with words), and `openAtFreeze`.

---

## 5. The rounds and their pools, `src/game/rounds.js`

Four round TYPES, on the same two maps as slice 1 (two-point legs, `map/samples.js` untouched):

| type | map | task |
|---|---|---|
| `four-way-straight` | all-way stop | straight |
| `four-way-left` | all-way stop | left |
| `two-way-right` | two-way stop | right onto the collector |
| `two-way-left` | two-way stop | left across the collector |

`tools/measure/round-seeds.mjs` builds the decision point for seeds 1-200 at car counts 4, 8 and 12, per type, and sorts each seed into a POOL by what the freeze shows:
- **`now`:** open at the freeze, and the opening lasts at least 2.0 s `[invented]`. The right answer is to go at once.
- **`wait`:** shut at the freeze, and an opening of at least 1.5 s `[invented]` begins between 1.0 and 10.0 s `[invented]` of waiting.
- **Rejected:** no decision point within the cap; an opening shorter than that; nothing opens within 10 s; or the ORACLE fails.
  - The oracle holds until the first opening plus `REACTION_FLOOR`, then goes.
  - It must end `through`, make the task, and earn 3 stars with no fault.
  - A seed the oracle cannot pass cleanly is not a fair round.

Per type, store ONE car count (the one with the most pooled seeds; say which) and the two pools as arrays of seeds, with a comment `[M, tools/measure/round-seeds.mjs, run <date>]` and the counts the search printed.
- **If any type has fewer than 5 seeds in either pool, report it.** Do not loosen the criteria.

**A set** is five rounds: one of each type, then one more from a random type. Each round is drawn from its pool:
- `wait` with probability 0.7 and `now` with 0.3 `[invented]`, so that "go at once" is sometimes right and waiting is not a free habit;
- from a set seed taken when Play is pressed (never inside a `useMemo`; see GAME.md).

---

## 6. New words, `src/game/words.js`

| id | words |
|---|---|
| undueDelay (fault) | You waited well after the road was yours. |
| early (note) | You went before a careful driver would have. It worked out this time. |
| missedGap (note) | There was an earlier gap you could have taken. |
| quick (praise, 3 timing stars) | Right on time. |

Show the delay on the result as "You went 1.4 s after the road was clear" (one decimal place). If the way was open at the freeze: "The road was clear when you arrived; you went after 1.4 s."

---

## 7. The screen, `src/game/Game.jsx`

- **Round start:** a short card with the round's title and task while `toDecision` runs. Build it in an effect after the card has painted; do not block the first paint. Then show the frozen frame.
- **The decision camera:**
  - Centred about 10 m ahead of the player's stop line along its heading (the middle of the intersection), rotated so the player's heading points up.
  - Zoomed so a radius of 45 m `[invented]` fits the shorter screen side, so traffic arriving from both sides is visible.
  - Use `viewOf`/`drawFrame` as Game.jsx does now, with a camera object `{ x, y, z, rot }` you set directly.
  - After GO, ease over 0.6 s into the existing chase camera.
- **On the canvas:**
  - the task at the top;
  - while frozen, a small "FROZEN" mark;
  - while waiting, the seconds held (sim time, one decimal place);
  - the big button drawn on the canvas itself, as `iso/hud.js` draws controls: at least 88 px tall, near the bottom, full width minus margins.
  - The pointer handling lives in one small pure function (`decisionInput`), so the GO/WAIT reading can change in one place.
- **No React state from the frame loop**, as before. Stop the loop, THEN set the result. The AFTER_END second stays.
- **Result:** the stars, the delay sentence, faults, notes and praise, with "Try again" (the same seed and cars) and "Next".
- **Summary:** after five rounds, as now.

---

## 8. The check, `tools/verify-rounds.mjs`

Use `tools/lib/round-drive.mjs`. `driveDecision(type, seed, cars, policy)` builds to the decision point and then applies `policy(rs)` each tick, which returns `"hold"` or `"go"`. The policies, all scripted from what the check itself reads:
- **`oracle`:** hold until the first opening plus `REACTION_FLOOR`, then go.
- **`eager`:** go at once.
- **`late(x)`:** go at the first opening plus `x` seconds.

The check reads the openings itself, tick by tick, with `openTo`. It does not read the round's own record of them, because that would compare the code with itself.

1. **Every pooled seed builds.** The decision point is reached within the cap, the car is at rest within 2 m of its line, and its stop is counted. Whether the way is open at the freeze matches the seed's pool, every seed (the pools are not stale).
2. **The oracle passes every pooled seed:** `through`, the task made, 3 stars, no fault. On its own line, the EXPOSURE: in `wait` seeds the oracle held at least 1.0 s. Print the distribution of hold times `[M]`.
3. **Going at once is right in the `now` pool and wrong in the `wait` pool.**
   - `eager` in every `now` seed: 3 stars.
   - `eager` in every `wait` seed: never 3 stars.
     - EXPOSURE on its own line: shut at the freeze.
     - Count how many got `failedToYield`, contact, or the note `early`, and print it `[M]`.
     - Fewer than half flagged by `failedToYield` or contact is a FINDING for the report, not a failure to tune away.
4. **GO works when the way is shut.** In every `wait` seed under `eager`, the car crosses its line within 3.0 s of GO `[invented]` (EXPOSURE that the player's decision is carried out). Print the worst time.
5. **The timing table, on real runs:**
   - `late(0.5)` gives 3 timing stars;
   - `late(1.8)` gives 2;
   - `late(3.0)` gives 1 without `undueDelay`;
   - `late(4.5)` gives 1 with `undueDelay`.
   Run each on at least 10 `wait` seeds where the opening stays open long enough (skip and COUNT the rest; at least 10 must remain).
6. **The restated constant:** `round.js`'s `UNDUE` equals the number in `crossing.js`'s `const UNDUE_AT = <n>;`, read from its source text. Say in a comment that this is the one place the two are held together.
7. **Deterministic:** the same type, seed, cars and policy twice give the same verdict, deep equal.
8. **Keep slice 1's `failedToYield` section, adapted:** the eager policy is the GO, and the stop rule and the gap rule are each exposed and asserted as now, run by run.

**Sabotage, two, before reporting**, restoring byte-identical each time (record the SHA-1 before and after):
- (a) measure `delay` from `decideAt` instead of from the opening;
- (b) let the autopilot obey `line` stop markers before the line in `go`.

For each, report WHICH assertion lines fired.

---

## 9. Done means

- `npx vite build` succeeds with both entries.
- `node tools/check.mjs` (the derived set) passes; paste its `N of M passed` line. With nothing changed under `src/sim`, `src/core`, `src/iso` or `src/map`, it should be `verify-core`, `verify-screens` and `verify-rounds` only. If it lists more, find out why before running it.
- Commit in your worktree, with the two attribution lines from slice 1's spec, and the Co-Authored-By line naming your own model. **Do not push.**

## 10. Report

Report back briefly:
- the files changed;
- each check's summary line, verbatim;
- the pool sizes per type and the car counts chosen;
- the oracle's hold times;
- section 3's counts and section 4's worst time;
- the sabotage results;
- **anything that did not work or that this spec got wrong, said plainly.** In particular, say whether `eager` in the `wait` pool is flagged often enough for "go now" to be a real mistake. That is the game's whole tension.
