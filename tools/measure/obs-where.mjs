/* WHERE DOES OBSERVATION BITE? One controlled map -- a straight road through
   three crossroads 300 m apart, side streets at each -- varied one thing at a
   time: the control (all-way stop, signals, through road with stops only on
   the side streets), the posted speed, and how many cars. For each, hard
   braking (> 3.5 m/s^2) per driver-minute for poor observers against sound,
   drivers looking away and not.
   Run: node tools/measure/obs-where.mjs [secs] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { deficitOf } from "../../src/core/driver.js";
import { DT } from "../../src/sim/traffic.js";

const P = (x, y) => ({ x, y, z: 0 });
export function rowMap(control, kmh) {
  const m = emptyMap(`row-${control}-${kmh}`);
  m.bounds = { x: 0, y: 0, w: 1200, h: 600 };
  const xs = [300, 600, 900];
  const main = control === "allway" ? "stop" : control === "signal" ? "signal" : "none";
  const side = control === "signal" ? "signal" : "stop";
  const pts = [0, ...xs, 1200];
  for (let i = 0; i + 1 < pts.length; i++) {
    m.roads.push(road({ id: `m${i}`, kind: "collector", speed: kmh, points: [P(pts[i], 300), P(pts[i + 1], 300)], control: { start: i > 0 ? main : "none", end: i + 1 < pts.length - 1 ? main : "none" } }));
  }
  xs.forEach((x, j) => {
    m.roads.push(road({ id: `n${j}`, kind: "collector", speed: kmh, points: [P(x, 0), P(x, 300)], control: { start: "none", end: side } }));
    m.roads.push(road({ id: `s${j}`, kind: "collector", speed: kmh, points: [P(x, 600), P(x, 300)], control: { start: "none", end: side } }));
  });
  return m;
}

export function hardBraking(map, secs, seeds, perceive, cars) {
  const band = { sound: { ticks: 0, events: 0 }, poor: { ticks: 0, events: 0 } };
  let crashes = 0;
  for (const seed of seeds) {
    let w = seedGraph(seed, 50, loadMap(map), { target: cars, posted: true, perceive });
    const was = new Map();
    for (let i = 0; i < secs / DT; i++) {
      w = step(w);
      for (const a of w.actors) {
        if (a.player || a.crash) continue;
        const d = deficitOf(a.ratings ?? {}, "observation").deficit ?? 0;
        const b = d < 0.2 ? band.sound : d > 0.5 ? band.poor : null;
        if (!b) continue;
        b.ticks++;
        const hard = -(a.a ?? 0) > 3.5;
        if (hard && !was.get(a.id)) b.events++;
        was.set(a.id, hard);
      }
    }
    crashes += (w.crashes ?? []).length;
  }
  const per = (b) => b.events / Math.max(1e-9, (b.ticks * DT) / 60);
  return { sound: per(band.sound), poor: per(band.poor), crashes };
}

if (process.argv[1]?.endsWith("obs-where.mjs")) {
  const secs = Number(process.argv[2] ?? 300);
  const seeds = process.argv.slice(3).map(Number);
  if (!seeds.length) seeds.push(3, 5);
  const rows = [];
  for (const [control, kmh, cars] of [["allway", 50, 60], ["signal", 50, 60], ["through", 50, 60], ["allway", 50, 120], ["through", 50, 120], ["through", 70, 60], ["allway", 40, 60]]) {
    const map = rowMap(control, kmh);
    const off = hardBraking(map, secs, seeds, false, cars), on = hardBraking(map, secs, seeds, true, cars);
    rows.push(`${control.padEnd(8)} ${kmh} km/h ${String(cars).padStart(3)} cars | off: sound ${off.sound.toFixed(3)} poor ${off.poor.toFixed(3)} x${(off.poor / Math.max(1e-9, off.sound)).toFixed(1)} | ON: sound ${on.sound.toFixed(3)} poor ${on.poor.toFixed(3)} x${(on.poor / Math.max(1e-9, on.sound)).toFixed(1)} | crashes off ${off.crashes} on ${on.crashes}`);
    console.log(rows.at(-1));
  }
}
