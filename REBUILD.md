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

### 4.1 EVERY CAR IS A RATED DRIVER. THE CANDIDATE IS THE ONE BEING ASSESSED.

**Structural decision, recorded before anything is built on it.**

The maintainer asked for NPC traits — *"giving NPC cars traits like
speeder or tailgater could help to make traffic feel more organic than
everyone driving the exact same way"* — and then answered it in the same
breath: *"we are already building something like this into our
candidates."*

So there is no second system. **A speeder is high confidence. A tailgater
is high confidence with little caution. A hesitant driver is low
confidence. Somebody who misses things is low observation.** The five axes
already say all of it, and a parallel list of NPC traits beside them would
be the two-implementations-of-one-quantity pattern (§10 of DECISIONS.md)
committed deliberately rather than stumbled into — with the added
guarantee that the two would drift, because one would be tuned for how
traffic LOOKS and the other for how a candidate is MARKED.

**It is cheap right now and it will never be cheaper.** The following
model already has exactly the two knobs a rated driver needs: the speed
they want, and the gap they keep. A speeder and a tailgater are values of
those, not new machinery.

**The old engine could not hold this position.** There the candidate was
"just a participant", but NPC traits were hand-assigned from a narrower
pool than the candidate's — `generate.js` drew from five, `compose.js`
from seven, and neither was the ratings model. One driver model for
everybody removes a whole class of divergence rather than managing it.

#### And the payoff is much bigger than variety

**The avoidability fault class requires other drivers to make mistakes.**
The maintainer's ruling is that failing to prevent an avoidable collision
is a fail on the test even when the candidate is not at fault
(DECISIONS.md §5.11) — and a candidate cannot fail to prevent somebody
else's mistake unless somebody else makes one.

In the old engine those mistakes had to be AUTHORED, one situation at a
time, each needing its own tell and its own verification. That is why the
class had almost no content: it was waiting on somebody to write hazards
by hand.

**If every car is rated, other drivers err at whatever rate their own
ratings imply.** The fault class stops needing content and starts having
a SOURCE. That is the difference between a mechanic that has to be fed
and one that runs.

#### What that means for the stages

Stage 0 gets the cheap half only: draw a rating profile per car from the
seed and map it to desired speed and target headway, so the cars differ
FOR A REASON rather than by a random number. **No faults, no attribution,
and the candidate model is not pulled forward** — those are stages 2 and
4, and pulling them in early is exactly how a rebuild turns into a long
silence (§7.1).

The test at stage 0 is the same as every other: does the traffic read as
a mix of people rather than one driver repeated? That is a question for
somebody's eyes.

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

A straight road with traffic flowing along it. A fixed 20 Hz timestep, the
Intelligent Driver Model for following, and one structural rule: **every
actor decides from what it can see of the previous committed state, and
nothing else.** No intersections, no candidate, no faults, no scoring, no
camera, and one check — nobody overlaps.

Three things landed on top of it, each on the maintainer's instruction:

- **The pace.** A 60 km/h road, wide speed variance with real outliers,
  and a closer following gap. That last one separated `HEADWAY` from
  `ENTITLED` — the gap a driver *chooses* is not the gap they are
  *owed*, and having them equal put every following car permanently on
  the fault boundary. The bill lands at stage 4.
- **The limit is a parameter**, with 30/50/60/100 buttons on the page so
  speed questions cost ten seconds rather than a round trip. **The road is
  a DURATION, not a distance** — six seconds at any limit — because 90m
  is six seconds at 60 km/h and three at 100. Verified at 100: the gap
  scales because it is a time (1.32s at 30, 1.31s at 100), nothing
  tunnels (0.78m of closing per tick against a 4.5m car), and stopping
  from 100 needs 143m against 167m of road. Above 130 km/h the tick
  would have to shorten.
- **Every car is a rated driver** (§4.1), drawn from the same
  `composeDriver` the candidate will be. 17% bold, 14% timid, the rest
  ordinary; 39–81 km/h wanted and 0.39–1.01s of gap kept.

The one trade a fixed camera cannot escape: six seconds at 100 km/h is
167m, so a car is 6 x 15px. Showing more cars needs more road and smaller
cars. That is what the chase camera is for.

*Watchable:* traffic that queues, closes up, and spreads out. If it does
not immediately read better than what ships today, the premise is wrong
and we have spent a day finding out.

### Stage 1 — an intersection, and giving way — **BUILT**

`src/sim/intersection.js` (geometry), `src/sim/crossing.js` (the
decision), `src/apps/SimCrossing.jsx`, `tools/verify-crossing.mjs`. At
**`#/crossing`**, all-way or two-way.

Conflict points, the yield decision, and the maintainer's right-of-way
rules evaluated by each driver every tick from what they can see.
**A yielding driver is following something that isn't moving**, so the
conflict point becomes a stationary obstacle and stage 0's car-following
does the rest -- no second mechanism, no search, and nobody's path
rewritten after the fact.

Three things landed on top of it:

