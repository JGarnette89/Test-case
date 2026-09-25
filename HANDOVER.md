# HANDOVER — what one session knew and had not written down

24 September 2026. Written at the end of the session that built signals,
corner slowing, per-lane permitted movements, lane changing, turn-driven
lane changes and keep-right, because that session is being retired for
cost and its successor starts cold.

**This file is not a summary of the project.** CLAUDE.md, SIMULATOR.md,
DECISIONS.md and REBUILD.md are the contract and they are current. This
is the residue: the things that lived only in one agent's head, the
things that look like bugs and are not, the numbers chosen rather than
derived, and the mistakes worth inheriting knowingly.

It is a snapshot, not a contract. When something here becomes wrong,
correct it or delete the entry — do not preserve it out of politeness.

---

## 1. Traps that cost real time

**ACTOR IDS REPEAT BETWEEN SEEDS.** `car-5` in seed 3 and `car-5` in
seed 5 are different drivers with different ratings. Any measurement
that aggregates across seeds keyed on `a.id` silently merges them. This
is not hypothetical: `verify-lanes` section 1 read "bold changes lane
2.0x as often as timid" when the true figure was 5.4x, because a count
of lane changes keyed by id credited one seed's car with another's
manoeuvres. Key by `` `${seed}/${id}` `` in anything that spans runs.
It is now keyed correctly there; every other multi-seed measurement in
`tools/measure/` should be read with this in mind.

**A PATCH SCRIPT THAT FAILS ITS THIRD ASSERTION WRITES NONE OF THE
FIRST TWO.** The `patchlib`/`sub()` pattern collects replacements and
writes at the end, and each one asserts its anchor appears exactly once.
That is the right design — but the failure mode is that a *correction*
script aborts, you see one line of traceback, and the file still holds
the uncorrected draft you applied a minute earlier. It looks like
"nothing happened". It is not: you are now one revision behind where you
think you are. **After any patch script fails, grep the file for what is
actually in it** before rewriting the script.

**A BACKGROUND BASH LOOP REPORTS THE LAST STATEMENT'S EXIT CODE.** A
loop ending in `[ $e -ne 0 ] && grep ...` exits 1 when the final check
*passed*, because the test was false. Two task notifications in this
session said "failed with exit code 1" over eleven green checks. Read
the loop's own output, not the harness's summary line, or end the loop
with `; true`.

**`s` IS NOT DIRECTLY COMPARABLE ACROSS LANES OF ONE LEG.** Each lane's
path has its own `stopAt`, and a lane change remaps `s` by the ratio.
`reasonToStayOut` and `neighbours` do the remap; the first version of
`tools/measure/keepright.mjs` did not, and compared `b.s - a.s` raw. At
the resolution of "is somebody beside me" that is close enough to be
invisible, which is exactly what makes it dangerous. If a measurement
needs a metre of accuracy across lanes, remap.

**THE LEADER IS NOW THE MOST CONSTRAINING CAR, NOT THE NEAREST**
(`whatStops`, crossing.js, commit 208c647). This looks like a
complication over an obvious `d < gap` and it will read as one. It is
load-bearing: a car mid-lane-change is in two lanes at once, and a quick
car 8 m ahead in the lane it is leaving hid a *stopped* car 17 m ahead
in the lane it is entering until past stopping distance — 180
overlapping car-ticks at 300 cars. In a single queue the two rules pick
the same car, so nothing else moved. Do not simplify it back.

**`verify-course` PINS THE LIST OF SHEET FAULT KINDS AS A LITERAL.**
Add a `trait: "..."` to `marking.js` and that check fails with "which is
not the list this stage can honestly stand behind". That is deliberate —
a sixth fault name should be a decision, not a drift — but it reads like
a mystery failure in an unrelated file. The fix is to add the name to
the literal *and say why in the comment beside it*, as `keepRight` did.

---

## 2. Things that look wrong and are deliberate

- **`world.keepRight === false`** (crossing.js `seedGraph`) exists only
  so `verify-lanes` can run the controlled comparison. It is not a
  gameplay toggle and nothing should ship reading it.
- **`reasonToStayOut` returns a string OR an object.** String = a reason
  to stay out (or no lane to the right); object = the move back, ready
  for `attempt()`. A single function doing both is what keeps the fault
  and the behaviour reading the same fact, which is the whole point —
  the sheet reads the `hogSince` the driver's own decision wrote, so the
  two cannot disagree about whether there was a reason. Splitting them
  into `hasReason()` and `moveBack()` would recreate the two-implementations
  bug this project keeps paying for.
