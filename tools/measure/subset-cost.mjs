/* What `node tools/check.mjs` would cost for a change to each of these
   files: the derived set (tools/affected.mjs), scheduled as the runner
   schedules it -- longest first, N at once -- on the times the last runs
   recorded (tools/check-times.json, measured under the suite's own load).
     node tools/measure/subset-cost.mjs [--jobs 8] file ... */
import { readFileSync } from "node:fs";
import { cpus } from "node:os";
import { affected } from "../affected.mjs";

const args = process.argv.slice(2);
const ji = args.indexOf("--jobs");
const jobs = ji >= 0 ? Number(args[ji + 1]) : Math.max(2, Math.floor(cpus().length / 2));
const files = args.filter((a, i) => !a.startsWith("--") && i !== ji + 1);
const times = JSON.parse(readFileSync(new URL("../check-times.json", import.meta.url), "utf8"));

const wall = (secs) => {
  const lanes = Array(jobs).fill(0);
  for (const s of [...secs].sort((a, b) => b - a)) { lanes.sort((a, b) => a - b); lanes[0] += s; }
  return Math.max(0, ...lanes);
};
for (const direct of [false, true]) for (const f of files) {
  const set = affected([f], { direct }).filter((c) => !c.legacy || f.startsWith("src/engine/"));
  const secs = set.map((c) => times[c.name] ?? 600);
  const cpu = secs.reduce((a, b) => a + b, 0);
  console.log(`${direct ? "iterate" : "commit "} ${f.padEnd(24)} ${String(set.length).padStart(3)} checks  ~${Math.round(wall(secs) / 60)} min wall (${Math.round(cpu / 60)} min of check time)`);
}
