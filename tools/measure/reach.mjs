/* WHAT IS STILL REFERENCED, from the import graph -- the evidence for the
   deletion report of 24 September, kept so the numbers can be re-derived
   rather than trusted. Static `import ... from` and dynamic `import()`,
   relative paths only.

     node tools/measure/reach.mjs

   Reports, in lines of source:
     - files nothing reaches from the app's entry (src/main.jsx);
     - what the LIVE screens (#/map, #/iso) need, and which of it is the
       old engine or the old renderer;
     - for every verify check, whether it reaches src/sim/ or src/iso/ at
       all, i.e. whether it guards anything the rebuild runs on. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../..");
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const lines = (f) => fs.readFileSync(f, "utf8").split("\n").length;

function importsOf(file) {
  const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out = [];
  for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (!spec.startsWith(".")) continue;
    let f = path.resolve(path.dirname(file), spec);
    for (const cand of [f, f + ".js", f + ".jsx", f + ".mjs", path.join(f, "index.js")]) {
      if (fs.existsSync(cand) && fs.statSync(cand).isFile()) { out.push(cand); break; }
    }
  }
  return out;
}
function closure(entries) {
  const seen = new Set(), stack = [...entries];
  while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); stack.push(...importsOf(f)); }
  return seen;
}
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, out); else if (/\.(js|jsx|mjs)$/.test(e.name)) out.push(f);
  }
  return out;
}
const sum = (fs_) => [...fs_].reduce((s, f) => s + lines(f), 0);

const src = walk(path.join(ROOT, "src"));
const app = closure([path.join(ROOT, "src/main.jsx")]);
const tools = walk(path.join(ROOT, "tools")).filter((f) => /verify-.*\.mjs$/.test(f));
const byChecks = closure(tools);

console.log("== files in src/ nothing in the APP reaches ==");
const orphans = src.filter((f) => !app.has(f));
for (const f of orphans) console.log(`  ${String(lines(f)).padStart(5)}  ${rel(f)}${byChecks.has(f) ? "   (a check imports it)" : ""}`);
console.log(`  total ${sum(orphans)} lines in ${orphans.length} files; of them reached by no check either: ${sum(orphans.filter((f) => !byChecks.has(f)))} lines`);

const live = closure(["src/apps/MapRoad.jsx", "src/apps/IsoRoad.jsx"].map((f) => path.join(ROOT, f)));
console.log("\n== what the LIVE screens (#/map, #/iso) import, by folder ==");
const byDir = {};
for (const f of live) { const d = rel(f).split("/").slice(0, 2).join("/"); (byDir[d] ??= []).push(f); }
for (const [d, fs_] of Object.entries(byDir).sort()) console.log(`  ${String(sum(fs_)).padStart(6)}  ${d}: ${fs_.map((f) => path.basename(f)).join(", ")}`);
console.log(`  RightOfWayTiming.jsx in the live closure: ${[...live].some((f) => f.endsWith("RightOfWayTiming.jsx"))}`);

/* Old-app code: reachable from the app, but not from the live screens and
   not from the shell itself -- i.e. only through the unlisted routes. */
const shellOnly = closure([path.join(ROOT, "src/main.jsx")]);
const historical = [...shellOnly].filter((f) => !live.has(f) && /src\/(apps|engine|frame|environments|progress|theme)/.test(rel(f)));
console.log(`\n== reachable from the app ONLY through screens other than the live two: ${sum(historical)} lines in ${historical.length} files ==`);
const hBy = {};
for (const f of historical) { const d = rel(f).split("/").slice(0, 2).join("/"); hBy[d] = (hBy[d] ?? 0) + lines(f); }
for (const [d, n] of Object.entries(hBy).sort()) console.log(`  ${String(n).padStart(6)}  ${d}`);

console.log("\n== each check: does it reach src/sim/ or src/iso/ (what the rebuild runs on)? ==");
let oldLines = 0, oldN = 0;
for (const t of tools.sort()) {
  const c = closure([t]);
  const sim = [...c].some((f) => /src[\\/](sim|iso|map)[\\/]/.test(f));
  /* A check that bundles the app and renders it reaches every screen,
     the live ones included, through a path this graph cannot see.
     verify-screens is that check; labelling it OLD made it look deletable
     while it was the only guard on #/map mounting. And OLD is not "guards
     nothing live": the live screens import src/engine/ too, which
     syms.mjs breaks down by symbol. */
  const app = /react-dom\/server/.test(fs.readFileSync(t, "utf8"));
  if (!sim && !app) { oldLines += lines(t); oldN++; }
  console.log(`  ${app ? "app " : sim ? "sim " : "OLD "} ${String(lines(t)).padStart(5)}  ${rel(t)}`);
}
console.log(`  checks that reach neither the rebuild nor the rendered app: ${oldN}, ${oldLines} lines`);