- **The `noLane` reason covers the overpass**, and the reason it does is
  a structural fact I only found while checking this document, so it is
  written nowhere else. **A through road — a stretch with no node at
  either end — gives each of its lanes its own `spot`, and each spot's
  `layout.legs` contains only that one lane.** So from a car in
  `over:fwd#0`, `layout.legs["over:fwd#1"]` is undefined: the lane beside
  it genuinely exists and is genuinely unreachable, because it is filed
  under a different spot. **No lane changing of any kind can happen on a
  through road**, and those cars are judged neither way by keep-right.
  That is not a keep-right limitation, it is `graph.js`'s shape, and it
  will bite anything else that wants neighbouring lanes on a link.
- **`verify-lanes` now takes about 7m30s**, up from ~3m. The keep-right
  section runs three full 3-seed × 150 s worlds with `noticing()` on
  every actor, because the mark rates are comparisons across ~70 and
  ~150 occasions and one seed swung them by a third. If it is trimmed,
  trim the seconds, not the seeds.
- **Lane changes happen only on the approach half of a link.** The exit
  half is filed under the node behind, and `laneStep` is not called
  there. So a driver who passes on the exit half cannot move back until
  the next approach begins. Known, recorded in SIMULATOR.md 1.1.17, and
  the limit most worth lifting if the left lane reads as too full.

---

## 3. Numbers chosen, not derived — do not treat these as measured

| constant | value | status |
|---|---|---|
| `KEEP_RIGHT_FAULT` | `2 * RETURN_AFTER` = 7.6 s | **provisional, and a live domain question for Jay**: how long may a driver sit out of the curb lane before an examiner marks it? Everything downstream of it (the 36%/2% mark rates) moves when he answers. |
| `RETURN_AFTER` | `LC_TIME` = 3.8 s | design constant: "about as long as the manoeuvre itself". Reusing `LC_TIME` is a judgement, not a derivation. |
| blind-spot miss chance | `obs * 0.6` | provisional. The 0.6 was never justified from a measurement; the *rate it produces* was checked (11% for poor observers, 2% for good), which is not the same thing. |
| `LC_GAIN` | 2.0 m/s | already flagged in the source as a design constant. |
| `KEEP_RIGHT` bands in the check | weak > 0.5, sound < 0.2 | chosen from the measured deficit distribution (§5), which is bimodal with almost nothing between 0.2 and 0.7 — so the bands are wide because the population is, not because the numbers were tuned. |

---

## 4. Known sins, in the order I would fix them

1. ~~**`MOST_BRAKE = 8.0` is declared twice.**~~ **FIXED by the
   successor, and it was THREE times**: `corner.js` carried its own copy
   too, with a comment saying it was traffic.js's. traffic.js exports it
   now and both others import it. The lesson is the entry's own: the
   list of copies was itself written from memory, and a grep found one
   more.
2. **Three `keepRight` faults survive knowledge being stripped.** 29
   faults on the sheet, 26 on weak-knowledge drivers; strip every
   driver's knowledge to perfect and 3 remain — the same 3. So those are
   *not* knowledge's. I hypothesised in SIMULATOR.md that they are timid
   drivers refusing a gap a competent driver would take (confidence
   leaking through a knowledge fault, at 2% of occasions) and **I did
   not verify that hypothesis.** It is labelled as a hypothesis in the
   document. Verify or replace it.
3. ~~**`tools/measure/reach.mjs` misclassifies `verify-screens`.**~~
   **FIXED**: it labels a check that renders the app `app`, and
   `syms.mjs` beside it shows the live screens use src/engine/ by symbol,
   so OLD no longer reads as "guards nothing live". The original entry: It
   builds the import graph from static `import ... from` and marks a
   check "OLD" when nothing in its closure reaches `src/sim`, `src/iso`
   or `src/map`. `verify-screens` imports vite and `react-dom/server`
   and reaches the app *through a bundle*, which the graph cannot see —
   so it is labelled OLD while being the only check that would catch a
   React mistake on the live `#/map` screen. Anyone reading that output
   as a delete list would delete the wrong thing. Same caveat applies to
   any check that reaches its subject dynamically.
4. **A driver who misses their turn does not re-plan.** They carry on
   the way their lane goes and the `want` is dropped. Real drivers
   re-route. This is the sim-side twin of the old engine's open question
   ("does going off course end the drive, or do you re-route?").

