# Examiner redesign: the camera is the constraint

Status: **agreed, not implemented.** Written 2 Sep 2026 against commit
`818fbd9`. Nothing in `src/` has been changed for this document.

This supersedes the attention model described in CLAUDE.md's "The examiner
game" section. CLAUDE.md is not yet updated; do that when the first stage
below lands, not before, so the file never describes a game that does not
exist.

---

## 1. What changes, in one paragraph

The view cone stops deciding whether a fault counts. **The viewport does.**
The camera is deliberately smaller than the situation, so where you point it
is a real choice, and the two examiner jobs — reading the intersection ahead to
give a direction, and watching the car to catch faults — pull it to different
places. Marking moves off the live clock: the drive is cut into sections and
you fill in a sheet at the end of each. Scoring gains a third and fourth
outcome (invented, and misattributed to the wrong section). Intervention
becomes a third verb with its own three outcomes.

---

## 2. Why the cone had to go

Worth recording, because the cone was built deliberately and the reason it
fails is not "it was wrong", it is "it is unfair in a way players feel".

A cone that gates detection produces this exchange: the player watches a car
swing wide, presses mark, and the game says they did not see it. Everything
about that is technically defensible — the fault was outside a 60° arc from a
seat 0.7 m to the right of the driver — and none of it is legible. The player
has no way to tell the difference between "outside the cone" and "the game is
broken", because on screen the fault was plainly visible.

That is exactly the failure that produced the last bug (`818fbd9`): correct
calls scored as inventions. The fix made the rule fairer but did not remove
the underlying problem, which is that **the screen showed one thing and the
scorer believed another.**

The camera does not have that problem. If it is not on screen, you did not
see it, and you know precisely why: you were pointing somewhere else.

---

## 3. Collisions with what exists

Ordered by how much work the collision represents.

### 3.1 The camera stops being presentation — architectural

CLAUDE.md's central architectural claim is **"the engine is pure and the
renderer is disposable"**, with an explicit instruction not to put anything
visual into the engine, so that a 3D view is a second renderer rather than a
rewrite.

This redesign breaks that, and it needs to be faced rather than finessed. If
the viewport decides what is markable, then **framing is rules, not
presentation.** A renderer may no longer choose how much world to show; two
renderers that frame differently would score the same drive differently.

The damage is smaller than it sounds, because `src/frame.js` is already pure
geometry with no React, no DOM and no colour, and is already imported by
`tools/verify-camera.mjs`. It sits outside `src/engine/` but obeys the
engine's rules.

**Proposal:** move `frame.js` into `src/engine/` and state the new boundary
explicitly — *the engine decides what is visible; the renderer decides what
it looks like.* A 3D renderer would then have to honour the same world
extent, which is a real constraint on that future work and should be written
down now rather than discovered later.

Jay's occlusion ruling (§3.3) strengthens this rather than complicating it.
**Visibility is now rules on both axes** — what the viewport contains and
what the sightlines reach — while the renderer decides only appearance.
Occlusion is already engine-side in `sight.js`; framing joins it. The two
halves of "can the player see this" then live together, which is what makes
the single-oracle requirement in §3.3 enforceable at all.

### 3.2 `sight.js` splits in two — moderate, and clean

The examiner cone occupies a well-bounded block of `sight.js` and has
exactly three consumers: `sight.js` itself, `ExaminerLab.jsx`, and
`verify-faults.mjs`. `verify-sight.mjs` does not reference it at all.

Dead if the cone goes:

| Symbol | Notes |
|---|---|
| `EXAMINER_CONE`, `EXAMINER_ACROSS` | cone geometry |
| `examinerEye` | the seat only mattered for the cone origin |
| `bearingFromCar`, `inCone` | the angular test |
| `whatExaminerSees` | replaced by `whatEgoSees`, which already does this without a cone |
| `faultVisibility` | replaced by a thin occlusion-only per-fault helper |

