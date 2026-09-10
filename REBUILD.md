# The foundation: a stepped simulation

**Status: approved. Stage 0 is built (§6); stages 1-5 are scope.**

This document exists because the maintainer played the game and said:

> "to be frank this doesn't resemble anything like a game, more like a
> flash animation. there's nothing interactive, nothing to see and most of
> the screen space is empty. the cars crawl on the road and like you said
> they don't actually interact... the project started really far from the
> current vision and I'm not seeing how this all connects."

That is correct, and the cause is structural rather than a list of missing
features. Read [DECISIONS.md](DECISIONS.md) first: almost everything in it
survives this, which is the point of having written it.

---

## 1. The diagnosis

**Every road user's motion is resolved before the drive begins.**

A participant is a declaration — from here, intending that, arriving then.
`schedule()` turns the declaration into a departure time, `movementOf`
turns it into a path, and `poseAt(p, t)` answers where they are. That
function is **pure, O(1), and depends on nothing but the participant and
the clock.** Nobody looks at anybody while moving. There is no tick.

Everything the maintainer is seeing follows from that one fact:

| what he sees | what it actually is |
|---|---|
| cars pass through each other | no participant reads another's position, ever |
| nobody follows anybody | a following car's approach is computed from its own `arriveAt` over `APPROACH_RUN`, independently |
| a car with no right of way drives through you | a rolling participant never enters the queue `priority` orders |
| nothing to interact with | the only input that changes the world is the player's own directions |
| it crawls | traversal times are real, but nothing else is happening during them |

And the two "features" that look like gaps are really the same gap:
**car-following and yielding cannot be added, because there is no moment
at which a car could decide to do either.** `reaction.js` had to be built
as a *post-hoc search* — simulate, notice a collision, binary-search how
hard somebody must brake, then rewrite their profile — precisely because
there was no tick in which they could have braked. It is the shape a
workaround takes when the foundation cannot express the thing.

That is the signal we agreed to watch for: **an increment that cannot be
made additive.** It has arrived.

### 1.1 Why this was not obvious until now

The driver game was one car at one intersection deciding one thing. For
that, a closed-form world is not merely adequate, it is *better*: the safe
window is found by sampling `poseAt` thousands of times, which is only
cheap because it is closed form.

The examiner game is a candidate driving a course through a populated
world for eighty seconds. The requirements inverted and the foundation did
not. Everything since has been paying interest on that.

---

## 2. The core loop

### 2.1 Shape

```
  fixed timestep, 20 Hz (dt = 0.05s, the STEP the engine already uses)

  for each tick:
    1. PERCEIVE   every actor builds its view of the world from the
                  previous tick's committed state
    2. DECIDE     every actor chooses an acceleration and a steering
                  target from that view alone
    3. INTEGRATE  every actor advances by dt
    4. COMMIT     the new state becomes the world the next tick perceives
```

**Perceive and decide read the PREVIOUS state; integrate writes the next.**
No actor sees another's half-updated position, so the tick order cannot
matter and the result is deterministic without anyone thinking about it.

`dt` is 0.05s because that is already this project's resolution floor
(§11), and because a 6-intersection drive is ~80s = 1600 ticks with perhaps
a dozen actors — trivial to run, and cheap enough to run many times, which
matters for §5.

### 2.2 What an actor is

```
  identity     id, kind (car | ped | cyclist | emergency), extents
  ratings      the five axes — carried, not compiled (§4)
  intent       route: which way at the next intersection
  state        position, heading, speed, and the lane it belongs to
  perception   what it has registered, and when
  memory       what it believes about things it can no longer see
```

The last two are not new: `awareness.js` and `belief.js` already model
exactly this and were built for a candidate who could not act on either.
Here they become the actor's own input every tick.

### 2.3 The decision model

Every actor answers the same four questions each tick, in this order. Each
one produces a *constraint on speed*; the actor takes the tightest.

**1. What is the road asking?** A target speed from the road's own class
and the curvature ahead — the `CHARACTER` speeds already measured, and the
turn radius `turnPoints` already derives.

