# CLAUDE.md

Read this before making changes. It encodes decisions that took a long time to
get right, and several of them are non-obvious.

## What this repo is

**Right of Way** — a real-time judgment game. **You are the examiner.**

You sit in the passenger seat while a candidate drives a set course. You hold
a field of view and can only mark what you actually saw. You give the
directions, in time for them to be followed. You watch for danger and take the
wheel when you have to. And you mark the faults you catch — while paying for
the ones you invent.

This is the whole game. There are no other modes.

**It was a driver game until 2 Sep 2026, and most of the code still is.** You
were one car at an intersection, pressing GO the moment the road became
legally yours. That premise is finished, but nothing has been deleted: the
driver game is shipped, verified, working code and it is the material the
examiner game is built from, not a thing to tear out. Sections of this file
still describe it because it still exists. See "The examiner game" below for
what is agreed, what is built, and what is not.

React + SVG, no canvas, no game engine. Mobile-first.

**DriveDraw** — a diagramming tool for driving instructors — used to live here
too. It is no longer wired in. The source is still at `src/apps/DriveDraw.jsx`
and in git history, but nothing imports it and it is not in the bundle. Do not
resurrect it into this app without being asked.

The working name is Right of Way. **PRNDL** was considered and is on hold:
there is a live automotive app of that name shipping on both stores, and a US
trademark registration (class 037). Neither is necessarily a bar, but it is not
a decision to make casually a second time.

## Domain authority

**The maintainer is a driving examiner in Ontario, Canada. Their reading of the
rules wins over anything you infer.** If a change depends on a traffic-law
assumption, say so explicitly and ask rather than guessing. Getting a rule wrong
does not merely lose a user — it teaches someone something false.

**The audience is North American, and the rules should read that way.** Where
Ontario practice and general North American practice differ in a small way, and
the general reading makes for better gameplay, take the general one. Nothing
here should be so provincial that a driver in Michigan finds it wrong.

That is a licence to generalise, not a licence to be vague. A rule that is
actually different somewhere — not merely worded differently — still has to be
picked deliberately, and said out loud when it is. Teaching something false is
still the worst outcome available.

Jurisdiction-specific rules are not lost, they are deferred: the plan is an
international mode later, flagged by country, where the differences become the
point rather than a trap. Anything genuinely local should be written so it can
move into that mode rather than being baked into the default.

### Rules already established — do not regress these

- **Right of way is about path conflict, not intersection occupancy.** You do
  NOT wait for another vehicle to completely exit the intersection. You wait
  until your path is clear of theirs. This was an early bug and it is a big deal.
- **Two vehicles going straight from opposite legs do not conflict.** They pass
  on their own sides. The window opens immediately.
- **A moving vehicle claims the road ahead of it**, proportional to speed. This
  is what makes turning across an oncoming stream a conflict even when the
  arithmetic says you would squeeze through. A stopped vehicle claims nothing.
- **A pedestrian on a crossing holds the near half, not the whole thing.**
  Deliberately changed from "holds the entire crossing until completely
  across": once they are past the midpoint — onto the side serving the
  opposing direction of traffic — a driver may go. Still a legal rule, not
  a geometric one, still encoded as an explicit override (`blockUntilClear`
  in `index.js`), just narrower — real drivers take the lane once it opens
  rather than waiting for someone who has already left their side of the
  road. Progress is `pose.progress`, the same `k` `poseOn` already derives
  for the walk, so this needs no geometry of its own and does not care
  which direction the pedestrian is walking (`p.reverse`). One accepted
  side effect: `walker`'s window (and any other scenario whose pedestrian
  is on the exit leg rather than the approach) no longer lands on the same
  instant from every rotated approach, because which physical half is
  "near" is not compass-fixed the way the old full-crossing hold was —
  see `verify-route.mjs`, which checks every rotation is still individually
  safe rather than identically timed.
- Simultaneous arrivals resolve by the right-hand rule, then left-turn-yields
  for head-to-head.
- **Proper signalling is 2–3 seconds before a change of direction or before
  stopping at the line.** A late signaller sits outside that window but must
  still be readable — `LATE_SIGNAL_LEAD` is 0.8s, not zero. The lesson is "do
  not commit on an absent indicator", never a gotcha. An indicator that appears
  after the wheels have turned punishes attentiveness instead of assumption.
- **Signal before any change of direction OR motion**, slowing included when
  the slowing leads into a turn. In `actions.js` the signal deadline therefore
  anchors to whichever act comes first — the slow, the moving-off, or the
  manoeuvre — never to the manoeuvre by default.
- **Partial success is partial marks, like a road test.** Perfection is
  rewarded, not required. Omitting a step scores nothing for that step but
  does not fail the task; doing the right things in the wrong order keeps a
  little credit, because the player knew to do them, but not much, because a
  signal after the fact informed nobody.
- **Too much creep is intersecting the path of other traffic** — which
  includes pedestrians and cyclists approaching a crossing, not only vehicles
  on the road. Ontario also holds that a vehicle waiting to turn left must not
  cross the stop line while a car ahead of it is already waiting in the
  intersection; that is a scenario waiting to be written.
- **A T-junction defaults to a stop on the minor leg only**, with the through
  road running uninterrupted. Any other configuration must remain expressible —
  control is per leg in `road.js`, and an all-way stop is simply four legs that
  agree.
- **An emergency vehicle on a call outranks everybody.** Not by arrival
  order, not by which side it is on, and not by any `priority` a scenario
  stamped on somebody else — `outranks` in `index.js` checks `emergency`
  first, before anything else can talk its way past it. The only thing
  asked of the player is to yield and go once it is safe, so there is no
  new action and no new button: it is the ordinary GO, against a window
  the rule has moved.

  **Yielding is not freezing.** Priority decides who goes first where the
  paths actually meet. A call three intersections away is still a prior
  and still costs nothing, because the ego is long clear before it
  arrives — a version that pinned a driver to the line for a distant siren
  would be teaching a habit nobody wants. Both halves are checked in
  `verify-events.mjs`.

  Pulling over is deliberately NOT modelled here. It only makes sense
  for a driver already in motion, so it belongs to a lane-change or
  merge scenario rather than to a car stopped at a line.
- **An instruction is given as early as it is clear what it is
  specifically asking.** The maintainer's practice, verbatim: "I will ask the
  applicant to 'turn right at the first street' more or less as soon as that
  statement is true to where our route takes us." So the instruction window
  OPENS when the phrase stops being ambiguous — when the junction ahead is the
  one the phrase points at — and CLOSES when the candidate must already be
  acting on it. Neither edge is a number anybody picked; both are derived in
  `directions.js`.

  **Stacking instructions is a trade, not a fault.** Also verbatim: "I will
  avoid giving instructions in a row, only when having multiple instructions
  to execute does not overwhelm the concentration of the applicant, or when
  knowing the multiple steps required in advance will give the driver the most
  possible time to complete their task." Both halves are real and they pull
  opposite ways, which is what makes it a mechanic. Calling ahead buys the
  candidate time — an instruction given early can never be given late — and
  buys the examiner attention back for the other three systems. It costs the
  candidate's concentration, and **a loaded driver is a worse driver**. You
  are trading your own risk for theirs.

  Measured, so the meter is not a feeling: at full stack the candidate's
  wide turn is 62% wider and their slow start 56% worse. `verify-directions.mjs`
  reads that through the same fault derivation the examiner marks against,
  rather than asserting that a number moved.

- **Someone waiting at a crossing button holds none of the crossing.**
  The signal has not changed; traffic keeps moving, which is what happens
  at a real push-button crossing and what makes the press worth reading —
  it is a warning that a phase is coming, not the phase itself. See
  `holdsCrossing` in `index.js`. Without that rule a waiting pedestrian
  would block from the moment they became visible, and the button would
  be indistinguishable from them simply walking out.

  The wait between press and walk signal (`PED_BUTTON_WAIT`) must stay
  longer than `GRACE`, so the phase never lands inside the graded window.
  Otherwise the scorer would be handing out marks for time that drives
  into a crossing.
- **Legally yours and safe to take are not the same thing, and the scorer
  grades the second one.** `legalAt` is derived against priors only — whoever
  outranks the ego. A non-prior is still a physical object: one still
  arriving when the window opens can be scheduled, or simply driving, on the
  assumption the ego leaves promptly, and a player who takes the grace the
  scorer offers can meet it anyway. `safeAtFor(sim)` in `index.js` is the
  real scoring boundary — checked against everyone, across the whole graced
  window and every depth of creep. Grade against `safeAtFor(sim)`, never
  against `sim.legalAt` directly.

  It diverges from `legalAt` on about half the set situations now, and
  that is the mechanism working rather than failing. It used to be nearly
  a no-op, but only because traffic crossed an intersection in a fixed
  1.5s: almost nothing was still arriving inside the ego's 2.6s of grace.
  Real acceleration made crossings take three times as long, so a second
  road user still on its way in during that grace is ordinary. What is
  checked in `verify-wontstop.mjs` is the invariant that actually
  matters: `safeAt` is NEVER earlier than `legalAt` — that direction
  would mean the scorer offering a window the engine calls unsafe — and
  `wontstop`, which deliberately authors a driver who never yields,
  stays the largest divergence by a clear margin (4.1s against 1.4s for
  the next). An ordinary scenario diverging past 2s is treated as a bug
  somewhere else surfacing here.
- **Merging is scored on how early the driver started solving it, not on
  hitting a moment.** This is a third scoring shape and it does not fit the two
  that exist. `deadline` asks "done by when" and `window` asks "not before" —
  merging asks *how soon*, with credit falling off the longer it is left.

  What earns it: looking over the ramp **before the lane opens**, signalling
  early, and adjusting speed early. A driver who waits until the merge point
  to start assessing the traffic beside and behind them has already lost the
  thing being measured, even if they then merge safely.

  Whose fault it is when nobody lets you in depends on what the driver did.
  Signalling late, or picking a gap that was never there, is theirs. Doing all
  of it early and still being shut out is not.

  Harder still, and the case worth building toward: an on-ramp that doubles as
  an off-ramp, so exiting traffic crosses the merging traffic. That is a weave,
  and the engine can derive the conflict rather than being told about it.
- **Signalling out of a roundabout is best practice, not common practice.** So
  the indicator can never be the thing a roundabout scenario asks you to read.
  The line carries it instead: a driver about to leave drifts to the outside of
  the circulating lane, one staying in holds the inner line. That is geometry,
  so the engine derives what it costs — it is not a script that punishes you.

  Two things this has to keep satisfying, both checked in
  `verify-roundabout.mjs`. The drift has to be visible **before the player must
  decide**, or it is a post-mortem rather than a tell. And it has to be worth
  reading: the payoff is at the exit *before* yours, because a car peeling off
  at your own leg crosses your give-way line on the way out and holds you up
  anyway. Currently worth 3.25s.

## The examiner game

Four systems running at once, which is the point: they compete for the same
attention, and the interesting failures come from that competition rather than
from any one of them being hard.

1. **Observe the candidate's driving.** They drive; you watch.
2. **Assess observable errors.** Mark what you caught. Marking a fault that
   did not happen has to cost, or the strategy is to mark everything.