`OWN_CAR_READ_AT` needs a decision rather than a deletion: nothing can
occlude your own car, so the candidate's own faults are visible whenever the
viewport holds them. That is correct and survives as a one-line special case
rather than as the cone-based rule it is today.

Still needed, and untouched:

| Symbol | Used by |
|---|---|
| `visibility`, `segmentHitsBox`, `eyePoint` | occlusion, driver game |
| `sightBlockersOf`, `whatEgoSees` | driver game, `verify-sight` |
| `creepPose`, `noseOut`, `encroaches`, `carWaitingInBox`, `assessCreep` | the creep mechanic |

So this is a deletion of one section, not a rewrite. **Delete rather than
leave dormant** — a dead cone is exactly the sort of thing that gets
re-wired by accident later.

### 3.3 Occlusion stays — RULED, with a constraint attached

**Jay's ruling, overriding both recommendations in the first draft:**
occlusion stays and gating detection on it is fine. His words — *"things
being hidden is core to our gameplay, looking around and through objects is
what driving is traffic is all about."* Sight blockers keep their role;
`unprotected` and `boss-blind-rush` keep working exactly as built.

The constraint that comes with it, and the thing that separates occlusion
from the cone just removed:

> **The scorer must never know something the screen did not show.**

The cone was unfair because a fault was plainly visible on screen and the
game said it was missed. Occlusion is fair only if the hiding is honest —
**rendered occlusion, not merely scored occlusion.** If a van blocks a fault
from the car, the player must not be able to see that fault on their display
either.

#### What that means concretely

Line of sight is already computed from the **ego's eye**, not from the
overhead camera: `visibility(eyePoint(egoPose), target, pose, blockers)`.
That is the correct origin and does not change. What changes is that the
renderer is now **obliged** to represent it.

**Draw the shadow, not the absence.** Omitting a hidden car is technically
honest and practically unreadable: at the app's zoom — 72–115 m across, a car
8–20 px — an omitted car is indistinguishable from an empty road. The player
cannot tell "nothing is there" from "something is there and I cannot see it",
and those are completely different pieces of information to an examiner.

So a blocker casts a visible **umbra** from the ego's eye: the wedge of world
behind it that the occupant cannot see. Everything inside that wedge is
unknowable, and the wedge itself is drawn. This makes the *reason* legible
rather than the *consequence* mysterious, and it teaches the mechanic without
a word of tutorial. It is computed from the same `segmentHitsBox` geometry
the scorer already uses, so there is one source of truth for the shape.

Per-state rendering rules:

| Engine state | Screen | Rationale |
|---|---|---|
| `clear` | drawn normally | you can see it |
| `partial` | drawn, dimmed | you can genuinely see part of it |
| `hidden` | **not drawn**, inside a drawn umbra | you cannot see it, and you can see why |

The belief ghost may still be drawn for a hidden car, because it rides
`cleanPose` and therefore shows only what a *properly driven* car would be
doing. It never reveals the fault. **That must stay true** — if a prediction
ever incorporated the fault it would be leaking exactly what the umbra hides.

#### Bug class: any path where the pixels and the scorer disagree

These are bugs under this design, not tuning questions. Called out so they
are caught by review rather than by a player.

1. **`CLEAR_ENOUGH` over a duration is the cone bug in new clothes.** Today a
   fault visible for 20% of its life falls under the 35% share and is scored
   unmarkable — but the screen showed it for that 20%, plainly. That is the
   same unfairness in a different costume and it must go. The replacement
   rule: **a fault is markable if the screen showed it for at least
   `REACTION_FLOOR`** — the existing 0.35 s constant for "nobody registers
   anything faster than this". Derived from something that already exists,
   and it asks the honest question: was it ever on screen long enough to
   register?

2. **The "Truth shown" toggle in the lab reveals hidden actors.** It is a
   bench affordance for checking the engine against reality and it must never
   reach the game. If it ships, the scorer is judging a screen that showed
   more than the rules admit.

