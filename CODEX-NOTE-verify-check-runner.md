# verify-check-runner: FIXED on main (11 November 2026). The cause, the layer, the fix.

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

The runner reporting four states (pass, fail, cannot tell, skipped-with-named-reason); `check-hashes.json`,
`check-history.jsonl` and `check-times.json` being rewritten into tracked files on every run; `verify-core`
reporting SLOW against a recorded 0 s.
