/* =====================================================================
   WHICH CHECKS CAN A CHANGE BREAK -- derived from the import graph, not
   kept by hand (CLAUDE.md, Conventions: "Which checks to run").

   A check's verdict depends on its own file, everything it imports
   (statically, re-exported, or by `import(...)`), transitively, and the
   data files it reads. So the checks a change can break are exactly those
   whose closure contains a changed file -- nothing else can move. Two
   checks see everything and run on any change under src/: verify-screens
   (it bundles App, which reaches every screen) and verify-core (it reads
   the source tree itself).

     node tools/affected.mjs                 changes against HEAD, staged, unstaged and untracked
     node tools/affected.mjs --base main~3   changes since a commit
     node tools/affected.mjs src/sim/x.js    these files
     node tools/affected.mjs --why X         why check X is in the set
   Prints one check name per line (verify-x); exit 0.
   `--json` prints { changed, checks }.

   (A tools/legacy/ directory, if one ever exists again, is read too and
   its checks marked -- it held the old engine's checks until the engine
   was deleted on 14 October.)
   ===================================================================== */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const ALWAYS = ["verify-screens", "verify-core"];

/* Every import specifier in a file: import/export ... from "x", import "x", import("x"); and data files read by name. */
function edges(file) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { return []; }
  const out = [];
  const re = /(?:import|export)\s[^"'`;]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (let m; (m = re.exec(src)); ) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec.startsWith(".")) continue;
    let p = resolve(dirname(file), spec);
    if (!existsSync(p)) for (const ext of [".js", ".mjs", ".jsx"]) if (existsSync(p + ext)) { p += ext; break; }
    if (existsSync(p) && statSync(p).isFile()) out.push(p);
  }
  /* Data read by a check (a golden, a saved hash): any quoted *.json under tools/ or src/. */
  for (const m of src.matchAll(/["'`]([^"'`]*?([\w.-]+\.json))["'`]/g)) {
    for (const base of [dirname(file), ROOT, join(ROOT, "tools")]) {
      const p = resolve(base, m[1]);
      if (existsSync(p) && statSync(p).isFile()) { out.push(p); break; }
    }
  }
  return out;
}

function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const e of edges(file)) closure(e, seen);
  return seen;
}

export function checks() {
  const list = (dir, legacy) => (existsSync(dir) ? readdirSync(dir).filter((f) => /^verify-.*\.mjs$/.test(f)).map((f) => ({ name: f.replace(/\.mjs$/, ""), file: join(dir, f), legacy })) : []);
  return [...list(join(ROOT, "tools"), false), ...list(join(ROOT, "tools", "legacy"), true)];
}

export function changedFiles(base = "HEAD") {
  const run = (c) => { try { return execSync(c, { cwd: ROOT, encoding: "utf8" }).split(/\r?\n/).filter(Boolean); } catch { return []; } };
  return [...new Set([...run(`git diff --name-only ${base}`), ...run("git diff --name-only --cached"), ...run("git ls-files --others --exclude-standard")])];
}

/* `direct`: only the checks that import a changed file THEMSELVES -- the
   check written against it -- plus the two that see every screen. The
   iteration loop; the full closure is what a commit runs. */
export function affected(changed, { direct = false } = {}) {
  const abs = new Set(changed.map((f) => resolve(ROOT, f)));
  const anySrc = changed.some((f) => f.replace(/\\/g, "/").startsWith("src/"));
  const out = [];
  for (const c of checks()) {
    const cl = direct ? new Set([c.file, ...edges(c.file)]) : closure(c.file);
    const hit = [...cl].filter((f) => abs.has(f));
    if (hit.length || (anySrc && ALWAYS.includes(c.name))) out.push({ ...c, because: hit.length ? hit.map(rel) : ["(sees every screen)"] });
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const bi = args.indexOf("--base"), wi = args.indexOf("--why");
  const base = bi >= 0 ? args[bi + 1] : "HEAD";
  const why = wi >= 0 ? args[wi + 1] : null;
  const files = args.filter((a, i) => !a.startsWith("--") && i !== bi + 1 && i !== wi + 1 || (bi < 0 && wi < 0 && !a.startsWith("--")));
  const named = args.filter((a, i) => !a.startsWith("--") && (bi < 0 || i !== bi + 1) && (wi < 0 || i !== wi + 1));
  const changed = named.length ? named : changedFiles(base);
  const set = affected(changed);
  if (why) {
    const c = set.find((x) => x.name === why);
    console.log(c ? `${why}: ${c.because.join(", ")}` : `${why}: not affected by ${changed.length} changed file(s)`);
  } else if (json) {
    console.log(JSON.stringify({ changed, checks: set.filter((c) => !c.legacy).map((c) => c.name), legacy: set.filter((c) => c.legacy).map((c) => c.name) }, null, 1));
  } else {
    for (const c of set) console.log(c.name + (c.legacy ? "  (legacy)" : ""));
  }
}
