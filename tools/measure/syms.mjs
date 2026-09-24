/* WHAT THE LIVE SIM ACTUALLY USES FROM src/engine/, by symbol -- the
   companion to reach.mjs, which works by file. A file-level graph says
   index.js is live; this says the live screens call two things in it.
   And, per check, which of those live symbols it imports.

     node tools/measure/syms.mjs                                         */
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function res(from, spec) {
  if (!spec.startsWith(".")) return null;
  const f = path.resolve(path.dirname(from), spec);
  for (const c of [f, f + ".js", f + ".jsx", f + ".mjs"]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.normalize(c);
  return null;
}
function imports(file) {
  const src = strip(fs.readFileSync(file, "utf8"));
  const out = [];
  for (const m of src.matchAll(/(?:import|export)\s*(\{[^}]*\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]*\})?)\s*from\s*["']([^"']+)["']/g)) {
    const to = res(file, m[2]); if (!to) continue;
    const names = m[1].includes("*") ? ["*"] : [...m[1].matchAll(/(\w+)(?:\s+as\s+\w+)?/g)].map((x) => x[1]).filter((n) => n !== "as");
    out.push({ to, names });
  }
  for (const m of src.matchAll(/import\s*\(\s*["']([^"']+)["']/g)) { const to = res(file, m[1]); if (to) out.push({ to, names: ["*"] }); }
  return out;
}
function closure(entries) {
  const seen = new Set(), st = entries.map((e) => path.normalize(path.join(ROOT, e)));
  while (st.length) { const f = st.pop(); if (seen.has(f)) continue; seen.add(f); for (const i of imports(f)) st.push(i.to); }
  return seen;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const isEng = (f) => rel(f).startsWith("src/engine/");
const live = closure(["src/apps/MapRoad.jsx", "src/apps/IsoRoad.jsx"]);
const stages = closure(["src/apps/SimRoad.jsx", "src/apps/SimCrossing.jsx", "src/apps/SimCandidates.jsx", "src/apps/SimCourse.jsx", "src/apps/Wheel.jsx"]);

const used = {};
for (const f of live) for (const i of imports(f)) if (isEng(i.to)) (used[rel(i.to)] ??= new Set()).add(...[]) , i.names.forEach((n) => used[rel(i.to)].add(n + (isEng(f) ? "" : "")));
const direct = {};
for (const f of live) if (!isEng(f)) for (const i of imports(f)) if (isEng(i.to)) { (direct[rel(i.to)] ??= new Set()); i.names.forEach((n) => direct[rel(i.to)].add(n)); }
console.log("== engine symbols the live sim imports DIRECTLY (from sim/iso/map/apps) ==");
for (const [k, v] of Object.entries(direct).sort()) console.log(`  ${k}: ${[...v].join(", ")}`);
console.log("\n== engine files in the live closure, with every symbol imported into them from any live file ==");
for (const [k, v] of Object.entries(used).sort()) console.log(`  ${k} (${fs.readFileSync(path.join(ROOT, k), "utf8").split("\n").length} lines): ${[...v].join(", ")}`);

console.log("\n== rebuild-stage screens need, beyond live ==");
const extra = [...stages].filter((f) => !live.has(f));
for (const f of extra) console.log(`  ${rel(f)}`);

console.log("\n== each check: live engine files it imports, and which of the live-used symbols ==");
const tools = fs.readdirSync(path.join(ROOT, "tools")).filter((f) => /^verify-.*\.mjs$/.test(f)).sort();
for (const t of tools) {
  const tf = path.join(ROOT, "tools", t);
  const c = closure(["tools/" + t]);
  const sim = [...c].some((f) => /src[\\/](sim|iso|map)[\\/]/.test(f));
  const hits = [];
  for (const i of imports(tf)) if (isEng(i.to) && live.has(i.to)) {
    const u = used[rel(i.to)];
    const s = i.names.filter((n) => n === "*" || u?.has(n));
    hits.push(`${path.basename(i.to)}[${s.join(",") || "-"}]`);
  }
  console.log(`  ${sim ? "sim " : "    "} ${t.padEnd(26)} ${hits.join(" ")}`);
}
