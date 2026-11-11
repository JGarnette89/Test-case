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
import { affected, checks } from "./affected.mjs";

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
console.log(`ALL RUNNER TESTS PASSED; retained fixture evidence: ${root}`);
