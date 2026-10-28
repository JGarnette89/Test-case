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
