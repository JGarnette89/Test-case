# WORK: game slice 1, the first driven rounds (spec, 24 November 2026)

**Read [GAME.md](GAME.md) first. Its rules hold for every line of this.** Ignore CLAUDE.md unless this spec sends you to a section of it.

**Goal:** a separate app at `play.html`. Four driven rounds at one intersection each, a verdict after each, and a set summary at the end. Enough for Jay to answer two questions on his phone:
- would he play another round?
- does every verdict make sense?

**What not to do in this slice:**
- no ads, no lessons prose, no daily set, no sharing, no new art;
- no change to `src/sim/`, `src/iso/`, `src/core/` or `src/map/` beyond the ONE export named below;
- do not move or edit `sceneFor` or `actorsOf` in `src/apps/MapRoad.jsx` (checks read that file's text).

---

## 1. Files

| file | what |
|---|---|
| `play.html` | new: a copy of `index.html` with `<title>Your Turn</title>` and `<script type="module" src="/src/game/main.jsx">` |
| `vite.config.js` | add `build.rollupOptions.input` with both `index.html` and `play.html`. Use `fileURLToPath(new URL(..., import.meta.url))`; the config is ESM. Change nothing else in it. |
| `src/game/main.jsx` | new: mounts `<Game />` like `src/main.jsx` mounts `<App />` |
| `src/game/rounds.js` | new, pure data: the round definitions and their maps |
| `src/game/round.js` | new, PURE (no React, no DOM, no `.jsx` import): building a round, one tick, the end condition, the verdict |
| `src/game/words.js` | new, pure data: the plain words for each fault and praise (section 5) |
| `src/game/Game.jsx` | new: the screen (section 6) |
| `src/map/samples.js` | the ONE allowed change outside `src/game/`: `export` the existing `stroke` helper (line ~63) so `rounds.js` uses it instead of a copy |
| `tools/verify-rounds.mjs` | new: the game's check (section 7) |
| `tools/verify-screens.mjs` | add `{ id: "Game", file: "src/game/Game.jsx", why: "the short game (play.html)" }` to `SCREENS` |
| `tools/measure/round-seeds.mjs` | new: the search that chose each round's seed and car count (section 3) |

---

## 2. A round, in `src/game/round.js`

A round definition (in `rounds.js`):
```js
{ id, title, task: "straight" | "left" | "right", brief, map: () => mapData, start: { road, end }, cars, seed, expose }
```
- `brief`: one sentence shown before the round, for example "A four-way stop. Go straight through."
- `expose`: which property the round exists to show (section 3).

### Building

`sceneArgs(def)` returns the positional arguments `[def.seed, KMH, EVERY, true, def.cars, def.map(), def.start]` that `sceneFor` (MapRoad.jsx) takes.
- The screen calls `sceneFor(...sceneArgs(def))`.
- Node cannot import `.jsx`, so the check builds the same world through `worldFor` in `src/sim/scene.js`: `worldFor(...sceneArgs(def), false, false, { checks: false, mergeTolerance: DEFAULT_MERGE_TOLERANCE, preroll: PREROLL })`. Those are exactly the trailing options `sceneFor` passes (read lines 96-100 of MapRoad.jsx).
- Put that call in `round.js` as `roundWorld(def)` so it exists once.
- Pick `KMH` and `EVERY` by reading what `sceneFor`'s callers pass (ExamRide passes 50 and 2.0) and say what you chose.

`startRound(def, { world, me })` returns the round state:
```js
{ def, world, me, ev: newEventState(), events: [], t0: world.t,
  targetK: me.k, made: null, crossedAt: null, end: null, hornSeen: 0 }
```

### One tick

`roundTick(rs, input)`, where `input = { steer, slider, signal, horn }` from `iso/controls.js`'s state. It is exactly one tick of MapRoad.jsx's in-thread loop (read lines 413-445), minus wallet, mail, tow, voice and jobs:
1. `prev = { me, world }`.
2. If `input.horn !== rs.hornSeen`: apply `playerHonk`.
3. `me = stepDriver({ ...me, signal: input.signal }, { steer, slider, assist: 0 }, world, DT)`.
4. `w = step(withDriver(world, me))`.
5. `c = playerContact(w, me)`, `world = c.world`.
6. `detect(prev, { me, world, hit: c.hit, contact: c }, rs.ev)`. Append the events, keep the state.
7. `afterContact(me, c, world).me` is the player's response to contact (`sim/contact.js`). Ignore its letters.
8. `world = withDriver(world, me)`.

How MapRoad decides `assist` matters: read it, use the same value, and say what you found.

**The signal is spent by the turn it caused.** MapRoad writes `input.current.state.signal = sc.me.signal` back after each tick. Return `me.signal` so the screen can do the same.

### The turn made

On the tick the player crosses the stop line at `targetK`:
- the crossing test is `events.js`'s own: same approach, `prev.me.s <= path.stopAt && me.s > path.stopAt`;
- record `rs.made = path.intent` and `rs.crossedAt = world.t`.

### FAILED TO YIELD, the one new detector, kept here and NOT in `events.js`

On that same crossing tick, ask whether a SOUND driver standing in the player's place, in the PREVIOUS world, had an opening: `openTo({ ...prev.me, caution: 1 }, prev.world, 1)` from `src/sim/crossing.js`. It is the predicate the sim's own undue-delay clock reads (read its comment at line ~1150).
- If it was false, push `{ id: "failedToYield", severity: 5, praise: false }`.
- **On a red, `ranRed` already says it.** Do not add `failedToYield` when the same tick has `ranRed`.
- Severity 5 is `[invented]`: write that beside the constant.

### The end

The round ends on the first of these, with `rs.end = { why }`:
- **`through`**: at `targetK` with `me.s >= path.clearAt + CLEAR_BY` (25 m `[invented]`), or `me.k !== rs.targetK` after `crossedAt` is set;
- **`contact`**: any fresh contact the player is at fault for, or a person struck;
- **`edge`**: `me.atEdge`;
- **`time`**: `world.t - t0 > TIME_CAP` (60 s `[invented]`).

### The verdict

`verdictOf(rs)` returns `{ stars, why, faults: [{ id, severity, words }], praise: [{ id, words }], made, task }`.
- `faults` are the non-praise events that are not `noFault`, plus `wrongTurn` when `made !== task` (severity 2 `[invented]`: TRIGGERS gives `missedTurn` 2).
- Each id appears ONCE in the list, with a count if it happened more than once.

**Stars, one table, all `[invented]` until Jay rules:**

| stars | when |
|---|---|
| 0 | the round did not end `through`, OR any fault of severity 5 |
| 1 | the worst fault is severity 3-4 |
| 2 | the worst fault is severity 1-2 |
| 3 | no fault |

---

## 3. The four rounds, in `src/game/rounds.js`

Each round is its own small map, built with `emptyMap` and `road` from `src/map/format.js` and the exported `stroke`. Look at `testSigns()` and `testPeds()` in `samples.js` for the shape.
- **Legs are about 140 m**, so a round lasts about 20-30 s `[D: 140 m at 40 km/h is 12.6 s, plus a stop, a wait and 25 m out; assuming the start is at the leg's end]`.
- Start on the approach whose `end` is the intersection.

| id | map | task | expose (the property the round must show, measured with the good driver of section 7) |
|---|---|---|---|
| `full-stop` | all-way stop crossroads, residential | straight | `cameToRest`: the good driver comes to rest at its line before crossing |
| `who-first` | all-way stop crossroads, residential | left | `heldByRight`: while standing at its line, `openTo(sound, world, 1)` is false for at least 1.0 s in total `[invented]` |
| `into-gap` | two-way stop: a residential minor road stops; a collector (50 km/h) runs through with no control | right onto the collector | `heldByRight` |
| `across` | the same map as `into-gap` | left onto the collector | `heldByRight` |

**THE SEED AND THE CAR COUNT ARE CHOSEN BY MEASUREMENT, NEVER TYPED IN AS A TIME.** That is "never author the answer" applied to rounds.
- `tools/measure/round-seeds.mjs` runs the good driver on seeds 1-60 at a few car counts per round.
- It prints, per round: how many seeds show the round's `expose`, and the good driver's time to `through`.
- Choose a seed and car count that show it with the time inside 15-45 s `[invented]`.
- Write the chosen values in `rounds.js` with a comment `[M, tools/measure/round-seeds.mjs, run <date>]`.
- **If no seed in 1-60 shows a round's property at a sane car count, do not force it. Report it.**

---

## 4. What the checks may NOT do to pass

- Change a number in `src/sim/`, in `events.js` or in `goodInput`.
- Narrow what a check looks at.
- Make the good driver wait by `openTo`. That compares the detector with itself: CLAUDE.md item 3, "it compares a quantity with itself".

The good driver waits by `whatStops`, as written. **If it and `openTo` disagree, that is a finding. Report it with the seeds.**

---

## 5. The words, in `src/game/words.js`

Use these exactly. Jay will revise them later.

| id | words |
|---|---|
| collision | You hit another vehicle. |
| struckPerson | You hit a person. |
| struckBy | Another driver hit you. Not your fault. |
| ranRed | You entered the intersection on a red light. |
| rolledStop | You didn't come to a complete stop at the stop sign. |
| failedToYield | You went when someone else had the right of way. |
| blockingBox | You stopped inside the intersection. |
| harshBraking | You braked hard to stop. |
| lateSignal | Your turn signal came on less than two seconds before you turned. |
| noSignal | You turned without signalling. |
| missedTurn | You signalled a turn and didn't make it. |
| wrongTurn | That wasn't the turn you were asked to make. |
| tightGap | You changed lanes into a gap too small for the car behind. |
| honkedAt | Another driver honked at you. |
| stoppedShort | You stopped well short of the stop line. |
| dawdling | The road was yours and you waited too long. |
| wideTurn | You swung wide on the turn. |
| notKeepingRight | You stayed out of the right lane without a reason. |
| underLimit | You drove well under the limit on a clear road. |
| stoppedForPed | You stopped for someone on foot. |
| letSomeoneIn | You let someone in. |
| letIn | A driver let you in. |

For any other id: show nothing for praise, and the id itself for a fault (so a missing entry is visible, not hidden).

The round-not-finished reasons:

| why | words |
|---|---|
| time | Out of time. |
| edge | You left the map. |
| contact | Round over: contact. |

---

## 6. The screen, `src/game/Game.jsx`

Use `src/apps/ExamRide.jsx` as the template for the canvas loop, the sizing, the DPR cap (2), the pointer handlers, `controls()` and the chase camera. Use MapRoad.jsx for the keyboard handling (`controls().keys`, the `held` set, `q`/`e` for signals, `h` for the horn).

**Phases (React state, changed only BETWEEN rounds):**
1. **Title.** "Your Turn" (working title), a Play button, and the build stamp (`__BUILD__`) in small dim text.
2. **Intro.**
   - The round title, the brief, and the task in large words ("Turn left").
   - On the first round only, one line on the controls: "Drag on the left to steer. Slide the right edge up to go, down to brake. Tap a top corner to signal."
   - A Drive button.
3. **Driving.**
   - The canvas, drawn with `sceneFor`, `actorsOf`, the chase camera and `drawFrame`, as MapRoad does when driving.
   - HUD, all drawn on the canvas: `drawSlider`, `drawWheelBar`, `drawSignals`, `drawHorn`, and the task line at the top ("Turn left at the four-way stop"), on the canvas, never React.
   - `actorsOf(sc, carry, body)`: pass body memory exactly as MapRoad does when its body-motion setting is on, or `null` if that needs settings you would have to load asynchronously. Say which you did.
   - When `rs.end` is set: keep drawing for 1.0 s so the player sees what happened, THEN cancel the loop, THEN set React state to the result.
4. **Result.**
   - The stars as glyphs (★/☆), the faults' words (with counts), the praise.
   - "Try again" (the same round, rebuilt from its definition) and "Next".
5. **Summary**, after the last round: the stars per round and the total, "Play again".

All buttons at least 44 px. `100dvh`. Safe-area insets. `touch-action: none` on the canvas. Inline styles. Icons only from `lucide-react`.

---

## 7. The check, `tools/verify-rounds.mjs`

Model the output on the other `tools/verify-*.mjs`: `check(cond, message)`, a numbered section per property, exit 1 on any failure. Use `goodStep` / `goodInput` from `tools/lib/good-driver.mjs`. It turns where `sc.route.steps[0]` says, so give it `{ route: { steps: [{ k: targetK, route: <the path id at targetK whose intent is the task, from the start leg> }] } }`.

1. **Every round builds.**
   - The map loads with `ok` and NO warnings, and the player is placed.
   - A path from the start leg at `targetK` has the round's task as its intent.
   - (These are preconditions; a failure here says the round is broken, not the detector.)
2. **The good driver passes every round, and the round's case arises.** For each round at its stored seed, assert:
   - the round ends `why === "through"`;
   - `made === task`;
   - 3 stars and no faults;
   - the `expose` property held, on its OWN line.
   - Print the time to `through` as `[M]`.
3. **Each detector fires on the driving it is about, and not on the driving it is not about.** A controlled comparison: the same round and seed, the good driver with ONE thing changed. Every negative carries its own exposure line.
   - **Roller**, at `full-stop`: the slider held at no less than 0.2 through the line. Assert it crossed the line above 1 m/s (exposure), then that `rolledStop` is in the faults.
   - **Eager**, at `who-first`, `into-gap` and `across`, seeds 1-30: the good driver, but once at rest at the line, full throttle.
     - Exposure: in at least 3 runs, `openTo(sound, prevWorld, 1)` was false on the crossing tick.
     - `failedToYield` is in the faults of every such run, and in none where it was true.
     - Over the SAME seeds the unmodified good driver has `failedToYield` in none (print how many runs that covered).
   - **Silent**, at `who-first`: the good driver with its signal forced to null. Exposure: it turned. Then `noSignal` is present.
   - **Wrong way**, at `into-gap`: signal left instead of right. Exposure: crossed the line. Then `wrongTurn` is present.
   - **Statue**, at `full-stop`: the slider held at -1 throughout. `why === "time"` and 0 stars.
4. **Deterministic.** The same round, the same scripted inputs, twice: the same `world.t` at the end, the same verdict (deep equal).

**Sabotage, before reporting.** Break `failedToYield` in `round.js` (call `openTo` with the CURRENT world instead of the previous one), run the check, and record which assertion fired. Then restore it and confirm the file is byte-identical to before (`git diff --stat` shows nothing for it). Report the line that fired, not only the count.

---

## 8. Done means

- `npx vite build` succeeds and `dist/` contains `index.html` and `play.html`. Say the bundle size the build printed for the game's entry, marked `[M]`.
- `node tools/verify-rounds.mjs`, `node tools/verify-screens.mjs` and `node tools/verify-core.mjs` pass. Paste their final summary lines.
- `node tools/check.mjs` (the derived set) passes. Paste its `N of M passed` line. If it refuses with `NOTHING CHANGED`, you have not saved your work.
- Commit in your worktree with a plain message ending in the two attribution lines below. **Do not push.**
  ```
  Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01SLJc76nw6Mh4FLSGJSv3Hm
  ```

## 9. Report

Report back, briefly:
- the files changed;
- every check run, with its summary line;
- every number, marked `[M]`/`[D]`/`[invented]`;
- the chosen seed and cars per round and what the search printed;
- the sabotage, and which line fired;
- what `assist` and body motion you used, and why;
- **anything that did not work, any disagreement between `whatStops` and `openTo`, and anything in this spec that turned out wrong.** Say it plainly. Do not work around it silently.

---

## REVIEW OUTCOME (24 November 2026, the planner)

**Built by the executor in `56a2ee1`, reviewed and corrected in `3abcfb5`.** `56a2ee1`'s message says `verify-rounds` is RED on purpose. That was true when it was written; after `3abcfb5` it is green: `3 of 3 passed` (verify-core, verify-screens, verify-rounds) `[M, node tools/check.mjs --base 7c33eae]`.

### The red, traced: the spec's detector was wrong, not the good driver

`failedToYield`, asked only at the line crossing (this spec, section 2), flagged the unmodified good driver in 3 of 84 runs `[M]`:
- **who-first #6:** the player stopped first (21.70 s) and a rival stopped after (21.90 s). The rival went out of turn, and on the crossing tick both were already moving. A car under way counts as committed (`crossing.js blockedBy`), so the player was blamed for the rival's mistake.
- **who-first #13 and into-gap #10:** the good driver itself rolled the stop (`rolledStop`), a limit of `good-driver.mjs`. The flag there is right.

### Corrected rule `[invented]`, until Jay rules

Each moment is read in the world before the move, for a sound driver in the player's place (`openTo`). There are two kinds of right of way:
- **THE TURN AT A STOP.** Pulling away from the line while a waiting driver at a stop sign holds the way is a fault, judged at the pull-away alone. It is a rule with no judgment in it.
- **A GAP IN MOVING TRAFFIC.** It is a fault only if the way was shut at the pull-away AND still shut as the player entered.
  - The sound driver's gap is too conservative to judge alone. At `across` seed 14 it refused a pull-away with the car 87 m and 9.6 s off `[M]`. Marking that would make no sense to a driver.
  - The proper measure is the time margin to the entitled car (post-encroachment time, the encroachment ruling in CLAUDE.md). **That is slice 2's first item.**

The check now states this rule run by run over 84 eager runs:
- 3 were held by the stop rule `[M]`;
- 15 were shut at both moments;
- 30 were shut at the pull-away and open by the entry;
- 28 were open at both;
- the good driver had no flag in any of the 77 runs where it pulled away from rest at the line.

**Sabotaged two ways, and restored byte-identical (SHA-1 `e85e780a`):**
1. Dropping the stop rule fired `eager: failedToYield in every one of them -- not who-first#5 across#25`.
2. Flagging on the pull-away alone fired three lines: `failedToYield in none of those 58 -- in ...` (30 runs), the run-by-run line, and the good-driver control `-- in across#8 across#14`.

### Also changed in review

**The round maps use two-point legs.** The executor exported `stroke` from `map/samples.js`, and that one-word change put 65 checks in the derived set: hours here `[M, the executor's killed run: 630-951 s per check]`. Straight legs need no helper. `samples.js` is untouched, and the results are identical `[M, verify-rounds: the same times and exposures]`.

### Findings for Jay, not acted on

1. **WHO OWED WHOM WHEN A DRIVER GOES OUT OF TURN AT AN ALL-WAY STOP.**
   - At who-first #6 the good driver collided with the rival who went out of turn, and `contact.js owedBy` put it on the player. Its rule 5, "whoever entered second had somebody already in there", rests on line-crossing order, not stopping order.
   - Is a driver who stopped first, and then enters behind somebody who went out of turn, at fault? Ontario says to yield to vehicles already in the intersection, which supports `owedBy`. But the game then scores the player 0 stars for the rival's mistake.
   - A traffic-law question: his.
2. **"Who goes first" rarely tests taking turns.** An eager driver at the four-way stop went ahead of a waiting driver with the right of way in only 2 of 30 seeds `[M]`. The round's stored seed shows the wait (2.0 s), but most players will not meet the situation the round is named for. Slice 2 should choose the round's seed by that property, or raise the traffic.
3. **Rounds run 29 to 40 s** `[M]`, against the 20-30 s wanted. The 140 m legs and the stop take most of it.
4. **The check drives with lane assist 0 and the screen with "gentle" (0.5),** so a real drive is slightly more forgiving than the checked one.

### Not verified

Nothing about how it looks or feels. The preview cannot animate here (CLAUDE.md item 7), so the first look is Jay's, on his phone.
