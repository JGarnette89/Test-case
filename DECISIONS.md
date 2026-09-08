# Decisions — the constraints, and why they are constraints

**Read this before changing anything in `src/engine/`.**

This file is not a changelog. It is the set of decisions that are load
bearing, each with the reasoning attached, written for someone — or
something — that was not in the room when they were made.

It exists because more than one agent works in this repository now, and a
decision reached by argument and never written down is invisible to every
tool that was not part of that argument. The failure mode is not abstract.
Each of these has a plausible, well-intentioned "fix" that destroys the
thing it is protecting:

| the constraint | what a well-meaning change does to it |
|---|---|
| dead air targets 25s | lowers the constant until the check passes |
| observation is never scored by outcome | calibrates it against the collision rate |
| the reaction is not the fault | marks on the reacted world, softening 63% of faults |
| encroachment is entitled space | redefines it as forced evasive action, and most faults vanish |
| the fault is derived | writes down when the fault happens, and the game becomes a memory test |

Where a check protects one of these, its failure message says so. If you
are reading a failure that explains itself, the explanation is the point:
the check is not asking you to make it pass, it is telling you what would
break.

---

## 0. The one rule everything else descends from

**NEVER AUTHOR THE ANSWER.** The safe window is computed by simulating
footprints through the intersection. Nobody types "the window opens at
3.2s". If a scenario needs a particular window, the arrival times move
until the engine produces it.

**And its successor: NEVER AUTHOR THE FAULT.** The same temptation wears
a new costume in the examiner game — hand-writing "at 3.4s this driver
swings wide, mark it". Do that and the game is a memory test with a
driving skin.

So a fault is DERIVED, by controlled comparison: simulate as written,
simulate again with one trait stripped from one driver, diff the poses.
Where they separate by more than a driver could fail to notice, the fault
is happening. `src/engine/faults.js` does this; `verify-faults.mjs` proves
it by stripping the trait and requiring the fault to disappear.

A fault that survives its own cause being removed was never derived from
it.

---

## 1. What the game is

**Right of Way.** You are the examiner. You sit in the passenger seat
while a candidate drives a set course, and four systems run at once
because they compete for the same attention:

1. **Observe** the candidate's driving.
2. **Assess** observable errors — and marking a fault that did not happen
   has to cost, or the strategy is to mark everything.
3. **Watch for danger and intervene.** (Not built — see §9.)
4. **Give the directions.** The candidate only knows what you told them.

The interesting failures come from the competition between these, not from
any one being hard.

It was a *driver* game until 2 September 2026 — you were one car at an
intersection pressing GO. **That premise is finished.** As of the
maintainer's later ruling the examiner game is the only priority and other
modes need not be accessible at all. The driver-game code is not deleted:
`RightOfWayTiming` holds the only renderer in the project and the examiner
screens import `Road` and `Environment` straight out of it. Not accessible
is not the same as deletable.

---

## 2. Domain authority

**The maintainer is a driving examiner in Ontario, Canada. Their reading
of the rules wins over anything you infer.** If a change depends on a
traffic-law assumption, say so and ask rather than guessing. Getting a rule
wrong does not merely lose a user — it teaches someone something false.

The audience is North American. Where Ontario practice and general North
American practice differ in a small way and the general reading makes for
better gameplay, take the general one. That is a licence to generalise,
not to be vague: a rule that is genuinely different somewhere still has to
be picked deliberately and said out loud.

**Humour is allowed. The traffic law is not.** The candidates are sinful
drivers in purgatory and can be as ridiculous as they like. What makes
something a fault, and how bad a fault it is, still has to be true.

---

## 3. THREE LAYERS. Get these straight before touching anything perceptual.

    layer 1   what actually happened            the world
    layer 2   what the CANDIDATE perceived      awareness.js
    layer 3   what the PLAYER noticed           detect.js

**The FAULT lives in the gap between 1 and 2. The SCORE lives in the gap
between 1 and 3.**

This is the single most confusable thing in the codebase, and getting it
wrong has a specific signature: the view cone was originally attached to
the player, which asked the PLAYER to be the bad driver. A poor driver's
defining characteristic is not perceiving the traffic around them. That
belongs to the candidate.

**Creep is the CANDIDATE's, not the player's.** It was a player input in
the driver game — edge forward to see past the van. Feeding a player input
into the candidate's awareness would be exactly the contamination this
split exists to prevent.

---

## 4. A driver is FIVE ratings, and traits are what they compile to

`src/engine/ratings.js`. **OBSERVATION, CONFIDENCE, STEERING, BRAKING,
KNOWLEDGE.**

A rating is a standing disposition by construction, so identity stops
being bolted onto the scenario model and becomes the model — habits
*emerge* instead of being scripted, because a weak axis produces the same
kind of error again and again across situations that look nothing alike.

### 4.1 Traits are COMPILED, never deleted

The roll resolves **once, at composition time, from the scenario's own
seed**, and its output is the same trait list a participant always
carried. So `schedule`, `poseAt` and `faultWindow`'s controlled comparison
are untouched, and ground truth stays deterministic and replayable.

