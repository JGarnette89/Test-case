/* =====================================================================
   VERIFY CORE -- the live screens stand on src/core/, never on the engine

   On 24 September the live screens (#/map, #/iso) imported 4,052 lines
   of src/engine/ to use about fifteen things from six files: the seeded
   random source, the turn arc, the driver model, the load curve and the
   reaction and registration lags. Those moved to src/core/ and the
   engine re-exports them, so the old engine can be cut without touching
   anything the simulator runs on.

   Three properties keep that true, and each is structural rather than a
   value, so each is checked at source:

   1. src/core/ imports nothing outside src/core/. Otherwise it is the
      engine again under another name.
   2. No screen the menu marks `live` reaches any file in src/engine/.
      The list is read from App.jsx's MODES, not typed here, so a screen
      that goes live is held to it the day it earns the flag.
   3. Every name the engine re-exports from core is the SAME OBJECT. A
      second definition of rng or REACTION_FLOOR in the engine is the
      two-implementations bug CLAUDE.md's cold-start item 2 is about.

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
/* The closure, with the first path found to each file, so a failure can
   say HOW the engine got in rather than only that it did. */
function closure(entry) {
  const via = new Map([[entry, null]]), stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    for (const s of specsOf(f)) {
      const t = resolve(f, s);
      if (t && !via.has(t)) { via.set(t, f); stack.push(t); }
    }
  }
  return via;
}
const chain = (via, f) => { const out = []; for (let x = f; x; x = via.get(x)) out.unshift(rel(x)); return out.join(" -> "); };

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
    : leaks.forEach((l) => fail(`${l} -- core must stand on nothing, or the live screens inherit whatever it reaches`));
}

console.log("\n2. NO LIVE SCREEN REACHES SRC/ENGINE");
{
  const app = fs.readFileSync(path.join(ROOT, "src/App.jsx"), "utf8");
  const body = app.slice(app.indexOf("const MODES = ["));
  /* An entry is the text from one `id:` to the next; the live ones carry
     `live: true` and name their Component. */
  const entries = body.split(/\n\s*\{\s*\n\s*id:/).slice(1);
  const live = entries.filter((e) => /\blive:\s*true\b/.test(e.split(/\n\s*\},?\s*\n/)[0]))
    .map((e) => e.match(/Component:\s*(\w+)/)?.[1]).filter(Boolean);
  const files = live.map((name) => {
    const m = app.match(new RegExp(`import\\s+${name}\\s+from\\s+["']([^"']+)["']`));
    return m && resolve(path.join(ROOT, "src/App.jsx"), m[1]);
  });
  if (live.length === 0 || files.some((f) => !f)) {
    fail(`could not read the live screens from App.jsx (found ${JSON.stringify(live)}), so nothing below means anything`);
  } else {
    ok(`the menu's live screens: ${live.join(", ")}`);
    for (const entry of files) {
      const via = closure(entry);
      const engine = [...via.keys()].filter((f) => rel(f).startsWith("src/engine/"));
      engine.length === 0
        ? ok(`${rel(entry)} reaches ${via.size} files and none of them is in src/engine/`)
        : engine.forEach((f) => fail(`${rel(entry)} reaches the old engine: ${chain(via, f)}`));
    }
  }
}

console.log("\n3. THE ENGINE RE-EXPORTS CORE, IT DOES NOT REDEFINE IT");
{
  const core = {};
  for (const f of coreFiles) Object.assign(core, Object.fromEntries(Object.entries(await import(pathToFileURL(f))).map(([k, v]) => [k, { v, from: rel(f) }])));
  const ENGINE = path.join(ROOT, "src/engine");
  let shared = 0;
  const before = failures;
  for (const name of fs.readdirSync(ENGINE).filter((f) => f.endsWith(".js"))) {
    const mod = await import(pathToFileURL(path.join(ENGINE, name)));
    for (const [k, v] of Object.entries(mod)) {
      if (!(k in core)) continue;
      shared++;
      v === core[k].v
        ? null
        : fail(`engine/${name} exports its own ${k}, not the one in ${core[k].from} -- two implementations of one quantity`);
    }
  }
  shared > 0 && failures === before
    ? ok(`${shared} engine exports share a name with core, and every one is core's own object`)
    : shared === 0 && fail("no engine module re-exports anything from core, which is not the shape this check was written for");

  /* IDENTITY CANNOT SEE A COPIED NUMBER: a second `REACTION_FLOOR = 0.35`
     is === the first, and passed the test above when planted on purpose.
     So also read the source, all of src/ and not only the engine -- the
     MOST_BRAKE copies that started this were in src/sim/. A name core
     exports may be imported anywhere and declared only in core. */
  const names = Object.keys(core);
  const decl = new RegExp(`(?:^|[\\s;{(])(?:const|let|var|function\\*?|class)\\s+(${names.join("|")})\\b`, "gm");
  const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, o) : /\.(js|jsx)$/.test(e.name) && o.push(f); } return o; };
  const copies = [];
  for (const f of walk(path.join(ROOT, "src")).filter((f) => !f.startsWith(CORE + path.sep))) {
    for (const m of strip(fs.readFileSync(f, "utf8")).matchAll(decl)) copies.push(`${rel(f)} declares ${m[1]}, which ${core[m[1]].from} already defines`);
  }
  copies.length === 0
    ? ok(`and none of core's ${names.length} names is declared anywhere else in src/, so a copied constant cannot hide behind an equal value`)
    : copies.forEach((c) => fail(c));
}

console.log(failures === 0 ? "\nOK: the live screens stand on src/core/ alone.\n" : `\n${failures} FAILURE(S)\n`);
process.exit(failures === 0 ? 0 : 1);
