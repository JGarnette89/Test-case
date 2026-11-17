/* =====================================================================
   THE CHECK RUNNER -- every check with a timeout, in parallel, longest
   first, and nothing left running afterwards (CLAUDE.md, Conventions:
   "Which checks to run").

     node tools/check.mjs                 the checks the working tree's changes can break (tools/affected.mjs)
     node tools/check.mjs --direct        while iterating: only the checks that import a changed file themselves, and screens and core
     node tools/check.mjs --base REF      diff against REF instead of the merge-base with origin/main
     node tools/check.mjs --all           every check
     node tools/check.mjs verify-x ...    these
     --jobs N        how many at once (default: three quarters of the hardware
                     threads, capped by free memory at 0.75 GB a check)
     --timeout S     positive seconds, overriding all other timeout rules
     --record-times  give selected checks the cap and refresh successful timings
                      e.g. node tools/check.mjs verify-lanecost --record-times

   Changed or unhashed check files get the 1,200 s cap. Unchanged checks
   get 3x their last successful runtime, bounded by 90 s and 1,200 s.
   TIMEOUT means killed at that budget; FAIL means a nonzero exit or signal.
   SLOW means assertions passed but runtime exceeded the matching record;
   it exits successfully and refreshes that record, as every success does.
   --record-times ignores the old budget; --timeout still takes precedence.

   NOTHING IS ORPHANED. Children are killed as a tree on a timeout, on
   Ctrl-C and on exit -- the old shell lanes kept launching checks after
   their wrapper was stopped, and two suites then shared their logs.

   Logs: tools/scratch/check-logs/<name>.log is the latest completed run.
   Timestamped originals survive reruns under tools/scratch/check-logs/runs/.
   Scratch is git-ignored: retained locally, not committed or remotely backed up.
   Exit 1 if anything failed
   or timed out. The last line is the count and the wall time -- a run
   that does not print it did not finish.
   ===================================================================== */
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, createWriteStream, copyFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { budgetFor, outcomeOf, passed } from "./check-policy.mjs";
import { cpus, freemem } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checks as allChecks, affected, changedFiles, baseRef, cannotTell, NOISE } from "./affected.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMES = join(ROOT, "tools", "check-times.json");
const HASHES = join(ROOT, "tools", "check-hashes.json");
const LOGS = join(ROOT, "tools", "scratch", "check-logs");
const RUN_LOGS = join(LOGS, "runs");
mkdirSync(RUN_LOGS, { recursive: true });

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
/* THREE QUARTERS OF THE THREADS, NOT HALF (22 October). Measured on the
   maintainer's machine (8 cores, 16 threads, 16 GB): the whole suite on an
   unchanged tree took 1700 s at 8 at once and 1382 s at 12 -- each check
   about 28% slower beside its neighbours, the whole 19% sooner. Memory is
   the limit: at 12 the checks held 7.9 GB and the machine had 0.4 GB free.
   So capped by free memory at 0.75 GB a check (the measured mean was 0.66),
   and never under 2. */
const jobs = Number(opt("--jobs")) || Math.max(2, Math.min(Math.floor((cpus().length * 3) / 4), Math.floor(freemem() / 0.75e9)));
const fixedTimeout = args.includes("--timeout") ? Number(opt("--timeout")) : null;
if (fixedTimeout !== null && (!Number.isFinite(fixedTimeout) || fixedTimeout <= 0 || fixedTimeout * 1000 > 2147483647)) {
  console.error("--timeout requires positive seconds within Node's timer range"); process.exit(2);
}
const recordTimes = args.includes("--record-times");
const named = args.filter((a, i) => !a.startsWith("--") && !["--jobs", "--timeout", "--base"].includes(args[i - 1]));

const times = existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, "utf8")) : {};
const hashes = existsSync(HASHES) ? JSON.parse(readFileSync(HASHES, "utf8")) : {};
const every = allChecks();
const digest = (c) => createHash("sha256").update(readFileSync(c.file)).digest("hex");
const byName = new Map(every.map((c) => [c.name, c]));

let list;
if (named.length) list = named.map((n) => byName.get(n) ?? (() => { console.error(`no such check: ${n}`); process.exit(2); })());
else if (args.includes("--all")) list = every;
else {
  let changed, b;
  try { b = baseRef(opt("--base")); changed = changedFiles(opt("--base")); } catch (e) { console.error(`CANNOT TELL: ${e.message}`); process.exit(3); }
  list = affected(changed, { direct: args.includes("--direct") });
  const real = changed.filter((f) => !NOISE.test(f));
  console.log(`base ${b.ref} (${b.sha}): ${real.length} changed file(s) -> ${list.length} check(s) can see them`);
  const n = cannotTell(changed, list);
  if (n) { console.error(`CANNOT TELL: ${n} code files changed against ${b.ref} but only ${list.length} check(s) selected. Run --all, or name the checks.`); process.exit(3); }
}
const cmdOf = (c) => c.cmd ?? [process.execPath, [c.file]];

/* Longest first, so the slowest never starts last. */
list.sort((a, b) => (times[b.name] ?? 600) - (times[a.name] ?? 600));

const live = new Set();
const killTree = (p) => {
  if (!p || p.exitCode != null) return;
  try { if (process.platform === "win32") execSync(`taskkill /pid ${p.pid} /T /F`, { stdio: "ignore" }); else process.kill(-p.pid, "SIGKILL"); } catch { /* already gone */ }
};
const cleanup = () => { for (const p of live) killTree(p); };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

