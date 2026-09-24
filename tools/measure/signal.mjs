/* THE SIGNALISED CROSSROADS, SWEPT BY DEMAND: which light each launch from rest happened on, waits by intent, and harsh braking. Run: node tools/measure/signal.mjs [seconds between arrivals, default 1.6]. Before the red gated acceptance this printed 20 launches on a red in 56, 13 of them left turns; after, only right turns. SIMULATOR.md 1.1.8. */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { lightAt } from "../../src/sim/signal.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { HARSH_AT } from "../../src/sim/traffic.js";
const line = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: 0 }));
const m = emptyMap("sig", "signals"); m.bounds = { x: 0, y: 0, w: 1000, h: 1000 };
const c = { x: 500, y: 500 };
for (const [id, far] of [["N", { x: 500, y: 100 }], ["S", { x: 500, y: 900 }], ["E", { x: 900, y: 500 }], ["W", { x: 100, y: 500 }]])
  m.roads.push(road({ id, kind: "collector", points: line(far, c), control: { start: "none", end: "signal" } }));
const loaded = loadMap(m);
const every = Number(process.argv[2] ?? 1.6);
let w = seedGraph(4, 50, loaded, { every });
const born = {}, crossed = [], harsh = [];
let onRed = 0, onGreen = 0, ticks = 0;
for (let i = 0; i < 20 * 300; i++) {
  const before = new Map(w.actors.map((a) => [a.id, a]));
  w = step(w); ticks++;
  for (const a of w.actors) {
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route];
    const light = lightAt(L.signal, L.legs[p.from]?.base, w.t);
    if (born[a.id] == null) born[a.id] = { t: w.t, intent: p.intent };
    const was = before.get(a.id);
    /* The instant a car's nose passes the line: what was the light? */
    /* THE MOMENT OF COMMITMENT -- when a waiting car launches -- is what
       a light governs. Crossing the line a second later on a red is
       legitimate and is what every driver does; BEGINNING on a red is
       the violation. */
    if (was && !was.going && a.going) {
      crossed.push({ intent: p.intent, light, waited: w.t - born[a.id].t });
      if (light === "red") onRed++; else if (light === "green") onGreen++;
    }
    if (-(a.a ?? 0) > HARSH_AT) harsh.push(-(a.a ?? 0));
  }
}
const by = (k) => { const g = {}; for (const x of crossed) (g[x[k]] ??= []).push(x); return g; };
console.log(`demand every ${every}s: ${crossed.length} cars launched in five minutes`);
for (const [intent, xs] of Object.entries(by("intent"))) {
  const w8 = xs.map((x) => x.waited).sort((a, b) => a - b);
  const lights = {}; for (const x of xs) lights[x.light] = (lights[x.light] ?? 0) + 1;
  console.log(`  ${intent.padEnd(8)} ${String(xs.length).padStart(3)} cars | from arrival to the line: median ${w8[Math.floor(w8.length / 2)].toFixed(1)}s, worst ${w8[w8.length - 1].toFixed(1)}s | crossed on ${Object.entries(lights).map(([l, n]) => `${l} ${n}`).join(", ")}`);
}
console.log(`  LAUNCHES on a red: ${onRed} (all should be right turns), on a green ${onGreen}`);
console.log(`  decelerations above harsh (${HARSH_AT.toFixed(1)}): ${harsh.length} car-ticks of ${ticks * 20}, worst ${harsh.length ? Math.max(...harsh).toFixed(2) : "-"}`);
