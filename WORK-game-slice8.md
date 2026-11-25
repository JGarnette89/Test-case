# WORK: game slice 8, a hazard after the turn (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first.** Ignore CLAUDE.md. Read WORK-game-slice7.md and its REVIEW OUTCOME for what exists. **This slice starts only after slice 7 is reviewed and merged.**

**Jay, after slice 6:** "And, after turning maybe have a chance for a hazard to appear and the user has to quickly hit stop."

**What not to do:**
- no change under `src/sim/`, `src/core/`, `src/iso/` or `src/map/`;
- do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`;
- no merge rounds.

---

## 1. THE HAZARD IS THE SIM'S, NEVER SCRIPTED

**The sim already has it** (`src/sim/peds.js`):
- people on foot are `careful`, `trusting` or `heedless`;
- the last two step out in front of a car;
- **in front of the PLAYER they step out only where a response exists**: reacting at `REACTION_FLOOR` and braking as hard as the car can (`playerCanRespond`, `accelFor(-1, v)`).

That is Jay's own ruling, 29 September: "pedestrians should absolutely have a chance to do dangerous stuff, we just need to make sure the player has time to react."

1. **Put people where the player goes after the turn.** On the round maps (`src/game/rounds.js`), give the EXIT legs a crosswalk at the box, or a mid-block crossing on a parked curb if the maps can carry one cleanly. Choose what loads without warnings, and say which.
   - Give the round's world people crossing there, with a higher share of `trusting` and `heedless` manners than the city's (`world.pedRisk`) `[invented]`, so a hazard can arise.
   - Never place a person at a time. A hazard is a person the sim decided to step out.
2. **Which rounds carry one is chosen by MEASUREMENT** (`tools/measure/round-seeds.mjs`, as the pools are).
   - A seed is a `hazard` seed when, under the oracle's drive (full target from its moment, no stop), a person steps onto the player's path after the player has cleared its stop line and before the round ends.
   - And when the oracle WITH a stop at `REACTION_FLOOR + 0.5` s `[invented]` after the person steps off stops short of them.
   - Otherwise it is a plain seed.
   - A set draws a hazard round with `HAZARD_P` = 0.35 `[invented]`, from the pools that have one. Report each type's hazard pool size; if one has fewer than 5, report it.
3. **The round runs past the box** to a point `HAZARD_REACH` = 40 m `[invented]` along the exit, or until the hazard is resolved (the person is clear of the player's path), whichever is later, then ends as now.

---

## 2. STOP

1. **A quick tap after GO is STOP** (Jay: "quickly hit stop"): a touch that lifts within `TAP_MS` = 250 ms `[invented]` and moves less than `DEAD`.
   - It sets the target speed to 0 with the car's FULL brake, `sliderFor`/slider -1 (the braking `playerCanRespond` assumes, so the sim's fairness promise holds in the game).
   - A drag after it sets a new target as in slice 7.
2. **The autopilot does NOT stop for a person on its own after GO.** That is now the player's job. Check what it does today and report it.
   - It still never drives into a car ahead (the queue rule stays).
3. **Draw nothing that announces the hazard.** No warning and no ring on the person. The person is drawn as the sim draws them; the player has to see them.

---

## 3. THE VERDICT

- **Striking a person** is a fault from the sim's own contact (`sim/contact.js`, a person always costs), with stars 0 and words "You hit a pedestrian." `[invented wording]`.
- **Stopping short of them** gives the praise `stoppedInTime`, "Stopped in time.", and the reaction time on the result card. The reaction time runs from the tick the person stepped off the curb to the tick STOP was tapped (or the target went to 0) `[M per round]`.
- **A stop that was late but short of them** is still the praise; how late is information, not a fault `[invented, for Jay]`.
- **A STOP with no hazard** costs nothing from this slice. Stopping mid-block or in the box is whatever the sim's detectors already say.
- The intersection's own verdict (timing, `failedToYield`, `forcedBrake`, threading) is unchanged and is judged as now.

---

## 4. The check, `tools/verify-rounds.mjs`

Keep every section passing. Add:

1. **The hazard is the sim's.**
   - In every hazard seed, the person who steps out is one the sim created (their id is in the world's people from before the player's GO), and none is placed by the game.
   - Source text: `src/game` never writes a person into the world.
2. **Fairness:** in every hazard seed, the oracle with STOP at `REACTION_FLOOR + 0.5` s after the step-off strikes nobody.
   - EXPOSURE: at least 5 hazard seeds per type that has a pool.
3. **The danger is real:** in at least 80% of hazard seeds, the oracle with NO stop strikes the person or comes within 1 m of them `[invented]`. Print the share `[M]`. Otherwise the hazard is decoration; report it.
4. **STOP:** a tap after GO brakes at the full-brake rate (the car's own deceleration, measured tick to tick, at least 0.9 of `-accelFor(-1, v)`).
   - A drag is never read as a tap.
5. **The verdict:**
   - a strike gives 0 stars and the words;
   - a stop short gives `stoppedInTime` with a reaction time equal to the check's own measurement, to one tick.
6. **Plain seeds are unchanged:** every plain seed's verdict under oracle and eager is slice 7's.

**Sabotage, two, restored byte-identical** (SHA-1 before and after). Report which lines fired:
- (a) the tap braking at `HARSH_AT` instead of the full brake;
- (b) the autopilot stopping for the person itself.

---

## 5. Done and report

As slice 7:
- the build;
- `node tools/check.mjs` (derived), with its `N of M passed` line;
- commit in your worktree; do not push.

Report:
- where the people cross and how;
- the hazard pool sizes;
- the fairness and danger shares;
- the oracle's reaction margin;
- the sabotages;
- **every departure from this spec, said plainly.**