---

## 5. Measurements that informed decisions and never reached a document

**Knowledge deficit across map traffic** (200 cars, test map, after
30 s): p10 0.03, p25 0.06, p50 0.13, p75 0.20, p90 0.70, max 0.82;
24% over 0.5, 3% over 0.8. **It is bimodal** — the profile draw (weak on
one or two axes, sound on the rest) leaves almost nobody between 0.2 and
0.7. That is why keep-right's return interval, `RETURN_AFTER / (1 -
deficit)`, separates so cleanly: 4.4 s at the median, ~13 s for the weak
quarter. It is also why the check's "middle" band was empty in the first
probe and was dropped rather than debugged.

**Lane changes by kind and temperament** (seeds 3/4/5, 200 cars, 150 s,
bold = caution < 0.7, timid = caution ≥ 1.3, ratio bold:timid):

| | all changes | overtakes | for a turn | keeping right |
|---|---|---|---|---|
| keep-right OFF | 2.1x | 5.0x | 1.2x | — |
| keep-right ON | 1.4x | **8.1x** | 0.9x | 0.6x |

Two things fall out. Only overtaking separates by temperament, which is
why the confidence check counts overtakes only. And keeping right
*sharpens* that separation (5.0 → 8.1), presumably because returning to
the curb lane creates fresh opportunities to overtake — **presumably;
that mechanism is inferred, not measured.**

**Why drivers are out of the curb lane**, sampled across the test map
(car-ticks, three seeds, cruising on a multi-lane approach):

| reason | count |
|---|---|
| an upcoming turn the lane to the right does not make | 2,946 |
| no reachable lane to the right (the overpass, above) | 2,136 |
| **no reason** | 1,389 |
| something slower in the way there | 1,129 |
| still passing | 669 |

The legitimate exceptions dominate roughly 5:1, which is what makes the
7.2% "no reason" figure meaningful rather than alarming. **Caveat: this
sample predates the `noGap` exception**, so its 1,389 "no reason"
includes the cases now attributed to waiting for a gap. Re-run
`tools/measure/keepright.mjs` for a current split rather than trusting
this table's bottom three rows.

**The 300-car overlap, traced** (seed 3, 120 s, five-way at C): car-334
in a *mandatory* change into lane 0 at 14 km/h, braking at −8.0 m/s²
(the clamp) for the last second, into car-200 standing still. Both in
`C-D|start#0`, both with `turnsMet > 0`. That trace is what produced
both the stopping-distance floor under the gap and the most-constraining
leader fix; the floor alone did not move the count at all (187 → 187).

**Old-engine check timings, measured this session** (the table in
CLAUDE.md cites a 10 September run; these confirm it): candidate 6m50s,
world 4m05s, roguelike 1m32s, outcome 44s, stages 34s, generator 33s,
events 33s, compose 27s, awareness 18s, playthrough 16s, clearance 11s,
detect 6s, faults 2s, wontstop 1.7s, everything else under a second.
26 checks plus `verify-scoring.py` total **16m23s**.

---

## 6. Environment, beyond what is already recorded

- **`gh` is not installed.** There is no way to watch the Actions run.
  Confirm a deploy by polling the Pages URL for the build stamp instead:
  fetch `https://jgarnette89.github.io/Test-case/`, pull the
  `assets/index-*.js` filename out of it, fetch that and grep for the
  short SHA. It lands 1–5 minutes after a push. The stamp comes from
  `__BUILD__` in `vite.config.js` and reads `<sha> built <ISO minute>`.
- **The LAN preview server serves `dist/` from disk.** `npm run build`
  refreshes what the phone sees without restarting anything. The
  detached server is started by `scratchpad/serve-preview.ps1`, survives
  the session, and writes its PID to `scratchpad/preview.pid`.
- **The preview pane CAN screenshot a static screen.** The "zero
  animation frames" rule in CLAUDE.md is about rAF-driven screens and is
  still true — but the home menu, and anything else that draws once and
  sits still, renders correctly and is worth looking at. I used it to
  check the menu change. Do not generalise the rule into "never open the
  pane".
- **Foreground `sleep` is blocked.** Wait on background work with an
  `until` loop inside `run_in_background`, or the Monitor tool. A
  foreground `until` loop that runs past 600 s is moved to the
  background and you lose its inline output — set an explicit long
  `timeout` instead.

---

## 7. What I was about to do, and why

