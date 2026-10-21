/* THE MERGE, measured (21 October; map/accel.js, lanechange.js mergeStep).
   On the endless highway, per density: how joining cars leave the
   acceleration lane -- where along it, at what speed against the curb lane
   they join, how many stop at its end -- and, by the driver's confidence,
   whether the bold go early and the timid arrive slow. Plus overlaps and
   crashes, and anybody who reached a seam still in the lane (nothing
   beyond it: they would vanish).
   Usage: node tools/measure/merge.mjs [cars=60,150,300] [seconds=240] [seed=1] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, overlapping } from "../../src/sim/crossing.js";
import { knows } from "../../src/core/driver.js";

const [carsArg = "60,150,300", secsArg = "240", seedArg = "1"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
const med = (xs) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
for (const cars of carsArg.split(",").map(Number)) {
  let w = seedGraph(Number(seedArg), 50, loaded, { every: 2.0, target: cars, posted: true });
  for (let i = 0; i < 1200; i++) w = step(w);
  const merges = [], stoppedAtEnd = new Set(), lost = [], onRampTime = new Map(), curbSpeeds = [];
  let overlaps = 0, crashes = 0, standingTicks = 0, ticks = 0;
  const c0 = (w.crashes ?? []).length;
  for (let i = 0; i < Number(secsArg) * 20; i++) {
    const before = w;
    w = step(w);
    ticks++;
    if (i % 5 === 0) overlaps += overlapping(w).filter((o) => !(w.actors.find((a) => a.id === o.a)?.crash)).length;
    const byId = new Map(w.actors.map((a) => [a.id, a]));
    for (const b of before.actors) {
      const L = before.course.at[b.k ?? 0].layout, p = L.paths[b.route], leg = L.legs[p.to];
      if (!leg?.accel) continue;
      const a = byId.get(b.id);
      if (!a && !b.leaveAt) lost.push(b.id);
      else if (a && (a.k ?? 0) !== (b.k ?? 0) && L.legs[L.paths[b.route].to]?.accel && !b.lc) lost.push(b.id);
    }
    for (const a of w.actors) {
      const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], to = L.legs[p.to], from = L.legs[p.from];
      if (from?.road?.startsWith("on-") || (to?.accel && a.s > p.clearAt)) onRampTime.set(a.id, (onRampTime.get(a.id) ?? 0) + 0.05);
      if (to?.accel && a.s > p.clearAt) {
        if (a.v < 0.5) { standingTicks++; if (p.length - to.accelClose - a.s < 15) stoppedAtEnd.add(a.id); }
      }
      if (to?.curb && !to.accel && a.s > p.clearAt && i % 20 === 0) curbSpeeds.push(a.v);
      if (a.lc?.merge && a.lc.at === before.t) {
        const was = before.actors.find((x) => x.id === a.id), Lw = before.course.at[was.k ?? 0].layout, pw = Lw.paths[was.route], lw = Lw.legs[pw.to];
        merges.push({ id: a.id, knows: knows(a, "accel-lane"), caution: a.caution, along: was.s - pw.clearAt, toEnd: pw.length - lw.accelClose - was.s, v: was.v, tight: a.lc.tight, standing: was.v < 0.5 });
      }
    }
  }
  crashes = (w.crashes ?? []).length - c0;
  const bold = merges.filter((m) => m.caution < 0.8), timid = merges.filter((m) => m.caution > 1.2), mid = merges.filter((m) => m.caution >= 0.8 && m.caution <= 1.2);
  const kmh = (v) => (v * 3.6).toFixed(0);
  const row = (xs) => `${xs.length} merges, ${med(xs.map((m) => m.along)).toFixed(0)} m along, ${kmh(med(xs.map((m) => m.v)))} km/h, tight<1 ${xs.filter((m) => m.tight < 1).length}`;
  console.log(`test-loop, ${cars} cars (${w.actors.length} at the end), ${secsArg} s:`);
  console.log(`  merges ${merges.length} (${(merges.length / (Number(secsArg) / 60)).toFixed(1)}/min); from standing ${merges.filter((m) => m.standing).length}; stopped at the lane's end ${stoppedAtEnd.size}; standing in the lane ${(standingTicks * 0.05).toFixed(0)} car-s`);
  console.log(`  joined at ${kmh(med(merges.map((m) => m.v)))} km/h (median) against the curb lane's ${kmh(med(curbSpeeds))}; ${med(merges.map((m) => m.along)).toFixed(0)} m along the lane, ${med(merges.map((m) => m.toEnd)).toFixed(0)} m short of its end`);
  console.log(`  knows the lane is for speed: ${row(merges.filter((m) => m.knows))}
  does not: ${row(merges.filter((m) => !m.knows))}`);
  console.log(`  bold (caution<0.8): ${row(bold)}\n  middle: ${row(mid)}\n  timid (>1.2): ${row(timid)}`);
  console.log(`  time from the slip road to merged: median ${med([...onRampTime.values()]).toFixed(1)} s; overlaps ${overlaps}; crashes ${crashes}; lost at a seam still in the lane ${lost.length}`);
}
