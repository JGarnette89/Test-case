# WORK: game slice 11, traffic-light rounds (spec, 26 November 2026)

**Read [GAME.md](GAME.md) first**, especially "The next intersections". Ignore CLAUDE.md. Read WORK-game-slice8, 9 and 10 with their REVIEW OUTCOMEs for what exists. This slice starts on the session tip, which has slices 9 and 10.

**Jay:**
- "Adding roads more complex than a 2 or 4 way stop will bring this to the next level."
- His order: traffic lights first, then yield and merge.
- **A left on a plain green light freezes IN THE INTERSECTION:** the car pulls in and waits where a good driver waits, the scene freezes there, and the player picks the gap. If the light turns, they finish the turn once it is safe.

**The sim already has all of it.**
- Signal phases are derived from the geometry, with permissive lefts and right on red (`src/sim/signal.js`).
- A car in the box finishes its turn (crossing.js, "Are they in the box? Then they finish").
- The right on red is "stop, then take a gap" (crossing.js).
- Slice 10 draws signal heads, and stop lines in their light.

This slice makes ROUNDS of it, and nothing in the sim changes.

**What not to do:**
- No change under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`.
- Do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`.
- No protected green arrow, no pedestrians and no hazards in these types this slice.
- If something needs a sim change, stop and say so in the report. Do not work around it in the game.

---

## 1. A SIGNAL MAP

In `src/game/rounds.js`, beside `allWayStop` and `twoWayStop`, add `signalCrossroads`:
- the same `crossroads` helper;
- four collector legs (50 km/h), one lane each way;
- every leg's end controlled by a signal;
- no protected-left arrow.

Use whichever control strings the map format and `signal.js` take, fixed-time or actuated. Say which you chose and why. A round must replay identically from its seed.

## 2. TWO ROUND TYPES

1. **`signal-left`, "Turn left at the lights".** The car arrives on a GREEN and pulls into the box to the point where the sim's own left-turner waits for a gap (find it in crossing.js; do not type a distance). It comes to rest, and the scene FREEZES THERE.
   - The decision is the gap in oncoming traffic. If the light turns amber and red while the player holds, oncoming traffic stops and the way opens by the sim's own rule (the car in the box finishes).
   - Seeds whose arrival does not meet a green are not in either pool: the search measures this, never a typed time.
   - `now`: the way is open at the freeze and stays open. `wait`: shut at the freeze, with an opening to come. Use the same criteria as the existing pools.
2. **`signal-right`, "Turn right on the red".** The car arrives on a RED, stops at the line, and the stop is counted, as at a stop sign. The scene freezes there.
   - The decision is the gap in cross traffic from the left.
   - If the light turns green while the player holds, the way opens on the green, and going then is right.
   - Seeds whose arrival does not meet a red are not in either pool.

The briefs and spoken lines go in `src/game/words.js`, in the existing style. The player must be able to tell from the screen alone which light they have.

## 3. THE DECISION ON THE NEW TYPES

**The freeze point.**
- A round's decision has been "at rest at the stop line, the stop counted" (`toDecisionFrom`).
- For `signal-left` it is "at rest at the in-box waiting point, on a green". Add this as a property of the type (for example `waitIn: "box"`), with one implementation, never a second copy of `toDecisionFrom`.
- The autopilot drives into the box on the green and holds at that point. If the light is not green when the car reaches the line, it stops at the line and waits for the green, then pulls in.

**What is shown.**
- The relevant traffic is the oncoming stream for the left, and the cross traffic from the left for the right on red. Use `whyRelevant`, rings, ghosts and the decision frame as they are. Say what you had to change.
- Stopping ORDER means nothing at a light: do not show it on these types.

**THE PLAYER'S LIGHT ON THE HUD.**
- A small three-lens light, drawn on the canvas near the instruction, shows the player's own light for their movement.
- It comes from `movementLight` (the call the sim's drivers obey; slice 10's stop line uses it), never a second implementation.
- It is drawn on the two new types only.

**The verdict** is built from the same parts as now: timing stars from the openings, forced braking, contact, and the sim's detectors (`src/sim/events.js`).
- **Waiting in the box after the light has turned:** if the sim's detectors notice it, the verdict says so. If none does, do NOT invent a fault. Say so in the report; it is a ruling for Jay.

## 4. THE SET

- A set draws from six types now.
- Every set includes at least one of the two signal types `[invented: Jay wants to see them]`, by the same drawing stream, deterministic from the set's seed. Keep the plain types' draws as they were as far as possible.
- Say what changed in which seeds a given set seed draws.

## 5. SEEDS

Extend `tools/measure/round-seeds.mjs` to the two new types with the existing criteria:
- the oracle passes with 3 stars and no fault;
- `now` is open at least 2.0 s;
- `wait` is shut, with an opening of at least 1.5 s beginning 1.0 to 10.0 s in.

Search the car counts as the existing types did. Keep the first 30 of each pool, and mark the run `[M]` in `POOLS_RUN` (or a new constant). The existing floor holds: at least 5 seeds in each pool. If a pool cannot reach 5, report it; do not lower the floor.

## 6. THE CHECK, `tools/verify-rounds.mjs`

Keep every section passing. The existing pooled-seed sections (no clipping, verdicts, the thumb) must cover the new types automatically if they iterate TYPES; say which do and which do not.

Add a section 23, each negative line with its cases-arose line:
1. The map loads with signals on all four approaches, and no arrow.
2. **signal-left:**
   - at every pooled freeze the car is past its stop line, short of the conflict with the oncoming path, at rest, and the player's light is green;
   - in `wait` seeds an oncoming car is relevant at the freeze;
   - the oracle passes every pooled seed with 3 stars and no fault.
3. **signal-left, the light turns:** among the `wait` seeds, at least one where the light leaves green during the hold (assert the case arose), and in it the oracle completes the turn with no contact and no forced braking.
4. **signal-right:**
   - at every pooled freeze the stop is counted, the car is at the line, and the light is red;
   - the oracle passes every pooled seed;
   - at least one `wait` seed where the light turns green during the hold (or say "cannot tell").
5. **The HUD light equals `movementLight`** for the player's movement on every tick of a sampled round, on both types; it is source text in Game.jsx, drawn on these types only.
6. **Eager and creep on the new types:** list every verdict and every contact `[M]`.

**Sabotage, two, restored byte-identical** (SHA-1). Report which lines fired:
- (a) `signal-left` freezing at the stop line instead of in the box;
- (b) the HUD light read from the opposite approach.

## 7. SEE IT

Screenshots, as in slice 10 section 6, of both new types at the freeze (three rounds each), plus one `signal-left` after the light has turned during a hold. Save them in `tools/scratch/slice11/`. Look at each one yourself before reporting:
- Can you tell which light you have?
- Can you see the oncoming or cross traffic that decides it?
- Are you in the intersection on the left?

## 8. Done and report

As slice 10:
- `npx vite build`;
- `node tools/verify-rounds.mjs` alone;
- `node tools/check.mjs` (derived), with its `N of M passed` line, saying which checks did not finish and why;
- commit in your worktree; do not push.

Report:
- the pools found;
- the freeze point and how it was found;
- what the HUD light looks like;
- the verdicts;
- the sabotages;
- the screenshots;
- **every departure from this spec, said plainly.**