const t0 = Date.now();
const results = [];
function runOne(c) {
  return new Promise((done) => {
    const [cmd, argv] = cmdOf(c);
    const recorded = times[c.name], hash = digest(c), sameFile = hashes[c.name] === hash;
    const budget = budgetFor({ recorded, sameFile, timeout: fixedTimeout, recordTimes });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logPath = join(RUN_LOGS, `${c.name}-${stamp}-${randomUUID()}.log`);
    const log = createWriteStream(logPath, { flags: "wx" });
    let logError = null;
    const flushed = new Promise((resolve, reject) => {
      log.on("finish", resolve); log.on("error", (e) => { logError = e; reject(e); });
    });
    // Handle immediately; a storage failure must fail the runner, not lose output silently.
    flushed.catch(() => {});
    log.write(`check ${c.name}; started ${new Date().toISOString()}; limit ${budget.seconds} s (${budget.reason})\n`);
    const start = Date.now();
    const p = spawn(cmd, argv, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    live.add(p);
    p.stdout.pipe(log, { end: false }); p.stderr.pipe(log, { end: false });
    p.on("error", (e) => log.write(`spawn error: ${e.message}\n`));
    let timedOut = false;
    const limit = budget.seconds;
    const timer = setTimeout(() => { timedOut = true; killTree(p); }, limit * 1000);
    p.on("close", async (code, signal) => {
      clearTimeout(timer); live.delete(p);
      const elapsed = (Date.now() - start) / 1000;
      const secs = Math.round(elapsed);
      let status = outcomeOf({ timedOut, code, seconds: elapsed, recorded, sameFile });
      log.end(`\nresult ${status}; exit ${code}; signal ${signal ?? "none"}; elapsed ${elapsed.toFixed(3)} s\n`);
      try {
        await flushed;
        if (logError) throw logError;
        copyFileSync(logPath, join(LOGS, `${c.name}.log`));
      } catch (e) { status = "FAIL"; console.error(`cannot retain ${c.name} log: ${e.message}`); }
      /* KNOWN SHORTFALLS (tools/lib/shortfall.mjs): a check that reports a bar its world does not yet meet prints a line starting `SKIP`; it is not a pass and not a failure, so it is counted and listed here and in the summary. */
      let skips = []; try { skips = readFileSync(logPath, "utf8").split("\n").filter((l) => /^\s*SKIP\b/.test(l)).map((l) => l.trim()); } catch { /* the log was already reported as unreadable above */ }
      if (passed(status)) { times[c.name] = Math.max(0.001, elapsed); hashes[c.name] = hash; }
      results.push({ name: c.name, status, secs, skips, log: logPath, limit, reason: budget.reason });
      const note = status === "TIMEOUT" ? ` -- killed after ${limit} s (${budget.reason}); assertions incomplete`
        : status === "SLOW" ? ` -- assertions passed; exceeded recorded ${recorded} s; timing refreshed`
        : status === "FAIL" ? ` -- exit ${code}, signal ${signal ?? "none"}` : "";
      console.log(`  ${status.padEnd(7)} ${c.name.padEnd(22)} ${String(secs).padStart(5)} s${note}${skips.length ? ` -- ${skips.length} known shortfall(s) skipped with reason` : ""}; log ${logPath}`);
      done();
    });
  });
}

const queue = [...list];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
writeFileSync(HASHES, JSON.stringify(Object.fromEntries(Object.entries(hashes).sort()), null, 1) + "\n");
writeFileSync(TIMES, JSON.stringify(Object.fromEntries(Object.entries(times).sort()), null, 1) + "\n");
/* THE HISTORY: one line per run, committed, so "which checks have ever
   caught anything" is a query rather than a memory (14 October: there was
   no record of a single failure before this). */
try {
  const head = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  const mode = named.length ? "named" : args.includes("--all") ? "all" : args.includes("--legacy") ? "legacy" : args.includes("--direct") ? "direct" : "affected";
  appendFileSync(join(ROOT, "tools", "check-history.jsonl"), JSON.stringify({ at: new Date().toISOString(), head, dirty, mode, results: results.map((r) => [r.name, r.status, r.secs]), logs: results.map((r) => ({ name: r.name, path: r.log, limit: r.limit, reason: r.reason })) }) + "\n");
} catch { /* no git, no history -- never a failed run for it */ }
const bad = results.filter((r) => !passed(r.status));
const skipped = results.flatMap((r) => (r.skips ?? []).map((l) => [r.name, l]));
if (skipped.length) { console.log(`\n${skipped.length} known shortfall(s) SKIPPED WITH REASON (not passes: the bar stands, the value is recorded and may not get worse):`); for (const [n, l] of skipped) console.log(`  ${n}: ${l}`); console.log(""); }
console.log(`${results.length - bad.length} of ${results.length} passed${skipped.length ? `, ${skipped.length} shortfall(s) skipped with reason` : ""}${bad.length ? ` -- ${bad.map((r) => `${r.name} ${r.status}`).join(", ")}` : ""}; wall ${Math.round((Date.now() - t0) / 1000)} s, ${jobs} at once`);
process.exit(bad.length ? 1 : 0);
