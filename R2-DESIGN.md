# R2 — three layers, five axes, and scoring the decision

*Jay: "this is it! this is what poor drivers dont see, the traffic moving
around them. This is what I was trying to emulate with the vision-fade
system."*

Design, plus the pieces that are built. §0.4 (the drift readout), §7
(encroachment in seconds), §8 (awareness, and the fifth axis), §9
(caution, and the risky tail) and §10 (the reaction layer, plus wiring
departure) and §11 (pedestrians giving way, and candidates with a
character) ship; everything else is design.

---

## 0. Four things checked before designing anything

Three were prerequisites named in the ruling. The fourth fell out of
answering the third and is a live defect in shipped code.

### 0.1 Nothing reacts to the candidate. Measured.

Same scenario, ego forced to depart **2 s early** — exactly the
overconfident move the design is about:

| road user | departAt, legal | departAt, ego 2 s early | biggest pose shift |
|---|---|---|---|
| Red (priority, rolling) | 1.60 | 1.60 | **0.000 m** |
| Green (priority, stopping) | 1.20 | 1.20 | **0.000 m** |

`schedule()` resolves every departure once, up front, and `poseAt` is a
pure function of the participant. A rolling road user never yields to
anybody; a queued one waits only for those already scheduled ahead of it.
So a car with priority drives straight through the candidate.

**This is why overconfidence is terminal today: contact is the only
outcome the engine can produce.** The reaction layer has to be built, and
it is a prerequisite for the whole approach, exactly as suspected.

### 0.2 Clearance is already a continuum — the severity bands need no new geometry

Nearest approach as the candidate departs progressively earlier:

| departure | nearest approach |
|---|---|
| 4.55 s *(legal)* | 6.30 m |
| 3.55 s | 6.06 m |
| 3.05 s | 4.71 m |
| 2.55 s | 3.17 m |
| 2.05 s | 1.64 m |
| 1.55 s | 0.23 m |

It falls smoothly. "Comfortable / tight / very tight / contact" is a set
of **thresholds on a number the engine already produces**, not a new
model. And 1.64 m is the state the game cannot currently express: a
survivable near miss. *Lucky* is already measurable.

One correction needed: those are centre-to-centre distances, and a car is
4.5 × 1.8 m. The bands must be cut on **footprint separation**.
`boxesOverlap` and `extentsFor` already do the geometry and return a
boolean; a signed-distance version of the same routine is the whole
change. Same geometry, not a second one.

### 0.3 The "missing pause" tell is comfortably perceptible

`startDelay` is exactly the quantity a skipped observation would remove,
so the sweep runs through the real derivation:

| pause | callable | window | peak separation |
|---|---|---|---|
| 0.10 s | yes | 3.05 s | 1.15 m |
| 0.30 s | yes | 4.20 s | 3.44 m |
| 0.50 s | yes | 4.35 s | 5.65 m |
| 1.00 s | yes | 4.35 s | 10.75 m |

Against `POS_VISIBLE` 0.45 m and `MIN_DURATION` 0.2 s, **even a 0.10 s
pause clears both**. The reason is that the divergence *accumulates*: a
car delayed a tenth of a second is a tenth of a second behind forever, and
at 11 m/s that is over a metre within moments.

In screen terms, at the 10 s look-ahead (72 m ahead, ~90 m frame, ~4.3
px/m on a phone) a realistic 0.5–1.0 s observation pause is 24–46 px of
displacement. Unmissable. At the 4 s look-ahead it is 2.5× that.

**Verdict: the tell works, and it is not marginal.** A 0.1 s pause is
marginal at the wide look-ahead and fine at the narrow one; anything from
0.3 s up is clear at both.

### 0.4 But the camera was reporting none of it — fixed

Assessing 0.3 exposed a live defect. `chaseFor` returns `drift`, the
readout a renderer uses to say *there, that is the fault*. It was measured
against `basePose` — the same pose the camera rides.

**`basePose` is not trait-free.** The traits that rewrite a parameter
(`overshoot`, `slowStart`, `wideTurn`, `cutsCorner`) write
`stopBias`/`startDelay`/`turnBias`, which `movementOf` and `schedule` then
read. So `drift` was asking whether the car deviates from itself:

| trait | drift reported, before | true offset |
|---|---|---|
| wander | 1.15 m | 1.15 m |
| overshoot | **0.00 m** | 2.85 m |
| slowStart | **0.00 m** | 12.24 m |
| wideTurn | **0.00 m** | 5.17 m |
| cutsCorner | **0.00 m** | 2.54 m |

Four of five path-bending faults reported nothing. This is the identical
oracle-knowledge bug `cleanPose` was introduced into `belief.js` to fix,
left unfixed in `frame.js` — and CLAUDE.md's claim that the camera rides
"the same trait-free control `faults.js` diffs against" was wrong, because
`faults.js` diffs against a *stripped simulation*, not against `basePose`.

`driftOf` now measures against `cleanPose`. All six path faults report
their true offset; `lateSignal` correctly reports zero. **The camera's
framing is deliberately unchanged** — riding the clean line would slide a
slow-starting candidate 12 m out of frame, which is a legibility decision
and not this fix's to make. Checked in `verify-camera.mjs`.

This mattered enough to fix now because **the observation tell depends on
the player having a visible reference**, and the drift readout is that
reference.

---

## 1. The three layers

