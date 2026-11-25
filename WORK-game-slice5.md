# WORK: game slice 5, only what decides the decision, arcade speed, threading the needle (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first,** including its new section "What the player sees", with Jay's words. Ignore CLAUDE.md. Read WORK-game-slice4.md and its REVIEW OUTCOME for what exists.

**Jay, after playing slice 4:**
- "The wide shot still includes way too much information, by the time the wait button appears the car is already at the stop line, so cars shown at the extremes of the road are completely irrelevant but we are sacrificing what we need to actually see (the stopping order of cars at the intersection or decision point)."
- "Realism in speed and acceleration/stopping isn't a primary concern here, read the scene, thread the needle if need be and get into traffic."
- "An extreme wide shot is hard to read at a glance on a phone unless the user can pan around."

**What not to do:**
- no change under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`;
- do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`;
- no merge rounds (GAME.md: designed, not built).

---

## 1. NO WIDE SHOT: THE DECISION FRAME IS THE INTERSECTION AND WHO MATTERS NOW

1. **Relevant traffic is filtered by TIME, not only by geometry.** `relevantIds` keeps a car whose path conflicts with the player's and that is not past the conflict (as now), AND that is one of:
   - at its stop line, at rest;
   - in the box;
   - arriving: its distance to the conflict over its speed is at most `ARRIVE_WITHIN` = 4.0 s `[invented]`.
   A car further out is drawn but not ringed, and it does not shape the frame.
2. **`decisionFrame`** fits:
   - the intersection box;
   - the player's stop pose;
   - every relevant car;
   - grown by `FRAME_MARGIN` = 6 m `[invented]`, and never less than a 25 m radius round the box's centre `[invented]`;
   - and nothing else. Drop slice 4's "at least the decision view's 45 m circle".
3. **The camera holds that frame from the first frame to GO.** No far shot and no dive. The player's car screeches in from the edge of the frame: its trail may start outside it, and it is drawn as it enters.
   - Intro: `SCREECH` = 0.6 s `[invented]`, then `SETTLE` = 0.25 s `[invented]`, then the button.
   - **The screech's speed is arcade:** Jay's "realism in speed isn't a primary concern". Keep the quadratic stop.
4. **Panning and pinching, the player's choice.** While frozen or waiting:
   - a one-finger drag that starts outside the button pans;
   - two fingers pinch-zoom (`iso/freecam.js` `panFree` and `pinchFree`, as the map screen uses them).
   - The camera returns to the frame on its own after GO.
   - A drag must never be read as a press or a release of the button: the button is its own rectangle, and the drag starts outside it.

---

## 2. THE STOPPING ORDER, DRAWN

