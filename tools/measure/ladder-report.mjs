/* Pairs the one-arm lines of spawn-side.mjs ("one" mode) by seed against rule OFF at the map's own count, and reports mean +/- standard error of the paired difference, per arm.
   Usage: node tools/measure/ladder-report.mjs <file with one JSON line per arm> */
import fs from "node:fs";
const rows = fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/).filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
const FIELD = process.argv[3] === "final" ? ["seen", "passes", "the whole 330 s (some runs reached the road's end and parked)"] : ["seen4", "passes4", "the first 4 minutes (nobody has reached the end)"];
const base = rows.find((r) => r.arm === "off"); if (!base) throw new Error("no rule-off arm in the file");
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, se = (a) => Math.sqrt(a.reduce((x, y) => x + (y - mean(a)) ** 2, 0) / (a.length - 1)) / Math.sqrt(a.length);
console.log(`THE COUNTS ARE OVER ${FIELD[2]}`);
console.log(`${base.map}: rule OFF at ${base.cars} cars: cars seen ${mean(base[FIELD[0]]).toFixed(1)} +/- ${se(base[FIELD[0]]).toFixed(1)}, passes ${mean(base[FIELD[1]]).toFixed(1)} +/- ${se(base[FIELD[1]]).toFixed(1)} (${base.seen.length} seeds, ${base.edged} reached the road's end)`);
for (const r of rows.filter((x) => x.arm === "on").sort((a, b) => b.cars - a.cars)) {
  const ds = r[FIELD[0]].map((x, i) => x - base[FIELD[0]][i]), dp = r[FIELD[1]].map((x, i) => x - base[FIELD[1]][i]);
  console.log(`rule ON  at ${String(r.cars).padStart(3)} cars: seen ${mean(r[FIELD[0]]).toFixed(1)} +/- ${se(r[FIELD[0]]).toFixed(1)}; against OFF at ${base.cars}: ${mean(ds) >= 0 ? "+" : ""}${mean(ds).toFixed(1)} +/- ${se(ds).toFixed(1)} (${(100 * mean(ds) / mean(base[FIELD[0]])).toFixed(0)}%, ${(Math.abs(mean(ds)) / se(ds)).toFixed(1)} SE) | passes ${mean(r[FIELD[1]]).toFixed(1)}; ${mean(dp) >= 0 ? "+" : ""}${mean(dp).toFixed(1)} +/- ${se(dp).toFixed(1)} (${(Math.abs(mean(dp)) / se(dp)).toFixed(1)} SE) | placed behind ${r.behindBirths}, ${r.edged} at the end`);
}
