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

**[27 October: the maintainer's three-level design and judged-afterwards mark are in 10.27, unbuilt; where they meet this section is listed there as tensions, not resolved.]**

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

**ADDRESSED, 24 September (SIMULATOR.md 1.1.14, `src/sim/corner.js`).**
Traffic now slows to the speed the player's own cornering limit
(`CLEAN`, derived from the maintainer's 26 km/h) gives the arc it is
about to take, scaled by confidence and capped at grip, braking for it
at the driver's own planned rate. What is below is the problem as it
was recorded; 5.15.12, the tight-right radius, remains open and his.

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

### 5.16.3 ATTENTION IS INTERMITTENT, NOT LATE (28 September)

**5.16.2's model was wrong, and it was the crash outcome that showed
it.** Switched on for everybody once contact had a response, a
constant lag -- every driver living their registration delay behind the
world -- crashed 8 and 13 times in three minutes on test map 1 and the
city, and most of those crashes were between drivers of NEAR-PERFECT
observation: two drivers at 0.41 and 0.42 s drove into each other in a
box. Carrying the stale picture forward at each car's speed (nobody
believes a moving car has stopped) made it worse, 13 and 22, nearly all
poor observers rear-ending every queue they met. The registration delay
was measured as the time to notice a NEWLY VISIBLE road user; nobody
lives that far behind a car they are already watching.

**So a driver looks away** -- mirror, dash, radio, a thought -- every
LOOK_EVERY (6 s, a design constant, flagged) for their `lag`, at a phase
of their own; while away they act on the picture from when they looked
away, carried forward; while looking they see the present
(`sim/attention.js`, `seenBy`). A sharp observer's glance is 0.4 s, a
poor one's up to 2.9 s. Measured: 2 and 3 crashes in three minutes, and
the same traffic with nobody looking away has none -- the crashes are
the glances' doing, not a side effect (`verify-observation` section 3).
LOOK_EVERY was NOT tuned to that rate; observation is never calibrated
by outcome (4.4).

**Signs are read only while looking, and on a clear road that is always
in time.** The shortest clear view of any sign on the maps is 5.6 s at
the posted speed, against the longest glance of 2.91 s, so nobody misses
one -- poor observer or sound. That is the finding, stated rather than
tuned away: a sign is missed where its view is cut short, which is SIGHT
LINES (a van, a building, a crest), the next piece. The check holds the
arithmetic, so a map with a shorter view fails it and its misses are
then real. A local knows their own district's signs without reading
them (maintainer's ruling).

**Still off by default**, behind "Drivers look away" on the map screen,
because what a crash between two traffic cars means for play is not
decided; the crash itself is drawn and stays where it happened (5.12).

### 5.16.4 A YIELD SIGN, AND THE UNCONTROLLED CROSSROADS UNDER IT (28 September)

**The editor could place a yield sign and the traffic ignored it** -- a
yield resolved to "none", an uncontrolled approach. The maintainer's
ruling: slow, give way, stop only if needed. So a yield gives way to a
road with no sign by the same gap acceptance a stop does, with no stop
of its own; the approach slows to YIELD_AT (20 km/h, a design constant,
flagged -- the ruling says slow, not how slow) scaled by temperament,
through the corner's own "speed by a place" (`speedBy`). Where a yield
meets a yield or a stop neither is the through road and there is no
stopping order: they meet as equals under the uncontrolled rules (a
default, flagged; no map mixes them).

**Building it on the uncontrolled crossroads found that crossroads
locked**: one car across in four minutes at 40 cars. Arrival was
distance over speed floored at 0.5 m/s, so every car standing at its
line arrived "together" and the right-hand rule ran round the circle;
a car queued at rest behind somebody "arrived" before a car standing at
its own line; and a car standing at its line lost to anything moving
within thirty seconds. Three rules, each an existing one read properly:
standing at the line, first to stop goes (the all-way stop's order, not
at a signal); a car at rest short of its line claims nothing (a stopped
vehicle claims nothing); and a car standing at its line against a moving
one is a question of the gap (finding a gap is always the same act).
Now 43 crossings, as against 17 with stop signs. verify-signs section 7,
three sabotages.



### 5.16.5 FAIRNESS IS OWED TO THE PLAYER, NOT TO THE SIMULATION (29 September)

The maintainer: *"pedestrians should absolutely have a chance to do
dangerous stuff, we just need to make sure the player has time to react
whenever put in that situation. NPC cars however don't need that same level
of fairness and unavoidable collisions could occur (perhaps prompting
emergency vehicles to respond/appear) morbid, but collisions can give our
city a sense of being lived in and not just waiting for the user to arrive
on scene."*

**The rule that an unavoidable collision does not test anticipation and
merely punishes is correct -- and it was only ever about the person holding
the controls.** Applied to the whole world it made everything safe by
construction: people stepped off only when every car could stop, which is
exactly why inattention never cost anything against them (SIMULATOR.md,
observation scored on the decision). It is the same over-correction as the
generator discarding marginal situations earlier in the project
(`windowIsSafe`, CLAUDE.md): a correct rule applied past its subject.

So: people on foot may do dangerous things (sim/peds.js -- trusting,
heedless, darting out from between parked cars); in front of the traffic,
no constraint, and collisions between them are CONTENT, recorded and drawn;
in front of THE PLAYER, only where a response exists in time, given what
the player could perceive -- the old engine's avoidability question
(engine/outcome.js `avoidableFrom`) asked of the one response a driver has,
reaction floor then full brake, with the time a person is hidden behind a
parked car counted. The rates are tunables, set against a measured rate and
told to the maintainer, never an emergent surprise.

### 5.16.6 KNOWLEDGE AND COMPLIANCE ARE TWO AXES, AND COMPLIANCE IS SITUATIONAL (29 September)

The maintainer's ruling of 25 September (R2-DESIGN.md 17, which records
the build): knowing a rule and choosing to follow it are different, and
the same rolling stop means a gap in what somebody was taught or a corner
being cut. Three things to keep:

- **Compliance is drawn BESIDE the five skills, never in their bag.** It
  keeps every driver drawn before byte-identical on the skills, which is
  what let the split be measured as the split alone; and it is the
  ruling's population half -- traffic varies in compliance, learners in
  knowledge. Putting it in `WEAK_AXES`' draw would reshuffle every driver
  in every check and bury the effect.
- **Knowledge is checked against each sign's difficulty, once per driver
  per KIND** (revised 30 September, the maintainer's proposal): never per
  encounter, or the same driver reads a sign on one approach and not the
  next -- which is compliance's shape. A kind nothing can express a
  misreading of has no business in `DIFFICULTY` beyond being listed.
- **A compliance fault must be situational or it is knowledge's.** The
  check that holds this (`verify-compliance` 2) measures the cost of an
  occasion with its own instrument, not the sim's `nobodyAbout` -- a check
  that asked the sim's predicate whether the sim's predicate held would
  compare a quantity with itself (CLAUDE.md, cold start 3).

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

### 10.3 A WORKED EXAMPLE: the check that passed with its own mechanism removed (verify-trucks, 22 October)

The abstract rule -- sabotage a check before believing it (CLAUDE.md item 3)
-- is easier to nod at than to apply. This is what applying it found.

**The claim**: "what a truck might hide holds the timid more than the
bold" -- the margin a driver leaves for what they cannot see is
confidence (crossing.js `phantomHolds`: the timid assume a hidden car at
full speed, the maximally bold assume nothing).

**How it was measured**: among drivers at their line with trucks about,
the share held with trucks opaque and free with them see-through, timid
drivers against bold ones. One seed, five minutes.

**What went wrong, in the order it was found:**
1. It failed on 21 October, 0.4% against 0.5% -- about 6 events against 8.
   One seed at those counts is a coin toss. Six seeds pooled said timid
   1.18%, bold 0.37%: the world looked right. The tempting fix was to
   state the sample and move on.
2. Sabotaged before trusting the restated check: confidence taken out of
   how fast the hidden car is assumed to go. It STILL PASSED.
3. Confidence taken out of every place it enters the margin -- the speed
   assumed, the gap acceptance against the hidden car, the patience. It
   STILL PASSED: timid 1.26%, bold 0.53%, 2.4 times.
4. So the check had never measured the mechanism. It compared two
   POPULATIONS: timid drivers stand at their lines longer, in denser
   moments, with more trucks about, so they are "held while trucks are
   opaque" more whatever the margin does. And "held with trucks opaque, free
   without" also counted cars a truck hid that the driver remembered.
5. A same-driver comparison -- each driver at their line asked twice, as
   timid and as bold -- still did not separate cleanly (185 against 146,
   and 192 against 168 sabotaged), because it still measured "held while
   opaque", not "held by the margin".
6. What isolated it: `whatStops` reports `byHidden` -- held by the margin
   and by nothing else (a field only; the world hash byte-identical) -- and
   the claim is stated as the design states it, exactly: asked as the
   maximally bold, who assumes nothing is hidden, the margin NEVER holds;
   asked as the timid tail, it does. 161 against 0. Sabotaged, the bold
   are held 127 times and it fails.

**The lessons, each more general than trucks:**
- A check that compares two groups of drivers measures everything that
  differs between the groups. Ask the SAME driver at the SAME moment with
  one thing changed (the project's controlled comparison, applied to a
  check).
- Measure the mechanism's own output, not a downstream state it shares
  with other causes ("held by the margin", not "held").
- A ratio between two moderate settings is not a property: any threshold
  set between the intact and the sabotaged reading is tuned to the
  sabotage. State what the design says EXACTLY at an end of the range
  (zero at the maximally bold) where a correct implementation has no
  slack.
- And the cost of not doing this: the check had been green for weeks.

### 10.4 TWO WORKED EXAMPLES FROM ONE DAY: an axis's first fault, and a proxy that measured the workload (22 October)

**Observation reached the sheet, and the obvious version did not.** For the
whole life of the project observation was the axis with no markable fault
of its own (CLAUDE.md, "OBSERVATION is exempt from the trait floor"). It has
one now: `lateOffGreen` (10.16) -- the car at the head of the queue still
sitting after a green, past the worst a competent observer could take,
derived from the axis's own numbers. Poor observer 11 of 11 greens, the same
driver sharp 0 of 11, timid 0 of 12, and two sabotages fail it.

The fault the maintainer actually ruled on (10.12.3, braking hard without
having registered the car behind) was built the same day and NOT shipped:
over twelve dense drives it marked a sound driver 4 times and a poor
observer 6. The worked part is what was not done. A threshold, a gap
multiple or a registration window could each have been nudged until the
split looked like a split; every one of those would have been tuning a
number to make a fault appear (CLAUDE.md, "never tune a number to make a
check pass"). The finding was that the course offers the event to
everybody, and the supply that discriminates is the merge, on the map,
where the sheet does not run. A fault that cannot discriminate is noise on
the sheet, however principled its definition.

**Standing time was a proxy, and it measured the simulation's workload.**
The 150-car "regression" (10.15) was the acceleration lane standing more
car-seconds than a yield sign: 1101, then 821, against 730. Three traces
went into closing it. The question that ended it was the maintainer's
reviewer's: does the yield sign admit the same number of cars, and what
does a DRIVER meet? Measured per car (tools/measure/entry-experience.mjs,
six seeds, four minutes):

| | admitted /min | entry to joined, median / p90 | joiners who stood | car-s standing |
|---|---|---|---|---|
| yield sign | 30.9 | 32.5 / 54.9 s | **51%** | 1036 |
| acceleration lane | 30.0 | 31.3 / 41.6 s | **6%** | 710 |

The two admit the same -- both admit what the slip roads are fed -- and on
six seeds the lane stands LESS in total; the three-seed comparison was seed
noise around a measure that did not ask the question. What a driver meets is
the reverse of what the proxy said: at a yield sign half of everybody stops
(a few seconds to a minute); in the lane almost nobody does. The lesson is
the one the maintainer made this week about encounters: count what the
person in the seat experiences, not what the world spends.

**And the experience measure found what the proxy hid.** The 6% who do stand
in the lane stand for a long time: 15 of 42 over a minute, the worst 154 s.
Each is stopped at the head of the lane, about 5 m short of the taper,
beside through traffic at 90-100 km/h, with the queue behind it. A car at
rest cannot join a stream at that speed through any gap the stream offers,
and an offer from a car moving at 27 m/s cannot make one. That is not a
constant -- admissions are level, so the entry rate is not the bottleneck --
it is the standing merge into a fast stream: open, 10.15.

**A third in a week: the profiler pointed at the wrong functions (22
October).** Asked why the step on the endless highway grew faster than the
fleet, a sampling profile (`tools/measure/step-profile-map.mjs`, V8 with
inlining on) put the growth in `relevantTo` and in `step`'s per-car closure.
Two fixes aimed by it -- the lane buckets split by node, and a prune of
`whatStops`' visits -- left the step exactly where it was: 9.5 ms at 260
cars before, 9.4-9.5 after. Re-profiled with `--no-turbo-inlining`, the
time was under `whatStops` (46% of a step at 100 cars, 57% at 300), with
the inlined callers' work no longer billed to whoever inlined them. Same
shape as the check that passes with its mechanism removed and the
standing-time proxy: **an instrument that reports confidently and measures
the wrong thing. The instrument was wrong, not the world.** Three in a week
(verify-trucks, standing time, this). For performance: profile with
inlining off before aiming a fix, and believe a fix only when the step
time moves -- a profile is a pointer, the step-ramp is the measurement.

**A NEGATIVE RESULT, KEPT SO IT IS NOT RE-ATTEMPTED (22 October).** Two
EXACT prunes of the cars `whatStops` reads (world hashes identical on four
maps, with and without trucks):
- cars at or behind me on every lane we share are never considered
  (`clearBetween` of a distance <= 0 is negative for any lengths);
- a car ahead in my lane can press at most wantedGap(me, a stopped car) /
  its gap, and the nearest is always considered, so a car whose most is
  under the nearest's press is never the leader.
Visits per car fell **37 -> 15 at 300 cars** on the endless highway. The
step did not move (12.46 / 12.55 / 12.58 ms against 12.38 / 12.32 / 12.49 in
alternating runs): `consider`, `pathOf` and `clearBetween` fell by ~1.5 ms,
and `relevantTo` grew by ~2.3 ms, because deciding what to skip meant
walking the lane buckets, which hold every car on the lane -- the very
O(cars on the lane) per car the visits were. Pruning a list costs what
walking it costs. The fix is a structure in which the walk is short: lanes
sorted by position, each car reading its neighbours by index
(DECISIONS 10.10's one neighbour search), not a smarter filter over an
unsorted bucket. Reverted; the code is in this session's history only.

**THE FOURTH, AND THE CLEANEST: A READOUT THAT MIXED STATISTICS (22
October).** The phone's frame line read "frame 195.6 = sim 132 + poses 1.9
+ draw 3.6 + hud 0.8" -- and 57 ms of every frame sat on the in-flight list
for most of a day as time nobody could account for, the precondition of
every performance bug this month. There was no such time. The frame was a
MEDIAN and the parts were MEANS: in the spiral the median frame sat on four
steps while the mean held about three. Reproduced with no hidden overhead
(page-loop.mjs: 7.0 fps, 2-5 steps a frame, 0.98x, against the phone's 6
fps, 0.99x). No bug in the world at all: purely an instrument.

**THE RULE: A READOUT THAT MIXES STATISTICS IS AN INSTRUMENT THAT LIES.**
Every number printed says which statistic it is. Medians and percentiles
do not add, so wherever a total is set beside its parts, both are MEANS --
and a before beside an after is the same statistic over the same window.

**The sweep, the same day** -- the frame line was not alone:
- the worker's trip line, "trip p50 = wait p50 + step + answer p50 + back
  p50 + reply p50": a median total equal to a sum of medians. Now means,
  every leg, and says so.
- "worst frame 452 = script 276 + render 276": a DOUBLE COUNT. The Long
  Animation Frame's `renderStart` opens the rendering phase, which includes
  the requestAnimationFrame callbacks -- our whole frame, sim included,
  already counted as script. Two equal numbers summing past their total
  were the tell. Now "of which script X and style/layout/paint Y", the
  latter from `styleAndLayoutStart`, after the callbacks.
- "drawn: cars 3.3 of 172": a five-second mean beside a count of now.
  Labelled.
- tick, step, frame and its parts unlabelled; the encounter line a whole
  drive's rate beside five-second windows. Labelled.
- tools/measure/draw-scenes.mjs: "draw p50 = list p50 + sort p50 + paint
  p50". Now means.
The bench report (src/iso/bench.js) and the other measures label their
statistics and claim no sums.

**THE FIFTH, AND THE RULE IT MAKES (22 October).** The neighbour index was
aimed by desk profiling -- `whatStops` at 57% of a step at 300 cars -- and
on the desk it delivered: the step 22% cheaper, allocation 23% less. On the
maintainer's phone at 280 cars the step (51.9 ms) sat where the pre-index
curve extrapolated. The phone's cost was elsewhere: the desk had been a
confident proxy for the wrong machine, as the desk-times-a-factor ceiling
table was the same day (SIMULATOR 1.2.17). Five instrument failures in a
week -- verify-trucks, standing time, the inlined profiler, the median
against means, and this -- and the last is general enough to be a rule:

**WE HAVE NO RELIABLE PROXY FOR THE MAINTAINER'S PHONE. ANY PERFORMANCE
WORK IS VALIDATED ON IT BEFORE IT IS BELIEVED.** Desk measurements choose
what to try and rule things out; they never establish that something will
help the phone. A performance change is not "done" until a phone reading
says so -- expensive and slow, and cheaper than five wrong turns.

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

## 10.7 A WAIT IS A PROMISE THAT SOMETHING ELSE WILL MOVE

Four times the traffic has stood still for good, and three of them were
the same shape:

- **The through road (rebuild, stage 1).** "A left turn yields to the
  oncoming" as an unconditional hold: a car stopped two hundred metres
  back was oncoming traffic, and both major approaches stood for good.
- **The five-way (29 September).** On a shared exit, a car still WAITING
  at its line read as in front of a car already in the box, so each held
  the other.
- **The crosswalk (29 September).** A car stopped on the paint for a
  person was read by her as about to move, and each waited for the other.

**The common cause: a party AT REST AND WAITING was read as a party
CLAIMING.** Each wait was a test on the other party's state -- in front
of me, oncoming, on the paint -- that stayed true while that party was
itself standing still waiting on me, so neither could ever change it.
The fix every time was the rule this project already had: *a stopped
vehicle claims nothing* (CLAUDE.md, rules), applied at the place the wait
was decided.

The fourth -- **a bus that waited 1062 s to pull out of its bay (1
October)** -- looked the same and was NOT: the cars it waited for were
queued at a side street's stop sign, nowhere near it, read as "beside"
it through a lane position clamped to the start of a road they had not
reached (buses.js `laneAt`). That is the OTHER recurring bug, two
implementations of one quantity (CLAUDE.md item 2). It is recorded here
because it presented as a deadlock and the first hypothesis was the
wrong one; the trace said otherwise.

**THE RULE, so there is no fifth:**

1. **Every wait names what must move for it to end, and that thing must
   be able to move without the waiter moving first.** If what I wait for
   is at rest, ask whether it is waiting on me; if it can be, the rule
   deciding between us has to break the tie (a stopped party claims
   nothing; the tie-break is TOTAL -- 5.13), never leave it to both.
2. **Every wait has a check with a bound on it.** All four were caught by
   one -- verify-peds' 60 s at the curb, the five-way's car count that
   would not fall, verify-buses' "no bus waits for ever". A new kind of
   waiting ships with its bound in the same increment, set from what the
   wait is FOR (a gap of a few seconds, a light's cycle), never from what
   the run happened to produce.
3. **When something stands still for good, trace both parties' decisions
   before naming the cause.** A deadlock and a false position look the
   same from outside; one tick of `whatStops` for each party tells them
   apart.

## 10.8 A STATE THE PLAYER CANNOT READ IS A STATE THE SCREEN DID NOT SHOW

Recorded 6 October 2026, from the maintainer driving the build, in two
messages running: first "world needs signals and brake lights", then
"it's very hard to see the state of the traffic light and the stop lines
in general".

**The simulation models these things honestly and the player cannot see
them. That is a READABILITY problem, not a simulation problem, and it is
the same rule already held for the scorer from the other side: the
scorer must never know something the screen did not show, and the player
cannot reasonably be asked to respond to a state he cannot read.**
CLAUDE.md item 6 says the same of a state nothing draws; this is the
case where something draws it and it is a few pixels.

- **Real-world scale is wrong for a map.** A stop line is 0.45 m of
  paint, a lens 0.3 m, a lamp a few centimetres: a pixel or two at street
  zoom. The precedent is the sign, drawn 1.4 m across for a 0.75 m face.
  Everything the player must read is a MAP SYMBOL: larger than life, with
  a floor in pixels, and legible at four to forty pixels.
- **The state goes where the eye already is.** A signal's state is
  painted ON ITS STOP LINE in the light that lane obeys (`movementLight`,
  the call the drivers use), not only on a head the player has to find.
- **Brake lights and turn signals are information, not decoration.**
  Threading traffic is reading what the drivers around you are about to
  do. They are on the cars as `brakeLamp` and `blinker`
  (sim/crossing.js), and NOTHING reads them back: they change no
  decision, so the traffic is the traffic it was. They are not called
  `brake`, which is a driver's braking rate, and a lamp written over it
  made every car brake at 1 m/s^2.
- **Whether it is legible is only testable by eye.** `verify-bench`
  section 7 checks it is DRAWN and in the right colour, not that it can
  be read. The maintainer judges that.

## 10.9 LEVEL OF DETAIL KEEPS THE WORLD DETERMINISTIC -- the ruling, before any code (20 October)

Simulation level of detail (full / coarse / dormant tiers by distance from
the player; SIMULATOR.md 1.2.14 and the maintainer's "simulate the
simulation") makes what happens to a car depend on where the player is. The
golden runs and `tools/measure/world-hash.mjs` assume one fixed step over
every car. Two ways to keep them meaning something; **this project takes
the second.**

1. ~~Hash only the full-tier cars.~~ Rejected. The bugs LOD will produce live
   exactly where this looks away: a dormant car advanced wrongly, a coarse
   car demoted with a stale lane change, a promotion that puts somebody
   inside another car's headway. A hash that skips those tiers would pass
   while the world it does not cover rots, and every car would still reach
   the player through promotion. It is a check with a boundary chosen to
   exclude the failure (CLAUDE.md item 4).
2. **The tier is part of the seeded, deterministic state.** Which tier a car
   is in, and when it changes, is a PURE FUNCTION of the world before the
   tick and the player's pose -- no clock, no frame rate, no device. The
   player's pose is the one input, and a run that fixes it (no player; or a
   scripted one, as `tools/lib/good-driver.mjs` drives) is exactly
   reproducible. **The hash covers EVERY car in EVERY tier, with its tier,**
   so a promotion or demotion that changes is a hash that changes.

What this obliges, before LOD lands:
- **Tier changes happen on the tick, inside `step`, never on a frame**: a
  frame-driven boundary would make the world depend on the device's frame
  rate -- the worker's lesson (SIMULATOR.md 1.2.11) in another form.
- **Hysteresis is part of the rule** (a car promoted at R1 is demoted only past
  R2 > R1), so a car on the boundary does not flicker tier tick to tick.
- **A dormant car's advance is analytic and seeded** (its position from its
  speed and the time since it went dormant, never a random draw at
  promotion), so the same history promotes to the same place.
- **The promotion check is written before the feature**, as `verify-start`
  was for spawning into traffic, which bit twice: every promoted car arrives
  on a lane, at a speed the traffic it joins could have produced, **in a
  state the full simulation itself could have produced** -- enumerated over
  the tier boundary, event by event, not sampled. (Until 27 October this
  read "clear of every headway". REWRITTEN, below: that is placement's
  standard, and ordinary untouched traffic fails it.)
- **WRITTEN, 22 October, before the feature**: placement.js `admissible` is
  the one test anything that puts a car into the full simulation asks --
  density shaping now, LOD's promotion later -- naming the rule that refused
  it: lane, speed, ahead, behind, queue (the approach's queue by whatStops's
  own rule, which the lane index cannot see), space, arrival.
  verify-promotion builds a case for each on the endless highway and holds
  that the rule bites -- the queue and space cases where the lane index alone
  would admit -- and that every car shaping places is admissible re-asked on
  the world it joined. Sabotaged four ways (no behind rule, no queue rule, no
  space rule, a car its own neighbour): each fails it. Writing it found a
  real bug: asked about a car already in the world -- the promotion case --
  the index read the car as its own follower; now never.
- **PROMOTION IS NOT PLACEMENT, AND `admissible` DOES NOT GATE IT
  (27 October, the maintainer).** Placement CHOOSES a place, so it may hold
  out for a comfortably clear one; promotion chooses nothing (10.10) -- the
  car is already where the world put it. Asked of ordinary full-detail
  traffic that had never been promoted -- cars 600-1000 m from the player,
  the band promotion would happen in (tools/measure/lod-census.mjs) --
  `admissible` refused **46-57% of car-samples on the endless highway on
  the space rule alone**: any car within 10 m centre to centre, which is
  the car in the next lane. The headway rules refused another 2-13% at the
  competent standard, and more at the driver's own caution, because bold
  drivers follow closely and that is the model working. A gate that most of
  the untouched world fails is not measuring promotion; red with nothing
  wrong, or a coarse model "fixed" toward a standard the full model does
  not meet -- 10.23's pattern for the eighth time. So: promotion is checked
  against the FULL MODEL ITSELF -- no contact, no hard braking by the
  promoted car or its new follower, and an all-full twin replayed from
  before each promotion with the gaps compared per event (SIMULATOR
  1.2.19). `admissible` stays the gate for placement, where it is right;
  for promotion only its lane, speed and arrival rules mean anything.
  verify-promotion holds placement's predicate and stays as it is.
- **LOD IS PARKED** (27 October, SIMULATOR 1.2.19): measured before it was
  built, about a fifth of the step, and on the shaped highway the headroom
  has nowhere to go. This section is the ruling for when it returns.
- **The full-tier world, alone, is not required to be identical with LOD on
  and off** -- the point of LOD is that far traffic is approximated -- but a
  run with every car held in full tier must hash exactly as today's step
  does, so turning LOD off is a provable return to the current behaviour.

## 10.10 PUTTING A VEHICLE INTO A MOVING STREAM IS ONE QUESTION, ASKED BY CALLERS WITH DIFFERENT FREEDOMS (21 October)

The maintainer: *"the slip lane was originally the way we were having the
user enter the highway, because before we were having issues spawning the
user in flowing traffic. this might not be a problem in a more connected
city, or maybe more importantly, once we adjust traffic density around the
user specifically."* The slip road was a workaround: a stationary start
behind a yield sign because a car could not be put safely into a flow, and
the endless highway's entrances are where they are because of it.

**The shared question**: at this place in this lane, at this speed, is there
room ahead and behind? It has been answered four times, each separately,
and got wrong three times -- the wheel screen's spawn on top of traffic,
the slip road's player on a stopped car (4828823), and the merge into a
follower nobody could see (21 October, a neighbour search that skipped
cars short of their line). Today: `joinAt` (the car ahead only),
`placePlayer` (a radius, then deletes whoever could reach a stopped car),
`gapFor` (both sides, closing speed), over three neighbour searches. That
is section 10's pattern at the scale of architecture. So: ONE neighbour
search -- who is ahead and behind at a place in a lane, along the road's
centreline (graph.js `exitAlong`, which agrees across lanes where distance
remaining does not) -- and ONE gap predicate with the standard as a
parameter, read by everything that asks.

**What does NOT unify, and must not be forced to**: the callers differ in
what they may choose and in what a "no" means.
- PLACEMENT -- the player's start, and density shaping ahead of and
  behind the player -- may choose place, speed and timing, holds to the
  competent standard (never bold, never missing anybody), and may never
  fail visibly. Density shaping happens out of sight. One operation, one
  check, both callers.
- THE PLAYER IS PLACED AGAINST THEIR WORST REASONABLE INPUT, not the speed
  given them: the traffic will hold its speed, the player may let off or
  brake, so the room behind must let the follower stop behind a player who
  does. Today's start is safe only because it is standing. Deleting cars to
  make room is allowed only before the first frame.
- A MERGE IS NOT A PLACEMENT. It is behaviour, and its failures are meant
  to be seen -- the bold taking less than comfortable, the poor observer
  missing somebody. It reads the same predicate at the driver's own
  confidence; it never calls placement, or placement could fail or merges
  could not.
- LOD PROMOTION CHOOSES NOTHING: the car exists, with a place and a speed.
  The predicate is a VALIDATOR there; a promoted car that fails it says the
  coarse model was wrong, and the fix belongs in the coarse model.

**What follows for maps**: once placement is solid the slip road is one
way onto the highway, not the only one, and entrances stop being
load-bearing. Slip roads stay -- they are correct road design, and the
merge is a mechanic worth having.

**Order**: the four suite failures of the acceleration-lane build first
(the lane-change code they sit in is what the predicate replaces); then
the one neighbour search and gap predicate under the existing callers,
guarded by the existing checks (BEGUN 22 October: whatStops' own lane reads
position-sorted arrays, exactly -- world hashes identical on every test
map -- crossing.js `takePlain`; the lane change and courtesy next); then placement for the player and density
shaping, with one check; LOD's validator when LOD comes.

## 10.11 A CHANGER LEAVES ITS OLD LANE WHEN THE BODIES CANNOT MEET -- EXCEPT BESIDE A TAPER (21 October)

**The rule.** A car changing lane is in BOTH lanes while it moves across:
the car it was behind in the old lane still constrains it, and the cars
behind it in the old lane still see it. Until 21 October that lasted until
the blend was over. It now ends when the sideways distance still to go is
under a lane less the two vehicles' half-widths and both cars' weave room
(crossing.js `protrudes`) -- the point after which the two bodies cannot
touch -- and an abort back to the old lane is allowed only BEFORE that
point (lanechange.js `committed`), measured against the narrowest vehicle
that could be following there.

**Why.** The blend now moves only as the car moves (a stopped car does not
slide sideways), so "until the blend is over" could be for ever: a changer
92% across waited behind a stopped car it could no longer reach, the old
lane waited for it, and the endless highway's closed loop came to a
complete standstill in fifteen minutes (verify-loop). The abort limit is
the same boundary seen from the other side: once the old lane has let go,
the car behind in it moves up into the space, and swinging back lands on
it (measured the day the release went in: 180 overlapping car-ticks).

**THE EXCEPTION, AND WHY IT IS THERE -- read this when it bites.** Beside a
TURN BAY or an ACCELERATION LANE the release does not apply: the changer is
held to the old lane until the blend is over, as before (`tapered`). The
release assumes the two lanes are a full lane apart. A bay lies ON its
neighbour until its taper opens, and an acceleration lane slides onto the
curb lane as it closes, so in a taper the lanes are closer than a lane and
"the bodies cannot meet" is false at the release point: the first version
without the exception had a car in a half-open left bay struck from behind
by the through lane. So whether a changer is held now depends on what KIND
of lane is beside it -- a condition nobody will remember. If a deadlock
like the loop's appears next to a bay or an acceleration lane, this is the
first place to look; the general fix is to measure the real separation of
the two lanes at the car (both are polylines from the same road samples)
instead of assuming a lane, which would remove the exception.

## 10.12 BRAKING HARD WITHOUT HAVING LOOKED BEHIND IS THE FAULT -- NOT THE BRAKING (21 October; the maintainer's ruling)

The question: a driver letting a joining car in braked at 4.71 m/s^2 -- 87%
of the harsh line. Courtesy, or a markable fault? The maintainer:

*"it depends on the driver and the situation. in my real experience the
majority of drivers (tested or other road users) signal poorly, closer to
their steering action than to show their intent in general. being 'kind'
(abandoning right of way) but negligent of traffic behind them is common in
new drivers, not so much in skilled ones who understand that danger behind
can be more pressing than ahead. adding to this, the absolute best drivers
understand their position as the leading car in traffic is different than
trailing cars and their obligation to lead to get out of the way affects the
whole flow of traffic behind them. worse drivers consider the brakes their
get out of trouble button thoughtless of what is happening behind them. as
always, the best drivers are scanning and anticipating rather than
reacting, getting out of the way or taking decisive action while it's
possible."*

**The ruling.** The deceleration is not the fault; braking hard WITHOUT
having scanned behind is. No threshold on the magnitude: the same 4.71 is
courtesy from a driver who knew the road behind was clear and negligence
from one who did not look.

**What follows -- direction, recorded before any of it is built:**
1. **Courtesy is conditional on observation as well as temperament.** A
   courteous temperament stays necessary; the offer also needs the driver
   to have checked behind (attention.js: not looking away, and having
   registered who follows). A good observer offers when it is cheap; a poor
   one offers by standing on the brakes.
2. **The discriminator is WHEN the deceleration starts, not how hard it
   peaks.** Scanning and anticipating lifts off early and opens the gap
   gently over a long distance; reacting brakes late and sharp. Measure the
   PROFILE (onset distance, ramp), not the peak. This may be the BRAKING
   axis's missing observable -- the cold review's complaint is that it
   produces "eases off at 77 m instead of 86 m", measurable and not felt;
   here the lateness lands on a third party as a jolt. Whether it
   generalises beyond merges is to be measured before assumed.
3. **OBSERVATION GETS A MARKABLE FAULT.** Observation has been the dead
   axis: built, measured, and on no sheet. Braking hard -- for a courtesy,
   or for anything -- with a follower inside the room that braking costs,
   having not checked behind, is a specific, examinable fault, and it comes
   from observation rather than confidence. This resolves the long-standing
   hole recorded at CLAUDE.md "OBSERVATION is exempt from the trait floor".

## 10.13 THE LEAD CAR OWES THE QUEUE -- a named concept, scoped, not built (21 October)

From the same ruling: the best drivers understand that leading traffic is a
different job, and that their actions propagate to the whole flow behind.
Nothing in the model knows it is leading a queue or owes it anything; a
driver's choices touch their own car and, incidentally, whoever follows.

**The cheap version** reads what the model already computes -- who is
behind, how close, how fast (the lane-change neighbour search) -- and lets
it shape decisions that already exist: (a) easing off early rather than
braking late when followed closely (the profile in 10.12); (b) keeping
right sooner when a faster car is behind (keep-right's motive today is the
rule, not the follower); (c) not stopping where stopping is optional (a
courtesy offer, a yield with a gap) when the follower is inside its own
stopping room. Each is a modifier on an existing decision, gated by
observation (you must have looked to know you lead).

**The expensive version** -- a driver that plans for the flow behind it
(choosing a gap or an amber for the platoon rather than for itself) -- is a
new kind of consideration: a decision with the followers in its objective.
Not proposed.

## 10.14 STREAMED ROAD AND PLACEMENT ARE TWO OPERATIONS THAT SHARE A HORIZON (21 October)

Asked whether generating road ahead of the player and retiring it behind is
the same operation as placement (10.10) applied to road: it is not, and the
two must not be collapsed.

- **Streaming changes the STATIC network**: nodes, roads, lanes and joins
  appear ahead and go behind. It reaches the structure of the simulation
  core -- `course.at` is an array indexed by node, joins are keyed by that
  index, every car stores it, the neighbour index buckets by it, draw.js
  caches static geometry per road, and the worker protocol rests on the
  course never crossing (remote.js). The chunk index in map/load.js is an
  index over a whole loaded map, not a loader: it does none of this.
- **Placement puts CARS onto a network that exists.** It chooses a place,
  a speed and a moment against the gap predicate (10.10); it never changes
  a road.

**What they share is the HORIZON**: the region ahead of and behind the
player that the player cannot see, where road may be generated or retired
and cars inserted or removed without anything appearing or vanishing in
view. One horizon function, read by both. Streaming is placement's
prerequisite on a streamed map (a car is placed onto road that must exist
first), never a caller of it.

**Decided 21 October: true streaming is OUT FOR NOW.** A generated, open
(not looped) highway of 30-40 km, varied along its length, gets the
maintainer's experience for about a fifth of the cost, and its congestion
drains out of the far end by construction -- the closed loop's standstill
was partly its topology. Streaming is revisited only if the long highway
proves not enough, and that is the maintainer's judgement from driving it.

## 10.15 ANTICIPATION IS WHEN, NOT HOW HARD -- a general property, named (22 October)

Two fixes on 22 October turned out to be one property. The maintainer's
courtesy ruling (10.12): a scanning, anticipating driver lifts off early and
the gap opens gently; a reacting one brakes late and sharp. And the merge:
a scanning joiner picks a gap early and adjusts its speed to meet it; one
who is not accelerates to the traffic's speed and takes whatever hole is
beside it when it looks.

**The property: what a driver does about something is set by WHEN they
start, and the observation axis already says when.** `noticeAfter`
(registration lag, longer mid-glance) is the onset. Act on a PLAN against
the time actually left -- a gap needed by the time the joiner's lane
closes; a gap a joiner must reach before its taper -- and gentle-or-sharp
follows from the onset with nothing authored. A deficit then shows as a
consequence that lands on somebody (a follower's jolt, a joiner standing at
the taper), which is what makes it legible.

**Where it is built** (courtesy.js `courtesyPlan`; lanechange.js
`gapTarget`):
- courtesy with a deadline (a joining car) opens the gap by then at the
  rate the time left needs, never past the offerer's own braking; with no
  deadline (the player signalling mid-road) it eases off at GENTLE (half
  the vehicle's comfortable rate) from the moment the offerer notices.
  Measured: every offer used to brake at exactly the offerer's own rate
  (7 of 7, r = 1.00 with the braking deficit); the player's offers now
  peak at 1.35 m/s^2 whoever makes them, and differ in onset.
- a driver who checks behind (competent observation) does not offer a gap
  that would make its follower brake past the follower's comfortable rate.
- a scanning joiner holds the speed that brings it level with the gap it
  can reach with the least change of speed (GAP_LOOK 150 m, flagged).

**Open, measured**: at 150 cars a joiner beside the car letting it in can
slow WITH it -- the joiner braking for its lane's end, the offerer braking
to make room -- and the gap never opens; the acceleration lane still
stands more cars than the yield sign there (1101 against 730 car-s). The
likely fix is the same property again: an offer that cannot open before
the joiner's deadline is not waited for. Not built.

**Third trace, 22 October -- it narrowed the gap and did not close it.**
The merge had to be FINISHED by where the taper begins, so the last ~90 m
of the lane at 72 km/h were no use for merging and every joiner without a
gap by then stood at the taper. Now a merge may begin up to the taper and
finish by its end (lanechange.js `mergePlan`; standing in the taper is
still refused). 150 cars, three seeds: 1101 -> **821** car-s standing,
against the yield sign's 730; 60 cars 33; 300 cars 7907 against the yield
sign's 16365; no crash. What remains is about 29 joiners over three seeds
standing about 56 s each. Per the maintainer's instruction ("if a third
trace does not land it, tell me"), this is now a CONSTANTS QUESTION and not
tuned: the lane's length (350 m), the taper's behaviour, or the entry rate.

**CLOSED, 22 October: the comparison was wrong, not a constant** (10.4).
Measured per car over six seeds, the lane admits what the yield sign admits
(30.0 against 30.9 a minute), gets cars on as fast or faster (p90 41.6 s
against 54.9), stops 6% of joiners against 51%, and stands less in total
(710 against 1036 car-s). **Opened in its place: the long standers.** The
few who do stop wait at the head of the lane beside 90-100 km/h traffic for
up to 154 s -- a standing merge into a fast stream, which no gap and no
moving offerer resolves. Not built.

**BUILT, 22 October -- the maintainer overruled the ordering ("a player
would be one of those 6%"): the player can never be stranded, and a joiner
that stops recovers.** Traced first, and the answer to "did gaps exist that
were not sought, or was there never one" was: gaps existed, and two
definitions of the same gap kept anybody from using them.

1. **The ask's deadline was the taper, and the joiner starts braking ~80 m
   before it.** An offerer planning against the taper slowed alongside a
   joiner that was itself slowing for its lane's end, paced it 15 m back,
   and finally drove past. The deadline is now where the joiner must begin
   its stop (`laneEndRoom`, lanechange.js, ONE definition read by
   crossing.js's lane-end stop and courtesy.js's ask). Standers 42 -> 27.
2. **An offer was "open" at the offerer's own following gap; the joiner
   accepts a gap only at `gapFor`'s lag need**, closing speed shed and scaled
   by its caution -- for a timid joiner at rest beside 100 km/h traffic,
   about 330 m. Offers opened at 90 m, were never taken, and withdrew. Two
   implementations of one quantity (CLAUDE.md item 2): now `lagNeed` is the
   one, and an offer to a joiner is open when the joiner would take it.
3. **The player's ask on an acceleration lane had no deadline**, so an
   offerer eased off at GENTLE -- which against a car at rest needs ~270 m
   from 100 km/h; every offerer arrived alongside still doing 60 km/h. On an
   acceleration lane the player now has a joiner's deadline, and their gap
   is a competent driver's (`lagNeed` at caution 1).

Measured (entry-experience.mjs, 150 cars, six seeds): standing 710 -> **38**
car-s, joiners who stopped 6% -> **2%**, longest stand 154 -> **27 s**,
admitted 30.0 -> 32.0 a minute, no crash; at 300 cars standing 7907 -> 426
car-s, longest 45 s. The player stopped at the taper (stranded.mjs, 48
trials): at 150 cars a takeable gap in a median 5.2 s, worst 29.7 (was 16.5
and never, once, in 120 s); at 300, median 9.2 s, worst 55 s, never stranded
(without courtesy, 2 of 48 never). verify-merge section 4 holds both, each
sabotaged.

**Direction 2 -- the through driver moving over a lane -- was not needed and
is not built.** Once the offer and the joiner agreed on what a gap is, the
lift-off came early enough. Moving over remains the right real behaviour on
a road with a free lane beside; it is not a fix this needed.

**THE PROPERTY, A THIRD TIME.** Courtesy's onset (10.12), the joiner's gap
seeking (above), and now the deadline an offer is planned against: in each
the fix was not a harder brake or a longer lane but an earlier START,
measured against the moment the other driver actually needs it. Named once
here as a general rule rather than three local ones: **a driver acting for
another plans against when that driver needs it, not against where the road
ends** -- and when the two disagree about what "it" is, that is the
two-implementations bug, not a tuning problem.

**Not yet built from 10.12**: observation's markable fault (braking hard
with a follower inside the room it costs, having not looked) on the
marking sheet -- built, measured and NOT shipped, 10.16. Whether onset
generalises into the BRAKING axis's missing observable beyond merges is to
be measured, not assumed.

## 10.16 OBSERVATION ON THE SHEET: LATE OFF THE GREEN, AND WHY NOT THE RULED FAULT YET (22 October)

**Shipped: `lateOffGreen`** (marking.js). At the head of the queue, still
sitting when the light has been green longer than a competent observer
could take to notice it. The delay is `noticeAfter` (crossing.js): the
registration delay, doubled when the change lands at the start of a glance
away. Nothing else in the model holds a car at an open green, so it is the
first fault the observation axis owns outright -- what SIMULATOR.md 1.2's
greens work called "the best content observation has ever been offered",
now on the sheet. The line is DERIVED, not chosen: the worst a competent
observer can take, `2 x (REGISTER_FLOOR + (1 - COMPETENT_AT) x REGISTER_SPAN x
(1 + JITTER))` = **1.98 s** -- the competence line every axis is judged
at, the jitter at its top, the glance at its worst. It needed a course
with lights: the compass layout now carries a signal from the same
`signalFor` a map node gets (intersection.js), null unless a leg is lit,
so every existing course is unchanged.

Measured (verify-course section 9, three seeds, five minutes each, every
intersection lit): a candidate weak on observation alone is late off **11
of 11** greens; the same candidate with observation restored, **0 of 11**;
a timid candidate, **0 of 12**; no crash. With the detector switched off,
the check fails; with the line set to a sharp driver's reaction (0.70 s), a
sound and a timid driver are marked and it fails. **A domain call for the
maintainer**: whether about two seconds is where an examiner marks
"slow to proceed on a green".

**SUPERSEDED THE SAME DAY BY THE MAINTAINER'S RULING -- THE WORLD WARNS,
THEN THE EXAMINER JUDGES.** On the 1.98 s line: "the real marking guide
says score an error after 4-5 seconds waiting but for gameplay purposes we
want the world to wake up to a dawdling driver quickly to keep the user
engaged. let's use 2 seconds for now." Then, on splitting the two: "the
examiner scored error and the impatience of a random driver aren't going
to be identical." So:
- **The world: 2.0 s** -- `HONK_AFTER` (crossing.js), the sound driver's
  patience behind a car that sits when it could go, was 2.5. A GAMEPLAY
  constant, ruled. The horn already covered the green ("anytime a driver is
  blocked when they otherwise shouldn't be", 8 October): that half was
  built.
- **The sheet: 4 s** -- `LATE_OFF_GREEN = UNDUE_AT`, the undue-delay
  standard ITSELF, not a second constant with its value: sitting at an open
  green and sitting at an open gap are one failing, one threshold, two
  triggers; the sheet keeps its own label for why. The real marking guide
  says 4-5 s.
- **The 1.98 s derivation is history.** The maintainer's 2.0 for the world
  landing beside it was coincidence; a later re-derivation matching either
  number is not confirmation of anything.
- **The escalation is the point**: a horn the candidate can still act on,
  then the mark if they do not -- the first place the world warns before it
  judges. verify-course section 9 holds it on a forced dawdler: honked
  before 4 s, they go and are not marked (5 of 29 greens); unwarned, marked
  at 4.0 s (24 of 24); nobody marked under 4 s; a sound or timid candidate
  never. Sabotaged both ways.

**OPEN, for the maintainer -- the mark is now out of reach.** No modelled
candidate reaches 4 s at a green on their own: the poorest observer sits a
median 2.4 s, at most 2.7 s (tools/measure/green-escalation.mjs), because
the registration delay was calibrated on noticing traffic, not on somebody
on their phone. So `lateOffGreen` fires only for a dawdler the driver model
does not yet have, and the observation axis is again without a fault on the
sheet in practice. Whether a distracted driver belongs in the model is a
design question; the escalation is ready for one.

**Built, measured, NOT shipped: the ruled fault (10.12.3)** -- braking
harder than the car behind can comfortably follow, with it inside twice
its chosen gap (the courteous driver's own test), without having
registered it. "Registered" was made a STATE rather than a rating: the car
has been within GAP_LOOK while the driver was looking, for their own
registration delay. (Tracked first by the leg's follower, every fast car
crossing a seam read as brand new; tracked by car, that went away.)

It does not discriminate on the course. Twelve dense drives, every
intersection lit: **sound 4, heavy-footed 6, bold 4, poor observer 6**.
On the course the event -- a stop for a light with a fast car closing
behind -- happens to everybody, and registration is seldom what differs.
A fault that marks a sound driver two thirds as often as a poor observer
would be noise on the sheet, so it was not shipped. Where its supply
actually is: the merge, where a poor observer offers a gap by standing on
the brakes (10.12.1, 10.15) -- on the map, where the sheet does not run.
So it waits on **the sheet on the map** (or a modelled mirror check),
not on more tuning here.

## 10.17 DENSITY SHAPING: SPEND THE CARS WHERE THE PLAYER IS -- the design, before code (22 October)

**Why it is first.** At the cars the phone affords (smooth to about 260-280,
keeping real time to about 340 -- SIMULATOR 1.2.17) the endless highway
gives the player 5.5 cars a minute within 30 m and no gaps to judge, three
reports running; 160 cars over ~31 lane-km is a car every ~190 m of lane.
The same cars in a window a few kilometres around the player are traffic,
for the same step. Measured against the encounter instrument
(sim/encounters.js) -- met, followed/following, gaps judged a minute --
never against the car count. Jay's 5.5 met/min and 0 gaps judged are the
baseline; met/min up with gaps judged still 0 is a PARTIAL success and is
reported as one. following 51.7% / followed 13.5% should move toward
balance as density rises; if it does not, the speed spread is the cause,
not density.

**It does not need LOD.** Retiring a car is removing it out of sight --
what the sim already does when a car leaves at an edge, and everything that
names a car by id already tolerates it vanishing. Inserting one ahead is
placement (10.10): a lane, a place on it, a speed, and room. LOD makes more
cars affordable; shaping spends the ones we have.

**The rules:**
1. **A window around the player, by NETWORK distance**: AHEAD metres ahead
   of them along every lane reachable from theirs, BEHIND metres behind
   along every lane that reaches theirs. Euclidean distance would be wrong
   on the loop, whose far side curves back toward the player.
2. **Retire**: a car outside the window AND out of sight -- beyond the
   farthest the chase camera can show -- AND not the player, not crashed,
   not parked. On the loop the road behind is met again only after a lap,
   by when insertion ahead has filled it.
3. **Insert**: while the map is under its target, at a place in the window
   ahead and out of sight, on a lane the player could reach, at the
   traffic's speed there (the leader's, else the driver's own), only where
   ONE GAP PREDICATE at the COMPETENT standard (caution 1) holds both ways
   -- the lane change's own `gapFor`, read through ONE neighbour query.
   Never a crash, never a car appearing in view. The driver is drawn as an
   arrival is (`driver`, the same streams), so who drives is unchanged.
4. **On the tick, inside `step`, a pure function of the world and the
   player's pose** (10.9). With no player -- watching -- nothing is shaped
   and the world is the world it was, tick for tick.

**Constants, flagged until the encounter numbers say otherwise**: AHEAD,
BEHIND, the out-of-sight radius (derived from the chase camera's widest
view, not chosen). Checked before shipping, enumerated rather than sampled
where it can be: no insertion or retirement within sight, every inserted
car passes the competent gap predicate, nothing crashes, a world with no
player is unchanged, and at the same target met/min and gaps judged rise
against shaping off.

**REFRAMED, 22 October (the maintainer, after 280 cars at 17 fps and 6 met a
minute): LOD AND DENSITY SHAPING ARE ONE PIECE OF WORK** -- the same
mechanism from two ends: simulate cheaply what the player cannot see, spend
the savings on traffic near them. Split, each is measured against the wrong
thing. The one measurement is CARS MET A MINUTE AT A FRAME RATE THE
MAINTAINER CAN PLAY AT, and neither half is done until it moves. The
promotion check and 10.9's determinism stay as gates; insertion is
placement's, as before. (LOD had been downgraded on a desk ceiling that the
phone did not reproduce -- SIMULATOR 1.2.17.)

**STATUS, 22 October: BUILT, NOT ON.** `src/sim/placement.js` (one lane
index by centreline, the lane change's own leadNeed/lagNeed at caution 1),
`src/sim/shaping.js` (the window by network distance over ROADS -- every
lane of one road and direction together -- retire one a tick only at the
target, insert one a tick out of sight, a map's own `traffic.shape`),
wired into `step` and `worldFor`; with no map asking, the world is
identical on every test map (the hash gate). The endless highway's flag is
OFF until tools/scratch/verify-shaping.wip.mjs passes.

What was learned, in order, each found by a check or a trace:
- the window walked LANES through nodes, so the lane beside the player was
  outside it and, from the slip road, the window was the slip road: 121 cars
  retired in the first tick. Now roads.
- a car placed in an acceleration lane's taper overlapped the through lane
  and was struck: no placement in acceleration lanes or bays.
- an approach changer records fromLeg AND fromTo; the index read fromTo and
  missed it in the lane it was leaving: three crashes a run. Now by where
  the car is. No placement crash since.
- the first encounter figures (12-14 met a minute) were partly the crashes'
  queues; corrected, AHEAD 2500 gave 4.4. AHEAD 1500 / BEHIND 600: 17-20 met
  a minute against 2.2-2.6 unshaped, 0 crashes in nine 5-minute runs.
- on test map 1 (a dense grid) shaping HALVED what the player met (21 to
  7-12) and once drained it to 31 cars: on a grid encounters come from every
  direction, and a forward window retires them. Retiring is now a swap (one
  only at the target); a "half the map" rule picked the wrong maps (it
  switched the city off, where shaping had taken met 4.6 to 8.8, and left
  test map 1 on) and was removed. Shaping is per map, as data.
- a placed car short of a bend braked ~5 m/s^2 on arrival: a placement now
  stands only if the car's first decision (whatStops + corner) is within its
  comfortable braking.
- an off-ramp runs beside the lane it leaves for ~100 m on another road: a
  car placed 64 m past the split sat on a highway changer. Now nobody of any
  road within CLEAR_AROUND (10 m).

**OPEN (why it is not on):** verify-shaping still finds followers braking
past their comfortable rate for a just-placed car -- some 21 m behind one
7 m/s slower, a gap the competent lag need should refuse, so the index or
the room test still misses some followers; and with the space check in, met
a minute fell to 3.5 with large run-to-run spread -- the encounter figure is
not yet a stable instrument at 3-minute runs. Both before it is switched on.

**LATER THE SAME DAY (work in progress, tools/wip-shaping.mjs):**
- **The queue by the rule.** Every follower the check caught braking hard
  behind a placed car on the loop was on a route from the SAME APPROACH as
  the placed car: `whatStops` has cars from one approach follow by distance
  along their own paths for the whole path (`shareLane`, from === from),
  past the box and past where an off-ramp splits from the road -- so a car
  placed on the off-ramp 70-180 m past the split was, by the rule, the car in
  front of a car in the curb lane, while the lane index filed them under
  different roads. Placement now checks that queue too
  (placement.js `approachNeighbours`): six cases to one. Whether the sim
  should keep two cars that have taken different exits in one queue past the
  split is a question about whatStops, noted, not changed.
- **The encounter figure depends on the player's pace, and the check's
  driver was wrong.** At 95% of the limit the scripted player sat in a
  platoon at its own speed and met almost nobody, shaped or not. At the
  maintainer's own 119% (he was seen at 119 in a 100) the unshaped loop
  gives 3.6-5.6 met a minute -- his phone read 5.5 -- and shaped gives
  19.2-24.2, overtaking 14.6-17.4 a minute against 3-4.6, 0 crashes. The
  check now drives at 119%.
- **"Who was behind it" is the rules' own question.** A follower now counts
  only if `whatStops` named the placed car its leader at the placement tick
  and it has not changed lanes since: most of the hard braking left was
  drivers who changed lanes in behind a placed car afterwards, their own
  gap choice.
- **A negative result**: placing a car at the speed of whatever it would
  follow within 150 m cut encounters from 19 a minute to 5 and did not stop
  the hard braking -- the placed car still slowed with a slowing leader.
  Reverted.
- **Still failing**: a placed car slows with its leader within a second and
  the driver it was placed in front of is asked for up to 3.6 m/s^2 against
  a comfortable 2.8 (61 car-ticks over two 3-minute drives); and the
  encounter figure swings 5-23 between seeds at 3 minutes -- the instrument
  needs longer runs before it can gate anything.

**ALSO FOUND, NOT SHAPING'S:** at shaped density a highway lane change took
a gap judged 2.84x competent and the next tick had its leader at -0.7 m --
moving onto a car -- then struck a car standing in a slowing curb-lane
queue (seed 2, t 282 s). World wrong, in the lane change; its own item. And
the loop's off-ramps end at the map edge 230-400 m from the loop, inside
the drive camera's sight: cars vanish in view there, as they always have.

**THE TARGETS, WRITTEN BEFORE THE REST IS BUILT (22 October).** The
brief: cars met, overtakes and decisions a minute, on the maintainer's
phone, at a frame rate he would choose. Two findings first, both measured:

- **GAPS JUDGED IS ZERO ON THE ENDLESS HIGHWAY BY DEFINITION.** The
  instrument (sim/encounters.js) counts the player STANDING at a stop line
  (under 0.5 m/s, within 4 m) while a car on a conflicting route comes on.
  The highway has no stop line -- slip roads and acceleration lanes, every
  node free-flowing -- so six reports of 0 measured the venue, not the
  density. The highway's decisions are MERGES JUDGED (joining or changing
  lanes with a car within 30 m of the lane joined), which the instrument
  counted all along and the phone's readout never showed: it shows them,
  and overtakes, from this build. Gaps judged is a junction number, and the
  city is its venue: desk, shaping off 0.2-0.4 a minute, on 0.8-1.0.
- **CONCENTRATION IS NOT EXPENSIVE.** Desk, endless highway, 280 cars, the
  maintainer's 119% pace: step mean 9.1-9.3 ms shaping off, 8.9-9.1 on --
  the same cars doing the same work nearer the player. (The gridlock-era
  "clustering is expensive" was collision debris, SIMULATOR 1.2.18.)

Desk now (today's code, look-away off, 119%, four seeds of 5 minutes,
tools/measure/encounters.mjs cruise): met 7.8 a minute off (6.2-10.0 --
the phone read 9.3-10.2) and 20.9 on (18.2-24.8), x2.7; overtook 6.2 off,
16.0 on, x2.6; merges judged 1.3 off, 2.8 on, x2.2; one crash in four
shaped runs, none unshaped.

**SUCCESS, ON THE PHONE, BEFORE IT IS SEEN** (look-away off, his own
pace, three minutes or more, each map read shaped AND unshaped on the same
build -- a desk-to-phone comparison is made on one map or not at all):

| | endless highway, 280 cars | the city, default cars |
|---|---|---|
| met a minute | >= 2x unshaped (his 9.3-10.2 -> >= 19); desk predicts x2.7, ~25 | >= 1.3x unshaped; desk x1.4 |
| overtakes a minute (overtook + overtaken) | >= 2x unshaped; desk x2.4 | not a target (city lanes) |
| decisions a minute | merges judged >= 2x unshaped; desk x2.2 | GAPS JUDGED >= 2x unshaped; desk x3 |
| frame | fps within 10% of unshaped and sim 1.00x; desk: no cost | the same |

**Partial, said as partial**: met and overtakes up with decisions not up.
**Gates before the flag goes on** (desk, enumerated where it can be): no
car placed or retired within sight; nothing shaping places causes a crash,
over enough runs to see one (the one shaped crash above is diagnosed
first); no follower braked past its comfortable rate by a placement; on
the loop the road ahead of where the player will re-enter is never left
emptier than unshaped (retiring behind must not strip a lap's worth of
road the player is about to meet).

**A CHECK RESTATED WHEN AN UNRELATED FIX MOVED IT (22 October).**
verify-anticipation's courtesy line compared everybody anticipating with
everybody reacting -- two mechanisms against each other (a reacting
offerer waits for the pressing moment; an anticipating one checks behind
first and may hold off for its follower). The lane-change fix (SIMULATOR
26), which touches no line of courtesy, took it from 11.6 against 12.9 s to
13.3 against 12.9 and failed it: which mechanism won depended on how the
traffic happened to fall. Verdict "check wrong". It now holds what the
design claims, the PRESSING RULE alone: the same reacting offerers with and
without it (world.noPressing, a controlled comparison) -- 12.9 against 10.8
s, peak 3.14 against 3.04 m/s^2; the rule deleted, both runs identical and
both lines fail. The general shape, for 10.23's list: a check comparing two
mechanisms reads whichever traffic favoured; vary one thing.

**ON, 22 OCTOBER: THE ENDLESS HIGHWAY IS SHAPED** (map/samples.js
`traffic.shape`), tools/verify-shaping.mjs in the suite. What closed the
gates:
- **The jolts were two implementations of the speed a car wants.** A car
  placed past the box -- an off-ramp -- was built at the speed of the road
  it came from; the step gave it the exit road's limit the next tick and it
  braked at its hardest (8 m/s^2), the driver behind with it: every jolt
  traced was this. The step's exit-limit block is now ONE function
  (crossing.js `exitLimit`) that placement calls too. 52 hard-braking
  car-ticks to 0, and the encounter figure rose with it (13.7 to 21.6 met a
  minute at 160 cars): placements no longer start braking waves.
- **The loop is never stripped** (section 5): the shaped window's leanest
  tenth 106-107 cars against an unshaped median of 32-33; sabotaged
  (retiring, never placing), it starves to 0-4.

**Against the targets, desk, 280 cars, the maintainer's 119%, four seeds
of 5 minutes** (look-away off): met 7.8 a minute unshaped, 18.5 shaped
(12.4-23.4), x2.4 -- target x2, MET; overtakes 7.3 against 16.7, x2.3 --
MET; merges judged 1.3 against 2.35, x1.8 -- target x2, SHORT. So on the
desk the highway is a PARTIAL result: more traffic and more passing, not
yet twice the decisions. One crash in four shaped runs, a lane change
(SIMULATOR IN FLIGHT 26, not a placement). The city -- the gaps-judged
venue -- is not switched on: its gates are not run there yet.

**PREDICTED FOR THE MAINTAINER'S PHONE, before he reads it** (endless
highway, 280 cars, his pace, look-away off, shaped against unshaped on one
build): met ~2.4x his unshaped (his 9.3-10.2 -> ~22-24); overtakes ~2.3x;
merges judged ~1.8x; frame unchanged within noise (desk step 9.1 against
8.9 ms, same cars). If met moves and merges do not reach 2x on the phone,
that is the partial result named above, not a surprise.

**THE CITY, ITS OWN RESULT (22 October), never averaged with the
highway (10.23).** Through the same gates as the highway -- one drive,
tools/lib/shape-drive.mjs, which verify-shaping now runs too -- every gate
passes on the city (nothing placed or retired in sight, no placed car in a
crash, no follower jolted). Measured, desk, default cars, trips across the
grid, two seeds of 5 minutes (tools/measure/shape-city.mjs):

| driver | met a minute, off -> on | gaps judged a minute, off -> on |
|---|---|---|
| keep-right, 95% of the limit | 6.6 -> 10.6, 5.4 -> 14.2 (x1.6-2.6) | 0.4 -> 1.2, 0.2 -> 1.8 (x3-9) |
| the maintainer's style, 119%, overtaking | 7.6 -> 9.0, 7.2 -> 8.4 (x1.18) | 1.2 -> 1.2, 0.8 -> 0.8 (x1.0) |

So shaping makes DECISIONS on the city for a measured driver and not for
the maintainer's own fast, overtaking style -- whose unshaped gaps judged
is already higher, arriving at lines more often. Against the targets
written before building ("at his own pace": met >= 1.3x, gaps judged >=
2x), THE CITY DOES NOT PASS, and it stays off. Not tuned toward them: a
shorter window was tried for his style (800/300 and 600/200 against the
highway's 1500/600) and made both numbers worse (met 7.4-8.2, gaps 0.6-1.0)
with twice the churn and the gates failing at the sight boundary.
**The shape of the whole result**: on the highway shaping puts cars near
the player (met x2.4, overtakes x2.3); on the city it creates decisions for
a driver who drives the way the game asks and not for one who outruns it.
What would move the city for his style is a question, not yet a design:
placement along the player's own route rather than every road ahead.

**AN INSTRUMENT, CAUGHT BEFORE IT WAS BELIEVED (the seventh, 10.23):** the
shared drive's first version never noticed an arrival (no noticeTick), so a
driver on trips reached its first place and stood at the curb for the rest
of the drive "meeting" the traffic going past -- 16 met a minute against the
6.6 the same driver meets moving. Every city number from it was discarded;
the keep-right control reproducing encounters.mjs (6.6, 5.4) is what showed
the corrected drive sound.

## 10.18 A MARK IS WHAT HAPPENED, WHERE, UNDER WHICH SECTION -- the maintainer's examination model, recorded before any code (22 October)

**[CORRECTED 27 October by 10.26, from the real score sheet: the principle stands, the axis does not -- headings are MANOEUVRES on a declared route (heading -> phase -> item -> variant), not kinds of place.]**

The maintainer, verbatim, because the reasoning is the content:

*"when delivering an exam, the examiner is only marking errors within a
certain section. for example our undue delay at green would be under a
heading 'Intersections' and various errors that could occur there are listed
(stopping or slowing too soon/late, failure to observe, stopping position (ie
on a crosswalk or beyond a stop line)). so the markable error at the green
light is not the same error as hesitation merging onto a highway for example.
the interesting part of mastering the delivery of the exam is knowing what to
mark and when. in our example from previous days, hard braking for a late
merge, we saw how the exact same event could occur but the reasoning can be
completely flipped (high compliance driver expects a low compliance driver to
signal, they don't until late and then braking is required as a defensive
measure versus a low skilled driver not noticing a merge signal until late or
not leaving room). so the marking should extend beyond 'did something wrong
happen' into 'specifically what happened and where, according to your marking
guide' (note: we should flesh out exactly what every mark means and present it
to the user through an official in game marking guide that they can pull up at
any time. the balance to this would be the test still continues in the
background, meaning you could miss a mark or intervention if you are searching
too long)"*

**1. A mark is (what happened, where, which section applies) -- not a fault
kind.** The sheet today treats faults as properties of the world
(`lateOffGreen`, `wideLine`, `rollingStop`). The marking guide is SECTIONAL:
the same observable is a different mark by location -- slow off a green sits
under Intersections, hesitating on a merge is another entry entirely. A
structural change to the sheet, with a retrofit cost that grows with every
fault kind added: the reason to scope it now though it is not built.

**2. Attribution is part of the mark, and it can invert.** The hard brake at
a late merge: one physical event, opposite correct marks -- a compliant
driver braking defensively because somebody else signalled late, or a poor
observer who did not leave room. The model already knows which (it holds both
drivers' axes); the question is whether the marking layer can see it, and
whether the player can.

**3. Signalling is now a PREREQUISITE, not a plan item.** Point 2 is a fair
test only if the player can observe what tells the two cases apart: did the
other car signal, and when. The driver model has no signalling. Without it,
attributing that hard brake is a coin flip, not skill. Moved from PLAN to a
named dependency of the sectional marking work.

**4. THE IN-GAME MARKING GUIDE IS THE INTERLOCK.** The cold review in
September found the four jobs never actually compete; 5.7 called that
interlock the thing the whole design rests on, and it was never built because
marking has no attention cost. A guide the player can open at any time, while
the drive goes on underneath, IS that cost: searching it means possibly
missing the next event. The missing mechanic arriving as a side effect of a
feature wanted for its own reasons -- recorded as resolving a known hole, not
filed as a UI idea.

**Not started.** Order holds: LOD and density shaping first. One item scoped,
at a natural break and with numbers: whether `sectionSheet` and `detect.js`
can express marks keyed by section and location, or whether that is a
rewrite of the sheet.

**SCOPED, 22 October -- numbers, no code:**
- **`detect.js` (281 lines): an EXTENSION, not a rewrite.** Pairing already
  keys on an opaque place (`intersection`, compared only for equality), a
  category (`m.what` against `fault.trait`) and time (promptness). A sectional
  mark changes the place to a location key and compares the category with a
  (heading, item) id: the two pairing conditions, about 10-20 lines.
  Precision, recall, promptness and FALSE_COST carry over unchanged.
- **`sectionSheet`: a name clash to resolve.** Its "section" is a stretch of
  the ROUTE (three intersections, sized to free recall), not a marking-guide
  HEADING; the two need separate names. Its directions half (calls, blame) is
  route-leg based and unaffected.
- **`marking.js` (333 lines) is where the cost is.** 36 references to the old
  compass course's route, trip and candidate machinery, and it runs only in
  those worlds; the live exam (`exam.js`, on the map) deliberately has no
  marking. Sectional marking = porting the fault producer to the map AND
  giving every fault (heading, item, place, attribution) -- 6 kinds today.
- **No standalone grading check survives**: verify-detect went with the old
  engine; detect.js is checked only through verify-course's sheet. A
  sectional sheet needs its properties back (marking everything loses,
  marking nothing loses, catching more never scores worse).
- **Signalling** remains a separate prerequisite for the attribution half.

## 10.19 A GLANCE IS NEVER BLINDNESS, AND IT IS TAKEN WHEN IT FITS (22 October)

The maintainer, on the crossroads crashes at 260 cars (SIMULATOR item 15):
*"it's unlikely a driver would ever look away for 2 full seconds while
following another car into a turn, only an extremely negligent driver would
look towards their info screen or phone here. a look away of that time
would be coasting on a highway or at least a straight stretch of road that
doesn't anticipate steering actions or braking. my instinct tells me that
looking away as it is now is too exaggerated or being implemented randomly
rather than when a driver might actually look away completely. you are spot
on about the peripheral vision doing work in the animal brain
automatically."*

**What it was, diagnosed before any change.** A glance was TOTAL blindness
-- the picture from its start, every car carried forward at its old speed
(crossing.js `seenBy`) -- and it fell on a fixed phase every LOOK_EVERY
(6 s) whatever the driver was doing. Two separate wrongs, and the ruling
names both. Repro: test map 1 at 260 cars, look-away on, 12 crashes in ten
minutes over two seeds, every one a rear-end with the follower looking away.

Built in the ruled order, the repro measured after each so it is known which
part did the work, and held by `verify-lookaway`:

1. **Peripheral vision.** The car ahead -- in the lane, or in the queue by
   the rule `whatStops` follows -- LOOMING past a threshold brings the eyes
   back a reaction time later: the question is asked of the world
   REACTION_FLOOR ago, so it needs no state and the world replays exactly.
   Looming is the rate the image widens, width x closing / gap^2;
   `LOOMING` = 0.005 rad/s is a FLAGGED design constant from the perception
   literature's detection threshold (order 0.003-0.01), never tuned to the
   crash rate (4.4). Result: **12 crashes to 0**, on four seeds and on the
   loop (280 cars, the seed-1 crash earlier); 0 too at 0.01, the top of the
   band, so the result does not hang on the pick. Not a disguised off
   switch: a moving driver looking away is still away **85%** of the time.
   Sabotaged twice -- the threshold at infinity (crashes return: 8) and a
   cue that always fires (the "still away" line fails). verify-observation
   section 3 held that the glances are most of the crashes, true only of a
   blind glance: verdict "check wrong", restated as blind / edge of the eye /
   nobody looking away, and its sample cut by measurement to fit its time.
   **Cost, on desk only** (10.4: not believed until a phone says so): with
   no crashes the step with look-away on is still about 1.6x off -- the
   perception machinery itself (a carried picture and its neighbour index
   per glance start), no longer gridlock.

2. **Demand gating.** A glance falls DUE on the old schedule and is TAKEN
   only when the road leaves at least its length before the driver must act
   (`timeFree`, from signals the step already held): none while braking
   firmly for anything (the brake lamp's threshold), mid lane change, inside
   a box, or stopped at a line judging a gap; all the time there is stopped
   at a red or queued behind a stopped car; moving, the time headway to the
   car ahead and the time to the next line (past the box, to the end of the
   stretch -- short of the next line, so never more than the truth). It
   waits until it fits. One field of memory per car (`glanceAt`), set in
   the step, so the world still replays exactly; a never-stepped probe reads
   the schedule as it falls, which is what a stepped car does on a road that
   asks nothing. **Alone, with the glance still blind: 12 crashes to 0**
   (two seeds, ten minutes). Where the long glances (1.5 s or more) fall,
   any time against gated: box 6% -> 1%, near a line 7% -> 4%, following
   under 2 s 29% -> 12%, clear road 57% -> 83%. Short glances still happen
   behind a car -- "short glances or none" is that, by construction, since a
   glance is taken where its own length fits. So each part ALONE removes the
   repro's crashes; both are kept because each is the ruling.
   `glanceAnyTime` joins `noPeriphery` as a check's controlled comparison,
   never a setting. Two "check wrong" verdicts: verify-observation's blind
   control must be the old glance (blind AND any time) or it measures the
   gating instead; and verify-lookaway's six 120-s runs timed out under the
   suite's load -- cut by measurement (the old glance crashes at 19, 26, 54,
   54, 95 s on seed 1), and a first cut that put a share ON its floor (75% at
   60 s against 83% at 120) was undone rather than the floor moved.

3. **Skill.** Each due glance, a driver either waits for the road or does
   not, and the chance of NOT waiting is their observation deficit -- one
   draw per glance from their number and when it fell due (`heedsRoad`),
   so nothing new is chosen and the world replays exactly. The instrument
   that shows it is not "glance time under demand" -- by that a sound
   observer looked worse than a poor one (41% against 21%), because a
   0.35 s glance fits behind a car at ordinary headway, which is the
   ruling's "short glances" -- but whether the glance FIT when it was taken
   (began in a box, or outlasted the headway or the time to the line),
   stated in the measure (`glance-fit.mjs`), not read from `timeFree`.
   Unfit glances, sound / poor: any time 8% / 28%; everybody waiting 0% /
   1%; as built 1% / 17%. With the glance blind the skill puts crashes back
   (4 in 300 s, seed 1); with the edge of the eye, none -- which is the
   split the ruling describes: a poor observer looks away at the wrong
   moment and is saved, late, by the periphery. `heedAll` joins the
   controlled comparisons.

**Each part alone, measured as a RATE** (four seeds of 300 s, twenty
minutes each, `lookaway-crashes.mjs` with its NOPERIPH / ANYTIME / HEEDALL
switches): the old glance 18 crashes; peripheral vision alone 1; gating
alone 3; all three 0. Each part does most of the work and neither alone
reaches zero. verify-lookaway first asserted ZERO for each part alone on one
short run each, and the skill broke it: `worldFor` warms the world before a
check's flags apply, so a change to how anybody glances changes the warm-up,
and at 260 cars traffic is chaotic -- one crash against none in 120 s is a
different sample, not a different mechanism (the sim is deterministic: the
same configuration twice gave the same count). CLAUDE.md item 3's implied
sample size. Verdict "check wrong": the parts are now held by their
MECHANISMS over thousands of glances -- the share of glance time the looming
cue returns (14%, between 5% and half), where long glances fall, which
glances fit -- and crashes only where far from a floor: the old glance 5 on
the repro's windows against the world as built's 0.

## 10.20 ANTICIPATION IS ONE PROPERTY, AND FIVE SITES READ IT -- the design, before code (22 October)

**[A GAP IN THIS PROPERTY, found 27 October (10.30 point 4): ANTICIPATION HAS NO SAY IN LANE CHOICE FOR A TURN. Every driver starts moving toward the lane their next exit needs at the same moment -- the seam onto that intersection's approach -- so a good driver and a poor one are identical in the one place the property should most obviously apply. The property was generalised across these sites and declared general; this site was missed. A gap in the property, not a feature request.]**

10.15 named it: what a driver does about something is set by WHEN they
start, and the observation axis says when. The maintainer's look-away
ruling asked for it again ("make anticipation-versus-reaction a general
property of the driver model") and the review after 10.19: "build it as one
property the four derive from, not a fifth rule that agrees with them".

**What the sites read today -- five statements of one thing:**

| site | today |
|---|---|
| a joiner seeking a gap (lanechange.js `gapTarget`) | observation >= COMPETENT_AT, yes or no, per DRIVER |
| an offerer checking behind first (courtesy.js `offerOf`) | the same gate |
| when an offerer starts (`offerOf`, `courtesyPlan`) | the registration lag after the ask, the same plan for everybody |
| a glance's timing (crossing.js `heedsRoad`, 10.19) | a draw per glance, the deficit its odds |
| (not in scope) getting over for a turn | everybody from the node |

Two of them are driver-level yes/no gates, so a driver at 0.74 never scans
and one at 0.76 always does; one is a per-occasion draw; one is the same
for everybody. Four rules that roughly agree.

**THE PROPERTY.** On any OCCASION that will need them, a driver either
ANTICIPATES -- acts from the moment the need became KNOWABLE -- or REACTS --
acts from the moment it became PRESSING; either way after their
registration lag (`notices`), which the axis already holds. The chance of
anticipating is their observation soundness, drawn ONCE PER OCCASION from
their number and the occasion's key, so a world replays exactly and nothing
new is chosen: the chance IS the soundness. One function in core/driver.js
(`anticipates`); each site says only what its occasion, its knowable moment
and its pressing moment are.

Per occasion rather than per driver, deliberately: attention fluctuates, and
the glance (10.19) already works this way and is measured. A weak observer
then anticipates SOMETIMES -- less often the weaker they are -- which is a
rate a player reads over a drive, as knowledge's misreads are.

**The sites, derived:**

1. **Glance timing** -- occasion: the due glance. Knowable: the road's
   demand (`timeFree`): anticipating, they wait until the glance fits.
   Nothing makes a glance pressing, so reacting is taking it on the
   schedule (the periphery catches what it can). This IS `heedsRoad`,
   restated through the one function -- no change in behaviour expected.
2. **Gap-seeking** -- occasion: this join (the node and path). Anticipating:
   the joiner picks a gap and adjusts speed to meet it (`gapTarget`).
   Reacting: it accelerates to the traffic and takes the hole beside it.
   Replaces the driver gate. EXPECTED to move: sound drivers now fail to
   scan their (1 - soundness) of joins and weak ones sometimes scan.
3. **Courtesy onset** -- occasion: this ask. Anticipating: from when the ask
   is knowable (`ask.since`) plus their lag, planned against `ask.by` --
   today's behaviour. Reacting: from when it is PRESSING -- the last moment
   a lift at their own comfortable braking still opens the gap by
   `ask.by` -- plus their lag; past that moment comfortable is no longer
   enough, so a reacting offerer brakes harder than it, which is 10.12's
   "a reacting one brakes late and sharp", derived rather than authored.
   NEW behaviour; measured on the merge and verify-courtesy.
4. **Checking behind** -- the same occasion and the same draw as 3: an
   offerer who anticipates the joiner anticipates their own follower too,
   and does not offer a gap that brakes the follower past its comfortable
   rate; one who reacts offers anyway. Replaces the driver gate.

**What stays elsewhere, and why.** Coming up to speed before moving over is
KNOWLEDGE (knowing what the lane is for), not anticipation. The blind-spot
check (`missed`, lanechange.js) is whether a look happened, not when a plan
starts. Getting over for a turn has an onset and is a candidate fifth site:
not in the ruling's list, left for a measurement to argue for.

**How it is checked.** One function, so its law is checked once: the share
of occasions anticipated tracks soundness (properties over many drivers and
occasions), a fully sound driver always anticipates, a fully deficient one
never, and the same occasion asked twice gives the same answer. Each site:
a controlled comparison -- everybody anticipating against everybody
reacting, on the same world -- must show its own consequence (gaps met, a
gentle lift against a sharp one, a follower spared, glances that fit), and
sabotage of the one function must fail every site. The merge
(entry-experience, stranded) and courtesy numbers are re-measured and
reported, not tuned.

**BUILT, 22 October.** `anticipates(d, key, world)` in core/driver.js;
the glance (`heedsRoad`), gap-seeking (`gapTarget`), courtesy onset and
checking behind (`offerOf`, one draw per ask) all read it, and the two
COMPETENT_AT gates and the glance's own draw are gone. Measured
(anticipation.mjs, endless highway, 150 cars):

- **The law**: share anticipated against soundness within 0.007 over 4000
  occasions at each of five levels.
- **Courtesy onset, varied alone**: a reacting offerer starts 1.3 s later
  (11.6 -> 12.9 s after the joiner came onto its lane) and brakes a little
  harder (3.02 -> 3.14 m/s^2); with the reacting branch deleted the same
  comparison reads -1.7 s and equal peaks. The pressing moment binds: 291 of
  348 evaluations held a reacting offerer back.
- **Gap-seeking, as drawn**: sound observers (0.9+) planned 32 of 36 joins,
  poor ones (under 0.5) 7 of 32.
- **Checking behind**: offers that braked a follower past its comfortable
  rate, 6 of 137 anticipating against 11 of 108 reacting (four seeds) --
  measured, not held: too few per seed.
- **The merge, as drawn, against the old gate**, eight seeds: joiners who
  stood 37 (3%) gate against 42 (4%), longest 42 s against 48 -- within
  chance. Nothing to tune.

**A CHECK PASSED WITH ITS MECHANISM REMOVED, AGAIN (item 3).** Section 2
first varied every site at once, and with courtesy's reacting branch DELETED
it still passed: reacting joiners stop planning, and that moved the offers'
onset by itself. The controlled comparison now varies one site at a time
(`world.anticipate` by the occasion key's prefix -- `{ ask: "none" }`),
and the floors are set between the real effect and that null. The general
lesson: a controlled comparison of a shared property has to vary one
consumer at a time, or one consumer's consequence passes for another's.

**What it surfaced, in other code, both traced to a cause:**
- **World wrong: a standing merge deadlock** (lanechange.js `mergePlan`). A
  joiner at rest second in the queue began its merge two metres behind the
  standing head joiner; mid-change it followed the car ahead in the lane it
  was leaving and could not move, while holding the lane it was entering --
  and the head joiner could not merge with it there. Over 100 s, the through
  lane queued behind (seed 4). A joiner at rest now merges only from the
  head of its queue. Present in the old code too; reached by new
  trajectories.
- **Check wrong, twice, in verify-merge section 4.** (1) The stranding
  trial placed the player inside a joiner still mid-merge out of that spot
  (its route already the road's, so not cleared) -- both waited for two
  minutes. Now a car still leaving the lane is cleared too. (2) "The worst
  wait with courtesy at most half the worst without" compared one extreme
  trial with another out of sixteen; new trajectories drew a new sixteen and
  it failed 33 against 53. The OLD courtesy code on the same situations gave
  the same waits trial for trial, and the old code's own seeds 5-8 halve only
  11 of 25 tail waits -- its pass was the sample. Restated over four seeds:
  the tail's total wait with courtesy over without, measured 0.35 old, 0.49
  new, 0.94 with the player's deadline removed; the line is 0.7. Sabotaged
  (no deadline 0.99, no courtesy 1.00).
- **World wrong, mine, found reading the baselines: the warm-up never moved
  `glanceAt`.** The rebase after warming moves every instant a driver carries
  back to the new zero, and `glanceAt` (10.19 step 2) was not among them, so
  it lay in the future and nobody glanced until the clock caught up -- 20 s
  on test map 1, 95 s on the endless highway, in every world #/map built
  since bf667fb. It showed as the highway's step "climbing" from 8 to 30 ms
  with look-away on: the glances switching on late. On the repro it cost
  about a tenth of each verify-lookaway window and about 7% of the 300 s
  rates, equally in every configuration; re-run on the fix the repro holds
  (the old glance 6, as built 0). verify-lookaway section 4 now holds
  glances from the first second on the map with the longest warm-up --
  every section before it skipped its first ten seconds on the map with the
  shortest, the boundary that hid it (CLAUDE.md item 4). Sabotaged.
- **Open, recorded not fixed**: for a player standing at the taper,
  courtesy fails in a third to a half of the long waits, in the old code and
  the new -- the driver asked is too close to brake from 25 m/s to the gap a
  car at rest needs; it passes and withdraws, and the next is asked.

## 10.21 A TIDY CAUSAL STORY, TESTED AND DISCONFIRMED -- the junction is not one lock (22 October)

**A negative result, recorded as one.** On the maintainer's report that no
car crossed a stop line until a late car had cleared the whole crossroads,
the hypothesis given was specific and plausible: a car in the box at an
unexpected time or path defeats the conflict test, which falls back to
blocking every approach -- a safe default per decision and a throughput
disaster in aggregate. It was tested before anything was built
(tools/measure/box-hold.mjs, green-holds.mjs, test map 1's signal, 260 cars,
look-away off, five minutes): of 7,259 head-car-ticks standing at a line
the light let go, **0.1%** were held by a car in the box whose path did not
cross theirs. Every hold is a real path conflict. **The rule is right, and
right-of-way logic was not rewritten.**

What the test found instead was better than the bug it was looking for: a
skewed approach whose right turn drifts a full lane left before it turns,
so the conflict logic was correctly reporting a collision the GEOMETRY
should never have made possible (SIMULATOR IN FLIGHT 21, 22). And on the way
the instrument itself was wrong once -- reading the actuated light without
its live state put perpendicular approaches on green together -- which is
why it was checked before its table was believed.

The lesson is the method, not the junction: a confident causal chain from
one observation is a hypothesis with a cheap test, and the test comes
before the build.

## 10.22 RIGHT OF WAY IS A MOBILE PRODUCT -- a constraint, not a preference (the maintainer, 22 October)

**The maintainer's phone is the target device and the only one that
matters. A PC/console version is a SEQUEL, not a parallel build** (his
framing: Helldivers 1 against Helldivers 2). Two products were laid out
with the numbers and rejected. This decides arguments before they start.

**The reasoning, because it is the part that will be re-litigated:**
- **The phone is about 3x slower than the desktop at the same work, not
  an order of magnitude**: 24.6 ms a step at 280 cars on the endless
  highway against ~8.8 on the desk. Single-threaded JavaScript in the same
  browser engine; neither uses more than one core.
- **3x buys almost nothing the player feels.** 160 -> 280 cars (+75%) moved
  met a minute from 5.5 to 6.0 (+9%); tripling the budget might reach ~13.
  What the maintainer wants has never been compute-limited in anything
  measured; it is limited by WHERE the cars are (density shaping, 10.17).
- **Two codebases would make the desk/phone divergence permanent.** Days
  this week went to desk numbers not matching the phone -- the ceiling
  table, the neighbour index, jam-is-cheap, the cross-map look-away ratio.
  That would stop being a nuisance and become the project's structure.

**THE SCOPE RULE: a feature that only makes sense at car counts a phone
cannot reach belongs to the sequel.** Apply it when scoping anything.

**The agreed order** (performance focus continues on this basis):
1. **Density shaping** -- in flight: costs nothing, changes what he feels.
2. **LOD** -- 280 simulated, 4 in view: the budget multiplier, worth more
   than the hardware gap.
3. **Engine cleanup** -- a legitimate work item, not opportunistic tidying.
4. **Scalable fidelity settings** -- last, once costs are known rather than
   guessed. Look-away becomes one of these dials.
Not 3 or 4 until shaping and LOD are done.

**AMENDED, 27 October: cleanup went ahead of LOD, and LOD is parked.**
This order was set before LOD's size was known. Measured before any of it
was built (SIMULATOR 1.2.19), LOD was worth about a fifth of the step for
about a week's work, and its headroom had nowhere to go: shaping had
already put about half the fleet within 700 m of the player, the shaped
highway holds no more cars, and more cars bought nothing the maintainer
feels. Two items of fixed per-tick work -- shaping's pass over the fleet
per placement try, and contact detection (with the pose under it) -- were
exact, hash-checked and cheap, so they went first: -10% on the highway.
**Performance work then stops** (the maintainer): every big win of the
month was a broken thing, and those are fixed. 4 (fidelity settings) waits
for a reason to spend headroom, as LOD does.

**A CORRECTION TO THE FIGURE GIVEN FOR 3, before anybody acts on it.** "~88
us per car per tick against an achievable 5-10" is 24.6 ms / 280 cars --
the arithmetic is right and the premise is not: the step is NOT per-car
work at a fixed cost a car. Measured on the desk, endless highway, look-away
off (SIMULATOR 1.2.17's ramp, not gridlock-confounded): 17 us a car at 60
cars, 21 at 150, 28 at 260, 34 at 400 -- the cost a car doubles as the fleet
grows, the neighbour reads on long nodes growing with how many cars share a
node. So the average mixes a fixed part with a superlinear one: it
overstates what tidying per-car code alone can win and understates what the
neighbourhood term is worth. Before 3 starts, the step is SPLIT and measured
-- fixed per-car work, the neighbour term, per-tick overhead -- and the
3-5x is predicted from that split, in writing, before any of it is built.

## 10.23 EVERY TIME WE WERE CONFIDENTLY WRONG THIS WEEK, AN INSTRUMENT WAS THE CAUSE (22 October; items 7-12 added 27 October, 13-14 on 28 October)

**The general finding about how this project fails.** Six times in a week a
confident conclusion was wrong, and every time the simulation was fine and
the thing measuring it was not. Scattered across 10.3, 10.4 and the
SIMULATOR log they read as bad luck; together they are the pattern:

1. **verify-trucks** passed with its own mechanism removed (10.3).
2. **Standing time** counted what the sim did, not what a driver met.
3. **The inlined profiler** measured its own overhead into the step.
4. **The frame line** printed a MEDIAN frame beside the MEANS of its parts,
   and a 57 ms gap that nobody spent was chased (SIMULATOR 1.2.17).
5. **The ceiling table** multiplied desk steps by one phone factor, which is
   not constant and differs by map (SIMULATOR 1.2.18).
6. **The merge counter**, the most consequential: it read a lane change as
   the route's `from` lane changing, so it caught 11 of 20 real lane
   changes near a car and 3 of 9 on the open road -- and its zeros were
   quoted for a week as evidence about the world (SIMULATOR 27).

7. **The shared drive that never noticed an arrival** (22 October, 10.17):
   a driver on trips stood at the curb "meeting" the traffic going past.
8. **The promotion gate (27 October), caught before it was used.**
   `admissible` was written as the one test anything entering the full
   simulation asks, LOD's promotion included. Asked of untouched full
   traffic it refused 46-57% of cars on the space rule alone (the car in
   the next lane) and a few percent more on headway: a placement standard
   standing in for a promotion one -- the proxy pattern (CLAUDE.md item 2)
   inside a gate. Found by asking the gate about traffic that had not been
   through the thing it gates, which is the cheap sabotage for any gate:
   **before trusting a validator, feed it the cases that must pass.**
   (10.9.)
9. **The world hash that never shaped (27 October).** world-hash.mjs, the
   gate for "nothing moved", runs with nobody at the wheel -- and density
   shaping runs only with a player, so a change to shaping would have
   hashed identical whatever it did. The driven hash (shaped-hash.mjs)
   closes it; and since ordinary traffic no longer crashes, contact
   detection is compared on worlds with contacts made on purpose
   (contacts-dump.mjs). A gate is checked for whether the code under it
   RUNS in the gate's run, before its "identical" is believed.
10. **A plausible cause accepted without testing that the cause was
    present (27 October) -- a different shape from the nine above: not a
    bad instrument, an untested explanation.** verify-walkers struck a
    careful pedestrian once the candidate's checks were on, and the
    explanation reached for -- and agreed by the maintainer and the project
    lead -- was the feature working: a driver at their mirror is not watching
    the crossing. verify-walkers runs with PERCEPTION OFF, where a check
    cannot change what any driver sees; the striker was a sound observer
    with no look in the three seconds before; and with the checks off,
    another seed strikes one too (tools/measure/ped-strikers.mjs). Two
    people agreeing is worth nothing against one measurement. **Before an
    explanation is accepted, check that its mechanism was active in the run
    it explains.**

11. **The pedestrian with three manners, counted as two (27 October).**
    verify-walkers, and the measure built to diagnose it, counted every
    pedestrian not "heedless" as careful; peds.js has three manners, and a
    TRUSTING person -- who steps off whenever nothing is on the paint and
    does not pause for a car, by design -- struck by an AI car was filed as a
    careful one struck. One of the two "strike modes" briefed for fixing was
    the model working as designed. The other was real, and found only by
    asking whether the pedestrian was absent from the driver's consideration
    or present and filtered: present, on the path, held by the near-half
    rule -- and hidden from a TRUCK's driver by the truck's own body, the eye
    placed 1.5 m ahead of centre (a car's front) inside a 9 m box that the
    sight test counted as an occluder.
    **Both mechanisms the project lead proposed for it were wrong** -- the
    car ahead hid nothing (an ordinary car), and nobody was deferring to a
    leader -- **and the fix brief, written at the project lead's
    instruction, overstated the problem because it rested on the miscount.**
    The pattern now has a name: plausible mechanisms supplied that turn out
    not to be active; the only thing that has caught it is testing them
    rather than accepting them (items 10 and 11; SIMULATOR IN FLIGHT 32).

12. **A proxy that drifted from its target (27 October), the fourth of this
    shape** -- after the frame readout's median beside its parts' means
    (item 4), the merge counter reading a lane change as the route's `from`
    changing (item 6), and verify-walkers' two manners (item 11).
    verify-signal's "a driver who decided at the amber is never then
    braking hard for the line" counted hard braking while `amberGo` was set:
    a proxy for "approaching the line" that stopped being one the moment
    the state outlived the approach -- it lasts to the next intersection, and
    caught a car 190 m on braking for a cut-in. **The rule: a check that
    measures a proxy must assert that the proxy still tracks its target, or
    it quietly stops being a check.**

13. **An underived constant asserted by a check (28 October), the third
    this week by the project lead's count.** verify-lanes asserted that over
    60% of drivers in the wrong lane for their turn get over. Nobody derived
    60%; it sat a few points under the figure measured when the check was
    written, so a two-point move from an intended change (the candidate's
    checks) failed it while a real collapse a few points further would have
    read the same. Replaced by a controlled comparison -- checks on within a
    margin of checks off -- plus an absolute floor on checks off so the pair
    cannot drift down together, both set from the measured spread of the
    check's own statistic (SIMULATOR IN FLIGHT 31). **The rule, beside item
    12's: a bar is a claim about the world; it states where it comes from --
    a derivation, a measured spread, or a line nobody would accept -- or it
    is not a bar.**

14. **An instrument whose default contradicted what it was believed to
    measure (28 October), the worst of these: it put a wrong claim in front
    of the maintainer.** tools/scratch/hashes.sh -- the 17-hash gate -- calls
    world-hash.mjs and shaped-hash.mjs, and both run with the candidate's
    checks ON unless CHECKS=0; the gate never sets it. So "the shaping fix
    read identical with checks off" was a checks-on reading, relayed as a
    statement about the default world. Re-run with CHECKS=0 it was not
    exact there either (one shaped world moved, test-highway, 325 -> 337
    placements). Found only because a trace of the merge fix built its world
    with checks off and disagreed with the gate. **The rule: state the
    instrument's settings alongside its result, every time** -- which map,
    how many cars, which seeds, which switches, and what the default of each
    is. "Identical with checks off" means nothing without knowing which mode
    the script ran in.
15. **The project lead's mechanism, wrong for the fourth time this week
    (28 October), and an instrument that watched the wrong half.** With the
    candidate's checks on, keep-right moves fell 62% (415 -> 157) against
    overtakes' 17%. The mechanism handed over to test: a low-urgency move is
    dropped when the looks outlast its gap, where an overtake is retried.
    WRONG. On the exit stretch `exitStep` called `attempt`, which answers a
    decided change with its looks begun (`lcPrep`) and the route unchanged;
    `exitStep` tested only the route and returned the driver it started
    with, discarding the looks. They restarted every consideration and never
    completed, so every exit keep-right move with checks on was made by a
    driver who had SKIPPED their checks (23 of 23 over two seeds) -- the
    opposite of "looking first delays a move". The first instrument written
    for the trace (keepright-trace.mjs) watched the approach's hog spells,
    the half where keep-right ROSE, and would have supported the comfortable
    reading; keepright-exit.mjs split the moves by stretch and by who looked.
    The same lesson as items 10 and 12, from the other side: **a mechanism
    is a hypothesis however it arrives, including from the project lead, and
    is tested in the run it claims to explain.** Predictions written before
    the fix, results (four met, one partly) in SIMULATOR IN FLIGHT 31.

16. **A figure quoted from memory rather than re-measured (28 October).**
    A split of verify-compliance was asked for "because it is roughly 950 s
    of a 28-minute suite". 950 s was its time BEFORE the 22 October fix
    that ran its runs in worker threads -- TESTING.md already said so.
    Measured that morning: 465 s of a 1,581 s wall, 2.5% of the
    check-seconds, on a CPU-bound runner where the wall follows total work.
    The split would have cost nothing less. The same shape as items 10 and
    15, one step earlier: not a mechanism accepted untested but a NUMBER
    accepted unmeasured. **A figure that justifies work is re-measured
    before the work, whoever quotes it.**

17. **Two definitions of who is in a lane -- and the earlier fix made them
    agree on the wrong one (28 October; IN FLIGHT 38).** The project's most
    reliable source of bugs, at least the fourth instance (CLAUDE.md item 2):
    the following model (whatStops) counts cars from the same leg as sharing a
    lane for their WHOLE paths, past where the paths split; the exit-stretch
    lane change counts them by the leg they are going to. 15% of keep-right
    moves on the highway's exit stretch began inside the side-ahead floor and
    ended in maximum braking -- every instrument missed it, because
    verify-shaping blamed the placement for it. Traced, the FOLLOWING model
    was the wrong one: the "leader" was a median 30 m sideways, on the ramp,
    and phantom leaders like it are 10-27% of all following. The 22 October
    fix for placement had been to make placement AGREE with whatStops -- two
    readers made consistent with a wrong definition -- the bug propagated under
    cover of the principle. And the reader that was right was the newer,
    smaller one (the exit-stretch lane change); the "obviously correct" central
    function was the deviant. **THE RULE, STATED SO THE WEAKER VERSION CANNOT
    COME BACK: FIND WHICH DEFINITION MATCHES THE PHYSICAL WORLD, THEN SHARE
    THAT ONE. Agreement between readers is worthless if they agree on a
    fiction.** "One shared definition" is the second step, never the first; and
    no reader is presumed right for being central or old -- each is checked
    against where the cars physically are.

18. **The reader that does not read the quantity: a shortcut that filters
    the candidates BEFORE it is computed (28 October; IN FLIGHT 38).** The fix
    for who is in a lane changed every reader a sweep could find -- and the
    first full run of it put 50 crashes into a shaped highway world that had
    none, and 1-3 into four unshaped ones. The cause was a fifth reader the
    sweep could not find: whatStops reads its candidates through a sorted-index
    shortcut (crossing.js takePlain, 22 October) that walks the cars from my
    leg, keeps only the one that presses hardest and drops the rest as never
    the answer. It counted every car from my leg -- the OLD definition -- so a
    car gone up another route was the only one passed on, whatStops (rightly,
    now) refused it, and the car really in front had already been discarded
    and was driven into. The shortcut never mentions the definition; it
    PRE-FILTERS before the definition is applied. **To find these, the
    question is not only "who reads this quantity" but "WHAT SELECTS OR
    FILTERS THE CANDIDATES BEFORE THE QUANTITY IS COMPUTED". Indexes, caches,
    early exits and fast paths are where an old definition hides** -- each is
    exact only while it agrees with the definition downstream of it, and the
    agreement is nowhere written down. And it was found by the CRASHES, not by
    the sweep: the sweep came second. A change to a definition is not checked
    by grepping for the definition; it is checked by running the world and
    looking for what the change made impossible happening anyway.

19. **Small samples, the fourth trap this week -- and checks that assert a
    world that does not exist, the fifth (28 October).** Two ten-minute city
    runs gave the lane-occupancy branch 5 crashes against main's 1 over 14
    seeds -- "about a 4% chance" if the rates were equal -- and a mechanism
    hunt began. 28 runs each gave 7 against 5, and the 14 new seeds 2
    against 4 the other way: noise. The fourth small-sample trap in a week,
    after the single-seed verify-walkers, the three-seed verify-lanes bar and
    the one-pass verify-drive. **A difference between two worlds is settled
    by enough runs that a reversal on fresh seeds is unlikely, BEFORE a
    mechanism is chased; "4% by chance" from 14 runs, selected after the
    fact, is a reason to run more, not a finding.** And the check that set it
    off asserted something unfounded: verify-rivals' "nobody overlapping"
    asserts ZERO crashes over seeds 2 and 3, while main itself crashes about
    once in five or six such runs (5 in 28 at 150 cars with rivals) -- it
    passed on the luck of its seeds. The fifth check found this week
    asserting something no measurement supported. **A zero-event assertion
    is a statement about a RATE; it needs the rate measured, and a sample
    large enough that zero would be unlikely if the rate were what it
    replaces.** Not restated yet, deliberately: IN FLIGHT 40 may change the
    city's crash rate substantially, and the honest assertion depends on what
    it becomes.
    **A CORRECTION ON THE RECORD, kept rather than overwritten:** the crash
    on seed 2 was first described here and to the project lead as "a 0.1 m
    overshoot while braking at maximum". Tick by tick it was not: car-104 was
    RELEASED by the right-of-way rule a tick before its line while still
    braking at its maximum, and accelerated across. Released mid-emergency-stop
    and overshot-while-held are different defects, and the first description
    would have sent the fix the wrong way.

20. **The project lead's fourth wrong mechanism this week -- and what it
    would have cost (28 October; IN FLIGHT 40).** "A car that fails to stop
    is rewarded with right of way" was a plausible, well-reasoned fix from
    the lead engineer. Built behind a switch and measured before merging, it
    took the city from 5 crashes in 28 ten-minute runs to 28 -- FIVE TIMES
    MORE DANGEROUS -- and its companion took cars standing for up to 204 s.
    Then the trace: the crash it was built around happens at the same moment
    under every configuration, because the car learned of the conflict only
    on crossing the seam into the node, 26.7 m from the meeting point at
    20.7 m/s, needing 26.7 m to stop -- never able to give way from the
    moment it knew. No right-of-way rule fixes a conflict discovered too late
    to act on; the item is not about who yields but about WHEN A DRIVER CAN
    SEE THE CONFLICT AT ALL. **The strongest argument yet for the practice:
    build behind a switch, measure against the world as it is, and merge only
    what the measurement supports -- however plausible the mechanism, and
    whoever proposed it.** And the classification that started it ("a 0.1 m
    overshoot", then "rewarded with right of way") was withdrawn twice for
    this one crash: a mechanism resting on a single traced case is a
    hypothesis, not a finding, until it is counted over every case.

21. **NOTHING VERIFIES THE THING THAT RUNS THE CHECKS (10 November; found by Codex, recorded here because the hole is in our system, DECISIONS 10.63).** A change to `tools/check.mjs` selects ZERO derived checks, because nothing imports the runner: the tool that runs our verification is not itself verified by it. Codex stopped at the gate rather than merging, which is the gate working. **THE GENERAL LESSON: we have been auditing what our checks ASSERT, and had not asked what verifies the thing that RUNS them.** The same question stands for everything else in the verification path that nothing imports -- the timing records, the dependency table, the seed handling. **If any of those can change without triggering a check, it is the same hole. Recorded as a question; nobody has gone looking.**

**What follows, as practice:**
- **An unexplained number is an instrument question first.** Before a
  surprising reading is a finding about the world, the instrument is
  checked against an INDEPENDENT statement of the same quantity.
- **TOTALS HIDE EXACTLY THE ERRORS THAT MATTER.** The merge check's first
  version compared the counter's total with an independent total and PASSED
  WITH THE BROKEN COUNTER (8 against 10): a counter that misses one kind of
  event and over-counts another can land near any total. Matched event by
  event it failed at once (11 of 20). An instrument is checked per event,
  or per case, wherever it can be.
- **Every counter has a VENUE, and a number read outside its venue is not a
  finding.** Seven reports of 0 gaps judged on the endless highway were
  chased as a fact about traffic; the highway has no stop line, and the
  number can only exist at one. Which numbers belong where:

| number (sim/encounters.js) | what it is | where it can be nonzero |
|---|---|---|
| met a minute | cars within 30 m | anywhere |
| overtook / overtaken | a car beside, same heading, ahead to behind | multi-lane roads: the highway, arterials |
| merges judged | a lane change or a join with a car within 30 m in the lane joined | multi-lane roads and entrances: the highway above all |
| gaps judged | the player STANDING at a stop line while a conflicting car comes on | junctions with a stop line or a light: the city, test map 1 -- NEVER the endless highway |
| following / followed | headway within 2.5 s | anywhere with a lane to share |

  So density shaping is read as two results, never averaged: the HIGHWAY
  tests whether cars are near the player (met, overtakes, merges); the CITY
  tests whether they create decisions (gaps judged). Met rising on both and
  gaps judged rising only on the city is a real, useful shape of result,
  not a partial failure.
   21. **THE SAME WRONG DEFINITION, THIRD APPEARANCE: LOOK HERE FIRST (the project lead, 4 November).** Who is in a lane was wrong in the following model; on 22 October placement was taught to AGREE with it, so two readers were consistent with a fiction (item 17); and verify-promotion then ENFORCED that agreement, requiring a car past the box on an off-ramp to be refused as if in the through lane's queue, when the path had split 14 m before the box ended. A geometric impossibility, asserted. **So when a definition is corrected and a check goes red, the first question is whether that check was written to the old definition, and the test is physical, poses and not the code's own vocabulary.** Not a licence to restate a check on sight: a verdict first, scored against what was predicted, and the restatement sabotaged both ways.

   22. **THE FRAMINGS HAVE BEEN WRONG MORE OFTEN THAN THE MEASUREMENTS, AND THAT IS THE MOST RELIABLE THING IN THIS PROJECT (the project lead's words, 4 November: make it visible in the record, not only in messages).** Every entry is a framing given to the work, the project lead's or the agent's, and what it measured to:

   | who | the framing | what it measured to |
   |---|---|---|
   | lead | the cross-node misreading makes the traffic "too polite" | city speed +0.3-0.4%; retired (IN FLIGHT 39) |
   | lead | a car failing to stop is rewarded with right of way | five times the crashes as built; the crash traced was physically unstoppable (item 20) |
   | lead | fixing 39 might dissolve 40 | a different code path; overshoots 69 to 78 (IN FLIGHT 40) |
   | lead | shaping's 3.18x was partly bunching behind phantoms | 5.6-6.9% of cars met, no higher in the high seeds, and the 3.18 against 2.15 itself mostly sample (IN FLIGHT 11) |
   | lead | the 26 were held late for a car visible for seconds | all 26 a truck's margin: a hold for a car that usually is not there (IN FLIGHT 40) |
   | agent | the 26 are at least 60% not a car at the node | MET, 100%; but its second half, that the remainder was the instrument's own mismatch, was wrong in its reasoning: 1 of 30, nothing left unnamed |
   | agent | a late overshoot is discovery at the seam | 13 of 69 (IN FLIGHT 40) |
   | lead | the real-car holds are a decision late against a car visible for seconds | 13 of 34 the blocker had just arrived, 7 cut off by a left-turner, 14 left-turners on position alone (IN FLIGHT 40) |
   | agent | most real-car holds are a change in the blocker's state (R1) | 13 of 34 |
   | agent | a corner un-accepts the gap because the need rises (R3) | the need fell; the mechanism held on 4 of 4, for a reason I had the arithmetic wrong on |
   | lead | parked cars are in the car budget, explaining low encounters and too polite | not in the count; explains neither. Jay's observation stands: 91% of the cars he sees (10.42) |
   | agent | bold and maximally bold hit most in the staged scene (E2) | they hit none, and take tight passes instead (IN FLIGHT 40) |
   | agent | courtesy's two failures are too few trials | true of the shortfall; the check's second assertion could not fail at all, and its falsifier fired on the larger sample: a lapsed offer (IN FLIGHT 39) |
   | maintainer | parked vehicles were placed against the overall car budget | no, on every map; they do spend the phone's frame budget (10.42) |
   | lead | Clean mode's density is the explanation for the cars that never move | a separate observation: those cars are curb slots, the density point is why added cars bought little (10.42) |
   | lead | told the maintainer the menu was fixed | with Clean mode off, the default, all eight still showed (10.58, 10.59). Recorded as theirs by the project lead; the agent shipped it and its check passed |
   | lead | most of the driver model has nothing to express on an open road | half: rolling stops 24x and harsh braking 4.8x across the dial on the city already; lane-change faults are the silent part, 10x rarer than on the loop (10.50). **Accepted by the project lead as another of theirs, 5 November** |
   | lead | the three untraced failures may be the recorded-time timeout flaw | they were not timeouts; the crash pair towed, a check counting two moves, a one-seed floor (10.46) |
   | agent | the small maps' rate is at least 3x the city's on test map 1 (ON3) | 2.1x, with 8-10x on peds and signs (10.46) |
   | lead | the ruling on commitment reclassifies the overshoots | 77 of 78 went in; none reclassified (10.45) |
   | agent | at least a third of overshoots stop short of the conflict (C2) | 1 of 78 (10.45) |
   | lead | `going` latching at 1.5 m/s is what creeping has to change | it never latches for a car creeping while held; three other obstacles (10.45) |
   | agent | look-away as built shows a rear-end (RE3) | identical to off: glances fit the road and a looming car brings the eyes back (10.44) |
   | agent | headway's mean shown stays within 0.75-1.33 of main's | missed at 0.74 at 180 cars, where the check turned out to be passing on one seed's luck (IN FLIGHT 39) |

   **What holds up is the method, not the framer: write the prediction and its falsifier down first, then read what comes back, including when it takes the question's own premise with it.** A framing is where a measurement starts, and it is not evidence.

## 10.24 FOLLOWS TOO CLOSELY: 0.75 CAR LENGTHS, HELD FOR 2-3 SECONDS (the maintainer, 27 October)

The maintainer, verbatim, because the translation matters:

*"follows too closely is an explicit mark on the examiners sheet. I wanted
the follow indicator to help with following the car ahead, when waiting
for gaps in traffic to appear when swimming traffic on the highway. 2-3
second gap is the real mark, but I'm fairly sure that won't play well on a
screen, a lot of empty space. my best guess for a markable 'follows too
closely' will be about .75 car lengths behind the other car, for too long
(2-3 seconds within this gap make a digestible translation for the
markable with regards to gameplay)"*

**The ruling.**
1. **Following too closely is a markable fault.** It is an explicit mark
   on the real sheet.
2. **The threshold is a DISTANCE: 0.75 car lengths of clear road behind
   the car ahead.** A car length in this model is `CAR.length` = **4.5 m**
   (traffic.js; CLAUDE.md "True-to-life scale"), so the threshold is
   **3.375 m, bumper to bumper** (drive.js `FOLLOWS_CLOSE`). Not a truck's
   or a bus's length: the unit is a car's, whoever is ahead.
3. **The 2-3 SECONDS IS A DWELL, NOT A GAP.** It is how long the player
   must stay inside 3.375 m before it is a fault.

**READ THIS BEFORE "FIXING" IT.** In the real rule, 2-3 seconds is the
GAP -- the time between your front and where the car ahead's rear was. In
this ruling, 2-3 seconds is the TIME SPENT INSIDE a distance gap. Same
number, different quantity. Whoever sees "2-3 s" next to a following
fault and converts the threshold back into a time gap will believe they
are correcting a bug, and will be undoing the maintainer's ruling: a 2-3 s
gap at highway speed is 55-80 m, "a lot of empty space" on a phone, and
the threshold was moved to a distance on purpose so it is legible on
screen. Not tuned, not open for tuning without him.

**[THE RULE IS NOW 10.25's: ONLY WHILE MOVING -- the maintainer replaced
this floor the same day; what "moving" means is open there.]**

**THE QUEUE PROBLEM, AND THE SPEED FLOOR -- derived, proposed by the
project, 27 October.** At 3.375 m every car standing at a light (the
standstill gap is 2.0 m, traffic.js STANDSTILL) or crawling in a queue is
inside the threshold, continuously; a real examiner does not mark closing
up at a red. Measured on the traffic itself (tools/measure/follow-close.mjs,
every AI driver against its own leader, three minutes a map), episodes
reaching 2 s inside 3.375 m: test map 1, sound drivers, **79.6 a minute**
with no floor; city 25.6; shaped highway 13.6. So the fault applies only
above a floor, and the floor is DERIVED, not chosen:

    FOLLOW_FLOOR = (FOLLOWS_CLOSE - STANDSTILL) / HEADWAY (asked of wantedGap)
                 = (3.375 - 2.0) / 0.7 = 1.96 m/s = 7.1 km/h

-- the speed at which a SOUND driver's own chosen following gap (the
following model at caution 1, steady, nobody closing: traffic.js
`wantedGap`) is exactly 0.75 car lengths. Below it, being that close is
what normal following IS; above it, being that close is closer than a
sound driver chooses -- careless. It moves if any of the three constants
moves, and verify-headway holds it as that property of the following
model, not as a number. With it: 0.0 episodes a minute for sound drivers
on all three maps, 0.4 for bold drivers on test map 1 and for sound ones
on the shaped highway (merging), so the AI is not marked constantly and
the fault is almost entirely the player's to commit. The alternative
considered, the reaction boundary (the speed whose reaction distance,
REACTION_FLOOR x v, is 3.375 m: 35 km/h), marks nothing anywhere in the
traffic and would let a player tailgate freely in town; not proposed.

**Arithmetic worth knowing, not a decision:** above 35 km/h, 3.375 m is
less than the distance covered in a reaction time -- at 100 km/h it is
0.12 s. So on the highway, inside the threshold is not merely close but
closer than anybody can react to. The threshold is the maintainer's; a
speed-varying one was parked (27 October) until he has driven with the
gauge.

**OPEN, the maintainer's (asked): one entry or several.** Under 10.18 a
mark is what happened, where, under which section; following too
closely on a junction approach and on an open highway may be different
entries in the guide. **The fault is not built until that is settled.**
The gauge (SIMULATOR 1.2.20) shows the threshold and says when the player
is inside it above the floor; it marks nothing.

**The dwell (2 or 3 s) is the maintainer's range, not narrowed here.**
The traffic measurement above found the floor, not the dwell, decides
whether the AI is marked: 2 s and 3 s gave nearly the same counts.

## 10.25 THE MARKING GUIDE'S HEADINGS, IN THE MAINTAINER'S WORDS -- and follows too closely as the first sectional fault (27 October)

**[PARTLY SUPERSEDED the same day by 10.26, the real sheet: the heading table below is his spoken names, not the sheet's; follows too closely is seven or more entries (Spacing, Gap), not three; the road-classification gap is DROPPED -- headings come from the route. "Only while moving" and the open question of what moving means STAND.]**

The maintainer, verbatim:

*"you can only be following too closely if you are moving, we already have
stopping distance for when we are at a standstill. follows too closely is
on the business road section, residental and highway driving sections,
exactly as you understand it."*

**THE HEADINGS OF THE REAL SHEET NAMED SO FAR -- INCOMPLETE, he will name
more as they come up. Never invent one; add only from his words.**

| heading (his words) | where named | entries named under it so far |
|---|---|---|
| Intersections | 10.18 ("a heading 'Intersections'") | undue delay at a green; stopping or slowing too soon/late; failure to observe; stopping position ("on a crosswalk or beyond a stop line") |
| business road | here | follows too closely |
| residential ("residental") | here | follows too closely |
| highway driving | here | follows too closely |

Also named, heading not given: hesitation merging onto a highway (10.18:
"not the same error as the green light"); stopping distance (here: a
separate existing mark, for a standstill behind another vehicle).

**1. FOLLOWS TOO CLOSELY IS ONE OBSERVABLE, THREE ENTRIES** -- under
business road, residential and highway driving. It is the first concrete
instance of 10.18's model and is built as the TEST CASE of that structure,
not as a special case: a mark is (what happened, where, under which
heading), and the heading comes from where the player is.

**2. ONLY WHILE MOVING.** At a standstill the mark is STOPPING DISTANCE, a
separate entry; the two are never conflated. This replaces 10.24's derived
floor as the RULE. What "moving" means is OPEN, and it matters (asked):
measured on the traffic (tools/measure/follow-close.mjs), episodes of 2 s
inside 3.375 m per minute, sound AI drivers:

| "moving" means | test map 1 | city | shaped highway |
|---|---|---|---|
| anything (no floor) | 79.6 | 25.6 | 13.6 |
| above the sim's rest speed, AT_REST 0.3 m/s | 17.2 (3.6 at 3 s) | 2.0 | 0.4 |
| above 10.24's derived 7.1 km/h | 0.0 | 0.0 | 0.4 |

At 0.3 m/s a queue creeping up -- 1-2 m/s, closing to 2-3 m -- is still
"moving" and still inside, so on a busy grid the traffic, and a player
creeping up behind it, is marked several times a minute. Whether creeping
in a queue is following, or is part of the standstill that stopping
distance covers, is the maintainer's.

**3. WHAT EXISTS AND WHAT IS MISSING (measured 27 October, before any code):**
- **No marking sheet runs on a map at all.** marking.js runs only in the
  old compass-course worlds; the live exam (exam.js) deliberately marks
  nothing (10.18's scoping). The sectional sheet is new on the map, not a
  regrouping of an existing one.
- **No road has a sheet heading.** Roads carry a KIND (residential,
  collector, arterial, highway, service -- map/format.js KINDS); maps may
  carry ZONES (residential, commercial, industrial, park, water, highway),
  and only the city does (one residential, one commercial). The sim already
  asks which zone a road's midpoint is in (crossing.js districtStreetsOf, for
  traffic from inside districts). Nothing maps either onto the sheet's
  headings, and the mapping is not mechanical: is a collector or an arterial
  through a residential zone "business road" or "residential"? Is a slip
  road "highway driving"? test map 1 and the endless highway's arterials
  have no zone at all. **A map-data question, to be scoped separately --
  not invented in passing.**
- **"Section" already means two other things in this code**: a map's named
  test sections (map/format.js `sections`, #/tests) and sectionSheet's
  stretch of the route (10.18's scoping). The guide's word is the
  maintainer's "heading"; code calls these HEADINGS.
- **Stopping distance is not modelled as a mark.** The throttle bar guides a
  stop behind a car to the sim's standstill gap (STANDSTILL, 2.0 m;
  drive.js stopFor), but the player's stop is judged only at a LINE -- a
  stop behind a car is deliberately not judged (drive.js: "whoever is in
  front decides where you stop"). On the list, with its own standard to be
  ruled: how close behind a stopped car is too close, and whether too far
  is a mark.
- **What carries over** (10.18's scoping): detect.js pairs a mark with a
  fault by place, category and time -- an extension to (heading, item,
  place), about 10-20 lines.

## 10.26 THE REAL ONTARIO SCORE SHEET -- and what it corrects in 10.18 and 10.25 (27 October)

The maintainer supplied photographs of the real Ontario road-test score
sheet. **Recorded from the project lead's reading of them; the photographs
themselves are not in the repository or on the build machine.** Anything
below that a later change depends on in detail -- the full item list under
a phase, the letters of a variant -- is checked against the photographs
first, not against this summary.

**THE SHEET IS ORGANISED BY MANOEUVRE, NOT BY PLACE.**

    heading -> phase -> item -> variant

- **Headings are manoeuvres**, each with NUMBERED INSTANCES and a
  COMPLETED box per instance: Turns (Left 1, Left 2, Right 1, Right 2),
  Business/Residential, Lane Changes (Business L/R, Expressway L/R, two
  each), Expressway, Curve, Stop Intersection, Through Intersection.
- **Phases** divide a heading in time. Turns: Approach / If Stop / Turning
  / Complete Turn. Expressway: Entering / Driving Along / Exiting. Stop
  Intersection: Approach / Stopping / Starting.
- **Items** are what is assessed in a phase: Traffic Check, Speed,
  Spacing, Signal, Lane, Position, Hands/Gears, among others.
- **Variants** are lettered under an item -- e.g. "Spacing: A_Not 2-3 sec
  front / B_back / C_out of acc. lane".

**THE HEADING COMES FROM THE ROUTE, NOT FROM THE ROAD.** The maintainer:
the examiner marks by route, and the route is hand-designed so the same
manoeuvres happen at the same places, for consistency. A test is a route
that DECLARES its legs and the manoeuvres it requires (the numbered
instances), and a mark's heading is the declared manoeuvre the candidate
is performing when it happens. This is the same object his
difficulty-progression idea would use.

**CORRECTIONS TO WHAT WAS RECORDED EARLIER -- read before building marking:**
1. **10.18's model was right in its principle and wrong in its axis.** "A
   mark is what happened, where, under which heading" stands; but the
   heading is a MANOEUVRE on a declared route, not a kind of place.
   10.18's "Intersections" is, on the real sheet, at least two headings
   (Stop Intersection, Through Intersection) plus the Turns heading's
   phases.
2. **10.25's heading table is SUPERSEDED.** "business road", "residential"
   and "highway driving" are the maintainer's spoken names; the sheet's are
   Business/Residential (one heading) and Expressway. The verbatim words
   in 10.25 stand as what he said; the table is not the sheet.
3. **THE ROAD-CLASSIFICATION WORK IS DROPPED** (10.25's "no road has a
   heading", the map-data question to scope). Not needed: headings come
   from the route. What is needed instead is routes that declare their
   legs and required manoeuvres -- smaller and better defined.
4. **"Follows too closely" is seven or more entries, not three, and is not
   called that on the sheet.** SPACING under Business/Residential,
   Expressway Entering, Expressway Driving Along and Lane Changes; GAP
   under Turns Approach, Stop Intersection Approach and Through
   Intersection Approach. 10.24's threshold (0.75 car lengths, held 2-3 s,
   only while moving) is the maintainer's game translation of the
   observable; which entry a showing lands in is the route's manoeuvre and
   phase at that moment. Note the sheet's own variant "A_Not 2-3 sec
   front": the real standard is the 2-3 s GAP, and the game's distance
   threshold is the deliberate translation 10.24 records.
5. **Stopping distance** (10.25) is an existing entry on the sheet; where
   it sits (which heading and phase) is to be read from the photographs.

**THE LARGEST GAP BETWEEN WHAT IS BUILT AND WHAT AN EXAMINER MARKS:
TRAFFIC CHECK.** It is the most frequent item on the whole sheet --
mirrors, blind spot, left-right-left at an intersection, none while
waiting, not by traffic speed -- and it appears under almost every phase
of every heading. **The game cannot observe any of it.** The player's car
has no mirrors, no shoulder check and no head; the AI drivers' looking is
modelled (attention.js, the observation axis) but never shown as a head
or a glance an examiner could see. So the item the real examiner marks
most is the one the game has no observable for at all. This is the same
gap CLAUDE.md names as "the candidate's observations are not modelled at
all ... the biggest gap in the whole design", now measured against the
real sheet: it is not one gap among several, it is most of the sheet.

**NOT STARTED, by instruction.** The record is corrected first; the
maintainer has not asked for marking work to begin. Nothing marking-
related is built from this until he does.

## 10.27 VISION BY MODE, AND INTERVENTION IN THREE LEVELS, JUDGED AFTERWARDS -- design, unbuilt (the maintainer, 27 October)

**[Its tensions RESOLVED the same day by the maintainer: 10.28. Point 1's "the cone decides" is refined there -- seeing a check is free, judging it is not.]**

Recorded as design beside the real sheet (10.26). **Nothing here is
built.** Where it meets something already recorded or built, that is said
under TENSIONS below rather than overwritten.

**1. VISION SPLITS BY MODE.**
- **Driving (the player at the wheel): no directable view cone.** The
  bird's-eye view and full awareness all round stay -- that IS the mirror
  and blind-spot check, done. What changes is OCCLUSION BY OBJECT TYPE: a
  large truck blocks completely, an untinted sedan is partly transparent;
  a fog of war over what is genuinely hidden, so the player meets the same
  constraint the AI drivers already have (sim/sight.js).
- **Examiner mode: a directable view cone.** It replaces the steering and
  the throttle rather than competing with them: hands free, attention is
  the resource spent.
- **So TRAFFIC CHECK IS AN EXAMINER-MODE MARK.** The question is never
  whether the player checked their own mirrors; it is whether the player
  SAW THE CANDIDATE check theirs, and the cone decides that. The mechanic
  and the mark are one system. (This turns 10.26's largest gap -- no
  observable for Traffic Check -- into a defined requirement: the
  candidate's checks must be visible things, and the cone must be where
  they happened to see them.)

**2. INTERVENTION, THREE LEVELS, ESCALATING.**
- **Verbal.** Slowest, and it goes THROUGH THE CANDIDATE'S OWN REACTION
  TIME: a poor-observation candidate is slower to act on the correction as
  well as being the reason it was needed.
- **Steering.** A HELD action: the player holds, then slides a finger as
  they would to steer, a small correction. **While held, the player's view
  narrows to a cone straight ahead along the car's travel** -- a real cost:
  a steering intervention can blind the player to the next problem. Two
  risks: the candidate may resist and wrestle for control (a bold candidate
  fights, a timid one yields -- the confidence axis with a new observable,
  felt through the wheel), and the correction itself may be clumsy, made
  from the passenger seat with a partial view.
- **Dual brake.** Instant and certain, and NOT IN EVERY CAR: equipment,
  tied to the vehicles and the garage. Its absence is what forces the
  player into the risky steering option.
- **Implementation the maintainer proposes:** an intervention snaps the
  candidate to perfect skill and omniscience for its duration, as if the
  examiner took over, then returns them to their own ratings. No separate
  examiner driving model.

**3. AN INTERVENTION IS A CRITICAL ERROR, AND THE TEST GOES ON.** Marking
continues unless the candidate is genuinely too dangerous to continue with.

**4. INTERVENTION IS JUDGED AFTERWARDS -- the most important part.** The
maintainer: examiners are taught to think the occurrence through while
still driving, and if the intervention was too early or unnecessary, to
let it go. The player intervenes in the moment and decides afterwards
whether it goes on the sheet.
- **That is the same shape as the deferred section sheet already built**
  (sim/marking.js, `sectionSheet`): act now, judge at the review. So
  intervening and marking are ONE skill, not two.
- **It is the first mechanic where the player can be wrong about THEIR OWN
  action rather than the candidate's.** A nervous examiner intervenes early
  and must be honest about it; an overconfident one leaves it too late.

**TENSIONS WITH WHAT IS RECORDED OR BUILT -- for the maintainer, not
resolved here:**
- **5.10 says a correct intervention is an AUTOMATIC FAIL for the
  candidate.** Point 3 says a critical error with the test continuing. Both
  can hold -- the candidate has failed and the drive is completed anyway,
  as a real test would be -- but it is to be confirmed, not assumed.
- **5.10 says WHICH OUTCOME HAPPENED IS DERIVED** (would it have ended in
  contact, by controlled comparison; "nobody writes down 'this one was
  hasty'"). Point 4 has the PLAYER decide afterwards. Not a contradiction
  if the two are layered: the player's call is the mark, and the derived
  counterfactual is what that call is graded against -- honest about a
  hasty one, or not. That reading is offered, not settled. 5.10's
  asymmetry (a candidate is never penalised for the examiner's nerves)
  must survive whichever it is.
- **5.10.1's supply cap** (interventions run out, because the attention
  cost alone was measured not to deter spamming) is not mentioned in this
  design; three levels and a judged-afterwards mark change what spamming
  costs, and whether the cap is still needed is to be re-measured, not
  assumed either way.
- **What is BUILT differs** (sim/exam.js, verify-exam): the bottom of the
  exam slider is the instructor's brake in EVERY car, and `ease` (the
  nearest thing to verbal) acts at once at the candidate's own braking rate
  with NO reaction time. Both stay until this design is built; neither is
  the design.
- **Occlusion by object type for the player meets sight.js's rule**, which
  is binary: an opaque box taller than 2 m hides what is behind it, and a
  car hides nothing ("a truck hides what is behind it and a car does not",
  verify-trucks). A partly transparent sedan is new for the AI too. If the
  player's occlusion and the AI's differ, that is two statements of one
  quantity -- this project's recurring bug -- so the sedan's partial
  occlusion should land in sight.js for both, or be ruled player-only on
  purpose.
- **The snap to perfect skill sits oddly with the steering level's own
  risks.** If the candidate is perfect and omniscient for the duration,
  they neither wrestle nor need correcting clumsily. Probably the snap is
  the model of a successful takeover (dual brake, or verbal once acted
  on) and the steering level is the player's input against the
  candidate's resistance -- to confirm.
- **Consistent, recorded so it is not re-argued:** CLAUDE.md's gaze-cone
  requirements hold for the examiner's cone -- relative to the car's
  heading, never absolute, and reading the candidate's own car is a
  different act from spotting anybody else's. And CLAUDE.md's three
  layers are respected: the cone is layer 3 (what the player noticed); the
  candidate's own perception (attention.js) stays layer 2. **A
  prerequisite this design implies:** the candidate's checks -- mirrors,
  shoulder, left-right-left -- have to exist as visible events; attention.js
  models when a driver looks away from the road, not a check anybody could
  watch them make.

## 10.28 10.27'S TENSIONS, RESOLVED BY THE MAINTAINER -- design, unbuilt (27 October)

Every tension 10.27 raised has his answer. **Nothing here is built.** What
is still open after these answers is listed at the end, flagged, not
resolved.

**1. INTERVENTION: FAIL, AND CONTINUE.** A correct intervention fails the
candidate AND the drive goes on, the rest of the test marked. 5.10's
automatic fail and 10.27's critical-error-and-continue are the same thing;
both records stand.

**2. THE PLAYER RECALLS FOUR THINGS ABOUT EACH INTERVENTION** -- the time,
the type of intervention, the violation that occurred, and where it
occurred -- in a dedicated part of the sheet, with the result given at
the end, graded against what actually happened, "because we always know
what really happened".
- **This settles 10.27's second tension in the direction offered there:**
  the player's account is the mark; the world's record is what it is
  graded against. 5.10's derived counterfactual (would it have ended in
  contact) is part of "what really happened".
- **IT IS A MEMORY MECHANIC, NOT ONLY A JUDGEMENT ONE.** The player holds
  four facts about one event while the drive carries on. **This is the
  attention interlock the September cold review found missing** (5.7; 10.18
  point 4): the four jobs never actually competed, because nothing the
  player did cost attention while the others ran. Holding an intervention's
  four facts is the first mechanic that genuinely consumes attention while
  the other jobs continue.
- **OPEN, asked, not assumed: free recall or selection from options.** A
  large difference in difficulty on a phone. Neither is assumed anywhere
  until he answers.

**3. TERMINATION IS FOR A CANDIDATE WHO IS A DANGER -- A SET PIECE.** It
starts a distinct mode: the test is over, and the player must bring the car
back to the testing centre USING THE INTERVENTION CONTROLS ONLY, against a
distressed or angry driver -- flavour of crying, pleading, raging while the
car swerves. It gives termination weight, and it exercises all three
intervention levels in sequence.

**4. THE SIGHT MODEL IS SHARED.** The sedan's partial transparency goes
into the shared sight code (sim/sight.js) for the AI drivers and the
player alike: one definition, not two. 10.27's fifth tension resolved.

**5. TRAFFIC CHECKS: THE PLAYER ALWAYS SEES WHERE THE CANDIDATE IS
LOOKING.** The direction of the candidate's look and what their cone
illuminates are always shown, without the player aiming their own
sightline there. The maintainer's reasoning: from the passenger seat you
catch a blind-spot check in peripheral vision while doing your own.
- **THE CONSEQUENCE, which relocates the tension rather than removing it:
  SEEING THAT A CHECK HAPPENED IS FREE; JUDGING WHETHER IT WAS ANY GOOD IS
  NOT.** "They checked the mirror" costs the player nothing. "They checked
  the mirror and missed the car in it" needs the player to have seen that
  car themselves, with their own cone. Likewise a check made too early, or
  aimed at the wrong place. That is the sharper tension, and closer to the
  real job.
- **This refines 10.27 point 1**, which said the examiner's cone decides
  whether the player saw the candidate check: it decides whether the player
  can judge the check, not whether they saw it happen.

**6. THE GATING DEPENDENCY FOR THE WHOLE EXAMINER LAYER: CHECKS AS
EVENTS.** The candidate's mirror, shoulder and left-right-left checks must
exist as DISCRETE, OBSERVABLE EVENTS, each with a DIRECTION and a TIMING --
not attention.js's "looking away from the road". Traffic Check (10.26's
largest gap), the free half of point 5 and the judged half all stand on it.
Nothing in the examiner layer that marks observation can be built before
it.

**STILL OPEN AFTER THESE ANSWERS -- flagged, not resolved:**
- ~~**Free recall or selection** (point 2)~~ -- ANSWERED, 10.29: the time taken automatically, type, violation and place recognised from lists; attribution across interventions, in order, is the test.
- **The recall budget is already spent once.** [RE-CHECKED in 10.29: it survives on the old engine's figures -- recognition, and about one intervention a section in five; re-measured when the sheet exists on the map.] The deferred section sheet
  was sized to free recall: "free recall runs out at about four items, so
  the band is 3-4" faults a section, and section length is DERIVED from
  that (CLAUDE.md, "A candidate has a CHARACTER"). One intervention is four
  facts. If interventions draw on the same memory as faults, one
  intervention fills a section's whole budget, and the derivation of
  section length no longer holds as written. Whether they share a budget,
  and how the sheet is sized when they do, is undecided -- and depends on
  free recall against selection.
- **The candidate's look gains a direction.** "What their cone
  illuminates" (point 5) needs the candidate's looking to be directional.
  attention.js today is not: a driver is looking or away, and while
  looking sees the present. Directional perception for the candidate is a
  change to layer 2 (CLAUDE.md, "Three layers"), beyond the discrete check
  events of point 6 -- it changes what a candidate can miss, not only what
  the player can see.
- **"Partly transparent" is not yet a quantity.** sight.js is binary today
  (an opaque box taller than 2 m hides; a car hides nothing). Partial
  transparency for a driver deciding -- a lower chance of registering, a
  longer registration delay, a fraction of the body seen -- is a modelling
  choice with consequences for every driver, and it must stay seeded and
  deterministic (10.9). To be defined before it is built.
- **Termination in a car with no dual brake** (point 3 against 10.27 point
  2): the set piece "exercises all three levels", and the dual brake is
  equipment not every car has. Whether termination can happen in such a
  car, and how the car is brought back without the one certain stop, is
  open.
- **Where an intervention "occurred"** (point 2) is most naturally the
  route's declared leg and manoeuvre (10.26); and "the violation" is most
  naturally an entry on the sheet (10.26's heading -> phase -> item ->
  variant). Both therefore wait on the route and sheet structure, which is
  not built.
- **5.10.1's supply cap** is still unaddressed. Four facts to recall per
  intervention is a cost that grows with every intervention, which may be
  the deterrent 5.10.1 found the attention cost alone could not be -- to be
  measured, not assumed.

## 10.29 RECORDING AN INTERVENTION: THE TIME IS TAKEN, THE REST IS RECOGNISED -- and the guide is not the sheet (the maintainer, 27 October; design, unbuilt)

His words, verbatim:

*"The time should be recorded from the intervention action itself, and the
rest should be selected from a list after the fact. the reason for the
automatic time inclusion is so that the event itself is already recorded,
and it's up to the examiner to remember what exactly happened."*

*"attribution across interventions is the key. remember the order of what
happened and where."*

*"pulling up the guide is something users might do a lot at the beginning,
when they are still learning what means what. this would be seperate from
selecting the violation on the scoresheet."*

**1. THE TIME IS CAPTURED AUTOMATICALLY AT THE INTERVENTION; TYPE,
VIOLATION AND PLACE ARE SELECTED FROM A LIST AFTERWARDS.** Recognition,
not free recall. This answers 10.28's open "free recall or selection".

**2. ATTRIBUTION ACROSS INTERVENTIONS IS THE TEST.** Type is NOT
auto-filled, though the game knows which control was used. The sheet
shows timestamped slots with the times given; the player supplies what
each one was -- the type, the violation, the place. With several
interventions in a drive, mixing them up is the failure, and remembering
the ORDER is as much the test as the detail. The times being given is
exactly what makes it a test of order and cause rather than of whether
anything happened.

**3. THE MARKING GUIDE IS REFERENCE; THE SHEET IS INPUT. Two surfaces, two
costs, never merged.** The guide answers "what does this mark mean", and a
player opens it often while learning and rarely once they have; the sheet
asks "which mark applies". (A note made the same day that the two
converge was wrong and is withdrawn.)
- **THE PROPERTY TO PROTECT: the game gets easier as the player learns,
  not as anything in the game levels up.** The guide's cost -- searching it
  while the drive goes on -- falls as the player stops needing it. Mastery,
  not progression, and it arrives as a consequence rather than a designed
  system. Anything that would undermine it -- auto-filling the guide's
  answers, shortening the list for new players, a hint system -- is weighed
  against it before it is built.
- **The selection list's scope is a difficulty dial of its own.** The
  real sheet is four levels deep with lettered variants (10.26); picking a
  violation from all of it, with the drive continuing, is demanding even
  as recognition. What the sheet's list offers is a design decision, made
  knowing that.

**4. THE MEMORY BUDGET, RE-CHECKED (10.28 left it open).** The deferred
section sheet was sized to free recall: about four items, 3-4 faults a
section, section length derived from 1.11 faults an intersection (2.7-3.6
intersections; CLAUDE.md "A candidate has a CHARACTER"). An intervention
was feared to be four more free-recall facts. As ruled it is ONE event
whose time is given and whose three details are RECOGNISED from lists:
cued, not free, and the cue is the slot itself. And it is rare: contact
was coming on 16 of 240 intersections in the old engine's measurement
(5.10.1), so about 0.2 intervention-worthy events in a three-intersection
section. On those figures the sheet's derivation survives: the faults stay
the free-recall load it was sized for, and an intervention adds a cued
recognition about one section in five. **The figures are the old
engine's**, compass courses with generated intersections; they are
re-measured on the map when the sectional sheet exists there, not assumed
to carry over. What it does NOT settle: several interventions close
together, where order is the test -- that is meant to be hard (point 2).

## 10.30 THE MECHANISM STAYS REAL, THE POPULATION IS CHOSEN -- and traffic needs somewhere to go (the maintainer, 27 October)

**1. THE CALIBRATION PRINCIPLE.** His words: *"I want to be able to look at
a driver and see them terrorize the road, and look at [another] and see
them anticipating and sharing space... traffic should be interacting as an
interesting gameplay element, not at a rate [that] might be 'realistic'
and I'm hoping our driver axes are up to that task."*

Everything in the driver model is derived from reality -- the 2-3 s gap,
the side-friction limit, the speed spread, the perception thresholds --
and that discipline is why the model holds together. Realistic RATES were
never the goal. A driver who terrorises the road is an ordinary driver
with extreme ratings behaving exactly as the model says such a driver
would, not a bespoke aggressive AI. **We keep the derivation and choose the
distribution: the traffic skill dial is population, not physics.** Deriving
a constant from road-design standards and populating the world with more
bad drivers than exist are not in conflict: the first is the mechanism,
the second is the casting.

**2. INTENT IS A DESTINATION, NOT A PERSONALITY** (superseding a proposed
sixth, "aggression", axis the same day). His words: *"I think intent does
everything in describing ... we need to create more exits on the endless
highway so traffic has reasons to make decisions while competing for
space. we will have a NASCAR ring that ends at the pits. what I think that
actually speaks to is that our AI drivers need somewhere to go, and that
will introduce traffic acting dynamically all on it's own to some
degree."* Aggression is uniform bad behaviour everywhere; a destination is
a SITUATION, and situations make the existing axes matter more: a driver
who needs the next exit with poor observation crosses three lanes late and
badly; a good one was in the right lane a kilometre earlier. It also gives
the anticipation property, merging and lane discipline something to bite
on.

**3. THE TARGET, recorded so nothing is built that cannot grow into it.**
His words: *"Ideally it's a SimCity like model where drivers go from place
to place depending on the time of day, in a way that makes sense (time of
day sending them to either residential, commercial, industrial). that
depends on an expansive map with zones placed intelligently."* Trips
generated by land use, weighted by time of day -- real trip generation,
morning and evening peaks running opposite ways, so derivable rather than
authored. It makes traffic a PATTERN rather than a density (driving
against the rush; one direction backed up, the other clear), gives the
day/night split a reason beyond legal and illegal work, and gives density
shaping somewhere plausible to spend its budget. Gated on maps with zones
(the stand-in city has one residential and one commercial; test map 1 and
the endless highway none), so on map authoring. The cheap version gets
most of the perceptible effect: trips that are DIRECTIONAL and
TIME-VARYING -- mornings toward commercial, evenings toward residential --
two zone kinds and a clock. Order, subject to the findings below:
destinations -> a direction that varies with time -> proper zoning.

**4. WHAT IS TRUE TODAY -- traced in running sims, not read from the
routing code** (tools/measure/destinations.mjs: every car for five minutes
with the good driver at the wheel, as #/map runs it; endless highway 180
cars shaped, the city 200 cars; seed 1):
- **No AI car has a destination.** At each intersection a car draws its
  exit at random -- seeded per car and per intersection (crossing.js
  `wantFor`), so nothing links one intersection's choice to the next -- when
  it enters that intersection's approach. At the endless highway's
  off-ramp nodes the draws split 50/50 between the ramp and the loop (e.g.
  off-6 56% / loop-6 44% of 146). One car's journey: off-ramp wanted at 2,
  loop at 3, off-ramp wanted at 4, at 6, at 0 -- a coin at each node.
  Fields that look like places are not: `tripLen` (on 508 of 512 cars) is
  a COUNT of intersections after which a car on a district street pulls in
  at the curb -- the endless highway has no district streets, so it never
  ends anything there; `home` is the district a car pulled out from, read
  only so locals know their own signs (reading.js); `want` is the exit
  drawn at the next intersection; `leaveAt`/`parkSlot` the curb it pulls
  into at a trip's end.
- **What the draw changes: one intersection ahead, including lane choice.**
  If the lane a car is in cannot make the exit drawn, it carries a `want`
  and makes a MANDATORY lane change toward a lane that can, from the moment
  it enters the approach -- on the endless highway that can be over a
  kilometre out. Highway: 806 intersections entered, 156 arrived in a lane
  that could not make the exit drawn, 248 lane changes made for a turn, 101
  turns missed. City: 3,295 entered, 933 in the wrong lane, 56 lane changes
  made for a turn, **906 turns missed -- 97% of city drivers in the wrong
  lane for the exit they drew never get over**, and go where their lane
  goes.
- **Every driver acts on the want from the same moment** -- the seam -- so
  the anticipation property (acting when a need is knowable or when it is
  pressing, core/driver.js `anticipates`) has no say in WHEN a driver moves
  over for a turn. Observation decides only how they check.
- **Otherwise lane choice is speed and the rule**: overtaking, keeping
  right (lanechange.js); nothing else about where a car is going.
- **How journeys end.** Highway: 197 retired mid-road by density shaping
  out of sight, 146 left at the map's edge down an off-ramp, 174 still
  driving after five minutes; none pulled in. City: 146 left at an edge,
  84 pulled in at the end of a trip, 197 still driving.
- **No time of day exists in the sim.** `world.t` is seconds since the world
  began; nothing has an hour, a day or a night. Dialogue lines carry an
  optional `when` (day, night, race) that nothing in the sim supplies. The
  day/night design assumes a clock that is not there.
- **Shaping and destinations**: there is nothing to conflict with today.
  With destinations, a car retired behind the player never arrives -- out
  of sight, so harmless to what is seen, but it would bias which trips
  survive near the player.

**THREE FINDINGS, RECORDED WITH EMPHASIS (the project lead, 27 October) --
they shape later work:**
1. **ANTICIPATION HAS NO SAY IN LANE CHOICE.** A gap in a property declared
   general (10.20, banner there), not a feature request.
2. **NO CLOCK EXISTS -- A PREREQUISITE NOBODY HAD NOTICED.** The whole
   day/night design (DAY-NIGHT.md) and the directional-trip version of trip
   generation rest on a time of day the sim does not have; `world.t` is
   seconds since the world began, and dialogue's `when` tag (day, night,
   race) is supplied by nothing.
3. **SHAPING AND DESTINATIONS WILL INTERACT.** Nothing conflicts today;
   once cars have places to reach, retiring them behind the player biases
   which trips survive near him. Noted now so it is not discovered later.

**5. WHAT EXITS ON THE LOOP WOULD REQUIRE.** Adding exits is a MAP CHANGE
and the behaviour comes free, at today's level: each new off-ramp is one
more coin a driver flips one intersection ahead, with the forced lane
change, the missed turn and the checks that go with it -- more decisions
competing for space, immediately. What it would NOT give is a driver who
needs THAT exit and plans for it: that is a destination, which is a
driver-model addition -- but a smaller one than it sounds, because the
hook exists. `wantFor` already takes a per-leg plan (a candidate's `plan`,
the exam's directions), and route.js already finds the shortest path to a
place for the player (`routeTo`). Destinations would give an AI driver a
place and that route as its plan, and decide when they act on it by
anticipation rather than at the seam. The city's 97% of missed turns says
the existing want is not acted on well even now; that wants understanding
before more is built on it.

## 10.31 A MISSED CHECK'S CUT-IN IS A SPECTRUM, NOT THE CEILING -- ruled, not built (the maintainer, 27 October)

**The ruling, verbatim:** *"it shouldn't always be full braking, it depends
on what is necessary."*

**The measurement it answers** (tools/measure/cutin-braking.mjs,
whole-world traffic, no player, 10 minutes; SIMULATOR IN FLIGHT 31): a lane
change begun with somebody unseen in the blind spot left the car behind
braking at 8 m/s^2 -- the hardest a car can -- after about two in three:

| | checks off | checks on |
|---|---|---|
| endless highway, 180 cars | 20 of 30, 120 an hour | 19 of 29, 114 an hour |
| test map 1, 200 cars | 7 of 14, 42 an hour | 11 of 22, 66 an hour |

**The diagnosis is structural, not a constant set wrong.** A missed check is
permitted down to the point where the follower can JUST stop at its maximum
braking (lanechange.js `lagSurvivable`, the floor at `vehicleOf(behind).most`).
That rule defines the worst survivable case, so every cut-in that would be
refused at a comfortable gap lands exactly on it. There is no gradient: a
cut-in is harmless or an emergency stop, nothing between. What it should
produce is a spectrum whose severity follows how poor the driver is -- a
slightly careless driver cuts in close enough that the follower lifts off; a
genuinely bad one forces hard braking; the maximum is the rare extreme.

**The same shape as the courtesy ruling, and the fifth behaviour in that
family**, alongside gap-seeking, courtesy onset, merging out of an ending
lane and glance timing: the discriminator is the quality of the driver, not
every instance sitting at the ceiling. It may well derive from the same
anticipation property (10.20) rather than needing its own rule -- establish
that before building anything.

**Already established by reading, for whoever takes it:** the acceptable gap
for a SEEN change is the COMFORTABLE one -- `lagNeed` sheds the closing speed
at the follower's comfortable braking (`vehicleOf(behind).brake`) plus this
driver's own acceleration, scaled by confidence (`kappa`). Only the missed
check uses the maximum (`lagSurvivable`, `.most`), and it uses nothing else:
`if (missed && !lagSurvivable)` is the whole test, with no driver in it. So
the gradient is probably small rather than a new mechanism: a missed check's
floor drawn between the comfortable rate and the maximum by the driver's
deficiency (which axis -- observation, confidence -- is the open question),
the maximum reserved for the worst. Check this against the anticipation
property first; measure with cutin-braking.mjs (it counts harsh, past
HARSH_AT, and emergency separately, so a spectrum shows as the two parting).

**The maintainer's lean on the axis (28 October): OBSERVATION**, not
confidence -- what went wrong was not looking; confidence governs how big a
gap is accepted once looked. To be MEASURED rather than taken: if
observation shows no visible spread there, confidence may be the lever.

**Queued after the skill dial and the per-driver readout**: the dial is what
lets the maintainer judge whether the gradient reads right, and the readout
is where he will see which driver forced which stop. Not built.


## 10.32 AGGRESSION IS THE COST A DRIVER WILL IMPOSE ON OTHERS -- and the world shows drivers dealing with each other (the maintainer, 28 October; ruled, not built)

Three rulings on SIMULATOR IN FLIGHT 35's proposal, and a principle.

**1. LAW-BREAKING IS AGGRESSION CROSSED WITH LOW COMPLIANCE, NOT AGGRESSION ALONE.**
Verbatim: *"agressive drivers don't necessarily break the law, but if they
are highly aggressive with low compliance they will do so spectacularly
whenever it benefits them to."* Two existing dimensions multiplying, not a
new rule. It fits what is already built: today a scofflaw (low compliance)
rolls a stop only with NOBODY ABOUT (crossing.js `nobodyAbout`) -- breaking
the law where it costs nobody anything, which is the bottom of the
aggression scale. Aggression extends that to breaking it where it costs
somebody else up to what this driver will impose. Compliance decides whether
the law matters to them; aggression decides how much of other people's cost
they will spend; and only where it benefits them.

**2. A HORN AT A BLAMELESS DRIVER, FOR BEING HELD UP: YES.** Kept as its own
recorded class of horn; verify-greens' "every horn is aimed at an error"
stays as written for the class it describes.

**THE PRINCIPLE, stated generally for the first time (with ruling 2):**
*"I think this will add flavor to the world if the player sees other cars
honking at each other. this is the type of interaction I'm looking for
throughout."* **THE WORLD SHOULD CONTAIN INTERACTIONS BETWEEN AI DRIVERS
THAT THE PLAYER WITNESSES RATHER THAN TAKES PART IN.** Not only horns: a
driver let in, a gap refused, somebody cut off and braking, a queue
honking at a dawdler. Before this the bar for a behaviour was whether it
reached the player; now an exchange between two other cars, seen from
across the intersection, is content in its own right. It is the same
direction as 10.8 (a state the player cannot read is a state the screen did
not show) turned outward: an interaction nobody can see happening was not
worth simulating, and one the player can see is worth drawing well.

**3. THE DEFINITION. AGGRESSION IS HOW MUCH COST A DRIVER IS WILLING TO
IMPOSE ON OTHERS TO ACCOMPLISH THEIR GOAL** -- measured as the deceleration
they are prepared to force on other road users. Verbatim: *"if aggression is
necessary for any rule breaking, even the most compliant driver might show
'aggression' when taking decisive actions. we might think of this as the
driver dipping slightly into non compliance to accomplish their goal of
changing lanes where they can tolerate some slowing of traffic behind, but
not as much as a driver who expects other cars to brake significantly for
them to reposition."* Consequences:
- **NOBODY IS AT ZERO.** A driver who will impose no cost never moves. The
  bottom of the scale is "a slight lift-off behind me", the top "I expect
  you to stand on your brakes". The default population carries some, which
  answers "too polite": today's world is not at zero, it is at too little --
  and, measured below, at no declared amount at all.
- **IT IS DIRECTLY MEASURABLE**: the deceleration a driver's actions force on
  others (tools/measure/imposed.mjs). A check can hold the real quantity.
- **IT SITS OPPOSITE COURTESY**: courtesy is accepting cost for somebody
  else, aggression imposing it.

**DO NOT RE-CONFLATE (the reason SIMULATOR IN FLIGHT 35 was opened):** the
bold tail of confidence was the only home aggression had, so a SKILL ("can
they judge the margin") was doing the work of a DISPOSITION ("will they
impose a cost"), drawn bold or timid half and half. That one conflation is
why the skill dial at -1 made the road timid, and why a rival written
aggressive read on the driver card as misjudging. The fix separates them:
confidence is how well a driver JUDGES the cost of an action, aggression is
how much cost they ACCEPT imposing. Anyone tidying `caution` back into one
number re-creates both symptoms.

## 10.33 AXES ARE CHEAP; NEW EVALUATIONS ARE NOT -- the test any new dimension must pass (the project lead, on the maintainer's constraint, 28 October)

The maintainer: do not bog down the engine. The rule that answers it: **an extra value per driver is memory and disappears into the noise; anything that adds a per-tick, per-neighbour evaluation is where the cost lives.** 180 cars at about 15 neighbours each is thousands of evaluations a tick, and neighbour work is already 35-40% of the step. Aggression (10.32) was free because it changed what an EXISTING decision concludes -- the lag test in gapFor -- not how often anything is evaluated.

**The test, for every new dimension or behaviour:** does it change the conclusion of a decision already being made, from quantities already in hand -- or does it add a decision, a scan, a forecast, or a pass over neighbours? The first is allowed by default. The second needs a measured step cost before it is built, and a reason the existing decisions cannot carry it. **Measure, do not agree:** a claim that something is free is checked by the step time with it on and off, on a world dense enough to show the neighbour cost.

The maintainer's objection that sharpened it (on impatience): *"can our drivers actually predict 10 seconds into the future to gauge both gap 1 and 2 at the same time and choose they don't want to wait? otherwise it's just another tolerance check."* Lookahead -- comparing two future gaps -- fails this test twice: it is a new forecast per neighbour, and it is a second tolerance threshold wearing a hat. A driver reads RATE OF CHANGE instead (is this gap opening or closing?), from the relative speed every driver already has for following. Tolerance asks how big the gap IS; impatience would ask whether it is getting BETTER -- a magnitude against a derivative.

(Moved to `main` 3 November, with the document merge. The aggression it cites is on `aggression-phase1`, unmerged; 10.32 on `main` is the ruling, not the build.)

## 10.34 DRIVERS ARE TOLD THINGS TOO LATE TO ACT ON THEM -- a general property of the model, named (28 October)

Three times this month the same shape, each first chased as its own bug:

1. **The city's missed turns** (IN FLIGHT 32): drivers were told their exit
   one intersection ahead, with a median of -84 m of room to get over --
   negative from the start. Not acting too late: told too late to act.
2. **The merge jam** (IN FLIGHT 17): cars rode a dying lane because they
   learned it was dying too late to leave it.
3. **Overshoots at the line** (IN FLIGHT 40): of 69 on main over 28
   ten-minute city runs, **0 could have stopped when the hold began** -- every
   one was physically unavoidable by then. 13 could not have stopped from the
   moment they entered the node; 56 entered with room (often 40-87 m against
   15-30 m needed) and were held too late -- and of those whose blocker could
   be named, 19 of 30 were held against a car that had been visible at the
   node for 2 s or more (median 3.6 s, up to 20). These are not drivers
   failing to stop. They are drivers told to stop too late to do it -- which
   retires the "a car that fails to stop" framing, the project lead's
   hypothesis and its statement A with it, at a level deeper than the
   measurement that killed them (28 crashes against 5, DECISIONS 10.23 item
   20).

**THE PROPERTY: the model frequently withholds, until too late, information a
driver could have had.** It is distinct from ANTICIPATION (10.20), which is a
driver CHOOSING to react rather than anticipate; this is the model not giving
them the choice. **How to recognise the next one:** a failure whose victim was
physically unable to act at the moment the model first let it know -- measure
"could it have acted when it was told" and "could it have acted when it could
first have known" separately, before building any rule about how it acted.
The fix is never a rule about the failing act (who yields, who is committed,
who gives up); it is the moment the information arrives.


## 10.35 A FEATURE IS A PROPERTY OF THE WORLD, NOT OF THE SCREEN THAT LAUNCHED IT -- a class, named (28 October)

The maintainer: *"one map that combines everything we are working on. the
menu is overloaded, and I'm not sure every test map has every feature in it.
need to simplify the menu and make sure each run is up to date no matter where
it is launched."*

**This is a consistency defect, not a UI tidy** (the project lead). Features
belong to screens rather than to the world: density shaping is on for the
endless highway and off for the city; look-away's default has changed twice;
the candidate's checks are opt-in; the skill dial exists on one screen. So THE
SAME SIMULATION BEHAVES DIFFERENTLY DEPENDING ON THE ENTRY POINT -- and runs
that were not comparable were compared more than once this week (the checks
on or off by an instrument's default, 10.23 item 14; the city and the highway
shaped differently). **The fix: a feature is a property of the world, not of
the screen that launched it.** Then "up to date wherever it is launched"
follows without being maintained.

**A class, beside the two-definitions pattern (CLAUDE.md item 2, 10.23 items
17-18) and 10.34 (told too late): one thing expressed in several places that
drift apart.** The tell: a behaviour whose answer depends on which screen, map
or instrument asked.


## 10.36 SPEEDING UP THE SUITE: SAVED WORLDS REFUTED, SUBGRAPHS ONLY WITH TRAFFIC ACROSS THE EDGE (3 November)

**These are the obvious ideas for anybody optimising a slow suite, so the reasons are recorded and not just the verdicts.** Both come from an external review's checks report (Gemini, 30 October). **Provenance: `REPORT-CHECKS.md`, supplied by the maintainer; committed 3 November (`226198a`), and since read in full by the agent writing this. Do not plan from a timing it quotes, since a loaded run's number is not a cost (TESTING.md, "Gemini's numbers"); that does not make the report wrong, and its reasoning about where the time goes is sound.**

**1. CACHED PRE-WARMED SNAPSHOTS: REFUTED.** Warm-up is most of a slow check's time (TESTING.md), so saving the warmed world looks free. The report does not address the objection (the project lead's reading):

- **A snapshot tied to the sim is invalid exactly when the check runs.** `check.mjs` runs a check when something in its import closure changed (CLAUDE.md item 8), and that closure holds the sim. So the snapshot is stale at the only moments it is wanted.
- **A snapshot not tied to the sim tests new code against traffic the new code would not produce.** The check then passes on a world no longer reachable, and every defect that shows in how traffic builds is out of its sight. Green here is worse than red: CLAUDE.md item 3.

**What is sound is reuse WITHIN one run**: the same seed, map and options, already stepped by the same code in the same process, and only where trials cannot write the world. That is `verify-courtesy`'s shared warm-up, which the report's finding led to (TESTING.md).

**2. DISTRICT SUBGRAPHS: THE IDEA IS SOUND; ONLY CUTTING THE CROSSING TRAFFIC IS WRONG.** This entry first rejected them outright, the same day; the project lead narrowed it, and this is the version that stands. **On one large map a check testing a junction should not step 8 km², and that makes this important.** What is wrong is only removing traffic that crosses the subgraph's boundary, because **boundaries are where this project's defects live**: the cross-boundary following check that passed with the rule deleted (5.15.4); IN FLIGHT 39, following misread across a node; 40's right of way known only within a node (10.34).

**So: extract the subgraph, keep traffic flowing across its edges, with enough buffer that boundary behaviour is still exercised.** It is not a blanket prohibition. A check moved onto one is sabotaged again there, as any cut is, including a sabotage at the boundary. How much buffer is enough is not yet measured.

**How to recognise the next one:** ask what the speed-up stops the check from seeing, and whether a defect there would still fail it.

## 10.37 THREE CONFLICTS WITH THE RED CITY DOCUMENTS, AND TWO DESIGNS THAT SURVIVE THEM -- flagged to the maintainer, not resolved (the project lead, 3 November)

**Provenance: the maintainer's Red City story (STORY.md records it) and `ARCHITECTURAL-AUDIT.md` (Gemini, 1 November), committed 3 November and since read in full: `STORY-SOURCE-2026-11-03.md`, `ARCHITECTURAL-AUDIT.md`.**

**1. THE HEADWAY READOUT STAYS.** The project lead's reading is that the analog presentation would delete it: the follow gauge the maintainer asked for, built to his spec (10.24), its gap sound to a worst 0.20 m where checkable and unverified inside intersections and on bends (handoff 28 October). **The maintainer has already ruled on this class: STORY.md section 4, ruling 6, names "the following gap" among the readouts kept and redrawn, "never a replacement scheme".** **So the audit, as the project lead read it, conflicts with a ruling already made; the gauge is not at risk**, and it is not removed in any HUD work. **What is left for him is the form only.** The project lead's likely resolution is his own throttle-target idea drawn as a mechanical needle: same function, no anachronism, and a restyle in the ruling's own terms.

**2. A.U.T.O.'S PODS AS A DELIBERATELY STERILE EARLY GAME** sits against 10.30: *"traffic should be interacting as an interesting gameplay element"*. STORY.md 4, open item 4, already asks how early variety arrives.

**3. A FULL PHYSICS MODEL (STORY.md 4, ruling 1) AGAINST 10.22 AND THE STEP BUDGET.** 10.22 makes the phone the only target, single-threaded, at 24.6 ms a step at 280 cars on the endless highway. The ruling is the endpoint for the player's car; whether the traffic shares it is the open question, and that is where these two meet.

**TWO DESIGNS NEITHER DOCUMENT MENTIONS, AND THEY STAND: the sectional marking sheet with the real Ontario headings (10.25, 10.26) and the three-level intervention with retrospective judgement (10.27, 10.28).** Brenda runs exams in the new story and ruling 7 keeps the limited-control seat, so nothing removes them. **This is the project lead's reading, not a ruling.** **Brenda's "zero-tolerance exam scoring": RULED, 10.38. It is her manner, and partial marks stand.**

## 10.38 A CHARACTER'S DESCRIPTION IS COLOR; BRENDA, THE EXAM MODE, AND THE SCOPE RULE (the maintainer, relayed by the project lead, 3 November)

**RULED, verbatim: "zero-tolerance is a characteristic of Brenda as a character versus the gameplay itself."** So the marking rule stands unchanged: partial success earns partial marks. Zero-tolerance is her manner, not the scoring.

**THE GENERAL PRINCIPLE (the project lead's statement of it; it will recur): a character's description is color unless it names a rule, and color never overrides a ruling about how the game scores.** Read the next mechanical-sounding character blurb the same way. **It already applies:** `ARCHITECTURAL-AUDIT.md` 4.2 turns the phrase into a `BrendaExamEvaluator` with "zero-tolerance regulatory grading"; that is not to be built as written.

**STANDING INSTRUCTION, verbatim: "I want to avoid adding 50 half-cooked features."** Cite it when anything new is proposed.

**DIRECTION, NOT WORK. Brenda's role has changed:** as real drivers return to the roads, bad driving becomes a problem in the world: "driving has become a lost art and the drivers are terrible". The exam mode becomes part of the main story as well as a side activity. **Undecided:** whether that is money for upgrades or a larger objective such as starting a school.

**OPEN POSSIBILITY, EXPLICITLY UNSCOPED: the exam mode might at heart be a multiplayer mode.** He raised it and immediately noted that it is easy to get off course. It generates no work. None of this changes the order.

## 10.39 A BLOCKED SIGHTLINE IS CAUTION, AND HOW MUCH IS SKILL (the maintainer, relayed by the project lead, 4 November)

**RULED, verbatim: "cover the brake and use caution wherever a sightline is blocked. bad drivers might not do this so it's another way to express skill level through one of the axes."**

**So the behavior is right and the magnitude is wrong.** A blocked sightline produces caution, not a stop. The rule that demanded a median 186 m/s^2 (SIMULATOR IN FLIGHT 40) was a defect in how much, not whether. "Wherever" answers the question put to him: a driver with a green or a clear uncontrolled approach does slow.

**A DEFECT TURNED INTO A FEATURE, AND WORTH MARKING.** The hold was wrong, and what replaces it is more expressive than anything we would have built had it merely been tuned: it is a new place to read a driver.

**What it should look like (the project lead):** a good driver arrives at a blocked sightline already slower with margin in hand, so if something emerges they handle it smoothly; a poor one arrives at full speed and has to brake hard, or does not react at all. Measurable: approach speed at the obstruction, and the braking that follows.

**Which axes is to be tested, not taken (the project lead's reading):** observation (noticing it is blocked), knowledge (knowing it warrants caution), confidence or imposition (noticing, understanding and going anyway). If all three participate, show it; if one dominates, say that. Not spread across three for tidiness.

**Two changes, measured separately, predictions first.** The amber-rule switch (`world.marginCanStop`) addresses impossibility; this addresses caution. The amber fix must not silently implement this.

**MEASURED, 4 NOVEMBER (branch `sight-caution`, off; SIMULATOR IN FLIGHT 40): ALL THREE AXES PARTICIPATE, EACH AS ITS OWN SIGNATURE.** Confidence is a size, observation a rate, knowledge a constant, and observation accounts for the most occasions lost (80, against 30 and 29) without doing nearly all of it. The old rule shows no order on any of them. **What this change is for, that the good driver then handles an emerging car smoothly, is not yet measured.**

## 10.40 ONE BEHAVIOR, THREE AXES, THREE SIGNATURES: THE STRONGEST EVIDENCE YET THAT THE DRIVER MODEL EARNS ITS COMPLEXITY (4 November)

**The project lead's assessment, recorded as such: the best thing this project has produced.** Whether five axes earn their complexity has been open, in the project lead's account, since the cold review in September. The standard was set long before this result, at 4.4 of this file: an axis earns its place when it fails in a way the others cannot reach.

**The result.** At a blocked sightline (10.39), the same situation read through three axes gives three different kinds of failure, none of them overlapping:

- **A KNOWLEDGE GAP IS A CONSTANT.** The driver who does not know a blocked sightline warrants caution never slows. Slowed on 0 of 11 occasions, 8 drivers.
- **AN OBSERVATION GAP IS A RATE.** The driver who sometimes misses it sometimes slows. Slowed at all on 29% and 39% of occasions in the two poor bands (n 7 and 23), against 100% and 97% in the sound ones (n 36 and 34), and when they do slow it is by about as much.
- **A CONFIDENCE GAP IS A SIZE.** The driver who sees it and knows slows by less, on nearly every occasion. Mean cut in speed -6% at the boldest (n 8), 8% (n 4), 19% (n 17), 23% (n 35), 31% for the timid (n 79).

**Which reads as a sentence about a person, the project lead's framing of what the maintainer asked for: looking at a driver and seeing what is wrong with them.** Never slows at a blind corner: a knowledge gap. Sometimes slows: observation. Always slows, but barely: bold.

**UNDER THE OLD RULE THERE WAS NO ORDER AT ALL.** The same bands slowed on 65, 72, 45, 60% (observation) and 50, 80, 38, 59, 57% (confidence). A uniform hold could not say anything about anybody. This came from replacing a defect with a graded response, not from tuning (10.39). And it was designed so it could fail: three signatures were written down before the run, and it was possible for any two to come out indistinguishable.

**WHAT MUST STAY ATTACHED WHEREVER THESE NUMBERS ARE QUOTED (and 10.44: the magnitude they were measured at has since been ruled too much, so the size signature in particular is to be re-measured):**

1. **THE EXTREME BANDS ARE AS FEW AS 4-12 OCCASIONS.** 0 of 11 for knowledge is 8 drivers. The shape across bands is the evidence; no single extreme band's number is.
2. **MY 30% PREDICTION FAILED, AND IT WAS A GUESS AT AN UNDERIVED NUMBER.** Sound drivers were predicted at least 30% slower than the baseline; they came out 21% below their own speed and 9% below the baseline. Half of all occasions clear before a driver would act.
3. **UNDER CONSEQUENCE, TESTED ON ONE GEOMETRY (5 November, SIMULATOR IN FLIGHT 40): THEY DO FAIL DIFFERENTLY.** Knowledge-poor hits (10 of 260). Observation-poor splits: when they slowed, 0 of 232, like sound; when they did not, 4 of 27. Bold does not hit, and takes it anyway: 0 hits, 40-50 tight passes against sound's 14. A small effective sample: about 26 offsets, and every hit on one of them; the control closes with no trucks. MY PREDICTION ABOUT BOLD DRIVERS WAS WRONG IN DIRECTION AND RIGHT IN MECHANISM: I had them among the worst for hits, and they hit none. **And the sound driver survives but does not handle it smoothly: the derived speed buys a stop at their hardest, median 8.0 m/s^2, so that half of the description is not shown, by design.**
4. **IT HAS A COST THAT IS NOT BURIED:** overshoots 64 against 52 with the amber switch alone (78 with neither), because drivers no longer stopped by the margin reach real conflicts faster. Whether what they reach is handled or hit is a stated outcome of the scene.
5. **IT IS NOT SHIPPED.** On the branch `sight-caution`, off, until the scene reports. Nobody driving the game can see this yet, and that a player can read these signatures by eye is the project lead's framing, not something measured.
6. **KNOWLEDGE'S DIFFICULTY OF 0.25 HAS NO DERIVATION**, a placeholder set by analogy with `shoulder-check`, itself placed without a ruling, and it decides how many drivers fall in that band (about 8%). The maintainer's to set.

## 10.41 WHAT THE ROAD IS FOR: PEOPLE MAKING DECISIONS THE PLAYER WITNESSES, NOT REAL-WORLD STATISTICS (the maintainer, with the project lead's pushback, which he invited, 5 November)

**DIRECTION, THE MAINTAINER'S:** he does not want behavior tuned to real-world statistics. The target is a road visibly full of people making individual decisions, with incidents the player witnesses. His example: the car ahead failing to use caution and getting t-boned in front of you.

**THE PROJECT LEAD'S PUSHBACK, RECORDED WITH IT:** rates still matter, not for realism but for legibility. An event that happens too often reads as a bug rather than a decision. Measurement earns its place in proving a mechanism works at all, after which frequency is a feel question, and his.

**THE IMPLICATION HE HAS NOT YET DRAWN:** at one crash per two hours he would essentially never witness one, so his target implies a HIGHER incident rate than reality. (On the city: 0.43 an hour at 180 cars and 1.29 at 300, 28 October, on the old world, and those are crashes anywhere on the map, not in front of anybody.)

## 10.42 THE PARKED CARS: NOT IN THE BUDGET, BUT MOST OF WHAT HE SEES, AND ON MOST MAPS THEY CAN NEVER MOVE (facts, 5 November; nothing fixed)

**The maintainer: "the majority of cars are just parked along the road, and they never ever seem to move. nobody ever gets in and drives so we spend the car budget for no moving traffic."** `tools/measure/parked-census.mjs`, the game's own world with the good driver, two seeds, four minutes.

**THE HYPOTHESIS THAT PARKED CARS ARE IN THE COUNT IS FALSE.** Parked cars are `world.parked`, not `world.actors`; the target and the readout count actors. Asked for 180, every map holds 177-179 actors, whatever is parked. **So "180 cars" never included them, and no encounter rate, shaping ratio or per-car figure was counted over them.**

**BUT HIS OBSERVATION IS RIGHT, AND SHARPER THAN THE HYPOTHESIS.**

| map | cars asked | moving | standing | parked | parked, of all cars | within 100 m: moving / parked | parked cars leaving |
|---|---|---|---|---|---|---|---|
| city | 180 | 164 | 15 | 1,875 | 91% | 2.5 / 27.6 | 10.9 a minute |
| city | 300 | 247 | 52 | 1,843 | 86% | 5.0 / 27.6 | 18.2 a minute |
| test map 1 | 180 | 125 | 54 | 135 | 43% | 10.3 / 10.1 | **none** |
| test map 1 | 300 | 184 | 115 | 135 | 31% | 18.4 / 10.1 | **none** |
| highway, loop | 180, 300 | 149-273 | 1-83 | 0 | 0% | 5-10 / 0 | no parking |
| peds, signs | 180 | 72, 83 | 107, 96 | 181 | 50% | 13 / 20 | **none** |
| buses | 180 | 53 | 126 | 88 | 33% | 12 / 1 | **none** |
| trial city | 180 | 164 | 15 | 4,973 | 97% | 3.2 / 6.6 | 7.9 a minute |

**CAN A PARKED CAR EVER START DRIVING? ONLY IN A DISTRICT.** `pullingOut` runs only for district streets (`districtStreetsOf`), and a map with no districts has none: test map 1, peds, signs and buses show 0 of their parked cars ever leaving, and by the code they cannot. On those maps his sentence is literally true. On the city the mechanism exists and is close to invisible: 10.9 a minute against 1,875 is any one car leaving about every three hours, and near the player about one every six minutes. **READ, NOT MEASURED:** a car pulling out is drawn fresh from the arrival counter (`spawned`), and the slot's `n` is not read, so it is a new person, not the one who parked; parking.js's "the same people all day" is true of the count only.

**COST.** Step, near alone, 180 cars, same seed, two rounds each: the city 4.85 and 4.80 ms with parking, 4.27 and 4.19 without (about +0.6 ms, 14%); test map 1 9.83 and 9.64 against 9.37 and 9.39 (about +0.35 ms). The worlds differ a little, since trips end differently, so this bounds it rather than isolating it: not stepped like cars, not free either. Already on record as a DRAW cost, 17-21% of canvas calls (SIMULATOR 1.2.x). **His "budget for no moving traffic" is a real cost at the frame, not in the sim's count.**

**THE FINDING NOBODY ASKED FOR: THE MARGINAL CAR ON A SMALL MAP STANDS STILL.** From 180 to 300 asked, moving rises by 83 of 120 on the city (69%), 59 on test map 1 (49%), 20 on buses, 17 on signs, **5 on peds (4%)**. At 180, peds is 60% standing, signs 54%, buses 70%. Those maps' own defaults are 40, 40 and 20, and CLEAN MODE SETS 180 ON ALL OF THEM (`cleanCars`, MapRoad.jsx, "measured best on the maintainer's phone", on the city). That is "why adding cars bought so little", on small maps: it is a jam, not parking. **THE 180 IS THE ENDLESS HIGHWAY'S** (SIMULATOR 1.2.19, his best configuration there), not the city's, as this entry first said. **THE PROJECT LEAD RECORDS IT AS THEIR OWN DEFECT:** they specified 180 from the highway and it was applied to every map, some of whose sensible density is 20-40. It is an instance of 10.35: a feature belonging to a screen and not to the world. **THE DATES, AS GIT HAS THEM: Clean mode's 180 landed Thursday 22 October (`60de896`), and 10.35 was named Wednesday 28 October (`a469173`), so it preceded the principle by six days;** the project lead's own account had it three days after. What Clean mode should do instead is with the maintainer.

**180 IS ALSO THIN ON THE CITY:** 71 lane-km, default 300 by the map's own density rule, so Clean mode runs it at 60%. 2.5 moving cars within 100 m is what that looks like. The low encounter rate on the city is density, not a miscount.

**WHICH RECORDED MEASUREMENTS THIS AFFECTS (each read against the counters, none re-run):**

- **NOT AFFECTED by parked cars:** encounters and met per minute (encounters.js reads `world.actors`); every shaping ratio, the 3.18, 2.78, 2.30 and 2.20 (the highway has no parking at all); phantom leaders; overshoots; crash counts; "too polite" v/v0 (actors over 1 m/s), **SO THIS DOES NOT EXPLAIN "TOO POLITE", WHICH STAYS OPEN.**
- **STEP COST PER CAR, CITY:** carries up to about 0.6 ms of a 4.8 ms step not caused by the cars counted. The 300-car and 180-car per-car figures on the city overstate per-car cost by up to about 14% at 180. Test map 1 about 4%.
- **FIGURES AT A SET COUNT ON SMALL MAPS, DIFFERENT CAUSE:** anything measured at 180 or more on test maps counts a standing queue as traffic: the step-cost-per-car rise on test map 1 (45 us a car, SIMULATOR 5.x) and the lookaway repro at 260 cars are measured with a third or more of the map standing. **verify-lookaway's 260 is on a map where this applies; not re-run.** (verify-headway's city and highway are not small maps; its restatement stands.)
- **"160 -> 280 cars on the highway bought 5.5 -> 6.0 met a minute" (SIMULATOR, the case for shaping):** not parking, since there is none there; the highway standing share is 17% at 180 and 28% at 300 on test-highway, and under 1% on the loop, so this stands, for the reason it was recorded.
- **FRAME BUDGET ON THE PHONE, 180 AS "MEASURED BEST":** measured with 91% of the cars drawn being parked. The moving budget might be different with fewer parked cars drawn. Nobody has measured it.

**THE MAINTAINER'S PUSHBACK, 5 NOVEMBER, AND HE IS RIGHT:** *"I'm still not quite clear how the parked cars were actually immobilized traffic. traffic would still move, but few."* **THEY WERE NEVER TRAFFIC, AND THE ANSWER THAT REACHED HIM WAS WRONG (the project lead relayed the density point as the answer, and this entry's report invited it, by calling two different things "the finding").** TWO SEPARATE THINGS: (1) the cars he means, at the curb, are slots in `world.parked` with no speed, path or driver, and on a map with no districts nothing ever empties one, because `pullingOut` runs only for district streets. (2) The standing share on small maps is real cars queued in the lane under Clean mode's 180, which is a jam and does creep. The density point answers "why did adding cars buy so little", not "why do those cars never move". **NOT ESTABLISHED: whether an actor can stand indefinitely.** The census counts moving and standing in snapshots and follows no car, so "standing" here does not mean "never moves".

**AND HIS OWN READING, SAID BEFORE THE ANSWER ABOVE REACHED HIM: "we added parked vehicles and they were placed against the overall car budget." NO, ON EVERY MAP.** The density setting is `world.target`, and the only things that read it are the arrival gate and shaping, both against `next.length`, the actors (crossing.js 2226-2227, shaping.js 163, 175). Slots are filled once from the map's zones and the seed (`initialParked`), knowing nothing of the target: the table above holds 177-179 actors on every map with parking, and the same parked count whatever was asked. The highway and the loop have no parking at all. **The one sense in which he is right is the phone's budget, not the density setting:** they cost 17-21% of canvas calls and up to about 14% of a city step, and Clean mode's 180 was measured best with them drawn. **THE PROJECT LEAD'S CORRECTION, FOR THE RECORD: they told him Clean mode's density was the explanation. It was a separate observation and they presented it as the finding.**

**THE RECORD CORRECTED (the project lead, 5 November): the maintainer's reading was wrong and so was theirs; parked cars are not drawn from the density budget.**

**WHAT THEY COST THE FRAME, MEASURED (`tools/measure/frame-cost.mjs`, 180 cars, one seed; the frame centered on one moving car in 8, 22-23 places):**

| map | zoom | road users drawn | of them parked | canvas calls | of them parked |
|---|---|---|---|---|---|
| city | street | 28.0 | 15.7 (56%) | 3,556 | 845 (24%) |
| city | district | 47.3 | 31.1 (66%) | 6,349 | 1,681 (26%) |
| peds | street | 24.0 | 8.9 (37%) | 2,770 | 481 (17%) |
| peds | district | 32.4 | 11.8 (36%) | 4,246 | 638 (15%) |
| test map 1 | street, district | 14.1, 19.0 | 0 | 3,032, 4,762 | 0 |

On the whole city in one view they are 35% of 39,334 calls. **Test map 1's 0 is real and is where they are, not that they are cheap:** all 129 sit in one corner (x 50-690, y 795-1090), with 8 of 180 cars within 60 m of one; centered there, 36% of calls. **THE TOOL'S OLD 2b FIGURES WERE BIASED: its camera centers on the first thing in the list, which is a parked car.** That is why test map 1 read 36% there and the record's 17-21% is not comparable. **MILLISECONDS ARE NOT ESTABLISHED:** this canvas paints nothing, so desk draw times are JavaScript alone, noisy to the point of negative, and leave out fill, which is what a phone pays beyond calls. A whole frame loop without parking saves 1.37 of 14.5 ms on the city and 1.86 of 20.3 on peds (about 9%), a bound on a loaded desk in a world that differs. **The phone's number is one bench run away: #/bench's split has a parked switch.** **VERDICT: MATERIAL ON THE CITY, NOT NOISE: about a quarter of the calls for cars nobody watches move. Worth carrying in the inventory work, and a real input to whether Clean mode draws them all. Not worth optimizing until the phone says what a quarter of the calls costs in milliseconds.**

**NOT FIXED, BY INSTRUCTION.** Several directions follow, and all are the maintainer's: whether parked cars should leave at a visible rate, whether maps without districts should allow it, how many should be drawn, and what Clean mode should do on small maps.

## 10.43 BUILDINGS THAT HIDE THINGS: SCOPED, NOT BUILT (5 November)

**The project lead: in a city, buildings are the principal thing that hides a car, far more than trucks, so a sightline feature that only responds to trucks barely shows on the maintainer's maps and cannot express the behavior at intersections, where it matters most. It also bears on the combined map.** `tools/measure/building-sight.mjs`, no source changed. Desk machine; the phone is several times slower.

**CAN THE SIGHT MODEL TAKE A STATIC OCCLUDER? YES, MECHANICALLY.** A sight blocker is already a plain box, `{ id, x, y, heading, l, w }`, in `world.tall`. Every test takes boxes, and a check already hands it a static one (verify-trucks' `between`). `phantomHolds` looks ids up and skips any that is not a vehicle. What blocks it is one line: the step rewrites `world.tall` from the vehicles each tick (crossing.js 2363), so a static list has to be merged there. **`peds.js inSight` also reads `world.tall`, so buildings would hide people on foot from drivers too**, which touches the fairness owed the player (`verify-peds`) and is not free of consequence.

**ARE BUILDINGS GEOMETRY THE SIM CAN SEE? THEY ARE GEOMETRY; THE SIM DOES NOT READ THEM.** The loader keeps each as position, heading, length, width and height, the same box and the same heading convention (`loaded.props`, chunked), and only the renderer and the loader's own road test use them. Height is there (5 m at the lowest, 7 median), all above `HIDES`. Plan-only, so a building under a deck and hills are not handled.

**SIX OF THE EIGHT TEST MAPS HAVE NO BUILDINGS AT ALL.** The city has 786, the trial city 2,314; test map 1, peds, signs, buses, highway and loop have none.

**WHAT THEY WOULD HIDE, FROM THE GEOMETRY:**

| | crossing roads hidden in part from 30 m back | from the line | hidden entirely, either place |
|---|---|---|---|
| city (3,898 pairs) | 52% | 0.6% | 0 |
| trial city (13,048 pairs) | 53% | 0.3% | 0 |

**That is the shape the feature wants: blind on the approach and clear at the line.** A driver who stops can see, so the missing creeping does not leave anybody stuck, and caution has somewhere to fire at about half of all approaches, where trucks gave it a few. On a sample, not a design: lots are set about 30 m from a node (median nearest building), and a corner building closer than that would change it.

**COST PER TICK, ON THE ASKING, WHICH IS THE WHOLE OF 10.33'S TEST:**

| world, caution on | step | whatStops as is | all buildings to every car | only those near, by a grid |
|---|---|---|---|---|
| city, 180 | 4.62 ms | 2.04 | 4.36 (+2.32, 50% of the step) | 2.71 (**+0.67, 14%**) |
| city, 300 | 8.68 | 3.94 | 7.87 (+3.93, 45%) | 5.15 (**+1.21, 14%**) |
| trial city, 300 | 13.14 | 4.88 | 12.70 (+7.82, 60%) | 5.53 (**+0.65, 5%**) |

**By 10.33 this adds an evaluation, so it has to earn its way, and an index is not optional:** handed every building it costs half a step. The grid's own lookup is outside those timers, and people on foot are not in them. **A CHEAPER SHAPE IS AVAILABLE AND UNTRIED:** buildings do not move and neither do paths, so the answer can be a table made once at load, per approach, per crossing road, every 5 m over the last 60 m: 43,397 entries in 0.3 s on the city, 136,104 in 1.1 s on the trial city, then a lookup per tick. It passes 10.33's test where the per-tick form does not. Trucks still need the moving test; only the static half becomes a table.

**WHAT IT DEPENDS ON, IN ORDER:**

1. **THE CAUTION CHANGE MUST BE DECIDED FIRST, AND THE SPEED QUESTION WITH IT.** Under the rule on `main` a moving driver is HELD by what they cannot see. Half of all approaches blind from 30 m under that rule would stop the city. Buildings on the current rule are not an option at all.
2. **THE CAUTION SPEED IS THE MAINTAINER'S, AND THIS MAKES IT BIGGER.** A choice felt at a few trucks becomes one felt at about half of all approaches, so the flow cost measured at trucks (none visible) does not carry over and has to be measured again.
3. **EVERY WORLD WITH BUILDINGS MOVES**, and the checks on them re-baseline, the city's and the trial city's at least.
4. **THE COMBINED MAP (10.35, handoff section 9) SHOULD NOT BE BUILT AS IF THIS WILL NOT HAPPEN:** where buildings stand at corners is then a traffic decision, and a map laid out without it needs revisiting.

**EXTENDED BY 10.44: THE SCOPE IS THE ENVIRONMENT, NOT BUILDINGS.** Trees, bushes and signage belong here, with what can be seen through, under and over each, and so does any object near a corner, since that is what produces the creeping case. A map laid out without them needs revisiting. **10.43's table of what buildings hide is true of lots set about 30 m back; a tree at a corner is what changes 0.6% from the line.**

**WHAT IS NOT KNOWN:** whether a world behaving under buildings keeps its flow, crash rate and the three signatures; none of that was stepped. Whether the player, who sees from above, can see what a driver cannot, and what that does to fairness and to what the player reads, is a design question nobody has asked.

## 10.44 THE CAUTION QUESTION REFRAMED: SLOWING HAS A PRICE, AND WHAT YOU ALREADY SAW COUNTS (the maintainer, relayed by the project lead, 5 November; recorded, NOTHING BUILT)

**Verbatim:** *"most people still don't expect anything to actually come out and will avoid slowing down completely especially with traffic flowing behind. everyone standing on the brake should be putting themselves at risk of being rear ended... if there isn't a larger obstacle around they could get a view of the road before approaching the truck that would give them a strong sense of how much danger could be there... most drivers would tend to assume safety even when slowing for a blind spot like a parked trailer especially when they are not facing any controls (lights, signage)... an example I think is being missed here is how a car turning right might have to creep forward to see past the truck, instead of only cars going straight past the obstacle."*

**1. NEITHER HARDEST NOR COMFORTABLE: THE BASELINE IS BARELY SLOWING, AND THE REASON IS THE CAR BEHIND.** Standing on the brake for a hazard that probably is not there risks being rear-ended. **The model has no such force: slowing costs a cautious driver nothing, so more caution always looks safe to it.** With the cost in, the behavior falls out: slowing has a price, the price rises with traffic behind, and the driver balances an unlikely hazard against a likely one (the project lead's statement).

**2. PRIOR SIGHT IS THE OTHER HALF (AND IT HAS A THIRD STATE, NEVER SEEN: 10.47).** A driver who had a clear view of the crossing road before the truck blocked it, and saw nothing, is justified in not slowing. Caution depends on what the driver knew before the view closed, not only that it is closed now.

**3. NO CONTROLS MEANS A STRONGER ASSUMPTION OF SAFETY.** A blind spot on an uncontrolled stretch gets less caution than one approaching a signal or sign. No magnitude; not to be guessed.

**4. THE CREEPING CASE, MISSED ENTIRELY.** A car turning right has to edge forward to see past the truck. **A different behavior and not a different number** (the project lead): advancing in increments until the view opens, not choosing an approach speed. It is also what a driving examiner watches for, so it matters twice. Scoped separately from the approach-speed work.

**5. OCCLUSION BY GEOMETRY, NOT BY OBJECT TYPE.** Verbatim: *"that truck isn't necessarily a solid block, there could be some visibility to a low car under the truck, or between where the tractor and trailer connect... even a tree or large bush can obscure the road, or a plaza sign."* **THE ONE STATEMENT, folding this with 10.27-10.28's partly transparent sedan: what can be seen through, under and over an obstruction depends on the heights and shapes of both the obstruction and the thing behind it, and partial visibility is a DELAY TO NOTICING, not a chance.** The delay half is the project lead's ruling; it answers the question 10.28 left open ("a lower chance of registering, a longer registration delay, a fraction of the body seen"), and a delay keeps it seeded and deterministic (10.9). Replaces "occlusion by object type" (10.27). sight.js today is plan-only and binary (a box taller than 2 m hides); the heights exist in the data (vehicles, buildings) and nothing reads them for sight. Tractor and trailer are one box.

**6. THE FOLLOW GAUGE STAYS: RULED, NOT TO BE REVISITED.** A way for the player to sense the car ahead by feel. (10.37, STORY.md 4 ruling 6.) The restyle is still open, the gauge is not.

**7. THE ENVIRONMENT NEEDS FILLING GENERALLY** (trees, bushes, signage), and it belongs to the buildings scope (10.43). `PROP_KINDS` holds house, shop and apartment and nothing else.

### THE NUMBER YES, THE THRESHOLD NO: DO NOT COLLAPSE THESE (the project lead, 5 November, correcting their own suggestion)

**The tidy-looking merge is wrong, and somebody will be tempted by it.** The deceleration forced on the car behind can be predicted once, by that car's own `decide`, and shared. **WHAT A DRIVER COMPARES IT WITH CANNOT BE SHARED.** `imposesOf` is how much cost a driver is WILLING TO PUT ON SOMEBODY ELSE. The price of slowing is how much RISK THEY SEE TO THEMSELVES. Read through imposition, an aggressive driver, who imposes freely, slows MORE at a blind corner, which is backward. Two thresholds, one number: this is the two-definitions pattern's opposite, and an aggression refactor that "removes the duplicate" reintroduces the bug.

### WE ARE NOT OPTIMIZING FOR A SAFE WORLD. WE ARE OPTIMIZING FOR A LEGIBLE ONE (the project lead, 5 November)

**The standard is that the failure modes stay distinguishable, not that the sound driver is safe.** The maintainer has asked to witness the car ahead getting t-boned, and a world where good drivers never hit anything cannot produce that. It recurs: read any "0 hits" here as a measurement, not as a target. With 10.41: rates matter for legibility and not realism.

**THE THREE-AXIS RESULT IS TO BE RE-MEASURED, NOT DEFENDED (10.40).** If the baseline becomes barely slowing and confidence as a size stops being readable here, that is an honest outcome: confidence may simply express itself elsewhere. Do not preserve a signature by keeping a behavior he has ruled wrong.

**THE ORDER (the project lead):** 0, whether a hard brake can actually cause a rear-end with look-away off, since it decides whether 1 is worth building: if it cannot, the price of slowing is a danger that does not exist (CLAUDE.md item 6). 1, the price of slowing and prior sight together, two halves of one behavior; prior sight held to its minimal shape, when each crossing road was last clear, per driver, near a line (a wider memory cost 22 ms a step). 2, creeping, after the maintainer rules on commitment, which the project lead is putting to him. The old engine's `assessCreep` reasoning is reusable, its code is not.

**ITEM 0's PREDICTIONS, COMMITTED BEFORE IT IS BUILT.** RE1: with look-away off, a car following a car cannot be hit into by hard braking: the follower decides from the previous tick with no lag and brakes as hard as the car ahead; 0 contacts at any rate. RE2: a truck following a car can, its hardest being 6 m/s^2 against 8: some contacts, at the hardest rate only. RE3, THE CONTROL: with look-away on the same scene produces contacts; if it does not, the instrument cannot see a rear-end and RE1's zero means nothing. RE4: in the city over 28 seeds with look-away off, no crash is a following car running into one braking. FALSIFIED IF car followers produce contacts with look-away off, in which case the risk is already real.

**ITEM 0's RESULT, 5 NOVEMBER: A HARD BRAKE CANNOT CAUSE A REAR-END BETWEEN CARS, AND THE PRICE OF SLOWING IS TODAY A DANGER THAT DOES NOT EXIST.** `tools/measure/rear-end.mjs`: a straight road, a lead settled with a follower settled at their own gap and a third car behind, the lead braking to rest, 120 drawn drivers at each of 4 braking rates and 2 speeds.

| world | car following: lead hit, of 960 | third car hit | truck following: lead hit, of 960 |
|---|---|---|---|
| look-away off (Clean mode) | **0** | **0** | 29, all at 8 m/s^2 (2 at 14 m/s, 27 at 25) |
| look-away on, as built since 10.19 | **0** | **0** | 30, all at 8 m/s^2 |
| the old glance, blind and any time: THE CONTROL | 53 | 23 | 70 at 8 m/s^2, 121 in all |

**WHY:** a follower decides from the previous tick with no reaction lag, and can brake as hard as anybody. The closest any car follower came was 1.56 m, with a settled headway as short as 0.55 s and the lead at 8 m/s^2. It is collision-free by construction, not by luck. RE1 MET. RE2 MET: a truck's hardest is 6 against a car's 8, so it reaches only the hardest stop, and caution braking would never get there. **RE3 FAILED AS WRITTEN, AND IT IS A FINDING:** look-away on is identical to off, near enough, because 10.19 made glances fit the road and a looming car brings the eyes back, so a driver close behind is not looking away at the moment it matters. Only the old blind glance, the deliberately retired one, shows a rear-end. So the scene can see one, and the world as built does not make one. RE4 MET: over 28 seeds of the city, 6 crashes, 2 between vehicles, 0 in one lane; 244 hard brakes with a car within 15 m behind, 0 of those followers in a crash within 5 s (`tools/measure/rear-end-city.mjs`).

**SO ITEM 1 AS ORDERED IS GATED: BUILT ON THIS WORLD, DRIVERS WOULD FEAR SOMETHING THAT CANNOT HAPPEN, WHICH IS CLAUDE.md ITEM 6.** And a player who stands on the brake in front of traffic is exactly as safe. What the maintainer described, everybody standing on the brake putting themselves at risk, is untrue of this model. **Making it true is its own decision, and it moves a deliberate fix:** 10.19 removed the crashes the blind glance caused because at 260 cars they read as a bug; 5.16.2 recorded a lag that made the bold candidate rear-end the car ahead, off because contact had no response, and contact has one now. The direction in 10.41 and this section's "legible, not safe" point toward a real risk; the project lead's to order.

### WHAT THIS DOES TO WHAT IS ALREADY RECORDED

- **THE DERIVED SPEED ON `sight-caution` IS RETIRED AS A TARGET.** It answered "from what speed could they stop"; the ruling asks a different question. Hardest against comfortable is withdrawn as a question. Both switches stay held.
- **10.40's SIGNATURES WERE MEASURED AT A MAGNITUDE THE RULING REMOVES, AND THAT IS NOW AN OPEN RISK TO THEM.** Sound drivers cut 21-26%. If the baseline is barely slowing, "always slows, barely" and "slows barely" get close together, and bold may stop being readable as a size. The rate and the constant survive more easily. To be re-measured; not assumed either way.
- **IT FITS 10.41:** barely slowing with a car really behind the truck means more of what he wants to witness, the car ahead getting t-boned. The staged scene's sound driver had 0 hits at a speed he now rules too cautious, so 0 will not survive and should not be read as the standard.

### THE THREE QUESTIONS, ESTABLISHED FROM THE CODE

**A. CAN IMPOSITION SUPPLY THE REAR-END COST? THE QUANTITY YES; THE MACHINERY IS NOT ON `main`, AND IT ANSWERS A DIFFERENT QUESTION.** On `aggression-phase1`, unmerged and 83 commits behind `main`: `lanechange.js` predicts the deceleration a change forces on the car behind by that car's own next decision (`decide` with this driver as leader at this gap), the sim's own following model and no second one, and compares it with `imposesOf`. ON `main` TODAY: `followerOf` (courtesy.js) finds the car behind in the lane, and `decide` is there. So the arithmetic is two lines on what exists, and no second model is needed. **BUT TWO QUANTITIES MUST NOT BE MERGED: imposition is how much cost a driver is WILLING TO PUT ON SOMEBODY ELSE; this is how much RISK THEY SEE TO THEMSELVES. Same number, different reader.** A low-imposition driver not slowing comes out right by accident; an aggressive one, who imposes freely, would then slow MORE, which is backward for a driver who also doesn't care. So the prediction is shared and the threshold is not, and what the threshold is, is not settled. **AND THE RISK MUST BE REAL OR IT IS A LIE (CLAUDE.md item 6):** with look-away off, Clean mode's setting, a follower reacts to the car ahead and is not put at risk by a late brake; whether a hard brake can actually produce a rear-end collision there has not been measured. How often it would arise: of 168 margin holds on moving drivers, 6 seeds, 43 (26%) had a car behind in the lane at any distance. **10.33: followerOf is a pass over the fleet, so it should be asked only on an occasion, not each tick.**

**B. DOES REMEMBERED SIGHT REACH THIS DECISION? NO, IN THREE WAYS.** (1) The memory is of CARS: `me.memo` holds road users seen, and nothing records that a stretch of road was seen EMPTY, which is what his sentence needs. (2) Its only reader is the visit list for blockedBy: `phantomHolds` and `sightlineFrom` never read it. (3) It is narrow on purpose: within 40 m of the line, other approaches, MEMORY = 6 s, trucks near (a wider one was 22 ms of a step at 300 cars). **THE NEAREST EXISTING REASONING IS OBJECT PERMANENCE in `phantomHolds`: if the road beyond the hidden stretch is in view, anything in it came through what the driver watched. It is the same idea and it only counts for a driver standing still** (`waited`). The staged scene shows the effect is real: 125-151 of 410 trials had the car seen before the trucks hid it, and those drivers were not surprised. So it wants a new, small thing: when each crossing road was last clear, per driver, near a line.

**C. IS INCREMENTAL ADVANCING-TO-SEE EXPRESSIBLE TODAY? NO. ONE HALF WORKS, THE OTHER DOES NOT EXIST.** WORKS: sight is from the eye at the car's pose, tested each tick, so a car further forward does see further with no change. MISSING: (1) a target between the line and the conflict. A car aims at the line or it is `going`; nothing stops at a place past it. (2) A state short of commitment. `going` latches at `LAUNCHED` (1.5 m/s), and `accepted` "is a decision, and it sticks". (3) THE HARD ONE: **PAST THE LINE, EVERYBODY TREATS YOU AS COMMITTED** (blockedBy: `them.s >= theirs.stopAt` returns true), so today a creeping car would take the right of way off the traffic it is trying to see. That is the established rule that too much creep intersects the path of other traffic, and it needs its ruling applied, not a workaround. (4) THE PRESENT SUBSTITUTE IS WORSE THAN NOTHING TO WATCH: a code comment says it outright: a driver who can see nothing of the road "edges forward" in life, and here concludes nothing is coming after UNDUE_AT and goes blind. **THE OLD ENGINE HAD THIS** (`assessCreep`, `PULL_STEP`, sized against the ~2 m between stop line and intersection, and creeping had to buy sight and cost safety: commit `9cca82e`, deleted in Cut C): the reasoning is reusable, the code is not, since it was not stepped. Checks on the candidate (`checks.js` left-right-left) are the natural neighbour: a look, then an advance, then a look.

**HOW COMMON, ON THE MEASURE WE HAVE, WHICH DOES NOT SETTLE IT:** over 6 seeds, the city at 150, trucks only: margin holds on moving drivers 168 (right turns 21), at rest 18 (right turns 1). So today's world shows the at-rest case rarely. **THAT IS NOT EVIDENCE AGAINST THE RULING:** nothing near a corner hides anything but a passing truck, buildings stand about 30 m back and hide 0.6% from the line (10.43), and there are no trees. The model cannot yet produce the situation he describes, which is the point of 7.

## 10.45 COMMITMENT: THREE STATES WHERE THE SIM HAS TWO (the maintainer, relayed by the project lead, 5 November; recorded, NOTHING BUILT)

**Verbatim:** *"a car can ONLY creep out after the stop line, the car is committed only when it's driving into the lane. the car should creep only to the point where they would be intersecting the oncoming traffic, but a bad driver might pull too far forward and obstruct the lane. another possibility is the car doesn't yield properly and forces a defensive action even when observing oncoming traffic, misjudging, or not caring, about the gap."*

**THE RULING IN STRUCTURAL TERMS (the project lead):** 1, AT THE LINE. 2, CREEPING: past the line, short of where the car's path would intersect oncoming traffic; NOT committed, and other drivers must not yield to it. 3, COMMITTED: entering the conflicting lane. Past the line is no longer sufficient for commitment. This answers 10.44's question C: it is what creeping was waiting on.

**TWO FAILURE MODES HE NAMES, EACH LANDING ON SOMETHING MODELED:**

- **PULLING TOO FAR FORWARD AND OBSTRUCTING THE LANE.** A stopping-position fault, on the real sheet under Position (the project lead). The sim already detects a car in another's path; what is new is treating it as a fault and not only as a conflict.
- **FORCING A DEFENSIVE ACTION WHILE WATCHING THE ONCOMING TRAFFIC, "misjudging, or not caring, about the gap". MISJUDGING IS A SKILL FAILURE; NOT CARING IS IMPOSITION. Same observable, two causes** (the project lead): a worked instance of his sectional-marking principle that attribution is part of the mark (10.25, 10.26), and it arrives from a driving behavior rather than being designed for the sheet.

**THE STANDARD, NOW HIS RULING AS WELL, verbatim: "if we are trying to ensure a good driver never has a collision it's just unrealistic."** With 10.44: distinguishable failure modes, not a safe world.

**THE ORDER IS UNCHANGED (the project lead):** item 0, then the price of slowing with prior sight, then creeping. Item 0 was answered before this ruling arrived (10.44); item 1 is gated on the project lead's decision about making the risk real.

**COMMITMENT'S PREDICTIONS, BEFORE THE MEASUREMENT (`tools/measure/commitment.mjs`, no sim change; main, 28 seeds).** C1: the creep limit already exists as `conflictOf(...).b`, with real room between the line and it on most approaches, least for right turns. C2: at least a third of overshoots stop short of the conflict with the road they were held for, so by the ruling those were never committed. C3: drivers are held by a car counted committed only by position, past its line and short of the conflict, the wrong yield the ruling forbids; common. FALSIFIED IF nearly all overshoots go straight into the conflict, in which case the ruling changes nothing for IN FLIGHT 40.

**SCORED, 5 NOVEMBER.**

- **C2 FAILED AND THE FALSIFIER FIRED: THE RULING DOES NOT RESOLVE ANY OF IN FLIGHT 40.** Of 78 overshoots, 77 went into the conflict and 1 stopped short (hidden 23 of 23, named car 54 of 55). They were committed by his definition as well as by position, so the classification stands.
- **C3 MET BY COUNT, AND THE COUNT MISLEADS.** 27,694 of 68,835 held pairs (40%) are held by a car past its line, not going and short of the conflict. But 27,632 of those then entered, and 17 stopped short: 99.8%. **TODAY THE POSITION RULE IS NEARLY A PERFECT PREDICTOR, BECAUSE NOBODY CREEPS:** the stretch past the line is a transit lasting moments, and a through car has no other commitment test (blockedBy's own comment). **It is wrong the moment somebody can stand there, and harmless until then.**
- **C1 MET, AND THE ROOM IS SMALL.** The limit exists: `conflictOf(...).b` is where a car's centre has its footprint touch the other path, padded, so no new geometry is needed. From the stop line to the nearest conflict, median: left 2.6 m, right 1.0, straight 0.2, with the minimum at -0.2. A car at rest has its centre 2.25 m back of the line (`waitAt`), so **the creep available from rest is about 4.9 m for a left, 3.3 for a right and 2.5 straight, at the median**. That matches what the old engine sized `PULL_STEP` against. Whether it opens a view is untested, since nothing near a corner hides anything yet.

**WHAT CREEPING HAS TO CHANGE, READ FROM THE CODE, WHICH CORRECTS THE PROJECT LEAD'S NOTE ON THE LATCH:** **`going` IS NOT THE OBSTACLE.** It latches only at over 1.5 m/s and not held (crossing.js 1917), so a car creeping below that while held does not latch. THREE THINGS ARE: (1) **`short`** ends at `waitAt + AT_LINE`, about 0.25 m before the line, and past it the line and the hold no longer apply, so nothing stops a car there. (2) **THE POSITION TESTS**, `them.s >= theirs.stopAt` returning true and `me.s >= mine.stopAt` returning false in blockedBy, with relatives at 1266, 1415 and 1460: past the line, the rest of the world yields to you and you to nobody. (3) **A TARGET**: a place past the line to stop at, which is the conflict point less a margin. **THE POSITION TESTS SHOULD NOT BE REPLACED, ONLY EXCEPTED:** a through car has no other test of commitment, and they are 99.8% right. A `creeping` state, explicit, set only by a driver doing it, leaves every world without creeping unchanged and can be switched off.

**CREEPING REFINED BY THE MAINTAINER (10.47): the limit below is not a limit.** Edge forward until you can see, accepting that you may end up in the way; `conflictOf(...).b` then measures how far in, and obstructing the lane is a matter of degree.

## 10.46 THE REAR-END RISK MADE REAL: A DRIVER'S OWN DELAY WHEN THE CAR AHEAD BRAKES (the project lead, 5 November; PREDICTIONS BEFORE ANY CODE)

**DECIDED (the project lead):** make the risk real, as its own item ahead of the price of slowing. A reaction delay when the car ahead brakes, using the delay each driver already has: it is why rear-ends happen, it reuses something modeled rather than inventing a hazard, and the risk a driver fears is then the risk that exists. **HOLD TO: (1) THE DELAY IS THE DRIVER'S OWN, so the risk varies by skill: "a poor observer should be the one who rear-ends, not a uniform chance". (2) NO TARGET RATE: build it honestly, measure what falls out; whether it is often enough to matter is the maintainer's afterwards (10.41).**

**THE ORDER NOW (the project lead): THE REAR-END RISK, THEN THE PRICE OF SLOWING WITH PRIOR SIGHT, THEN ENVIRONMENT (10.43), THEN CREEPING. CREEPING IS EFFECTIVELY BLOCKED ON THE ENVIRONMENT WORK, NOT ON ITS OWN DESIGN: it has 2.5-5 m of room (10.45) and nothing near a corner hides anything yet, so a creeping car would have nothing to see past. Do not pick it up expecting visible behavior before 10.43.** Its spec is 10.45's three obstacles (`short` ending before the line, the position tests in `blockedBy`, no target to creep to), and an explicit `creeping` state that EXCEPTS the position tests rather than replacing them, leaving every world without creeping byte-identical. Accepted by the project lead, including the correction that `going` latching at 1.5 m/s was never the obstacle.

### The mechanism, stated before it is built

**THE CUE IS THE BRAKE LAMP, WHICH ALREADY EXISTS** (`BRAKE_LAMP_ON`, 0.6 m/s^2). When a car's lamp comes on, the sim records when, at what speed and where. **THE DELAY IS `notices`**: every car has it, world perceiving or not, already described as "how long they take to notice a change in front of them" and already what a light gone green is read through: 0.35 s plus up to 1.6 s of observation deficit, with jitter, so at most about 2.9 s. Until that long after the onset, a follower reads that leader as still doing what it was doing: at the onset's speed, carried forward. After it, the truth, and `decide` brakes as hard as the gap now demands. **ONLY THE CAR-FOLLOWING READS, NEVER ANYTHING ELSE:** gap acceptance, conflicts and right of way read the present, because a constant lag on everything was 5.16.2's model and it crashed sound drivers into each other in a box (5.16.3). **ONLY A CHANGE, NEVER A STATE:** a queue that stopped a while ago is seen as stopped, so this is not the "poor observers rear-ended every queue" of 5.16.3. Behind a switch (`world.brakeReaction`), off, on the branch `brake-reaction`, until measured.

**TWO THINGS THE RECORD SAYS THAT THE MEASUREMENT HAS TO FACE, STATED NOW:**

1. **5.16.3: "nobody lives that far behind a car they are already watching."** The registration delay was measured as the time to notice a NEWLY VISIBLE road user. Using it for a change in a car already watched is an extension of it, the same one the green light already makes. Up to 2.9 s for the worst observers is long.
2. **THE PERIPHERY (10.19, the maintainer's ruling): something looming pulls the eyes back a reaction time later, `REACTION_FLOOR`, for everybody.** At following distances the looming threshold is crossed almost at once: 14 m back at 1 m/s closing is 0.009 rad/s against a 0.005 threshold. **SO IF THE PERIPHERY CAPS THIS DELAY, THE DELAY IS ABOUT 0.5 s FOR EVERYBODY AT THE DISTANCES THAT MATTER, AND THE DRIVER'S OWN DELAY IS ERASED, WHICH IS THE PROJECT LEAD'S FIRST CONDITION.** Both are therefore measured: UNCAPPED (`notices` as it is) and CAPPED (the eyes back at the existing rule). This is a real question about a ruling, and if the answer turns on it, it is the maintainer's.

### Predictions, committed before the measurement

The physics, stated independently of the code: a follower at speed v, gap g, delay T, braking at b against a lead braking at a, hits if **g + v^2/2a < vT + v^2/2b**. With a car follower b is 8.

- **RR1, THE ARITHMETIC HOLDS.** In `tools/measure/rear-end.mjs`, uncapped, at least 90% of trials land on the side this inequality predicts, read per trial from that driver's settled gap and delay. FALSIFIED below that: the mechanism is not what it says.
- **RR2, NOTHING AT A COMFORTABLE STOP.** No car follower hits a lead braking at 2.7 at either speed: that takes T over 2.7 s at 14 m/s and over 3 s at 25. Peak follower braking does rise, for poor observers. Hits begin at a lead of 5.4, and only for T over about 1.4 s (14 m/s) or 1.8 s (25 m/s).
- **RR3, THE AXIS, THE PROJECT LEAD'S CONDITION.** Uncapped, at a lead of 8: hits rise monotonically across observation quartiles, and at least 70% of them are in the worst quartile. A driver with `notices` under their settled headway does not hit anybody. FALSIFIED if the hits spread evenly across observation.
- **RR4, CAPPED ERASES IT.** Capped at the periphery's rule, hits fall by at least three quarters against uncapped and no longer separate by observation: the delay has become uniform.
- **RR5, THE CITY.** Uncapped, 28 seeds, 150 cars, 10 minutes, the same seeds as 10.44's 0 of 6: same-lane vehicle crashes rise from 0 to somewhere between 5 and 60 in all, at least 60% with the striking driver in the worst observation quartile. **FALSIFIED ABOVE 200**, which would be the "every queue" of 5.16.3 back again by another route, or a cascade: late braking making the hard braking that catches the next car. Crashes between different approaches stay within noise of 6, because right of way reads the present.
- **RR6, IT SHOWS BEFORE IT HITS.** Followers braking over 5.4 (the examiner's abrupt) rise in the worst observation quartile by at least 2x and in the best by under 1.3x. If so, the common event a player can watch is the late hard brake, and the rear-end is its rare end.
- **RR7, NOTHING MOVES WITH IT OFF.** With the switch off the world is the same tick for tick as main, on the city and test map 1.

**THE CONTROLS, TO BE RUN WITH IT:** delay zero (0 of 960 must come back, or the mechanism has broken something else); and the same delay for everybody at the population's median (hits must follow headway and stop following observation, or RR3 was reading something other than the delay).

### Scored, 5 November (the branch `brake-reaction`, off)

**THE MECHANISM WORKS AND THE RISK LANDS ON THE POOR OBSERVER: 0 TO 29 SAME-LANE CRASHES ON THE CITY, 28 OF THE 29 STRIKERS IN THE WORST OBSERVATION QUARTILE. BUT IT EXISTS ONLY IF THE PERIPHERY DOES NOT CAP IT, AND THAT IS A QUESTION ABOUT THE MAINTAINER'S RULING.**

Car followers in `rear-end.mjs`, 120 drawn drivers at each of 2 speeds and 4 braking rates:

| the delay | lead hit, of 960 | hits by delay quartile, lead at 8 m/s^2 |
|---|---|---|
| none (10.44; and the control at zero, re-run) | **0** | 0 0 0 0 |
| one delay for all, the median 0.58 s (control) | 11, all at 8 m/s^2 | 3 3 2 3 |
| **each driver's own `notices`** | **78** | **0 0 4 47** |
| own, capped by the periphery's rule | **0** | 0 0 0 0 |

The city, the same 28 seeds at 150 cars for 10 minutes each, about 699 car-hours:

| the delay | same-lane crashes | other vehicle crashes | hard brakes with a car within 15 m behind | seconds over 5.4 per car-hour, best to worst delay quartile |
|---|---|---|---|---|
| none | 0 | 2 | 237 | 5.12, 4.97, 4.94, 4.33 |
| one delay for all, 0.58 s | 0 | 1 | 260 | 5.22, 4.97, 4.83, 4.27 |
| **own** | **29** (28 car on car, 1 truck behind a car, none mid lane change) | 6 | 522 | 5.25, 5.06, 5.26, 5.73 |

**The player braking in front of a drawn follower** (`rear-end-player.mjs`, own delay, 2 speeds, 3 rates, using the screen's own contact): **80 of 720 hit the player, 75 of those by the worst quartile, none by the best.** At 2.7 m/s^2 from 14 m/s, 2 of 120 hit, and 25 of the worst quartile's 30 brake past 5.4 against 0 of the best's. So what the maintainer described is now true of this model, for this delay.

- **RR1 MET.** Every cell 118 of 120 or better, the inequality predicting the sim per trial.
- **RR2 FAILED.** 2 of 120 hit a lead at a comfortable 2.7 from 14 m/s, so hits do not begin at 5.4. **In the city the comfortable stop is the ordinary case:** the fronts of the crashes read were braking at 2.4-3.2 m/s^2 from 12-16 m/s: a line or a queue, and a poor observer close behind. That is an ordinary stop with a fault on the follower. Not traced per crash.
- **RR3 MET.** At a lead of 8, 27 of 29 and 20 of 22 hits are in the worst quartile, monotone, and 1 of 51 had a delay under their headway.
- **RR4 MET, MORE STRONGLY THAN PREDICTED: capped is 0 of 960.** I predicted a fall of three quarters and it is all of it. **The first capped run showed no difference at all, 29 and 21 hits, and that was MY BUG:** the eyes came back, the read turned true, the rate went unasked for the next tick, and they went away again. A bug read as a result would have said the periphery does not matter.
- **RR5 MET.** 29, inside 5-60; 28 of 29 in the worst quartile, the other with `notices` 0.56. Median striker 1.8 s against the population's 0.58, and **BOLD AS WELL: all 29 keep a headway of 0.77 or under and 14 are in the tightest quarter of drivers. The dangerous candidate of 4.4, blind and bold, arrived without being asked for.** It is not a cascade, far below the 200 of the falsifier. **THE "STAY WITHIN NOISE OF 6" HALF WAS WRITTEN AGAINST THE WRONG BASELINE:** 6 was every crash in 10.44, and 2 were vehicles. Other vehicle crashes went 2 to 6, not told apart at this sample, not traced; some may follow from a car stopped dead.
- **RR6 FAILED.** The worst quartile's abrupt braking rises 1.32x where I said at least 2x; the best 1.03x. So my claim that the late hard brake is the common event a player watches is not established: abrupt braking on the city is mostly other things. The scene does show it per stop (above), and hard brakes with a car close behind do double, 237 to 522.
- **RR7 MET.** Off, the same tick for tick as main on the city, the trial city and the peds map: seed 3, 150 cars, 180 s, hash equal.

**WHY THE CAP ERASES IT: the arithmetic in the section above.** Looming passes its threshold almost at once at following distance, so every driver's delay is a reaction time and a tick or two, which is under every headway drawn.

**NOT DONE, STATED:** no check is written; step cost not measured; the switch has not been run through the suite, where `verify-crashes` ("the default traffic still never crashes") and `verify-rivals` at least must be restated if it goes on; not run with look-away or checks on; the marking sheet does not know a late hard brake from any other. Hard brakes off read 237 here against 10.44's 244, and I have not explained the difference. **It stays off on its branch.**

**TWO OF THOSE GAPS, PREDICTED BEFORE MEASURING (5 November; own delay, the city at 150 and 300 cars, same seeds, on and off).** RR8, COST: asNoticed reads one field per following pair and copies a car only inside a delay, so the step rises under 3%. FALSIFIED over 5%. RR9, WITH LOOK-AWAY ON (`perceive`): same-lane crashes at least as many as look-away off with this delay, within sampling of 29, because a glance is already taken only when the road leaves room for it (10.19) and the follower's delay is read from the leader's lamp either way; strikers still at least 60% worst quartile. FALSIFIED if they at least double, which would mean the two delays stack: a glance and then a notice on top.

**SCORED.** RR8 HALF MET: three rounds each on seed 5, four processes at a time; 150 cars 4.68 to 4.81 ms (+2.8%), inside; 300 cars 11.84 to 12.33 ms (+4.1%), over the 3% and under the 5% falsifier, in a world that differs by then: this seed at 300 has 5 same-lane crashes on and 0 off, so it bounds the cost rather than isolating it. **That 5 is one seed for 10 minutes, not a rate; the city's rate at 300 has not been measured.** RR9 MET: look-away on, the same 28 seeds at 150, 30 same-lane crashes against 29, 28 of 30 strikers in the worst quartile: the two delays do not stack. Other vehicle crashes 10 against 6, with no look-away baseline without the delay run here, so that says nothing yet.

**ANSWERED, 5 NOVEMBER, relayed by the project lead: "Your recommendation, each driver has their own reaction time." UNCAPPED. The periphery's reaction-time rule stays about a driver looking away and does not cap this delay.** The "capped" control is removed from the code; its result stands above. **SO IT GOES ON, AS A PROPERTY OF THE WORLD (10.35), IN `seedGraph`, NOT A SCREEN'S.**

**PREDICTIONS FOR TURNING IT ON, BEFORE THE SUITE RUNS (`--all`, with `tools/verify-reaction.mjs` written and sabotaged).** ON1: some 8 to 20 of the checks that assert traffic runs clean fail, on a crash count and nothing else, because "nothing crashes" was a property of a world that could not rear-end. FALSIFIED by any failure that is not a crash the delay caused: that would be a regression, to be reported and not restated. ON2: `verify-worker` passes unchanged, since a car's onset crosses as ordinary changed fields; if the player's lamp, held on the world, does not cross, this finds it. ON3, THE RATE BY MAP at Clean mode's 180: small maps, standing in queues at 50-70%, rear-end more per minute than the city's 0.1, at least 3x on test map 1, since more stops happen close behind somebody. ON4: the lane a crash blocks does not jam the world: moving share within 5% of off on every map. **RESTATING: a verdict per check first. A check's assertion about its own feature keeps its strength; only a crash the delay explains may be excused, by a named test, and every restatement is sabotaged.**

**TURNED ON AND SCORED, 5 NOVEMBER, ON THE BRANCH `brake-reaction`; NOT YET ON MAIN.**

**TWO BUGS OF MINE THE SUITE FOUND, AND THE CITY FIGURES ABOVE PREDATE THEM. RE-MEASURED, THE SAME 28 SEEDS: 23 SAME-LANE CRASHES, NOT 29, ALL 23 STRIKERS IN THE WORST QUARTILE; OTHER VEHICLE CRASHES 3 AGAINST 2 OFF, NOT 6.** (1) The warm-up rebases the clock and the lamp's onset was not moved with it, so a car braking as the warm-up ended came on in the future. (2) The index's floor read a braking leader at its true place while the driver read it further on, so it dropped the car that really pressed hardest and a world with the index was not the world without it, from tick 0: a sixth reader of one quantity. `verify-generate`'s identity caught it. The scene's figures are unmoved: it has no warm-up and its numbers reproduce.

**WHERE IT LIVES, DECIDED BY THE FIRST RUN (the agent).** On by default in `seedGraph`, 39 of 56 passed. It now sits where `perceive`, `walkers` and `rivals` sit: `seedGraph` is the raw world a feature's check controls, `worldFor` and the bench ask for it, so every world the player can reach has it and no screen opts in (10.35). **THE COST, STATED:** a check on `seedGraph` tests its feature with no reaction delay, so an interaction between the delay and a feature shows only in `verify-reaction` and the 14 checks and libraries on `worldFor`. The alternative was excusing crashes inside every "touches nothing", which weakens the checks that are holding.

- **ON1: COUNT MET, FALSIFIER FIRED, AND PARTLY OPEN.** With it on everywhere, 10 checks failed on contact alone (graph, passing, peds, signs, merge, rivals, buses, bays, greens, lookaway), inside 8-20. **FOUR FAILED ON SOMETHING ELSE:** `verify-checks`, traced: 1 change of 343 prepared in the warm-up, its mirror look before recording began, an artifact of the check's window that any sample could hit, restated to changes prepared since recording began, and swapping the look order still fails it (258 wrong). **NOT TRACED: `verify-merge`, 2 cars reaching a seam still in an acceleration lane, in a run with a crash; `verify-loop`, overtakes 156 against the closed loop's 214 at minute 15; `verify-courtesy`, 1 gap taken and not said. They pass off, so they are questions about the world with the delay, and nothing now asks them.**
- **ON2 MET.** `verify-worker` passes with the delay on, unchanged.
- **ON3 HALF MET.** Same-lane crashes per minute at Clean mode's 180, 4 seeds of 10 minutes (the city's 0.08 is at 150, 28 seeds): trial city 0, loop 0.03, test map 1 **0.17, 2.1x where I said 3x**, highway 0.23, **buses 0.63, peds 0.65, signs 0.82.** Off, every one is 0. Of 124 strikers across the maps and the city, 123 are in the worst quartile. The trial city's 0 is not a dead mechanism: hard brakes with a car close behind rise 31 to 41 and the worst quartile's abrupt braking 13%. **A wreck stands 45 s (`CRASH_CLEAR`), so the small maps at 0.8 a minute carry about one wreck at any moment.** Those are the maps Clean mode already overfills (10.42): the rate is on that defect's account as much as this delay's, and not tuned.
- **ON4 MET.** Moving share within 2 points of off everywhere: largest signs 34.1 to 32.2, peds 31.3 to 32.5.

**THE SUITE, THE LAST TREE:** 51 of 56 in `--all`; `verify-start`, `-peds`, `-walkers` and `-waves` timed out at the 1,200 s cap and pass directly; `verify-checks` failed as above and passes restated. **So all 56 have passed on this tree, in two sittings, which is not one green run.** The timeouts look like load: even checks with no traffic ran 1.2-1.4x their recorded times, and alone the step is no slower on or off. verify-reaction is sabotaged five ways, each failing it, after the first attempt showed two of its sections could not fail.

**THE GATE BEFORE MERGING (the project lead, 5 November: "merging on unexplained suite failures is precisely the thing we would regret"), AND ON1'S THREE OPEN FAILURES TRACED.** The gate asked whether the three were the known timeout flaw. **THEY WERE NOT, AND THE TWO GROUPS HAD BEEN RUN TOGETHER:** the timeouts are start, peds, walkers and waves; the three failed real assertions with the delay on everywhere, and pass now only because their worlds have it off. Run with it on:

- **`verify-merge`, 2 "lost at a seam": THE CRASH PAIR THEMSELVES, towed.** car-2316 and car-2321, crashed at 184.65 s, gone at 229.70 s, CRASH_CLEAR later. Not a defect.
- **`verify-courtesy`, 1 lapsed offer said: THE CHECK COUNTING TWO MOVES AS ONE.** Seed 2, at 180, stretch 1: the player moved on a lapsed offer, and with the signal still on took a new, live offer into the next lane, which was rightly said. No crash involved; the sample moved. Fixed in the check: "said" is about the move being judged. Passes; sabotaged both ways.
- **`verify-loop`, speed spread 9.95 against a floor of 10: THE FLOOR IS ON ONE SEED AND ALSO FAILS WITH THE DELAY OFF** (7.57, seed 3). Five seeds, sd in km/h: off 12.87, 12.03, 7.57, 12.81, 12.26; on 9.95, 11.23, 10.58, 8.48, 9.58. Overtakes (off 165, 136, 94, 132, 137; on 156, 128, 118, 135, 132) and fresh cars at minute 15 (0.78-0.84 both) do not move. **SO NOT A BREAK, AND THE MEDIAN SPREAD DOES FALL, 12.3 TO 10.0: WHY IS NOT ESTABLISHED, and five seeds will not settle how much is real.** Nothing asks it now that the check's world is off. For the maintainer's eye on the highway.

**THE TIMEOUTS ARE NOT THIS BRANCH:** run side by side under identical load, branch against main: peds 936 and 934 s, walkers 965 and 964, waves 909 and 908, start 1014 and 1015. All pass. They were killed at the runner's 1,200 s cap, not at 3x a recorded time, whatever the line says: every recorded time times three is over the cap. **THE CAP IS WHAT A LOADED FULL RUN CANNOT MEET, and the message misreports which limit fired.**

**THE FARE GOES TO THE MAINTAINER (the project lead), ASKED:**

**WHAT THE PLAYER PAYS, FOUND NOW AND NOT DECIDED:** `money.js` voids the fare on any contact ("contact -- no fare"), and until now the player could only be the one who hit. **A player rear-ended at a red by a poor observer now loses the fare for it.** Whose fault a collision is, is the maintainer's (`playerContact`: "what a collision IS in this game is still the maintainer's question").

**THE QUESTION THAT WAS FOR THE MAINTAINER:** a driver is watching the car ahead and its brake lights come on. How long does a poor observer take to respond: as long as they take to notice a light gone green, at most about 2.4 s for this population and over 1.4 s for 15% of drivers; or does the closing gap reach everybody in about half a second? The ruling in 10.19 was given about a driver looking AWAY. **Extending it to a driver looking ahead makes a rear-end impossible again, and his "if we are trying to ensure a good driver never has a collision it's just unrealistic" is about good drivers: uncapped, no driver in the best quartile struck anybody.** Recommendation: uncapped. It is the only version that meets the project lead's first condition, and it is 1 same-lane crash per 10 minutes of a whole city at 150 cars. Whether that is often enough to witness, or too often, is his (10.41), with the map watched.

## 10.47 NEVER HAVING SEEN IS NOT THE SAME AS NOT SEEING NOW, AND IT REACHES THE SHEET (the maintainer, relayed by the project lead, 5 November; recorded, NOTHING BUILT)

**Verbatim:** *"imagine a small segment of wall that completely blocks your view while you are next to it. if you approach this wall from a distance you can reasonably predict what might be moving behind it as your view is blocked. however if your started with your view blocked, you would have no way to know what's coming so it could be any object at any speed and your approach to it would change. a car stopped with a blocked view may use undue caution they wouldn't otherwise, based on waiting time"*

**THE INFORMATION STATES (the project lead), WHERE THE MODEL HAS TWO:** saw the road clear recently, justified in proceeding; saw traffic on it, can predict roughly where it is now; **NEVER HAD A VIEW, zero information, must assume anything at any speed.** A driver beside a wall the whole approach has nothing to reason from, and should behave differently from one who glimpsed an empty road thirty metres back. **FOLDED INTO THE PRIOR-SIGHT WORK (10.44 point 2), NOT A SEPARATE ITEM.**

**THE MEMORY HAS TO HOLD MORE THAN WAS SCOPED (the agent, on the two lists given).** The project lead's three states and their three values for the memory are different lists: the states have "saw traffic" and no "stale"; the values, *never seen*, *seen and clear* and *not seen recently*, have "stale" and no "saw traffic". **"When each crossing road was last clear" CANNOT EXPRESS "SAW TRAFFIC"**, so the memory is per crossing road: never looked along; or last looked along at a time, and what was on it then. Stale is then that time's age and clear or traffic is what it held, which needs no fourth value. `me.memo` holds cars only, so it has the traffic half and neither of the others.

**NEVER-SEEN WILL BARELY OCCUR UNTIL THE ENVIRONMENT EXISTS (read, not measured).** Today only a truck hides anything, and a truck moves; a view blocked for the whole approach needs the static occluders of 10.43. So the third value can be built with item 1 but only a staged scene can exercise it before 10.43, and its visible behavior arrives with 10.43, as creeping's does.

### Undue delay needs a sight condition: against the marking work AND the sight work

**The project lead:** a driver sitting at a blind junction longer than normal is not hesitating: they cannot see, and waiting is correct. So undue delay cannot be judged the same way when the view is blocked, and the fault needs a sight condition before it can be trusted on any map with real occlusion.

**IT IS ALREADY WRONG FOR TRUCKS, NOT ONLY LATER (read from the code, how often not measured).** The undue-delay clock runs on `openTo`, which asks `blockedBy` of the actors in the present and knows nothing of sight, by design: *"whether the road was open is a fact about the road"* (crossing.js, the head of the file; 5.16.2). A driver held by a truck's hidden margin (`phantomHolds`, `byHidden`), on a road that is in fact empty, has an opening by that test, so `waited` runs, `delayed` latches past `UNDUE_AT`, and marking.js opens `undueDelay`. **That principle was right when everything was visible, and this is where it stops being sufficient: whether the road was open is a fact about the road, but whether the driver owed a go on it depends on whether they could know.** **AND HIS "BASED ON WAITING TIME" IS ALREADY HALF IN THE CODE.** `phantomHolds` has two give-ups, both on time stopped: where part of the crossing road is visible (`far`), a wait long enough for anything hidden to have come into view; and where the whole approach is hidden, `waited > UNDUE_AT * caution`, with the comment that a real driver would edge forward and that is not modeled. The second is the nearest thing the sim has to never seen, and it borrows the marking threshold: same 4 s, though the two clocks start differently (stopped, against the road opening). So item 1 replaces something rather than adding beside it, and the give-up should not stay tied to the mark by accident.

**RULED, 5 NOVEMBER, relayed by the project lead:** *"Undue delay would only be if they don't attempt to see, or a long delay (4-5s, less if traffic honks repeatedly and still no action) once traffic control changes for example."* **SO THE TWO CASES ARE:** (1) at a blocked view, not attempting to see, which is the fault and is not a matter of time; a driver who has edged as far as there is and still cannot see is not delaying. (2) A long delay once traffic control changes: 4-5 s, which `UNDUE_AT` and `LATE_OFF_GREEN` already are; **NEW: LESS IF TRAFFIC HONKS REPEATEDLY AND THERE IS STILL NO ACTION.** **WHAT THIS NEEDS, NOT BUILT:** case 1 cannot be judged until creeping exists, since attempting to see is creeping, so it waits on 10.43 and 10.45; until then the sim has no such fault to mark and a driver held by a hidden margin should be off the clock. Case 2 reads the horns the sim already has (`honkAt`, `honkTo`), counted at the driver. **READ AS STATED, TO BE CORRECTED IF WRONG:** this is about the blind junction and the control change, "for example"; I have not taken it to retire the existing mark for sitting at a stop with a clear view of an open road.

**THE QUESTION THAT RULING ANSWERED:** his words and the project lead's were not quite the same. The project lead: "waiting is correct". He said a stopped car "may use UNDUE CAUTION they wouldn't otherwise, based on waiting time". That can be read as an excuse, or as saying a blind wait can itself grow too long, and with creeping ruled (10.45) a driver can often do something other than sit. The question was whether sitting at a blind junction is ever marked, and the answer is the ruling above: yes, if they do not attempt to see.

### Creeping is "until you can see", and obstructing the lane is a matter of degree

**Verbatim:** *"the tightness is the point really. it's not uncommon for cars to have to drift so far they are intersecting the lane, even polite drivers could pull far forward if there's signage blocking the view."*

**This changes 10.45.** The 2.5-5 m of room is not a limitation to design around, and intersecting the lane is a normal outcome a polite driver may reach. Creeping goes from "edge forward within a safe margin" to "edge forward until you can see, accepting that you may end up in the way" (the project lead). **SO:** the target of 10.45's third obstacle is the first point the view opens, and needs a view test; `conflictOf(...).b` stops being the limit and becomes the zero of a measure, how far past it; and the obstructing-the-lane fault of 10.45 is a matter of degree, not a binary. **AND POSITION ALONE CANNOT ATTRIBUTE IT:** the same metres into the lane are ordinary where signage blocks the view and a fault where the view had already opened, so what the driver could see from where they stopped is part of the mark, the same sight condition as undue delay (the agent's reading; for the maintainer when the fault is designed). Traffic stopping for a car physically in its path needs nothing new: "somebody already across my path" in `whatStops` reads position against the conflict region, not commitment.

**Still blocked on 10.43, as 10.46 says:** signage does not block anything yet.

## 10.48 WHAT A COLLISION COSTS: DIRECTION FROM THE MAINTAINER, PROPOSALS FROM THE PROJECT LEAD (5 November; NOTHING BUILT, NOTHING SCHEDULED)

**Filed against the vehicle and contract work, not as its own item, since it depends on both. The maintainer's standing instruction applies: "I want to avoid adding 50 half-cooked features" (10.38).**

**THE MAINTAINER'S DIRECTION, as relayed:** lean away from realism here specifically. Cars collide, the weight of the impact is represented, and consequences are not game-ending: the GTA model, where damage accumulates and you fix it, replace it, or it eventually gives out. A player rear-ended through no fault of their own should feel an effect but not be punished for something unavoidable. He raised, and was uncertain about, an insurance-claim loop as a mundane-task system.

### The project lead's proposals, NOT YET RULED ON BY THE MAINTAINER

1. **FAULT ATTRIBUTION IS WHAT MAKES IT WORK.** No blanket rule: rear-ended while stationary at a light is not the player's fault and costs nothing but bodywork; rear-ended after brake-checking somebody is. **This answers the fare question (10.46) without a special case: the fare survives if it was not their fault.** The collision system must consume the same fault machinery the marking sheet does and not have its own: one definition.
2. **THE COST IS CONTINUITY, NOT ONLY MONEY.** Three tiers, none a fail state: a knock costs paint; a real impact costs the run; a bad one costs the car for a while. Damage accumulating to failure sits underneath as slow pressure.
3. **WEIGHT OF IMPACT FALLS OUT OF THE VEHICLE ARCHETYPES:** being hit by a loaded truck and nudged by a compact differ.
4. **A CONSEQUENCE ROUTES THE PLAYER SOMEWHERE, NOT INTO A FORM.** The appeal of that genre is the driving, with paperwork as texture, and a claims form is a menu. Damage sends you to the body shop, a dispute to dispatch, each a trip. It fits the analog setting, where you go in person. **RULED BY THE MAINTAINER AS A PRINCIPLE (relayed 5 November): he endorsed it, and HIS ADDITION is that it gives the player something to do while roaming.**
5. **EVENTUALLY: A DAMAGED CAR THAT HANDLES WRONG**: pulls to one side, brakes unevenly, overheats under load. Damage changes how you drive rather than what you click.

### What the code says against them (the agent, read, not measured)

- **MASS IS NOT IN THE DATA, against proposal 3.** A `VEHICLES` row (traffic.js) has length, width, height, accel, brake, most, cap and lateral; nothing here or in VEHICLES-GARAGE.md states a mass. It is a small addition, one column, but it is an addition and, unread by anything else, moves nothing. **A "loaded" truck needs a load too:** the row is per kind.
- **THERE IS NOT ONE FAULT MACHINERY TO CONSUME, against proposal 1.** `marking.js` judges candidates and never reads a player; `events.js` is a separate set of detectors for the player. The two already overlap, so "one definition" means reconciling them first, the project's recurring bug at the point it would be built on.
- **OF THE FOUR THINGS NAMED AS KNOWN:** the following gap is (`headwayOf`), and whether the player could have stopped is derivable from speed and gap. **Whether the player was looking is not: nothing in the sim knows where the player looks. Brake-checking has no detector.** And a crash records its two parties and where, not who struck whom or why (`crashWith`, `playerContact`).
- **THE FARE, CORRECTED BY 10.49:** this entry said a player rear-ended at a light loses the fare today. **They lose far more: the whole drive.** The world freezes and Restart rebuilds it, so `money.js`'s "contact -- no fare" can never be reached in the live game.

### The project lead's correction: he meant scrutiny, and the examiner mode already is it

**The project lead pushed back on the mundane-task idea as risking a claims form nobody wants, and had misread him.** His reference was Papers Please, where scrutiny IS the game: slow, detail-focused work can be the pleasure rather than a tax on it. **He is right, and the examiner mode is already that genre:** watching a candidate, noticing a shoulder check that did not happen, judging whether it was worth a mark. **THE CONSEQUENCE: WE DO NOT NEED A SECOND SCRUTINY SYSTEM, WE NEED TO BUILD THE ONE ALREADY DESIGNED. Two would compete for the same attention. If a claim loop ever arrives it is texture around the examiner game, not a parallel to it.** "Route them somewhere rather than into a form" stands, as above.

## 10.49 WHAT TERMINAL CONTACT WAS PROTECTING, BEFORE ANYTHING REPLACES IT (investigated 5 November; NOTHING BUILT, NO DESIGN PROPOSED)

**The maintainer named the prerequisite for 10.48: any collision currently stops the game entirely.** The project lead made replacing that the next build and asked what the rule protected first. Read from the code, the record and git; nothing measured.

**THE RECORD HOLDS THREE DIFFERENT THINGS UNDER "CONTACT ENDS A DRIVE", AND ONLY ONE IS A PLACEHOLDER:**

| when | what | what it says it is for |
|---|---|---|
| 8 Sept, `outcome.js` (`24d6f06`), old engine | contact or a taken wheel ends a drive, and says who it lands on | "A collision was simply not modelled" and "the accept test was standing in for a state the game could not represent". It carries his ruling on intervention: **MISSED**, contact with nobody taking the wheel, counts against the examiner. **Deleted with the engine, 14 October.** |
| 18-19 Sept, `Wheel.jsx` (`93053ba`), then `MapRoad.jsx` (`6bb818e`) | the player touching anything stops play | **A PLACEHOLDER IN ITS OWN WORDS, still on screen: "What a collision means here is still open; for now it stops you."** |
| 28 Sept (`7f30333`), `step` | two traffic cars stop where they hit, stand 45 s, are logged and cleared, and traffic queues behind | The response 5.16.2 was waiting for. **THE WORLD ALREADY CONTINUES AFTER TRAFFIC CONTACT.** The same commit made ExamRide end on the candidate's crash. |

**THE PROJECT LEAD'S RECOLLECTION, CHECKED: THE CAUSATION RAN THE OTHER WAY.** Terminal contact was not introduced because of perception lag; it is older and came from having no state for a collision (5.12) and from intervention. Lag was then HELD OFF until contact had a response: "it switches on when contact ends a drive" (5.16.2; REBUILD stage 5), because the bold candidate, lagged, rear-ended the car ahead, "a contact nothing draws and nothing responds to". **THE INTENT WAS 5.12's: NEVER SILENTLY DISCARD WHAT HAPPENED. "Ends the drive" was the only response then available, and 28 September already met it for traffic. SO: REPLACING THE PLAYER'S STOP WITH A DAMAGE MODEL SATISFIES THE ORIGINAL INTENT, AS LONG AS CONTACT STAYS VISIBLE AND RECORDED. IT DOES NOT REVERSE A DECISION.**

**THE EXCEPTION, AND IT IS NOT A PLACEHOLDER: THE EXAM.** The candidate's crash ending #/exam rests on his ruling on intervention, MISSED counting against the examiner, and 10.27-10.28 are still design: an intervention is a critical error that does not end the test, and termination is a set piece for a danger. ExamRide says so: "What taking the wheel earlier would have meant is still Jay's question." **Graduated damage for the player does not settle what a candidate's crash does to an exam. Separate question, his.**

### What ends on contact today

| where | on what | what happens |
|---|---|---|
| `#/map` driving: every test map, Clean mode, the editor's Drive it | the player touching a car, a parked car or a person | **The whole world freezes, in the page and the worker.** "Contact." and one button, Restart, which builds a new scene: job, meter, route, voice, events and streak gone. Only the wallet survives, and only because it is credited at drop-off. |
| `#/wheel` | a car | the same |
| `#/exam` | the candidate's crash, or leaving the map | the drive ends, said on screen |
| watching, and all traffic | any contact between others | nothing ends: a wreck, cleared after 45 s |
| a taxi fare | nothing of its own | `jobs.js` does not read contact. See below |

**THE BANNER NOW LIES SOMETIMES:** "You hit another car", said to a player rear-ended at a red by the delay of 10.46, or who struck a person or a parked car.

### Do any checks assert it? No, and that is the finding

**NO CHECK ASSERTS THAT CONTACT ENDS A DRIVE, BECAUSE THE RULE LIVES IN `setStopped` IN TWO COMPONENTS, WHERE NOTHING REACHES** (5.12.1's own lesson), and verify-screens renders only a first frame. **Nor does verify-exam look at a crash ending the ride.** So no check needs restating to remove it, and nothing would catch it being wrong. Those that encode part of it, to read when this is built:

- `verify-money`: "contact pays nothing", testing a branch the live game cannot reach (below). The rule 10.48 would change.
- `verify-worker`: on a hit it holds the player still, `stopped: true`, **while the world keeps stepping, which is not what the screen does.** A field nothing in src reads.
- `verify-crashes` section 3: "logged against the player", the default `other = "player"` in `crashWith`.
- `verify-voice`: a hit fires `collision` and resets the streak; holds if the drive continues, and see below.
- `verify-reaction`, `verify-peds`, `verify-drive`: read the first contact and stop; none depends on what follows.

### What assumes a drive cannot continue

1. **CONTACT HAS NO PHYSICS. THE STOP IS ONLY THE FREEZE.** Nothing changes the player's speed or position, and `playerContact` is overlap with no separation. **Take the freeze away and the player keeps their speed and passes through.** Everything in 10.48 stands on something here that does not exist.
2. **IT WOULD FIRE EVERY TICK.** `hit` is true while overlapping: `crashWith` declines to log a car already crashed, but `playerContact` still reports a hit, as it does for a parked car or a person. So `collision` would be said at severity 5 each tick, the flash and count run, and the streak resets, until they part.
3. **`money.js`'s "contact -- no fare" IS UNREACHABLE LIVE, AND THE METER LATCHES.** Reached at last, one touch voids the fare for the whole job, whoever's fault. That is the agent's report earlier today corrected: the fare question as asked was too small.
4. **A CRASH RECORD DOES NOT SAY WHO STRUCK WHOM** (10.48), and defaults to the player.
5. **THE PLAYER IS NEVER `crash`**: only the other car is. Traffic treats a stopped player as a car stopped with nothing holding it, so it would honk at somebody just hit (`freeStop`), and the wreck beside them is towed at 45 s on a clock the player has no part in.
6. **RESTART IS THE ONLY WAY ON:** nothing ends a job, resumes a route or moves a car off a wreck. And it replays the same seed.
7. **A PERSON STRUCK IS IN THE SAME BRANCH.** "Lies where they fell, is waited for and is cleared" (peds.js) is built, and it is the same `hit`. **Whether a game about driving well carries on, with bodywork, after the player hits somebody on foot is not settled by "the GTA model", and it is his.**

**NOTHING SCHEDULED BEYOND THIS INVESTIGATION (the project lead).**

## 10.50 FOUR RULINGS, AND DESTINATIONS AHEAD OF FURTHER DRIVER-MODEL WORK (the maintainer, relayed by the project lead, 5 November; NOTHING BUILT)

**1. CLEAN MODE DOES NOT SERVE SMALL MAPS.** The direction is one feature-rich map; the small maps are vestigial from when this was pre-cooked animation; *"traffic density should be always tuned for the player experience"*, not for simulating a whole map at once. Clean mode offers the proper map with density tuned for how it feels to drive. **THE SMALL MAPS ARE FIXTURES THAT LEAKED INTO THE MENU, NOT MAPS: they stay as check fixtures and leave the menu.** This answers 10.42's "what Clean mode should do" and makes Clean mode's 0.6-0.8 wrecks a minute on small maps (10.46) moot once built. **Settled by 10.51: the city for now, and the menu is Clean mode's choices only.**

**2. NOT-AT-FAULT COLLISIONS: THE RUN CONTINUES IF THE CAR IS STILL OPERABLE, with damaged handling as the consequence, and A QUICK INSURANCE PAYOUT COVERING PART OF THE DAMAGE, so the player is not punished for somebody else's mistake.** Better than simply not penalizing (the project lead): the world responds rather than the game declining to act, and it fits the analog setting. This settles the fare question's direction (10.46, 10.48). It needs what 10.49 found missing: contact physics, who struck whom, a car that can be damaged. Still his: a person struck, and a candidate's crash in an exam (10.49).

**3. THE LAPSED OFFER IS CORRECT AS BUILT.** *"drivers won't wait forever, take the gap or eat dust."* **CLOSED.**

**4. THE SKILL DIAL IS HARD TO SEE, HIS DIAGNOSIS:** *"the drivers mostly just go end to end."* It does not feel like cars interact much; he can clearly see lane drift; he needs time driving among flowing traffic, *"which we haven't been able to represent in a city setting at all"*. **The project lead's reading, to test:** skill shows when a driver must decide; lane-keeping is continuous so steering shows regardless; everything else needs a situation, and end-to-end travel supplies few. So destinations go ahead of further driver-model work, subject to the agent's view.

### Testing that reading: half right (the agent; tools/measure/skill-spread.mjs, destinations.mjs, 180 cars)

Per 100 car-minutes, two seeds, 3 minutes each, about 1,080 car-minutes a row:

| map, dial | rolled | harsh | keep right | tight change | blind miss | missed turn | horn |
|---|---|---|---|---|---|---|---|
| city -1 | 29.26 | 67.04 | 2.41 | 1.11 | 0.74 | 0.56 | 0 |
| city 0 | 12.79 | 22.80 | 1.58 | 1.95 | 0.46 | 0.65 | 0.28 |
| city +1 | 1.21 | 13.93 | 0 | 0.28 | 0 | 1.67 | 0.09 |
| loop -1 | 0 | 32.04 | 5.93 | 12.04 | 4.17 | 2.22 | 0.09 |
| loop 0 | 0 | 11.57 | 2.59 | 11.30 | 2.59 | 2.96 | 2.04 |
| loop +1 | 0 | 2.59 | 0 | 2.50 | 0.28 | 5.09 | 0.09 |

- **WHAT SUPPORTS IT: THE LANE IS SILENT ON THE CITY.** Tight changes and blind misses are about 10x rarer than on the loop. Over 900 car-minutes (5 minutes, seed 1): 3,256 intersections entered, **3 arriving in a lane that could not make the exit drawn, 47 lane changes made for a turn**: 5 per 100 car-minutes. That is the fix of IN FLIGHT 32 doing what it was told: the draw avoids any turn a lane cannot reach, so a car's route almost never asks it to move. No driver is competing for a lane on the city.
- **WHAT DOES NOT: THE DIAL ALREADY MOVES THE CITY A LOT.** Rolling stops 24x and harsh braking 4.8x from +1 to -1, which are axes other than steering expressing without any destination. So "nothing to express" overstates it, and the instrument can see them. **What he can see and what the counts show differ, so a second and third cause are live:** LEGIBILITY, a rolling stop or a hard brake being much less visible than a car wandering in its lane; and DENSITY, 2.5 moving cars within 100 m of the player on the city at 180 (10.42), which is his "flowing traffic" and which destinations do not add. **Interaction needs two cars there to interact.**
- **A TELL, UNEXPLAINED, AND POSSIBLY THE INSTRUMENT:** missed turns rise as the population improves, on both maps (city 0.56 to 1.67, loop 2.22 to 5.09). Not traced, by instruction; see 10.51 item 6.

### The agent's view: agree on the order, the cost is higher than 10.30 said

**Destinations ahead of further driver-model work: agreed.** The measurement above is the case for it, and 10.34 names the general reason: this is the same told-too-late property at its largest. **WHAT CHANGED SINCE 10.30, AND IT RAISES THE COST:**

1. **ITEM 32 REMOVED WHAT MADE IT LOOK CHEAP.** 906 misses became 19 because the draw stopped asking for turns the lane could not reach, median approach 50 m and a median -84 m of room. **A destination cannot use that escape: it needs that turn.** Given a plan through the existing hook as it stands, expect misses back at that order. So the real work is LOOKAHEAD: knowing the lane for a turn several blocks ahead and moving on an earlier stretch. `want` today lives on one approach. This is the piece 10.30 did not count, and it is where anticipation finally gets a say in lane choice (10.30 finding 1).
2. **A PLAN IS INTENTS BY LEG COUNT, SO ONE MISSED TURN INVALIDATES THE REST.** `wantFor`'s hook is real, but it was written for a candidate on a set course. A driver with a place needs to replan after a miss.
3. **ROUTING IS NOT FREE:** `routeTo` costs about 2.6 ms on the city and 9.8 on the trial city, on a busy desk, against a 4.8 ms step, and the phone is several times slower. Once a trip it is fine; per driver per intersection it is not. Written for one player, with a sort per pop.
4. **A TRIP HAS TO END SOMEWHERE:** pull-ins exist on district streets; otherwise a car leaves at an edge. 44% of random routes on test map 1 find no way, which matters less after ruling 1. Shaping's bias (10.30 finding 3) is still to meet.
5. **IT MOVES EVERY WORLD:** so a switch, as 10.46, and a re-baseline when it goes on.

**WHAT DID NOT CHANGE:** `routeTo`, the plan hook and the give-up rule (`changeRoom`) are there, the player's route already drives the same lane logic (`laneFor`, `nextTurn`), and exits on the loop are still a map change. **It is modest for the loop, where approaches are long, and substantial for the city, which is the setting he asked about.**

**THE DIAL AS THE INSTRUMENT (the project lead): the table above is the baseline, taken before any of it.** Prediction, to be restated with a falsifier when built: with destinations on, city lane changes for a turn rise from 5 to at least 50 per 100 car-minutes, tight changes and blind misses at least 3x and still ordered by dial, missed turns held near the loop's rate. **If the counts rise and he still cannot see the dial, the reading was wrong and the cause is legibility or density.**

**THE ORDER IS CONFIRMED IN 10.51, with density joined to destinations.**

## 10.51 THE ORDER CONFIRMED, AND LEGIBILITY AS ITS OWN ITEM (the project lead, 5 November; NOTHING BUILT)

1. **THE ORDER, AMENDED BY 10.52 TO PUT BODY MOTION AFTER TERMINAL CONTACT: TERMINAL CONTACT (10.49), THEN DESTINATIONS AND PLAYER-TUNED DENSITY TOGETHER, THEN THE PRICE OF SLOWING WITH PRIOR SIGHT.** Neither destinations nor density shows without the other, and 2.5 moving cars within 100 m (10.42) is the clearest argument. **One piece of work with one measurement.**
2. **CLEAN MODE USES THE CITY FOR NOW:** it has places to go and its routing costs about a quarter of the trial city's (2.6 ms against 9.8, a busy desk). Revisit when the combined map of 10.35 exists.
3. **"LEAVE THE MENU" MEANS CLEAN MODE'S CHOICES ONLY.** #/tests stays: it is how each feature reaches the maintainer (the 28 September rule).
4. **THE CONTACT BUILD: DESIGN IT ONCE THE MAINTAINER ANSWERS TWO QUESTIONS,** a person struck and a candidate's crash in an exam (10.49). The project lead is asking him. No design before that.
5. **THE PREDICTION AND FALSIFIER OF 10.50 STAND AS WRITTEN:** if the counts rise and he still cannot see the dial, the project lead's reading was wrong and the cause is legibility or density.
   - **WHAT JOINING DENSITY DOES TO IT (the agent):** one measurement over two changes cannot say which one worked, so each goes behind its own switch and the measurement is all four cells. And density stops being an untested alternative: if both are on and he still cannot see it, legibility is what is left, or density not yet enough.
6. **THE TELL IN 10.50, MISSED TURNS RISING AS THE POPULATION IMPROVES ON BOTH MAPS, IS IN THE RECORD AND NOT TRACED, by instruction.** It is counterintuitive enough that it may be an instrument fault rather than a finding, and those have been the most expensive mistakes here. **THE AGENT'S CONDITION: the destinations prediction reads missed turns ("held near the loop's rate"), so the counter has to be trusted before that clause is, and the clause counts for nothing until then.**

### Legibility: a seeing problem, tracked apart from the driver model

**THE MODEL PRODUCES DIFFERENCES THAT ARE MEASURABLY LARGE AND VISUALLY SUBTLE. Lane drift is the one he can see, and it is the one that moves the car where he can see it.** The project lead's framing: a presentation gap and not a model gap, with BODY MOTION as the likely answer: nose dip under braking, roll in a lane change, the maintainer's suspension idea. **Recorded so that a seeing problem is not fixed by changing the driver model.** It is the item on SIMULATOR's parked list, "body motion and roadside density".

**STATUS: A LIVE CAUSE, NOT A MEASURED ONE.** Nothing has tested what he can and cannot see, and what would is his eye.

**WHAT THE RENDERER DOES TODAY (the agent, read, not measured), which narrows the framing without changing it:**

- **A HARD BRAKE IS NOT QUITE INVISIBLE, IT IS IDENTICAL TO A GENTLE ONE.** Brake lamps are drawn (`paintLamps`, draw.js), deliberately oversized as map symbols, bright with a halo while braking. But the lamp is one bit, on past `BRAKE_LAMP_ON` 0.6 m/s^2 (crossing.js). The body does not change at all: on that the project lead is right. So the gap is manner, not whether.
- **CORRECTED BY THE AGENT, 5 NOVEMBER: THE RATE ALREADY CROSSES.** This line said a dip needed a rate sent through the worker. Every car carries `a` every tick (crossing.js) and `slimActors` sends every field but `memo`. Only `actorsOf` and the bench's copy leave it behind on the way to the draw.
- **A REAL DIP IS TOO SMALL TO SEE, SO IT WOULD HAVE TO BE EXAGGERATED,** as the lamps and signs are. At an assumed 2 degrees of pitch, a 4.5 m car's ends move about 8 cm. What exaggeration reads on a phone at the driving zoom is not established.
- **IT CUTS AGAINST A STANDING DECISION:** draw.js keeps boxes level and quantized to 32 headings on purpose, "a sprite set has no pitch", so what is on screen stays what sprites could deliver. Box corners can already pitch (for grade), so boxes make it cheap; **sprites would need art for it. Whether the sprite plan still holds decides that cost, and it is the maintainer's.**
- **IT ANSWERS ONE OF THE TWO.** Harsh braking has a body to move. A rolling stop's tell is an absence, a car that never quite comes to rest with its lamp on throughout, and a dip does not obviously show that. **Rolling stops, 24x across the dial, may need another answer. Attached to this item, unproposed.**

**The standing instruction applies: "I want to avoid adding 50 half-cooked features" (10.38). SCHEDULED BY 10.52.**

## 10.52 A PERSON STRUCK, MAIL, SEEING THE CAUSE, AND THE CONTACT DESIGN (the maintainer, relayed by the project lead, and the agent; 5 November; NOTHING BUILT)

### The rulings and direction

1. **A PEDESTRIAN STRIKE IS A CRITICAL ERROR IN ANY CIRCUMSTANCE, WITH A SEVERE PENALTY AND NO FORCED RESPAWN (the maintainer).** The consequence arrives BY MAIL a day or two later: a large hospital bill, the inverse of the not-at-fault insurance payout. **On a road test it ends the test on the spot and 911 is called.** No fault question arises. It stands on verify-peds' fairness: a player who responds in time never strikes anybody.
2. **THE GENERAL MECHANISM: DELAYED CONSEQUENCES DELIVERED BY MAIL (the project lead).** It keeps the moment of impact free of menus, fits the analog setting, and is one channel for anything that should not land instantly. The insurance payout and the hospital bill are the first two instances.
3. **THE ORDER: TERMINAL CONTACT, BODY MOTION, DESTINATIONS WITH PLAYER-TUNED DENSITY, THE PRICE OF SLOWING.** The maintainer: *"I'm most interested in improving the visual acuity of the game... body movement will help, but I have to see it."* The project lead's reasoning: until he can read the model from outside, everything on top is judged against a world he cannot see. **The "roughly half a day" attached to it is in no record and no transcript of this session: the agent did not scope it.** See below.
4. **DIRECTION ON VISUALS (the maintainer):** a lot of what is represented *"needs to be done over-the-top visually to bring the personality of the drivers out into the world"*: hard braking always leaving rubber marks even when physically marginal, a distracted driver blabbing on the phone with a speech bubble, music loud enough that they are deaf to the environment.
5. **THE PRINCIPLE UNDERNEATH: SHOW THE CAUSE, NOT THE STATE (the project lead).** A speech bubble does not say "low observation", it says the driver is on the phone, and the late reaction then explains itself. The world explains its own behavior rather than labeling it. That is also what the examiner needs: evidence to mark from, not being told.
   - **THE LIMIT ON IT (the agent), the rule any tell already lives under: A TELL MUST BE TRUE.** A bubble is drawn while the driver is actually looking away, never from a rating alone; a rubber mark where a car actually braked past a threshold. The threshold can be generous, as he asks, and the event must be real. Otherwise the examiner marks from a decoration, which is authoring the fault.
6. **SKID MARKS PERSIST (the project lead):** a player can arrive after an event and read what happened. A road carrying its own history suits an examiner game. Nothing on the ground persists today, and no skid mark exists.
7. **SOUND IS AN UNUSED DIMENSION (the project lead), NOT SCHEDULED:** engine note, bad exhaust, radio, a horn that reads as annoyed. "Music so loud they're deaf" implies hearing it pass. The agent's note: **no driver hears anything today**, so "deaf" is either decoration or a new behavior.

### The legibility list: which axes have a tell (the agent, read from the code; nothing measured)

The project lead's reading, checked. **Right on steering; nearly right on braking; right about Clean mode on observation and wrong about the model; wrong on knowledge; imposition is not in the served build; and it left out two axes, confidence and compliance.** `AXES` in core/driver.js is six.

| axis | what the sim does with it | what shows today | what is missing |
|---|---|---|---|
| **steering** | weave up to half the spare lane, lane changes up to 1.5x as long | **The car's own position, always, on every road.** The only axis that shows without an occasion | Nothing first. Roll would add to a lane change |
| **braking** | plans on up to twice the comfortable rate, so closes further and brakes harder | **Whether, not how hard:** the lamp is one bit, on past 0.6 m/s^2. It comes on later for a late braker; nothing on the car changes | Body dip, then rubber marks |
| **observation** | notices a green late, reacts late to a lead's brake lamps; glances away and skips checks where those are on | **In Clean mode only the lateness.** Looks are drawn as a wedge, but "Drivers check mirrors" is off by default and Clean does not turn it on. A glance away (also off in Clean) draws nothing | A cause for lateness: the phone. Clean was set to look-away off as the phone's best, so that cost returns |
| **knowledge** | stops up to 3.2 m short of the line; misreads harder signs; sits in the left lane not knowing keep-right; misses turn lanes | **Position, which is more than none:** 3.2 m short is most of a car. But nothing says why, and it reads as an ordinary car | A cause. No candidate yet |
| **confidence** (not in the reading) | gaps taken and refused, tight lane changes, hesitation, how soon they honk, whether they offer a gap | **The best served:** the horn badge with its pointer says who is impatient with whom. A courtesy badge, when the player signals | Timid hesitation has no cause shown |
| **compliance** (not in the reading) | mostly decides who rolls a stop, then the horn, keep-right, courtesy | **A rolling stop has no tell but the car not stopping,** with its lamp on. At 24x across the dial, this is the largest measured difference with the least to see | A cause. Body dip does not obviously show it |
| **imposition** | **Not on main:** `aggression-phase1`, unmerged (10.32) | Nothing, because it does not exist in the build he plays | Build it first, or leave it off this list |

**THREE THINGS THE TABLE DOES NOT SHOW:**

- **THE SIGNAL CARRIES NO DRIVER.** `blinker` follows the manoeuvre (crossing.js), so every driver signals every turn and change correctly. The most readable thing on a car says nothing about who drives it. "Signalling in the driver model" is already on SIMULATOR's parked list; it is model work, not presentation, and it belongs beside this list because it is a tell with nothing behind it.
- **HORN AND COURTESY BADGES ALREADY FOLLOW THE PRINCIPLE:** an event, true, with who and to whom. They are the pattern, and he has not said he cannot read them.
- **HOW OFTEN A TELL IS THERE TO BE SEEN.** Arithmetic only, from 10.50's rates and 2.5 moving cars within 100 m, assuming the player's surroundings are average: at the default a rolling stop about every 3 minutes (0.32 a minute) and a hard brake about every 2 (0.57); at the worst dial setting 0.73 and 1.68; a tight lane change on the city about every 20 minutes. **So a perfect tell is still rare at default, and body motion should be judged at the worst setting against the best. It also says density still matters after this.**

### Body motion: what it takes (the agent)

**A DIP IS SMALL IN CODE AND ITS REAL COST IS JUDGING IT, WHICH ONLY HE CAN DO.** `boxCorners` already pitches a box by a grade and `paintLamps` already takes separate rear and front heights; `a` already reaches the page. A dip is that `a` carried to the draw in `actorsOf` and the bench, turned into a pitch, with buses and trucks included. Roll needs a new term in `boxCorners`, and a sideways rate derived on the page. **Draw only: nothing feeds back, so every world hash stays identical, and that is the check.** The rest is the frame cost through the bench's split, and one exaggeration constant he sets by eye. Half a day of code is plausible; how many rounds with his phone is not known. **His question on sprites stays open (10.51): boxes pitch for free, and a sprite set has no pitch.**

**PREDICTION, TO BE RESTATED WHEN BUILT:** on the city, with the dial at worst and then best, he can say which is which by watching stops. **If he cannot, body motion was not the answer or the rate in view is too low, and that says which of the two to test next.**

### The contact design (the agent; for review, NOT BUILT)

**Scope: the player on `#/map`. `#/exam` keeps ending as it does: a person struck now has his ruling, and a candidate's crash with a car still has none (10.49).** `#/wheel` keeps its stop: stage 0 roads, a bench, its own words say so.

**A. Contact stops being a freeze.** `playerContact` returns what happened: who (car, parked car, person), closing speed, where on each body, and only on FIRST touch of that partner, latched until the two have been apart. That removes 10.49's "fires every tick". The page removes `setStopped` and the banner, and shows a transient line drawn on the canvas, since no DOM changes while the world moves.

**B. Contact has physics, and the least that keeps the world honest.** A car, wreck or parked car is solid: speed into it goes to zero and the player is moved out of overlap, along `s` or the `off` the player already carries, on the page, since `me` is the page's. **THERE IS NO REVERSE, so separation has to leave room to steer away, or a player nose-on to a parked car is stuck for good. That is the one hard part, and the check must drive out of it.** A person is not solid. The other car still crashes and stands 45 s as today. No mass, no spin: the endpoint is a full physics model (STORY), and this is what stands until then.

**C. Who struck whom: one recorded fact, one narrow rule.** Struck from behind with the player in their lane and no lane change in the last 3 s: not at fault. Everything else: at fault. A person: at fault in any circumstance. **Brake-checking has no detector, so a brake-check reads not at fault for now, said out loud.** The crash record gains its striker. It does not reconcile `events.js` with `marking.js` (10.48): not needed for this rule, and it stays open.

**D. What it costs.** Not at fault: no fare penalty, streak kept, its own voice trigger, and a payout by mail. At fault: the fare is void, `collision` as now, a repair bill by mail. A person: fare void, the severe trigger, the hospital bill by mail. `money.js` reads the fault and stops voiding on any touch.

**E. Damage.** One number on the player, rising with closing speed, costing top speed and adding a pull to one side: the ruling's "damaged handling", and the same term for any later wear. A new drive resets it, since there is no body shop yet. **Past a limit the car is inoperable, and what then is unruled.**

**F. Mail.** `sim/mail.js`, pure, through `storage.js` beside the wallet: a posted item with an amount and when it arrives. **THERE IS NO DAY IN THE GAME: `DAY-NIGHT.md` is design, no clock runs, so "a day or two later" has nothing to count.** Until one exists an item arrives after a set number of minutes of driving, which survives across drives. Read in the chrome when not driving; the voice says it has arrived. Amounts are his, flagged as authored.

**G. Traffic.** A player just struck is exempt from honking for the time a wreck stands (`freeStop` would otherwise honk at them).

**CHECKS: `verify-contact`, new, with expectations in the check:** one event per touch; no passing through a car, wreck or parked car at any speed; driving out of every nose-on case with no reverse; rear-struck at a red pays and voids nothing; the same strike after a cut-in does; a person costs every time; a world with no contact is hash-identical; mail survives a reload and arrives once. Each sabotaged. `verify-money`, `verify-worker` (its `stopped` is read by nothing), `verify-voice` and `verify-crashes` section 3 get their verdicts stated before they are changed. A test-map section per case, as every feature has. **PREDICTION:** Clean mode at 180 on the city keeps running through every contact in a soak; today every one ends it. **Merged as one, A to G: a drive that continues with no bill is the half-cooked version of this.**

**DEFAULTS THE DESIGN TAKES, AND WHOSE THEY ARE:**

- The maintainer's: is at-fault contact with a car only a repair bill (ruling 2 covers only not-at-fault); whether being rear-ended is presumed not at fault as above; whether driving away from a person struck matters, since no forced respawn makes it possible, and leaving the scene is an offense; what an inoperable car does; what if a bill exceeds the wallet; every amount.
- The project lead's: minutes of driving standing in for a day until a clock exists.

## 10.53 THE WORLD EXPLAINS ITSELF, AND HOW THE VISUAL STYLE IS CHOSEN (the maintainer and the project lead, 5 November; DIRECTION, NOT SCHEDULED)

**THE MAINTAINER:** *"imagine driving around and encountering a huge accident scene with police and fire and EMS, and the world itself explains what happened just by you coming across it."*

**THE PROPERTY THAT MAKES IT WORK: EMERGENT SCENES COST NOTHING TO AUTHOR (the project lead).** If crashes genuinely occur in the simulation and services respond, every accident scene is unique and situated, because it actually happened there. A scripted game hand-places each one and they repeat. That is the payoff for having built a simulation, available only because the traffic produces real incidents. **Emergency services then have a job that is not decoration: the world reacting to its own events, the same principle as the delayed mail (10.52).**

**DO NOT SCHEDULE IT. DEPENDENCIES, SO NOBODY PICKS IT UP BLIND:**

1. **Contact being non-terminal** (10.49, 10.52, being built).
2. **Crashes persisting as world state rather than being cleared.** A crash is towed at `CRASH_CLEAR`, 45 s (crossing.js), and a scene has to outlast the response.
3. **Scene props, which do not exist.**

**The agent's addition, from the code:** nothing in `src/` is an emergency service: the old engine's emergency vehicle went with it on 14 October. **So the responders are new behavior as well as new props:** dispatch from somewhere, a route through traffic, and traffic yielding to them. And the supply is map-wide and thin: about 0.08 traffic crashes a minute on the city at 180 cars (10.46), so a scene being there to come across depends on how long it stands.

**THE CRITERION FOR THE VISUAL STYLE, PUT TO THE MAINTAINER (the project lead): CHOOSE THE STYLE BY WHAT IT CAN EXPRESS, NOT BY HOW IT LOOKS.** It has to carry:

- a speech bubble above a distracted driver;
- skid marks that persist;
- a car's body dipping under braking;
- a rusted beater reading differently from a tuned import;
- an accident scene with several emergency vehicles, legible at a glance from above.

**The legibility list in 10.52 is an input to the style decision, not the other way round:** the style has to be able to show each tell on it. The sprite question left open in 10.51 is one instance: a sprite set with no pitch fails the third item as it stands.

## 10.54 CONTACT BUILT: AN EVENT AND A RESPONSE (the agent, on the project lead's "carry on", 5 November; on branch `contact`)

**Built to 10.52's design, on its stated defaults, with every amount flagged as the maintainer's to set. `#/exam` and `#/wheel` are unchanged.** `sim/contact.js`, `sim/mail.js`, `verify-contact`; the banner and `setStopped` are gone from `#/map`.

### Where the build departed from the design, and why

1. **(SUPERSEDED BY 10.57: reverse is now an ordinary control.) THE CAR HAS A WAY BACK NOW: WITH SOMETHING IN FRONT OF THEM, THE BRAKE HELD AT REST ROLLS IT BACK, WITH STEERING. THE DESIGN DID NOT HAVE THIS.** The design said separation had to leave room to steer away, and named it the hard part. **It was harder than that, and the prediction that it was the weak spot held:** moved out of overlap and steering forward alone took 94 s at 70 degrees. A first fix turned the nose along what it pressed against: 8.8 s at 45 degrees, but cars still wedged into the gap between two parked cars, or pressed on the row across the street, for good. **A real driver reverses, so this reverses.** `backOff` in player.js moves the car and leaves `v` at 0, so nobody reading the player has to know about going backwards; 1.5 m/s, 8 m from the last push; a player braking at a red never rolls, which is checked. The screen says "Hold the brake to back off it" after 1.5 s pressed. **A new control, a stopgap until the full physics model, and the maintainer has not seen it.** The turned-nose fix was removed: one mechanism.
2. **AN INOPERABLE CAR IS NOT MOVED.** The default given in 10.52's report was a tow and a respawn nearby. Built: it stands 45 s, as a wreck does, and goes again where it stood at half damage, with a tow bill. Simpler and forces nobody anywhere. **Still his question.**
3. **THE PULL WAS 3x TOO STRONG AS FIRST WRITTEN:** 0.25 of the wheel at full damage took a half-damaged car 173 m off line in 30 s, hands still. 0.08, by judgment. **Measured there at half damage: 101 m in 30 s at 30 km/h with no hands and no assist, which is still a great deal, on purpose until he has driven it.**

### Measured

`verify-contact`, about a minute; each below is a stated expectation, and the check was sabotaged 18 distinct ways, all caught, after one gap found that way was fixed (two more attempts, on the prune and on the time test in `seen`, changed nothing, as noted below):

| prediction, stated before running | result |
|---|---|
| one event per touch | 1 event over 136 ticks in contact; a second only after being apart |
| nothing driven through at 30, 60, 100 km/h | centre stops 4.5 m short of the wreck's at all three |
| nobody trapped, inside the 45 s a wreck stands | 0 of 24 nose-on cases; worst 6.9 s at 20 degrees, 13.9 at 45, 12.8 at 70, **42.4 at 90: A NEAR-MISS ON THE PREDICTION, NOT A PASS (the project lead). It is at the limit, on a scripted driver, over 6 cases at that angle, and a slightly different script could cross it** |
| the drive goes on | 9,600 ticks, a driver hunting things at full throttle on the city at 180: 13 contacts (11 cars, 2 parked), no stop; longest stand 61.3 s, a tow plus traffic |
| rear-ended as they brake is not their fault | 24 of 90 struck, 0 called their fault, by the poor observers as in 10.46 |

**THREE CORRECTIONS (the project lead, 5 November):**

- **A COUNT THAT DISAGREES WITH ITSELF:** commit `7d51c34` says "sabotaged 19 ways". **The right number is 18 distinct sabotages, all caught.** The commit is pushed and is left as it is; this line and `21152be` are the correction.
- **THE SAME COMMIT SAYS `verify-money` AND `verify-worker` WERE RESTATED "WITH THEIR VERDICTS IN THE COMMIT'S RECORD". THEY WERE NOT:** the reasons were in code comments only. They are here now.
  - **`verify-money`. VERDICT: THE CHECK WAS RIGHT AND THE RULE CHANGED.** Two loops held that every trigger but a collision is a fault costing its own severity. Two new triggers are not that, by ruling: being struck costs nothing, and a person voids the fare. Both are now skipped there, and **their expectations are stated in `verify-contact` section 3 rather than dropped.** "Contact pays nothing" still holds for a collision that was the player's.
  - **`verify-worker`. VERDICT: ITS PARITY WAS RIGHT AND ITS PICTURE OF THE SCREEN WAS FALSE, SINCE BEFORE THIS.** On a hit it set `stopped: true` and went on stepping the world, which no screen ever did, on a field nothing in src reads (10.49). Now both sides answer a contact as the screen does, through `afterContact`, so it holds the worker's account of a contact against the page's response as well as the world. **One thing it does that the screen does not need: it writes the page's player back into the worker's copy before comparing,** because the next step would overwrite it there anyway.

**WHAT A SABOTAGE FOUND:** the mail check passed with letters repeating, since a repeat shows only when a later letter arrives. Fixed. Separately, `REARM` is stated twice in `playerContact`, once in `seen` and once in the prune, so removing either changes nothing: it is held only as the constant.

**WHAT IT DOES NOT LOOK AT:** how any of it feels or reads. No check touches the screen beyond mounting it: the Mail panel, the hint, the flash and the damaged handling need his eye. **The worker's path runs only through `verify-worker`'s comparison of page and worker; the in-thread and worker branches of MapRoad are two call sites of `contactTick`.**

### Known, and said out loud

- **A brake-check reads as not at fault,** nothing detecting one. **The other wrong case, a car running a red into the player's side, is fixed in 10.55.**
- **A traffic car touched by the player stops dead for 45 s** at any speed, as it always did, but the player now sees it. A scrape at 5 km/h makes a wreck.
- **A hit is one contact per partner, so scraping along a parked row is one per car,** each halving speed and adding damage. Plausibly right and unseen.
- **Mail counts seconds in the drive, moving or not.**
- **Reloading mid-drive loses the current damage and any fare**, as a restart always has; the mailbox survives.

### The unanswered, built on defaults (10.52)

At-fault with a car is a repair bill and no more. Rear-ended is presumed not at fault. **Driving away from a person struck is allowed and nothing further happens; the bill comes either way.** A bill past the wallet takes the balance negative, and nothing reads a negative balance. Every amount. Minutes of driving standing in for a day.

## 10.55 WHO OWED WHOM IN AN INTERSECTION (the project lead's order, 5 November; the agent)

**The project lead: a car running a red into the player's side counted as the player's fault, the exact thing the not-at-fault ruling (10.50) says must not happen; fix it before body motion, and measure how often it occurs.**

### How often: not once, and the sample is small

`tools/measure/side-impact.mjs`: a scripted player who obeys their own light and sign and stops for the car ahead in their lane; each car's light read as it crossed its line. 180 cars, test map 1 and the city, 3 seeds, 8 minutes each, look-away off and on: **96 driven minutes, 140 intersections (8, 62, 9, 61), 59 km. Commit `50ccf7a` says "about 150": the right number is 140.**

- **NO RED-RUNNER STRUCK THE PLAYER, IN 96 MINUTES.** Rule of three: fewer than about one in 30 minutes on a driver doing this, no tighter. **The exposure is thin, and the first run's 0 contacts on test map 1 was 8 intersections in 24 minutes, which is why it was not believed.** The player spent most of it on long stretches and being put back at the start.
- **TRAFFIC DOES ENTER ON RED, AND MOSTLY LEGALLY:** of 3,145 entries on test map 1, 179 on red. 158 are rights after stopping. 19 never stopped, 8 of them going straight. They are late ambers crossing just after the change, the amber rule committing a driver who could not stop. City: 84 of 15,640. **So a true red-runner hardly exists in this sim; what exists is a car a moment late.**

### What was predicted, and what failed

**PREDICTION 1, HELD:** true red-running is rare. **PREDICTION 2, FAILED, AND ITS PREMISE WAS WRONG:** the agent reported that every side-impact seen was another car failing to yield, called the player's fault, and predicted all four would flip. **That report was an inference from the other car's control alone. Printing both cars' entries shows NONE of the four was a failure to yield:** all four were the scripted player taking a right at speed, 10-14 m/s through a corner. Two ran into the back of a slower car on the exit stretch, which the script does not look for; one swung into the next lane having entered second; one was settled by the right-hand rule. Three remain the player's, correctly; one reads as not theirs. **The script's cornering caused those contacts, and they say nothing about traffic.**

### The rule

**Not a rule about red alone. Every kind of failing to yield had the same wrong answer, whether or not this sample met one, and fault is the premise of the design (the project lead).** `owedBy` in contact.js, from what each car ENTERED UNDER, written once as it crosses its line (`entryOf`: the light, or the sign as POSTED, and whether they stopped). In order:

1. a red, or a stop not made, against somebody who did neither;
2. a sign against a road with none;
3. left yields to oncoming (`leftYields`, the sim's own);
4. with no control at all, the car on the right has the road (`onRightOf`, the sim's own);
5. otherwise whoever entered second had somebody already in there.

Outside the box, the old rule: struck from behind in lane. **Added: a car changing lane into a player holding theirs is not the player's.**

**WHY NOT `blockedBy`, THE SIM'S OWN RIGHT-OF-WAY FUNCTION:** a second statement of right of way is the recurring bug, so this was the first thing tried. It answers a different question. `blockedBy` is a DECISION: it reads the driver's own knowledge of the sign, uses their judgment of a gap, and says a car in the box finishes, so at the moment of contact it always says the other car may proceed. **Fault is a DUTY, as posted: a driver who misread the sign or misjudged a gap still owed it.** The primitives are shared; the order is written once, here.

### These are traffic-law assumptions, for the maintainer

Each is from the rules already established (Domain authority), and each is his to correct:

- **A car clearing on amber has the road over a player entering on a fresh green.** The player's fault.
- **A car entering late on amber, into a player already in on green,** is not the player's. Entered second.
- **Both on red: whoever entered second.**
- **Both from stop signs: whoever entered second,** not whoever stopped first.
- **A rolling stop by traffic is often invisible to this rule:** a driver rolling a sign they do not read is recorded by the sim as having stopped, below its crawl speed (`rollsHere`). So a rolled stop against a stopped player can fall to "entered second". Against a road with no sign the sign rule still catches it.

### Checked

`verify-contact` section 3b: 18 cases written out, the right-hand rule's direction stated from where the two cars are in the world, a red-runner through the whole contact to the record of who struck whom, the same contact with the roles swapped, and what a car entered under against what the light said at its line on real traffic: 107 of 107, 15 on red.

**SABOTAGED 15 WAYS, ALL CAUGHT, AFTER THREE GAPS IT FOUND WERE FIXED:** a yield sign survived, because at equal times "entered second" gave the same answer; the right-hand rule had no test at all; and "one of the two owes" passed with the rule backwards, saying nothing about which. **The cases now enter first and still owe, and the direction is stated from the geometry.**

**NOT VERIFIED AGAINST THE THING IT WAS BUILT FOR (the project lead, 6 November): live, and it has never met a real red-runner, none in 96 driven minutes. Nothing to do about it now, and it is not to be recorded as verified.** **WHAT IT DOES NOT SHOW: A REAL RED-RUNNER STRIKING A PLAYER, END TO END.** None occurred, so the two halves are held separately: the record on real traffic, and the rule on a stated record. The first time the maintainer meets one is the first real test.

### Still on the list, and being told to him (the project lead)

A brake-check reads as not at fault. **A 5 km/h scrape stops a traffic car dead for 45 s.** Scraping along a parked row is one contact per car, each halving speed and adding damage. **The holding-the-brake rollback is a control he has not seen.** The damage pull is left for him to judge: 101 m in 30 s at 30 km/h, hands off. Added here: **traffic's contact with the player does not yet read any of this: it stops dead whoever was at fault.**

## 10.56 THE SMALL-ITEMS BUNDLE, AHEAD OF BODY MOTION (the maintainer approved, relayed by the project lead, 5 November)

**The order: the bundle, then body motion, which he expects to consume the usage cap.** Of its four items, the red-runner fault (10.55) and the two record tidies (10.54) were already done and live when the order arrived: the message and the report crossed.

### 1. What Clean mode offers, and how many cars

**He was picking between eight options, two alike and one valid: "trial city" or "stand-in city".** `#/tests` now offers **Stand-in city and Endless highway** (`clean` on a `TEST_MAPS` entry), with the other six behind one button. **CORRECTED BY 10.58: as first shipped this followed the Clean mode setting, and looking at the served page showed eight options with it off.**

**The count:** 180 on everything was 4.5 times what a 40-car fixture is built for and 9 times a 20-car one. `cleanCarsFor` in map/cars.js: a map whose own count is under `SMALL_BELOW` (100) keeps it, and the rest get the 180 measured best on the phone. 100 is flagged, and sits in the gap between what the maps are built for, 20-40 and 120 upward. Peds 40, signs 40, buses 20; the city, the loop, the highway and test map 1 stay at 180, so nothing he drives on the two offered maps moves.

**What this does not do: tune density for how it feels (ruling 1).** It stops the fixtures being overfilled. The city at 180 is still 2.5 moving cars within 100 m (10.42). That is the destinations-and-density work (10.51).

### 3. `verify-lanecost`

**The prediction failed, and that changes what can be claimed.** History: 5 failures in 51 recorded runs, the last on 28 October, 8 clean since. **The logs that would say which assertion failed are gone;** the timing assertion is the suspect, not the proven cause. Predicted: under one heavy load, side by side, the old form fails more and the new none. **12 copies of each with 4 spinners on 16 threads: OLD 12 OF 12 PASSED, NEW 12 OF 12 PASSED. THE FLAKE WAS NOT REPRODUCED AND NOT SHOWN FIXED.** (A first control with 16 spinners read 12 of 12 failed: all were the script's own timeout killing runs that had not finished, and it was thrown away.)

**The form was changed anyway, on what the same run did show.** The old form was a difference of differences of wall-clock medians, and it ranged 2.2x across identical runs (3.78 to 8.25 ms); the new one, the CPU spent inside lanechange.js per tick, ranged 1.2x (0.54 to 0.64). It also measures the code itself: the old one switched lane changing off, changing the traffic, the instrument this file already refused. **The bound stays 15%. The margin is narrower than it looks: the worst run was 0.64 against 0.66.** Sabotaged at +0.3 ms and +1.2 ms a tick with the index on: both fail, and neither is near the line. **Not marked run-alone. If it fails again, read its log before anything else: that is the evidence that has been missing.**

### 4. The record tidies

In 10.54, with the 19-against-18 count and the `verify-money` and `verify-worker` verdicts. **Pushed commit messages are left as they are;** each correction names the commit it corrects. 10.55 also corrects `50ccf7a`'s "about 150" intersections to 140.

### Pending with the maintainer (the project lead has asked; not pre-empted)

Whether a 5 km/h scrape should stop a traffic car dead for 45 s, and whether scraping a parked row should count as a separate collision per car.

## 10.57 REVERSE IS AN ORDINARY CONTROL; WHO HAS THE WHEEL (the maintainer and the project lead, 6 November)

**Jay's list (relayed):** menu and density, the red-runner fault and the record tidies were already live (10.55, 10.56). **His new ruling: "stopping dead after a collision is unrealistic, we need the vehicles to come to a believable stop."** It supersedes the 5 km/h scrape question and is the first piece of "the weight of the impact be represented". **"Get the checks under control":** a plan first, for the project lead to see. **Order: reverse, the checks plan, the hard braking, the believable stop; body motion after that unless he moves it. Do not fix the hard braking and the believable stop in one change.**

**HE DROVE THE CONTACT BUILD:** "runs great / could not go forward after reversing from a crash / if you signal a turn, and take manual control midway you lose control of the car. it kind of staggers and turns on its own, hard to describe fully I'll test more". Then: **"actually, reversing should be something the player can always do, no?"** The project lead's reasons: it removes the cause, since a special state with an entry and exit condition is what can strand you; reverse parking and three-point turns are marked on the real sheet, so the exam needs it anyway; and it is simpler.

### Could not go forward: reproduced first, and it was not the rollback

**Predicted before running: the car past the damage limit, where the rollback still worked and forward was dead until the tow, with nothing on screen.** Each impact speed, back off, then throttle: 10 to 60 km/h all drove away (damage up to 0.99). **70 km/h, damage 1.00: reversed 4.5 m, then 4 s of throttle moved it 0.0 m.** Hits add up, so lesser ones get there too. **It would have survived making reverse ordinary, which is why it was reproduced before the fix.** Now a car that will not go goes neither way and says so: "It will not go. A tow is on its way." **WHETHER THIS IS WHAT HE HIT IS NOT ESTABLISHED: he did not say how hard, and the agent cannot see his run. If it recurs with a car that says nothing, this was not it.**

### The build

Reverse is available from any standstill, with nothing hit and no limit but how long it is held. No precondition, no hint, no mode, across seams, reversing lamps drawn in white. `v` stays 0 and the car moves by its position, so nobody reading the player has to know about going backwards: a stopgap of the MODEL, not the control, until the full physics model. A car reversing into somebody is at fault.

**THE GESTURE IS HIS TO JUDGE BY DRIVING: from a standstill, a FRESH pull of the slider to the bottom, held 0.4 s. Lift and it stops.** The stopgap's "hold the brake at a standstill" could not become general: his slider stays where it is left, so a car braked to a stop at a red with the slider at the bottom would roll back into whoever is behind it. **Measured with the freshness removed: 29 m back in 20 s at a stop. So a stop stays a stop; lift and pull again to reverse.** BACK_V 1.5 m/s, REV_DWELL 0.4 s, REV_FROM_V 0.5 m/s, BACK_AT -0.9 are flagged and his. **The alternatives if this reads badly: a reverse button, or a dwell at the bottom.**

**Checked:** `verify-contact` 9b, sabotaged 12 ways, all caught. **ONE SABOTAGE WAS CAUGHT FOR THE WRONG REASON AND SHOWED A VACUOUS TEST:** a wall at the seam failed a different section while the seam test passed, because it had picked a path at the map's edge. It now takes a road with a road behind it and holds the step under 0.5 m. **The nose-on case at 90 degrees is 43.7 s against the 45 s bar: still a near-miss, on one script.**

### Can two things hold the wheel at once? Yes, read from the code, and nobody decided all of it

**Not a hunt for his report, as instructed, and nothing was added to trace it. Read, not run.**

| where | who steers | status |
|---|---|---|
| on the road, hands on | the player, plus damage's pull | **The player wins.** The assist is off above a 0.05 dead band, and while the wheel moves |
| on the road, hands off | the assist, after 0.6 s, fading in over 0.5 s, at most 0.35 of the wheel | decided (`assistSteer`) |
| in the box | **the committed arc AND the player's wheel, SUMMED, capped by grip** | **Blended. "The player's wheel adds to that" is written; what happens when they oppose is not.** The arc's turning is always in, so the player cannot cancel a turn, only add to it |
| leaving the box off line | hands off for 0.6 s, the assist brings the car back | **Nobody decided this case: it can read as the car turning on its own after a player steered through a turn** |

**AND ONE THAT IS NOT TWO CONTROLLERS, BUT COULD READ AS A STAGGER:** `s` advances by v cos(psi) whatever `off` is, and the pose is the path's offset by `off`. On a straight road that is exact. **On an arc it omits the 1 - kappa*off of true path-relative motion, so the car's real speed changes with how far it is off the arc; and at an offset approaching the arc's radius on the inside, the point folds through the center.** Arcs here run about 4 to 10 m, and the player's wheel can reach that. Not measured. **So the answer to "the player always wins" is no: in the box they share the wheel by design and past certain offsets the geometry itself misbehaves. WHETHER EITHER IS WHAT HE SAW IS NOT KNOWN AND IS NOT CLAIMED.** The fix if it comes to that is a decision, who has authority in a committed turn, then a patch.

**For the believable stop (the project lead):** one entanglement fewer, since reverse is no longer tied to collisions. Reading it for the scope: a crash sets `v: 0` in `crashWith` and in `step`, and a car here runs on its path, so two cars carrying momentum through a side impact would pass through each other unless a crashed car leaves its path. **That is the hard part of it, to scope when its turn comes.**

## 10.58 THE MENU, LOOKED AT (the project lead asked that it be confirmed, 6 November)

**Looked at on the served page, in a browser, because a headless render cannot answer it: with Clean mode off, the default, changed only from inside a map, `#/tests` still showed all eight and the map maker. The fix of 10.56 had read correct in its check and was a half-fix on any phone with the setting off.** Which way his is set is not known. So the screen now opens to the two maps whatever the setting, and the other six and the map maker are one tap behind "All test maps (8)". **THE AGENT'S CALL, on the ruling that `#/tests` stays: it stays, one tap further in.** A feature report pointing at a fixture must now say to tap that button.

**The car count still follows the setting:** with Clean mode off a map runs its own count or his saved one, which on the city is 300, not 180. Not changed.

## 10.59 THE MENU'S LESSON, THE PLAN RULED, AND STEERING AUTHORITY GOES TO THE MAINTAINER (the project lead, 6 November)

1. **THE RULE: A UI CHANGE IS NOT VERIFIED UNTIL IT HAS BEEN SEEN ON THE PAGE A USER LOADS, IN THE DEFAULT SETTING.** Local, and in the setting you happen to have, is not verification. **The project lead records as theirs that they told him the menu was fixed when it was not.** Checking the served page is what caught it (10.58). In CLAUDE.md, Conventions.
2. **THE CHECKS PLAN IS APPROVED, TO STOP AFTER B** (TESTING.md). A, then B, then report the count. Nothing beyond B without a further ruling.
3. **ITEM E RULED: NO WORK.** The project lead's correction of their own brief: a check deliberately broken that caught it is working, and never having caught a real regression is what a guard on stable code looks like, not evidence of uselessness. "A check that has never failed is either guarding something stable or guarding nothing" is answered by item D, the checks never sabotaged, and not by hunting the ones that have never fired.
4. **`#/tests` one tap further in: approved.**
5. **STEERING AUTHORITY IS A DESIGN GAP, NOT A BUG, AND IT IS THE MAINTAINER'S (10.57).** A player can add to a committed turn and never cancel one, and nobody decided what happens when they oppose. The project lead is putting it to him. **No answer is to be picked.** The material is the four behaviors in 10.57's table and the arc geometry. **A strong candidate for his stagger and still a candidate: not confirmed as what he saw.**
6. **The red-runner fix is live and not verified against a real red-runner** (10.55).

**Nothing further this session unless he asks.**

## 10.60 THE FIRST GAME IS THE ENDLESS HIGHWAY: THE CUT IS THE WORLD, NOT THE FEATURES (the maintainer, relayed by the project lead, 10 November; A SCOPE DECISION, NOTHING BUILT)

**Supersedes nothing in the systems. It changes what gets built and when.**

**THE DECISION:** a smaller game ships first, built on the endless highway, before the expansive version. His reasons: it is the most interesting part to him, everything else attaches to it, and it is the stronger product until the game is proven in general.

**THE CUT IS THE WORLD, NOT THE FEATURES.** His correction to the project lead's proposal, and the sharper cut: the expense was the 8 km² city, its zones, buildings and trip generation, all authored content. **The systems survive because they hang off a spine rather than needing a metropolis.**

| in scope | out of scope, DEFERRED NOT DELETED |
|---|---|
| the highway as the spine; pull-off points carrying jobs; several player vehicles, each with its own upgrade tree; damage and repair; weather with a forecast at the stop that the player prepares for; day and night; the five characters; examiner mode; the marking sheet; the county's story revealed in pieces over time | **the expansive city, and only that** |

**THE SESSION SHAPE:** about thirty minutes. Leave a stop, go as deep as you can, return before the car gives out. Difficulty rises with distance. **Money and upgrades persist; the run does not.**

- **Endlessness becomes the scoring axis rather than a content problem.**
- **Accumulated damage is a run-ender that is not death**, which uses the contact work already built (10.54).

**TWO DESIGN NOTES (the project lead):**

- **WEATHER AS PREPARATION, NOT EFFECT.** A forecast read at the stop, tyres chosen before leaving, consequences lived with. Preparation is a kind of gameplay almost nothing in this genre has, and it suits the analog setting: a board chalked up at a truck stop, no app.
- **SEPARATE UPGRADE TREES PER VEHICLE** mean money is always a choice and vehicle class is meaningful rather than cosmetic.

**~~UNDECIDED: WHAT PULLS THE PLAYER BACK TO A STOP.~~ RESOLVED BY 10.62: CONTENT, NOT RESOURCE PRESSURE** -- the next mission, the storyline, places to discover off the highway, with fuel a contextual pressure on a long haul rather than a constant one. The framing here, that damage, fuel or cargo deadlines would set the rhythm, is superseded (the project lead).

### What the record already says that bears on it (the agent, read, not measured; nothing changed)

- **The loop as it stands** (`test-loop`): one-way, three lanes, about 10.4 km round, four interchanges keeping the traffic fresh, the player joining from a slip road, density shaped around the player (10.17). **Its interchanges are not pull-off points:** there is nowhere to stop, nothing to stop at, and no exit that leads anywhere but back on. **Pull-offs are new content, and the one piece of world this cut keeps building.**
- **"Difficulty rises with distance" has two instruments already:** the skill dial (`world.skill`) and the car count. Neither has ever been driven by distance.
- **Weather, day and night, the upgrade trees and repair are design, not code:** DAY-NIGHT.md and VEHICLES-GARAGE.md. Mail and the wallet exist (10.54), and with no day in the game a "day" is minutes of driving.
- **Open on the loop and unexplained, and now on the product's road:** IN FLIGHT 36, hard braking in free-flowing traffic, measured first on the endless highway (one window in 18); and the speed spread falling with the brake reaction on (10.46), not established.

### Lanes, now that three agents work here (the project lead)

**Codex works in `tools/` and never `src/`; this session owns `src/`. Gemini is parked.** Codex has the checks plan's item A: the runner's timeout flaw, its misreported limit, and keeping failure logs. **So this session does not start item A, and `tools/check.mjs` may change under it.** Item B, the seed sweep, is `tools/`-side too. **ASSIGNED TO CODEX (10.61), gated behind item A being verified and merged.**

## 10.61 WHAT THE SCOPE DECISION DOES TO PRIORITIES (the project lead, 10 November; A RECORD, NOTHING BUILT)

1. **[SUPERSEDED 11 NOVEMBER, 10.70: other agents are shelved; one agent owns the whole repo, `tools/` included.] CHECKS ITEM B IS CODEX'S, GATED BEHIND ITEM A BEING VERIFIED AND MERGED.** Both are `tools/`-side. This session starts neither.

2. **TWO UNEXPLAINED RESULTS ARE NOW DEFECTS IN THE THING BEING SHIPPED, NOT CURIOSITIES IN A TEST VENUE.** Both were measured on the endless highway, and the endless highway is now the product (10.60):
   - **IN FLIGHT 36, hard braking in free-flowing traffic:** one 4 s window in eighteen brakes past 3 m/s^2 with no lane change involved, untraced since 28 October.
   - **IN FLIGHT 42, the speed spread falling with the brake reaction on:** median sd 12.3 to 10.0 km/h over five seeds, cause not established (10.46).

   **They go to the TOP of the work order when there is room, ahead of the believable stop and ahead of body motion. NOT STARTED NOW:** usage is low and both are open-ended. Not in one change with each other unless a trace shows one cause.

3. **PULL-OFF POINTS ARE THE ONE PIECE OF WORLD THIS CUT STILL HAS TO BUILD.** The scope decision cut the city because its expense was authored content. The loop's interchanges are not stopping places and there is nothing to stop at, so the stops the session shape starts and ends at are authored content that survives the cut. **To be visible as such, not assumed.** What a stop holds waits on what pulls the player back to one (10.60, undecided).

4. **"DIFFICULTY RISES WITH DISTANCE" IS A GAP: TWO LEVERS EXIST AND NEITHER IS CONNECTED TO ANYTHING.** The skill dial (`world.skill`, sim/skill.js, which redraws everybody live) and the car count both exist. Neither has ever been driven by distance. **Probably the cheapest route to the session shape the maintainer described: the project lead's note, not measured.** Unmeasured too: whether a redraw mid-run reads as the road getting harder or as everybody changing at once.

**Nothing built. The light session stands.**

## 10.62 WHAT PULLS THE PLAYER BACK IS CONTENT, AND MISSIONS LEAVE THE HIGHWAY (the maintainer, relayed by the project lead, 10 November; A DESIGN DECISION, NOTHING BUILT)

**RESOLVES 10.60's open question, and supersedes the project lead's framing there that damage, fuel or cargo deadlines would set the session rhythm.**

**HIS ANSWER: CONTENT, NOT RESOURCE PRESSURE.** The next mission, advancing a storyline, and the chance to discover new places off the highway.

**THE STRUCTURE:**
- **A mission giver at a stop gives a task.** Some missions have an **off-highway portion**: drive the highway, take an exit, do the job in a generated area, return to the highway.
- **The off-ramp can be anywhere and lead to any kind of area we author**, because we are not bound to a static map.
- **Not every mission has one.** Racing and highway weaving do not. Hauling a trailer might go to an area built for parking it.
- **STOPS ARE HOME BASE, AND DIFFERENT STOPS HAVE DIFFERENT FEATURES**, explicitly to keep menus simple. His reference is an Ontario OnRoute: some have a body shop, some a truck stop with freight work, not all have everything.
- **FUEL IS CONTEXTUAL.** A long haul forces you to manage it; on a short job you only want gas or minor repairs.

### Consequences (the project lead, put to the maintainer; recorded as theirs, not ruled)

1. **THE EXIT BECOMES GAMEPLAY.** Watching for your turn-off, reading signs, choosing a lane, and a real cost for missing it. That is the analog wayfinding already on record, and it gives lane choice and destination work a reason to exist for the PLAYER rather than only for the traffic.
2. **DIFFERENT FEATURES AT DIFFERENT STOPS BUILD A MENTAL MAP WITHOUT AUTHORING A CITY.** The player's familiarity does the work geography usually does.
3. **THE CAUTION: GENERATED AREAS DIE OF SAMENESS.** Hand-author each KIND of place (yard, quarry, depot, residential street) and generate the layout within it. Ten kinds reads as variety; one generator reads as wallpaper.
4. **THE EXAMINER GAME'S EVENTUAL HOME IS A MISSION AREA.** Brenda needs residential streets, intersections and stop signs: a mission area with a particular character, reached by an exit. It fits without the city coming back.

### The engineering question first: is an off-highway area SEPARATE AND LOADED, or CONTINUOUS? (the agent, read, and one desk timing; NOTHING BUILT)

The project lead's instinct is separate: the exit ramp is a natural seam, each area only as big as the job, fifty of them free when you are not in one. Continuous is the streaming work costed at four to six days and parked. **What the engine does today, so the choice is made on it:**

1. **A NEW WORLD MID-SESSION: THE MECHANISM EXISTS, THE PATH DOES NOT.** `MapRoad.jsx` `restart` already throws the whole world away and builds another (`sceneFor` -> `sim/scene.js` `worldFor`) while the screen runs, at every change of car count, mode or seed. The worker takes a second `init` on the same thread (`remote.js` `handle` ignores the state it had). **What does not exist:** the map is a prop fixed at mount (`mapData`, `startAt`), so there is no "load this other map now"; that is a small change in the screen.
2. **WHAT SURVIVES A REBUILD TODAY: THE WALLET AND THE MAIL, NOTHING ON THE CAR.** They live on refs outside the world (`walletRef`, `mailRef`). The player is rebuilt from scratch (`playerOn` + `placePlayer`), so **damage, and anything else on `me`, is lost.** Carrying the player's own state across a seam is new, and small.
3. **THE HIGHWAY'S TRAFFIC WHILE THE PLAYER IS ELSEWHERE: TODAY IT IS DISCARDED.** **But a world is a value** -- every step returns a new object -- and the worker already holds the world as built and returns to it (`rewind`, the bench's). **So the highway can be held and resumed exactly where it was, frozen, for the cost of keeping it in memory.** Not verified: whether any cache inside a world is mutated in place (`parking.js` notes its poses are shared); a resume check would have to show a held world steps identically to one never set down. **The choice is design, and nobody has made it:** frozen and resumed (the traffic you left), or rebuilt fresh on return (the loop is built to refresh its drivers anyway: most are new by minute 15).
4. **THE SEAM IS ALREADY DETECTED.** The loop's off-ramps run to the map's edge, and driving off the end of a road sets `atEdge` (`drive.js`), which today prints "THE EDGE OF THE MAP -- restart". That is exactly the trigger an exit needs. Coming back, every on-ramp is already a place the player can be started clear (the loop's sections start on slip roads).
5. **THE COST OF THE SEAM IS A LOAD, AND IT SCALES WITH THE CARS.** Desk, load and world with the player placed, one run each: Signs (7 roads, 41 cars) 0.4 s; the loop (133 cars) 1.7 s; test map 1 (121 cars) 1.7 s; the stand-in city (143 roads, 286 cars) 3.2 s. **The phone is slower by a factor not measured here** (a bench world, built heavier, takes 6-21 s on it: SIMULATOR.md, the bench's build-s). A job-sized area is near the Signs end; a held highway costs nothing to return to.
6. **GENERATING AN AREA OF A KIND EXISTS IN PIECES:** `map/brief.js` makes a map from a brief and a seed, `map/generate.js` fills a district with streets and lots. Both are deterministic in the seed, so an exit can name its area by kind and seed. Neither knows any "kind" beyond what a brief asks for; the hand-authored kinds of consequence 3 are new content.

**THE AGENT'S READ: SEPARATE-AND-LOADED IS CHEAP HERE, AND ITS PIECES EXIST** -- the rebuild, the second init, the edge trigger, the clear start, deterministic generation. New: a screen path to load another map, carrying the player's own state, holding (or rebuilding) the highway, and a load that does not read as a freeze on the phone. **Continuous is unchanged at four to six days. Not estimated in days, not decided: the project lead's call.**

**Nothing built.**

## 10.63 MISSION AREAS ARE AUTHORED, THE RAMP IS THE LOADING SCREEN, AND NOTHING VERIFIES THE RUNNER (the maintainer and the project lead, 10 November; A RECORD, NOTHING BUILT)

### 1. The maintainer's rulings on the mission-area structure (answering 10.62)

- **EACH MISSION AREA IS AUTHORED SPECIFICALLY, NOT RANDOMLY GENERATED.** His reason, verbatim: *"a random generated world won't necessarily force the player to play the way we want them to."* **Mission design needs intent, and a generator cannot supply it.** This goes past 10.62's consequence 3 (author each kind, generate the layout within it): the layout is authored too. The generators (`map/brief.js`, `map/generate.js`) remain tools an author may start from; they are not where a mission area comes from.
- **A CONTINUOUS ROAD, MINIMISING ANY BREAK IN DRIVING, "maybe a hidden loading screen."**

**THE ENGINEERING CONSEQUENCE (the project lead, put to him; not ruled):** he is asking for no VISIBLE break, not for true streaming, and that is a much smaller problem. **THE RAMP IS THE LOADING SCREEN:** begin loading the area when the player commits to the exit, and it is ready before they reach the end of the slip road. Hours rather than the four to six days of real streaming; the seam is diegetic; **the only constraint is ramp length, which we author.**

What the record already holds that bears on it (10.62, read, desk): the world build is 0.4 s for a small map and 1.7 s for the loop on the desk, the phone slower by a factor not measured; the end of an off-ramp is already detected (`atEdge`); a world is a value, so the highway can be held. **WHAT THE RAMP IDEA WAITS ON (the project lead, 10 November; both before any of it is built):**

1. **THE GATING MEASUREMENT: how long an authored area takes to build ON THE MAINTAINER'S PHONE, against how long its slip road takes to drive at the ramp's speed.** That number decides the design. **If the build is slower than the ramp, the hidden load fails**, and the choice is back to a visible transition or real streaming (four to six days, parked). The desk figures (0.4 s for a small map, 1.7 s for the loop, 10.62) are not this number: the phone's factor is unmeasured.
2. **WHERE THE BUILD RUNS.** On the page's own thread a build stalls frames while it runs: a visible hitch, not a hidden load. On a Web Worker it does not. **THE WORKER MAY COME BACK FOR THIS, IN A ROLE IT SUITS, AND ITS BEING OFF FOR THE SIMULATION STEP DOES NOT ARGUE AGAINST IT HERE.** It has been off by default since 15 October (`src/settings.js` `simWorker`; SIMULATOR.md) because on the phone returning the WORLD STATE EVERY TICK cost six to nine times the step it carried -- transfer volume, not compute. **Loading a map asynchronously needs no per-tick return at all:** one build, one hand-over. Stated explicitly because "we turned the worker off" is the summary that gets applied where it does not belong six weeks later. Unmeasured too: what the one hand-over of a built area costs, and whether it can be built where it will be stepped.

**ITEM 1 MEASURED, ROUGHLY (the maintainer, 10 November, relayed by the project lead): THE STAND-IN CITY LOADS IN 6 TO 8 SECONDS ON HIS PHONE.** Against a slip road at 100 km/h: 300 m is about 11 s, 400 m about 14 s. **So the hidden load is feasible but tight, on two conditions:** (a) **THE RAMP MUST BE LONG, 400 m OR MORE**, not a realistic short slip road; (b) **THE LOAD MUST BE OFF THE MAIN THREAD**, or those 6-8 s are a freeze, not a background load -- which makes item 2 a requirement, not an option. An authored mission area may well be smaller than the stand-in city (143 roads, 286 cars), so the real figure is probably better; **6-8 s is the number to design against until something smaller is measured on the phone.**

**THE CONTENT-COST CONSEQUENCE (the project lead):** authored areas bound the mission count by authoring effort. **Missions with no off-highway portion -- racing, highway weaving, hauling along the road itself -- are nearly free, so they should be most of a first release, with authored areas as SET PIECES rather than the default.**

### 2. Nothing verifies the runner (found by Codex; the hole is ours)

**Codex stopped at the verification gate rather than merging checks item A, and reported why: a change to `tools/check.mjs` selects zero derived checks, because nothing imports the runner.** The project lead has directed Codex to run the full suite under both runners and compare, and to **register its runner test harness as a check**, so a future runner change triggers it. Codex's lane (`tools/`); nothing for this session. **[SUPERSEDED 11 NOVEMBER, 10.70: the lane rule is gone.]**

**THE GENERAL LESSON, entered in 10.23 as item 21:** we have been auditing what our checks assert, and had not asked what verifies the thing that runs them. **The open question, recorded and not chased:** the timing records (`tools/check-times.json`), the dependency table (`tools/affected.mjs`), the seed handling -- can any of them change without triggering a check? If so, the same hole. **Do not go looking now.**

**A count corrected:** the brief spoke of "the eight instrument failures already in 10.23"; 10.23 has twenty-one numbered items with this one. **The project lead accepted it as a stale number quoted from memory (10.23 item 16's trap, theirs this time).**

## 10.64 THE STAGGER, REPRODUCED: THE CAR HAS NO POSITION EXCEPT AGAINST ITS COMMITTED ROUTE (the maintainer's recipe, 10 November; DIAGNOSED, NOTHING BUILT)

**HIS RECIPE, verbatim:** "I managed to replicate it by using the signals to turn and taking the turn so fast the car leaves the lane, once the user takes control the car continuously tries to recorrect itself into what was the original destination lane from that point on until the map is reset." **The key fact (the project lead): it never stops, so it is a latched state, not a momentary authority conflict.**

**REPRODUCED HEADLESS** (`tools/measure/stagger.mjs`, test map 1, the crossroads from the north in the curb lane, signal right, no traffic, assist firm). At 32 km/h the car runs wide, is re-based lane by lane onto the inner westbound lane, and the assist settles it there in about 3 s: **a mild run-wide recovers.** At 45 km/h it runs off the far side of the road it was turning into. Hands off, the assist sits at its full authority (0.35) for 6.5 s, steering the car round toward a lane it is 16-19 m from, until the grass stops it. Hands on, holding a heading, the offset from that lane grows to 34 m and nothing re-bases. **What he described.**

**THE PROJECT LEAD'S HYPOTHESIS, TESTED: "a turn that fails never terminates" -- NOT AS STATED.** The turn itself ends: its record (`me.turn`) clears as the car leaves the box and is judged ("wide", at t = 2.0 s in the run). **What latches is the frame of reference.** The player's car has no position of its own: it is `(route, s, off)`, a distance along and an offset from the centreline of the committed route (`driverPose`, `stepPlayerOn`). **Nothing ever asks which road the car is physically on.** The route changes in only three ways:

1. **the signal, before the stop line** (`stepDriver`);
2. **`laneChange`, one ADJACENT SAME-DIRECTION lane at a time**, when the offset passes half a lane: on the approach, or on the exit stretch past `clearAt + 1`. Never inside the box;
3. **the end of the path**, onto the next join, **carrying the offset with it** -- which is why it lasts "until the map is reset" (read, not run).

So **once a run-wide carries the car past the last same-direction lane of the exit** -- onto the oncoming carriageway, off the road, onto another street -- nothing re-bases it, and every consumer of `off` reads it against a lane the car is not in: **the lane assist steers for that lane's centre at full authority whenever the hands come off** (the "recorrecting"), and **`onRoad` is judged by distance from that lane**, so the car gets the grass's drag and a quarter of top speed even where it is on asphalt. The Frenet frame is also singular there (10.57's 1 - kappa*off), which can add to it; not separated.

**HIS THREE QUESTIONS, ANSWERED (the project lead's):**
- **What clears a committed turn:** the box ends the turn's record; nothing clears the route except the three above.
- **Can anything abort one:** no. Nothing changes the route in the box, and past it only an adjacent same-direction lane can take over.
- **Is the player's steering supposed to:** no, by design (`drive.js` header: turns at intersections are committed to, not steered; past the line the turn is locked). The player's wheel adds to the arc, within grip; it never ends the commitment.

**THE BEARING ON STEERING AUTHORITY (10.57, put to the maintainer): "THE PLAYER WINS AND THE TURN IS ABANDONED" IS NOT EXPRESSIBLE TODAY -- TRUE, BUT FOR A DIFFERENT REASON THAN A TURN THAT CANNOT END.** Abandoning needs somewhere to abandon TO, and the car has no position outside a route. **Every option in which the car can leave the exit's lanes -- including running wide past grip, which is a shipped mechanic (verify-drive section 6) -- needs the car re-located onto the lane it is physically in, or a state for "on no lane".** Only an option that keeps the car within the exit's own lanes avoids it. So re-location is needed under nearly every answer he can give; it is not the give-up timer of a lane change.

**THE FIX'S SHAPE, the agent's read, not chosen:** (a) **the narrow guard, independent of his ruling:** the assist does not act, and `onRoad` is not judged against the route, while the car is outside its route's carriageway -- it removes the latched pull and the false grass, and leaves a car on no lane steered only by the player; (b) **the real fix:** when the offset leaves the route's carriageway, find the lane whose path the car's pose is nearest and heading-aligned with, and re-base onto it (`laneChange` generalised from "the adjacent lane" to "the lane I am on"); none found, the car is on no lane until it reaches one. (b) is what any abandonment answer would stand on. **Neither built.**

### What the project lead took from it (10 November)

**THE HYPOTHESIS WAS WRONG IN EXACTLY THE WAY THAT WOULD HAVE SENT THE FIX ASTRAY.** The project lead, in their own words: they would have built a give-up rule for turns, and it would have fixed nothing, because the turn already ends. Reproducing before building is what caught it.

**THE FINDING IS ARCHITECTURAL AND BIGGER THAN THE BUG: THE PLAYER'S CAR HAS NO POSITION OF ITS OWN.** It exists only as distance along and offset from a committed route, and nothing ever asks which road it is physically on. That one fact explains the endless recorrection, the grass drag on pavement, and why it survives to a map reset.

**WHAT IT DOES TO THE MAINTAINER'S STEERING-AUTHORITY QUESTION (10.57), the project lead taking it to him -- RULED IN 10.65: the player always overpowers the turn, the option WITH the prerequisite:** it is no longer a preference between three equal behaviors. **Every option that lets the car leave the exit's lanes needs the car to have a real position first** -- (b) above, substantial. **Only an option that keeps the car inside those lanes avoids that work.** Two of the options carry an architectural prerequisite and one does not.

**A DEPENDENCY, FLAGGED AND NOT INVESTIGATED (the project lead):** anything that depends on knowing which lane the car is ACTUALLY in rests on the same gap -- **the examiner's wide-turn fault, leaving your lane, the stopping-position fault the maintainer named for creeping, and probably the marking sheet's Lane entries (10.26).** If the model cannot say where the car is except relative to where it intended to be, none of those can be judged honestly. For the player's car this is established; whether the traffic's own cars share it (they are also `(route, s, off)`-shaped) is not looked at.

### (a) BUILT: THE NARROW GUARD (10 November)

`stepPlayerOn` (`src/sim/player.js`): **LOST** is the car further than `LOST_BEYOND` (3.6 m, a lane of verge, a flagged design constant) past its route's road edge. **While lost, the lane assist does not act** -- the endless recorrection, the symptom the maintainer described. `me.lost` is carried for anything else that wants it. **Not (b): the route is unchanged; the car is on no known lane, steered by the player alone.** The road edges are the APPROACH leg's for the whole path (`geomOf`), so on the exit stretch "the route's road" is approximate -- already true of the grass test.

**THE GRASS HALF WAS BUILT, BROKE A REAL PROPERTY, AND WAS TAKEN OUT.** As first built, "lost" also lifted the grass judgment. The derived run failed `verify-contact` on two lines that pass at HEAD: a car nosed past a parked row at 70-90 degrees, no longer dragged, pushed into it at full throttle (183 s scraping against 0; worst time to get clear at 70 degrees, 68.7 s against 15.5); and section 10's driver who never lifts left cars overlapping on 882 of 9600 ticks against 0. **Parked cars stand past the curb lane, so off the road there is genuinely off the road.** The grass cannot be judged honestly without a real position, so it stays judged against the route: **the false drag on pavement far off the route remains until (b).** **A PREDICTION THAT EARNED ITS KEEP (the project lead asked for it to be recorded as one, beside the failures):** the cost was written down BEFORE building -- "real grass more than a lane off the route's road no longer slows the car" -- and it broke exactly that, on two lines of an existing check. Named in advance, it was recognised on sight and the half reverted in minutes rather than traced. **What shipped is a known residual, not a completed fix: the assist no longer pulls, but a player far off-route on pavement is still dragged as if off-road.**

**Predicted before building:** at 45 km/h the assist is 0 on every lost tick; at 32 km/h nothing changes -- never lost, settles in a lane; every existing check unmoved (the last was wrong for the grass half, above). **Held, as shipped:** at 45 km/h, 154 ticks lost (25 m off), 0 pulled; at 32, never lost, judged wide, settles at 0.01 m; `verify-contact` identical to HEAD.

**THE CHECK:** verify-drive section 8, the maintainer's recipe stated in the check. **Sabotaged, each failing its own line:** assist guard removed -> 72 ticks pulled; `lost` never true -> 0 ticks lost. (The grass line and its sabotage, 96 ticks dragged, went with the grass half.)

**THE DERIVED RUN (`node tools/check.mjs`, the 53 checks the change can reach): 53 of 53 passed, on the narrowed guard.**

**Not built, and the project lead's instruction: (b), re-location onto the lane the car is on. It belongs with the maintainer's ruling.**

## 10.65 STEERING AUTHORITY, RULED: THE PLAYER'S INPUT ALWAYS OVERPOWERS THE AUTOMATIC TURN (the maintainer, 10 November, relayed by the project lead; RULED, NOT STARTED)

**Answers 10.57's question.** His ruling, verbatim: *"I would always say the user input steering overpowers any automatic turning."*

**His reasoning, which is the design principle and not only the verdict:** *"an advanced user may be able to take advantage of both to make a sharper turn where a new user may rely entirely on the auto-turn and more carefully manage speed."*

**THE RULE: THE ASSIST IS A FLOOR, NOT A CEILING.** It will take the corner for you; you can always do better by steering; you are never overridden. **It generalises (the project lead):** it is also what "limited control" means in the examiner mode, where the candidate drives and the player intervenes.

**WHAT IT COSTS, PLAINLY: it is the option with the architectural prerequisite (10.64).** If the player can override a committed turn, the car can end up anywhere, so it needs a REAL POSITION rather than an offset from its intended route. **That is 10.64's fix (b), re-location onto the lane the car is physically in, or "on no lane" -- not a patch.** The narrow guard (10.64 (a)) stays as it is until then.

**WHAT IT BUYS BEYOND THE TURN (costed once, not twice):** the wide-turn fault, leaving your lane, the stopping-position fault the maintainer ruled on for creeping, and the marking sheet's Lane entries all rest on the same gap (10.64). **Giving the car a real position is a prerequisite for the examiner layer, not only for this ruling.**

**ORDER (the project lead): TOP OF THE QUEUE WHEN THERE IS USAGE, alongside the two unexplained results on the product's path (IN FLIGHT 36 and 42, 10.61). Their view: the car's real position first, because the most things wait on it.** Not started: usage is low and this is the substantial option.

## 10.66 SCOPING THE CAR'S REAL POSITION: THREE ANSWERS, BY READING (10 November; NOTHING RUN, NOTHING BUILT, NO DESIGN)

The project lead's three questions from the handoff, answered by reading the code. **Their caution, kept in view:** "only the player, so it is small" is the answer we want, which is when to trust it least. Where the evidence is thin it says so.

### 1. What reads the player's position as an offset from its route, and how many places

**One stored quantity, `me.off`, with FIVE WRITERS and NINE DIRECT READERS (eleven lines) in four files, the first of them -- `driverPose` -- itself called at eight sites**, plus the places below that compute the player's position WITHOUT it.

Writers:
1. `player.js` `stepPlayerOn`, integrated from the heading: `off += v sin(psi) dt`;
2. `player.js` `stepReverse`, the same backwards;
3. `drive.js` `laneChange`, the exit stretch, re-based one lane;
4. `drive.js` `laneChange`, the approach, re-based one lane, or the bay's separation;
5. `contact.js` (line 149), pushed out of whatever the car is touching -- **which can push it further off its route.**

The seams carry it unchanged.

Readers:
1. `drive.js` `driverPose` (line 287): THE player's pose. The renderer reads it at five call sites in `MapRoad.jsx`; `contact.js` reads it twice; `drive.js` once.
2. `player.js` `assistSteer`: the lane assist's target.
3. `player.js` `lost`: the narrow guard (10.64).
4. `player.js` `onRoad`: the grass.
5. `player.js`: the turn verdict, wide and cut, two lines.
6. `drive.js` `laneChange`: its thresholds, two lines.
7. `contact.js` line 48: whether a car struck from behind was in its lane.
8. `contact.js` line 103: whether a car cut in on the player.
9. `crossing.js` line 1420: a traffic driver deciding whether the player STRADDLES into its lane.

**And the drift risk, found while counting: TWO PLACES ALREADY COMPUTE THE PLAYER'S POSITION A SECOND WAY.** `encounters.js` line 62 (what the player met, following, followed, overtaking) and `shaping.js` line 156 (where density shaping thinks the player is) pass the player through the traffic's `poseOf`. That function has no player branch: it builds the lateral offset from `weave`, `lc`, `pull` and `pass`, none of which the player has. **So those two read the route's centreline and drop `off` (and the heading) entirely** -- the two-implementations shape of CLAUDE.md item 2, already present, wrong by exactly `off` whenever it is not zero. Not measured; reported, not fixed.

**Beyond `off`, the TRAFFIC IDENTIFIES THE PLAYER'S LANE BY ROUTE** (`inLaneOf`, the lane index, following and yielding), and `off` enters only at the straddle test. **A lost player is therefore, to the traffic, still in the latched lane.** Read, not run.

### 2. Does the traffic share the representation, or only the player?

**THE FRAME IS SHARED; THE STATE IS NOT.** Every actor is `(k, route, s)`, and its pose is the route's centreline plus a lateral offset (`crossing.js` `poseOf`, `poseOnGraph`): in that sense it is the engine's spine, and nothing in the engine has a free position. **But a traffic car's lateral offset is never stored.** It is recomputed at every pose as the sum of five closed forms, each bounded by construction:
- the weave (`weaveAt`, `traffic.js`): a sine of fixed amplitude;
- the wide line (`wideAt`): its amplitude times at most 1, the car's side to the centre line "and no further";
- the lane change (`lateralOf`, `lanechange.js`): a blend from one lane's separation to zero, plus a weave-room overshoot;
- a bus's bay (`pullOf`): the bay's own width;
- going round a bus (`passOffset`): at most one lane.

**A crashed traffic car stops where it hit and is not displaced** (`crossing.js` lines 2375, 3288). **THE EXAM CANDIDATE IS A TRAFFIC ACTOR**: `exam.js` says it "joins like anybody else". That evidence is thin, a comment and the absence of any `off` in the file, and it was not traced further.

### 3. Does the free wheel explain why only the player shows the gap? Tested, not confirmed

**Nothing found that lets a traffic car's offset grow:** all five terms above are bounded closed forms, and no traffic code integrates a lateral position. Unverified: whether any INPUT to those forms can be made large (a map's lane separations, a bay's width). The cases read are bounded by a lane.

**Nothing bounds the player's.** Re-basing caps it only within the exit's same-direction lanes. The grass slows its growth and does not cap it. Contact push-out can increase it. **So the hypothesis holds on reading, sharpened:** the free wheel is why the player's offset CAN grow; that it is the only STORED, INTEGRATED lateral quantity in the engine is why it PERSISTS.

**A CORRECTION TO 10.64 THAT FOLLOWS:** the examiner-side dependency recorded there (the wide-turn fault, leaving your lane, the creeping stop position, the sheet's Lane entries) **does not rest on this gap for the CANDIDATE**, because the candidate is a traffic actor whose offset is bounded. Its judgments are consistent with the model. What the bounded model limits is what the candidate CAN do: it can never really leave its lane. That is a question of expressiveness, not of honest judgment. The dependency holds for faults judged on the PLAYER's own driving. Recorded as found; the project lead's to weigh.

### The estimate for fix (b), given these answers

**Contained to the player's car, not the engine's spine.** Its parts:
- **A locator from a pose to `(k, route, s, off)`:** it does not exist in the sim. `placement.js` `placeOf` goes the other way, and the editor's `nearestOnRoad` works on roads, not lanes. Inside a box several routes overlap, and choosing among them is the hard part.
- **Re-basing on it, and an "on no lane" state.**
- **The nine readers made to agree, and the two `poseOf` readers folded onto `driverPose`.**
- **The grass judged physically:** a surface test exists, `sidewalks.js` `onRoadSurface`.
- **Checks:** a locator held against independent geometry and sabotaged, and the derived set. That set was 53 checks and about 45 minutes per run for a `player.js` change.

**3-6 days. THE NAMED RISK that could take it toward two weeks: what the TRAFFIC does about a player on no lane.** The traffic finds the player by route, so a player off every route is invisible to following and yielding. Only contact would still catch it. How the traffic should perceive a car on no lane is a design question, and it is where this grows.

## 10.67 THE CAR'S REAL POSITION: THE DESIGN TO BE BUILT, AND THE PREDICTIONS, WRITTEN BEFORE BUILDING (10 November; NOTHING BUILT WHEN THIS WAS WRITTEN)

Fix (b) of 10.64, on the scoping of 10.66. **Written before any code, so the predictions can be scored.** Scores are appended below as each piece lands.

### The design, in four pieces, each reported as it lands

**1. ONE POSE.** The player's pose has two implementations (`driverPose`; and the traffic's `poseOf`, which has no player case and drops `off` and the heading). One formula, in one place, read by both. `encounters.js` and `shaping.js` are the two readers 10.66 named; **found since by grep, three more that hand the player to `poseOf`: `placement.js` `nearIn` (the room round a placed car), `crossing.js` `poseOnce` (what a truck hides), and `overlapping`.** All five get the true pose by the one change.

**2. A LOCATOR** (`src/sim/locate.js`): from a pose in the world to `(k, route, s, off, psi)` on the lane the car is physically in, or null. A path's heading is constant along each segment (`poseAt`), so the inverse is exact per segment. **A LANE IS ROAD OUTSIDE A BOX:** only a path's approach (s < stopAt) and exit stretch (s > clearAt) are lanes; in a box a car is on its committed route or on none. This is how the hard part 10.66 named (several routes overlapping in a box) is avoided rather than solved. A car is IN a lane when its centre is within half a lane of the centreline, on the same level, pointing along it rather than against it.

**3. RE-LOCATION AND "ON NO LANE", BEHIND A SWITCH (`world.realPos`), default OFF.** Each tick, after the adjacent-lane re-base that exists:
   - more than a lane off its route's line (the adjacent re-base had its chance), the car is located; **found, it is re-based with its pose unmoved**;
   - not found and past `LOST_BEYOND` (the narrow guard's own test, unchanged), it is ON NO LANE: **its pose is then integrated in the world** (x, y, heading, from the speed and the wheel alone: no assist, no committed arc), `driverPose` returns that pose, and it is located again every tick until a lane takes it;
   - **everywhere else the stepping is HEAD's, to the bit:** a car that never goes a lane off its line cannot tell the switch is on.
   - **THE GRASS, with the switch on, is judged physically**: is there drawn road surface under the car's centre (`sidewalks.js` `onRoadSurface`, every road), not distance from the route.

**4. THE CLIFF, NOT DECIDED HERE.** While on no lane the traffic still reads `(k, route, s)`. **Built as the least decision available: what HEAD already does** -- the latched route, `s` advancing by the speed along it -- and reported. Nothing about how the traffic perceives a car on no lane is designed in this work.

**NOT IN THIS WORK:** the player overpowering the committed arc inside the box (10.65's steering model: this is its prerequisite, not it); lane verdicts re-derived from the located lane.

### Predictions, each with its mechanism

- **P1. Cars met per minute moves by under 2% on an ordinary drive.** Mechanism: on a lane `|off|` is at most half a lane (1.8 m; re-based past it), against a 30 m radius, so few cars sit in the 1.8 m shell. **The defect is real and latent: large only when the car is far off its route.** In the stagger (10.64, 45 km/h, hold) the two poses are apart by `|off|`, up to 34 m, at HEAD.
- **P2. Overtook and overtaken move by at most a few counts in a long drive.** Mechanism: "beside" is 1.8 m across, and a car in the next lane is 3.6 m from the route's line; the player's own 1.8 m can carry that across the threshold only for a car in their own lane while they straddle.
- **P3. A world whose player has `off` 0 and `psi` 0 is the same world tick for tick before and after piece 1.** Mechanism: the formula adds nothing at zero. With a real drive the traffic CAN differ, through `poseOnce` (what a truck hides) and `nearIn`: predicted rare, not predicted zero.
- **P4. The locator returns the lane a traffic car is on, for every car outside a box, at its own `s` to within a centimetre.** Mechanism: the inverse is exact per segment. **Where it will not be unique:** routes from one leg share their approach, and routes into one leg share their exit stretch -- the same lane under several names. Predicted: the located route shares the car's lane (same `from` short of the line, same `to` past the box), not always the same route.
- **P5. Stagger, 45 km/h, hold (10.64's run), switch on:** the car goes on no lane when the guard says lost; **from then its drawn pose moves in a straight line at its held heading** (HEAD: it does too on a straight stale path; the difference shows only where the stale path bends); the speed does NOT fall to a crawl where there is pavement under it, and does on grass. **I do not know which this run is over: the car ends 34 m off at HEAD; read after.**
- **P6. Stagger, then steered back onto the road it ran off (a new run):** with the switch on the car is located onto the lane it reaches, `off` is under half a lane from then on, the assist returns, and no drag on the pavement. At HEAD the same inputs leave `off` large for good and the car crawling. **This is the fix; if this fails the piece has failed.**
- **P7. Stagger, 32 km/h:** unchanged by the switch, tick for tick (never a lane off its line after the adjacent re-base... **uncertain**: in the box the wide run may pass a lane off the arc; if so it is located onto the exit lane it reaches, earlier than the adjacent re-base would).
- **P8. THE GRASS PHYSICAL IS THE RISK TO verify-contact 9 AND 10, AND I PREDICT IT FAILS THEM.** Mechanism: the drawn surface INCLUDES the parking strip (`outer`, `load.js`); HEAD's grass test stops at the lanes. On 10 November lifting the drag there let a car push into a parked row at full throttle (10.64). A car nosed into a parked row stands on the strip: pavement. **If it fails, that is not tuned away: reported, with the carriageway-only variant measured beside it.**
- **P9. Every existing check is unmoved with the switch off**, except through piece 1 (P3).
- **P10. Cost:** the locator runs only when a lane off line or on no lane; the surface test every tick for one car. Under 1% of a step at 180 cars. Not measured on the phone.

### What would make this two weeks (10.66), restated so it is recognised on sight

The traffic's following and yielding find the player by route. **If a check or a measurement shows the traffic doing something to a car on no lane that needs a decision -- following a ghost, queueing behind where the player is not, driving through where the player is -- that is the cliff: stop, report, do not design it.**

### SCORED, 10 November, as each piece landed (the predictions above were pushed first, commit `021a37a`)

**BUILT: pieces 1, 2 and 3. Piece 4 is the cliff and is reported, not built. `world.realPos` is OFF by default; nothing a player sees has changed.**

| | prediction | result |
|---|---|---|
| P1 | met per minute moves under 2% | **HELD, at exactly zero, and the zero was checked.** 30 driven minutes (test map 1 and the loop, 3 seeds each, 5 min): every count identical from either pose (99/99, 95/95, 82/82 cars; 15, 17, 19 on the loop). Zero is this project's warning sign, so the mechanism was confirmed live: in 3 minutes, **1 car-tick** where the two poses disagree on "within 30 m". **The metric the project has relied on was not corrupted, in this sample, by a good driver who holds a lane.** A player who strays more would differ more. |
| P2 | overtakes move by a few counts at most | **HELD:** identical in all six runs. |
| P3 | zero-offset world identical; a real drive rarely different | **HELD, more strongly than predicted:** the traffic was identical to HEAD (a sum over every car's place) in all six real drives. |
| P4 | the locator inverts exactly; the same lane under several names | **HELD AFTER TWO FAILURES OF MINE.** (i) First run: poses out by up to 0.49 m at path vertices -- it took the smaller offset before the exact projection. (ii) **Not predicted: on a turn bay's taper the nearest lane is not the route's lane** (two centrelines less than a lane apart), and a bay that has not opened lies exactly on its neighbour. 96.7% of random places on test map 1 are located on the lane they were made on; the rest on a nearer one. |
| P5 | stagger, 45, hold: straight line; crawl only on grass | **HELD AND UNINFORMATIVE:** that run ends on grass, so it is identical to HEAD to the printed digit. |
| P6 | steered back, the car is located and the drag goes | **HELD -- ON THE THIRD SCENARIO, AND THE FIRST TWO TAUGHT MORE THAN THE THIRD.** (i) Steered back at once: never lost, even at HEAD. (ii) Steered back late **to the road the turn was for: HEAD RECOVERS TOO**, because the latched lane IS the road it returns to. **The latch only hurts when the car ends up on a different road from the one latched.** (iii) The turn abandoned for the road straight ahead: at HEAD the car reaches that road and stays lost, 66 m then 158 m "off", no assist, **held to 30 km/h on pavement asking for 45**, and hands off drives straight off the bending road. With the switch on: located at 11 s, offset 0.86 m falling to 0.00, assist back and holding the bend, 45 km/h, across the next seam normally. Two errors in my own scripted driver on the way (aimed along a chord across a bowed road; no throttle on the grass). |
| P7 | 32 km/h unchanged by the switch | **HELD:** the same car on 480 of 480 ticks. |
| P8 | the grass by drawn pavement FAILS verify-contact 9 and 10 | **FAILED, in the good direction: it passes with the switch forced on.** Checked that the mechanism was active in that run and it was: worst seconds to get clear at 45 degrees 13.4 -> 16.1, at 70 degrees 15.5 -> 7.4, at 90 degrees 43.7 -> 43.8; 0 s scraping in both. **Why I was wrong:** on 10 November the drag was lifted wherever the car was lost, grass included; here it is lifted only on drawn pavement. **Sample: 24 cases of one script and one city run. The 90-degree case is 43.8 s against a 45 s bar, the handoff's known near-miss, no better.** |
| P9 | every check unmoved with the switch off | **see the run tallies below.** |
| P10 | under 1% of a step | **HELD by three orders:** a tick of the player is 3-7 MICROseconds on a lane or on no lane, on test map 1 and the city (a step at 180 cars is milliseconds). On this machine, loaded; the index's one-off build and the phone are not measured. |

**THE DESIGN CHANGED IN ONE PLACE WHILE BUILDING, FOUND BY MEASURING: the grass is NOT the drawn surface alone.** The drawn ribbons do not cover every committed arc: 29 of 2,132 points inside test map 1's boxes, and ramp gores on the loop, lie on no ribbon. A car on its own turn would have been dragged. So: on its route's own road as before, OR on any drawn pavement.

**FOUND, NOT CAUSED AND NOT FIXED: THE PLAYER'S CAR STEPS SIDEWAYS IN A BOX.** On its route inside a box, off its arc, the pose jumps as the car passes each vertex of the arc -- the offset times the bend at that vertex: **209 mm in one tick at 45 km/h, 149 mm at 32, zero at 20, with the switch OFF.** A path's heading is constant along each segment, so the frame the car is kept in is kinked. It is visible stutter on exactly the maintainer's recipe, and it may be part of what he called a stagger. Not separated from the latch by anybody yet. The world-kept pose does not have it; the route's frame does. **[CORRECTED 11 November, DECISIONS 10.70: the 209 / 149 mm below were measured as `hypot(step, travel) - travel`, which adds a sideways step to the tick's travel in quadrature and so UNDERSTATES it. Read directly, in the car's own heading frame, the tick that reads 208.8 mm that way is 268 mm sideways (about 28% more [D: 268 / 208.8]); the scene is the section 9 drive with the switch off, whose old reading matched the recorded 209 exactly, but it is not proven to be the identical scene.]**

**THE CHECKS:** `verify-locate` (new: the inverse, brute-force nearest, no box, not across or against, the traffic's own cars) -- 7 sabotages, each failing its own line; one sabotage was too weak the first time (it removed one of two guards) and was redone. `verify-encounters` section 6 (a player off their line: every earlier scene had `off` 0, the one place the two poses agreed) -- 2 sabotages. `verify-drive` section 9 -- 9 sabotages; **two PASSED at first** (ignoring the kept pose; asking the world every tick), each then given the scene that holds it (past the end of the ghost's path; a bay's taper).

### THE CLIFF, REACHED AND MEASURED, NOT DECIDED (`tools/measure/ghost.mjs`)

The traffic finds the player by `(k, route, s)`. On no lane those are kept as HEAD keeps them. One traffic car per scene, test map 1, the switch on:

- **A. THE GHOST IS QUEUED BEHIND.** The player stands on the grass 34 m from the road (where 10.64's run leaves them); their ghost stands on the latched lane. A car coming down that lane at 43 km/h **stops 6.5 m behind the ghost and stands** (8.4 s of the 20 measured, and still standing), 34.5 m from the player's car.
- **B. THE CAR IS NOT SEEN.** The player stands in a lane, facing against it; their ghost is on another street 195 m away. A car coming down the lane they stand in **strikes them at 35 km/h** having never braked for them.

**Both are HEAD's behavior and this work changes neither.** My first run of this measured something else: the standing player held the slider at the bottom, which is reverse, and backed 30 m toward the road. **The questions for the maintainer, none answered here:** is a car on no lane visible to the traffic at all; if so by what (its body in the plane, as a parked car or a wreck is?); does anybody yield to it or only avoid it; and what does the lane it left do about the ghost -- which today holds a queue. **Until that is ruled the switch stays off.**

## 10.68 THE CLIFF, RULED: THE TRAFFIC PERCEIVES BY GEOMETRY, NOT BY LANE MEMBERSHIP (the maintainer, relayed by the project lead, 10 November; RULED, SCOPED BY READING, NOTHING BUILT)

**Answers 10.67's cliff.** His words: *"real drivers use their eyes to see what's on the road, especially since drivers know other drivers won't drive predictably and their own driving may have to be irregular to compensate."*

**THE RULING, three parts:**
1. **A car on no lane is visible to the traffic and is avoided.**
2. **Nobody yields right of way to it: it has none.**
3. **The ghost goes. A car's presence in another driver's awareness follows its BODY, not its route.**

**THE REASONING, which is the principle and not only the verdict (the project lead):** a model in which the traffic perceives only lane-assigned vehicles HAS NO HAZARDS IN IT, and hazards are what the game is about. A thing in the road that is not where the bookkeeping says a thing should be is the definition of one. **And it is the same principle as the sight and occlusion work** (sight.js, 10.47): what a driver knows about is what their eyes could reach, decided by where bodies are, not by what a table says. Perception by geometry, not by bookkeeping.

**THE PROJECT LEAD'S SUGGESTION, TO WEIGH: keep the car indexed, by geometry instead of by route** -- insert a car on no lane into the neighbour index of whichever lanes its body physically overlaps, so the cost structure is unchanged and nothing becomes a spatial scan per driver per tick (10.33).

### Weighed, by reading: IT WORKS FOR LANES, AND HAS THREE GAPS

**Why it works, and more cheaply than it sounds.** The traffic's index (`crossing.js` `relevanceOf`) is built once a tick from each actor's `(k, route, s)` and nothing else. So nothing in the index has to change: **a STAND-IN actor whose `(k, route, s)` is chosen by geometry (the locator, 10.67) is indexed, followed and braked for by every rule that exists.** The work is one geometry query a tick for ONE car (microseconds, 10.67 P10), and no driver scans anything. The worker gets it for nothing: it writes the player in through `withDriver`, so stand-ins made there from a field on the player cross the boundary as the player does.

**Avoided, by rules that exist:** a car ahead in my lane is followed and stopped for (`whatStops`, the share-lane branch); a car inside the region where two paths overlap is "a stopped car to stop short of" whoever had priority (the across-my-path branch, 8 October). **No right of way, at one site:** every yielding decision goes through one function, `blockedBy`; an actor flagged as having no right is never yielded to there.

**THE THREE GAPS:**
1. **A body is in more than one lane.** One actor is one route. A car across a line, or crossing a road, needs an entry per lane its body overlaps: several stand-ins, a handful at most. (Today's `straddles` case in `whatStops` is this, for the player only and only between lanes of one road, read from `off`.)
2. **In a box there are no lanes** (10.67: "a lane is road outside a box"). A car on no lane inside an intersection would be invisible there unless the locator is extended to say which movements' paths through the box its body lies on -- every one of them, not a choice among them, so the hard part 10.67 avoided stays avoided. Up to a dozen stand-ins in a wide box.
3. **A stand-in has a place along a lane but not a lane's direction.** A car across a lane or coming the wrong way down it is, to the following model, a car in front at some speed. The honest reading is a STOPPED thing at that place; a wrong-way car closing at speed will be braked for as if it stood still, which is less than a real driver would do and all the model can.

**AND ONE COST THAT IS NOT IN THE SUGGESTION: THE GHOST GOING.** The player's own actor still has to be in the world (the page, shaping, encounters and the horn find it there) with no place in any lane. An actor with no route is not safe: 30 loops over the actors in `crossing.js` alone, most of which ask its path. So the actor stays, flagged, and the readers that find cars BY ROUTE skip it: a boolean on a neighbour already being visited (allowed by 10.33), at a number of sites to be counted before building -- `whatStops`' loop, `blockedBy`, the lane index, the lane change's neighbours, placement. **That count is the estimate's soft part.**

### The plan, if approved: behind the same switch

- `me.shadows`: each tick, the lanes (and, in a box, the paths) the player's body overlaps, from the locator at three points of the body. `withDriver` writes one stand-in per shadow: flagged as the player (so nothing steps it and the traffic's own contact test leaves it to `playerContact`, as now), no right of way, speed along the lane floored at zero, its pose the player's real one.
- On no lane, the player's own actor is flagged and skipped by route readers. **The ghost is gone.**
- On a lane, the actor is the car as now, and shadows are only the OTHER lanes its body is in -- which generalises `straddles` to the oncoming lane and to another road.
- Checks: `ghost.mjs`' two scenes become a check with the expectation stated in it; the step time on and off at 180 cars (10.33: measure, do not agree).

### Predictions, before building

- **G1. Scene A (10.67): the car no longer stops for the ghost.** It passes the place at its own speed. Mechanism: nothing is on that lane.
- **G2. Scene B: the car brakes and stops behind the player standing in its lane, and never touches them.** Mechanism: a stand-in on that lane at the player's place, read as a stopped leader 110 m ahead.
- **G3. A player crossing a road at right angles in a gap a competent driver would not take is braked for hard, and sometimes struck.** Mechanism: the stand-in appears in a lane at the moment the body enters it; nobody anticipated it. **That is the hazard the ruling wants, not a defect -- but it will show as crashes in any check that counts them.**
- **G4. Step time at 180 cars moves by under 1%.** Mechanism: at most a dozen extra actors, one query for one car.
- **G5. With nobody off a lane the world is the same world, tick for tick**, switch on or off. Mechanism: no shadows, no flag. **Least sure of this where the player straddles a line: the stand-in and the existing `straddles` rule will both speak, and "the first of two equal pressures" may not be the same first.**
- **G6. I EXPECT THE SITE COUNT FOR "SKIP THE FLAGGED ACTOR" TO BE WHERE THIS RUNS OVER**, and a missed site to show as a car still queueing behind nothing. Scene A is the test for it.

**NOT IN THIS:** traffic steering AROUND a car on no lane (they stop for it, as for a wreck or a stopped car; going round is `passing.js`, built for buses only); a horn at it; fault for striking it.

## 10.69 FAULT FOR STRIKING A CAR ON NO LANE: FAULT FOLLOWS AVOIDABILITY, NOT POSITION (the maintainer, relayed by the project lead, 11 November; RULED, CHECKED BY READING, NOTHING BUILT)

His words: *"if the player or another driver is off the road, and somebody crashes into it when it was avoidable the fault is on the second driver because they've failed to prevent an avoidable collision. if you can see and reasonably react to an obstacle and fail to do so that's on the driver."*

**THE RULE: being off the road does not assign fault. Being able to see and react, and failing to, does.** The test is the same whoever is where.

**IT GENERALISES AN EARLIER RULING, IT DOES NOT ADD ONE.** 29 September (5.x, and `peds.js`): fairness is owed to the player -- somebody steps out in front of them only where a response exists in time; an unavoidable collision "does not test anticipation and merely punishes". That was avoidability protecting the player from blame. This is the same test protecting whoever was struck, and blaming whoever could have stopped.

**THE PROJECT LEAD'S INSTRUCTION: this reuses machinery rather than adding any -- avoidability is already computed by the fault system, visibility is the sightline model -- and to establish that both are reachable from where fault is decided before designing anything new. ESTABLISHED BY READING, AND IT IS HALF TRUE:**

- **VISIBILITY IS REACHABLE.** Fault is decided in `contact.js` `playerContact`, with the world in hand. The trucks' boxes are kept on the world each tick (`world.tall`, `crossing.js` step) and `sight.js` `hiddenFrom(eye, pose, them, boxes)` works on poses, so "was the struck car hidden from the striker" can be asked there today, for the tick of contact. **Its limit is the sight model's own: only a truck hides anything** (buildings hide nothing yet, 10.42), so a car on the verge is in plain view unless a truck stands between.
- **AVOIDABILITY IS NOT COMPUTED WHERE FAULT IS DECIDED. The claim does not hold as stated.** `playerContact` decides fault from three things, none of them whether anybody could have stopped: who owed whom in an intersection (`owedBy`), a car changing lane into the player (`cutIn`), and struck from behind (`rearStruck`). **The arithmetic does exist, once, elsewhere, and asked BEFORE an event rather than after one:** `peds.js` `playerCanRespond` -- react at the floor, brake as hard as the car can, stop short -- which decides whether somebody may step out in front of the player. (`canStopFor` in `crossing.js` is the comfortable version, for giving way to a bus.) The old engine's `avoidableFrom` went with cut C.
- **AND ONE THING IN THE FAULT RULES CONTRADICTS THE RULING TODAY:** `rearStruck` returns "the player's doing" whenever the player is more than 0.9 m off their lane's line. That is position assigning fault.

**WHAT IS ACTUALLY MISSING, and it is one quantity, not a system:** avoidability is a question about an EARLIER moment -- when the striker could first have seen the thing -- and fault is decided at the tick of contact, with only the present in hand. **The moment the obstacle became seeable to that driver is kept nowhere.** With it, the test is the one `playerCanRespond` already makes: from that moment, at the speed then, reaction plus the hardest stop against the room there was. Not designed here.

**A REUSE THE RULING MAKES AVAILABLE, noted, not built:** once the traffic stops for a car on no lane (10.68), a traffic driver who strikes one that had been standing in plain view has, by the model's own rules, failed to do what a watching driver with room does -- they were looking away (`attention.js`) or misjudged. **For the traffic, "it was avoidable and they did not avoid it" is then something the sim has already decided by what the driver did, not a second calculation.**

**THE CASE THAT DOES NOT EXIST:** "another driver off the road". A traffic car cannot be on no lane (10.66: its offset is bounded). A crashed one stands where it hit, in a lane.

**CARRY ON WITH LANES ONLY (the project lead).** 10.68's plan without gap 2: **inside a box a car on no lane has no stand-in and, the ghost gone, is seen by nobody there.** Said here so it is recognised: with lanes only, a car on no lane in the middle of an intersection is invisible to the traffic, where today its ghost is at least somewhere.

### 10.68 BUILT, LANES ONLY, AND SCORED (11 November; behind `world.realPos`, still OFF by default)

**Built as planned, with one thing smaller than planned:** stand-ins (`drive.js` `shadowsOf`, written into the world by `withDriver`, so the worker gets them with the player), `noRight` at `blockedBy`, and the car on no lane flagged `offLane` and passed over. **G6, the site count I expected to run over, did not:** 11 sites, each a boolean on a neighbour already being visited -- `whatStops`' loop, `blockedBy`, four loops in `lanechange.js`, two in `placement.js`, `peds.js`, `buses.js`, and one more in `crossing.js`.

| | prediction | result |
|---|---|---|
| G1 | the car no longer stops for the ghost | **HELD.** It drives past, never under 35 km/h, the player 34 m away. |
| G2 | the car stops behind a player standing in its lane | **HELD ON ONE LANE, AND BETTER THAN PREDICTED ON TWO.** One lane each way: stops 2.0 m clear and stands, along the lane or across it. Two lanes: slows to 26 km/h and GOES ROUND by an ordinary lane change -- the lane-change rules that exist, reading the stand-in as a stopped car ahead. I had not thought of it. |
| G3 | a player crossing in a gap is braked for hard and sometimes struck | **NOT MEASURED.** |
| G4 | step time under 1% | **NOT MEASURED.** |
| G5 | with nobody off a lane, the same world | **HELD ON THE HIGHWAY, FAILED IN TOWN, AND THE FAILURE IS THE FINDING BELOW.** The loop: identical traffic in all three 5-minute drives, no stand-in on any tick. Test map 1: a stand-in on 126-130 ticks of 6000 in each of three drives, and the traffic diverged. |
| G6 | the skip-site count runs over | **FAILED, in the good direction**, above. |

**THE FINDING, AND IT IS A DECISION I HAVE NOT MADE: AN ORDINARY DRIVER TOUCHING THE CENTRE LINE NOW MAKES ONCOMING TRAFFIC BRAKE.** A stand-in is made when the body reaches a lane of another carriageway -- the same threshold as the existing `straddles` rule (the body over its own lane's line at all). A good driver hugging the centre line (0.8 m left of their lane's line, nose 4-6 degrees left) or moving over early for a turn bay has a corner over it, so the oncoming lane is shown A STOPPED THING (10.68 gap 3: a stand-in has a place, not a direction) closing at their combined speed. **Measured, three 5-minute drives (`tools/measure/standin-drive.mjs`): in one, oncoming cars within 80 m braked past 3 m/s2 on 47 of 108 car-ticks while the stand-in stood (43.5%, against 1.6% the rest of that drive); in the other two nobody was oncoming at the time.** One drive in three, about a second of hard braking by somebody else per five minutes -- a small sample, and a new source of hard braking on a road where hard braking is already an open defect (IN FLIGHT 36). **A real driver does not stop for a car a hand's width over the line; they keep right.** The model cannot express that: the traffic's only responses to a thing in its lane are to follow it, stop for it or change lane.

**THE CHOICES, the maintainer's and the project lead's:** (a) as built -- any touch of another carriageway's lane counts; (b) stand-ins only for a car ON NO LANE, which is the ruling's own words, leaving a car over the centre line on its own route unseen by the oncoming lane as it is at HEAD; (c) a depth of intrusion before the body counts, which is a number somebody has to choose. **I generalised past the ruling's scope when I made the on-lane case, and that generalisation is what produced this.** Not changed: it is behind the switch, and which of these is right is not mine.

**THE CHECK: `verify-drive` section 10**, the two scenes of 10.67 with what each car should do stated in it, a one-lane scene along and across, 400 yielding places, a car weaving on its own side, a car over the centre line. **9 sabotages; 8 failed their own lines. THE NINTH PASSED AND THE LINE IT SABOTAGED IS GONE:** passing over the car on no lane in the traffic's index as well as where each driver reads its neighbours was redundant -- no check could tell, because the second makes the first invisible. One site now, not two.

**NOT DONE, LANES ONLY (10.69):** in a box, a car on no lane has no stand-in and no ghost. **Not verified: the worker path with stand-ins (`verify-worker` runs with the switch off); the page (a stand-in is skipped in `MapRoad`'s draw loop, unseen); the horn at a stand-in; G3, G4.**

### THE RUN TALLIES FOR THIS BRANCH (10.67, 10.68), and which run each was

**Pieces 1-3 (the single pose, the locator, re-location and on no lane; the switch off), against the pre-work commit `9f45c20`: THE 54 CHECKS THE CHANGE CAN REACH, 53 PASSED AND ONE TIMED OUT -- AND THE TIMEOUT IS THE MACHINE'S.** 85 minutes of wall, three at once, nothing else running (11 November, tree `e96f1c8`).
- **`verify-shaping` hit the runner's 20-minute cap, three runs out of three.** Run with no cap on the pre-work commit and on the branch, side by side, alone on the machine: **both pass, both in 1122 s.** Its record is 740 s on the usual machine; this container is a third slower and the cap is 1200. Not a regression. Its numbers moved where they should with the player's real pose: overtaken by the player 12.3 a minute against 12, and the shaped-against-unshaped ratio 3.04x against 3.01x, bar 1.45.
- **AN EARLIER RUN OF THE SAME SET READ 49 OF 53 AND MOST OF THAT WAS MINE:** I ran sabotages, a forced-on comparison and diagnostics on top of it, on four cores, to a load of 15. `verify-keepright` (timeout) and `verify-editor` (a timing line, 60 ms against its bar) pass in the clean run. **`verify-mergecount` was real** (recorded above and fixed in the check).
- **P9 SCORED: FAILED ONCE.** "Every existing check is unmoved with the switch off, except through piece 1" -- piece 1 broke `verify-mergecount`, whose own reference count was reading the pose piece 1 corrected. That is the exception I named, and I did not predict which check it would be.

**The switch forced on, the 14 checks that drive the player, beside the same 14 with it off (pieces 1-3, before 10.68):** identical verdicts but for the one line of `verify-drive` that asserts the switch-off behavior. `verify-shaping` forced on was killed unfinished. **Not a suite run.**

**[SUPERSEDED BY 10.70, THE GATE: 53 of 53 plus `verify-shaping` passed on `9846768`.] 10.68, lanes only: THE DERIVED RUN IS NOT IN THIS RECORD YET.** It was started twice; the first was killed by a restart of the session's machine. If no tally follows this paragraph, it did not finish: run `node tools/check.mjs` on the branch before merging.

## 10.70 THE CENTRE-LINE QUESTION RULED: STAND-INS ONLY FOR A CAR ON NO LANE; AND WHAT THE SESSION FOUND ABOUT ITS OWN START (11 November; BUILT AND SCORED; THE DERIVED RUN PASSED, `9846768`)

**RULED (the maintainer, relayed by the project lead): option (b).** A stand-in is for a car on NO lane, which is the 10.68 ruling's own wording. A driver touching the centre line is still on a lane, only slightly over it, and real drivers do not brake because someone's tyre touched a line. **ONE RULE PER CASE:** the existing rules (the lane change's and `straddles`, crossing.js) keep a car over a line; the stand-in does not speak there too. The previous session's own least-sure prediction (G5, 10.68) was that both would speak where the player is over a line, and two mechanisms for one situation is this codebase's most frequent defect.

**Built:** `shadowsOf` (drive.js) returns null unless `me.noLane`. The "own lane, own carriageway" branch that existed only to find the lanes BESIDE a car that was still on one is removed, not left as a second dormant mechanism.

**Checked, and the first account of this was wrong.** `verify-drive` section 10's last scene now asserts the opposite of what it asserted: 1.5 m over the centre line, still on its lane, the player is ONE actor, no stand-in, nothing flagged. **The first sabotage was reported as "4 FAILED, as expected", and the count was the only thing read.** The four lines, read: it was NOT the old behaviour put back. It replaced the guard with `if (false)`, which also removed the old own-lane exclusion, so the player's own lane got a stand-in (`A-north:fwd#1` at tick 0, off 0.00 m: a car shadowing itself). Weaving (400 ticks) and the two "same car tick for tick with the switch on" scenes (44 of 480, 0 of 80) fired on THAT, which the previous build never did -- they pass on it. **With the previous build's real `shadowsOf` restored, exactly ONE line fails: the over-centre-line scene** (stand-in written on `A-north:rev#0`, `shadows`, flagged count and `playerActors=2` all firing; `noLane` false, off -3.30 m: a real case, not a setup error). So only that line guards the ruled behaviour; the other three guard a neighbouring invariant (no self-shadow, no on-lane stand-in near the line) and cannot tell old from new.

**A vacuity found and closed, in the family Codex measured (a check that cannot tell "the behavior was wrong" from "the situation never arose").** "No stand-in" is a negative and passes for want of anything to shadow: with the body kept on its own lane (offset 0) the stand-in assertion PASSED. A precondition line now asserts the case arose -- the body is over a lane that is not its own while the car is still on its own lane by route -- and with the offset at 0 it is the ONLY line that fails; with the old build restored it holds and the stand-in line is the only one that fails.

**Prediction, written before the run, scored:** with (b), a good driver on random trips has no stand-in and the oncoming traffic brakes at its baseline. `tools/measure/standin-drive.mjs test-1 5 1`: **0 car-ticks with a stand-in; oncoming braking past 3 m/s2 on 1.9% of 13,397 car-ticks** (the 10.68 finding was 43.5% while the stand-in stood, 1.6% otherwise). **HELD. Sample: one five-minute drive, one map, one seed -- small, and the same sample that showed the finding.**

**NOT DONE:** the derived run (below), the step cost at 180 cars, `verify-worker` with `realPos: true`, anything on a page. The 53/54 tally in 10.68 was taken on the old runner at the old base and is VOID until the derived run is re-done on the final tree.

### THE STANDING REQUIREMENT (the maintainer, 11 November): A CHECK THAT DOES NOT RECORD WHETHER THE CASE AROSE IS NOT A CHECK

Two agents with no shared context found the same defect within the hour: here, `verify-drive`'s negative assertion passing with the body kept on its own lane; and, relayed by the maintainer, Codex's triage of the 14 seed-fragile checks, where 11 cannot distinguish "the behaviour was wrong" from "the situation never arose" and four of those because an opportunity was assumed (not verified from this side). It is not an item on the instrument-failure list. It is what that list has been describing, twenty-two times. **Every negative assertion carries a precondition that the situation occurred; a check that cannot show its exposure is reported as "cannot tell", never as a pass.** Written into CLAUDE.md, item 3, with the sabotage rule that goes with it. The practical test of a precondition is the one used above: make the case absent, and the precondition must be the ONLY line that fails.

### SPOT-CHECK OF SECTION 9, BEFORE THE GATE (11 November): THREE NEGATIVE ASSERTIONS, EACH SABOTAGED BY MUTATING THE REAL CODE, THE FAILING LINES READ

The earlier session's record names only two of its nine section-9 sabotages (the two that first passed), so the nine cannot be audited as written; three negatives were chosen and done afresh. Predictions written first, scored here.

- **476, "the assist never steers on no lane".** Removing the narrow guard (`player.js:320`, the real bug): **476 PASSES**; only section 8's line 406 fails (79 ticks pulled). Predicted. **476's negative half cannot see the behaviour it names**: `stepNoLane` and `settle` set `assist: 0` on exactly the ticks it counts, so it reads a constant the code sets (CLAUDE.md item 3). It fires only if the REPORTED field is set (mutation: 129 of 130 no-lane ticks). The behaviour is held by line 406, not by 476; 476's words say more than it does.
- **520, "never located against a lane's direction".** Alignment test removed (`locate.js:107`): fires, **61 ticks located**, plus two collateral lines. Predicted. The case is real: the car passes 60 km/h on pavement unmutated and is slowed to 30 once located.
- **482, "the pose never jumps".** `rebase` moving the pose 0.5 m: fires (198 mm, over 131 acted ticks) and so does the line beside it (0.60 m from where it was put). **My prediction was wrong in magnitude (about 500 mm; 198 measured): the jump is `hypot(step, travel) - travel`, so a sideways step adds in quadrature, and at 45 km/h a tick travels 0.625 m.** The consequence was then measured, not assumed: **a 0.1 m sideways step on re-location passes the whole of `verify-drive`; 0.2 m fails it (24.7 mm).** A blind band between 0.1 m (passed) and 0.2 m (failed) per re-location, found and left (fixed below; the 'about 11 cm' first written was arithmetic at 12.5 m/s and the re-location tick is at 8.25 m/s).

All three fire; none is count-only. Two fire on their intended mechanism; one (476) is covered only by a neighbouring line; one (482) has a stated blind band. Each folds its precondition into the same conjunct (`noLaneTicks > 40`, `went > 60`, `acted > 100`), so with the case absent the line fails and cannot go green alone -- the requirement in effect, not in its letter (a separate line says which half failed).

### THE TWO FINDINGS FIXED (the maintainer: "fix first, then one run"), AND THE BAND AS A NUMBER

**482, the pose never jumps: it measured the wrong quantity.** `hypot(step, travel) - travel` is the step added to the travel IN QUADRATURE, so forward motion dilutes a sideways step and the faster the car, the less one registers: one quantity (a position jump) expressed where it does not match the world. Replaced by two numbers, each in its own direction, in the car's own heading frame (a car moves along its heading, and the check runs on ticks with no lane): **`slip`**, the sideways displacement beyond what the tick's turn allows (travel times sin(half the turn): a car cannot move outside the sweep of headings it had in the tick, derived and not tuned), and **`jump`**, the error in the distance moved along the heading. Neither is diluted by travel. The first baseline read 7.50 mm of slip on the unmutated run on every full-lock tick; that is exactly `0.4125 m * sin(1.04 degrees)`, the integrator turning first and moving along the NEW heading, so it is what the allowance is for. Unmutated now: **slip 0.000 mm, along-track 0.068 mm**; limit 1 mm each. A separate line now asserts the case arose (131 ticks).

**THE BAND, measured by mutating the real `rebase` (prediction written first, wrong in the good direction: I expected 2 mm to sit at the edge and it is caught).** Sideways step to the offset, read by `slip`: **2 mm reads 1.99; 5 mm, 4.97; 10 mm, 9.93; 50 mm, 49.7; 100 mm, 99.3; 200 mm, 198.6** -- linear, about 0.993 per mm, caught throughout. Forward step to `s`: **2 mm reads 1.99 mm along-track, 20 mm reads 19.9**, caught. **The band is the 1 mm limit on each axis: it was BETWEEN 0.1 m (passed all of `verify-drive`) and 0.2 m (failed at 24.7 mm)** -- the 'about 110 mm' first written was `[D]` arithmetic at 12.5 m/s, not a measurement, and the car is at 8.25 m/s on the re-location tick (it enters at 45 km/h and the grass slows it). **THE ALLOWANCE'S HIDDEN STEP, MEASURED (printed after the gate, not inferred):** at the re-location tick the swing is 0.1919 degrees, the travel 412 mm and the allowance **0.691 mm [M: printed by a probe at the re-location tick]**; a step opposing the chord's own sideways component can hide inside it, so the worst hidden step there is about 2 x 0.69 + the 1 mm limit, **about 2.4 mm [D: 2 x 0.691 mm [M] + the 1 mm limit; assumes the opposite-sign step, which was NOT mutated; not a measured value]**. On a straight the allowance is zero; on a hard-turning tick it is the travel times sin(half the swing) -- 7.50 mm at full lock at 8.25 m/s, so up to about 15 mm hidden [D: 2 x 7.50 mm [M, the unmutated baseline at full lock]; this scene has no hard-steering tick, so it is a worst case in a scene that does not reach it]. It bites only where a re-location or a jump coincides with hard steering; this scene does not. The opposite-sign case was not mutated.

**THE OPEN BOX DEFECT IS BIGGER THAN RECORDED, BECAUSE ITS NUMBER WAS THE QUADRATURE ONE.** The tick the old metric read as 208.8 mm reads **268 mm sideways [M: the scratch probe, uncommitted, over the section 9 drive with the switch off]** by the new one (at 10.2 m/s after the tick, off 4.47 m). The earlier check would have caught it by a factor of 2, as the maintainer said; the corrected check reads it at 268 mm against a 1 mm limit. The probe was a scratch copy, not committed; the box ticks are deliberately not asserted (the defect is open and would fail the check).

**476 relabelled, not rewritten, and what it was.** `stepNoLane` and `settle` write `assist: 0` on exactly the ticks it counts, so **it cannot fail from behaviour; it was a dead guard, and counting it inflated what was covered.** It is now named `REPORTED-FIELD GUARD ONLY (cannot fail from behaviour -- the behaviour is section 8's "the lane assist never steers for the route's lane")`, with the comment saying so and pointing at that line, and the precondition (130 no-lane ticks) is its own line. Sabotaged again, lines read: setting the field on no lane fails ONLY the guard (129 of 130 ticks); removing the real narrow guard fails ONLY section 8's line (79 ticks pulled), with both section 9 lines green, as the comment says.

### THE STANDING RULE (the maintainer, 11 November): EVERY QUANTITY IN THE RECORD IS MARKED MEASURED OR DERIVED

Three times in one day a number entered the record indistinguishable from an observation, and each was wrong in a way that flattered or misled. **Measured `[M]`: a run printed it, and the record says which. Derived `[D: from ..., assuming ...]`: we computed it; the provenance travels with it.** Derived is allowed and is often all there is; it is never quotable as evidence without the provenance. Written into CLAUDE.md item 3 beside the exposure rule: both let absence pass for evidence. **A precision on the maintainer's framing, recorded because he asked to be corrected when he overclaims: it was not three calculated figures.** The "21 cm" was PRINTED by a run, by an instrument that does not measure the quantity it is named after; that needed a third mark, `[M, instrument does not measure the named quantity]`, because "measured" is not enough if the measure is of something else. And "2.4 mm" is not a measured value as it was briefed: it is derived from a measured allowance.

**Applied retroactively to the figures of this session** (older entries with no mark are UNAUDITED, not measured; the rest of this record, about 7,000 lines from other sessions, has not been audited):

| figure | as it first stood | what it is |
|---|---|---|
| box defect "21 cm" / "209 mm" (10.64, 10.67, handoff) | an observation | **[M, instrument does not measure the named quantity]**: printed by `hypot(step, travel) - travel`, which dilutes a sideways step by forward travel. Superseded by **268 mm [M, scratch probe, uncommitted]**. The scene is the one whose old reading matched, not proven identical. |
| blind band "about 110 mm" | the band | **[D]**: `hypot(0.625 m, x) - 0.625 = 10 mm` at 12.5 m/s, assuming the car moves at 12.5 m/s on the tick; it is at 8.25 m/s. The measured bracket is **[M]**: 0.1 m passed all of `verify-drive`, 0.2 m failed at 24.7 mm. |
| hidden step "about 15 mm" | the worst hidden step | **[D]**: 2 x 7.50 mm; the 7.50 mm baseline is **[M]** at full lock at 8.25 m/s, but this scene has no hard-steering tick. |
| hidden step "2.4 mm" | "the measured value" | **[D]**: 2 x 0.691 mm **[M]** + the 1 mm limit, assuming the opposite-sign step, which was not mutated. |
| box defect "about 28% larger" | | **[D]**: 268 / 208.8. |
| slip reads "0.993 per mm" | | **[D]**: the ratio of printed readings (1.987 / 2 ... 198.591 / 200), linear over 2-200 mm. |
| "25-40 minutes" for the 53 checks | an estimate | **[D]**: a guess at 12 at once; **[M]** 3,203 s, 3 at once. |

### THE GATE: THE DERIVED RUN, ON THE FINAL TREE (11 November; `9846768`, clean tree, 16:26 UTC)

`node tools/check.mjs` on the 53 checks the change can reach (the diff against `origin/main`, by name, `verify-shaping` excluded): **53 of 53 passed, wall 3,203 s, 3 at once** (the runner's default is the smaller of three-quarters of the cores and free memory over 0.75 GB; memory capped it, so the 25-40 minutes estimated was wrong), no FAIL, no TIMEOUT. One SLOW line, `verify-core`: passed, recorded 0 s, ran in about a second -- whole-second timing, not a failure. **`verify-drive` passed in 73 s.** Then `verify-shaping` by hand, alone and uncapped: **all passed, 516 s** (3.04x against a bar of 1.45 over 16 seeds; the earlier container took 1,122 s, under load). `verify-check-runner` is not in the set (nothing under the runner differs from `main`) and stays red on `main`, outstanding. **This replaces the earlier 53/54 tally, which was taken on the old runner at the old base and is void.**

**NOT SHOWN BY IT, and not claimed [the first two are closed below, in THE MERGE... section]:** the step cost at 180 cars; `verify-worker` with `realPos: true` (it ran with the switch off); anything on a page; the switch forced on across the checks that drive the player (done once before 10.68's code, not repeated); the box (gap 2 of 10.68). The switch is still off and nothing in the app turns it on.

### OBSERVATION, NARROWLY WORDED: FOUR OF CODEX'S LISTED CHECKS PASSED HERE, AND THAT IS NOT CORROBORATION

`verify-peds` (seeds 1, 3), `verify-passing` (5, 6), `verify-courtesy` (2, 1) and `verify-generate` (1) pass at their NATIVE seeds on `9846768`. Codex's failures were at seed offsets +11 and +29 on `5a000f3`, applied by a load hook; the zero offset is their control, so a native-seed pass is the baseline their result is measured against, not an independent reproduction. It shows only that those four are not failing at their own seeds on this tree. **The hooked reproduction was considered and DECLINED** (the maintainer): it would show that the checks are seed-sensitive, not why, and only the checks reporting what situations they actually encountered separates a check that saw too few examples from one that saw the wrong thing -- so the exposure work answers it for free at any seed. If that does not resolve it, the experiment is still there.

### A PENDING ASSERTION, WAITING ON THE BOX DEFECT (planned, not yet in the suite)

The open defect (10.67, "the player's car steps sideways in a box") has a specific assertion waiting: **in the section 9 drive with the switch off (test map 1, crossroads from `A-north|end#1`, signal right, 45 km/h), on every tick on its route inside the box (`stopAt < s < clearAt`), `slip` and `jump` each under 1 mm -- the measure `verify-drive` now carries for no-lane ticks.** Today it reads **268 mm** sideways on one tick (10.2 m/s after the tick, off 4.47 m); the old metric read that tick as 208.8 mm, the recorded "209 mm". The scene is the one matching the record's number exactly, not proven identical. **Whoever closes this defect must turn this assertion on.** It is deliberately absent now because it would fail. **The maintainer ruled OUT an inverted tripwire** (red by design until fixed): two tolerated reds, with the one on `main`, is a suite people learn to read past, the same disease as a check that does not say what it means. **What is wanted instead is a SKIP THAT SPEAKS:** the assertion live but skipped with the defect named, and the run reporting skipped-with-reason beside pass, fail and cannot-tell. The runner cannot express that today (the Codex note asks for it); the record is the stopgap, the reported skip the fix.

### THE MERGE, THE SERVED PAGE, AND THE TWO CLOSED GAPS (11 November, after the gate)

**Merged.** `main` fast-forwarded to `fa9b3b7` (no merge commit: `realpos` already contained `origin/main`; the three run-artifact files were discarded, not committed). **Served page [M]: `index-BSXxfLLT.js` carries `fa9b3b7 built 2026-11-11 17:37Z`**, fetched from the Pages URL after the push. The switch is off and nothing in the app turns it on, so a user's default behaviour is unchanged.

**NO LEAK [M]: the heap stayed at about 20 MB over 1,200 ticks with a stand-in on every tick (the player on no lane, 180 cars).** **STEP COST AT 180 CARS (`tools/measure/step-cost-realpos.mjs`, new, reproducible): THE PREDICTION (10.68 G4, "under 1%") IS UNRESOLVED -- neither held nor failed -- because the instrument cannot see 1% on this machine.** Each configuration ran in its own fresh child process, alternating, 600 warm and 600 timed ticks, the page's per-tick work (the player's step, the world's step, contact).
- **[M] The worlds were identical at the end of every run, switch on and off** (hash 234402.965374, 0 crashes), with no stand-in and no no-lane tick, so the mechanism was idle as it should be and the difference is overhead and nothing else.
- **[M] On vs off, 8 children each: user CPU min +0.68%, median -1.27%; wall min -2.41%, median -2.62%.** Spread across the runs: user CPU 17.5% (off) and 8.8% (on), wall 4.9% and 6.5%. **The signs disagree between statistics and the spread is far above 1%: no difference is established.** The most that can be said is `[D]`: the statistics range from -2.6% to +0.7%, so the overhead is below about 3% here; "under 1%" is not shown.
- **[M, a noisy in-process run] the player's own step: 0.0505 ms off, 0.0569 ms on** (about 0.006 ms of a ~12-14 ms tick); it is sub-millisecond and less exposed to the noise than the world's step, but that run's totals spread 33%, so treat it as indicative.
- **Case 2, the player on no lane across a road with stand-ins every tick [M: 600 of 600 ticks, mean 2.00 stand-ins]:** user CPU min 12.030, median 12.525 ms; wall median 12.219 ms, 6 children. Against case 1 with the switch off (min 11.510, median 12.318 user CPU; wall median 12.425) that is **`[D]` +4.5% (min) and +1.7% (median) user CPU, -1.7% wall -- a cross-run comparison in which the worlds differ (the traffic queues behind a stand-in) and the machine's state differed. The prediction "within 5%" is not contradicted by any statistic; it is a bound, not an A/B.**
- **CONDITIONS, because they were not quiet [M]:** the first attempts crashed with out-of-memory (a six-world process, then every child): **Windows had committed 43,379 MB of its 43,518 MB limit**, held by other applications (a 4 GB VM, Creative Cloud, Steam, the Claude desktop processes and others; none of mine), free physical memory 159-815 MB at the worst. **It was NOT a leak in the real-position path: the heap stayed at about 20 MB over 1,200 ticks with stand-ins every tick [M].** The final runs began with 1.6-7.0 GB free physical memory. This is a desktop CPU shared with other agents and applications, **not a phone**: the ratio is what could transfer, never the milliseconds, and the phone is where the cost is felt. **The decision to turn the switch on should not rest on this number; a quiet machine, or the phone, is the instrument that can resolve it.**

**`verify-worker` WITH THE REAL POSITION ON: a new section 1b, passing [M: all passed, 70 s].** Section 1 drives on its lane, where the switch on changes nothing, so it could not have told a worker that drops the stand-ins from one that carries them (the "UNTESTED" of the 11 November handoff). 1b places the player on no lane across a road (standing 20 s, then rolling on), the screen's copy and the worker through the protocol and an in-thread world side by side, 800 ticks. **Exposure, as asserted lines [M]: no lane for 800 of 800 ticks, stand-ins on 477, and the traffic with the stand-ins is not the traffic without them (an exact control: the same world and switch, stand-ins stripped).** An earlier control ran with the switch OFF and **passed even with no stand-ins at all**, because the player moves differently with the switch off; it was replaced. **What crosses is the traffic's reaction, not the stand-ins**: `withDriver` writes them on both ends from the player's record, so comparing them alone would compare a function with itself. Sabotaged, lines read: (S1) the worker not told of the stand-ins -- fails ONLY the tick-for-tick line, first differing at tick 111, **after a first attempt that was INVALID: its anchor occurs twice in the file (section 1 and 1b) and `replace(..., 1)` mutated section 1, so it "passed"; the location was verified (line 124, inside 1b) before the result was believed**; (S2) the case not arising -- both exposure lines fail and the equality line PASSES, vacuously, which is the reason the exposure lines exist; (S3) the worker never sent `realPos` -- **passes: the worker's step never reads the flag, only the page-side `stepDriver` does.** **Not evidence:** "the player's contact judged the same: 0 and 0" -- nobody was struck, so it is vacuous here and is not claimed.

### CODEX'S STATE ON `origin`, READ FROM THE REPO (11 November, after `git fetch`; the maintainer asked to be told from the repo and not by relay)

**[M: git]** Two Codex branches exist. `codex/check-runner-fixes` (tip `38e94da`, 10 November) is already in `main`. `codex/seed-inventory` (tip `6eff3ae`, 11 November) holds the seed-inventory report and is 2 commits ahead of `main`, unmerged. **No commit on either branch, or on `main`, touches `tools/check-runner-test.mjs`, `check.mjs`, `check-policy.mjs` or `verify-check-runner.mjs` since `5a000f3`, and `verify-check-runner` fails on current `main` (`57a3417`) with the same assertion and the same empty input [M: run, 11 November].** The red is NOT addressed in the repo. Anything Codex has done locally and not pushed is not visible from here and is not claimed either way.

### A LATENT TWO-PLACES DEFECT, RULED: THE WORKER DOES NOT HONOUR `realPos` (the maintainer, 11 November)

**What is known.** `[M]` Sabotage S3 of `verify-worker` 1b (the worker never sent the flag) PASSED: nothing in the check could tell a worker world that lacks the switch from one that carries it. `[D: read from drive.js and remote.js, not run]` `world.realPos` is read at two sites, both in the player's own step (`drive.js` 192 and 268), which runs on the page in BOTH paths: the worker's `handle` never calls `stepDriver`. So one quantity, which world model the player is judged by, lives in two worlds and has one reader; the worker's world can silently lack it. It is latent because the traffic's step is not gated on the flag today: the traffic reads the per-actor flags on the player's record (`shadow`, `noRight`, `offLane`), which is why the worker and the page agree.

**THE RULING, BOTH HALVES, KEPT TOGETHER SO NEITHER CAN BE FOUND WITHOUT THE OTHER: `realPos` MAY be enabled with the worker OFF. THE WORKER MAY NOT BE RE-ENABLED UNTIL ITS STEP HONOURS `realPos`.**

**Two precisions on the reasoning, recorded as found.** (1) The maintainer's reading was that `verify-worker` 1b passes today because the worker is off. `[D]` That is not quite the reason: 1b calls `handle` directly, so it exercises the worker's step whether or not the app uses the worker (S1 shows it: it fails when the stand-ins are dropped). It passes because the traffic reads the player's per-actor flags and not the switch. What it could not show was that the flag ARRIVES, and now one line asserts it (`state.world.realPos`), which fails on S3 `[M: read: only that line failed]`. The day any reader is gated on the flag, that line is where it went missing. (2) "Off" is a default and not a guarantee: `simWorker` is off by default (settings.js, since 15 October) but it is a chip anyone can flip, labelled "being fixed; for measuring". **So the ruling is ENFORCED ON THE SCREEN, in both directions:** whichever of the worker and the switch is on holds the other chip off with the reason in its title, and a saved setting of both leaves the worker off and the page stepping. **MY READING of "may not be re-enabled until its step honours `realPos`" is "not alongside it"; the literal reading, never, would remove the worker chip altogether. Asked, not assumed.** `[D]` Honouring it means the worker's `init` and `step` carrying the flag and a traffic reader that reads it; none is built.

### THE SWITCH IS FLIPPABLE FROM THE DEBUG CHIPS, OFF BY DEFAULT (11 November)

A chip "Real position: off/on" beside "Sim: page/worker" on `#/map` (shown when not in clean mode, behind More in it), persisted as the setting `realPos` (default false; the bundle compiles it to `realPos:!1` `[M]`). It is applied in `restart`, page-side, as the skill dial is. **The instrument that can resolve the step cost is the maintainer's phone, and this is how he can run both and say what he feels (the step cost stays `[D]`: below about 3% on a noisy shared desktop, "under 1%" not shown).** `[M]` `verify-core`, `verify-screens` and `verify-worker` (the three the change can reach) pass; the three files changed are `MapRoad.jsx`, `settings.js` and `verify-worker.mjs`. **On the served page `[M: the built-in browser, the served bundle abe04ef, 11 November]`: the default setting shows `Sim: page` and `Real position: off`, both enabled; with the switch on the worker chip is disabled (opacity 0.4, its title gives the reason) and clicking it does nothing; switched back off, both are enabled again.** Only the page's chrome was exercised; no animation frames are delivered in that pane, so nothing about how the world LOOKS with the switch on has been seen by anyone.

### THE EXCLUSION IS A GATE, NOT A BAN; AND WHAT IS NOT SHOWN (the maintainer, 11 November)

**"Not alongside", as read: both chips stay.** The worker is a performance tool likely to be needed on a phone; removing it would turn a latent divergence into a lost capability. **THE CONDITION THAT LIFTS THE EXCLUSION: the worker's step honours `realPos` -- its `init` and `step` carry the flag and a traffic reader reads it -- with `verify-worker` 1b's "the worker's world carries the switch" line and a traffic reader gated on the flag agreeing tick for tick. When that holds, both chips come back and the screen's exclusion goes.** Until then: mutual exclusion on the screen, a saved combination landing worker-off.

**NOT SHOWN, and not to be assumed: NOBODY HAS SEEN THE WORLD RENDER WITH THE SWITCH ON.** The browser pane delivers no animation frames, so only the page's chrome was exercised. That is the maintainer's to look at on the phone, with the chip.

### THE CHECK-HONESTY PASS: THE PREDICTIONS, LOCKED BEFORE THE ANSWER (11 November; the maintainer scheduled this before fault-by-avoidability: "if it doesn't actually work underneath, what's the point")

**Scope.** Mine: per-check exposure lines, each as its own line so a failure says which half failed, starting with the four Codex found assuming an opportunity (`verify-drive`, then `-passing`, `-encounters`, `-peds`), then splitting `verify-contact` (a sample floor, 99 against 100, and a behaviour, the 93.4 s escape at 70 degrees, under one name). Codex's: the runner reporting pass, fail, cannot-tell and skipped-with-reason. Not touched here. No floors or samples are changed to make a seed pass; nothing is added to `src/`.

**A "real behavioural defect" means:** at the failing seed, with the exposure lines showing the case arose at or above the check's own floor, the behaviour line still fails.

**Predictions `[D: my judgement from Codex's one-line verdicts, which are themselves inferences from logs -- inference on inference; not measured]`:** P(real) `verify-passing` 0.10 (7 bold-only moments against a floor of 1, on a sample cut for runtime on 14 October; its `timidOnly === 0` passes vacuously when there are none), `verify-encounters` 0.10 (the constructed gap scene passes independent of seed; only the four-minute drive is statistical), **`verify-drive` 0.25** (cars at a stop leg should wait whatever the seed does, so a zero there is the likeliest to be telling the truth), `verify-peds` 0.15 (the strike needs a drawn driver who fails to react). I also expect 3 of the 4 to fail on their exposure half. For `verify-contact`: the floor half P(real) 0, the 70 degree escape about 0.5.

**THE HEADLINE, as the maintainer corrected it: MOST LIKELY NONE OF THE FOUR IS A REAL BEHAVIOURAL DEFECT, WITH ROUGHLY EVEN ODDS THAT AT LEAST ONE IS.** The distribution, treating the four judgements as independent `[D]`: exactly 0 about 52%, exactly 1 about 37%, 2 or more about 11%. **"0" was stated as a point estimate, more firmly than a 52% basis supports: the same failure in miniature as a derived number quoted as measured. SCORE AGAINST THE DISTRIBUTION, NOT THE POINT.** If 2 or more are real, my model of Codex's one-liners was wrong.

**THE SEED-SHIFT RUN, approved on the condition the maintainer named when he declined it earlier: once the exposure lines exist, not before.** It is not a reversal: the earlier refusal was to spend 85 minutes upgrading an inference to a confirmation, which tells that and not why; with exposure lines the same run answers why, at about 21 minutes an offset. **`tools/seed-shift.mjs` is used from a SEPARATE WORKTREE on `codex/seed-inventory`; that branch is NOT merged to `main`** -- it carries a load hook that rewrites seeds in memory, unreviewed, and `main` is the baseline every measurement is compared against.

### THE CHECK-HONESTY PASS, 1 OF 5: `verify-drive`, SECTION 5 (11 November)

**The line:** "cars on the stop legs sat at their line while the player came through" (`minorWaited > 20`, a count of car-ticks). Codex's verdict at +29: "zero observed stop-leg waiting car-ticks, no trace distinguishes missing exposure from incorrect yielding."

**Exposure, now its own lines `[M]`:** (1) the player came through the box in N of 4 passes; (2) N distinct stop-leg cars came to within 12 m of their line while the player was within 40 m of the box. The behaviour line now also says how many of the arrivals sat at the line. The floors are the minimum at which the claim is testable (1 pass, 1 arrival), not numbers chosen to pass; the existing `> 20` is unchanged.

**THE SCENE'S OWN CLAIM WAS OVERSTATED `[M]`:** its comment says "four passes", and at the NATIVE seed the player came through the box in **1 of 4**. In passes 1-3 it stood at rest 56-70 m short of the node for most of the 60 s, behind a standing queue on the through road (12-30 cars at rest at once; the through road clearing 0-5 cars a 10 s after the first platoon; the minor roads clearing 3 cars across all four passes; the cars at the head of the queue in one pass were creeping right-turners at 0.12 m/s). **Whether that congestion is itself a defect is NOT established** -- a time course is not a diagnosis, and the same file's history records a through-road deadlock found and fixed ("four cars through in five minutes"). `[D]` It bears on IN FLIGHT items about queues; not chased here.

**THE HOOKED RUN, the condition the maintainer named (exposure lines first), `tools/seed-shift.mjs` from a separate detached worktree on `codex/seed-inventory`, NOT merged to `main` `[M]`:** control at offset 0 is identical to the native run (the hook's evidence: shift 0, 12 `seedGraph` calls); **+11 passes, on 460 car-ticks against 2,708 at the native seed (the same floor, a sixfold swing); +29 FAILS as Codex found, and the exposure lines say why: the player came through the box in 0 of 4 passes and 0 stop-leg cars arrived.** The hook's evidence shows the seeds shifted (1 to 12 at +11, 1 to 30 at +29). **CLASSIFIED: AN EXPOSURE FAILURE, NOT A BEHAVIOURAL ONE** (by the definition locked above: the case did not arise at or above the floor). **Scored against the locked prediction: P(real) was 0.25 for this check; it was not real. One of the four expected exposure failures confirmed.** (Windows note: the hook is passed to Node as a `file:///` URL; a bare drive-letter path is refused by `--import`, the same defect as in the runner's test.)

**A DEAD-ISH GUARD FOUND ON THE WAY, relabelled and not duplicated (the 476 precedent):** the behaviour line passes with NOBODY KNOWING A STOP SIGN. Sabotage in the real code (`knownControl`, `reading.js`, returning `"none"` for a stop): all four section-5 lines ok (17 cars arrived, 8 sat at their line, 2,024 car-ticks) while the player's own stop sections in the same file failed `[M]` -- the through road's queue blocks the stop-leg cars whether or not they read the sign, so the line measures WAITING and not STOPPING. **Stopping is held by `verify-signs`: under the same mutation it fails exactly one line, "giving way costs less than stopping: 28 yield-road crossings against 30 with stop signs" `[M]`, a line that passes unmutated at the native seed.** The line is renamed to say so, with the mutation's numbers in its comment.

**Sabotage of the new lines, read, anchors asserted unique `[M]`:** (A) no stop-leg car is ever seen: exposure line 2 fails with "0 distinct cars" and the behaviour line with "0 of the 0 cars that arrived"; (B) the player barely moves: line 1 fails "0 of 4", line 2 and the behaviour line follow; (C, FIRST ATTEMPT INVALID) removing the stop control changes the world so much that the player reaches the box in 0 of 4 passes and no car "arrives" by the check's own test, so all four failed and it isolated nothing; replaced by the real-code mutation above, which is the valid "cars arrive and do not stop" case and found the dead guard.

### A LEAD, CAPTURED FOR WHOEVER CHASES IT: A THROUGH ROAD THAT DOES NOT DISCHARGE, AND MINOR ROADS THAT ARE STARVED (found 11 November by the exposure line of `verify-drive` section 5; NOT DIAGNOSED, NOT CHASED)

**It is the first real lead the exposure work has produced.** The maintainer's framing: this is starvation and not ordinary congestion, in the same family as the phantom holds and the right-of-way work, and `[D: a HYPOTHESIS, NOT TESTED]` it may be what he has been feeling as an empty road: cars that exist but never arrive. A time course is not a diagnosis; the raw observations follow so nobody re-derives them.

**Reproduce:** `QUEUE_PROBE=1 node tools/verify-drive.mjs` prints the observations below (the probe lives inside the check, behind the flag, so there is one implementation of the scene). **Where:** one node, the crossroads at (500, 500) in section 5's map: roads N, S, E, W, `lanes: 2`, legs 400 m; N and S end at a stop sign, E and W uncontrolled (the through road); demand `seedGraph(4 + pass, 50, map, { every: 0.7 })`, passes seeded 4, 5, 6, 7, the player entering at 13.9 m/s at the west end holding road speed and braking for the car ahead. **Which approach:** the west leg's inbound lane `W|end#1`, carrying routes `W|end#1/E|end#1` (straight) and `W|end#1/S|end#1` (right): a MIXED lane, right-turners and straight cars together.

**RAW `[M]`, per 10 s, per pass (through = cars on W or E routes whose `s` passed `clearAt`; minor = N or S routes; "W at rest" = the maximum number of W-route cars with `v < 0.3` and not `going`; "player moving" = ticks with the player above 0.5 m/s):**

| pass (seed) | 0-10 s | 10-20 | 20-30 | 30-40 | 40-50 | 50-60 |
|---|---|---|---|---|---|---|
| 0 (4) through / minor | 18 / 0 | 2 / 0 | 0 / 0 | 2 / 0 | 5 / 0 | 3 / 0 |
| 0: player moving, W at rest | 200/200, 1 | 200/200, 5 | 148/200, 7 | **0/201**, 13 | **0/200**, 12 | 188/199, 12 |
| 1 (5) through / minor | 18 / 1 | 2 / 0 | 0 / 0 | 0 / 0 | 2 / 0 | 2 / 0 |
| 1: player moving, W at rest | 200/200, 11 | 171/200, 11 | 200/200, 13 | 171/201, 21 | **0/200**, 30 | **0/199**, 29 |
| 2 (6) through / minor | 12 / 0 | 0 / 0 | 1 / 0 | 4 / 0 | 4 / 0 | 4 / 0 |
| 2: player moving, W at rest | 200/200, 7 | 200/200, 12 | 200/200, 13 | 201/201, 15 | 44/200, 19 | **0/199**, 21 |
| 3 (7) through / minor | 6 / 1 | 0 / 0 | 3 / 0 | 4 / 0 | 3 / 0 | 3 / 0 |
| 3: player moving, W at rest | 200/200, 15 | 200/200, 18 | 200/200, 21 | 45/201, 13 | 162/200, 20 | 31/199, 30 |

**The totals:** minor roads cleared **3 cars across all four 60 s passes**; the through road cleared 0-5 cars per 10 s after the first platoon (both directions, both lanes counted: below one lane's saturation discharge `[D: about 5 a 10 s, from a saturation flow near 0.5 a second; an assumption, not measured here]`). The player came through the box in **1 of 4** passes (pass 0), and even there it stood at rest 30-50 s before releasing, so the queue moves; in passes 1-3 it ended at rest at x = 430, 444, 433 (56-70 m short of the node centre, 500). **THE HEAD OF THE PLAYER'S LANE AT THE END `[M]`:** pass 1 -- three right-turners `W|end#1/S|end#1`, 4.9, 11.7 and 19.1 m ahead at **v = 0.12, 0.73, 1.4 m/s, `going: false`, `stoppedAt: false`** (through-road cars that never stopped, held by something); pass 2 -- straight-on cars at rest 24 and 30 m ahead, then a right-turner at 36.7 m, all `v = 0`, `going: false`; pass 3 -- a right-turner at 21.9 m at rest, straights at 28.3 and 34.8 m at rest. Pass 0, which got through, ends with its lead cars 122 m ahead moving at 12-17 m/s.

**CANDIDATE CAUSES, with the reasoning `[D]`, none tested:**
1. **Plain saturation.** `every: 0.7` may simply exceed what two lanes discharge, and under gap acceptance a minor road starves when the major road is saturated, which is correct behaviour. **Against it:** the through road is not discharging at a saturated rate either (0-5 cars a 10 s, both directions), and 12-30 cars at rest on one approach with a creeping right-turner at the head is not a saturated stream.
2. **A phantom hold on the head of the mixed lane.** The cars at the head in pass 1 are right-turners that never stopped and are not moving. `crossing.js blockedBy` carries its own warning about this family: "a car stopped two hundred metres back is oncoming traffic by every test except the one that matters", and a through road deadlocked once before in this same scene's history ("35 cars queued behind each, four cars through in five minutes"). A stop-leg car sitting at rest at its line, or a stopped car in the box's approach, counted as a claimant, would hold a right-turn that conflicts with its path.
3. **Mixed-lane spillback.** The curb lane carries right and straight together, so one held right-turner blocks every straight car behind it; a hold that should cost one movement costs the lane. Consistent with the straight cars at rest behind right-turners in passes 2 and 3.
4. **A mutual hold between the through road and the stop legs** (the historical deadlock shape): the stop legs wait for a gap that the through road's own held right-turners never leave, and the right-turners wait on the stop legs.
5. **The player.** It brakes for the car ahead and joins the queue, but pass 0's queue is already 13 cars at rest at 30-40 s and the minor roads clear 0 there, so the player alone does not explain it; **not excluded** as an amplifier (the traffic reads it as one of its own).

**THE DISCRIMINATING MEASUREMENT NOT YET TAKEN:** at a stalled tick (say 45 s of pass 1), for each through-road car at rest or creeping, evaluate `blockedBy(me, them, ...)` against every other actor and print the first `them` that holds it: its id, route, `going`, `s`, `v`, and which rule branch returned true. That names the holder; the table above cannot. Also not captured: what is ahead of the three cars printed, and the stop-leg cars' own state while the through road is held.

**CROSS-REFERENCE: THE WEAVE DEFECT IS OBSERVABLE IN THIS SCENE (the maintainer's observation, 11 November).** The standing queues of 8 to 17 cars at rest in the table above are cars wearing their frozen weave offsets; one probe served both leads. Whether the weave has anything to do with the starvation is NOT established (`[D: not examined]`: no holding decision has been traced to it, and the conflict code pads paths by `weaveRoom`, a bound and not the value; the starvation's candidate causes above stand as written), but the queues the starvation produces are where the weave's frozen offsets are most visible: see "A DEFECT, NOT A MODELLING ODDITY" above, including the test that found no coordinated snake in these queues.

### THE CHECK-HONESTY PASS, ADDITIONS (11 November)

**A CANDIDATE BECAME A MEASUREMENT.** The runner test's red (`verify-check-runner` on `main`) was a candidate cause when it was first noticed from the `--import` finding. **Measured for that test's own child `[M]`: status 1, 0 bytes of stdout, stderr `ERR_UNSUPPORTED_ESM_URL_SCHEME`** (the child never starts). `CODEX-NOTE-verify-check-runner.md` is updated, and its earlier "checked directly" is corrected to say what had and had not been checked.

**A PATTERN, NOTED AND NOT LUCK:** twice in one day, forcing a check to say what it saw has incidentally explained something else: the `--import` path error met in the hook is the diagnosis of the runner's red, and the exposure line of `verify-drive` found a scene delivering one pass of four and a lead on queue starvation. A check that says what situations it met is also an instrument for things nobody asked it.

**THE COMMENT NOW SAYS WHAT HAPPENS.** `verify-drive` section 5's comment claimed "four passes through" while the scene delivers one at the native seeds (11 November). It now states the exposure in the comment and in the touches line's message (the player reached the box in N of 4), so a reader is not misled by the same sentence twice.

**MISPLACED, NOT MISSING (the maintainer's distinction, kept as the report's vocabulary):** stopping at a stop sign is guarded by `verify-signs` and not by the section-5 line that carried its name. That is a tidy-up and not a hole.

### THE CHECK-HONESTY PASS, 2 OF 5: `verify-passing` (11 November)

**The line:** `boldOnly > 0 && timidOnly === 0`, a positive and a negative in one conjunction, and nothing counting how often the question was asked. **Now four lines `[M]`:** (1) cars queued behind a standing bus were asked whether to pass N times; (2) at N of those moments somebody could go (both, bold only, timid only); (3) bold-only > 0; (4) timid-only === 0. The solid-line negative (`solid.passes === 0`) gets its own precondition, the moments asked on that road. Floors are the minimum at which each claim is testable (1), not numbers chosen to pass.

**Exposure at each seed `[M]`, through the seed-shift hook (separate unmerged worktree; the hook's evidence shows the seeds shifted, 5 to 16 and 5 to 34):**

| seed | asked | somebody could go | bold-only | timid-only | result |
|---|---|---|---|---|---|
| native | 63 | **2** | 2 | 0 | passes |
| **+11** | 74 | **1** (both would go) | 0 | 0 | **FAILS** `boldOnly > 0`, as Codex found |
| +29 | 40 | **6** | 5 | 0 | passes |

**Sabotage, lines read `[M]`:** (a) the question never asked: exposure 1 and 2, bold-only and the solid exposure fail, and `timidOnly === 0` PASSES vacuously (which is why the exposure lines exist); (d) the solid road never queued: ONLY the solid exposure line fails, and `solid.passes === 0` passes with "0 of 0 moments"; (c) real code, caution reversed (`3 - caution`): exposure ok, bold-only and timid-only both fail. **(b) THE FIRST ATTEMPT WAS INVALID:** a constant 2 for the caution term made the gap needed so large that nobody could go, so it failed the exposure line too and isolated nothing (the same mistake as the stop-sign sabotage: the mutation was not checked for isolating what it was meant to). **Re-run with 1.05 (the bold driver's own need), caution ignored: ONLY the bold-only line fails, the exposure lines pass (35 asked, ONE moment where somebody could go, both).**

**THE KEY FINDING: THAT READS EXACTLY LIKE THE +11 FAILURE** (74 asked, one moment, both would go, no bold-only). At that exposure the check CANNOT TELL a driver who ignores caution from a road that offered no choice. The failing line now says so, and does so only at fewer than 2 go-moments (verified: the +11 run prints it). The floor is not changed (a floor is a number somebody picks); the margin has eroded, though: the check's own 14 October comment recorded 12 passes and 7 bold-only moments against floors of 5 and 1, and the native run now shows 16 and **2**. Options, not taken: restore the 15-minute sample the comment mentions (about twice the runtime), or count episodes and not sampled ticks.

**SCORING `verify-passing`, AS THE MAINTAINER SETTLED IT (11 November): TWO ENTRIES, BOTH VISIBLE, NEITHER TIDIED INTO THE OTHER.**
1. **SCORED A MISS UNDER THE RULE AS LOCKED, AND THAT STANDS.** The definition in force when the prediction was written (exposure floors met, behaviour line fails) says real; the result says real; the prediction was P(real) = 0.10. A miss, left recorded as one.
2. **CANNOT TELL UNDER THE CORRECTED RULE (below).** A sabotage with caution ignored reads identically to the +11 failure, so the check genuinely cannot distinguish a driver who ignores caution from a road that offered no choice. **That correction was made AFTER the result was seen, and therefore earns the prediction nothing.** The maintainer's reasoning, kept as his: noticing the flaw after seeing the result and then applying it to the result is how predictions get laundered; the rule changes, the miss evaporates, and the record ends up saying our judgement was better than it was. The value of writing the number down beforehand is that it can hurt.

### THE CORRECTED DEFINITION OF "A REAL BEHAVIOURAL DEFECT" (the maintainer, 11 November): IN FORCE FROM NOW, APPLIED TO NOTHING ALREADY SCORED

**The locked definition was weak.** "The exposure floors were met and the behaviour line failed" produced a verdict it had no business producing: a floor of 1 is a presence check and not an exposure floor, and one observation is equally consistent with a defect and with a draw. **Corrected: a behaviour line's failure classifies as a real defect only when the exposure is large enough that one draw cannot explain it. Where a check's own sample makes that impossible, the honest output is CANNOT TELL, which is a result we can report and not a gap we hide (it is the third of the four states the runner is meant to report). The floor is set PER CHECK FROM ITS ACTUAL SAMPLE SIZE, and the floor and its reasoning are stated in the check.**

**What is and is not covered.** Entries already scored (`verify-drive`, `verify-passing`, `verify-encounters`) keep their entries. `verify-peds` and `verify-contact` are scored under the locked rule AND the corrected one, each shown, with the caveat below where the result was seen before the correction.

### THE CHECK-HONESTY PASS, 5 OF 5: `verify-contact` -- PREDICTIONS AND FLOORS, WRITTEN BEFORE ANY RESULT IS SEEN (11 November)

**What was read before predicting, and only that `[M]`:** Codex's one-line row ("+11: all 99 crossings had correct entry records, but the check requires at least 100. +29: worst parked-car escape was 93.4 s at 70 degrees, and the 70 km/h inoperable-car immobility assertion also failed. These are different assertions and need separate review."), and the three assertions in the file: **(i)** section 3b, `crossed >= 100 && agree === crossed` (a 90 s drive on the city's signals); **(ii)** section 9, `cases >= 12 && trapped === 0 && every worst <= TOW_AFTER` (4 angles, up to 6 parked-car slots each, so at most 24 cases, a worst taken per angle); **(iii)** section 9b, at 70 km/h past the damage limit, `hit && s0 === s1 && moved < 0.01` ("goes neither way"), a single constructed scene in an empty world. Nothing at a shifted seed has been run on the exposure lines.

**FLOORS, per check, from its actual sample, under the corrected definition `[D: reasoning stated]`:** (i) the existing floor, 100 crossings, is a sample floor and is unchanged; a count short of it is an exposure failure by definition. (ii) per angle the sample is at most 6 cases, so one slow case is 17% of it and one draw can explain it: **a slow escape classifies as REAL only when at least 2 cases at the same angle exceed `TOW_AFTER`; exactly one is CANNOT TELL.** (iii) the scene is a single construction with no traffic, so the only "draw" is the seed: a failure there is a single observation and **classifies as CANNOT TELL unless it reproduces across seeds**; physics that depends on the seed in an empty world is itself a lead, and is recorded as one.

**PREDICTIONS `[D: judgement from Codex's one-liners and the code, not measured]`:** (i) P(real) 0.02 -- Codex's own row says all 99 entry records were correct; expected an **exposure** failure (99 against a floor of 100). (ii) at +29: **cannot tell 0.55** (one slow case at 70 degrees), **real 0.25** (two or more), **exposure 0.20** (the escape did not get its cases). (iii) at +29: **cannot tell 0.50, real 0.35, exposure 0.15** (`hit` false, or damage below the limit so the other branch ran). **THE NUMBER ASKED FOR, "how many of the three are real":** most likely none, but roughly even odds that at least one is -- stated as a distribution (computed from the three probabilities above as independent: none 0.98 x 0.75 x 0.65 = 0.48, exactly one 0.43, two or more 0.10, so at least one 0.52), and **scored against the distribution, not a point estimate.**

### THE CHECK-HONESTY PASS, 3 OF 5: `verify-encounters` (11 November)

**The line:** section 5's `metPerMin > 1 && following > 0 && followed > 0 && gaps > 0`. Sections 2-4 are paired by construction (each negative beside a positive in the same scene) and were left alone. **Five lines now `[M]`:** the player stood at a stop line N times; met per minute; following; followed; gaps judged (at N stands).

**A `src/` CHANGE, MADE DELIBERATELY AND DECLARED:** `encounters.js` counts `stands` with the SAME `atLine` predicate and key that judge a gap. Reimplementing "at the line" in the check would have been a second implementation of one quantity, the defect class this pass exists to remove. It is measurement only (a counter and a summary field). **It reaches nine checks (contact, core, encounters, mergecount, money, passing, places, screens, shaping; 28 minutes serial), so it waits for the derived-set gate on the branch `exposure-pass` and is NOT on `main`.**

**Exposure at each seed `[M]`:** native 2 stands, 2 gaps judged; **+11: the player stood at a stop line 0 times in four minutes** (the exposure line fails first, the gap line beside it with "no stand, so nothing to judge"); +29: 4 stands, 4 gaps. The hook's evidence: 1 to 12 and 1 to 30. **CLASSIFIED: AN EXPOSURE FAILURE, NOT A BEHAVIOURAL ONE. Against P(real) = 0.10: not real.**

**Sabotage of the real code, lines read `[M]`:** (a) the detector broken: section 4's constructed scene fails (the detector's guard) AND the section-5 gap line fails with the exposure intact ("at 2 stand(s)"); (b) the player never at a line: the stands line fails, the gap line says "no stand", section 4 fails; (c) the counter disconnected, the detector intact: ONLY the stands line fails (so the counter is wired).

### THE CHECK-HONESTY PASS, 4 OF 5: `verify-peds` (11 November)

**The line:** section 6's `np.stepped && np.hit`, "the same person, the same place, a car of the traffic instead: they dart out and it strikes them". Codex's +11 failure said it could not tell step-out from impact.

**A KNIFE-EDGE, FOUND BY SWEEPING THE SCENE'S ONE CONSTANT `[M]`.** The check's 7 m (the car's gap to the crossing) sits exactly on the flip at every seed. Sweeping 5 to 9 m through the seed-shift hook: **native hit at 7 and miss at 7.5; +11 hit at 6.5 and miss at 7 (the failure Codex found); +29 hit at 7 and miss at 7.5.** The pedestrian steps out at t = 0.05 s with the car 6.45 m away at 11 m/s, runs at 3 m/s, and reaches the car's lane about 1.2 s later; the car brakes at its maximum from the first tick. Natively its nose stops 1.23 m into the crossing and the pedestrian runs into it at v about 0; at +11 the car stopped 0.84 m in, **0.39 m shorter**, and the pedestrian passed in front. **My first exposure idea, "was a strike physically forced" (stopping room at the most the traffic can brake plus reaction, 11.41 m, against 6.45 m available), was WRONG: it said forced at every seed and +11 had no strike**, because the pedestrian can clear the car's path. The constant is NOT changed (never tune a number to make a check pass); the check reports it, and the failing line prints CANNOT TELL when the scene's gap has a neighbour within 0.5 m with the opposite outcome. **(The first wording of that message said "a strike at gaps up to X m and none from Y m" and became nonsense under the no-brake sabotage, where the order inverts because the pedestrian has not reached the lane yet at small gaps; it now lists the outcomes and tests for a neighbour.)**

**SCENE B, ADDED: WELL INSIDE THE AVOIDABLE RANGE, WHERE A STRIKE CAN ONLY BE THE DRIVER'S FAILURE TO REACT.** The avoidable range starts at `stoppingRoom(11, MOST_BRAKE) + 11 * REACTION_FLOOR` = 11.41 m, from the sim's own constants and not picked. A car told to ignore people (`world.ignorePeds`, the file's own controlled comparison) is the control: it must strike at some gaps, or the pedestrian clears regardless and nothing was asked; a car that watches the road must strike at none of the same gaps. **Identical at native, +11 and +29 `[M]`: the pedestrian stepped out at 20 of 20 gaps (11.5 to 21 m), the blind control struck at 15 of 20 (11.5 to 18.5 m), the reacting car at none.** **FLOOR, from the sample:** scene A's strike boundary moved by at most one 0.5 m step across those seeds, so the control must strike at 3 of the 20 gaps, two beyond any one-step shift (observed 15). Scene A is kept as it is for what it honestly reports.

**Sabotage of the real code, lines read `[M]`:** (a) the heedless pedestrian never steps out: A's step-out line, B1 and B2 fail, and B3 passes VACUOUSLY ("0 struck, of the 0 gaps"), which is why the exposure lines exist; (b) nobody is ever struck: A's strike line fails reading "no strike at any gap" with NO cannot-tell suffix (a defect reads differently from a near miss), B2 fails, B3 vacuous; **(c) the traffic never yields to people on foot, the real defect scene B is for: ONLY B3 fails among the scene lines, exposure intact, "15 struck, of the 15 gaps where a blind one did".** The file's older guards also fail under (c), as they should. The hook's evidence: seeds shifted 3 to 14 and 3 to 32.

**SCORED, TWO WAYS, NEITHER A HIT.** **Under the rule as locked** (exposure floors met: the pedestrian stepped out; the behaviour line failed) the +11 failure is REAL, against P(real) = 0.15: **a MISS.** **Under the corrected rule** it is CANNOT TELL (a near miss decided by 0.39 m). **The knife-edge was found, and the correction was agreed, after the result was seen, so applying the correction earns the prediction nothing.** What scene B adds is the first behavioural evidence the pass has produced: at three seeds, with the control proving the case, a car that watches the road with room to stop did not strike anybody.

### THE CHECK-HONESTY PASS, 5 OF 5: `verify-contact`, SCORED AGAINST THE PREDICTIONS LOCKED ABOVE (11 November)

**Split, with the shared scene moved and not copied `[M]`.** `verify-contact` keeps sections 1-8 (including the light-entry sample); `verify-contact-escape` takes 9, 9b and 10 (nobody trapped, reverse, the soak); `tools/lib/contact-scene.mjs` holds the map, the world, `tick`, `strike` and the other helpers both build on (`strike`, defined mid-file in section 3 and used again in 9b, was missed on the first attempt and found because the escape half threw). **Equivalent on the native seed: 101 ok/FAIL lines in the old combined run, the same 101 in the two halves.** **The point of the split, verified at Codex's two seeds: +11 fails ONLY `verify-contact`; +29 fails ONLY `verify-contact-escape`.**

**Results at each seed `[M]`:** (i) light entries: native 107 crossed, 107 agree; **+11: 99 crossed, 99 of 99 agree, the floor of 100 not met: an exposure failure, no disagreement**; +29: 100, 100 of 100. (ii) escape: 24 cases (6 at each angle), 0 trapped; **+29: 70 degrees worst 93.4 s with 1 of 6 cases slow: CANNOT TELL (one draw)**. (iii) 70 km/h: the contact happened, damage 1.00, the car did NOT go back (0.0000 m) and says "It will not go"; **the failing half is only `moved < 0.01`: 1.8 mm at native, 6.5 mm at +11, 11.5 mm at +29, monotone in the seed offset, 1.5 mm over a 10 mm tolerance. CANNOT TELL, a tolerance edge; a residual that grows with the seed number in an EMPTY world is recorded as a lead.** **A NATIVE-SEED FACT: the 90 degree escape's worst is 43.7 s against the 45 s tow, so the check passes natively with 1.3 s of margin.**

**Sabotage of the real code, lines read `[M]`:** (l) every entry recorded as no control: ONLY "0 of 107" fails, exposure intact; (e) reversing ten times slower: the escape section fails with "REAL: 3 of 6 cases slow" at 90 degrees and "CANNOT TELL: 1 of 6" at others, 4 of 24 trapped, and the other reverse sections fail too; (i) an inoperable car not held: the 70 km/h line fails at **64.7 mm with no cannot-tell suffix** (distinct from the 11.5 mm tolerance edge), and four other guards fail.

**SCORED:** the predictions were written and pushed (`3d8c29e`) before any contact result, under the corrected definition. (i) predicted exposure (P 0.98): **exposure, a hit.** (ii) predicted cannot tell at 0.55: **cannot tell, a hit.** (iii) predicted cannot tell at 0.50 (real 0.35): **cannot tell, consistent, though the mechanism I guessed at (`hit` false, or damage below the limit) was wrong: it is a tolerance edge.** **The distribution for "how many real" was none 0.48, one 0.43, two or more 0.10; the outcome, none, was the most likely single outcome and is no vindication of a point estimate.**

**TALLY OF THE FIVE, by the rule in force when each was predicted:** `verify-drive` not real (exposure); `verify-passing` real by the letter (a miss), cannot tell under the correction; `verify-encounters` not real (exposure); `verify-peds` real by the letter (a miss), cannot tell under the correction; `verify-contact` none real (exposure, cannot tell, cannot tell). **Two of the first four were real by the letter, in the tail of my distribution for them (about 0.11 for two or more): my model of Codex's one-line verdicts was too confident. By the corrected standard no behavioural defect has been demonstrated in any of the five.**

**ONE INFERENCE, NOT RUN `[D]`:** section 9b chooses its branch by comparing the measured damage with `INOPERABLE`, which it imports from the code. A change to that constant would move the branch, not fail a line: the same-constant pattern (CLAUDE.md item 3). Not tested here.

### AT RESUME, AFTER THE USAGE LIMIT (11 November, 20:21 UTC): THE STATE, READ FROM THE REPO, AND THE `--import` LAYER RE-ESTABLISHED BY EXPERIMENT

**State `[M: git]`:** `origin/main` was still `11d13b8` (nothing moved after `50a973e`); `origin/exposure-pass` was `3d8c29e` (one commit after `50a973e`, the scoring and predictions); the tree held only an uncommitted `verify-peds.mjs`; the three run-artifact files were clean; no stash; nothing of ours running. **THE LAYER, re-established from scratch rather than trusted `[M]`:** in a real detached worktree at the broken commit `57a3417`, the original test fails at line 119 (empty stdout); changing ONLY the test's fixture to `pathToFileURL(clock).href`, with the runner (`check.mjs`, `check-policy.mjs`, `affected.mjs`) byte-identical to `main`'s, turns it green and prints `TIMEOUT ... killed after 1200 s (1,200 s cap)`. A first attempt in a plain scratch directory failed for both versions at an earlier line (no `.git`), and was set aside for that reason; a runner defect would not have been fixed by a one-file fixture change. **So the fixture was the wrong layer, the red on `main` was a test defect that is now fixed, and there is no runner defect to inherit.**

### THE MILLIMETRES, RUN TO GROUND: NOT A DETERMINISM FINDING, A TOLERANCE EDGE ON A SCENE THAT VARIES BY CONSTRUCTION (11 November)

**The maintainer's question, asked before it went into the gate as a lead:** the 70 km/h immobility residual (1.8 mm native, 6.5 mm at +11, 11.5 mm at +29, monotone in the seed offset, in an empty world) is alarming only if the seed should not reach the physics. His hypothesis was that the hook rewrites `seedGraph`'s argument and `seedGraph` seeds the road, so each offset gives slightly different geometry. **If the graphs were identical and the millimetres still moved, something would read the seed where nothing should, and that would be a determinism finding that matters out of all proportion to 11 mm, because the world-hash gate is what every other measurement stands on.**

**RESULT, each step `[M]`:** (1) **building the world at the shifted seeds directly, with no hook, reproduces all three exactly** (1.80, 6.50, 11.52 mm at seeds 1, 12, 30), so the hook adds nothing of its own. (2) **The graphs are IDENTICAL: `road`, `course` and `layout` hash the same at every seed, and so does every other world key except the `seed` field itself.** The hypothesis, different road geometry, is eliminated. (3) The seed reaches the scene in exactly one place, **the wreck car's drawn driver profile** (eight fields differ: caution, brake, short, weave, notices, weavePhase, headway, tripLen); **the drift follows the wreck's draw and not the world's seed** (world 30 with the wreck from seed 1: 1.80 mm; world 1 with the wreck from seed 30: 11.52 mm). (4) Of the eight fields only **`weave` and `weavePhase`** matter (setting `weave` alone to seed 1's value: 2.65 mm; the phase alone: 7.84 mm; all eight: 1.80 mm). (5) A STANDING wreck sits at a lateral position that depends on that draw: **201.8077, 201.7724 and 201.8490 m at seeds 1, 12, 30, a 7.7 cm spread, static in time (0 m moved in 20 s).** (6) **With `weave` set to 0 the residual is 0.00 mm at all three seeds.**

**CONCLUSION: NO DETERMINISM FINDING; the world-hash gate is untouched.** The seed reaches the physics only through a drawn driver field, by design; the run is reproducible from the same seed. The lead is DOWNGRADED to what the maintainer predicted in kind: a **tolerance edge on a scene that varies by construction** (the mechanism is the standing wreck's lateral placement, not the road). **[SUPERSEDED, the next section: this was first filed as a modelling oddity with an option to zero the wreck's weave. The maintainer ruled it a DEFECT and ruled the zeroing out: it would fix one scene and leave the class in place.]** A car at rest, here a constructed wreck, carries its driver's weave offset. The 10 mm tolerance is unchanged. The check's message and comment now state the mechanism.

### A DEFECT, NOT A MODELLING ODDITY: A DYNAMIC TERM LEAKING INTO STATIC GEOMETRY (the maintainer, 11 November; RECORDED, NOT IMPLEMENTED)

**The defect `[D: read from traffic.js:624 and crossing.js:3165, not run]`.** `weaveAt(me, s) = weave * sin(((s + weavePhase) / 55) * 2 * pi)`: a function of the distance along the road, the driver's drawn amplitude and a phase, **with no speed term at all**. A car that is not moving wears the value of that wave at the `s` where it stopped. `weave` is an oscillation belonging to a car in motion, applied to a car that is not.

**The class it belongs to, and why zeroing would be the wrong fix.** One quantity used where it has no meaning: the quadrature metric (a sideways step diluted by forward travel), the two stepping paths (a flag read in one and not the other), and now a spatial wave applied at rest. **Zeroing the wreck's weave would fix this scene and leave the class in place, which is the move this project has caught itself making three times in one day.** (An earlier paragraph offered exactly that; it is struck.)

**The real model is more interesting than zero.** A stationary car genuinely should sit off-centre sometimes: badly parked cars exist, and a tidy driver and a careless one would not leave a vehicle in the same place. **So the lateral offset at rest is not wrong; its provenance is. Today the offset belongs to WHERE ALONG THE ROAD THE CAR HAPPENED TO STOP, which is not a fact about the driver at all** (the point that makes the parked offset the right replacement: a parked offset would be one). **THE FIX, AS TWO SEPARATE CHANGES, NOT ONE SUBTRACTION:** (1) **a PARKED OFFSET**, drawn once and belonging to how the driver left the car; (2) **`weave` going to zero as speed goes to zero**, because weaving is something a moving car does. The same thing visible on screen, the correct cause underneath, and a dynamic term no longer leaking into static geometry. `[D]` One design point for whoever builds it: because the weave is a function of `s`, scaling it by speed makes a braking car's lateral position change as it slows; the transition into the parked offset has to be continuous, a settle and not a jump. **And the settle needs a destination (the maintainer): a car that brakes to a stop should end at its parked offset, so the parked offset has to be drawn BEFORE the stop and not at it.**

**NOT IMPLEMENTED, AND WHY.** It moves the lateral position of every stationary car, so it reaches the lane-occupancy and real-position work and needs its own gate. **It goes on the behaviour list for after the exposure pass.**

**THE STAKES ARE ABOVE 7.7 cm `[M]`.** The 7.7 cm was three seeds of one scene. Measured across **540 drivers (three worlds of 180, the city map): weave amplitude median 5.9 cm, p90 31.2 cm, p99 37.5 cm, max 38.1 cm**, against a cap of `weaveRoom(3.6)` = 0.45 m. A car at rest sits anywhere within plus or minus its amplitude of its lane's line: **for the weak-steering tail, up to about 38 cm, half the lateral room a car has in its lane, and visible on screen.**

**THE CONSEQUENCES, in the order that matters (the maintainer's ordering, 11 November).**
1. **THE MARKING SHEET, FIRST, because it is the thing being shipped `[D: read]`.** `marking.js` reads `strayOf` against `OFF_LINE` as lane-keeping; `strayOf` is the weave. **A standing car's frozen offset is read as lane-keeping**: position attributed from a sampled oscillation on a vehicle that is not moving, in a game whose entire subject is being judged on where you put your car. This is a correctness problem in the product and not a cosmetic one.
2. **Contact and overlap** (`touching`, `overlapping`): they test the weave-inclusive body, so a standing car's bodily extent is displaced by up to its amplitude.
3. **`locate.js` applied to a traffic car's pose,** and the **draw**: both read `poseOf`, which includes `strayOf`.
**The boundary of the maintainer's lane-occupancy concern, marked, not inherited wholesale `[D: read]`:** `occupancy.js`'s `inLaneOf` is by route identity and the point where two paths part and never reads a pose, so the weave does NOT flip that judgement (the maintainer's first statement of the concern overstated this and he took the correction). What is open: whether any pose-reader's judgement flips at the margin (not measured), and whether parked cars (`parking.js` slots) use the weave (not checked). **The millimetres were found in a tolerance check; the consequences live elsewhere entirely.**

**THE PREDICTION THAT A STANDING QUEUE SHOULD SHOW A SNAKE, TESTED AND FALSIFIED `[M]`.** The maintainer's reasoning: `weaveAt` is a sine in `s` with a wavelength of 55 m and an amplitude up to 38 cm, a queue is cars at closely spaced `s`, so their frozen offsets should trace the wave: a smooth lateral S-curve, neighbours strongly correlated, visible on screen as a whole queue leaning together. **MEASURED** in the congestion lead's own scene (the section-5 crossroads, seeds 4 to 7, 60 s in, no player; six standing queues of 8 to 17 cars at rest on one approach lane, mean gap 6.4 m, spread 70 to 102 m, offsets in one queue ranging -0.28 to +0.34 m): **the pooled lag-1 correlation of neighbours' offsets is -0.14, against a null (every driver's phase redrawn uniformly, 4,000 draws, same positions and amplitudes) of -0.25 to +0.07 at the 5th to 95th percentile: the observed value sits at the 32nd percentile, indistinguishable from chance. There is no snake.** The pooled correlation of the offsets with a single shared wave is -0.35, at the 5th percentile of its null and the OPPOSITE sign to the prediction; from six queues each dominated by a few large-amplitude drivers it is not read as a finding. **WHY, `[D: read]` and confirmed by the shape of the data:** `weavePhase` is `r() * WEAVE_OVER`, an independent uniform draw per driver (traffic.js:441), and the amplitude varies widely (median 5.8 cm, a tail to 38 cm), so each car rides its OWN wave. A shared phase is what the prediction needs, and the code does not give one. **It is not the wavelength against the car spacing** (6.4 m against 55 m would be smooth if the phase were shared); and even the shared-phase counterfactual, with real amplitudes, correlates neighbours at only +0.25, because the amplitudes differ so much. **What the player would see is therefore scatter and not a coordinated snake: most standing cars within a few centimetres of their line, and a few, at random, visibly off it by up to a third of a metre.** The maintainer's alternative reading, "scattered, because of the wavelength relative to spacing", was the wrong reason; the right one is the independent per-driver phase.

### THE MAINTAINER'S SNAKE PREDICTION, SCORED AGAINST HIM IN THE SAME FORM AS MINE (11 November)

**PREDICTED (the maintainer, before the test):** `weaveAt` is a sine in `s` with a wavelength of 55 m and an amplitude up to 38 cm; a standing queue is cars at closely spaced `s`; so their frozen offsets should trace the wave: a smooth lateral S-curve, neighbours strongly correlated, visible on screen as a whole queue leaning together. **His stated fallback, offered in advance: if the offsets were scattered instead, "the wavelength relative to car spacing is the reason".**

**MEASURED `[M]`:** six standing queues of 8 to 17 cars at rest in the congestion lead's scene (mean gap 6.4 m): pooled lag-1 correlation of neighbours' offsets **-0.14**, against a null (each driver's phase redrawn uniformly, 4,000 draws, same positions and amplitudes) of -0.25 to +0.07 at the 5th to 95th percentile; the observed value sits at the 32nd percentile. The pooled correlation with a single shared wave is -0.35, at the 5th percentile of its null and of the opposite sign.

**WRONG, and so was the fallback.** **WHY:** `weavePhase` is `r() * WEAVE_OVER`, an independent uniform draw PER DRIVER (traffic.js:441), and the amplitudes differ widely (median 5.8 cm, a tail to 38 cm), so each car rides its own wave and there is no shared phase for a queue to trace. The fallback explanation, the wavelength against the car spacing, was not the reason either: 6.4 m cars against a 55 m wave would be smooth if the phase were shared, and even the shared-phase counterfactual with the real amplitudes correlates neighbours at only +0.25. **SCORED: a miss, on the prediction and on its fallback, recorded as the maintainer asked.**

**WHAT FOLLOWS, the maintainer's reading, not measured:** scatter, with a few cars a third of a metre off their line, looks like ordinary bad parking, so the visible cost is low, which is a second reason (after Jay's call) that the weave defect sits on the behaviour list and not at the top of it. **The qualification that stays with it: a low VISIBLE cost does not touch the marking sheet, which reads a standing car's frozen offset as lane-keeping (the first consequence recorded above); that is a correctness question and not a visibility one.**

### `verify-generate`: THE MULTIPLE REPLACED BY AN ABSOLUTE BAR, SETTLED BY THE MAINTAINER AND MEASURED (11 November)

**The line:** "people from the rolling-stop west choose to roll their stops", which demanded `rolls(W) > 2 * rolls(W0)` and failed Codex's two shifted seeds at 1.86x and 1.71x. **Settled (the maintainer): an absolute increase, at least +12 percentage points in every arm.** **WHY A MULTIPLE WAS THE WRONG SHAPE, now written in the check so nobody restores it:** for a proportion with a base rate near 20%, 2x on a 24% control demands 48%, nearly half of all drivers, which the design never intended and no character should produce; and a multiple is hostage to the control's own rate (the same absolute effect passes at a 12% control and fails at 21%), so it measured the base rate as much as the character. **THE BAR, from the sample, not a preference `[D]`:** with about 100 people in each group at a rate near 25% the standard error of a difference of two proportions is about 6 points, so +12 is about two standard errors, and a character that does nothing fails it about 98 times in 100. The sample floor (20 each, the check's own) is its own line.

**MEASURED `[M]`, through the seed-shift hook (evidence: seeds shifted 1 to 12 and 1 to 30):** native **38% of 103 against 17% of 103: +20 points** (2.17x); **+11: 39% of 105 against 21% of 105: +18 points** (1.86x); **+29: 41% of 102 against 24% of 102: +18 points** (1.75x; Codex's rounded figures read 1.71x and +17). All three clear the bar by 6 to 8 points; the first two multiples are exactly why the old bar failed them. **A CHARACTER THAT DOES NOTHING FAILS IT `[M]`:** with the rolling-stops pull weight set to 1 (no pull) in the real code, the line reads "17% against 17%: **+0 points**" and fails, beside the older guard ("rolling-stops 27% (ordinary 27%)"), so the bar bites. "Both arms" was read as the check's own seed plus Codex's two.

### JAY'S OBSERVATION, THE HYPOTHESIS IT SUGGESTED FOR THE STARVATION LEAD, AND THE TEST AGAINST DATA ALREADY HELD (11 November)

**THE OBSERVATION (Jay, relayed by the maintainer; not tested here).** Pulling into the parked-car section of the road, cars in the lane to his left would not pass him: they treated him as a blocking obstacle although he judged there was room to get by. His reading, which the maintainer thinks is right: **drivers make no irregular steering; they go straight down a lane or change lanes entirely; there is no behaviour for easing past something that partially intrudes.** `[D]` The one lateral-room behaviour found in the code is `passing.js`, which goes round a **bus standing at a curb stop** on any centre line but a solid one; nothing like it for a car, a parked car or the player.

**THE HYPOTHESIS (the maintainer):** that is the cause of the intersection starvation: one awkwardly placed vehicle (parked, stopped, straddling, or stationary with a weave offset) becomes a permanent wall, a queue behind it never clears, the through road dribbles 0 to 5 cars per 10 s and the minor legs starve. **THE TEST, on the six queues already held (the section-5 crossroads, seeds 4 to 7, 60 s in, no player; 8 to 17 cars at rest per lane): what is at the head of each, what holds it, and could it pass the blocker with a small lateral movement?**

**RESULT `[M]`: AS STATED, THE HYPOTHESIS IS DEAD FOR THIS SCENE, AND THE TEST FOUND SOMETHING ELSE.**
- **Every one of the six heads is a TURNER stopped at its own line:** lane 0's heads are left-turners (`W#0/N`), lane 1's are right-turners (`W#1/S`); `stoppedAt` true, `going` false, 1.8 to 2.0 m short of the line, lateral offsets 0 to 8 cm. **Nothing is standing in the box or within 15 m past it, on any path, in any of the six: no partial obstruction exists anywhere in these queues.** The cars behind are in standing queues behind rule-held heads, not easing past anything.
- **WHAT HOLDS THE HEADS, `blockedBy` against every actor at the node.** The LEFT heads are held by MOVING ONCOMING cars, among them cars 93, 120 and 135 m from their own lines at 8.9, 11.9 and 12.8 m/s (about 10 s away): a left turn yields to the oncoming stream, with the oncoming cars' claims reaching roughly ten seconds ahead (observed; the constant was not traced). **The RIGHT heads (queues 2, 4 and 6, all three seeds) are held by the STATIONARY left head of their own approach, in the neighbouring lane.**
- **THAT HOLD HAS NO GEOMETRY BEHIND IT.** The two same-approach turn paths diverge from the line: centres 3.60 m apart at the line, 4.10 m at 1.7 m past it, 9.19 m at 6 m; edge to edge never closer than 1.8 m. **Yet `conflictOf` flags a conflict between them at about 1.7 m past the line** (a = 392.55, b = 392.15). **In the real state at 60 s, `blockedBy(right head, left head)` is TRUE and the reverse is false; with the left head REMOVED, the right head is held by NOBODY.** A stationary car waiting for a gap in oncoming traffic is the ONLY thing holding a car in the adjacent lane whose path never comes within 3.6 m of it: **a phantom hold, `[M]` in three of three seeds and confirmed by removal.** `[D: read from crossing.js blockedBy]` the proximate rule is "BOTH STANDING AT OUR LINES, AND NO LIGHT: whoever gets there first is whoever STOPPED first", ordered as an all-way stop is, applied to two cars that have each stopped on an uncontrolled through road once `conflictOf` says their paths conflict. The same comment records an earlier deadlock of the same family ("both major approaches headed by a left-turner, 35 cars queued behind each, four cars through in five minutes").
- **A RETRACTION INSIDE THE TEST:** my first isolated reconstruction of that hold (both cars standing, nobody else) came out BACKWARDS (it held the left car, where the real state holds the right), so it was not the real state and nothing is read from it; the real-state measurement above replaced it.

**WHAT THIS DOES AND DOES NOT CLOSE.** `[D]` The approach clears at the rate of the left-turn gaps through oncoming traffic (the right lane waits on the left head, the left head waits on a roughly ten-second claim), which is consistent with a through road discharging 0 to 5 cars per 10 s. **NOT established: that these two mechanisms are the whole of the starvation of the minor legs.** The counterfactual that would say so (the phantom hold exempted, the scene re-measured) was taken afterwards: see "THE COUNTERFACTUAL, RUN, AND SCORED" below; it splits the lead. **The lead has MOVED from "a flow problem of unknown cause" to "a phantom hold between same-approach lanes, plus a long oncoming claim on left turns"; it is not a lateral-repertoire problem here.** Jay's observation stands as its own defect in a different scene (a vehicle partially intruding into a live lane), recorded below.

**THE COUNTERFACTUAL, PREDICTED BEFORE IT IS RUN `[D]`:** in a scratch copy of the code, `conflictOf` returns no conflict between two paths that leave the same leg (the phantom, and nothing else: paths from different legs are untouched); the starvation scene (no player, seeds 4 to 7, 60 s, both counted as before: cars on W or E routes passing `clearAt`, cars on N or S routes passing it) is re-measured against the unmodified code. **PREDICTIONS:** (a) **the through road's discharge rises by 25% or more in total over the four seeds: 0.60**; (b) **the minor legs' clearances at least double: 0.50**; (c) the right-lane heads are no longer held by the left heads (read from `blockedBy`, not a prediction about flow): **0.95**. **WHAT EACH OUTCOME WOULD MEAN:** if (c) holds and (a) does not, the phantom is real but not what limits throughput, and the long oncoming claim on left turns is (the left heads would still gate both lanes only if the right lane's STRAIGHT cars also wait behind a left head, which a same-approach exemption does not change); if (a) and (b) both hold, the starvation is substantially this phantom and a real fix has been found; if neither, the lead is elsewhere. **Not a fix being proposed: a counterfactual in a scratch copy, to learn what the phantom costs.**

**THE COUNTERFACTUAL, RUN, AND SCORED `[M]`.** **A FIRST RUN WAS VOID AND IS NOT SCORED:** I keyed the exemption on `paths[..].from`, but in this graph there is one leg PER LANE, so the left and right paths have different `from` values (`W|end#0`, `W|end#1`) although they leave the same road end; the mutation never fired (every number identical to baseline, and prediction (c), a 0.95 call, "failed" for that reason). It was caught by checking, before believing it, that `conflictOf` still returned the hit in the mutated tree. **THE VALID RUN: the exemption keyed on the road end the legs share (`legs[from].base`), verified to return `null` for the pair in the scratch tree and unchanged in the baseline; four seeds of 60 s, no player:**

| | baseline | same-road-end conflicts exempted |
|---|---|---|
| through road, cars cleared (W and E routes) | **103** | **180 (+75%)** |
| W cars at rest at 60 s | 88 | 52 |
| minor legs, cars cleared (N and S routes) | **2** | **2** |
| overlap car-ticks, crashes | 0, 0 | 0, 0 |

**SCORED against the predictions above:** (a) through discharge up by 25% or more, 0.60: **HIT, +75%.** (b) minor legs at least double, 0.50: **MISS, unchanged at 2.** (c) the right head no longer held, 0.95: **not readable from this run** (the head measure came back null: the two heads are no longer both at rest), true by construction since `conflictOf` no longer flags the pair.

**WHAT THAT SAYS.** **The phantom same-approach hold cost the through road about 43% of its discharge in this scene (103 of the 180 it can do), and removing it showed no overlap or crash here.** That is a real finding about half of the lead. **The OTHER half is untouched: the minor legs still clear 0 to 1 car per 60 s with the through road now at 180.** A busier through road leaves the stop legs fewer gaps, so `[D]` the minor legs' starvation is most plausibly ordinary gap acceptance against a saturated major stream (candidate cause 1 above, now stronger) and not this phantom; it is NOT explained here. **THE LEAD SPLITS:** (1) the through road's discharge: substantially a phantom hold; (2) the minor legs' starvation: not explained, and not shown to be a defect; (3) lateral repertoire: not the cause in this scene.

**NOT A FIX, AND WHY IT CANNOT BE ADOPTED AS WRITTEN `[D]`.** The exemption is a blunt counterfactual: it removes EVERY conflict between paths leaving the same road end. It is safe in this scene because here no two such paths genuinely cross (lane 0 turns left and goes straight, lane 1 turns right and goes straight, and each turn curves away from the neighbour); a map whose outer lane turns left across the inner lane's straight would have a real conflict that this would delete. Only overlaps and crashes in this one scene were measured. **The defect to fix is upstream, in why `conflictOf` flags two paths that never come within 3.6 m (centres) of each other (edge to edge never under 1.8 m), a quantity computed in the path geometry and again in the conflict detector, and not in an exemption.** Not traced.

**WHY `conflictOf` FLAGS TWO PATHS 3.6 m APART, DIAGNOSED `[M]` (probe `cg.mjs`, the real `cornersOf`/`boxesOverlap` on the real paths, 0.25 m steps over 7150 pose pairs).** The expectation was a coarse test (node or leg identity, a radius, an endpoint). **It is none of those: it is the real separating-axis test on real footprints, and the cause is the SHAPE of the pad.** `conflictsBetween(a, b, pad)` is called with `pad = weaveRoom(lane)` (0.45 m, the bound on a driver's lateral weave, DECISIONS 10.68), and `cornersOf(pose, pad)` grows the box by the pad on LENGTH AND WIDTH. The weave is lateral only. A turning car is rotated, so the extra half-metre of length at its nose and tail swings sideways with the heading and reaches the neighbour lane.

| footprint | overlapping pose pairs, left turn vs right turn from the same road end |
|---|---|
| bare cars (no pad) | **0** |
| pad on the width only (what the weave is) | **0** |
| pad on length and width (as built) | **3 of 7150**, left s 392.50 to 393.50 and right s 392.00 to 393.00, 1.3 to 2.3 m past the stop line |

**THE MARGIN IS 1 cm: the first pad at which the as-built growth conflicts is 0.44 m, the pad in use is 0.45 m.** With the pad on the width only the first conflict would need 0.56 m. So the "conflict" is three samples of a rotated corner, and the real swept areas are 1.8 m or more apart edge to edge at every step. `[D]` A wider weave bound, a longer car, or a tighter turn would make it a lot of samples; today it is three, and `conflictOf` returns the pair's `{a 392.55, b 392.15}` for them, which `blockedBy` then treats as a full conflict for as long as either car waits at the line.

**THE PRINCIPLED FIX, NOT YET BUILT `[D]`:** grow the footprint by the weave on the WIDTH only (it is the quantity the pad stands for), which removes this phantom and leaves every real conflict standing, including an outer lane turning left across an inner lane's straight (there the paths cross, so no pad is needed to overlap). It changes `conflictsBetween` for every pair on every map and rebakes the conflict table, so it is its own change with its own gate, not a line in this one. The blunt same-road-end exemption stays refused.

**PREDICTIONS, WRITTEN BEFORE THE FIX AND BEFORE `verify-signs` IS RUN `[D]`:**
(a) `verify-signs`, `none.minor.length` (floor 30; 25 at +11, 3 at +29 per Codex), with the width-only pad: **crossings rise above 30 at +11 with 0.45, at +29 with 0.25** (`yieldCross` has two inbound lanes per approach, so the same-approach hold can occur; but its cars are 40 over 240 s on a collector, and whether the minor legs are starved by a saturated major stream rather than by the phantom is exactly what the previous counterfactual left open, hence the low call at +29). If it does not rise, the phantom is not what that check is short of.
(b) SECOND ORDER, the scene `cf.mjs` (through road W/E, minor N/S, 50 cars): the through road improves again (the phantom costs it about 43%, so 150 to 190 cleared over four 60 s runs, 0.7); the minor legs do NOT improve and may get WORSE (a busier through road leaves fewer gaps): **minor cleared stays at 0 to 4 (0.65), and N/S cars standing at 60 s is higher than baseline (0.6).** Counted in car-seconds waiting, not cleared cars, because cleared is 2.
(c) the fix introduces no overlap car-tick and no crash in that scene (0.85), and does not change `verify-crossing`'s conflict-table lines (0.8).
Measure both halves when it is built; a minor legs result that improves is a miss and is recorded as one.

**JAY'S OBSERVATION, AS ITS OWN ITEM (not closed by any of the above):** on the highway with his own car, drivers can only follow a lane, stop, or change lane entirely. A car partly across a line, a driver easing past it, a lateral offset used as a response: none exist. The intersection hypothesis was wrong about THIS scene; that does not make the observation wrong, and it is the missing half of real position (the switch buys little until traffic can ease past). Unscheduled.

**THE SECOND `verify-merge` SET, SCORED `[M]` (the classifier rewritten after the first set, so everything below is POST-HOC; native, +11, +29, and the DEMAND and HOLD sabotages).** Native and +11 pass (the case arose: 36/102/208 and 50/108/207 joiners reached the end of their lane, floor 20). **+29 fails its one assertion, the same one the first set showed: longest 87 s at 300 cars, 1 joiner of 204 over a minute, so the gate reads CANNOT TELL (one draw), and that waiter read alone is STARVATION (a normal driver would have found a gap for 1.3 s of its 87).** Native, +11 and +29 reproduce the first set's counts (the run is deterministic). **THE HOLD SABOTAGE READS HOLD, cleanly:** 60 of 60, 150 of 150 and 220 of 220 joiners over a minute, every longest waiter 180 s, ratio 3.00 for the whole wait. **THE DEMAND SABOTAGE DOES NOT READ DEMAND, and that is a MISS of the rewritten classifier:** its longest waiters read STARVATION, STARVATION and QUEUED BEHIND, a kappa 1 driver would have found a gap for 3.0, 2.8 and 0.3 s of 11, 26 and 27 s, nobody stood over a minute, and the long-wait assertion PASSED (its two failures are the speed and boldness lines, which that mutation does move). **So the DEMAND branch is unvalidated: it fires only at +29, 150 cars, a CANNOT TELL waiter (6.8 s), and no sabotage makes it fire. Until one does, a "DEMAND" reading means nothing and the check reports HOLD and STARVATION only in practice.** `[D]` The likelier reason the mutation cannot produce it is that demand scaling `leadNeed`/`lagNeed` acts on a driver who is held for a short wait, not 60 s, in this scene; a sabotage that makes the joiners demand more than any gap can offer would. Not built.

**JAY, ON THE EXPRESSWAY: "A GOOD AMOUNT OF CARS STOPPED AT THE TERMINATION POINT OF THE ACCELERATION LANE" (11 November). PREDICTIONS, WRITTEN BEFORE THE MEASUREMENT `[D]`** (`tools/measure/lane-end.mjs`: per joiner, over the loop map at 60/150/300 cars, seeds 1 to 3, 180 s after a 60 s warm-up).
Q1, IS THE MERGE MEDIATED BY `conflictOf`? From reading: **no** (`mergePlan`, `exitNeighbours` and `clearBetween` carry the join; `lanechange.js` and `map/accel.js` never read `layout.conflicts`). The one way it could still reach a joiner is `whatStops`/`blockedBy` at the node where the slip road meets the expressway. **Prediction 0.8: the same-road-end exemption leaves the count of joiners reaching the lane end at rest unchanged (within the seed-to-seed spread).** A change is the loud result and is reported as one.
Q2, WHY `verify-merge` DID NOT SEE IT: `longest` is a maximum over continuous `v < 0.5` stands. **Prediction 0.75: the joiners at or near rest at the lane end are a large share at 300 cars (20 to 40%, NOT independent of what I know: the first set had 62 of 208 standing at all at 300 cars) and a small share at 150 (under 10%) and 60 (under 5%), with a median stand of about 11 s, so `longest` and the share never disagree about the sim, they measure different things.** If the share is large at 150 cars too, the check is also wrong about merging being fine.
Q3, ANTICIPATION OR REACTION: for the joiners that end at rest, when did a merge plan first exist (`mergePlan` non-null), as a share of the lane run, and what had they been doing since. **Prediction 0.6: most of them (over half) have had a merge plan for over half of the lane and found no gap at their own demand (offered/needed under 1): starvation in a dense stream, not seeking late.** The told-too-late reading predicts the opposite (first plan within the last 30 m), and I give it 0.25. **Timid joiners (kappa 1.2 or more) over-represented among the stalled, 0.75.**

**JAY'S RULING ON MERGE REALISM (11 November, verbatim):** *"waiting a full minute at the end of the merge lane is crazy, something you'd see 1 in 10000 merges I'd say and only from an extremely inept driver. merging tends to be ugly and drivers are braking and making space before it comes to a car standing still attempting to merge."*
**HALF ONE, THE BAR.** `verify-merge`'s ceiling of a minute was chosen by us and never compared with a real number; Jay puts a minute at about 1 in 10,000 merges and only from an inept driver. **The bars derived from it are `[D: from Jay's ruling]`, not measured and not his numbers:** a joiner waiting a full minute is ABSENT from the sample (not under a ceiling), and a joiner reaching the end of the lane at or near rest is the inept tail only, under 1% of joiners (the 1% is the maintainer's agent's reading of "1 in 10000, extremely inept", wider than his number because a sample of a few hundred cannot resolve one in ten thousand). The check reports the DISTRIBUTION of waits and the share at rest, not the maximum. If the measurements say the derivation is wrong, that is said, not fitted.
**HALF TWO, THE MECHANISM: "drivers are braking and making space BEFORE it comes to a car standing still."** The mainline driver CREATES the gap. Primary hypothesis, ahead of joiner timidity and the demand categories. **FROM READING, ahead of the measurement, the claim "nobody gives one" is too strong, and is the thing to test rather than assume:** `courtesy.js` already has a mainline driver ask-and-offer for joiners (21 October), but it is narrow: offered by ONE driver (the nearest behind the joiner), only if compliant and not bold, only once the signal has been noticed, only at that driver's comfortable braking, withdrawn after 4 s and not offered to that joiner again, and a joiner asks only when `mergePlan` says it is ready to go (past matching speed), not while it approaches. Jay's account is anticipation, braking and space-making as the joiner comes up the lane, which is the earlier and broader act. **THE CONNECTION FOR THE RECORD:** Jay has already ruled on courtesy braking (scanning, anticipating, the lead car's obligation, signalling), and a merge is that ruling's most common real-world instance; so this is an unimplemented consequence of an existing decision, partly built, rather than a new feature.

**THE LANE-END MEASUREMENT, SCORED `[M]` (`tools/measure/lane-end.mjs`, loop map, seeds 1 to 3, 180 s after a 60 s warm-up, per joiner).**
**Q1, THE RAMP AND `conflictOf`: HIT (0.8). The merge does not use it and the same-road-end exemption changes nothing: joiners at or near rest at the lane end are identical per seed with and without it (0 of 116 at 60 cars, 13 of 315 at 150, 126 of 628 at 300).** The phantom hold is a city-intersection defect and does not reach the highway.
**THE SHARE JAY SEES `[M]`, at or near rest (under 2 m/s within 20 m of the taper) at the lane end:** 0 of 116 at 60 cars; 13 of 315 (4%) at 150; 126 of 628 (20%; seeds 25%, 19%, 17%) at 300. **Against the derived bar of under 1%, 150 and 300 cars fail.** Q2 (the share is large and `longest` does not see it): HIT in kind, the 300-car range (20 to 40%) only just (20%); 150 under 10% and 60 under 5%: hit. **`verify-merge`'s old bar passed because the longest CONTINUOUS stand at 300 cars is 30 s, but the TOTAL time at rest of one joiner reaches 83 s (9 joiners over a minute in total at 300 cars): a car that creeps resets a continuous stand.** That is the check's quantity not being Jay's, and a car that stops and creeps at the end is what he sees.
**Q3, WHEN SEEKING STARTS: told-too-late REJECTED (0.25 was right to be low); starvation-in-a-dense-stream consistent (0.6, HIT).** For the stalled joiners the first merge plan appears 40 to 50% of the way along the lane (quartiles 25 to 40%), and they then hold a plan for about 20 s of which nearly all is spent with NO gap at their own demand. Timid joiners over-represented (0.75, HIT): median kappa 1.2 to 1.7 against about 1.0, and about half of the stalled are timid against a quarter of the rest.
**PRIMARY HYPOTHESIS (Jay: the mainline CREATES the gap), SCORED, BUT THE PREDICTION FOR IT WAS NOT WRITTEN WITH NUMBERS BEFORE THE RUN, SO IT IS SCORED POST-HOC: THE CLAIM AS I PUT IT TO MYSELF, "ESSENTIALLY NEVER", IS REFUTED.** Courtesy (one mainline driver offers) is on by default, and switching it off, same seeds, with it `[M]`: at 150 cars joiners at or near rest 13 against 27, total-rest over a minute 0 against 5; at 300 cars total-rest over a minute 16 against 73 and median rest 14 s against 44 s. So mainline yielding exists and is worth a great deal. **Yet 4% and 20% still reach the end near rest, and every stalled joiner HAS been offered a gap (offered share 0.9 to 1 among the stalled, against 0.15 to 0.25 among the rest), the first offer arriving 86 to 98% of the way along the lane, i.e. at the end, and for the others about 40%.** `[D]` That is Jay's difference: the yielding that exists comes when the joiner is ready and asking, from ONE driver, at that driver's comfortable braking, withdrawn after 4 s; his drivers are "braking and making space BEFORE" the car is at rest. CAVEATS, because the stalled share is selected on the outcome (a car that stands for 20 s has 20 s in which to be offered, so the 1.0 is inflated), and the mainline braking measure (the nearest car behind braking over 1 m/s^2, 49% of joiners at 300 cars with courtesy, 30% without) is NOT attributed to the joiner: it is the whole stream's braking. NOT shown: that widening the yielding (more than one driver, earlier, not only the compliant and not bold, longer than 4 s) removes the stalled tail; that is the next experiment, not built. `verify-merge` now fails two lines by the bars derived from Jay's ruling (the at-rest share at 150 and 300 cars; the total time at rest over a minute at 300), and passes both at 60 cars; the distribution of continuous stands (median 11 s, p90 25 s, p99 30 s at 300 cars) is printed.

**WHAT THE LANE-END MEASUREMENT ESTABLISHES, IN THE TERMS IT SHOULD BE QUOTED IN `[M]`.** (1) **One-sided merging is confirmed by EXCLUSION, not by assertion:** joiners are not told too late (a merge plan 40 to 50% along the lane) and then hold that plan for about 20 s with no gap at their own demand: they look in time and there is nothing to take. (2) **A defect that appears only at the density the player uses.** 0% at 60 cars, 4 to 5% at 150, 20% at 300, and Jay drives at about 260: he is in the regime where it happens and our suite mostly measures lower ones. `verify-merge` measures 60, 150 and 300 cars, but its old pass bar was met at all three by a quantity (the longest continuous stand) that does not see it.

**THE TWO-ARM EXPERIMENT (the maintainer's addition, 11 November): MERGING "TENDS TO BE UGLY" MEANS BOTH PARTIES COMPROMISE, AND THE SIM HAS NEITHER.** Arm 1, COOPERATION: the mainline makes space (courtesy exists and is narrow). Arm 2, DEMAND DECAY: a real driver with 50 m of lane left accepts a gap they would have refused at 300 m, because the alternative is stopping; the joiner's demand should fall as the remaining lane shrinks. **READ FROM THE CODE BEFORE ASSUMING: DEMAND IS CONSTANT.** `attempt` takes `kappaOf(out)` once, `leadNeed`/`lagNeed` scale the whole following gap by it, and nothing in either depends on the lane remaining; the only thing that changes near the end is that `mergePlan` stops matching speed first (`late`) and the courtesy ask's deadline moves. The physics floor (stop behind the car ahead, let the car behind stop) is separate and stays.
**WHAT THE COURTESY GATES ARE, READ FROM `courtesy.js` `[M]`:** (a) ONE driver is asked, the nearest in the target lane behind the joiner, and if THEY are not courteous (compliance and caution both at COMPETENT_AT or better) nobody is asked, so a non-courteous nearest car shuts the offer off; (b) the joiner asks only once `mergePlan` is non-null; (c) a withdrawn offer (4 s after the gap opens, or 4 s plus its own planning time) is not made again for as long as that ask stands; (d) the easing is at the offerer's comfortable braking, never harder. **THE WIDENING USED FOR THE EXPERIMENT (a counterfactual in a scratch tree, not a change to the repository): W1, the nearest COURTEOUS driver behind is asked, and W2, a withdrawn offer does not bar a new one.** The DECAY used: effective demand `kappa * f`, `f` falling linearly from 1 to the clamp floor over a ramp of metres ending where the joiner must begin stopping (`laneEndRoom`); the ramp length is a flagged constant, so it is run at two values, not tuned. The decayed demand is the one the offerer opens a gap for too (one definition, as courtesy.js already does for `lagNeed`).
**PREDICTIONS, WRITTEN BEFORE ANY ARM IS RUN `[D]`, near-rest share of joiners at 300 cars (as built, 20%) and 150 (as built, 4%), three seeds each.**
The maintainer's: cooperation alone cuts the 20% substantially but not below the 1% bar; decay alone cuts it less; both together clear 1%. If cooperation alone clears 1%, the decay does not matter and that is said.
Mine, with numbers, and DIFFERENT from the maintainer's on one point: B (cooperation alone) 20% to 8 to 14% (0.55) and stays above 1% (0.85). C (decay alone): **the first set measured that a BOLD driver (kappa 0.3) would have found a gap for 5 to 27 s of the longest waiters' waits, which says decay is at least as strong as cooperation: C cuts at least as much as B (0.5), to 6 to 12% (0.45), and clears 1% (0.1).** D (both) below 1% at 300 cars (0.3), at 150 cars (0.6). INTERACTION: sub-additive, D's reduction less than B's plus C's, because both act on the same stalled joiners (0.7). DIAGNOSTIC: the nearest car behind a planning joiner is courteous on under 60% of plan ticks (0.6), so rule (a) shuts the offer off often. SAFETY: zero overlapping car-ticks and zero crashes in every arm (0.9); decay is bounded by the same physics floor.
**WHAT WOULD SAY THE MAINTAINER IS RIGHT ABOUT TWO MECHANISMS: B and C each cut part of the 20%, D cuts more than either, and neither alone clears 1%. WHAT WOULD SAY I AM RIGHT THAT DECAY CARRIES MORE: C cuts at least as much as B.** Resolution: 628 joiners at 300 cars over three seeds, so 1% is about 6 joiners and a difference under about 5 points is inside the seed spread (19%, 17%, 25% as built).

**A REVERSAL, MINE: "TOLD TOO LATE" WAS REJECTED ON A STANDARD I SET AND IT WAS WRONG (11 November).** Jay: *"wrong about the reasonable timing of that observation, a driver would be scanning as they approach the lane, even before they actually touch the acceleration lane."* **`[Jay]` is the ground truth.** I called a merge plan 40 to 50% of the way along the lane "not late" and measured against that framing; by his account it is late by the whole approach plus half the lane, and the verdict ("told-too-late REJECTED, 0.25 was right to be low") is withdrawn. Two further corrections to my own reading: (1) **what I measured was not when scanning begins.** `mergePlan` is non-null only once the joiner has matched speed (`out.v >= MATCH * flow` for a driver who knows the lane), so "first plan at 40 to 50%" is largely the joiner finishing its acceleration; the sim's real scanning (`gapTarget`) begins at lane entry plus the driver's registration lag and NEVER on the approach, because the join is only handled once `s > clearAt + EXIT_FROM` (`exitStep`). That is Jay's complaint in the code, whatever the 40% measured. (2) **The earlier "starvation consistent, HIT (0.6)" is withdrawn with it:** a joiner that begins late and finds no gap at the end has not shown a stream with no gap, only that none remained at the time it looked. My original prediction (two arms) stands as recorded and is scored as made; its shape is probably wrong, since it had no arm for this.
**THREE MECHANISMS, NOT TWO, AND THEY COMPOUND:** (1) the mainline never makes space (primary; courtesy exists and is narrow); (2) the joiner's demand never decays as the lane runs out, **`[Jay]` *"as space runs out each driver compromises more and more"*** (confirmed from the code: demand is constant); (3) the joiner starts scanning far too late: **merging is SOLVED ON THE APPROACH**, a driver adjusts speed to arrive ALONGSIDE a gap instead of hunting for one in a lane that is running out, which is why real merges work at densities where ours fail. They are not additive: early positioning CREATES the gap that decay would otherwise have to accept.
**THE THIRD ARM (scratch tree, a counterfactual, not a repository change): E, SCANNING ON THE APPROACH.** The joiner runs `gapTarget` (the speed that arrives level with the best reachable gap) from `SCAN` metres before the lane begins, on the same draw (`anticipates`) as today, with no registration-lag wait, its position along the lane the lane start's along-coordinate less the distance left to it (an approximation on a slip road that bends; flagged). `SCAN` is `[invented]`, run at two values. **The experiment is now the full 2x2x2: courtesy widened (B), demand decay (C), scanning on the approach (E), every combination, 300 and 150 cars, three seeds.**
**PREDICTIONS FOR THE THIRD ARM AND THE INTERACTIONS, WRITTEN BEFORE THEY ARE RUN `[D]`** (near-rest share at 300 cars, as built 20%; the earlier B, C, D predictions stand as made): E alone 20% to 10 to 17% (0.5): positioning can pick a hole and cannot make one in a stream with a median headway of 1.2 s at 300 cars, so it is the weakest of the three alone (0.4 that E cuts less than both B and C). All three together (H) under 1% at 300 cars (0.35) and at 150 cars (0.7). INTERACTIONS, each pair as the difference between the combined cut and the sum of the two single cuts: **E with C SUPER-additive (0.5; the maintainer's mechanism: positioning creates the gap that decay would otherwise have to accept)**, B with C sub-additive (0.7, as already recorded), E with B sub-additive (0.6; both widen the same supply of gaps). What would say the maintainer is right that the three compound: H clears a bar the best pair does not, with E+C beating E and C summed.

**THE STANDING RULE THIS PRODUCES (the maintainer, 11 November), WRITTEN INTO CLAUDE.md ITEM 3 BESIDE THE MEASURED-OR-DERIVED RULE: ANY THRESHOLD THAT ENCODES WHAT A REAL DRIVER DOES IS MARKED `[Jay]` WITH HIS WORDS, OR `[invented]`. NO THIRD OPTION.** `[invented]` is a flag for the next time he can rule, not a failure. It does not cover sample floors and instrument parameters (`[instrument]`: they claim nothing about drivers) nor physical invariants (no overlap, no crash). The same defect as the instruments and the record, one level up: a number with nothing behind it carrying the authority of the place it is written.
**THE FIRST AUDIT, `verify-merge.mjs`, `tools/measure/lane-end.mjs` AND THE MERGE PATH'S CONSTANTS (marked in the files too; the sim's own constants are listed here and not edited):**

| threshold | mark |
|---|---|
| a joiner waiting a full minute is absent (`over === 0`) | **`[Jay]`** *"waiting a full minute at the end of the merge lane is crazy, something you'd see 1 in 10000 merges I'd say and only from an extremely inept driver"*. That the TOTAL time at rest counts, and not only a continuous stand: `[invented]` |
| at or near rest at the lane end under 1% of joiners | **`[invented]`**: his ruling gives no share; 1% is an agent's reading of "1 in 10000, extremely inept", widened for a sample of a few hundred |
| "near rest" = under 2 m/s within 20 m of the taper's start; "reached the end" = within 15 m; "standing" = under 0.5 m/s | `[invented]` (definitions) |
| the PLAYER is never stranded: a takeable gap within 60 s (`t <= 60`) | **`[invented]`**: the file says "the minute is this check's statement of a reasonable time". It is the same number Jay calls absurd for a car; flagged for his ruling on the player |
| a driver who knows the lane joins at least 10 km/h faster | `[invented]` ("a margin a person would see") |
| bold is caution under 0.8, timid over 1.2 | `[invented]` (class boundaries) |
| courtesy is what gives it: waits of 20 s or more, total with courtesy at most 0.7 of without | `[invented]` |
| `diagnose`: HOLD at 5 s, DEMAND at a kappa-1 driver for 5 s, ratio bands 0.5 and 1, jam under 2 m/s, QUEUED BEHIND over 50%, the "over 2 joiners" gate, the 20 s and 60 s print lines; "normal" is kappa 1 and "bold" kappa 0.3 | `[invented]` (instrument categories; none is a standard a driver would recognise) |
| probe: "braked" over 1 m/s^2, "lifted" under 0.9 of the desired speed, nearest car behind within 80 m, no-gap when offered/needed under 1 (at the sim's own kappa, itself `[invented]`) | `[invented]` |
| floors: 20 joiners, 12 trials, 4 tail waits, 20 merges, 5 and 10 counts | `[instrument]` |
| no overlap, no crash, nobody past the taper's start | physical invariant, outside the rule |
| `MATCH` 0.9 (match the traffic's speed before looking for a gap); `GAP_LOOK` 150 m; `EXIT_FROM` 10 m; `BESIDE_TURN` 5 degrees, `BESIDE_SEP` 0.6 m; `GENTLE` 0.5; the demand clamp 0.3 to 1.7 and "a bold driver takes a third"; `laneEndRoom`'s 10 m | `[invented]` (the code calls most "flagged design constants", which is this mark by another name) |
| `COURTESY_FOR` 4.0 s = `UNDUE_AT` 4.0 s, "the undue-delay standard" | **unverified**: the code attributes it to a standard I have not traced to a ruling; it may be `[Jay]` |
| the join is solved only after the lane begins; demand is constant over the lane; one driver is asked and a withdrawn offer is not repeated | structure, not a threshold, and **CONTRADICTED by `[Jay]`** (the quotes above) |
| the keep-right exceptions, the 28 October "a car that cannot move until you do is not one you cut off" | `[Jay]` per the code's own comments; words not re-checked here |
| the courtesy ruling on scanning, anticipating, the lead car's obligation, poor signalling | `[Jay]`; words not in front of me, so not quoted |

**THE COUNT: of the thresholds in the check and the probe that say something about a driver, ONE is `[Jay]` (a minute), the rest are `[invented]`, and the player's minute is `[invented]` and sits in the same file as Jay's.** More than two, as expected.

**A PROCESS RULING FROM JAY (11 November, verbatim):** *"we do a lot of checking, and if this checking is against a nonsensical standard we are just wasting time, when in doubt seek clarification on if a result even makes sense. I should have caught the issue with the drivers waiting up to a minute a long time ago, and it's fix is a substantial change we should have been way ahead of."*
**MY CORRECTION OF ITS LAST PART, FOR THE RECORD: HE COULD NOT HAVE CAUGHT IT, BECAUSE HE NEVER SAW THE NUMBER.** I have been relaying pass and fail, and pass and fail hide the quantity. A line reading "cars wait up to 56 seconds to merge and we call that a pass" would have been stopped on sight. That is the agent's reporting failure and not his inattention; the record does not accept the self-blame. (The same shape as everything else that day: a number with nothing behind it carrying the authority of the place it was written, here the place being the word "ok".)
**EFFORT ALLOCATION, WHICH THIS SHOULD CHANGE `[M]` as relayed, not recounted by me:** Jay found three real defects in an evening of driving; our checks found one all day, and that one surfaced while testing a hypothesis that turned out to be wrong (the phantom same-approach hold, found while chasing the starvation lead, and not the cause of what he saw on the highway). I read his three as the pile-up at the end of the acceleration lane, the sixty-second standard, and the timing of the scan; if the count means something else, this is the line to correct. The checks are still worth having, because they are how the fixes will be known to hold, but as instruments of DISCOVERY a person driving the game has beaten them, and the digest below is how we stop wasting that.
**THE STANDING DELIVERABLE: A BEHAVIOUR DIGEST, FOR JAY, NOT FOR US (designed here, NOT BUILT: the three merge arms come first).** Not pass or fail, not check names: the quantities a driver recognises, in the units a driver thinks in, at the density he plays (about 260 on the loop; the city map's density is a number to ask him), so he can say "that is wrong" the way he just did three times in an evening. One page he will read, not a report he skims: a quantity that needs a paragraph to be judged is the wrong quantity for it. Each line is `quantity in plain words | value | [M] or [D] | the bar beside it, with [Jay] or [invented], or "no bar"`. The bar column is how he finds the next invented standard without us noticing it first. Built from measurements already taken wherever possible, as a by-product, as `tools/digest.mjs` printing one page (an artifact later, if he wants it on his phone).
**CANDIDATE QUANTITIES (the maintainer's list, with what measures each today, so the build is mostly assembly; "exists" means a measurement exists, not that it is in driver units yet):** joiners that wait to merge and how many stop dead (`lane-end.mjs`, exists); following distance (`encounters.js` counts following and followed gaps, exists, units to check); how often a driver is cut off (merge and lane-change counts exist, `verify-mergecount`; cut-off itself needs a probe); time at stop signs and at lights (undue-delay machinery exists in `crossing.js`; a distribution does not); how often anyone is overtaken (a probe); the closest pass of the night (the smallest gap at a pass: a probe); crashes and near-misses, and of what kind (`w.crashes` exists, near-misses are encroachment bands from the old engine and not yet in the sim).
**THE PROBES WRITTEN SO FAR, EACH ASKED WHETHER ITS NUMBER BELONGS IN THE DIGEST (the standing question, answered here):**

| probe number | in the digest? | why |
|---|---|---|
| share and count of joiners at or near rest at the end of the lane, per minute | **YES**: "of N joiners, X stopped at the end of the lane" | what Jay saw; a count in his units. Bar: under 1%, `[invented]` |
| distribution of waits at the lane end: median, p90, longest, and how many over a minute | **YES** | the quantity `longest` hid. Bar: a minute absent, **`[Jay]`** |
| speed at which a joiner enters the traffic, against the traffic's | **YES** (to build: the join speed is in `verify-merge` as `v` and `flow`) | a driver knows "she merged at 40 into 100". Bar: 10 km/h faster for one who knows the lane, `[invented]` |
| the player's wait at the lane end | **YES** | the player's own experience. Bar: a minute, `[invented]` and flagged as contradicting Jay's |
| **PRIORITY: of the merges onto a motorway, how many make the driver behind brake hard** (the car behind braking over 3 m/s^2 in the four seconds after, 19% in one smoke run of the build as it is) | **YES, TOP OF THE LIST** | one merge in five is either realistic or badly wrong and nobody has asked him. Bar: **a `[Jay]` bar we do not have; asked 11 November.** The 3 m/s^2 and the 3 to 8% I first wrote are `[invented]` |
| share of joiners let in (a mainline car eased off) | **YES**, if attributed to the joiner | "how often does anyone let you in" is a driver's question; the current figure (offered share) is selected on the outcome and the braking figure is the whole stream's, so NOT YET |
| crashes in the run, and of what kind | **YES** | the first thing he would look for. No bar needed beyond "none" if the standing rule says so, which is Jay's to say |
| first merge plan as a share of the lane; offered over needed ratio; kappa; no-gap seconds; the nearest car behind courteous | **NO** | internal, and each needs a paragraph to be judged. The first was also the wrong quantity (it measured finishing acceleration), which is how a number of this kind misleads |
| mainline braking over 1 m/s^2 near a joiner | **NO** until attributed | confounded with the stream's own braking |

**ONE OPEN QUESTION FOR JAY, NOT FOR US TO DECIDE:** the density of the city map when he drives it, and whether he wants the digest as a printed page or on his phone.

**THE FIRST FOUR ARMS, SCORED `[M]` (scratch trees; 150 and 300 cars; seeds 1 to 3; joiners at or near rest at the lane end).** **NEUTRALITY: arm A in the scratch tree reproduces the as-built counts exactly (5/4/4 of 315 at 150 cars, 51/40/35 of 628 at 300), so the arms are comparable.**

| arm | 150 cars | 300 cars | joiners with 60 s or more TOTAL at rest, 300 cars | overlaps, crashes |
|---|---|---|---|---|
| A as built | 13 of 315 (4.1%) | 126 of 628 (20.1%; 51/40/35) | 16 | 0, 0 |
| B courtesy widened (W1, W2) | 4 of 314 (1.3%) | 104 of 627 (16.6%; 31/43/30) | **43** | 0, 0 |
| C demand decays over a 150 m ramp | 1 of 311 (0.3%) | **4 of 604 (0.7%; 3/1/0)** | 0 | 0, 0 |
| D both | 0 of 311 (0.0%) | 3 of 603 (0.5%; 3/0/0) | 0 | 0, 0 |
| C, ramp 60 m / 150 m / 300 m | | 0.5% / 0.7% / 0.0% | 0 / 0 / 0 | 0, 0 |

**WHAT IT SAYS. DEMAND DECAY ALONE REMOVES THE PILE-UP AT THE END OF THE LANE, AND WIDENING THE EXISTING COURTESY ALONE BARELY MOVES IT.** The ramp length makes no difference between 60 and 300 m (0.5%, 0.7%, 0.0%), so the result does not hinge on that `[invented]` constant. Both the maintainer's prediction and mine are wrong, in the same direction: **his (cooperation alone cuts the 20% substantially; decay alone cuts less) is refuted on both counts; mine (C cuts 20% to 6 to 12%, 0.45; clears 1%, 0.1) was far too weak.** SCORED AS MADE: B to 8 to 14% MISS (16.6%, a 3.5 point cut inside the as-built seed spread of 17 to 25%); B stays above 1% HIT; C cuts at least as much as B HIT; D at 150 cars under 1% HIT; D at 300 under 1% (0.3) HIT in the point estimate; B with C sub-additive HIT (trivially: C leaves no room); zero overlaps and zero crashes in every arm HIT; nearest car behind a joiner courteous on under 60% of plan ticks: 0.57 at 150 cars HIT, 0.69 at 300 MISS, so a non-courteous nearest car does shut the offer off on 30 to 45% of plan ticks, but fixing that (W1) is not what clears it. **RESOLUTION CAVEAT: 4 of 604 is under 1% as a point estimate, and a sample this size cannot exclude about 1.7%; C and D cannot be told apart, and neither can the three ramps.**
**TWO THINGS THAT ARE NOT GOOD NEWS, AND ONE THAT IS, BEFORE ANYONE CALLS THIS A FIX.** (1) **B made the longest tail WORSE: joiners with a minute or more of total time at rest at 300 cars rose from 16 to 43.** Not diagnosed. `[D]` Likeliest: W2 (a withdrawn offer does not bar a new one) keeps an offerer easing off in a stream that then bunches behind it, or W1 asks a courteous driver further back whose gap opens later. (2) **B is a widening of the existing courtesy, not the behaviour Jay describes** (many drivers braking and making space BEFORE the car is at rest, from the moment it is seen coming); a null for B is NOT a null for his mechanism 1, and "the mainline never makes space" stays untested in its real form. (3) The good news, a cost proxy only: **braking behind the joiners goes DOWN with decay** (the nearest car behind braking over 1 m/s^2 at 300 cars: A 48%, C 34%; offers 39% to 24%), consistent with joiners clearing the lane instead of standing in it and the stream not bunching behind them. This is NOT a measure of how TIGHT the merges are, and tight is what "ugly" is: a demand that falls to the floor accepts gaps a patient driver would refuse. **The cost of decay is not yet measured, and it is the thing Jay can judge.**
**NEXT, BEFORE ANYONE BUILDS DECAY: THE COST OF IT, in his terms: at the moment each merge begins, the time gap to the car behind in the lane being joined (the gap divided by that car's speed), and whether the car behind then brakes hard in the next four seconds. A and C, 150 and 300 cars, three seeds. These are the digest's "how close was the closest merge" and "how often was somebody cut off".** The scanning arms (E to H) are still running and are scored after.

**PREDICTIONS FOR THE COST OF DECAY, WRITTEN BEFORE THE PROBE RUNS `[D]`** (merge tightness, `tools/measure/lane-end.mjs`, arms A and C, 150 and 300 cars, three seeds; the time gap to the car behind is the clear distance over that car's speed, taken at the tick the merge begins): the median time gap to the car behind falls from A to C (0.8), the share of merges that leave the car behind under 1 s rises from A's few percent to 15 to 30% (0.5), and a car behind braking over 3 m/s^2 in the four seconds after the merge goes from 3 to 8% (A) to 8 to 20% (C) (0.5). **THE OPPOSITE OUTCOME I GIVE 0.3: C is no tighter than A**, because the stalled joiners that A produces also end up merging into whatever hole is left at the last metre, so A's merges are already tight and C's are earlier and looser. If C is no tighter, the decay is nearly free; if it is much tighter, it is a trade Jay has to rule on, and `[invented]` is the mark on whatever bar I would put beside it. All thresholds here (under 1 s, over 3 m/s^2, four seconds) are `[invented]`.

**THE MAINTAINER'S PREDICTION IS SCORED AS MADE AND LEFT SCORED: refuted on both counts (cooperation primary and decay secondary; it is the reverse by a wide margin). The agent's own miss ran the same way, and the observation worth keeping is that BOTH OF US OVER-WEIGHTED THE MECHANISM WE HAD ALREADY WRITTEN CODE FOR.** `[M]` as a pattern, one instance; recorded so that the next time a mechanism feels primary because it already exists in the code, that is the thing to distrust.
**A RULING, THE MAINTAINER'S (11 November): THE CLEARED METRIC DOES NOT END THIS, AND C IS NOT ADOPTED.** Arm C takes the pile-up from 20.1% to 0.7% and clears the bar, and it also means joiners now cram into gaps nobody made while the mainline ignores them completely. Jay did not describe drivers who lower their standards until they fit; he described MUTUAL compromise, *"drivers are braking and making space"*. **A fix that satisfies the count while leaving one side of the interaction absent is a fix to the number, not to the behaviour,** the day's lesson arriving one level up again. So the next priority is Jay's mechanism in its real form: ANTICIPATORY, not reactive. Widening the existing courtesy (B) was reactive, an offer once a joiner is in trouble; his is mainline drivers who see a joiner in the lane and adjust BEFORE it needs them, which is the anticipation-versus-reaction distinction ruled on three times in other contexts. **B IS DISCARDED, NOT DIAGNOSED:** its tail regression (16 joiners with a minute or more of total time at rest, to 43) is a reason to drop it, recorded and not solved, and it does not travel into any combined arm unexamined. `G` and `H` below were run BEFORE this ruling and contain B; they are reported, flagged, and not used as evidence for any combination.
**THE SCANNING ARMS, SCORED `[M]` (scratch tree; seeds 1 to 3):**

| arm | 150 cars | 300 cars | joiners with 60 s+ total at rest, 300 cars |
|---|---|---|---|
| A as built | 13 of 315 (4.1%) | 126 of 628 (20.1%) | 16 |
| E scanning on the approach (150 m) | 12 of 314 (3.8%) | 100 of 617 (16.2%; 38/33/29) | **1** |
| F = E + C | 1 of 312 (0.3%) | 3 of 593 (0.5%) | 0 |
| G = E + B **(contains discarded B)** | 3 of 316 (0.9%) | 42 of 567 (7.4%) | **68** |
| H = E + B + C **(contains discarded B)** | 0 of 311 | 0 of 592 | 0 |
| E, `SCAN` 60 m / 300 m | | 17.4% / 16.2% | 6 / 1 |

Zero overlaps and zero crashes in every arm. **SCANNING ON THE APPROACH ALONE DOES LITTLE TO THE SHARE (a 3.9 point cut at 300 cars, nothing at 150), BUT IT REMOVES THE LONG TAIL (16 joiners over a minute in total to 1), which no other single arm did and nobody predicted.** `SCAN` is `[invented]` and makes no difference (17.4%, 16.2%, 16.2%). SCORED AS MADE: E alone 10 to 17% (0.5) HIT at the top of the range; "E cuts less than both B and C" (0.4) MISS by a hair, since E's cut (26 joiners) is about B's (22) and far under C's (122); E with C SUPER-additive (0.5) MISS: E cuts 3.9 points, C 19.4, F 19.6, which is sub-additive because C leaves no room; E with B sub-additive (0.6) MISS: G cuts 12.7 points against 3.9 plus 3.5 singly, SUPER-additive (flagged: it contains B, and its minute-tail is 68, the B regression made worse); H under 1% at 300 (0.35) and 150 (0.7) HIT but contaminated by B. `[D]` The one thing G says that is worth following, with B discarded: positioning and space-making DO combine (a joiner that arrives level with a gap and a mainline driver who opens one), which is the maintainer's compounding claim, and it is what the anticipatory arm below tests in a form that can be kept.
**THE 19% FINDING, PULLED OUT OF THE FOOTNOTES `[M]`, arm A as built, one 100 s smoke run at 300 cars: the car behind a merge brakes over 3 m/s^2 in 19% of merges** (my prediction, 3 to 8%, was `[invented]` and is marked so). One merge in five forcing a hard brake is either realistic or badly wrong and nobody has asked Jay: he is being asked now. **A `[Jay]` BAR WE ARE MISSING; it goes at the top of the digest's candidate list as a priority item** (the quantity: "of the merges onto a motorway, how many make the driver behind brake hard", in his units, with the braking he would call hard).
**THE ANTICIPATORY ARM, P (scratch tree, a counterfactual, not a repository change; the approximations are flagged).** Four changes to the courtesy machinery, with the gates (courteous, ONE driver asked, the nearest behind, the existing `anticipates` draw) UNCHANGED so that TIMING is the one variable: (1) the joiner's ask stands from the moment it is on the lane, not from when `mergePlan` says it is ready; (2) the gap the offerer opens is sized for the speed the joiner WILL have (the lesser of its desired speed and the offerer's own), not the speed it has now, because sized for a slow joiner it would ask the stream for a hole a stopped car needs; (3) the offerer's plan closes on that projected speed; (4) the 4 s withdrawal clock does not start until the joiner is ready, or an early offer expires before it can be taken. With the existing `anticipates` draw an anticipating offerer acts from `ask.since` and a reacting one from its pressing moment, so the early ask is what makes the difference. NOT in P: the many-drivers-braking part of Jay's account (one driver is still asked), which is the next widening if this one is not enough.
**PREDICTIONS FOR P, WRITTEN BEFORE IT IS BUILT OR RUN `[D]`** (near-rest share of joiners at 300 cars, as built 20.1%; wide on purpose, given the pattern recorded above): P alone **6 to 16% (0.6)** and does NOT clear 1% (0.9); P cuts less than C (0.9). P's total time at rest of a minute or more is no worse than A's 16 joiners (0.7), the guard against the B regression. **THE ARMS: P, P+E, P+C, P+E+C, at 150 and 300 cars, three seeds, with the merge-tightness probe on every one.** P+E cuts more than P and E singly summed, super-additive (0.5, the maintainer's compounding claim). **THE BEHAVIOUR TEST, the point of the arm: P+C against C alone. Merges are LOOSER with the mainline making space: the median time gap to the car behind is larger (0.7) and the share leaving the car behind under 1 s is smaller (0.7); and the car behind brakes over 3 m/s^2 in the following four seconds less often (0.6).** If P+C is no looser than C, the mainline's side adds nothing visible and Jay's mutual compromise is not what separates the two, and that is said. Thresholds (1 s, 3 m/s^2, 4 s) `[invented]`.

**THE COST OF DECAY, MEASURED AND SCORED `[M]` (`tools/measure/lane-end.mjs`, merge tightness at the tick each merge begins; A and C; three seeds; 150 and 300 cars; 280/273 and 564/552 merges).** **THE MAINTAINER'S REFUSAL TO ADOPT C WAS RIGHT, AND THIS IS THE MEASURED REASON: the merges are materially tighter and the car behind brakes hard far more often.**

| | A as built, 150 / 300 cars | C decay, 150 / 300 cars |
|---|---|---|
| median time gap to the car behind, per seed | 3.95, 4.11, 4.23 s / 3.79, 3.62, 3.61 s | 3.76, 3.93, 4.41 s / 2.32, 2.73, 2.72 s |
| merges leaving it under 1 s / under 0.5 s | 6.4% / 1.8% -- 8.7% / 1.1% | 12.1% / 4.1% -- **19.0% / 5.6%** |
| car behind brakes over 3 m/s^2 within 4 s | 4.3% -- 15.1% | 13.2% -- 19.0% |
| car behind brakes over 5 m/s^2 within 4 s | **1.8% -- 2.8%** | **9.5% -- 11.4%** |
| joiners at or near rest at the lane end | 13 -- 126 | 1 -- 4 |

**READ IT AS A TRADE, NOT AS A VERDICT: C removes about 120 joiners standing at the lane end at 300 cars and buys it with about one merge in ten making the car behind brake over 5 m/s^2 (A: about one in thirty-five).** 5 m/s^2 is nearly twice a comfortable stop (2.7) and short of an emergency (8) in this sim; whether that is "ugly" in Jay's sense or dangerous is HIS to say, and the thresholds (1 s, 3 and 5 m/s^2, four seconds) are `[invented]`. CAVEATS: the braking is the nearest car behind in the target lane, read from the joiner's last plan, and is not attributed to the merge (the stream brakes on its own: A's 15% at 300 cars is that base rate plus merges), so the evidence is the DIFFERENCE between A and C, not either figure; a dense stream's own braking also makes A's 15% at 300 cars a different number from its 4.3% at 150. SCORED AS MADE: median gap falls from A to C (0.8) HIT at 300 cars, NOT at 150 (inside the seed spread); under 1 s rises to 15 to 30% (0.5) HIT at 300 (19.0%), just under at 150 (12.1%); the car behind braking over 3 m/s^2 from 3 to 8% (A) to 8 to 20% (C) (0.5): A 4.3% at 150 HIT, 15.1% at 300 MISS (and the smoke run's 19% was a single 100 s run, the full figure is 15.1%); C 13.2% and 19.0% HIT; **the opposite outcome, C no tighter than A (0.3): REFUTED.** The 3 to 8% for A was `[invented]` and is marked so; **the 15.1% at 300 cars in the build as it is stands as the priority question for Jay in the digest.**
**DIGEST CANDIDATES FROM THIS, in his units:** "of the merges onto a motorway, how many leave the car behind under a second" and "how many make the driver behind brake hard" (both above), each with a bar that is `[Jay]` once he has said, and `[invented]` until he does.

**THE FINDING: THE MECHANISMS DO NOT COMPETE, THEY ARE FOR DIFFERENT PARTS OF THE DISTRIBUTION (the maintainer's decomposition, 11 November, with two corrections from the tables).** **The question is not which mechanism wins; it is which POPULATION each one is for.** Decay fixes the BULK (joiners at or near rest at 300 cars, 20.1% to 0.7%) and buys it with aggression (under-1-second gaps behind 8.7% to 19.0%, hard braking over 5 m/s^2 from 2.8% to 11.4%). Scanning on the approach barely touches the bulk (20.1% to 16.2%) and nearly removes the extreme tail (joiners with a minute or more of total time at rest, 16 to 1). The widened courtesy (B) fixes neither and worsens the tail (16 to 43). **TWO CORRECTIONS, BOTH IN THE TABLES, RECORDED SO THE FRAMING DOES NOT OUTRUN THE DATA `[M]`:** (1) **decay removes the tail too (16 to 0), so the tail is NOT scanning's alone**; what is distinctive about scanning is that it removes the tail with NO decay, which is only a benefit if it also carries none of decay's aggression, and **scanning's own tightness has not been measured** (E ran before the tightness probe existed). That is part of the next measurement. (2) **"Courtesy as currently built fixes neither" is true of the WIDENED courtesy (B) and not of the courtesy that is in the game:** switched off, same seeds, the as-built courtesy is worth a great deal (joiners with a minute or more of total time at rest at 300 cars 73 off against 16 on; median rest 44 s against 14 s). B, the widening, is what is dead.
**THE NEXT HYPOTHESIS, THE MAINTAINER'S, AND THE BEST SHOT AT THE RIGHT ANSWER: E PLUS DECAY AT REDUCED STRENGTH.** Decay's aggression should scale with how much compromise a joiner has to make; scanning reduces how much is needed (a driver who positions early arrives nearer a usable gap), so scanning plus a gentler decay may clear the bulk at a fraction of the aggression. **E+C read sub-additive only because C had already taken everything there was to take; that says nothing about whether a weaker C would have sufficed once E was present.** Strength `S` is defined here as `kdecay = 1 - S * (1 - f)` where `f` is the existing linear ramp (1 on the open lane, 0 at the point the joiner must begin to stop): `S = 1` is the arm already run, `S = 0` is no decay, and at the lane's end the demand is `(1 - S)` of the joiner's own (still clamped at 0.3). **THE ARMS: E (S = 0, 0.25, 0.5, 0.75, 1) with the tightness probe on each, 150 and 300 cars, three seeds; and the CONTROL for whether E is what makes a weaker decay enough: decay alone (no scanning) at S = 0.25, 0.5, 0.75, at 300 cars.** Measured TOGETHER, because the point is the trade: near-rest share, minute-or-more tail, the under-1-second share, and the car behind braking over 5 m/s^2 (reported as the difference between arms, unattributed).
**PREDICTIONS, WRITTEN BEFORE ANY OF IT IS RUN `[D]`.** THE MAINTAINER'S: E plus half-strength decay clears under 2% near rest at 300 cars (0.6), with under-1-second gaps below 13%, materially better than C's 19% (0.65), and keeps E's tail benefit (0.7). If the aggression does not fall when the required compromise falls, his model of where the cost comes from is wrong, and he says so. MINE, SEPARATELY AND WITH NUMBERS, to be scored on their own: near-rest share at 300 cars falls monotonically with S and faster than linearly at the strong end: S = 0.25 about 10%, 0.5 about 4%, 0.75 about 1.5% (0.4 that the half-strength arm is under 2%; I give it less than he does because C's insensitivity to the ramp suggests the bulk is a threshold, not a slope). The under-1-second share and the hard-braking share rise with S roughly in proportion: at S = 0.5 about 13 to 15% under one second and about 6% over 5 m/s^2 (0.5). **SUCCESS FOR "A FRACTION OF THE AGGRESSION", defined now: at some tested S, under 2% near rest AND hard braking over 5 m/s^2 under half of full decay's 11.4% (under 5.7%) AND under-1-second under 13%, all at 300 cars: the maintainer 0.6 for the half-strength arm, me 0.35 for any tested strength.** THE CONTROL: E at half strength clears the bulk better than half-strength decay without E (0.7), because that is what "scanning reduces the compromise needed" means. If decay alone at S = 0.5 does as well as E+decay at S = 0.5, scanning is not what is making the gentler decay sufficient.
**HOLDS, STANDING:** G and H stay evidence-free (they contain B; G's tail of 68 is a second reason B is dead rather than a puzzle); the braking is reported only as the difference between arms; the `[Jay]` questions are held and batched (the hard-brake rate is asked; the under-1-second share goes to him with that answer in hand).

**THE ANTICIPATORY MAINLINE (P), SCORED `[M]` (scratch tree `cfp`; seeds 1 to 3; neutrality: arm A in this tree reproduces 51/208 and 5/102).**

| 300 cars | near rest at the end | joiners with 60 s+ total at rest | median gap behind, s | under 1 s | car behind over 3 / over 5 m/s^2 |
|---|---|---|---|---|---|
| A as built | 126 of 628 (20.1%) | 16 | 3.79, 3.62, 3.61 | 8.7% | 15.1% / 2.8% |
| C decay | 4 of 604 (0.7%) | 0 | 2.32, 2.73, 2.72 | 19.0% | 19.0% / 11.4% |
| **P anticipatory mainline** | 61 of 610 (10.0%) | **200** | 5.90, 4.88, 5.73 | 6.9% | 8.9% / 2.0% |
| P + E | 75 of 629 (11.9%) | 90 | 5.54, 4.30, 5.65 | 5.6% | 9.0% / 1.6% |
| P + C | 2 of 612 (0.3%) | 0 | 2.58, 2.61, 2.76 | 19.2% | 19.7% / **14.8%** |
| P + E + C | 2 of 598 (0.3%) | 0 | 2.99, 2.32, 2.96 | 19.4% | 16.3% / 10.3% |

At 150 cars: P 21 of 322 (6.5%), tail 7; PC 1 of 312, no different from C on any column. Zero overlaps and zero crashes in every arm.
**SCORED AS MADE.** P alone 6 to 16% near rest (0.6) HIT (10.0%); P does not clear 1% (0.9) HIT; P cuts less than C (0.9) HIT; **P's minute-or-more tail no worse than A's 16 (0.7): MISSED BY A FACTOR OF TWELVE (200)**; P+E more than the sum of the singles (0.5) MISS (E's cut is 26 joiners, P's 65, P+E's 51, so far from super-additive it is under P alone). **THE BEHAVIOUR TEST, P+C AGAINST C: NO. Median gap 2.58/2.61/2.76 against 2.32/2.73/2.72 (the same), under 1 s 19.2% against 19.0% (the same), the car behind over 5 m/s^2 14.8% against 11.4% (WORSE, not better); all three predictions (0.7, 0.7, 0.6) MISS.** As committed in advance: if P+C is no looser than C, the mainline's side as built here adds nothing visible, and that is the reading. NOT, however, evidence about Jay's mechanism: see the next paragraph.
**P ALONE MAKES A STANDING QUEUE `[M]` (`lane-where`, one seed at 300 cars, rest seconds by tenth of the lane): under P joiners stand along the WHOLE lane (from the second tenth on), up to 74 standing at once and a mean of 48, against A's 16 at most and a mean of 9, all of them in the last three tenths; the mainline's mean speed is unchanged (83 against 85 km/h).** The "near rest at the lane end" figure UNDERCOUNTS this, because only the head of a queue reaches the end: that is a blind spot of the probe's headline number, and the minute-or-more tail is what showed it. **THE METRIC LESSON: "joiners standing on the ramp at once" (mean and maximum) belongs beside the share at the end, and in the digest ("how many cars were stood on the ramp at the worst moment"), in Jay's units, since a queue the length of the ramp is what he would see.** It is now in the probe.
**WHAT P'S RESULT DOES AND DOES NOT SAY.** The P+C rows show the mainline's side as I built it adds nothing once decay is there; the P-alone row shows it is worse than nothing without decay. Neither is a verdict on anticipatory mainline behaviour, because P is four approximations and ONE OF THEM IS LIKELY WRONG: **`[D]` the offer is sized for the speed the joiner WILL have, but a joiner that is standing needs the gap for the speed it HAS (a bigger gap, since the closing speed to shed is the whole stream's), so an offer sized for the projected speed opens a gap too small for the joiner at the head, is held (the clock does not run until the joiner is ready) and the head never goes.** That is a hypothesis about my own implementation, and it is tested, not assumed:
**THE ABLATION, PREDICTIONS WRITTEN BEFORE IT RUNS `[D]`.** P has four parts: (a) the ask stands from lane entry, (s) the gap is sized for the projected speed (the offerer's plan closing on that speed travels with it), (c) the withdrawal clock waits for readiness. Arms at 300 cars, three seeds, each on its own and each with one part left out: **a, s, c, as, ac, sc.** The standing queue is the quantity (mean joiners standing; the minute-or-more tail beside it). Predictions: **(s) is the cause: every arm containing s (s, as, sc) has a mean standing above 30 (0.55); the arm with a alone has under 15 (0.55).** The alternative, that the early ask alone queues the lane, I give 0.25. If neither, the interaction is not one of these parts and the arm is not usable as a basis for the mainline's side, and I say so.
**ASKED OF THE MAINTAINER, NOT DECIDED HERE:** whether the anticipatory behaviour should be built as Jay describes it, which is not one offerer but the whole stream easing as a joiner comes up the ramp. P is the narrowest version of it, and even that one is not yet a working arm.

**JAY'S ANSWER ON THE HARD-BRAKE RATE (11 November, verbatim): *"for traffic without an escape (changing lanes away from the merge) I could see that happening. let me test and see, some traffic characteristics can be exaggerated to make our drivers more lively to watch."*** **RECORDED AS `[Jay, conditional]`: a hard brake is plausible when the car behind had nowhere to go, and suspect when it could have moved over and did not.** So the figure to report is not the hard-brake rate, it is the rate CONDITIONED ON WHETHER THE BRAKING CAR HAD AN ESCAPE: a discriminator we can compute, in place of a bare percentage nobody could judge. He is also going to test it himself ("let me test and see"); the figure goes into the digest with the split, not without it.
**THE MEASUREMENT (a new probe, `tools/measure/merge-escape.mjs`, NOT the running batches):** at the tick a merge's car behind first brakes over 3 m/s^2 within four seconds (and over 5), did it have a USABLE adjacent gap to move into, by the sim's own lane-change gap test (`leadNeed` and `lagNeed` at that car's own demand, against the car ahead and the car behind in the lane beside it, by the lane's own along-coordinate), the lane away from the merge only (the other side is the acceleration lane). Split the hard-brake share into ESCAPE AVAILABLE and NO ESCAPE, and report beside it the base rate: the share of ALL merges whose car behind had such a gap at the moment the merge began, because if nearly everybody has an escape, braking with one is no evidence of anything. `[invented]` instrument choices: the gap test is the sim's own (itself `[invented]` constants), the lane away only, the onset tick, 3 and 5 m/s^2, four seconds. **CAVEAT STATED NOW: in this sim a car that brakes never moves over in response (a lane change is made for a turn, to keep right, or to pass, never to avoid), so "escape available" is an OPPORTUNITY measure by construction and says what the missing response would have been worth, not what a driver here chose.**
**THE PREDICTION, BEFORE IT IS MEASURED `[D]`, AND THE POSSIBILITY THAT WOULD UNIFY TWO OBSERVATIONS:** a driver whose only responses are brake, follow, or fully change lane will brake in situations where a real driver would ease over, which would join Jay's parked-car observation (no lateral repertoire) to this one in a third place. **Mine: at 150 cars, a majority of the hard-brake events have an escape (0.6); at 300 cars, a minority (0.55), around 30% (15 to 50%), because the lane beside is as dense as the one being joined; and the share of ALL merges with an escape available is higher than the share among the hard-brake events (0.7), because hard braking concentrates where the lane beside is also full.** **DISCLOSURE: the probe's smoke run, one 100 s run at 300 cars, was read BEFORE this paragraph was committed (the numbers above were written before it and are not changed): 6 of its 18 hard-brake events had an escape (33%) and the base rate was 49%. It is one run and the predictions are scored as made, but they are not independent of it.** If at least a quarter of the hard-brake events at 300 cars have an escape (0.6), that is the second defect, and it is the same one. If the braking sits in the no-escape cases, the rate stands and is left alone.
**A DESIGN RULING TO RECORD, JAY'S (11 November, same message): SOME TRAFFIC CHARACTERISTICS CAN BE EXAGGERATED TO MAKE OUR DRIVERS MORE LIVELY TO WATCH.** It joins his earlier legibility ruling, as relayed, that what we represent needs to be over-the-top visually. Realism is the floor for plausibility, not a ceiling on expressiveness. **A READING OF IT, NOT JAY'S, OFFERED IN THIS SESSION, TO BE PUT TO HIM AND NOT ASSUMED: exaggerate the AMPLITUDE of a behaviour, not its FREQUENCY.** A hard brake that is unmistakable (the lurch, the lights, a horn, a visible reaction from the driver) makes the road more readable; one that happens more often makes it less drivable, and degrades the simulation to communicate it. The same event, louder, rather than more events. **KEPT SEPARATE ON PURPOSE: if the hard-brake rate turns out too high, "exaggerate it" is NOT the remedy; the remedy is to fix the rate and make each instance read clearly.** The exaggeration ruling is a licence about how an event is shown. It is not an excuse for a defective rate, and a future reader must not use it as one.
**FOR THE DIGEST (held and batched with the second question):** `[Jay, conditional]` beside the hard-brake item: "of the merges that make the driver behind brake hard, how many left that driver nowhere to go".

**E PLUS DECAY AT REDUCED STRENGTH, SCORED `[M]` (scratch tree `cfs`; seeds 1 to 3; 300 cars; strength S: `kdecay = 1 - S * (1 - f)`; NEUTRALITY: S = 0 reproduces arm E exactly, 38/33/29 of 617).**

| 300 cars | near rest at the end | 60 s+ tail | under 1 s behind | car behind over 3 / over 5 m/s^2 |
|---|---|---|---|---|
| A as built | 126 of 628 (20.1%) | 16 | 8.7% | 15.1% / 2.8% |
| E, S = 0 (scanning only) | 100 of 617 (16.2%) | 1 | 8.8% | 15.2% / 2.6% |
| E + decay S = 0.25 | 52 of 608 (8.6%) | 2 | 13.5% | 11.2% / 4.1% |
| E + decay S = 0.5 | **16 of 594 (2.7%)** | 0 | 17.1% | 12.3% / 6.3% |
| E + decay S = 0.75 | 4 of 599 (0.7%) | 0 | 17.5% | 16.9% / 6.8% |
| E + decay S = 1 | 3 of 593 (0.5%) | 0 | 17.2% | 21.1% / 11.7% |
| C (decay alone, S = 1) | 4 of 604 (0.7%) | 0 | 19.0% | 19.0% / 11.4% |
| **control: decay alone S = 0.25 / 0.5 / 0.75** | 90 (14.7%) / 31 (5.1%) / **0 (0.0%)** | 6 / 3 / 0 | 12.9% / 16.2% / 17.8% | 14.8 / 14.6 / 15.5% -- 3.8 / 4.9 / 7.2% |

At 150 cars, E + decay at S = 0.25 already gives 4 of 318 (1.3%) with under-1-second 8.0% and over-5 2.9%, and S = 0.5 gives 1 of 317. Zero overlaps and zero crashes in every arm.
**SCORED AS MADE.** THE MAINTAINER'S, for E plus half-strength decay at 300 cars: under 2% near rest (0.6) **MISS, 2.7% (16 of 594; `[D]` a 95% interval of about 1.4 to 4.0%, so not 2% and not far from it)**; under-1-second below 13%, materially better than C's 19% (0.65) **MISS, 17.1% (two points under C, not six)**; keeps E's tail benefit (0.7) **HIT, 0.** MINE: S = 0.25 about 10%, 0.5 about 4%, 0.75 about 1.5%: 8.6%, 2.7%, 0.7%, **the shape right (falling faster than linearly) and every figure lower than I wrote**; under 2% at half strength (0.4) MISS; under-1-second 13 to 15% at S = 0.5 MISS (17.1%); hard braking about 6% at S = 0.5 (0.5) HIT (6.3%). **THE DEFINED SUCCESS ("a fraction of the aggression": some tested S at 300 cars with under 2% near rest AND over-5 under 5.7% AND under-1-second under 13%): NOT MET BY ANY STRENGTH. S = 0.75 gives the first and misses the other two (6.8%, 17.5%).** Both predictions of it (his 0.6 for half strength, my 0.35 for any) MISS. At 150 cars S = 0.25 does meet all three, but the definition was written for 300.
**WHAT THE TABLE DOES SAY, AND IT IS NOT NOTHING `[M]`.** (1) **THE COST IS NOT LINEAR IN STRENGTH, AND THE LAST QUARTER OF STRENGTH IS BAD VALUE: E + S = 0.75 clears the bulk as well as full decay (0.7% against 0.5% and 0.7%) with the car behind over 5 m/s^2 at 6.8% against 11.7% and 11.4%, about 40% less hard braking.** Going from S = 0.75 to 1 buys nothing on the bulk and costs five points of hard braking. (2) **SCANNING ALONE CARRIES NO AGGRESSION (S = 0 against A: under 1 s 8.8% against 8.7%, over 5 m/s^2 2.6% against 2.8%, gap median 3.3 against 3.7 s).** That answers the open question: it removes the long tail (16 to 1) for free. (3) **THE CONTROL SAYS SCANNING IS NOT WHAT MAKES A GENTLER DECAY SUFFICIENT, ONLY A LITTLE: at S = 0.5 E helps the bulk (2.7% against 5.1%, lower in every seed, 2/7/7 against 9/14/8) as predicted (0.7, HIT), but at S = 0.75 decay alone already clears it (0.0%) with over-5 at 7.2%, the same as with E (6.8%).** (4) **THE AGGRESSION DOES NOT FALL WHEN SCANNING IS PRESENT AT THE SAME STRENGTH (S = 0.5: 6.3% with E, 4.9% without; S = 0.75: 6.8%, 7.2%), which is the thing the maintainer said would make his model of where the cost comes from wrong. `[D]` The reading: in this implementation the compromise is a function of POSITION IN THE LANE, applied to every joiner near the end whether or not it needs it, so the cost follows the strength applied and not how much compromise was needed. A joiner already alongside a good gap near the end is made to accept tighter ones just the same.** That is a statement about this implementation of Jay's "as space runs out each driver compromises more and more", not about the idea.
**A HYPOTHESIS THIS SUGGESTS, NOT RUN, NOT ADOPTED, NOT YET PREDICTED IN NUMBERS:** compromise should follow UNMET NEED (how long and how far the joiner has already gone without a gap it would take) and not position alone, so that those who found a gap pay nothing. That differs from Jay's wording ("as space runs out"), which is positional, and whether his drivers do either is his to say. Held for the batch of questions for him.
**HOLDS: C is not adopted, and nothing here is a recommendation to build a decay at any strength; the cost of every strength above is unattributed braking read as the difference between arms and the thresholds are `[invented]`.**

**THE MAINTAINER'S MODEL OF WHERE THE AGGRESSION COMES FROM IS SCORED AS THE MISS IT IS: half-strength missed on two of three, and the mechanism proposed for the cost (that it scales with how much compromise a joiner must make) is refuted outright; the agent's reading, that the positional decay is applied to every joiner near the end whether or not it needs it, so the cost follows the strength applied and not the need, explains the whole table, including why scanning does not reduce the aggression: scanning reduces need and the implementation is not reading need.**
**A RULING, THE MAINTAINER'S (11 November): BUILD NEED-BASED DECAY, AUTHORISED, NOT BATCHED FOR JAY.** Jay's ruling, *"as space runs out each driver compromises more and more"*, is satisfied by need-based decay in every case he was describing (a driver still hunting near the end has unmet need by definition). What it changes is the driver who found a gap early and was being made to compromise anyway, which his words never asked for and which is pure cost. **An implementation refinement of his mechanism, not a competing one; he is not asked to arbitrate it, and it is flagged to him as a DETAIL when the digest goes over, not put in the questions batch.** **NEED IS DEFINED AS TIME SPENT SEEKING WITHOUT AN ACCEPTABLE GAP; compromise grows with that, not with the distance remaining.**
**TWO THINGS TREATED AS SETTLED UNLESS SOMETHING CONTRADICTS THEM (the maintainer's):** scanning on the approach goes in regardless (it removes the long tail, 16 joiners to 1, at no measurable aggression cost); and positional decay at S = 1 is dead (it buys nothing over 0.75 on the bulk and costs five points of hard braking), so if positional is what we end up with, 0.75 is the ceiling. NOTHING IS ADOPTED YET.
**THE NEED-BASED ARM (scratch tree `cfn`, a counterfactual; the definition in code, `[invented]` where marked).** Need `T` is the time a joiner has spent past the lane's start with a merge plan (`mergePlan` non-null: ready and seeking, which is also exactly when it has found no gap it would take, because it merges when it has) or standing under 0.5 m/s (so the second car in a queue, which has no plan of its own, still accrues). The demand is `kdecay = 1 - S * min(1, T / N0)`, clamped at the sim's own 0.3 floor, and the offerer's gap sizing reads the same decayed demand as before (one definition). **`N0`, the need at which compromise is full, is `[invented]`: the measured stalled joiner waited about 20 s with a plan and no gap, so it is run at 5, 10 and 20 s, S = 1, with scanning on the approach in every arm (settled), at 150 and 300 cars, three seeds; plus 10 s without scanning at 300 cars as a control.** No position enters it at all.
**PREDICTIONS, WRITTEN BEFORE IT IS BUILT OR RUN `[D]`.** THE MAINTAINER'S: need-based decay at full strength clears the bulk as well as positional decay at S = 0.75 or better (0.7), with under-1-second gaps below 13% and hard braking over 5 m/s^2 below 5% (0.6), because the drivers generating most of today's aggression are ones who never needed to compromise at all. If the aggression does NOT fall, compromise itself is inherently expensive whoever does it, and the trade Jay has to rule on is real and not an artifact of our implementation, which would close this line of inquiry. **MINE, SEPARATELY, AND DIFFERENT ON ONE POINT THAT FOLLOWS FROM THE DEFINITION: need cannot accrue before a joiner has begun waiting, so a need-based decay stands joiners at the end for about the time it takes to accrue, by construction, and a measure of "at or near rest at the end" will not fall to the 1% bar.** Near rest at 300 cars with scanning: N0 = 5 s 1 to 4%, N0 = 10 s 3 to 8%, N0 = 20 s 6 to 12% (0.5 that N0 = 10 s is above 2%); so the maintainer's first clause (as good as positional S = 0.75, which is 0.7%) I give 0.3. The aggression: over 5 m/s^2 3 to 5% at N0 = 10 s (0.5), under-1-second 10 to 13% (0.5), the minute-or-more tail 0 (0.7). **IF I AM RIGHT ABOUT THE FIRST POINT, IT IS A CONFLICT BETWEEN THE MECHANISM AND THE BAR, NOT A DEFECT IN EITHER: the bar (under 1% at or near rest, `[invented]`) asks that nobody wait, and need-based compromise needs the waiting to exist. That is a reason to ask what Jay's bar is, not to lower the bar to fit the mechanism.**

**THE ABLATION OF P's PARTS, SCORED `[M]` (scratch tree `cfp`, 300 cars, seeds 1 to 3; parts a = the ask stands from lane entry, s = the gap is sized for the projected speed, c = the withdrawal clock waits for readiness).**

| arm | near rest at the end | 60 s+ tail | joiners standing at once, mean per seed / max | merges in 180 s | under 1 s / over 5 m/s^2 |
|---|---|---|---|---|---|
| A as built | 126 (20.1%) | 16 | 9.0, 3.0, 8.0 / 18 | 564 | 8.7% / 2.8% |
| P = a + s + c | 61 (10.0%) | **200** | **47.9, 34.0, 69.5 / 110** | **347** | 6.9% / 2.0% |
| **a alone** | 92 (14.9%) | **0** | 2.2, 5.7, 4.3 / 15 | 543 | 8.5% / 4.8% |
| s alone | 87 (13.4%) | 59 | 19.9, 23.5, 20.1 / 54 | 497 | 6.8% / 2.2% |
| c alone | 112 (17.9%) | 21 | 12.1, 4.2, 7.1 / 27 | 562 | 10.9% / 3.6% |
| a + s | 75 (12.3%) | 163 | 42.6, 24.2, 57.1 / 81 | 365 | 6.6% / 1.9% |
| a + c | 96 (15.5%) | 3 | 0.9, 4.5, 3.7 / 10 | 533 | 9.2% / 3.9% |
| s + c | 85 (13.2%) | 99 | 39.2, 24.9, 17.6 / 62 | 464 | 5.6% / 2.8% |

Zero overlaps and zero crashes in every arm.
**THE SIZING IS THE CAUSE, `[M]`: every arm that contains s stands 3 to 7 times as many joiners as A, and no arm without it does (a alone 4.0 on average, a + c 3.0, c alone 7.8, against A's 6.7). The early ask is benign, and slightly useful on its own: it takes the near-rest share from 20.1% to 14.9% and the minute-or-more tail from 16 to 0, with no queue.** The parts interact: a makes s worse (a + s 41 against s alone 21) and the three together are worst (50 standing, merges down from 564 to 347: a 38% loss of throughput, which is what a queue the length of the ramp is).
**SCORED AS MADE, AND TWO OF THE THREE THRESHOLDS MISSED.** "(s) is the cause: every arm containing s has a mean standing above 30 (0.55)": the direction is right and the threshold is not: a + s 41.3 holds, **s alone 21.2 and s + c 27.2 do not**; "a alone under 15 (0.55)" HIT (4.0); "the early ask alone queues the lane (0.25)" REFUTED. `[D]` the mechanism I proposed (an offer sized for the projected speed is too small for a joiner that is in fact standing, is held, and the head never goes) fits this and is NOT tested by it: the ablation says WHICH part, not why. **The sizing as I built it is a defect of this arm and is not a finding about anticipatory mainline behaviour.**
**WHAT THIS DOES TO WHAT I SAID ABOUT P: THE P + C ROWS ARE CONTAMINATED. They carried the broken sizing. "The mainline's side adds nothing visible once decay is there" is WITHDRAWN as a conclusion; it was a conclusion about an arm with a defect in it.** The behaviour test (does the mainline making space make decay's merges looser?) is rerun below with the parts that work.
**THE RERUN, PREDICTIONS WRITTEN BEFORE IT RUNS `[D]`:** arms a + decay (positional, S = 1 and S = 0.75) and a + c + decay (S = 1), 300 cars (and 150 for S = 1), three seeds, with C (0.7%, 19.0% under 1 s, 11.4% over 5) and S = 0.75 alone (0.0%, 17.8%, 7.2%) as the comparisons. As modelled, the mainline's contribution is small (one courteous driver, at comfortable braking), and a alone moved the under-1-second share by 0.2 points, so: **the mainline making space earlier makes decay's merges NO LOOSER, within two points on both the under-1-second share and the over-5 share (0.6)**; near rest stays at or under C's 0.7% (0.8); a lower than 2 points under C on under-1-second (0.4) and on over-5 (0.4). If I am right, the mainline's side as modelled adds nothing, because it is one driver at comfortable braking, which is a statement about the model and not about Jay's account (many drivers, the whole stream easing); that stays untested in its real form.

**THE ESCAPE SPLIT, SCORED `[M]` (`tools/measure/merge-escape.mjs`; arms A and C; seeds 1 to 3; the escape is a gap the sim's own lane-change test would take, in the lane beside the car behind, away from the merge, at the first tick its deceleration passes the threshold; "no lane" is a car with no lane away).**

| | merges | base rate: escape available at the merge | hard brake over 3 m/s^2: share of merges | with an escape / without / no lane | share WITH an escape (of those with a lane) |
|---|---|---|---|---|---|
| A, 150 cars | 258 | 75.0% | 12 (4.7%) | 7 / 3 / 2 | 70% (7 of 10) |
| C, 150 cars | 244 | 84.3% | 36 (14.8%) | 25 / 9 / 2 | 73.5% (25 of 34) |
| **A, 300 cars (the build as it is)** | 553 | 55.3% | **85 (15.4%)** | **35 / 45 / 5** | **43.8% (35 of 80)** |
| C, 300 cars | 547 | 72.0% | 105 (19.2%) | 53 / 51 / 1 | 51.0% (53 of 104) |

Over 5 m/s^2 (small counts): A at 300 cars 16 events, 11 with an escape (69%); C at 300 cars 63 events, 28 with an escape (45%); A at 150 cars 5 events, none with an escape (3 without, 2 with no lane); C at 150 cars 26 events, 19 with an escape (79%).
**SCORED AS MADE: ALL FOUR PREDICTIONS HIT, ONE BY LITTLE.** At 150 cars a majority of hard brakes have an escape (0.6): A 70%, C 73.5% HIT. At 300 cars a minority, about 30% (15 to 50%) (0.55): A 43.8% HIT, inside the range and above the point estimate; C 51.0% is marginally a majority. The base rate of an escape is higher than the share among the hard brakes (0.7): HIT in all four rows (A 300: 55.3% against 43.8%; C 300: 72.0% against 51.0%; A 150: 75.0% against 70.0%, a very small gap; C 150: 84.3% against 73.5%). **THE UNIFICATION (at least a quarter of the hard brakes at 300 cars have an escape, 0.6): HIT. In the build as it is, 35 of the 85 hard brakes at 300 cars, 41%, had a usable lane beside them.** (The disclosure recorded with the prediction stands: a smoke run had shown 6 of 18 and a base rate of 49%.)
**WHAT THE CONDITION SAYS, IN JAY'S TERMS: `[Jay, conditional]` a hard brake with no escape is plausible and one with an escape is suspect. In the build as it is, at 300 cars, about 8% of merges (45 of 553) force a hard brake on a driver with nowhere to go and about 6% (35 of 553) force one on a driver who had somewhere to go and did not use it.** The first is the part he said he could see happening, and he is testing it. The second is the second defect: a driver whose only responses are brake, follow or fully change lane, braking where a real driver would ease over. It is the same missing lateral repertoire as the parked cars, now measured in a third place: in about 6% of merges, not in anecdote. **A SECOND READING, WHICH CUTS THE OTHER WAY AND IS STATED SO IT IS NOT HIDDEN: the share with an escape (44%) is only a little under the base rate (55%), so hard braking is only modestly concentrated where there is nowhere to go; in this sim braking happens about as often with an escape as without one. That is what a population that never uses its escape would look like.**
**CAVEATS `[M]` OR `[D]` AS MARKED: (1) the test is at the onset tick and by the sim's own gap constants (`[invented]`), and an escape also takes time that the test does not charge; (2) the braking is the nearest car behind in the lane joined, and is not attributed to the merge (it may be braking for the car ahead of it, which has nothing to do with the joiner, and that would make "had an escape" a statement about the stream and not about the merge, still a missing response and not a merge defect); (3) "escape available" is an OPPORTUNITY measure by construction, since no car here moves over in response to anything; (4) at over 5 m/s^2 the counts are small (16 and 5 in the build as it is).** The numbers belong in the digest as one item with its split: "of the merges that make the driver behind brake hard, how many left that driver nowhere to go, and how many had a clear lane beside them".
**DECAY'S COST, BY THE SAME SPLIT `[M]`: C raises the share of merges that force a hard brake (over 3 m/s^2) from 15.4% to 19.2% at 300 cars, and about three quarters of the increase (18 of the 24 more events among cars with a lane away) is braking with an escape (53 against 35), the rest without (51 against 45).** The aggression decay adds is, by this measure, mostly braking that a lateral response would have avoided. `[D]` That bears on the maintainer's fallback (that compromise might be inherently expensive whoever does it): part of what decay costs is that the car behind has only the brake to answer it with, which is a property of the drivers' repertoire and not of the compromise. One run of three seeds, so held as a reading, not a finding; it argues for treating the missing response as separate work whatever is decided about decay.

**THE VERDICT ON THE SPLIT, WHICH IS THE RECORD OF IT, NOT THE PERCENTAGES (the maintainer, 11 November): THE DISCRIMINATOR IS CONTAMINATED BY THE DEFECT IT WAS MEANT TO ISOLATE.** We cannot use "did the braking car have an escape" to decide which hard brakes are legitimate, because our drivers never take an escape under any circumstances. In a population that did, the cars with somewhere to go would have gone, and the no-escape cases would be the RESIDUE. So the 8% plausible and 6% defective split OVERSTATES how much of today's braking Jay's condition sanctions, and neither figure is quoted as a rate of anything. The digest carries the split with that sentence beside it, and with the caveat exactly as written: **"opportunity only, since no car here moves over in response to anything"**, which is the sentence that led to all of what follows.
**AND THE AGENT'S OTHER OBSERVATION, CARRIED ONE STEP FURTHER (the maintainer's, held as a reading): IF PART OF WHAT DECAY COSTS IS THAT THE CAR BEHIND ONLY HAS THE BRAKE TO ANSWER WITH, THE AGGRESSION MEASURED ALL EVENING IS PARTLY AN ARTIFACT OF A MISSING RESPONSE AND NOT A TRUE PRICE OF COMPROMISE: decay strength has been tuned against a cost that is itself inflated by a separate defect.** `[D]`, from one three-seed run; it is the reason not to settle a strength until the mainline's other response exists.
**TWO DIFFERENT ABSENCES, WHICH WE HAD CONFLATED (the maintainer's distinction):** a **REPERTOIRE GAP** is easing laterally past a partial obstruction without a full lane change; that is what Jay saw with the parked cars, and the sim cannot do it at all. A **TRIGGER GAP** is changing lanes ENTIRELY to make room for a joiner: the drivers can change lanes perfectly well and nothing asks them to. **The escape data points at the trigger gap, which is the cheap one.** Jay said *"drivers are braking and making space"*, and making space most often means moving over; we tested braking, found it barely helped, and called his mechanism weak without testing the other half of his sentence.
**ESTABLISHED BY READING, `[M]` (the maintainer asked this be established, not inferred from the 44%): NO TRIGGER FOR A MAINLINE CAR TO MOVE OVER FOR A JOINER EXISTS TODAY. SO THE 0.3 BRANCH "IT EXISTS AND IS NOT FIRING" IS SETTLED, NOT OPEN.** On the exit stretch (`exitStep`) a car changes lane for exactly two motives: held back by a slower leader in its lane when another lane gains at least `LC_GAIN` (the "held" branch), and KEEP RIGHT toward the curb (which moves cars INTO the lane the joiners merge into); on the approach, for the lane its own turn needs. **Nothing in `lanechange.js` reads a joiner or an acceleration lane except the joiner's own `mergeStep`**, and the mainline's whole response to a joiner is `courtesy.js` (braking). **What DOES exist is the machinery: `option(dir)` (the lane beside, with the beside-and-straight tests) and `attempt` (the gap test, the blind-spot looks, the blend), which already refuse to enter the acceleration lane; moving left is a call away.**
**THE ARM, BUILT AFTER THE NEED-BASED ARMS (which are running, because they answer a question Jay will care about) AND THE CORRECTED EARLY-ASK RERUN: MOVE, a third motive in `exitStep`.** A car in the lane a joiner will merge into, the NEAREST car behind that joiner by the lane's along-coordinate (as courtesy asks one driver, so the two are compared fairly), within `REACH` of it (`[invented]`, 120 m), moves one lane away from the merge when `option(-1)` exists, through the SAME `attempt` (so the same gap test, looks and blend as any change); gated by the same temperament as courtesy (`courteous`: compliance and caution at COMPETENT_AT) and by the same anticipation draw (`anticipates`, one draw per joiner), so a reacting driver does not. Courtesy braking stays as it is, so the mainline has BOTH responses. NOT in it: the whole stream moving over (one driver, as courtesy), the lateral EASING of the repertoire gap (not buildable as a trigger: there is nothing to trigger it with).
**PREDICTIONS, COMMITTED BEFORE IT IS RUN `[D]`.** THE MAINTAINER'S: moving over reduces the near-rest share at 300 cars substantially, below 8% on its own (0.6), and unlike decay REDUCES hard braking rather than raising it, because the gap is made instead of taken. THE BRANCH THAT IT EXISTS AND IS NOT FIRING (0.3): SETTLED BY THE READING ABOVE, it does not exist. MINE, SEPARATELY, AND MORE CAUTIOUS: **MOVE alone takes the near-rest share at 300 cars below 8% (0.4), to 8 to 16% (0.5), above 16% (0.1)**, because a car can move over only when the lane beside has a gap (the base rate is 55% at 300 cars) and only one driver is asked, the same two limits courtesy has, and courtesy's widening (B) moved the share by 3.5 points. Hard braking over 3 m/s^2 below A's 15.1% (0.6) and over 5 m/s^2 not above A's 2.8% (0.7): moving over is not braking, and it should not add to it. The long tail (a minute or more) not worse than A's 16 (0.8), the guard against a B-style regression; zero overlaps and zero crashes (0.9). **A THIRD RESULT THE ARM CAN SHOW, STATED SO IT IS NOT A SURPRISE: moving left for one joiner thins the left lane's gaps for the cars there, so the left-lane cars may brake instead; the arm reports the number of moves and the hard braking as before, and the left-lane cost is read from the same hard-braking figure, unattributed.** Combined with decay (positional S = 0.75 and need-based), after: that is the pricing the maintainer asked for, with BOTH of the mainline's responses available.

**THE MOVE ARM IS BUILT (scratch tree `cfm`, from the need tree, so it combines with decay, scanning and need; the probe now counts the cars that moved over). It FIRES: in a 40 s smoke run at 300 cars 25 cars moved over for 51 joiners, and 0 in the control. (That smoke run's counts were read and nothing else.) ARMS, queued after the need and early-ask batches: M (MOVE alone) at 150 and 300 cars; M + positional decay S = 0.75 and M + positional decay S = 1, at 300 cars, three seeds: the pricing with BOTH of the mainline's responses available. PREDICTIONS FOR THE COMBINATIONS, COMMITTED BEFORE THEY RUN `[D]`, against the comparisons already measured (decay alone S = 0.75: 0.0% near rest, 17.8% under 1 s, 7.2% over 5 m/s^2; S = 1: 0.7%, 19.0%, 11.4%): M + S = 0.75 keeps near rest at or under 1% (0.8) and takes the car behind's over-5 share at least 1.5 points below decay alone's 7.2% (0.5), and the under-1-second share below 17.8% (0.45); M + S = 1 takes over-5 at least 2 points below 11.4% (0.5). If neither moves, the moving over does not make decay cheaper, and the cost was not an artifact of the missing response, which is the maintainer's open reading and is then refuted.**

**THE NEED-BASED ARMS, SCORED `[M]` (scratch tree `cfn`; seeds 1 to 3; scanning on the approach in every EN arm; zero overlaps and zero crashes throughout).**

| | near rest at the end | 60 s+ tail | median rest of those that rested, per seed | under 1 s behind | car behind over 3 / over 5 m/s^2 |
|---|---|---|---|---|---|
| **300 cars** A as built | 126 of 628 (20.1%) | 16 | 14.3, 11.0, 23.4 s | 8.7% | 15.1% / 2.8% |
| E (scanning only) | 100 of 617 (16.2%) | 1 | 24.4, 8.8, 19.2 s | 8.8% | 15.2% / 2.6% |
| E + need, N0 = 5 s | 59 of 604 (9.8%) | 0 | 8.5, 6.2, 9.6 s | 11.5% | 11.3% / 2.9% |
| E + need, N0 = 10 s | 78 of 612 (12.7%) | 0 | 6.5, 13.9, 7.2 s | 10.6% | 10.0% / 2.0% |
| E + need, N0 = 20 s | 85 of 608 (14.0%) | 0 | 11.8, 6.6, 13.8 s | 10.6% | 12.0% / 2.9% |
| need alone, N0 = 10 s (no scanning) | 83 of 631 (13.2%) | 0 | 18.9, 16.4, 12.9 s | 11.1% | 14.5% / 3.7% |
| for comparison: E + positional S = 0.75 | 4 of 599 (0.7%) | 0 | | 17.5% | 16.9% / 6.8% |
| for comparison: E + positional S = 0.25 | 52 of 608 (8.6%) | 2 | | 13.5% | 11.2% / 4.1% |
| **150 cars** A / E / EN5 / EN10 / EN20 | 13 (4.1%) / 12 (3.8%) / 4 (1.3%) / 9 (2.8%) / 14 (4.5%) | 0 | | 6.4 / 5.9 / 7.3 / 7.7 / 6.2% | over 5: 1.8 / 2.2 / 3.0 / 2.9 / 2.2% |

**SCORED AS MADE: THE MAINTAINER'S FIRST CLAUSE MISSES BY A WIDE MARGIN AND THE OTHER TWO HIT.** Need-based decay as good as positional S = 0.75 on the bulk (0.7): **MISS, 9.8 to 14.0% against 0.7%.** Under-1-second below 13% (0.6, joint): HIT (10.6 to 11.5%); hard braking over 5 m/s^2 below 5%: HIT (2.0 to 2.9%); the tail kept: HIT (0). His fallback ("if the aggression does not fall, compromise is inherently expensive") is NOT triggered as worded: **the aggression did not RISE at all (over 5 m/s^2 is A's 2.8% to 2.0 to 2.9%; over 3 m/s^2 is A's 15.1% to 10.0 to 12.0%, lower), and neither did the benefit: the bulk fell from 16.2% (scanning alone) to 9.8 to 14.0% and no further.** MINE: near rest at N0 = 5 s 1 to 4% MISS (9.8%); at 10 s 3 to 8% MISS (12.7%) though "above 2%" (0.5) HIT; at 20 s 6 to 12% MISS (14.0%); the first clause (0.3) MISS, as I expected; over 5 m/s^2 3 to 5% at 10 s (0.5) MISS, in the benign direction (2.0%); under 1 s 10 to 13% (0.5) HIT; the tail 0 (0.7) HIT. **THE CONFLICT BETWEEN THE MECHANISM AND THE BAR WAS REAL: need-based compromise cannot reach under 1% at or near rest, because it accrues only after waiting, and N0 = 5 s still leaves the joiners that rest standing a median of 6 to 10 s.**
**WHAT IT SAYS, AS A TRADE CURVE `[M]`, AND IT IS NOT THE ONE THE MAINTAINER EXPECTED: need-based decay is CHEAP AND SMALL; positional decay is EXPENSIVE AND LARGE.** At about the same near-rest share, need-based is cheaper than positional (EN5 9.8% with over-5 at 2.9%, against positional S = 0.25's 8.6% with 4.1%), but the only thing that CLEARS the bulk (0.7% and under) is positional at S = 0.5 to 0.75, at 6.3 to 6.8% over 5 m/s^2. `[D]` THE READING: positional decay works because it acts EARLY, while the joiner is still moving and needs only a small gap at speed, so it merges into the tight gap it finds on the lane and never reaches the end; need-based acts after the joiner has already stopped, when a standing start asks for the larger gap (the closing speed to shed is the whole stream's), so even a floor demand finds nothing for several seconds. The compromise that clears the pile-up has to be made BEFORE the joiner is at rest, which is Jay's own point about solving the merge on the approach, and it is made without knowing it was needed. **THE COST IS THEREFORE NOT AN ARTIFACT OF THE POSITIONAL IMPLEMENTATION: it is the price of acting before you know you must.** Not shown: that the price falls when the car behind has a second response; that is the MOVE arm's question, and it is still open.
**ALSO NOTED `[M]`, UNATTRIBUTED: the need-based arms LOWER the share of merges with a car behind braking over 3 m/s^2 (15.1% to 10.0 to 12.0%) at 300 cars, which no other arm did, with the under-1-second share up by about two points. A reading, not a finding.**

**THE MAINTAINER'S NEED-BASED IDEA IS SCORED AS THE MISS IT IS (refuted: the bulk did not clear and the cost did not fall for the same benefit), AND THE EXPLANATION OF WHY IS PULLED OUT AS A FINDING, NOT LEFT IN A FOOTNOTE (11 November).**
**THE FINDING: STOPPING IS VERY NEARLY AN ABSORBING STATE FOR A JOINER `[M]`.** The gap a joiner needs depends on its OWN speed. From the sim's own `lagNeed` (kappa 1, the stream at 100 km/h, `tools/measure/` one-liner `needgap.mjs` run 11 November): **a joiner at 100 km/h needs 22 m behind it (0.8 s of the stream); at 80 km/h 56 m (2.0 s); at 60 km/h 95 m (3.4 s); at 40 km/h 140 m (5.0 s); at 20 km/h 191 m (6.9 s); AT REST 249 m (9.0 s): about eleven times what a matched joiner needs.** At 300 cars the stream's median headway is about 1.2 s, so a 9-second hole is rare and, once a joiner has lost its speed, no amount of compromise gets it in, which is why Jay watches cars SIT at the end of the lane and not eventually squeeze through. (`[D]` caveats: the constants behind `lagNeed` are `[invented]`; "absorbing" is a tendency, since the measured rest times have a median of 6 to 24 s and a tail of a minute, not a trap.)
**THE REFRAME: THE QUESTION IS NOT "HOW MUCH SHOULD A DRIVER COMPROMISE", IT IS "HOW DOES A DRIVER NEVER STOP".** Positional decay scores well not because compromise is good but because it happens to act while the joiner still has speed. Its cost is the price of acting before you know you must (the agent's reading, accepted by the maintainer over his own artifact theory).
**A MECHANISM NEITHER OF US HAD TESTED, AND IT MAY COST NOTHING: SPEED MODULATION. A joiner that ARRIVES BESIDE a gap needs no tight gap, forces no hard brake and asks nothing of the mainline: the only candidate so far whose benefit does not come out of somebody else's comfort.** The maintainer's inference that it is absent, from E's weak effect on the bulk, is `[D]` and was to be checked before building. **CHECKED BY READING, `[M]`: IT EXISTS, AND IT IS WHAT E ALREADY EXTENDED.** `gapTarget` (`lanechange.js`) picks the reachable gap (among the cars within `GAP_LOOK`, 150 m `[invented]`, either way, the gaps of `room(v)` = twice the following gap plus the car) that needs the least change of speed, and returns the speed that brings the joiner level with it by the time its lane begins to close; `crossing.js` applies it as a cap on the joiner's wanted speed (`meeting`, through the following model), so a joiner can hold back or press on, never exceed its own desired speed. It is gated by the observation draw (`anticipates`, one per join), waits out the driver's registration lag after entering the lane, and sees only 150 m. **ARM E (scanning on the approach) IS THEREFORE A SPEED-MODULATION ARM BY CONSTRUCTION: the same function, started 150 m before the lane and without the lag wait. Its 3.9-point effect on the bulk is not evidence that modulation is inert; it is evidence that this modulation, with these limits, did not put most joiners beside a gap.** What is NOT known is why, and that is what the next measurement separates.
**THE MEASUREMENT (a probe, `tools/measure/lane-gaps.mjs`, on arms A and E; it is a probe and not an arm, so it runs now, alongside the queue):** per joiner, (1) did it ever hold a gap target (a non-null wanted speed, on the approach or the lane); (2) at the tick it first reaches the lane, how many INTERIOR gaps (between two cars of the lane joined, `room` or more, by the sim's own `gapTarget` definition) were there within 150 m and within 300 m of it: **does the stream offer gaps to arrive beside at all?**; (3) the near-rest share by (had a target) by (had a gap within 150 m). **Its two branches are the maintainer's: joiners with a gap in reach and a target who still stop mean the modulation does not EXECUTE (a defect in what a joiner does with its target); joiners with no gap within reach mean the stream genuinely has none and the mainline's cooperation is necessary and not merely helpful.**
**PREDICTIONS, COMMITTED BEFORE THE PROBE RUNS `[D]`:** at 300 cars in E, the share of joiners that ever hold a target 50 to 80% (0.5); the near-rest share among joiners WITH a target at least 5 points below those without (0.6; if not, the modulation is inert); the share with at least one interior gap within 150 m at the lane's start 60 to 90% (0.5), within 300 m at least 85% (0.6). **THE ARM, ONCE THE PROBE SAYS WHICH BRANCH: speed modulation in its strong form (every joiner scans as Jay says a driver does, not only those the observation draw admits, and sees 300 m and not 150), E2 and E3.** THE MAINTAINER'S: speed modulation cuts the near-rest share at 300 cars to under 8% on its own (0.6), with under-1-second and hard braking no worse than arm A (0.7); if it lands near E's 16%, arriving beside a gap is not achievable at that density and the cooperation is necessary. MINE, SEPARATELY: E2 (everyone scans) 10 to 15% (0.5); E3 (and 300 m) 8 to 13% (0.4); under 8% 0.3; tightness and braking not worse than A (0.8), because it takes nothing from anyone. **SEQUENCING, THE MAINTAINER'S: the corrected early-ask rerun and the MOVE arms first (MOVE answers whether the cost falls when the follower has a second response), then speed modulation; the two together are the honest pricing, and no recommendation goes to Jay before both are in.**

**THE GAP-SUPPLY AND TARGET PROBE, SCORED `[M]` (`tools/measure/lane-gaps.mjs`; 300 cars; seeds 1 to 3, 120 s each; 450 joiners in A, 442 in E; near rest as in the lane-end probe).**

| | A as built | E (scanning on the approach) |
|---|---|---|
| joiners that ever hold a gap target | 69% | 72% |
| at the lane's start: an interior gap within 150 m / within 300 m | 23% / 78% | 24% / 77% |
| cars of the lane joined within 150 m at the lane's start (median) | 1 | 1 |
| near rest, overall | 101 of 450 (22.4%) | 67 of 442 (15.2%) |
| near rest WITH a target / WITHOUT | 19.9% / 28.1% | **15.0% / 15.6%** |
| near rest with an interior gap within 150 m / without | **50.0% / 14.2%** | **39.3% / 7.5%** |
| target and gap / gap, no target / target, no gap / neither | 46.6% / 58.1% / 11.8% / 19.4% | 38.2% / 41.9% / 7.8% / 6.6% |

**SCORED AS MADE.** Share ever holding a target 50 to 80% (0.5): HIT (69%, 72%). The near-rest share with a target at least 5 points below without (0.6, "if not, the modulation is inert"): **HIT in A (8.2 points), MISS in E (0.6 points)**, which is the arm the prediction named. An interior gap within 150 m at the lane's start 60 to 90% (0.5): **MISS (23%, 24%)**; within 300 m at least 85% (0.6): **MISS (77%, 78%)**.
**WHAT IT SAYS, AND WHAT IT DOES NOT. (1) The lane's start is SPARSE, not gap-poor: the lane joined holds a median of ONE car within 150 m, so an interior gap (between two cars) does not exist most of the time because there are not two cars, and the road is open. A joiner's gaps come from the stream passing it over the length of the lane (a 300 m window finds one in 78%). (2) The joiners that stop are the ones that arrive WITH traffic around them: those with an interior gap in reach stop 39 to 50% of the time against 7.5 to 14% for those without, three to five times as often. "A gap in reach" here is a proxy for local density and not a measure of opportunity, and it is the confound in every comparison on this probe. (3) A TARGET HELPS A LITTLE WITHIN EACH STRATUM AND NOT AT ALL IN E: target-and-gap against gap-no-target 46.6% against 58.1% in A, 38.2% against 41.9% in E (the second cell is 31 joiners); target-no-gap against neither 11.8% against 19.4% in A, 7.8% against 6.6% in E.** THE MAINTAINER'S TWO BRANCHES, READ HONESTLY: joiners with a target AND a gap in reach who still stop are 38 to 47% of that stratum, which is the branch "the modulation does not execute"; but the gap seen at the lane's start is one the stream carries away at about 25 m/s while the joiner is at 40 to 60 km/h, so a gap AHEAD of it is only reachable if it can exceed the traffic's speed, which `gapTarget` forbids (the wanted speed is capped at the joiner's own desired speed), and a gap BEHIND is reached by SLOWING, which is the way to the state this finding says is nearly absorbing. `[D]` That last is a hypothesis about how this modulation fails and is not tested here: the arm tests it.
**THE STRONG-FORM ARM (E2, E3), UNCHANGED IN DEFINITION, with one addition the probe suggests and the predictions below cover: E2 = every joiner scans (not only those the observation draw admits) and E3 = E2 seeing 300 m; and E4 = E3 with a floor under the speed modulation (a joiner may not slow below a fraction of the traffic's speed to drop in behind a gap, since a joiner that slows to wait has chosen the state it cannot leave). The floor's fraction is `[invented]`, run at 0.5 and 0.7.** PREDICTIONS, COMMITTED BEFORE THEY ARE RUN `[D]` (the maintainer's and mine from the previous commit stand: his under 8% on its own, 0.6, with tightness and braking no worse than A, 0.7; mine E2 10 to 15% 0.5, E3 8 to 13% 0.4, under 8% 0.3, tightness not worse than A 0.8): **E4 is the arm I expect to move the bulk most of the three (0.5 that it beats E3 by at least 3 points), because it is the only one that removes the way a modulating joiner reaches the stopped state; and it still does not clear 1% at 300 cars (0.85).** If E4 does not beat E3, the slowing is not what stops them, and the hypothesis in this paragraph is wrong.

**THE CORRECTED EARLY-ASK RERUN, SCORED `[M]` (scratch tree `cfp`, parts a and ac only, no projected sizing; positional decay; seeds 1 to 3; zero overlaps and zero crashes; the standing queue is gone: a mean of 0 to 0.2 joiners standing).**

| 300 cars | near rest at the end | under 1 s behind | car behind over 3 / over 5 m/s^2 |
|---|---|---|---|
| C, decay S = 1 (comparison) | 4 of 604 (0.7%) | 19.0% | 19.0% / 11.4% |
| early ask + decay S = 1 | 1 of 606 (0.2%) | 18.5% | 17.6% / **12.8%** |
| early ask + clock + decay S = 1 | 1 of 606 (0.2%) | 18.7% | 17.3% / 12.1% |
| decay S = 0.75 alone (comparison) | 0 of 607 (0.0%) | 17.8% | 15.5% / 7.2% |
| early ask + decay S = 0.75 | 4 of 611 (0.7%) | 19.3% | 15.9% / **10.3%** |
| **150 cars:** C S = 1 / early ask + decay / + clock | 1 (0.3%) / 1 (0.3%) / 1 (0.3%) | 12.1% / 9.4% / 9.4% | over 5: 9.5% / 8.3% / 9.0% |

**SCORED AS MADE.** The mainline's early ask makes decay's merges no looser, within two points on both under-1-second and over-5 (0.6): **HIT at S = 1 (18.5% against 19.0%; 12.8% and 12.1% against 11.4%, up by 1.4 and 0.7); MISS at S = 0.75, where over-5 is 3.1 points WORSE (10.3% against 7.2%).** Near rest at or under C's 0.7% (0.8): HIT (0.2%, 0.2%, 0.7%). Under-1-second at least 2 points lower (0.4) and over-5 at least 2 points lower (0.4): MISS at 300 cars; at 150 cars the under-1-second share is 2.7 points lower (9.4% against 12.1%) and over-5 1.2 lower, the one place it moves.
**THE READING, `[M]` for the table and `[D]` for the rest: THE MAINLINE'S EARLY, BRAKING-ONLY COURTESY DOES NOT MAKE DECAY CHEAPER AT 300 CARS, AND AT S = 0.75 IT MAKES THE HARD BRAKING A LITTLE WORSE. The maintainer's reading (that the aggression is partly an artifact of the missing response) is therefore NOT tested by this arm, which gives the follower the same single response, braking, earlier; it is tested by MOVE, which gives it a second one.** What the rerun does establish is that the corrected sizing makes the early ask harmless (no queue) and useful at the bulk when alone (14.9%), and adds nothing once decay is there.

**THE MOVE ARMS, SCORED `[M]` (scratch tree `cfm`; seeds 1 to 3; zero overlaps and zero crashes throughout; `moves` is the number of mainline cars that moved over for a joiner).**

| 300 cars | near rest at the end | 60 s+ tail | moves per seed (of about 186 merges) | standing at once (mean) | under 1 s behind | car behind over 3 / over 5 m/s^2 |
|---|---|---|---|---|---|---|
| A as built | 126 of 628 (20.1%) | 16 | | 6.7 | 8.7% | 15.1% / 2.8% |
| **M, move over for a joiner** | **111 of 621 (17.9%)** | 7 | 66, 52, 65 | 5.0 | 9.5% | 15.1% / **3.8%** |
| decay S = 0.75 alone (comparison) | 0 of 607 | 0 | | | 17.8% | 15.5% / 7.2% |
| **M + decay S = 0.75** | 2 of 605 (0.3%) | 0 | 44, 39, 45 | 0 | 16.5% | 15.6% / **8.8%** |
| decay S = 1 (comparison) | 4 of 604 (0.7%) | 0 | | | 19.0% | 19.0% / 11.4% |
| **M + decay S = 1** | 1 of 609 (0.2%) | 0 | 46, 36, 43 | 0 | 16.3% | 18.5% / 10.0% |
| **150 cars:** A / M | 13 (4.1%) / 12 (3.8%) | 0 / 0 | 16, 17, 20 | | 6.4% / 6.9% | over 5: 1.8% / 1.8% |

**SCORED AS MADE. THE MAINTAINER'S PREDICTION MISSES AND MINE LANDS IN ITS 0.1 BRANCH.** M alone under 8% at 300 cars (his 0.6; mine 0.4): **MISS, 17.9%, a 2.2 point cut that is inside the as-built seed spread (17 to 25%); mine at 8 to 16% (0.5) MISS by under two points; mine above 16% (0.1) HIT.** Unlike decay it REDUCES hard braking (his): **MISS, over 3 m/s^2 is unchanged (15.1%) and over 5 m/s^2 is a point HIGHER (3.8% against 2.8%)**; mine (over 3 below A's 15.1%, 0.6; over 5 not above 2.8%, 0.7) MISS both. The tail not worse than 16 (0.8): HIT (7); zero overlaps and crashes (0.9): HIT. THE COMBINED ARMS: M + S = 0.75 near rest at or under 1% (0.8) HIT (0.3%); over-5 at least 1.5 points below decay alone's 7.2% (0.5) **MISS: 8.8%, 1.6 points WORSE**; under-1-second below 17.8% (0.45) HIT (16.5%); M + S = 1 over-5 at least 2 points below 11.4% (0.5) MISS (10.0%, 1.4 below, under the bar); under 1 s 16.3% against 19.0% (2.7 lower, not predicted).
**THE READING, `[M]` FOR THE TABLE: MOVING OVER, IN THE FORM BUILT, IS NEARLY INERT ON THE BULK AND DOES NOT MAKE DECAY CHEAPER. THE MAINTAINER'S OPEN READING (that decay's cost is partly an artifact of the missing second response) IS NOT SUPPORTED AT THIS REACH: with it, decay's hard braking is 1.4 points lower at S = 1 (10.0% against 11.4%) and 1.6 points HIGHER at S = 0.75, and its under-1-second share 1.3 and 2.7 points lower.** The effect is small and the two strengths disagree about its sign.
**WHAT IT IS NOT: A NULL FOR MOVING OVER. It is a null for THIS arm, whose reach is stated so it is not mistaken for more:** the nearest car behind each joiner, only if courteous, only if it anticipates (one draw per joiner), and only if the lane beside it has a gap its own test accepts. **A mover accompanies about a third of the merges (66 of about 186 per seed), so it is not that the arm rarely fires; a mover is present and the bulk still barely moves.** `[D]` Likely reasons, NOT TESTED: the lane a mover leaves has a gap behind it only after the mover has gone, and the joiner, still slow, is not positioned to take it; one mover opens one gap; and the joiner's stop is decided by its own speed (the absorbing-state finding), not by whether a space exists somewhere on the lane. The whole stream moving over (Jay's account) is untested.
**THE PRICING THE MAINTAINER ASKED FOR, WITH BOTH OF THE MAINLINE'S RESPONSES AVAILABLE, IS NOW IN `[M]`: the mainline's responses as built (courtesy widened, an early ask, a move over) each move the bulk by at most five points and do not change what positional decay costs by more than about three points either way. The only things that clear the bulk are positional decay (S = 0.5 to 0.75) at 6.3 to 6.8% over 5 m/s^2 and, if it works, keeping the joiner moving.** No decay strength is recommended here: the trade is as measured and Jay rules on it.
**A CORRECTION TO MY OWN DEFINITION OF E4 BEFORE IT IS BUILT: `gapTarget` ALREADY FLOORS THE WANTED SPEED AT 0.5 OF THE GAP'S SPEED (`Math.max(0.5 * g.v, ...)`), so "a floor at 0.5" is the existing behaviour and not an arm.** E4 is the floor RAISED, run at 0.7 and 0.85 (`[invented]`); the prediction for it (beats E3 by at least 3 points 0.5; does not clear 1% at 300 cars 0.85) is unchanged. E2 (every joiner scans) and E3 (E2 seeing 300 m) are built as defined.

**THE MAINTAINER'S EXPLICIT UPDATE (11 November), RECORDED AS HIS WITH THE EVIDENCE FOR IT: THREE PREDICTIONS IN A ROW WERE WRONG IN THE SAME DIRECTION, AND ALL THREE PLACED THE LEVER ON THE MAINLINE'S SIDE.** (1) Mainline cooperation primary: refuted (the widened courtesy moved the bulk 3.5 points and made the tail worse; the early ask, corrected, 5 points). (2) Need-based decay cheap and sufficient: refuted (cheap and small). (3) Moving over reducing hard braking: refuted (an unchanged over-3 share, over-5 a point higher). Each mainline response built, widened courtesy, the early ask, moving over, shifts the bulk by at most five points, and none changes decay's cost by more than about three. **HIS UPDATE: THE MERGE IS DOMINATED BY THE JOINER'S OWN SPEED, AND HE WILL STOP PROPOSING COOPERATION VARIANTS.** It unifies the table, including why a mover accompanying a third of merges barely moves the bulk: cooperation opens a gap, and cannot give back speed already lost. `[D]` **STATUS: A WORKING HYPOTHESIS, NOT A MEASURED FINDING. The thing it rests on ("the joiner's stop is decided by its own speed") was the agent's untested guess about why MOVE did so little; what is measured is the absorbing-state arithmetic (a joiner at rest needs about eleven times the gap of a matched one) and the three misses. E2 to E4 are the decisive test, and are scored as that.**
**THE COROLLARY, RECORDED CAREFULLY BECAUSE IT IS NOT "JAY WAS WRONG": his description of real traffic is almost certainly accurate. In real traffic cooperation PREVENTS the stall, because it acts early, while everyone still has speed; in this simulation the stall has already been caused by the joiner's own speed management before any cooperation could matter, so we are measuring his mechanism in a world where its moment has passed.** The claim is that cooperation is plausibly a SECOND-ORDER effect that only becomes visible once joiners stop stalling, so it cannot be priced until the joiner side is right. **THAT IS A DIFFERENT CLAIM FROM "IT DOES NOT HELP", AND THE RECORD SAYS THE SECOND THING AND NOT THE FIRST.** **ONE LIMIT, FROM THE TABLES, SO THE UPDATE IS NOT OVERSTATED `[M]`: cooperation as built already carries a great deal of the LONG TAIL (with the as-built courtesy switched off, same seeds, joiners with a minute or more of total time at rest at 300 cars were 73 against 16 with it on, and the median rest 44 s against 14 s). The mainline levers that failed are the NARROW ones added on top (one driver, courteous only, anticipating only).** Nothing here says the mainline does not matter; it says three more narrow versions of it do not move the bulk.
**TWO HOLDS (the maintainer's): (1) NO STRENGTH IS RECOMMENDED AND JAY RULES ON THE TRADE: the recommendation does not drift in while the joiner side is unresolved, because the whole trade may dissolve if speed modulation works. (2) THE WHOLE-STREAM MOVE-OVER STAYS UNTESTED AND UNPROPOSED: given joiner-side dominance it is not worth the runs.** If any of E2 to E4 clears the bulk without taking anything from the mainline, that is the answer and it is put to Jay as a RECOMMENDATION, not a trade.
**THE PATTERN WORTH MORE THAN ANY FINDING (the maintainer's count, recorded as his): the correction of the E4 definition (`gapTarget` already floors the wanted speed at 0.5, so the "arm" was the existing behaviour) is the fifth invalid-mutation catch of the day. A change that silently does nothing and is then credited with a result is the most frequent error in this project, and not one has survived to the record.** The catches are by construction: a check that the mutation fires (the neutrality arm, the `moves` count, the standing counts), and reading the code for what already exists before building the arm.

**THE STRONG-FORM SPEED-MODULATION ARMS, SCORED `[M]` (scratch tree `cfm`; seeds 1 to 3; scanning on the approach in every arm; zero overlaps and zero crashes throughout). The decisive test the maintainer named.**

| | near rest at the end | 60 s+ tail | standing at once (mean) | under 1 s behind | car behind over 3 / over 5 m/s^2 |
|---|---|---|---|---|---|
| **300 cars** A as built | 126 of 628 (20.1%) | 16 | 6.7 | 8.7% | 15.1% / 2.8% |
| E (scanning on the approach, the admitted joiners) | 100 of 617 (16.2%) | 1 | | 8.8% | 15.2% / 2.6% |
| **E2 every joiner scans** | **68 of 598 (11.4%)** | 4 | 3.1 | 9.7% | 10.8% / 3.3% |
| E3 = E2 seeing 300 m | 76 of 615 (12.4%) | 3 | 4.4 | 9.8% | 13.0% / 3.7% |
| E4a = E3, the floor under the modulation at 0.7 | 87 of 607 (14.3%) | 2 | 2.9 | 10.6% | 12.0% / 2.7% |
| E4b = E3, the floor at 0.85 | 89 of 621 (14.3%) | **13** | 4.9 | 9.6% | 15.8% / **5.3%** |
| **150 cars** A / E2 / E3 / E4a / E4b | 13 (4.1%) / 10 (3.2%) / 12 (3.8%) / 13 (4.1%) / 13 (4.2%) | 0 | | 6.4 / 5.4 / 5.4 / 4.7 / 5.8% | over 5: 1.8 / 2.1 / 3.2 / 4.3 / 2.2% |

**THE SWITCHES FIRED, CHECKED BECAUSE A CHANGE THAT SILENTLY DOES NOTHING IS THIS PROJECT'S COMMONEST ERROR `[M]`: the probe's environment echo does not record MODALL, GAPLOOK or FLOOR, so the share of joiners that ever hold a gap target was measured under each (one seed, 100 s, `lane-gaps.mjs`): E 69%, E2 98%, E3 100% (the look of 300 m always finds a car). MODALL and GAPLOOK are shown to act. FLOOR is NOT directly verified: its arms differ from E3 (gap median 3.5 against 3.1 s), and the changed line was read, which is indirect; it is flagged and the probe now should record it.** (Not done in this batch; to be added.)
**SCORED AS MADE.** THE MAINTAINER'S: speed modulation under 8% near rest at 300 cars on its own (0.6): **MISS, every arm (11.4 to 14.3%)**; tightness and hard braking no worse than A (0.7): HIT for E2, E3 and E4a (under 1 s within 1 to 2 points, over 5 within a point, and over 3 m/s^2 LOWER than A's 15.1%), MISS for E4b (over 5 at 5.3%, tail 13). His fallback ("if it lands near E's 16%, arriving beside a gap is not achievable at that density"): it lands at 11.4 to 14.3%, between A and E and well above the bar, so it is not triggered as worded and it is not confirmed either. MINE: E2 10 to 15% (0.5) HIT (11.4%); E3 8 to 13% (0.4) HIT (12.4%); under 8% (0.3) MISS; tightness and braking not worse than A (0.8) HIT for E2 to E4a; **E4 beats E3 by at least 3 points (0.5): MISS, E4a and E4b are both 1.9 points WORSE than E3 (not distinguishable from it); and does not clear 1% (0.85): HIT. THE HYPOTHESIS BEHIND E4 (that slowing to drop in behind a gap is what leaves the joiner stopped, so a floor under the modulation should help) IS REFUTED AS TESTED: raising the floor did not help, and at 0.85 it made the tail and the braking worse.**
**WHAT THE ARMS SAY.** (1) **E2 IS THE BEST FREE LEVER SO FAR: EVERY JOINER SCANNING CUTS THE BULK FROM 20.1% TO 11.4% (and from E's 16.2% by 4.8 points, lower in every seed, 26/21/21 against 38/33/29), WITH NO RISE IN THE UNDER-1-SECOND SHARE (9.7% against 8.7%) OR IN HARD BRAKING (over 5 m/s^2 3.3% against 2.8%, over 3 m/s^2 lower, 10.8% against 15.1%), and with the minute-or-more tail near zero. It takes nothing from the mainline.** (2) **IT DOES NOT CLEAR THE BULK: 11.4% is eleven times the 1% bar, so speed modulation as built, in every form tried, is not the answer on its own, and the question the maintainer set ("if any clears the bulk without taking anything from the mainline, that is the answer") has the answer NO.** (3) Seeing further (E3) and a higher floor (E4) add nothing to E2. (4) At 150 cars none of them moves the bulk (4.1% as built). **THE JOINER-SIDE DOMINANCE HYPOTHESIS IS PARTLY SUPPORTED AND NOT CONFIRMED: the joiner's own behaviour is worth about nine points of the twenty (20.1% to 11.4%) for free, and the other eleven points are still unexplained by either side; positional decay, which is not free, is the only thing that takes them.**
**NOTHING IS RECOMMENDED TO JAY AS A TRADE OR AS A FIX. `[D]` What the record supports putting to him as a RECOMMENDATION-GRADE item is narrow: scanning on the approach with every joiner scanning (E2) is a free improvement (the bulk from 20% to 11% at 300 cars, no measured cost), and it is not a solution. The trade (positional decay, 6 to 7% of merges forcing a hard brake over 5 m/s^2 for the last eleven points) is unchanged and is his to rule on.** The holds stand: no strength is recommended; the whole-stream move-over stays untested and unproposed.
**ONE ARM THIS SUGGESTS, NOT RUN AND NOT PREDICTED IN NUMBERS: E2 + positional decay at reduced strength (the strength arms were run on E, which only the admitted joiners scan), to see whether every joiner scanning lowers the strength needed. It is the only place the joiner-side and the trade meet.**

**THE MAINTAINER'S RULING (11 November): RUN E2 PLUS POSITIONAL DECAY AT REDUCED STRENGTH, AS A LEGITIMATE RETEST AND NOT A REPEAT, AND CLASSIFY THE RESIDUAL.** The strength sweep ran on E, where 69% of joiners held a gap target; E2 is 98%. His refuted hypothesis (that reducing the NEED for compromise reduces its COST) was tested once on a base where most joiners were not scanning. **THE ARMS: E2 + positional decay at S = 0.25, 0.5, 0.75, 300 cars, three seeds** (scratch tree `cfm`; E2 alone, 11.4%, and the E-based sweep are the comparisons).
**HIS PREDICTION, COMMITTED, DELIBERATELY IN THE SHAPE THAT HAS FAILED THREE TIMES SO THE PATTERN IS SCORABLE: E2 + S = 0.5 clears under 2% near rest (0.5), with hard braking over 5 m/s^2 under 5% (0.45), better than the 6.3 to 6.8% that E + S = 0.5 to 0.75 cost.** If it lands at the same cost as the E-based sweep, compromise's price is independent of how much is needed, his model is wrong for the fourth time in the same direction, and he stops proposing need-reduction entirely. **MINE, SEPARATELY: near rest at S = 0.5 is 1 to 3% (0.55); the cost is the SAME as the E-based sweep, over 5 m/s^2 5 to 7% at S = 0.5 and 6 to 8% at S = 0.75 (0.6), because the cost followed the strength applied and not the need (the agent's own earlier reading), and E2 changes who needs it, not what the strength does to those who get it.**
**THE DIAGNOSTIC, THE MAINTAINER'S: THE RESIDUAL IS ELEVEN UNEXPLAINED POINTS OF TWENTY, AND A TRADE IS ABOUT TO BE PUT TO JAY WITHOUT KNOWING WHAT IT IS A TRADE AGAINST.** Classify the joiners that still come to rest under E2. **(a) Was the joiner ever offered an acceptable gap and refused it, or was none ever available? (b) Was it BLOCKED BY ANOTHER JOINER AHEAD OF IT in the acceleration lane?** (b) is a mechanism no arm touches: if joiners queue behind each other, one stalled leader strands everyone behind it, the followers are not independent failures, every arm acts on a joiner's own perception and demand and none helps a car whose problem is the car in front, and it would explain why Jay sees *"a good amount of cars stopped"*: a pile-up, and we have been modelling individuals. If the residual is mostly followers, that is a FOURTH MECHANISM and the lead joiner's stall is the only thing worth fixing, because it cascades.
**THE CLASSIFIER, DEFINED BEFORE IT RUNS (`tools/measure/lane-residual.mjs`; `[invented]` thresholds marked):** each joiner that comes to rest in an acceleration lane (under 0.5 m/s past the slip road's end) is classified at its FIRST rest tick. **FOLLOWER: the car directly ahead in its own lane is itself a joiner standing (under 0.5 m/s) within 40 m (`[invented]`).** Otherwise **HEAD**, and a head is classified over its whole rest: **OFFERED AND NOT TAKEN** (at least one tick at rest with a merge plan whose offered gap is at least its own need, `leadNeed` and `lagNeed` at its own demand, the sim's own definition, so the sim would have taken it and did not), **NONE AVAILABLE** (a plan existed and no tick had an acceptable gap), or **NO PLAN** (never ready to ask). Reported both for every joiner that rested and for those that meet the near-rest definition at the lane's end, with the queue length (joiners standing together) and the followers per head. **THE POSITIVE CONTROL, BECAUSE A CLASSIFIER THAT CANNOT RECOGNISE A KNOWN CASE IS NOT AN INSTRUMENT: the same probe in the earlier hold-sabotage tree (the joiner is made to refuse every gap, `verify-merge` read it as HOLD, 180 s waits at ratio 3.00): almost every head there should read OFFERED AND NOT TAKEN (0.8).** If it does not, the classifier is wrong and nothing it says about E2 counts.
**PREDICTIONS, COMMITTED BEFORE THE PROBE RUNS `[D]`:** of the joiners that come to rest under E2 at 300 cars, FOLLOWERS 40% (25 to 60%) (0.5), so the maintainer's "mostly followers" (more than half) I give 0.3; of the HEADS, NONE AVAILABLE 60% (0.55) and OFFERED AND NOT TAKEN under 15% (0.7) (the earlier longest-waiter diagnosis found a gap at the joiner's own demand on offer for 0 to 1.7 s of waits of 11 to 87 s); of the joiners that meet the near-rest definition at the lane's end, the share that are followers is higher than among all that rest (0.6, because the end of a queue is where the head is, and a head that has already merged leaves its followers there). **WHAT WOULD SAY THE MAINTAINER'S FOURTH MECHANISM IS REAL: followers above half and queues averaging over two cars.**
**HOLDS UNCHANGED (the maintainer's): no strength recommended; the whole-stream move-over unproposed; E2 is reported to Jay as a free improvement that is explicitly not a solution (20% to 11%, the remainder unexplained), and not as a recommendation resting on a residual nobody looked at.**

**THE E2 STRENGTH SWEEP, SCORED `[M]` (scratch tree `cfm`; 300 cars; seeds 1 to 3; scanning on the approach with every joiner scanning; positional decay; zero overlaps and zero crashes throughout).**

| 300 cars | near rest at the end | under 1 s behind | car behind over 3 / over 5 m/s^2 |
|---|---|---|---|
| E2 alone | 68 of 598 (11.4%) | 9.7% | 10.8% / 3.3% |
| **E2 + decay S = 0.25** | 59 of 595 (9.9%) | 13.2% | 12.6% / 3.4% |
| **E2 + decay S = 0.5** | **11 of 580 (1.9%; 1/9/1)** | 16.4% | 12.4% / **5.6%** |
| **E2 + decay S = 0.75** | 1 of 580 (0.2%) | 16.0% | 17.0% / **10.9%** |
| the E-based sweep, S = 0.25 / 0.5 / 0.75 | 8.6% / 2.7% / 0.7% | 13.5 / 17.1 / 17.5% | over 5: 4.1 / 6.3 / 6.8% |

**SCORED AS MADE. THE MAINTAINER'S, E2 + S = 0.5: under 2% near rest (0.5) HIT, barely (1.9%, 11 joiners, and one seed holds 9 of them); hard braking over 5 m/s^2 under 5% (0.45) MISS (5.6%); "better than the 6.3 to 6.8%" is true of S = 0.5 (5.6% against 6.3%) and false at S = 0.75 (10.9% against 6.8%).** HIS STATED CRITERION ("if it lands at the same cost as the E-based sweep, compromise's price is independent of how much is needed, his model is wrong for the fourth time and he stops proposing need-reduction"): **THE COST IS THE SAME WITHIN THE NOISE (5.6% against 6.3% at S = 0.5, about 32 hard-brake events against 37; 10.9% against 6.8% at S = 0.75 is the other way), so the criterion is MET and the sweep traces the same curve with every joiner scanning as with a minority scanning.** MINE: S = 0.5 near rest 1 to 3% (0.55) HIT; the cost the same as the E-based sweep, over 5 m/s^2 5 to 7% at S = 0.5 (0.6) HIT, 6 to 8% at S = 0.75 MISS (10.9%, higher). `[D]` The S = 0.75 figure may be noise (about 63 events from three seeds); the sweep is not repeated and the pattern is not claimed beyond what it shows.
**THE RESIDUAL, CLASSIFIED `[M]` (`tools/measure/lane-residual.mjs`, E2, 300 cars, 3 seeds, 180 s: 598 joiners; 85 came to rest; the classifier is the one defined and committed before the run, plus a refinement below that is POST-HOC AND FLAGGED).**
**THE POSITIVE CONTROL PASSED: in the hold-sabotage tree every one of the 4 heads read OFFERED AND NOT TAKEN (0.8: HIT), and the other 146 joiners that rested were followers (a queue of 37.5 standing per head).** A classifier that recognises a known case is an instrument; this one does, and it recognises the follower case too.
**WHO IS STILL STOPPED, AS COMMITTED: FOLLOWERS 47 of 85 (55%) of the joiners that rested (70%, 25%, 60% by seed), 26 of 63 (41%) of those meeting the near-rest definition at the lane's end; 38 heads, whose queues average 2.4 joiners standing per head (3.0, 1.4, 2.8; maximum 11).** SCORED: followers 40% (25 to 60%) (0.5) HIT (55%); "mostly followers" (above half, which I gave 0.3 and the maintainer held) HIT for all that rested and NOT for those at the lane's end; followers a higher share among those at the end than among all that rested (0.6) MISS (41% against 55%). **THE MAINTAINER'S FOURTH-MECHANISM CRITERION ("followers above half and queues averaging over two cars") IS MET on the joiners that rested (55%, 2.4) AND NOT MET on the lane-end measure (41%), because the lane-end definition (within 15 m of the taper) catches the head and one or two followers and misses the rest of a queue behind them.** `[D]` THE HEADLINE "NEAR REST AT THE END" IS THEREFORE MOSTLY A COUNT OF HEADS AND THE FIRST FOLLOWER; the pile-up Jay watches is larger than the figure that has been quoted all evening, and every arm acted on heads and moved the pile-up through them. The multiplier is 85 joiners at rest for 38 heads, about 2.2 per head.
**THE HEADS, AS COMMITTED (a gap acceptable for AT LEAST ONE TICK): 30 of 38 (79%) read OFFERED AND NOT TAKEN, 8 NONE AVAILABLE, 0 NO PLAN. SCORED: none available 60% (0.55) MISS (21%); offered and not taken under 15% (0.7) MISS (79%), the opposite of the prediction.** THAT VERDICT STANDS AS THE COMMITTED ONE AND IS NOT QUIETLY REPLACED. **THE REFINEMENT, DECIDED AFTER SEEING THE 79%, FLAGGED AS POST-HOC: a gap acceptable for one tick is not one the sim could take (it decides every 0.5 s, requires every car beyond the first ahead to clear its own lead need, and looks first), so the longest CONTINUOUS acceptable run was measured with those conditions added. RESULT: of the 38 heads, 8 never had an acceptable gap, and the other 30 had one for LESS THAN 0.5 s at their best; none had one for 0.5 s or more. The positive control separates cleanly: its 4 heads had runs of 2 s or more.** So by the refined, stricter definition EVERY HEAD IN E2 HAD NO USABLE GAP (the prediction "none available" would have been right, at 100% and not 60%), and the 79% was single ticks in which the stream's holes passed too fast to be taken. **THE REFINEMENT IS SUPPORTED BY THE CONTROL AND CHOSEN AFTER THE FACT; both verdicts are recorded.**
**WHAT THE RESIDUAL IS `[D]` AND WHAT IT IS NOT: THE ELEVEN UNEXPLAINED POINTS ARE HEADS THAT HAD NO USABLE GAP (the near-absorbing state: a joiner that has lost its speed needs eleven times the gap) PLUS THE FOLLOWERS QUEUED BEHIND THEM, who are not independent failures, about 2.2 joiners per head. It is NOT heads that were offered a gap and refused it.** No new mechanism is needed to explain the heads: they are the same one as before, and what is new is the cascade, which multiplies each head by about two. **WHAT FOLLOWS: nothing in the arms is wrong, and what each arm removes is a head and everyone queued behind it; the follower count is a reason to report the pile-up (joiners at rest, in any position, per minute) beside the lane-end share, not a separate thing to fix. (The maintainer's "the lead joiner's stall is the only thing worth fixing, because it cascades" is the same statement.)**
**THE DIGEST ITEM THIS ADDS: "how many cars were stood on the ramp at once, and how many of those were waiting behind another", beside the lane-end share.**

**THE MAINTAINER STANDS DOWN FROM NEED-REDUCTION ENTIRELY (11 November), AS HE SAID HE WOULD: HIS CRITERION IS MET AND HIS MODEL IS WRONG FOR THE FOURTH TIME. FOUR PREDICTIONS, ALL PLACING THE LEVER SOMEWHERE OTHER THAN THE JOINER'S OWN SPEED, ALL REFUTED (cooperation primary; need-based decay cheap and sufficient; moving over reducing hard braking; reduced decay cheaper once every joiner scans).** A pattern in his judgement, recorded as plainly as the agent's own.
**A CORRECTION TO OUR OWN REPORTING, NOT A FOOTNOTE: THE HEADLINE METRIC UNDERSTATES THE PROBLEM. "Near rest within 15 m of the taper" catches a head and one or two followers and misses the rest of the queue (2.4 joiners standing per head, 2.2 at rest per head). EVERY FIGURE QUOTED ABOUT THE LANE END IN THIS RECORD, THE 20%, THE 11%, THE 0.7%, IS MOSTLY A HEAD COUNT, AND THE PILE-UP JAY WATCHES IS LARGER THAN ANY NUMBER GIVEN TO HIM.** What each arm removes is a head and the queue behind it, so the arms' relative standing is not changed by the metric, but their size in the units Jay sees is: the standing-at-once figure (the probe has carried it since the P arm) and joiners at rest in any position are the pile-up, and the digest reports them beside the lane-end share.
**THE HEADS HAVE NOTHING TO TAKE (the maintainer's reading of the refined classification, which is the measurement's): of 38 heads, none ever had a usable gap, once the conditions the sim operates under are applied; the 30 that looked offered-and-refused had single ticks of stream holes passing too fast to take, and the control (2 s runs) is what makes it believable.** **THAT IS A FACT ABOUT THE MAINLINE STREAM, NOT THE JOINERS, AND THE FIRST THING ALL EVENING THAT NO JOINER-SIDE MECHANISM COULD EVER FIX.**
**THE NEXT MEASUREMENT, POINTED AT THE STREAM (the maintainer's): THE MAINLINE'S HEADWAY DISTRIBUTION, THE SPREAD AND NOT THE MEAN.** His hypothesis: **our stream may be too evenly spaced to ever offer a gap; real traffic at high density is bunchy (holes, platoons, stragglers); if ours arranges itself into a near-uniform wall at 300 cars then no gap ever opens, cooperation makes one gap in a wall and achieves nothing (MOVE's null), and decay works only because taking a half-second gap is the only option left: one cause, every symptom.** Not another cooperation mechanism: the structure of the stream, upstream of anybody's behaviour.
**THE PROBE (`tools/measure/stream-gaps.mjs`): (1) TIME HEADWAYS AT A CROSS-SECTION of the lane each acceleration lane merges into, taken 30 m past the node's box, BEFORE any joiner has merged (the stream as offered): count, mean, standard deviation, COEFFICIENT OF VARIATION (a Poisson stream is 1 and a perfectly even wall is 0), quantiles, flow, and the share of headways and the rate per minute of holes at or above the sim's OWN gap needs from `lagNeed` (`needgap.mjs`: 2.0 s for a joiner at 80 km/h, 3.4 s at 60, 5.0 s at 40, 9.0 s from rest, against a 100 km/h stream; thresholds 0.5, 1, 2, 3.4, 5, 9 s), at 60, 150 and 300 cars, three seeds each. (2) HOW HEADS LOSE THEIR SPEED, in A and in E2 at 300 cars: for each joiner that rests and is a head (the classifier of `lane-residual.mjs`), the distance to the taper's start at its first rest tick (stopped AT the taper, or short of it), its speed at each tenth of the lane against joiners that merged without stopping, and whether it was ever holding a gap target below its own speed (hanging back for a gap) before it stopped.**
**PREDICTIONS, COMMITTED BEFORE ANYTHING RUNS `[D]`. THE MAINTAINER'S: the headway spread at 300 cars is far narrower than real traffic, the coefficient of variation falls sharply as density rises, and holes of 2 s or more near the taper are close to absent at 300 cars while common at 150 (0.65); if instead the spread is wide and holes exist but the joiners cannot reach them in time, the problem is the joiner's positioning after all and he is wrong a fifth time. MINE, SEPARATELY, AND OPPOSED: the stream at the cross-section is NOT a uniform wall at 300 cars (coefficient of variation 0.6 to 1.0 at 150 and at 300, a fall from 60 cars to 300 of under a third) (0.55), because the curb lane near an entrance is sparse (the lane-gaps probe found a median of ONE car within 150 m of a joiner at the lane's start at 300 cars, and an interior gap within 300 m for 78% of joiners), and holes of 2 s or more are COMMON at 300 cars (over 30% of headways, 0.6); WHAT IS RARE AT 300 CARS IS THE 9 S HOLE A STOPPED JOINER NEEDS (under 5% of headways, 0.6), which is the absorbing-state finding seen from the stream's side and not a fault in the stream.** If the stream has 2 s holes and the joiners stop anyway, the stream is not the root cause and the joiner's speed management is, again, which is the maintainer's own stated alternative. Heads: stopped AT the taper (within 3 m of its start) in at least 60% of cases (0.55), hanging back for a gap target at some point before stopping in at least a third (0.4). **ALSO PREDICTED, AS THE POINT OF READING THE THRESHOLDS: a 2 s hole is no use to a joiner that is not already near the stream's speed (it needs 22 m at matched speed and 249 m from rest), so the hole sizes that matter are the ones that matches the joiner's speed on arrival, and the stream supplies those holes about as often at 300 cars as at 150 for a MOVING joiner and almost never for a STOPPED one.**
**THEN, BEFORE ANY FURTHER ARMS (the maintainer's): E2 GOES INTO THE REPO BEHIND A SWITCH, OFF BY DEFAULT. It is the one free, measured improvement we have and it should not exist only in a scratch tree; gated properly. (The maintainer writes Jay's report himself: the trade, E2 and the pile-up correction, in his terms; not drafted here.)**

**JAY'S RULING ON THE GAP A STOPPED JOINER LOOKS FOR (11 November, verbatim; `[Jay]`; the most consequential ruling of the day):** *"the driver stopped there will eventually have to just floor it into traffic and drivers either will or will not be able to evade them. a driver in this situation is probably so unskilled they shouldn't be on there in the first place so causing a major disruption is the likely outcome. wherever it stems from, looking for a 9 second gap around a merge lane is almost backward logic. that driver is beginning to look for a smaller and smaller acceptable gap as their drivable space concludes. being in that position will incite that primal fear of impending death in the wrong circumstance. absolutely something to be avoided at all costs. tolerance for close driving (within that typical 2-3s gap) is higher here than normal, it's just what has to happen to allow vehicles of different speeds to come together within a horizontally and vertically restricted space. people controlling each car is what makes it possible. driving is a social activity as much as anything else."*
**WHAT IT DECIDES, AS RECORDED (the maintainer's reading, each item marked):** (1) **THE 9 S IS WRONG, AND IS NOW `[Jay]`-CONTRADICTED, NOT MERELY `[invented]`:** around a merge, tolerance for close driving is HIGHER than normal, within the typical 2 to 3 s gap, so the need at a merge belongs at or below 2 to 3 s; fix the table, do not work around it. (2) **POSITIONAL DECAY IS HIS MECHANISM, IN HIS OWN WORDS: "a smaller and smaller acceptable gap as their drivable space concludes": space concluding, not time waited. The positional form was his all along and the NEED-BASED FORM WAS THE AGENT'S/THE MAINTAINER'S-AGENT'S, dead on his authority as well as on the measurements.** (3) **WAITING FOREVER IS ITSELF THE DEFECT: "will eventually have to just floor it into traffic".** A stopped joiner must not sit indefinitely; it forces its way in and the consequence is a MAJOR DISRUPTION, not a resolved merge: the absorbing state should resolve BADLY, not persist. **A BEHAVIOUR TO BUILD, NOT BUILT; AND A FLAG BEFORE ANYONE RE-TUNES: once joiners force in, "near rest at the lane end" stops being the right measure and the DISRUPTION is the thing to count.** (4) **IT SHOULD BE RARE AND TIED TO LOW SKILL ("so unskilled they shouldn't be on there in the first place"): the frequency should fall off sharply with driver skill, which is a shape to check and not a rate to guess.** (5) **A FEEL REQUIREMENT, A DESIGN GOAL AND NOT A CORRECTNESS ONE, UNDER THE LEGIBILITY STANDARD: being stuck there should "incite that primal fear of impending death" and be "avoided at all costs": the state must READ AS FRIGHTENING to the player, and the AI weights avoiding it very heavily. The first emotional target ever stated for a traffic state.** (6) **A STANDING DESIGN PRINCIPLE, WHICH REACHES BEYOND MERGING: "people controlling each car is what makes it possible. driving is a social activity as much as anything else."** Traffic is a continuous negotiation between drivers, with gap arithmetic on top, and merging is the clearest case; it vindicates the recorded corollary that cooperation is real and works BEFORE the stall, which is why it measured as null when tested after.
**WHERE THE 9 SECONDS COMES FROM, `[M]` (`tools/measure/needgap-parts.mjs`, which prints what the sim computes; the stream at 100 km/h, kappa 1): THE JOINER AT REST NEEDS 249 m BEHIND IT. IT IS THE SUM OF THREE TERMS: 21.5 m of standstill gap and headway (2.0 m + 0.7 s of 27.8 m/s), 152 m of `wantedGap`'s DYNAMIC CLOSING TERM (`v * closing / (2 * sqrt(accel * brake))`, 27.8 x 27.8 / 5.1), and 76 m of `shedOf` (`closing^2 / (2 * (brake + the joiner's acceleration))`, 27.8^2 / 10.2). THE CLOSING SPEED IS CHARGED TWICE.** Charged once it is 173 m (6.2 s) with the following model's own term, or 97 m (3.5 s) with the explicit one; at 60 km/h 82 m or 34 m against the table's 95 m. **THAT IS THE DEFECT CLASS OF THE DAY: two implementations of one quantity, and a bug, not a tuning choice.** HISTORY, `[M]` from the log: the dynamic term is the following model's (in its present form from 29 September, earlier form not traced); the explicit shed term was ADDED ON 21 OCTOBER (DECISIONS 10.15, commit `86b7cb9`, the 22 October change extracting `lagNeed`) to fix a DIFFERENT symptom (joiners standing for minutes on a near-empty highway), on a quantity that already contained the closing speed; and the same commit message records the need as "330 m for a timid joiner at rest" as an observation, not as a problem. The same double charge is in `leadNeed`.
**EVERY CONSTANT BEHIND IT, MARKED (the standing rule):** `STANDSTILL` 2.0 m: `[invented]` (the code says "a real figure, not derived"); `HEADWAY` 0.7 s: a character number, "on the maintainer's instruction to close it up for pace" per the code comment, `[Jay, per a code comment; the words are not re-checked here]`; `ACCEL` 2.4 m/s^2: `[invented]`; `BRAKE` 2.7 m/s^2: `[D]` from the old engine's approach constants (CLAUDE.md: the rate that stops the straight cruise in the approach run); `MOST_BRAKE` 8.0: `[invented]` ("an emergency stop is about 8"); the sum of the two closing terms: `[invented]` and, in the 249 m, a duplicate. **THE 9 S IS NOT GROUNDED IN ANYTHING: it is the product of unmarked constants and a duplicated term.**
**SELF-CONSISTENCY, THE MAINTAINER'S QUESTION: IS THE JOINER PRICED ON ITS SPEED NOW OR ITS SPEED WHEN IT ARRIVES?** READ, `[M]` for the code and `[D]` for the size: `lagNeed` is evaluated every consideration at the joiner's CURRENT speed, so a joiner seeking while it accelerates is charged for a closing speed it will not have when it is in the lane (a blend takes about three seconds, about 7 m/s more from rest). The shed term does include the joiner's own acceleration, so it is partly projected, and the dynamic term (the following model's, with the FOLLOWER's acceleration and braking) is not. So the answer is partly: there are two defects, the duplicate (a bug, measured) and the current-speed pricing (a reading, smaller), and Jay's ruling makes the magnitude wrong regardless of either.
**CORRECTIONS TO EARLIER ENTRIES, WHICH THIS SUPERSEDES: "STOPPING IS VERY NEARLY AN ABSORBING STATE" (recorded as a finding) IS A PROPERTY OF THIS TABLE, NOT OF TRAFFIC: the eleven-times ratio is the duplicate and the unmarked constants, and Jay says a real driver floors it instead of waiting for such a gap. The absorbing-state paragraph, the speed-modulation reading built on it, the gap-supply thresholds (2.0, 3.4, 5.0, 9.0 s) in the stream probe's design, and every merge-side measurement of the evening, carry this table. The mainline-side nulls (courtesy widened, the early ask, moving over) were measured against a joiner that needed 249 m: they may not survive the correction, and the corollary ("cooperation is second-order, visible once the joiner side is right") is now testable.**
**THE REVISED ORDER (the maintainer's): (1) where the 9 s comes from: DONE above. (2) CORRECT THE TABLE TO HIS 2 TO 3 S CALIBRATION, AS `[Jay]`, AND RE-MEASURE THE WHOLE ARM SET AGAINST IT: most of the evening's findings may move and several conclusions may dissolve. (3) THEN the stream probe, THEN E2 behind a switch in the repo. NOTHING IS ADOPTED UNTIL THE RE-MEASUREMENT, INCLUDING E2.**
**THE ARMS (scratch tree `cfq`, from the scratch tree of the arms, a counterfactual, nothing in `src/`): TABLE = D, the closing speed charged ONCE, with the following model's own term (the explicit shed dropped; which of the two to keep is a judgement `[invented]`, and the other's numbers are above); C, THE CAP: a joiner's need, behind and ahead, is at most TOL x the speed of the car it is measured against, with the physical floor (the car behind can stop at its hardest braking) kept; TOL = 2.5 s, the midpoint of `[Jay]`'s 2 to 3 s and `[invented]` within it, run at 2 and 3 s as the sensitivity; applied in the merge only (a lane change of choice is unchanged, Jay's calibration being about merges), including the offerer's gap in `courtesy.js`; DC, both.** Arms: A with D, C, DC at 300 and 150 cars; E2, positional decay S = 0.5, E2 + S = 0.5 and decay S = 1 with C at 300 cars; three seeds; the probe now records the CLOSING SPEED at the merge (the car behind's speed minus the joiner's) and the share of merges that begin more than 10 m/s below the stream (`[invented]`), because the near-rest share may collapse because joiners merge slowly into a fast stream, and that is the disruption, not a resolution.
**PREDICTIONS, COMMITTED BEFORE ANY ARM IS RUN `[D]`.** THE MAINTAINER'S: THE NEAR-REST SHARE COLLAPSES WITHOUT ANY DECAY AT ALL, under 5% at 300 cars (0.6, from his projected-speed prediction), hard braking no worse than arm A (0.55); and both E2's benefit and decay's cost SHRINK, because both were compensating for the 9 s. This is the fifth time he has predicted something other than compromise would work; it is a new class (the quantity itself) and is scored ruthlessly. MINE, SEPARATELY: D alone (the duplicate removed, the rest unchanged) moves the near-rest share only a little at 300 cars, 14 to 19% (0.5), because a joiner at rest still needs 173 m (6.2 s); C alone COLLAPSES it, to 1 to 6% (0.55) (under 5%, 0.6, agreeing with him), DC is within 2 points of C (0.7). **BUT THE COLLAPSE IS NOT THE SAME AS A RESOLUTION: with C, hard braking over 5 m/s^2 in arm A RISES from 2.8% to 4 to 9% (0.5), and the closing speed at the merge rises (10 to 25% of merges begin more than 10 m/s below the stream, 0.5), because joiners that used to stand now merge slowly into 2.5 s gaps; that is "ugly" in Jay's sense and a disruption in the sense of his point (3), and it is the thing to count.** E2's benefit under C is under 3 points of near rest (0.6); positional decay at S = 0.5 adds under 3 points of hard braking over 5 m/s^2 above C alone (0.5), because the near rest it cleared is already gone; zero overlaps and zero crashes in every arm (0.8, the physical floor kept). **WHAT WOULD SAY THE MAINTAINER'S "MOST FINDINGS DISSOLVE" IS RIGHT: the near rest under C is under 5% without decay, E2's and decay's effects both under 3 points. WHAT WOULD SAY THE 9 S WAS NOT THE ROOT: C leaves the share above 10%.**
**NOT BUILT, AND FLAGGED SO NOBODY MISTAKES THE ARMS FOR IT: the forcing-in behaviour of Jay's point (3), the skill-dependence of point (4), the feel of point (5). The arms correct a number; they do not build the behaviour he described, which is a separate piece of work with its own measures.**

**THE TABLE-CORRECTION ARMS, SCORED `[M]` (scratch tree `cfq`; seeds 1 to 3; zero overlaps and zero crashes in every arm. NEUTRALITY: with the table unset, A reproduces 51/208 at 300 cars and 5/102 at 150, so the arms are comparable. D = the closing speed charged once; C = a merge's need capped at TOL x the speed it is measured against, TOL = 2.5 s unless stated).**

| 300 cars | near rest at the end | 60 s+ tail | standing at once (mean) | under 1 s behind | car behind over 3 / over 5 m/s^2 | merges beginning over 10 m/s below the stream |
|---|---|---|---|---|---|---|
| A as built | 126 of 628 (20.1%) | 16 | 6.7 | 8.7% | 15.1% / 2.8% | 22% (one seed) |
| **A + D (closing charged once)** | **70 of 625 (11.2%)** | 2 | 3.5 | 10.5% | 11.5% / 2.8% | 19.7% |
| **A + C (cap 2.5 s)** | **47 of 618 (7.6%; 12/16/19)** | 0 | 0.6 | 13.7% | 14.3% / 5.3% | 21.4% |
| A + D + C | 38 of 619 (6.1%) | 0 | 0.4 | 13.2% | 13.0% / 4.7% | 22.0% |
| A + C, TOL = 2 s | 33 of 618 (5.3%) | 0 | 0.3 | 12.6% | 17.6% / 8.2% | 24.0% |
| A + C, TOL = 3 s | 68 of 623 (10.9%) | 0 | 1.7 | 13.8% | 13.0% / 4.2% | 20.6% |
| E2 old / **E2 + C** | 68 (11.4%) / **35 of 584 (6.0%)** | 4 / 0 | | 9.7 / 11.6% | over 5: 3.3 / 3.3% | / 25.7% |
| decay S = 0.5, old / **+ C** | 16 (2.7%) / **8 of 613 (1.3%)** | 0 / 0 | | 17.1 / 15.1% | over 5: 6.3 / 6.3% | / 15.4% |
| E2 + S = 0.5, old / **+ C** | 11 (1.9%) / **9 of 576 (1.6%)** | 0 / 0 | | 16.4 / 14.6% | over 5: 5.6 / 4.7% | / 19.1% |
| decay S = 1, old / **+ C** | 4 (0.7%) / 2 of 606 (0.3%) | 0 / 0 | | 19.0 / 15.4% | over 5: 11.4 / 12.1% | / 15.1% |
| **150 cars** A old / A + C | 13 (4.1%) / 9 of 310 (2.9%) | 0 | | 6.4 / 6.9% | over 5: 1.8 / 3.6% | 11% / 16.6% |
| E2 old / **E2 + C** | 10 (3.2%) / **3 of 310 (1.0%)** | 0 | | 5.4 / 5.4% | over 5: 2.1 / 2.5% | / 17.9% |

**SCORED AS MADE: NEITHER THE MAINTAINER'S "COLLAPSE" NOR MINE LANDED; THE 9 S WAS A LARGE PART OF THE ROOT AND NOT ALL OF IT.** THE MAINTAINER'S: near rest under 5% at 300 cars without any decay (0.6) **MISS: 7.6% (5.3% at TOL = 2 s, 10.9% at 3 s)**; hard braking no worse than A (0.55) **MISS: 5.3% against 2.8%**; E2's benefit and decay's cost both shrink: **HIT for both** (E2's benefit under C is 1.6 points of near rest, from 8.7; decay's added hard braking over C is 1.0 point, from 3.5). MINE: D alone 14 to 19% (0.5) **MISS, in the other direction: 11.2%, the duplicate alone takes nine points, the largest single effect of the evening**; C alone 1 to 6% (0.55) MISS (7.6%); DC within 2 points of C (0.7) HIT (6.1 against 7.6); hard braking over 5 m/s^2 rises to 4 to 9% under C (0.5) HIT (5.3%); **the closing speed at the merge rises, 10 to 25% of merges begin more than 10 m/s below the stream (0.5) HIT in range, but not a rise: the as-built figure is 22% (one seed), so the merges were already that slow and the cap does not make them slower**; E2's benefit under C under 3 points (0.6) HIT (1.6); decay S = 0.5 adds under 3 points of over-5 above C (0.5) HIT (+1.0); zero overlaps and crashes (0.8) HIT. **"C LEAVES THE SHARE ABOVE 10%" WOULD HAVE SAID THE 9 S WAS NOT THE ROOT: it leaves 7.6%, 5.3% at 2 s and 10.9% at 3 s, so it is inside the threshold and sensitive to TOL.**
**WHAT IT SAYS `[M]`. (1) THE BUG IS WORTH NINE POINTS BY ITSELF: charging the closing speed once takes the share from 20.1% to 11.2% with no rise in the under-1-second share (10.5% against 8.7%) and none in hard braking over 5 m/s^2 (2.8%). That is a fix to a duplicated quantity, independent of any ruling of Jay's. (2) JAY'S CALIBRATION TAKES IT FURTHER, TO 7.6% (5.3% at 2 s), AT A PRICE: hard braking over 5 m/s^2 doubles (2.8% to 5.3%) and the under-1-second share rises to 13.7%. The share falls monotonically with the tolerance: 5.3%, 7.6%, 10.9% at 2, 2.5 and 3 s, and the hard braking falls the other way (8.2%, 5.3%, 4.2%): TOL is a dial between the pile-up and the hard braking, and `[Jay]` gives it as "2 to 3 s". (3) WHAT DID NOT DISSOLVE: positional decay at S = 0.5 still takes the share from 7.6% to 1.3% for one more point of hard braking, and the END STATE is the same as before: about 1% near rest at about 6% hard braking over 5 m/s^2 (6.3% old, 6.3% corrected, and 4.7% with E2). The table correction changes how much of that path decay has to cover, not where it ends. E2's benefit shrinks from nine points to under two. (4) THE MERGES WERE ALREADY ARRIVING SLOW: about one in five of the build as it is begins more than 10 m/s below the stream, which is the closing speed Jay's point 3 says to count and a different number from the near-rest share.**
**WHAT IS STILL UNEXPLAINED: 5 to 11% of joiners still reach the lane end near rest at 300 cars with the need at Jay's own 2 to 3 s and the duplicate gone.** That is the next question, and it is a joiner-side or stream-side one again. **THE CLASSIFICATION, PREDICTED BEFORE IT RUNS `[D]`: the residual heads classified as before (`lane-residual.mjs`, now asking for the MERGE need), under C at 300 cars, 3 seeds, the unmodified world otherwise. A 2.5 s need is 70 m, so a gap is acceptable for (gap - 70 m) / 27.8 m/s, and a window of 0.5 s needs a hole of about 84 m (3 s).** MINE: the share of heads with a usable gap for 0.5 s or more, who still did not go, is 20 to 60% (0.5): if it is high, there is a joiner-side execution defect (the looks, the decision interval) that the 9 s had been hiding; if it is under 15%, the stream does not offer 3 s holes at the end of the lane often enough and the stream probe (already designed, predictions committed) is next in a stronger form.
**NOTHING IS ADOPTED. WHAT THIS RE-MEASUREMENT SUPPORTS PUTTING TO THE MAINTAINER, AND TO JAY THROUGH HIM, IN THREE LAYERS, EACH SEPARATE:** (a) the duplicate closing-speed charge is a BUG with a measured size (nine points of the lane-end share, no measured cost), and a fix to it does not depend on any ruling; (b) Jay's 2 to 3 s calibration is a design change with a measured price (5.3 to 10.9% near rest against 8.2 to 4.2% hard braking at TOL = 2 to 3 s), and the choice of TOL within his range is his; (c) positional decay, E2 and the rest are unchanged in kind and smaller in size, and what is left after (a) and (b) is not explained.

**THE RESIDUAL UNDER THE CORRECTED TABLE, CLASSIFIED `[M]` (`lane-residual.mjs` now asks for the merge need; scratch tree `cfq`, TABLE = C, 2.5 s, 300 cars, 3 seeds; the world otherwise as built).** 46 joiners came to rest (18 followers, 39%) and 28 were heads, with queues of 1.0, 1.5 and 2.1 standing per head. **Of the 28 heads, 1 never had an acceptable gap, 23 had one for under 0.5 s at their best, 4 for 0.5 to 1 s, and NONE for 1 s or more: 4 of 28 (14%) ever had a usable gap and still stopped.** PREDICTED (20 to 60%, 0.5): **MISS, LOW.** The stated reading of a low value: the stream does not offer holes of about 3 s at the lane's end often enough, so the residual is a fact about the STREAM and the stream probe is next in a stronger form. (A 2.5 s need is 70 m, so a window of 0.5 s needs a hole of about 84 m.) The joiner-side execution defect the 9 s might have been hiding is NOT there: heads that had a usable gap were 14%.
**THE STREAM PROBE (`tools/measure/stream-gaps.mjs`, the design and the predictions committed earlier in this record, unchanged; the thresholds 2.5 s and 3 s are ADDED after the table correction, as the holes that matter under it, and change no prediction):** the cross-section headways at 60, 150 and 300 cars, three seeds, and for the heads at 300 cars, in the build as it is and under C, where they lose their speed.

**THE STREAM PROBE, FIRST HALF, SCORED `[M]` (`tools/measure/stream-gaps.mjs`; time headways of the lane each acceleration lane merges into, 30 m past the node's box, BEFORE any joiner has merged; 4 lanes; seeds 1 to 3; 136, 235 and 331 headways).**

| | 60 cars | 150 cars | 300 cars |
|---|---|---|---|
| mean headway, standard deviation | 11.8 s, 14.8 s | 7.7 s, 7.1 s | **6.2 s, 4.1 s** |
| coefficient of variation (per seed) | 1.31 / 1.26 / 1.19 | 0.89 / 0.86 / 1.03 | **0.72 / 0.66 / 0.59** |
| flow per lane | about 310 veh/h | about 470 veh/h | **about 580 veh/h** |
| headways at or above 2 s / 3 s / 5 s / 9 s | 93 / 82 / 64 / 32% | 91 / 82 / 54 / 26% | **91 / 77 / 53 / 20%** |
| holes per minute per lane at or above 2.5 s / 9 s | 4.6 / 1.6 | 7.0 / 2.1 | **8.0 / 1.9** |

**THE MAINTAINER'S HYPOTHESIS, THAT THE STREAM IS TOO EVENLY SPACED TO OFFER A GAP, IS REFUTED AT THIS CROSS-SECTION.** At 300 cars the curb lane's flow is about 580 vehicles an hour (a 6.2 s mean headway) and 91% of headways are 2 s or more: holes are COMMON at 300 cars, as common as at 150. SCORED AS MADE. HIS: the coefficient of variation falls sharply as density rises: **HIT (1.25 at 60 cars to 0.93 to 0.66, a 47% fall)**; far narrower than real traffic: **NOT SHOWN, and not shown for want of a measured reference: a shifted-exponential headway with a 1 s minimum, a `[D]` modelling assumption and not a measurement, gives a coefficient of variation of 0.84 at a 6.2 s mean, against 0.66 here; narrower, and not a wall**; **holes of 2 s or more near absent at 300 cars and common at 150 (0.65): MISS, 91% at both.** MINE: coefficient of variation 0.6 to 1.0 at 150 and 300 cars (0.55) HIT (0.93 and 0.66 pooled), with a fall from 60 to 300 cars of under a third MISS (47%); holes of 2 s or more common at 300 cars, over 30% (0.6) HIT (91%); **the 9 s hole a stopped joiner needs rare, under 5% of headways (0.6) MISS: 20%, 1.9 a minute per lane. At the node the stream offers a 9 s hole nearly twice a minute.** If the stream at 300 cars has holes of 2 s or more, the maintainer's stated alternative is the one that follows: the joiners do not take them, and `[D]` the cross-section at the node is not the road the joiner sees, because the curb lane alongside the acceleration lane also holds cars that merged earlier and cars that moved right for the lane, which a cross-section taken before any joiner has merged cannot count.
**WHERE THE HEADS LOSE THEIR SPEED, `[M]` (300 cars, 3 seeds; the classifier of `lane-residual.mjs`): THEY DO NOT LOSE IT EARLY. The heads run the lane at speed and brake for its end.** The median speed by tenth of the lane (m/s), heads against joiners that never rested: tenth 0, 5.4 against 7.2; tenths 2 to 7, 17.9 to 21.6 against 18.0 to 19.9; **tenth 8, 17.1 against 18.3; tenth 9, 10.0 against 14.0 (the ones that merged).** So a head travels most of the lane at about 20 m/s (72 km/h) beside a stream near 28, finds no gap on the way, and is stopped at the end by the rule that nobody stands in the taper. **THE SOURCE OF THE STOP IS THE END OF THE LANE, NOT AN EARLIER LOSS OF SPEED: the maintainer's "joiner's own speed dominates" and the absorbing-state account are NOT supported by the heads' own profiles; what a head lacks is a gap during a traverse it makes at speed.** First rest is at a median of 5.3 to 5.5 m short of the taper's start in every seed (the sim's stopping margin): "AT the taper, within 3 m, in at least 60% (0.55)" MISS by my own `[invented]` 3 m threshold (0 of 35 and 0 of 28), and 89% (as built) and 96% (under the cap) of heads come to rest within 10 m of it; hung back for a gap target before stopping in at least a third (0.4): HIT in the build as it is (14 of 35, 40%), MISS under the cap (6 of 28, 21%).
**THE SECOND HALF, THE QUESTION THE FIRST HALF RAISES: IS THE CURB LANE ALONGSIDE THE ACCELERATION LANE, AT THE TAPER, AS FULL OF HOLES AS AT THE NODE?** The probe now also takes the time headways of the same lane at the along-position of the taper's start, with whoever is in it by then (merged joiners and keep-right movers included). PREDICTIONS, COMMITTED BEFORE IT RUNS `[D]`: at 300 cars the taper's mean headway is 2.5 to 4.5 s (0.5), the share of headways at or above 3 s is 20 to 45% (0.55), against 77% at the node, because the curb lane has gained everything that merged and moved right on the way; **the rival, stated so it is not a surprise: if the taper's holes are as plentiful as the node's (3 s or more in over 60% of headways, 0.25), the joiners DO have holes beside them and the failure is in what a joiner does with them, which contradicts the classification (none ever had a usable 0.5 s window) and the classification is what is re-examined.**

**THE STREAM PROBE, SECOND HALF, SCORED `[M]` (the same lane, at the along-position of the taper's start, with whoever is in it by then; seeds 1 to 3; 209, 446 and 678 headways).**

| | 60 cars | 150 cars | 300 cars |
|---|---|---|---|
| mean headway: node / **taper** | 11.8 / **7.8 s** | 7.7 / **4.3 s** | 6.2 / **3.1 s** |
| flow per lane: node / **taper** | 310 / **470 veh/h** | 470 / **830 veh/h** | 580 / **1,150 veh/h** |
| coefficient of variation at the taper | 1.22 / 1.03 / 1.18 | 0.87 / 0.79 / 0.94 | 0.77 / 0.75 / 0.79 |
| headways at or above 3 s: node / **taper** | 82 / **70%** | 82 / **54%** | 77 / **38%** |
| headways at or above 9 s: node / **taper** | 32 / **22%** | 26 / **8%** | 20 / **4%** |
| holes of 3 s or more per minute per lane at the taper | 5.4 | 7.5 | 7.3 |

**SCORED AS MADE: HIT. At 300 cars the taper's mean headway is 3.1 s (2.5 to 4.5, 0.5) and 38% of headways are 3 s or more (20 to 45%, 0.55), against 77% at the node; the rival (3 s or more in over 60% of headways, 0.25) is not what happened.** THE LANE ALONGSIDE THE ACCELERATION LANE IS A DIFFERENT STREAM FROM THE ONE AT THE NODE: its flow DOUBLES between the node and the taper (580 to 1,150 vehicles an hour at 300 cars), because it carries the joiners that merged on the way. **THE NODE'S "HOLES ARE COMMON" WAS TRUE OF THE STREAM AS OFFERED AND IS NOT TRUE OF THE LANE THE JOINERS MERGE INTO.** The maintainer's "too evenly spaced" is still refuted (a coefficient of variation of 0.77 at 300 cars is not a wall), and the classification (no usable 0.5 s window) and the stream agree.
**THE ACCOUNT THIS POINTS AT, `[D]`, from three points and derived quantities: THE RAMP'S DEMAND AGAINST THE LANE'S SUPPLY.** Joiners per entrance, from the lane-end probe's merge counts (3 seeds x 180 s, four entrances): **7.8 a minute at 150 cars (467 an hour) and 15.7 a minute at 300 cars (940 an hour); at 60 cars about 3.3 (the joiner count, an estimate).** The stream's supply at the node of holes of 2.5 s or more per lane: **4.6, 7.0 and 8.0 a minute at 60, 150 and 300 cars.** **DEMAND OVER SUPPLY: ABOUT 0.7, 1.1 AND 2.0, AND THE NEAR-REST SHARE IS 0%, 4.1% AND 20.1%: it appears where demand passes supply, and the ramp at 300 cars is asking a lane that offers about 8 holes a minute to take about 16 joiners a minute.** The load is a property of the loop's design: it is FED ONLY BY ITS ON-RAMPS (`verify-loop`), so every car on it entered by one and the inflow per ramp is the car count over the trip time: 300 cars and about 5-minute trips is 900 an hour a ramp, which is what is measured. **THE CURB LANE'S THROUGH FLOW IS 580 AN HOUR AT 300 CARS AGAINST A RAMP THAT PUTS ABOUT 940 AN HOUR INTO IT: a ratio of about 1.6, which `[D]` is an extreme ramp (a heavy real ramp is a fraction of the lane it joins).** This is a statement about the TEST MAP's traffic and not about driver behaviour, and a real road with that ramp-to-lane ratio would break down too. **WHAT IT PUTS IN DOUBT: every arm of the evening acted on a joiner that has to share a lane with a flow of joiners twice the lane's own, and the near-rest share at 300 cars is largely the loop's turnover and only partly how a driver merges.**
**A DIRECT TEST, A WORLD CHANGE AND NO BEHAVIOUR CHANGE: THE LOOP WITH HALF ITS EXITS (a scratch tree; the off-ramps at two of the four interchanges removed, so a car stays on twice as long and the inflow per ramp roughly halves at the same 300 cars; `LOOPEXITS=2`).** PREDICTIONS, COMMITTED BEFORE IT RUNS `[D]`: joiners per entrance fall by at least a third (0.7); **the near-rest share at 300 cars falls to 2 to 8% as built (0.55), where the load account says it should (the 150-car level, 4.1%, is the comparison); if it stays above 15% the account is wrong, the cause is local to the lane alongside (cars changing lane into it, the speeds) and the demand-over-supply table is a coincidence of three points.** Arms: as built at 300 and 150 cars, and with the corrected table (C) at 300, three seeds. **THIS TEST IS ABOUT THE WORLD AND NOT THE DRIVERS, AND SAYS NOTHING ABOUT WHAT A REAL RAMP CARRIES: that is a ground-truth question for Jay and goes in the batch with the others: how many cars an hour does a busy ramp of the expressway he drives put onto the curb lane, against that lane's own flow, and how long is a typical trip on it.**

**THE HALF-EXITS LOOP, SCORED `[M]` (scratch tree `cfq`; `LOOPEXITS=2`: the off-ramps at two of the four interchanges removed, so a car stays on about twice as long; seeds 1 to 3; zero overlaps and zero crashes throughout; no driver behaviour changed).**

| | 4 exits (as built) | 2 exits |
|---|---|---|
| **300 cars:** joiners (merges) per entrance per minute | 15.7 | **8.8 (down 44%)** |
| near rest at the end, as built: count of joiners (share) | 126 of 628 (20.1%) | **52 of 372 (14.0%; 11/20/21)** |
| with the 2.5 s cap (C) | 47 of 618 (7.6%) | **44 of 359 (12.3%)** |
| 60 s+ tail, as built / with C | 16 / 0 | 27 / 0 |
| hard braking over 5 m/s^2, as built / with C | 2.8 / 5.3% | 3.2 / 5.1% |
| **150 cars:** joiners per entrance per minute | 7.8 | 3.9 |
| near rest as built: count (share) | 13 of 315 (4.1%) | **12 of 176 (6.8%)** |

**SCORED AS MADE.** Joiners per entrance fall by at least a third (0.7): **HIT, 44%.** Near rest at 300 cars 2 to 8% as built (0.55): **MISS, 14.0%**, and the pre-stated refutation ("above 15%, the account is wrong") is not crossed by 1.0 point, which is not the 2 to 8% it was meant to land in. **WHAT IT SAYS: THE LOAD ACCOUNT (the near-rest share follows the ramp's demand over the lane's supply) IS NOT SUPPORTED AS STATED.** Halving the joiners per entrance removed 59% of the stalled joiners at 300 cars (126 to 52) but changed NOTHING at 150 cars (13 to 12), and with the cap at 300 cars the count did not fall at all (47 to 44, the share RISING from 7.6% to 12.3%). The count of stalled joiners is nearly constant while the number of joiners halves: **it is not proportional to demand.** `[D]` The likeliest reason, and a reading and not a finding: **with the same number of cars on the loop and fewer leaving, the THROUGH traffic in the curb lane is denser, so the supply of holes falls as the demand does, and the ratio does not move as the account assumed.** The supply was not measured in this world; it is measured next (below). THE DEMAND-OVER-SUPPLY TABLE OF THREE POINTS IS WITHDRAWN AS AN ACCOUNT AND KEPT AS A COINCIDENCE OF THREE POINTS: its derivation held the supply at the 4-exit world's.
**THE STREAM IN THE HALF-EXITS WORLD, PREDICTED BEFORE IT RUNS `[D]` (`stream-gaps.mjs`, `LOOPEXITS=2`, 150 and 300 cars, 3 seeds):** at 300 cars the node's mean headway falls below the 4-exit world's 6.2 s (0.6) and the holes of 2.5 s or more per lane per minute fall below 8.0 (to 4 to 7, 0.6), which puts demand over supply at 1.3 to 2.2 and keeps the account alive in its ratio form; **if the supply does NOT fall (8 or more a minute, mean headway 6 s or more), the ratio is about 1.1 and the 14% contradicts the account outright, and the share is then set by something local to the lane alongside.**
**WHAT THIS TEST DID ESTABLISH, `[M]`: THE NEAR-REST COUNT IS NOT SET BY HOW MANY JOINERS THERE ARE. That removes "the ramp is overloaded" as the sufficient explanation and puts the question on what the lane alongside offers at the time a joiner is there.**

**THE STREAM IN THE HALF-EXITS WORLD, SCORED `[M]` (`stream-gaps.mjs`, `LOOPEXITS=2`; 3 seeds).**

| | 150 cars, 4 exits | 150 cars, 2 exits | 300 cars, 4 exits | 300 cars, 2 exits |
|---|---|---|---|---|
| NODE: mean headway / flow per lane | 7.7 s / 470 | **6.3 s / 575** | 6.2 s / 580 | **4.9 s / 740** |
| node: holes of 2.5 s or more per minute | 7.0 | 7.5 | 8.0 | **9.4** |
| TAPER: mean headway / flow per lane | 4.3 s / 830 | 4.5 s / 800 | 3.1 s / 1,150 | **3.2 s / 1,140** |
| taper: holes of 3 s or more per minute / share of headways at 3 s or more | 7.5 / 54% | 7.3 / 55% | 7.3 / 38% | **7.0 / 37%** |
| joiners per entrance per minute | 7.8 | 3.9 | 15.7 | 8.8 |
| near rest as built (count, share) | 13 (4.1%) | 12 (6.8%) | 126 (20.1%) | 52 (14.0%) |

**SCORED AS MADE: HALF.** The node's mean headway falls below 6.2 s at 300 cars (0.6): **HIT (4.9 s, because the through traffic is denser, as read)**; the node's holes of 2.5 s or more per minute fall below 8.0, to 4 to 7 (0.6): **MISS (9.4: more headways, not fewer holes)**; demand over supply stays at 1.3 to 2.2 (0.6): **MISS, 0.94 at the node (8.8 over 9.4)**. **BY THE NODE'S SUPPLY THE ACCOUNT FAILS (a ratio under 1 and still 14%).**
**WHAT IS ROBUST, AND IT IS A DIFFERENT THING: THE TAPER'S FLOW AND ITS HOLE SUPPLY DEPEND ON THE CAR COUNT AND NOT ON THE EXITS: about 800 vehicles an hour per lane and 7.3 holes of 3 s or more a minute at 150 cars in both worlds, about 1,150 and 7.0 to 7.3 at 300 cars in both.** With fewer exits the through flow in the curb lane rises and the joiners fall by the same amount, so the lane the joiners merge into is the same lane. THE RATIO RESTATED WITH THE SUPPLY WHERE THE JOINER MERGES (joiners a minute over the taper's holes of 3 s or more a minute): **0.53 (6.8%), 1.04 (4.1%), 1.26 (14.0%), 2.15 (20.1%)**: monotone from 1 upward, and not monotone at the low end, where the counts are 12 and 13 events from three seeds. `[D]` **THAT IS CONSISTENT WITH THE ACCOUNT AND DOES NOT ESTABLISH IT: four points, a derived ratio, small counts at the low end, and the account was shaped by looking at the numbers. It is held as a hypothesis, and what has been measured is narrower: the near-rest count is not set by the number of joiners alone, and the supply at the taper is set by the car count.** The "withdrawn" status in the previous entry is replaced by this one.
**A SMALL CORRECTION OF MY OWN REASONING: the load account was proposed after seeing the node numbers and tested in the half-exits world, where its own stated refutation (above 15%) was not crossed and its own predicted range (2 to 8%) was missed. Neither a pass nor a fail; recorded as a missed range.**

**THE MAINTAINER'S WITHDRAWAL (11 November): E2 FALLING FROM NINE POINTS TO 1.6 ONCE THE BUG WAS FIXED INDICTS THE WHOLE EVENING'S ARM SET.** Every arm (courtesy widened, MOVE, the early ask, need-based decay, the strength sweeps, scanning, every joiner scanning) was measured on a base containing a nine-point bug that manufactured the stall. **A mechanism measured on a broken base is partly measuring the bug, and the same arithmetic applies to the NULLS, which are where he did his updating.** He WITHDRAWS HIS "STANDING DOWN FROM COOPERATION": he updated hard, four times, on evidence from a base where the joiner was stalled by double-charging and not by the stream, and Jay has since said *"people controlling each car is what makes it possible"*. **RECORDED: HIS UPDATE MAY ITSELF BE INVALID. The four misses stand as scored; the conclusion drawn from them does not.** MOVE's null may be an artifact of a world in which no cooperation could have helped, because the requirement was impossible.
**THE GENERAL LESSON, THE DAY'S FOURTH VARIATION ON ONE THEME: A MECHANISM MEASURED AGAINST A DEFECTIVE BASELINE IS MEASURING THE DEFECT.** The day has caught blind instruments, a record that could not tell seen from calculated, invented standards, and now a comparison base that was itself broken: the same disease at four levels. `[D]` The practical rule: before an arm is credited or discredited, the base it is compared with is itself checked against a known case, and any finding about a base-dependent quantity says which base.
**WHAT IN THE RECORD IS BASE-DEPENDENT, SO NOTHING ELSE IS QUOTED WITHOUT ITS BASE `[M]`: the 20.1% and every other near-rest share on the old table; the absorbing-state paragraph; the E-based and E2-based strength sweeps; the nulls for courtesy widened, the early ask and MOVE; the 9 points attributed to joiner-side behaviour (E2). Re-measured on the corrected table so far: E2 (9 points to 1.6), the strength sweeps (the end state unchanged), the residual classification (heads have no usable gap). NOT re-measured on it: the cooperation arms.**
**THE ORDER OF WORK (the maintainer's): (1) D GOES IN AS A PLAIN BUG FIX, NOT BEHIND A SWITCH:** it is two implementations of one quantity, the closing speed charged twice, our most-repeated defect class and nine points of the problem; a switch between correct and incorrect arithmetic keeps the wrong behaviour as a legitimate option, which it is not. The world hash is expected to change and a bug fix is allowed to change the world; full gate, before and after recorded. **(2) THEN THE COOPERATION ARMS ARE RE-RUN ON THE CORRECTED BASE, MOVE AND THE WIDENED COURTESY, BEFORE ANYTHING ELSE IS ADOPTED, PREDICTED FIRST.** **(3) C BEHIND A SWITCH, the tolerance a flagged constant inside Jay's 2 to 3 s, marked `[Jay]`: it has a measured hard-braking price, the exact value inside his range is a feel judgement, and he can A/B it on his phone, the only instrument that can settle it. (4) E2 BEHIND A SWITCH, LAST AND LOWEST PRIORITY: free and measured, so it goes in, and the record states that its value fell by over 80% when the bug was fixed.**
**PREDICTIONS FOR (2), COMMITTED BEFORE THEY RUN `[D]`. THE MAINTAINER'S, deliberately returning to the bet he abandoned: on the corrected base MOVE moves the near-rest share at 300 cars by at least 3 points (0.5), because a gap that is now usable can actually be offered; if it is a null again on a sound base it is a real null and he accepts it. MINE, SEPARATELY: MOVE moves the near-rest share by under 3 points (0.55), because the heads' problem is that they find no hole at the taper at all (14% of heads ever had a usable gap under the corrected table, none for a second), and one mover opens one hole in a lane carrying about 1,150 vehicles an hour at the taper; the widened courtesy (B) moves it by under 3 points (0.6) and its tail (60 s or more in total) is again worse than the base's (0.5).** The arms are run on the corrected base (D) and on the corrected base with Jay's cap (DC), at 300 and 150 cars, three seeds, with the base's own run beside them.
**TWO THINGS NOT TO LOSE (the maintainer's): (a) THE FORCING-IN BEHAVIOUR OF JAY'S RULING IS UNBUILT AND NOT IN ANY TABLE ABOVE: a stopped joiner must eventually force in and cause a disruption rather than wait forever, and it changes what is counted (the disruption, not the near-rest share). (b) THE RAMP-DEMAND-OVER-TAPER-SUPPLY RATIO STAYS A HYPOTHESIS, CORRECTLY FLAGGED AS SHAPED BY LOOKING AT THE NUMBERS: it does not firm up without a prediction made in advance.**

**WHAT THE SHED TERM WAS ADDED FOR, ESTABLISHED BEFORE D IS COMMITTED (the maintainer's request: "somebody put a second closing-speed charge in deliberately; the likeliest reason is that merges were too aggressive and this was the blunt instrument that calmed them"). `[M]` from the history and the record.**
**IT WAS ADDED BY THE AGENT AND NOT BY JAY: commit `30f9ce2`, 20 October ("Acceleration lanes and the merge ... the merge as the moving gap judgement with closing speed in the comfortable gap"), in the same commit that INTRODUCED the acceleration lane and the merge; there is no merge before it to have been too aggressive. No ruling of Jay's is recorded for it: DECISIONS 10.10 and 10.15 describe it ("`gapFor` (both sides, closing speed)", "`lagNeed` sheds the closing speed at the follower's comfortable braking plus this driver's own acceleration") and do not cite a ruling.** The reason recorded, in the comment that came with it: *"a driver joining a 100 km/h stream at 50 called a gap 45 m ahead of a car doing 100 comfortable -- a gap in which that car has to brake at about 6 m/s^2. A merge is judged on whether the car behind will have to brake HARD."* So it is the first of the maintainer's three outcomes, a reason recorded, and the question is whether the dynamic term it duplicates already covers that reason.
**IT DID, AND THE PREMISE OF THE COMMENT WAS WRONG ABOUT THE CODE. `[M]` `wantedGap` as it stood the day BEFORE the shed term (`30f9ce2^`) already contained the dynamic closing term (`me.v * closing / (2 * sqrt(accel * brake))`), and the line the commit REPLACED was `kappa * wantedGap(nb.behind ?? { v: 0 }, out)`: `out`, the joiner, passed as the leader, so the closing speed WAS in the comfortable gap. The comment says the old gap was "the following distance at equal speeds, with the closing speed only in the floor"; the code before it says otherwise.** The follow-on tells the same story: the comment records that the first form "throttled every entrance: joiners stood at the end of the lane for minutes on a near-empty highway", and the repair was to add the joiner's OWN acceleration to the shed's rate: a patch on the over-charge it had just created. And on 22 October (`86b7cb9`) the need was observed as "330 m for a timid joiner at rest beside 100 km/h traffic", and the observation was used to unify two definitions of the gap, not questioned.
**IS THE REASON COVERED NOW, IN THE ONLY TERMS THE REASON WAS STATED IN: THE BRAKING THE CAR BEHIND NEEDS? `[M]` computed from the sim's own `lagNeed` (kappa 1, the stream at 100 km/h, the joiner holding its speed): in the MINIMUM gap the single charge accepts, the car behind needs 2.26 m/s^2 against a joiner at rest, 1.76 at 20 km/h, 1.26 at 40, 1.01 at 50, 0.77 at 60 and 0.31 at 80, against a comfortable braking of 2.7: COMFORTABLE AT EVERY JOINER SPEED.** The 21 October reason, the car behind braking hard for a joiner at 50, is met at 1.0 m/s^2. **I CANNOT REPRODUCE THE "ABOUT 6 m/s^2" OF THE COMMENT: at kappa 1 the old (pre-shed) formula already asked 97 m for a joiner at 50 km/h, which is 1.0 m/s^2, and a bold driver (kappa 0.3) accepting 29 m needs about 3.6; the figure's origin is not in the record. UNRESOLVED, and noted rather than guessed.** **THE THIRD OUTCOME (it was added to fix something the dynamic term does NOT cover, so it is not a duplicate) IS RULED OUT BY THE CODE'S OWN HISTORY: nothing it was added for was uncovered. The "two implementations of one quantity" reading stands.**
**THE DIRECT EVIDENCE THAT REMOVING IT DOES NOT BRING BACK THE HARD BRAKING `[M]` (the corrected-table arm A + D, 300 cars, 3 seeds, 563 merges, the car behind's braking in the four seconds after each merge): over 5 m/s^2 2.8% against 2.8% as built, over 3 m/s^2 11.5% against 15.1%; under 1 s behind 10.5% against 8.7%; zero overlaps and zero crashes.** That is the measurement of what the term was for, and it did not move. **THE LONGER SAFETY RUN, THE MAINTAINER'S REQUEST (60 s is not enough to see what it may have been there to prevent): 900 s worlds, before and after, with overlaps and crashes counted, and a blind-driver world where crashes happen (`PERCEIVE=1`), run after the gate.** NOT YET DONE AT THE TIME OF WRITING; recorded below when it is.
**THE FRAMING THE MAINTAINER ASKED FOR, HELD: D AND C ARE TWO HALVES OF ONE CORRECTION TO THE GAP A MERGE ASKS FOR, NOT A FIX AND A TUNING OPTION. D alone leaves a joiner at rest needing 173 m (6.2 s) against Jay's 2 to 3 s; C, the cap, is the rest of it. C is switchable only because its value inside his range is a feel judgement. THE DEGREE C IS AGGRESSIVE IS NOT UNIFORM `[M]`: with the cap, the car behind needs 5.72 m/s^2 against a joiner at rest (twice the comfortable 2.7) and 3.67 at 20 km/h, and is within comfort from 40 km/h up (2.06): it bites only where the joiner is slow, which is exactly where Jay says tolerance is higher and a driver "floors it".** And the disagreement on MOVE is on record: the maintainer 0.5 that it moves the near-rest share by at least 3 points, the agent 0.55 that it moves it by under 3, from the same data.

**A REFRAMING OF THE HARD-BRAKING COST (the maintainer, 11 November), WHICH PARTLY DISSOLVES THE TRADE HE WAS ABOUT TO PUT TO JAY.** Under the cap the car behind needs 5.72 m/s^2 against a joiner at rest, 3.67 at 20 km/h, and is within comfort from 40 km/h up. That was being treated as the price of the cap. **JAY HAS ALREADY RULED ON EXACTLY THIS CASE `[Jay]`: a stopped driver "will eventually have to just floor it into traffic", others "either will or will not be able to evade them", "causing a major disruption is the likely outcome", and tolerance for close driving is higher at a merge than normal. SO HARD BRAKING CAUSED BY A SLOW OR STOPPED JOINER FORCING IN IS NOT A COST, IT IS HIS RULING WORKING. WHAT WOULD BE A DEFECT is hard braking caused by a joiner that HAD speed and took a tight gap anyway, which nothing in his account sanctions.**
**THE MEASUREMENT: THE HARD-BRAKE EVENTS SPLIT BY THE JOINER'S SPEED AT MERGE ONSET** (the probe's merge record now carries the joiner's speed at the last plan before the merge begins; bins of 0 to 20, 20 to 40, 40 to 60 and 60 km/h and over, `[invented]`; the car behind's braking over 3 and over 5 m/s^2 in the four seconds after, as before and still unattributed to the merge). Arms: A as built, D, the cap (C) and D with C, 300 cars, three seeds. **This is the fifth quantity of the day that needed splitting before it meant anything, and the hard-braking percentage quoted all evening treated every event as equivalent.**
**PREDICTIONS, COMMITTED BEFORE ANY OF IT IS RUN `[D]`. THE MAINTAINER'S: at least three quarters of the over-5 events come from joiners under 40 km/h at onset (0.6), since that is where the cap bites and where the geometry is unforgiving; if a meaningful share come from joiners at 60 km/h or more, that residue is the real cost and the only part Jay needs to rule on. MINE, SEPARATELY: under the cap (C and D with C) at least three quarters of the over-5 events come from joiners under 40 km/h (0.5), and they are under half of the merges (0.6), so a small share of merges carries nearly all of the hard braking; AS BUILT (the old table) the over-5 events are NOT concentrated on the slow joiners (under 60% from under 40 km/h, 0.5), because joiners there wait for matched speed before they merge and a hard brake there is not the geometry's doing; and the residue from joiners at 60 km/h or more, per merge, is the same under the cap as as built, within a point (0.6), since the cap only bites below about 60 km/h (a 2.5 s need is 70 m, and a joiner at 60 km/h needs 82).** WHAT WOULD SAY THE TRADE DOES NOT DISSOLVE: more than a quarter of the over-5 events under the cap come from joiners at 40 km/h or more.
**THE SAFETY RUNS BEFORE D IS COMMITTED (the maintainer's request, and the neutrality step): the repo's D reproduces the scratch arm's D on a 180 s run (same near-rest count) before any comparison is trusted; 900 s worlds on the loop before and after (300 cars, 3 seeds; 150 cars, 2 seeds) with overlaps and crashes counted; and a blind-driver world (`PERCEIVE=1`, where crashes happen) before and after. After the gate.** The scratch tree with the table unset is the "before".

**THE FIRST GATE OF D (12 November, the derived set: 54 checks can see `lanechange.js`; part-way through when this is written: 19 results, 17 ok, 2 failing, 6 running). `[M]` FROM THE LOGS.**
**THE EXPOSURE RULE'S FIRST REAL DIVIDEND (the maintainer's words, recorded as his): a check failed and announced itself as THE CASE NO LONGER ARISES, not as broken behaviour.** `verify-merge` section 4's courtesy line reads "over the 3 waits of 20 s or more without it, the total with courtesy is 0.26 of the total without": the ratio is well inside its bar (0.7), and the floor (at least 4 such waits) is not met because the long waits it needs became rare when the thing that caused them was fixed. A week ago that would have been an unexplained red, an hour spent on it, or a quietly lowered floor. **THE FLOOR IS NOT TOUCHED. The check wants a harsher scenario or a floor stated against the corrected table, which is a decision, not a repair.**
**`verify-merge`: THREE FAILURES OF THREE KINDS, EACH PLACED. (1) and (2), already red before D, on Jay's derived bars (the pre-D run, `mg3.out`, failed the same two lines): joiners at or near rest at the lane end at 300 cars 24.5% (51 of 208) before D and 13.3% (27 of 203) after; joiners over a minute in TOTAL at rest 9 before and 2 after. They improved, which is the result wanted, and they still do not meet Jay's bars, which is expected: C is the other half of the correction. (3) NEW, a PRECONDITION failure (above).** ONE SIGNAL INSIDE (1): joiners over a minute CONTINUOUS at 300 cars went from 0 to 2 (one seed). The maintainer's reading, adopted as the working one: **it is C's problem and not D's: D alone leaves a joiner at rest needing 173 m (6.2 s), so a car that reaches rest under D alone is about as stuck as before, and now stops cleanly instead of creeping; stop-and-go used to break the wait up.** CHECKED AGAINST DATA ALREADY HELD, `[M]`: in the arm table the joiners with a minute or more of total time at rest at 300 cars were 16 as built, **2 with D, 0 with the cap (C), 0 with D and C** (3 seeds each); so the standing joiners do not survive the cap. A re-check inside `verify-merge` itself needs the switch for C, which is not built yet.
**`verify-loop`: ONE FAILURE, NOT YET PLACED: "at minute 15 the speeds are still spread (sd 9.0 km/h) ... and cars still overtake (153 in the minute)": the bar is `sd >= 10 && overtakes >= 60`, so it is the spread that fails (153 is well over 60). Both floors are `[invented]` (the audit rule): nothing in the record gives 10 km/h of spread from a ruling.** It is being run on the unchanged tree (a worktree at the commit before D) to separate what D moved from what was already red.
**THE MAINTAINER'S HYPOTHESIS, TO BE TESTED AND NOT ASSUMED: IF D REMOVES STALLS IT REMOVES SLOW TRAFFIC, AND SLOW TRAFFIC IS WHAT PRODUCED SPREAD, SO THE SPREAD FLOOR WAS BEING SATISFIED BY THE DEFECT JUST FIXED: A SYMPTOM MEASURED AS THOUGH IT WERE A FEATURE.** It matters beyond the check: Jay wants a lively road and speed variety is part of it, but it has to come from drivers who WANT different speeds, not from traffic being broken; if the variety was partly supplied by stalled merges, then fixing the merge makes the highway more correct and more monotonous at once, and the cure for the monotony is a legitimate spread of preferred speeds. **THE FLOOR IS NOT ADJUSTED EITHER WAY UNTIL IT IS KNOWN WHICH THIS IS.** TWO FACTS ALREADY IN THE RECORD, `[M]` from SIMULATOR.md and DECISIONS 10.46/10.61: (a) on a highway the speed spread is by design the road's, `wantedOnHighway` = limit x (1.05 - 0.17 (caution - 1)), which puts the curb lane near 80 km/h, the middle near 102 and the left near 108, so a large part of the spread is BETWEEN LANES by design; (b) **THE SPREAD HAS BEEN FALLING BEFORE D: IN FLIGHT 42, "the speed spread falling with the brake reaction on", median sd 12.3 to 10.0 km/h over five seeds, cause not established. THE DROP TO 9.0 MAY BE THE SAME ITEM, and D may be a second push on a decline the check was already approaching, not its cause.**
**THE PROBE (`tools/measure/loop-spread.mjs`: the check's own sample, the open loop, target 200, seed 1, the cars on the loop roads once a second over minute 14 to 15, taken apart): the sd of the speeds, the sd of the WANTED speeds (the spread that is a feature), the mean shortfall of the speed against the wanted speed and the share of samples under 80% and under 60% of it (the spread that is a symptom), the sd among the samples not held back, and the speed, the wanted speed and the sd by lane. Before D (the unchanged worktree) and after D (the repo), to run after the gate.** PREDICTIONS, COMMITTED BEFORE IT RUNS `[D]`: the unchanged tree passes the check (sd 10 or over, 0.6; read from the `verify-loop` baseline log either way); **the drop from before to after is carried by the held-back samples: the share under 80% of the wanted speed falls by at least a third (0.5), and the sd among the samples that are NOT held back is within 0.7 km/h before and after (0.6); the sd of the wanted speeds is the same before and after within 0.5 km/h (0.7), since it is the population and the seed is the same; and the lane means (about 80, 102 and 108) do not move by more than 2 km/h each (0.6).** WHAT WOULD SAY THE HYPOTHESIS IS WRONG: the sd among the not-held-back samples falls by more than 1 km/h, or the lane means move, which would mean D changed what drivers do at speed and not only how many are held back.
**THE HOLD (the maintainer's): D IS NOT COMMITTED. THE SEQUENCE IS THE GATE, THE `verify-loop` BASELINE, NEUTRALITY, THEN THE SAFETY RUNS, AND NOTHING COMMITS UNTIL THEY AGREE; NOTHING HEAVY RUNS ALONGSIDE THE GATE.** The loop-spread runs and the safety runs wait for the gate to finish.

**THE BASELINE `verify-loop` AND A THIRD HYPOTHESIS (12 November). `[M]` ON THE UNCHANGED TREE `verify-loop` PASSES: sd 12.9 km/h, 165 overtakes at minute 15, against 9.0 and 153 with D. THE SPREAD DROP IS D'S: 3.9 km/h from one fix, not a decline already in progress, and IN FLIGHT 42 (median sd 12.3 to 10.0 over five seeds, other seeds and car count) is NOT shown to be the same item.** The probe may still resolve it; that is not assumed.
**THE MAINTAINER'S THIRD HYPOTHESIS, BEFORE THE PROBE RUNS: THE SPREAD IS LARGELY THE ROAD'S (curb lane near 80 km/h, middle near 102, left near 108), SO THE 10 KM/H FLOOR IS MOSTLY MEASURING WHETHER CARS ARE SPREAD ACROSS LANES, NOT WHETHER DRIVERS WANT DIFFERENT SPEEDS: THE SPREAD CAN COLLAPSE WITH NOBODY HELD BACK, simply because the population bunches into fewer lanes (an emptied curb lane removes the 80 km/h end).** It matters for feel too: a highway where everybody has migrated into one or two lanes looks wrong although every car is behaving correctly, which Jay notices from the driver's seat and no number here shows; and weeks of changes to lane behaviour (the keep-right latch, the exit-step fix) could have drifted the distribution invisibly. **THE PROBE NOW REPORTS THE LANE OCCUPANCY SHARES AS AN EXPLICIT LINE, for minute 14 to 15 and for the WHOLE RUN (every 5 s from 2 minutes on).**
**A CORRECTION TO MY OWN PROBE, CAUGHT WHILE ADDING IT: its lane labels were the wrong way round. `verify-loop` section 1 states "lane 0 to the left of travel", so LANE 0 IS THE LEFT LANE AND LANE 2 THE CURB, and the comment said the opposite. The output is now labelled left, middle, curb, and the lane MEANS (about 108, 102 and 80) are the check on the labelling.**
**PREDICTIONS, COMMITTED BEFORE THE PROBE RUNS `[D]`. THE MAINTAINER'S: the lane occupancy shares differ before and after D by under 3 percentage points each (0.6), so D is not the cause of a lane drift; but the shares across the whole run are MORE UNEVEN THAN AN EVEN THIRD EACH, WITH THE CURB LANE THE LIGHTEST (0.6); if the curb lane is light, the spread floor has been slowly failing for a reason that has nothing to do with merges. MINE, SEPARATELY, AND PARTLY ALONGSIDE HIS: the curb lane is the lightest across the whole run, between 15 and 30% (0.5); the shares differ before and after D by under 3 points each (0.5), with the curb lane the one likeliest to move (up, because fewer joiners stand at the ends of the lanes) (0.45); and the not-held-back sd, the wanted-speed sd and the lane means, as already committed, stand.** WHAT WOULD SAY THE THIRD HYPOTHESIS IS WRONG FOR D: the lane shares are within 3 points before and after while the sd still falls by 3.9, which would put the drop in the held-back samples; and what would say it is RIGHT: a lane share moving by more than 3 points together with a sd drop carried by the between-lane component.
**BOTH FLOORS STAY `[invented]` AND UNTOUCHED, AND THE COURTESY LINE (a harsher scenario or a floor restated against the corrected table) IS A DECISION TO BE TAKEN AFTER THE GATE, NOT NOW.** Everything stays held: the gate and the two baselines first.

**THE GATE OF D, FINISHED AND CLASSIFIED (12 November): 50 OF 54 PASSED (2,406 s, 6 at once; `verify-core` passed its assertions and reported SLOW against a recorded 0 s, its timing refreshed). THE FOUR FAILURES, EACH SEPARATED FROM WHAT WAS ALREADY RED BY RUNNING THE SAME CHECK ON THE UNCHANGED TREE (a worktree at the commit before D) `[M]`:**
| check | with D | unchanged tree | verdict |
|---|---|---|---|
| `verify-merge` | 3 lines fail | the same two Jay-bar lines failed (`mg3.out`), the third did not exist | two PRE-EXISTING and IMPROVED (near rest 24.5% to 13.3%, long waits 9 to 2); one NEW and a PRECONDITION failure (the case no longer arises) |
| `verify-loop` | speed spread sd 9.0 (floor 10), 153 overtakes | **passes: sd 12.9, 165 overtakes** | **D'S: 3.9 km/h of spread, cause under test (the loop-spread probe)** |
| `verify-anticipation` | a reacting offerer waits 9.5 s against 9.0 s without the rule (bar: 1 s more); 64 offers with the rule, 83 without | **passes: 13.0 s against 10.1 s; 84 and 101 offers** | **D'S, and understood in kind: with a smaller need the gap to open is smaller, so there is less to wait for; the direction holds (the rule still waits, and brakes harder, 3.05 against 2.87 m/s^2) and the effect is a fifth the size. The 1 s margin is `[invented]` and stated against the old table; it is a decision to restate, not a repair, and is not touched** |
| `verify-checks` | "the traffic crashes nothing: 1" | passes: 0 | **NOT D'S: the scenario has a base rate (next paragraph)** |
**THE CRASH, TRACED `[M]` (`tools/measure/crash-trace.mjs`, the check's own scenario: test map 1, 260 cars, three minutes, checks on, the scripted good driver in the world; ten seeds on both trees): 14 CRASHES WITH D AND 15 ON THE UNCHANGED TREE, IN 7 AND 6 OF THE 10 SEEDS. The check passes on the unchanged tree because seed 1 happens to be clean there; D changed which world seed 1 produces. THE ASSERTION "CRASHES NOTHING" IS A SAMPLE OF ONE SEED STATED AS A PROPERTY OF THE TRAFFIC, which is CLAUDE.md item 3's implied sample size nobody stated (the same shape as the `verify-telling` 7.1x to 1.17x).** The crashes are one population in both trees: **0 of 14 and 0 of 15 had a lane change in progress; none involved the scripted player; 9 and 11 had both cars under 20 km/h half a second before (low-speed contact at queues and junctions); several are IDENTICAL in the two trees (seed 2 twice, seed 7, seed 8, seed 9, seed 10).** The seed-1 crash in D's world is a car at 13 km/h that did not brake until about 1.3 m from the tail of a stopped truck, both on the same route, neither changing lane. **D IS NOT THE CAUSE OF A CRASH, AND D CHANGED NOTHING ABOUT HOW THE TRAFFIC CRASHES. A SEPARATE PRE-EXISTING FINDING, FOR THE BEHAVIOUR LIST: test map 1 at 260 cars carries about 1.4 low-speed crashes per three minutes in the ordinary traffic, which contradicts "the default traffic never crashes" (`verify-crashes`) at this density and map; not investigated here.**
**`verify-checks` IS LEFT RED ON PURPOSE: it fails on seed luck, the check wants a stated sample (several seeds, a rate, a bar against the base rate) and not a different seed, and that is a decision to take, not a repair.**
**WHAT STILL HAS TO AGREE BEFORE D IS COMMITTED, ALL RUN NOW (the gate is finished and the baselines are read), PREDICTIONS COMMITTED BEFORE THEY RUN `[D]`:** (1) NEUTRALITY: the repo's D reproduces the scratch arm's D (arm A + D, 300 cars, seed 1, 180 s: 27 joiners near rest) (0.9). (2) 900 s WORLDS, OVERLAPS AND CRASHES COUNTED, BEFORE (unchanged tree) AND AFTER (D): loop at 300 cars (seeds 1 to 3) and 150 cars (seeds 1, 2): zero crashes and zero overlapping car-ticks in both, in all ten (0.8). (3) A BLIND-DRIVER WORLD (`PERCEIVE=1`, where crashes happen by design): the crash count with D within 25% of the unchanged tree's on the loop at 300 cars (seeds 1, 2) and on test map 1 at 150 cars (0.6). (4) THE LOOP-SPREAD PROBE, before and after, with the predictions and the lane-occupancy hypothesis committed earlier (both the maintainer's and mine). THE UNCHANGED TREE IS A WORKTREE AT THE COMMIT BEFORE D; the repo is the tree with D in the working copy, uncommitted.

**A CORRECTION TO A STANDING CLAIM (12 November; the maintainer's words, recorded as his, with the evidence checked in the code): "THE DEFAULT TRAFFIC NEVER CRASHES" HAS BEEN A BELIEF RESTING ON ONE LUCKY SEED, AND IT IS FALSE.** `[M]` WHAT THE CLAIM RESTS ON: `verify-crashes` section 4, "traffic that never crashed before still never does", is ONE WORLD (the default city, seed 1, 200 cars, two minutes: 0 crashes between vehicles), and `verify-checks` section 7 ("checks on, crashes 0 against 0 off") is one run; both are n = 1, stated as a property of the traffic. **MEASURED AGAINST IT: test map 1, 260 cars, three minutes, checks on, ten seeds: 14 crashes with D and 15 on the unchanged tree, in 7 and 6 of the 10 seeds, about 1.4 low-speed crashes per three minutes. 260 cars is the density Jay plays, so the traffic has been quietly bumping into itself at the density the player actually uses and nothing told us.** Recorded as a correction to a standing claim, not as a check defect (CLAUDE.md's `verify-crashes` entry now says the claim is n = 1). NOT YET MEASURED: whether the claim's OWN world (the default city) crashes over several seeds; that is the first step of the item below.
**THE THREE RULINGS (the maintainer's, 12 November).** **(1) THE LOW-SPEED CRASHING GOES NEAR THE TOP OF THE BEHAVIOUR LIST, ABOVE THE WEAVE AND ABOVE THE LATERAL REPERTOIRE:** cars rear-ending stopped traffic are visible, read as BROKEN and not as character, and undermine the one thing the simulation has to get right. NOT STARTED: D, C and E2 first. **THE THREAD TO PULL: the seed-1 case, a car at 13 km/h that did not brake until about 1.3 m from the tail of a stopped truck, no lane change, same route: a following or perception failure at low speed.** **DOES IT RESEMBLE THE TRUCK SELF-OCCLUSION DEFECT? `[D]` NOT THE SAME MECHANISM, AND A NARROWER FIX THAN WE THOUGHT IS A REAL POSSIBILITY ELSEWHERE.** The self-occlusion defect (HANDOFF-2026-10-28) was in the PEDESTRIAN sight test, where the viewer's own box, a truck's, counted as an occluder with the eye 1.5 m ahead of the centre and so INSIDE the truck's body; here the follower is a car behind a truck. TWO CANDIDATES, NEITHER TESTED: (a) the long-vehicle tail rule (`clearBetween` reads `front.rear`, set each tick from a turning truck's pose; the 5 in 14 and 7 in 15 same-route crashes, and the seed-1 truck on a turning route (`C-D|start#0` to `C-west|end#0`), are where it would bite; the earlier fix was for a car closing on a truck turning right, so a truck stopped mid-turn may be a surviving relative); (b) the observation axis working as designed (a poor observer's registration delay can exceed the time to contact at a queue: 2.95 m at 3.6 m/s is 0.8 s, and the registration lag reaches 1.6 s), which would make these crashes the design's own consequence and not a bug, to be ruled on. **THE EVIDENCE ALREADY HELD ARGUES AGAINST A TRUCK-ONLY CAUSE: a truck was involved in 3 of 14 crashes with D and 2 of 15 without; most are car on car, and 9 and 11 had both cars under 20 km/h half a second before.** The first step of the item is to read the crashers' registration lags and observation ratings, which separates (b) from (a) and from a following-model fault.
**(2) `verify-checks` STAYS RED AND IS RESTATED WITH A REAL SAMPLE (several seeds, a rate, a bar against the measured base rate): THE BAR IS NOT SET AT THE BASE RATE JUST MEASURED, BECAUSE THAT WOULD ENCODE TODAY'S DEFECT AS THE STANDARD. IT IS STATED AS WHAT IS WANTED, NEAR ZERO LOW-SPEED CONTACT IN ORDINARY TRAFFIC, `[invented]` UNTIL JAY RULES, AND THE CHECK SITS RED UNTIL THE BEHAVIOUR IS FIXED.** A check red because the world is wrong is doing its job, the opposite of the dead guards cleared out. The maintainer's decision; not done yet. **(3) THE `[invented]` MARGINS STATED AGAINST THE OLD TABLE, `verify-anticipation`'S 1 s AND `verify-loop`'S 10 km/h, ARE RESTATED ONCE, AFTER C LANDS, NOT NOW:** the table is half-corrected, and restating against a base still changing means doing it twice and trusting it less. `verify-anticipation` being understood in kind (the direction preserved, the effect a fifth the size) is enough to proceed on.
**THE PATTERN, THE SECOND INSTANCE TONIGHT AND A DISTINCT CLASS (the maintainer's): A CHECK STATES A PROPERTY OF THE TRAFFIC FROM A SINGLE SEED.** `verify-checks` (the crash), `verify-telling` (the 7.1x to 1.17x) and now `verify-crashes` section 4 all do. It is an implied sample size, different from the vacuity and the blindness fixed earlier: **a check can arrange its exposure perfectly and still generalise from n = 1, and by definition the ones that are wrong look fine most of the time.** **TO BE AUDITED AS ITS OWN CLASS ONCE THE MERGE WORK IS IN: every assertion about a rate, a share or "never" over the sim, asked how many seeds and how many worlds.**

**THE MAINTAINER'S READING OF THE LOW-SPEED CRASHES, WRITTEN DOWN BEFORE THE ITEM STARTS (12 November): THE SECOND CANDIDATE, THE OBSERVATION AXIS, IS THE ONE HE WOULD BET ON, AND THE ARGUMENT IS ARITHMETIC.** A registration lag of up to 1.6 s against a time to contact of 0.8 s at a queue means that driver CRASHES BY CONSTRUCTION: the arithmetic leaves no room, so if a meaningful share of the population carries lags in that range the crashes are not emergent behaviour but GUARANTEED OUTCOMES OF THE DISTRIBUTION CHOSEN. **THE REFRAMING: THE SUSPECT MAY BE THE DISTRIBUTION OF OBSERVATION RATINGS AND NOT THE FOLLOWING LOGIC; real traffic is mostly adequate drivers with a thin tail of terrible ones, and if the sim's spread is broad the tail has been built as the body.** **AND THE RATE IS WRONG BY ORDERS OF MAGNITUDE WHATEVER THE MECHANISM `[D]`, the maintainer's estimate and not a measurement: 1.4 crashes per three minutes is about 28 an hour on one map, against a real commuter who might witness a handful of low-speed rear-enders in a year; inattentive drivers really do hit stopped traffic (one of the commonest real collisions), so the MECHANISM can be entirely realistic and the RATE absurd, and those have different fixes.** The real-world comparison is not sourced here.
**A PREMISE CHECKED IN THE CODE BEFORE IT IS RELIED ON `[M]`: WHICH LAG IS LIVE IN THE SCENARIO THAT CRASHES.** The scenario (`verify-checks` section 5, `worldFor(..., lookAway = false, ...)`) runs with PERCEPTION OFF (`perceive: !!lookAway`, so no glances and no stale picture) and the BRAKE REACTION ON (`brakeReaction` defaults to true). So the glance-and-carried-picture form of the observation axis cannot be what crashes there; **what is live is the driver's reaction to a lead's brake lamp (`crossing.js`, `world.brakeReaction`), whose lag comes from the same observation axis: `REACTION_FLOOR` 0.35 s plus up to `REGISTER_SPAN` 1.6 s, 0.35 to 1.95 s.** `[D]` NOT YET ESTABLISHED, FOR THE ITEM'S FIRST STEP: that the brake-reaction lag is the `lag` drawn from the ratings (and not another number), and whether a lag matters for a leader that has already been stopped a while (a reaction to a lamp onset does not delay seeing a stopped truck), which would mean "by construction" holds only for queues that stop abruptly in front of a driver; the seed-1 truck was at 3 km/h one second before, 0.8 km/h half a second before, braking to a stop, not stopped long. THE ARITHMETIC IS A STRONG HYPOTHESIS AND NOT YET A FINDING.
**THE ITEM'S FIRST STEPS, IN ORDER (the maintainer's, with his two additions): (0) THE DEFAULT CITY OVER SEVERAL SEEDS, BEFORE ANYTHING ELSE, BECAUSE THE STANDING CLAIM IS SPECIFICALLY ABOUT THAT WORLD AND IT IS STILL NOT KNOWN WHETHER IT IS FALSE THERE; (1) THE DISTRIBUTION OF OBSERVATION RATINGS ACROSS THE WHOLE POPULATION, NOT ONLY THE CRASHERS', SO THE CRASHERS CAN BE SEEN AS A TAIL OR A PLURALITY: WHAT SHARE OF DRIVERS CARRY A LAG LONGER THAN THE TIME TO CONTACT AT ORDINARY QUEUE SPEEDS (if a third of them, the road is populated by drivers who will certainly crash and the defect is that bad observers are common and not rare); (2) THE CRASHERS' OWN LAGS AND RATINGS; (3) THE FOLLOWING MODEL AND THE LONG-VEHICLE TAIL RULE, ONLY IF THE FIRST THREE DO NOT SETTLE IT.**
**THE LINK TO JAY'S LIVELINESS RULING, IN THE USEFUL DIRECTION (the maintainer's, a reading and not Jay's): he sanctioned exaggerating characteristics to make drivers livelier to watch, and the earlier reading was AMPLITUDE AND NOT FREQUENCY. This is the clearest case yet: one dramatic, legible near-miss from an obviously inattentive driver is worth more than twenty-eight collisions an hour, and costs the player nothing.** Recorded as a reading to put to him, not assumed.
**THE ORDER (the maintainer's): THE AGREEMENT BATCH, THEN D, C, E2, THEN THIS ITEM.**

**THE AGREEMENT RUNS FOR D, SCORED `[M]`, AND D COMMITTED (`6eacb35`, branch `exposure-3`; not merged to `main`). THE RUN ARTIFACTS THE GATE REWROTE (`check-hashes.json`, `check-history.jsonl`, `check-times.json`) ARE DISCARDED, AS RULED BEFORE.**
**(1) NEUTRALITY: HIT (0.9). The repo's D gives 27 joiners near rest of 203 (300 cars, seed 1, 180 s), exactly the scratch arm's 27 of 203.** **(2) 900 s WORLDS, BEFORE (the unchanged worktree) AND AFTER (D): zero overlapping car-ticks and zero crashes in all ten (the loop at 300 cars x 3 seeds and 150 cars x 2): HIT (0.8).**

| 900 s, the loop | before | after |
|---|---|---|
| joiners near rest at the lane end, 300 cars (per seed: 1, 2, 3) | 166 / 132 / 173 | **95 / 84 / 85** |
| joiners with a minute or more in total at rest | 16 / 14 / 45 | **8 / 0 / 0** |
| the car behind over 5 m/s^2, 300 cars | 4.7 / 2.4 / 3.4% (mean 3.5) | 4.6 / 3.5 / 4.2% (mean 4.1) |
| merges leaving it under 1 s, 300 cars / 150 cars | 11.1 / 10.2 / 7.9% / 6.9, 8.7% | 11.9 / 12.9 / 9.1% / 9.4, 9.9% |
| 150 cars near rest (seeds 1, 2) | 26 / 21 | 11 / 17 |

**THE COST OF D IS SMALL AND REAL: hard braking over 5 m/s^2 up 0.6 of a point (3.5% to 4.1%) and the under-1-second share up about 1.6 to 2 points, against 44% fewer joiners standing at the lane end and the long waits nearly gone.** (3) **THE BLIND-DRIVER WORLDS: 0 CRASHES IN BOTH TREES in all three (`PERCEIVE=1`, 300 s: the loop at 300 cars x 2 seeds, test map 1 at 150): THE PREDICTION (within 25% of the unchanged tree's count, 0.6) IS MET ONLY BY 0 = 0, AND THE CASE DID NOT ARISE, so those worlds cannot show D safe. `verify-crashes` section 2 is the same: its comment calls its worlds "where crashes happen" and it passes "every overlap is a recorded crash (0 silent) -- across 0 crashes that happened on their own" with D AND on the unchanged tree (test map 1 at 150 cars and the city at 250, seed 3, perceiving late): THE INVARIANT IS ASSERTED OVER NO CRASHES, VACUOUS, ANOTHER EXPOSURE DEFECT, TO BE RESTATED ON A WORLD THAT DOES CRASH (the `verify-checks` scenario, about 1.4 a run, is one).** The safety evidence that does bear on D is in a world that crashes: test map 1 at 260 cars over ten seeds, 14 crashes with D against 15 without, none in a lane change.
**(4) THE LOOP-SPREAD PROBE (`loop-spread.mjs`, the check's own sample, the open loop, 200 cars, seed 1, minute 14 to 15; it reproduces the check: sd 12.87 before and 8.97 after).**

| | before D | after D |
|---|---|---|
| sd of the speeds | 12.87 | **8.97** |
| sd of the WANTED speeds | 7.91 | 7.86 |
| mean shortfall below the wanted speed | 5.8 km/h | 3.6 |
| samples under 80% / under 60% of the wanted speed | 5.4% / 2.1% | **1.9% / 0.1%** |
| sd among samples NOT held back | 8.05 | 8.26 |
| within-lane sd: left / middle / curb | 9.5 / 10.6 / 13.9 | **6.5 / 7.5 / 7.9** |
| lane means: left / middle / curb (wanted) | 105.6 / 101.8 / 95.0 (110.5 / 106.2 / 102.0) | 109.7 / 103.6 / 96.7 (111.9 / 106.3 / 101.4) |
| lane shares, whole run: left / middle / curb | 16.4 / 35.6 / 48.0% | 17.7 / 34.5 / 47.8% |
| lane shares, minute 14 to 15 | 17.1 / 33.5 / 49.3% | 17.6 / 34.3 / 48.1% |

**THE MAINTAINER'S HYPOTHESIS (the spread was partly supplied by held-back traffic, a symptom measured as a feature): SUPPORTED. The 3.9 km/h fall is carried by the held-back samples: their share fell by two thirds, the within-lane sd fell by 3 to 6 km/h in every lane, and the two quantities that would move if D had changed what drivers do at speed did not (the sd among samples not held back, 8.05 to 8.26; the sd of what drivers WANT, 7.91 to 7.86).** SCORED AS MADE (the agent's): the baseline passes the check (0.6) HIT; the held-back share falls by at least a third (0.5) HIT (65%); the not-held-back sd within 0.7 km/h (0.6) HIT; the wanted sd within 0.5 (0.7) HIT; **the lane means within 2 km/h each (0.6) MISS: the left lane rose 4.1 km/h (the middle 1.8, the curb 1.7), because the slow cars that held its traffic back are gone (its shortfall below what is wanted fell from 4.9 to 2.2).** **THE MAINTAINER'S THIRD HYPOTHESIS (the floor is measuring whether cars are spread across lanes, and the population can bunch into fewer lanes with nobody held back): D DID NOT MOVE THE LANE SHARES (under 1.3 points in every lane, whole run and minute 14 to 15): HIS FIRST CLAUSE HIT (under 3 points each, 0.6); THE SECOND CLAUSE MISSED: THE SHARES ARE UNEVEN, 16 / 36 / 48%, AND THE CURB LANE IS THE HEAVIEST, NOT THE LIGHTEST (0.6, his; and 15 to 30%, 0.5, mine: both MISS).** "D shifts each by under 3 points" (mine, 0.5) HIT; "the curb lane up, because fewer joiners stand at the lane ends" (0.45) MISS (flat, 48.0 to 47.8%). **SO THE LANE-DRIFT WORRY DOES NOT APPLY TO D; BUT THE DISTRIBUTION ITSELF IS A STANDING PROPERTY NOBODY HAS AUDITED: HALF THE CARS IN THE CURB LANE AND A SIXTH IN THE LEFT. KEEP-RIGHT PLAUSIBLY PRODUCES A HEAVY RIGHT LANE ON A REAL ROAD, BUT THERE IS NO REFERENCE IN THE RECORD, SO IT IS `[invented]` BY DEFAULT AND GOES TO JAY'S BATCH (what share of the cars on the expressway he drives are in each lane at 260 cars) AND TO THE DIGEST.**
**WHAT THE PROBE SAYS ABOUT THE SPREAD FLOOR `[D]`: AFTER D THE SPREAD IS ALMOST ALL DESIGN: the sd of the wanted speeds is 7.9 km/h and the lanes' own means supply the rest (9.0 in all), against the comment in `traffic.js` that gives the real free-flowing motorway spread as 10 to 12 km/h.** So the corrected road is more monotonous than the design's own stated target, by about 1 to 3 km/h, and the cure is the one the maintainer named: a legitimate spread of PREFERRED speeds (`HIGHWAY_SLOPE`, flagged for the maintainer in SIMULATOR.md), not a floor tuned to the symptom. The floor (10 km/h) and its restatement stay as ruled: after C. **IN FLIGHT 42 (the spread falling with the brake reaction on) IS NOT RESOLVED BY THIS: the probe shows the spread has a held-back component, which is what a brake reaction would change, and nothing here separates them; running the probe with the brake reaction off is the way to see it, not done.**

**WHAT `PERCEIVE=1` ACTUALLY DOES, FOUND BEFORE ANYTHING ELSE IS RESTATED ONTO IT (the maintainer's first addition, 12 November: "the crash-testing world crashes less than our normal world: that is backwards"). `[M]` FROM THE CODE AND THE RECORD.** `PERCEIVE=1` IS NOT BROKEN; IT IS A DIFFERENT SWITCH FROM THE ONE THAT CRASHES THE ORDINARY WORLD. (1) **`perceive: true` does what the name says: `seedGraph` turns it into `{ floor, span, jitter, who: "all" }`, everybody perceiving the world a registration lag behind (`seenBy`, the carried picture), 0.35 s to about 2 s. The comment on it in `crossing.js` records a measurement that WITH EVERYBODY LAGGED TRAFFIC TOUCHES "ONE PAIR IN FIFTEEN MINUTES", with harsh braking tripled, and that lag "does not read through braking ... because leaders here brake gently and following gaps are comfortable".** A low crash rate in the perceive-everybody world is the DOCUMENTED one; 0 crashes in three 300 s worlds and in `verify-crashes`' two three-minute worlds is what it predicts. (2) **THE ORDINARY WORLD CRASHES FOR ANOTHER REASON: THE BRAKE REACTION, `worldFor`'s default `brakeReaction = true` against `seedGraph`'s default `false`.** DECISIONS 10.46 (5 November) is titled "THE REAR-END RISK MADE REAL: A DRIVER'S OWN DELAY WHEN THE CAR AHEAD BRAKES", and it is a decision of THE PROJECT LEAD (Jay): *make the risk real ... it is why rear-ends happen ... "a poor observer should be the one who rear-ends, not a uniform chance"; NO TARGET RATE: build it honestly, measure*. The follower reads the lead as still doing its old speed until its own delay (`notices`, 0.35 s plus up to 1.6 s of observation deficit, with jitter, at most about 2.9 s) has passed since the lead's brake lamp came on. **SCORED THERE `[M]`: 0 TO 29 SAME-LANE CRASHES ON THE CITY (28 seeds, 150 cars, 10 minutes), 28 OF THE 29 STRIKERS IN THE WORST OBSERVATION QUARTILE; the prediction range was 5 to 60 and the stated falsification above 200.** (3) **SO THE "CRASH-TESTING WORLD" CRASHES LESS BECAUSE IT HAS NOT GOT THE MECHANISM THAT NOW DOES THE CRASHING: `verify-crashes` section 2 was written to find crashes by perceiving late (September), and the brake reaction (5 November) became the main source afterwards; its comment is stale and its world is the wrong one. The instrument is not broken; it is aimed at the wrong switch.**
**WHAT THIS DOES TO THE CRASH ITEM AND TO MY OWN CORRECTION OF THE STANDING CLAIM, BOTH REVISED: the low-speed rear-end at a queue is, in large part, A SANCTIONED MECHANISM (the project lead's own decision, strikers concentrated in the poor observers by design), NOT A SURPRISE, AND "THE DEFAULT TRAFFIC NEVER CRASHES" IS TRUE OF `seedGraph`'s DEFAULT (brake reaction off, the one world `verify-crashes` section 4 measures) AND FALSE OF THE WORLD THE PLAYER IS GIVEN (brake reaction on), where it was never tested. What stays open, and is the maintainer's: THE RATE (10.46 set no target and the record gives none; test map 1 at 260 cars is about 28 an hour, the city at 150 cars in 10.46 about 6 an hour from 29 crashes in 280 minutes, so the rate climbs faster than the density) AND THE DISTRIBUTION (what share of drivers carry a delay long enough to strike: the strikers being the worst quartile is by design, but how fat the worst quartile is, and whether "observation deficit" has the shape of a thin tail, was not asked in 10.46).**
**THE 2 x 2, PREDICTED BEFORE IT RUNS `[D]` (`tools/measure/crash-matrix.mjs`: test map 1, 260 cars, 180 s, no player, no checks; 6 seeds; perception off or on x brake reaction off or on): THE BRAKE REACTION IS WHAT CRASHES THE ORDINARY WORLD: brake reaction on, perception off, averages at least 1 crash a run (0.7); both switches off, and perception alone, average 0.3 a run or under (0.7); both on is at least as high as the brake reaction alone (0.6).** If perception alone crashes at the brake reaction's rate, this reading is wrong.

**THE 2 x 2, SCORED `[M]` (`crash-matrix.mjs`: test map 1, 260 cars, 180 s, no player, no checks; 6 seeds):**

| | crashes per seed | mean | seeds with a crash |
|---|---|---|---|
| perception off, brake reaction off | 0 0 0 0 0 0 | 0.00 | 0 of 6 |
| **perception ON, brake reaction off** (the `verify-crashes` world) | 0 0 0 0 0 0 | **0.00** | 0 of 6 |
| perception off, **brake reaction ON** (the ordinary world) | 0 1 1 0 2 4 | **1.33** | 4 of 6 |
| perception ON, brake reaction ON | 0 0 1 0 2 3 | 1.00 | 3 of 6 |

**THE BRAKE REACTION IS WHAT CRASHES THE ORDINARY WORLD, AND PERCEPTION CRASHES NOTHING IN IT.** SCORED AS MADE: brake reaction on, perception off, at least 1 a run (0.7): HIT (1.33); both off and perception alone at 0.3 a run or under (0.7): HIT (0.00 and 0.00, in 6 seeds each); both on at least as high as the brake reaction alone (0.6): NOT SHOWN (1.00 against 1.33, 6 against 8 crashes over 6 seeds, inside the noise). **THE "CRASH-TESTING WORLD" (`PERCEIVE=1`, `verify-crashes` section 2) CRASHES LESS THAN THE ORDINARY WORLD BECAUSE IT LACKS THE BRAKE REACTION. The instrument is not broken: it is aimed at the wrong switch, and its comment ("where crashes happen") is a September statement that the 5 November decision (10.46) overtook.** The fix is to run the invariant in a world that crashes (brake reaction on), and it is part of restating that check, after C.
**WHAT RESTS ON A `perceive: true` WORLD, AS A LIST TO RE-AUDIT AND NOT A FINDING: the files that build one are `verify-checks`, `verify-course`, `verify-crashes`, `verify-drive`, `verify-observation` and the measurements `lag`, `late-crashes`, `ped-strikers-look`, `entry-experience`, `world-hash` (`PERCEIVE`). Not every one relies on it for a crash claim (several set it only to exercise glances); the claim "no two cars overlap unless they are a recorded crash" does (`verify-crashes` section 2, shown vacuous over 0 crashes).**
**THE OTHER THREE ADDITIONS (the maintainer's, 12 November). (2) THE SPREAD'S CURE IS PRINCIPLED, AND ITS ANCHOR IS CHECKED: widen the spread of PREFERRED speeds toward the stated target and touch no floor. THE PROVENANCE OF "10 TO 12 KM/H", CHECKED `[M]`: it appears in `SIMULATOR.md` 1.2.15 ("A highway to swim in", 20 October) as the diagnosis of a desired-speed spread of +/- 21 km/h, "twice a real motorway's 10-12", and was copied into the `traffic.js` comment; THE MAINTAINER'S REQUEST THERE WAS "a highway the player can endlessly 'swim' in with traffic behaving like traffic would", a request and not a number, and no source for 10 to 12 is cited: IT IS THE AGENT'S FIGURE, `[invented]`, a documented intent and not a ruling.** So the target is better evidence than a floor and is still not Jay's; the question for his batch is the spread of speeds on the expressway at free flow. **NOT DONE: the preferred-speed spread is not widened here.** (3) **THE PREFERRED-SPEED SPREAD AND THE CRASHING ARE ONE ITEM WITH TWO MEASUREMENTS: THE SHAPE OF THE DRIVER POPULATION (are the distributions of driver attributes right?). Preferred speeds look too narrow (sd 7.9 against an unsourced 10 to 12) and the observation deficit looks too fat in its tail (28 of the 29 strikers in 10.46 were in the worst quartile, by design, but how large that quartile is was never asked). Both are things Jay feels from the driver's seat and no check notices.** Recorded as one item. (4) **THE CURB LANE: 16 / 36 / 48% IS A REAL PROPERTY OF THE ROAD AND `[invented]`, NOTHING IN THE RECORD SANCTIONS IT, AND IT STAYS IN JAY'S BATCH: nearly half the traffic in the slow lane and a sixth in the passing lane is what he can judge in ten seconds. THE LEFT LANE'S 4.1 km/h RISE IS THE SAME FINDING IN ANOTHER HAT: the passing lane was held back by slow cars, and now it is not.**
**IN FLIGHT 42 IS LEFT (the maintainer): running the loop-spread probe with the brake reaction off would settle it, and is now a cheap known experiment and not an open mystery; it does not displace C. NOTE FOR WHEN IT IS RUN: the brake reaction is the very switch that crashes the ordinary world, so the same switch is behind IN FLIGHT 36, 42 and the crashing.**
**C IS NEXT (the maintainer: "proceed with C"), AS A WORLD SWITCH IN THE REPO, OFF BY DEFAULT, THE TOLERANCE A FLAGGED CONSTANT INSIDE JAY'S 2 TO 3 s MARKED `[Jay]` FOR THE RANGE AND `[invented]` FOR THE POINT, REACHING THE PAGE THE WAY `checksOn` DOES (settings, a chip, `sceneFor`, `worldFor`, `seedGraph`) AND THE WORKER BY RIDING ON THE WORLD. WHEN IT LANDS, THE FULL PICTURE AGAINST JAY'S 2 TO 3 s IN ONE PLACE: the near-rest share, the long waits, the hard braking split by the joiner's speed, and the tight-merge share, because that is what the maintainer puts to Jay for the feel call on the phone.**

**C IS BUILT, BEHIND A WORLD SWITCH, OFF BY DEFAULT (12 November; working tree, NOT YET COMMITTED: the gate and the arms first).** `world.mergeTolerance` (seconds; `null` = off), read in ONE place, `gapFor`, only for a merge, plus the cars further ahead in `attempt` and the offerer's gap in `courtesy.js` (one definition, as with the table); the floor (the room to stop at the hardest braking) is never lowered; a lane change of choice is untouched. `MERGE_TOLERANCES = [2, 2.5, 3]`: `[Jay]` for the RANGE ("within that typical 2-3s gap", *"a smaller and smaller acceptable gap as their drivable space concludes"*), `[invented]` for the point inside it. REACHES THE PAGE THE WAY `checksOn` DOES: a saved setting (`mergeTol`), a state, a chip on the debug panel that cycles off, 2, 2.5, 3 s and restarts the world, `sceneFor` and `worldFor` and `seedGraph`; THE WORKER RECEIVES THE WORLD, which carries the field, so it needs no change. **A NEW CHECK, `tools/verify-mergetol.mjs`, with every assertion sabotaged once and caught by the intended line: the lag cap removed (2 assertions fail), the lead cap removed (1), the floor lowered (1), the cap applied to everybody (2, source-text assertions: the one limit, that "a lane change of choice is untouched" is checked by reading the one place it is read and not by a behaviour, because `gapFor` is not exported). A first version of one assertion passed with the mechanism removed (the lead need ahead of a joiner behind a moving car is 2 m with or without the cap); caught by sabotaging it, and replaced by a case where the uncapped need is 173 m.** **NEUTRAL OFF `[M]`: the four world hashes (loop 150 and 300 cars, test map 1, the city) are identical to D's; every route still renders (`verify-screens`).** (The neutrality run was taken while this paragraph was written, not before: it is a measurement and not a prediction.)
**THE FULL PICTURE AGAINST JAY'S 2 TO 3 s, IN ONE PLACE (the maintainer's request, for the feel call he will put to Jay on the phone): arms on the repo's own switch, no scratch tree: the old table as built (the unchanged worktree), D (off), and D with the tolerance at 2, 2.5 and 3 s, at 300 and 150 cars, three seeds, 180 s. The measures: the near-rest share, the long waits (a minute or more in total at rest), the HARD BRAKING SPLIT BY THE JOINER'S SPEED AT MERGE ONSET (bins 0 to 20, 20 to 40, 40 to 60, 60 km/h and over; the one committed in a8e3055), and the tight-merge share (the car behind left under 1 s).**
**PREDICTIONS, COMMITTED BEFORE THE ARMS RUN `[D]`.** THE SCRATCH ARMS ARE REPRODUCED: at 300 cars the repo's tolerance at 2.5 s leaves 4 to 8% of joiners near rest (the scratch arm D + C: 6.1%) (0.7); at 2 s 2.5 to 6.5% (0.6); at 3 s 6.5 to 11.5% (0.55); at 150 cars at 2.5 s under 2% (0.6). THE LONG WAITS: none (a minute or more in total at rest) at any of the three tolerances at 300 cars (0.8). HARD BRAKING OVER 5 m/s^2: above D's 2.8 to 4% at every tolerance and ordered by it, 6 to 9% at 2 s, 4 to 6.5% at 2.5 s, 3.5 to 5.5% at 3 s (0.6). TIGHT MERGES (under 1 s): D about 10.5%, with 2.5 s 11 to 15% (0.6). **THE SPLIT, THE TWO PREDICTIONS ALREADY COMMITTED, SCORED NOW: the maintainer's (at least three quarters of the over-5 events under the cap come from joiners under 40 km/h at onset, 0.6) and the agent's (the same, 0.5; those joiners under half of the merges, 0.6; AS BUILT, the old table, under 60% of them from under 40 km/h, 0.5; and the residue from joiners at 60 km/h or more, per merge, the same under the cap as as built within a point, 0.6).** What would say the trade does not dissolve: more than a quarter of the over-5 events under the cap from joiners at 40 km/h or more.

**THE MAINTAINER'S REVISION OF HIS OWN RULING (12 November): THE LOW-SPEED CRASHING IS NOT A DEFECT AND COMES OFF THE TOP OF THE BEHAVIOUR LIST.** He had it filed as an unexplained defect; 10.46 shows it is a SANCTIONED MECHANISM, decided deliberately by the project lead, and that 28 of 29 strikers in the worst observation quartile means **it is working precisely as intended**. RE-FILED AS WHAT IT IS: **A SANCTIONED MECHANISM WITH NO RATE EVER SET, A MISSING DECISION AND NOT A BUG.** He gave Jay the alarming version and is correcting that with him. **THE RATE IS JAY'S, AND THE ARITHMETIC IN DIGEST FORM, `[M]` unless marked:** TEST MAP 1 AT 260 CARS, THE ORDINARY WORLD (brake reaction on, no player): **8 crashes in 6 runs of 180 s, 1.33 a run, about 27 an hour** (the `verify-checks` scenario, with a scripted driver in the world: 14 and 15 in 10 runs, about 28 to 30 an hour); THE CITY AT 150 CARS, from 10.46 (5 November, an earlier build, uncapped delay, 28 seeds x 10 min): 29 crashes in 280 minutes, **about 6 an hour**. **"THE RATE CLIMBS FASTER THAN DENSITY" IS NOT SHOWN BY THOSE TWO FIGURES: they are two different maps in two different builds, and 10.46's own table records that the small maps' rate is a multiple of the city's.** It goes to Jay as the superlinearity question once it is measured on ONE map at several densities (below): the busier the road the more it degrades, which is the opposite of what a player would expect from heavy traffic.
**THE SURVIVING DEFECT, THE IMPORTANT HALF (the maintainer's): `verify-crashes` RUNS WITH THE BRAKE REACTION OFF, A CONFIGURATION NO PLAYER EXPERIENCES, WHILE `worldFor` TURNS IT ON FOR THE GAME: OUR SAFETY CHECKING HAPPENS IN A WORLD THAT IS NOT THE GAME. THE THIRD INSTANCE OF VERIFYING SOMETHING OTHER THAN WHAT SHIPS (his menu fix that passed locally and was broken on the served page; the checks running at densities below the one Jay plays; this): recorded as a PATTERN, not a one-off.** **THE FOURTH INSTANCE, FOUND IN THIS SESSION'S OWN WORK, `[M]` BY AUDIT: the differences between the world a player is given and the world the checks build.** `worldFor` passes `brakeReaction: true`, `walkers: true` and `rivals: true` to `seedGraph`, whose defaults are `false` for all three, and adds density shaping and the player; **14 checks build the world with `worldFor` (`verify-checks`, `-contact`, `-contact-escape`, `-encounters`, `-headway`, `-locate`, `-lookaway`, `-mergecount`, `-money`, `-places`, `-promotion`, `-shaping`, `-skill`, `-worker`) and 38 build it with `seedGraph` directly, of which ONE names `brakeReaction` at all (`verify-reaction`) and 5 pass `rivals` or `walkers`: 37 checks run with the brake reaction off, `verify-merge`, `verify-lanes`, `verify-courtesy` and `verify-crashes` among them.** **AND EVERY MERGE MEASUREMENT OF THIS SESSION, `lane-end.mjs` (all the arms, the table correction, D's 900 s worlds), was taken in `seedGraph`'s default world: brake reaction off, no walkers, no rivals, no player.** Whether that moves the hard-braking and tight-merge numbers is not known: the brake reaction concerns a driver's delay on a leader's brake lamp, and the hard braking behind a merge is exactly where it could matter (IN FLIGHT 36).
**THE FIX (the maintainer's): MAKE THE CHECKED WORLD THE PLAYED WORLD. If `seedGraph` and `worldFor` disagree about a default, the one the player gets is the one that is true, and the other is a test artifact.** A BLAST RADIUS TO PLAN, NOT A QUICK EDIT: changing `seedGraph`'s default moves the world of 37 checks and every hash, and several checks' numbers were set in the old world. THE ORDER: (1) re-measure this session's merge results in the played configuration (the probe takes `PLAYED=1`: brake reaction, walkers and rivals on, as `worldFor` sets them), before and after, to see whether anything moves; (2) then decide the default, with that number in hand; (3) `verify-crashes` section 2 moves to a world that crashes. NOT STARTED beyond the probe.
**THE SPREAD (the maintainer's): THE 10 TO 12 KM/H BEING THE AGENT'S OWN FIGURE MEANS THERE IS NO GROUNDED TARGET FOR THE SPREAD AT ALL; THE MAINTAINER'S WORDS, "a highway the player can endlessly swim in", ARE A FEEL REQUEST, SO THE SPREAD BELONGS IN JAY'S BATCH, NOT SET FROM A NUMBER INVENTED AND CITED BACK TO OURSELVES. NOTHING IS WIDENED.**
**THE DENSITY SWEEP, PREDICTED BEFORE IT RUNS `[D]` (`crash-matrix.mjs`, `MAP` and `CARS`: the ordinary world, brake reaction on, perception off, 6 seeds x 180 s; test map 1 at 100, 150, 200 and 260 cars; the city at 150 and 250 cars): test map 1 per hour: 100 cars 2 to 8, 150 cars 6 to 15, 200 cars 12 to 25, 260 cars 20 to 35 (0.55); THE LOG-LOG SLOPE OF THE RATE AGAINST THE CAR COUNT, 100 TO 260, ABOVE 1.3 (0.6), that is, SUPERLINEAR on one map; the city at 150 cars 2 to 10 an hour (0.55) and at 250 cars 8 to 25 (0.5).** If the slope is near 1, the rate is proportional to the traffic and "the busier the worse" is only the cars, not the road.

**THE FULL PICTURE AGAINST JAY'S 2 TO 3 s, SCORED `[M]` (the repo's own switch, no scratch tree; 3 seeds x 180 s; zero overlaps and zero crashes in every arm). PROVISIONAL IN ONE RESPECT, STATED FIRST: IT IS THE UNPLAYED WORLD (`seedGraph`'s default: brake reaction off, no walkers, no rivals, no player); THE SAME TABLE IN THE PLAYED CONFIGURATION IS RUNNING AND IS THE ONE TO PUT TO JAY.**

| 300 cars | near rest at the end | a minute+ at rest | tight (car behind under 1 s) | car behind over 3 / over 5 m/s^2 | over-5 events (from joiners under 40 km/h / 40 to 60 / 60 and over) | joiners under 40 km/h, share of merges |
|---|---|---|---|---|---|---|
| the old table as built (two charges) | 126 of 628 (20.1%) | 16 | 8.7% | 15.1% / 2.8% | 16 (0 / 1 / **15**) | 28% |
| D, tolerance OFF | 70 of 625 (11.2%) | 2 | 10.5% | 11.5% / 2.8% | 16 (0 / 1 / **15**) | 18% |
| D + 2 s | **26 of 623 (4.2%)** | 0 | 10.8% | 15.1% / 6.1% | 34 (10 / 3 / **21**) | 9% |
| D + 2.5 s | **36 of 617 (5.8%)** | 0 | **13.2%** | 12.6% / 5.1% | 28 (6 / 2 / **20**) | 9% |
| D + 3 s | **39 of 620 (6.3%)** | 0 | 11.4% | 11.2% / 6.0% | 33 (4 / 1 / **28**) | 11% |
| **150 cars:** old / D off / 2 s / 2.5 s / 3 s | 13 (4.1%) / 4 (1.3%) / **1 (0.3%)** / 1 (0.3%) / 2 (0.6%) | 0 | 6.4 / 6.8 / 7.1 / 7.2 / 6.8% | over 5: 1.8 / 2.2 / 3.0 / 3.8 / 3.2% | 5 / 6 / 8 / 10 / 9, all but 0 to 2 from joiners at 60 and over | 5 / 2 / 1 / 2 / 1% |

**THE HARD-BRAKING SPLIT, THE TWO COMMITTED PREDICTIONS, BOTH WRONG, AND THE REFRAMING DOES NOT HOLD AS HOPED.** The maintainer's (at least three quarters of the over-5 events under the cap come from joiners under 40 km/h, 0.6): **MISS: 29%, 21% and 12% at 2, 2.5 and 3 s.** The agent's (the same, 0.5; those joiners under half of the merges, 0.6; as built, under 60% from under 40 km/h, 0.5; the residue from joiners at 60 km/h or more per merge within a point of as built, 0.6): **the first MISS, the second HIT (9 to 11% of merges), the third HIT (0% as built), the fourth MIXED (as built 2.7% of merges, 3.8% at 2 s, 3.6% at 2.5 s HIT, 5.1% at 3 s MISS).** **WHAT THE SPLIT SAYS: THE HARD BRAKING BEHIND A MERGE IS MOSTLY NOT THE SLOW OR STOPPED JOINER. IT COMES FROM JOINERS AT 60 KM/H OR MORE: 15 of 16 EVENTS AS BUILT AND WITH D ALONE, 62 TO 85% UNDER THE CAP.** THE INCREASE CAUSED BY THE CAP, over-5 events from D's 16 to 34, 28 and 33, splits about a THIRD TO A HALF from joiners under 40 km/h (10, 6 and 4 events: Jay's "floors it into traffic", the sanctioned part) and the REST from joiners at 40 km/h or more (+8, +6, +13 events, about 1 to 2% of the merges). **THE MAINTAINER'S CONDITION FOR "THE TRADE DOES NOT DISSOLVE" (more than a quarter of the under-the-cap over-5 events from joiners at 40 km/h or more) IS MET, AT 71 TO 88%: WHAT IS LEFT FOR JAY TO RULE ON IS SMALL, 6 TO 13 EVENTS IN ABOUT 560 MERGES, AND IT IS NOT THE STOPPED JOINER.** CAVEAT, UNCHANGED: the braking is the nearest car behind in the four seconds after the merge and is not attributed to it; the fast-joiner events are present in the old table at 15 of 299 merges, so most are the stream's own braking beside a merge; the increment is the evidence.
**THE REST OF THE PICTURE, SCORED AS MADE `[D]`.** The scratch arms are reproduced: at 300 cars the tolerance at 2.5 s leaves 5.8% near rest (the scratch D + C: 6.1%; predicted 4 to 8%, 0.7: HIT); at 2 s 4.2% (2.5 to 6.5%, 0.6: HIT); at 3 s 6.3% (6.5 to 11.5%, 0.55: MISS by 0.2); at 150 cars at 2.5 s 0.3% (under 2%, 0.6: HIT). The long waits: none at any tolerance (0.8: HIT). Hard braking over 5 m/s^2: ordered by tolerance, 6.1%, 5.1%, 6.0% (6 to 9, 4 to 6.5, 3.5 to 5.5: two HITS, one MISS; NOT monotone in the tolerance, on 28 to 34 events a cell). Tight merges at 2.5 s 13.2% (11 to 15%, 0.6: HIT).
**AGAINST JAY'S 2 TO 3 s, IN WORDS, WITH THE UNPLAYED-WORLD CAVEAT: at 300 cars the tolerance takes the joiners at or near rest at the lane end from 20% as built (11% with D alone) to 4 to 6%, and the minute-long waits from 16 to none; about 1 merge in 8 leaves the car behind under a second (up from 1 in 11); the car behind brakes over 5 m/s^2 after about 1 merge in 19 (up from 1 in 36), most of those after a joiner who had speed. At 150 cars the pile-up is gone (0.3 to 0.6%) at a cost of about 1 more merge in 50 with a hard brake behind it.**

**THE MAINTAINER'S REFRAMING OF THE HARD BRAKING WAS WRONG AND THE TRADE DOES NOT DISSOLVE (12 November; recorded as his, scored as the miss it is).** The over-5 events come overwhelmingly from joiners at 60 km/h or more (12 to 29% from under 40 km/h under the cap, against the three quarters he predicted at 0.6). **NOTHING IN JAY'S RULING SANCTIONS A FAST JOINER TAKING A TIGHT GAP, SO THE RESIDUE IS A REAL COST, AND IT IS EXACTLY THE PART HE CLAIMED HAD DISAPPEARED. RECORDED: HE TOLD JAY THE TRADE HAD MOSTLY DISSOLVED ON THE STRENGTH OF REASONING AND NOT OF MEASUREMENT.** WHAT KEEPS IT PROPORTIONATE IS THE SEPARATION OF THE INCREMENT FROM THE BASE: most fast-joiner events exist as built (15 of 299 merges in the old table), so the stream's own braking carries them, and only **6 TO 13 EVENTS IN ABOUT 560 MERGES ARE THE CAP'S DOING: ROUGHLY ONE MERGE IN FIFTY GAINING A HARD BRAKE IT SHOULD NOT HAVE, AND THAT, NOT THE RAW PERCENTAGE, IS THE QUESTION FOR JAY.** (`[M]` for the counts; unattributed braking, so an increment between arms and not a cause; and unplayed world until the played table lands.)
**A PATTERN IN THE MAINTAINER'S OWN BEHAVIOUR, NAMED BY HIM, WHICH HAS NOW COST TWICE IN AN HOUR: HE REASONED FROM A PLAUSIBLE STORY TO A CONCLUSION AND HANDED IT ON AS SETTLED. He reframed the braking as sanctioned before it was split, and called `PERCEIVE=1` broken before the code was read. THE RULE HE SETS HIMSELF: HOLD REFRAMINGS UNTIL THE MEASUREMENT THAT WOULD TEST THEM EXISTS; "I haven't established that" is the habit he has been failing to apply.** (The agent's instances of the same shape this session, for the record: "the load account" held up on three points before the half-exits test; "the projected-speed sizing is the cause" stated as a hypothesis and then tested by ablation; the "6 m/s^2" noted and not guessed. The cheap remedy has been the same each time: say what is not established.)
**THE 37-CHECK FINDING IS RAISED TO WHAT IT IS (the maintainer's): THE CONDITION OF THE SUITE, NOT A PATTERN INSTANCE. 14 checks build the played world, 38 build `seedGraph`'s default, one names the brake reaction: THE GREAT MAJORITY OF THE SUITE, AND EVERY `lane-end` NUMBER TAKEN THIS SESSION, RAN WITHOUT THE BRAKE REACTION, WALKERS OR RIVALS.** TWO CONSEQUENCES: (1) **EVERY RESULT FROM THIS SESSION IS PROVISIONAL UNTIL THE PLAYED TABLE LANDS, D's EVIDENCE INCLUDED** (labelled so from the first table, not on request). (2) **THE FIX IS NOT TO CONVERT 37 CHECKS BY HAND: IT IS TO MAKE THE PLAYED WORLD THE DEFAULT A CHECK GETS UNLESS IT DELIBERATELY ASKS OTHERWISE, SO THE BURDEN SITS ON THE EXCEPTION AND NOT ON EVERY AUTHOR REMEMBERING.** PROPOSED APPROACH, NOT BUILT: one function that builds the world for a check, taking the played flags by default (`brakeReaction`, `walkers`, `rivals`, shaping, and `worldFor`'s own defaults for car count and `every`) and an explicit, named `plain: true` (or a named flag set) for the check that deliberately wants the bare world, each such use carrying a one-line reason; `seedGraph`'s own defaults stay as they are for the sim, since it is the engine and not the game; checks migrate by being run twice, once each way, the differences listed, and the ones that move are the ones to read first (a check whose numbers move was set in the wrong world). The blast radius is every hash and 37 worlds, so it is its own change with its own gate and comes after C.
**NOTHING GOES TO JAY UNTIL THE PLAYED TABLE. WHEN IT LANDS: THE SAME SINGLE TABLE PLUS THE INCREMENT SPLIT, AND THE RESIDUE (about one merge in fifty gaining a hard brake from a joiner with speed) IS THE ONLY QUESTION HE NEEDS TO ANSWER.** The single-map density sweep stays as the fix for the "faster than density" claim, which the agent declined to draw from two different maps.

**THE PLAYED-CONFIGURATION TABLE, `[M]` (`lane-end.mjs`, `PLAYED=1`: brake reaction, walkers and rivals on, as `worldFor` sets them; the repo's own switch; 3 seeds x 180 s; no player; the unplayed figure in brackets).**

| 300 cars | near rest at the end | a minute+ at rest | tight (car behind under 1 s) | car behind over 5 m/s^2 | over-5 events (under 40 km/h / 40 to 60 / 60 and over) | joiners under 40 km/h, share of merges | recorded crashes |
|---|---|---|---|---|---|---|---|
| old table as built | 77 of 608 (12.7%) [20.1%] | 8 | 9.9% [8.7%] | 2.5% [2.8%] | 13 (2 / 0 / 11) [16] | 22% | 4 |
| D, tolerance off | 60 of 627 (9.6%) [11.2%] | 2 | 10.7% [10.5%] | 2.0% [2.8%] | 11 (1 / 0 / 10) [16] | 14% | 4 |
| D + 2 s | **24 of 617 (3.9%)** [4.2%] | 0 | 9.5% [10.8%] | **8.6%** [6.1%] | 48 (13 / 3 / 32) [34] | 9% | 2 |
| D + 2.5 s | **34 of 610 (5.6%)** [5.8%] | 0 | 13.1% [13.2%] | 5.7% [5.1%] | 32 (4 / 4 / 24) [28] | 9% | 2 |
| D + 3 s | **46 of 621 (7.4%)** [6.3%] | 0 | 10.9% [11.4%] | **2.5%** [6.0%] | 14 (3 / 1 / 10) [33] | 12% | 1 |
| **150 cars:** old / D / 2 s / 2.5 s / 3 s | 15 (4.7%) / 12 (3.7%) / **5 (1.5%)** / 8 (2.5%) / 8 (2.5%) | 0 | 7.9 / 8.1 / 5.5 / 7.2 / 8.4% | 4.3 / 2.5 / 4.4 / 2.4 / 2.8% | 12 / 7 / 13 / 7 / 8 | 5 / 5 / 3 / 3 / 5% | 1 in every arm |

**WHAT HOLDS ACROSS THE TWO WORLDS: the tolerance takes the joiners near rest at the lane end from 12.7% as built (9.6% with D alone) to 3.9 to 7.4% at 300 cars, and from 4.7% to 1.5 to 2.5% at 150; the minute-long waits go from 8 to none; the tight-merge share is 9.5 to 13.1% against 9.9% as built. The near-rest figures reproduce the unplayed world within about 2 points, and the OLD table's near-rest share is lower in the played world (12.7% against 20.1%): the brake reaction changes the base.** `[M]` **D IN THE PLAYED WORLD: near rest 12.7% to 9.6%, a minute or more at rest 8 to 2, tight 9.9 to 10.7%, over 5 m/s^2 2.5 to 2.0%, recorded crashes 4 against 4 at 300 cars and 1 against 1 at 150: D's evidence holds in the played configuration.** (The overlapping car-ticks the probe counts include the standing wrecks of recorded crashes, so they are not a count of silent overlaps; the crash counts are the comparable figure.)
**WHAT DOES NOT HOLD, AND IS THE FINDING THAT STOPS THE "ONE MERGE IN FIFTY": THE HARD-BRAKING COLUMN IS NOISE-DOMINATED AT THREE SEEDS. The over-5 events the tolerance adds over D, from joiners at 40 km/h or more, per merge, `[M]`: PLAYED 2 s +25 events (1 in 22 merges), 2.5 s +18 (1 in 31), 3 s +1 (1 in 552); UNPLAYED 2 s +8 (1 in 69), 2.5 s +6 (1 in 92), 3 s +13 (1 in 43).** Six cells, a spread of 25 to one, no monotone order in the tolerance, and the cell counts (11 to 48 events) are small. The unplayed 3 s arm has 33 events and the played 3 s arm 14. THE BRAKING IS THE NEAREST CAR BEHIND IN THE FOUR SECONDS AFTER A MERGE, UNATTRIBUTED, AND IN THE PLAYED WORLD A SANCTIONED CRASH ITSELF (a wreck standing in the lane, a queue behind it) PRODUCES THE VERY BRAKING THE MEASURE COUNTS, SO THE FIGURE IS CONFOUNDED IN EXACTLY THE WORLD IT IS WANTED FOR. **THE INCREMENT CANNOT BE PUT TO JAY AS A RATE FROM THIS: any single figure from 1 in 22 to 1 in 500 can be read out of it.** `[D]` Pooled over the three tolerances, played, 44 events in about 1,670 merges (1 in 38), unplayed 26 in about 1,660 (1 in 64): both in the range, neither a measurement.
**THE REMEDY, STATED BEFORE IT IS RUN: MORE SEEDS, MATCHED, AND THE INCREMENT AS A PER-SEED DIFFERENCE WITH ITS OWN SPREAD (the played world, 300 cars, seeds 1 to 10, D against D + 2, 2.5 and 3 s: the over-5 events from joiners at 40 km/h or more per seed, the difference from D's on the same seed, the mean and its standard error), AND THE EVENTS NEAR A RECORDED CRASH REPORTED SEPARATELY SO THE SANCTIONED MECHANISM CAN BE SEEN NOT TO BE CARRYING THE RESULT.** PREDICTIONS, COMMITTED BEFORE IT RUNS `[D]`: the mean increment at 2.5 s is positive (a standard error under its mean) (0.6); the three tolerances are not distinguishable from one another (their means within two standard errors) (0.6); the pooled increment is between 1 in 25 and 1 in 100 merges (0.6); events within 20 s of a recorded crash in the same lane are at least a fifth of the over-5 events in the played world (0.5). If the increment's standard error is as large as its mean, the cost cannot be stated and is reported as "not measurable from this probe". NOTHING GOES TO JAY UNTIL IT IS.

**D'S EVIDENCE, STATED PLAINLY (the maintainer's, 12 November): D STANDS ON PLAYED-WORLD EVIDENCE, NOT ONLY THE UNPLAYED TABLE `[M]`: joiners near rest at the lane end 12.7% to 9.6% at 300 cars, joiners with a minute or more at rest 8 to 2, tight merges 9.9% to 10.7%, the car behind over 5 m/s^2 2.5% to 2.0%, recorded crashes 4 and 4 (and 1 and 1 at 150 cars).**
**THE METRIC IS CHANGED BEFORE THE TEN-SEED BATCH, AND THE BATCH THAT HAD ALREADY STARTED WAS STOPPED (the maintainer's change): ATTRIBUTE THE BRAKE TO ITS CAUSE BEFORE MEASURING IT.** The wreck confound is what the "unattributed" flag, raised five or six times, was warning about: in the played world a sanctioned crash leaves a wreck, the queue behind it brakes hard, and a time window counts that as a merge's cost, in the configuration that matters and as the sole input to the only decision put to Jay. **"WE HAVE MEASURED A TIME WINDOW ALL NIGHT AND CALLED IT A COST." The fix is causal: the braking car either has the joiner as its relevant leader at that moment, or it does not.** WHAT HAPPENED TO THE BATCH: it was queued behind the density sweep and started the moment the sweep finished, on the previous probe; it was killed (25 processes, none left) before any result was read, and its partial outputs are discarded.
**THE ATTRIBUTION, BUILT INTO THE PROBE, READ FROM THE SIM ITSELF: at the tick a hard brake begins (the first tick the car behind's deceleration passes 3, and separately 5 m/s^2, in the four seconds after a merge), `whatStops(b, w).leader` is the car it is actually following. MERGE: the leader is the joiner and the joiner is not itself braking hard (its own deceleration no worse than 1.5 m/s^2, `[invented]`): the follower brakes for the gap or the closing speed the merge made. JOINER BRAKING: the joiner is the leader but is braking itself, so the cause is upstream of the merge. OTHER CAR: it follows somebody else. STOPPED OR WRECK: its leader stands or is a recorded crash. LINE: a stop line or a signal. NONE. The wreck-ahead flag is kept as a second, independent reading.** THE LIMIT, STATED: a follower braking for the joiner because the joiner braked for a wreck is classed JOINER BRAKING, and one braking for a car that braked for the joiner is OTHER CAR, so the merge's cost is, if anything, UNDERSTATED by the "merge" class alone; the increment of the merge class is the proportionate figure and the others say what the rest is.
**A PROBE NEEDS A KNOWN CASE, AND ONE IS STATED HERE: in the UNPLAYED world (no brake reaction, no recorded crashes) no event may be classed through a crash (`ld.crash`), and in the played world with a recorded crash standing in the lane the wreck-ahead flag and the "stopped or wreck" class should agree on most events; an `error` class that is not zero would mean `whatStops` could not be asked.**
**PREDICTIONS FOR THE ATTRIBUTION, COMMITTED BEFORE ANY RUN `[D]` (played world, 300 cars, seeds 1 to 10, D and D + 2, 2.5 and 3 s; everything else exactly as committed: ten seeds, the increment as a per-seed difference with its standard error, and "NOT MEASURABLE FROM THIS PROBE" if the standard error is as large as the mean): (a) the share of the over-5 events that are MERGE-caused is 30 to 70% (0.5); (b) events whose leader is a wreck or whose lane has a wreck ahead are at least 10% of the over-5 events in the played world (0.5), and none are classed through a crash in the unplayed world (0.95); (c) the MERGE-class increment at 2.5 s is positive with a standard error under its mean (0.5) and SMALLER than the unattributed increment (0.7), that is, attribution shrinks the cap's apparent cost; (d) the merge-class events come mostly from joiners at 40 km/h or more (0.6); (e) the `error` class is zero (0.9).** NOTHING GOES TO JAY UNTIL THE INCREMENT HAS AN ERROR BAR. THE ORDER: THE DENSITY SWEEP (DONE, scored below), ATTRIBUTION, THE TEN SEEDS, THE GATE FOR C.

**THE SINGLE-MAP DENSITY SWEEP, SCORED `[M]` (`crash-matrix.mjs`, `MAP` and `CARS`: the ordinary world, brake reaction on, perception off, no player; 6 seeds x 180 s a cell, 18 minutes of traffic).**

| | crashes per seed | total | per hour | seeds with a crash |
|---|---|---|---|---|
| test map 1, 100 cars | 0 1 0 0 1 0 | 2 | 6.7 | 2 of 6 |
| test map 1, 150 cars | 0 3 0 1 1 1 | 6 | 20.0 | 4 of 6 |
| test map 1, 200 cars | 1 2 0 0 1 1 | 5 | 16.7 | 4 of 6 |
| test map 1, 260 cars | 0 1 1 0 2 4 | 8 | 26.7 | 4 of 6 |
| the city, 150 cars | 0 0 0 0 0 0 | 0 | 0.0 | 0 of 6 |
| the city, 250 cars | 0 1 0 0 0 2 | 3 | 10.0 | 2 of 6 |

**SCORED AS MADE (per hour, test map 1): 100 cars 2 to 8: HIT (6.7); 150 cars 6 to 15: MISS (20.0); 200 cars 12 to 25: HIT (16.7); 260 cars 20 to 35: HIT (26.7); the log-log slope of the rate against the car count above 1.3 (0.6): 1.31, a HIT BY A HAIR AND MEANINGLESS AT THIS SAMPLE; the city at 150 cars 2 to 10 an hour: MISS (0.0, zero in 18 minutes); at 250 cars 8 to 25: HIT (10.0).** **"THE RATE CLIMBS FASTER THAN DENSITY" IS NOT ESTABLISHED, AND THE HONEST STATEMENT IS THAT IT CANNOT BE FROM THIS: 2 crashes at 100 cars and 8 at 260 is a ratio of 4.0 for 2.6 times the cars, and counts that small leave the ratio's interval wide enough to include proportional (a slope of 1.0); the 150-car cell is above the 200-car cell. TO SEPARATE A SLOPE OF 1.3 FROM 1.0 TAKES HUNDREDS OF CRASHES, NOT WORTH THE RUNS.** The city at 150 cars crashed 0 times in 18 minutes against about 6 an hour in 10.46 (an earlier build): at 6 an hour 18 minutes would give about 1.8, so 0 is not a contradiction. **FOR THE DIGEST, WHAT IS KNOWN: about 27 an hour on test map 1 at 260 cars, about 7 an hour at 100, about 10 an hour on the city at 250; WHETHER THE RATE CLIMBS FASTER THAN THE TRAFFIC IS NOT KNOWN, and is not to be put to Jay as a finding (the maintainer's request was for the arithmetic; this is it, with the slope marked unestablished).**
**TWO CORRECTIONS TO THIS SESSION'S OWN PROBE WORK, BEFORE THE ATTRIBUTED BATCH: (1) `wreckAhead`, added in `c74538f`, called `exitAlong`, which `lane-end.mjs` never imported; the 30 s smoke test of that commit fired no event, so the path never ran, and the first played run that reached a hard brake crashed with a ReferenceError: caught by running a longer smoke test in the played world before the batch, which is the seventh silent no-op or latent defect of the day caught before it shipped, and the exact shape of "a probe path nobody exercised". FIXED AND EXERCISED (events fired in all three smoke seeds). (2) THE TEN-SEED BATCH HAD ALREADY STARTED when the attribution was asked for: it was queued behind the sweep and began the moment the sweep finished; 25 processes were killed and its partial outputs discarded, none read.**
**THE ATTRIBUTION, SMOKE-TESTED `[M]` (played world, 300 cars, tolerance 2 s, seeds 1 to 3, 180 s: NOT the batch, and SEEN BEFORE THE PREDICTIONS BELOW WERE COMMITTED, so those predictions are not independent of it): the `error` class is 0 in all three; the over-5 events by cause (merge / joiner braking / other car / stopped or wreck): seed 1 7 / 1 / 6 / 0 of 14, seed 2 11 / 0 / 8 / 0 of 19, seed 3 6 / 1 / 8 / 0 of 15: ABOUT HALF (24 of 48) MERGE-CAUSED, ABOUT HALF ANOTHER CAR, none through a wreck and the wreck-ahead flag 0 in all three (recorded crashes in those worlds: 1, 0, 1).** What that says so far, and no more: the unattributed count was about twice the merge's, and in these three seeds the wreck did not carry it; the batch decides.

**THE MAINTAINER'S THIRD RETRACTION OF THE NIGHT (12 November): HE TOLD JAY THE CRASHING GETS WORSE FASTER THAN TRAFFIC GETS HEAVIER; ON 2 TO 8 CRASHES A CELL THAT IS NOT ESTABLISHED, AND THE SWEEP IS NOT EVEN MONOTONE (20 AN HOUR AT 150 CARS, 16.7 AT 200). SAME CAUSE AS THE OTHER TWO: A STORY AHEAD OF THE MEASUREMENT.** The slope is marked UNESTABLISHED in the digest.
**"THE CRASH RATE LOOKS LIKE A PROPERTY OF THE MAP, NOT OF THE DENSITY" (the maintainer's inference from the sweep), AT THE STRENGTH THE DATA SUPPORTS `[M]`: TONIGHT'S CELLS ARE CONSISTENT WITH IT AND TOO SMALL TO ESTABLISH IT (the city at 150 cars 0 crashes in 18 minutes against an expected 2.0 at test map 1's 100-car rate, a Poisson probability of 0.14; the city at 250 cars 3 against test map 1 at 260 cars 8); THE SUPPORT IS THE EARLIER MEASUREMENT AT MATCHED DENSITY, DECISIONS 10.46 "ON3" (5 November): same-lane crashes per minute at 180 cars, 4 seeds of 10 minutes: the trial city 0, THE LOOP 0.03, TEST MAP 1 0.17 (2.1 times the city's 0.08 at 150 cars, 28 seeds), that is, test map 1 about 5.7 times the loop at the same density.** So "about 27 an hour" is a fact about test map 1 and not about the game, and every figure in the digest carries its map by name: test map 1 at 260 cars about 27 an hour; test map 1 at 100 cars about 7; the city at 250 cars about 10; the city at 150 cars 0 in 18 minutes (about 6 an hour on 5 November, an earlier build).
**THE HIGHWAY (the endless loop), THE MAP THAT SHIPS AND THE ONE JAY DRIVES, WAS NOT TREATED AS THE SUBJECT, AND IT HAS DATA ALREADY, `[M]`: (1) DECISIONS 10.46 ON3, 5 November: the loop 0.03 a minute at 180 cars, about 1.8 an hour (4 seeds x 10 minutes, an earlier build, before the merge machinery's later changes). (2) THIS SESSION'S PLAYED ARMS RECORDED IT, AND IT WAS NOT READ AS A RATE: the loop in the played configuration, no player, 3 seeds x 180 s: 300 cars, D: 4 crashes, about 27 an hour (as built 4, tolerance 2 s 2, 2.5 s 2, 3 s 1); 150 cars, every arm: 1 crash, about 7 an hour. The unplayed 900 s worlds: 0.** SO THE HIGHWAY IS NOT CLEAN IN THE PLAYED CONFIGURATION AT THE DENSITIES JAY PLAYS, AND ITS RATE WENT FROM ABOUT 2 AN HOUR AT 180 CARS (5 NOVEMBER) TO ABOUT 7 AT 150 AND 27 AT 300 TONIGHT: counts of 1 and 4, a different build, nothing established. **THE QUESTION THE HIGHWAY RAISES, WHICH THE FIRST FIGURES CAN NOT ANSWER: whether the MERGES are in the crashes (a joiner at the end of a lane, a car braking behind a forced merge), which would make the rate part of what this evening's work changes.**
**THE HIGHWAY SWEEP AND THE CRASH CHARACTERISATION, QUEUED BEHIND THE TEN-SEED BATCH, PREDICTED BEFORE THEY RUN `[D]` (`crash-matrix.mjs`, `MAP=test-loop`, `PLAYED=1`: brake reaction, walkers and rivals on, as `worldFor` sets them; D, tolerance off; 100, 150, 200, 260 and 300 cars x 6 seeds x 180 s; each crash described: whether either car is in the merge zone (on or entering an acceleration lane, on a slip road), whether either is changing lane, whether they follow one another on one route, and the speeds): THE LOOP'S RATE PER HOUR: 100 cars 0 to 5, 150 cars 3 to 12, 200 cars 6 to 20, 260 cars 12 to 35, 300 cars 15 to 40 (0.5 each; the 300-car figure rests on 4 crashes, the others on 1 to 4); AT LEAST HALF OF THE LOOP'S CRASHES INVOLVE A CAR IN THE MERGE ZONE (0.5); THE LOOP IS LOWER THAN TEST MAP 1 AT THE SAME DENSITY (150 cars: under 20 an hour; 260 cars: under 26.7) (0.6); MOST ARE LOW-SPEED REAR-ENDS, BOTH CARS UNDER 20 KM/H HALF A SECOND BEFORE, AS ON TEST MAP 1 (0.6).** The per-map figures, the map named every time, go in the digest.
**ORDER (the maintainer's): THE BATCH, THEN THE HIGHWAY RATE, THEN THE GATE FOR C. THE ATTRIBUTION'S UNDERSTATEMENT STAYS FLAGGED EXACTLY AS WRITTEN: a follower braking for a car that braked for the joiner is classed OTHER CAR, so the merge's cost is, if anything, UNDERSTATED, the honest direction for an error to run in a figure about to be handed to Jay as the price of a change.** The early read (about half the over-5 events merge-caused, no wreck events in three seeds) suggests the wreck confound is smaller than assumed and the stream's own braking the larger share: the same lesson as the fast-joiner split; the batch decides.

**THE TEN-SEED ATTRIBUTED BATCH, SCORED `[M]` (12 November; played world, ON THE LOOP (test-loop, the map `lane-end.mjs` drives), 300 cars, seeds 1 to 10, 180 s each, D against the merge tolerance at 2, 2.5 and 3 s; the increment is the per-seed matched difference from D, mean +- standard error over ten seeds; hard brake = the car behind over 5 m/s^2 within four seconds of a merge; the `error` class 0 in all 40 runs).**

| arm | merges | over-5 events | of them merge-caused | other car | joiner braking | crashes |
|---|---|---|---|---|---|---|
| D (cap off) | 1875 | 60 | 39 (65%) | 21 | 0 | 8 |
| 2 s | 1897 | 151 | 90 (60%) | 56 | 5 | 5 |
| 2.5 s | 1901 | 101 | 56 (55%) | 40 | 5 | 5 |
| 3 s | 1882 | 68 | 47 (69%) | 20 | 1 | 4 |

| increment over D, events per seed | all over-5 | merge-caused | other car | crashes |
|---|---|---|---|---|
| 2 s | +9.10 +- 2.22 | +5.10 +- 1.37 | +3.50 +- 0.99 | -0.30 +- 0.21 |
| 2.5 s | +4.10 +- 1.48 | +1.70 +- 0.90 | +1.90 +- 0.82 | -0.30 +- 0.21 |
| 3 s | +0.80 +- 0.96 | +0.80 +- 0.70 | -0.10 +- 0.55 | -0.40 +- 0.31 |

**WHAT THE TABLE SUPPORTS, AND ONLY THAT: (1) THE COST OF THE CAP FALLS AS THE TOLERANCE LOOSENS: at 2 s the increment is clear (about 4 standard errors), at 2.5 s it is clear on the unattributed count (2.8 standard errors) and 1.9 standard errors on the merge-caused count, at 3 s it is NOT MEASURABLE FROM THIS PROBE (standard error as large as the mean; the pre-committed rule). (2) THE BASE: D has 60 over-5 events in 1875 merges (3.2%); the cap at 2 s makes it 8.0% (about 1 more event in 20 merges), at 2.5 s 5.3% (about 1 in 46), at 3 s 3.6% (not distinguishable from D). (3) THE MERGE-CAUSED EVENTS ARE FAST JOINERS: 38 of D's 39 come from joiners at 40 km/h or more, the same direction as the earlier speed split. (4) THE WRECK CONFOUND DID NOT OCCUR IN THIS SAMPLE: zero over-5 events were classed through a wreck or had a wreck ahead, in all 40 runs, with 8 recorded crashes in D's ten worlds; THE TIME-WINDOW MEASURE HAD NOT BEEN INFLATED BY WRECK QUEUES HERE, AND THE WARNING RAISED FIVE OR SIX TIMES IS ANSWERED, FOR THIS MAP AND THIS DENSITY, WITH "NOT A FACTOR". It is not established for denser worlds or for the city. (5) THE CAP DID NOT RAISE THE CRASH COUNT (8, 5, 5, 4: about -0.3 a seed, inside one standard error; not an effect either way).**
**WHAT THE TABLE DOES NOT SUPPORT: the cost is the price of the cap and the benefit side (joiners near rest, minute-long waits, from the earlier tables) is a different measurement on a different probe; the digest sets them side by side and does not net them. THE UNDERSTATEMENT STANDS, EXACTLY AS WRITTEN: a follower braking for a car that braked for the joiner is classed OTHER CAR, so the merge-caused column understates the cap's cost; the other-car column moves with the tolerance (+3.5, +1.9, -0.1) and a part of it is very probably the same consequence two cars back, which the probe cannot separate.**
**PREDICTIONS SCORED (committed before the batch, and after the 3-seed smoke test, which was disclosed): the merge share 30 to 70%: HIT in all four arms (65, 60, 55, 69%). Wreck-related at least 10% in the played world: MISS (0%); none through a crash in the unplayed world: NOT TESTED, no unplayed arm was run. The merge-caused increment at 2.5 s positive with a standard error under its mean: HIT (1.70 +- 0.90), and smaller than the unattributed one (4.10): HIT. Merge-caused mostly from joiners at 40 km/h or more: HIT (38 of 39). The `error` class zero: HIT. Earlier: the mean increment at 2.5 s positive (0.6): HIT; the tolerances indistinguishable (0.6): MISS, there is a clean gradient and 2 s is far from 3 s; the pooled increment 1 in 25 to 100 merges: HIT (1 in 46 at 2.5 s); wreck-adjacent events at least 1 in 5 (0.5): MISS.** THE ONE THAT MOST NEEDS SAYING: THE WRECK-CONFOUND STORY, WHICH SHAPED THE ORDER OF THE NIGHT'S WORK, WAS A HYPOTHESIS AND THIS MEASUREMENT REFUTES IT FOR THIS SAMPLE; the restated finding (the cap's increment is mostly fast joiners, of a size that depends on the tolerance) is what the first unattributed numbers already said, now with an error bar.

**HOW THE BATCH LANDED, FOR THE RECORD (the maintainer, 12 November), FOUR THINGS.**
**(1) THE JUSTIFICATION FOR THE ATTRIBUTION WORK WAS UNFOUNDED, AND THE WORK WAS RIGHT ANYWAY. The attribution was pressed on the strength of the wreck confound, and the confound was absent: zero events in forty runs, despite eight crashes. THE REASON GIVEN WAS WRONG. WHAT THE WORK PRODUCED IS WHAT MADE THE DECISION POSSIBLE: separating merge-caused from other-car braking is why there is a defensible figure with an error bar instead of a six-way spread. Both halves stand, and neither is tidied into the other.**
**(2) THE MISSED PREDICTION "THE TOLERANCES ARE INDISTINGUISHABLE" IS THE USEFUL MISS: the gradient is clean (+9.1, +4.1, +0.8 over-5 events a seed at 2, 2.5 and 3 s), and that gradient is what makes the point a real choice for the maintainer rather than a formality. Had they been indistinguishable the choice would have been arbitrary.**
**(3) CRASHES DID NOT RISE WITH THE CAP, WHICH WAS THE RESULT MOST FEARED AND LEAST EXPECTED: 8 under D, then 5, 5 and 4 at 2, 2.5 and 3 s. WHAT IS ESTABLISHED: THE CAP BUYS FEWER STOPPED JOINERS WITHOUT BUYING COLLISIONS. WHAT IS NOT: that it buys FEWER (the matched difference is -0.3 +- 0.21 a seed at 2 and 2.5 s and -0.4 +- 0.31 at 3 s, inside about one and a half standard errors, on 4 to 8 crashes in ten worlds).**
**(4) THE TRADE IN THE MAINTAINER'S OWN TERMS, BOTH SIDES NAMED WITH THEIR SOURCES `[M]`: THE BENEFIT (joiners at rest within 15 m of the taper, `atRestNearEnd`, this batch's own probe output, 2100 joiners an arm): D 9.0%, 2 s 3.7%, 2.5 s 5.1%, 3 s 6.4%; joiners that rested at all 199, 71, 93, 115. THE COST (over-5 events a seed, the table above): +9.1, +4.1, +0.8, with the merge-caused part +5.1, +1.7, +0.8 (not measurable at 3 s). SO 3 s LEAVES ABOUT 1.7 TIMES AS MANY JOINERS STOPPED AS 2 s DOES (134 against 78; "twice" was an overstatement) AND AGAINST D'S 190 IT REMOVES ABOUT 30% OF THE STOPPED JOINERS (2 s removes about 59%, 2.5 s about 43%), WITH NO MEASURABLE EXTRA HARD BRAKING.** THESE TWO COLUMNS COME FROM TWO MEASUREMENTS ON ONE SET OF RUNS: THEY ARE NOT NETTED HERE AND MUST NOT BE. IF ANYONE LATER WANTS A SINGLE NUMBER FOR THE TRADE THEY SHOULD HAVE TO LOOK AT BOTH SOURCES AND NOTICE THEY WERE MEASURED SEPARATELY, BY DIFFERENT PROBES, WITH DIFFERENT NOISE (the cost has an error bar; the stopped-joiner count has none computed here). The default stays OFF until the maintainer chooses; the chip lets him drive all three.
**THE GATE FOR C IS RUNNING (`node tools/check.mjs`, 55 checks the 8 changed files can reach) WHILE THE HIGHWAY SWEEP COMPETES FOR THE SAME CPU: a TIMEOUT line in it is a candidate for load, not for a defect, and is re-run alone before it is believed.**

**THE HIGHWAY CRASH RATE, SCORED `[M]` (12 November; THE ENDLESS LOOP, test-loop, THE MAP THAT SHIPS; played configuration (brake reaction, walkers, rivals), no player, D (tolerance off); 6 seeds x 180 s a cell, 18 minutes of traffic a cell; car-car crashes, nobody on foot was struck in any run).**

| loop, cars | crashes per seed | total | per hour | seeds with a crash |
|---|---|---|---|---|
| 100 | 0 0 0 0 0 0 | 0 | 0.0 | 0 of 6 |
| 150 | 0 0 1 0 0 0 | 1 | 3.3 | 1 of 6 |
| 200 | 0 0 0 0 0 0 | 0 | 0.0 | 0 of 6 |
| 260 | 0 0 1 0 0 1 | 2 | 6.7 | 2 of 6 |
| 300 | 3 0 1 0 1 0 | 5 | 16.7 | 3 of 6 |

**POOLED, 8 CRASHES IN 90 MINUTES OF LOOP TRAFFIC ACROSS FIVE DENSITIES: ABOUT 5 AN HOUR. THE HIGHWAY IS FAR CLEANER THAN TEST MAP 1 AT THE SAME DENSITY (150 cars: 3.3 an hour on the loop against 20.0 on test map 1; 260 cars: 6.7 against 26.7), WHICH IS THE MAP-NOT-DENSITY POINT AT ITS FIRST DIRECT, SAME-PROBE MEASUREMENT, AND IT AGREES WITH 10.46 (the loop 0.03 a minute, about 1.8 an hour). THE DENSITY DEPENDENCE ON THE LOOP IS NOT ESTABLISHED (0, 1, 0, 2, 5 crashes; the rate rises only at 300 cars, on 5 crashes).**
**WHAT THE CRASHES ARE `[M]`: all 8 are rear-ends on one route (8 of 8 following one another, none changing lane); 5 of 8 had both cars under 20 km/h half a second before. TWO OF THE 8 ARE A SPAWN ARTEFACT, NOT DRIVING: in seed 3, at t = 0.1 s, two cars both at 0 km/h crash on the on-7 slip road, at 260 and at 300 cars (the same seed places the same two cars), so the traffic is placed overlapping at the start of that road. THIS WAS FIRST READ AS A PLACEMENT DEFECT AND IS CORRECTED BELOW (it is a crash in the warm-up, counted because the clock reset leaves the crash list alone): counted out, the loop has 6 crashes in 90 minutes, 4 an hour pooled. Seed 1 at 300 cars is a pile-up, three crashes at the end of loop-6 in curb lane 2 over four seconds (t = 64 to 69 s), one incident and not three.** WHETHER THE MERGES ARE IN THE CRASHES: 4 of 8 involve a car on or entering the acceleration lane or a slip road (50%), BUT TWO OF THOSE FOUR ARE THE T = 0.1 ARTEFACT, SO 2 OF 6 (33%) ON REAL DRIVING; the other two real ones are on the loop proper, none in a lane change. **THE MERGES ARE NOT THE LOOP'S CRASH PROBLEM ON THIS EVIDENCE, AND THE CAP'S CRASH COUNT (8, 5, 5, 4 in the ten-seed batch, above) IS ALREADY CONSISTENT WITH THAT; 6 crashes is not a basis for more.**
**PREDICTIONS SCORED (committed before the run): the loop's rate per hour: 100 cars 0 to 5: HIT (0.0); 150 cars 3 to 12: HIT BY A HAIR (3.3, on one crash); 200 cars 6 to 20: MISS (0.0); 260 cars 12 to 35: MISS (6.7); 300 cars 15 to 40: HIT (16.7, on 5 crashes, and MISS at 13.3 with the artefact out). At least half the crashes involve the merge zone: HIT AS MEASURED (4 of 8) AND NOT ROBUST (2 of 6 without the artefact). The loop lower than test map 1 at the same density: HIT at both (3.3 against 20.0; 6.7 against 26.7). Most low-speed rear-ends, both cars under 20 km/h: HIT (5 of 8, one of the 5 the artefact).** THE PREDICTED RATES WERE TOO HIGH AT 200 AND 260 CARS: THE LOOP IS CLEANER THAN THE EARLIER ARITHMETIC SUGGESTED, ABOUT 4 TO 5 AN HOUR IN THE PLAYED CONFIGURATION, NOT 7 TO 27. THE FIGURE FOR THE DIGEST, THE MAP NAMED: THE ENDLESS LOOP, ABOUT 5 AN HOUR POOLED OVER 100 TO 300 CARS, 17 AN HOUR AT 300 ON 5 CRASHES; NO DENSITY SLOPE ESTABLISHED.

**THE CRASH ITEM IS UNFOLDED, TWO ITEMS AGAIN (the maintainer, 12 November): CRASH HOTSPOTS, LOCAL; AND THE PREFERRED-SPEED SPREAD, POPULATION. HE FOLDED THEM ON A HYPOTHESIS, THAT CRASHES CAME FROM A FAT TAIL OF BAD OBSERVERS APPEARING EVERYWHERE, AND THE HIGHWAY DESCRIPTIONS CONTRADICT IT: A POPULATION DEFECT SCATTERS CRASHES AND THESE CLUSTER. THE ORDER FOR THE CRASH ITEM: FIND WHAT IS SPECIAL ABOUT THE PLACES BEFORE TOUCHING THE OBSERVATION DISTRIBUTION. THE STANDARD FOR ALL CRASH WORK, WHEN IT STARTS: NEVER A COUNT WITHOUT A DESCRIPTION OF EACH CRASH. (Describing each crash is what produced the clustering, the low speeds, the warm-up crash below and the pile-up that was one incident.)**
**THREE CORRECTIONS TO HOW THE HIGHWAY RESULT WAS FIRST READ, `[M]`, BEFORE ANY OF IT IS USED:**
**(1) "ALL EIGHT ON ONE ROUTE" IS NOT WHAT THE DATA SAYS. The probe's "same route" counted whether the TWO CARS in a crash followed one another (8 of 8 did). The crashes are on FOUR routes in THREE PLACES: on-7 slip road to loop-7 (3: the warm-up crash counted at 260 and again at 300, and one at 150 cars, seed 3, t = 26 s), the end of loop-6 into loop-7 in curb lane 2 (3, the seed-1 pile-up at 300, one incident), on-5 slip road to loop-5 (1, seed 5 at 300), the end of loop-2 into loop-3 (1, seed 6 at 260). THE EVIDENCE IS "CLUSTERED AT A FEW PLACES, TWO OF THEM RAMP ENTRANCES", NOT "ONE ROUTE", AND EIGHT CRASHES IN FOUR PLACES IS A HYPOTHESIS TO TEST (which stretches, what is special: a slip road's end, a curb lane approaching a junction), not a finding.**
**(2) THE "SPAWN OVERLAP" IS NOT A PLACEMENT DEFECT. `seedGraph` warms a world and sets the clock back to zero but leaves `w.crashes` as it was, so a crash in the warm-up is in the list at t = 0, and `crash-matrix.mjs` counts the whole list. In seed 3 at 260 and 300 cars two cars crashed DURING THE WARM-UP on the on-7 slip road (cars 874 and 904, 4.38 m apart where their queue followers stand 6.3 m apart), and behind that wreck stands a queue of 17 or more cars at rest, s = 256 to 366. WHY THE LEADING PAIR WERE 4.38 m APART IS NOT KNOWN: it is a crash like the others, with a wreck and a queue behind it, found at the seeding instead of at 20 Hz. NEW PROBE `tools/measure/warmup-crashes.mjs` COUNTS THEM: the warm-up crash exists ONLY in the loop at 260 and 300 cars, seed 3 (1 each; 0 in all other loop cells and in all four test-map-1 cells of the earlier sweep). SO TONIGHT'S OTHER CRASH COUNTS ARE NOT CONTAMINATED BY IT, and the claim that it contaminates every count on worlds including that road is NOT SUPPORTED by this measurement; what IS true: the highway cells at 260 and 300 each hold one crash that happened before the clock started (their rates exclude it at 3.3 an hour at 260 and 13.3 at 300), and THE TEN-SEED BATCH'S SEED 3 HOLDS IT TOO, IN EVERY ARM (1 crash in every arm), which is why the matched comparison is untouched by it.**
**(3) THE CAP'S CRASH COUNTS, RESTATED WITH THE PER-SEED PICTURE: D 3 0 1 0 1 0 1 2 0 0; 2 s 1 0 1 0 1 0 0 2 0 0; 2.5 s the same; 3 s 0 0 1 0 1 0 0 2 0 0. THE ARMS DIFFER IN TWO SEEDS ONLY, SEED 1 (the pile-up: 3, 1, 1, 0) AND SEED 7 (1, 0, 0, 0); the rest are identical across arms, seed 3's being the warm-up crash. "THE CAP DOES NOT RAISE CRASHES" STANDS, AND "IF ANYTHING SLIGHTLY FEWER" IS TWO SEEDS, ONE OF THEM A SINGLE INCIDENT, WHICH IS LESS THAN IT LOOKED.**
**THE FIGURE FOR JAY, THE MAP AND DENSITY NAMED, THE ARTEFACT EXCLUDED: THE ENDLESS LOOP AT 260 CARS, PLAYED CONFIGURATION: 1 CRASH IN 18 MINUTES, ABOUT 3.3 AN HOUR (6.7 AN HOUR WITH THE WARM-UP CRASH, WHICH IS NOT DRIVING THE PLAYER SEES); POOLED OVER 100 TO 300 CARS 6 CRASHES IN 90 MINUTES, ABOUT 4 AN HOUR; AT 300 CARS 4 CRASHES IN 18 MINUTES (13.3 AN HOUR), WHICH IS 3 INCIDENTS (the pile-up counted once); NO DENSITY SLOPE ESTABLISHED. TEST MAP 1 AT 260 CARS, A DIFFERENT MAP, IS ABOUT 27 AN HOUR (8 CRASHES IN 18 MINUTES). SO THE LOOP IS ABOUT A QUARTER TO AN EIGHTH OF THE FIGURE JAY WAS FIRST TOLD, DEPENDING ON WHETHER THE WARM-UP CRASH IS COUNTED, AND THE FIGURE JAY WAS TOLD WAS TRUE OF A MAP HE DOES NOT DRIVE.**

**THE UNFOLDING IS REOPENED (the maintainer, 12 November): THE GROUNDS FOR IT WERE A MISREAD FIELD. "Same route" meant the two cars in a crash followed one another; it was read as the crashes sharing a stretch of road, and two of the maintainer's decisions (the unfolding, and what he told Jay) were built on that reading. FOUR ROUTES IN THREE PLACES IS WEAKER THAN ONE ROUTE AND STRONGER THAN SCATTERED, SO "IS THE CRASHING LOCAL OR POPULATION-WIDE" IS OPEN, NOT SETTLED EITHER WAY. The two items stay two, since that costs nothing; THE BASIS FOR KEEPING THEM APART IS THIN IN BOTH DIRECTIONS, AND WHOEVER PICKS THE CRASH ITEM UP TAKES "LOCAL OR POPULATION" AS THE FIRST QUESTION, NOT AN ANSWERED ONE.** The test that separates them is cheap once there are enough crashes: the same stretches at several seeds and densities (local), or the same drivers (population: which of a crash's two cars is a poor observer, a bold one). Neither has been done.
**THE WARM-UP LEAK IS AN INSTRUMENT DEFECT AND IS TO BE FIXED AT THE SOURCE, NOT FILTERED AROUND: `warmed()` (src/sim/crossing.js) moves everything on the warm-up's clock back to zero and drops the past, and it leaves `w.crashes` as it was, with each crash's `t` on the warm-up's clock, in the future of the world that has just started. It is the same class as the five rebases its own comment lists ("everything that is on that clock"). TWO CONSEQUENCES, BOTH REAL: every probe that counts `w.crashes` after a run counts the warm-up's crashes inside its window (the one measured case: the loop at 260 and 300 cars, seed 3, in played configuration; none in test map 1's four cells or the loop's other three), and the screen (`MapRoad`, the crash count and the last crash) can open on a crash that happened before the player started. THE FIX, AFTER THE GATE FOR C SO THE TWO CHANGES STAY SEPARABLE: the crash list begins empty at the rebase (the past is dropped on the same principle); the wreck itself stays, as an actor. A CHECK TO HOLD IT, WITH A KNOWN CASE: the loop at 260 cars, seed 3, played, has a crash in its list at t = 0 today; after the fix it must not, and a world's crash times must never lie beyond its own clock; sabotaged by removing the fix. The standing wreck at the head of a 17-car queue at the start of that world is a separate matter and is left alone.**
**THE CAP'S CRASH EFFECT IS DOWNGRADED, FOR THE MAINTAINER TO CORRECT WITH JAY: FROM "CRASHES DID NOT RISE" TO "WE CAN NOT TELL FROM THIS SAMPLE WHETHER THEY MOVED": the arms differ in two seeds of ten, one of them the pile-up (one incident), 8, 5, 5 and 4 crashes. WHAT IT WOULD TAKE FOR A STRONGER ANSWER, `[D]` from the batch's own rates: D has about 0.5 crash incidents a 180 s seed at 300 cars on the loop (5 incidents in ten seeds, the warm-up crash out). Two Poisson counts are told apart at a ratio of 2 with about 30 incidents in each arm, so about 60 seeds an arm; a ratio of 1.3 needs several hundred. Pairing the arms on one seed (they share their warm-up, and 8 of 10 seeds agreed across arms) helps the rare-event comparison, it does not make a 30% rise visible. `crash-matrix.mjs` is cheap (about 70 s a 300-car run, six at a time): 3 arms (D, 2.5 s, 2 s) x 40 new seeds is 120 runs, about 25 to 30 minutes with the machine free. THAT RUN CAN SHOW A ROUGHLY DOUBLED CRASH RATE AND CAN NOT SHOW A SMALL RISE; so it is worth running tonight as the answer to "does the cap double the crashes", and the decision should be put as "no large effect, a small one unmeasured" whatever it shows.**
**PREDICTIONS FOR THAT RUN, COMMITTED BEFORE IT, `[D]` (the loop, 300 cars, played, seeds 11 to 50, after the leak fix; a crash INCIDENT is the crashes of one place within 10 s counted once, both counts reported): D: 0.3 to 0.8 incidents a seed (0.6); the paired per-seed difference of 2.5 s from D has a standard error at least as large as its mean, so "not distinguishable" (0.65); the 2.5 s arm has MORE incidents than D in total (0.4, i.e. the direction is not predicted); at least one place in the loop appears in three or more incidents across the 40 seeds (0.6), the first piece of evidence for "local".**
**THE PATTERN, RECORDED AS WHAT IT IS (the maintainer's own account, 12 November): THIS IS THE FOURTH TIME TONIGHT A FIRST READING WAS HANDED ON AS A CONCLUSION, AND IT HAPPENED TEN MINUTES AFTER SAYING IT WOULD STOP. IT IS NOT IMPATIENCE WITH MEASUREMENTS ANY MORE, IT IS OVER-READING THE ONES THAT EXIST: a field read by what it was named and not by what it counted. A DIFFERENT FAULT FROM THE EARLIER THREE (a story ahead of the measurement). THE CHECK THAT CATCHES IT IS A QUESTION ASKED OF EVERY FIELD BEFORE A CONCLUSION IS BUILT ON IT: WHAT DID THIS COUNT, EXACTLY?**

**WHICH WAY THE WARM-UP LEAK QUESTION WENT, BEFORE ANY OF THE SAMPLE'S NUMBERS ARE QUOTED `[M]` (12 November): THE FIX WAS IN THE TREE BEFORE THE SAMPLE STARTED (`crossing.js` written 00:10, the first sample output 00:15; `verify-crashes` section 5 red before it and green after), SO THE SAMPLE'S CRASH LISTS DO NOT HOLD A WARM-UP CRASH. A SECOND, INDEPENDENT WITNESS CONFIRMS IT AND ALSO SAYS HOW OFTEN THE ARTEFACT OCCURS: `warmup-wrecks.mjs` counts crashed cars STANDING at t = 0, which a warm-up crash leaves whatever the list says. On the loop at 300 cars: seeds 11 to 50, 6 of 40 open with a wreck (17, 19, 27, 30, 35, 40); seeds 1 to 10, 2 of 10 (3 and 8). 8 of 50 seeds, so the leak was NOT unique to seed 3 and the maintainer's worry was right; the same seeds in all three arms (the warm-up does not differ with the cap), 0 in the crash list in every one.** TWO CONSEQUENCES: (1) THE SAMPLE IS CLEAN OF IT, and a split by those six seeds is below. (2) THE TEN-SEED BATCH'S CRASH COUNTS (8, 5, 5, 4) PROBABLY HOLD MORE WARM-UP CRASHES THAN THE ONE ALREADY NOTED: seed 3 (1) and seed 8 (2) are warm-up wrecks in the census, and the batch has 1 and 2 in those seeds in every arm; the census used `crash-matrix`'s configuration and not `lane-end`'s, so this is consistent and not verified. Taking those out, D 5, 2 s 2, 2.5 s 2, 3 s 1; the differences between arms are exactly as before. **A LOUD CONSEQUENCE FOR THE WORLD: 8 OF 50 SEEDS OF THE LOOP AT 300 CARS OPEN WITH A WRECK STANDING ON THE ROAD AND A QUEUE BEHIND IT; THAT IS A SEPARATE PROBLEM FROM THE LEAK (the warm-up lets cars crash that then stand into the played world), not yet touched.**
**THE CRASH SAMPLE, SCORED `[M]` (the endless loop, 300 cars, played configuration, no player, seeds 11 to 50, 40 paired seeds, 180 s; the crash list free of warm-up crashes; an INCIDENT is the crashes at one place within 10 s counted once; D = tolerance off):**

| arm | crashes | incidents | per seed | per hour | with a lane change | both cars under 20 km/h |
|---|---|---|---|---|---|---|
| D | 19 | 18 | 0.450 | 9.0 | 5 | 7 |
| 2.5 s | 5 | 5 | 0.125 | 2.5 | 0 | 0 |
| 2 s | 8 | 8 | 0.200 | 4.0 | 0 | 1 |

**PAIRED PER-SEED DIFFERENCE FROM D: 2.5 s: -0.325 +- 0.090 incidents (3.6 standard errors; 11 seeds differ, ZERO with more crashes under the cap, 11 with fewer); 2 s: -0.250 +- 0.106 (2.4 standard errors; 10 fewer, 1 more). THE CAP LOWERS THE LOOP'S CRASH RATE IN THIS SAMPLE, BY ABOUT THREE QUARTERS AT 2.5 s, AND THE EARLIER "CRASHES DID NOT RISE" WAS THE LEAST OF IT: THE DIRECTION IS DOWN. THE SIX SEEDS THAT OPEN WITH A WRECK DO NOT DRIVE IT: D 3 crashes in those six seeds and 16 in the other 34, 2.5 s 1 and 4, 2 s 1 and 7.** WHAT IS NOT ESTABLISHED: THE MECHANISM. D's crashes are at three places that recur across independent seeds (loop-6 into loop-7: 5 incidents; loop-2 into loop-3: 5; the on-7 slip road into loop-7: 4; the rest 4 in three places) and 5 of its 19 involve a lane change, none of the cap arms' 13 do; why a cap on the gap a merge asks for would remove lane-change crashes at junction exits is a hypothesis (fewer or earlier lane changes into the places the cars crash behind each other) and nothing here tests it. ALSO NOT ESTABLISHED: that it holds on any other map or density, or with a player.
**PREDICTIONS SCORED (committed before the run): D 0.3 to 0.8 incidents a seed: HIT (0.45). The 2.5 s difference not distinguishable from zero: MISS (3.6 standard errors). The 2.5 s arm with MORE incidents than D (0.4, the direction not predicted): MISS, the opposite. At least one place in three or more incidents across the 40 seeds (0.6): HIT (three places at 5, 5 and 4 in D). THE TWO MISSES ARE THE RESULT: the cap's crash effect was predicted indistinguishable and is clear, and clear in the helpful direction.** FOR THE DIGEST, THE MAP NAMED: THE ENDLESS LOOP AT 300 CARS, WITHOUT THE CAP 0.45 CRASH INCIDENTS A 3-MINUTE SEED (ABOUT 9 AN HOUR); WITH THE CAP 0.125 AT 2.5 s (ABOUT 2.5 AN HOUR) AND 0.2 AT 2 s (4 AN HOUR). THE TRADE IS NOW THREE COLUMNS, EACH FROM ITS OWN MEASUREMENT AND NOT NETTED: stopped joiners (fewer under the cap, most at 2 s), hard braking after merges (more, most at 2 s), crashes (fewer, by about three quarters at 2.5 s and a half at 2 s; the cap arms are not ordered by tolerance on crashes, 5 against 8 on 40 seeds, which is noise).
**THE FOUR RED CHECKS RUN ON THE UNCHANGED TREE (`dd-base`, an ancestor of HEAD, its `lanechange.js` byte-identical to the one before D) WITH TODAY'S CHECK FILES `[M]` (the maintainer's instruction: the baseline log from 11 November is not comparable, because a log is evidence about a check only if the version of the check that wrote it can be established, and the commit and log timestamps had been treated as interchangeable all night):** the check files first: `verify-loop`, `verify-anticipation` and `verify-checks` are byte-identical to `dd-base`'s (last changed 9 October, 22 October and 5 November); `verify-merge` differs (changed 11 November 16:55, five minutes before the log that read as green, so which version wrote that log is not established and it is not used). RESULTS, today's check on the pre-D tree against the same check on D: **VERIFY-ANTICIPATION: PASSES PRE-D, FAILS UNDER D (9.5 s against 9.0): D'S, THE EXPECTATION HELD. VERIFY-LOOP: PASSES PRE-D (exit 0, the identical check file), FAILS UNDER D (spread sd 9.0 km/h, 153 overtakes): D'S, AND THE EXPECTATION THAT ITS BASELINE WAS NOT COMPARABLE IS WRONG, THE FILE HAS NOT CHANGED SINCE 9 OCTOBER. VERIFY-CHECKS: PASSES PRE-D, FAILS UNDER D (1 crash where it wants none): it is a single-seed assertion on a base rate (the ten-seed replay earlier tonight: 14 crashes with D against 15 without), so D introduced nothing to the rate and flipped one seed's outcome; THE EXPECTATION HELD AND THE RED STAYS UNTIL THE CHECK IS RESTATED. VERIFY-MERGE: TWO OF ITS THREE FAILING LINES FAIL PRE-D TOO AND WORSE: the minute-long waits 9 at 300 cars pre-D against 2 under D, the near-rest share at the lane end 24.5% pre-D against 13.3% under D, so those two reds are NOT D's and D improved both numbers; THE THIRD LINE, courtesy (the [invented: 20 s, 0.7] bar), PASSES PRE-D (13 waits of 20 s or more, with courtesy 0.23 of without) AND FAILS UNDER D (3 such waits, 0.26): D's; THE RATIO (0.26) IS INSIDE THE BAR (0.7), SO THE LINE FAILS ON HOW MANY LONG WAITS THERE ARE TO MEASURE (3 against 13), which is an INFERENCE from the output and not a read of the check's code; whether a bar that needs long waits to measure anything can be passed by a world that has fewer of them is a question about the bar, not the world.** THE EXPECTATION SCORED: verify-merge not comparable: HALF RIGHT (the two Jay-bar lines are old and improved, the third is D's); verify-loop not comparable: WRONG; verify-checks a base rate: RIGHT; verify-anticipation D's: RIGHT. **THE ATTRIBUTION THE COMMIT MESSAGE MAY CARRY: of the four reds, `verify-anticipation` and `verify-loop` are D's (they pass on the unchanged tree with today's identical checks), `verify-checks` is D's only in the sense that a base rate crossed one seed's threshold, one line of `verify-merge` is D's and two are older than D, and none is C's: C is off by default and the four failing outputs are identical with C and without it.**
**TWO STANDING PRACTICES, RECORDED (the maintainer, 12 November): (1) A LOG IS ONLY EVIDENCE ABOUT A CHECK IF THE VERSION OF THE CHECK THAT WROTE IT CAN BE ESTABLISHED; timestamps on logs and on commits were treated as interchangeable all night, and a comparison across a period in which the check was rewritten measures the rewrite. (2) RUNNING THINGS IN PARALLEL COSTS CONFUSION, NOT CORRECTNESS: the simulation is stepped and seeded, so contention costs time and gives the same numbers; it did give a stale gate count that was read as a stall.**

**THE MAINTAINER'S EXPECTATION OF THE FOUR REDS, SCORED AS HE ASKED (12 November): ONE WRONG, ONE HALF RIGHT, TWO RIGHT. `verify-loop`'s check file had not changed since 9 October, so "not comparable" was wrong, INFERRED FROM THE PATTERN (a check rewritten in the exposure pass) AND NOT FROM THE FILE; `verify-merge` half right; `verify-checks` and `verify-anticipation` held, AND THOSE TWO CAME FROM EARLIER EVIDENCE (the ten-seed replay; the anticipation mechanism), NOT FROM THE REASONING THAT PRODUCED THE WRONG ONE.** The one that was wrong is the one with no measurement under it, which is the same lesson as the other four of the night: a reading from a pattern.
**THE CORRECTION OF THE "SPAWN OVERLAP BUG" STANDS, AND THE SUSPICION UNDER IT SURVIVES IT, so the retraction is not to be read as closing the question: the warm-up crash was not a placement overlap at t = 0.1 s (the probe counted a list that the clock reset did not clear), AND YET 8 OF 50 LOOP SEEDS OPEN WITH A WRECK AND A QUEUE BEHIND IT. SOMETHING ABOUT HOW TRAFFIC STARTS MAY BE WRONG; THE MECHANISM FIRST NAMED WAS NOT THE RIGHT ONE.**
**THE WARM-UP QUESTION, STATED BEFORE IT IS MEASURED (the maintainer's hypothesis, to be tested and not assumed): THE INITIAL PLACEMENT IS THE DEFECT, cars put on the road in a configuration real traffic would not be in, and the first seconds resolve it with collisions; if so, every measurement inherits it and a player opens a world that has already had a crash. THE TEST: the crash rate PER SECOND during the warm-up against the rate per second of the run, on the same seeds. TWO THINGS TO KEEP STRAIGHT BEFORE THE NUMBERS: (1) "8 of 50 seeds" and "0.45 incidents per 180 s seed" are not comparable until they are divided by the time each covers; the warm-up is a minute or so, so a crash in 16% of seeds may be about the run's own rate and not many times it. (2) THE SIM DOES NOT PLACE CARS AT THE START: `warmed()` runs the world from empty, a car a tick through `joinAt`'s room test, until 95% of the target is on the road (at least 20 s and `acrossIt` long) and then puts the clock back; so the candidate defect is THE FILL (cars entering at the edges at the fastest rate the room test allows, into a road that is empty then dense), not an initial arrangement. The tool: `tools/measure/warmup-rate.mjs`, run in a scratch worktree at the tree before the leak fix with a hook in `warmed()` exposing the warm-up's length (`dd-warm`, not committed).** PREDICTIONS, COMMITTED BEFORE THE DURATIONS ARE SEEN (the 8-of-50 count was seen first, and that is disclosed): the warm-up runs 60 to 120 s a seed on the loop at 300 cars (0.6); the warm-up's crash rate per second is within 0.5 to 3 times the run's, about 0.0026 a second (D, 19 crashes in 40 x 180 s, the same configuration), and NOT more than ten times it (0.5; more than ten times, 0.1); the warm-up's crashes cluster at the same places as the run's (loop-6 into loop-7, loop-2 into loop-3, on-7 into loop-7) (0.4).
**ORDER (the maintainer's): THE LEAK FIX'S GATE (running), THEN PUSH AND MERGE IF CLEAN, THEN THE WARM-UP QUESTION; THE MARGINS ON `verify-loop` AND `verify-anticipation` ARE RESTATABLE NOW THAT C HAS LANDED BUT WAIT FOR THE WARM-UP QUESTION, BECAUSE IT MAY MOVE THE NUMBERS THEY WOULD BE RESTATED AGAINST.** The gate and the warm-up measurement are running at the same time, which costs time and not correctness.

**THE WARM-UP QUESTION, MEASURED `[M]` (12 November; `warmup-rate.mjs` in the scratch worktree `dd-warm`, the loop at 300 cars, played configuration, seeds 1 to 50): THE WARM-UP IS NOT CRASHIER THAN THE RUN PER SECOND, AND THE HYPOTHESIS THAT THE INITIAL PLACEMENT IS THE DEFECT IS NOT SUPPORTED.** THE WARM-UP RUNS 109 s A SEED ON AVERAGE (105 to 109 s, 285 cars on the road when it ends); 12 crashes in 5448 s of warm-up in 8 of 50 seeds, 0.0022 A SECOND (7.9 an hour), AGAINST 0.0026 A SECOND FOR THE RUN (D, 19 crashes in 40 x 180 s, 9.5 an hour): ABOUT 0.85 TIMES THE RUN'S RATE, NOT MANY TIMES IT. The same by incidents (10 in the warm-up, two of its crashes being second entries of one incident 1.6 s apart; 0.0018 a second against the run's 0.0025). **"8 OF 50 SEEDS" LOOKED LIKE A HIGH RATE BECAUSE IT WAS NOT DIVIDED BY ITS TIME: 109 s at the run's own rate expects about 0.28 crashes a seed, and 12 in 50 seeds is 0.24.** SO WHAT IS WRONG IS NOT THE START OF THE TRAFFIC BUT WHAT THE WORLD DOES WITH THE END OF THE WARM-UP: THE RUN'S ORDINARY CRASH PROCESS RUNS FOR 109 s BEFORE THE PLAYER ARRIVES, AND WHATEVER IS STANDING WHEN THE CLOCK IS PUT BACK IS WHAT THE WORLD OPENS ON (a crash 10 s before the end of the warm-up is still a wreck at t = 0: 11 crashes of 12 fall in the last 40% of it, the last at 108.6 of 108.9 s).
**WHERE AND WHEN `[M]`: ALL 11 WARM-UP CRASHES THAT CAN BE PLACED ARE ON THE SLIP ROADS, at the start of the acceleration lane (on-7 into loop-7 twice, on-5 into loop-5 five times, on-3 into loop-3 three times, on-1 into loop-1 once; the twelfth could not be placed), NOT ON THE LOOP PROPER; and they come LATE, 11 of the 12 after 60% of the warm-up, when the road is nearly full. THE RUN'S CRASHES ARE SPREAD DIFFERENTLY (D, 18 incidents: 6 on slip roads and 12 on the loop, loop-6 into loop-7 and loop-2 into loop-3 five each). THE RAMP ENTRANCES ARE A HOT SPOT IN BOTH, AND THE LOOP-TO-LOOP JUNCTIONS ONLY IN THE RUN. THE WARM-UP'S LATE-PHASE RATE IS PROBABLY ABOUT TWICE THE RUN'S (11 crashes in the last 40% of 5448 s, about 0.0050 a second), BUT THE DENSITY BY TIME WAS NOT MEASURED, SO THAT IS AN ARITHMETIC OF THE FRACTIONS AND NOT A FINDING.**
**PREDICTIONS SCORED (committed before the durations were seen): the warm-up runs 60 to 120 s: HIT (109 s). The warm-up's rate per second within 0.5 to 3 times the run's: HIT (0.85), and not more than ten times: HIT. The warm-up's crashes cluster at the same places as the run's: MISS, mostly (all on slip roads against half the run's on the loop). THE MAINTAINER'S HYPOTHESIS IS NOT SUPPORTED BY THE TEST HE SET: "if warm-up is many times higher, placement is the suspect"; it is not many times higher.** WHAT THE FINDING LEAVES: (1) A PLAYER'S WORLD OPENS ON A STANDING WRECK AND ITS QUEUE IN ABOUT ONE LOOP SEED IN SIX AT 300 CARS (8 of 50), because the world is built by running the ordinary traffic for 109 s and keeping whatever is on the road. That is a DESIGN QUESTION FOR THE MAINTAINER, NOT A DEFECT TO FIX: clear the wrecks and the cars in them when the warm-up ends, or let the player meet them; the loop's played world is the case. (2) EVERY RUN MEASUREMENT IS A MEASUREMENT OF A WORLD THAT STARTED ABOUT 109 s OF ORDINARY TRAFFIC EARLIER, AND THE ONE THING THE START CARRIES THAT THE RUN DOES NOT PRODUCE IS ITS STANDING WRECKS: the sample split by the six wreck-at-t0 seeds is in the record above, and they do not drive its result. (3) THE SLIP-ROAD ENTRANCES ARE THE FIRST PLACE TO LOOK FOR WHAT MAKES THE LOOP CRASH; this is local evidence in the sense of the reopened question, and it says nothing yet about the population.

**THE MAINTAINER'S FIFTH MISS OF THE NIGHT, AND THE FAULT NAMED (12 November): THE PLACEMENT HYPOTHESIS WAS BUILT ON A COUNT WITHOUT A DENOMINATOR. "8 of 50 seeds" sounded alarming because it was never divided by the 109 s the warm-up runs; at the run's own rate 0.28 crashes a seed are expected and 0.24 were found, so the warm-up is, if anything, SLIGHTLY CLEANER THAN THE GAME. HE HAD SPENT THE DAY INSISTING THAT A COUNT WITHOUT ITS DENOMINATOR MEANS NOTHING, AND THEN BUILT ON ONE: A COUNT COMPARED WITH A RATE. The earlier four were stories ahead of the measurement and over-reading a field; this is a fifth shape, a unit mismatch, and it is the cheapest of them to check: write the denominator next to every count before comparing it with anything.**
**WHAT SURVIVES, AND IT IS BETTER THAN WHAT WAS PROPOSED `[M]`: THE SLIP-ROAD ENTRANCE (the start of the acceleration lane) CARRIES EVERY PLACEABLE WARM-UP CRASH (11 of 11) AND 6 OF THE RUN'S 18 D INCIDENTS, 16 OF THE 28 PLACED EVENTS IN BOTH PHASES TOGETHER (the warm-up being the same crash process on the same map); THE LOOP PROPER HAS ITS OWN TWO PLACES, loop-6 into loop-7 and loop-2 into loop-3, FIVE INCIDENTS EACH. TWO STORIES, NOT ONE. AND THE CAP DOES NOT TOUCH BOTH: from the sample's own tables, SLIP-ROAD INCIDENTS ARE D 6, 2.5 s 4, 2 s 5 (no change the counts can show) AND LOOP-PROPER INCIDENTS ARE D 12, 2.5 s 1, 2 s 3: THE CAP'S LOWER CRASH RATE IS, ON THESE COUNTS, ALMOST ENTIRELY THE LOOP-PROPER STORY, and the slip-road crashes remain at about the same number with the cap. (Counts of 1 to 12, split after the fact: a pointer, not a finding.)** THE LEAD FOR THE CRASH ITEM, ahead of the observation distribution and local rather than population-wide, is the slip-road entrance, which the cap does not fix; the loop-proper places are the cap's. Whether the slip roads are "the one with the most evidence" is a matter of the denominator: they have the most crashes in the warm-up (11 of 11) and a third of the run's incidents, and the loop proper has two thirds of the run's.
**THE MAINTAINER'S CALL, FLAGGED FOR JAY (12 November): CLEAR THE WARM-UP'S CRASHES WHEN THE WARM-UP ENDS. HIS REASONING, SO IT CAN BE OVERTURNED EASILY: a player who opens on a wreck and a queue they had nothing to do with sees a broken game, not a living one: they cannot tell whether they caused it, whether it is scenery or whether something has gone wrong, and in the examiner mode a test that starts behind a pile-up is simply unfair; so the default is a clean start. THE DISTINCTION IS ARTEFACT VERSUS CONTENT: an unexplained wreck at t = 0 is an artefact; a deliberately placed incident (an emergency vehicle, slowed traffic, people looking) is content, and good content, and what the maintainer's social-activity framing wants. SO: THE WARM-UP'S CRASHES ARE CLEARED NOW (the crashed cars removed at the rebase, so the queue behind them moves; the warm-up's lived-in traffic otherwise kept), AND "INTENTIONAL ROADSIDE INCIDENTS" GO ON THE DESIGN LIST AS SOMETHING TO BUILD ON PURPOSE LATER.** To be implemented after the leak fix's gate (it edits the same function), with a check on the known cases (loop seeds 3, 8, 17, 19, 27, 30, 35 and 40 at 300 cars: no crashed actor at t = 0) and a sabotage; the clearing must not touch a crash that happens after the clock starts. WHAT IT COSTS, STATED: every measurement taken after it starts from a world without its warm-up wrecks, so the run rates above (which do not contain the warm-up's crashes in their lists but did contain the queues behind its wrecks) are measured on the old start; the sample's six wreck-at-t0 seeds did not drive its result, so the expectation is that they will not move.

**THE MAINTAINER'S MECHANISM FOR THE CAP'S SPLIT, TESTED AGAINST THE GRAPH `[M]` (12 November): "THE LOOP-PROPER CRASHES MAY BE CAUSED BY THE MERGE STALLS, DOWNSTREAM: a joiner standing at a ramp end disturbs the stream, the disturbance propagates as a shockwave, and rear-ends happen some distance away where the wave steepens." THE TEST HE ASKED FOR: are loop-6 into loop-7 and loop-2 into loop-3 downstream of on-ramps, and how far. THE ANSWER IS THAT THEY ARE NOT DOWNSTREAM OF AN INTERCHANGE BY A DISTANCE; THEY ARE AT ITS MERGE POINT.** The map: every crash place is one of the loop's FOUR INTERCHANGES (the node where an off-ramp leaves and an on-ramp joins: loop-0 into loop-1 with on-1, loop-2 into loop-3 with on-3, loop-4 into loop-5 with on-5, loop-6 into loop-7 with on-7), and each on-ramp's acceleration lane runs 350 m from its node. `crash-matrix.mjs` now describes each crash with its distance past the stop line at the node (rel) and whether each car was a joiner in the run. D's 19 crashes in the sample, over 14 seeds: **THE 13 LOOP-PROPER CRASHES ARE AT 255 TO 370 m PAST THE NODE, 11 OF THEM AT 340 TO 370 m: THE END OF THE ACCELERATION LANE, THE MERGE POINT ITSELF, NOT SOME DISTANCE ALONG THE ROAD (a downstream shockwave would scatter them along it). THE 6 SLIP-ROAD CRASHES ARE ON THE RAMP, AT -140 TO +11 m (upstream of the node and at the start of the lane).** THE SLOW CAR IS AT 1 TO 5 km/h IN 10 OF THE 13 LOOP-PROPER CRASHES (its speed 5 s earlier 2 to 30 km/h, one at 72) AND ITS FOLLOWER AT 15 TO 37 km/h, one 67: A CAR CRAWLING OR STOPPED AT THE END OF THE LANE, HIT FROM BEHIND. AND BOTH CARS WERE JOINERS OF THIS RUN in all 13 (and in the 6 slip-road ones, trivially): about 55% of the cars on the road at those moments were joiners (44 to 83% by crash), so both being joiners in 13 of 13 is far outside chance (about 0.3 to the 13th for independent cars, a rough figure, since cars are not independent).
**SO THE MECHANISM THE DATA SUPPORT IS NARROWER AND MORE LOCAL THAN A SHOCKWAVE: A REAR-END BETWEEN TWO JOINERS AT THE END OF THE ACCELERATION LANE, the leader at or near rest at the merge point and the follower arriving faster; the cars on the through lanes are not in these crashes (one of the 13 has a leader at 34 km/h and a follower at 67). IT IS THE CAP'S OWN QUANTITY: D has 9.0% of joiners at or near rest at the lane end (this batch's `atRestNearEnd`), the cap at 2 s 3.7%, 2.5 s 5.1%, 3 s 6.4%, and the loop-proper crashes (12 incidents under D, 1 at 2.5 s, 3 at 2 s) fall with it.** THE SPLIT THE MAINTAINER NOTICED, "THE CAP FIXES CRASHES AWAY FROM THE MERGES AND NOT THE ONES AT THEM", IS THE OPPOSITE ON THIS EVIDENCE: THE CRASHES THE CAP REMOVES ARE THE ONES AT THE MERGE POINT, AND THE ONES IT LEAVES (6, 4, 5) ARE ON THE RAMP BEFORE THE LANE, which is a different place with a different cause not yet looked at. THE "UNIFIED CAUSE, ONE DEFECT TWO SYMPTOMS" HE HOPED FOR IS NOT WHAT IS FOUND: two places, two likely causes, one of which the cap already addresses. STILL A HYPOTHESIS, AND SMALL: 13 and 6 crashes from one sample, the places read after the fact, the 10 of 13 "slow car at 1 to 5 km/h" a description and not a cause (why the leader was at rest is the stalled-joiner question the cap acts on, and the sample does not separate a joiner that waited from one braked to a stop by the car in front). THE CHECK THAT WOULD SEPARATE THEM: for each lane-end crash, the leader's speed history for the ten seconds before and whether it had been waiting at the lane end (the existing stall measurements), which is a probe and not a build.
**A MISREAD AVOIDED, FOR THE RECORD: THE FIRST VERSION OF THE JOINER TAG (both cars joiners in 19 of 19) LOOKED LIKE A STRONG RESULT AND WAS NOT UNTIL IT HAD A BASELINE: THE LOOP IS FED ONLY BY ITS ON-RAMPS, SO MOST CARS ARE JOINERS AT SOME POINT; the baseline (44 to 83% of the cars on the road are joiners of the run) is what makes 13 of 13 mean something, and it was added before the figure was written down.**

**THE MAINTAINER'S SIXTH MISS, RECORDED (12 November): THE DOWNSTREAM-SHOCKWAVE MECHANISM FOR THE CAP'S SPLIT IS REFUTED (the loop-proper crashes are at the merge point, 340 to 370 m, the end of the 350 m acceleration lane, not downstream of anything). HIS REPLACEMENT, A STALLED JOINER AT THE LANE END REAR-ENDED BY THE NEXT JOINER, WAS TESTED AT ONCE, AND THE DETAIL SAYS SOMETHING A LITTLE DIFFERENT, `[M]` (`crash-matrix.mjs` now prints, for each crash, the leader's time at rest and speeds at -5, -2.5, -1 and -0.5 s, what the leader was itself following, and the crawling queue ahead of it; D's 19 crashes, 14 seeds; the places read after the fact; 13 and 6 crashes):**
**THE 13 LOOP-PROPER (LANE-END) CRASHES: THE LEADER WAS NOT A JOINER THAT HAD BEEN WAITING. It had been at rest 0.1 to 0.8 s of the last five seconds, was moving at 5 to 30 km/h five seconds before and 11 to 37 km/h two and a half seconds before, and braked to 1 to 5 km/h before the crash (one through car at 72 km/h, 34 at the crash). IN 10 OF THE 13 IT WAS ITSELF FOLLOWING A STOPPED OR CRAWLING CAR (0 to 5 km/h, one of them a standing wreck) AT 1.7 TO 2.5 m: a car arriving at the tail of a small stopped cluster and braking onto it, and the follower, at 15 to 37 km/h, hitting it. The other 3 have a leader far ahead at 65 to 87 km/h (34 to 87 m): through-lane or lane-change cases, not queue tails.** THE CLUSTERS ARE SMALL: the unbroken chain of crawling cars ahead of the leader is 0 to 3 cars long (it is the leader's own tail position that is at the lane end, 340 to 373 m).
**THE 6 RAMP CRASHES (the maintainer's question: the parties and speeds the way the thirteen were done): BOTH CARS ARE ON THE SLIP ROAD (joiners trivially), 140 m before the line to 11 m past it. THE LEADER WAS CRUISING AT 27 TO 50 km/h FIVE SECONDS BEFORE (25 to 47 at 2.5 s) AND BRAKED TO 6 TO 24 km/h BY THE CRASH, NEVER AT REST (0.1 s of five); THE FOLLOWER AT 23 TO 40 km/h. IN 5 OF THE 6 THE LEADER WAS FOLLOWING A SLOW CAR (6 to 19 km/h) AT 2.3 TO 6 m, the same arrive-and-brake-onto-a-slow-car signature; the sixth was following a car at 43 km/h 37 m ahead.** THE QUEUE AHEAD ON THE RAMP IS SHORT TOO (0 to 2 crawling cars, ending -26 to -118 m, 5 of the 6) AND IT IS NOT THE LANE-END QUEUE: a ramp crash at -134 m is 484 m from the lane end, and the chains on the ramp and at the lane end are never one chain.
**WHAT THAT SAYS, AT THE STRENGTH IT CAN BE SAID: THE SIGNATURE IS THE SAME AT BOTH POINTS (a car arriving at 17 to 50 km/h at a small cluster of stopped or crawling cars at 2 to 6 m, braking, and the next arrival hitting it), AND THE QUEUES ARE TWO, NOT ONE QUEUE AT TWO POINTS: the lane-end cluster is stopped (0 to 5 km/h) at the merge point; the ramp cluster is crawling (6 to 19 km/h) 25 to 120 m before the line, and nothing connects them. THE CAP REMOVES THE LANE-END ONES AND LEAVES THE RAMP ONES (12 incidents to 1 and 3, against 6, 4 and 5), WHICH FITS TWO CLUSTERS WITH TWO ORIGINS. THE MAINTAINER'S READING (ONE CAUSE AT TWO POINTS ALONG THE SAME QUEUE) IS NOT SUPPORTED, AND NEITHER IS THE TWO-CAUSES READING PROVED: what holds up the ramp cluster is not known (something at the node, the corner, the entry to the lane) and was not looked at.** AND WHAT "THE HEAD COULDN'T GO" AGAINST "THE QUEUE STOPPED ITSELF" COMES TO: the crashing car is an ARRIVAL, not the head, in 10 of 13 and 5 of 6; the stopped car ahead of it is where the stall is, and the crash is an arrival's failure to stop in the room behind a stopped car, which in this sim is the follower's brake reaction (DECISIONS 10.46, the sanctioned low-speed crashing, no rate set). The sample does not measure how long the car ahead had been waiting, which is what would say whether the head was a stalled joiner; THAT IS THE PROBE STILL TO RUN.
**WHAT IT DOES TO THE VALUE OF THE MERGE WORK (the maintainer's point, flagged as his): THE CAP'S EFFECT ON CRASHES IS ITS LARGEST MEASURED EFFECT, AND "FEWER CARS STOPPING" UNDERSELLS IT, since the stopped cluster is where the arrivals pile on. WHAT IS NOT MEASURED IS WHETHER ANOTHER WAY OF REMOVING THE CLUSTER (D alone, or a different tolerance) WOULD REMOVE THE CRASHES AS WELL, and D alone is what the 18 to 5 and 8 compares against: the sample is D (no cap) against the caps, so it says the caps remove them; it does not say D has not.** COUNTS' SMALLNESS AND THE AFTER-THE-FACT PLACE-READING STAY FLAGGED: 13 AND 6 CRASHES, ONE SAMPLE, THE MOST PLAUSIBLE ACCOUNT AND NOT THE ESTABLISHED ONE.
**A CAUTION ON THE QUEUE-CHAIN FIGURE ITSELF: it takes cars in other lanes of the same road end by distance past their own path's stop line, so it can break a chain that is one queue across two lanes; it shows the clusters are small and separate, not their exact length.**

**THE WARM-UP'S WRECKS ARE CLEARED WHEN THE WARM-UP ENDS (12 November, the maintainer's call, flagged for Jay; implemented in `warmed()`, `src/sim/crossing.js`, with `verify-crashes` section 6):** the crashed cars are removed at the rebase, so the queue behind them moves; a crash after the clock starts is untouched; the warm-up's other traffic is kept. THE CHECK: loop seeds 3, 8 and 17 at 300 cars, which opened with 2, 4 and 2 crashed cars standing, now open with none; IT FAILED ON THOSE THREE BEFORE THE FIX (the sabotage: the fix absent) AND PASSES AFTER. **PEOPLE: a struck person is stored apart (`peds`, state "struck", cleared after STRUCK_CLEAR on its own clock, which the rebase already shifts), and the clearing filters `actors` only, so people are untouched BY CONSTRUCTION; IT IS NOT TESTED, because no map or seed with a person lying at t = 0 is known (the loop has no crosswalks, and an assertion I first wrote about "people not swept up" tracked 0 people and was removed as vacuous). Across every run made tonight no person was struck.**
**A SECOND CLOCK LEAK FOUND ON THE WAY, `[D]` FROM THE CODE AND NOT MEASURED: a wreck is cleared when `world.t - crash.t >= CRASH_CLEAR` (45 s), and `crash.t` was left on the warm-up's clock by the rebase, as the crash list's entries were; so a wreck from the warm-up's 99th second (of 109) would not have been cleared 45 s later, on the run's clock at 34 s, but when the run's clock reached 144 s: standing for about 110 s longer than designed. The clearing makes this moot for warm-up wrecks; no wreck made after the clock starts has the problem.** It is the same class as the five rebases the function's own comment lists and the crash list: everything that carries a time from the warm-up's clock has to be moved or dropped, and a check that a world's clocks are all inside its own would find the next one (not written).
**WHAT THE CLEARING COSTS, STATED: every world now starts without its wrecks, so a run's first minute is cleaner than before, the six wreck-at-t0 seeds of the crash sample are no longer comparable with a re-run (the sample's numbers stand as measured on the old start; they did not depend on those six), and the cars removed lower the population by two to four until the edges refill it.** THE DERIVED GATE FOR IT IS RUNNING (`warmed()` is in every world's construction, so most of the suite can see it); nothing is claimed until it ends.

**WHAT `main` MAY CARRY (the maintainer's ruling, 12 November, beside what he said that morning): A RED ON `main` IS THE CONDITION WE CANNOT WORK IN WHEN IT IS UNEXPLAINED (the runner's failure that morning: nobody knew why it failed, so every later verification was measured against a mystery). `main` MAY CARRY A RED THAT IS DOCUMENTED WITH ITS CAUSE AND A STATED PATH TO RESOLUTION; IT MAY NOT CARRY ONE NOBODY CAN EXPLAIN.** Without the distinction a green gate would be demanded that only an uncorrected bug could produce. THE FOUR REDS CARRIED (`verify-merge`, `verify-loop`, `verify-anticipation`, `verify-checks`): each named, attributed in C's commit message to the unchanged tree with today's check files, and understood, BUT NOT ALL OF THE SAME KIND, as the check files read for this record show (the maintainer's framing, "three are `[invented]` bars against the old table", is corrected here): (a) `verify-anticipation` (the pressing rule delays the offer by at least 1 s, `[invented]`, measured 9.5 against 9.0 on four seeds) and `verify-loop` (the speed spread at minute 15 at least 10 km/h, `[invented]`, measured 9.0) are `[invented]` margins that passed before D and fail after it: restatements; (b) `verify-merge`'s courtesy line fails its PRECONDITION and not its ratio: it needs at least 4 waits of 20 s or more without courtesy to measure anything (`tail.length >= 4`, read from the check's code) and D left 3 (13 before), the ratio itself (0.26 against 0.7) being inside the bar; a sample-size restatement, not a behaviour one; (c) `verify-merge`'s OTHER TWO LINES (no joiner waits a minute; at or near rest under 1%) ARE NOT RESTATEMENTS: they fail on the pre-D tree too and worse (24.5% against 13.3% at 300 cars), they are the maintainer's ruling that a long stand at the end of the lane is "something you'd see 1 in 10000", and the world still does not meet it, so they stay red until it does or until he rules the figure wrong; (d) `verify-checks` is a single-seed assertion on a base rate, deliberately red until it has a real sample and a near-zero bar, and A NEAR-ZERO BAR WILL FAIL WHILE THE LOOP CRASHES AT ITS MEASURED RATE (the sanctioned low-speed crashing of 10.46, no rate set), so it too stays red on explained grounds. SO `main` RETURNS TO GREEN ON (a) AND (b), AND CARRIES (c) AND (d) AS DOCUMENTED REDS UNTIL THE WORLD DELIVERS WHAT THEY ASK. **THE PATH, AND IT IS THE NEXT WORK BEFORE ANYTHING BEHAVIOURAL: RESTATE, NEVER LOWER.** `verify-loop`'s spread floor and `verify-anticipation`'s 1 s margin, once, against the corrected table, each marked `[invented]` with its reasoning, set at what is WANTED and not where today's numbers happen to sit, and left to fail if the world does not deliver it; `verify-merge`'s three bars against the corrected table, and for the courtesy line (the [invented: 20 s, 0.7] one) THE CHECK'S CODE READ, NOT INFERRED FROM THE OUTPUT AS THE LAST RECORD DID; `verify-checks` with a real sample (several seeds), a rate, and a near-zero bar as decided, not the measured base rate. That takes `main` back to green on explained grounds, and the next person to see a red gate learns something from it.
**THE MAINTAINER'S NOTES ON HOW THE LAST STEPS WERE HANDLED, RECORDED AS PRACTICE: removing an assertion about people that tracked zero people, instead of shipping a line that read as coverage; and marking the second clock leak (`crash.t`) derived-from-reading and not measured. WORLDS STARTING TWO TO FOUR CARS SHORT UNTIL THE EDGES REFILL IS ACCEPTABLE (the maintainer): noted, and moved on.** AFTER THE RESTATEMENTS, THE CRASH THREAD: the six ramp crashes' parties and speeds are done (the record above) and the leader speed-history probe is next (how long the car AHEAD of the crashing leader had waited).

### REAL POSITION IS HALF A FEATURE: BETTER PERCEPTION WITH NO NEW RESPONSE (the maintainer, 11 November), BESIDE THE SWITCH DECISION

**Jay reports no behavioural difference with the real-position switch on.** The likely reason `[D]`: the work improved the traffic's PERCEPTION of where the player's car is (stand-ins, the ghost gone) while leaving its REPERTOIRE of responses untouched: stop, follow, or change lane. Better information with no new action available produces exactly the "no difference" he saw. **So real position is half a feature; the other half is a driver's ability to make lateral room** (ease past something that partially intrudes). **That changes what turning the switch on is worth:** it is worth little to the player until traffic can do something with the information, and the decision should not be argued from the perception work alone. `[D]` What the switch does give is correctness (a car on no lane is seen and avoided, the ghost no longer holds a queue); the experience Jay is waiting for needs the response.

**A CORRECTION OF THE MAINTAINER'S, RECORDED:** he had Jay test by going off-road; Jay points out that no traffic ever comes there, so there is nothing to interact with, and the test was badly designed. **The case that matters is being a PARTIAL obstruction in or beside a LIVE lane, which is what Jay found by accident in the parked-car section.**

### THE CHECK-HONESTY PASS: `verify-merge`'s PREDICTIONS, REVISED A SECOND TIME, BEFORE ANY RESULT WAS READ (11 November)

**Order, stated for the record:** the `verify-merge` runs had finished BEFORE the maintainer's message about Jay arrived, and NO output of them had been read when this revision was written; the revision is made against the starvation data above and not against any merge result.

**What the new findings change.** (1) **A lateral-repertoire cause does not bear on merging**: a merge IS a lane change, which the repertoire has, so the maintainer's expectation that the fourth category is "probably the same thing again" does not hold on this evidence. (2) **The phantom-hold finding does bear on it**: a stationary car holding a neighbour with no real conflict is a mechanism that could hold a joiner, and the file's own history records a mutual hold between joiners ("each waited on the other for over a minute", seed 4). So HOLD rises and a fifth outcome is added. **FIFTH CATEGORY, QUEUED BEHIND: the merge plan is null for most of the longest waiter's stalled ticks** (the plan is only made from the head of a standing queue, so a joiner behind another standing joiner is not "refused a gap", it is not asking); read from the `merge plan null on X%` the check already prints, rule fixed now: **QUEUED BEHIND when it is above 50%.**

**REVISED PRIOR, given the failure is real (two or more joiners over a minute) `[D]`:** the second revision's numbers were JAM 0.30, STARVATION 0.20, HOLD 0.10, DEMAND 0.40; **now JAM 0.25, STARVATION 0.15, HOLD 0.15, DEMAND 0.35, QUEUED BEHIND 0.10.** The check-level probabilities are unchanged (cannot tell 0.50, real 0.30, exposure 0.20; none 0.70, one 0.30). All three versions stay recorded; the first is what scores if neither addition had been made.

### THE CHECK-HONESTY PASS, REDIRECTED: `verify-merge` FIRST, THEN `verify-signs` -- PREDICTIONS AND FLOORS, WRITTEN BEFORE ANYTHING IS RUN (11 November)

**WHY THE ORDER CHANGED (the maintainer).** Nine of Codex's set are unaudited and they are not equal. `verify-merge` and `verify-signs` are the two Codex characterised as low throughput mistaken for deadlock, which is the SAME FAMILY as the intersection starvation, the most likely real gameplay defect held; the other four are adverse events without causes and comparison assumptions. Merging is core endless-highway behaviour and the highway is the game being shipped. **If the exposure lines on those two explain the queues, a measurement pass has been converted into a real fix, which is the outcome worth chasing. Wherever either touches the starvation lead this record says so explicitly.**

**WHAT WAS READ BEFORE PREDICTING, and only that `[M]`:** Codex's one-line row for `verify-merge` ("Longest joiner wait at 300 cars was 87 s; assertion allows no more than a minute"; it passed at +11 and failed at +29), and the file. **The claim is section 4's `ran.every((r) => r.longest <= 60)`**: over three densities (60, 150, 300 cars on the endless loop, 1,200 ticks to settle and 3,600 measured), `longest` is the longest time any joiner stood (v < 0.5 m/s) past the end of its acceleration lane. **It is a MAXIMUM OVER JOINERS: one draw. Nothing counts how many joiners reached the lane end, how many stood over a minute, or what the through lane beside them was doing.** The file's other lines carry thin floors of their own: merges happen at every density (>= 20 each), the "knows the lane" comparison (>= 5 in one group), bold against timid (>= 10 each), the player never stranded (>= 12 trials).

**THE EXPOSURE LINES TO ADD, each its own `[plan]`:** (1) how many joiners reached the lane end at each density; (2) how many of them stood over 60 s (a count, not a maximum); (3) the through lane's own speed beside the longest waiter while it waited (moving, or standing); (4) for the longest waiter, per second, the gap on the target lane against the gap that driver wants (`wantedGap`): whether a gap the driver would have taken was on offer and refused.

**FLOORS AND THE RULE FOR CLASSIFYING, from the sample (the corrected definition) `[D: reasoning]`:** the sample is the joiners at one density, tens of cars, so **ONE joiner over a minute is one draw and is CANNOT TELL; TWO or more at the same density is not one draw.** The failure is then classified by the through lane: **JAM** if the through traffic beside the waiters was itself standing (a throughput limit, not a merge failure: the check assumed free flow at a density that may be over capacity); **STARVATION** if the through traffic was moving but no gap the driver would take was offered (gap acceptance starved by a dense major stream: the starvation family); **HOLD** if a gap the driver would take was on offer and refused (a phantom hold, the strongest candidate for a defect). The 60 s limit itself is not changed.

**PREDICTIONS `[D: judgement from one line of Codex's row and the code, not measured; inference on inference]`:**
- **The +29 failure, under the corrected rule:** CANNOT TELL (exactly one joiner over a minute) **0.50**; REAL (two or more over a minute, by the classification above) **0.30**; EXPOSURE (too few joiners reached the lane end for the claim to be tested) **0.20**.
- **If it is real, what it is:** JAM 0.45, STARVATION 0.40, HOLD 0.15. **THE CONNECTION TO THE STARVATION LEAD, stated in advance: if the wait is STARVATION or HOLD it is the same family as the intersection, a minor stream starved by a major one, and the discriminating measurement named there (which car holds the waiter, and by which rule) applies to this scene too. If it is a JAM, it is not that family and the record will say so.**
- **The other lines:** at +11 and at the native seed `verify-merge` passes (Codex's pass at +11; the native seed is the check's own); at least two of the thin-floor lines (the "knows the lane" group of 5, bold against timid at 10, the stranded trials at 12) will show counts within twice their floors at the native seed, **0.60**.
- **"How many of the failures are real" as a distribution, not a point:** `verify-merge` has ONE failing line, so it can only be none or one, and from the real probability above it is **none 0.70, one 0.30**; scored against the distribution, not the point estimate. (A first draft of this bullet gave 0.50 / 0.35 / 0.15, which was inconsistent with a single failing line and was corrected before it was committed.)

**REVISED BEFORE ANYTHING WAS RUN: A FOURTH CATEGORY, THE JOINER'S OWN DEMAND (the maintainer, 11 November).** The three categories above all put the fault in the through traffic or the controller. **There is a fourth: if gaps of 2.5 s are being offered and the merging driver wants 4, the wait is a minute on a road that is objectively passable, and every measurement of the through lane looks innocent because it is.** It matters disproportionately because it is the one that would produce Jay's actual complaint: a road that feels simultaneously empty and impossible to join is what you get when the traffic is fine and the demand is wrong, and "lonely road" has been treated for weeks as a density problem. **It also has a completely different fix: a tuning change to what a driver accepts, not a change to flow or control.**

**WHY IT IS LIVE, from the code `[D: read]`:** the merge is judged by `gapFor`, and the file's own docstring says "the driver's confidence sets the gap they take (the same kappa as any change), so a bold driver goes early into a tight gap and a timid one waits for a long one". `kappaOf(out)` is the driver's `caution` clamped to 0.3 to 1.7, and `leadNeed` and `lagNeed` scale with it above a floor. **And there is a structural reason to expect it here: `longest` is a MAXIMUM over joiners, so by construction it selects the tail of the demand distribution, the most cautious driver among the tens who joined.**

**THE REVISED PRIOR, given that the +29 failure is real (two or more joiners over a minute) `[D]`.** The original: JAM 0.45, STARVATION 0.40, HOLD 0.15. **It changes: JAM 0.30, STARVATION 0.20, HOLD 0.10, DEMAND 0.40.** The three originals each lose weight, starvation most, because the selection argument and the merge's own design make demand the leading candidate; the original numbers stay recorded above and are what scores if the maintainer's category had not been added. The probabilities of the check's outcome (cannot tell 0.50, real 0.30, exposure 0.20; none 0.70, one 0.30) are unchanged.

**THE MEASUREMENTS, with the sim's own functions and not a second statement of "the gap wanted" `[plan]`:** per joiner standing at the end of its lane (the head of the queue: the plan is only made from the head), each stalled tick, from `mergePlan`'s neighbours: the gap offered ahead and behind (`clearBetween`), the gap needed (`leadNeed`, `lagNeed` at the joiner's `kappaOf`), and **the ratio, offered over needed, taking the worse of the two sides**. **The DISTRIBUTION of that ratio over the wait, not its maximum** (the maintainer: a joiner that waits a minute while seeing twenty 2 s gaps is a different animal from one that sees nothing, and a maximum hides that the way `longest` hid the joiner count); **the time headways of the through cars passing the joiner's slot**, as a count and a distribution against the time the joiner needs; the joiner's own `kappa`; and the through neighbours' speeds.

**THE CLASSIFICATION RULES, FIXED NOW `[plan]`, for the longest waiter at a density where two or more joiners stood over a minute:**
- **HOLD**: for at least 5 s in total, a gap on both sides at or above the need was on offer (ratio >= 1) and the joiner did not go.
- **DEMAND**: not a hold; for most of the wait the ratio sat between 0.5 and 1 (near-acceptable gaps on offer) AND the joiner's `kappa` is 1.2 or more (timid): a bolder driver would have gone.
- **JAM**: for most of the wait the through neighbours were themselves standing (speed under 2 m/s).
- **STARVATION**: for most of the wait the ratio sat under 0.5 with the through traffic moving.
- Anything else is reported as MIXED, with the numbers.
**THE DISCRIMINATING SABOTAGES, real code `[plan]`:** a timid population (`kappaOf` returning a large constant) must read DEMAND; a merge that never begins from rest (`mergePlan` returning null for a standing joiner) must read HOLD. **If the classifier cannot tell those two apart, it does not discriminate and is not used.**

### A THIN MARGIN, BY CONSTRUCTION, SHOWN IN THE CHECK'S OWN OUTPUT (the maintainer, 11 November)

**At the native seed the 90 degree escape's worst is 43.7 s against the 45 s tow: 1.3 s.** A check passing with that margin will flip on changes that have nothing to do with escaping, and when it does someone will read the flip as a regression. **Nothing is widened (that would be tuning).** The check now prints the margin on every angle ("90 degrees: worst 43.7 s (1.3 s under the tow, THIN: within 10% of the limit by construction, so a change unrelated to this claim can flip it)"), and a failing line carries it too ("70 degrees: worst 93.4 s (48.4 s over the tow)"). **The 10% is a display threshold for the word THIN and decides nothing.** Read from the checks' own output at native and +29 `[M]`.

### WHAT THE PASS ACTUALLY SHOWED, STATED AS WHAT IT IS (the maintainer, 11 November)

**Under the corrected standard, no behavioural defect has been demonstrated in any of the five checks audited.** The checks were blind; once they could say what situations they met, nothing was hiding behind them. That is good news about the simulation, **and it is five checks of the 60 the runner now discovers (59 before the contact split added one), not a verdict on the suite or on the simulation.** (The 54 quoted earlier was the size of the derived set for the real-position change, not the suite.) **Where the scoring stands:** `verify-passing` and `verify-peds` are misses by the letter (two of the first four real against a distribution that put two or more at about 0.11), and both are cannot-tell under the correction, which earns those predictions nothing; the error was treating Codex's one-line verdicts as more informative than they were and compounding it across four independent judgements. **THE LIVE ITEMS the pass turned up: the intersection starvation (a through road that does not discharge while the minor roads are starved; raw observations, five candidate causes and the discriminating measurement not yet taken are recorded above), and the standing-car weave oddity, now a modelling detail and no longer a lead on determinism.**

### THE LANE RULE IS SUPERSEDED (the maintainer, Jay, 11 November): OTHER AGENTS ARE SHELVED UNLESS HE ASKS, AND ONE AGENT OWNS THE WHOLE REPO, `tools/` INCLUDED

**The rule it replaces:** `tools/` was Codex's and `src/` was the other agent's (10.60/10.61: "CHECKS ITEM B IS CODEX'S, GATED BEHIND ITEM A BEING VERIFIED AND MERGED. Both are `tools/`-side. This session starts neither."), restated on 11 November ("the rule stands") and crossed once under an explicit exception. **Superseded, not deleted:** the earlier statements stay where they are with a marker. The exception in the section below becomes an ordinary fix; **its condition, which was the part that mattered, stands and was met: establish which layer the bare path comes from, and fix there (it was the test's fixture; had it been the runner, the runner would have been fixed and not the test).**

**WHAT IT COST, as the record shows it:**
- **A red on `main` outlived the day because its owner was not working on it.** `verify-check-runner` failed on `main` from the merge stamped `2026-11-10 20:23Z` (`5a000f3`) until the fix on 11 November `[M: the served stamp and the commits]`; fixing it took a separate authorisation with a three-part justification, because the rule forbade the one-line fix by the agent who found it.
- **An ordering dependency across the lane boundary.** The exposure pass (this lane) wanted the runner's four states and a reasoned skip (the other lane); the instruction was "do not touch that", so the pending box assertion sits in the record as a plan and not in the suite as a live skipped assertion `[M: 10.70]`. One change was split between two owners.
- **Hand-overs written to a party who was not coming.** Two notes on 11 November were addressed to Codex; one was rewritten as a handover and superseded the same day, the other re-pointed as our work list `[M: the commits]`.
- **Git cannot tell agents apart.** The seed-shift hook's commit (`9f4fa6d`) is authored under the maintainer's own git identity, as all agent work is `[M: git log]`; attribution lived only in notes and in what the maintainer relayed.
- **The maintainer's own statement, not measured:** the coordination overhead was real.

**WHAT IT BOUGHT, as the record shows it:**
- **The triage document.** The seed inventory ran the whole suite at two seed offsets on frozen `5a000f3` and reported 14 distinct suspects, 17 failing outputs and 116 timestamped log receipts `[M: the report's header on the branch]`. It directly shaped the check-honesty pass and named the four checks and the `verify-contact` split.
- **An independent gate.** Codex stopped at the verification gate rather than merging checks item A, and reported why: a change to `tools/check.mjs` selects zero derived checks, because nothing imports the runner `[M: DECISIONS, the checks plan]`. `[D]` A single owner might well have walked past it; that "might" is a judgement.
- **The runner's improvements** (timing classification, limit reporting, log retention) arrived on `main` `[M: the merge]`.
- **The instrument that classified `verify-drive` and `verify-passing`:** the seed-shift hook (reviewed below).
- **Independent corroboration.** Two agents with no shared context found the same defect class within the hour: checks that cannot tell "wrong" from "never arose" `[M: this record, the standing requirement]`. One owner cannot produce that.

**FOR WHOEVER CONSIDERS MULTIPLE AGENTS AGAIN, what would have made it cheaper `[D]`:** one owner for the runner AND the checks, so a reasoned skip and an exposure line are one change; per-agent attribution in the commit trailer, because the git identity cannot carry it; and hand-offs on `main` from the start.

### THE SEED-SHIFT HOOK, REVIEWED AS CODE (the maintainer, 11 November: judgement as code, not as a convenience)

**What it is `[D: read]`.** `tools/seed-shift.mjs`, 44 lines, on `codex/seed-inventory` (commit `9f4fa6d`, 10 November), preloaded with `--import`. It uses `node:module registerHooks` (a synchronous load hook): when `src/sim/crossing.js` loads, it matches exactly ONE `export function seedGraph(seed = 1, ... {` header by regular expression and inserts `seed = globalThis[Symbol.for("miskawin.seed-shift")](seed);` as the first statement. That global returns the seed unchanged for a shift of 0 and `(Number(seed) + shift) >>> 0` otherwise. It writes per-process, per-thread evidence JSON to `CHECK_SEED_EVIDENCE` at start, at the first call and at exit.

**Sound, with the evidence:**
- **It fails closed `[M]`.** On a tree where `seedGraph`'s signature no longer matches, the import is REFUSED with "seed-shift: expected one seedGraph definition ... " and does not run unshifted.
- **The source is untouched `[D]`:** the rewrite is in memory, and its own test asserts a sha256 of `crossing.js` unchanged (that test cannot run on this machine; see below).
- **Offset 0 is inert `[M]`:** a hooked run at offset 0 printed the same output as the native run, with 12 calls to `seedGraph` and `before == after`.
- **It leaves a trail `[M]`:** at +11 the evidence read shift 11, 6 calls, first sample 5 to 16; at +29, 5 to 34.
- **It lives outside `src/`, so the app bundle cannot carry it,** and its header says plainly what it does not cover.

**Reservations:**
1. **Windows `[M]`.** Its documented usage, its own proof test (`tools/seed-shift-test.mjs`) and the inventory driver (`tools/seed-inventory.py`) pass the hook as a bare path in `NODE_OPTIONS`. **The hook's own test fails on this machine with `ERR_UNSUPPORTED_ESM_URL_SCHEME`** (the bug already fixed in the runner's test), so its inventory must have run on a POSIX machine. The hook itself works with a `file:///` URL (this session used it).
2. **`registerHooks` stability `[D: from memory, NOT verified here]`:** I believe it is a release-candidate API in the Node 22/23/24 lines. If it changes, the hook breaks loudly (an import error), which is acceptable.
3. **Coverage `[D]`.** Only the seed passed to `seedGraph` is shifted. Map-generation seeds, any RNG outside `seedGraph`, and bundled copies are not (its header says so; Codex's report lists 11 checks that recorded no `seedGraph` call, relayed and not verified here). "Seed-robust" under this hook means robust to the world's seed and nothing wider.
4. **`>>> 0` truncates a fractional seed when the shift is not 0 `[D]`:** minor; no fractional seed was seen.

**RECOMMENDATION: ADOPT, on its merits, with the Windows fix, and attributed.** Cherry-pick only the hook and its test (not the 8,000-line results file), change the test and driver to file URLs, add a thin wrapper (`node tools/with-seed-shift.mjs <shift> <script>`) so nobody hand-builds `NODE_OPTIONS`, and credit it as written by the Codex agent (commit `9f4fa6d`; git shows the maintainer's identity as author). **Alternative considered and rejected:** our own seed option inside `seedGraph` would put test machinery in `src/` and the shipped bundle, and an environment variable read there fails in a browser. **Not done: it waits for the maintainer's go** (it brings code onto `main`; this review is its review). Until then the +11/+29 runs use it from a detached worktree of that branch, not merged.

### RESOLVED 11 NOVEMBER (was: OUTSTANDING, NOT ACCEPTED): `verify-check-runner` WAS RED ON `main`; FIXED IN THE TEST, UNDER AN EXCEPTION TO THE LANE RULE

**[SUPERSEDED THE SAME DAY, 10.70: the lane rule was dissolved, so this is an ordinary fix; the condition below stands and was met.] THE EXCEPTION, AND ITS LIMITS (the maintainer, 11 November): the rule stands, `tools/` is Codex's and `src/` is mine; this crossed it once.** The grounds, any one of which being false would have made the answer no: the fix is known and tiny; `main` had been red all day and a red baseline taxes every measurement; Codex was blocked on a machine problem and not working; and nothing on either Codex branch touches the runner or its test since `5a000f3` `[M: read from the repo after a fetch]`, so there was no collision. **His condition: find out which layer is wrong before fixing anything; if it were the runner, leave `main` red and hand Codex the diagnosis ("I'd rather main stay red honestly than go green dishonestly").**

**WHICH LAYER, with the evidence `[M]`:** the test's fixture. The only use of `--import`, `NODE_OPTIONS` or `execArgv` in `tools/` is the test's line 116; the runner launches checks as `[process.execPath, [c.file]]` (a script argument, which works on Windows); the failing stack has no runner frame, only Node's own loader at startup (`Received protocol 'c:'`); and every assertion before line 119 ran the runner on Windows without trouble.

**THE FIX:** `pathToFileURL(clock).href` for the `--import` argument, with a comment saying why. Nothing in the runner changed. **VERIFIED BY READING THE LINE `[M]`:** `TIMEOUT verify-probe 0 s -- killed after 1200 s (1,200 s cap); assertions incomplete` is printed, and `verify-check-runner` exits 0. **Sabotaged, lines read:** the runner exiting 0 on a timeout fails at test line 77 (through `run()`), and a 900 s cap fails the policy unit test; **both fire BEFORE lines 118 and 119, so those two are redundant with earlier assertions and were not individually exercised.** `CODEX-NOTE-verify-check-runner.md` is rewritten as a handover: the cause stated as a measured fact (no longer a candidate), the layer, the fix, and what the verification does and does not show.

**The original record of the red, kept as history:**


On `origin/main` at `5a000f3`, Windows 11, Node v24.19.0, **reproduced on a pristine detached worktree with no merge involved**: `check-runner-test.mjs:119` fails because the child's stdout is empty. Root cause, checked directly: line 116 passes `--import` a bare Windows path, which Node on Windows refuses (`ERR_UNSUPPORTED_ESM_URL_SCHEME`), so the child dies before the runner starts. Line 118's `status === 1` passes for the wrong reason, since a crash also exits 1. Suggested fix: `pathToFileURL(clock).href`. The full write-up is `CODEX-NOTE-verify-check-runner.md`. **It is Codex's work and Codex's lane and was not fixed here.** A red check on `main` is the condition this project has said repeatedly it cannot work in, because every later verification is measured against a broken baseline. It is tools-side, not simulation-side, so the world is sound, but it should not sit. It will show red in any derived run that reaches `tools/`.

### A HANDOFF DEFECT, AND THE RULE THAT FOLLOWS

The 11 November handoff lived only on the branch it described. A session started from `main` -- exactly the start it was written for -- could not find it, and was briefed to build what was already built. **A handoff that lives only on the branch it describes cannot be found by a session that starts from `main`. Future handoffs go on `main`.** This one travels to `main` with the branch.

### Two practices this session earned

- **A sabotage proves nothing until you have read WHICH assertion fired and why.** A failure count that matches the expected count is the tempting evidence and it is not evidence (the first sabotage of 10.70: four failures expected, four seen, three of them for a reason the old code never had). Restore the REAL previous code, not a cruder stand-in for it; read the lines; probe the mechanism; and for a negative assertion, assert that the case arose.
- **Test the comfortable assumption in both directions.** `verify-check-runner` failed after a merge and the comfortable assumption was that the merge caused it. A pristine detached worktree of `origin/main` showed it did not: it was already failing.
- **When choosing a model for a task, weigh capability against how much of the budget the task will spend WAITING rather than thinking** (the maintainer's observation; not a decision about any particular model). The previous session ran on a different, more capable model and got less done than its capability suggested, because much of the budget went on long check runs and polling. A task dominated by twenty-five-minute suite runs gains little from a stronger model; a task dominated by diagnosis gains a lot. His words: "when I suggest using a higher model, consider how limited the usage will be."

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