- **A stress test rather than a demo**, on the maintainer's instruction:
  "cars that just keep coming, so we can prove our right of way ordering
  stays consistent." Measured over forty intersection-minutes at a
  hundred cars a minute against a capacity of about twenty: 912 crossings
  of a stop line, not one out of turn, nobody touching anybody.
- **The two-way stop**, which is two entries in a control table rather
  than a second kind of place. **The gap a driver accepts is derived**
  (DECISIONS.md 5.13.8) -- crossing time, plus as much again scaled by
  caution -- and comes out at 6.9 / 7.2 / 8.3s for right, straight and
  left. The Highway Capacity Manual's MEASURED critical headways are
  6.2 / 6.5 / 7.1. Same order, within 1.2s, nothing fitted.
- **Undue delay as a markable fault** at the maintainer's 4-5s, judged by
  the same `blockedBy` the driver decides with, asked at the competent
  point instead of at their own caution. A driver no more cautious than
  competent can never be marked, by construction.

Four bugs came out of it, each found by a check rather than by reading:
two opposing left turns with nobody on anybody's right drove through each
other; a left turn yielding unconditionally to oncoming traffic deadlocked
the through road; a through car and a minor car both at rest at their
lines both went in the same tick; and a driver had been waiting minus
28.5 seconds because the clock rebase moved `t` and not the instants
drivers carry.

*Watchable:* cars arriving from four legs and sorting themselves out. A
car waits, another goes, nobody is hit. **This has never once been true in
this project.**

### Stage 2 — the candidate, driven by ratings — **BUILT**

`src/sim/candidate.js`, `src/apps/SimCandidates.jsx`,
`tools/verify-telling.mjs`. At **`#/candidates`**.

Ratings drive the decision model. No traits, no compilation: the ratings
ARE the parameters, and the controlled comparison is the same seed with
one axis moved. `candidate.js` adds no behaviour at all -- it hands a set
of ratings to the same `driver` the traffic is drawn from (section 4.1),
and every profile is five numbers and the prose describing them. That is
checked at source, because the old engine's two divergent trait pools are
exactly the drift it prevents.

**All five axes now reach the decision.** Confidence did already;
knowledge did through rolling stops. Braking became one parameter of the
following model -- how hard a driver PLANS on braking, which decides how
late they leave it -- and its span is derived rather than chosen: a sound
braker plans on the comfortable rate and the worst plans on twice it,
which is exactly where the old engine's `ABRUPT_AT` says a stop stops
being controlled. Steering became lane-keeping, bounded at half the room
between the car and the next lane, because the driver over there has the
same claim on the other half.

Measured on one course, ten minutes, one axis moved each time:

| driver | what shows | against sound |
|---|---|---|
| hesitant | waiting at the line | **7.1s** a trip against 1.2s |
| pushy | trips completed | 15 against 14, at a fifth of the waiting |
| ragged | off their own line | **0.38m** against 0.04m -- 37% of a car's width of swing |
| heavy-footed | typical braking | **2.48 m/s2** against 1.96 |
| unschooled | stop signs rolled | **2 of 6** against 0 of 6 |

And each moves ONLY its own observable, which is the property that lets a
player attribute what they saw rather than merely notice it.

**The honest half: at an all-way stop a hesitant driver is
indistinguishable from a sound one** -- 1.0x the waiting, against 6.1x at
a two-way stop. Everybody stops, so there is no gap to judge and
confidence has nothing to say. That is correct, and it is the argument
for a course with more than one kind of place on it.

*Watchable:* two candidates on the same course, visibly different — one
hesitant, one pushy — and you can tell which is which by watching. The
names are hidden until you ask for them, because a label under a car
answers the question and then nobody has learned anything.

**THE VIEW SLIDES WITH THE CANDIDATE AND DOES NOT TURN, AND THAT IS
SCAFFOLDING RATHER THAN THE ANSWER.** An approach at a two-way stop is
279m at 60 km/h — it has to be, or "is there a gap" is answered by the
edge of the world (§5.13.12 in DECISIONS.md) — and a view wide enough to
hold all of it draws a car three pixels long. Fixed on the intersection,
the candidate was off screen for about three quarters of every trip.

So the panel centres on them, a little ahead of them, axis-aligned.
**Stage 3 replaces it with `chaseFor` in `frame.js`, which already
exists and already rotates**, and the rotation is not decoration: the
camera rides the INTENDED pose, so a car that is not holding its line
visibly deviates from the centre of the frame, and that deviation IS the
steering fault made legible. Building half of that here would mean
building it twice, and the half would have been the half that does not
carry the mechanic. Do not mistake the sliding view for a finished
camera — it exists because stage 2 needed the candidate on screen, and
nothing more.

### Stage 3 — the course, and the examiner's three built jobs

Route, directions with their deadlines, deferred marking, the section
sheet. All of `detect.js` and `directions.js` come across.

**FIRST INCREMENT: TWO INTERSECTIONS JOINED BY A LINK, WITH TRAFFIC
FLOWING BETWEEN THEM -- BUILT.** `src/sim/course.js`,
`src/apps/SimCourse.jsx`, `tools/verify-course.mjs`. At **`#/course`**.

