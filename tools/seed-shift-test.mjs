/* Prove Task B's hook changes real worlds, reaches child processes and
 * worker threads, and leaves source bytes unchanged. No simulation test's
 * assertions or samples are edited. Run: node tools/seed-shift-test.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hook = join(root, "tools/seed-shift.mjs");
mkdirSync(join(root, "tools/scratch"), { recursive: true });
const out = mkdtempSync(join(root, "tools/scratch/seed-proof-"));
const crossing = join(root, "src/sim/crossing.js");
const digest = () => createHash("sha256").update(readFileSync(crossing)).digest("hex");
const original = digest();
const code = `
import { seedGraph } from ${JSON.stringify(pathToFileURL(crossing).href)};
import { loadMap } from ${JSON.stringify(pathToFileURL(join(root, "src/map/load.js")).href)};
import { testMap1 } from ${JSON.stringify(pathToFileURL(join(root, "src/map/samples.js")).href)};
import { createHash } from "node:crypto";
const w = seedGraph(Number(process.env.PROBE_SEED), 50, loadMap(testMap1()), { target: 12, posted: true });
const answer = { seed: w.seed, actors: w.actors.length, hash: createHash("sha256").update(JSON.stringify(w.actors)).digest("hex") };
`;
const file = join(out, "probe.mjs"), worker = join(out, "worker.mjs"), parent = join(out, "parent.mjs");
writeFileSync(file, code + 'console.log(JSON.stringify(answer));\n');
writeFileSync(worker, 'import {parentPort} from "node:worker_threads";\n' + code + 'parentPort.postMessage(answer);\n');
writeFileSync(parent, `import { Worker } from "node:worker_threads"; const w = new Worker(new URL(${JSON.stringify(pathToFileURL(worker).href)})); w.on("message", x => console.log(JSON.stringify(x))); w.on("error", e => { console.error(e); process.exitCode=1; });\n`);
function run(seed, shift = null, threaded = false) {
  const env = { ...process.env, PROBE_SEED: String(seed) };
  const label = `${seed}-${shift ?? "plain"}-${threaded}`;
  if (shift !== null) {
    env.CHECK_SEED_SHIFT = String(shift); env.CHECK_SEED_EVIDENCE = join(out, label);
    env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --import=${hook}`.trim();
  }
  const r = spawnSync(process.execPath, [threaded ? parent : file], { env, cwd: root, encoding: "utf8", timeout: 20000 });
  assert.ifError(r.error); assert.equal(r.status, 0, r.stderr);
  const value = JSON.parse(r.stdout.trim()); assert.ok(value.actors > 0);
  return value;
}
const plain = run(7);
assert.deepEqual(run(7, 0), plain, "zero shift must reproduce the original world");
for (const shift of [11, 29]) {
  const expected = run(7 + shift), shifted = run(7, shift);
  assert.notEqual(shifted.hash, plain.hash, "a hook that moves nothing must fail");
  assert.deepEqual(shifted, expected, "shifted world must equal the real alternate-seed control");
  assert.deepEqual(run(7, shift, true), expected, "workers must inherit the same hook");
  const evidenceDir = join(out, `7-${shift}-true`);
  const records = readdirSync(evidenceDir).map(f => JSON.parse(readFileSync(join(evidenceDir,f), "utf8")));
  assert.ok(records.some(r => !r.isMainThread && r.calls > 0 && r.samples.some(s => s.before === 7 && s.after === 7 + shift)));
  console.log(`PASS: shift ${shift} changes actor state, equals unhooked seed ${7 + shift}, and reaches a worker`);
}
assert.equal(digest(), original);
console.log(`PASS: zero-shift equivalence and source bytes unchanged; evidence ${out}`);
