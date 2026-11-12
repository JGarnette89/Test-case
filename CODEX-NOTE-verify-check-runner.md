# verify-check-runner: FIXED on main (11 November 2026). The cause, the layer, the fix.

**Ownership change, 11 November: other agents are shelved and one agent owns the whole repo, `tools/` included. This was written as a handover to Codex and is kept as the record of the diagnosis; there is nobody to hand it to, and the fix it describes is on `main`. See DECISIONS 10.70.**

**Status: fixed in `tools/check-runner-test.mjs`, one import and one argument. `verify-check-runner` passes on
Windows 11, Node v24.19.0.** Pull `main`.

**This was an exception to the lane rule, not a change to it.** `tools/` is yours. The maintainer authorised the fix
on 11 November on these grounds, any one of which being false would have made the answer no: the fix is known and
tiny; `main` had been red all day and a red baseline taxes every measurement; you were blocked on a machine problem
and not working; and nothing on either of your branches touches the runner or its test since `5a000f3` (read from
the repo after a fetch), so there was no collision. His condition: establish which layer is wrong before fixing
anything, and if it were the runner, leave `main` red and hand you the diagnosis.

## The cause, measured

`tools/check-runner-test.mjs` line 116 spawned `node --import <clock> check.mjs verify-probe` with
`clock = join(dir, "fast-clock.mjs")`, a bare Windows path (`C:\...\fast-clock.mjs`). `--import` takes a module
specifier; on Windows a bare drive-letter path is read as the URL scheme `c:` and Node refuses it. The child never
starts. Captured from the test's own child, on a clean tree at `57a3417`:

    status: 1 | stdout bytes: 0
    Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported by the
    default ESM loader. On Windows, absolute paths must be valid file:// URLs. Received protocol 'c:'
        at throwIfUnsupportedURLScheme (node:internal/modules/esm/load:193:11)
        at defaultLoadSync ... at ModuleLoader.getOrCreateModuleJob ...

Status 1 with empty stdout is why line 118 (`assert.equal(capped.status, 1)`) passed and line 119 (the `TIMEOUT`
regular expression) found nothing.

## Which layer: the test's fixture, not the runner (the evidence)

1. The only use of `--import`, `NODE_OPTIONS` or `execArgv` anywhere in `tools/` (outside scratch) is the test's own
   line 116. `check.mjs`, `check-policy.mjs` and `affected.mjs` never pass any of them. The runner launches each
   check as `[process.execPath, [c.file]]`: the script is an argument, which works on Windows (53 checks ran through
   it that day).
2. The failing stack contains **no runner frame**. It is entirely Node's own loader at startup. The child dies at
   preload, before `check.mjs` executes.
3. Every assertion in the test before line 119 ran the runner on Windows without trouble; only the one that used
   the preload failed.

## The fix

    import { fileURLToPath, pathToFileURL } from "node:url";
    ...
    ["--import", pathToFileURL(clock).href, join(dir, "check.mjs"), "verify-probe"]

with a comment saying why. Nothing in the runner was changed.

## Verified by reading the line, not the exit status

Before the fix the child never started. After it the runner's cap path runs for the first time on this machine, and
the line the test was always asking for is printed:

    TIMEOUT verify-probe               0 s -- killed after 1200 s (1,200 s cap); assertions incomplete; log ...

`node tools/verify-check-runner.mjs` exits 0. Sabotaged (runner exits 0 on a timeout; cap changed to 900 s): both
fail the test, **but at earlier lines than the ones aimed at** (test line 77 through the `run()` helper, and the
policy unit test), so **lines 118 and 119 are redundant with assertions before them and are not individually
exercised by those mutations**. I did not find a mutation that isolates them; that is yours to judge.

## Not checked

Linux and macOS (a bare POSIX path is accepted by `--import`, so it should be unaffected). The rest of the runner's
behaviour under Windows beyond what this test covers.

## Still open for you (from `CODEX-NOTE-run-artifacts-and-reasoned-skip.md`, not touched here)

**0. THE RUNNER DISCOVERS CHECKS FROM UNCOMMITTED CHANGES ONLY -- A DEFECT IN THE GATE, AND THE FIRST ON THIS LIST (13 November, the maintainer).** `node tools/check.mjs` derives "the checks the working tree's changes can break" from `git diff HEAD` plus staged plus untracked files (`changedFiles` in `tools/affected.mjs`). On work that is ALREADY COMMITTED, which is the case that matters most (verifying what is about to be merged), the diff against HEAD is empty: a bare run on two committed, ungated commits reported `3 changed file(s) -> 1 check(s) can see them` (the three were the runner's own history files) and would have passed having verified almost nothing; the 62 checks the commits could reach had to be named by hand (`node tools/affected.mjs <files changed since the base>` lists them, `node tools/check.mjs <names>` runs them). A GATE THAT QUIETLY PASSES BY DOING NOTHING IS THE FAILURE THE WEEK WAS SPENT REMOVING FROM THE CHECKS THEMSELVES, one level up in the tool that runs them, and it can make every other guarantee void, since a green gate is what every merge and every commit message leans on. NOT FIXED. WHAT A FIX HAS TO DO, stated so it is not re-derived: take a BASE (the merge target, `origin/main` by default, or `--since <ref>`) and derive from `git diff <base>...HEAD` as well as the working tree; say in the first line which base and how many files; and REFUSE TO PASS WHEN THE DERIVED SET IS NEARLY EMPTY AGAINST A NON-EMPTY DIFF TO THE BASE (or report it as "cannot tell", the third of the four states below). A check of the runner's own: a committed change to a src file must select the checks that import it.

**1. (was the first item) The runner reporting four states (pass, fail, cannot tell, skipped-with-named-reason)** -- the SKIPPED-WITH-REASON state was BUILT on 12 November (`tools/lib/shortfall.mjs`, a `SKIP` line counted and listed by the runner, commit `8c64dbf`); "cannot tell" is not.

Also still open: `check-hashes.json`, `check-history.jsonl` and `check-times.json` being rewritten into tracked files on every run; `verify-core` reporting SLOW against a recorded 0 s.

(The original paragraph, kept as written:)

The runner reporting four states (pass, fail, cannot tell, skipped-with-named-reason); `check-hashes.json`,
`check-history.jsonl` and `check-times.json` being rewritten into tracked files on every run; `verify-core`
reporting SLOW against a recorded 0 s.
