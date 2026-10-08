/* DOES THE ENDLESS HIGHWAY GO STALE? (samples.js testLoop). Stage 0's
   closed ring settled into a queue behind its slowest car; the loop is
   meant to stay alive because cars keep joining and leaving by its ramps.
   Measured over the minute before 5 and before 15 minutes, on the loop's
   own roads: the spread of speeds, overtakes a minute (two cars on one
   piece of road whose order along it swaps between samples a second
   apart), cars joining and leaving a minute, and how much of the loop's
   population is new since the last window.

   Usage: node tools/measure/loop.mjs [cars=200] [seeds=2] */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step, pathOf } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";

/* `closed`: THE CONTROL -- the same loop with its exits removed, so it fills and then nobody leaves: the stage 0 ring, at highway scale. */
const [carsArg = "200", seedsArg = "2", mode = "open"] = process.argv.slice(2);
const raw = testLoop();
if (mode === "closed") raw.roads = raw.roads.filter((r) => !r.id.startsWith("off-"));
const loaded = loadMap(raw);
const onLoop = (w, a) => { const p = pathOf(w, a), L = w.course.at[a.k ?? 0].layout; const road = L.legs[p.from]?.road; return /^loop-/.test(road ?? "") && /^loop-/.test(L.legs[p.to]?.road ?? ""); };
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(f * (s.length - 1))] : NaN; };
for (let seed = 1; seed <= Number(seedsArg); seed++) {
  let w = seedGraph(seed, 50, loaded, { target: Number(carsArg), posted: true });
  const windows = { 5: null, 15: null };
  let prevSet = null;
  for (const mark of [5, 15]) {
    while (w.t < (mark - 1) * 60) w = step(w);
    const speeds = [];
    let overtakes = 0, joined = 0, left = 0;
    let last = null;
    const startSet = new Set(w.actors.filter((a) => !a.player && onLoop(w, a)).map((a) => a.id));
    for (let i = 0; i < 60 / DT; i++) {
      const before = new Set(w.actors.map((a) => a.id));
      w = step(w);
      const now = new Set(w.actors.map((a) => a.id));
      for (const id of now) if (!before.has(id)) joined++;
      for (const id of before) if (!now.has(id)) left++;
      if (i % 20) continue;
      /* Order along each road, by k (the node the path belongs to) and s. */
      const order = new Map();
      for (const a of w.actors) {
        if (a.player || !onLoop(w, a)) continue;
        speeds.push(a.v * 3.6);
        const key = `${a.k}|${pathOf(w, a).from.split("#")[0]}`;
        (order.get(key) ?? order.set(key, []).get(key)).push({ id: a.id, s: a.s });
      }
      const rank = new Map();
      for (const [key, list] of order) { list.sort((x, y) => x.s - y.s); list.forEach((c, j) => rank.set(c.id, `${key}#${j}`)); }
      if (last) {
        for (const [key, list] of order) {
          const ids = list.map((c) => c.id).filter((id) => last.get(id)?.key === key);
          for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) if (last.get(ids[x]).j > last.get(ids[y]).j) overtakes++;
        }
      }
      last = new Map([...rank].map(([id, r]) => { const [key, j] = r.split("#"); return [id, { key, j: Number(j) }]; }));
    }
    const endSet = new Set(w.actors.filter((a) => !a.player && onLoop(w, a)).map((a) => a.id));
    const fresh = prevSet ? [...endSet].filter((id) => !prevSet.has(id)).length / Math.max(1, endSet.size) : null;
    windows[mark] = { cars: endSet.size, p10: q(speeds, 0.1), p50: q(speeds, 0.5), p90: q(speeds, 0.9), sd: Math.sqrt(speeds.reduce((s, v) => s + (v - speeds.reduce((a, b) => a + b, 0) / speeds.length) ** 2, 0) / speeds.length), overtakes, joined, left, fresh };
    prevSet = endSet;
    void startSet;
  }
  for (const [m, r] of Object.entries(windows)) console.log(`${mode}, seed ${seed}, minute ${m}: ${r.cars} cars on the loop; speed p10/p50/p90 ${r.p10.toFixed(0)}/${r.p50.toFixed(0)}/${r.p90.toFixed(0)} km/h, sd ${r.sd.toFixed(1)}; ${r.overtakes} overtakes in the minute; ${r.joined} joined and ${r.left} left the map${r.fresh != null ? `; ${(100 * r.fresh).toFixed(0)}% of the loop's cars are new since minute 5` : ""}`);
}