| layer | what it is | who owns the failure |
|---|---|---|
| **1. World** | what actually happened | nobody — it is the truth |
| **2. Candidate awareness** | what the driver registered, degraded from layer 1 by their ratings | **the fault** lives in the gap 1 → 2 |
| **3. Player perception** | what the examiner noticed, constrained by viewport and occlusion | **the score** lives in the gap 1 → 3 |

The reframing is right and it fixes something the redesign got backwards:
the original cone was the correct idea attached to the wrong party.
Putting it on the player asked the player to be the bad driver.

### Can `whatEgoSees` serve both? Yes, with one coupling to name honestly

`whatEgoSees(sim, t, steps, statics, { reach })` is **pure** — no cached
state, no hidden keying, nothing shared between calls. Calling it twice
cannot contaminate, because there is nothing to contaminate.

Two things are worth being precise about, though.

**It is already the candidate's eye, not the player's.** It casts from
`eyePoint(creepPose(sim.ego, ...))`. It was always modelling layer 2 and
being read as layer 3.

**Layers 2 and 3 share the occlusion term, and that is correct rather
than contaminating.** The player watches through roughly the same
windscreen, so a van hides the same car from both. What must stay
independent are the *degradations*, and they are:

- layer 2 is degraded by the candidate's **observation rating**;
- layer 3 is degraded by the **viewport** — where the camera is pointed.

Which gives three distinguishable failures, and the third is the one the
existing `hidden` / `away` distinction already exists to protect:

1. Objectively visible, candidate did not register it → **candidate's
   fault**, markable.
2. Objectively visible, candidate registered it, player was looking
   elsewhere → **player's failure**, scored.
3. Occluded for both → **the scenario's doing**, marked against neither.

**One real contamination risk to design out:** `whatEgoSees` takes
`steps`, the creep depth, which in the driver game was a *player* input —
creep forward to see more. In the examiner game the player does not creep;
the candidate does. `steps` must become a property of the candidate, or
the player's input would be feeding the candidate's awareness.

---

## 2. Awareness, and why overconfidence stops being a dice roll

### Registration delay: one seeded draw per road user

Awareness is time-varying — a car becomes visible at 3.2 s — so a single
per-scene roll cannot express it. But a per-frame roll would resolve at
simulation time and destroy replayability.

The formulation that satisfies both: for each road user, resolve **at
composition time, from the seed, a registration delay** — how long after
that road user first becomes objectively `clear` does this candidate
register it.

- A good observer: a fraction of a second.
- A poor one: several seconds, or never.
- The clock starts from `visibility()`'s own output, so occlusion composes
  for free: a car that is never visible is never registered, and that is
  the scenario's doing rather than the driver's.

One draw per road user, resolved once, at composition time. **Ground truth
stays deterministic and replayable**, exactly as fault occurrence does.

### The decision then follows from the awareness

This is the part that makes overconfidence coherent rather than arbitrary.

`schedule()` already computes a stopping participant's departure as
`earliestClear(p, done, arriveAt)`. **The candidate's departure becomes
`earliestClear` over the road users they have actually registered.** A
driver who never registered the approaching car finds the road clear and
goes.

There is no "roll to take a tight gap" anywhere. Taking a gap that was not
there is a *consequence* of an awareness the model already resolved.

Two consequences worth stating:

- It changes `schedule()`, so it must be **opt-in for a candidate carrying
  ratings**, exactly as the trait compiler is. Hand-authored scenarios and
  the golden stay untouched.
- It is the sharpest tool in the design for a different reason — see §4.

---

## 3. The world absorbing it: reaction as the observable

Nothing reacts today (§0.1), so this is new machinery. The narrow version:

1. The candidate's departure is resolved (possibly early, from §2).
2. A **second scheduling pass** finds road users whose path the candidate
   now intrudes on, and re-derives their motion with a deceleration.
3. That deceleration is the observable: the player catches the
   candidate's fault by noticing *another driver responding to it*.

Still resolved once, up front, at composition time — two passes rather
than one, not a reactive simulation. That matters: a reaction computed at
render time would put ground truth back in play.

It is harder to spot than a collision, which is correct, and it rewards
watching the whole scene rather than only the candidate. It is also the
first real crack in "everything is derived in a single pass", and worth
noting as the same architectural territory as the fender-bender entry in
CLAUDE.md — but much narrower: one road user, one deceleration, no
re-routing.

### Severity: score the decision, not the outcome — BUILT, see §7

Bands on footprint separation (§0.2), with only the last one terminal:

| band | meaning |
|---|---|
| comfortable | not a fault |
| tight | marked, low severity |
| very tight | marked, high severity — *the lucky band* |
| contact | terminal |

This is the move that puts both tails of confidence in the same currency:
the timid tail produces hesitation and refused gaps, the risky tail
produces insufficient margin, and **both are marked** instead of one being
marked and the other ending the run.

**Ruled, and the ruling changed the quantity.** The standard is
encroachment on entitled space, not forced evasive action, so the fault
exists independently of the reaction — and the unit is time, not metres.
The derivation and the resulting numbers are in §7.

---

## 4. Five axes, and why the fifth sharpens attribution instead of muddying it

OBSERVATION governs **layer 2** — what the candidate perceived. The other
four govern what they did with it. Different layer, so it does not compete
to explain the same fault.

Concretely: **observation is the parameter that degrades `whatEgoSees`
down to what this driver registered.** It is the registration delay of §2.

### The definitional discipline, made mechanical

*Observation is whether the candidate gathered the information. Confidence
is what they did with it, or without it.*

