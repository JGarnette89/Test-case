# Handoff — 28 October 2026, evening (written, reviewed cold, rewritten)

Read CLAUDE.md first. Then this. Then SIMULATOR.md IN FLIGHT 34-40 and
DECISIONS 10.23 items 15-20, 10.32-10.34, which hold every number below in
full. Stopped deliberately: the maintainer (Jay) is near his usage limit, and
nothing that moves the default world was to be started.

## 1. STATE — read this before touching git

**`main` is what Jay drives** (GitHub Pages, https://jgarnette89.github.io/Test-case/,
rebuilt on every push). Its last *feature* is the traffic skill dial and
per-driver card (`85a4fcf`); every push since is records only. The served
stamp was last verified at `e704e19 built 2026-10-28 15:10Z` with "Traffic
skill" in the bundle. A feature is shipped only when pushed AND the served
page's stamp is checked (CLAUDE.md).

**THE REPOSITORY'S OWN CHECKOUT (`C:\Users\yyzga\Documents\Drivedraw`) IS ON
BRANCH `lane-occupancy`, NOT `main`.** It carries uncommitted
`tools/check-history.jsonl`, `tools/check-times.json` and an untracked
`tools/measure/city-speed.mjs` (committed on `cross-node-gap`). Check
`git branch` before any work.

**Five branches, all LOCAL ONLY (none pushed), none merged:**

| branch | built on | what it is | status |
|---|---|---|---|
| `aggression-phase1` | main (older) | aggression as imposition, the second dial, the seventh bar | 51/55; held behind 39-40; see section 3 |
| `lane-occupancy` | main | IN FLIGHT 38: one physical definition of who is in a lane | verified; 49/55, verdicts below |
| `cross-node-gap` | **lane-occupancy** | IN FLIGHT 39: the clamp in `laneSpanOnGraph` removed | verified; 51/55 |
| `fail-to-stop` | main | IN FLIGHT 40's two switches, OFF by default | **do not merge** — see section 2 |
| `occ-plus-40` | lane-occupancy | test tree only (38 + 40) | throwaway |

Worktrees live in the IGNORED scratch folder: `tools/scratch/kr/oldtree`
(main), `ftstree` (fail-to-stop), `xntree` (cross-node-gap), `combotree`
(occ-plus-40). `git worktree list` shows them. **Do not delete
`tools/scratch/kr/` without `git worktree remove` first** — the branches
survive in git, the worktrees do not.

## 2. THE AGREED ORDER, AND WHY

1. **39 — DONE on `cross-node-gap`** (built before the stop order arrived;
   main untouched). Remaining: its 4 failing checks (below) before it merges.
2. **The shaping trace, on the fixed world** (`cross-node-gap`). WHY: main's
   shaping boost was 3.18x and is 2.20x with 38 (2.15x with 39). If phantom
   leaders bunched traffic near the player, last week's "shaping works"
   headline was partly an artifact — a question about a past conclusion, not
   a regression. It is only meaningful on a world without the phantoms.
3. **IN FLIGHT 40, reframed: "why does the hold decision come late against a
   car visible for seconds"**, starting with the 26 unnamed blockers. WHY: no
   car overshot by choice (section 3); the item is about when drivers are
   told, not who yields. NOT expected to be dissolved by 39 (different code
   path).
4. **The check restatements** (section 4). WHY after 40: `verify-rivals`
   must be restated against the city's crash rate AFTER 40, and the others
   are cheaper once the world stops moving.
5. **IN FLIGHT 37** (a curb-lane right turn held by the same approach's
   waiting inner-lane left turn — a conflict 1.3 m past the line; jams the
   through road). WHY late: independent, pre-existing, and `verify-drive`
   only fails on the aggression branch.
6. **The aggression phase-1 merge.** WHY last: aggression is judged entirely
   in gaps and imposed braking; merging it before 38/39/40 settle means
   tuning a disposition against measurement errors.

A cold session that knows the reasons should reorder if a reason changes.

## 3. TODAY'S FINDINGS, WITH NUMBERS

- **Keep-right with checks on (fixed, on main, `e619924`):** `exitStep`
  discarded the looks `attempt` began; every exit keep-right with checks on
  was by a driver who had skipped checks (23 of 23). Not the hypothesis.
- **Aggression = imposition** (DECISIONS 10.32; renamed from "tolerance",
  which Jay uses to mean considerate): the braking a driver will force on
  others, 0.5 to 8 m/s². Law-breaking = aggression × low compliance (not
  built). Courtesy is its other reading. Phase 1 met only some predictions:
  the median lane change still costs ~0.03 m/s² (a tolerance is a ceiling).
  Impatience approved in principle as RATE OF CHANGE (is the gap opening),
  not lookahead; its decisions measured free (9.81 vs 9.78 ms, worlds
  identical) — not built.
- **IN FLIGHT 38, phantom leaders:** `whatStops` treated cars from the same
  leg as sharing a lane past their split. The off-ramp "leader" was a median
  30 m sideways. Fixed: keep-right moves begun under the floor 22/138 and
  17/129 → 0/116 and 0/100; any lane change under the floor → 0. A fifth
  reader (the sorted-index shortcut in `takePlain`) pre-filtered with the old
  definition and caused 50 crashes in the first pass — found by the crashes,
  not the sweep (DECISIONS 10.23 item 18).
