/* Reads node's --trace-gc lines from a file and reports the pauses: scavenges (minor) and mark-compacts (major), per minute of the run (the lines carry the process's own clock in ms), with the heap before and after.
   Usage: node tools/measure/parse-gc.mjs <file> */
import fs from "node:fs";
const lines = fs.readFileSync(process.argv[2], "utf8").split(/\r?\n/);
const re = /^\[\d+:0x[0-9a-f]+\]\s+(\d+) ms: (Scavenge|Mark-Compact|Mark-sweep)[^0-9]*([\d.]+)\s*\(([\d.]+)\)\s*->\s*([\d.]+)\s*\(([\d.]+)\)\s*MB,.*?([\d.]+) \/ ([\d.]+) ms/;
const ev = [];
for (const l of lines) { const m = re.exec(l); if (m) ev.push({ at: +m[1], kind: m[2] === "Scavenge" ? "minor" : "major", before: +m[3], after: +m[5], pause: +m[7] }); }
if (!ev.length) { console.log("no gc lines parsed"); process.exit(0); }
const t0 = ev[0].at, mins = {};
for (const e of ev) (mins[Math.floor((e.at - t0) / 60000)] ??= []).push(e);
console.log(`${ev.length} collections; per minute of the run: scavenges (count, total ms, longest) | mark-compacts (count, total, longest, heap after)`);
for (const [m, es] of Object.entries(mins)) { const mi = es.filter((e) => e.kind === "minor"), ma = es.filter((e) => e.kind === "major"), sum = (a) => a.reduce((s, e) => s + e.pause, 0), mx = (a) => Math.max(0, ...a.map((e) => e.pause)); console.log(`  min ${String(m).padStart(2)}: minor ${String(mi.length).padStart(4)}, ${sum(mi).toFixed(0).padStart(4)} ms, longest ${mx(mi).toFixed(1).padStart(5)} | major ${String(ma.length).padStart(2)}, ${sum(ma).toFixed(0).padStart(4)} ms, longest ${mx(ma).toFixed(1).padStart(6)}${ma.length ? `, heap after ${ma[ma.length - 1].after} MB` : ""}`); }
const major = ev.filter((e) => e.kind === "major"); console.log(`major collections: ${major.length}; pauses ms: ${major.slice(0, 20).map((e) => e.pause.toFixed(0)).join(", ")}${major.length > 20 ? ", ..." : ""}`);
