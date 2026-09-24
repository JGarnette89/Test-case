# The driving school: scope, what the architecture already gives, and what it does not

*Written before any of it is built, so the two cheap tests at the end can
be run first. Companion to REBUILD.md; assumes its stages 0–3 as the
foundation.*

---

## 1. The idea

The maintainer is considering the game's larger shape: **the player runs
a driving school and improves the driving of a whole town over time,
progressing through towns as worlds.** The examiner game as built — one
candidate, one course, mark what you saw — becomes one act inside it: the
diagnostic step of a lesson, not the point of the game.

This document records what that costs against the foundation that now
exists, and what has to be decided before it is worth a line of code.

---

## 2. What the architecture already supports, and why that is not obvious

**The structural decision that makes this possible at all was made at
stage 0 of the rebuild and has nothing to do with driving schools:**
every car in the world is the same driver model, and the candidate is
one of them. `driver(road, seed, n, ratings)` derives everything a car
does — its wanted speed, the gap it keeps, how hard it plans on braking,
whether it rolls a stop sign, how steadily it holds a line, and now how
far behind the world it perceives — from **five ratings** (observation,
confidence, steering, braking, knowledge). Traffic draws its five from a
distribution; a candidate is handed theirs; both go through the one
function. There is no separate NPC model, no scripted traffic, no
authored "the red car turns left at 3.4s".

**So improving a town means moving ratings.** Raise the town's knowledge
and fewer cars roll their stops; raise its confidence toward the optimum
and the queues close up without tailgating and the timid stop dithering;
raise steering and the weave settles. **Traffic changes because the model
changed, not because scenes were re-authored.** Nothing has to be
rewritten for a town to get better or worse; the same course, the same
seed, a different population, and every interaction on it comes out
different — measured already, in the stage 2 checks that put the same
candidate through the same traffic with one rating changed and watched
the drive move.

**In the old engine this would have been impossible**, and it is worth
saying plainly why. There, every road user's motion was resolved before
the drive began: arrival times and intents were data in a scenario file,
`schedule()` decided every departure in advance, and traits were authored
per car per scene. "The town gets better" would have meant rewriting the
scenario data by hand, and the traffic still would not have reacted to
anything, because it never read another car while moving. The stepped
simulation was built because the maintainer said the old traffic did not
interact; the same property is what lets a population's disposition be a
number that moves.

**A second thing already in place: the load model shows ratings can be
modulated live.** `underLoad` reads what a candidate is carrying every
tick and amplifies the deficit on each axis, bounded by what bounded it
unloaded. A lesson that moves a rating by a delta is the same shape of
change in the opposite direction, so "learning" is not a new kind of
thing the model has to be taught to do; it is a stored delta instead of a
transient one.

**And density is already a dial.** Traffic enters the world at the course
edges at a spawn interval, weighted toward through roads. A town's
busyness is one number per road character.

---

## 3. Towns are distributions, not drivers — the maintainer's addition

The maintainer's strongest addition, and the one that changes the design
rather than decorating it: **towns are thematically bad in different
ways, and get worse as the game goes on.** His reasoning, recorded
because it is the argument for the whole structure: difficulty that
comes only from degrading the tested driver makes every drive feel the
same, because the environment is constant. A town with a character —
everywhere tailgates here, nobody signals there, this one rolls every
stop — means the same candidate feels different in different places, and
**the player is learning a place rather than a person.**

**The structural point: a town is a DISTRIBUTION OVER THE FIVE AXES, not
a single driver.** The axes already exist and every car already draws
its behaviour from them, so a thematic town costs almost nothing beyond
persistence. A town profile is:

- a bias per axis — a mean and a spread, or a tail weight — for
  observation, confidence (two-tailed: a timid town and a bold town are
  different places), steering, braking and knowledge;
- a density: how often a car arrives on each character of road;
- a mix of places: how many all-way stops, how many two-way, how much of
  the road bends, later how many signals;
- a baseline the town starts from and a ceiling the school can raise it
  to.

In those terms the maintainer's examples are cheap:

| the town's character | what it is, in the model |
|---|---|
| everywhere tailgates | confidence biased bold: shorter chosen headways, tighter gaps taken |
| this one rolls every stop | knowledge biased low: the rolling-stop threshold is crossed by most of the population |
| nobody holds a line | steering biased low: the weave near its ceiling everywhere, the wide line on every bend |
| everyone leaves it late | braking biased low: the whole town plans on a rate near abrupt |
| nobody is looking | observation biased low: gaps taken a second tighter than they look, once perception is on |
| nobody signals | **not yet expressible** — the rebuild's driver model has no turn-signal behaviour; the old engine's `lateSignal`/`noSignal` traits did not come across. It needs a signalling axis or a knowledge expression before a town can be bad at it |

**It also answers the difficulty problem that was raised against the
school idea.** If the town improves, the game gets quieter, and the
player is deleting their own content. With each world a new town that
has its own character and its own worse baseline, **difficulty refills by
moving rather than by degrading individuals**: a sleepy rural town first,
a hectic city by the fifth world. The player's candidates do not have to
get worse for the game to get harder; the place around them does.

**Other variables the maintainer listed**, recorded with their honest
cost today:

- **weather and time of day** — renderer-only today; nothing in the model
  reads them. They would matter to the model through observation
  (visibility and reaction) once perception is live, and through the
  bend and braking through grip — neither is built.
- **special vehicles, for traffic or for the applicant** — the world has
  one vehicle size (4.5 × 1.8 m) and one behaviour model per rating set.
  A truck or a bus is a footprint and a set of dynamics (slower, longer,
  needs more gap), which the following and gap models would take as
  parameters; nothing about the world's geometry assumes a car except
  the driveway clearance and the weave room.
- **the overriding priority: the traffic has to feel alive.** That is
  the whole thesis of the rebuild and the first test tomorrow (section
  6). None of the above matters if it fails.

---

## 4. What is missing

### 4.1 Persistence: a population

Drivers are drawn per drive and forgotten. `composeDriver(seed)` hands a
car its ratings from the seed and the car number, and the same seed
produces the same traffic — which is what every check relies on. A town
needs **a population**: a stored set of drivers with identities and
**mutable** ratings, from which the traffic on any drive is drawn and to
which a lesson's change is written back. Every candidate is a member of
it, and the traffic around a candidate is the rest of it.

What that touches: where a car's ratings come from (one call site,
`driver()`, already takes ratings as an argument — the seam is there), a
store, and a rule for how the population is sampled so that a drive is
still replayable from its seed plus the population's state at the time.
Determinism survives if the state is part of the seed.

### 4.2 A model of learning

Ratings are static. A school needs answers to:

- **What a lesson moves.** A lesson is a drive with a focus; the sheet
  says what was found. The obvious rule — the axis the lesson focused on
  moves, in proportion to how much of it the sheet caught — makes the
  examiner's marking accuracy the thing that teaches, which is the game
  loop closing on itself.
- **By how much, and with what ceiling.** A delta per lesson, a ceiling
  per driver; both numbers the maintainer picks, because "how fast can a
  person be taught to leave more room" is a claim about people.
- **Whether it decays.** A town left alone should drift back toward its
  character; otherwise a finished town is finished. A decay rate is a
  second number of his.
- **What cannot be taught.** Confidence is two-tailed and has an optimum
  a lesson can move toward; steering, braking and knowledge are
  monotonic and can only improve; observation is the axis the maintainer
  has called the biggest gap, and whether attention is teachable at all
  is his to say.
- **Who learns.** Only the candidate in the car, or does a town's
  average move because its drivers are its candidates over time? The
  second is what "improve the driving of a whole town" means, and it
  needs the population above.

### 4.3 The player's verb changes: from judging to teaching

The examiner game's verb is *judge*: watch, mark, be graded on what you
caught. The school's verb is *teach*, and the marking sheet becomes the
**diagnostic step** — the thing that tells you what to work on — rather
than the score. What replaces the score is the town's aggregate: the
distribution moving. That needs a screen the game does not have (a town
view; who is in it; what changed), a lesson structure (pick a driver,
pick a focus, drive, read the sheet, apply), and a reason to come back
to a driver (the ceiling, the decay).