- **IN FLIGHT 39, the cross-node clamp:** `laneSpanOnGraph` clamped every
  car to its approach's end / exit's start at EVERY position, not only in the
  box. Identified by arithmetic: gap 78.5 + clamped 285.1 = 363.6 m against a
  straight line of 347.4. Fixed on `cross-node-gap`: city phantoms 25.7% →
  0%. **But the city is not faster: v/v0 +0.3-0.4%** — so cross-node
  misreading does NOT explain "too polite". The same fix had already been
  made downstream twice (placement `placeOf`, buses `laneAt`, 30 Sep).
- **IN FLIGHT 40:** "a car that fails to stop is rewarded with right of way"
  — the lead's hypothesis — built as a switch: **28 crashes against 5**. Then
  measured: of 69 overshoots on main, **0 could have stopped when held**; 13
  could not from entering the node; 56 entered with room and were held too
  late (19 of 30 against a car visible 2 s+, median 3.6 s). Named as a
  property: **DECISIONS 10.34, drivers are told things too late to act on.**
- **Crash rates on main** (the `#/map` world, 14 ten-minute city runs each):
  180 cars **0.43/h, 2.4 per 1,000 car-hours** (1 crash); 300 cars
  **1.29/h, 4.3 per 1,000 car-hours** (3 crashes). Three events supports
  anything from 0.3 to 3.8 an hour.
- **The follow gauge Jay uses is sound** where checkable (55/55, 23/23,
  worst 0.20 m); inside intersections and on bends unverified.

## 4. CHECKS FOUND UNSOUND, AND WHERE EACH STANDS

| check | verdict | status |
|---|---|---|
| verify-lanes "how tight" | encoded the confidence/aggression conflation | **restated** on `aggression-phase1`, sabotaged |
| verify-keepright exceptions | two definitions of "no gap" | **restated** on `aggression-phase1`, sabotaged |
| verify-promotion | asserts the 22 Oct agreement with the wrong lane rule | pending |
| verify-signal | blames corner braking (−5.87 m/s²) on the amber | pending |
| verify-rivals | asserts zero crashes; main crashes ~1 in 5-6 runs | pending, **after 40** |
| verify-shaping | passes on main only on seeds 1-2 (jolts on 3 of 8) | pending, after the trace |
| verify-headway | sample floor (8 of 8 agree, none missed) | pending |
| verify-drive | one lucky pass of four; the queue is IN FLIGHT 37 | pending |
| verify-lanecost | parallel-load flake; passes alone | known |
| **verify-courtesy** | **new on `cross-node-gap`, untraced**: "noticed being let in" 2/2 and courtesy-off 0/2 | **untraced** |

## 5. OPEN LEADS — do not rediscover

- **The 26 unnamed blockers** (40's first question): 26 of 69 holds began
  with no blocker named by `blockedBy` — the largest category, unknown.
- **IN FLIGHT 36, free-flow hard braking:** 1 four-second window in 18 past
  3 m/s² on an open highway (5.6%; city 11.4%) — **confirmed NOT explained by
  38 or 39** (moved ≤0.4 points). A separate defect under every braking figure.
- **"Too polite" is unexplained:** not the skill distribution, not cross-node
  misreading. Do not tune dispositions until it is.
- **verify-courtesy on `cross-node-gap`** (section 4).

## 6. PRACTICES THAT EARNED THEIR PLACE

- **Predictions in writing before building**, scored honestly — including
  the ones that fail or are never exercised.
- **A mechanism must be shown active in the run it explains.** The lead's
  mechanisms were wrong four times this week; one classification of a single
  crash was withdrawn twice.
- **Small samples misled us four times** (single-seed, three-seed, one-pass,
  5-against-1 that was 7-against-5). Settle a difference before chasing it.
- **A check that measures a proxy must assert the proxy still tracks the
  target**; a zero-event assertion is a claim about a rate.
- **Agreement between two readers is worthless if they agree on a fiction.**
  Find which definition matches the physical world, then share that one; look
  for what PRE-FILTERS candidates (indexes, caches, fast paths), not only who
  reads the quantity.
- **Build behind a switch and measure before merging.** A plausible fix from
  the lead engineer would have made the city five times more dangerous.

## 7. WHAT WAITS ON JAY

- **The crash rate judgement** (section 3): is ~0.4-1.3 an hour the right
  rate, given that the mechanism is real and the population is chosen?
- **His verdict on the skill dial** (shipped on main): does the road visibly
  worsen at −1? The desk said yes on the city, weakly elsewhere.
- Not yet put to him: the aggression four corners in imposition terms, and
  the impatience design.

## 8. DO NOT

- Do not merge `fail-to-stop` as built (28 crashes against 5).
- Do not restate `verify-rivals` before 40 changes the crash rate.
- Do not tune the skill/aggression dials, courtesy or caution to answer "too
  polite" — its cause is unknown.
- Do not change a check before its verdict is written (CLAUDE.md item 8).