3. **Decorative scenery must never overdraw a road user.** This is the
   *inverse* violation — the screen hides what the scorer believes was
   visible — and it is just as unfair. Trees, buildings and ground texture
   draw beneath traffic, always.

4. **Two visibility sources is a bug by construction.** If the renderer asks
   one function what is visible and the scorer asks another, they will drift,
   and the drift is invisible until a player is wrongly marked. There must be
   exactly one oracle, consumed by both.

#### The oracle already exists

Deleting the cone leaves `whatEgoSees(sim, t, steps, statics)` — which
already returns `hidden` / `partial` / `clear` per actor, from the ego's eye,
with occlusion, and is already used by the driver game and checked by
`verify-sight.mjs`.

That is a genuinely good outcome: **one visibility function, shared by the
driver game and the examiner game, and by both the scorer and the renderer.**
`whatExaminerSees` and `faultVisibility` are replaced by it plus a thin
per-fault helper, rather than by anything new.

### 3.4 Timeliness disappears from scoring — moderate

`detect.js` is built as "precision and recall **with a clock on it**".
Deferred marking removes the clock. Three exported concepts become
meaningless and should go:

- `callWindow`, `promptness` — when a call landed relative to the fault
- `CALL_GRACE`, `LATE_CREDIT` — the decay curve for a late call
- `LOOK_MEMORY`, `lastSeenAt` — whether you were looking when you pressed

That is roughly half of `detect.js`'s current surface. What survives is the
matching and the arithmetic, which is the part that matters.

Worth noting: this makes the module **simpler**, and removes the exact
machinery that caused the last bug. Timeliness is replaced by section
attribution, which is a coarser and much more legible axis.

### 3.5 The fault model already supports three outcomes — no restructuring

`scoreDetection` already returns `hits`, `missed` and `invented`, and
`faultsIn` already produces faults with `who`, `trait`, `from`, `to`,
`duration` and per-sample positions. **The caught / missed / false-positive
distinction needs no new fault modelling at all.**

Two additions are needed:

- a fourth bucket, `misattributed` — a real fault marked in the wrong
  section, scored above `invented` and below `hits`
- a `section` field on each fault, derived rather than authored (§4.2)

`FALSE_COST` already exists and already carries the "over-marking must cost"
rule, with the measured evidence that spraying marks collapses precision to
0.075.

### 3.6 `verify-faults.mjs` loses three of its five sections — expected

| Section | Fate |
|---|---|
| 1. Every derived fault is a real one | **Keep unchanged.** The controlled-comparison check is the load-bearing one and is independent of how faults are observed. |
| 2. The candidate faults like anyone else | **Keep unchanged.** |
| 3. A fault nobody could see is not markable | **Keep, rewritten as occlusion-only.** Jay's ruling makes this check more important, not less: it is now the guard on the fairness constraint, and asserts that a fault the engine calls hidden is one the renderer was never given to draw. |
| 4. Gaze is relative, so a rotated course plays identically | **Rewrite in camera terms.** The invariant is still needed and still true — a rotated leg must frame identically — it just belongs to `verify-camera.mjs` now. |
| 5. Where you look is a real decision | **Rewrite in camera terms**: no single framing can hold every fault at once. This becomes the check that proves the new core mechanic is real, and it is the most important new test in the suite. |

### 3.7 `verify-playthrough.mjs` has no equivalent — significant

Today it replays every scenario at every press time, because a drive was one
decision on a clock and that space is enumerable. **A sheet is not.** The
player's recall is not a function of scenario state, so there is nothing to
sweep.

What replaces it is property-based checking of the sheet scorer, which
`verify-detect.mjs` already is. What is genuinely lost is the end-to-end
"replay the whole game headlessly" safety net for the examiner path.

Mitigation: keep `verify-playthrough.mjs` for the driver game while it
exists, and add a scripted-examiner harness — a fixed camera path plus a
fixed set of marks — that must produce a fixed sheet. That is a golden test,
not a sweep, and it is weaker, and that should be said out loud.

