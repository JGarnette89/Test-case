# The continuous world

Status: **design, not built.** Written 2 Sep 2026 against commit `10c564c`.
No application code changed for this document.

Companion to `EXAMINER-REDESIGN.md`, which this unblocks. The redesign's
stage 2 gate failed because a single junction is too compact for the
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

So **junction spacing is the design variable**, and the band is narrow at
both ends:

- **Below ~63 m** the junction cannot be directed at all, and the gate fails
  exactly as it does now.
- **Above ~150 m** the drive is mostly empty road, which fails the assessment
  requirement — nothing to mark for long stretches.

**Target spacing: 65–140 m**, which at 41 km/h is one junction every
**5.7–12.3 s**. That happens to be ordinary urban block spacing, which is a
useful sanity check rather than a coincidence: real streets are laid out at
the scale a driver can be given instructions on.

A layout that does not produce that separation is a layout that does not
serve the game, and should be rejected by the planner rather than shipped.

---

## 2. The central question, answered with evidence

> Does the existing junction generator become the hazard-authoring layer
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
junction-local description that can be instantiated anywhere.

### 2.2 Junction geometry is already origin-agnostic

`road.js` takes the junction origin as a parameter and was verified to
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

1. **Exits go off-board, not to the next junction.** `exitPoint('N', …)` from
   a junction at 360,360 returns **396, −80** on a 720×720 board. In a world
   an exit is an entry to the next junction, or the start of a link segment.
   This is the single biggest change to existing geometry.

2. **`compose()` hardcodes `egoStops = true`.** Every draw is built around
   "the ego holds, then goes". A continuous drive passes through junctions
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

   **Design consequence:** junctions are composed **ahead of the car into a
   buffer**, at least two junctions deep, with a cheap fallback brief when a
   draw fails. Never on demand at the junction itself.

### 2.4 Verdict

**Network defines topology and road character; the generator populates the
approaching junction just in time, from a buffer.** The generator needs a
non-stopping mode and the exits need to lead somewhere, and neither is deep
surgery. Its safety audit (`windowIsSafe`, the grace-and-creep sweep) comes
along unchanged, which is the part that would have been expensive to rebuild.

---

## 3. Authoring: hand-authored vs generated vs hybrid

| Approach | For | Against |
|---|---|---|
| **Hand-authored map** | Spacing and character guaranteed; hazards placeable with intent; every drive verifiable | Finite. An assessment game needs unbounded drives, and 18 situations took months |
| **Fully generated map** | Unbounded | The gate is a *layout* property. A generated network would have to be searched and re-verified for spacing every time, and the generator is already 14–466 ms per junction — a whole network per drive is not affordable |
| **Authored tiles, generated route, generated traffic** | Spacing guaranteed by construction; character designed; route unbounded; traffic already solved | A tile library is content work, and tile seams need care |

**Recommendation: authored tiles, generated route, generated traffic.**

A small library of hand-authored **blocks** — a residential crossroads, a
collector T, an arterial signalled junction, each with declared character and
a declared exit spacing — assembled by a seeded planner into an unbounded
route, with `composeScenario` populating each junction's traffic as the car
approaches.

That gives the gate for free: **if every tile declares a spacing inside the
65–140 m band, every route satisfies it by construction**, and the planner
never needs to search for a layout that works. It also matches the
codebase's own rule that content is data rather than code.

---

## 4. Road character in the representation

The requirement is that character is expressed, not painted on. Today
`road.js` describes **junctions only** — `{ legs: { N/S/E/W: { lanes,
control } } }`. There is no representation of the road *between* junctions at
all, and that is the gap.

Proposed addition, a **segment**:

```
{ character, lanes, speed, length, kerbside }
```

`character` is the load-bearing field, and four things read it:

| Character | Lanes | Speed | Junction control | What the generator is asked for | Kerbside |
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
- **occlusion** comes from `kerbside`, per §6

`V_STRAIGHT` and friends are currently module constants in `index.js`. Making
speed a segment property is the change that makes character real, and it
will move every window on every generated junction — deliberately, and it
must not touch the shipped scenarios' golden.

---

## 5. Hazard pacing: how a steady supply is guaranteed

The world exists for assessment, so pacing is the governing constraint. Two
failure modes, both real, and the design has to exclude both:

- **A dead stretch.** Ninety seconds with nothing to mark.
- **A pile-up.** Incidents so dense the drive stops being plausible.

### 5.1 The supply, counted

At 65–140 m spacing the car meets a junction every **5.7–12.3 s**. If every
junction carries a composed situation, that alone is one assessable event
every dozen seconds at worst. Between junctions, segment hazards drawn from
`kerbside` and `character` fill the gaps.

### 5.2 The guarantee: a pacing budget in the planner

Counting is not guaranteeing. The planner carries a running **time since the
last markable event** and steers the next choice:

- if the gap is approaching the ceiling, the next junction is composed with a
  brief that is *required* to yield at least one derivable fault, and the
  draw is rejected until it does — the same accept/reject loop
  `composeScenario` already runs, with an added condition
- if events have come too close together, the next junction is composed
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

## 6. Occlusion as standard content

Per Jay's ruling, occlusion is core and must be generated as a matter of
course rather than bolted onto particular situations.

`kerbside` on a segment generates blockers along it: parked cars, hedges,
walls, a delivery van. Character decides density and kind. These become
ordinary `sightBlockers` — the same data `sightBlockersOf` already reads and
`visibility` already tests.

**The world removes the constraint that made blockers awkward.** Today
`isRotatable` refuses any scenario with `sightBlockers`, because a blocker is
fixed x/y authored for one approach and rotation would leave it planted while
the road turned around it. In a world, junctions are *placed* facing the
right way rather than rotated into position, so blockers are simply world
objects at world coordinates and the problem does not arise. `unprotected`
and `boss-blind-rush` keep working as built for scenario play.