With layer 2 modelled, **that distinction stops being a weight in a table
and becomes derivable.** Whether the candidate had registered a given road
user at the moment they committed is a ground-truth fact, resolved at
composition time:

| candidate took a tight gap... | ...having registered the car | attributed to |
|---|---|---|
| yes | yes | **confidence** — they saw it and went anyway |
| yes | no | **observation** — they never gathered it |

Same visible outcome, different cause, and the model knows which. That is
a materially better answer than the weighted table, and it is available
only because awareness is modelled rather than rolled.

**Observation must never be scored by outcome.** The moment "didn't see
the van" is graded by whether contact occurred it collapses back into
confidence. It is graded on the gathering.

### Re-mapping and the attributability floor

`CAUSES` becomes five-way. None of the seven existing errors is
observation-dominant, so **observation starts at zero dominant kinds** —
but unlike braking and knowledge it has an obvious supply, because the new
observation faults are observation-dominant by construction.

The floor stands: **an axis needs at least two distinct kinds of error it
dominates.** Re-run after the vocabulary lands.

### Observation faults work on a segment

They need no other vehicle, which matters given the finding that **only
steering is currently readable on a segment**. Emerging without checking,
moving off without effective observation — and on a segment there is
already something to fail to check for, since `segmentHazards` places
people who may step out from behind the parked cars.

The tell is the one assessed in §0.3: **smoothness where there should have
been a check**. The observable is an absence, and it is comfortably above
both callability floors.

---

## 5. Build order

- ~~**R2.0 — signed footprint clearance.**~~ Superseded: the ruling made
  the unit time rather than distance, so the quantity is
  post-encroachment time and a signed distance was never needed.
- **R2.1 — encroachment in seconds, and the bands.** ✅ **Built** —
  `src/engine/clearance.js`, `verify-clearance.mjs`. See §7.
- **R2.2 — registration delay and candidate awareness.** ✅ **Built** —
  `src/engine/awareness.js`, `verify-awareness.mjs`, OBSERVATION added as
  the fifth axis. See §8.
- **R2.3 — the candidate departs on their own awareness, plus the risky
  tail of confidence.** ✅ **Built as one piece** — see §9. Overconfidence
  is now a consequence rather than a roll. Still exposed as a query;
  wiring it into `schedule()` is its own increment.
- **R2.4 — the reaction layer.** ✅ **Built** — `src/engine/reaction.js`,
  the `yielding` profile, `verify-reaction.mjs`, and `departOverride`
  wired into `schedule()`. See §10.
- **R2.5 — observation faults, and the five-axis re-map.** Then re-run the
  attributability floor for all five.

R2.0 through R2.3 are each independently provable. R2.4 is the largest and
should not start until R2.3's awareness is measured, because the reaction
is a response to the intrusion R2.3 produces.

---

## 6. The debrief gets its real content

Recorded against §7 of `DRIVER-IDENTITY.md`. The line Jay wants is not
"you missed a fault" but:

> **your candidate never saw the van, and neither did you.**

That sentence is exactly the three layers stated in order, and every term
in it is already derivable once R2.2 lands: layer 1 says the van was
there, layer 2 says the candidate never registered it, layer 3 says the
player was not looking. Three failures, three owners, one sentence.

---

## 7. R2.1 — encroachment in seconds. Built.

`src/engine/clearance.js`, `tools/verify-clearance.mjs` (the 24th check).

### 7.1 The ruling changed the quantity, not just the numbers

The standard is **intrusion on entitled space, not forced evasive action**.
Two consequences, both structural:

- **A fault exists independently of any reaction.** `clearance.js` imports
  nothing but `index.js`, checked at source level. Defining the fault in
  terms of a response would make the marking sheet depend on the reaction
  layer, and a scene where nobody happened to react would silently contain
  no fault. It also means R2.1 could ship *before* R2.4, which it has.
- **Time, not distance.** §0.2's metres are superseded. The quantity is
  **post-encroachment time**: how much time separates the candidate's
  occupancy of a piece of road from the entitled driver's. It is literally
  what "turning within .3 seconds in front of someone" measures, and it
  degenerates to ordinary following headway when the candidate turns
  *into* a lane rather than across it — so one measure covers the crossing
  case and the following case without two definitions.

Also superseded: R2.0's signed footprint distance was never needed.

### 7.2 The bands, derived rather than transplanted

A driver is taught 2–3 s and this game's pace does not allow it. But the
scale factor is not invented to make the numbers fit:

> **`forwardClaim` has granted every moving vehicle `LOOKAHEAD` seconds of
> road ahead since it was written, and `legalAt` refuses to let anybody
> into that space.**

The game's entitled gap was already stated, already in seconds, and
already shipped. `ENTITLED === LOOKAHEAD === 0.9 s` — asserted in the
check, so changing `LOOKAHEAD` moves the bands with it instead of leaving
a second opinion behind.

Against a real-world 2.0 s that is a scale factor of **0.45**. Real
driving marks the space encroached below 2.0 s and puts the other driver
inside their own reaction envelope below about 1.0 s — a 2:1 split, and
the split is preserved:

| band | PET | terminal | what it means |
|---|---|---|---|
| comfortable | ≥ 0.90 s | no | not a fault |
| tight | 0.45 – 0.90 s | no | encroached; nobody need react |
| very tight | < 0.45 s | no | **inside their reaction envelope — the lucky band** |
| contact | — | **yes** | the engine's own collision predicate |