**NEVER resolve the roll at simulation or render time.** There would be no
discrete thing to strip, no control to diff against, and only
`POS_VISIBLE`/`MIN_DURATION` separating a fault from numerical noise.

### 4.2 OBSERVATION IS NOT A PEER OF THE OTHER FOUR

The other four govern what the candidate DOES with what they perceived.
Observation governs what they perceived at all — concretely, it is the
parameter that degrades `whatEgoSees` down to what this driver registered.

**Different layer, so it does not compete to explain the same fault.** A
tight gap taken having registered the vehicle is CONFIDENCE. The same gap
taken without registering it is OBSERVATION. Measured on identical
encroachments — same scene, same departure, same band — so only the cause
differs.

It is also **exempt from the attributability floor** (§4.5), because it
does not express through a trait at all. Counting trait kinds is the wrong
instrument for that axis.

### 4.3 NEVER SCORE OBSERVATION BY OUTCOME

The moment "didn't see the van" is graded by whether contact occurred, it
collapses back into confidence and the axis stops meaning anything.

Enforced structurally rather than by good intentions: `awareness.js` does
not import `clearance.js`, and `causeOf` is checked at source level for
any reference to contact or band. `REGISTER_SPAN` was calibrated on the
MISS RATE and deliberately not on the contact rate, for the same reason.

**If you are tempted to tune an observation constant against collisions,
that is the failure this paragraph exists to stop.**

### 4.4 THE ASYMMETRY THAT JUSTIFIES THE WHOLE AXIS STRUCTURE

**Occlusion is PERCEPTIBLE, so caution can compensate for it.** You can
see that you cannot see past the van, and wait.

**Inattention is INVISIBLE FROM THE INSIDE, so nothing can compensate for
it.** You do not know you failed to look, and no amount of care will make
you account for a car you never registered.

That is why observation and confidence are two axes rather than two names
for one thing. It generalises into the rule for adding any axis at all:
**an axis earns its place when it fails in a way the others cannot
reach.**

It was not designed in. It arrived as a FAILED derivation — an attempt to
set the caution allowance from the gap between what a driver knew to be
clear and what actually was gave a spread of 2.8s to 40.2s, because where
little is hidden the shortfall is inattention and the ratio explodes.
Forcing a constant out of that would have buried the finding.

### 4.5 THE ATTRIBUTABILITY FLOOR: two dominant fault kinds per axis

**An axis is only readable through errors it DOMINATES.** Entangled
evidence does not accumulate into an inference.

Measured: knowledge carries 19.1s of evidence per drive of which only 4.8s
is dominant — it speaks constantly through cut corners and overshoots and
can never be heard on its own. So the floor is **two distinct fault kinds
where that axis is the primary cause**, and it is reported by
`verify-candidate.mjs` rather than left as a worry.

Currently met: steering 3, knowledge 3, braking 2, confidence 2.
Observation is exempt (§4.2).

**When attribution gets more accurate and an axis loses its content, that
is allowed** — for as long as it takes to write the content properly.
Applying the maintainer's rolling-stop ruling took BRAKING from 2 dominant
kinds to 0. It was reported rather than argued away, and came back when
the approach rewrite made an abrupt stop expressible.

### 4.6 Confidence is two-tailed; the other four are monotonic

Too little confidence gives hesitation and refused gaps; too much gives
tight gaps and skipped observation. There is no such thing as steering too
well. So confidence is held as a POSITION with an optimum and measured as
deviation from it — two candidates can then fail in opposite directions on
one axis, which no monotonic rating can express.

**The margin a driver leaves for what they cannot see IS confidence.**
Departing the instant your KNOWN set is clear is not neutral behaviour; it
is a driver with no humility about their own perception. `cautionOf` is
the whole of the axis in one number — 1 at the optimum, 0 maximally bold,
2 maximally timid. The allowance is the candidate's own crossing time,
derived per scenario, because the way to be sure an unseen stretch is
empty is to watch it for as long as anything hiding there would take to
reach you.

### 4.7 ONE ROLL PER AXIS, NEVER ONE PER FAULT KIND

Rolling each available kind independently made the number of faults a
candidate commits a function of how many kinds the game has vocabulary
for: **1.11 per junction at seven kinds, 1.57 at ten, 2.0 at twelve** —
which took the section implied by a 3–4 recall band down to 1.5 junctions,
which is not a section.

The fix was not a smaller `ERROR_SCALE`. **A driver's deficit decides HOW
MUCH they err; the vocabulary decides WHICH WAY.** So the roll is per axis
they could fail on here, and the kind is drawn from that axis weighted.

Density is a property of the driver again, it holds still as content is
added, and "variety over volume" falls out by construction: at most one
fault per axis per junction, so two weaknesses show at most two things and
they are two DIFFERENT things.

Measured, and still holding after the generator was opened up: **1.03
markable candidate faults per junction, 2.13 axes per drive.**

### 4.8 `CAUSES` is the one table this project authors on purpose

Attribution is weighted and multi-axis. Measured across the set, only
`wander` and `wideTurn` belong unambiguously to one axis. Everywhere else
the answer is derived — but "why did that driver do that" is not
recoverable from geometry at any price. It is a claim about people, so it
is data, and it is the maintainer's.