**2. What is in front of me?** Following distance. The classic form is
enough and is a real model rather than a rule: an actor keeps a headway of
`REACTION + speed/decel` to the vehicle ahead in its lane and brakes at
whatever rate closes the gap. **`ENTITLED` (= `LOOKAHEAD` = 0.9s) is
already this project's statement of the road a moving vehicle claims ahead
of it** (§6) — the same quantity, currently used only to judge a fault
after the fact.

**3. Must I give way, and to whom?** At an intersection an actor computes
its own conflict points with everyone it has registered, and yields where
the right-of-way rules say it must. **The rules do not change at all**
(§5.3–5.5): path conflict not occupancy, opposite-straight does not
conflict, right-hand rule, left-turn-yields, emergency outranks. What
changes is that they are evaluated *by the driver, each tick*, instead of
once by an omniscient scheduler.

**4. How big a gap do I want?** Gap acceptance — the one place the driver's
own character enters. A driver accepts a gap when the projected
post-encroachment time exceeds their personal threshold, and that
threshold is `cautionOf(ratings)` scaled by the crossing time they need.
Bold drivers take gaps that make other people brake; timid ones sit at the
line. **This is `cautionOf` doing the same job it does now, live.**

Steering is separate and simpler: an actor tracks its lane's centreline
with a lateral controller, and a `steering` rating that is poor produces
lane-keeping error continuously rather than a scripted `wander`.

### 2.4 What this makes emergent that is currently authored

| now | after |
|---|---|
| `reaction.js` searches for the least braking that avoids a collision | a driver brakes because they saw something and it is what the model says |
| `wander` bends a path by a fixed amount | a poor steering rating tracks the lane badly |
| `slowStart` writes `startDelay` | a hesitant driver waits for a bigger gap |
| `overshoot` / `stopsShort` write `stopBias` | a driver's braking model stops them where it stops them |
| `rollingStop` is a car authored not to rest | a driver who does not register the sign does not slow for it |
| queueing does not exist | a car stops behind the car in front |

---

## 3. What carries over

**Generously, and this is the argument for a replaced layer rather than a
new project.** The parts that took the longest are the parts that survive.

### 3.1 Survives unchanged — it is design, not implementation

- **Every domain ruling in DECISIONS.md §2, §5, §6, §7.** Right of way is
  path conflict. A pedestrian holds the near half. Signalling is 2–3
  seconds. A rolling stop is a knowledge fault essentially always. Stop
  faults discriminate on MANNER, not position. Encroachment is entitled
  space, not forced evasive action. These are the examiner's rules and
  they are the product.
- **The three perception layers** (§3). World / candidate / player. The
  fault lives between 1 and 2, the score between 1 and 3. This becomes
  *easier* to hold, because layer 2 stops being a query and becomes the
  actor's actual input.
- **The five-axis driver model** (§4) — see §4 below, it is the big win.
- **The attributability floor, the `CAUSES` table, one-roll-per-axis's
  intent, never scoring observation by outcome** (§4.3–4.9).
- **Pacing targets and the reasoning under them** (§8): the 25s dead-air
  ceiling, 3–4 faults per section from free recall, "not every
  intersection is a test".
- **Detection and scoring** (`detect.js`, `score.js`, `actions.js`).
  Grading the examiner does not care how the world moved.
- **The intervention ruling** (§5.10) and the outcome model
  (`outcome.js`) — `contactsAcross`, `graspHorizon`, `driveOutcome` are
  about a drive's terminal state, not about how motion was computed.
- **Every failure pattern in §10.** Two implementations of one quantity;
  the check looking at the wrong half; what is measurable is not what is
  felt; the numbers look too clean. A rebuild makes these *more* relevant.

### 3.2 Survives with its interface changed