---

## 4. Mechanics, and how each derives from existing state

### 4.1 The camera as the constraint

Already partly built. `chaseFor` in `frame.js` rides the candidate's
*intended* pose, turns with it, and sizes the view as a duration of road
(`LOOK_AHEAD`, currently 10 s). What is missing is the dynamic part: it
should tighten onto the action and widen when the scene is busy.

Framing should be **derived from the extent of relevant traffic**, not from a
fixed number:

- take the road users that matter — those with priority over the candidate,
  those the candidate's path conflicts with, and the candidate itself
- frame their bounding extent, plus the intersection being approached
- clamp to a minimum (never so tight the car fills the screen) and a
  maximum (never so wide that everything fits, or the mechanic is gone)

**The maximum is the mechanic.** If the widest framing can hold the whole
situation, there is no scarcity and the redesign has no teeth. That needs to
be an asserted, measured property, not a hope — see §6, stage 2.

One measured finding to carry over: because the camera centre rides *ahead*
of the car, the middle of the screen is not straight ahead from the driver.
Diagnosing the last bug, a pointer aimed at screen-centre produced a bearing
of **−41°**. Whatever replaces gaze aiming must not assume screen-centre is
the car.

Transitions must be smoothed. `frame.js` already has `easeWindow` and
`smoothstep`; the same treatment applies, with the additional constraint that
the extent must never shrink faster than it grows, or a car leaving the scene
snaps the view closed.

### 4.2 Sections, derived from scenario state

Sections must end at natural breaks — a completed manoeuvre, an intersection
cleared — never on a timer.

The engine already produces the signal: `poseAt(ego, t).gone` is `k >= 1`,
i.e. the candidate has completed its traverse of the current leg. That is
derived, not authored, and it is exactly "the intersection is behind us".

Two cases:

- **Multi-leg drives** (`route.js`): a section *is* a leg. `planRoute`
  already sequences them, `currentLeg`/`recordLeg` already step them, and
  `entrySideAfter` already derives continuity. Almost free.
- **Single-intersection situations**: one section per situation. Also free, and
  it means the first playable version needs no new sectioning code at all.

Fault-to-section assignment needs one rule, and I propose: **a fault belongs
to the section in which it STARTS.** A fault straddling a boundary is
attributed to where it began, which matches how a person would remember it.
The alternative — attributing by peak magnitude — is more "correct" and less
predictable, which is the wrong trade for something a player is being scored
on.

### 4.3 Ground truth for the sheet

`faultsIn(scn)` is already the ground truth and needs no change. For each
section, the sheet's answer key is the faults whose `from` falls inside it.

The sheet presented to the player is then a list of candidate entries. Open
question, deliberately left open in `detect.js` today: **does the player pick
a category, or only "a fault happened here"?** The module already scores both
— pass `what` and a wrong name is an invented call; omit it and only the
placement is graded. Deferred marking makes categorisation much more
plausible, because there is no longer a one-thumbed time pressure. This is
your call.

### 4.4 Scoring: four outcomes

| Outcome | Meaning | Weight |
|---|---|---|
| **Caught** | real fault, right section | full credit |
| **Misattributed** | real fault, wrong section | partial — observed but misplaced |
| **Missed** | real fault, not marked | no credit |
| **Invented** | marked, no such fault | a cost (`FALSE_COST`) |

Precision and recall stay reported separately, because they fail in opposite
directions and one number hides which.

Note the interaction with §4.2: shorter sections make misattribution more
likely and memorisation less; longer sections do the reverse. **That is the
main tuning dial and the main risk** — see §5.

### 4.5 Intervention

A third verb, with three outcomes: correct intervention, failure to
intervene, needless intervention. Needless intervention must cost, for the
same reason over-marking must.