The link turned out to need no geometry at all: the exit of one
intersection and the approach of the next ARE the same piece of road, so
placing the centres `reach + reach` apart makes the paths meet exactly --
every seam 0.0000m apart and 0.00 degrees out. The constraint that made
the approach awkwardly long was building the thing this stage needed.

A course of ONE is the single intersection, not an extension of it:
`seedCrossing` is `seedCourse` with `n = 1`, and a trace of six worlds at
120 seconds each is byte identical before and after the change.

What did need building is that **a lane does not stop at an
intersection's boundary** -- two cars nose to tail across one are on the
same street and the follower has to see the leader. Right of way stays a
question about one intersection, which is safe because the approach is
long enough that traffic beyond it cannot change a gap decision, and that
is checked by re-derivation rather than assumed.

Three findings worth carrying: the first version of the cross-boundary
check PASSED WITH THE MECHANISM DELETED and had to be rebuilt as a
directed test (DECISIONS.md 5.15.4); the rule is load-bearing at an
all-way stop, where the block is 200m, and inert at a two-way stop, where
it is 558m (5.15.5); and everybody keeps right across 201,529 readings,
which is the cheapest wide net a course has.

It was the piece none of the earlier stages had.

**SECOND INCREMENT: A GRID, AND A CANDIDATE WHO DRIVES A ROUTE --
BUILT.** `planRoute`/`walkRoute` in `course.js`, the plan carried on the
driver, `verify-course.mjs` section 7.

A course had to become a grid the moment a route was wanted: **on a row
every turn leaves the world**, so the only drive expressible is a
straight line, which is a corridor rather than a course and no
instruction given on it could ever be wrong. The grid cost almost
nothing -- the same placement rule works in both axes, 14 seams on a 3x2
and none of them out -- and it needed exactly one real fix, because
naming a link's two directions by the lower intersection index gave the
east-west and north-south links the same lane names.

A route is DERIVED FROM THE GEOMETRY rather than declared: an intent is
only offered where the leg it leaves by has something on the end of it,
so a plan cannot ask for a turn into nothing. 2,400 planned instructions
across 40 seeds from every edge, all of them leading somewhere. And the
candidate drives it: 8 intersections without a wrong turn.

**SILENCE MEANS STRAIGHT ON, and it falls out rather than being
enforced** -- a plan that has run out returns `straight` because that is
what the absence of an instruction means. It is the rule that makes a
LATE instruction a missed turn rather than a pause, which is the
interlock the directions mechanic rests on. DECISIONS.md 5.15.8.

`keepDriving` is no longer a stand-in for a course. A trip is a real
route now, and it is what starts the next one.

**THIRD INCREMENT: THE CHASE CAMERA -- BUILT**, and it corrected a claim
made in this document. `chaseOn` came across unchanged, pointed at a pose
in world coordinates, riding the INTENDED pose so a wandering driver does
not read as a wobbling camera.

It does NOT make the steering axis legible, which is what this section
used to say it would. Measured on a phone panel: 0.38m of stray is 0.68px
at the 10s look-ahead, against 2.74px in the 52m fixed view -- the chase
view is the widest and therefore the WORST of the three for lane-keeping,
and being wide is what it is for. The deviation is reported as a number
instead (sound 0.04m, ragged 0.20m), because magnifying it would be a lie
about how far off line the car is. DECISIONS.md 5.15.14.

What it is genuinely for: it TURNS with the car, which is what a gaze
cone held in degrees off the heading needs and which nothing else can
provide; and it is a DURATION of road, so a faster road shows further
ahead.

**FOURTH INCREMENT: THE DIRECTIONS -- BUILT.** `tell`, `toTell` and
`stillTellable` in `candidate.js`; verify-course section 8. A candidate
sets off knowing NOTHING and carries straight on until told otherwise, so
the instructions are the examiner's to give rather than the course's to
know. What is told is the same field the driver reads. Three rules, all
checked: silence means straight on; an instruction in time is followed;
one given after they are already there is refused, and they carry
straight on -- the examiner's fault, which is the interlock.

The deadline is the LOOSEST TRUE ONE, deliberately: the tick the plan is
read, which is the handoff to that intersection. Real, not a placeholder,
but generous (31s of notice on a 524m leg). The tighter bound -- in time
to slow for the turn and signal -- needs a turn speed the model does not
have (DECISIONS.md 5.15.13), and it will only ever move EARLIER, so
nothing built against this one has to be unbuilt.

**FIFTH INCREMENT: DEFERRED MARKING AND THE SECTION SHEET -- BUILT.**
`src/sim/marking.js`; verify-course section 9. `detect.js` comes across
UNCHANGED and is fed what the sim already derives, in the shape it
already grades. Three faults, each a threshold on a quantity the model
holds for its own reasons: undue delay, a rolling stop, and abrupt
braking (`HARSH_AT`, twice the comfortable rate -- the old engine's own
line). A sound driver directed on time is a clean sheet; a prompt examiner
catches every rolling stop, a silent one misses them, a spraying one is
charged for every invented mark; a direction never given for a turn the
course wanted lands on the examiner.

