# TESTING — what the checks cost, and what they have caught (14 October 2026)

The maintainer, on the suite: it is "taking an extended time and not even
delivering real results." This is the answer in numbers, and the honest
account of which checks are load-bearing. The rule it produced is
CLAUDE.md, cold-start item 8; the tools are `tools/check.mjs` and
`tools/affected.mjs`.

## THE PLAN FOR GETTING THE CHECKS UNDER CONTROL (6 November): APPROVED BY THE PROJECT LEAD, TO STOP AFTER B; NOT BEGUN

The maintainer's "get the checks under control", read by the project lead as broader than verify-lanecost. **Nothing here has been executed.** Times are each check's last recorded time under load (check-times.json). A whole `--all` is about 35 minutes of wall (2,123 and 2,212 s, last two runs). **THE STATUS COLUMN IS THE 28 OCTOBER HANDOFF'S AND HAS NOT BEEN RE-MEASURED ON MAIN:** several were found on branches and main has moved. Re-confirming comes first, or this fixes things that are no longer wrong.

**A. THE RUNNER: small, no simulation, and it pays for the rest. Do first.**

| what is wrong | fix | cost |
|---|---|---|
| A check whose sample grows times out until its recorded time is updated: the limit is 3x the LAST time | keep a hash of the check file beside its time; a changed file counts as unrecorded and gets the cap | about 20 lines, a fake check to prove it |
| The line says "3x its last time" when the 1,200 s cap fired, which misled the 5 November gate (10.46) | say which limit fired | 1 line |
| **A failure's log is overwritten by the next run, which is why the lanecost flake could not be diagnosed: nobody can say which assertion failed in 5 of 51 runs** | keep a failed check's log under its time | about 5 lines. **Most valuable line in this table** |
| Four checks sit within about 25% of the cap on a loaded run (start 1,007 s, shaping 956, peds 944, walkers 920), and timed out together before | a decision: raise the cap, or cut those samples, which costs a measurement each | raising it is 1 line; cutting is C-sized |
| 22 entries in check-times.json for checks deleted on 14 October | prune on write | 1 line |

**B. A MEASURED LIST OF WHICH CHECKS PASS ON THEIR SEEDS, in place of guessing. CODEX'S, AFTER A IS VERIFIED AND MERGED (DECISIONS 10.61).** A load hook, no change to src, that shifts every seed `seedGraph` is given; the suite run at two shifts. **About 70 minutes of wall, little attention, and it returns the real inventory.** Whatever fails is a suspect, not a verdict, since a fair check can fail on a bad draw: each gets read. **The follow-up is the unbounded part: see the boundary. Not every seed goes through `seedGraph`, so a pass here is not proof, and a hook that moves nothing must be shown not to.**

**C. KNOWN UNSOUND, by name.** Each is: re-confirm on main, state where its bar comes from, restate as a measured spread or derivation, sabotage. So about 2-3 runs of that check, plus reading.

| check (last time) | what is wrong | status at 28 October | note |
|---|---|---|---|
| verify-lanes "how tight" (553 s) | encoded the confidence and aggression conflation | restated on `aggression-phase1` only | **not on main**; goes with that branch |
| verify-keepright exceptions (279 s) | two definitions of "no gap" | same | same |
| verify-rivals (214 s) | asserts ZERO crashes; main crashes about 1 run in 5-6 at those settings | pending, after IN FLIGHT 40 | a rate needs the rate measured. The brake reaction (10.46) has moved it since |
| verify-shaping (956 s) | passes only on seeds 1-2; jolts on 3 of 8 | pending the trace | slowest here |
| verify-loop (512 s) | speed spread floor of 10 on ONE seed, which fails with the delay off too (7.57, seed 3; 10.46) | found 5 November, not fixed | its world has the delay off, so it passes |
| verify-promotion (35 s) | asserts a 22 October agreement with the wrong lane rule | pending | cheap |
| verify-signal (172 s) | blames corner braking (-5.87 m/s^2) on the amber | pending | a proxy that stopped tracking its target |
| verify-headway (440 s) | a sample floor: 8 of 8 agree, none missed | pending | **possibly already answered:** six seeds were added on 4 November. Check before working on it |
| verify-drive (107 s) | one lucky pass of four; the queue is IN FLIGHT 37 | pending | seen on a branch; re-confirm |
| verify-courtesy (728 s) | "noticed being let in" 2/2 and courtesy-off 0/2, untraced | seen on `cross-node-gap` | may not exist on main |
| verify-lanecost (427 s) | 5 failures of 51, cause unknown | rewritten 10.56, flake never reproduced | **no work; wait for a log (A)** |

**D. NEVER AUDITED: 11 checks newer than the 22 October sabotage pass, not named in the audit above.** verify-contact and verify-reaction were sabotaged when written (on the record), so only need entering. **Nine to break once each, on their own module, one run each:** anticipation (428 s), checks (385), encounters (62), lookaway (546), merge (391), mergecount (395), promotion (35), shaping (956), skill (31). About 50 CPU-minutes if each fails at the first try; four at once, about 15 of wall.