`conflicts()` at crash padding already provides the oracle for "would this
have been an accident". What does *not* exist is a fair cue, and the
existing measurement is unchanged and unfavourable: **warning time from
first conflict to contact is min 0.45 s, median 1.10 s, max 2.30 s**, against
a 0.35 s floor for noticing anything at all.

The redesign makes this **harder, not easier**: under the camera constraint
the player may not be looking at the conflict when it develops. Intervention
therefore cannot be triggered by the conflict, and it also cannot rely on the
player having seen the build-up.

I do not have a proposal I believe in yet. Options worth exploring, none
verified: an audible cue that does not depend on framing; a widening of the
camera as a conflict develops (which spends the mechanic to save the player);
or accepting that a missed intervention while looking elsewhere is a
legitimate loss. This should be the **last** thing built, and it needs its
own design pass.

---

## 5. The main tuning risk, stated plainly

**Section length decides whether this is an attention game or a memory game,
and there is no headless way to find the right value.**

Too long and the player is reciting a list of five faults from ninety seconds
ago, which tests recall and punishes anyone who plays in short sittings. Too
short and the sheet interrupts constantly, and misattribution becomes noise
rather than signal.

Every other constant in this project was either derived or measured against a
controlled comparison. This one cannot be. It is a playtest question, it is
Jay's to answer, and the honest thing is to build the shortest defensible
version first (one section per intersection) and lengthen only if it feels
trivial.

Secondary risk, same character: the camera's maximum extent. Too wide and
there is no scarcity; too tight and the player is fighting the camera rather
than making judgments.

---

## 6. Staged plan, smallest provable increment first

Each stage is independently verifiable and can be stopped at.

### Stage 1 — Remove the cone, keep occlusion, prove nothing else breaks
Delete the examiner-cone block from `sight.js`, keeping `whatEgoSees` as the
single visibility oracle. Strip gaze gating from `detect.js` (`lastSeenAt`,
`LOOK_MEMORY`). Replace the `CLEAR_ENOUGH` duration share with the
`REACTION_FLOOR` "ever on screen long enough to register" rule per §3.3.
Update `verify-faults.mjs` sections 3–5.

**Provable:** the full suite still passes; `verify-faults` sections 1 and 2 are
untouched; a fault behind a van is still unmarkable; a fault the van never hid
is markable from anywhere on screen, whatever the player was looking at.

### Stage 2 — Dynamic framing, and prove the scarcity is real — **FAILED, 2 Sep 2026**

**Measured before building, and the gate does not pass.** `tools/gate-viewport.mjs`
holds the measurement; it is deliberately not part of the verify suite.

Across 40 situation/trait configurations, with the camera as tight as is
usable:

| Look-ahead | Frame width | Configs where a fault leaves frame | Fault-time off screen |
|---|---|---|---|
| 10 s | ~144 m | 2 of 40 | 0.3% |
| 6 s | ~86 m | 4 of 40 | 0.9% |
| 4 s | ~58 m | 4 of 40 | 1.3% |
| 3 s | ~43 m | 8 of 40 | 1.9% |

The reason is not tuning, it is content scale. **The widest separation
between two simultaneous faults anywhere in the set is 35.8 m**, and a 4 s
look-ahead already frames 57.5 m across. Faults happen at an intersection, the
intersection box is 7.2 m, and everything worth watching sits inside a few tens
of metres. To make the viewport scarce you would have to shrink it below
~36 m, at which point the candidate's car fills a third of the screen and
the intersection cannot be read at all — the "fighting the camera" failure mode
flagged in §5.

**What this does and does not invalidate.** It does not kill the design. It
identifies that fault-versus-fault separation is the wrong source of
scarcity: two faults at one intersection will always be close together. The
scarcity the design actually wants is **job versus job** — reading the
intersection ahead against watching the car — and those are genuinely far apart:

| Situation | Candidate → intersection at t=0 | at departure |
|---|---|---|
| `gap` | 15.3 m | 8.3 m |
| `tee` | 19.1 m | 8.3 m |
| `arterial` | 27.6 m | 15.4 m |
| `opposite` | 31.3 m | 8.3 m |