- **`road.js` — the geometry is real and measured.** Legs, lanes, control
  per leg, stop lines, `controlsOf`. A stepped simulation needs exactly
  this plus one addition: **the conflict points between each pair of paths
  through the intersection**, derivable from the same centrelines, and it
  is what "path conflict, not occupancy" becomes when a driver has to
  evaluate it live.
- **`paths.js` — the path shapes stay, the motion profiles go.**
  `turnPoints`, `polyPath`, `pointOn`, `poseOn` describe *the line a car
  takes*, which is still needed as the thing a driver steers along.
  `accelProfile` / `cruiseProfile` / `yieldingProfile` are replaced by the
  actor integrating its own acceleration.
- **`scenarios.js` and `routes.js` — the data is already right.** A
  scenario says who comes from where intending what and roughly when.
  **That is exactly a stepped simulation's initial condition**, and it is
  coordinate-free, which is why rotation works. The 18 authored situations
  and 4 routes carry over as data.
- **`tiles.js` and `world.js`.** Road character, the tile library, route
  planning, placement in one coordinate space, spacing derived from
  runway. The layout is independent of how cars move.
- **`compose.js` — the search survives, the accept tests change.** "Build
  a scene, measure what it actually turned out to be, discard it if the
  numbers disagree" is the right architecture and §9.2 is the reason. What
  it measures shifts: `windowIsMarkable` becomes something about how the
  drive played out rather than about a closed-form window.
- **`sight.js`.** Occlusion, `visibility`, `sightBlockersOf` — geometry
  from an eye to a target, evaluated per tick instead of per query.
- **The renderer.** `Road`, `Environment`, `roadArt`, the chase camera in
  `frame.js`. It draws poses; it does not care where they came from.

### 3.3 Does NOT survive

Be blunt about this. Roughly **2,600 lines** of the 9,900 in `src/engine/`:

- **`schedule()` and `earliestClear()`** in `index.js`. The omniscient
  pre-resolution of every departure is the thing being replaced.
- **`movementOf` / `basePose` / `poseAt` as a closed form**, and with it
  `approachPose` / `brakingApproach` and the whole approach-then-wait-
  then-traverse structure. ~600 lines.
- **`reaction.js` entirely** (181 lines). Giving way stops being a
  post-hoc search and becomes what drivers do. This is a *deletion that
  represents a win*.
- **The `TRAITS` table and `applyTraits`** (§4 below). ~250 lines.
- **`faults.js`'s controlled comparison as the definition of a fault**
  (227 lines) — see §5.2. The *technique* survives; what it is applied to
  changes.
- **`clearance.js`'s dependence on planned lines** (200 lines). PET is
  still the right measure; "against road users holding the line they
  planned" needs restating when nobody has a planned line.
- **`belief.js`'s `cleanPose` twin** (134 lines). Prediction becomes "run
  this actor's own decision model forward", which is both simpler and more
  honest.
- **`engine-golden.json`.** Rebaked as a trace — see §5.1.

**Not deleted, retired**: the driver game (`RightOfWayTiming`'s timing
loop, `roguelike.js`, `stages.js`, `bosses.js`, `traits.js`) already runs
behind `legacy: true` and is not accessible. It stops working under a new
motion model and that is acceptable under the maintainer's own ruling
(§1). It stays in git.

---

## 4. The driver model is the big win

**This is the argument that makes the rebuild worth doing on its own,
before any of the interaction benefits.**

DECISIONS.md §4 says a rating is *"a standing disposition by construction,
so identity stops being bolted onto the scenario model and becomes the
model — habits emerge instead of being scripted"*. That is what the
maintainer was reaching for when they proposed ratings.

**But §4.1 then says the roll must resolve once, at composition time, and
NEVER at simulation time.** That is not a design preference. It is forced:
in a closed-form world there is no "during", so a disposition has nowhere
to express itself except by compiling down into a discrete pre-resolved
trait that bends a path by a fixed amount.

So the current model is: *ratings → dice roll → a trait from a vocabulary
of ten → a fixed geometric distortion → a fault detected by removing that
trait and diffing.* Four layers of indirection between "this driver brakes
poorly" and anything visible, and the fault vocabulary has to be authored
by hand, one entry at a time, each needing a tell that is true.

