/* =====================================================================
   THE CHECK RUNNER -- every check with a timeout, in parallel, longest
   first, and nothing left running afterwards (CLAUDE.md, Conventions:
   "Which checks to run").

     node tools/check.mjs                 the checks the working tree's changes can break (tools/affected.mjs)
     node tools/check.mjs --direct        while iterating: only the checks that import a changed file themselves, and screens and core
     node tools/check.mjs --all           every check
     node tools/check.mjs verify-x ...    these
     --jobs N        how many at once (default: half the cores)
     --timeout S     the same timeout for every check, overriding the recorded ones

   A HANG FAILS, LOUDLY, BY NAME. Each check gets three times its last
   recorded time (tools/check-times.json), never under 90 s nor over 20
   minutes; past it the whole process tree is killed and the line reads
   TIMEOUT with the check named and its log kept. A check with no record
   gets the 20-minute cap. A hang therefore costs minutes and leaves a log,
   rather than a session and nothing.

   NOTHING IS ORPHANED. Children are killed as a tree on a timeout, on
   Ctrl-C and on exit -- the old shell lanes kept launching checks after
   their wrapper was stopped, and two suites then shared their logs.

   Logs: tools/scratch/check-logs/<name>.log. Exit 1 if anything failed
   or timed out. The last line is the count and the wall time -- a run
   that does not print it did not finish.
   ===================================================================== */
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, createWriteStream } from "node:fs";
import { cpus } from "node:os";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checks as allChecks, affected, changedFiles } from "./affected.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TIMES = join(ROOT, "tools", "check-times.json");
const LOGS = join(ROOT, "tools", "scratch", "check-logs");
mkdirSync(LOGS, { recursive: true });

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const jobs = Number(opt("--jobs")) || Math.max(2, Math.floor(cpus().length / 2));
const fixedTimeout = opt("--timeout") ? Number(opt("--timeout")) : null;
const named = args.filter((a, i) => !a.startsWith("--") && !["--jobs", "--timeout"].includes(args[i - 1]));

const times = existsSync(TIMES) ? JSON.parse(readFileSync(TIMES, "utf8")) : {};
const every = allChecks();
const byName = new Map(every.map((c) => [c.name, c]));

let list;
if (named.length) list = named.map((n) => byName.get(n) ?? (() => { console.error(`no such check: ${n}`); process.exit(2); })());
else if (args.includes("--all")) list = every;
else {
  const changed = changedFiles();
  list = affected(changed, { direct: args.includes("--direct") });
  console.log(`${changed.length} changed file(s) -> ${list.length} check(s) can see them`);
}
const cmdOf = (c) => c.cmd ?? [process.execPath, [c.file]];
const limitOf = (c) => fixedTimeout ?? (times[c.name] != null ? Math.min(1200, Math.max(90, 3 * times[c.name])) : 1200);

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
    const log = createWriteStream(join(LOGS, `${c.name}.log`));
    const start = Date.now();
    const p = spawn(cmd, argv, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    live.add(p);
    p.stdout.pipe(log); p.stderr.pipe(log);
    let timedOut = false;
    const limit = limitOf(c);
    const timer = setTimeout(() => { timedOut = true; killTree(p); }, limit * 1000);
    p.on("close", (code) => {
      clearTimeout(timer); live.delete(p); log.end();
      const secs = Math.round((Date.now() - start) / 1000);
      const status = timedOut ? "TIMEOUT" : code === 0 ? "ok" : "FAIL";
      if (status === "ok") times[c.name] = secs;
      results.push({ name: c.name, status, secs });
      const note = status === "TIMEOUT" ? `  -- killed after ${limit} s (${fixedTimeout ? "--timeout" : times[c.name] != null ? "3x its last time" : "no time recorded"}); log tools/scratch/check-logs/${c.name}.log` : status === "FAIL" ? `  -- log tools/scratch/check-logs/${c.name}.log` : "";
      console.log(`  ${status.padEnd(7)} ${c.name.padEnd(22)} ${String(secs).padStart(5)} s${note}`);
      done();
    });
  });
}

const queue = [...list];
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => { while (queue.length) await runOne(queue.shift()); }));
writeFileSync(TIMES, JSON.stringify(Object.fromEntries(Object.entries(times).sort()), null, 1) + "\n");
/* THE HISTORY: one line per run, committed, so "which checks have ever
   caught anything" is a query rather than a memory (14 October: there was
   no record of a single failure before this). */
try {
  const head = execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  const dirty = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  const mode = named.length ? "named" : args.includes("--all") ? "all" : args.includes("--legacy") ? "legacy" : args.includes("--direct") ? "direct" : "affected";
  appendFileSync(join(ROOT, "tools", "check-history.jsonl"), JSON.stringify({ at: new Date().toISOString(), head, dirty, mode, results: results.map((r) => [r.name, r.status, r.secs]) }) + "\n");
} catch { /* no git, no history -- never a failed run for it */ }
const bad = results.filter((r) => r.status !== "ok");
console.log(`${results.length - bad.length} of ${results.length} passed${bad.length ? ` -- ${bad.map((r) => `${r.name} ${r.status}`).join(", ")}` : ""}; wall ${Math.round((Date.now() - t0) / 1000)} s, ${jobs} at once`);
process.exit(bad.length ? 1 : 0);