3. **Watch for danger and intervene.** Take the wheel before it becomes a
   collision.
4. **Give the directions.** A set course, and the candidate only knows what
   you told them.

**The flip was cheap for one reason: the candidate is just a participant.**
`simulate()` calls `schedule([ego, ...actors])`, and `schedule` applies driver
traits to everything it is handed, the ego included. So the car being examined
needs no special case anywhere — it drives badly in the same named, measured
ways any NPC does. Measured: 6 of the 7 driver traits produce a visible fault
on the candidate's own car.

### Never author the fault

The driver game's one inviolable rule was **never author the answer** — the
safe window is simulated, never typed in. The same temptation reappears here
wearing a new costume: hand-writing "at 3.4s this driver swings wide, mark
it". Do that and the game is a memory test with a driving skin.

So a fault is DERIVED, by controlled comparison: simulate as written,
simulate again with one trait stripped from one driver, diff the poses. Where
they separate by more than a driver could fail to notice, the fault is
happening, and the car's position at those instants is where an examiner would
have to be looking. Same car, same schedule, one thing changed — the technique
`verify-windows.mjs` already used to prove a trait matters at all.
`src/engine/faults.js` does this and `verify-faults.mjs` proves it: strip the
trait and the fault must disappear, every time.

This also settles the hardest content question for free. The derivation that
produces a fault produces its **visibility** too, so a fault the player could
not physically have seen cannot be marked against them.

### What is built

- **`src/engine/faults.js`** — fault derivation. `faultsIn(scn)` returns every
  fault from every participant with who, what, when, where, how long, and
  which channel it reads on. `MIN_DURATION` is a real gate: `lateflag`'s late
  signal lasts 0.15s and is correctly dropped as uncallable.
- **The examiner's seat, in `sight.js`** — `examinerEye`, `inCone`,
  `whatExaminerSees`, `faultVisibility`. The cone is one angular test in front
  of the occlusion `visibility()` already did; that is the entire engine cost
  of the headline mechanic.

**Gaze is relative to the car's heading, never absolute, and that is
load-bearing.** `route.js` rotates a scenario a quarter turn to reuse it from
another approach, and the whole reason that is safe is that a rotated scene is
an identical situation pointing a different way. A gaze held in world degrees
would break exactly that — the same drive would need a different look from
each approach. Checked on 9 rotated copies in `verify-faults.mjs`.

**Three visibility states, not two.** `away` is distinct from `hidden` on
purpose: missing a fault because a van was in the way is the scenario's doing,
missing it because you were looking elsewhere is yours. Only one of those is
markable against the player.

### Detection: grading the examiner — built

`src/engine/detect.js`. The fourth scoring shape, and none of the three
existing ones can express it: `deadline` asks "had you done it by when",
`window` asks "not before when", merging asks "how soon did you start".
This asks which of the things that actually happened you caught, what you
invented, and whether you were watching at the time. Precision and recall
with a clock on it.

Three rules carry it:

- **A fault you could not see is not one you missed.** Recall counts only
  faults genuinely observable — `SEEN_ENOUGH` of them, given where the
  player was really looking. A drive where nothing was visible is a clean
  sheet, not a failure. Without this the game punishes players for its own
  geometry.
- **Inventing a fault costs** (`FALSE_COST`), or the dominant strategy is
  to mark constantly. Measured: spraying 40 marks scores 0 against a real
  drive's 100, and precision drops to 0.075. One fault pays once — repeat
  marks on it are recorded as invented.
- **Prompt beats late beats silent.** Full credit while the fault is
  happening, easing to `LATE_CREDIT` by the end of `CALL_GRACE`, because
  noticing on the way out of a junction is still noticing.

**Whether a mark carries a category is deliberately left open**, because
it is the maintainer's call whether a player picks one one-thumbed
mid-drive. Pass `what` and it is scored as a categorised call — naming the
wrong fault is an invented call, not a free hit; omit it and only the
timing is graded. Both are verified.

`verify-detect.mjs` is property-based rather than a restatement of the
formula: marking everything must lose, marking nothing must lose, catching
more must never score worse, and an unseen fault must never count against
you. Those would have to hold of any correct implementation.

### Belief: where you think the traffic is — built

Sight answers "can I see it now". `src/engine/belief.js` answers the
examiner-ish question: what do I still think is true about a car I looked
at four seconds ago? Look at a car and you learn where it is; look away
and you carry on believing it is doing the normal thing, vaguer the longer
you leave it; look back and you find out.

**The prediction is "they carry on driving properly", not dead
reckoning.** A straight-line extrapolation would have every turning car
read as a deviation, including impeccably driven ones, and the mechanic
would be noise. What an observer expects is competence. So the prediction
rides `cleanPose`, and the payoff is the property that makes it worth
having: **belief and reality diverge exactly where a driver is doing
something wrong.** Looking away from good driving costs nothing —
measured at 0 m across every clean driver in the set, including 7 clean
turning cars. 3 of 23 road users would betray a stale belief, so a
deviation means something rather than being a tax on looking away.

**`cleanPose` is NOT `basePose`, and assuming otherwise cost four traits
their entire contribution.** `poseAt` is `basePose` plus the traits that
bend a pose (`wander`, `creep`), so `basePose` is clean of those — but the
traits that rewrite a parameter (`overshoot`, `slowStart`, `wideTurn`,
`cutsCorner`) write `stopBias`/`turnBias`/`startDelay`, which `movementOf`
and `schedule` then read, so `basePose` already CONTAINS their fault.
Predicting from it hands the observer oracle knowledge of the very faults
they are supposed to catch: all four measured a belief error of exactly
zero until this was found. `cleanPose` in `index.js` rebuilds a trait-free
twin, and `startDelay` needs winding back by hand because `schedule()`
spends it into `departAt` rather than leaving it for `movementOf`.

The offset is **carried, not snapped**: the prediction keeps whatever
error the car had when you last looked, so a glance never teleports it and
a car has to CHANGE what it is doing wrong to fool you. `lateSignal`
correctly produces no belief error at all — it bends no path, so it is
something you had to have been watching.

### The camera rides with the candidate — built

`chaseFor` in `frame.js`: the view is centred on the candidate's car and
turns alongside it, so the candidate's straight-ahead always draws upward.
That is what makes the examiner's gaze — already held in degrees off the
car's heading — land on a fixed screen direction, and it is the reason
relative gaze was the right call in `sight.js`.

**It follows the INTENDED pose, not the actual one, and that is the whole
design rather than an implementation detail.** Lock the camera to
`poseAt()` — where the car really is — and the car sits dead centre and
perfectly straight forever while the WORLD wobbles around it. Every
steering fault the game exists to catch would vanish at exactly the moment
it happened: a wandering driver would read as a wandering camera, a wide
turn as the road sliding sideways.

So the camera rides `basePose()`, the same trait-free control
`faults.js` diffs against. The car is drawn at its real pose and visibly
deviates from the centre of frame; that deviation IS the fault, exposed as
`drift` for a renderer that wants to say so out loud. One idea read two
ways. It also kills the wobble for free — `wander` turns the heading ±6°
several times a scenario, and `basePose` has no twitch in it.

**The view is sized as a DURATION of road ahead, not a distance.** A
distance is wrong at one speed or the other; ten seconds is the same
judgment at any speed, and it is roughly how far ahead a driver is
actually thinking. `LOOK_AHEAD` is 10s, read against the leg's own motion
profile — its cruise or top speed, never the instantaneous one, which
would collapse the view to nothing at a stop line and heave it open again
on the pull-away. The car sits low in the frame (a quarter of the forward
reach behind it) so the road ahead gets the space.

At 10s that is 72m on `gap` and 115m on a 41 km/h straight, and **it is
almost certainly too wide to read a fault by** — the candidate is a few
pixels on a phone. Around 4s (29m) reads well and 10s reads as
anticipation. That tension is real and not yet resolved: the examiner
needs both, and the answer is probably not one fixed number. The Examiner
lab has it on a slider for exactly this reason.

**A chase view sweeps far more world, in two ways.** It travels with the
car, and it rotates — so the corners of a square viewport swing out to the
half-DIAGONAL, not the half-width. `worldHalfFor(spec, sim, camera,
{ chase: true })` pays for both, measured off the car's own path. Same
failure mode as the ambulance in the void: whatever the camera can reveal
has to have been drawn. On `gap` the world goes from 360 to 951.

Playable in the **Examiner lab** (`src/apps/ExaminerLab.jsx`, `#/examiner`,
first entry in the mode switcher): the chase camera, the gaze cone, every
derived fault with its live visibility, and the stacking meter, all on one
canvas with the knobs exposed. It is a bench, not a game — it scores
nothing, and when there is a real examiner renderer it is scaffolding and
should go.

**Reading the candidate's own car is a different act from spotting anyone
else's, and the geometry says so.** The examiner sits IN that car, about
a metre from its centre, so the bearing to it is meaningless — every fault
it commits would read as 90 degrees off to the side, and the whole
candidate-observation half of the game would score zero. `faultVisibility`
therefore judges the ego against the road ahead of its own bonnet
(`OWN_CAR_READ_AT`), with no occlusion, since nothing can hide your own
car. Gaze still matters: looking out of the side window stops you reading
the line, measured at 100% ahead against 0% aside.

### Directions — built

**A set course is a route.** `route.js` already sequences intersections and
keeps continuity, and the instruction to give at each junction is simply that
leg's `ego.intent`. `exitHeading` and `entrySideAfter` already derive where the
candidate ends up **from their actual intent**, which is exactly what going
off course needs.

Three rules make this the system that ties the other three together:

- **Silence means straight on.** A candidate told nothing carries on ahead. So
  a late instruction is a missed turn, not a pause.
- **An instruction has a deadline, not a window.** It must be given in time to
  be followed. That is the `deadline` shape `actions.js` already implements —
  no new scoring shape needed for this one.
- **A late instruction is the examiner's fault, not the candidate's.** This is
  real practice and it is the interlock the whole design rests on: being busy
  marking a fault makes you late with a direction, and the resulting error is
  then yours and unmarkable. The four systems have to be able to make each
  other fail, or they are four scoreboards rather than one game.

### Driver identity — built

**One candidate, composed once, driving the whole route.** `candidate.js`
holds them; `egoFor` is the one place a scene gets its driver, so a junction
and a segment ask for the same person. Before this the candidate was not
merely inconsistent, they were FLAWLESS: measured over 320 generated
junctions, the ego carried no traits at all and committed none of the 143
faults on offer, while segments took whatever traits their caller felt like
handing them. The route's turn survived into the composed junction 9 times
in 120 — about what chance gives — so the examiner was directing a manoeuvre
the candidate was never making. It is 56/56 now, because a draw whose road
lacks the leg the route asked for is refused rather than quietly re-seated.

**The trait model already expressed a habit; the WORLD did not.** Nothing
about a driver trait was per-scenario — it lives on the participant and
`schedule()` applies it to everyone. So no third word was introduced: a
trait is the disposition, a SHOWING is one occasion it visibly expressed,
and a habit is a trait with several showings — a derived property of a
drive, not a field on anybody, which is what makes it checkable.

