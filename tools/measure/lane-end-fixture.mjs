/* A THROUGH LANE THAT ENDS, ON A SHORT FIXTURE (DECISIONS 10.145). Road A: `lanes` lanes at 110 for 2 km; road B: the same carriageway continuing with one lane fewer through lanes plus an acceleration-style lane (map/accel.js) FED BY A, open `open` m then closing over its taper. Cars arrive at A's start at the map's own edge rate. Usage: node tools/measure/lane-end-fixture.mjs [lanes=3] [open=500] [cars=200] [mins=6] [seed=1] */
import { emptyMap, road } from "../../src/map/format.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
export const laneEndMap = (lanes = 3, open = 500, speed = 110) => {
  const m = emptyMap("lane-end", "A lane that ends");
  const line = (x0, x1) => { const a = []; for (let x = x0; x <= x1; x += 20) a.push({ x, y: 0, z: 0 }); return a; };
  m.roads.push(road({ id: "A", kind: "highway", lanes, oneWay: true, speed, points: line(0, 2000) }));
  m.roads.push(road({ id: "B", kind: "highway", lanes: lanes - 1, oneWay: true, speed, points: line(2000, 5000), accel: { start: { from: "A", length: open, drop: true } } }));
  m.bounds = { x: -200, y: -200, w: 5400, h: 400 };
  return m;
};
if (process.argv[1].endsWith("lane-end-fixture.mjs") && process.argv[2] !== "run") {
  const [lanes = 3, open = 500, cars = 200, mins = 6, seed = 1] = process.argv.slice(2).map(Number);
  const L = loadMap(laneEndMap(lanes, open));
  console.log("loaded ok:", L.ok, "warnings:", (L.warnings ?? []).map((w) => w.code + ":" + String(w.message).slice(0, 120)).join(" | "));
  let w = seedGraph(seed, 50, L, { every: 1.0, target: cars, posted: true });
  console.log("graph error:", w.course?.graph?.error ?? "none", "| paths at the seam:", JSON.stringify(Object.keys(w.course.at.find((a) => a.layout?.legs && Object.values(a.layout.legs).some((l) => l.accel))?.layout.paths ?? {})));
}
export function runLaneEnd({ lanes = 3, open = 500, cars = 200, mins = 6, seed = 1, drop = true, every = 1.0 }) {
  const m = laneEndMap(lanes, open);
  if (!drop) { const b = m.roads.find((r) => r.id === "B"); b.lanes = lanes; delete b.accel; }
  const L = loadMap(m);
  let w = seedGraph(seed, 50, L, { every, target: cars, posted: true });
  const seenCrash = new Set(); let crashes = 0, standing = 0, inA0 = 0, samples = 0; const fate = new Map(); let passed = 0; const passedIds = new Set();
  for (let i = 0; i < (mins * 60) / DT; i++) {
    w = step(w);
    for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (!seenCrash.has(k)) { seenCrash.add(k); crashes++; } }
    for (const a of w.actors) {
      if (a.parked) continue; const r = String(a.route);
      const onA0 = /B\|start#A0/.test(r), enteredFromCurb = /A\|end#2\/B\|start#A0/.test(r);
      if (enteredFromCurb) { const f = fate.get(a.id) ?? { merged: false, minV: 99, standing: 0 }; f.minV = Math.min(f.minV, a.v ?? 0); if ((a.v ?? 0) < 0.5) f.standing++; fate.set(a.id, f); }
      if (/^B\|end|B\|start#[01]/.test(r.split("/").pop() ?? "") || /\/B\|start#[01]$/.test(r)) { /* on a through lane of B */ }
      if (i % 20 === 0) { samples++; if (onA0) { inA0++; if ((a.v ?? 0) < 1) standing++; } }
      const p = poseOf(w, a); if (p.x > 3500 && !passedIds.has(a.id)) { passedIds.add(a.id); passed++; }
    }
    for (const [id, f] of fate) { const a = w.actors.find((x) => x.id === id); if (a && !/B\|start#A0/.test(String(a.route)) && /B\|start#[01]/.test(String(a.route))) f.merged = true; }
  }
  const fs = [...fate.values()];
  return { lanes, open, cars, drop, crashes, curbCars: fs.length, merged: fs.filter((f) => f.merged).length, stoppedOnce: fs.filter((f) => f.standing > 0).length, stoppedSec: +(fs.reduce((s, f) => s + f.standing, 0) * DT).toFixed(1), slowest: +Math.min(99, ...fs.map((f) => f.minV)).toFixed(1), standingSamples: standing, passedPerMin: +(passed / mins).toFixed(1), actors: w.actors.length };
}
if (process.argv[1].endsWith("lane-end-fixture.mjs") && process.argv[2] === "run") {
  const [, , , lanes, open, cars, mins, seed, drop] = process.argv;
  console.log(JSON.stringify(runLaneEnd({ lanes: Number(lanes), open: Number(open), cars: Number(cars), mins: Number(mins), seed: Number(seed), drop: drop !== "0" })));
}