In a stepped simulation the whole ladder collapses:

> **A rated driver simply drives, and the faults are what happens.**

A driver with poor braking has a worse deceleration model, so they stop
late *sometimes*, harshly *sometimes*, and appropriately most of the time,
depending on what the situation asks — which is what a real weak axis
looks like and what no amount of trait vocabulary can reproduce. A driver
with low observation registers things late, so they take gaps that were
not there, respond late to a car pulling out, and miss a sign — three
different faults from one parameter, none of them enumerated anywhere.

What this fixes that is currently stuck:

- **§4.7's whole problem disappears.** "One roll per axis, never one per
  fault kind" exists because fault density was a function of vocabulary
  size. With no vocabulary there is no such coupling.
- **§4.5's attributability floor becomes reachable.** Observation
  currently dominates zero fault kinds because it has to express through
  traits belonging to other axes. When it degrades perception directly and
  continuously, its errors are its own.
- **The thin-tail finding** (§5.12.6) — the worst drawn driver misses
  exactly 6 of 60 sightings no matter how bad they are — is a symptom of
  the same compilation step, and stops being a separate problem.
- **`CAUSES` stops being needed for generation.** It is still the
  maintainer's table for *attribution* (§4.8), which is a claim about
  people and is not derivable. But nothing has to consult it to decide
  what a driver does.

---

## 5. Verification

The earlier objection to a rewrite was that ground truth depends on motion
being a closed-form function. **That objection was wrong**, and it is
worth saying why precisely, because it was load-bearing.

### 5.1 Determinism is a property of the loop, not of closed form

A fixed timestep with all randomness drawn from a seeded generator replays
identically, tick for tick. What changes is the *shape* of ground truth:

- **now:** `engine-golden.json` is a fingerprint of a formula's outputs —
  windows, departures, poses at 0.05s.
- **after:** the golden is a **recorded trace** — the committed state of
  every actor at every tick for a fixed set of seeds. Byte-comparable, and
  strictly more informative, because it records what happened rather than
  what a formula says would have.

`verify-equivalence.mjs` survives essentially as-is with a different
baseline format, and gets *better*: a trace diff can say "actor 3 diverged
at tick 412", which the current fingerprint cannot.

### 5.2 What happens to the controlled comparison

This is the one that needs real thought. `faults.js` derives a fault by
stripping a trait and diffing — and in a stepped world there is no trait
to strip.

**The technique survives; its handle changes.** The comparison becomes:
run the same seed with this actor's rating on one axis set to the optimum,
and diff the traces. Where they separate by more than a driver could fail
to notice, that axis produced a visible error there. That is *the same
controlled comparison* — one thing changed, same seed, diff the outcome —
against a rating instead of a trait.

It is more expensive (a full re-run instead of a re-derivation) and it is
also more honest, because it measures the axis rather than a proxy for it.
At ~1600 ticks a drive this is cheap.

**§0 is unharmed and arguably strengthened.** Never author the answer:
windows are still not typed in, they are whatever the simulation does.
Never author the fault: faults are still derived by controlled comparison,
now against the actual disposition.

### 5.3 The 27 checks, honestly

| | count | which |
|---|---|---|
| survives as-is | 8 | `verify-scoring.py`, `verify-detect`, `verify-task`, `verify-screens`, `verify-camera`, `verify-directions`, `verify-roguelike`, `verify-stages` — none ask how motion is computed |
| survives, rewritten against traces | 11 | `verify-windows`, `verify-route`, `verify-generator`, `verify-compose`, `verify-turns`, `verify-sight`, `verify-clearance`, `verify-faults`, `verify-candidate`, `verify-world`, `verify-equivalence` |
| becomes something else | 5 | `verify-reaction` (giving way is no longer a search — it checks that drivers yield), `verify-awareness` (perception is live), `verify-belief` (prediction is the decision model run forward), `verify-outcome` (contact is a tick event), `verify-playthrough` (it exists *because* the loop could not be driven headlessly — **now it can**) |
| stops being askable | 3 | `verify-wontstop`, `verify-events`, `verify-roundabout` in their current form: each turns on a hand-authored window being exactly a certain value |

