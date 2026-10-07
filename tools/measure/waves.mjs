/* WHAT THE GREEN WAVE PAYS, measured two ways (progression.js).

   1. On the clock, for every coordinated link: a car that leaves the
      first light as it turns green and holds the posted speed -- at what
      share of other speeds would it also have found green on arrival?
   2. In the sim, a controlled comparison: the same map and seed with
      progression on and off, counting arrivals at a coordinated light in
      the timed direction that had to stop (slowed below 1 m/s on the
      approach) against those that went through -- every arrival, and
      separately the PLATOON: cars that left the light before by the
      timed exit and drove the corridor, which is what a player holding
      the speed is. Cars that join from side streets mid-run are in the
      first count and no timing can help them.

   Usage: node tools/measure/waves.mjs [map=long] [cars=120] [minutes=10] [seeds=1] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { mapFromBrief } from "../../src/map/brief.js";
import { graphOf } from "../../src/sim/graph.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { lightAt } from "../../src/sim/signal.js";
import { BENCH_BRIEF } from "../../src/iso/bench.js";

const [mapId = "long", carsArg = "120", minArg = "10", seedsArg = "1"] = process.argv.slice(2);
const raw = mapId === "long" ? mapFromBrief({ arterials: "long", signals: 3 }, 1) : mapId === "bench" ? mapFromBrief(BENCH_BRIEF, 1) : TEST_MAPS.find((m) => m.id === mapId).build();
const loaded = loadMap(raw);

/* 1. The clock. */
const g = graphOf(loaded);
const plan = (k) => g.at[k].layout.signal;
const greenStart = (k, base) => { const p = plan(k), i = p.forBase[base]; return (p.offset ?? 0) + p.starts[i] + (p.lead?.[i] ?? 0); };
console.log(`${mapId}: ${g.waves?.tree?.length ?? 0} coordinated links`);
for (const e of g.waves?.tree ?? []) {
  const t0 = greenStart(e.from, e.side) + 2;             // left a couple of seconds into the green
  const atSpeed = lightAt(plan(e.to), e.toSide, t0 + e.time);
  const sweep = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.35].map((f) => `${f}x:${lightAt(plan(e.to), e.toSide, t0 + e.time / f)[0]}`);
  console.log(`  node ${e.from} -> ${e.to}: ${Math.round(e.dist)} m at ${Math.round(e.speed * 3.6)} km/h, ${e.time.toFixed(1)} s; at the posted speed the light is ${atSpeed}; by speed ${sweep.join(" ")}`);
}

/* 2. The sim, on and off. */
const timed = new Map((g.waves?.tree ?? []).map((e) => [e.to, e.toSide]));
const upstream = new Map((g.waves?.tree ?? []).map((e) => [e.to, { node: e.from, side: e.side }]));
const signals = new Set(g.at.map((a, k) => (a.layout?.signal ? k : -1)).filter((k) => k >= 0));
function run(progression, seed = 1) {
  let w = seedGraph(seed, 50, loaded, { every: 2.0, target: Number(carsArg), posted: true, progression });
  const minV = new Map(), left = new Map(), rider = new Map(), intentOf = new Map(), byIntent = {};
  let stopped = 0, through = 0, pStopped = 0, pThrough = 0;
  for (let i = 0; i < Number(minArg) * 60 * 20; i++) {
    w = step(w);
    const now = new Set();
    for (const a of w.actors) {
      const k = a.k ?? 0, side = timed.get(k);
      /* Was this car in the platoon -- did the last signal it passed release it by the timed exit? Asked BEFORE this signal becomes its last. */
      { const key0 = `${a.id}@${k}`; if (timed.has(k) && !rider.has(key0)) { const u = upstream.get(k), l = left.get(a.id); rider.set(key0, !!(u && l && l.node === u.node && l.side === u.side)); } }
      /* The last signal this car is passing, and by which exit. */
      const mark = () => { if (signals.has(k)) { const p = w.course.at[k].layout.paths[a.route]; const out = p && w.course.at[k].layout.legs[p.to]?.base; if (out) left.set(a.id, { node: k, side: out }); } };
      const leg = side == null ? null : w.course.at[k].layout.legs[String(a.route).split("/")[0]];
      if (!leg || leg.base !== side) { mark(); continue; }
      const key = `${a.id}@${k}`;
      now.add(key);
      mark();
      minV.set(key, Math.min(minV.get(key) ?? Infinity, a.v ?? 0));
      intentOf.set(key, w.course.at[k].layout.paths[a.route]?.intent ?? "?");
    }
    for (const [key, v] of minV) if (!now.has(key)) { if (v < 1) stopped++; else through++; if (rider.get(key)) { if (v < 1) pStopped++; else pThrough++; const it = intentOf.get(key); byIntent[it] ??= [0, 0]; byIntent[it][v < 1 ? 1 : 0]++; } minV.delete(key); rider.delete(key); }
  }
  return { stopped, through, pStopped, pThrough, byIntent };
}
const sum = (rs) => rs.reduce((t, r) => ({ stopped: t.stopped + r.stopped, through: t.through + r.through, pStopped: t.pStopped + r.pStopped, pThrough: t.pThrough + r.pThrough }), { stopped: 0, through: 0, pStopped: 0, pThrough: 0 });
const seeds = Array.from({ length: Number(seedsArg) }, (_, i) => i + 1);
const onR = seeds.map((sd) => run(true, sd)), offR = seeds.map((sd) => run(false, sd));
const on = sum(onR), off = sum(offR);
const intents = (rs) => { const o = {}; for (const r of rs) for (const [k, [t, st]] of Object.entries(r.byIntent)) { o[k] ??= [0, 0]; o[k][0] += t; o[k][1] += st; } return Object.entries(o).map(([k, [t, st]]) => `${k} ${t}/${t + st} through`).join(", "); };
const share = (r) => `${r.through} of ${r.through + r.stopped} through without stopping (${((100 * r.through) / Math.max(1, r.through + r.stopped)).toFixed(0)}%)`;
console.log(`arrivals at a coordinated light, in the timed direction, ${minArg} min at ${carsArg} cars, ${seedsArg} seeds:`);
console.log(`  green waves on:  ${share(on)}`);
console.log(`  green waves off: ${share(off)}`);
const pshare = (r) => share({ through: r.pThrough, stopped: r.pStopped });
console.log(`the platoon -- left the light before by the timed exit:`);
console.log(`  green waves on:  ${pshare(on)}`);
console.log(`  green waves off: ${pshare(off)}`);
console.log(`  by what they did there -- on: ${intents(onR)}; off: ${intents(offR)}`);
