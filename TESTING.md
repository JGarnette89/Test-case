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

## The rule that comes out of it

CLAUDE.md, cold-start item 8. In short: iterate with `node tools/check.mjs
--direct`; commit with `node tools/check.mjs` (the derived set); `--all`
before a milestone ships or when something unexplained happens; legacy
only when `src/engine/` changes. Every check has a timeout and a recorded
time, every run a line in the history.
