# verify-check-runner fails on origin/main (5a000f3) on Windows, and why

**Reproduced on a pristine detached worktree of `origin/main` at `5a000f3`. No merge involved.**
Windows 11, Node v24.19.0. `node tools/verify-check-runner.mjs` exits 1.

## What fails

`tools/check-runner-test.mjs:119`:

    AssertionError [ERR_ASSERTION]: The input did not match the regular expression /TIMEOUT.*1200 s \(1,200 s cap\)/. Input: ''

`capped.stdout` is the empty string. Everything before it passes (all the PASS lines up to
"changed hash and explicit timing refresh use the cap").

## Root cause (checked directly)

Line 116 spawns `node --import <clock> check.mjs verify-probe` with `clock = join(dir, "fast-clock.mjs")`,
a bare Windows path (`C:\...\fast-clock.mjs`). Node on Windows refuses a bare drive-letter path for
`--import`:

    node:internal/modules/esm/load:193
        throw new ERR_UNSUPPORTED_ESM_URL_SCHEME(parsed, schemes);
    exit 1

So the child dies before the runner starts: stdout empty, exit status 1, error on stderr.
Passing a file URL works (`--import file:///.../fc.mjs` ran).

**Suggested fix:** `"--import", pathToFileURL(clock).href` (import `pathToFileURL` from `node:url`).

## The check also passes one of its own assertions for the wrong reason

Line 118, `assert.equal(capped.status, 1, capped.stderr)`, is satisfied by the crash above, since a crash
also exits 1. Once the import works, the status assertion would be the real one. Worth sabotaging
after the fix: make the cap not apply and confirm line 118 or 119 fails.

## Not checked

Whether it also fails on Linux/macOS (it should not: a bare POSIX path is accepted by `--import`).