**One thing is EXCLUDED on purpose.** Lane-keeping is not on the sheet:
the weave's ceiling is half the room between lanes (0.45m) and the old
engine's threshold for a fault anybody could see is `POS_VISIBLE`, which
is 0.45m. The maximum stray is exactly the visibility floor, so a fault
there would be authored rather than derived. It becomes markable where
the other half of the steering axis does: on a bend.

**And it corrected the old engine.** `sectionSheet` charged the examiner
for every direction never given, including for legs the course wanted
STRAIGHT -- where silence produced exactly the right drive. The old
routes always turned, so the branch had never run; the rebuild's set
courses go straight sometimes, and the first one charged five directions
for four turns. Fixed in `detect.js`, with the old check corrected to
count turns.

**STAGE 3 IS LANDED.** Route, directions, deferred marking, the section
sheet, `detect.js` across unchanged. What is still owed to it is the
tighter instruction deadline, blocked on turn speed (5.15.13).

**A CLAIM CORRECTED: `directions.js` is across only as far as the sheet
reads it.** `sectionSheet` grades each direction against its window
through `attribute`, so late and stacked verdicts are real. What is NOT
in the sim is the other half of that file -- the stacking trade, "a
loaded driver is a worse driver" (`loadCandidate`, `skillUnderPressure`,
measured at 62% wider turns under full stack in the old engine). Telling
a candidate three intersections ahead costs them nothing here, so the
"stacked" verdict is a label with no consequence behind it: the same
shape as the old drive's stacking meter shipping inert (CLAUDE.md, "The
stacking trade shipped INERT"). It belongs to stage 4, where the ratings
become live inputs a load can degrade, and it is recorded here so the
word "across" above is not read as more than it is.

**SIXTH INCREMENT: THE CURVED ROAD -- BUILT**, renderer first. Roads are
drawn from the path, a link can bend as tightly as its speed allows, and
the wide line on the bend puts the steering axis on the sheet. Section
8.2.1, with the numbers.
Today every arrival is spawned at the far end of one approach and
destroyed at the far end of its exit, and the candidate's "course" is
`keepDriving` putting the same person back on a fresh leg — an honest
stand-in, labelled as one in `candidate.js`, and the first thing stage 3
should kill. A car that leaves intersection A has to arrive at
intersection B as the same car, carrying its speed, its queue position
and whoever it was following.

**AND THE LINK IS ASSESSABLE TERRITORY, NOT TRANSIT. This contradicts an
assumption the project has carried since before the flip** — that the
intersection is where the assessment happens and the road between is the
gap between assessments. Stage 2 measured otherwise. Of the five axes,
**three express on the APPROACH and only confidence needs the box**:

| axis | where it reads |
|---|---|
| steering | the approach — lane-keeping needs motion, and a stop-line queue has none |
| braking | the approach — the whole of it is how late they leave the braking |
| confidence, as pace | the approach — wanted speed and following distance |
| confidence, as gap acceptance | **the intersection**, and nowhere else |
| knowledge | the stop line itself |

Measured at an all-way stop, where nobody judges a gap, a hesitant driver
is indistinguishable from a sound one (1.0x the waiting, against 6.1x at
a two-way stop) — while ragged, heavy-footed and unschooled all still
read exactly as themselves.

Three consequences for how a route is laid out:

1. **Link length is a content decision, not spacing.** A long link is
   several seconds of readable driving, not dead time to be minimised.
   The old engine's `world.js` treats a link as the distance between
   intersections; here it is where most of the marking supply lives.
2. **A course needs more than one KIND of place**, or confidence is
   mute. An all-way stop cannot test it at all.
3. **The camera has to work on the link as well as at the box**, which
   is the second argument for `chaseFor` — a top-down view of a whole
   intersection is a poor place to read lane-keeping from, whatever the
   amplitude of the weave.

*Watchable:* a playable drive that is the current game, on a foundation
where the traffic behaves.

### Stage 4 — perception, faults, and a sheet that means something

`awareness.js` and `sight.js` as live inputs. Faults derived by
rating-stripped controlled comparison. The full marking sheet.

**FIRST INCREMENT: THE TWIN, MEASURED BEFORE ANYTHING IS BUILT ON IT.**
`tools/measure/twin.mjs`, seed 4, eight legs per profile, bends on. The
world is forked at each handoff, the candidate's disposition replaced by
the sound one in the fork with every piece of state kept, and both run
to the next handoff; the traces are compared ALONG THE ROAD, at the same
metre, not at the same instant -- because a twin who dwells half a
second longer at a line is eight metres behind for the rest of the leg,
and so is everyone behind them.

