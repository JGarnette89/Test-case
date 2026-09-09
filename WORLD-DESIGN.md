# The continuous world

Status: **design, not built.** Written 2 Sep 2026 against commit `10c564c`.
No application code changed for this document.

Companion to `EXAMINER-REDESIGN.md`, which this unblocks. The redesign's
stage 2 gate failed because a single intersection is too compact for the
viewport to be scarce; this describes the world that makes it pass.

**The acceptance test is already written.** `tools/gate-viewport.mjs` is the
definition of done for the first increment. Everything below is designed
toward that measurement rather than toward openness in the abstract.

---

## 1. The target, stated as a number

The gate needs job-versus-job separation to exceed what one frame holds.

| Quantity | Value | Where it comes from |
|---|---|---|
| Approach a turn needs to be directable | 5.5 s | `runwayNeeded()` — hear (1.0) + signal (2.5) + slow (2.0) |
| At 41 km/h (`V_STRAIGHT`) | **≈ 63 m** | derived |
| Frame width at a 4 s look-ahead | **≈ 57 m** | measured, `gate-viewport.mjs` |
| Widest fault separation today | 35.8 m | measured, current content |

So **intersection spacing is the design variable**, and the band is narrow at
both ends:

- **Below ~63 m** the intersection cannot be directed at all, and the gate fails
  exactly as it does now.
- **Above ~150 m** the drive is mostly empty road, which fails the assessment
  requirement — nothing to mark for long stretches.

**Tiles declare RUNWAY, never spacing** — ruled after W1, and the evidence
is in §12. Spacing is a proxy that happens to correlate; runway is the
quantity the game depends on, and the two diverge in three separate ways:

- the previous intersection's traverse consumes distance reaching its exit
- a wider intersection's stop line sits further back, so the same spacing
  delivers less runway
- a faster road *needs* more runway, because `runwayNeeded` is in seconds
  and distance is seconds × speed

Spacing is derived from the declared runway by the planner
(`spacingForRunway`) and never authored. `verify-tiles.mjs` holds every tile
to its declaration against measured geometry.

A layout that does not produce that separation is a layout that does not
serve the game, and should be rejected by the planner rather than shipped.

---

## 2. The central question, answered with evidence

> Does the existing intersection generator become the hazard-authoring layer
> beneath a new road network, or do its assumptions make that impossible?

**It does, and the evidence is stronger than I expected.**

### 2.1 A composed scenario is already coordinate-free

Dumping a real `composeScenario` draw and walking every field:

```
fields describing a road user: from, intent, arriveAt, stops, colorKey
raw x/y anywhere in the draw:  NONE
```

The generator never touches geometry. It picks a **leg**, an **intent**,
**arrival times** and a **road spec**; `movementOf` derives coordinates
downstream. That is exactly the shape a hazard-authoring layer needs: a
intersection-local description that can be instantiated anywhere.

### 2.2 Intersection geometry is already origin-agnostic

`road.js` takes the intersection origin as a parameter and was verified to
translate exactly:

| Origin | S-leg stop point | Offset from origin |
|---|---|---|
| 360, 360 | 396, 522 | **36, 162** |
| 1360, 360 | 1396, 522 | **36, 162** |
| 4000, 2500 | 4036, 2662 | **36, 162** |

Identical offsets, identical rotation. The fixed origin is **three lines in
`index.js`** — `stopFor`, `exitFor` and `crossingOf` pass the module-level
`CX`/`CY` — not an architectural assumption.

### 2.3 Three assumptions that DO have to break

1. **Exits go off-board, not to the next intersection.** `exitPoint('N', …)` from
   a intersection at 360,360 returns **396, −80** on a 720×720 board. In a world
   an exit is an entry to the next intersection, or the start of a link segment.
   This is the single biggest change to existing geometry.

2. **`compose()` hardcodes `egoStops = true`.** Every draw is built around
   "the ego holds, then goes". A continuous drive passes through intersections
   without stopping — priority roads, green signals, straight-on at a give
   way. The generator needs a non-stopping mode, and `measure()`/`meetsBrief`
   need to accept draws whose `think` time is zero because there was nothing
   to think about.

