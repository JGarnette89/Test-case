# Work list: the check runner and its artifacts (ours; 11 November 2026)

**This was written as a note to Codex and is re-pointed.** On 11 November the maintainer ruled that other agents are
shelved unless he explicitly asks for one, and that one agent owns the whole repo, `tools/` included (DECISIONS 10.70,
"THE LANE RULE IS SUPERSEDED"). So these are items for whoever works here next, not for someone who isn't coming.

**NOTHING BELOW IS STARTED.** The check-honesty pass (per-check exposure lines, then the `verify-contact` split)
comes first. Marks follow the standing rule: `[M]` a run printed it, `[D]` derived or read from the code, not run.

## 1. The runner writes tracked files, and the pollution survives across sessions

**Observed `[M]`.** A run of `node tools/check.mjs` rewrites three tracked files. After the 53-check run on a clean
tree at `9846768` (11 November), `git status` showed:

    M tools/check-hashes.json     +54 lines
    M tools/check-history.jsonl   +1 line
    M tools/check-times.json      105 lines changed

**The strongest evidence `[M]`: the session that did this work STARTED with `check-history.jsonl` and
`check-times.json` already modified**, in a tree nobody was working in, carrying stale records from **28 October**
(two appended history lines dated 2026-10-28, 78 lines changed in the times file). The pollution outlives the session
that made it and nobody noticed for about a fortnight. A signal that is always on carries no information.

**Why it matters `[D: read from tools/affected.mjs]`.** `changedFiles()` is `git diff --name-only HEAD` plus staged
plus untracked, so these files count as changed files every time. The runner's own "N changed file(s)" and any
reading off a clean tree sit on that noise.

**`check-hashes.json`: THE OPEN QUESTION IS ANSWERED `[D: read from check.mjs lines 68, 100, 131, 144 and
check-policy.mjs, not run]`.** It stores the sha256 of each check's file at its last PASS. The budget policy reads it
beside `check-times.json`: a check that is "new, changed or unhashed" gets the 1,200 s cap, otherwise three times its
recorded time. It is written on every run. So it is a run-state cache of the same class as `check-times.json`, not a
human-reviewed baseline: a third artifact, not a deliberate record.

**The decision that is now ours.** Commit them (a fresh clone gets tight per-check budgets) or ignore them (a clean
tree). `check.mjs` already has an explicit `--record-times`; a likely shape is a committed seed written only by that
flag, with the per-run writes going somewhere ignored. Decide when this is started, and write down which.

## 2. A skip that speaks: the runner needs four states, and today it has two and a half

**The maintainer's ruling (an inverted tripwire for a known-open defect was refused: two tolerated reds is a suite
people learn to read past).** What is wanted: **an assertion can be live but SKIPPED with a named reason, and the run
reports skipped-with-reason beside pass and fail.** Four different states, and the run should be able to say all four:

- **pass**
- **fail**
- **cannot tell** (the check could not show that the situation arose; see the standing requirement in `CLAUDE.md`
  item 3)
- **skipped, for this named reason** (e.g. "waiting on DECISIONS 10.67, the box defect")

It is the same defect as the checks that cannot tell "wrong" from "never arose": a check missing from the suite is
indistinguishable from a check that passes, and we cannot see what we are not running. **The first customer is a
pending assertion** (DECISIONS 10.70, "A PENDING ASSERTION"): the box ticks must read under 1 mm sideways, today they
read 268 mm, and the assertion must exist, be skipped, and be counted, so that whoever closes the defect is told to
turn it on. **`[D]` As far as I read the runner it knows ok / FAIL / TIMEOUT / SLOW and cannot express this;** the
smallest change has not been worked out.

## 3. A small one: whole-second timings make any nonzero run "SLOW"

`verify-core` recorded 0 s in `check-times.json`; it ran in about a second and was reported
`SLOW ... exceeded recorded 0 s; timing refreshed`. It passed. A recorded time that rounds to zero makes any real run
SLOW; a floor on the comparison would stop that line being noise.

## 4. Found since, and ours

- **`tools/check-runner-test.mjs` lines 118 and 119 are redundant with earlier assertions `[M]`.** After the Windows
  fix, sabotaging the runner (it exits 0 on a timeout; the cap changed to 900 s) fails the test at line 77 through the
  `run()` helper and at the policy unit test, both BEFORE the lines aimed at. No mutation found isolates them.
- **The bare-path class.** Any `--import` or `NODE_OPTIONS=--import=` given a bare Windows path fails with
  `ERR_UNSUPPORTED_ESM_URL_SCHEME` `[M]`. Fixed in the runner's test. **Still present, unadopted, in
  `tools/seed-shift-test.mjs` and `tools/seed-inventory.py` on the `codex/seed-inventory` branch `[M: the hook's own
  proof test fails on this machine]`.** If the seed-shift hook is adopted, its test and driver take file URLs.
- **The seed-shift hook** is a live dependency on an orphaned branch; the review and the recommendation are in
  DECISIONS 10.70 ("THE SEED-SHIFT HOOK, REVIEWED AS CODE").