`contact` is deliberately *not* a PET threshold. It is the same
same-instant overlap test the engine already used, so the terminal outcome
stays exactly where it was and nothing about collision handling moved.

### 7.3 Cross-checked against the game's own behaviour

A legal departure, across the shipped set and 30 generated draws:

> min **0.70 s** · p10 **1.40 s** · median **1.90 s** · p90 **2.50 s** · max **3.00 s**

- **95% of legal departures are comfortable**, so the standard does not
  mark ordinary driving. That is the property that had to hold.
- **No legal departure makes contact.**
- **One is legal but tight: `gap`, at 0.70 s** — the situation authored to
  be a tight gap, measuring as tight. That is not a failure, it is the
  ruling working: the examiner's standard sits inside the safety engine's
  rather than on top of it.

A literal 2.0 s would have marked most correct driving here. That is the
incompatibility the scale factor exists to resolve, stated as a number.

### 7.4 The two properties that make it a measure rather than a formula

**Severity never improves as the candidate goes earlier.** Checked across
14 situations, every step from legal to 2 s early:

| scenario | legal | −0.0 s | −0.5 s | −1.0 s | −1.5 s | −2.0 s |
|---|---|---|---|---|---|---|
| opposite | 4.20 s | 1.80 comfortable | 1.30 comfortable | 0.80 **tight** | 0.30 **very tight** | 0.00 **contact** |
| liar | 4.65 s | 2.20 | 1.70 | 1.20 | 0.70 **tight** | 0.20 **very tight** |
| gap | 4.25 s | 0.70 **tight** | 0.20 **very tight** | 0.00 **contact** | — | — |
| sleeper | 5.25 s | 2.50 | 2.00 | 1.50 | 1.00 | 0.50 **tight** |

**The gap recovers, so the minimum is what counts.** The candidate
accelerates away and trailing traffic gets its space back — measured in
**18 of 18** conflicts, by up to 0.30 s. Any single-instant reading, the
moment of crossing included, would understate the fault by exactly that
recovery.

### 7.5 The mild band has no reaction, so the gap is the observable

That was the tension to design out, and it resolves in the right
direction: **a tight gap must be judged, a forced reaction is visible,
contact is unmissable.** The hardest faults to spot are the least severe,
which is correct and is exactly the examiner's skill.

But only if the gap is legible. Because `LOOK_AHEAD` is a *duration*, a
time gap has a constant on-screen size whatever the speed:

| look-ahead | frame | px/m | entitled 0.90 s | edge 0.45 s | difference |
|---|---|---|---|---|---|
| 10 s | 90 m | 4.33 | 45 px | 22 px | **22 px** |
| 6 s | 54 m | 7.22 | 75 px | 37 px | 37 px |
| 4 s | 36 m | 10.83 | 112 px | 56 px | **56 px** |

**Legible at every look-ahead**, and the natural unit falls out of the
arithmetic: at cruise, 0.45 s is **1.1 car lengths** and 0.90 s is about
2.3. So the judgment the player makes is *"did they leave more or less
than a car length"* — which is the heuristic real drivers use, not a
number anybody has to be taught.

It is also a **second, independent argument for the shorter look-ahead**:
the bands are 2.5× more legible at 4 s than at 10 s. That tension was
already recorded in CLAUDE.md on framing grounds alone; this is a
different reason pointing the same way.

### 7.6 Not yet wired into the marking sheet

`encroachmentIn(sim)` is a query, not part of `faultsIn`. Folding it in
would change what is markable in every scenario and every check at once,
and it deserves its own increment with its own measurement — how many
faults per drive does it add, and does the pacing budget still hold. That
is R2.1b, and it should come after R2.3, because the candidate's own
awareness is what will produce most of these encroachments rather than an
artificially early departure.

---

## 8. R2.2 — awareness, and the fifth axis. Built.

`src/engine/awareness.js`, `tools/verify-awareness.mjs` (the 25th check),
plus OBSERVATION added to `ratings.js`.

### 8.1 Registration delay: one seeded draw per road user

A road user becomes objectively `clear` at some instant; this driver
registers it `delay` later.

- **Floor `REACTION_FLOOR` (0.35 s)** — nobody registers faster than they
  can react, so the floor is the engine's own number rather than a new
  one. A perfect observer takes exactly that, **with no jitter**, because
  consistency is what being good at this means.
- **Span 1.6 s**, derived twice over (§8.3).
- **Jitter ±60%**, seeded per road user, because two cars appearing
  together are not noticed together.

Deterministic: one draw per road user, from the scenario's seed, resolved
at composition time exactly as fault occurrence is.

### 8.2 A correction I had to make to my own model

`pose.hidden` covers **two different facts** — "a van is in the way" and
"this hasn't spawned yet" — and only the first is perceptual. Using it as
a perceptual gate made a candidate rated **1.0 on observation**, who by
construction misses nothing, pull out into `gap` and make contact.

`sightingsIn` now returns `clearAt` and `onStageAt` separately, and
anything not yet on stage counts as known: its absence is a fact about the
world's extent, not about anybody's eyes.

**And measuring it afterwards corrected my reasoning about it.** I assumed
this was about vehicles arriving later. It isn't — **vehicles are on stage
from t = 0**, approaching down the road. The clause fires only for
**pedestrians**, who don't exist until they step off the kerb: 6 road
users across 41 scenes. It's still the right rule and still a real change
— before it, a candidate simply ignored a pedestrian waiting to cross —
but it is not the fix for the thing that prompted it.