3. **It is far too slow to run on a frame, and it can fail.**

   | Brief | Average | Worst | Null draws |
   |---|---|---|---|
   | light / open | 13.9 ms | 50 ms | 0/41 |
   | busy / open | 89.4 ms | 583 ms | 0/41 |
   | busy / restricted | 145.1 ms | 627 ms | 0/41 |
   | heavy / open | 466.2 ms | 979 ms | **9/41** |
   | heavy / restricted | 289.6 ms | 1052 ms | 0/41 |

   Worst single compose: **1052 ms**. The approach budget is 5.5 s, so
   just-in-time generation is *feasible in wall-clock terms* — but it cannot
   run synchronously on the frame that needs it, and `heavy` briefs return
   nothing about a fifth of the time.

   **Design consequence:** intersections are composed **ahead of the car into a
   buffer**, at least two intersections deep, with a cheap fallback brief when a
   draw fails. Never on demand at the intersection itself.

### 2.4 Verdict

**Network defines topology and road character; the generator populates the
approaching intersection just in time, from a buffer.** The generator needs a
non-stopping mode and the exits need to lead somewhere, and neither is deep
surgery. Its safety audit (`windowIsSafe`, the grace-and-creep sweep) comes
along unchanged, which is the part that would have been expensive to rebuild.

---

## 3. Authoring: hand-authored vs generated vs hybrid

| Approach | For | Against |
|---|---|---|
| **Hand-authored map** | Spacing and character guaranteed; hazards placeable with intent; every drive verifiable | Finite. An assessment game needs unbounded drives, and 18 situations took months |
| **Fully generated map** | Unbounded | The gate is a *layout* property. A generated network would have to be searched and re-verified for spacing every time, and the generator is already 14–466 ms per intersection — a whole network per drive is not affordable |
| **Authored tiles, generated route, generated traffic** | Spacing guaranteed by construction; character designed; route unbounded; traffic already solved | A tile library is content work, and tile seams need care |

**Recommendation: authored tiles, generated route, generated traffic.**

A small library of hand-authored **blocks** — a residential crossroads, a
collector T, an arterial signalled intersection, each with declared character and
a declared exit spacing — assembled by a seeded planner into an unbounded
route, with `composeScenario` populating each intersection's traffic as the car
approaches.

That gives the gate for free: **if every tile declares a spacing inside the
65–140 m band, every route satisfies it by construction**, and the planner
never needs to search for a layout that works. It also matches the
codebase's own rule that content is data rather than code.

---

## 4. Road character in the representation

The requirement is that character is expressed, not painted on. Today
`road.js` describes **intersections only** — `{ legs: { N/S/E/W: { lanes,
control } } }`. There is no representation of the road *between* intersections at
all, and that is the gap.

Proposed addition, a **segment**:

```
{ character, lanes, speed, length, curbside }
```

`character` is the load-bearing field, and four things read it:

| Character | Lanes | Speed | Intersection control | What the generator is asked for | Curbside |
|---|---|---|---|---|---|
| `residential` | 1 | ~30 km/h | stop / uncontrolled | light traffic, pedestrians, parked cars | dense parking, hedges |
| `collector` | 1 | ~41 km/h | stop / give way | busy, mixed | intermittent parking |
| `arterial` | 2–3 | ~50 km/h | signals | heavy, higher speed | none; buildings set back |
| `dual` | 2–3 each way | ~60 km/h | grade-separated / signals | heavy, no pedestrians | barriers |

Four consumers, which is what makes it representation rather than paint:

- **the generator** takes character as a brief bias — `residential` maps to
  `traffic: light` plus a raised pedestrian rate, `arterial` to `heavy`
- **the hazards** differ in kind, not just density — a door opening between
  parked cars is a residential hazard and cannot occur on a dual carriageway
- **the directing task** reads it: a turn out of a residential street needs
  less approach than one across an arterial, because `runwayNeeded` scales
  with the speed the segment carries
- **occlusion** comes from `curbside`, per §6

`V_STRAIGHT` and friends are currently module constants in `index.js`. Making
speed a segment property is the change that makes character real, and it
will move every window on every generated intersection — deliberately, and it
must not touch the shipped scenarios' golden.

---

## 5. Hazard pacing: how a steady supply is guaranteed

The world exists for assessment, so pacing is the governing constraint. Two
failure modes, both real, and the design has to exclude both:

