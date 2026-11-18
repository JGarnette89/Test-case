/* Reads tools/scratch/cdp/<name>.json (cdp-drive.mjs): when the long frames fall, in thirds of the drive, and whether they sit on heap drops. Usage: node tools/measure/cdp-report.mjs name [name...] */
import { readFileSync } from "node:fs";
for (const name of process.argv.slice(2)) for (const r of JSON.parse(readFileSync(`tools/scratch/cdp/${name}.json`, "utf8"))) {
  let t = 0; const at = r.frameTimes.map((d) => (t += d) / 1000), third = (i) => Math.floor((3 * at[i]) / (r.seconds + 1));
  const n = [0, 0, 0], long = [0, 0, 0], big = [0, 0, 0];
  r.frameTimes.forEach((d, i) => { const k = Math.min(2, third(i)); n[k]++; if (d > 50) long[k]++; if (d > 80) big[k]++; });
  console.log(`${r.arm}: frames ${n.join("/")}  >50ms ${long.join("/")}  >80ms ${big.join("/")}  (thirds of ${r.seconds} s)`);
  const heap = r.series.map((s) => s.heap / 1048576), mid = (a) => a.length ? a.reduce((x, y) => x + y) / a.length : 0;
  console.log(`  heap MB by third: ${[0, 1, 2].map((k) => mid(heap.slice(Math.floor(k * heap.length / 3), Math.floor((k + 1) * heap.length / 3))).toFixed(0)).join(" / ")}; drops over 8 MB ${r.heap.drops.length}, over 20 MB ${r.heap.drops.filter((x) => x.mb > 20).length}`);
  const sp = []; let tt = 0; r.frameTimes.forEach((d) => { tt += d; if (d > 80) sp.push([+(tt / 1000).toFixed(1), Math.round(d)]); });
  console.log(`  frames over 80 ms (s, ms): ${sp.slice(0, 24).map((x) => x.join(":")).join(" ")}${sp.length > 24 ? ` ... ${sp.length} in all` : ""}`);
  const ml = r.meterLines; const by = [0, 1, 2].map((k) => ml.filter((m) => m.at >= k * r.seconds / 3 && m.at < (k + 1) * r.seconds / 3));
  console.log(`  the page's own meter, by third: fps ${by.map((a) => (a.reduce((s, m) => s + m.fps, 0) / (a.length || 1)).toFixed(0)).join("/")}; worst ${by.map((a) => Math.max(0, ...a.map((m) => m.worst))).join("/")}; step ${by.map((a) => (a.reduce((s, m) => s + (m.step ?? 0), 0) / (a.length || 1)).toFixed(1)).join("/")} ms`);
  console.log(`  long-animation-frames: ${r.loaf.n}; mean script ${r.loaf.meanScript.toFixed(1)} ms, mean render ${r.loaf.meanRender.toFixed(1)} ms; worst ${JSON.stringify(r.loaf.worst.slice(0, 3))}`);
}