**A habit that manifests once is an incident.** For a player to identify a
tendency they must form a hypothesis and then test it, so
`SHOWINGS_FOR_A_HABIT` is 3 and it is measured, never tuned to fit. And the
testing half needs no separate machinery: a left turn is where `cutsCorner`
would show, so a left turn where nothing happens is evidence AGAINST it.
Measured per drive: 24 of 25 carried traits identifiable, and 82 rival
habits given three or more chances they visibly declined.

**Where a habit can show is DERIVED, never tabulated.** `chancesAt(shape)`
builds the smallest scene with that shape and asks `faultsIn` — a cheaper
call to the same oracle, not a second oracle. Writing "cutsCorner needs a
left" down would author the answer and go stale the first time a trait
changed. It also caught what a table would have frozen in: `creep` reads as
inert everywhere until the candidate has something to actually be HELD by.

**Recurrence is the accept/reject loop narrowed, not a new mechanism.**
`mustShow` is `mustFault` asking for THIS driver's habit rather than
anybody's fault; it subsumes it, shares the one expensive `faultsIn` call,
and sits where every other guarantee in `compose.js` lives. The fallback
ladder gains one rung at the top so a habit with nothing to say here cannot
cost the player a junction. The planner steers WHICH turn, never whether to
turn — a route still has to read like a route. Persistence alone was most of
the win (20/25); asking and steering are the finishing 4.

**Two habits that cannot both be true are refused, derived the same way.**
`wideTurn` and `cutsCorner` both write `turnBias`, so a driver fitted with
both had one silently overwritten and it derived no fault at all — measured,
`wideTurn` took 0 showings from 5 chances. A pair is incompatible when
fitting both hides either, which is the same controlled comparison asked of
two traits instead of one, so a new trait that writes over an old one is
caught on its first draw.

**A tell must be true of the car on a road with no line, too.** `overshoot`
and `slowStart` write `stopBias`/`startDelay`, and `stopBias` shifts the
origin of the traverse whether or not anyone braked — so on a segment a
candidate produced 3.8s of markable fault whose tell said they had stopped
past a line that was not there. Both are now guarded on `p.stops`, the same
rule `cutsCorner` already lived under. It removed real supply and the supply
was false: 17 non-stopping actors in 114 composed scenes were carrying one.

### A driver is four ratings, and traits are what they compile to

**CONFIDENCE, STEERING, BRAKING, KNOWLEDGE** (`ratings.js`). A rating is a
standing disposition by construction, so identity stops being bolted onto
the scenario model and becomes the model — and habits emerge instead of
being scripted, because a weak axis produces the same kind of error again
and again across situations that look nothing alike.

**Traits are not deleted, they are COMPILED.** The roll resolves once, at
composition time, from the scenario's own seed, and its output is the same
trait list a participant always carried — so `schedule`, `poseAt` and
`faultWindow`'s controlled comparison are untouched, and ground truth
stays deterministic and replayable. A candidate carrying `traits` instead
of `ratings` keeps them verbatim, which is why every hand-authored
scenario and the golden are unmoved. Never resolve the roll at simulation
or render time: there would be no discrete thing to strip, no control to
diff against, and only `POS_VISIBLE`/`MIN_DURATION` separating a fault
from numerical noise.

**Confidence is two-tailed; the other three are monotonic.** Too little
gives hesitation and refused gaps, too much gives tight gaps and skipped
observation, and there is no such thing as steering too well. So
confidence is held as a POSITION with an optimum and measured as deviation
from it. Two candidates can then fail in opposite directions on one axis,
which no monotonic rating can express.

**`CAUSES` is the one table this project authors on purpose.** Attribution
is weighted and multi-axis — `cutsCorner` is the maintainer's ruling,
"a steering error combined with a knowledge error" — because measured
across the set only `wander` and `wideTurn` belong unambiguously to one
axis. Everywhere else the answer is derived, but "why did that driver do
that" is not recoverable from geometry at any price: it is a claim about
people, so it is data and it is the maintainer's. The same weights are
read in both directions, generation and attribution, because two tables
would drift the first time either was tuned.

**An axis is only readable through errors it DOMINATES.** Entangled
evidence does not accumulate into an inference. Measured: knowledge has
19.1s of evidence per drive of which only 4.8s is dominant, so it speaks
constantly through cut corners and overshoots and can never be heard on
its own. Braking and knowledge each dominate ONE kind of error, and
confidence has no risky-tail error at all — three measured content gaps,
reported by `verify-candidate.mjs` rather than left as a worry, and they
are what R2 exists to fill.

**Error FREQUENCY is not readable and must never be made so.** `briefFor`
swings the fault rate between 0.15 and 0.9 on dead air, so frequency
carries the pacing budget's signal, not the driver's. Pacing owns how many
opportunities a drive presents; the ratings own whether this driver takes
them, and the dead-air floor is backstopped by other road users through
`mustFault`. A player reads WHICH axis fails and how bad each instance is,
never how often.

### Encroachment is measured in seconds, and the bands are derived

**The standard is intrusion on entitled space, NOT forced evasive action.**
The maintainer's ruling, and stricter than collision avoidance on purpose:
turning within a fraction of a second in front of somebody is a failure to
yield whether or not they had to brake. So **a fault exists independently
of any reaction**, and `clearance.js` imports nothing that could react —
checked at source level, because defining the fault in terms of a response
would mean a scene where nobody happened to react silently contained no
fault.

**Time, not distance** — a gap in metres means nothing without closing
speed. The quantity is post-encroachment time: how much time separates the
candidate's occupancy of a piece of road from the entitled driver's. It is
what "turning within .3 seconds in front of someone" measures, and it
degenerates to ordinary following headway when the candidate turns INTO a
lane rather than across it, so one measure covers both.

**The worst of it over the manoeuvre, never the value at one instant.**
The candidate accelerates away and the gap recovers — measured, in 18 of
18 conflicts — so a single reading understates the fault by exactly that
recovery.

**The bands are NOT invented and NOT a real-world number transplanted.** A
driver is taught 2-3 seconds and this game's pace does not allow it. But
`forwardClaim` has granted every moving vehicle `LOOKAHEAD` seconds of
road ahead since it was written, and `legalAt` refuses to let anybody into
that space — so the entitled gap was already stated, already in seconds,
already shipped. `ENTITLED === LOOKAHEAD` is asserted, so changing
`LOOKAHEAD` moves the bands with it rather than leaving a second opinion
behind. Real driving's 2:1 split (encroached below 2.0s, inside the other
driver's reaction envelope below 1.0s) is preserved at 0.9 : 0.45.
Cross-checked against the game's own behaviour: 95% of legal departures
measure comfortable, and the one situation authored to be tight — `gap` —
measures tight at 0.70s.

**Contact stays the engine's own collision predicate**, not a PET that
rounded to zero, so the terminal outcome is exactly where it always was.

**An encroachment is a fault in `faultsIn`, and it has NO TRAIT.** It is
not a habit — it is what the candidate did with the gap — so it carries
`trait: null` and a `band`, and anything reasoning by removing a cause has
to skip it (`isTraitFault`). Folding it in cost pacing nothing: dead air,
events per drive and the count over the ceiling are all unmoved, and it
adds 0.17 encroachments per drive. That is thin, and it is the same
thinness measured everywhere else — a generated junction is open, and
`windowIsSafe` rejects draws whose window lands on somebody, so the
supply is rare by construction. On hand-authored situations it fires
reliably: `gap` carries one at 0.70s driven exactly as written.

**A clean candidate can still be marked, and that is correct.** Folding
encroachment in broke "a clean driver commits nothing" in 3 of 59 scenes,
and the failure was worth having: a situation authored to be tight hands
an encroachment to whoever drives it. The property is now what it was
always about — a clean candidate contributes no habit OF THEIR OWN — and
the situational residual is reported rather than swallowed.

**The mild band's observable is the gap itself**, because there is no
reaction to notice — which makes the hardest faults to spot the least
severe ones, correctly. Measured legible: the bands are 22 px apart at the
10s look-ahead and 56 px at 4s, which is about one car length either way.
That is how a driver judges it anyway, and it is a second independent
argument for the shorter look-ahead.

### The fault vocabulary is written against measured gaps

**R2.5 added `rollingStop`, `noSignal` and `stopsShort`, and each answers a
measurement rather than being a plausible driving error somebody thought
of.** Knowledge dominated one fault and braking one, so neither axis could
be isolated by a player; and the rolling stop owned 100% of the residual
collisions the reaction layer could not prevent, which is why caution was
deliberately left untuned rather than dialled up to absorb a fault
belonging elsewhere. The floor is now met: steering 3, knowledge 3,
braking 2, confidence 2.

**LATE AND MISPLACED STOPS ARE TWO DIFFERENT FAULTS, and the
discriminator is the MANNER of the stop rather than its position.**
Maintainer's ruling. A CONTROLLED stop in the wrong place is a KNOWLEDGE
gap — not knowing where to stop, or why the stopping point matters. An
ABRUPT or uncontrolled stop, before or after the line, is BRAKING
control, or an OBSERVATION failure if the driver did not register the
controls in time. Same observable position, three causes, and the
discriminator is a physical quantity rather than a label.

**And a rolling stop is a knowledge fault essentially always**: "a
particularly poorly skilled driver would have to be completely unable to
make their stop due to lack of control to make this anything other than a
failure to obey traffic law." Weighted 0.9 knowledge, 0.1 control.

**Applying that ruling took BRAKING from 2 dominant kinds to 0, and the
regression is reported rather than argued away.** `overshoot` and
`stopsShort` move the resting point and leave the manner alone, so both
are the controlled case and both are knowledge now. Attribution got more
accurate and an axis lost its content; the content comes back when the
two prerequisites below land.

**OBSERVATION is exempt from the trait floor, and that is the point.** It
does not express through a trait at all — it degrades what the candidate
registers, and its faults surface as an ENCROACHMENT that `causeOf`
attributes to it. Counting trait kinds is the wrong instrument for that
axis. Measured: every encroachment on a generated drive attributes to
observation.

**A rolling stop is modelled as a car that never comes to rest**, not as
one that leaves early. It holds its crawl through the approach where a
clean twin decelerates, and carries speed through the line — so the tell
is an ABSENCE (no deceleration) and it is visible both before the line and
after it. It only shows where the candidate did not have to wait anyway:
held by traffic, they stop like everybody else, which is correct.

**The incompatibilities came out derived on first contact**:
`overshoot+stopsShort`, `cutsCorner+wideTurn`, and — nobody wrote this one
down — `lateSignal+noSignal`. You cannot signal late if you never
signalled.

**Growing the vocabulary grows the supply, and section length follows.**
Faults per junction went 1.11 to 1.57, so the section implied by a 3-4
recall band tightened from 2.7-3.6 junctions to 1.9-2.5. Axes per drive
rose 2.38 to 2.90. If the density is wanted lower, `ERROR_SCALE` is the
dial and the candidate distribution is not — the drivers did not get
worse, the vocabulary got wider.

### Three layers, and OBSERVATION as the fifth axis — built