- **A dead stretch.** Ninety seconds with nothing to mark.
- **A pile-up.** Incidents so dense the drive stops being plausible.

### 5.1 The supply, counted

At 65–140 m spacing the car meets a intersection every **5.7–12.3 s**. If every
intersection carries a composed situation, that alone is one assessable event
every dozen seconds at worst. Between intersections, segment hazards drawn from
`curbside` and `character` fill the gaps.

### 5.2 The guarantee: a pacing budget in the planner

Counting is not guaranteeing. The planner carries a running **time since the
last markable event** and steers the next choice:

- if the gap is approaching the ceiling, the next intersection is composed with a
  brief that is *required* to yield at least one derivable fault, and the
  draw is rejected until it does — the same accept/reject loop
  `composeScenario` already runs, with an added condition
- if events have come too close together, the next intersection is composed
  clean, and a longer segment is chosen

Two constants, both tunable and both playtest questions rather than derived:
a **ceiling** on the dead-air gap and a **floor** on the spacing between
critical events.

### 5.3 It is measurable, so it gets a check

`verify-world.mjs`: generate long routes at many seeds and assert that the
maximum gap between markable events never exceeds the ceiling, and that
critical events never breach the floor. That is a property of the planner and
is exactly the kind of thing this project already verifies.

---

## 6. Roadside content: liveliness and occlusion are the same thing

**The point the tile format should be built around.** The props that make the
world feel alive are the *same props* that block sightlines. A residential
street thick with parked cars, hedges and wheelie bins is both the liveliest
street and the hardest one to examine on. An open dual carriageway is the
emptiest and the easiest.

So **environmental density is not decoration. It is the occlusion budget and
the difficulty dial, and they are one number.** That difference has to fall
out of a tile's declared content rather than being tuned as a separate
difficulty setting — if they are two knobs they will drift, and a tile will
end up looking busy while playing easy, or the reverse.

### 6.1 Roadside content is first-class in the tile format

Not a decoration list the renderer scatters. A declared, parameterised part
of the tile that the engine reads:

```
segment: {
  character,           // residential | collector | arterial | dual
  lanes, speed, length,
  curbside: {
    density,           // 0..1 — the dial
    kinds,             // parked, hedge, wall, building, furniture, works
    activity,          // 0..1 — how much of it is animate
  }
}
```

`density` generates the blockers; `activity` generates the pedestrians,
cyclists and doors-opening that make the same props *move*. One tile
declaration produces both the look and the difficulty, because they are the
same content.

### 6.2 How density varies with character

| Character | Curbside density | Typical kinds | Effect on examining |
|---|---|---|---|
| `residential` | 0.7–0.9 | parked cars both sides, hedges, low walls, bins | Hardest. Sightlines are short, hazards emerge from between parked cars, a intersection is blind until you are almost in it. |
| `collector` | 0.4–0.6 | intermittent parking, shopfronts, street furniture | Middling. Enough cover to hide one thing at a time. |
| `arterial` | 0.15–0.3 | buildings set back, signage, bus shelters | Easier. Long sightlines; difficulty comes from speed and traffic volume instead. |
| `dual` | 0.0–0.1 | barriers, gantries | Easiest to see, hardest to react — the difficulty moves entirely into speed. |

The inversion at the bottom of that table is the interesting part: **as
occlusion falls, speed rises**, so difficulty does not simply decrease along
the row — it changes *kind*. A residential street is a seeing problem; a dual
carriageway is a timing problem. That gives the world genuine variety of
assessment rather than one difficulty slider.

### 6.3 How it feeds `whatEgoSees`

Directly, and with no new mechanism. `curbside` content is emitted as
ordinary `sightBlockers` — `{ x, y, rot, hl, hw }` — which is exactly what
`sightBlockersOf` already reads and `visibility` already tests against.

The cost is the thing to watch, because density is now a dial that a tile can
turn up. `visibility` tests each target's five sample points against every
blocker, so cost is linear in blocker count per target and the O(n²) actor
pass sits on top of it. The §7.4 culling rule therefore has to apply to
blockers as well as actors: **only blockers within sight range of the eye can
occlude anything**, and a residential tile at density 0.9 will put a lot of
them just outside it.