Today those are 8–31 m apart, comfortably inside one frame. In a continuous
world they would not be: a turn needs 5.5 s of approach to be directable
(§4.2 and `runwayNeeded`), which at 41 km/h is **about 63 m of separation**
— against a 57 m frame. That is scarcity, and it is real.

**Conclusion:** the gate fails on current content and would plausibly pass on
continuous-world content. Stage 2 therefore **depends on the continuous
drivable world**, which §7 previously listed as a stage 4 dependency. That
was wrong; it is a stage 2 dependency, and the whole camera-as-constraint
mechanic rests on it.

Stages 3–5 are not blocked by this — see the revised ordering below — but
nothing should be built that *assumes* viewport scarcity until this gate is
re-run and passes.

### Stage 2 (original wording, for the record)
Extend `frame.js` with traffic-extent framing and smoothing. Move it into
`src/engine/` and record the new boundary in CLAUDE.md.

**Provable, and this is the important one:** across the situation set, no
single framing at maximum extent contains every fault at once. If that check
cannot be made to pass, the core mechanic does not exist and the design needs
revisiting before anything else is built.

### Stage 3 — Sections and the deferred sheet
One section per situation to start. Add `section` to derived faults by start
time. Add the `misattributed` bucket to `scoreDetection`. Present a sheet at
section end in the lab.

**Provable:** a real fault marked in the wrong section scores above an
invention and below a catch; the four buckets are exhaustive and disjoint.

### Stage 4 — The two jobs compete
Wire directions into the same viewport, so reading the intersection ahead and
watching the car are different framings. This is the stage that makes it a
game rather than a marking exercise.

**Provable:** a drive exists in which no camera path both gives the
instruction on time and catches every fault. That is the design thesis
expressed as a test.

### Stage 5 — Intervention
Only after stage 4 has been played. Needs its own design pass first (§4.5).

---

## 7. Dependency on the continuous drivable world

**Depends on it:**

- **Stage 2, the camera-as-constraint mechanic itself.** Corrected after the
  gate measurement above: on single-intersection content the viewport cannot be
  scarce, because the widest gap between two faults (35.8 m) is smaller than
  any usable frame (57.5 m at a 4 s look-ahead). Scarcity needs the two jobs
  to be far apart, and that needs road between them.
- Stage 4 in its full form. Reading an intersection *before the car arrives*
  needs road ahead of the current intersection to exist and be framable.
- Sections at genuinely natural breaks across a long drive. Today a "natural
  break" is the end of a situation, which is a boundary the scenario format
  hands us for free.
- The camera's widen-when-busy behaviour having anything to widen into.

**Does not depend on it:**

- Removing the cone (stage 1).
- Four-outcome scoring and the deferred sheet (stage 3) — one section per
  existing situation works today.
- Framing derived from traffic extent (stage 2) — measurable against the
  existing situation set.
- Everything in `faults.js`, which already derives ground truth per
  situation.

So stages 1–3 are buildable now, and stage 4 is the point at which the
continuous world becomes a prerequisite rather than a convenience.

---

## 8. Known-good things this must not break

Carried from CLAUDE.md, because they are the parts that took longest to get
right and are easiest to damage from here:

- **Never author the fault.** Faults stay derived by controlled comparison.
  Nothing in this redesign touches that, and nothing should.
- **The traffic law is not negotiable**, however silly the fiction gets.
- **`legalAt` and `safeAt` stay untouchable.** No part of the camera, the
  sheet or the intervention verb may reach them.
- **Rotation invariance.** A rotated leg must play identically. The check
  moves from gaze to framing; it does not disappear.
- **The golden fingerprint.** `engine-golden.json` must not move for any of
  stages 1–3, since none of them change how anyone drives. If it moves,
  something has gone wrong that is not in this plan.