**What happened is layer 1. What the CANDIDATE perceived is layer 2. What
the PLAYER noticed is layer 3.** The FAULT lives in the gap between 1 and
2; the SCORE lives in the gap between 1 and 3. `awareness.js` is layer 2.

The original view cone was the right idea attached to the wrong party. A
poor driver's defining characteristic is not perceiving the traffic around
them, so putting the cone on the player asked the PLAYER to be the bad
driver.

**OBSERVATION is not a peer of the other four axes.** They govern what the
candidate DOES with what they perceived; it governs what they perceived at
all — concretely, it is the parameter that degrades `whatEgoSees` down to
what this driver registered. Different layer, so it does not compete to
explain the same fault.

**Observation is whether they GATHERED the information; confidence is what
they did with it, or without it.** With layer 2 modelled this stops being
an attribution weight and becomes a fact the model holds: a tight gap
taken having registered the vehicle is confidence, the same gap taken
without registering it is observation. Measured on identical encroachments
— same scene, same departure, same band — so only the cause differs.

**NEVER score observation by outcome.** The moment "didn't see the van" is
graded by whether contact occurred it collapses back into confidence.
Enforced structurally: `awareness.js` does not import `clearance.js`, and
`causeOf` is checked at source level for any reference to contact or band.
The registration span was calibrated on the MISS RATE and deliberately not
on the contact rate, for the same reason.

**One registration delay per road user, resolved at composition time from
the seed** — the same rule fault occurrence lives under. A per-frame roll
would resolve at simulation time and ground truth would move between runs.
The floor is `REACTION_FLOOR`: nobody registers faster than they can
react, and a perfect observer takes exactly that with no jitter, because
consistency is what being good at this means.

**`REGISTER_SPAN` is derived twice over.** It is the p25 of the measured
lead time from a road user becoming clear to the decision (0.50s min,
1.60s p25, 3.75s median across 93 road users), and independently it is
where drawn drivers miss a mean of 5% of visible traffic and the worst
miss 16% — enough to be a habit, not enough to be a hazard.

**`pose.hidden` conflates occluded with not-yet-on-stage, and they are
different facts.** Only the first is perceptual; the second is the board
being finite. Conflating them made a candidate rated 1.0 on observation
blind to traffic nobody could miss. Measured afterwards: the distinction
fires only for PEDESTRIANS, because a vehicle is already approaching from
t=0 — but for them it is real, and before it a candidate simply ignored a
pedestrian who had not yet stepped off the kerb.

### The margin you leave for what you cannot see IS confidence

**Departing the instant your KNOWN set is clear is not neutral behaviour.**
It is a driver with no humility about their own perception — so the margin
a driver leaves for traffic they have not accounted for is overconfidence,
expressed as a standing disposition rather than a dice roll. That gives
the risky tail its markable, non-terminal expression: an overconfident
driver takes gaps sized only to what they registered, so they are
routinely tight and occasionally unlucky rather than simply crashing.
`cautionOf` is the whole of confidence in one number — 1 at the optimum,
0 maximally bold, 2 maximally timid.

**THE ASYMMETRY THAT JUSTIFIES THE WHOLE AXIS STRUCTURE.** Occlusion is
PERCEPTIBLE, so caution can compensate for it: you can see that you cannot
see past the van, and wait. Inattention is INVISIBLE FROM THE INSIDE, so
nothing can compensate for it: you do not know you failed to look, and no
amount of care will make you account for a car you never registered.

That is why observation and confidence are two axes rather than two names
for one thing, and it generalises — an axis earns its place when it fails
in a way the others cannot reach. It was not designed in. It arrived as a
FAILED derivation: an attempt to set the caution allowance from the gap
between what a driver knew to be clear and what actually was gave a spread
of 2.8s to 40.2s, because where little is hidden the shortfall is
inattention and the ratio explodes. Forcing a constant out of that would
have buried the finding. Checked directly: with nothing hidden the margin
is zero whatever the confidence.

**The allowance is the candidate's own crossing time, derived per
scenario.** The way to be sure an unseen stretch is empty is to watch it
for as long as anything hiding there would take to reach you — the same
duration you need to be clear of the box before it arrives. One quantity
doing both jobs. 5.05s straight, 5.90s left, 7.65s roundabout, nothing
typed in.

**Three recognisably different drivers from two axes**, measured: a poor
observer who is careful is hesitant but safer, a good observer who is bold
is fast and mostly fine, and the dangerous candidate is both blind and
bold. And the timid tail shares the mechanism rather than having one
bolted on — `slowStart` and `creep` were already registered as
confidence's timid side, so the axis is two-tailed in both of its
expressions.

**A residual belongs to whichever axis actually caused it.** The contacts
caution could not remove turned out to be 100% zero-dwell departures for
the bold-and-blind extreme — the candidate reaching the line and leaving
in the same instant. That is a ROLLING STOP, a knowledge fault, and R2.5's
business. Caution cannot fix it and must not be tuned until it appears to.

### The world gives way, and that is the observable rather than the fault

**A road user with priority brakes for a candidate who took their space,
and THAT is what the player is looking for.** Harder to spot than a
collision, which is correct, and it rewards watching the whole scene.

**The reaction never decides whether a fault happened.** Encroachment is
marked on what the candidate did, against road users holding the line they
planned; `clearance.js` imports nothing from `reaction.js` and never will,
checked at source. The reason is measured rather than asserted: marking on
the REACTED world would soften 63% of faults, so a driver who forces
somebody to stand on the brakes would score BETTER for it. Two derived
worlds — what the candidate did, which is marked, and what then happened,
which is drawn and decides whether anybody was hit.

**Derived, not scripted: the least giving way that avoids the collision**,
found by search, so how hard somebody braked measures how bad the
intrusion was. The parameter is HOW HARD THEY BRAKE over a fixed ramp, not
how much time they give up — the first version stretched the ramp to fit
the time and was therefore NON-MONOTONE in its own parameter, so a bigger
sacrifice braked more gently and lagged less exactly when it mattered.
A search cannot bisect that. Giving way also has to include STOPPING:
slowing alone buys about three seconds, and 30 of 33 residual collisions
could not be avoided by any amount of it.

**Round a bisection away from the thing it is avoiding.** Rounding to
three places moved the answer ten times further than the search's own
precision and put it back on the colliding side — the search said
"avoided" and the world hit anyway in 13% of scenes.

**`departOverride` in `schedule()` is how a driver acts on their own
decision.** A replacement rather than a floor, because the point is that a
driver who has not registered the traffic goes EARLY. Wiring it changed
pacing and supply by nothing at all — a drawn candidate observes well
enough that their decision coincides with the engine's — which makes the
wiring safe and the content thin: 2 encroachments in 112 junctions.

**Pedestrians give way by hesitating**, which the same yielding profile
expresses: they hold at the kerb or stop where they are. That earns
pedestrian conflicts the graduated near-miss band vehicles have, instead
of being all-or-nothing terminal — before it, every contact on a generated
drive was with a pedestrian and every one ended the drive.

**`heedless` keeps the hazard authorable.** A child after a ball, somebody
on a phone. Reacting is the default because most people do, but a
pedestrian who does not look is exactly the hazard the game wants and it
stays a content decision rather than the engine deciding for everybody.
Measured: the same departure is a near miss against an attentive
pedestrian and a collision against a heedless one.

### A candidate has a CHARACTER, and the target is the player's experience

**There is an optimum number of faults, not a direction.** Too few and
there is nothing to find; too many and ticking everything becomes
rational, which destroys the false-positive penalty that makes the sheet
mean anything. And because marking is DEFERRED, a section with fifteen
faults is not harder in an interesting way, it is a memory test.

So the quantity is **faults per section a competent player could catch and
recall** — free recall runs out at about four items, so the band is 3-4 —
and SECTION LENGTH IS DERIVED FROM IT rather than chosen. At the measured
1.11 candidate faults per junction that puts a section at **2.7-3.6
junctions**. Cross-checked against `SHOWINGS_FOR_A_HABIT` = 3, derived
independently: a section inside recall, several per drive, lets a habit
accumulate its evidence without any one section overflowing.

**Variety over volume.** Three faults across three axes beat six from one,
because the player is assembling a picture of a person rather than
counting incidents. So the distribution draws a PROFILE — weak on one or
two axes, sound on the rest — instead of sampling each axis
independently, which produced drivers slightly bad at everything and
identifiable as nothing. Measured: 2.38 distinct axes show per drive, and
100% of a candidate's non-weak axes carry little deficit.

**The cost of characters is quieter worst cases, and it is not absorbed.**
Same seeds, only the distribution changed: median dead air 22.3s -> 20.9s
and drives over the ceiling 9/24 -> 6/24, but the WORST drive went 35.7s
-> 39.7s. A candidate weak only on knowledge, on a route that does not
test it, gives you less than a driver who was mildly poor at everything —
which is the flatter floor the old distribution bought and the ruling
asked to stop buying.

**Creep is the CANDIDATE's, not the player's.** It was a player input in
the driver game — edge forward to see past the van — and feeding a player
input into the candidate's awareness would be exactly the contamination
the three-layer split exists to prevent.

Design, findings and the debrief roadmap: `DRIVER-IDENTITY.md`. The
three-layer reframing, the five axes and R2's build order:
`R2-DESIGN.md`.

### Still open — and three of these are the maintainer's

- **Does going off course end the drive, or do you re-route?** Real tests
  re-route. Re-routing needs `planRoute` to replan from the actual exit
  heading rather than plan the whole course up front.
- **What is an intervention, in law and on the sheet?** An examiner taking
  control is itself a recorded outcome. Automatic fail for the candidate? Is
  failing to intervene a fail for the player?
- **The candidate's observations are not modelled at all.** No head, no
  mirrors, no eyes for anyone — the engine knows where cars are, not where
  drivers are looking. A large share of what a real examiner marks is whether
  the candidate *looked*. This is the biggest gap in the whole design and it
  is new modelling, not reuse.
- **Intervention cannot be triggered by the conflict.** Measured across ten
  situations, warning time from first conflict to contact is min 0.45s, median
  1.10s, max 2.30s — against a 0.35s floor for noticing anything at all. That
  is a reflex test. The cue has to be the candidate's behaviour beforehand,
  which is the same bar every other tell in this file has to clear.
- **Content.** 4 of 18 situations carry any driver trait; 6 instances in the
  whole set. `generate.js` attaches one to 45% of actors from a deliberately
  narrower five-trait pool (it predates `wideTurn` and `cutsCorner`);
  `compose.js` attaches from all seven, and the CANDIDATE now carries the
  drive's own persisting traits rather than none at all.
- **A tile's declared road and the composed junction's road disagree.**
  `world.js` lays out spacing, runway, links and roadside content from
  `specFor(tile.character)`, and `compose`'s `roadFor` then draws its own
  junction kind and ignores it — measured, 15 of 56 match, and 0 of 13 for
  arterial tiles. Latent rather than live, since no renderer consumes the
  world yet, but real the moment one draws a drive. Fixing it means first
  deciding whether a three-lane arterial junction is uncontrolled (as
  `CHARACTER.arterial.control` says today, which would leave the candidate
  stopping at nothing) or signalised — a road-design call, not a mechanical
  one. See `DRIVER-IDENTITY.md` §6.