| profile | how they differ from their twin | where |
|---|---|---|
| sound | **exactly nothing, 8 of 8 legs** | -- |
| ragged | stray 0.66-0.67m, no speed or time difference at all | the right-hand bends, 21-66m of each 540m leg |
| heavy | 1.2 m/s faster, 14-24m of the leg, on stop legs only; nothing on through legs | 20m before the line |
| timid | 4.9 m/s slower over 95% of every leg; 9-14s later at the end of each | everywhere; the wait at the box |
| bold | 4.9 m/s faster over 90% of every leg; 6-22s earlier at the end of each | everywhere; the gap at the box |
| unschooled | 0.2 m/s at the line, 0.3s, on 2 legs; nothing on the other 6 | the line, when the road happened to be free |

**Five things this decides, and two questions it raises.**

1. **The fork is a controlled comparison.** The sound driver against
   their own twin differs by zero on every leg. Section 0 holds.
2. **Steering and braking localise, and to the places the model already
   named**: the bend for steering (5.15.18), the last twenty metres before
   a stop line for braking (5.15.10, "leaves it late"). The twin
   comparison can derive both as intervals in the old engine's sense.
3. **Confidence does not localise, because it is not an event.** Pace is
   a standing 5 m/s either side of the road's speed for the whole leg;
   gap acceptance is a time difference that appears at the box and
   persists. A fault with a `from` and a `to` is the wrong shape for a
   disposition that is on for the entire drive. The timid side already
   has its honest derivation -- undue delay, a threshold on the competent
   opening -- and the bold side's is the MIRROR of it: went when a
   competent driver would still have been waiting, from the same
   `blockedBy` expression at the moment of going. One expression, two
   directions, and it is what the twin's -22s at the box is measuring.
4. **The rolling stop is a binary fact, not a difference.** The roller
   crawls at 2.2 m/s where the twin comes to rest, but only where the road
   is free; held by traffic they stop like everyone, and over eight legs
   at a busy two-way stop that was six of eight. Where it does show, the
   twin reads 0.2 m/s. The honest observable is "came to rest or did
   not", which the sim holds directly and `marking.js` already reads.
5. **Context diverges once behaviour does.** The bold driver reads 12 m/s
   faster than their twin at 18m before one line -- not because they were
   doing 12 m/s more, but because the twin, arriving later, met a queue
   the bold driver did not. Per-leg forking bounds this to a leg; a
   derivation has to take the FIRST divergence and treat what follows
   as consequence, or fork on a rolling short horizon so the traffic has
   no time to diverge. Not decided; measured.

**And the risky tail was measured at the only place it can show, and
it does not show there yet.** `tools/measure/gaps.mjs` records, at every
commitment a candidate makes, the margin they left the car they had to
judge a gap against -- the other car's time to the conflict region on
its visible speed, less the candidate's time to be clear of it; planned,
not reacted, which is DECISIONS.md 6 and 7 in the sim's own terms.
Twenty minutes per profile over three seeds, two-way stops:

| profile | commitments | with anyone to judge | tightest margin taken |
|---|---|---|---|
| sound | 33 | 4 | 5.8s |
| bold | 41 | 5 | 3.9s |
| timid | 24 | 5 | 5.9s |

Nobody came within the old engine's entitled gap (0.9s), the bold
driver's tail is two seconds inside the sound one's, and the reason is
density rather than disposition: at the course's spawn rate the through
road offers a car every fifteen seconds or so, so a bold driver never
meets a gap tight enough to be a fault -- they waited four ticks at a
line in four hundred seconds. The crossing where undue delay was derived
ran four edges at 1.1s; the course runs ten at 3.0s. **Gap acceptance
is content the traffic has to supply**, the same finding as 5.14.8 from
the other side: a course needs busy roads as well as more than one kind
of place, and the spawn rate should be a per-road density rather than a
total. Not changed here, because changing it moves every course trace;
recorded as the first thing stage 4's sheet will run into.

**SECOND INCREMENT: THE STACKING COST -- BUILT.** `underLoad` in
traffic.js; verify-course section 12. The half of `directions.js` that
stage 3 had not brought across: a loaded driver is a worse driver. What
is held is every instruction beyond the one being executed -- the next
intersection's is discharged at the handoff and never carried; told
three ahead, a candidate carries two. The cost is the old engine's own
curve imported (pressure per instruction, composure under it, the
severity multiplier), applied to the DEFICIT on each axis, so a loaded
driver's weaknesses are the same weaknesses, larger, and each stays
inside the bound that held it unloaded: the weave inside the room,
braking no harder than abrupt, caution on its axis. A driver with no
deficit is unmoved. Read live, every tick, from what is held right now,
because a stepped world does not have to freeze it per leg the way the
old drive did; the one artifact -- the weave's amplitude changing in the
tick an instruction is given -- is measured at 2.6cm against a bound of
18cm.

Measured, same seed, same route: the ragged driver told one ahead runs
to 0.765m and spends 60.2s off the line in 300s; told three ahead, 0.900m
and 62.8s. **The cost is real and it is modest**, and the reason is the
bounds: a driver already at 85% of the room has 15% left to lose. The
sound profile moves from 0.090m to 0.127m, because it is rated 0.9 and
has a tenth of a deficit to amplify; a perfect one would not move.
`#/course` shows the load and the composure beside the direction
buttons, from the same view the sim drives from.