**E. NO WORK: RULED (DECISIONS 10.59). "Never caught a real regression."** The 17 in group 2 below have each been broken on purpose and seen it. Not having caught a regression is what a guard on stable code looks like, and cutting one is a bet with nothing to gain but its time. If time is the point, verify-start is the one to look at. The project lead accepted this and corrected their brief: never-fired is answered by D, the never-sabotaged.

**THE BOUNDARY, BECAUSE THIS EXPANDS:** A, then B, then read what B returns; **C only for what B or a re-confirmation shows is still wrong on main**; D last. No new checks. A check that fails for a real defect gets the defect reported and is not fixed in this work. **Stop at the end of B and report the count before committing to the rest.** What B returns cannot be sized before it runs, and that is the honest uncertainty in this plan.

**Rough order of cost, machine time, attention not estimated:** A under an hour with one derived run; B 70 minutes of wall; C 2-3 runs of each that survives; D 15 minutes of wall.

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

- **Two duplicated warm-ups removed, sabotaged before reaching `main` (3
  November).** `verify-courtesy` section 7 and `verify-trucks` section 7 now
  reuse a world the check had already stepped; same worlds, same trials, same
  floors. Old and new side by side under one load: courtesy 593 -> 434 s, trucks
  571 -> 548 s, output identical line for line (31 and 41 lines). The 893 -> 422
  first recorded for courtesy compared a loaded run with a solo one. Sabotaged,
  each failing the check: "let in" never said (0 of 5), nobody offers (0 of 8),
  `fits` always true (63 of 361 passages), the shared observer unhooked (0 of 0
  against the floor of 40), trucks not spanning their path (0.43 m against
  0.05). The proof that trials leave the warmed world alone
  (`measure/courtesy-warm.mjs`) goes false when a trial nudges it by 1e-9 m.
  **Two sabotages first missed, and the sabotage was the fault:** a nudge in
  `gapBeside` landed on the trial's own copy, and a rear at half a body length
  still leaves both ends on the path, which is all section 3 claims. A sabotage
  that survives has to be read before it is believed either way.

**Gemini's numbers (`REPORT-CHECKS.md`, 30 October; supplied by the maintainer, committed 3 November).** Its reasoning about where the time goes is sound. **Do not plan from a timing it quotes, because a number from a loaded run is not a cost. That is a property of the number, not a finding that the report is wrong:** nothing here shows any of its figures to be wrong, and only one has been checked. That one, as relayed: 832 s for `verify-courtesy` is this project's own row, `check-history.jsonl`, 28 October at `962033b`, with 49 checks run together. From 27 October the check ran 476-895 s loaded, whatever the code did, and 221 s nearly alone on 3 November. (465 s, once set against it by mistake, is `verify-compliance` on 28 October, a different check.)

**ITS §5, AS RELAYED, IS TOO ABSOLUTE FOR THIS HARNESS: "never poll `manage_task status` in a loop ... await the system notification", written about that report's own tools, is not the rule here, and neither is its opposite.** On 28 October a session ended its turn waiting on a verification run, went idle, and was not woken until a person asked; it cost hours. **The rule, agreed with the project lead: never make a notification the only way a run gets read.** Polling in a loop is not what this asks for: leave a long fallback that checks the result, and when somebody asks whether a run has landed, read the file. **The 28 October failure is one incident, not a standing property:** every run on 3 November did notify. That is a change worth knowing and one day's evidence of it; the rule costs little either way, so it does not wait to learn which holds.

**`verify-keepright` in worker threads (4 November, the report's recommendation, measured fresh).** Near alone on 16 threads: 327 s as one process, 123 s at 3 workers, 69 s at 9, output identical line for line; it runs at 4 by default, a quarter of the machine, like `verify-compliance`. The report's 811 s to about 300 s started from a loaded run. **Sabotaged four ways, each failing:** a worker that dies exits non-zero and names the run; a mode ignored fails; a run dropped fails, by a new guard, since the floors alone would pass on two seeds of three; an immediate return fails. **The baseline's output exposed a blind spot:** `median undefined` on "the return is not a snap". 132 of 223 returns happen on the exit stretch and carry no delay, so they sorted last and were never timed, and the assertion reads only the smallest. It now says 91 timed and 132 not. **Still not checked: that an exit-stretch return waits**, which has its own clock.

**IF YOU GROW A CHECK'S SAMPLE, UPDATE ITS TIME, OR THE RUNNER WILL KILL IT (a real cost, 4 November).** `check.mjs` times a check out at three times its last recorded time (`tools/check-times.json`), and a check that is killed never records a new one. So a check whose sample has just grown reads `TIMEOUT` until somebody updates it: on 4 November `verify-courtesy` and `verify-headway` both did, in a suite where each passes when run directly (279 s and 157 s). It looks like a hang and it is not a failure. **Run the check directly, put its real time in `check-times.json`, and commit that with the sample.** The same flaw works the other way: times recorded nearly alone give a timeout a loaded suite can exceed (3 November, `verify-trucks`), so a time from a loaded run and one from a quiet run are not interchangeable. **The runner is not fixed.**

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

**verify-lanecost's second assertion was rewritten on 5 November (DECISIONS 10.56)** from a difference of wall-clock medians to the CPU spent inside lanechange.js. The flake was not reproduced, under load, in the old form or the new: if it fails again, read its log first.

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