- ~~**An APPROACH has no braking physics.**~~ **FIXED.** See "An approach
  is deceleration" in the Architecture section. Peak braking across the
  shipped set went from 18.1 m/s^2 (1.84g) to 3.70 (0.38g), and not one
  window moved. The old entry read:

  **Every car in the game stops at 1.84g.** Measured across the set: peak deceleration 18.1 m/s^2 on every
  approach, at every road speed, on every road. Comfortable braking is
  2-3, firm is 5, an emergency stop is about 8. `approachPose` is still a
  smoothstep lerp from a fixed 24.5 m run over a fixed 2.8 s, so approach
  speed does not follow the road either — cars arrive at a residential
  junction at 47 km/h.

  **This is the same bug the departure side already fixed, on the other
  half of the manoeuvre.** CLAUDE.md's own history records replacing a
  fixed traversal duration with real acceleration; the approach was never
  given the same treatment.

  It blocks the maintainer's manner-based attribution outright: abrupt
  versus controlled is a deceleration comparison, and there is currently
  no controlled stop to compare against. It is also why BRAKING dominates
  no fault kind.

  Encouragingly the geometry is already about right — a comfortable stop
  from 11.5 m/s at 2.5 m/s^2 needs 26.5 m, against `APPROACH_RUN`'s
  24.5 m — so the fix is a real profile rather than new distances. It will
  move the golden for every scenario, exactly as the turn-geometry fix
  did, and it changes when a car is visible and where it is before
  `arriveAt`, so `sightingsIn`, belief and the camera all move with it. Its
  own increment, announced.

- **Intersection controls are not perceivable objects.** Awareness tracks
  ROAD USERS: `sightingsIn` iterates `sim.actors` and nothing else. A
  control is a string on a leg (`spec.legs[side].control`) with no
  position; the only spatial fact the engine has about one is the stop
  line. The RENDERER places signs from its own hardcoded four-entry table,
  board-relative and pinned to `CX`/`CY` — so it does not follow a
  junction placed elsewhere in the world, which is the same class of bug
  `exitPoint` had. The signal is worse: one head drawn at one corner
  regardless of which leg it governs.

  This blocks the OBSERVATION branch of the stop-fault split — "did not
  register the control in time". What it takes:

  1. `controlsOf(spec, at)` in `road.js`, returning a positioned control
     per controlled leg, derived the way `stopPoint` already is. The
     renderer then draws from it instead of its own table, which removes
     the duplicate rather than adding a second one.
  2. An extent for a sign, and this needs a ruling: the map symbol is a
     deliberate exaggeration (~1.4 m drawn for a 0.75 m face), and
     occlusion against the drawn size would make signs far too easy to see.
  3. **A rule for elevated objects in a 2D occlusion model.** A sign on a
     post at 2 m is visible OVER a car; the engine's occlusion is flat, so
     a van would hide a stop sign you would really see straight over.
     Probably "signs are occluded by walls, hedges and buildings but not
     by vehicles" — cheap, and physically right. A domain call.

- **The two games want OPPOSITE things from the same generator, and until
  that is settled examiner content will stay thin.** `windowIsSafe`
  discards any draw whose window lands on somebody. That is exactly right
  for the driver game, where the player needs a gap they can actually
  take, and it was one of the most valuable checks ever added — it caught
  1142 unsafe drafts in 4000. But the examiner game wants the opposite: a
  marginal gap is the whole point, because the candidate's judgment is
  what is being assessed. So the generator was built to prevent precisely
  the situation the encroachment fault exists to describe, and
  encroachments come out at 0.17 per drive rather than being rare by
  chance. Three separate measurements point here. Options, none chosen —
  this is the maintainer's:

  1. **A brief flag that permits a marginal window.** Smallest change:
     `windowIsSafe` stays the default and an examiner brief may ask for a
     draw whose window is tight rather than safe. Driver-game callers
     never set it, so nothing there moves. Risk: one predicate now means
     two things depending on a flag, which is the shape of most of the
     bugs in this file.
  2. **A separate acceptance path for examiner content.** `composeScenario`
     grows a sibling that audits for "markable" rather than "safe" — the
     same search loop, a different accept test. Keeps the two games'
     requirements visibly separate. Costs a second path to keep correct.
  3. **Authored situations carry the load.** The generator stays as it is
     and tight situations are written by hand, as `gap` already is —
     measured, it is the only shipped situation carrying an encroachment.
     Cheapest and safest; caps examiner content at what somebody writes.

  Whichever is chosen, the driver game must keep working: `windowIsSafe`
  is what makes Endless, Daily and the roguelike safe to play.

- **The post-test debrief is agreed in direction, not built.** The
  candidate's habits are named and fed back, as the transition out of a test
  into the next task rather than a score screen. The pieces exist: the
  marking sheet is what the player recorded, `habitReport` is what was
  actually true, and the gap between them is what `scoreDetection` already
  computes. Naming the habits is also what teaches the player what to watch
  for next time. See `DRIVER-IDENTITY.md` §7.

  **Some of the prose already exists, and it has a second home.** The
  deleted `Order` mode carried eight hand-authored right-of-way puzzles,
  each with a `rule` and a `why` written by the maintainer — explanations
  of exactly the kind a debrief needs, since a debrief has to say why
  something was a fault. At commit `63a9c68`, in a static
  positions-and-answer format the engine cannot simulate, so it is prose
  to reuse rather than scenarios to restore.

- **A TUTORIAL, framed as job training for a new hire.** Agreed direction,
  not built. The eight rescued puzzles become an introduction to the core
  concepts, and the fiction does real work: the player is being trained to
  examine, which is exactly what the tutorial is for, and it gives the
  game the onboarding path it currently has none of. The same `rule` and
  `why` prose serves both this and the debrief — one body of writing, two
  places it is needed, which is why it was worth rescuing.

### Humour is allowed. The traffic law is not

The candidates are sinful drivers in purgatory and they can be as ridiculous
as they like. **The driving standards they are measured against cannot be.**
A parody driver may do something absurd; what makes it a fault, and how bad a
fault it is, still has to be true. This is the same rule the fiction already
lived under and it does not soften because the tone did.

The reference doc, kept current alongside this file:
https://claude.ai/code/artifact/2c436e9e-ddc3-4f18-a192-d42734d9127b

## Architecture

**The engine is pure and the renderer is disposable.** `src/engine/` has no
React, no SVG, no DOM and no colours in it. A renderer needs two calls:
`simulate(scenario) -> { ego, actors, legalAt, priors }`, then
`safeAtFor(sim) -> number` for the window to actually grade against. Kept
separate on purpose — folding the second into the first made Endless
generation roughly 13x slower, because composition calls `simulate()` deep
inside its own search loop, where only `legalAt` is ever needed. This is what
makes a 3D view a second renderer rather than a rewrite — that is the agreed
direction, 2D now, 3D later, so do not put anything visual into the engine.

```
src/engine/index.js      the conflict rules, driver traits, and what is where at time t
src/engine/road.js       a junction described: legs, lanes, control per leg
src/engine/paths.js      path shapes — line, curve, polyline — and no road at all
src/engine/sight.js      what the driver can see, the examiner's cone, and what creeping costs
src/engine/faults.js     what the candidate did wrong, derived by controlled comparison
src/engine/candidate.js  one driver across a whole drive, and where each habit can show
src/engine/ratings.js    a driver as four axes, and the errors that follow from them
src/engine/clearance.js  how much of somebody else's space the candidate took, in seconds
src/engine/awareness.js  what the candidate registered, and whether they gathered it at all
src/engine/reaction.js   the traffic giving way to a driver who took its space
src/engine/directions.js the instruction you give, and what stacking them costs
src/engine/belief.js     where you think the traffic is once you stop looking
src/engine/detect.js     grading the examiner on what they caught and invented
src/engine/actions.js    manoeuvres: ordered actions, fault tiers, the mark sheet
src/engine/score.js      grading a press against a derived window
src/engine/route.js      several intersections in one drive, and continuity
src/engine/world.js      junctions placed in one coordinate space, and the roads between
src/engine/tiles.js      road character, the tile library, route planning and pacing
src/engine/generate.js   seeded scenario generation
src/engine/compose.js    a brief in, a scene that measurably matches it out
src/engine/scenarios.js  the set situations, as data
src/engine/routes.js     drives, as data
src/engine/traits.js     PLAYER car upgrades and consumables — not the driver traits above
src/engine/roguelike.js  a run: stages, bosses, the branch, the Checkride, Insight
src/engine/stages.js     the roguelike's stages and its roundabout graph, as data
src/engine/bosses.js     hand-authored boss situations, as data
src/theme.js             palette and type — the engine must never import this
src/environments.js      city, suburban, rural scenery — renderer side only
src/frame.js             the camera: frameFor and cameraFor — no React
src/storage.js           adapter chain: artifact host, localStorage, memory
src/progress.js          what the player has cleared, and the daily record
src/apps/RightOfWayTiming.jsx  the renderer — every mode is this one component
src/apps/RoguelikeScreens.jsx  the run's own four screens: branch, draft, both endings
src/apps/roadArt.jsx     SVG shared by the renderer and those screens
src/apps/timingStyles.js the style objects both of the above use
src/apps/MergeRush.jsx   a minigame prototype, deliberately not wired in
```

**The renderer is one component, and it is the thing that grows.** Every
mode — set, daily, endless, roguelike, routes — is a branch inside
`RightOfWayTiming.jsx`, so a new mode means reading it first. When a
screen has no business with the timing loop, the press or the grade, it
belongs beside `RoguelikeScreens.jsx` instead: take a run and a callback,
render, and let `roguelike.js` decide what the callback actually does.

**The scenario draw must stay pure.** `drawn` is a `useMemo` over
`(source, drawSeed)` and nothing else. Do not seed it from `Date.now()`
and do not write to `seenShapes` inside it. `useMemo` is a performance
hint React may discard and recompute whenever it likes: a clock-seeded
draw silently swaps the intersection mid-play, taking `sim`, `safeAt` and
the graded window with it. Advance `drawSeed` deliberately (`nextDraw()`)
when a new situation is actually wanted, and record what was drawn in an
effect after commit.

**Whatever the camera can reveal has to be drawn.** Ground, scenery and
the road legs were all laid out to a fixed 720x720 board, which was
invisible until `cameraFor` started widening past it — then the extra
space was bare and the legs stopped in mid-air, with the tracked actor
driving in across nothing, since the camera had widened precisely to
cover that actor's approach. `worldHalfFor` in `frame.js` is the extent
all three now size to: the camera's MAXIMUM, deliberately not the live
easing value, because scenery is scattered once per scenario and would
visibly grow outward mid-reveal otherwise. Scenery density scales with
the area so a wider world is filled rather than thinned. `Road` and
`Roundabout` take `reach`, `Environment` takes `worldHalf`, and all
three default to the board — so a scenario with no camera draws exactly
as it always has. Checked in `verify-camera.mjs`: the world covers the
widest frame, the extent does not move with the clock, and anything
visible has ground under it.