**THIRD INCREMENT: PERCEPTION AS A LIVE INPUT -- BUILT, MEASURED, AND
OFF BY DEFAULT FOR A MEASURED REASON.** `seenBy` in crossing.js, `lagFor`
in traffic.js; verify-course section 13; `tools/measure/lag.mjs`. Layer
2 stops being a query and becomes the actor's input: a driver decides
from the world as it was `lag` seconds ago, the lag being the old
engine's registration delay shape for shape -- the reaction floor plus
the span the observation deficit buys, with its jitter. The world keeps
its last few committed states for it, only when perception is on.

What it does, measured: a poor observer takes gaps a lag tighter than
they look (seen 7.1s, really 5.8s at the worst rating), every one of
them, never by more than the lag. What it does NOT do: read through
braking -- the braking distribution is identical at every observation
rating, because leaders here brake gently and following gaps are
comfortable; the first check asserted the opposite off one seed's single
event and failed on the next two, and the section now says so instead.

**Why it is off.** Lagging everybody makes traffic touch (one pair in
fifteen minutes, harsh braking tripled). Lagging the candidate alone
touches nobody on the course in forty-five minutes at any rating -- and
on the crossing the BOLD candidate rear-ends the car ahead, 47 car-ticks
in eight hours, because a bold driver keeps 0.39s of headway and
perceives 0.55s behind, and a driver aiming for a gap they cannot see in
time closes it. That is exactly the dangerous candidate the design names
(bold and blind), and it is a contact nothing draws and nothing responds
to -- section 0's rule and DECISIONS.md 5.12. So the default world lags
nobody and every trace that existed is the trace it was; the mechanism
is verified against a world that asks for it, and it switches on when
contact ends a drive (stage 5). Traffic perceives the present, as it
always has: the same asymmetry the old engine had, now stated.

**The two questions are the maintainer's.** Whether PACE is a markable
fault -- a candidate who drives at 70% or 135% of the limit for the whole
drive, with no single occasion -- and how an examiner marks it. And
whether a LATE BUT CONTROLLED stop is a braking fault: the heavy-footed
driver plans on 5.0 m/s^2 and the model's own line for abrupt is 5.4, so
by the manner ruling (5.15.15) they never commit one; the twin shows the
lateness is real and visible, 1.2 m/s at twenty metres. If late-and-
controlled is not a fault, the braking axis's markable content in this
model is traffic, not disposition, and that is worth knowing before
anything is derived from the comparison.

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


## 8. The road between intersections is content, not connective tissue

**THE MAINTAINER'S RULING, and it is the one that changes what a course
is rather than how one is paced:** *"the roads between the intersections
are just as important as the intersections themselves. this can't just be
dead air the player needs to be engaged at all times."*

It endorses what stage 2 measured (DECISIONS.md 5.14.8) and raises it
past a finding. **A route is not a sequence of intersections joined by
transit. It is a continuous stretch of assessable driving that happens to
contain intersections.**

The measurement it rests on: of the five axes, three read on the road and
only confidence needs the box.

| axis | where it reads |
|---|---|
| steering | the road — lane-keeping needs motion, and a queue has none |
| braking | the road — the whole of it is how late they leave it |
| confidence, as pace | the road — wanted speed and following distance |
| confidence, as gap acceptance | **the intersection**, and nowhere else |
| knowledge | the stop line itself |

At an all-way stop, where nobody judges a gap, a hesitant driver is
indistinguishable from a sound one — 1.0x the waiting, against 6.1x at a
two-way stop — while ragged, heavy-footed and unschooled all still read
as themselves.

What follows from it, and none of these is a note about pacing:

1. **Link length is a content decision.** Today a link is 558m at
   60 km/h because an approach has to hold the biggest gap anybody could
   ask for, and that number arrived from the gap derivation rather than
   from anybody asking how much driving a player should watch. It is now
   a quantity with two masters and they will not always agree.
2. **A course needs more than one KIND of place**, or confidence is mute.
   That is a statement about route composition, not about traffic
   density.
3. **The camera has to work on the road**, which is the second
   independent argument for `chaseFor` — and 100 km/h settled what kind
   of help it should be (section 8.1).
4. **A link needs things to read.** Everything the old engine built for
   segments — parked cars, driveways, emerging vehicles, pedestrians —
   lands here rather than being scenery between the interesting parts.
   `world.js`'s hazard layer is not a nice-to-have on this reading; it is
   half the content.

### 8.1 100 km/h passes, and it answers the camera question

The maintainer, on stage 0 at the higher limit: *"the traffic looks great
at 100kmh."*

That settles an open question in this file's own words. The trade a fixed
camera cannot escape is that six seconds of road at 100 km/h is 167m, so
a car is about six pixels wide — and the answer is that **the wider view
of more traffic plays better than a close-up of less.** No change is
needed at stage 0.

