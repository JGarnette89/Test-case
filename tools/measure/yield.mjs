/* A YIELD CROSSROADS, measured: a through road east-west, the minor road
   north-south with CONTROL on both of its approaches (yield, stop or none).
   For each minor-road car crossing its line: its speed there, and whether it
   stopped; for each through car: whether it was held by anybody; crashes.
   Run: node tools/measure/yield.mjs [yield|stop|none] [cars] [seed] */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { seedGraph, step, pathOf, whatStops } from "../../src/sim/crossing.js";

export const P = (x, y) => ({ x, y, z: 0 });
export function yieldCross(ctl = "yield") {
  const m = emptyMap("yield-x");
  m.bounds = { x: 0, y: 0, w: 600, h: 600 };
  m.roads.push(
    road({ id: "w", points: [P(0, 300), P(300, 300)] }),
    road({ id: "e", points: [P(300, 300), P(600, 300)] }),
    road({ id: "n", kind: "local", points: [P(300, 0), P(300, 300)], control: { start: "none", end: ctl } }),
    road({ id: "s", kind: "local", points: [P(300, 600), P(300, 300)], control: { start: "none", end: ctl } }),
  );
  return m;
}

export function watchYield(ctl, cars = 40, seed = 3, secs = 240) {
  const loaded = loadMap(yieldCross(ctl));
  let w = seedGraph(seed, 50, loaded, { target: cars, posted: true });
  const minor = [], through = { passes: 0, held: 0 };
  const lowest = new Map(), heldThrough = new Set();
  for (let i = 0; i < secs / 0.05; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    w = step(w);
    for (const a of w.actors) {
      const was = before.get(a.id);
      if (!was || was.k !== a.k || was.route !== a.route || a.crash) continue;
      const L = w.course.at[a.k].layout, p = pathOf(w, a);
      if (w.course.at[a.k].through) continue;
      const leg = L.legs[p.from], isMinor = leg.road === "n" || leg.road === "s";
      const key = `${a.id}@${a.k}`;
      if (a.s < p.stopAt && a.s > p.stopAt - 40) lowest.set(key, Math.min(lowest.get(key) ?? Infinity, a.v));
      if (!isMinor && a.s < p.stopAt && whatStops(a, w).held) heldThrough.add(key);
      if (was.s < p.stopAt && a.s >= p.stopAt) {
        if (isMinor) minor.push({ v: a.v, low: lowest.get(key) ?? a.v, stopped: (lowest.get(key) ?? a.v) < 0.3, caution: a.caution });
        else { through.passes++; if (heldThrough.has(key)) through.held++; }
      }
    }
  }
  return { minor, through, crashes: (w.crashes ?? []).length };
}

if (process.argv[1]?.endsWith("yield.mjs")) {
  const ctl = process.argv[2] ?? "yield", cars = Number(process.argv[3] ?? 40), seed = Number(process.argv[4] ?? 3);
  const r = watchYield(ctl, cars, seed);
  const m = r.minor, kmh = (v) => (v * 3.6).toFixed(0);
  const sorted = m.map((x) => x.v).sort((a, b) => a - b);
  console.log(`${ctl}, ${cars} cars, seed ${seed}: ${m.length} minor-road crossings, ${m.filter((x) => x.stopped).length} stopped first; speed at the line median ${kmh(sorted[Math.floor(sorted.length / 2)] ?? 0)} km/h, max ${kmh(sorted[sorted.length - 1] ?? 0)}; through cars ${r.through.passes}, held by somebody ${r.through.held}; crashes ${r.crashes}`);
}