That gives a checkable property for `verify-world.mjs`: culled visibility
must equal unculled visibility for every target inside sight range, at the
highest density any tile declares.

### 6.4 Where pedestrians fit, and the blocker that dissolves

Pedestrians were held up on making crossing position **relative to the
approach** rather than pinned to coordinates. Reading the code, that half is
already done: `crossingOf(side, spec)` derives the crossing from the actor's
own leg and from the intersection box, with no reference to a fixed north leg —
which is what already lets `walker` rotate to all four approaches.

What remains is the *same* pin as everything else in §2.2: the crossing is
built around the module-level `CX`/`CY`. So **the original blocker dissolves
for exactly the reason the rest of the world work does** — thread the
intersection origin through `crossingOf` alongside `stopFor` and `exitFor`, and a
crossing is placed wherever its intersection is. It is one of the same three
lines, not separate work.

That makes pedestrians ordinary world content rather than a special case:

- **at intersections** — crossings, derived per leg, placed with the intersection
- **along segments** — from `curbside.activity`, stepping out between the
  parked cars that `curbside.density` put there

The second is the one that matters for assessment, and it is only possible
because the props and the pedestrians come from the same tile declaration:
a pedestrian emerging from behind a parked car is a hazard *because* the car
was there to hide them.

### 6.5 The rest of the occlusion story

These become ordinary `sightBlockers` — the same data `sightBlockersOf`
already reads and `visibility` already tests.

**The world removes the constraint that made blockers awkward.** Today
`isRotatable` refuses any scenario with `sightBlockers`, because a blocker is
fixed x/y authored for one approach and rotation would leave it planted while
the road turned around it. In a world, intersections are *placed* facing the
right way rather than rotated into position, so blockers are simply world
objects at world coordinates and the problem does not arise. `unprotected`
and `boss-blind-rush` keep working as built for scenario play.

The fairness constraint from the redesign applies unchanged and is the
renderer's obligation: hidden must be **drawn as hidden**, with the umbra
making the reason legible.

---

## 7. What breaks when scenes stop being self-contained

### 7.1 Simulation must stay intersection-local — hard constraint

`simulate()` is O(n²): 0.15 ms at 1 road user, 14.7 ms at 16, **42.4 ms at
32**. A world-scale simulate is not affordable at any traffic density worth
having.

**So the world never simulates globally.** The approaching intersection is
simulated as a scenario, exactly as today; traffic elsewhere is presentation
with no conflict resolution. `legalAt` stays intersection-local and keeps its
meaning. This is a constraint on the design, not a defect — and it is what
lets the entire existing engine come along unchanged.

### 7.2 `route.js` — mostly survives, one part becomes redundant

| Symbol | Fate |
|---|---|
| `planRoute`, `currentLeg`, `recordLeg`, `startRun`, `summary` | **Keep.** Sequencing and tallying is what a world route needs. |
| `entrySideAfter`, `exitHeading` | **Keep and promote.** Deriving where an intent leaves you is how the planner picks the next tile. |
| `rotateScenario`, `alignScenario`, `isRotatable` | **Redundant for world play.** Intersections are placed facing the right way; nothing needs rotating into alignment. Still used by the roguelike Checkride, so they stay, but the world does not call them. |

### 7.3 Scoring

Mostly already handled by the redesign: sections are intersections, and
`poseAt(ego, t).gone` marks the boundary. The new work is that a world drive
has **no end** — the sheet accumulates per section indefinitely, which
`addToSheet` in `actions.js` already models.

The genuine new problem is **the clock**. Scenarios use a local clock
starting near zero; a world needs a global clock with intersection-local offsets.
`arriveAt`/`departAt` become "relative to when this intersection activates".

### 7.4 `whatEgoSees` — needs culling, and the numbers say how much

| Road users | `whatEgoSees()` | Share of a 60 Hz frame |
|---|---|---|
| 4 | 0.008 ms | 0.0% |
| 12 | 0.058 ms | 0.3% |
| 30 | 0.288 ms | 1.7% |
| 60 | 0.942 ms | 5.7% |
| 120 | 3.302 ms | 19.8% |

It is O(n²) — every actor is tested against every other as a potential
blocker. Fine for a intersection, not for a world.