1. **The menu cleanup — ALREADY DONE AND PUSHED as `70b959b`, before
   the instruction arrived to leave it for the successor.** It needs
   review rather than redoing. What it did: an entry appears on the menu
   only if it carries `live: true` in `MODES` (App.jsx), which today is
   `#/map` and `#/iso`; every other route still resolves by address;
   `verify-screens` renders every route from its own list regardless of
   the menu, so nothing rots unnoticed. `verify-screens` was run and the
   home screen was looked at. If Jay wants it differently, the whole
   change is one flag and two blurbs.
2. **The deletion report -- DELIVERED 24 September by the successor, and
   it changed the picture below.** The live screens used ~15 symbols
   from 6 engine files; those were extracted to `src/core/` (CLAUDE.md,
   Architecture), so the live closure now contains no engine file at all
   and `verify-core` holds it there. The cuts, from
   `tools/measure/cuts.mjs`: dropping only the driver-game screens frees
   nothing (the examiner screens import the old renderer); dropping the
   examiner screens too (cut B) frees 7,178 lines in 14 files -- CARRIED
   OUT the same day on Jay's confirmation; it retired 4 checks, 3m00s of
   suite, not the ~8m first estimated, because 11 of the 15 "driver-game"
   checks guard files that survive the cut; also dropping the
   exam-mode engine (cut C, Jay's product call) frees 11,162 lines and
   ~16m. `verify-candidate`'s driver-composition half moved to
   `verify-sim` section 6 so it survives any cut. The predecessor's
   original notes follow.

   **The deletion report, as first measured.** Asked for as a report only,
   no deletions. The numbers, from `tools/measure/reach.mjs`:
   - `src/apps/DriveDraw.jsx`, **2,448 lines**, is reached by nothing —
     not the app, not any check. It is the only file in that state.
   - **The old dependency no longer holds for the live screens.**
     `RightOfWayTiming.jsx` is *not* in the import closure of `#/map` or
     `#/iso`; they use the canvas isometric renderer. But it *is* still
     load-bearing for `#/drive` and `#/examiner`, which import `Road`
     and `Environment` from it. So "the driver game carries the only
     renderer" is now false for what is live and true for the examiner
     screens.
   - **12,095 lines** are reachable from the app only through screens
     other than the live two (5,656 in `src/apps`, 5,864 in
     `src/engine`, plus `frame.js`, `environments.js`, `progress.js`).
     Of that, the rebuild-stage screens (`#/sim`, `#/crossing`,
     `#/candidates`, `#/course`, `#/wheel`) need **3,388 lines** —
     including `detect.js`, `faults.js`, `clearance.js`,
     `sim/marking.js`, `sim/candidate.js` and `frame.js` — and the old
     game screens need the remaining **9,249**.
   - **27 of 41 checks reach nothing in `src/sim`, `src/iso` or
     `src/map`**, totalling 8,379 lines of check code and ~16m23s of
     the suite. **Read that with §4.3's caveat**: `verify-screens` is
     among the 27 and must not be touched.
   - Nothing above is a recommendation. The examiner machinery is
     shelved rather than dead (SIMULATOR.md 2.2), and the ratings model,
     `detect.js` and the fault vocabulary are what the exam mode returns
     to.
3. **Open, and the reason keep-right is not finished:** `KEEP_RIGHT_FAULT`
   is waiting on Jay (§3), and the `noGap` exception uses a *competent*
   driver's gap, so a very timid driver refusing a gap a competent
   driver would take is still marked. That is §4.2's three faults and it
   may be the right answer or may want the exception to use the driver's
   own caution. It is a domain question dressed as a constant.

---

## 8. One habit worth inheriting, because it caught things

Three times this session a check went green on something that was
wrong, and each time the thing that found it was **sabotage**: delete
the mechanism on purpose and confirm the check fails. The `inTheWay`
exception was deleted from `reasonToStayOut` and the agreement check
went from 0 disagreements to 694, which is the only reason that check
is worth anything. CLAUDE.md's cold-start item 3 says this. It is
harder to remember than it looks, because a green check feels like an
answer.

And its twin, which cost me three corrections in the documents this
session: **when writing a paragraph explaining a measurement, the
plausible causal story arrives faster than the evidence for it.** "A
timid driver stays out longer, so returns more" — never measured.
"Mostly for a left turn at the next intersection" — never measured, and
wrong; it was mostly the overpass. Every one of those had to be caught
and rewritten. If a sentence explains *why* a number came out that way,
either measure it or write that it is inferred.
