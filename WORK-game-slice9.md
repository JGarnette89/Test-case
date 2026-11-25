# WORK: game slice 9, the launch is a boost (spec, 25 November 2026)

**Read [GAME.md](GAME.md) first.** Ignore CLAUDE.md. Read WORK-game-slice7.md and WORK-game-slice8.md, with their REVIEW OUTCOMEs, for what exists. **This slice starts only after slice 8 is reviewed and merged.**

**Jay, after slice 7:** "Gotta launch the car even harder, I want it to feel like a fun boost through the intersection at full throttle."

**Why it needs one sim change.**
- The car already launches at its full engine: `ACCEL_MAX`, 2.72 m/s^2 `[M, sim/player.js]`, a family car's pull-away.
- The game cannot launch harder without a stronger engine, and the engine lives in `src/sim/player.js`.
- So this slice makes **ONE opt-in change in the sim, and only that one:** a driver field, `power`, defaulting to 1.
  - At 1, every screen and every check is byte-for-byte what it was.
  - Only the game sets it.

**What not to do:**
- no change under `src/sim/` except the `power` field below; nothing under `src/core/`, `src/iso/` or `src/map/`;
- do not touch `sceneFor`, `actorsOf` or `tools/lib/good-driver.mjs`;
- no merge rounds.

---

## 1. A STRONGER ENGINE, OPT-IN

1. **In `src/sim/player.js`, the throttle side of `accelFor` takes a power multiplier.**
   - Pass it as a fourth argument, or read it from the driver where `accelFor` is called for the player (`drive.js` and `player.js`, the lines that compute the player's own `a`). Choose the smaller change and say which.
   - Full throttle's supply becomes `power * T_MAX`. Coasting, braking and resistance do not change.
   - With `power` absent or 1, the arithmetic must be identical, not merely close.
2. **The game's car carries `power = BOOST` after GO,** with `BOOST` = 2.5 `[invented, for Jay to tune]`.
   - That is about 6.8 m/s^2 from rest `[D: 2.5 x T_MAX - ROLL]`, 0 to 50 km/h in about 2 s: a sports car.
   - Before GO the car stays at 1, so the arrival and the stop are unchanged.
3. **The autopilot uses the boost at full throttle.**
   - With the target at the limit, it asks for full throttle (slider 1) until it is within 0.5 m/s of the target.
   - Slice 7's proportional pull, `(aim - v) * 0.6`, tapers the launch from about 9 m/s; it must not taper this one.
   - A partial drag aims for its target as in slice 7, now with the stronger engine under it.
   - The corner cap, a car ahead and STOP (slice 8) still win.
4. **The posted limit stays the top speed.** The boost is how fast the car gets there, not how fast it goes.

## 2. IT HAS TO FEEL LIKE A BOOST (canvas only, no React state from the frame loop)

Draw these only while the car is accelerating hard after GO (above 0.6 of its boosted full throttle):
- **The camera lags, then catches up.** The chase camera trails the car by up to 3 m at the launch's peak and eases back over about 0.6 s `[invented]`, so the car visibly pulls away from the view.
- **A small shake,** at most 2 px, fading over 0.4 s `[invented]`.
- **Speed lines:** streaks at the screen's edges, their count and length rising with speed `[invented]`.
- **Tire smoke or marks** from the rear wheels for the first 0.4 s `[invented]`.

Say what each looks like in the report. Jay judges the feel.

---

## 3. The check, `tools/verify-rounds.mjs`

Keep every section passing. Add:

1. **The sim is untouched at power 1.**
   - `accelFor` with power 1 (or absent) equals the old formula, to the last bit, over a grid of slider, speed and grade.
   - Run the derived set, `node tools/check.mjs`, which will include the sim's player checks (verify-wheel, verify-drive, verify-contact and others). Quote its line and the names it ran.
2. **The boost is real:** under the oracle with full target, the car's peak acceleration after GO is at least 0.9 of `BOOST * T_MAX - resistance(v)` on the flat, measured tick to tick `[M]`. Also print the time from GO to 50 km/h.
3. **The top is the limit:** the car's speed never exceeds the posted limit plus 0.3 m/s `[instrument]`.
4. **No contact:** across every pooled seed under oracle, eager and creep, contact is no more frequent than in slice 8.
   - List every seed whose verdict changed `[M]`.
   - A harder launch should thread more gaps without forced braking, and that is expected. A new contact is not.
5. **Source text:** Game.jsx draws the camera lag, the shake, the speed lines and the smoke, and does so only while the car is boosting.

**Sabotage, two, restored byte-identical** (SHA-1 before and after). Report which lines fired:
- (a) the game leaving `power` at 1;
- (b) `accelFor` scaling the BRAKE by power as well.

## 4. Done and report

As slice 8:
- the build;
- `node tools/check.mjs` (derived), with its `N of M passed` line;
- commit in your worktree; do not push.

Report:
- the sim change, exactly, as a diff;
- the launch numbers;
- verdict changes;
- what the juice looks like;
- the sabotages;
- **every departure from this spec, said plainly.**