**Fix: cull by distance before the visibility pass.** An actor beyond sight
range cannot be seen and cannot block anything relevant. Culling to the
~12 road users in the current neighbourhood puts the cost back at 0.058 ms,
a 57× saving, and it is a pure optimisation — the answer for anything within
range is identical, which makes it verifiable against the unculled result.

### 7.5 Verification tooling

| Check | Effect |
|---|---|
| `verify-windows`, `verify-turns`, `verify-wontstop`, `verify-events`, `verify-sight`, `verify-task`, `verify-scoring` | **Unaffected.** They test the intersection layer, which does not change. |
| `verify-equivalence` | **Unaffected while intersection behaviour is unchanged.** If segment speeds replace `V_STRAIGHT` for generated roads, the shipped scenarios must keep their current speeds or the golden moves — and if it moves, something is wrong. |
| `verify-route` | Extend: routes assembled from tiles must be continuous and directable. |
| `verify-camera` | Extend with the framing checks that moved out of `verify-faults`. |
| `gate-viewport` | **The acceptance test.** Becomes a real check once it passes. |
| `verify-world` (new) | Pacing budget, intersection spacing band, tile seams, cull-equals-uncull. |

---

## 8. Staging, smallest provable increment first

### Stage W1 — Two intersections and a road between them. **The gate.**

The smallest thing that can make `gate-viewport.mjs` pass.

- Thread a intersection origin through `stopFor` / `exitFor` / `crossingOf` so a
  intersection can be built anywhere (three lines, already proven translatable).
- Make an exit lead to the next intersection rather than off-board.
- Place exactly two intersections **~80 m apart** on one straight road, with the
  candidate driving through both, and a fault at each.
- Run the gate.

**Provable:** `gate-viewport.mjs` passes — job-versus-job separation exceeds
one frame. Nothing else in the suite moves; the golden is untouched, because
no shipped scenario's behaviour changes.

If it does not pass at 80 m, the spacing band in §1 is wrong and the design
comes back here before anything else is built.

### Stage W2 — Segments and character
The segment model, character-driven speed and lanes, and a tile library of
three or four blocks. Route assembly from tiles.

**Provable:** every assembled route has intersection spacing inside the band; a
residential and an arterial segment produce measurably different traffic,
speed and approach requirements.

### Stage W3 — Roadside content: liveliness and occlusion together
`curbside` generation from character — density, kinds and activity — emitted
as ordinary world blockers and as pedestrians. Crossings placed with their
intersections once the origin is threaded (§6.4).

**Provable:** density measurably tracks character; a residential tile is
measurably harder to see out of than an arterial one, through `whatEgoSees`
rather than through a difficulty setting; and a route nobody hand-authored
produces genuine occlusion at a target rate.

### Stage W4 — Pacing
The planner's pacing budget and `verify-world.mjs`.

**Provable:** across many seeded long routes, the maximum gap between
markable events never exceeds the ceiling.

### Stage W5 — Streaming and culling
Distance culling for visibility, intersection buffering ahead of the car,
retirement behind it.

**Provable:** culled visibility equals unculled visibility within sight
range; a long drive holds frame budget.

Then, and only then, `EXAMINER-REDESIGN.md` stages 3–5 resume.

---

## 9. Open questions

1. **Speed as a segment property moves every generated window.** Deliberate,
   but the shipped scenarios must keep their current speeds or
   `verify-equivalence` will fail. Confirm that split is acceptable.
2. **How long is a drive?** Sections accumulate indefinitely; something has
   to end the test. Distance, time, number of intersections, or a scripted route.
3. **Pacing constants** — the dead-air ceiling and the critical-event floor
   are playtest questions, like section length in the redesign.

---

## 10. Rulings

### 10.1 The grid is chosen, not inherited

**Ruled: the world is an axis-aligned grid, deliberately.** `LEG` stays
discrete — four fixed compass entries — and there are no continuous bends or
diagonal roads. This is recorded as a design constraint rather than a
limitation of `road.js`, so that nobody later "fixes" it.

What follows from it:

- Intersection placement is on a lattice, which is what makes tile assembly and
  the spacing guarantee (§1) trivially checkable.
- `RIGHT_OF` and `OPPOSITE` stay valid everywhere, so right-of-way
  resolution needs no generalisation.