Nothing about the sheet has to change to become a diagnostic; it already
says which faults happened, which the examiner caught, and by
implication which axis. What changes is what is done with it.

### 4.4 Content the model does not have yet

Signalling (above); signals as a control; pedestrians as road users in
the sim; hazards on the links (parked cars, driveways, emerging
vehicles — all built in the old engine's world layer, none yet in the
stepped one); contact as a state the game responds to (stage 5), which
the perception axis waits on. A town that is bad at observation needs
that last one before it can be shown.

---

## 5. What it costs, in order

1. **Nothing, until the two tests in section 6 pass.**
2. Persistence: the population store and the sampling rule. Small.
3. A town profile as data — axis biases, density, place mix — and a
   course built from it. Small; the dials exist.
4. Learning: deltas, ceilings, decay, and the maintainer's answers to
   4.2. Medium, and mostly rulings rather than code.
5. The teaching loop and the town screen. The largest piece; it is a new
   game around the existing one.
6. Signalling, hazards on links, contact, special vehicles — each its
   own increment, each already scoped elsewhere.

---

## 6. The two cheap falsification tests — run these first

Both decide the whole direction and both are available before any of it
is built. Both are questions for a person's eyes, not for a check: the
numeric checks already show the axes separate (a ragged driver strays
0.38 m against a sound one's 0.04 m; a hesitant one waits 2.4× as long
at a two-way stop), but a number that separates is not a thing a player
can see.

**Test 1 — can a player tell two drivers apart by watching?**
`#/candidates` exists for exactly this: two candidates, the same seeded
traffic, the same route, the names hidden until you ask. Pick a pair,
watch, say which is which, then reveal. If a single rated driver is not
legible on screen, a town of them will not be, and no progression
structure rescues that. Known already, and part of what to look for: the
weave is invisible at the chase zoom (0.38 m is under a pixel there) and
is shown as a number instead; the wide line on a bend is the steering
axis's legible expression, and it only shows on right-hand bends.

**Test 2 — can a player tell two towns apart by watching?** Not built as
a screen, but cheap: a town profile is a ratings bias fed to the same
`driver()` call and a density, so two courses side by side — one drawn
bold-and-dense, one drawn timid-and-sparse — are a small change to the
seeding, not a new system. If two populations at opposite ends of an axis
do not read as different places, thematic towns are not worth building.

If both pass, the order in section 5 stands. If the first fails, the
work is on the renderer and the camera, not on the school.

## 7. The player's own driving, under the law -- recorded, not built

The maintainer, 23 September, thinking aloud rather than asking for
it: "the daytime phase of the game has a legal driving element to it
requiring the user to more or less obey the law or risk a penalty
(against whatever currency is affecting their overall progress, could
be money to upgrade their driving school or their schools reputation
for example)."

What it implies, so it is not lost:

- **Day and night phases.** Something happens by day that does not by
  night; what night is for is not said yet.
- **The school returns as the meta-layer.** Progress has a currency --
  money for the school, or its reputation -- and the player's own
  conduct on the road spends or earns it. That is this document's
  framing reconnected to the simulator, rather than a separate game.
- **It needs the law modelled, and most of that is the simulator's
  work already under way.** Signals, stop signs, right of way, posted
  speeds (SIMULATOR.md 1.1.6, 1.1.8): each is a rule the sim now
  enforces on its own traffic, and a player who breaks one is
  detectable by the same conditions. A red run is the HOLD state
  ignored; a rolling stop is a stop leg left without `stoppedAt`;
  speeding is the posted limit on the leg.
- **It scores the player with the machinery that assesses candidates.**
  The five axes and the fault vocabulary were built to mark somebody
  else's driving, and nothing in them cares whose car it is (CLAUDE.md:
  "the candidate is just a participant"). The player becomes a driver
  who is also being examined -- which is a strong reason the assessment
  machinery is shelved rather than deleted (SIMULATOR.md 2.2).

Open, and the maintainer's: what "more or less" obeying means (a
tolerance, or discretion by a police presence that has to see it);
whether a penalty is per offence or per pattern; and what the night
phase is.
