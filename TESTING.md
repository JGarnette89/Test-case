# TESTING — what the checks cost, and what they have caught (14 October 2026)

The maintainer, on the suite: it is "taking an extended time and not even
delivering real results." This is the answer in numbers, and the honest
account of which checks are load-bearing. The rule it produced is
CLAUDE.md, cold-start item 8; the tools are `tools/check.mjs` and
`tools/affected.mjs`.

## The numbers

| | before (13 October) | after (14 October) |
|---|---|---|
| the whole suite, wall | **75 min** (4,524 s, six shell lanes, 60 checks) | **24 min** (1,420 s, 8 at once, 43 checks + scoring), every check passing |
| what a change to a sim feature ran | the whole suite -- the rule sent any `src/core/` or cross-cutting change there, and in practice every commit this week went through it, four times for the rivals | iterating: `--direct`, e.g. `rivals.js` **~3 min**, `draw.js` ~5, `lanechange.js` ~13, `peds.js` ~15; committing: the derived set, ~24 min |
| a change to a screen or the HUD | `verify-screens` by the table, if remembered | 2 checks, seconds |
| a markdown change | nothing | nothing |
| a hang | stalled the session; the shell lanes kept launching checks after their wrapper was stopped | killed at 3x the check's recorded time, named, log kept; nothing left running |

Estimates for a change: `node tools/measure/subset-cost.mjs <file>`, from
the times recorded under the suite's own load (`tools/check-times.json`),
so they are upper bounds -- a subset runs with less contention.

**Where the 51 minutes went:**
- **22 checks guarding only the old engine** moved to `tools/legacy/`
  (565 s of their own, three or four minutes of wall). Nothing that ships
  reaches `src/engine/`, and it has not changed since 24 September. They
  run when it does. **Cut B had completed as recorded** (the old screens
  and their four checks, 24 September); these 22 are cut C, which the
  record leaves as the maintainer's call, so the engine is not deleted --
  its checks are only out of every run.
- **The slow checks, cut to the sample they need, measured** (solo times):
  `verify-buses` 2,302 s -> three files (sections 6 and 7 split out, one
  ordinary run instead of three, passing runs 7.5 min instead of 15) --
  every count still clear of its floor; `verify-lanes` 1,883 -> 1,028 ->
  three files (keep-right and the cost profiling split out; a per-car
  linear search per tick replaced by a map; profiling 15 s a call instead
  of 60); `verify-compliance` 885 -> 628 (one city seed of three: 129
  scofflaw stops against a floor of 30); `verify-courtesy` 696 -> 188 and
  **stronger** (below); `verify-peds` section 6(b) one seed of three (it
  was passing vacuously on all three).
- **Splitting** the two longest files lets the runner run their halves
  side by side; under eight-way load each had run past twenty minutes.

**What is still slow, and why it stays.** A change anywhere in the sim
reaches 37 checks, because `crossing.js` imports almost every sim module:
the import graph is exact and cannot shrink that. Keep-right (its counts
sit near their floors: 75 occasions against 40, 26 marks against 20) and
the graph's no-overlap runs on every geometry are genuine simulation time.
The next lever is a cheaper sim, not fewer samples.

## What the suite has caught -- and what is ceremony

**There was no record.** Nothing logged a check failing until today; the
runner now appends every run to `tools/check-history.jsonl` (committed),
so the next audit is a query. What follows is this week, seen first-hand,
and the earlier failures the documents record.

**Caught real bugs this week -- all in code the change touched:**
- `verify-signs`: yield-road cars slowing early and speeding up again
  before the line (the stopping-short change applied too widely).
- `verify-drive`: a deadlock on a through road -- a left-turner waiting
  short starved the lane beside it; the player never reached the box.
- `verify-signal`: cars held at full braking while standing still (2,341
  "harsh" car-ticks against 29).
- `verify-course`: a crash, `marking.js` calling `waitAt` with no driver.
- `verify-courtesy`, once redesigned: courteous drivers level with the
  player refused to offer -- the bug shipped in `3681778` past the old
  version of the same check, which measured luck.
- Earlier, recorded: `verify-trucks` failing at `673c847` (shipped anyway,
  the log miscounted -- why the runner now prints a count); `verify-paint`
  (a walker inside a hill); `verify-screens` (blank screens, twice).

**Failed, and the fault was the check's:**
- `verify-compliance`, `verify-drive`: each carried its own copy of where a
  car stops, and a window opening exactly where cars rest -- the recurring
  bug (CLAUDE.md item 2) in a check.