**What `gap` was actually doing is the model being right.** o2 is occluded
*behind o1*: in a stream of oncoming cars you cannot see the third one. So
even a perfect observer cannot see the whole stream, and departing on
"everything I can see is clear" pulls out into it. That is a real driving
truth and it is **R2.3's question** — how a driver behaves when they can
tell their own view is incomplete — not a defect to patch here.

### 8.3 The span, derived twice and never from outcome

**Derivation one — how much warning the world gives.** Across 48 scenes
and 93 road users, the lead from becoming clear to the decision point:

> min **0.50 s** · p25 **1.60 s** · median **3.75 s** · p75 **5.40 s**

Set to the p25, so a hopeless observer still gathers most traffic and
misses the quarter that gave least warning. Tying it to the median would
have a bad driver missing half of everything — not a driver, a hazard.

**Derivation two — what it does to gathering.** Share of road users that
*were* clearly visible before the decision and still weren't registered:

| observation | 1.00 | 0.75 | 0.50 | 0.25 | 0.00 |
|---|---|---|---|---|---|
| missed | **0%** | 3% | 11% | 16% | 30% |

Drawn drivers: **mean 5% missed, worst 16%.** Over a seven-junction drive
that is roughly three missed road users for a poor observer and none for a
good one — enough to be a habit, not enough to be a hazard.

**Calibrated on the miss rate and deliberately NOT on the contact rate.**
My first calibration probe swept the span against how often the candidate
collided. That is scoring observation by outcome — the one thing the axis
must never do — and I caught it only after building the probe. The
replacement measures gathering alone, against a fixed reference
(`legalAt`) so the measurement cannot feed back into itself.

### 8.4 Observation versus confidence, decided mechanically

The centre of the model, and it is no longer a weight in a table:

| candidate took a tight gap… | …having registered the vehicle | attributed to |
|---|---|---|
| yes | **yes** | **confidence** — they saw it and went anyway |
| yes | **no** | **observation** — they never gathered it |

Measured on **identical** encroachments: same scene, same departure, same
band, so the outcome is held constant by construction and only the cause
differs. A good observer's is confidence; a poor observer's is
observation.

Three enforcement points, because this is the property most likely to rot:

1. `awareness.js` **does not import `clearance.js`** — checked at source,
   so it cannot see the outcome it would be tempted to grade by.
2. `causeOf`'s body is checked at source for any reference to contact,
   band or collision.
3. The span was calibrated on gathering, per §8.3.

### 8.5 Layers 2 and 3 stay independent, and creep changed hands

`whatEgoSees` is pure and was **always** casting from the candidate's eye
— it was modelling layer 2 all along and being read as layer 3. The two
share the occlusion term, which is correct rather than contaminating: the
player watches through roughly the same windscreen. What stays independent
are the degradations — the observation rating for layer 2, the viewport
for layer 3.

Measured: **8 road users are on stage before they are clear** (occlusion
genuinely delays sighting, mostly behind other traffic), and **none of
them leaked into awareness**. 3 more are never clear at all — the
scenario's doing, marked against nobody.

**Creep is now the candidate's property.** It was a player input in the
driver game; feeding a player input into the candidate's awareness would
be exactly the contamination the three-layer split exists to prevent.

### 8.6 What awareness does to a decision — reported, not wired

`departureOnAwareness` is exposed as a query and deliberately **not**
wired into `schedule()`. That is R2.3, and it starts from this:

| observation | departs early | bands reached |
|---|---|---|
| 1.00 | 2 / 37 | comfortable 19, contact 1, tight 1 |
| 0.50 | 7 / 37 | comfortable 16, contact 3, tight 2 |
| 0.00 | 22 / 37 | contact 12, comfortable 7, tight 1, very tight 1 |

**Two things R2.3 has to answer, both visible here.** A driver who departs
the instant their *known* set is clear has no margin for traffic they
cannot see — which is why even a perfect observer contacts at `gap`. And
contact is far too common at low observation: 12 of 37 is a menace, not a
candidate. Both point the same way: the model needs the driver to *know
their view is incomplete* and hold for a bigger gap when it is. That is
caution about unseen traffic, which is a confidence question, and it is
exactly where the risky tail of confidence should live.

---

## 9. R2.3 — caution, and the risky tail of confidence. Built as one piece.

`cautionOf`, `unseenShare`, `marginAt`, `crossingTimeOf` in
`src/engine/awareness.js`; section 8 of `verify-awareness.mjs`.

### 9.1 The margin for what you cannot see IS confidence

Departing the instant the *known* set is clear is not neutral behaviour —
it is a driver with no humility about their own perception. So the margin
a driver leaves for traffic they have not accounted for **is**
overconfidence, expressed as a standing disposition rather than as a dice
roll. That gives the risky tail the markable, non-terminal expression it
was missing: an overconfident driver takes gaps sized only to what they
happened to register, so they are routinely tight and occasionally
unlucky rather than simply crashing.

`cautionOf` is **the whole of confidence in one number**: 1 at the
optimum, 0 when maximally bold, 2 when maximally timid.

### 9.2 Two things a driver can know about their own knowledge

The input is `unseenShare` — the fraction of the approach roads that is
occluded from the candidate's eye. It uses **no oracle knowledge**: it is
geometry from the eye, a fact about light rather than about who is there.
Every other road user is a physical blocker whether or not the candidate
has registered them, because a car you have not noticed still blocks your
view.

Measured across the set: `signalled` 0%, `opposite` 29%, `arterial` 58%,
`unprotected` 67%.

