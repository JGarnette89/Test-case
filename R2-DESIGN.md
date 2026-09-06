# R2 — three layers, five axes, and scoring the decision

*Jay: "this is it! this is what poor drivers dont see, the traffic moving
around them. This is what I was trying to emulate with the vision-fade
system."*

Design only. Nothing here is built except the one prerequisite defect in
§0.4, which had to be fixed because R2 would have been built on top of it.

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

### Severity: score the decision, not the outcome

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

**Domain question, and it is the maintainer's:** where do the band
boundaries sit, in metres of clearance, and does the answer depend on
closing speed? An examiner's judgment, not a mechanical one.

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

- **R2.0 — signed footprint clearance.** A signed-distance sibling of
  `boxesOverlap`. Smallest piece, needed by everything else, and
  independently checkable.
- **R2.1 — severity bands on clearance.** Needs the maintainer's
  boundaries. Makes *lucky* representable.
- **R2.2 — registration delay and candidate awareness.** Opt-in for a
  rated candidate; `whatEgoSees` filtered by a seeded per-road-user delay.
  Golden untouched.
- **R2.3 — the candidate departs on their own awareness.** `earliestClear`
  over registered road users. This is where overconfidence becomes a
  consequence rather than a roll.
- **R2.4 — the second scheduling pass.** Road users decelerate for a
  candidate who took their gap. The reaction becomes the observable.
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