**Never author the answer.** The safe window is computed by simulating
footprints through the intersection. Do not hardcode "window opens at 3.2s". If
a scenario needs a specific window, change the arrival times until the engine
produces it. The generator obeys the same rule: it declares arrivals and intents
and then asks the engine what they mean.

**Data over code.** Scenarios, routes and traits are plain declarations. Adding
a situation, a drive, or a trait must be a data entry, not a new component.

**There are two unrelated things called "traits". Know which one you are in.**
(And a third relationship: a DRIVER trait is now mostly the compiled output
of `ratings.js`, not something hand-assigned. Hand-assigned driver traits
survive in `scenarios.js` and `bosses.js` and are not going anywhere until
every axis can manifest.)

- **Driver traits** — `TRAITS` in `src/engine/index.js`. How an NPC actually
  drives. They belong to a car in a scenario.
- **Player upgrades** — `TRAIT_CATALOG` in `src/engine/traits.js`. Run-scoped
  equipment fitted to the player's car in the roguelike. They belong to a
  run, and they bend nothing about how anyone drives.

They are one word apart and do opposite things: a driver trait is *supposed*
to move a window, and a player upgrade must never be able to.

**The player's side is presented as car equipment, in rarity tiers.** Common
through Legendary, ordered and weighted in `RARITIES`. That is a reskin of
what was already there, not a new power: rarity governs how often a part is
*offered*, never how hard the game is or how the scorer behaves, and there is
no pity timer and no scaling with run depth. A rare part is rare at every
draft.

The fiction is chosen to keep the safety boundary obvious rather than merely
enforced. **Every upgrade is glass, a mirror, a camera, a readout, or a route
choice** — things that change what the driver *knows*. No brakes, no tyres,
no suspension, no engine, and nothing that touches how the player's car moves
through the world. A part that cannot be described without implying the car
handles differently does not belong in that file, because it would be moving
`legalAt` with it.

Two consequences worth keeping. Names must stay literally true, exactly like
a driver trait's tell: `school-zone-routing` is named for the routing it does
and is pointedly *not* called "Pedestrian Detection", because `preferPedestrian`
sends you where the pedestrians are and does nothing to help you see one.
And `RARITIES` carries ids, labels and weights but **no colour** — the palette
lives in `theme.js` and the renderer keys off those ids, same as everywhere
else the engine refuses to know what things look like. Both are checked in
`verify-roguelike.mjs`, along with rarer actually being scarcer.

**Driver behaviour is composable traits.** `wander`, `creep`, `overshoot`,
`slowStart`, `wideTurn`, `cutsCorner`, `lateSignal`, `rollingStop`,
`stopsShort`, `noSignal` — and `TRAIT_KEYS` in
`index.js` is the ONE list of them, because a second copy is how a new trait
gets forgotten by one generator and not the other. A trait bends how the car
actually drives and the conflict engine works out the consequences. Never
script a trait to punish the player directly. Traits divide into two kinds
and only one is expected to move a window:

- **PATH** traits bend where the car goes, so they must change the window.
- **INFO** traits change only what can be read in time. `lateSignal` is the
  whole category. A zero delta there is correct, not a dead trait.

**A trait may only fire where its tell is true.** `cutsCorner` is left-only
because a right has no radius to give away; `overshoot` and `slowStart` are
guarded on `p.stops` because a driver who never stopped never stopped past a
line and never had a turn to be slow off. That guard is not cosmetic — before
it, a candidate on a segment produced 3.8s of derivable, markable fault with
a tell that was a lie. A trait whose `setup` writes unconditionally is
claiming a consequence somewhere it does not happen.

**Two traits that write the same field cannot both be fitted.** `wideTurn`
and `cutsCorner` both write `turnBias`, so one silently overwrites the other
and then derives NO fault, because `faultWindow` strips one trait at a time
and stripping the loser changes nothing. `masks(a, b)` in `candidate.js`
derives this by fitting both and asking, so a new trait that writes over an
old one is caught on its first draw rather than shipping as a habit that
never shows.

**Scenario rotation.** A uniform quarter turn preserves both `RIGHT_OF` and
`OPPOSITE`, so a scenario written for a southern approach is reusable from all
four — verified to produce an identical window from every approach. This is how
routes keep continuity without four hand-written copies of each intersection.
Pedestrians rotate with the scene too — `crossingOf` is derived from the
actor's own `from` leg, not pinned to north, so `isRotatable`/`rotateScenario`
in `route.js` carry a pedestrian like any other actor; `walker` rotates
cleanly to all four approaches.

**`sightBlockers` are the one thing that cannot rotate**, and `isRotatable`
refuses them. A blocker is fixed x/y, authored to blind one specific approach
— the van in `unprotected` sits where it hides the S leg. Rotation spins the
road and every actor's `from`, but a static blocker has no `from` to spin, so
a rotated copy leaves it planted in the same screen position while the road
turns around it. `legalAt` never reads `sightBlockers`, so nothing about
safety would notice; the driver would. Two situations trip this today —
`unprotected` and `boss-blind-rush` — which is why the Checkride's leg order
leads with `unprotected`: it is the one leg that can never be aligned to
whatever the previous leg leaves you facing.

**Scoring rewards reading, not luck.** Full marks anywhere inside 0.35s of the
window opening, because nobody reacts to a visual cue faster than that, decaying
to zero at 2.6s — exactly where undue delay begins, so there is no cliff at the
verdict boundary. A press more than 0.25s early is a failure to yield and scores
nothing on any curve.

`REACTION_FLOOR` and `GRACE` are now *defaults*, not constants: `grade()` takes
both as optional parameters so a fitted player upgrade can widen the curve for
one run. Widen only — nothing may narrow them, and every existing call site
that passes neither behaves exactly as it always did. **`EARLY_TOLERANCE` is
deliberately not a parameter.** It is the boundary of a failure to yield, not a
matter of taste; loosening it would reward going before the road was yours,
which is the one thing no perk is allowed to buy.

**True-to-life scale.** The game is 20 px per metre. Lane 3.6 m, car 4.5 x 1.8 m,
truck 9 x 2.55 m, painted lines 0.15 m. Signs are the one deliberate
exaggeration, drawn as map symbols because a real 0.75 m sign face would be
unreadable.

**True-to-life motion, too — speed is stated and time is derived.** A path
knows its own length; how long it takes comes from a motion profile in
`paths.js`. A vehicle that stopped accelerates away at ~2.4 m/s² and levels
off (41 km/h straight, 26 through a left, 22 through a right); one that
never stopped cruises at the speed it carries through (45 km/h); a
pedestrian walks at 1.35 m/s. Crossing a stop-controlled junction therefore
takes about five seconds, not one and a half.

The version this replaced set a fixed duration per manoeuvre, and it was
wrong in two ways that were measured rather than suspected. Cars left the
line at a constant 72 km/h having accelerated from rest in no time at all.
And because the time was fixed rather than derived, a wider road made
traffic move FASTER — the six-lane `arterial` was crossed at 89 km/h in the
same 1.5s as a two-lane street, while that scenario's own lesson says
"crossing takes longer here than it feels like it should". A player
learning gap judgment from that was learning something false, which is the
one outcome this file cares about most.

It also quietly disabled a rule: "a moving vehicle claims road proportional
to speed" was pegged at the `MAX_CLAIM` ceiling for 18 of 21 road users,
because everything moved fast enough to saturate it. Real speeds
un-saturate it — 0 of 21 now — so the claim discriminates again.

Do not reintroduce a fixed traversal time. If a scenario needs a different
window, move the arrival times, exactly as with everything else here.

**An approach is DECELERATION, not an interpolation.** It used to be a
smoothstep lerp from a spawn point to the line over a fixed 2.8s, in which
nothing was a physical quantity — so nobody could notice that every car in
the game braked at 18.1 m/s^2, which is 1.84g, more than twice an
emergency stop. Approach speed did not follow the road either: a car
arrived at a residential junction at 47 km/h. Exactly the bug the
departure side had already fixed, on the other half of the manoeuvre.

**The model is a, then v, then x.** `approachDecel` is the input, speed is
its integral, position is speed's. You cannot write 1.84g by accident
because you do not write the trajectory at all — and the MANNER of a stop,
which is the maintainer's discriminator between a braking fault and a
knowledge one, is now a quantity that exists (`approachSpeedOf`) rather
than something to be inferred from a curve. Closed form rather than
stepped state, deliberately: `poseAt` is pure and O(1) and `earliestClear`
samples it thousands of times per window, so stepping would be a rewrite
of the engine's shape rather than a refinement of its physics. What makes
it refinable is that a, v and x are named quantities related by
integration.

**The deceleration is derived, not chosen**: the rate that brings a car
from the engine's own straight cruise to rest in exactly the approach run
the game already used — 2.70 m/s^2, squarely in the comfortable band. The
distance was always right; only the profile was wrong.

**ONE MODEL FOR EVERY APPROACH: come in at the road's speed and shed only
what you do not need.** A car that stops sheds all of it, one with
priority sheds the difference between the road and the corner it is about
to take, and a straight-through car sheds nothing — you slow for the
corner, not for nothing, which is what keeps an emergency vehicle from
braking to a speed it was never going to lose.

A rolling car used to run its WHOLE approach at the speed it would take
the junction at, and that inverted `wontstop`'s tell: a left-turner
cruising in at 7.2 m/s was slower than a car braking from road speed for
the first second and a half, so "that one is not slowing" read backwards
exactly when it mattered. The old check passed only because the old lerp
parked braking cars at their spawn point until 2.8s before arrival — the
tell was reading an artifact, not a behaviour.

**Rebaked deliberately, and the partition is the evidence.** The only
thing that moved in the golden was ego position during the approach, in
all 18 situations, 0 degrees of rotation, and all four routes byte
identical. NOT ONE WINDOW MOVED: the conflict engine only looks from
`arriveAt` onward.

**A car steers through a turn; it does not cut the corner.** A turn is a
circular arc that starts at the car and is tangent to the lane it is
leaving, so the bending happens at the corner where a driver actually turns
the wheel. `turnPoints` in `paths.js` builds it, and the radius is derived
rather than chosen: it is the distance from the car to where the two
centrelines cross, floored at `TURN_R_MIN` (5.5 m, a passenger car at full
lock). A wider road, whose stop line sits further back, therefore turns
wider on its own, and a left — whose corner is across the junction — comes
out wider than a right. Nothing about the shape is authored.

The version this replaced was one quadratic Bezier from the stop line to an
off-board exit with its control point at the corner: legs of 2.7 m against
20 m, so all the bending happened at the stop line and none at the corner.
Measured, every turn in the game was committing two real faults. A left
crossed onto the oncoming side of its own approach while still 3.3 m short
of the junction. A right left the carriageway — 4 m from the centreline
against a 3.6 m road edge — at a 3.4 m radius, tighter than a car can
physically steer. That was reported by eye before it was ever measured,
which is why `verify-turns.mjs` now exists.