**THE ASYMMETRY, AND IT IS THE JUSTIFICATION FOR THE WHOLE FIVE-AXIS
STRUCTURE.** Occlusion is **perceptible**, so caution can compensate for
it — you can see that you cannot see past the van, and wait. Inattention
is **invisible from the inside**, so nothing can compensate for it — you
do not know you failed to look, and no amount of care will make you
account for a car you never registered.

That is what makes observation and confidence two axes rather than two
names for one thing, and it states the general rule: **an axis earns its
place when it fails in a way the others cannot reach.** It was not
designed in — it arrived as a *failed* derivation (§9.3), and forcing a
constant out of that calibration would have buried it. Checked directly:
**with nothing hidden the margin is zero whatever the confidence.**

### 9.3 The allowance is derived, not chosen

Not a constant at all — it is the candidate's **own time to clear the
junction**, per scenario. The reasoning needs no number picked: the way to
become sure an unseen stretch is empty is to watch it for as long as
anything hiding there would take to reach you, and that is the same
duration you need to be clear of the box before it arrives. One quantity
doing both jobs rather than two that would drift.

Measured: 5.05 s for a straight, 5.65 s across an arterial, 5.90 s for a
left, 7.65 s through a roundabout.

An earlier attempt derived it instead from the *shortfall* between what a
driver knew to be clear and what actually was, divided by the unseen
share. That gave a spread of 2.8 s to 40.2 s across nine cases, and the
spread was itself the finding: where the unseen share is small the
shortfall is caused by inattention, not occlusion, so the ratio explodes.
Confirming §9.2 rather than yielding a number.

### 9.4 Three recognisably different drivers from two axes

| driver | departs early | contact | tight | comfortable | mean hold past legal |
|---|---|---|---|---|---|
| good observer, **bold** | 2 / 37 | 1 | 1 | 19 | 0.11 s |
| poor observer, **careful** | 13 / 37 | 8 | 0 | 10 | **1.37 s** |
| poor observer, **bold** | 22 / 37 | **12** | 1 | 7 | 0.00 s |
| calibrated | 3 / 37 | 2 | 1 | 16 | 1.37 s |

Exactly as predicted: blind + careful is **hesitant but safer**, sharp +
bold is **fast and mostly fine**, and the dangerous candidate is the one
who is **both blind and bold**.

### 9.5 The timid tail was already built, and now shares the mechanism

Checked, and the answer is yes: `slowStart` and `creep` are already
registered as confidence's timid tail in `TAIL`, and `rollErrors` compiles
them only when the driver is on that side. So confidence now has **two
expressions from one parameter**, opposite at each end:

- **timid** — shows `creep` and `slowStart`, and holds **2.63 s** past
  legal;
- **bold** — shows neither, and departs early.

That is properly two-tailed rather than a tail bolted on, and it closes
the P3 gap reported in §8.3 of `DRIVER-IDENTITY.md`: the two ends now fail
in genuinely opposite ways, across both of confidence's expressions.

### 9.6 What it did to the 12-in-37, and what it did not

**It came down where caution can reach, and not where it cannot** — which
is the model working rather than a clamp.

- poor observer, **careful**: 12 → **8** contacts, holding 1.37 s more.
- calibrated: 3 → **2**.
- drawn drivers: **6.7% of conflicting scenes** end in contact (79 in
  1185), and the worst driver of 200 drawn manages 5 in 21.
- poor observer, **bold**: **unchanged at 12**, and it must be. Caution is
  zero for that driver by definition. That combination is also close to
  unreachable in a draw — observation bottoms out at 0.25 and confidence
  at about 0.95.

**The residual has a name, and it belongs to a different axis.** For the
bold-and-blind extreme, **100% of the contacts came from a departure with
essentially no dwell at the stop line** — the candidate reaching the line
and leaving in the same instant. That is not overconfidence. It is a
**rolling stop**, which is a KNOWLEDGE fault, and it is one of the
knowledge faults R2.5 already needs. Caution cannot fix it and should not
be asked to.

For *drawn* drivers the zero-dwell share is 23%, so the other 77% is
genuine misperception — and that is exactly what **R2.4's reaction layer**
converts from contact into a markable near miss, since the encroachment
standard already marks it without anybody having to brake.

### 9.7 Not wired into `schedule()` yet

`departureOnAwareness` remains a query. Wiring it in means every generated
drive changes, so it needs its own increment and its own measurement of
what happens to pacing and supply. The engine-side hook is one line — a
`departOverride` respected by `schedule()` — and composition would stamp
it after a first pass, keeping everything resolved once at composition
time.

---

## 10. R2.4 — the world gives way. Built, and departure wired.

`src/engine/reaction.js`, the `yielding` motion profile in `paths.js`, a
`departOverride` in `schedule()`, and `tools/verify-reaction.mjs` (the
26th check).

### 10.1 Ordering: R2.4 before wiring, and the reason is stronger than sequencing

Agreed, and there was no blocking dependency — `departureOnAwareness` was
already a query, so awareness-driven departures could be constructed for
measurement without switching anything on.

But R2.4 first also **forces a design decision that would have been much
harder to unpick later**: whether a fault is measured on the reacted world
or the unreacted one. Wiring first would have baked an answer into every
generated drive before the question was asked.

### 10.2 The reaction is the observable, and here is what that is worth