It also decides what the chase camera at stage 3 is FOR. Not to make cars
bigger: **to see more road ahead.** `LOOK_AHEAD` in the old engine is a
DURATION for exactly this reason, and the tension recorded there — 10s
reads as anticipation and 4s reads a fault — resolves toward the longer
one now that a wide view is known to play well.

### 8.2 A CURVED ROAD COSTS ALMOST NOTHING NOW, AND THE OLD RULING NO
LONGER APPLIES

Wanted, on the roadmap: *"I'd like to find if we can generate a curved
road that challenges steering ability a little."*

Curves were ruled out earlier as a deliberate constraint. **That ruling
was made against the old engine and does not survive the rebuild.**
There, roads were compass-fixed and `LEG` was discrete, so a curve meant
reworking the geometry everything else measured from. In a stepped
simulation a car follows a path, and a curved path is a different path.

**Measured rather than assumed.** A real approach was bent into a real
bend and traffic put on it:

| | straight | bent |
|---|---|---|
| the path | 4 points, 558.0m | 27 points, 558.9m |
| walking it | 0.500m per half-metre step | 0.500m — no jumps |
| the conflict scan | meets at 273.5m, clear of 284.7m | meets at 274.0m, clear of 284.7m |
| traffic, four minutes | — | 63 cars through, **0 overlaps** |
| cars on their own line | — | 0.01–0.05m off, which is the weave and nothing else |

So the following model, the yield rules, gap acceptance, the conflict
geometry, the overlap test and the driver model all take a curve without
being told about it. **The cost is not in the simulation.**

Three things it does cost, in order of size:

1. **THE RENDERER DRAWS ROADS AS RECTANGLES**, and this is the real cost
   and the only one that is new work. Every sim screen draws the
   carriageway as a `<rect>`; a curved road has to be drawn FROM the
   path, as a thick stroked polyline. It is small — but it is exactly
   section 0's rule, because until it is done the engine can produce a
   bend that the screen cannot express, and a car would appear to drive
   off the road.
2. **`alongDir` projects onto a straight lane direction** — one line, in
   the cross-boundary following in `whatStops`. Measured, on an 8m
   following gap:

   | bow over a 273m approach | radius | 8m reads as | error |
   |---|---|---|---|
   | 2m | 831m | 8.00m | 0.00m |
   | 10m | 166m | 7.95m | 0.05m |
   | 20m | 83m | 7.80m | 0.20m |
   | 40m | 42m | 7.27m | 0.73m |
   | 80m | 21m | 5.90m | 2.10m |

   A 60 km/h road wants about a 150m radius, where the error is five
   centimetres. **For the bends a real road at these speeds has, it is
   already accurate enough**; it needs replacing with distance-along-lane
   only for bends tighter than about 40m.
3. **Placement, and only if the curve changes the bearing.** A bow that
   returns to the heading it started on costs nothing at all — the seam
   is untouched by construction, because both ends of the path are where
   they were. A curve that ARRIVES on a different bearing needs
   intersections to carry a heading, and then `SIDES`, `OPPOSITE` and
   `rightOf` stop being compass constants and become relative bearings.

**That third one is the expensive version and it is what the old ruling
was actually refusing.** It is still expensive. The cheap one — a bend in
the road BETWEEN two compass-aligned intersections — is available now,
and it is what was asked for.

### 8.2.1 BUILT: the bend, the renderer that can draw it, and the wide line

Three increments, in the order section 0 demands -- the renderer first,
because until a curved road could be drawn the engine could produce a
bend the screen could not express. Every number here is from
`tools/measure/bend.mjs`, kept so it can be produced again; the first
measurement above was run inline and could not be, which is why the
shape behind its table is not this one.

**The renderer draws the road from the path.** `roadsOf` in `course.js`
hands whatever draws the course one polyline per link -- box edge to box
edge through the seam -- and one per edge leg, along the same axis the
lanes are offset from. Both sim screens stroke it, two lanes wide, with
the centre line dashed along it; the box is the one rectangle left. On a
straight course it is the rectangle it replaced, measured: every road
collinear. And it is checked at full stray rather than on the line: a car
0.45m off its line is still 0.45m inside the drawn edge on every leg,
straight or bent (verify-course section 10).

**The bend is the cheap kind, and it is exactly as tight as the road
allows.** A leg bows sideways and comes back parallel -- zero offset and
flat through the stop line, so the box and every turn arc are untouched;
the full offset and flat at the far end, so the seam is where it was and
pointing the same way. The shape is the smoothest step, chosen for what
it gives free: zero curvature at both ends, so a queue sits on straight
road at the line and the road is straight through the seam, where
`alongDir` has to be accurate. The one sample touching the line and the
one touching the seam are exactly straight, not merely flat -- a chord
across any part of a smooth bow has a slope, and a seam that turned by
0.08 degrees is a seam that turned. Measured with every link bent: 14
seams, 0.0m apart, 0.0 degrees out.

