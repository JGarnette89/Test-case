/* GREEN WAVES (src/sim/progression.js): the lights along a road timed so
   a car at the posted speed meets green after green.

   1. On the clock, on every map with a timed link: a car that leaves a
      light two seconds into its green and holds the posted speed finds
      the next one green; leaving on a red, it does not get the same
      treatment (the wave is the timing, not a gift).
   2. A corridor runs only where the road has priority: through no
      uncontrolled crossroads and no stop of its own -- an uncontrolled
      crossing stops a platoon whatever its leg says (the bench's first
      timing, 6 October, was 41 km/h on a 60 km/h link).
   3. One cycle per system, no green shortened to make it, and a map
      with fewer than two linked signals gets exactly the plans it had.
   4. In the sim, a controlled comparison -- same map, same seeds, the
      timing switched off -- cars released by a light by the timed exit
      go through the next one without stopping far more often with the
      wave than without. And nothing crashes either way.

   Usage: node tools/verify-waves.mjs */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { mapFromBrief } from "../src/map/brief.js";
import { graphOf } from "../src/sim/graph.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { lightAt, GREEN_FOR, PHASE_TOL } from "../src/sim/signal.js";
import { BENCH_BRIEF } from "../src/iso/bench.js";

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? " ok " : " FAIL"} ${msg}`); if (!c) failed++; };
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const MAPS = [
  ...TEST_MAPS.map((m) => [m.id, m.build()]),
  ["long arterial, 3 signals", mapFromBrief({ arterials: "long", signals: 3 }, 1)],
  ["the bench", mapFromBrief(BENCH_BRIEF, 1)],
  ["one signal", mapFromBrief({ arterials: "long", signals: 1 }, 1)],
];

console.log("1. on the clock: holding the posted speed from a green finds the next green");
const timedMaps = [];
for (const [id, raw] of MAPS) {
  const loaded = loadMap(raw), g = graphOf(loaded);
  const tree = g.waves?.tree ?? [];
  if (!tree.length) continue;
  timedMaps.push({ id, loaded, g });
  const plan = (k) => g.at[k].layout.signal;
  const greenAt = (k, base) => { const p = plan(k), i = p.forBase[base]; return (p.offset ?? 0) + p.starts[i] + (p.lead?.[i] ?? 0); };
  for (const e of tree) {
    const t0 = greenAt(e.from, e.side) + 2;
    const there = lightAt(plan(e.to), e.toSide, t0 + e.time);
    ok(there === "green", `${id}: ${e.from} -> ${e.to}, ${Math.round(e.dist)} m at ${Math.round(e.speed * 3.6)} km/h: green on arrival (${there})`);
  }
}
ok(timedMaps.length >= 3, `timed links exist on ${timedMaps.length} maps (${timedMaps.map((m) => m.id).join(", ")})`);

console.log("\n2. a corridor runs only where the road has priority");
for (const { id, g } of timedMaps) {
  for (const e of g.waves.tree) {
    const bad = e.via.filter((k) => {
      const legs = Object.values(g.at[k].layout.legs);
      const along = legs.filter((l) => l.control !== "none");
      /* The corridor's own legs there are free, and every leg that crosses them is controlled. */
      const corridor = legs.filter((l) => legs.some((m) => m !== l && Math.abs(Math.abs(norm(m.bearing - l.bearing)) - 180) < PHASE_TOL && m.control === "none" && l.control === "none"));
      const crossing = legs.filter((l) => corridor.length && Math.abs(Math.abs(norm(l.bearing - corridor[0].bearing)) - 90) < PHASE_TOL);
      return !corridor.length || crossing.some((l) => l.control === "none") || (!along.length && legs.length > 2);
    });
    ok(!bad.length, `${id}: ${e.from} -> ${e.to} runs through ${e.via.length} intersections, every one with the corridor free and its cross road stopped or yielding${bad.length ? ` -- not at ${bad.join(", ")}` : ""}`);
  }
}

console.log("\n3. one cycle per system; nothing shortened; nothing moves without a corridor");
for (const { id, g } of timedMaps) {
  for (const system of g.waves.systems) {
    const cycles = system.map((k) => g.at[k].layout.signal.cycle);
    ok(cycles.every((c) => Math.abs(c - cycles[0]) < 1e-9), `${id}: ${system.length} signals in one system share a cycle of ${cycles[0].toFixed(1)} s`);
    ok(system.every((k) => g.at[k].layout.signal.greenFor >= GREEN_FOR - 1e-9), `   and no green is shorter than ${GREEN_FOR} s (${system.map((k) => g.at[k].layout.signal.greenFor.toFixed(1)).join(", ")})`);
  }
}
for (const [id, raw] of MAPS) {
  const loaded = loadMap(raw), g = graphOf(loaded), g0 = graphOf(loaded, { progression: false });
  if (g.waves) continue;
  const same = g.at.every((a, k) => JSON.stringify(a.layout?.signal ?? null) === JSON.stringify(g0.at[k].layout?.signal ?? null));
  ok(same, `${id}: no corridor between signals, and every plan is the one it had`);
}

console.log("\n4. in the sim: the platoon goes through far more often with the wave than without");
function platoon(loaded, g, progression, seed, actuated = false) {
  const tree = g.waves.tree;
  const upstream = new Map(tree.map((e) => [e.to, e]));
  const signals = new Set(g.at.map((a, k) => (a.layout?.signal ? k : -1)).filter((k) => k >= 0));
  let w = seedGraph(seed, 50, loaded, { every: 2.0, target: 120, posted: true, progression, actuated });
  const left = new Map(), rider = new Map(), minV = new Map();
  let through = 0, stopped = 0, crashes = 0;
  for (let i = 0; i < 8 * 60 * 20; i++) {
    w = step(w);
    const here = new Set();
    for (const a of w.actors) {
      const k = a.k ?? 0, L = w.course.at[k].layout, p = L.paths[a.route];
      if (!p) continue;
      const e = upstream.get(k), key = `${a.id}@${k}`;
      if (e && L.legs[p.from]?.base === e.toSide) {
        if (!rider.has(key)) { const l = left.get(a.id); rider.set(key, !!(l && l.node === e.from && l.side === e.side)); }
        if (rider.get(key)) { here.add(key); minV.set(key, Math.min(minV.get(key) ?? Infinity, a.v)); }
      }
      if (signals.has(k) && a.s > p.stopAt) left.set(a.id, { node: k, side: L.legs[p.to]?.base });
    }
    for (const [key, v] of minV) if (!here.has(key)) { if (v < 1) stopped++; else through++; minV.delete(key); }
  }
  crashes = (w.crashes ?? []).length;
  return { through, stopped, crashes };
}
const long = timedMaps.find((m) => m.id.startsWith("long"));
const add = (a, b) => ({ through: a.through + b.through, stopped: a.stopped + b.stopped, crashes: a.crashes + b.crashes });
/* THE OFFSETS' OWN WORTH is measured with the lights on their clock: an
   actuated light already answers a platoon arriving on its advance loop
   (actuated.js), which would credit the wave with the loops' work and
   hide a broken offset behind them. The loops are held below to not
   undo it. */
const on = [1, 2].map((sd) => platoon(long.loaded, long.g, true, sd)).reduce(add);
const off = [1, 2].map((sd) => platoon(long.loaded, long.g, false, sd)).reduce(add);
const onA = [1, 2].map((sd) => platoon(long.loaded, long.g, true, sd, true)).reduce(add);
const offA = [1, 2].map((sd) => platoon(long.loaded, long.g, false, sd, true)).reduce(add);
const rate = (r) => r.through / Math.max(1, r.through + r.stopped);
ok(on.through + on.stopped >= 60 && off.through + off.stopped >= 60, `enough of the platoon to judge: ${on.through + on.stopped} arrivals with the wave, ${off.through + off.stopped} without (two seeds, eight minutes each)`);
ok(rate(on) >= rate(off) + 0.25, `released by the light before, through the next without stopping: ${(100 * rate(on)).toFixed(0)}% with the wave against ${(100 * rate(off)).toFixed(0)}% without`);
ok(rate(onA) >= rate(on) - 0.05 && rate(onA) >= rate(offA), `and with the lights actuated the platoon still goes through as often or more: ${(100 * rate(onA)).toFixed(0)}% with the wave (${(100 * rate(on)).toFixed(0)}% on the clock), ${(100 * rate(offA)).toFixed(0)}% actuated without it`);
ok(on.crashes + off.crashes + onA.crashes + offA.crashes === 0, `and nothing crashes any way (${on.crashes}, ${off.crashes}, ${onA.crashes}, ${offA.crashes})`);

console.log(failed ? `\n${failed} FAILED` : "\nOK: a car holding the posted speed from a green meets the next green, corridors run only where the road has priority, one cycle per system, and the platoon goes through far more often with the wave.");
process.exit(failed ? 1 : 0);