The same weights are read in both directions, generation and attribution,
because two tables would drift the first time either was tuned.

### 4.9 Error FREQUENCY is not readable and must never be made so

`briefFor` swings the fault rate between 0.15 and 0.9 on dead air, so
frequency carries the PACING budget's signal, not the driver's. Pacing
owns how many opportunities a drive presents; the ratings own whether this
driver takes them. A player reads WHICH axis fails and how bad each
instance is, never how often.

---

## 5. The maintainer's rulings on specific faults

These are domain calls. They are not open to re-derivation.

### 5.1 Stop faults: the discriminator is MANNER, not position

    registered the control, stopped smoothly, wrong place  -> KNOWLEDGE
    registered the control, stopped abruptly               -> BRAKING
    did not register the control in time                   -> OBSERVATION

Verbatim: a CONTROLLED stop in the wrong place is a knowledge gap — not
knowing where to stop, or why the stopping point matters. An ABRUPT or
uncontrolled stop, before or after the line, is braking control, or an
observation failure if the driver did not register the controls in time.

**Same observable position, three causes, and the discriminator is a
physical quantity rather than a label.** No rule table is needed, because
both discriminators are quantities the model already holds: the
registration delay, and `approachDecelOf`. `ABRUPT_AT` is twice the
comfortable rate the approach geometry derives (5.40 m/s²), so an ordinary
stop is controlled by construction.

### 5.2 A rolling stop is a KNOWLEDGE fault, essentially always

Verbatim: "a particularly poorly skilled driver would have to be
completely unable to make their stop due to lack of control to make this
anything other than a failure to obey traffic law." Weighted 0.9
knowledge, 0.1 control.

Modelled as a car that never comes to rest, not one that leaves early — it
holds its crawl where a clean twin decelerates, so the tell is an ABSENCE
of deceleration and is visible both before the line and after it.

### 5.3 Right of way is PATH CONFLICT, not intersection occupancy

You do NOT wait for another vehicle to completely exit the intersection.
You wait until your path is clear of theirs. This was an early bug and it
is a big deal.

Consequences: two vehicles going straight from opposite legs do not
conflict — the window opens immediately. A moving vehicle claims the road
ahead of it proportional to speed; a stopped vehicle claims nothing.

### 5.4 A pedestrian on a crossing holds the NEAR HALF

Deliberately narrowed from "holds the entire crossing until completely
across". Once they are past the midpoint — onto the side serving the
opposing direction — a driver may go. A legal rule, not a geometric one,
encoded as an explicit override (`blockUntilClear`).

**Someone waiting at a crossing button holds none of it.** The signal has
not changed; traffic keeps moving. Without that rule a waiting pedestrian
would block from the moment they became visible, and the button would be
indistinguishable from them simply walking out.

### 5.5 An emergency vehicle on a call outranks everybody

Not by arrival order, not by which side it is on, and not by any
`priority` a scenario stamped on somebody else. **But yielding is not
freezing** — priority decides who goes first where the paths actually
meet, so a call three intersections away costs nothing.

### 5.6 Signalling

Proper signalling is 2–3 seconds before a change of direction or before
stopping at the line. A late signaller sits outside that window but must
still be READABLE — `LATE_SIGNAL_LEAD` is 0.8s, not zero. The lesson is
"do not commit on an absent indicator", never a gotcha.

Signal before any change of direction OR motion, slowing included. So the
signal deadline anchors to whichever act comes first — the slow, the
moving-off, or the manoeuvre — never to the manoeuvre by default.

### 5.7 Instructions

**An instruction is given as early as it is clear what it is specifically
asking.** Verbatim: "I will ask the applicant to 'turn right at the first
street' more or less as soon as that statement is true to where our route
takes us."

**Stacking instructions is a trade, not a fault.** Calling ahead buys the
candidate time and buys the examiner attention back for the other three
systems. It costs the candidate's concentration, and **a loaded driver is
a worse driver**. You are trading your own risk for theirs.

**A late instruction is the EXAMINER's fault, not the candidate's.** This
is real practice and it is the interlock the whole design rests on: being
busy marking a fault makes you late with a direction, and the resulting
error is then yours and unmarkable. The four systems have to be able to
make each other fail, or they are four scoreboards rather than one game.

**Silence means straight on.** So a late instruction is a missed turn, not
a pause.

### 5.8 A wide turn needs a next lane to be wide INTO

Maintainer's ruling, verbatim: "a wide turn onto a single lane road will
depend on the road markings, for example if the turn takes you into
parking spaces or a bike lane. Otherwise it would be either hitting the
curb or going off road, both still valid possibilites but very rare and
usually due to accidental acceleration."

So `wideTurn` DECLINES a road with no next lane, the same way `cutsCorner`
declines a right turn and for the same stated reason: a trait may only
fire where its tell is true. The off-road case is real but rare, and its
cause -- accidental acceleration -- is not something this model has, so it
is not the routine expression of a habitual wide turner.

