/* THE ENTRY AS A DRIVER MEETS IT, acceleration lane against yield sign
   (22 October). entry.mjs counts car-seconds standing -- the simulation's
   workload. This follows each car that enters: when it first appears on a
   slip road, when it is on the through lanes, how long it stood on the way.
   Reported per variant: cars admitted per minute, entry-to-joined time
   (median, p90), the share of joiners who stood at all, standing per
   joiner (mean, p90), how many were still entering at the end (and for
   how long they had been), and car-seconds standing in total.
   Usage: node tools/measure/entry-experience.mjs [cars=150] [seconds=240] [seeds=1,2,3] [variants=yield,accel] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";

const [carsArg = "150", secsArg = "240", seedArg = "1,2,3", varArg = "yield,accel"] = process.argv.slice(2);
const seeds = seedArg.split(",").map(Number), variants = varArg.split(","), secs = Number(secsArg);
const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
const asYield = JSON.parse(JSON.stringify(raw));
for (const r of asYield.roads) { delete r.accel; if (r.id.startsWith("on-")) r.control = { start: "none", end: "yield" }; }
const maps = { accel: loadMap(raw), yield: loadMap(asYield) };
const enteringOf = (w, a) => {
  const L = w.course.at[a.k].layout, p = L.paths[a.route], from = L.legs[p.from], to = L.legs[p.to];
  return (from?.road?.startsWith("on-") && a.s <= p.clearAt) || (to?.accel && a.s > p.clearAt);
};
const q = (xs, f) => { if (!xs.length) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
for (const cars of carsArg.split(",").map(Number)) {
  console.log(`${cars} cars, ${secs} s after a 60 s warm-up, seeds ${seeds.join(",")}:`);
  for (const name of variants) {
    const done = [], open = [];
    let standing = 0, crashes = 0;
    for (const seed of seeds) {
      /* PERCEIVE=1: drivers who look away, as #/map builds the world with the setting on (scene.js). */
      let w = seedGraph(seed, 50, maps[name], { every: 2.0, target: cars, posted: true, perceive: process.env.PERCEIVE === "1" });
      for (let i = 0; i < 1200; i++) w = step(w);
      const c0 = (w.crashes ?? []).length, t0 = w.t;
      const track = new Map();   // id -> { from, stood }
      /* Only cars that BEGIN entering inside the window are followed, so
         nobody's wait is cut short by the warm-up. */
      const already = new Set(w.actors.filter((a) => enteringOf(w, a)).map((a) => a.id));
      for (let i = 0; i < secs * 20; i++) {
        w = step(w);
        const here = new Set();
        for (const a of w.actors) {
          here.add(a.id);
          const e = enteringOf(w, a);
          if (e && a.v < 0.5) standing += 0.05;
          if (already.has(a.id)) { if (!e) already.delete(a.id); continue; }
          let r = track.get(a.id);
          if (e && !r) track.set(a.id, r = { from: w.t, stood: 0 });
          if (!r) continue;
          if (e && a.v < 0.5) r.stood += 0.05;
          if (!e) { done.push({ took: w.t - r.from, stood: r.stood }); track.delete(a.id); }
        }
        for (const id of [...track.keys()]) if (!here.has(id)) track.delete(id);
      }
      for (const r of track.values()) open.push(w.t - r.from);
      crashes += (w.crashes ?? []).length - c0;
    }
    const n = seeds.length, took = done.map((d) => d.took), stood = done.map((d) => d.stood);
    console.log(`  ${name.padEnd(6)} admitted ${(done.length / n / (secs / 60)).toFixed(1)}/min; entry to joined median ${q(took, 0.5).toFixed(1)} s, p90 ${q(took, 0.9).toFixed(1)} s; ${(100 * stood.filter((s) => s > 0).length / done.length).toFixed(0)}% stood, standing per joiner mean ${(stood.reduce((t, s) => t + s, 0) / done.length).toFixed(1)} s, p90 ${q(stood, 0.9).toFixed(1)} s; still entering at the end ${(open.length / n).toFixed(1)} (waited median ${q(open, 0.5).toFixed(0)} s, max ${Math.max(0, ...open).toFixed(0)} s); ${(standing / n).toFixed(0)} car-s standing; ${crashes} crashes`);
    console.log('         who stood, s: ' + stood.filter((x) => x > 0).map((x) => x.toFixed(0)).sort((a, b) => b - a).join(' '));
  }
}
