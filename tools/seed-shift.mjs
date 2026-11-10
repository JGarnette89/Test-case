/* Task B preload: NODE_OPTIONS="--import=/absolute/path/tools/seed-shift.mjs"
 * CHECK_SEED_SHIFT is an integer offset; CHECK_SEED_EVIDENCE is an output dir.
 * Transforms seedGraph in memory. Never writes application source files.
 * Only the source module is intercepted: bundled copies and other RNG entry
 * points are outside this hook's coverage and must not be claimed covered.
 */
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { threadId, isMainThread } from "node:worker_threads";

const shift = Number(process.env.CHECK_SEED_SHIFT ?? 0);
if (!Number.isSafeInteger(shift)) throw new Error("CHECK_SEED_SHIFT must be a safe integer");
const dir = process.env.CHECK_SEED_EVIDENCE;
const evidence = { pid: process.pid, ppid: process.ppid, threadId, isMainThread,
  entry: process.argv[1] ?? "", shift, calls: 0, samples: [], modules: [], exitObserved: false };
const flush = () => {
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${process.pid}-${threadId}.json`), JSON.stringify(evidence) + "\n");
};
flush();
globalThis[Symbol.for("miskawin.seed-shift")] = (seed) => {
  const next = shift === 0 ? seed : (Number(seed) + shift) >>> 0;
  evidence.calls++;
  if (evidence.samples.length < 8) evidence.samples.push({ before: seed, after: next });
  // A killed worker may not run its exit handler: retain proof of its first call.
  if (evidence.calls === 1) flush();
  return next;
};
process.on("exit", (code) => { evidence.exitObserved = true; evidence.exitCode = code; flush(); });
registerHooks({
  load(url, context, nextLoad) {
    const loaded = nextLoad(url, context);
    if (!url.startsWith("file:") || !fileURLToPath(url).replaceAll("\\", "/").endsWith("/src/sim/crossing.js")) return loaded;
    const source = loaded.source == null ? readFileSync(fileURLToPath(url), "utf8") : Buffer.from(loaded.source).toString();
    const header = /^export function seedGraph\(seed = 1,[^\n]*\{\r?\n/m;
    const matches = [...source.matchAll(new RegExp(header.source, "gm"))];
    if (matches.length !== 1) throw new Error(`seed-shift: expected one seedGraph definition in ${url}, got ${matches.length}`);
    evidence.modules.push(fileURLToPath(url)); flush();
    return { ...loaded, source: source.replace(header, (s) => s + '  seed = globalThis[Symbol.for("miskawin.seed-shift")](seed);\n') };
  },
});