- **Roundabouts will need explicit handling when their turn comes.** They
  already have their own layout and their own path builder (`raPath`), and
  they do not fit the lattice — a roundabout is a intersection whose exits leave
  at angles the grid does not have. Not a problem for the world as designed;
  a known piece of work, flagged now rather than discovered.

### 10.2 Richness goes into the environment, not the topology

**Jay's priority, and it should shape the tile format:** *"as long as we can
make it feel alive and full on and off the road that's worth more than making
the road itself complicated."*

Simple roads, dense surroundings. This is not only an art direction, it is
the load-bearing insight for the whole difficulty model — see §6, which is
rewritten around it.

---

## 11. W1 result — the gate PASSES, and it corrected the design

Built and measured 2 Sep 2026. `src/engine/world.js`, the intersection origin
threaded through `stopFor` / `exitFor` / `crossingOf`, and `frameAround`
factored out of `chaseFor` so the world frames a candidate identically
whether it is inside a intersection or on the road between two.

Two intersections, a fault at each, the candidate driven straight through the
first and directed to turn at the second. At the instruction deadline:

| Spacing | Runway available | Candidate in frame | Intersection in frame | Verdict |
|---|---|---|---|---|
| 65 m | 43 m | — | — | not directable |
| 75 m | 53 m | — | — | not directable |
| 80 m | 58 m | — | — | not directable |
| **85 m** | **63 m** | yes | **no** | **PASSES** (superseded, see §12.4) |
| 100 m | 63 m | yes | no | passes |
| 140 m | 63 m | yes | no | passes |
| 160 m | 63 m | yes | no | passes |

**The gate passes from 85 m upward.** The candidate and the intersection it must
be directed through are in different places, and one frame cannot hold both.
The mechanic the whole redesign rests on exists.

### What the measurement corrected

**Centre-to-centre spacing is not the runway.** §1 originally set the band at
65–140 m by dividing 63 m of required approach by nothing at all. In fact the
previous intersection's own traverse consumes about **22 m** reaching its exit
point, so:

> runway ≈ spacing − 22 m

Designing to 63 m of runway therefore needs **85 m** of spacing. The band is
85–140 m, and a tile library built to the old number would have produced a
world where no intersection could be directed — the failure would have surfaced
only once directions were wired up, several stages later.

### Two modelling errors the gate caught on the way

Both are recorded because both would have been invisible without a
measurement aimed at a number.

1. **The link started at the wrong end.** Joining intersection A's *stop line* to
   intersection B's left only 22 m of runway out of 80 m, because it placed the
   candidate 8 m behind a intersection it had already driven through. The link
   must run from A's **exit** to B's entry — which is design assumption
   §2.3.1 biting exactly where it was predicted to.
2. **The next intersection must be placed along the heading the candidate
   actually leaves on**, not blindly ahead. Placing a intersection north of one
   where the candidate turns west produces a diagonal link, which the grid
   (§10.1) does not have. `placeIntersections` now reads each leg's intent.

A third, smaller: `exitPoint` returns a position with no heading, and
`poseOn` reads `from.rot` for a straight path — so the link produced an
undefined rotation and every frame built on it came out `NaN`.

### State

Twenty checks passing. `engine-golden.json` untouched — no shipped
scenario's behaviour changed, which is the evidence that threading the
intersection origin was additive rather than a rewrite.

---

## 12. W2 result — tiles, road character and roadside life

Built and measured 2 Sep 2026. `src/engine/tiles.js`, runway-first placement
in `world.js`, and `tools/verify-tiles.mjs` as the twenty-first check.

### 12.1 Tiles declare runway, and the check holds them to it

Every tile is verified against measured geometry **for every tile that could
precede it**, because what the previous intersection consumes depends on *its*
width rather than on the tile making the promise. Sixteen pairings, all
delivering the declared runway to within 0.4 m.

| Tile | Character | Speed | Declares | A turn needs |
|---|---|---|---|---|
| `res-quiet` | residential | 30 km/h | 55 m | 45.7 m |
| `res-busy` | residential | 30 km/h | 60 m | 45.7 m |
| `coll-standard` | collector | 41 km/h | 72 m | 63.3 m |
| `art-main` | arterial | 50 km/h | 88 m | 76.5 m |

### 12.2 The arterial squeeze, measured

