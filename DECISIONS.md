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

**AND ITS MIRROR IMAGE: A STATE THE ENGINE CAN PRODUCE AND THE RENDERER
CANNOT EXPRESS IS NOT A MISSING FEATURE. IT IS A LIE ABOUT WHAT
HAPPENED.** Not authoring the answer is half of it; not silently
discarding it is the other half, and this project only learned the second
half after `outcome.js` had known that contact ends a drive for its whole
life while `ExaminerDrive` never asked. 63% of drives already ended in
contact and the screen drew nothing, so the maintainer played it for
weeks and never saw one. When you add a state, ask what draws it. When
you find a state nothing draws, that is not a backlog item -- it is the
game telling players something untrue. Section 5.12.

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

---

## 2.1 LANGUAGE: Ontario, Canada. American English, North American road terms.

Maintainer's ruling. A lot of this project's vocabulary is British and it
reads wrong to the audience.

| use | not |
|---|---|
| intersection | junction |
| curb (note the spelling) | kerb |
| sidewalk | pavement |
| yield | give way |
| shoulder | verge |
| crosswalk | pedestrian crossing, zebra crossing |
| turn signal, signal | indicator |
| parking lot | car park |
| lane change, median, traffic light | — |
| color, behavior, meter, center | colour, behaviour, metre, centre |

`arterial` and `collector` are correct North American road classifications
and stay. `roundabout` is used in Ontario and is fine. `right of way`,
`stop line` and `driveway` were already right.

**ALL PLAYER-FACING TEXT IS ALREADY CORRECTED** — UI, the marking sheet,
fault tells, scenario prose, DRIVE-GUIDE.md. That is where it matters.

**CODE IDENTIFIERS ARE RENAMED**, as its own pass, approved after the
measurement below was reported: 446 occurrences of `junction`/`Junction`
across 11 distinct identifiers in 37 files, and 82 of `kerb` across 6 in
19. Seventeen distinct names, none colliding with a partial word, and
nothing named in `engine-golden.json` — a big diff and a small risk, which
is what made it worth doing in one go rather than drifting.

**THE NEAR-MISSES ARE WHAT COST, exactly as warned.** A mechanical
`junction` → `intersection` leaves grammar behind it: **48 instances of
"a intersection" in comments and prose**, across 20 files, every one of
them a sentence that used to read correctly. And this very table was
corrupted by its own rule — the "not" column was rewritten too, so it read
"use intersection, not intersection" and "use curb, not curb", which is
the document destroying the only record of what it was for.

So: after any sweep of prose, **re-read the thing that documents the
sweep.** A rename that edits its own specification has no witness.

**In the meantime: USE THE CORRECT TERMS IN ALL NEW CODE AND
DOCUMENTATION.** Do not add another `curbFoo`. Mixed vocabulary is the
cost of deferring, and it gets worse if new code makes it worse.

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
for: **1.11 per intersection at seven kinds, 1.57 at ten, 2.0 at twelve** —
which took the section implied by a 3–4 recall band down to 1.5 intersections,
which is not a section.

The fix was not a smaller `ERROR_SCALE`. **A driver's deficit decides HOW
MUCH they err; the vocabulary decides WHICH WAY.** So the roll is per axis
they could fail on here, and the kind is drawn from that axis weighted.

Density is a property of the driver again, it holds still as content is
added, and "variety over volume" falls out by construction: at most one
fault per axis per intersection, so two weaknesses show at most two things and
they are two DIFFERENT things.

Measured, and still holding after the generator was opened up: **1.03
markable candidate faults per intersection, 2.13 axes per drive.**

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
past the curb. Clamping the bias to the curb was tried and only moved the
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
Measured over 240 generated intersections carrying 283 markable faults:

| blind for | faults wholly missed per intervention | share of an intersection's faults |
|---|---|---|
| 2s | 0.15 | 9.2% |
| 4s | 0.18 | 11.0% |
| 6s | 0.19 | 11.8% |
| 8s | 0.19 | 12.0% |

**The cost is small AND IT SATURATES.** Quadrupling the blind window from
2s to 8s moves it from 0.15 to 0.19 faults, because faults are sparse and
short relative to an intersection, so a longer interruption mostly runs past
the end of the intersection rather than covering more of it. You cannot fix
this by making the interruption longer.

Against that, contact was actually coming on **16 of 240 intersections
(6.7%)** -- so a spammer is hasty 93.3% of the time and pays about a fifth
of a fault for each one, while a correct intervention is an automatic fail
for the candidate. That is a cheap lottery ticket.

**So the supply cap is the mechanism and the attention cost is flavour.**
Both together is the recommendation: the cap does the deterring, the
interruption makes it feel like a driving test rather than a resource
meter. If the attention cost is ever asked to carry it alone, this table
is why it cannot.

---

## 5.11 FAILING TO AVOID SOMEBODY ELSE'S MISTAKE

Maintainer's ruling: *"failing to prevent a collision when you otherwise
could, even if you're not strictly at 'fault', is a fail on the test."*

So a candidate is assessed on AVOIDING OTHER PEOPLE'S MISTAKES, not only
on committing none of their own. Every other fault in this engine derives
from the candidate's own ratings and actions; this one derives from what
they did about somebody else's.

**IT IS THE EXAMINER'S OWN DUTY TO INTERVENE, ONE LEVEL DOWN.** A
candidate who fails to prevent an avoidable collision fails; an examiner
who fails to prevent one is penalised. The same principle applied to both
people in the car, which is why `unavoided` has `judgeIntervention`'s
shape: take the world at a moment and ask whether a different action
changes the ending.

**AVOIDABILITY IS DERIVED, NEVER AUTHORED.** No list of avoidable
situations. It is a search over the one response a driver has, using the
same `yielding` field `reaction.js` stamps on a road user giving way --
the candidate slows by the identical mechanism rather than a second one.

**AND THE QUESTION IS NOT WHETHER *THIS* CANDIDATE COULD HAVE AVOIDED
IT.** That is circular: a candidate who noticed too late can never avoid
anything, so their own inattention would make every collision
"unavoidable" and therefore nobody's fault. Measured, it did exactly
that -- 95 contacts, 87 with the danger unregistered in time, and not one
counted as avoidable. The standard is a COMPETENT OBSERVER: the danger's
onset plus the floor nobody reacts faster than. Whether this candidate
could is the answer, not the question, and it is what the axis records.

**AN UNAVOIDABLE COLLISION IS NOT A FAULT AND MUST NEVER BE SCORED AS
ONE.** It fails a candidate who could not have done anything, which is
the unfairness the whole redesign has been avoiding since the vision cone
came off the player.

### 5.11.1 THE ONSET IS WHEN THEY START MOVING, not when belief diverges

`belief.js` predicts "they carry on driving properly", and for a car whose
whole movement IS to pull out of a space, driving properly is pulling out.
Belief never diverges. Measured: **onset undetected on 36 of 36.**

A car leaving a driveway is not misbehaving. It is doing an ordinary thing
that has to be ANTICIPATED, which is a different question from being
caught out by somebody driving badly -- and `belief.js` answers only the
second. Use the start of movement for a road user that was stationary.

### 5.11.2 THE ANTICIPATION WINDOW MUST BE BUILT IN, or there is no content

**The figures below were measured in the wrong frame -- see §5.11.6.**

The gap between when a danger becomes perceivable and when it becomes
unavoidable IS the anticipation window. If it is zero there is nothing to
test: the collision just happens.

So it is derived rather than hoped for -- the emerging car starts moving
while the candidate is still a full reaction floor plus stopping distance
up the road, at that road's speed. Contacts went from **95 of 111 to 9 of
70** when this was put in.

### 5.11.3 A CANDIDATE CANNOT BE MODELLED BRAKING DURING THEIR APPROACH

**Found by this work. Worked around in the probe, not fixed in the
engine, and the distinction matters.**

`yielding` shapes the TRAVERSE profile. The approach is `brakingApproach`,
a fixed deceleration to the line. So there is no way to express a
candidate braking before `departAt` -- and any conflict occurring then is
unavoidable BY CONSTRUCTION, not because a driver could not have braked
but because the model cannot represent it.

Consequence: **the avoidability fault class can only fire during a
traverse.** It works at intersections -- 11 of 32 contacts avoidable --
precisely because that is where a traverse exists. It cannot fire on a
LINK at all, because there the candidate is always approaching, and that
is exactly where the roadside hazard content lives.

**The workaround: arriving later IS easing off** -- the same distance over
more time. `avoidableFrom` asks that as well as asking whether braking on
the traverse would have worked, and it is asked in the PROBE rather than
in `basePose` because `yielding` never appears in a normal `simulate()`
path -- only the lab and this probe set it -- so nothing shipped moves and
the golden cannot. A response only counts if there was time for it: the
candidate must have been able to react before they arrived.

That unblocked it completely: **avoidable went from 0 of 9 to 12 of 12.**

### 5.11.4 THE OCCLUSION IS THE HAZARD, and leaving it out made the axis unreachable

**The figures below were measured in the wrong frame -- see §5.11.6.**

The emerging car carried no `sightBlockers`, so it was in plain sight from
the first frame. The candidate therefore always registered the danger in
time and the fault could only ever be CONFIDENCE -- measured, 9 of 9.

The whole property that makes this hazard worth having is that the
driver's view is obstructed and **the candidate cannot see them until they
move**. `curbsideFor` already emits the `{ x, y, rot, hl, hw }` shape
`sightBlockersOf` reads, so the row of parked cars becomes occlusion
without anything downstream learning a new type.

With it: **observation fires for the first time in the project** -- 4 of
12 avoidable contacts attribute to it, 8 to confidence.

### 5.11.5 OBSERVATION STILL DOES NOT CLEAR THE ATTRIBUTABILITY FLOOR

**The `unavoided` row below was measured in the wrong frame -- see §5.11.6.
The conclusion is unchanged and the correction makes it worse, not better.**

Stated plainly rather than counted generously. Measured over 25 drives:

| fault kind | attribution | dominant |
|---|---|---|
| `encroachment` | unsighted 20 | **unsighted** |
| `unavoided` | confidence 8, observation 4 | **confidence** |

**Observation dominates ZERO distinct fault kinds.** It now fires, which
it never did before, but it does not dominate: confidence owns `unavoided`
two to one.

Note `unsighted` is not `observation` and must not be counted as it.
`causeOf` returns it when the road user was genuinely not in view when the
candidate committed -- the scenario's doing, not the driver's failing.
Anything that folds the two together would clear the floor on paper while
meaning nothing.

**AND THE CONTENT IS STILL NOT LIVE**, but the reason has now changed
three times, which is worth recording because each change was progress
rather than an excuse.

1. *The collisions were unavoidable.* Fixed: the anticipation window is
   built in (§5.11.2).
2. *The candidate could not act on what they perceived while travelling.*
   Fixed: `responseOnAwareness`, and the controlled comparison in §5.11.6
   shows it preventing 30 of 33 collisions.
3. *A collision has no representation in the drive.* `outcome.js` knows
   contact ends one; `ExaminerDrive` never consults it. This is the
   intervention question, and it is the maintainer's.

The content is gated on (3) and on nothing about itself.

### 5.11.6 EVERY NUMBER IN 5.11.2, 5.11.4 AND 5.11.5 WAS MEASURED IN THE WRONG FRAME

**Superseding correction, not a refinement.** The scenes those sections
were measured on had the notional candidate driving across the road the
hazard was on — see §10.6. So the contact counts, the ease-off rate and
the attribution split above are artifacts of a geometry error and must not
be cited. What survives is the reasoning; what does not is every figure.

Re-measured in the corrected frame, over 20 drives, 73 emergences:

| | driveway (reverses out) | parallel space (pulls forward) |
|---|---|---|
| scenes | 33 | 40 |
| fully visible BEFORE it moves | **28** | **0** |
| anticipation window, median | 6.25s | 2.55s |
| required (reaction + braking at the road's speed) | 6.25s | 6.25s |
| meets it | 28 | 0 |
| contacts if the candidate does nothing | **33** | 0 |
| contacts as composed | **3** | 0 |
| of those, avoidable | 3 | — |
| attribution | confidence 3 | — |

Five things follow, and the fourth is the one that hurts.

**The reversing car is the hazard and the parallel one is not.** A car
pulling forward out of a space accelerates away in the candidate's own
direction and is never caught; a car reversing out crosses the lane
slowly. That is exactly the maintainer's ruling — *"we could exemplify
this by having cars reverse out of their driveways in residential
streets"* — arrived at from the geometry rather than applied to it.

**The anticipation window is met when, and only when, the car is visible
before it moves.** The requirement is reaction plus braking time from the
moment the danger is perceptible, and the candidate's arrival is set to
exactly that from the moment the car goes — so any delay in perceiving it
comes straight off the window. That is why §10.6's driveway work is what
fixed this and no amount of retiming would have.

**`responseOnAwareness` is doing real work.** Controlled comparison, same
scenes: 33 of 33 driveway emergences hit a candidate who does nothing,
3 of 33 hit one responding as composed.

**OBSERVATION NOW GETS NOTHING FROM THIS HAZARD.** §5.11.4 reported it
firing for the first time, 4 of 12 — that was the broken frame. In the
corrected one all three avoidable contacts attribute to **confidence**.
The attributability floor is further from being cleared than it was
reported to be, not closer. Do not fold `unsighted` in to fix it (§4.5,
§5.11.5).

**RULED, AND IT IS GRADED RATHER THAN BINARY.** Maintainer's words:
*"drivers should notice cars in the driveway but the reverse lamps should
raise awareness even higher that there could be a conflict especially, if
the reversing car is actually moving."*

So there is no single onset. There are **three cue strengths**:

| cue | strength |
|---|---|
| a car present in a driveway | mild — a competent driver registers it |
| its reverse lamps lit | stronger |
| the car actually moving | strongest |

**AWARENESS ONSET IS A FUNCTION OF CUE STRENGTH, NOT A SINGLE EVENT**,
and that generalises far beyond driveways. A stronger cue is registered
SOONER and by MORE drivers. Combined with the observation rating it gives
exactly the gradient this game wants: a poor observer misses the
stationary car entirely and may only catch the lamps, while a good
observer clocks the car before anything happens at all. Two drivers, same
scene, different moment of registration — and the difference is legible,
which is the whole test of a mechanic here.

It also makes **reverse lamps content the model needs** rather than a
speculative nicety. Not to be built at stage 0: it belongs with stage 1 or
later, once there is something for a cue to be a cue *about*.

The question this answers was:
Being able to see a car sitting in a driveway is not the same fact as
perceiving that it is about to move. **The model currently treats
REGISTRATION OF THE CAR as the onset of anticipation**, which assumes an
examiner expects a candidate to ease off for a stationary car in a
driveway. That is a judgment about practice, not geometry, and it is
stated here as an assumption rather than left implicit in the code.

If the ruling is no, the onset has to be something the car DOES before it
moves — reversing lamps, a head turning — and that is content the model
does not have. **Do not build it speculatively.** Everything downstream
holds either way; what changes is only where `responseOnAwareness` starts
counting from, which is one expression in `awareness.js`.


---

## 5.12 A COLLISION HAD NO REPRESENTATION, AND THAT WAS NOT A GATE ON FUTURE CONTENT

**The maintainer has played this game and has never seen a collision,
because there was nothing to see.** `outcome.js` has known that contact
ends a drive since the day it was written, and `ExaminerDrive` never
consulted it. So two cars drove through each other, the clock carried on,
and the candidate arrived at the next intersection.

Measured before anything was built: **19 of 30 drives (63%) already
contained a contact.** The first one lands at a median 49% of the way
through an 80-second course. This was never a gate holding back content
that had not shipped yet -- it was silently swallowing the most severe
thing the game can produce, every second drive, in the build that is on
screen today.

That is the general lesson and it is worth more than the fix. **A state
the engine can produce and the renderer cannot express is not a missing
feature; it is a lie about what happened.** Everything else in this file
is about not authoring the answer. This is about not silently discarding
it.

### 5.12.1 The drive's outcome lives in the engine

For the same reason `sectionSheet` does: **a React component is the one
place nothing else in this suite can reach**, and it has now cost three
separate bugs -- the Examiner screen that threw on mount for twenty
increments, the stacking trade that shipped inert, and this.

A drive is intersections and the links between them, each its own little
simulation with its own clock, so "how did this drive end" is not a
question any single scene can answer. `contactsAcross(scenes)` asks it,
where a scene is `{ id, sim, offset }` and the caller owns the offset
because only the caller knows how its drive was laid out. The offsets are
the same two mappings hazard faults already use -- one more consumer of
them, not a second notion of when things happen.

### 5.12.2 THE GRASP HORIZON, and why there has to be one

`graspHorizon(v) = REACTION_FLOOR + v / approachDecel(v)`.

**Without a horizon every grab is CORRECT, because a drive that ends in
contact ends in contact at some point after any given instant.** Taking
the wheel for something you could not yet have stopped for is not
prevention; it is not having waited.

So the horizon is the examiner's own reaction plus the time to bring the
car to rest at this road's speed -- **the same quantity the anticipation
window is derived from**, read in the other direction. One statement of
"how long it takes to stop something", not two. At 8.3 m/s both come out
at 6.25s, and both move together if either changes.

### 5.12.3 The supply cap is ONE PER SECTION, and it is derived

Two constraints, and they pin it from both sides:

- It must **cover what a drive can genuinely require** of you, or the game
  is unwinnable through no fault of the player.
- It must sit **as close to that as possible**, or intervention is free and
  the decision is not a decision.

A section is already the unit this game thinks in -- it is what the
marking sheet covers and it is derived from what a player can actually
recall -- so one per section makes the trade local rather than a global
budget nobody can feel, and it scales with the drive on its own. Measured
over 30 drives, contacts per drive run 0 / median 1 / max 2, and a
six-intersection drive is two sections. **The derivation and the
requirement agree, which is the only reason the number is allowed to
stand.**

The fiction is that interrupting costs you attention. The CAP is the
mechanism: measured, attention alone saturates and cannot do the job
(section 5.10.1).

### 5.12.4 AND 63% IS AN ARTIFACT, NOT THE CANDIDATE'S DRIVING

This mattered enough to settle before anything was built on top of it,
because the two possible answers lead in opposite directions. If the
candidate's own driving caused it, 63% is a statement about how badly the
generated drivers drive and the distribution has drifted well past
"presents a fun challenge". If it is not, it is a bug and a more urgent
one.

Controlled comparison, same composed scenes re-timed rather than redrawn,
24 drives and 144 legs:

| | contacts | drives |
|---|---|---|
| as shipped | 22 | 15/24 |
| candidate carries no traits | 19 | 14/24 |
| **nobody carries any traits at all** | **19** | 14/24 |
| other drivers stripped, candidate intact | 22 | 15/24 |

**A flawless candidate in a world of flawless drivers crashes just as
often.** The entire trait contribution is `wander` 2, `slowStart` 1,
`cutsCorner` 1. So it is the second case, and it is in SCHEDULING rather
than in the conflict predicate -- which was checked independently by
walking `conflicts` by hand, 9 of 9.

Localised, by dumping one concrete case rather than reasoning about it,
to **two things that are both "nothing keeps cars off each other unless
they stop"**:

- **12 of 22 -- THE OTHER CAR IS ON THE CANDIDATE'S OWN LEG.** Two road
  users queueing at one stop line have INDEPENDENT APPROACHES: each is
  built by `approachFrom` over `APPROACH_RUN` from its own `arriveAt`, so
  two cars arriving two seconds apart occupy the same 24.5m of road at
  overlapping times and the follower drives through the leader's tail.
  There is no car-following in the model at all. 8 of the 22 contacts
  happen while the other car is still on its approach, which is the
  signature.

  Seed 3, dumped: candidate from N turning left, departs 1.40 the instant
  it arrives; a second car from N going straight arrives 3.40; contact at
  1.60, with the two of them 4.5m apart centre to centre on a road where a
  car is 4.5m long.

- **10 of 22 -- A ROLLING NON-PRIOR NEVER YIELDS.** 9 from the opposite
  leg, 1 crossing. `priority: -1` says this actor gives way to the
  candidate, and `outranks` honours it when ORDERING the queue -- but a
  participant with `stops !== true` never enters the queue. `schedule()`
  hands them `departAt = arriveAt + startDelay` and no clearance check at
  all, so they drive through the intersection while the candidate is
  turning across them.

  This is a direct consequence of section 8.4: uncontrolled legs made
  road users `stops: false`, and before that change everybody stopped, so
  `earliestClear` always ran.

**THE FIX THAT SUGGESTS ITSELF IS `windowIsSafe` COMING BACK, AIMED AT
THE CANDIDATE INSTEAD OF THE PLAYER.** It asked "could the player take
this window and live", and it was retired because there is no player
pressing GO any more (section 9.1). But the question is still exactly
right about the CANDIDATE: a scene where a CLEAN TWIN of this candidate
collides is a scene the generator should not have shipped, because the
resulting collision is attributable to nobody -- and attributability is
the whole basis on which an intervention can be fair. Contact caused by
the candidate's own driving stays, and is the content.

**Measured before adopting, over 144 composed legs:**

| | |
|---|---|
| legs where a clean twin also collides -- the gate would reject | **19 (13%)** |
| contacts as shipped | 22 |
| of those, the CANDIDATE'S OWN DOING (the twin survives) | **3** |
| markable faults in the rejected scenes | 25 of 154 (16%) |

So it removes 19 of the 22 and leaves 3 -- 0.125 per drive, every one of
them attributable to the candidate. The 13% rejection is mild against the
29% the old `windowIsSafe` ran at, and the 16% supply figure is an UPPER
BOUND rather than a cost: the gate belongs inside `composeScenario`'s
accept/reject loop next to `windowIsMarkable`, where a refused draw is
redrawn rather than lost.

**MEASURED AGAIN WITH IT LIVE, and the upper bound turned out to be the
whole of the cost -- there is none:**

| | before | after |
|---|---|---|
| legs composed over 24 drives | 144 | **144** |
| intersections the ladder could not fill | 0 | **0** |
| markable faults per leg | 1.07 | **1.07** |
| contacts | 22 | **4** |
| drives ending in contact | 15/24 | **4/24** |

Nothing was lost because nothing needed to be: the accept loop simply
draws again, and there is always another scene. And 0 of 300 accepted
draws are unsurvivable afterwards, which is the gate holding rather than
a restatement of it.

**AND EVERY SURVIVOR IS THE CANDIDATE'S OWN DOING**, which is the whole
property the gate exists for. Over 40 drives: 4 contacts, and stripping
the candidate's traits ONE AT A TIME on the same composed scene makes all
4 vanish -- `cutsCorner` 2, `wander` 2. The same controlled comparison
`faults.js` is built on, asked of the terminal outcome rather than of a
fault. A collision the player is asked to prevent is now always one
somebody caused, and can be named.

**But the rate is THIN for the mechanic it feeds: 0.10 per drive over 40,
one drive in ten.** A player could go ten drives without a justified
intervention, which is not a job. That is not an argument for loosening
the gate -- it is what the gated driveway emergence is FOR, and it is why
`LIVE` mattering was worth chasing: it produced 3 contacts in 33 driveway
emergences, all avoidable, in content specifically shaped so attention is
the only thing that decides the outcome. Measure the combined rate before
judging either.

**THE TWIN IS TRAIT-FREE, NOT CAREFUL.** It departs on `earliestClear`
like anybody else, so this refuses scenes where doing the legally correct
thing kills you -- not scenes that are merely demanding.

All 22 have the candidate departing **before `safeAt` by a median of
5.85s**, and 21 of 22 are with a **NON-PRIOR** -- somebody who should have
been waiting for them. That is the `legalAt` / `safeAtFor` split, which is
the first entry in section 10's list, reaching the candidate's own
departure rather than only the scorer's grading.

Two supporting findings, both of the built-and-drawn-by-nothing family:
**`reaction.js` is imported by `ExaminerLab` and by nothing else**, so no
road user has ever given way in the actual game; and `departOverride` is
likewise set only in the lab, so the candidate's awareness has no effect
on their departure in a composed drive either. Neither is the cause here
-- only 1 leg in 144 has anybody who needs to give way, and applying
reactions removes 1 contact of 22 -- but both are wiring that the design
assumes is in place.

### 5.12.6 THE GATE WAS MEASURED AND NOT APPLIED

`sceneIsSurvivable` is designed, measured and **not in the tree**. Two
reasons, and the second is the larger one.

First, it turned `verify-awareness` red and the fix would have been to
loosen a threshold, which this file exists to prevent. Second, the
foundation it was patching is being replaced (section 13): a filter that
discards scenes where cars drive through each other stops being worth
having once cars cannot drive through each other. The reasoning is kept
because it characterises the defect precisely, and because if the rebuild
is abandoned this is still the cheapest available stopgap.

`verify-awareness` section 4 asserts that the WORST drawn driver misses
more than 10% of the traffic they could have gathered -- "enough to be a
habit". With the gate live it comes out at **exactly 10%**, and the
assertion is a strict `> 0.1`. **Do not loosen it to `>= 0.1`.** That is
tuning a number until it looks right, and this file exists to stop that.

What is actually going on, measured rather than assumed:

- The statistic is **6 of 60 sightings**, not a rate. Without the gate it
  was 7 of 66. Both say "the worst drawn driver misses about a tenth".
- **It does not move with sample size.** 60, 120, 240 and 400 drawn
  drivers all give exactly 6 of 60. So it is not noise -- it is a ceiling.
- The AXIS can express far more: a driver rated 0.00 on observation misses
  18%. **The drawn distribution's tail simply never reaches there.**
- And the check's own scene set varies with the generator -- 19 of 20
  briefs composed before, 18 after -- while nothing in its output said so.
  That is section 10.1 again, and it is now printed.

**The design question underneath it.** `SHOWINGS_FOR_A_HABIT` is 3. The
36-scene set is roughly six drives' worth of sightings, so the worst
drawn observer misses about ONE road user per drive -- a third of what
this project's own constant says a habit needs. Either the content has to
supply more late-clearing road users, or observation has to be accepted
as a habit that accumulates ACROSS drives rather than within one.

**This is very likely the same root cause as observation failing the
attributability floor** (section 5.11.5, section 4.5). The axis does not
dominate a fault kind because it barely shows, and it barely shows
because the drawn tail is thin -- not because the attribution is wrong.
That connection is worth testing before either is treated as its own
problem.


### 5.12.5 TWO OPEN MODELLING GAPS. THE FILTER IS A STOPGAP, NOT THE FIX.

**`sceneIsSurvivable` discards scenes in which the model misbehaves. It
does not make the model behave.** Both of the things below are real holes
and both are still open, and a world that only works because the
impossible scenes are thrown away is fragile in a way that will not
announce itself: it will bite again the first time new content puts two
moving cars near each other, which is most of what this project still
wants to build.

**GAP 1: THERE IS NO CAR-FOLLOWING.** Every approach is built
independently by `approachFrom` over `APPROACH_RUN` from that car's own
`arriveAt`, so two road users on one leg arriving two seconds apart
occupy the same 24.5m of road at overlapping times and the follower
drives through the leader's tail. Nothing in the model says a car keeps a
gap to the car in front.

**And this is not only a correctness matter.** Traffic that maintains
gaps reads as DRIVERS; traffic that interpenetrates reads as SPRITES. The
whole direction of this project is a world that feels inhabited -- one
continuous space rather than a series of slides -- and cars behaving like
cars is a large part of that. The real fix has value well beyond
suppressing false contacts, which is the argument for doing it rather
than filtering forever.

What it needs: a queue position per (leg, lane), and a stopping point
that sits a car length plus a gap behind whoever is already there. That
is derivable from geometry the engine already has -- `stopPoint` and
`CAR_L` -- rather than new physics. The harder half is that a following
car's approach must then be shaped by the leader's, which is the first
thing in this engine that would make one road user's motion depend on
another's.

**GAP 2: A ROLLING NON-PRIOR NEVER YIELDS.** `priority: -1` says an actor
gives way to the candidate, and `outranks` honours it when ORDERING the
queue -- but a participant with `stops !== true` never enters the queue at
all. `schedule()` hands them `departAt = arriveAt + startDelay` and no
clearance check, so they drive through the intersection while the
candidate is crossing it.

Two candidate fixes and neither is obviously right yet. Either rolling
participants get scheduled against those who outrank them -- which means
deciding what "waiting" is for a car that does not stop, since the honest
answer is that they slow rather than wait -- or `reaction.js` grows the
other direction, since it already models giving way and currently only
computes it for PRIORS braking for an intruding candidate, never for a
non-prior giving way to a candidate who is entitled.

**Both were exposed rather than caused by section 8.4.** Uncontrolled
legs made road users `stops: false`; before that everybody stopped, so
`earliestClear` always ran and neither hole was reachable. A correct
change surfacing something nothing was checking is the good case, and it
is why the filter must not be allowed to close the file on them.


## 5.13 RULINGS FOR THE REBUILD, given ahead of the build rather than after it

The maintainer answered a list of blocking questions in one go so the
work could carry on unattended. Recorded here because they are domain
calls, which are the only kind of decision this project cannot derive.

### 5.13.1 The all-way stop is a STRESS TEST, not a demo

*"we should start with an all way stop with cars that just keep coming,
so we can prove our right of way ordering stays consistent."*

So the question is not whether precedence resolves once. It is whether it
stays correct **indefinitely**, under a stream that never lets up. That
makes the property a check rather than a screenshot: no car may ever
enter the box while somebody who outranks it is still waiting, over a run
long enough that any drift would show.

### 5.13.2 Four-way precedence is confirmed as built

Whoever stopped first goes; arriving together, the car on the right goes;
head to head, a left turn yields to the oncoming. Two cars from opposite
legs both going straight simply both go, because their paths never cross.

**Waving each other through is real but rare** -- *"drivers may wave each
other through on rare occasions where the stop order isn't clear, but
isn't the norm"* -- so it is NOT modelled now. Recorded as a possible
later nicety, and only for the genuinely ambiguous case rather than as a
general behaviour.

### 5.13.3 Right on red is allowed unless posted otherwise

In scope once signals exist, with a PER-INTERSECTION PROHIBITION FLAG for
the rare junction where it is forbidden. **Report what that flag costs
before building it** -- the maintainer asked specifically how complicated
it would be, which is the right question to answer with a measurement
rather than an estimate.

### 5.13.4 Pedestrians come later, and the reason is structural

They need a decision model of their own. A pedestrian is not an obstacle
with a timer on it; they choose when to cross, they can be heedless, and
the near-half rule (5.4) is a claim about what they are entitled to
rather than about where they are. Stage 4, with perception.

### 5.13.5 A rolling stop is knowledge-dominant WITH CONFIDENCE AS A REAL
CONTRIBUTOR

Refines 5.2. The maintainer's mechanism, verbatim: *"rolling stops are a
failure to obey the law not necessarily a skill issue. a high confidence
driver might feel strong in their observation that it's clear to go and
will disregard the stopping portion prematurely."*

So it is not knowledge alone, and it is not a control failure either. It
is a driver confident in their own read of the situation deciding the
legal requirement is surplus. Two axes, weighted, knowledge dominant --
which is a shape `CAUSES` already supports (4.8), so this is a change of
weights rather than of machinery when the fault model is rebuilt.

**And some NPCs should do it**, which follows for free once every car is
a rated driver (REBUILD.md 4.1): a weak knowledge axis and a bold
confidence axis produce it without anybody authoring it.

### 5.13.6 Turn speeds carry over unchanged

The old engine's derived figures -- about 26 km/h through a left and 22
through a right -- are reused. The maintainer expects play-testing rather
than derivation to say whether they need adjusting for the game's pace.

### 5.13.7 UNDUE DELAY IS MARKABLE, AND THERE IS A NUMBER

*"on the Ontario scoresheet, waiting 4-5 seconds beyond when the opening
is there to turn is marked on the test."*

So the timid tail of the confidence axis has a real threshold rather than
a notional one, and hesitancy is a fault an examiner actually records.

**It presupposes a defined OPENING, and that is the one question still
outstanding** -- how big a gap a competent driver accepts turning across
a moving stream. So the delay fault must be built AGAINST THAT NUMBER
rather than against a second definition of an acceptable gap written
beside it. Two definitions of "an opening" is section 10's pattern
waiting to happen, and this is the moment it would be introduced.

### 5.13.8 THE GAP A DRIVER ACCEPTS IS DERIVED, NOT ASKED FOR

This was the one question left outstanding, and it turned out to be the
wrong question to ask. **The gap falls out of the geometry and the
caution model**, which is what this project does with every other number
it refuses to type in.

The derivation is the old engine's own, one level along. Section 4.6: *"the
allowance is the candidate's own crossing time, derived per scenario --
the way to be sure an unseen stretch is empty is to watch it for as long
as anything hiding there would take to reach you. One quantity doing both
jobs."* The same quantity answers this one: **the gap you need is the
time it takes you to clear, plus as much again scaled by how cautious you
are.**

Measured against the intersection as built -- from rest at the line, at
the engine's own pull-away rate, clearing the conflict region plus a car
length:

| manoeuvre | conflict to clear | time from rest | bold | competent | timid |
|---|---|---|---|---|---|
| right | 8.0m | 2.6s | 2.6s | **5.2s** | 7.8s |
| straight | 8.0m | 2.6s | 2.6s | **5.2s** | 7.8s |
| left | 10.0m | 2.9s | 2.9s | **5.8s** | 8.7s |

**A competent driver's threshold for a left across traffic comes out at
5.8 seconds** with no number typed in anywhere, which is where a real
left turn across a stream sits. So the maintainer's answer becomes a
CHECK on the derivation rather than an input to it: if 5.8s is roughly
right, nothing needs setting; if it is badly wrong, the derivation is
wrong and that is a finding worth more than the number would have been.

**THE TABLE ABOVE WAS SHORT, AND THE CORRECTION IS THE INTERESTING
PART.** It measured to the MEETING POINT. A driver is not clear when
they reach the place their path crosses somebody else's -- they are
clear when their whole car is out of the region where the two paths
interact, which for a straight across a two-lane road is the far lane
plus their own length. Building the two-way stop made the difference
load-bearing and the model reported it:

| manoeuvre | run to clear | time from rest | bold | competent | timid |
|---|---|---|---|---|---|
| right | 14.4m | 3.5s | 3.5s | **6.9s** | 10.4s |
| straight | 15.6m | 3.6s | 3.6s | **7.2s** | 10.8s |
| left | 20.4m | 4.1s | 4.1s | **8.3s** | 12.4s |

The SHAPE is unchanged and is still the thing to confirm. What moved is
the run, and it moved because the earlier figure was measuring the wrong
end of the manoeuvre.

**AND THERE IS NOW AN OUTSIDE CHECK ON IT.** The Highway Capacity
Manual's base critical headways for a two-way stop are measured off real
traffic: 6.2s for a minor right, 6.5s minor through, 7.1s minor left.
The derived competent gaps are 6.9 / 7.2 / 8.3 -- the same ORDER, and
within 1.2s, with nothing here fitted to them. That is the strongest
independent confirmation this model has had, and it is checked in
`verify-crossing.mjs` section 8 so it stays true.

The remaining offset is honest and its cause is known: `clearOf` is
bounded at a full car length past the box rather than half of one, and
the conflict scan uses a 3.0m clearance band, so the model is about two
metres more conservative than "your bumper is past mine". Both are
deliberate and neither has been tuned to close the gap with the HCM
figure -- doing that would be fitting the derivation to the answer,
which is the one thing this section exists to avoid.

**THE GAP IS PER CONFLICT, NOT PER DRIVER.** Nothing holds a single
number for "the gap this driver needs": it is computed against the
specific car being looked at, from how far along their path the region
begins and how far along mine I must get to be out of it. A minor-road
driver going straight needs 5.2s against a car coming straight through
and 7.2s against one turning left into their lane, and both are the same
expression. The first version of the check compared the worst of those
against the specific one and reported a two-second disagreement between
two correct answers -- worth remembering, because a check that compares
an aggregate against an instance will always find a bug that is not
there.


### 5.13.9 YIELDING IS GAP ACCEPTANCE. THE RULES ONLY DECIDE WHO HAS TO
FIND THE GAP

The two-way stop was expected to need a second mechanism and did not.
Every yield in the model is now the same act -- is there time for me to
be clear before they get here -- and the right-of-way rules do nothing
except decide which of the two drivers has to ask.

That came out of a failure rather than a design. "A left turn yields to
the oncoming" was implemented as an unconditional hold, which is what
the rule says, and it **deadlocked the entire through road**: both major
approaches headed by a left-turner, thirty-five cars queued behind each
of them, four cars through in five minutes. A car stopped two hundred
metres back was oncoming traffic by every test except the one that
matters.

CLAUDE.md already states the rule that fixes it -- *a moving vehicle
claims the road ahead of it, proportional to speed; a stopped vehicle
claims nothing* -- and applying it turned the unconditional hold into a
gap question. Which is what a left turn across a stream actually is.

**A TIE-BREAK THAT LEAVES NEITHER DRIVER YIELDING IS NOT A TIE-BREAK.**
The right-hand rule decides adjacent legs and says nothing at all about
opposite ones, so two opposing left turns were each on nobody's right,
each read the other as somebody else's problem, and drove through each
other -- 4.5m between centres at 16 and 21 m/s. It had been latent at
the all-way stop for as long as that has existed and never fired,
because at a stop one of the two always launches a tick before the
other and commitment covers it. Take the stops away and the two of them
arrive at speed with nothing between them.

`settle` is now total by construction: the car on the right, then
whoever has further to go to the meeting point, then the id. The last
rung is arbitrary and is meant to be -- it is a guarantee about the
RELATION, not a rule of the road, and if it is ever what decides in
ordinary traffic then something above it is not working.

**AND TWO DRIVERS CAN BOTH BE RIGHT AND STILL COLLIDE.** A through car
at rest at the line beside a minor-road car at rest at its line: the
minor driver read them as a stopped vehicle claiming nothing and went,
they read the minor driver as owing them everything and went, and both
decisions were taken in the same tick from the same previous state. This
is the failure mode a stepped simulation has and a scheduler does not,
and the fix has to be a fact both of them read the same way rather than
a better rule for either: **a car on the road with priority that has
come to rest at the line is waiting, not yielding**, and it still has
its priority when it goes.


### 5.13.10 ACCEPTING A GAP IS A DECISION, AND IT HAS TO STICK

Commitment was a matter of SPEED -- a driver counted as under way once
they passed 1.5 m/s. It takes two thirds of a second to reach that from
rest, and for every tick of it the driver re-decided from scratch, so an
opening that was ample when they judged it closed underneath them while
they were still doing under a metre a second. They stopped again. Then
they did it again.

Measured: five drivers no more cautious than competent were marked for
undue delay having correctly started and correctly aborted, several
times each. That is dithering, and it is not what any of them decided.

The gap a driver accepts already accounts for their own pull-away --
`timeToCover` reads their current speed and their cruise -- so a gap
that was adequate at the moment of the decision stays adequate. What was
missing was that the decision was a decision. `LAUNCHED` survives as the
physical backstop for a driver who never came to a decision because they
never came to a stop.

It also buys the undue-delay fault an EXACT property rather than a
statistical one, which is why it is worth a section: a driver no more
cautious than competent takes the opening in the tick it appears, which
stops them sitting, which stops the clock before it can latch. So such a
driver can never be marked -- by construction, not by tuning. Measured:
233 drivers at or below the competent mark, none marked; 10 marks in
all, averaging 1.69 caution against 0.99 for everybody else; and
clamping the whole population to competent removes every one of them
without buying a single overlap.


### 5.13.11 UNDUE DELAY IS TIME SINCE THE OPENING, NOT ONE UNBROKEN
OPENING -- AND THAT READING IS MINE RATHER THAN THE MAINTAINER'S

His ruling: *"waiting 4-5 seconds beyond when the opening is there to
turn is marked on the test."* Two readings fit those words and they do
not produce the same game.

Read as ONE UNBROKEN OPENING lasting four seconds, **the fault fires
never.** Measured over 251 drivers who came to rest at a line: no
opening ever stayed open for four seconds, and the longest was 3.0s,
because an opening on a road with traffic on it is a rapid series of
brief ones. Meanwhile the behaviour the fault exists to catch is plainly
there -- a timid driver sits 15.9s at the line where a competent one
sits 3.7s.

Read as TIME SINCE THE OPENING APPEARED, it fires on exactly the drivers
it should. His sentence points at a moment -- "beyond WHEN the opening is
there" -- so that is how it is built: the clock starts at the first
opening this driver could have acted on and runs while they are still
sitting there.

`REACTION_FLOOR` is the old engine's, not a new number. An opening that
flickers for less time than anybody can react to was never an opening,
and marking somebody for missing it would be marking them for physics.

**THIS IS THE ONE THING IN THE STAGE WORTH PUTTING BACK TO HIM.**
Everything else here is derived or is his already.

**And an opening you cannot move into is not an opening.** A driver
shuffling up behind a car that is still clearing the box is following,
not delaying. That is stage 0's question and `wantedGap` is stage 0's
answer, asked here rather than restated -- half the first run's marks
were exactly that case.


### 5.13.12 AN APPROACH IS A DURATION, LIKE THE ROAD

Stage 0's road is sized as a duration rather than a distance. An
approach is the same idea against a different clock: **it has to be long
enough to hold the longest gap anybody waiting on it could need**, or
"is there a gap" is answered by the edge of the world rather than by the
traffic, and gap acceptance collapses into "is anybody visible at all".

At 60 km/h that asks for 279m, derived from the same `gapNeeded` the
driver uses at the timid end of the confidence axis against the fastest
car that could be coming. Nothing is chosen. It is also roughly what a
real two-way stop needs a driver to be able to see, which is why sight
lines at one are an engineering concern rather than a detail.

Where nothing stops, nobody accepts a gap, the whole term is inert and
an all-way stop keeps the 60m approach it has always had.

**THE CONFLICT REGION HAD TO BE BOUNDED TO THE INTERSECTION FOR THIS TO
BE AFFORDABLE, AND THAT WAS A REAL BUG OF ITS OWN.** Two paths leaving
by the same leg share their whole outbound lane, so the sampled scan
found them within clearance of each other for every remaining metre and
reported `clearOf` as the far end of the road. A driver then waited for
anybody sharing their exit to leave the WORLD before moving -- which is
intersection occupancy at its most extreme, and precisely what 5.3 says
this model does not do. It was survivable at a 60m approach and is not
at a 279m one, because the wait scales with the length of the road.
`whatStops` already treats a shared exit as FOLLOWING and takes over at
exactly that boundary, so bounding the scan removed a second answer
rather than dropping a case. Throughput at the all-way stop went from
597 crossings in forty intersection-minutes to 912, still with nobody
out of turn.

**And it settles 5.13.7's trap for free.** Undue delay is marked at 4-5
seconds beyond "when the opening is there", and the opening is now one
expression rather than a second definition written beside it -- the same
function that tells a driver to go tells the scorer when they should
have.

The tails are the part to look at rather than the middle: a bold driver
takes a 2.9s gap where a timid one waits for 8.7, both from one axis, and
that spread is the mechanic. Awaiting confirmation of the shape rather
than of the number.

---

## 5.14 STAGE 2: A DRIVER IS THEIR RATINGS, AND YOU CAN TELL

### 5.14.1 AN AXIS THAT CHANGES NOTHING IS A LABEL, NOT A RATING

Two of the five reached the decision model and three did not: confidence
through gap acceptance and pace, knowledge through rolling stops, and
observation, steering and braking through nothing at all. A driver
"weak on braking" drove identically to one who was not.

Braking became ONE PARAMETER OF THE FOLLOWING MODEL rather than a new
mechanism. The Intelligent Driver Model already asks how hard a driver is
willing to brake -- it is the `b` in the desired-gap term -- and a larger
one means a smaller gap wanted, so they close in further before doing
anything about it and then have to brake harder than they meant to. That
is what a braking fault looks like from outside: not an inability to
stop, but leaving it late and then standing on it.

**The span is derived rather than chosen.** A sound braker plans on the
comfortable rate (2.70 m/s2, the rate the old engine derives from its own
approach run) and the worst plans on twice it -- which is exactly
`ABRUPT_AT`, where a stop stops being controlled. The axis runs from
"comfortable" to "abrupt" and has no room to be anything else.

Steering became LANE-KEEPING rather than turn line, and that is a
geometry constraint rather than a preference: CLAUDE.md's own ruling is
that a wide turn needs a next lane to be wide INTO, and every road in the
sim is one lane each way. The turn-line half is deferred until the sim
has a road that can express it.

Observation is deliberately still absent, and 5.14.5 says why.

### 5.14.2 A WEAK AXIS HAS TO MOVE ITS OWN OBSERVABLE AND NOBODY ELSE'S

The first property is obvious and the second is the one that matters. A
player who can see that something is wrong but cannot work out WHAT has
learned nothing, and the whole five-axis structure exists so that the
answer is recoverable. Measured on one course -- same seed, same traffic,
the same legs in the same order, one rating moved:

| driver | what shows | against sound |
|---|---|---|
| hesitant | waiting at the line | 7.1s a trip against 1.2s |
| pushy | trips completed | 15 against 14, at a fifth of the waiting |
| ragged | off their own line | 0.38m against 0.04m |
| heavy-footed | typical braking | 2.48 m/s2 against 1.96 |
| unschooled | stop signs rolled | 2 of 6 against 0 of 6 |

and steering, braking and knowledge each leave the other two exactly
where they were. Checked in `verify-telling.mjs` section 2.

**AND WHERE AN AXIS CANNOT SHOW, IT DOES NOT.** At an all-way stop a
hesitant driver is indistinguishable from a sound one -- 1.0x the
waiting, against 6.1x at a two-way stop -- because everybody stops, so
there is no gap to judge and confidence has nothing to say. That is
correct rather than a gap, it is the same rule `chancesAt` lives under in
the old engine, and it is the argument for a course with more than one
kind of place on it.

### 5.14.3 A MAX IS THE WRONG INSTRUMENT FOR A DISPOSITION

"How hard does this driver brake" measured as the worst of fourteen
approaches is dominated by whichever one had a car cut across it, so it
measures the situation and not the person. The tell was the usual one: a
SOUND candidate's worst came out at 5.39 m/s2, which is `ABRUPT_AT`
exactly, while their typical stop was 1.96.

The median of the per-trip peak separates cleanly. An examiner forms an
impression from what somebody does every time, not from their worst
moment -- and a statistic that cannot tell a disposition from an incident
is not measuring a disposition.

The same correction applied to rolling stops. Counting every trip crossed
without coming to rest made a sound driver look like they rolled 8 of 14,
because most of those were the through road, where not stopping is the
correct thing to do. Only a leg that has a stop sign can roll one.

### 5.14.4 TWO IMPLEMENTATIONS OF "ARE THESE TWO INSIDE EACH OTHER"

`conflictsBetween` decided which paths could ever interact from the clean
CENTRELINES, at a 3.0m distance threshold. A driver who does not hold a
steady line is not on their centreline -- so two cars overlapped at 2.63m
between centres in a pair the conflict table said never meet. The
steering axis was the only thing that could have exposed it, and it did
so within minutes of existing.

**Widening the threshold was not available.** Two straights from opposite
legs run 3.6m apart for their whole length and must not conflict (5.3),
so any distance big enough to cover the weave would have broken the rule
that costs the most to lose.

It is a FOOTPRINT test now, grown by the maximum weave -- the same
separating-axis predicate the overlap check uses, imported rather than
written twice. Exact instead of approximate: two cars in adjacent lanes
still have 0.9m of air between them at full stray, because the amplitude
is half the room by construction, and the opposite-straights rule holds
without a special case. It also found a conflict the distance test had
been missing entirely: 84 conflicting ordered pairs against 60.

**The weave amplitude is half the room and that bound is load-bearing.**
A car is 1.8m in a 3.6m lane, so there is 0.9m of air on each side -- but
the driver in the next lane has exactly the same claim on it. Half each
is the most two drivers can both be wrong by and still pass.

### 5.14.5 OBSERVATION IS THE AXIS THAT REQUIRES CONTACT TO EXIST FIRST

Held back deliberately, and the reason is structural rather than
schedule. A registration delay makes a driver read the traffic as it was
a second ago, so they accept gaps sized to a car that has since moved.
For a competent driver the margin absorbs it; for a bold one it does not,
and the outcome is contact -- which is CLAUDE.md's own "the dangerous
candidate is both blind and bold", arriving in the rebuild from a
different direction.

The sim's one property is that nobody drives through anybody, and it must
not be weakened to admit a fault (`verify-crossing` says so in those
words). So the honest order is: contact gets a representation, the
property becomes the stronger statement -- **no contact for want of a
rule, and every contact attributable to a named deficit** -- and
observation ships against it. Turning it on first would either break the
property or quietly cap the axis at whatever is survivable, and the
second is worse because it looks fine.

This is 5.12 restated one layer down. A state the engine can produce and
nothing can express is a lie about what happened.

### 5.14.6 A SPAWN GATE WAS DECIDING HOW FAST A CANDIDATE DROVE

An arrival was admitted only if it fitted AT ITS OWN PREFERRED SPEED and
dropped otherwise, so the faster a driver wanted to go the less often
they could get onto the road at all. A bold candidate completed 3 trips
in fifteen minutes where a timid one completed 13 -- which reads as a
fact about the driver and is a fact about the entrance.

A driver arriving behind a queue does not arrive at the speed they feel
like, they arrive at the speed there is room for. `joinAt` bisects for
the fastest speed that fits, which is ordinary merging, and returns
nothing only when even a standing start will not. All six profiles now
get identical time on the road, which is what makes anything measured
between them a comparison.

**The general form is worth keeping: a gate that admits or refuses is
suspect wherever the thing being gated has a dial.** The refusal
correlates with the dial and the correlation looks like a finding.

**AND IT INVALIDATED A CHECK THAT HAD NOTHING TO DO WITH CANDIDATES**,
which is the part worth remembering. `verify-crossing` section 6 asked
whether the mean wait SETTLED between the first half of a ten-minute run
and the second, and read growth as starvation. That was a valid proxy
only while excess demand evaporated at the entrance: with arrivals
discarded there, a growing wait could only mean an approach was never
being served.

Once a driver who cannot get on at their own speed slows down and joins
anyway, the queue fills the approach instead, and a wait growing toward
that is the intersection being FULL. The check went red on a strictly
better model.

It asks the fairness question directly now -- is any one approach served
materially less than the others -- which is what "nobody is starved"
always meant, and it is immune to the fill-up transient. Measured: all
four legs take 25% of the crossings each, and the road holds 37 to 40
cars flat across twenty-eight minutes while refusals climb linearly. The
queue is bounded by the road rather than by nothing, which is the honest
statement and one the old proxy could not make.

Same lesson as 10.1 from the other end: a check has a boundary, and the
boundary here was an assumption about a component the check never
mentioned.

### 5.14.7 AN APPROACH HAS TO BE LONG ENOUGH TO STOP ON

Five car-ticks in a hundred and fifty thousand sat at EXACTLY the maximum
braking the model allows -- not near it, on it, which is 10.0's tell
verbatim. Every one was a fast driver arriving 52m from a line they
needed 87m to stop at comfortably: they were spawned inside their own
stopping distance, and the clamp was the only thing between the model and
a car that could not stop.

A 60m approach was never long enough for a 60 km/h road. It is derived
now, from the same `wantedSpeed` the driver model uses at its boldest and
the comfortable braking rate: 100m at 60 km/h, 267m at 100. The
two-way stop's approach is longer still for the other reason (5.13.12),
and the larger of the two wins.

`wantedSpeed` and `stoppingRoom` exist as exported expressions rather
than as arithmetic in three places, because "1.35 times the limit"
appearing in the driver model AND in the geometry that sizes the road for
it is the recurring bug waiting to happen.

### 5.14.8 THE ROAD BETWEEN INTERSECTIONS IS ASSESSABLE TERRITORY, NOT
TRANSIT

**This contradicts an assumption the project has carried since before the
flip to the examiner game**, and it was measured rather than argued.
Everything about the design has treated the intersection as where the
assessment happens: scenarios are intersections, `route.js` sequences
intersections, pacing counts intersections, and a link is the distance
between two of them.

Stage 2 put all five axes into the decision model and then asked where
each one can be READ. Three of the five express on the APPROACH and only
one needs the box:

| axis | where it reads |
|---|---|
| steering | the approach -- lane-keeping needs motion, and a queue at a stop line has none |
| braking | the approach -- the whole of it is how late they leave the braking |
| confidence, as pace | the approach -- wanted speed and following distance |
| confidence, as gap acceptance | **the intersection**, and nowhere else |
| knowledge | the stop line itself |

The evidence is the all-way stop, where nobody has a gap to judge: a
hesitant driver is indistinguishable from a sound one there (1.0x the
waiting, against 6.1x at a two-way stop) while ragged, heavy-footed and
unschooled all still read exactly as themselves.

Three consequences, and they are design rather than implementation:

1. **Link length is a content decision.** A long link is several seconds
   of readable driving rather than dead time to be minimised. Most of the
   marking supply lives there.
2. **A course needs more than one KIND of place**, or confidence is mute.
   An all-way stop cannot test it at all, which is an argument about
   route composition rather than about traffic density.
3. **The camera has to work on the link**, which is the second
   independent argument for the chase view. A top-down view of a whole
   intersection is a poor place to read lane-keeping from whatever the
   amplitude of the weave -- see 5.14.4 for why the amplitude cannot
   simply be increased.

It also reframes 4.6's "longer waits are answered with something to read,
not with shorter waits". The something to read was assumed to be events
DURING the wait. Some of it is the driving either side of it.

## 5.15 STAGE 3, FIRST INCREMENT: THE ROAD BETWEEN INTERSECTIONS

### 5.15.1 THE LINK IS NOT NEW GEOMETRY

The exit of one intersection and the approach of the next are the SAME
PIECE OF ROAD. Place the two centres `reach + reach` apart and the exit
path ends exactly where the approach path begins -- same metre, same
lane, same heading -- so a car running off the end of one path runs onto
the start of the next with nothing stitched and nothing interpolated.
Measured across two- and three-intersection courses: every seam 0.0000m
apart and 0.00 degrees out.

That was not the expected answer. A link looked like it would need its
own path type, its own length, and a rule for joining it to both ends.
It needs none, and the reason is the constraint that made the geometry
awkward in the first place: an approach is 279m at 60 km/h because it has
to hold the biggest gap any driver could ask for (5.13.12), so two of
them back to back is a 558m block -- a city block -- and the awkward
constraint turns out to have been building the thing the next stage
needed.

**A COURSE OF ONE IS THE SINGLE INTERSECTION, NOT AN EXTENSION OF IT.**
`seedCrossing` is now `seedCourse` with `n = 1`, and the single case
carries no special path anywhere: an edge leg is a leg with nothing
joined to it, of which a lone intersection has four. Verified rather than
argued -- a trace of six worlds at 120 seconds each is BYTE IDENTICAL
before and after the change.

### 5.15.2 A LANE IS A PIECE OF ROAD AND IT DOES NOT STOP AT A BOUNDARY

Right of way is a question about one intersection. Following is not: two
cars nose to tail across a boundary are on one street, filed under
different intersections, and the one behind must be able to see the one
in front or it drives into it at the exact moment the leader changes
hands.

So a lane has an identity of its own, shared by the two paths that use
it, and a position along it measured by projecting the world pose onto
the lane's direction -- which needs no bookkeeping, because the pose is
already the coordinate.

WITHIN one intersection the older rules stay, and that is deliberate
rather than leftover: they use the path's own distance, so a follower
keeps following a leader THROUGH the box. A projection onto a straight
lane cannot do that -- a car turning off my lane stops advancing along
it, and a follower reading that would think it had stopped dead.

### 5.15.3 FILING A CAR UNDER ONE INTERSECTION IS SAFE BECAUSE THE
APPROACH COVERS THE GAP HORIZON

`blockedBy` returns false for two cars at different intersections, which
looks like a hole: a driver waiting at intersection 1 must yield to
traffic coming from intersection 0, and that traffic is filed at 0 until
it crosses.

It is not a hole, and the reason is the approach length. A car AT the
boundary is already a full approach from the next box, and the approach
is sized to hold the longest gap anybody could need -- so anything still
filed at the previous intersection is further away than any driver would
wait for. Traffic beyond the approach cannot change a gap decision.

**This is a load-bearing coincidence and it is checked rather than
assumed.** `verify-course` re-derives the horizon from `gapNeeded` and
the intersection geometry, without consulting `reachFor`, and compares.
If a future course ever shortens an approach below what the drivers on it
would wait for, that check goes red and filing by intersection has to be
revisited.

### 5.15.4 A CHECK THAT PASSES WITH THE MECHANISM REMOVED IS DECORATION

The first version of the cross-boundary following check ran ordinary
traffic and measured the closest any two cars came near the seam. It
passed. It also passed **with the cross-boundary rule deleted entirely**
-- the worst gap moved from 10.04m to 8.46m and nothing collided --
because the seam sits in the middle of a 558m block where nothing queues,
so the rule was never the binding constraint and its absence changed
nothing measurable.

CLAUDE.md's own instruction is the one that caught it: when a check
passes on something you suspect, ask what it does NOT look at, and try to
make it fail on purpose. Sabotaging the rule and re-running took two
minutes and turned a green check into a known-worthless one.

What replaced it is DIRECTED rather than statistical. Two cars are placed
by hand straddling the boundary at a distance a driver must react to, and
the questions are asked outright: does the one behind see the one in
front at all, is the gap it reads the real one measured off the two
poses, and does it brake. Under sabotage that now fails in eight places.

**The general form: a property-based check is the right instrument for
"is this ever violated" and the wrong one for "does this specific
mechanism work".** The second needs the situation built, because waiting
for traffic to produce it means the check's strength is a matter of luck.

### 5.15.5 THE RULE IS LOAD-BEARING EXACTLY WHERE THE BLOCK IS SHORT

Measured, four demands, how often the cross-boundary rule finds a leader
and how often that leader is the thing actually holding somebody back:

| place | fires | binds |
|---|---|---|
| two-way, a car every 2.0s | 2.23% of car-ticks | **0** |
| two-way, every 0.9s | 0.39% | **0** |
| two-way, every 0.45s | 0.23% | **0** |
| all-way, every 0.9s | 1.75% | **195** |

At a two-way stop it never binds at any density tried, because the
approach is 279m and the block is 558m: a queue never reaches the seam.
At an all-way stop the approach is 100m and the block is 200m, and the
queues from the stop lines do reach across it.

So the rule is necessary and, on a two-way course, currently inert -- and
saying so is the point. A mechanism kept because it is correct is fine; a
mechanism believed to be doing work it is not doing is how a model drifts
away from what anybody thinks it is.

### 5.15.6 KEEP RIGHT IS THE CHEAPEST WIDE NET A COURSE HAS

Lane discipline over a whole course is the first thing a placement
mistake breaks: an intersection put down at the wrong offset, or a leg
joined to the wrong side, shows up as cars on the wrong side of a centre
line long before it shows up as a collision. 201,529 readings across
three intersections, none wrong.

**Measured from the intersection the leg belongs to, never from the
origin**, and that trap is worth naming because it cost a false alarm of
47,443: a southbound lane at the intersection 558m along sits at
x = 558 - 1.8, and comparing it against -1.8 reports the entire course as
driving on the wrong side. A check whose failure mode is "everything is
broken" is almost always the check being broken.

### 5.15.7 A ROW CANNOT HOLD A ROUTE

The course started as a row on purpose: a grid would have added a
placement problem to be got wrong at the same time as the handoff. It
had to become a grid the moment a ROUTE was wanted, and the reason is
worth stating because it is about what a course IS rather than about
convenience.

**On a row, every turn leaves the world.** The only drive expressible is
a straight line -- which is a corridor rather than a course, and no
instruction given on it could ever be wrong. A course you cannot be
given directions through cannot test the direction-giving, which is one
of the examiner's four jobs.

The grid cost almost nothing, and that is the placement rule earning its
keep a second time: **the same rule works in both axes**, because `OUT.S`
points at +y and `OUT.N` at -y, so two intersections a `reach + reach`
apart meet north-south exactly as they do east-west. Measured over a 3x2:
14 seams, none of them out.

One thing it did need. **Naming a link's two directions by which
intersection has the lower index gives the two axes the same lane
names**, because the western neighbour and the northern one both have the
lower index -- so cars on one road would have followed cars on the other.
A lane is named by which END of its own link it leaves from instead.

**A route is derived from the geometry, never declared.** An intent is
only offered at an intersection if the leg it would leave by has
something on the end of it, so a plan cannot ask a candidate to turn into
nothing: 2,400 planned instructions across 40 seeds from every edge, all
of them leading somewhere.

### 5.15.8 SILENCE MEANS STRAIGHT ON, AND IT FALLS OUT RATHER THAN BEING
ENFORCED

A plan is indexed by how many intersections a driver has negotiated, and
a plan that has run out returns `straight` because that is what the
absence of an instruction means (CLAUDE.md, Directions). Nothing checks
for the end of the list; there is no branch for it.

That matters more than it looks. **It is the rule that makes a LATE
instruction a missed turn rather than a pause**, which is the interlock
the whole directions mechanic rests on: being busy marking a fault makes
you late with a direction, and the candidate then drives straight past
the turn you meant. If silence meant "wait", lateness would cost nothing
and the four systems could not make each other fail.

Checked rather than assumed, because a rule that falls out is exactly the
kind that can quietly stop falling out: a candidate has to be observed
OUTDRIVING their plan and carrying on ahead.

**Indexed by count, not by which intersection.** A row course would make
the two agree and they would stop agreeing the moment it is not a row --
a route that doubles back visits the same intersection twice and wants
different instructions each time. The version that keeps working is the
one that counts.

### 5.15.9 A SINGLE-SEED CHECK WAS MEASURING THE DRAW AND REPORTING IT AS
THE DRIVER

`verify-telling` compared six candidates on ONE ten-minute drive, which
is about fourteen crossings. Which manoeuvres a candidate happens to draw
across fourteen swings the result more than the driver does, and stage
3's route planner changed the draw: a hesitant driver went from waiting
7.1x a sound one to waiting 1.17x, with nothing about either driver
touched. Over eight seeds the same code gives 2.3x.

**IT HAD BEEN GREEN, WHICH IS WORSE THAN HAVING BEEN RED.** A check that
happens to pass on the seed it was written against is indistinguishable
from one that works, right up until something unrelated moves and it
reports a regression that is not there -- or, far worse, stays green
through one that is.

The lesson is not "use more seeds". It is that **a check with a threshold
has an implied sample size, and it is never stated.** "A hesitant driver
waits 1.5x longer" needs enough crossings for the ratio to be about the
driver; nothing in the check said how many that was, and the number that
happened to be there was chosen for runtime.

### 5.15.10 AND THE BRAKING AXIS NEEDED A DIFFERENT INSTRUMENT AGAIN

The same run showed heavy-footed drivers braking MORE GENTLY than sound
ones -- 0.91 against 0.98 -- which is backwards.

It was the instrument, not the model. The braking axis sets how hard a
driver PLANS on braking; a bigger figure means a smaller desired gap, so
they close in further before doing anything about it. **The behaviour is
"leaves it late", and the peak deceleration is a consequence of that
tangled up with whatever else happened to be on the road.**

Measured directly, over eight seeds, approaching a stop line:

| driver | 40m out | 20m out | starts easing off | peak |
|---|---|---|---|---|
| sound | 45.7 km/h | 35.2 km/h | 86m out | 1.11 m/s2 |
| heavy-footed | 48.8 km/h | 33.3 km/h | **77m out** | 1.29 m/s2 |

Faster far out, later off the accelerator, harder on the brake, slower
close in. The signature is unmistakable once measured at the right point,
and invisible in the statistic that had been used.

**This is the third instrument tried for one axis** -- worst-ever, then
median-per-trip, now where-they-start. That is not indecision: each
change came from a measurement showing the previous one was reading
something else. Worst-ever measured the situation (a sound driver's worst
stop was `ABRUPT_AT` exactly). Median-per-trip measured the draw. Where
they start easing off measures the decision, which is the thing the axis
sets.

It is confounded with SPEED across profiles -- a bold driver arrives
faster and needs more room, so they start sooner -- and that is fine
because each profile is only ever compared with sound on its own
observable, and heavy differs from sound on the braking axis alone. Said
out loud rather than left for somebody to trip over.

### 5.15.11 EVERY TURNING CAR DROVE TWO METRES BACKWARDS

Found while asking a different question -- what speed a car takes a turn
at -- by measuring the curvature of a turn path and getting a radius of
0.3m, which is impossible. It was not curvature. It was a KINK.

`pathFor` built a turn as `[entry, ...turnPoints(stop, corner, leave,
radius), exit]`. The arc is tangent to both centrelines at `radius` from
the corner, and **the stop line is set back further than the box edge is**
-- 5.65m against 3.60m -- so the arc's outbound tangent point lands 5.65m
from the centre, PAST `leave`. Appending `leave` after the arc sent the
path back toward the intersection for 2.05m and then forward again:
177.8 degrees of turn at one vertex, -180 at the next.

So every left and every right in the simulation ran forwards, backwards,
and forwards again through the middle of the box.

**`leave` is simply the wrong point to aim at.** The arc already reaches
the outbound lane. It is aimed at the exit now, and `leave` is left to
the straight case, where it really does sit between the line and the way
out. The old engine had this right -- `turnMovement` passes `exit` -- so
this was a faithful-looking reimplementation that dropped something,
which is 10's pattern wearing a new costume.

**THE CHECK THAT EXISTED TO CATCH A MALFORMED PATH MEASURED THE WRONG
THING.** `verify-crossing` section 3 asked whether a path JUMPS: half a
metre along being at most half a metre of travel. Two metres backwards is
two metres of travel, so it passed, every run, for as long as the bug
existed. It was measuring DISTANCE where it needed DIRECTION.

It now also asks whether any vertex turns by more than 100 degrees, and
that check was verified by putting the bug back: 16 reversals, worst 180.

### 5.15.12 A RIGHT TURN HERE IS TIGHTER THAN A CAR CAN STEER, AND THE
OLD ENGINE'S ANSWER IS NOT AVAILABLE

Measured, once the kink was gone and curvature could be read honestly
over a window wide enough to span several vertices:

| turn | radius | speed at 2 m/s2 lateral | at 3 | at 4 |
|---|---|---|---|---|
| left | 6.4m | 13 km/h | 16 | 18 |
| right | 3.6m | 10 km/h | 12 | 14 |

**`TURN_R_MIN` is 5.5m -- a passenger car at full lock -- so a 3.85m
tangent arc is not a tight turn, it is one no car can follow.** The
geometry leaves no room for a better one: from a stop line 5.65m out to
an exit lane 1.8m off centre is a 90 degree turn over that displacement,
and the tangent radius is what it is.

**The old engine floors the radius** (`Math.max(TURN_R_MIN, toCorner +
bias)`) and the sim does not. That is not an oversight to correct,
because `turnPoints` always starts its arc AT the stop line and sweeps
the turn angle at whatever radius it is given -- so a floored radius
finishes (r - toCorner) metres wide of the outbound lane. For a right
turn that is 1.65m, which on a road with 3.6m of half-width puts the car
essentially on the centre line.

So both available answers are wrong in different directions:

- no floor: an arc a car cannot physically follow
- a floor: a car that finishes on the wrong part of the road

**This is a domain question and it is the maintainer's.** What does a
driver actually do turning right from a stop line at a tight urban
intersection? Real answers exist -- creep into the box first so the turn
starts from further forward, or swing wide and use more of the receiving
road -- and both are behaviours rather than geometry fudges. Reported
rather than picked.

Note the interaction with 5.8: `wideTurn` works by INCREASING the radius,
so a floored radius is the wide-turn mechanism firing on every right turn
whether the driver is bad at steering or not.

### 5.15.13 NOTHING IN THE SIM KNOWS A CORNER IS COMING

`decide` is the Intelligent Driver Model and its free term is
`1 - (v/v0)^4`, where `v0` is the speed this driver wants on this road.
There is no term for the road bending. So a car takes a turn at whatever
speed it happens to arrive at.

At an ALL-WAY stop this is invisible, and the reason it is invisible is
worth stating because it looks like the feature working: everybody stops
first, so they cross at 20-24 km/h, which is close to the old engine's
stated 22-26. That is acceleration from rest over a short box, not a turn
speed. It is a coincidence and it would stop being true the moment the
box got bigger.

At a TWO-WAY stop the through road does not stop, and the numbers are
what the absence really looks like:

| manoeuvre | median | p90 | fastest |
|---|---|---|---|
| straight | 55 km/h | 65 | 80 |
| left | 40 km/h | 64 | 78 |
| right | 42 km/h | 62 | 78 |

**A left turn at 78 km/h through a 6.4m radius is about 7g.** It is not a
subtle defect; it is only hidden because the screens that get watched are
mostly stop-controlled.

The maintainer's ruling (5.13.6) is that turn speeds carry over from the
old engine -- 26 km/h through a left, 22 through a right. Those figures
are not derivable from lateral acceleration at these radii: they imply
8.1 and 10.4 m/s2, which is 0.8 to 1.0g and is the limit of tyre grip
rather than anything a passenger would sit through. Either the figures
are stated rather than derived, or the radii are wrong -- and 5.15.12
says the radii have their own problem, so the two questions are one
question.

What it costs to build, once that is settled: **a wanted speed that
varies along the path**, read a little way ahead so a driver slows BEFORE
the corner rather than in it. The curvature is already available from the
path -- it is the turn rate per metre, which is how the radii above were
measured -- so nothing has to be told what shape a turn is. It is the
same shape of change as `stoppingRoom`: a quantity the model already has,
given a name and read at the right moment.

**NOT BUILT, because it depends on a domain answer**, and because
building a turn-speed model on top of a radius nobody has confirmed would
be deriving a behaviour from a geometry that is known to be wrong.

### 5.15.14 THE CHASE CAMERA DOES NOT MAKE THE STEERING AXIS LEGIBLE, AND
SAYING IT WOULD WAS WRONG

`chaseOn` came across from the old engine unchanged -- it was already
split out of `chaseFor` so it could be pointed at a pose in world
coordinates rather than at one scenario's ego, which is exactly the case
a course needs. It rides the INTENDED pose (`poseOn`, the path without
the weave) while the car is drawn at its real one (`poseOf`), so the
deviation is a real quantity rather than a wobbling camera.

**The claim that this makes lane-keeping visible is false, and it was
made here before it was measured.** On a 375px phone panel a 0.38m stray
is worth:

| view | width | 0.38m reads as |
|---|---|---|
| chase, 10s look-ahead | 208m | **0.68px** |
| chase, 4s | 83m | 1.71px |
| fixed | 52m | 2.74px |

The chase view is the LEAST legible of the three for this, because it is
the widest -- and being wide is what it is FOR, on the maintainer's own
finding that a wide view of more traffic plays better than a close-up.
The two wants are in direct conflict and no single width serves both.

So the deviation is reported as a NUMBER beside the readout. Measured
live: a sound candidate reads 0.04m off line and a ragged one 0.20m.
Magnifying it on screen would be a lie about how far off line the car
actually is, which is the same rule as never authoring the answer,
pointed at the renderer.

**What the chase view is genuinely for, and both are real:**

1. **It turns with the car**, so the candidate's straight-ahead is always
   one screen direction. That is what a gaze cone held in degrees off the
   car's heading needs, and it is why relative gaze was the right call in
   the old engine. Nothing else can provide it.
2. **It is a duration of road, not a distance**, so a faster road shows
   further ahead. *"The traffic looks great at 100kmh"* is the maintainer
   on exactly that, and it settles the old 10s-versus-4s tension toward
   the longer one.

The open question this leaves is real and is now sharper: **reading
lane-keeping by eye wants a closer view than reading the road ahead
does.** The old engine recorded that tension and guessed the answer was
"probably not one fixed number". It still is not, and the two candidates
for resolving it are a second, closer view rather than a different single
one -- which the strip above the drive already is, in a different form --
or accepting that lane-keeping is read from the readout rather than from
the road.

### 5.15.15 THE SHEET GRADES WHAT THE SIM CAN DERIVE, AND SAYS WHAT IT
CANNOT

`detect.js` came across unchanged and is fed what the simulation already
holds. Three faults, each a threshold on a physical quantity the model
has for its own reasons: undue delay (the maintainer's 4-5s, judged
against the competent opening), a rolling stop (crossed a line on a leg
with a stop sign without ever coming to rest), and abrupt braking (harder
than twice the comfortable rate, which is where the old engine says a
stop stops being controlled).

**LANE-KEEPING IS NOT ON IT, AND THE REASON IS A COINCIDENCE OF TWO
DERIVED NUMBERS.** The weave is bounded at half the room between a car
and the next lane -- 0.45m, because the driver over there has the same
claim on the other half (5.14.4). The old engine's threshold for "more
than a driver could fail to notice" is `POS_VISIBLE`, and it is 0.45m.
The most a driver here can stray is exactly the line at which a fault
becomes visible, so a ragged driver at 0.38m is under it. Lowering the
threshold to make a fault appear would be authoring one; raising the
weave would put cars into each other. The axis becomes markable on a
bend, where a wide line is a real distance from where the car should be
-- which is the case 8.2 in REBUILD.md makes for the curve.

**ABRUPT BRAKING FIRES ON CONFIDENCE, NOT ON THE BRAKING AXIS.** A
heavy-footed driver plans on 5.0 m/s2 and does not cross the 5.4 line; a
bold one arrives hot at a stop line and does. So the fault as a threshold
discriminates the wrong axis -- the same entanglement CLAUDE.md records,
that an examiner watching a stop cannot tell braking from knowledge by
position alone. The braking axis's honest observable is "leaves it late"
(5.15.10), and turning that into a derived fault needs the stage 4
controlled comparison against a sound twin. Kept on the sheet because an
abrupt stop IS a fault by the maintainer's ruling whoever caused it;
reported so nobody reads it as the braking axis showing.

### 5.15.16 A DIRECTION NEVER GIVEN FOR A STRAIGHT LEG IS NOBODY'S FAULT

`sectionSheet` charged the examiner for every direction never given.
Its own comment says why: "silence means straight on, so a direction
never given is a missed TURN". When the course wanted straight, silence
produced exactly the right drive, and charging it would be charging the
examiner for not saying a thing the rule says need not be said.

The old routes always turned -- the planner steers WHICH turn, never
whether to turn -- so the branch had never run. The rebuild's set courses
go straight sometimes, and the first one to be graded was charged five
directions for four turns. Fixed in `detect.js` with one expression:
blame only where what was followed differs from what was wanted. The old
check counted every leg and passed only because its composed section had
never included a straight one; it counts turns now.

**A rule that falls out somewhere is a rule that can quietly stop
falling out somewhere else.** Silence-means-straight-on was correct in
`intentFor` and wrong in the sheet, and the two only met when a course
existed that exercised both.

### 5.15.17 THE BEND: A BOW THAT RETURNS TO ITS HEADING, AS TIGHT AS THE
ROAD ALLOWS, AND THE SCREEN DRAWS IT FROM THE PATH

**Built renderer-first, on section 0's rule.** Both sim screens now draw
the carriageway as a stroke along `roadsOf` -- the same axis the lanes
are offset from -- instead of rectangles that agreed with the geometry
only while it was straight. Checked at full stray (verify-course 10):
every point a car can reach on a leg is 0.45m inside the drawn edge.

**The cheap kind of curve, deliberately.** REBUILD.md 8.2 separated two
things the old ruling had refused together: a bend in the road between
two compass-aligned intersections, and a road that ARRIVES on a
different bearing. The second makes `SIDES`, `OPPOSITE` and `rightOf`
relative bearings and is still expensive. The first is a leg that bows
sideways and comes back parallel, with zero offset and flat through the
stop line and the full offset and flat at the far end, so the box, the
turn arcs and the seam are all exactly where they were. Measured with
every link bent: 14 seams, 0.0m apart, 0.0 degrees out.

**The shape is the smoothest step, and the choice is about what it gives
free rather than how it looks.** Zero curvature at both ends: a queue
sits on straight road at the line, and the road is straight through the
seam, which is where the cross-boundary following projection has to be
accurate. The samples touching the line and the seam are EXACTLY
straight, not merely flat, because a chord across any part of a smooth
bow has a slope and a seam that turned by 0.08 degrees would have been a
seam that turned. Both lanes are offset from the bent axis along its
local normal, not sideways -- displacing both by the same sideways vector
narrows the road by cos(slope), a third of a metre at the slopes a real
bend has.

**ONE CONSTANT, FROM ROAD DESIGN, AND IT IS FLAGGED.** The radius is
derived from the road's speed and the side-friction factor a flat street
is designed to, 0.15 g (`LATERAL` in course.js). It is the one number in
the increment that is data rather than derivation. At 60 km/h it gives
189m; the amplitude that produces exactly that over the leg is solved
for (58.6m over a 262m leg). It is not tuned to anything: at the limit a
driver at the road's speed feels 1.47 m/s^2 and the boldest in the model
2.68, both comfortable, which is what "challenges steering ability a
little" should mean. If the maintainer wants tighter, it is that
constant that moves, and the wide line moves with it.

**`alongDir` measured where following uses it.** Across a seam, every
cross-boundary gap up to 60m reads short by at most 0.26m, and only ever
short; 3.4m at 120m, 9m at 200m, where nobody is following anybody. One
line, unchanged. The earlier table in REBUILD.md 8.2 was of a bow whose
script was not kept and cannot be reproduced -- CLAUDE.md item 8's
example -- and `tools/measure/bend.mjs` is kept so this one can be.

### 5.15.18 THE WIDE LINE: ONE DEFICIT, TWO EXPRESSIONS, AND THE STEERING
AXIS ON THE SHEET AT LAST

**Lane-keeping was excluded from the sheet by a coincidence of two
derived numbers (5.15.15):** the weave is bounded at half the room
between a car and the next lane, 0.45m, and the old engine's visibility
floor is 0.45m. A bend resolves it without touching either number. The
same steering deficit that weaves on a straight runs wide on a bend --
steers less than the curve asks and drifts toward its outside -- and the
wide line takes the driver's OTHER half of the room, so at the worst of
the axis on the tightest bend the road allows, the car's side reaches
the centre line and no further. Measured: ragged 0.382m on a straight,
0.765m on a bend; sound 0.045m and 0.090m. Nobody touches by
construction, and 400s of bent-course traffic with a ragged candidate
aboard produced zero overlaps.

**The floor is imported, not restated.** `marking.js` reads
`POS_VISIBLE` from `faults.js`, and verify-course checks that no second
0.45 appears in the file -- the two-implementations bug, and the way a
floor gets quietly lowered to make a fault appear.

**Right-hand bends only, by the maintainer's own ruling.** The outside of
a right-hand bend is the oncoming lane; the outside of a left-hand bend
is the curb, and 5.8 holds that off-road is real but rare and not this
model's -- `wideTurn` declines a road with no next lane, and the wide
line declines a bend whose outside is not one. Every bow is an S, so
each driver meets one of each per half-link and no bent link is silent.
The turn arcs are NOT read as bends (`bendSeenBy` reads the bow, not the
polyline): a right turn's radius is 5.15.12's open question, and a wide
line derived on a geometry known to be wrong would be a fault authored
on a mistake.

**One showing per bend.** The old engine derives one fault per trait per
scenario, from the first over-floor sample to the last; here the unit is
the bend, because it is where the wide line exists at all and it ends
before the seam. Without it the sinusoid crossing the floor produced
twenty half-second faults in 300s -- the weave showing, not the fault.
With it: ten right-hand bends met, ten showings, 4.2s each. A prompt
examiner catches all of them on the sheet.

**Derived, and the control is the profile table itself.** Ragged and
sound differ on exactly one rating, so sound on the same seed and the
same bends IS the stripped twin: zero showings. The check asserts the
profiles still differ on steering alone, so a future profile edit cannot
quietly turn the comparison into an uncontrolled one.

**Found on the way past.** Measuring whether the drawn road contains
every path found that on the corners a right turn's 3.85m radius passes
0.95m outside the curb corner, so a car weaving to the right clips it by
8cm. Not the bend's doing -- it was true before the road bent -- and it
is 5.15.12 again. The check measures the legs and reports the corners
separately, so the known problem is neither hidden nor mistaken for a
new one.

## 5.16 STAGE 4: THE RATINGS AS LIVE INPUTS

### 5.16.1 A LOADED DRIVER IS A WORSE DRIVER, LIVE, AND BOUNDED

The maintainer's ruling from the old drive, and the half of
`directions.js` that came across last: stacking instructions is a trade,
and its cost lands on the candidate's concentration. Stage 3 brought the
sheet's side across (`attribute`: late, stacked, never-given) and not
the driver's, so "stacked" was a verdict with no consequence -- the same
shape as the old drive's stacking meter, which shipped inert because
`held` was zero by construction.

**What is held is counted from the plan the driver reads.** Everything
beyond the instruction being executed: the next intersection's is
discharged at the handoff into it and is never carried, so an examiner
who only ever calls the next intersection loads nobody, which is the
common correct play and has to be free. Told three ahead, a candidate
carries two.

**The curve is imported, not restated.** `pressureOf`,
`skillUnderPressure` and `severityOf` are the old engine's, and the
verify checks the sim's composure IS `skillUnderPressure(1,
pressureOf(held))`. Two curves would drift the first time either was
tuned.

**Applied to the deficit, so the bounds survive.** The old engine
multiplied the size of a fault by the severity; here the same multiplier
scales how far each axis sits from its optimum -- the weave, the planned
braking, caution's distance from competent -- and every one is then
clamped by what clamped it unloaded. The weave cannot exceed the room
between lanes (5.14.4), braking cannot plan past `HARSH_AT` (the model's
own abrupt line), caution cannot leave [0, 2]. A driver with no deficit
is unmoved: composure decides how badly a habit shows, never which habits
a driver has, which is the old engine's property verbatim. The sound
PROFILE moves a little, because it is rated 0.9 rather than 1.0; the
verify says so rather than claiming it does not.

**Live rather than frozen, and one artifact stated.** The old drive
froze load at the start of a leg because reading it live would have
re-simulated the intersection under the candidate. A stepped world reads
the loaded disposition every tick from what is held right now, so the
cost lands on the driving done while holding it and lifts when the
instruction is discharged. The weave's amplitude therefore changes in
the tick an instruction is given, which steps the car sideways by the
change times the phase -- bounded at the severity's share of the room,
18cm, measured at 2.6cm. Stated and checked rather than smoothed with a
time constant nobody could derive.

**Measured, and modest.** Same seed, same route, the ragged driver:
0.765m and 60.2s off the line told one ahead, 0.900m and 62.8s told
three ahead. Modest because bounded -- a driver at 85% of the room has
15% to lose -- and honest for the same reason: the alternative was a
load that could put cars into each other.

**Idempotent by construction.** A loaded view carries `held`, and
loading a view returns it unchanged, so a view that passes through
`whatStops`, `poseOf` and `strayOf` in one tick is loaded once. The
first version compounded the load on every hand it passed through,
found by asking.

### 5.16.2 PERCEPTION IS A LAG, IT IS MEASURED, AND IT IS OFF UNTIL
CONTACT HAS A RESPONSE

**Layer 2 as an input rather than a query.** The old engine's awareness
was asked after the fact: a registration delay per road user, and a
departure decided on the set the candidate had taken in. In a stepped
world the same idea is the actor's actual perception: `seenBy` returns
the committed state from the driver's lag ago, and `whatStops` decides
from that. The lag is `registrationDelay` shape for shape (`lagFor`):
the reaction floor everybody has, plus REGISTER_SPAN times the
observation deficit, with the same jitter -- the constants imported
through the road so stage 0's traffic.js stays free of awareness.js and
the old engine it drags in.

**What is not perceived late is the opening the competent standard
judges undue delay against.** Whether the road was open is a fact about
the road; whether the driver saw it is the axis. `openTo` reads the
present.

**Measured before switching on, and the measurement is why it is off.**
Everybody lagged: traffic touches, one pair in fifteen minutes, harsh
braking tripled. The candidate alone: nobody touched on the course in
forty-five minutes at any rating; on the crossing the bold candidate
rear-ends the car ahead, 47 car-ticks in eight hours -- a 0.39s chosen
headway against a 0.55s lag. That is the dangerous candidate (4.4,
bold and blind) arriving exactly as the design said it would, and it is
a contact nothing draws and nothing responds to. The line sits where
5.12 puts it: it switches on when contact ends a drive. The mechanism is
verified meanwhile against a world that asks for it, so the default
world keeps no past and moves by nothing.

**What the axis does and does not read through.** At the box, the gap:
the poorest observer takes gaps a lag tighter than they look, every one,
never by more. On the road, nothing: the braking distribution is the
same at every observation rating, because leaders brake gently and
following gaps are comfortable. The first version of the check asserted
harder braking off one seed's single event and failed on the next two;
the section states the non-result rather than picking the seed.

**And it is density-limited like confidence (stage 4's first
increment).** A gap misjudged by a second only matters where gaps are
close to the margin, and at the course's spawn rate none are. The axis
is built; its supply is content.

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
measured 1.03 per intersection that puts a section at 2.9–3.9 intersections.

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

### 8.4 NOT EVERY INTERSECTION IS A TEST, and that is a mechanic

Maintainer's ruling, after playing: *"I want to feel like you're driving
through a section of a larger city, including main roads and side
streets, and some intersections will just be driven straight through with
no real requirements from the NPC driver."*

**Why it matters more than it sounds.** If every intersection produces
something, the player learns that intersection means fault, and attention
stops being a decision — they simply look at whichever intersection is next.
**UNCERTAINTY IS WHAT MAKES WATCHING NECESSARY.** A player who cannot
predict which intersections matter has to watch all of them, which is more
attention pressure rather than less. An empty intersection is not filler; it
is what makes the core mechanic work.

**It comes from ROAD HIERARCHY, not from an "empty intersection" feature.** A
through road crossing side streets produces intersections that demand nothing
because that is what a through road IS. If priority is modelled honestly
the property falls out for free, and anything that adds a separate
emptiness knob has misunderstood it.

**The bug it corrected: the candidate was the only road user who ignored
the road.** `compose.js` derived every actor's `stops` from the control on
their own leg and then hardcoded the ego's to `true` — "the ego always
holds; what varies is whether anyone else has to". Measured: 240 of 240
intersections required a stop, while the candidate's own leg was UNCONTROLLED
on 87 of them.

Measured after, and the hierarchy reads:

| | driven straight through |
|---|---|
| arterial | 33% |
| collector | 28% |
| residential | 14% |
| overall | **24%**, of which 12% demand nothing at all |

**Reconciled with the pacing budget, which was the real risk.** The two
requirements are in genuine tension — the budget guarantees supply, empty
intersections withhold it — and the budget wins only where it must. It works
across a WINDOW rather than at every intersection: `briefFor` sets
`mustFault` only when projected dead air passes `DEAD_AIR_CEILING`, and
otherwise hands back the road character's plain brief. So empty intersections
are permitted by construction and forced content stays rare.

Measured cost, and it is mild: dead air is UNCHANGED (worst 22.2s, median
18.8s, 0 of 24 drives over target), and density falls 1.03 → 0.89 faults
per intersection, which lengthens the implied section from 2.9–3.9 to 3.4–4.5
intersections. Both still inside their bands.

**If allowing empty intersections ever does break the dead-air target, report
it rather than suppressing them.** The tension is real and which side
gives is the maintainer's call, not a constant to quietly retune.

`verify-world.mjs` §8b pins both halves: that a meaningful share of
intersections demand nothing, and that a main road is driven through more
often than a side street — otherwise the three characters are three names
for one road.

### 8.5 Longer waits are answered with something to read

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

Measured, identical seeds and candidates over 240 intersections:

| accept test | faults/intersection | encroachments/drive | drives carrying one | contacts |
|---|---|---|---|---|
| `windowIsSafe` | 1.16 | 0.47 | 16/40 | 0 |
| no gate at all | 1.23 | 0.88 | 26/40 | **8** |
| `windowIsMarkable` | 1.20 | **0.70** | **22/40** | 0 |

The gate had been suppressing half the supply. Faults per intersection barely
move, so this converts comfortable intersections into markable ones rather
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

### 10.0 THE FIRST SIGNAL IS THAT THE NUMBERS LOOK TOO CLEAN

Before the pattern, the tell. **A measurement that comes out at exactly
zero, exactly saturated, or suspiciously round is evidence about the
MEASUREMENT, not about the thing measured.** Reality is untidy. A clean
number means something upstream is not varying when it should be.

It is the cheapest instrument in this project and it has found almost
every entry in the list below:

| what was seen | what it actually was |
|---|---|
| belief error of **exactly 0.00 m** for four traits | predicting from `basePose`, which already contained the fault |
| `wideTurn` took **0 showings from 5 chances** | two traits writing one field, one silently overwriting the other |
| `MAX_CLAIM` pegged for **18 of 21** road users | a fixed traversal time, so everything saturated the speed claim |
| peak braking **18.1 m/s² on every approach, every road** | a smoothstep lerp standing in for deceleration |
| `held` **always zero** | the buttons wrote the intersection being driven, not the ones ahead |
| a measurement **identical at every value** of `departAt` | `schedule()` overwrites it; `startDelay` is the knob |
| **240 of 240** intersections requiring a stop | the ego hardcoded `stops: true` while 87 legs were uncontrolled |
| **0 contacts**, `clearAt` at exactly 0.00 or exactly 3.60, a window whose median was exactly the requirement | half the hazard scenes built at right angles to their own road (§10.6) |

The last row is the one to learn from, because there were **three clean
numbers at once** and the increment carried on regardless for two turns.
Three is not a coincidence; it is a shared cause.

**What to do with it:** do not explain a clean number, reproduce it. Change
one input that ought to move it and check that it does. If it will not
move, the quantity you are reading is not the quantity you think.


Instances of the pattern itself, all real:

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
  derived, and did not follow an intersection placed elsewhere in the world.
- **A fixed traversal time standing in for real motion.** It made a wider
  road move traffic FASTER — the six-lane arterial was crossed at 89 km/h
  — and pegged `MAX_CLAIM` for 18 of 21 road users, disabling the
  speed-proportional claim rule entirely.
- **A smoothstep lerp standing in for braking.** Every car in the game
  decelerated at 18.1 m/s² (1.84g) and nobody could notice, because
  nothing in the model was a physical quantity.
- **`shownFor` keyed without the intersection.** Every leg's clock starts near
  zero, so `scoreDetection` credited a mark against a fault from a
  intersection the player never saw. A player who marked EVERY fault scored
  zero.
- **Calibrating observation against the collision rate** — a proxy for
  "did they gather the information", and the wrong one (§4.3).
- **A hazard scene's PLACEMENT carried and its ORIENTATION did not.** The
  biggest instance so far. `hazardAt` and `emergingAt` built a little
  scenario in a fixed north-south frame and `placeScenario` dropped it at
  a point on the link — so on a link running any other way the notional
  candidate drove ACROSS the road they were on. Measured: 29 of 70 hazard
  scenes pointed the right way, 35 were at right angles and 6 were
  backwards. Everything derived from those scenes inherited it. See §10.6.
- **`at` doing two jobs on an emerging car.** `p.at` is where the SCENE
  stands in the world; `emergeMovement` also read it as where the CAR
  stands in the scene. `placeScenario` stamps `at` onto every participant,
  so placing a scene teleported the parked car onto the scene's own
  centre. Now `rest`/`into`/`onward` are offsets and `at` is the placement.
- **The road's speed against the engine's cruise, in a hazard scene.** The
  emergence was timed from `speed / approachDecel(speed)` at the tile's
  30 km/h while the notional candidate drove the engine's 45 — so the
  stopping distance the scene was built around and the speed it was driven
  at were two different numbers. Exactly the bug `driveThroughTiles`
  already had and fixed by reading `tiles[i].speed`.
- **A driveway placed at a parking space.** The car that reverses out was
  put where a parked car already was, and that same car was then handed
  back as one of its own sight blockers — which is what kept it invisible
  until it moved. A driveway is the BREAK in the row, not a thing beside
  it.
- **The emerging car's path stopping at the merge point.** A car that
  pulled out in front of the candidate ceased to exist a few car lengths
  later, so not one of 73 emergences ever made contact. Somebody pulling
  out in front of you is a hazard precisely because you are then behind
  them.
- **`OPPOSITE_SIDE` in `tiles.js` AND in `world.js`, against `OPPOSITE` in
  `road.js`** — three literal copies of a four-entry table, each with its
  own comment explaining that it mirrors one of the others. Harmless so
  far, and exactly how the harmful ones start. Both copies removed.

The tell is usually a measurement that comes out at exactly zero, or
exactly saturated, or suspiciously clean.

### 10.1 THE SECOND PATTERN: the check was looking at the wrong half

Distinct from the above, and it has paid out three times in two days.
Every one of these shipped with a full green suite, because a check that
inspects the wrong half of a thing passes confidently and forever.

- **`verify-turns` measured only the APPROACH.** `if (along <= hy)
  continue` skips the intersection box and everything past it, so the EXIT
  side of a turn had never been looked at once. `wideTurn` put a car
  2.70m past the curb and nothing noticed until somebody played it.
- **`verify-screens` rendered the mode COMPONENTS and never `App`** — the
  shell every route actually goes through. A dangling reference in the
  home screen served a blank page to every route while the check that
  exists to catch blank pages stayed green.
- **`verify-screens` rendered ONE FRAME at t=0.** A component in a branch
  that only runs under a runtime condition is invisible to it. `<Belief>`
  renders only when an actor is occluded while still believed in — which
  is what two cars touching produces — so the lab went black on contact
  with every check passing.

### The same thing again: correct in the engine, shown by nothing

A FOURTH instance, and by now it is the pattern rather than a coincidence
— every one of these was built, verified by a green check, and drawn by
no screen at all:

- **The screens never rendered.** Twenty increments verified headlessly
  against a component that threw on mount.
- **`<Belief>` was never defined.** The lab went black on contact.
- **`world.js` was never imported by the drive.** The continuous world
  existed and the playable screen drew six scenes at one address.
- **The roadside was never drawn.** 59 props, 10 people and 6 hazards per
  drive, all produced by `tiles.js`, all checked in `verify-world`, and
  none of them on screen — 27 seconds of bare tarmac per drive.

- **The emerging car carried no sight blockers.** Its entire value was
  that the driver's view is obstructed and the candidate cannot see them
  until they move -- and there was no occlusion at all, so it was in plain
  sight from the first frame and could only ever produce a confidence
  fault. Correct in every measurable respect, missing the one property
  that made it content.

**A check that an engine function returns the right thing says nothing
about whether anything shows it.** `verify-world` was measuring
`curbsideFor`'s output the whole time. The output was right. The renderer
had never called it.

So when adding engine content, the question is not "is it correct" but
**"what draws it, and what happens if nothing does"** — because nothing
in this suite will tell you, and the answer has been "nothing draws it"
four times running.

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
`placeIntersections` and `linkBetween` were built, verified and unused, while
the screen composed one intersection at a time and drew every one of them at
the board centre. Wiring it up surfaced two engine bugs that could not
show while everything sat at 360,360:

- **`exitPoint` was half origin-aware.** Lateral coordinate from the
  intersection, along coordinate from the board edge -- so an intersection placed
  at y = -5329 sent its candidate 240 METRES SOUTH to an exit computed at
  the middle of the board. Now measured from the intersection, and provably
  identical at the default origin, so `engine-golden` is untouched.
- **`worldExitOf` and `exitPoint` were two implementations of one
  quantity** (§10): the traverse ended 22m out, the link began 7.6m out,
  and the road snapped 12m backwards under the candidate at every exit.
  `worldExitOf` existed only BECAUSE `exitPoint` was board-relative -- its
  own comment says so -- so fixing the first dissolved the second.

That also corrected a real measurement: **runway was overstated by 14m**,
because it was measured from a point the candidate had already driven
past. Three intersections immediately reported less approach than their tile
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

## 10.6 A SCENE HAS AN ORIENTATION AS WELL AS A POSITION

The largest instance of §10 found so far, and it invalidated every
measurement of the segment-hazard layer that had ever been taken.

A segment hazard is a little scenario placed at a point on a link.
`hazardAt` and `emergingAt` built it against a fixed north-south road with
the notional candidate entering from `"S"`, and `placeScenario` then
dropped it at a world point. Placement was carried; **orientation was
not.** On a link running east, the candidate drove across the road they
were supposed to be driving along.

Measured over 70 hazard scenes on eight drives:

| the notional candidate drives | scenes |
|---|---|
| the same way as the road | 29 |
| at right angles to it | 35 |
| backwards along it | 6 |

A pedestrian "stepping off the curb" walked up the carriageway. A car
"leaving a driveway" pulled out sideways across the street. And because
awareness, occlusion, registration, avoidability and attribution are all
derived from that scene, **every number ever reported about segment
hazards was taken through a scene half of which was sideways** — the
95-to-13 contact reduction, the 99% ease-off rate and the confidence 8 /
observation 4 / braking 1 attribution split in particular. Do not cite
those; they are superseded.

**The tells were all present and all ignored.** Contacts at exactly zero.
`clearAt` coming out at exactly 0.00 or exactly 3.60 across two dozen
independent scenes. An anticipation window whose median was exactly the
requirement. §10's own warning says the tell is "a measurement that comes
out at exactly zero, or exactly saturated, or suspiciously clean", and
there were three of them at once.

**This is `route.js`'s problem one level down, and `route.js` solved it
back in the driver game**: `rotateScenario` exists precisely because a
scenario carries an orientation, and a rotated scene is the same situation
pointing a different way. Hazards never used it — and `isRotatable` would
have refused them anyway, because it rejects any scene carrying
`sightBlockers`, which have fixed coordinates and no `from` to spin.

**So the scene is BUILT facing the right way rather than rotated
afterwards.** Pick the entry leg whose local travel direction already
equals the link's world direction, and the two frames then differ by a
translation alone: nothing has to be spun and a blocker's coordinates
carry across unchanged. World links run on a grid, so such a leg always
exists. `entryForLink` in `tiles.js`.

Two invariants hold it up, both checked in `verify-world.mjs` §10:

- **Every hazard scene faces the way its road goes.** 70 of 70.
- **`side: +1` is the candidate's own curb whichever way the road runs.**
  `n = (-uy, ux)` is the right of travel in all four directions, so a
  hazard can be restricted to the near side with no per-direction case.

**If you add a third kind of hazard, it goes through `entryForLink`.** A
scene that picks its own `from` is the same bug again, and it will pass
every other check in the suite.

---

## 11. Verification

**Any change to the conflict engine, trait system, scenario timings or the
generator must be re-verified numerically before it is considered done.**
All 31 `tools/verify-*.mjs` plus `verify-scoring.py` must exit 0 before
a commit. Between commits, the subset the change could have reached --
11.3, and CLAUDE.md's cold-start item 8.

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

### 11.3 SPENDING TURNS: run what could have broken, and where a
session's turns actually went

**The maintainer's instruction, verbatim in intent:** the efficiency
practices are a convention of the project, so they survive and apply to
any agent working here -- Gemini, Aider, a cheaper model -- and NONE OF
THEM MAY WEAKEN THE DISCIPLINE THAT HAS MADE THE PROJECT WORK. The rules
are in CLAUDE.md, cold-start item 8, where an agent will actually read
them. This section is the account behind them, kept because a rule
without the failure that produced it is the kind that gets argued away.

**The occasion.** One session ran past five thousand turns and hit the
usage limit three times in two days. It landed stage 3 of the rebuild,
which was real work; but a large share of the turns did not go on the
work. Honestly, and specifically:

- **Nine full suite runs, of which about three were needed.** The suite
  takes 17m41s (run of 10 Sep, timed per check). Three runs preceded
  commits that touched `src/engine/` or crossed subsystems -- the
  `detect.js` fix, the directions commit, the marking commit -- and the
  full suite was the right instrument for those. The other six followed
  changes confined to `src/sim/` or to one verify file, where the four
  sim checks plus `verify-screens` (about 100 seconds) would have
  answered the same question. `src/engine/` never imports `src/sim/`,
  which is what makes that partition safe, and it was known all along;
  the reflex was the suite.

- **Two runs against a moving tree.** Run 8 was started before the
  section-9 edit to `verify-course.mjs` was finished. It reported one
  FAIL that was true of a file that no longer existed, which then had to
  be explained, and a ninth run had to be made. Each of those cost the
  run, the stale failure, the explanation, and the re-run -- and the
  session then WAITED on a superseded run rather than killing it, which
  is the waste this section is for. The instruction that came out of it
  is concrete: the moment an edit supersedes a background run, stop it
  (the harness's task stop, or the process), and treat its result as
  evidence about a tree that is gone.

- **Sweeps re-run per tweak.** `verify-telling`'s separation between
  drivers was measured at least five times while the sample-size
  question (one seed against eight, 5.15.9) and the braking instrument
  (max per drive, then median, then `easesAt`, 5.15.10) were each
  changed one at a time and re-measured over six profiles of ten-minute
  drives. The keep-right probe (201,529 readings) and the gap-horizon
  re-derivation were re-run similarly. One parameterised sweep, run once
  across the range, would have answered all of it. And the curve-cost
  measurement that produced REBUILD.md 8.2's bend table was run inline
  and its script was not kept -- so when the bend came to be built, the
  bow shape behind the table could not be reproduced and the
  measurement has to be made again. A documented number needs its
  script beside it.

- **Retries on mechanics.** Bash heredocs containing quotes failed on
  the Windows shell several times, a turn each; patch scripts written as
  files and executed never failed. A documentation patch asserted on an
  anchor that had drifted by one word ("already known" against
  "known"), and failed; a `grep` in the same command would have caught
  it. Whole files (858-line `crossing.js`, 538-line `SimCourse.jsx`)
  were re-read in full across compactions where a region would have
  done.

- **The pane.** One screenshot to confirm the Mark button mounted was a
  fair use. Turns spent earlier trying to watch cars drive in a pane
  that delivers no animation frames were not, and CLAUDE.md item 7
  already said so. The rule stands; the lesson is that a written rule
  is still a rule you have to remember to apply.

- **Re-deriving the state after every cut-off.** Each restart re-read
  the contract (which is the price of having one) and then
  reconstructed where the tree stood from `git status` and the
  transcript. A three-line note in the scratchpad -- what is running,
  what is next, what is blocked -- written before each long operation,
  would have replaced most of that.

- **And what the maintainer asked for that cost turns.** Asking for the
  suite to be green before every commit was right, and stays. Applying
  it as "the full suite after every increment" was the agent's reflex,
  not the instruction; but the instruction to report on the way past at
  every increment, combined with three cut-offs, meant each report was
  re-read and re-summarised at every restart, and the request to record
  every finding in three documents (REBUILD, DECISIONS, CLAUDE.md) as it
  landed produced a documentation patch per finding rather than one per
  commit. The mid-stage request to investigate the curve's cost pulled a
  sweep into the middle of an increment; it was worth doing -- it changed
  the roadmap -- and it would have cost the same batched at the end of
  the increment. The eight-seed requirement in `verify-telling` made
  that check eight times slower, and that is rigour rather than waste:
  it stays.

**The rules that came out of it** are CLAUDE.md item 8, and they reduce
to: run the checks the imports say could have broken, and say which;
keep the full suite for commits, cross-cutting changes and anything
unexplained; let the golden answer "did the engine move" before anything
else does; measure once across the range and keep the script; kill
superseded background work; read the state before reproducing it; write
the next step down before a long operation.

**What they must not become.** "Run fewer checks" is exactly the kind
of instruction that rots into "skip the inconvenient ones", so the
subset is justified from the imports out loud every time, a subset is
reported AS a subset, and a commit still gets the whole suite. Measure
before building, report failures rather than building over them, never
tune a number to make a check pass, never claim green that was not
green: none of that moved, and a saving that trades against any of it
is not a saving. Reporting a run as green when it was red is still the
one thing that undermines everything else here.

---

## 12. Build order: done, next, deferred

**READ [REBUILD.md](REBUILD.md) FIRST.** The maintainer has played the
game and concluded the foundation is wrong, and the diagnosis is
architectural: every road user's motion is resolved before the drive
begins, so nothing reads anything else while moving. That is why there is
no car-following, why a rolling non-prior never yields, and why giving way
had to be built as a post-hoc search. The build order below is the order
for the CURRENT foundation and most of it is superseded. Everything in
sections 0-11 of this file survives the rebuild and is why it is
survivable at all.

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

   The three outcomes are ruled on and built (§5.10); the supply cap is
   not, and neither is what an intervention IS on the sheet. **A second
   piece of content is now waiting on the same answer**: the driveway
   emergence (§5.11.6) is correct, measured and gated off solely because
   a collision has no representation in `ExaminerDrive`. So this question
   now blocks two things rather than one.

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

3. **THE TWO MODELLING GAPS `sceneIsSurvivable` IS PAPERING OVER**
   (§5.12.5), and they are ahead of the debrief because every future
   piece of content that puts two moving cars near each other lands on
   them. **There is no car-following** — every approach is built
   independently, so two cars on one leg drive through each other — and
   **a rolling non-prior never yields**, because a participant who does
   not stop never enters the queue that `priority` orders. The filter
   throws those scenes away; it does not make the model behave.

   Car-following is also the one on the list with a look as well as a
   correctness argument: traffic that keeps gaps reads as drivers,
   traffic that interpenetrates reads as sprites.

4. **The post-test debrief.** The pieces exist — the sheet is what the
   player recorded, `habitReport` is what was true, `scoreDetection`
   computes the gap. Naming the habits is what teaches the player what to
   watch for next time.

5. **The candidate's observations are not modelled at all.** No head, no
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
- **A tile's declared road and the composed intersection's road disagree** —
  15 of 56 match, 0 of 13 for arterial. Latent until a renderer draws the
  world. Fixing it needs a road-design call first.
- **The tutorial**, framed as job training for a new hire, reusing eight
  rescued right-of-way puzzles (commit `63a9c68`) whose `rule`/`why` prose
  also serves the debrief.
- **Merging, roundabout generation, cyclists, international mode.** Each
  needs a domain ruling before it needs code.
- **`MergeRush`** is an unwired prototype. Do not wire it in.