Fixing it moved exactly three windows, and only the three with a
left-turning prior: `liar`, `silent` and `lateflag`, all by the same 0.95s
earlier. The old line swung a turning car across the ego's own approach
lane, which is a conflict the law never asked for, so the ego was being
held 0.95s longer than it should have been. Every scenario without a
turning actor is byte-identical, and that partition is the evidence the
change was confined to turn geometry.

**Bad turning is a trait, and its tell has to be true.** `turnBias` is how
badly a driver takes the corner, in metres of finishing error: positive
swings wide, negative cuts inside. `wideTurn` (+4.5 m) finishes in the far
lane of the road it turned into. `cutsCorner` (-2.6 m) is **left only**, and
that is a real rule rather than a shortcut — a left turns around a corner
across the junction, so there is radius to give away, while a right turns
around the near kerb where the clean radius is already close to
`TURN_R_MIN`, so the floor absorbs the bias and the tell would be claiming a
fault nobody could see. `verify-turns.mjs` checks each tell against the path
actually built.

## The roguelike layer

A run is a driving test with stakes: named **stages** (`stages.js`), each
capped by a hand-authored **boss** (`bosses.js`), with a roundabout branch
screen between them for choosing what comes next, building to a four-leg
**Checkride** finale. Clearing the Checkride is the run's one win state
(`outcome: "won"`); any critical fault anywhere ends it (`"ended"`).

**The boundary that makes the whole thing safe.** A player upgrade or a
purchased consumable may change exactly three things: what the player is
shown, how generous the scorer is being *for display this run*, and which
brief the generator is asked for next. It may never touch `legalAt`,
`safeAt`, collision detection, or a pad/claim/resolution constant. A perk
that moved the window would be authoring the answer wearing a costume.

This is enforced structurally, not by good intentions:

- **The dependency runs one way only.** `traits.js` and `roguelike.js` may
  import `compose.js`'s exported vocabulary; `compose.js` and `generate.js`
  never import them. A trait describes an *intent* (`trafficBias: "heavy"`)
  and it is `roguelike.js`'s job to turn that into a draw. Checked by a
  source-level grep in `verify-roguelike.mjs`.
- **Bias picks the brief, never the verdict.** `composeScenario`'s own
  `windowIsSafe` gate runs unconditionally whatever was asked for, so a
  biased draw has passed exactly the audit an unbiased one would.
- **A consumable is shaped like a trait.** Every `CONSUMABLES` entry has the
  same `apply(mods) -> mods` signature as a permanent trait, verified to
  produce the identical key set — so a spend cannot smuggle in a kind of
  effect the trait system's invariants do not already cover. Most are the
  identity function; the *action* lives in `spendConsumable`.

**`isCritical` is broader than `route.js`'s `DEFAULT_END_ON`, on purpose.**
That default only checks `result.verdict === "collision"`. A failure to yield
reports as `"early"`, and encroachment or a blocked box only ever surface
through `gradeTask()`'s sheet, never as a verdict string. Copying the default
uninspected would let a run survive its own worst faults. The Checkride
therefore grades its legs through `isCritical` too, not `recordLeg` — one of
its four legs (`unprotected`) is manoeuvre-graded, exactly the case the
narrower check misses. `planRoute`/`currentLeg` are still reused for what they
are good at: resolving each leg's rotation.

**A hand-authored scenario skips the generator's safety net.** `windowIsSafe`
lives inside `composeScenario`, so it only ever guards generated draws.
Anything written by hand — every boss, every entry in `scenarios.js` — has to
be checked against `safeAtFor` directly instead. `verify-stages.mjs` does this
for the bosses; a new hand-authored situation must not skip it.

## Verification requirement

**Any change to the conflict engine, trait system, scenario timings or the
generator must be re-verified numerically before it is considered done.**

```
node tools/verify-windows.mjs      every window; each trait removed on its own
node tools/verify-route.mjs        rotation, continuity, run mechanics
node tools/verify-generator.mjs    determinism, safety, spread, rejection rate
node tools/verify-roundabout.mjs   direction, geometry, the exit tell
node tools/verify-wontstop.mjs     a driver who fails to yield: tell, safety, the extended window
node tools/verify-playthrough.mjs  every scenario at every press time
node tools/verify-task.mjs         manoeuvres: order, deadlines, fault tiers
node tools/verify-sight.mjs        occlusion, and the creep trade
node tools/verify-compose.mjs      briefs produce scenes that match them
node tools/verify-camera.mjs       the camera opens gradually, never shrinks, keeps a revealed actor in frame
node tools/verify-roguelike.mjs    traits and Insight: the safety wall, the one-way dependency
node tools/verify-stages.mjs       stages, bosses, the branch graph, a full run end to end
node tools/verify-events.mjs       the crossing button and the emergency vehicle: rule, readable, worth reading, generated
node tools/verify-turns.mjs        turns are steered, not cut: radius, lane discipline, and honest fault tells
node tools/verify-faults.mjs       examiner: faults derive from a control, and the cone decides what was markable
node tools/verify-directions.mjs   the instruction window, and what stacking costs the candidate
node tools/verify-belief.mjs       what you still think is true once you look away
node tools/verify-detect.mjs       grading the examiner: caught, missed, invented, and when
node tools/verify-tiles.mjs        a declared runway is a promise, held to measured geometry
node tools/verify-world.mjs        the continuous drive: culling, routes, pacing, segment hazards
node tools/verify-candidate.mjs    one driver across a drive, and habits that repeat enough to be named
node tools/verify-clearance.mjs    encroachment in seconds, and bands derived from the engine's own claim
node tools/verify-awareness.mjs    what the candidate registered, and observation kept off outcome
node tools/verify-reaction.mjs     the world gives way, and never decides whether a fault happened
node tools/verify-screens.mjs      every reachable screen actually mounts and draws
node tools/verify-equivalence.mjs  nothing moved that was not meant to
python tools/verify-scoring.py     re-derives the scoring curve independently
```

All twenty-seven must exit 0. Fourteen things they check are worth understanding:

- **`verify-faults.mjs` guards the examiner game's honesty.** Its central
  check is the one that separates a derived fault from an asserted one: take
  the fault it found, remove the trait that caused it, and the same query must
  come back empty. A fault that survives its own cause being removed was
  never derived from it.


- **`verify-screens.mjs` closes the suite's one blind spot, and it cost
  twenty increments to find.** Every other check is headless, so a React
  mistake was invisible to all of them — and the Examiner screen threw on
  mount from the day it was written while twenty increments were verified
  against it. This bundles each reachable screen with vite's own SSR build
  and renders it with `react-dom/server`: no DOM, no animation frames, no
  timers. It asserts NOTHING about what is drawn and cannot — effects do
  not run under SSR — so a person still has to open the page. It only
  proves the screen mounts, which is the thing nobody was checking.
  Verified against the original bug by putting it back: it fails with
  `watched is not defined`.

- **`verify-candidate.mjs` guards the half of the job that is reading a
  person.** Its properties are the ones any correct implementation would
  have to have: one driver at every junction AND every segment; a habit
  gets enough chances to be told from an incident; its rivals get chances
  they visibly decline, so a hypothesis can be tested rather than only
  formed; a tell is true of the car; and a clean driver stays clean. It
  also measures how far the planner's forecast of what a junction could
  show strays from what the scene actually offered, rather than assuming a
  forecast is free.

- **`verify-clearance.mjs` guards a standard that is stricter than the
  safety engine.** It checks that the bands are still derived from
  `LOOKAHEAD` rather than typed in, that severity never improves as the
  candidate goes earlier, that the gap RECOVERS so a single-instant
  reading would understate the fault, and — the one that keeps the
  mechanic honest — that ordinary legal driving is not marked, at 95%
  comfortable. It also checks the mild band is legible on a phone, because
  that band has no reaction to notice and the gap itself is all the player
  has to go on.

- **`verify-turns.mjs` exists because a fault got past every other check.**
  Turns cut the corner for the entire life of the project, and nothing in
  the suite noticed: every check asked whether the *window* was right, and
  the window was self-consistent with a wrong path. It took someone playing
  it and saying the turns looked wrong. So this one measures the shape of
  the drive rather than its timing — steerable radius, which side of the
  road the car is on, which lane it finishes in — and it is the template for
  any future check of how the world moves rather than when.

- **Equivalence is the one for refactors.** The others check the engine is
  right; that one checks it has not *changed*. It matters because a change to
  geometry moves every window, so the baselines get rebaked — and at that
  moment the regression net stops being able to tell an intended change from a
  mistake. `engine-golden.json` is a committed fingerprint of every window,
  every departure, every pose at 0.05s, and what the driver can see. Rebake it
  with `--write` only when the change is *meant* to move behaviour, and say so
  in the commit. Verified sensitive to a 1 cm shift in where cars rest and to
  a 40 cm shift in the driver's eye position.

- **Creeping has to buy sight AND cost safety.** If it only buys sight it is
  a free action and everyone holds it down; if it only costs, it is a trap.
  `verify-sight.mjs` measures both, and also measures whether there is *room*
  to creep: `PULL_STEP` is sized against the ~2 m between the stop line and
  the junction, because a step that fits into that band only once makes the
  mechanic a switch rather than a judgment.

- **A path trait that moves no window teaches nothing.** Compare a
  trait-carrying vehicle against a well-driven control. Known-inert traits are
  listed with reasons in `verify-windows.mjs` so a *new* dead trait still fails.
- **The generator audits the engine.** Every derived window is replayed to prove
  that departing on it does not collide. This is a harder test of the conflict
  rules than the fixed scenarios can give.
- **A safe window has to stay safe for its whole grace period, not just its
  first instant — and at every depth of creep.** A window can open, close
  again as a second road user arrives, and reopen later; creeping shifts
  where the ego actually departs from, which the encroachment fault cannot
  see because it only ever watches priors — creeping toward traffic that has
  right of way is the foul, not creeping toward traffic that does not.
  Both generators sweep grace and creep before accepting a draw;
  `safeAtFor` in `index.js` does the same for hand-authored scenarios, on
  demand rather than inside `simulate()` itself, because the sweep is too
  expensive to pay on every call a search loop makes.
- **A tell has to be readable and worth reading.** Both are measured, not
  asserted: it must appear before the player has to decide, and a controlled
  comparison — same scenario, same arrival times, one thing changed — has to
  show it is worth real seconds. A tell that fails either is decoration.
- **The run loop is mirrored, because it cannot be driven headlessly.** It is
  `requestAnimationFrame`-driven, so no automated check can exercise the real
  component. `verify-playthrough.mjs` replays the same sequence of engine calls
  across every scenario at every press time — catching runs that never
  terminate, throw, miss a collision, or disagree with the scorer. It cannot
  catch a React mistake, so the component still needs eyes on it.

New engine logic gets an independent re-derivation, not a self-check — that is
why the scoring curve is reimplemented from prose in Python rather than ported
from the JavaScript.

**There is a resolution floor.** `earliestClear` steps in `STEP` = 0.05s, so any
effect smaller than that is invisible to the engine by construction. "The trait
moved the window by 0.00" can mean "does nothing" or "does something too small
to represent" — measure at finer resolution before concluding which.

