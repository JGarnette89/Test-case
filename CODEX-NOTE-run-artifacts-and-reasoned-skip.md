# For Codex: tracked run artifacts, and a skip that speaks (11 November 2026)

Written from the real-position session (branch `realpos` / `ccr-6d84c5d9-cbyl9k`). Both items are
`tools/`, so yours; nothing here was fixed on this side. The separate, earlier note is
`CODEX-NOTE-verify-check-runner.md` (a Windows `--import` path bug, red on `main` at `5a000f3`).

## 1. The runner writes tracked files, and the pollution survives across sessions

**Observed.** A run of `node tools/check.mjs` rewrites three tracked files. After the 53-check run on a clean
tree at `9846768` (11 November), `git status` showed:

    M tools/check-hashes.json     +54 lines
    M tools/check-history.jsonl   +1 line
    M tools/check-times.json      105 lines changed

**The strongest evidence: this session STARTED with `check-history.jsonl` and `check-times.json` already
modified**, in a tree nobody was working in, carrying stale records from **28 October** (two appended history
lines dated 2026-10-28, 78 lines changed in the times file). So the pollution outlives the session that made it,
and nobody noticed for about a fortnight. A signal that is always on carries no information.

**Why it matters.** The point of a dirty tree is that it means somebody changed something. `changedFiles()` in
`tools/affected.mjs` is `git diff --name-only HEAD` plus staged plus untracked (read from the code, not run), so
these files count as changed files every time. The runner's own "N changed file(s)" and any determinism reading
off a clean tree are sitting on that noise.

**Question, not a claim: is `check-hashes.json` a deliberate committed baseline or a third artifact?** It is new
with your runner change and a normal run rewrote it (+54 lines). You wrote it and will know; I have not guessed.
If it is meant to be committed, then the question is when (after a verified run, by whom), because today it
changes on every run like the other two.

**Not done here:** none of the three were committed on the branch; they are left uncommitted in the worktree.

## 2. A skip that speaks: the runner needs four states, and today it has two and a half

**The maintainer's ruling (an inverted tripwire for a known-open defect was refused: two tolerated reds is a
suite people learn to read past).** What is wanted: **an assertion can be live but SKIPPED with a named reason,
and the run reports skipped-with-reason beside pass and fail.** Four different states, and the run should be
able to say all four:

- **pass**
- **fail**
- **cannot tell** (the check could not show that the situation arose; see the standing requirement in
  `CLAUDE.md` item 3)
- **skipped, for this named reason** (e.g. "waiting on DECISIONS 10.67, the box defect")

Why it is the same defect as the eleven checks in your seed inventory that cannot tell "wrong" from "never
arose": a check missing from the suite is indistinguishable from a check that passes, and we cannot see what we
are not running. The first customer is a pending assertion (DECISIONS 10.70, "A PENDING ASSERTION"): the box
ticks must read under 1 mm sideways, today they read 268 mm, and the assertion must exist, be skipped, and be
counted, so that whoever closes the defect is told to turn it on.

**As far as I read the runner, it cannot express this** (it knows ok / FAIL / TIMEOUT / SLOW). I did not read it
closely enough to say what the smallest change is.

## 3. A small one: whole-second timings make any nonzero run "SLOW"

`verify-core` recorded 0 s in `check-times.json`; it ran in about a second and was reported
`SLOW ... exceeded recorded 0 s; timing refreshed`. It passed. A recorded time that rounds to zero makes any
real run SLOW; a floor on the comparison would stop that line being noise.

## What this note does NOT say

I have not reproduced your seed-shift failures on this tree. Four of the checks you list as failing
(`verify-peds`, `-passing`, `-courtesy`, `-generate`) passed here, at their native seeds, which is your control
and so is not corroboration of anything.