- `verify-peds`: claimed nobody is ever struck, where the established rule
  is that risk-takers can be; it held only by luck of the seeds.
- `verify-rivals`: measured "following" with any car within 80 m at any
  closing speed.
- `verify-observation`: three crashes against one -- too few to decide
  anything, and it decides.

**Passing on nothing -- found and fixed or flagged:**
- `verify-rivals`: "Victor follows closer" passed on zero samples (he never
  follows steadily). Removed; asserted on the profile instead.
- `verify-peds` 6(b): "nobody struck was careful" with nobody struck, on
  all three seeds. Cut to one, and the check now says it holds vacuously.
- `verify-courtesy` (first version): "6 of 19 offered" was read as
  temperament and was the bug.

**Never failed, and why:**
- **The 22 legacy checks**: guard code untouched for three weeks that
  nothing ships. Nothing to catch. Ceremony for every change outside
  `src/engine/`, which is why they are out of the default run.
- **Fast structural checks that have not failed this week** -- `-sim`,
  `-map`, `-wheel`, `-chase`, `-perf`, `-core`, `-connect`, `-bench`,
  `-briefs`, `-exam`, `-telling`, `-crossing`, `-generate` -- either guard
  stable code or are untested by this week's changes. Most cost seconds;
  they are cheap insurance, not the problem.
- **Not done, and needed to separate "stable" from "testing nothing": a
  sabotage pass over every check** -- break the module each is written
  against and confirm it fails. Three checks passing on nothing turned up
  in one week without looking for them; there will be more. It is the next
  piece of this work, and `--direct` makes it affordable (each check
  against its own module, minutes each).

## Cut C, the same day

The maintainer: "delete it, it's just bloat at this point." The old
engine, its 22 checks, `#/course`, `frame.js`, the engine's golden, the
scoring re-derivation and the probes are deleted (57 files); the exam
mode's grading lives on in `src/sim/detect.js`. The suite is now the 43
checks above and nothing guards code that does not ship.

## The rule that comes out of it

CLAUDE.md, cold-start item 8. In short: iterate with `node tools/check.mjs
--direct`; commit with `node tools/check.mjs` (the derived set); `--all`
before a milestone ships or when something unexplained happens; legacy
only when `src/engine/` changes. Every check has a timeout and a recorded
time, every run a line in the history.

## The audit, 20 October: which checks have earned their place

Sources, all three read for this: the run log (`tools/check-history.jsonl`,
every run through `check.mjs` since 14 October -- 26 runs, two failures);
every commit message in the history, searched for a check named beside
"caught", "found", "fail" or "sabotage"; and the documents. A run made by
hand (`node tools/verify-x.mjs`) is not in the log, so the log alone
under-counts; the commits are the longer memory. **The suite is 11,523
lines across 45 checks.**