**And one question stops being askable in a way that matters.** "Does this
trait move the window?" is currently the test that a trait earns its
place. There are no traits, so the replacement is "does this rating
produce a visibly different drive?" — the better question, and not
available before.

**A new check the rebuild needs from day one:** *no two actors ever
overlap*, at any tick, in any seeded drive. One line, impossible to
satisfy accidentally, and the single fact whose absence produced
everything in §1.

---

## 6. The staged path

**Hard requirement: every stage ends in something the maintainer can
watch. The first one especially.**

The failure this week was weeks of correct machinery nobody could see, in
a codebase where the renderer already existed. A rebuild is *more* exposed
to that, not less, so the discipline has to be stricter rather than looser.

### Stage 0 — one road, cars that follow each other — **BUILT**

`src/sim/traffic.js` (one file), `src/apps/SimRoad.jsx`,
`tools/verify-sim.mjs`. On the home screen and at **`#/sim`**.

A straight road, looped so it can be watched indefinitely. Six cars, each
wanting a different speed. A fixed 20 Hz timestep, the Intelligent Driver
Model for following, and one structural rule: **every actor decides from
what it can see of the previous committed state, and nothing else.** No
intersections, no candidate, no ratings, no faults, no scoring, no camera,
and one check — nobody overlaps.

*Watchable:* traffic that queues, closes up, and spreads out. If it does
not immediately read better than what ships today, the premise is wrong
and we have spent a day finding out.

### Stage 1 — an intersection, and giving way

Add `road.js`'s geometry, conflict points, and the yield decision. One
intersection, several arrivals, right-of-way rules live.

*Watchable:* cars arriving from four legs and sorting themselves out. A
car waits, another goes, nobody is hit. **This has never once been true in
this project.**

### Stage 2 — the candidate, driven by ratings

Ratings drive the decision model. No traits, no compilation.

*Watchable:* two candidates on the same course, visibly different — one
hesitant, one pushy — and you can tell which is which by watching. The
game's whole premise, made visible for the first time.

### Stage 3 — the course, and the examiner's three built jobs

Route, directions with their deadlines, deferred marking, the section
sheet. All of `detect.js` and `directions.js` come across.

*Watchable:* a playable drive that is the current game, on a foundation
where the traffic behaves.

### Stage 4 — perception, faults, and a sheet that means something

`awareness.js` and `sight.js` as live inputs. Faults derived by
rating-stripped controlled comparison. The full marking sheet.

### Stage 5 — intervention, and the world

Contact ends a drive (`outcome.js` carries over intact), taking the wheel,
the hazards, the roadside. Everything already built in these areas is
design that survives.

**Stages 0–2 are the ones that answer the question.** If a rated driver in
a stepped world does not read as a person by the end of stage 2, stop —
the problem was never the foundation.

---

## 7. Risks, honestly

### 7.1 The specific way this fails: slowly rebuilding the same thing

A rewrite fails by reproducing the original's shape under new names, and it
does so *gradually*, one reasonable-looking decision at a time. The
protections that actually work:

- **Stage 0 has no engine in it.** One file, one road, one behaviour. It is
  impossible to accidentally rebuild `schedule()` there.
- **The one-line overlap check**, from the first stage. Every structural
  defect in §1 violates it. If it ever needs weakening, that is the
  original architecture growing back.
- **The stage gate is a person watching**, not a green suite. The current
  codebase is 28 green checks over a game the maintainer says is not a
  game. That is exactly the failure a test-first rebuild reproduces.
- **DECISIONS.md is the contract.** Every domain ruling survives; if a
  rebuild decision contradicts one, the decision is wrong. This is what
  that file was written for, and this is the moment it pays.