**Measured: marking on the reacted world would soften 63% of faults** —
`opposite` at 2 s early goes from `contact` to `veryTight` once the Red
car brakes. A driver who forces somebody to stand on the brakes would
score **better** for having done it.

So there are two derived worlds: **what the candidate did**, which is what
is marked, and **what then happened**, which is drawn and decides whether
anybody was actually hit. `clearance.js` imports nothing but `index.js`,
checked at source.

### 10.3 Derived, not scripted — and two bugs found getting there

The reaction is the **least giving way that avoids the collision**, found
by search, so how hard somebody had to brake is a measurement of how bad
the intrusion was. 7 distinct amounts across the shipped set.

**Bug one, and it cost the most: the search was bisecting a non-monotone
function.** The first profile took the *time* given up and stretched the
braking ramp to fit it — so a bigger sacrifice braked more gently and
lagged **less** in the moments that mattered. Measured: giving up 4 s put
the car *further forward* at the instant of the collision than giving up
2 s. Every search fell through to the maximum and avoided nothing.

The parameter is now **how hard they brake** over a fixed ramp, which is
monotone at every instant — checked over 3094 samples — and is also the
severity the player reads. A `give` of 0.1 is a lift off the throttle,
0.8 is a dead stop.

**Slowing has a ceiling, so giving way has to include stopping.** Before
that: **30 of 33 residual collisions could not be avoided by any amount of
slowing**, because braking alone cannot buy more than about three seconds.
A `wait` extends the plateau, monotone in its own right, and the search
runs the two bisections in order.

**Bug two: rounding the answer undid it.** Bisection leaves an interval of
about 5e-5; rounding to three places moves the answer by up to 5e-4, ten
times the precision it just bought — enough to land back on the side that
collides. The search reported "avoided" and the applied world hit anyway
in **13% of reacting scenes**. Rounded away from the collision now, so it
can only ever give slightly more way than needed. **0 of 23 disagree.**

### 10.4 Where giving way cannot help, and why that is right

A blind, bold driver: **9 contacts become 6**. Of what remains across
drawn drivers, **91% is the candidate driving INTO traffic already at or
in the junction** when they committed. You cannot reverse out of a
junction you are already in, so this is geometry rather than a shortcoming
— and it must not be tuned until it looks like one.

### 10.5 What wiring departure did to pacing and supply: nothing

`schedule()` gained one line — a `departOverride` that replaces
`earliestClear` when a driver has decided for themselves. Absent on
everyone else, so the golden is unmoved.

| | dead air worst | median | markable events / drive | candidate faults / drive |
|---|---|---|---|---|
| engine-scheduled | 35.7 s | 22.3 s | 8.0 | 5.8 |
| awareness-driven | 35.7 s | 22.3 s | 7.9 | 5.7 |

**Pacing and supply are untouched**, and the reason is worth stating: a
drawn candidate observes well enough (median observation 0.84) that their
own decision *coincides* with the engine's. The mechanism only bites for a
poor observer, which is exactly what it should do — but it means the
wiring is safe and boring rather than transformative.

The other side of that coin is thin content: **2 encroachments in 112
generated junctions**. If awareness-driven driving is to be something the
player reads, generated drives need to draw poorer observers more often —
the same content question as everywhere else, now with a number.

### 10.6 A gap worth naming: pedestrians do not give way

**All 4 contacts on generated drives were with pedestrians**, which
`reactionsFor` excludes. That is defensible — a pedestrian jumping back is
not the same mechanic as a driver braking, and `blockUntilClear` already
governs them by a legal rule rather than a following gap — but it means a
blind candidate's contacts on generated drives are entirely with
pedestrians and entirely terminal, with no near-miss band available.

Whether a pedestrian should be able to check and step back, and what that
costs the candidate, is a domain question rather than a mechanical one.

---

## 11. Pedestrians give way, and candidates get a character

Two rulings, built together.

### 11.1 A pedestrian hesitates rather than brakes

The same yielding profile expresses it exactly: they hold at the kerb, or
stop where they are, and resume at a walking pace. So pedestrian conflicts
now have the graduated near-miss band vehicles have, instead of being
all-or-nothing terminal — which was the state §10.6 measured, where every
contact on a generated drive was with a pedestrian and every one ended the
drive.

Measured across the set: contacts in pedestrian situations fell from **2
to 0**, with the pedestrian holding back in 2 of 6 swept situations.

**`heedless` is kept as a content lever.** A child after a ball, somebody
on a phone. Attentive holds 1.78 s at the same departure; heedless holds
nothing, and it is the difference between a near miss and a collision. The
hazard stays authorable rather than the engine deciding nobody reacts, and
reacting is the default because most people do.

The principle is untouched: `clearance.js` knows nothing about who did or
did not give way, checked at source, so the fault is identical either way.

### 11.2 The target is the player's experience, not a rating

*"The candidates need to present a fun challenge not just drive perfectly
around. Make them worse."*

There is an **optimum, not a direction**. Too few faults and there is
nothing to find. Too many and ticking everything becomes rational, which
destroys the false-positive penalty that makes the sheet mean anything —
and because marking is deferred, a section with fifteen faults is not
harder in an interesting way, it is a memory test.

So the quantity is **faults per section a competent player could catch and
recall**, and free recall of an unstructured list runs out at about four
items. The band is **3–4**, and section length is *derived* from it rather
than chosen.

**The cross-check that makes the two numbers one design.**
`SHOWINGS_FOR_A_HABIT` is 3: a trait needs three showings across a drive
to read as a tendency rather than an incident. A section inside recall,
several sections per drive, means a habit accumulates its evidence across
the drive without any single section overflowing. The two constants were
derived independently and they are compatible.