It reached the maintainer as "a lot of left turns go completely off the
roadway": a flat 4.5m bias on a road whose room is 1.8m put the car 2.70m
past the kerb. Clamping the bias to the kerb was tried and only moved the
lie -- the car then finished exactly on the lane line while its tell
claimed it had crossed one. The clamp stays as a floor under the geometry;
the decline is the fix.

**Parking bays and bike lanes are the content this points at.** They would
give a single-lane road something to swing into, which is what makes a
wide turn there a real and markable fault rather than a rarity. Road
markings are not modelled at all today.

### 5.9 Partial success is partial marks, like a road test

Perfection is rewarded, not required. Omitting a step scores nothing for
that step but does not fail the task; doing the right things in the wrong
order keeps a little credit, because the player knew to do them — but not
much, because a signal after the fact informed nobody.

---

## 5.10 INTERVENTION: three outcomes, and one asymmetry that must survive

Maintainer's ruling, verbatim:

  "an intervention is an automatic fail in real life, however we are also
   taught that an early intervention (at the examiners discretion) can be
   dismissed from the scoresheet if the intervention was too hasty or
   'overly' cautious. maybe intervention should be in limited supply and
   if the user wastes them they can not intervene anymore to prevent just
   spamming the button."

  "failing to intervene when possible will count against the examiner in
   some way (in reality it could cost their job if it happens enough)."

Three outcomes, and they mirror the marking sheet's own three, which is
not a coincidence -- intervening is marking with the wheel instead of the
pen:

| | what happened | who pays |
|---|---|---|
| **CORRECT** | the danger was real and was prevented | AUTOMATIC FAIL for the candidate |
| **HASTY** | nothing was going to happen; dismissed, drive continues | THE PLAYER, entirely |
| **MISSED** | contact happened and nobody took the wheel | the player, seriously |

**THE ASYMMETRY IN `HASTY` IS THE POINT AND MUST BE PRESERVED.** A
candidate is never penalised for the examiner's nerves. Anything that
quietly moves a hasty intervention onto the candidate's sheet has broken
the rule rather than tuned it.

**Which of the three happened is DERIVED**, by the same controlled
comparison as everything else: take the world at the moment the wheel was
grabbed and ask whether it still ends in contact. If it would have, the
intervention was correct. If it would not have, it was hasty. Nobody
writes down "this one was hasty". `outcomeOf` in `src/engine/outcome.js`.

**What it is WORTH is not encoded.** The scoring weights are the
maintainer's and are deliberately absent rather than guessed at.

**A persistent cost across drives, not a per-drive score.** "It could cost
their job if it happens enough" points at progression rather than a
number on one sheet. Noted, not built, and it connects to the purgatory
framing.

### 5.10.1 The anti-spam problem, measured: attention alone is NOT enough

A hasty intervention is dismissed and the drive continues, so the player
pays nothing and spamming is rational. Two candidate fixes:

- **A supply cap** (the maintainer's): interventions run out.
- **An attention cost** (diegetic): an intervention interrupts the drive
  -- the candidate stops, it is explained, they resume -- and the player
  sees none of it. Spamming means missing faults, self-limiting without a
  counter, and it ties intervention into the game's actual currency.

The second is the more elegant idea and it does not work on its own.
Measured over 240 generated junctions carrying 283 markable faults:

| blind for | faults wholly missed per intervention | share of a junction's faults |
|---|---|---|
| 2s | 0.15 | 9.2% |
| 4s | 0.18 | 11.0% |
| 6s | 0.19 | 11.8% |
| 8s | 0.19 | 12.0% |

**The cost is small AND IT SATURATES.** Quadrupling the blind window from
2s to 8s moves it from 0.15 to 0.19 faults, because faults are sparse and
short relative to a junction, so a longer interruption mostly runs past
the end of the junction rather than covering more of it. You cannot fix
this by making the interruption longer.

Against that, contact was actually coming on **16 of 240 junctions
(6.7%)** -- so a spammer is hasty 93.3% of the time and pays about a fifth
of a fault for each one, while a correct intervention is an automatic fail
for the candidate. That is a cheap lottery ticket.

**So the supply cap is the mechanism and the attention cost is flavour.**
Both together is the recommendation: the cap does the deterring, the
interruption makes it feel like a driving test rather than a resource
meter. If the attention cost is ever asked to carry it alone, this table
is why it cannot.

---

## 6. ENCROACHMENT: entitled space, not forced evasive action

**The standard is intrusion on entitled space, and it is deliberately
STRICTER than collision avoidance.** Turning within a fraction of a second
in front of somebody is a failure to yield whether or not they had to
brake.

So **a fault exists independently of any reaction.** `clearance.js`
imports nothing that could react — checked at source level, because
defining the fault in terms of a response would mean a scene where nobody
happened to react silently contained no fault.

**Time, not distance.** A gap in metres means nothing without closing
speed. The quantity is post-encroachment time, and it degenerates to
ordinary following headway when the candidate turns INTO a lane rather
than across it, so one measure covers both.

**The worst of it over the manoeuvre, never the value at one instant.**
The candidate accelerates away and the gap recovers — measured, in 18 of
18 conflicts — so a single reading understates the fault by exactly that
recovery.

**The bands are NOT invented and NOT transplanted from real driving.**
`forwardClaim` has granted every moving vehicle `LOOKAHEAD` seconds of
road ahead since it was written, and `legalAt` refuses to let anybody into
that space — so the entitled gap was already stated, already in seconds,
already shipped. `ENTITLED === LOOKAHEAD` is asserted, so changing
`LOOKAHEAD` moves the bands with it rather than leaving a second opinion
behind.

**An encroachment has NO TRAIT.** It is not a habit — it is what the
candidate did with the gap — so it carries `trait: null` and a `band`, and
anything reasoning by removing a cause has to skip it (`isTraitFault`).

**A clean candidate can still be marked, and that is correct.** A
situation authored to be tight hands an encroachment to whoever drives it.
The property is "a clean candidate contributes no habit OF THEIR OWN".

---

## 7. THE REACTION IS THE OBSERVABLE, NEVER THE DEFINITION

A road user with priority brakes for a candidate who took their space, and
**that** is what the player is looking for. Harder to spot than a
collision, which is correct, and it rewards watching the whole scene.

**The reaction never decides whether a fault happened.** Encroachment is
marked on what the candidate did, against road users holding the line they
planned. `clearance.js` imports nothing from `reaction.js` and never will,
checked at source.

The reason is measured rather than asserted: **marking on the REACTED
world would soften 63% of faults**, so a driver who forces somebody to
stand on the brakes would score BETTER for it.

**Two derived worlds**: what the candidate did, which is marked, and what
then happened, which is drawn and decides whether anybody was hit.

Giving way is **derived, not scripted**: the least yielding that avoids
the collision, found by search, so how hard somebody braked measures how
bad the intrusion was. The parameter is HOW HARD THEY BRAKE over a fixed
ramp, not how much time they give up — the first version stretched the
ramp to fit the time and was therefore NON-MONOTONE in its own parameter,
which a bisection cannot handle. **Round a bisection away from the thing
it is avoiding**; rounding to three places put the answer back on the
colliding side in 13% of scenes.

Pedestrians give way by hesitating. `heedless` keeps the hazard authorable
— a child after a ball, somebody on a phone — because a pedestrian who
does not look is exactly the hazard the game wants, and that stays a
content decision.

---

## 8. Pacing, and the numbers that must not be tuned to fit

### 8.1 There is an OPTIMUM number of faults, not a direction

Too few and there is nothing to find; too many and ticking everything
becomes rational, which destroys the false-positive penalty that makes the
sheet mean anything. And because marking is DEFERRED, a section with
fifteen faults is not harder in an interesting way — it is a memory test.

So the quantity is **faults per section a competent player could catch and
recall**. Free recall runs out at about four items, so the band is 3–4,
and **SECTION LENGTH IS DERIVED FROM IT** rather than chosen. At the
measured 1.03 per junction that puts a section at 2.9–3.9 junctions.

Cross-checked against `SHOWINGS_FOR_A_HABIT` = 3, derived independently: a
section inside recall, several per drive, lets a habit accumulate its
evidence without any one section overflowing.

### 8.2 Variety over volume

Three faults across three axes beat six from one, because the player is
assembling a picture of a person rather than counting incidents. So the
distribution draws a PROFILE — weak on one or two axes, sound on the rest
— instead of sampling each axis independently, which produced drivers
slightly bad at everything and identifiable as nothing.

### 8.3 THE 25-SECOND DEAD-AIR TARGET IS NOT TO BE LOWERED

**If dead air exceeds the target, the answer is more to look at, never a
smaller number.** The target is a claim about a player's attention, not a
knob for making a check pass. Lowering it to green is the single most
tempting wrong move in this file.

It is currently **met**: worst 22.2s, median 18.2s, 0 of 24 drives over.
It got there by giving the drive more to look at — opening the generator
to marginal windows (§9.1) — which is exactly the intended direction. It
was 39.7s worst and 6 of 24 over before that.

Both pieces are needed and both are measured: 42.4s unaided, 31.3s with
segments alone, 29.8s predictive alone, 22.2s together.

Note that a stretch of arterial has activity 0.15 and SHOULD be quiet.
Some dead air is the correct answer, and driving it to zero would be a
different mistake.

### 8.4 Longer waits are answered with something to read

Realistic acceleration made every wait about three times what it was, and
the agreed direction is to FILL that time rather than tune it away: things
that happen DURING the wait and change what the answer is. Two are built —
the crossing button and the emergency vehicle — and both had to clear the
same bar as any other tell: **readable before the decision, and worth real
seconds in a controlled comparison.**

---

## 9. The generator

### 9.1 `windowIsSafe` is GONE. The accept test is `windowIsMarkable`.

There used to be two, because one generator served two games wanting
opposite things: the driver game needs a gap the player can actually take;
the examiner game needs marginal ones, because judgment is what is being
assessed. **The maintainer has ruled the examiner game the only priority,
so there is no trade left and the gate is removed rather than kept behind
a flag.**

Measured, identical seeds and candidates over 240 junctions:

| accept test | faults/junction | encroachments/drive | drives carrying one | contacts |
|---|---|---|---|---|
| `windowIsSafe` | 1.16 | 0.47 | 16/40 | 0 |
| no gate at all | 1.23 | 0.88 | 26/40 | **8** |
| `windowIsMarkable` | 1.20 | **0.70** | **22/40** | 0 |

The gate had been suppressing half the supply. Faults per junction barely
move, so this converts comfortable junctions into markable ones rather
than padding drives with noise.

**What it still refuses is CONTACT**, and that is an examiner-game reason,
not a leftover: an examiner watching a candidate hit somebody is supposed
to have taken the wheel, and intervention is not built. The line sits
exactly where the game's own ability to respond sits, **and it moves when
intervention lands.**

`safeAtFor` in `index.js` is the surviving statement of the same idea and
is still live — a hand-authored situation still has to be measured against
something.

### 9.2 Composition is a SEARCH, not a sampler

`compose.js` takes a brief, builds a scene, then asks the engine what it
actually turned out to be and throws it away if the numbers disagree.
Placing a van and calling the result low-visibility would be authoring the
answer, exactly like hardcoding a window.

The vocabulary is deliberately small and in a driver's words. **Every term
has to be measurable or it does not belong.**

### 9.3 Guarantees live in the accept/reject loop

`mustFault` (somebody erred here) and `mustShow` (THIS driver's habit had
an occasion) are the same gate narrowed, not a second mechanism beside it.
A habit that manifests once is an incident, so a drive has to keep asking
— and asking is the loop's existing job.

**Where a habit can show is DERIVED, never tabulated.** `chancesAt(shape)`
builds the smallest scene with that shape and asks `faultsIn` — a cheaper
call to the same oracle, not a second oracle. Writing "cutsCorner needs a
left" down would author the answer and go stale the first time a trait
changed.

---

## 10. THE RECURRING FAILURE PATTERN

**Two implementations of one quantity, or a proxy standing in for the
quantity that actually matters.** This has paid out more than any other
heuristic in the project. When something is subtly wrong, look for it
first.

Instances, all real:

- **`basePose` vs `cleanPose`.** `basePose` already CONTAINS the faults
  written by `setup` traits (`overshoot`, `slowStart`, `wideTurn`,
  `cutsCorner` write `stopBias`/`turnBias`/`startDelay`). Predicting from
  it hands the observer oracle knowledge of the very faults they are
  supposed to catch — four traits measured a belief error of exactly zero
  until this was found. `chaseFor`'s drift readout had the same bug and
  reported 0.00 m for 4 of 5 path faults.
- **`legalAt` vs `safeAtFor`.** Legally yours and safe to take are not the
  same thing, and the scorer grades the second. Grade against
  `safeAtFor(sim)`, never `sim.legalAt` directly.
- **`pose.hidden` conflating occluded with not-yet-on-stage.** Only the
  first is perceptual; the second is the board being finite. Conflating
  them made a candidate rated 1.0 on observation blind to traffic nobody
  could miss.
- **`TRAIT_KEYS` is the ONE list of driver traits**, because a second copy
  is how a new trait gets forgotten by one generator and not the other.
- **The renderer's own sign table** duplicated geometry `road.js` already
  derived, and did not follow a junction placed elsewhere in the world.
- **A fixed traversal time standing in for real motion.** It made a wider
  road move traffic FASTER — the six-lane arterial was crossed at 89 km/h
  — and pegged `MAX_CLAIM` for 18 of 21 road users, disabling the
  speed-proportional claim rule entirely.
- **A smoothstep lerp standing in for braking.** Every car in the game
  decelerated at 18.1 m/s² (1.84g) and nobody could notice, because
  nothing in the model was a physical quantity.
- **`shownFor` keyed without the junction.** Every leg's clock starts near
  zero, so `scoreDetection` credited a mark against a fault from a
  junction the player never saw. A player who marked EVERY fault scored
  zero.
- **Calibrating observation against the collision rate** — a proxy for
  "did they gather the information", and the wrong one (§4.3).

The tell is usually a measurement that comes out at exactly zero, or
exactly saturated, or suspiciously clean.

### 10.1 THE SECOND PATTERN: the check was looking at the wrong half

Distinct from the above, and it has paid out three times in two days.
Every one of these shipped with a full green suite, because a check that
inspects the wrong half of a thing passes confidently and forever.

- **`verify-turns` measured only the APPROACH.** `if (along <= hy)
  continue` skips the junction box and everything past it, so the EXIT
  side of a turn had never been looked at once. `wideTurn` put a car
  2.70m past the kerb and nothing noticed until somebody played it.
- **`verify-screens` rendered the mode COMPONENTS and never `App`** — the
  shell every route actually goes through. A dangling reference in the
  home screen served a blank page to every route while the check that
  exists to catch blank pages stayed green.
- **`verify-screens` rendered ONE FRAME at t=0.** A component in a branch
  that only runs under a runtime condition is invisible to it. `<Belief>`
  renders only when an actor is occluded while still believed in — which
  is what two cars touching produces — so the lab went black on contact
  with every check passing.

The lesson is not "write more checks". It is that **a check has a
BOUNDARY, and the boundary is usually invisible in its output.** When one
passes on something you suspect, ask what it does not look at: which half
of the manoeuvre, which screen, which moment, which road width. The four
checks that asked `wideTurn` for a fault on a single-lane road were all
correct and all measuring a decline.

### 10.2 THE THIRD BLIND SPOT: what is measurable is not what is felt

Stated as a rule because it has now happened three times, and each time
the suite was fully green:

  **A NUMBER CAN ONLY TELL YOU ABOUT THE THING IT MEASURES. Whether the
  game is any good to play is not one of those things, and no check in
  this repository will ever tell you.**

- **The screens did not render.** Every engine check passed for twenty
  increments while the Examiner screen threw on mount.
- **The stacking trade shipped inert.** `held` was zero by construction,
  so the one mechanic the drive screen exists to evaluate could not fire,
  and every check passed because every check was aimed at the engine
  underneath it.
- **The world is continuous in geometry and DISCONTINUOUS IN
  EXPERIENCE.** `verify-world.mjs` measures culling, routes, pacing and
  segment hazards, and all of it is right. The maintainer played it:
  "it's hard to get a sense of anything else without having an actual
  seamless world. otherwise it's a series of very quick scenes that don't
  meaningfully connect to each other."

The third is the sharpest, because the measurements were not merely
silent — they were POSITIVELY REASSURING. Dead air was green, pacing was
green, continuity of route and rotation was green. The world was
continuous by every quantity anybody had thought to measure, and it plays
as a slideshow.

**So: a measurement is evidence about a question, and the question is
usually narrower than it sounds.** "Is the drive continuous?" was answered
by checks that only ever asked whether the ROUTE was continuous. Nobody
had asked whether the camera cuts, whether any traffic survives a
boundary, or whether the ground under the candidate is the same ground.
It is not. See §10.1: the check was looking at the wrong half, again.

**What it took to fix, recorded because the shape repeats.** The drive
screen never imported `world.js` -- `driveThroughTiles`, `candidateAt`,
`placeJunctions` and `linkBetween` were built, verified and unused, while
the screen composed one junction at a time and drew every one of them at
the board centre. Wiring it up surfaced two engine bugs that could not
show while everything sat at 360,360:

- **`exitPoint` was half origin-aware.** Lateral coordinate from the
  junction, along coordinate from the board edge -- so a junction placed
  at y = -5329 sent its candidate 240 METRES SOUTH to an exit computed at
  the middle of the board. Now measured from the junction, and provably
  identical at the default origin, so `engine-golden` is untouched.
- **`worldExitOf` and `exitPoint` were two implementations of one
  quantity** (§10): the traverse ended 22m out, the link began 7.6m out,
  and the road snapped 12m backwards under the candidate at every exit.
  `worldExitOf` existed only BECAUSE `exitPoint` was board-relative -- its
  own comment says so -- so fixing the first dissolved the second.

That also corrected a real measurement: **runway was overstated by 14m**,
because it was measured from a point the candidate had already driven
past. Three junctions immediately reported less approach than their tile
promised. True before, and simply not measurable.

**The remedy is not a better check. It is a person playing it**, early
and often, and treating what they report as data of the same standing as
a number. Every one of the three was found by eyes and could not have
been found any other way.

A useful habit: when a check passes, try to make it fail on purpose. Every
fix in this file that was verified that way — deleting `<Belief>` again,
putting `watched` back, importing `reaction` into `clearance` — found
something. The `<Belief>` check passed on the first attempt with the
component deleted, because its own doc comment mentioned the name.

---

## 10.5 Where a check protects a decision, its failure says so

Four failure messages are written as explanations rather than symptoms,
because a message that explains itself is worth more than a comment nobody
reads. If you hit one, it is not asking you to make it pass — it is
telling you what would break:

| check | the decision it defends |
|---|---|
| `verify-world.mjs` dead air | DO NOT LOWER `DEAD_AIR_CEILING`; add things to look at |
| `verify-reaction.mjs` imports | the reaction is the observable, never the definition |
| `verify-candidate.mjs` density | one roll per AXIS, never one per fault kind |
| `verify-awareness.mjs` imports | observation is never scored by outcome |

Each names the measurement behind it and points back here. **When you add
a check that protects a decision, write the message the same way.**

---

## 11. Verification

**Any change to the conflict engine, trait system, scenario timings or the
generator must be re-verified numerically before it is considered done.**
All 26 `tools/verify-*.mjs` plus `verify-scoring.py` must exit 0.

New engine logic gets an **independent re-derivation, not a self-check** —
which is why the scoring curve is reimplemented from prose in Python
rather than ported from the JavaScript.

**There is a resolution floor.** `earliestClear` steps in `STEP` = 0.05s,
so any effect smaller than that is invisible by construction. "The trait
moved the window by 0.00" can mean "does nothing" or "does something too
small to represent" — measure finer before concluding which.

**`verify-equivalence.mjs` is the one for refactors.** The others check
the engine is right; that one checks it has not *changed*.
`engine-golden.json` is a committed fingerprint. Rebake with `--write`
only when the change is MEANT to move behaviour, and say so in the commit.

### 11.1 THE BUILD PASSING DOES NOT MEAN THE APP RENDERS

A render-time `ReferenceError` is not a build error. `vite build`
succeeded while `App` threw `done is not defined` on mount and every route
served a blank page.

`verify-screens.mjs` exists for exactly this and now renders **`App`
itself plus every route**, not just the mode components — the earlier
version rendered the four screens directly and never the shell every
player actually loads, which is how the blank page got through.

It asserts nothing about how anything looks and cannot: effects do not run
under SSR.

### 11.2 SCRIPTED PLAYTHROUGHS DO NOT WORK IN THIS ENVIRONMENT

**Do not try. This cost real time on four separate occasions.**

The preview pane delivers **zero** animation frames — measured, 0 in 1.5s
with `document.hidden` false — and clamps timers hard. An rAF-driven
screen simply does not advance. Nothing errors: the page renders, buttons
respond, the clock sits still.

The signature is a screen that draws correctly and never moves, or a
hand-rolled frame pump that stalls after a burst. Two traps go with it: a
pump that yields only on microtasks starves React's scheduler so the
component never re-subscribes to rAF; and the component must already be
subscribed BEFORE any pump starts.

**Verify a component by reading it, by `verify-screens.mjs`, and by asking
a person to open the page.** Their eyes are the better instrument and they
are available.

---

## 12. Build order: done, next, deferred

### Done

- The conflict engine, rotation, routes, the world, tiles and pacing.
- Real motion: acceleration on departure, deceleration on approach, turns
  as steered arcs.
- The examiner flip: `faults.js`, `detect.js`, `belief.js`, the chase
  camera.
- Five axes (`ratings.js`), one candidate across a drive (`candidate.js`),
  habits and disconfirmation.
- Encroachment in seconds (`clearance.js`), candidate awareness
  (`awareness.js`), the world giving way (`reaction.js`).
- Directions with derived per-leg deadlines, and the stacking trade.
- **The playable loop**: `src/apps/ExaminerDrive.jsx` at `#/drive`.
- Marginal windows in the generator (§9.1).

### Next — and the first is blocking

1. **INTERVENTION.** This is the critical path. The mechanical
   prerequisite is measured and met: warning from the conflict itself is
   0.45s min / 1.10s median / 2.30s max, which is a reflex test — but
   warning from **a prior derived fault by the candidate** is 1.80s min /
   **6.30s median** / 10.10s max, and 56% of encroachments have one. 96%
   of those give more warning than the conflict ever gives at its best.

   What is missing is the DOMAIN half and it is the maintainer's: **what
   is an intervention, in law and on the sheet?** Automatic fail for the
   candidate? Is failing to intervene a fail for the player? Until that is
   answered, contact stays refused by the accept test and 0.88−0.70
   encroachments per drive stay locked behind it.

2. **THE GAZE CONE, which is NOT BUILT.** `examinerEye`, `inCone`,
   `whatExaminerSees`, `faultVisibility` and `OWN_CAR_READ_AT` were
   deleted from `sight.js`. Visibility is currently occlusion only, and
   `faultSeenAt` returns `"clear"` unconditionally for the ego — so the
   entire candidate-observation half of the scoring is ungated. "You hold
   a field of view and can only mark what you actually saw" is the
   headline mechanic and it is absent.

   Rebuilding it is one angular test in front of the occlusion
   `visibility()` already does, plus a control on the screen. **Gaze must
   be relative to the car's heading, never absolute** — `route.js` rotates
   scenarios, and a gaze in world degrees would need a different look from
   each approach. And **reading the candidate's own car is a different
   act**: the examiner sits IN it, so the bearing is meaningless; judge it
   against the road ahead of its own bonnet with no occlusion.

3. **The post-test debrief.** The pieces exist — the sheet is what the
   player recorded, `habitReport` is what was true, `scoreDetection`
   computes the gap. Naming the habits is what teaches the player what to
   watch for next time.

4. **The candidate's observations are not modelled at all.** No head, no
   mirrors, no eyes. A large share of what a real examiner marks is
   whether the candidate *looked*. Biggest gap in the design; new
   modelling, not reuse.

### Deferred deliberately

- **`departureOnAwareness` is a query, not wired into `schedule()`.** So
  observation has no behavioural consequence in a composed drive yet.
  Wiring it adds an earlier, second class of intervention cue, but it
  changes how every candidate drives.
- **Going off course.** Real tests re-route; `planRoute` plans the whole
  course up front. Maintainer's call whether it ends the drive.
- **A tile's declared road and the composed junction's road disagree** —
  15 of 56 match, 0 of 13 for arterial. Latent until a renderer draws the
  world. Fixing it needs a road-design call first.
- **The tutorial**, framed as job training for a new hire, reusing eight
  rescued right-of-way puzzles (commit `63a9c68`) whose `rule`/`why` prose
  also serves the debrief.
- **Merging, roundabout generation, cyclists, international mode.** Each
  needs a domain ruling before it needs code.
- **`MergeRush`** is an unwired prototype. Do not wire it in.