This requirement has caught real bugs: an approximate box-overlap test that let
collisions through, a left turn that could legally cut in front of oncoming
traffic, two traits that had no effect at all, 31 generated scenarios that
claimed to demand a wait while going immediately still scored full marks, a
scored window that stayed "good" past the instant a non-prior road user's own
schedule assumed the ego was already gone (1142 of 4000 generated drafts
before the fix), and the same failure again through creep specifically —
invisible to the encroachment fault because it only ever watches priors — in
62 of 1500 further drafts, plus two scenarios that had already shipped
(`sleeper`, `creeper`) by exactly one `STEP` each.

## Conventions

- Plain React with hooks. No Redux, no state library.
- Inline style objects and a small `<style>` block. No Tailwind, no CSS files.
- `lucide-react` for icons. Do not add UI or animation libraries without asking.
- Comments explain *why*, not *what*. Only where the reasoning is not obvious.
- Mobile-first: 44 px minimum touch targets, `100dvh`, safe-area insets,
  `touch-action: none` on the canvas, 16 px inputs so iOS does not zoom.

## Known work in progress

- **Leaderboards and Play-style connectivity are the agreed direction — not
  started.** The goal is what a game shipping on Google Play is expected to
  have: a leaderboard, achievements against the situations `progress.js`
  already tracks, cloud save so a cleared record survives a new device, and
  whatever sign-in that requires. This is the one part of the app the offline
  rule was always expected to eventually give way to — see Do not below. It
  has not given way yet: no account, network call, or SDK exists in this
  codebase, and none should be added except deliberately, on request. Agreeing
  to the direction is not the same as authorizing the build.
- **User-created scenarios** are wanted. Scenarios are already plain data, so
  this is an editor plus import/export, and sharing by file or link needs no
  server — a separate thing from the leaderboard/connectivity work above,
  which does need one.
- **The roguelike is built** — stages, bosses, the branch, the Checkride and
  the Insight economy all ship and are verified. See "The roguelike layer"
  above for the boundary rule that keeps it safe. What it does *not* have yet
  is any of the world around it: see the next two entries.
- **Minigames: one prototype, deliberately unwired.** `src/apps/MergeRush.jsx`
  is a convoy-runner in the style of the crowd-battle mobile ads, reskinned to
  this game's world — sign-gantry gates, a merge through rush-hour traffic
  rather than a crash, since this game is about avoiding those. It is
  standalone: no import from `src/engine/`, not on the home screen, not in the
  mode switcher, reachable only at `#/merge-rush`. The intent is
  WarioWare-style minigames between stages, but nothing is hooked up and it
  has not been playtested — see Do not.
- **An overworld and a narrative frame are agreed in direction, not built.**
  The setting is driving purgatory: the player had an incident and is stuck
  retaking the test until they can prove their way out, which is what the run
  loop already does mechanically. Bosses become examiners; deeper stages
  become stranger districts. The overworld is a literal road — cleared stages
  as landmarks behind you, fog ahead, roundabouts as interchanges, minigames
  as rest stops — reusing the road primitives rather than a new map system.
  Ideas, escalation levers and the open questions are collected in the
  "Purgatory Road" artifact rather than here, since they are a brainstorm
  rather than decisions:
  https://claude.ai/code/artifact/01c6d8d4-904b-401e-9f69-a4006be2dd88

  One rule survives the reskin intact: **the fiction can be as strange as it
  likes, the traffic law cannot.** A weirder vehicle, a stranger sign, a
  district where you must read signs by shape because the text is unreadable
  — all fine, and the last one is a real skill. A district with a genuinely
  different right-of-way rule is a domain question, and it is the
  maintainer's, like every other one in this file.
- **Longer waits are answered with something to read, not with shorter
  waits.** Realistic acceleration made every wait about three times what
  it was, and the agreed direction is to fill that time rather than tune
  it away: things that happen DURING the wait and change what the answer
  is. Two are built — the crossing button and the emergency vehicle, both
  in the established rules above — and both had to clear the same bar as
  any other tell: readable before the decision, and worth real seconds in
  a controlled comparison (`verify-events.mjs`).

  Still wanted, not built: a **fender bender** that blocks a lane
  mid-scenario. It is the one of these that changes the road rather than
  the traffic on it — a moving car becomes a static obstruction, sightlines
  close, and other traffic would want to re-route around it. That last part
  is genuine dynamic re-planning, which the engine does not do: everything
  is derived once, up front. Worth being deliberate about, because it is an
  architectural addition rather than a data entry.
- **A window can now CLOSE.** Every scenario used to open one and leave it
  open, so a late press only ever cost marks. `button` is the first where
  the answer expires — the walk phase takes the crossing back. Scenarios
  like that declare `windowCloses: true`, which is what lets
  `verify-playthrough.mjs` keep enforcing "an open window is always safe
  to take" everywhere else while allowing a collision *after* the graded
  stretch here. The graded stretch itself is still guaranteed safe by
  `safeAtFor`; what is permitted is only the region the scorer has already
  called undue delay. Do not set that flag to quiet a failure — a window
  closing anywhere it was not designed to is a real bug.
- **Events in generation: done.** Both generators place a crossing
  button (~11% of composed draws) and, more rarely, an emergency vehicle
  (~3%). Three things are MEASURED per draw rather than assumed, and a
  draw failing any of them is thrown away like one that misses its brief:
  the press lands early enough to be read (`eventsAreReadable`, in
  index.js so both generators share one rule); the emergency vehicle is
  actually in frame before the decision, given the camera the draw
  declares (`framedInTime`); and it actually moves the window
  (`emergencyEarnsItsPlace`, a controlled comparison against the same
  scene with the call switched off — one crossing the far side of a
  junction genuinely costs nothing, which is correct and is exactly why
  it has to be checked).

  Two things worth knowing if these get tuned. The emergency vehicle
  REPLACES a car rather than joining them, and is kept out of `heavy`
  briefs: it pushes the window past itself, so every extra road user
  still arriving after that is another chance for the window to land on
  somebody, which `windowIsSafe` then rejects — adding rather than
  swapping dropped the yield to under 1%. And `framedInTime` is the one
  place composition looks at the 2D frame; it checks a declaration the
  scenario makes, while `eventsAreReadable` states the requirement in
  time alone, so another renderer can satisfy it its own way.
- **Pedestrians in generation: done.** They rotate correctly (`crossingOf`
  is relative to the actor's own leg), and both generators place one now —
  `generate.js` (Daily) on 22% of draws, `compose.js` (Endless, ported from
  it) at a similar rate, on any leg the junction actually has, multi-lane
  included. Cyclists are not agreed — they would need a ruling on how a
  bicycle claims road compared with a car.
- **Composition is a search, not a sampler.** `compose.js` takes a brief —
  how much traffic, how much of it you can see — and builds a scene, then
  asks the engine what it actually turned out to be and throws it away if
  the numbers disagree. Placing a van and calling the result low-visibility
  would be authoring the answer, exactly like hardcoding a window. Blindness
  is measured from the driver's eye across the wait, so an obstruction where
  nothing passes counts for nothing.

  The vocabulary is deliberately small and in a driver's words. Every term
  has to be measurable or it does not belong: traffic is how many road users
  end up with priority, visibility is the share of them that cannot be seen
  clearly. Endless cycles the brief so a run moves through different kinds of
  situation, and keeps the shapes it has handed out so it does not repeat.
- **Roundabouts are in, but only just.** Single lane, two hand-written
  situations, and the generator does not produce them yet — that needs its own
  acceptance rules for exit choice and how many cars are circulating. They also
  have no pedestrian crossings, which on a real roundabout sit set back from the
  entry and are therefore not the crossings already built.

  The `Roundabout` component now has a **second, non-driving use**: it draws
  the roguelike's between-stages branch screen, where the exits are the stages
  on offer rather than roads. Two hand-written situations makes it look
  under-used; it is not.
- **The camera a merge scenario will need already exists, unused.**
  `src/frame.js` has `cameraFor`, which eases the view out to keep a named
  actor in frame before the decision point — verified in `verify-camera.mjs`
  against real scenario data, because no merge scenario exists yet to verify
  it against. What's missing is the merge itself: real conflict geometry for
  two converging lanes, which needs the maintainer's ruling the same as any
  other traffic-law question in this file, not a guess.
- **An international mode is planned.** Flagged by country, where local rule
  differences are the point rather than a trap — the thing traffic enthusiasts
  would come for. Until then the default is North American, and anything
  genuinely local should be written so it can move into that mode later.
- T-junctions, uncontrolled intersections and pedestrian crossovers are all
  wanted, behind the above.
- **`wideTurn` and `cutsCorner` are real now, and still unused.** `wideTurn`
  used to ride along in `lateflag` — bending the path by 1.1 m for a 0.01s
  effect on the window, under the resolution floor, while its tell claimed a
  consequence to the player that was not really there. It was removed from
  that scenario rather than left as a false tell, and this entry used to say
  it was waiting for a scenario where the wide line actually reaches the lane
  the ego uses. Under real turn geometry it does: 4.5 m wide, into the far
  lane of the receiving road. `cutsCorner` is its opposite and is new. Both
  are measured in `verify-turns.mjs` and both are ready to attach; neither is
  attached to a scenario yet, because which situation should teach a wide or
  a cut turn is a domain question, not a mechanical one.
- **`creep` is masked by `overshoot` in `creeper`.** Accepted — creepers are for
  confusing right of way in busier scenarios than that one.
- **The Examiner screen had never rendered.** It was first in the mode
  switcher and threw a `ReferenceError` the instant it mounted: `watched`
  and `beliefs` were used and never declared, and `aim`/`setLooking`/
  `worldRef` were left dangling when the gaze cone was deleted from
  `sight.js`. So every examiner increment from the flip onward was
  verified headlessly and NEVER LOOKED AT. This file already said the
  suite "cannot catch a React mistake, so the component still needs eyes
  on it" — this is what that costs when nobody does. Open the page after
  touching a component: a build passing is not a screen rendering.
- The timing renderer is the only one. 3D is the agreed direction, not started.

## Do not

- Do not add analytics, accounts, or network calls without being asked to. The
  offline-in-a-car rule still holds for everything the game does today.
  Leaderboards and Play-style connectivity are the agreed exception and the
  intended direction — see Known work in progress — but that is a decision to
  build toward, not a standing invitation. Nothing has been wired up; do not
  start on the assumption agreeing to the direction means agreeing to begin.
- Do not use `localStorage` directly. Go through `src/storage.js`, which falls
  back cleanly when storage is refused — a private window will hand you a
  `localStorage` that throws on first write.
- Do not put colour, React, or anything visual into `src/engine/`.
- Do not wire MergeRush — or any other minigame — into the roguelike run until
  it has been playtested and the shape is settled. It is a prototype to react
  to, and it is unwired on purpose, not by omission.
- Do not let a player upgrade or consumable reach `legalAt`, `safeAt`, collision
  detection, or a pad/claim/resolution constant. See "The roguelike layer".
- Do not "simplify" the scenario, route or trait systems back into hardcoded
  cases.
- Do not spoil the set situations in UI that lists them. Half of them turn on
  not knowing what is coming; locked ones are counted, never named.