- **A hard rule: no closed-form shortcuts.** The moment something asks
  "where will this car be at t?", the answer is "run the loop". If that is
  too slow, make the loop faster — do not add a formula beside it, because
  that is two implementations of one quantity (§10) and it is precisely
  how the old shape returns.

### 7.2 Genuinely uncertain

- **Whether a stepped world at 20 Hz reads well.** Traffic microsimulation
  typically runs at 10 Hz and looks fine; this project's camera is close
  and its cars are small on a phone. Stage 0 answers it in a day and
  cannot be answered by argument.
- **Whether emergent faults are LEGIBLE.** A scripted `wideTurn` is
  unmistakable. An emergent one from a poor steering rating may be subtler
  than a player can mark. §10.2 — *what is measurable is not what is felt*
  — is precisely this risk and it has already bitten once. **This is the
  largest uncertainty in the document**, and it is a stage-2 question.
- **Whether faults stay attributable enough to mark fairly.** The rating
  comparison should be cleaner than the trait comparison, but "should" is
  doing work.
- **Whether composition still converges.** `compose.js` searches for a
  scene matching a brief; if measuring a brief now means running a drive,
  the search costs whatever the loop costs. Probably fine at 1600 ticks;
  not free.
- **Pedestrians and cyclists.** They need decision models too, and the
  near-half crossing rule (§5.4) is currently a legal override on a
  geometric query. It has to become something a pedestrian *does*.

### 7.3 What it costs

Rough, and stated as ranges because that is honest:

| | |
|---|---|
| replaced | ~2,600 lines of engine; ~4,000 lines of checks rewritten |
| carried over | ~7,300 lines of engine, all data, all docs, the renderer |
| stage 0 | a day |
| stages 0–2 (the question is answered) | under a week |
| stages 0–5 (parity, on a foundation that works) | two to four weeks |

**Parity is the wrong target and should not be the goal.** Several things
built this week — the reaction search, the survivability gate, trait
compilation — exist *only* to work around §1 and should not be rebuilt at
all. The honest figure is: two to four weeks to be further ahead than
today, on a foundation where the next feature is additive.

The alternative is not free either. Car-following and non-prior yielding
are the next two items in the current build order (§12) and neither has a
non-invasive implementation. **Doing them properly in the current
architecture is most of this work with none of the benefit.**

---

## 8. New project, or replaced layer? — a replaced layer

**Recommendation: a replaced layer inside this repository.** Not a new
project.

The case for it:

- **The data is already right and is coordinate-free.** Scenarios say who
  comes from where intending what. That is a stepped simulation's initial
  condition, unchanged. A new project would re-type it.
- **The geometry is real, measured, and hard-won.** True-to-life scale,
  derived turn radii, `controlsOf`, spacing from runway. Weeks of it.
- **DECISIONS.md is the asset.** Every domain ruling, every failure
  pattern, every measurement that took a day to make. It travels with the
  repository and its links are internal.
- **The renderer stays.** It draws poses. It does not care.
- **The git history is the record of why.** Half the reasoning in
  DECISIONS.md is anchored to commits.

The shape: **`src/sim/` is new and `src/engine/` is retired module by
module**, exactly the way the driver game was retired — kept, not
accessible, deleted only when nothing imports it. The new loop and the old
one never both drive the same screen. `#/drive` moves over at stage 3.

The one honest argument for a new project — *a clean room stops you
rebuilding the same thing* — is answered better by §7.1's rules than by
losing the data, the geometry, the renderer, the domain rulings and the
history.

---

## 9. What is needed from the maintainer before starting

Nothing blocking. Two things worth having early:

1. **Stage 0 is a judgment call and it is yours.** Does traffic that
   follows and queues read as *alive*? Nobody else can answer that, and it
   gates everything after it.
2. **The two rulings still open** — whether a candidate should ease off for
   a car sitting in a driveway, and what an intervention IS on the sheet —
   become *more* answerable in a stepped world, not less. Neither blocks
   stage 0.