The radius is derived from the road's speed and ONE constant taken from
road design rather than tuned: the side-friction factor a flat street is
built to, 0.15 g. At 60 km/h that is 189m, and the bow that produces it
over a 262m leg is solved for (58.6m). At the limit a driver at the
road's speed feels 1.47 m/s^2 sideways and the boldest driver in the
model 2.68 -- comfortable either way, which is what "challenges steering
a little" should mean. The design constant is the one number in the
increment that is data rather than derivation, and it is flagged as such.

| speed | reach | bow | tightest radius | extra length over the leg |
|---|---|---|---|---|
| 40 km/h | 181m | 62.8m | 84m | +15.7m over 351m |
| 60 km/h | 262m | 58.6m | 189m | +9.6m over 513m |
| 100 km/h | 437m | 59.8m | 524m | +6.0m over 863m |

**`alongDir` was measured where following actually uses it**, not on a
bow of a shape nobody can reproduce. Across the seam of a bent link,
every cross-boundary gap up to 60m reads short by at most 0.26m, and it
only ever reads SHORT -- the projection under-counts arc length -- so the
error is on the cautious side of a following model whose wanted gap at
this speed is about 27m. At 120m gaps the error reaches 3.4m and at 200m
about 9m, where nothing in the model is following anybody. It stays one
line.

**The wide line is the other half of the steering axis, and it made
lane-keeping markable.** One deficit, two expressions: a driver who
cannot hold a line weaves on a straight and runs wide on a bend. The
weave takes half the room between a car and the next lane, because the
driver over there has the same claim on the other half; the wide line
takes THIS driver's other half, with the same deficit, so at the worst
of the axis on the tightest bend the road allows the car's side reaches
the centre line and no further. Nobody touches by construction -- two
seeds, every link bent, a ragged candidate aboard, 400s: zero overlaps.

And the two together clear the old engine's visibility floor where the
weave alone could not: measured, ragged 0.382m on a straight and 0.765m
on a bend, everyone else 0.045m and 0.090m. `POS_VISIBLE` is imported
from `faults.js` rather than restated, so the floor is the old engine's
and it was not lowered to make a fault appear. Strip the steering
deficit -- the only rating ragged and sound differ on -- and every
showing vanishes: derived, not authored.

**It shows on right-hand bends only**, because the outside of a
right-hand bend is the oncoming lane and the outside of a left-hand one
is the curb, and the maintainer's ruling on the wide turn (DECISIONS.md
5.8) is that off-road is rare and not this model's. Every bow gives each
driver one of each, so no bent link is silent. **One showing per bend**,
the way the old engine derives one fault per trait per scenario: from
the first instant the stray clears the floor to the last, however many
times the weave dips it back under in between -- twenty half-second
flickers on a sheet would be the sinusoid showing, not the fault. Ten
right-hand bends met, ten showings, 4.2s each; a prompt examiner catches
every one on the sheet.

**Found on the way past, and not the bend's doing:** on the turn arcs a
right turn's 3.85m radius passes 0.95m outside the curb corner, so a car
weaving to the right clips the corner by 8cm. That is the open radius
question in DECISIONS.md 5.15.12 in another guise, reported by the
measurement rather than hidden by a check that looked only at the legs.

**AND IT IS WHERE THE OTHER HALF OF THE STEERING AXIS LIVES.** Steering
currently expresses as lane-keeping, which is honest but subtle: 0.38m of
swing, 37% of a car's width, and it reads as a car not quite settled
rather than as a driver getting something wrong. The other half — a wide
line — is deferred because CLAUDE.md's own ruling is that **a wide turn
needs a next lane to be wide INTO**, and every road in the sim is one
lane each way.

A bend has one. The outside of a curve is somewhere to drift to, and a
driver who runs wide on a bend is legible in a way that a slightly
off-centre car is not. So a curve does not merely give the steering axis
a harder test — it makes the half of the axis that cannot currently be
expressed at all expressible, and it does it on the link, which is where
the maintainer has just said the player has to be engaged.

Not built. Reported so it can be placed on the roadmap knowing what it
actually costs.

### 8.3 The strip along the top is a component, not a readout

The maintainer, on the map above the stage 3 display: *"something we can
use later on to display things to the user along the road."*

So it is kept and named with that intent rather than as a debug view that
happens to look good. What it is: **the whole course at once, small, with
the driver's own position marked and the route they were given drawn on
it.** What it is FOR: anything the player needs to know about the road
ahead that does not fit in the close view — where the next instruction
applies, where a hazard is, how far is left, what has been marked and
where.

Two properties it must keep to be that. It shows the WHOLE course, so
nothing on it can be positioned relative to the camera. And it is legible
at a glance, so what it carries has to be a handful of marks rather than
a second rendering of the world.

## 9. New project, or replaced layer? — a replaced layer

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

## 10. What is needed from the maintainer before starting

Nothing blocking. Two things worth having early:

1. **Stage 0 is a judgment call and it is yours.** Does traffic that
   follows and queues read as *alive*? Nobody else can answer that, and it
   gates everything after it.
2. **The two rulings still open** — whether a candidate should ease off for
   a car sitting in a driveway, and what an intervention IS on the sheet —
   become *more* answerable in a stepped world, not less. Neither blocks
   stage 0.
