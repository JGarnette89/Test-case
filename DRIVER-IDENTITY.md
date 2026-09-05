# Driver identity: one candidate, and habits you can name

*Jay's ruling: identity moves ahead of streaming and ahead of the marking
sheet. "Identifying driver habits is what half the real job is about."*

Status: **built and verified** (`tools/verify-candidate.mjs`, the 23rd check).
The debrief in §7 is recorded as planned work and is **not built**.

---

## 1. What was actually wrong, measured first

The brief assumed each junction composed a fresh ego. It was worse than that.

| Measured, before any change | Result |
|---|---|
| Generated junctions sampled | 320 |
| ...where the candidate carried **any** trait | **0** |
| Faults committed by the candidate | **0** |
| Faults committed by other road users | 143 |
| Composed junctions matching the route's `(entry, intent)` | **9 of 120** |

So the candidate was not an inconsistent driver — the candidate was a
**flawless** driver, at every generated junction, with nothing to examine.
Everything markable belonged to somebody else's car. And the route's
direction survived into the composed junction about as often as chance
would give, so the examiner was directing a turn the candidate was never
making.

Segments were the other half of the split: `segmentHazards` took
`candidateTraits` from whoever called it, so the candidate was literally
two different people on one drive.

---

## 2. Can the trait model express a habit, as opposed to a one-off?

**Yes, unchanged.** A driver trait is already a standing disposition: it
lives on the participant, `schedule()` applies it to everyone it is handed,
and `faultsIn` derives a fault from it by controlled comparison. Nothing
about the model is per-scenario.

What was missing was a **world that gave one repeated chances**. So no
restructuring was needed, and no third word was introduced:

- a **trait** is the disposition (the engine's existing word),
- a **showing** is one occasion it visibly expressed,
- a **habit** is a trait with several showings — a *derived property of a
  drive*, not a field on anybody.

That last point is what makes it checkable rather than declared.

Two real defects did surface while proving it, and both are the project's
own worst outcome — teaching something false. See §5.

---

## 3. Where a habit can show, derived rather than tabulated

A trait only has something to say in situations that give it the chance.
`cutsCorner` needs a left; `creep` needs a wait. Writing that down as a
table would author the answer in the one place this project has always
refused to, and it would go stale the first time a trait changed.

So `chancesAt(shape)` builds the smallest scene with that shape and asks
`faultsIn` — the identical derivation the scorer grades against. A cheaper
call to the same oracle, not a second oracle.

| Shape | Habits it can show |
|---|---|
| stop / straight | wander, creep, overshoot, slowStart |
| stop / right | + wideTurn, lateSignal |
| stop / left | + cutsCorner |
| roll / straight | wander |
| roll / right | wander, wideTurn, lateSignal |
| roll / left | + cutsCorner |

Three things fall out of that table rather than being designed into it:

- **A turn asks more of a driver than a straight-on.** Intent is therefore
  a real lever for the planner.
- **`cutsCorner` needs a left** — the engine's own left-only rule surfacing
  here, not restated here.
- **A segment shows less than a junction.** A road with no line can only
  betray `wander`, so segments can never carry a drive's whole character.
  Junctions are where a driver is read.

`creep` looked inert in every shape until the probe gave the candidate
something to actually be **held** by. That is precisely the class of wrong
answer a hand-written table would have frozen in permanently.

### Two functions, two questions — not two answers to one

`chancesAt(shape)` is asked **before** a scene exists, by a planner
choosing an intent, and can only reason about the shape. `chancesIn(scn)`
is asked **afterwards**, of the scene itself, and is the truth — it knows
the candidate was held eleven seconds by traffic no shape could predict.

Reporting uses the truth. The forecast's error is **measured**, not waved
through: over 71 scenes, 47 exact, 26 predicted-but-absent, **0
present-but-unpredicted**. The forecast never misses a chance the scene
actually offered, so nothing is planned away by accident; it is merely
optimistic, which costs the planner and not the player.

---

## 4. What recurrence means for the planner and the budget

### The accept/reject loop carries it, unchanged in shape

`composeScenario` already had `mustFault`: when the drive has gone quiet, a
junction is *required* to produce something markable rather than merely
made likelier to. Recurrence is that same gate **narrowed** — not "somebody
erred" but "*this* driver's habit had an occasion to show":

```js
if (mustShow?.length) { ...reject unless an ego fault names one of them }
```

It subsumes `mustFault` (a showing by the candidate *is* a fault), it
shares the one expensive `faultsIn` call, and it sits in the loop where
every other guarantee in that file already lives. **No new mechanism.**

The fallback ladder gains one rung at the top and keeps the rest, because a
habit that has nothing to say at this junction must not cost the player the
junction:

1. the brief **+ a showing of the habits still owed**  ← new
2. the brief as pacing asked for it
3. the brief without `mustFault`
4. the road character's plain brief
5. plain, light traffic

Measured: 48 of 49 junctions asked for a habit delivered it; the ladder
still fills every junction, none empty.

### The planner steers *which* turn, not whether to turn

`planDrive` keeps its own turn/straight decision exactly as it was — a
route still has to read like a route, not like a trait-delivery mechanism.
What the candidate influences is **which** turn, among turns the junction
was going to offer anyway, weighted by what each habit is still owed.

The random draw happens whether or not it is used, so a steered plan and an
unsteered one walk the same stream and differ **only** where the candidate
actually changed a choice. Verified: with `candidate: null`, 60 of 60 plans
are byte-identical to before.

### It works, and persistence was most of it

Same seeds, one thing changed at a time:

| configuration | identifiable | glimpsed | hidden | rivals ruled out |
|---|---|---|---|---|
| persistence only | 20 / 25 | 5 | 0 | 75 |
| + ask for a showing | 22 / 25 | 3 | 0 | 76 |
| + steer the turns | 24 / 25 | 1 | 0 | 81 |
| **both** | **24 / 25 (96%)** | 1 | 0 | 82 |

Saying which lever did the work matters: **persistence alone was most of
it**, from a baseline where the candidate had no traits at all. Asking and
steering are the finishing 4.

### Testing a hypothesis needs no separate machinery

Forming a hypothesis is half the job; testing one needs junctions where a
rival habit had every opportunity and did nothing. That falls out of the
same fact — a left turn is where `cutsCorner` *would* show, so a left turn
where nothing happens is evidence **against** it. One junction speaks to
every hypothesis it has the shape to speak to.

Measured: **82 rival habits** were given three or more chances they visibly
declined.

### The pacing budget needs no change

Dead air is a supply question and identity is a *whose* question; they are
not the same quantity and must not become one dial. `mustShow` narrows what
counts as supply at a junction pacing has already decided to make hungry.
`verify-world.mjs` still passes, worst dead air unchanged at 26.6 s.

---

## 5. Two defects found while proving it

### 5.1 A tell that was a lie on any road without a line

`overshoot` and `slowStart` express through `stopBias` / `startDelay`, and
`stopBias` shifts the origin of the traverse **whether or not anyone
braked**. On a segment — no stop line, `control: "none"` — a candidate
carrying `overshoot` produced 3.8 s of derivable, markable fault whose tell
read *"Stopped well past the line, nose already in the intersection."*

Both are now guarded on `p.stops`, which is the same rule `cutsCorner`
already lived under (left only, because a right has no radius to give
away), not a special case.

It removed real supply, and the supply it removed was false: across 114
composed scenes, **17 non-stopping actors** carried one of those two
traits. The unaided dead-air figure worsened from 39.5 s to 52.2 s
accordingly — the drive had been propped up by faults whose tells were
untrue. The two real mechanisms absorb it: 26.6 s, unchanged.

### 5.2 Two habits that cannot both be true

`wideTurn` and `cutsCorner` both write `turnBias`, so a candidate fitted
with both had one of them silently overwritten. `faultWindow` strips one
trait at a time, and stripping the loser changes nothing — so it derives no
fault. Measured on a real drive: **`wideTurn` 0 showings from 5 chances**,
while `cutsCorner` took all five.

A driver cannot both swing wide through a corner and cut inside it. That is
physically incoherent, and the debrief would have named a habit that never
showed.

**Derived, not listed.** Two habits are incompatible when fitting both
hides either — the same controlled comparison the whole fault model rests
on, asked of a pair instead of a single trait. A new trait that writes over
an old one is caught on its first draw. Today: exactly one pair.

---

## 6. Open finding, deliberately not fixed in this pass

**The tile's declared road and the composed junction's road disagree.**
`world.js` lays out spacing, runway, links and roadside content from
`specFor(tile.character)`; `compose`'s `roadFor` then draws its own
junction kind and ignores it.

Measured across 56 composed junctions: **15 match**, and for arterial
tiles, **0 of 13**. This is pre-existing W2 work surfaced by the route-match
check, and it is latent rather than live — no renderer consumes the world
yet — but it becomes a real defect the moment one draws a drive.

It is not folded in here because fixing it properly means deciding whether
a three-lane arterial junction is uncontrolled (`CHARACTER.arterial.control`
is `"none"` today, which would leave the candidate stopping at nothing) or
signalised. That is a road-design call worth stating on its own rather than
smuggling into an identity change.

The immediate symptom **is** fixed, correctly: a draw whose road lacks the
leg the route asked for is now refused rather than quietly re-seated onto
whichever leg it happened to draw. Route match went from 9/120 to **56/56**.

---

## 7. Planned, not built: the post-test debrief

*Jay's framing, recorded as the roadmap item he asked for.*

After the drive, the candidate's habits are **named and fed back** — and it
is the transition out of a test into the next level or task, rather than a
score screen.

It fits the architecture exactly as it stands:

- **the marking sheet is what the player recorded** — `detect.js` already
  holds marks, with timing and category;
- **the debrief is what was actually true** — `habitReport(candidate,
  scenes)` already returns `identifiable`, `glimpsed`, `hidden` and
  `ruledOut`, per trait, with the junctions each showing landed at;
- **the gap between them is the score** — which is what `scoreDetection`
  already computes.

Naming the driver's habits in the debrief is also **what teaches the player
what to watch for next time**, which is the part that makes it a transition
rather than a summary: the vocabulary you are handed at the end of one
drive is the vocabulary you take into the next.

Four things to settle when it is built, none of them blocking now:

1. **Is a habit named, or only its showings?** Naming `wideTurn` teaches
   the vocabulary; listing three moments teaches the eye. Probably both,
   in that order.
2. **What happens to `glimpsed` and `hidden`?** A trait the drive never
   gave a chance is not the player's failure and must not read as one —
   the same rule `detect.js` already lives under for unseen faults.
3. **Does a correctly ruled-out rival earn anything?** Deciding a driver
   does *not* cut corners is real observation, and 82 of them per drive are
   already being derived.
4. **Whose humour is it?** The candidates are sinful drivers in purgatory
   and the debrief is the obvious place for that voice. The standards they
   are measured against still cannot be funny.

---

## 8. What must not regress

- **One driver, every scene.** Junctions *and* segments. Checked over 98
  scenes on 8 drives.
- **The route is the route.** The composed junction matches the plan's
  `(entry, intent)`, 56/56.
- **A tell is true of the car.** `overshoot` and `slowStart` stay silent on
  a driver who never stops, and still show on one who does.
- **A clean driver stays clean.** 16% of candidates carry nothing, and
  commit nothing across 59 scenes — so "there is always something" is not
  the winning assumption.
- **A claimed chance is a real one.** All 79 chances a scene claimed
  produce a real fault when the habit is fitted. This is `faults.js`'s own
  rule turned around: a fault that survives its cause being removed was
  never derived from it, and a *chance* that produces nothing when the
  cause is present was never a chance.