### 11.3 Character, not uniform badness

A driver bad at everything is as uninformative as one good at everything,
and considerably less fun to examine. So the distribution draws a
**profile** — pick one or two axes to be weak on, then fill in — rather
than sampling each axis independently, which produced drivers who were
slightly bad at everything and identifiable as nothing.

| | |
|---|---|
| weak on | 1–2 axes, never all, never none |
| each axis is a weakness | 27–31% of the time |
| where sound, actually sound | **100%** of non-weak axes carry little deficit |

Weakness on confidence means deviation from the optimum in *either*
direction, since that axis has no bad end and no good one — so a
confidence-weak candidate is bold **or** timid, drawn.

### 11.4 What it measures out at

| | |
|---|---|
| markable candidate faults per junction | **1.11** |
| distinct axes showing per drive | **2.38** |
| **implied section length** | **2.7–3.6 junctions** |
| encroachments per junction | 0.03 |
| reactions per junction | 0.02 |
| contacts per junction | 0.006 |

The middle number is the one the ruling was actually about: a drive shows
**two and a half different kinds of failing**, so the player is assembling
a picture rather than counting incidents.

### 11.5 Pacing: better typically, worse at the tail

Controlled — same seeds, same drives, only the distribution changed:

| | dead air worst | median | over 25 s | events/drive | faults/junction |
|---|---|---|---|---|---|
| old (independent axes) | 35.7 s | 22.3 s | **9/24** | 8.0 | 0.86 |
| new (a character) | **39.7 s** | **20.9 s** | **6/24** | 10.9 | 1.14 |

**It did not break the pacing work, and the shape of the change is worth
stating rather than averaging away.** The median drive improved, the count
of drives over the ceiling improved by a third, and the *worst* drive got
4 s worse.

That tail is character doing what character does: a candidate weak only on
knowledge, on a route that happens not to test it, gives you less to find
than a driver who was slightly bad at everything. The old distribution
bought a flatter floor by making every driver mildly poor, which is
exactly what the ruling asked to stop doing. Naming it rather than
absorbing it: **the cost of characters is quieter worst cases.**

### 11.6 The thin part, unchanged

Encroachments remain **0.03 per junction**. Observation is a weakness in
about 30% of candidates now rather than by accident, but a generated
junction is mostly open — `unseenShare` is zero — so caution never bites
and registration delays are short against long lead times. The
awareness-driven side of the model is still waiting on situations with
something to be blind about, which is the same R2.5 content question, now
with a number against it.

---

## 12. R2.1b — the band becomes markable, and the screen becomes visible

### 12.1 Encroachment is a fault now, and it has no trait

`faultsIn` returns it by default. It carries `trait: null`, a `band` and
the road user whose space was taken, because it is **not a habit** — it is
what the candidate did with the gap, derived from where everybody was.
Anything reasoning by removing a cause skips it (`isTraitFault`), which is
stated once in `faults.js` rather than guessed at four call sites.

Marked on the **un-reacted** world, always. Whether anybody had to brake
is the player's observable and never the definition.

### 12.2 What it did to a drive: nothing to pacing, a little to supply

Same seeds, awareness-driven departures, only the fold changed:

| | dead air worst / median | over 25 s | events/drive | candidate faults/drive | encroachments/drive |
|---|---|---|---|---|---|
| trait faults only | 39.7 s / 20.6 s | 5/24 | 11.2 | 8.1 | 0.00 |
| + encroachment | 39.7 s / 20.6 s | 5/24 | 11.2 | **8.3** | **0.17** |

**The pacing budget holds exactly.** Dead air, event count and the count
over the ceiling are all identical.

**And the supply is thin, which is the same finding as everywhere else.**
One encroachment every six drives. A generated junction is mostly open,
and `windowIsSafe` throws away any draw whose window lands on somebody, so
encroachments are rare *by construction* — the generator was built to
prevent exactly the situation this fault describes. On hand-authored
situations it fires reliably: **`gap` carries one at 0.70 s driven exactly
as written**, 1 of the 18 shipped situations.

That is worth stating plainly: making the band markable was correct and
free, and it will stay near-invisible until situations exist that are
*meant* to be tight. R2.5 content, and now the third measurement pointing
at it.

### 12.3 A failure worth having

Folding it in broke "a clean driver commits nothing" in 3 of 59 scenes. An
encroachment is not a habit, so a situation authored to be tight hands one
to whoever drives it, however clean they are.

The property was narrowed to what it was always about — **a clean
candidate contributes no habit of their own** — and the situational
residual is now reported rather than swallowed. Sharpening the check was
the right response; relaxing it would have hidden the distinction that
makes encroachment a different kind of fault from a trait.

### 12.4 And the screen nobody had looked at

Separately, and the largest single finding of the day: **the Examiner
screen had thrown on mount since it was written.** Four undeclared
identifiers — two never declared at all, two left dangling when the gaze
cone was deleted. Every examiner increment from the flip onward was
verified headlessly against a screen that produced a blank page.

`verify-screens.mjs` is the cheapest thing that would have caught it:
vite's own SSR build bundles each reachable screen, `react-dom/server`
renders it, and it fails if anything throws. It asserts nothing about what
is drawn and cannot — effects do not run under SSR — so a person still has
to open the page. Verified against the original bug by putting it back: it
fails with `watched is not defined`.