At an all-way stop, every car standing at its line with its stop counted and not yet going (the player's car included) gets a number: its place in the ORDER THEY STOPPED.
- **The numbers are derived, never typed.** Sort by `stoppedAt`.
- **Two stops within `SAME_MOMENT`** (the sim's own tie tolerance, `crossing.js` line 661, 0.4 s, not exported) share a number. The sim then settles them by the right-hand rule.
- **Restate the 0.4 in `stage.js`,** with a comment naming the line. The check holds the two equal from `crossing.js`'s text, as it already does for `UNDUE_AT`.
- **The player's badge reads `YOU`** with its number. Other cars get the number alone, in a small high-contrast disc above the car, at least 18 px across on screen.

At an approach with no control (the two-way stop's through road), a relevant arriving car gets its seconds to the conflict instead, rounded to whole seconds: "2s". It is derived from its distance and speed, as in section 1.

Recompute both every frame from the drawn world, so the order updates while the player waits.

---

## 3. ARCADE SPEED AFTER GO

Once the player lets go, the sim runs at `FAST` = 2 ticks per tick of real time `[invented]` until the round ends.
- Same ticks, same verdict: only the playback is quicker. The step budget in `sim/pace.js` (`pageMore`) must still hold.
- **Report the measured time from GO to the result card on screen** `[D]`: GO to the end in sim seconds, divided by `FAST`, plus `AFTER_END`.

---

## 4. THREADING THE NEEDLE (Jay: "thread the needle if need be")

Today a GO before the sound driver's opening that the `failedToYield` rule lets pass gets the note `early` and 1 star. **Replace that with what the traffic did:**
- **Forced braking, `forcedBrake`.** If an ENTITLED car (its path conflicts with the player's, and it was not stopped at its line) brakes harder than the sim's own harsh threshold (`HARSH_AT`, exported by `src/sim/traffic.js`) at any tick between GO and the player clearing the box:
  - add the fault `forcedBrake`, severity 3 `[invented]`, with the words "You made another driver brake hard."
  - **Read the car's deceleration from the change in its speed tick to tick,** in the round's own tick.
  - This applies to EVERY GO, early or not: a consequence is a consequence.
- **Threaded.** An early GO with no `forcedBrake` and no contact: timing stars 3, with the praise `threaded`, "Threaded the needle."
- **Unchanged:** `failedToYield` (the stop rule, and the shut-at-both rule) and contact, both still 0 stars.
- **Drop** the `early` note and `EARLY_STARS`, with their check lines.

This is a deliberate departure from the old engine's standard, where a fault was intrusion on entitled space whether or not anybody reacted. It is Jay's call for this game. Write a comment saying so beside the rule.

---

## 5. The check, `tools/verify-rounds.mjs`

Keep every section passing, with the dropped `early` lines removed. Add:

1. **The frame.**
   - Every relevant car and the player's stop pose project inside the screen (400 x 800 and 800 x 400) on every pooled seed.
   - The frame is at most 120 m across `[invented]` in at least 95% of seeds. Print the median and the widest `[M]`.
   - EXPOSURE that the time filter bites: in at least 20% of seeds a conflicting, not-yet-past car is NOT relevant because it is more than `ARRIVE_WITHIN` out. Print the share `[M]`.
2. **The order is the sim's order.** At every freeze of an all-way pooled seed, for every pair of numbered cars with numbers `i < j`, `blockedBy` (the sim's own call, from crossing.js) says the car numbered `j` must yield to the one numbered `i`.
   - Cars sharing a number are exempt, since the right-hand rule settles them.
   - EXPOSURE: at least 20 such pairs over the pools. Print the count `[M]`.
3. **`forcedBrake`.**
   - Over the eager runs in the wait pools, EXPOSURE: at least 3 runs where an entitled car's tick-to-tick deceleration passed `HARSH_AT` after GO, read by the check itself.
   - `forcedBrake` in every one of those runs, and in none where it did not happen.
   - The oracle has `forcedBrake` in none of the pooled seeds. If it does in some, that is a FINDING: report it with the seeds, and do not drop them silently.
4. **Threaded.** EXPOSURE at least 3 eager wait runs that were early and drew neither `forcedBrake`, `failedToYield` nor contact. Every one gets `threaded` and 3 stars.
   - Print the new distribution of eager outcomes in the wait pool: 0, 1, 2 and 3 stars `[M]`.
5. **SAME_MOMENT** equals crossing.js's text, as `UNDUE` is.
6. **Source text:** Game.jsx runs `FAST` ticks a tick after GO, routes a drag outside the button to `panFree`/`pinchFree`, and never calls press or release from a drag.

**Sabotage, two, restored byte-identical** (SHA-1 before and after). Report which lines fired:
- (a) `relevantIds` without the time filter;
- (b) the order sorted by arrival at the line instead of by `stoppedAt`. If (b) fires nothing, say so: that is a CANNOT TELL, not a pass.

---

## 6. The pools

Rebuild with `tools/measure/round-seeds.mjs`, same criteria, and report the sizes. The oracle's 3-star criterion now includes "no `forcedBrake`", so the pools may shrink.

## 7. Done and report

As slice 4: the build; `node tools/check.mjs` (derived) with its `N of M passed` line; commit in your worktree; do not push.

Report:
- each check's summary line;
- the frame sizes, the time-filter share, the order pairs, the eager distribution, the oracle's `forcedBrake` count and the new pool sizes, all `[M]`;
- GO to the result card `[D]`;
- the sabotages;
- **every departure from this spec, said plainly.**
