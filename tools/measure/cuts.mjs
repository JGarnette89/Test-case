/* THE DELETION REPORT'S CUTS (24 September): for each candidate cut --
   keep these screens and these checks -- what in src/ is then reached by
   nothing. App.jsx and main.jsx are the shell and would be edited, so the
   screens are the entries rather than the shell.

     node tools/measure/cuts.mjs                                         */
import fs from "node:fs";
import path from "node:path";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../..");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function importsOf(file) {
  const src = strip(fs.readFileSync(file, "utf8")), out = [];
  for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g)) {
    const spec = m[1] ?? m[2] ?? m[3]; if (!spec.startsWith(".")) continue;
    const f = path.resolve(path.dirname(file), spec);
    for (const c of [f, f + ".js", f + ".jsx", f + ".mjs"]) if (fs.existsSync(c) && fs.statSync(c).isFile()) { out.push(path.normalize(c)); break; }
  }
  return out;
}
function closure(entries) {
  const seen = new Set(), st = entries.map((e) => path.normalize(path.join(ROOT, e)));
  while (st.length) { const f = st.pop(); if (seen.has(f)) continue; seen.add(f); st.push(...importsOf(f)); }
  return seen;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");
const lines = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").length;
function walk(d, o = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f, o) : /\.(js|jsx|mjs)$/.test(e.name) && o.push(f); } return o; }
const all = walk(path.join(ROOT, "src")).map((f) => rel(path.normalize(f))).filter((f) => !["src/App.jsx", "src/main.jsx"].includes(f));

const LIVE = ["src/apps/MapRoad.jsx", "src/apps/IsoRoad.jsx", "src/apps/ErrorBoundary.jsx", "src/theme.js", "src/storage.js", "src/settings.js"];
const STAGES = ["src/apps/SimRoad.jsx", "src/apps/SimCrossing.jsx", "src/apps/SimCandidates.jsx", "src/apps/SimCourse.jsx", "src/apps/Wheel.jsx"];
const EXAM = ["src/apps/ExaminerDrive.jsx", "src/apps/ExaminerLab.jsx"];
const PROTO = ["src/apps/MergeRush.jsx"];
const SIM_CHECKS = ["chase", "connect", "course", "crossing", "drive", "graph", "lanes", "map", "paint", "perf", "signal", "sim", "telling", "wheel", "screens"];
const EXAM_CHECKS = ["awareness", "belief", "candidate", "clearance", "detect", "directions", "faults", "outcome", "reaction", "equivalence", "sight"];
const GAME_CHECKS = ["camera", "compose", "events", "generator", "playthrough", "roguelike", "roundabout", "route", "stages", "task", "tiles", "turns", "windows", "wontstop", "world"];
const chk = (xs) => xs.map((x) => `tools/verify-${x}.mjs`);

const cuts = {
  "A. drop the driver game (timing/daily/endless/roguelike/drives/tutorial) + its 15 checks; keep exam screens": [...LIVE, ...STAGES, ...EXAM, ...PROTO, ...chk(SIM_CHECKS), ...chk(EXAM_CHECKS)],
  "B. A, and also the two examiner SCREENS (#/drive, #/examiner); keep the exam engine + its checks": [...LIVE, ...STAGES, ...PROTO, ...chk(SIM_CHECKS), ...chk(EXAM_CHECKS)],
  "C. keep only what the live screens + rebuild-stage screens + sim checks reach": [...LIVE, ...STAGES, ...PROTO, ...chk(SIM_CHECKS)],
};
for (const [name, keep] of Object.entries(cuts)) {
  const reach = new Set([...closure(keep)].map(rel));
  const dead = all.filter((f) => !reach.has(f));
  const n = dead.reduce((s, f) => s + lines(f), 0);
  console.log(`\n== ${name}\n   unreferenced: ${n} lines in ${dead.length} files`);
  for (const f of dead) console.log(`   ${String(lines(f)).padStart(5)}  ${f}`);
}
const tl = (xs) => xs.reduce((s, x) => s + lines(`tools/verify-${x}.mjs`), 0);
console.log(`\ncheck code: game ${tl(GAME_CHECKS)} lines, exam ${tl(EXAM_CHECKS)} lines, sim ${tl(SIM_CHECKS)} lines`);