**1. CAUGHT A REAL BUG -- in code, not in the check (16):**
`verify-screens` (blank screens twice; a broken string in `hud.js` on 15
October), `verify-signs` (yield-road cars slowing early), `verify-drive` (a
through-road deadlock), `verify-signal` (cars braking hard while standing),
`verify-course` (`marking.js` crash), `verify-courtesy` (courteous drivers
refusing to offer -- once redesigned), `verify-trucks`, `verify-paint` (a
walker inside an embankment), `verify-generate` (sections' starts facing
the wrong end), `verify-crashes` (an attentive car driving into somebody it
could see), `verify-briefs` (two before shipping), `verify-graph` (a path
through a waiting car), `verify-telling` (a finding about lag), `verify-money`
(standing for a fare read as dawdling; a route through a turn no signal
can make, with `verify-places`), `verify-places` (with money, above),
`verify-worker` (the old pacing's stutter, as its control).

**2. PROVEN ABLE TO FAIL -- broken on purpose and caught it -- but no real
regression recorded (17):** `verify-actuated`, `verify-bays`, `verify-bench`,
`verify-buses`, `verify-compliance`, `verify-core`, `verify-editor`,
`verify-exam`, `verify-greens`, `verify-map`, `verify-observation`,
`verify-peds`, `verify-perf`, `verify-rivals`, `verify-voice`,
`verify-walkers`, `verify-start`. These are guarding something and have
shown they can see a break; that they have not caught a regression yet is
what a guard on stable code looks like.

**3. NEITHER -- the sabotage pass, done 22 October: the group is empty.**
Each of the twelve broken against its own module, in a clean worktree so no
two breaks could share a run, and each failed:

| check | the break | what failed |
|---|---|---|
| verify-sim | following ignores the car ahead | overlaps at every speed (4 lines) |
| verify-crossing | nobody ever gives way | arrival order, the right-hand rule, ... (11) |
| verify-chase | the camera stops leading with speed | the lead at every heading (7) |
| verify-wheel | steering not limited by grip | the grip-limited turn (4) |
| verify-connect | a lane with nowhere to go not refused | three into two, named refusals (7) |
| verify-keepright | nobody knows the rule | who is marked, the return (5) |
| verify-passing | passing over a solid line allowed | nobody passes on a solid line (2) |
| verify-busbays | nobody yields to a bus pulling out | 7 of 15 let it out (1) |
| verify-lanes | every gap accepted | how tight, overlaps (5) |
| verify-lanecost | lane changing made ~10x dearer | its share of a step (2) |
| verify-waves | offsets turned against the platoon (21 October) | green on arrival, the platoon (9) |
| verify-loop | -- | caught a REAL regression on 21 October: the closed loop's standstill |

**verify-lanecost's bound is loose**: a break making lane changing about
twice as dear (7.2% of a step at 120 cars) PASSED; only about ten times
(51.6%) failed. It guards against gross regressions only -- recorded, not
tightened. verify-loop moves to group 1.

**THE COST OF A CORE CHANGE, measured 22 October** -- the question asked
twice. Subsetting (14 October) pays for leaf changes only: a screen, money
or routing runs 1-5 checks in seconds, the renderer or the worker 6-11 in
about six minutes. A change to `crossing.js` or `lanechange.js` reaches
40-47 checks, and every commit of the week touched one: about 12,500
CPU-seconds and 26-28 minutes at 8 at once. Profiled, 98% of a slow check's
time is the simulation stepping, none of it the check's own measuring, so
the cost is simulated minutes times world size. The slow checks were
already cut to their floors on 14 October (busbays' hard run sits exactly
on its floor of 3; passing at about twice its floors), so a further cut
buys little and risks the floors.

What did buy time: **12 at once instead of 8** -- the whole suite on an
unchanged tree went from 1700 s to 1382 s (each check about 28% slower
beside its neighbours, the whole 19% sooner; check.mjs's default since,
capped by free memory). The wall is now set by the longest check,
verify-compliance (about 1180 s under that load: 144 five-minute runs of
the lit map plus five minutes of the city), so the next cut was to shorten it. DONE 22 October, not by splitting (one
assertion needs both of its large runs, and the right-on-red counts are too
near their floors to halve) but by running its 145 independent runs in
worker threads and adding them up (tools/lib/compliance-runs.mjs):
identical output with one worker and four, 950 -> 448 s under the suite's
load, both sabotages caught through the parallel path. The pole is now
eight checks at 870-1020 s; most simulate several independent worlds and
could take the same treatment. (28 October: a split of verify-compliance was asked for on the 950 s figure, which is this entry's BEFORE. Measured on the derived run of that morning, 12 at once: 465 s of a 1,581 s wall, 2.5% of 18,826 check-seconds; the suite is CPU-bound, so the wall follows total work and the slowest batch -- verify-peds 1,009 s, then six at 790-890 s. Not split: it would cost nothing less. Its own parts, timed alone: the city run 27 s, the 72 light runs 0.4 s each, the 72 busy runs 5.5 s each -- about 430 s of CPU in four worker threads.) THE REAL LEVER, AVAILABLE, NOT SCHEDULED (the project lead, 28 October: suite cost deprioritised by the maintainer that morning; a project, not a gap-filler): the seven heaviest checks -- verify-peds, -courtesy, -keepright, -busbays, -trucks, -lanes, -graph, 790-1,009 s each under load -- each cut to the sample it needs by the rule above (floors against counts, sabotage still caught, numbers written into the check). After that the lever is a cheaper step -- which the
phone would feel too: the week's changes made a step about 6-7% dearer
(test map 1 10.18 -> 10.86 ms, the city 6.28 -> 6.68 at 250 cars).

**The before and after for a single change** (from the table above): before
14 October every commit ran the whole suite, 75 minutes; now a change runs
the checks whose imports reach it -- 2 checks in seconds for a screen, 4-5 in
under ten seconds for the money and route modules, 6-10 in about six
minutes for the renderer or the worker, 40 in about 21 minutes for
`crossing.js` (the hub nearly every sim check imports).
