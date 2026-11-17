/* Small runner regression tests; run explicitly with:
 *   node tools/check-runner-test.mjs
 * Runs the real runner/selector in an isolated tools/scratch/ checkout-shaped
 * directory. No simulation, existing checks or production timing records run.
 * Evidence is retained there for inspection; nothing under src/ is written.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { budgetFor, outcomeOf } from "./check-policy.mjs";
import { affected, checks, baseRef, changedFiles, cannotTell, nothingChanged, NOISE } from "./affected.mjs";
import { execSync } from "node:child_process";

assert.ok(checks().some((c) => c.name === "verify-check-runner"), "runner regression test must be discovered");
for (const file of ["tools/check.mjs", "tools/affected.mjs", "tools/check-policy.mjs", "tools/check-runner-test.mjs", "tools/verify-check-runner.mjs"]) {
  for (const direct of [false, true]) assert.ok(
    affected([file], { direct }).some((c) => c.name === "verify-check-runner"),
    `${file} must trigger verify-check-runner (direct=${direct})`,
  );
}
console.log("PASS: suite discovery and automatic selection for all runner inputs");

const TOOLS = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(TOOLS, "scratch"), { recursive: true });
const root = mkdtempSync(join(TOOLS, "scratch", "runner-test-"));
const dir = join(root, "tools");
mkdirSync(dir);
for (const name of ["check.mjs", "check-policy.mjs", "affected.mjs"]) copyFileSync(join(TOOLS, name), join(dir, name));
const probe = join(dir, "verify-probe.mjs");
const timesFile = join(dir, "check-times.json"), hashesFile = join(dir, "check-hashes.json");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const seed = (seconds) => {
  writeFileSync(timesFile, JSON.stringify({ "verify-probe": seconds }));
  writeFileSync(hashesFile, JSON.stringify({ "verify-probe": createHash("sha256").update(readFileSync(probe)).digest("hex") }));
};
function run(args = [], expected = 0) {
  const r = spawnSync(process.execPath, [join(dir, "check.mjs"), "verify-probe", ...args], { cwd: root, encoding: "utf8", timeout: 10000 });
  assert.ifError(r.error);
  if (r.stdout.trim()) console.log(r.stdout.trim());
  assert.equal(r.status, expected, r.stderr);
  const history = join(dir, "check-history.jsonl");
  const last = existsSync(history) ? readFileSync(history, "utf8").trim().split("\n").at(-1) : null;
  return { ...r, record: last ? JSON.parse(last) : null };
}

// Exercise every boundary without waiting 20 minutes to test arithmetic.
for (const [recorded, seconds, reason] of [[10, 90, "90 s floor"], [40, 120, "3x its last time"], [400, 1200, "1,200 s cap"], [1000, 1200, "1,200 s cap"]]) {
  assert.deepEqual(budgetFor({ recorded, sameFile: true }), { seconds, reason });
}
assert.equal(budgetFor({ recorded: 1, sameFile: false }).seconds, 1200);
assert.equal(budgetFor({ recorded: 1, sameFile: true, recordTimes: true }).seconds, 1200);
assert.equal(budgetFor({ recorded: 1, sameFile: false, recordTimes: true, timeout: 0.25 }).seconds, 0.25);
assert.equal(outcomeOf({ timedOut: false, code: 9, seconds: 10, recorded: 1, sameFile: true }), "FAIL");
console.log("PASS: floor, multiplier, cap, changed-file and override budgets");

writeFileSync(probe, 'console.log("passed fixture"); await new Promise(r => setTimeout(r, 120));\n');
seed(0.001);
const slow = run();
assert.match(slow.stdout, /SLOW.*assertions passed/);
assert.ok(read(timesFile)["verify-probe"] > 0.1);
assert.equal(slow.record.results[0][1], "SLOW");
console.log("PASS: exceeded recorded runtime without an assertion failure; successful timing refreshed");

// A changed sample/check is unrecorded; no historic short budget is reused.
writeFileSync(probe, readFileSync(probe, "utf8") + '// changed fixture\n');
const changed = run();
assert.match(readFileSync(changed.record.logs[0].path, "utf8"), /new, changed or unhashed/);
assert.equal(changed.record.results[0][1], "ok");
const refreshed = run(["--record-times"]);
assert.match(readFileSync(refreshed.record.logs[0].path, "utf8"), /cap \(--record-times\)/);
console.log("PASS: changed hash and explicit timing refresh use the cap");

writeFileSync(probe, 'console.log("failure stdout"); console.error("failure stderr FINAL MARKER"); process.exitCode = 7;\n');
seed(10);
const failed = run([], 1);
assert.match(failed.stdout, /FAIL.*exit 7/);
assert.equal(read(timesFile)["verify-probe"], 10);
const failurePath = failed.record.logs[0].path;
const failureText = readFileSync(failurePath, "utf8");
assert.match(failureText, /failure stdout/);
assert.match(failureText, /failure stderr FINAL MARKER/);
assert.match(failureText, /result FAIL/);

writeFileSync(probe, 'console.log("timeout stdout"); console.error("timeout stderr"); setInterval(() => {}, 1000);\n');
seed(10);
const timeout = run(["--timeout", "0.25"], 1);
assert.match(timeout.stdout, /TIMEOUT.*0.25 s \(--timeout override\).*assertions incomplete/);
assert.equal(timeout.record.results[0][1], "TIMEOUT");
assert.equal(read(timesFile)["verify-probe"], 10);
const timeoutPath = timeout.record.logs[0].path;
assert.match(readFileSync(timeoutPath, "utf8"), /timeout stderr/);

// Timeout must still terminate descendants, not only the check wrapper.
if (process.platform !== "win32") {
  const marker = join(dir, "orphan-marker");
  const childCode = `setTimeout(() => require("node:fs").writeFileSync(${JSON.stringify(marker)}, "orphan"), 600);`;
  writeFileSync(probe, `import { spawn } from "node:child_process"; spawn(process.execPath, ["-e", ${JSON.stringify(childCode)}], { stdio: "inherit" }); setInterval(() => {}, 1000);\n`);
  run(["--timeout", "0.25"], 1);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(existsSync(marker), false, "a descendant survived the timeout");
  console.log("PASS: timed-out check's descendant killed before its delayed write");
  writeFileSync(probe, 'process.kill(process.pid, "SIGTERM");\n');
  const signalled = run([], 1);
  assert.match(signalled.stdout, /FAIL.*signal SIGTERM/);
  console.log("PASS: signal exit is FAIL, not TIMEOUT");
}
writeFileSync(probe, 'console.log("cap fixture"); setInterval(() => {}, 1000);\n');

// Accelerate only the production budget timer in this isolated child process.
// The runner still computes, enforces and reports the actual 1,200 s policy.
const clock = join(dir, "fast-clock.mjs");
writeFileSync(clock, 'const real = globalThis.setTimeout; globalThis.setTimeout = (fn, ms, ...args) => real(fn, ms >= 90000 ? 100 : ms, ...args);\n');
seed(1000);
// `--import` takes a module specifier, and on Windows a bare drive-letter path is not one: it is read as the URL scheme "c:" and the child dies before the runner starts (11 November, DECISIONS 10.70). A file URL works everywhere.
const capped = spawnSync(process.execPath, ["--import", pathToFileURL(clock).href, join(dir, "check.mjs"), "verify-probe"], { cwd: root, encoding: "utf8", timeout: 10000 });
assert.ifError(capped.error);
assert.equal(capped.status, 1, capped.stderr);
assert.match(capped.stdout, /TIMEOUT.*1200 s \(1,200 s cap\)/);
console.log(capped.stdout.trim());
console.log("PASS: capped timer reports the cap, not 3x its last time (test clock accelerated)");

writeFileSync(probe, 'console.log("subsequent success");\n');
run();
assert.equal(readFileSync(failurePath, "utf8"), failureText);
assert.match(readFileSync(timeoutPath, "utf8"), /result TIMEOUT/);
console.log(`PASS: failure retained after reruns: ${failurePath}\n${failureText.trim()}`);
console.log(`PASS: timeout retained after reruns: ${timeoutPath}`);
for (const value of ["0", "-1", "NaN", "Infinity"]) {
  const invalid = run(["--timeout", value], 2);
  assert.match(invalid.stderr, /--timeout requires positive seconds/);
}
/* THE BASE AND THE REFUSAL (14 November; guarded 17 November, the lead's item: "verified rather than believed" -- nothing in the suite held either). Expectations are stated here, never read from the module:
   (1) the default base is the merge-base with origin/main and it resolves; a base that does not resolve THROWS, never an empty diff;
   (2) COMMITTED work is discovered: against the repository's first commit every file differs, so the selection is nearly the whole suite (at least 60 checks) -- a runner that diffed only the working tree, as the first one did, would select almost none;
   (3) the refusal: 30 code files selecting 1 check is refused (it returns the 30); 30 selecting 5, and 1 selecting 1, are not; files the runner rewrites each run (check-times.json and the like) are not counted as code.
   Sabotage (17 Nov): cannotTell made to return 0 fails (3); the diff made against HEAD only fails (2). */
{
  const b = baseRef();
  assert.match(b.ref, /merge-base\(origin\/main, HEAD\)/); assert.ok(b.full && b.full.length >= 40, "the default base resolves to a commit");
  assert.throws(() => baseRef("no-such-ref-zzz"), /does not resolve/);
  const root0 = execSync("git rev-list --max-parents=0 HEAD", { encoding: "utf8", cwd: dirname(fileURLToPath(import.meta.url)) }).trim().split(/\s+/)[0];
  const l = affected(changedFiles(root0));
  assert.ok(l.length >= 60, `against the first commit the whole suite is selected, got ${l.length}`);
  const fake = Array.from({ length: 30 }, (_, i) => `src/sim/fake${i}.js`);
  assert.equal(cannotTell(fake, [{ name: "x" }]), 30, "30 code files selecting 1 check must be refused");
  assert.equal(cannotTell(fake, Array(5).fill({})), 0); assert.equal(cannotTell(fake.slice(0, 1), [{}]), 0);
  assert.equal(cannotTell(["tools/check-times.json", "tools/check-hashes.json", "tools/check-history.jsonl", "tools/scratch/x.json"], []), 0, "files every run rewrites are not code");
  assert.ok(NOISE.test("tools/check-times.json"));
  /* NOTHING CHANGED (17 Nov): a fully pushed branch (only the files every run rewrites differ) is refused; a documentation-only change, one real file, is not; and the runner itself calls it and exits 3 (read from the source: the isolated fixtures are not a git checkout). Sabotage: nothingChanged returning false fails the first. */
  assert.equal(nothingChanged(["tools/check-times.json", "tools/check-hashes.json", "tools/check-history.jsonl"]), true);
  assert.equal(nothingChanged([]), true); assert.equal(nothingChanged(["DECISIONS.md"]), false); assert.equal(nothingChanged(["src/sim/crossing.js"]), false);
  const runnerSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "check.mjs"), "utf8");
  assert.match(runnerSrc, /if \(nothingChanged\(changed\)\) \{[\s\S]*?process\.exit\(3\)/, "the runner refuses a bare run when nothing changed");
  console.log("PASS: the default base is the merge-base, an unresolvable base throws, committed work is discovered (the first commit selects the whole suite), and the near-empty refusal fires on 30 files / 1 check and nowhere it should not");
}
console.log(`ALL RUNNER TESTS PASSED; retained fixture evidence: ${root}`);
