# Task B seed inventory — completed 11 November 2026 UTC

Both full suites finished on frozen main `5a000f3697a820b3e10a22c887bd8307d8add4e1`.
There are **14 distinct suspects**, not 14 confirmed defects. Stop here for review;
no Task C/D repairs, application changes, check assertions, or samples were made.

| seed offset | successful | failed | timed out | wall time |
|---|---:|---:|---:|---:|
| +11 | 49 (48 ok, 1 SLOW) | 9 | 0 | 6,513.664 s |
| +29 | 50 (49 ok, 1 SLOW) | 8 | 0 | 6,502.840 s |

`SLOW` is a successful check exceeding its recorded duration. All 58 checks ran
once per offset. Three failed in both runs; 44 succeeded in both. The complete
matrix, coverage, hook proof, all 17 failing outputs, and 116 timestamped log
receipts with SHA-256 hashes are in [seed-inventory-results.json](seed-inventory-results.json).

## What failed, read against the frozen checks

These are observed assertions and possible investigation directions, not root
cause verdicts. A composite failure does not identify which conjunct failed.

| check | +11 | +29 | observation |
|---|---|---|---|
| verify-bench | FAIL | pass | Drawing-only switches ended with 34 crossers / 299 walkers versus baseline 33 / 300; moving count unchanged. Investigate restart/state equivalence. This was not a wall-time budget failure. |
| verify-checks | pass | FAIL | Two crashes in the constructed checking scenario; investigate the events before deciding whether the zero-crash assertion is justified. |
| verify-contact | FAIL | FAIL | +11: all 99 crossings had correct entry records, but the check requires at least 100. +29: worst parked-car escape was 93.4 s at 70 degrees, and the 70 km/h inoperable-car immobility assertion also failed. These are different assertions and need separate review. |
| verify-courtesy | FAIL | pass | Only 3 noncourteous trials, minimum 4; none offered. The logged failure does not demonstrate an inappropriate courtesy offer. |
| verify-drive | pass | FAIL | Zero observed stop-leg waiting car-ticks, requires more than 20; no trace yet distinguishes missing exposure from incorrect yielding. |
| verify-encounters | FAIL | pass | Zero gap encounters in four minutes; other encounter categories were nonzero. |
| verify-generate | FAIL | FAIL | Rolling-stop west versus control: 39% / 21% of 105 at +11, 41% / 24% of 102 at +29. Both increased, but neither met the required greater-than-twofold ratio. |
| verify-merge | pass | FAIL | Longest joiner wait at 300 cars was 87 s; assertion allows no more than a minute. |
| verify-passing | FAIL | pass | Zero observed moments where the bold driver would pass and the timid driver would not; no reversed moments either. |
| verify-peds | FAIL | pass | Constructed NPC pedestrian step-out-and-impact conjunction failed; output does not say whether step-out, impact, or both were missing. |
| verify-promotion | pass | FAIL | Next-lane case returned `ahead,queue,space,arrival`; assertion requires `space` and excludes `ahead` and `behind`. Investigate placement and admission reasons. |
| verify-rivals | pass | FAIL | 45 overlap detections, not necessarily 45 distinct collisions. Trace before assigning a cause. |
| verify-signs | FAIL | FAIL | Uncontrolled crossroads produced 25 and 3 minor-road crossings, respectively; required minimum is 30. The printed historic “it was 1” is explanatory text, not this run's measurement. |
| verify-skill | FAIL | pass | Four new drivers, all compliant with the observation bound; assertion requires more than five arrivals. |

The contact, courtesy, and skill sample floors are directly identifiable from
the conditions and output. Other observations still require tracing or a
measured distribution. This inventory does not authorize weakening any bar.

## Method and limits

Tool revision: `9f4fa6d`. Reproduce with
`python tools/seed-inventory.py --ref 5a000f3 --shifts 11 29 --jobs 3 --timeout 2400`.
Each run used `node tools/check.mjs --all --jobs 3 --timeout 2400`, with the load
hook passed through `NODE_OPTIONS`. The explicit limit prevents the previous
1,200 s contention timeout from truncating this diagnostic inventory; it does
not change the production cap or any check's sample.

The hook shifts source `src/sim/crossing.js` `seedGraph` arguments in memory.
The zero-offset control matched unhooked actors; +11 and +29 matched unhooked
seed 18 and 36 for input 7, differed from seed 7, and exercised worker threads.
Each full run recorded 618 calls, including 182 worker calls. Evidence samples
were checked against the configured offset. Terminated workers' counters can
be lower bounds; evidence is saved on the first call as well as normal exit.

Eleven checks recorded no source `seedGraph` calls: chase, check-runner, core,
course, crossing, map, perf, screens, sim, telling, and wheel (all `verify-*`).
Other RNG entry points and bundled copies are outside this hook. Their passing
results are execution results, not evidence of seed-shift robustness. Even for
covered checks, two offsets are not a proof across all seeds.

## Integrity and handoff

Both runs used a Git archive under `tools/scratch`, with identical source and
initial timing metadata. All 333 source/check files retained their SHA-256
manifest; all 116 result logs have completion footers. The experiment's times,
history, and hashes were restored byte-for-byte. The actual checkout's three
metadata files still match Git, and `git diff HEAD -- src` is empty.

The runner fixes remain merged on main as `5a000f3`; Task B tools and evidence
are on `codex/seed-inventory` for review. No new `verify-*` check was added for B.
The standalone hook proof is mandatory in the inventory driver.

The served GitHub Pages stamp remains unverified: the environment proxy denied
the request with CONNECT 403, and its enforced allowlist still excludes
`jgarnette89.github.io`. The previously saved environment draft adding that
host needs to be applied in environment settings before served verification.

Suggested review order, requiring a new assignment: examine the +29 contact
recovery/immobility cases, the low-throughput crossroads, and overlap/crash
events; then assess sample floors and comparative bars. Do not treat older
TESTING.md diagnoses as conclusions about this revision. No follow-up fixes
or sabotage tests were started.