The reason a single spacing band could never have worked. At a fixed 100 m
spacing, runway **delivered** falls with width — 69.9 m at one lane, 66.3 m
at two, 62.7 m at three — while runway **needed** rises with speed: 46 m
residential, 63 m collector, 76 m arterial.

So an arterial is squeezed from both ends, and at 100 m spacing it is not
directable at all. Declaring runway is what makes that impossible to ship by
accident.

### 12.3 Density is the occlusion budget and the difficulty dial

One declaration produces the props and the people, so the street that feels
most lived-in is the one that hides the most. Measured through `visibility`
across 40 seeds, sighting the people the tile itself placed at the curb:

| Tile | Props per 100 m | People hidden by props |
|---|---|---|
| `res-quiet` | 27 | **94%** |
| `res-busy` | 28 | **94%** |
| `coll-standard` | 18 | 81% |
| `art-main` | 4.5 | **18%** |

**The inversion holds and is now asserted.** Density falls as speed rises, so
difficulty changes kind rather than degree: a residential street is a seeing
problem, an arterial is a timing problem. An author could break that quietly
by making a fast road cluttered, so `verify-tiles.mjs` fails if they do.

### 12.4 Three modelling errors the checks caught

All three are the same error in different clothes — a proxy standing in for
the quantity that matters — and none would have been visible without a
measurement aimed at a number.

1. **`exitPoint` does not translate.** It computes its far edge from the
   720×720 *board*, not from the intersection origin, so a intersection placed
   anywhere but the board centre gets an exit in the wrong place entirely.
   W1 passed only because its first intersection sat at the centre. Fixed with
   `worldExitOf`, which is intersection-relative and scales with the intersection's
   own box — deliberately *not* a change to `exitPoint`, since moving the
   scenario exit would change every traverse length in `engine-golden`.
2. **`runwayFor` used the drive's spec for every intersection's stop line.** A
   drive mixing widths mismeasured by the setback difference — 7.2 m between
   one lane and three, enough to turn a directable tile into a failing one.
   It now reads the spec of the intersection being approached.
3. **The occlusion check sighted along the centreline**, where the curb is
   never between eye and target, and reported 0% blocked for every tile. The
   props sit at the curb, so the sightline has to go there — which is also
   the case the design turns on: a pedestrian is hidden because the parked
   car that makes the street feel alive is in the way.

### 12.5 Pedestrians

Folded in rather than deferred. `roadsideLifeFor` draws people from the same
`curbside` declaration that places the props, which is the point — someone
stepping out between parked cars is a hazard *because* the cars were there to
hide them. Intersection crossings need only the origin threading W1 already did
(§6.4).

### 12.6 State

Twenty-one checks passing, `gate-viewport` still passing across the band,
`engine-golden.json` untouched.

### 12.7 What W2 did not do

Held back deliberately, and still open: the route planner that assembles
tiles into an unbounded drive, the pacing budget (§5.2) and its
`verify-world.mjs`, and the distance culling in §7.4 — which matters more now
that a residential tile puts 28 blockers per 100 m in front of an O(n²)
visibility pass.

### 12.8 The threshold moved when the exit was fixed

W1 measured the minimum spacing at **85 m**. That number was produced by the
board-relative `exitPoint`, which charged a flat 22.1 m to every intersection
regardless of width. With `worldExitOf` the consumption is intersection-relative
and scales properly:

| Lanes | Old (board-relative) | New (intersection-relative) |
|---|---|---|
| 1 | 22.1 m | 7.8 m |
| 2 | 22.1 m | 11.3 m |
| 3 | 22.1 m | 14.9 m |

Re-measured, the minimum spacing for a one-lane road is **78 m**, not 85 m,
and the arithmetic now closes: 63.3 m of runway + 7.8 m consumed leaving +
8.1 m of stop-line setback = 79.2 m, against a measured 78 m at the sweep's
2 m granularity.

The gate and `verify-tiles.mjs` now share one implementation of runway
(`runwayFor`). They previously measured it twice, which is the same drift
risk that produced every error in §12.4 — and the threshold shifting by 7 m
under a geometry fix is exactly the kind of thing two implementations would
have disagreed about silently.

**W1's conclusion stands and is now measured on a correct model:** the
viewport is scarce, and the two examiner jobs cannot be held in one frame.
