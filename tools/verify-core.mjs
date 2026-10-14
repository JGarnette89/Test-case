/* =====================================================================
   VERIFY CORE -- src/core/ stands on nothing, the old engine is gone,
   and no name core defines is defined twice.

   On 24 September the live screens imported 4,052 lines of src/engine/
   to use about fifteen things from six files; those moved to src/core/.
   On 14 October the engine itself was deleted (cut C, the maintainer:
   "it's just bloat at this point"), its grading moved to src/sim/detect.js.

   Three properties, each structural, each checked at source:

   1. src/core/ imports nothing outside src/core/. Otherwise it is the
      engine again under another name.
   2. src/engine/ does not exist, and nothing in src/ or tools/ imports a
      path under it -- a stale import fails only at run time, in whichever
      check happened to load it.
   3. A name core exports is declared nowhere else in src/: a second
      REACTION_FLOOR is the two-implementations bug CLAUDE.md's cold-start
      item 2 is about.

     node tools/verify-core.mjs
   ===================================================================== */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function specsOf(file) {
  const src = strip(fs.readFileSync(file, "utf8"));
  return [...src.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)]
    .map((m) => m[1] ?? m[2] ?? m[3]);
}
function resolve(from, spec) {
  if (!spec.startsWith(".")) return null;
  const f = path.resolve(path.dirname(from), spec);
  for (const c of [f, f + ".js", f + ".jsx", f + ".mjs"]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
  return null;
}
const walk = (d, o = []) => {
  if (!fs.existsSync(d)) return o;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { if (!["scratch", "node_modules"].includes(e.name)) walk(f, o); }
    else if (/\.(js|jsx|mjs)$/.test(e.name)) o.push(f);
  }
  return o;
};

const CORE = path.join(ROOT, "src/core");
const coreFiles = fs.readdirSync(CORE).filter((f) => f.endsWith(".js")).map((f) => path.join(CORE, f));

console.log("\n1. SRC/CORE IMPORTS NOTHING OUTSIDE ITSELF");
{
  const leaks = [];
  for (const f of coreFiles) for (const s of specsOf(f)) {
    const t = resolve(f, s);
    if (!t || !t.startsWith(CORE + path.sep)) leaks.push(`${rel(f)} imports "${s}"`);
  }
  leaks.length === 0
    ? ok(`${coreFiles.length} files, every import inside src/core/`)
    : leaks.forEach((l) => fail(`${l} -- core must stand on nothing`));
}

console.log("\n2. THE OLD ENGINE IS GONE, AND NOTHING REACHES FOR IT");
{
  !fs.existsSync(path.join(ROOT, "src/engine")) ? ok("src/engine/ does not exist") : fail("src/engine/ is back");
  const reach = [];
  for (const f of [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "tools"))]) {
    for (const sp of specsOf(f)) if (/(^|\/)engine\//.test(sp)) reach.push(`${rel(f)} imports "${sp}"`);
  }
  reach.length === 0 ? ok("and nothing in src/ or tools/ imports anything under it") : reach.forEach((r) => fail(r));
}

console.log("\n3. A NAME CORE DEFINES IS DEFINED NOWHERE ELSE");
{
  /* IDENTITY CANNOT SEE A COPIED NUMBER: a second `REACTION_FLOOR = 0.35`
     is === the first. So read the source, all of src/ -- the MOST_BRAKE
     copies that started this were in src/sim/. A name core exports may be
     imported anywhere and declared only in core. */
  const core = {};
  for (const f of coreFiles) Object.assign(core, Object.fromEntries(Object.keys(await import(pathToFileURL(f))).map((k) => [k, rel(f)])));
  const names = Object.keys(core);
  const decl = new RegExp(`(?:^|[\\s;{(])(?:const|let|var|function\\*?|class)\\s+(${names.join("|")})\\b`, "gm");
  const copies = [];
  for (const f of walk(path.join(ROOT, "src")).filter((f) => !f.startsWith(CORE + path.sep))) {
    for (const m of strip(fs.readFileSync(f, "utf8")).matchAll(decl)) copies.push(`${rel(f)} declares ${m[1]}, which ${core[m[1]]} already defines`);
  }
  copies.length === 0
    ? ok(`none of core's ${names.length} names is declared anywhere else in src/, so a copied constant cannot hide behind an equal value`)
    : copies.forEach((c) => fail(c));
}

console.log(failures === 0 ? "\nOK: core stands alone, the engine is gone, and no name is defined twice.\n" : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