The fairness constraint from the redesign applies unchanged and is the
renderer's obligation: hidden must be **drawn as hidden**, with the umbra
making the reason legible.

---

## 7. What breaks when scenes stop being self-contained

### 7.1 Simulation must stay junction-local — hard constraint

`simulate()` is O(n²): 0.15 ms at 1 road user, 14.7 ms at 16, **42.4 ms at
32**. A world-scale simulate is not affordable at any traffic density worth
having.

**So the world never simulates globally.** The approaching junction is
simulated as a scenario, exactly as today; traffic elsewhere is presentation
with no conflict resolution. `legalAt` stays junction-local and keeps its
meaning. This is a constraint on the design, not a defect — and it is what
lets the entire existing engine come along unchanged.

### 7.2 `route.js` — mostly survives, one part becomes redundant

| Symbol | Fate |
|---|---|
| `planRoute`, `currentLeg`, `recordLeg`, `startRun`, `summary` | **Keep.** Sequencing and tallying is what a world route needs. |
| `entrySideAfter`, `exitHeading` | **Keep and promote.** Deriving where an intent leaves you is how the planner picks the next tile. |
| `rotateScenario`, `alignScenario`, `isRotatable` | **Redundant for world play.** Junctions are placed facing the right way; nothing needs rotating into alignment. Still used by the roguelike Checkride, so they stay, but the world does not call them. |

### 7.3 Scoring

Mostly already handled by the redesign: sections are junctions, and
`poseAt(ego, t).gone` marks the boundary. The new work is that a world drive
has **no end** — the sheet accumulates per section indefinitely, which
`addToSheet` in `actions.js` already models.

The genuine new problem is **the clock**. Scenarios use a local clock
starting near zero; a world needs a global clock with junction-local offsets.
`arriveAt`/`departAt` become "relative to when this junction activates".

### 7.4 `whatEgoSees` — needs culling, and the numbers say how much

| Road users | `whatEgoSees()` | Share of a 60 Hz frame |
|---|---|---|
| 4 | 0.008 ms | 0.0% |
| 12 | 0.058 ms | 0.3% |
| 30 | 0.288 ms | 1.7% |
| 60 | 0.942 ms | 5.7% |
| 120 | 3.302 ms | 19.8% |

It is O(n²) — every actor is tested against every other as a potential
blocker. Fine for a junction, not for a world.

**Fix: cull by distance before the visibility pass.** An actor beyond sight
range cannot be seen and cannot block anything relevant. Culling to the
~12 road users in the current neighbourhood puts the cost back at 0.058 ms,
a 57× saving, and it is a pure optimisation — the answer for anything within
range is identical, which makes it verifiable against the unculled result.

### 7.5 Verification tooling

| Check | Effect |
|---|---|
| `verify-windows`, `verify-turns`, `verify-wontstop`, `verify-events`, `verify-sight`, `verify-task`, `verify-scoring` | **Unaffected.** They test the junction layer, which does not change. |
| `verify-equivalence` | **Unaffected while junction behaviour is unchanged.** If segment speeds replace `V_STRAIGHT` for generated roads, the shipped scenarios must keep their current speeds or the golden moves — and if it moves, something is wrong. |
| `verify-route` | Extend: routes assembled from tiles must be continuous and directable. |
| `verify-camera` | Extend with the framing checks that moved out of `verify-faults`. |
| `gate-viewport` | **The acceptance test.** Becomes a real check once it passes. |
| `verify-world` (new) | Pacing budget, junction spacing band, tile seams, cull-equals-uncull. |

---

## 8. Staging, smallest provable increment first

### Stage W1 — Two junctions and a road between them. **The gate.**

The smallest thing that can make `gate-viewport.mjs` pass.

- Thread a junction origin through `stopFor` / `exitFor` / `crossingOf` so a
  junction can be built anywhere (three lines, already proven translatable).
- Make an exit lead to the next junction rather than off-board.
- Place exactly two junctions **~80 m apart** on one straight road, with the
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

**Provable:** every assembled route has junction spacing inside the band; a
residential and an arterial segment produce measurably different traffic,
speed and approach requirements.

### Stage W3 — Occlusion as standard content
`kerbside` generation from character; blockers as ordinary world objects.

**Provable:** a generated route produces sightline blocking at a target rate,
and `whatEgoSees` reports genuine occlusion on a route nobody hand-authored.

### Stage W4 — Pacing
The planner's pacing budget and `verify-world.mjs`.

**Provable:** across many seeded long routes, the maximum gap between
markable events never exceeds the ceiling.

### Stage W5 — Streaming and culling
Distance culling for visibility, junction buffering ahead of the car,
retirement behind it.

**Provable:** culled visibility equals unculled visibility within sight
range; a long drive holds frame budget.

Then, and only then, `EXAMINER-REDESIGN.md` stages 3–5 resume.

---

## 9. Open questions

1. **Speed as a segment property moves every generated window.** Deliberate,
   but the shipped scenarios must keep their current speeds or
   `verify-equivalence` will fail. Confirm that split is acceptable.
2. **Grid or free geometry?** `road.js` is compass-fixed (N/S/E/W), so all
   roads are axis-aligned and the world is a grid. Bends and diagonal roads
   would need `LEG` to become continuous rather than four fixed entries. A
   grid is a real aesthetic choice, not just a limitation — but it is a
   choice, and it should be made deliberately now rather than discovered.
3. **How long is a drive?** Sections accumulate indefinitely; something has
   to end the test. Distance, time, number of junctions, or a scripted route.
4. **Pacing constants** — the dead-air ceiling and the critical-event floor
   are playtest questions, like section length in the redesign.
