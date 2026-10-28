/* A LANE CHANGE INTO A SPACE THE CHANGER CANNOT HOLD (28 October; the
   verify-shaping trace: a car changed into the curb lane 5 m behind a car
   10 m/s slower and braked at its maximum, where the side-ahead floor alone
   wants about 30 m). For every lane change begun, the changer's own hardest
   braking in the 3 s after, and -- at the start -- the clear gap to the car
   it now follows against the floor gapFor's lead side states (1.5 m plus
   shedding the closing speed at the hardest braking). Counted by kind, the
   old gap rule against the new (IMPOSED=0 is the old: DECISIONS 10.32).
   underFloorDiverging: the car followed is bound for a different leg -- the lane shared before a split.
   Usage: node tools/measure/self-brake.mjs map cars seed secs */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, whatStops, poseOf } from "../../src/sim/crossing.js";
import { DT, vehicleOf } from "../../src/sim/traffic.js";
const [id, cars, seed, secs] = process.argv.slice(2);
let w = seedGraph(Number(seed), 50, loadMap(TEST_MAPS.find((t) => t.id === id).build()), { every: 2.0, target: Number(cars), posted: true, ...(process.env.IMPOSED === "0" ? { imposed: false } : {}) });
for (let i = 0; i < 60 / DT; i++) w = step(w);
const kindOf = (lc) => (lc.merge ? "merge" : lc.keepRight ? "keepRight" : lc.mandatory ? "forTurn" : "choice");
const open = new Map(), seen = new Set(), done = [];
for (let i = 0; i < Number(secs) / DT; i++) {
  w = step(w);
  for (const a of w.actors) {
    if (a.player || !a.lc || a.lc.abort) continue;
    const key = `${a.id}@${a.lc.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const v = whatStops(a, w), L = v.leader, real = L && L.id !== "line" && L.id !== "ped";
    const floor = real ? 1.5 + Math.max(0, (a.v * a.v - (L.v ?? 0) ** 2) / (2 * vehicleOf(a).most)) : 0;
    const Lr = real ? w.actors.find((x) => x.id === L.id) : null, P = w.course.at[a.k ?? 0].layout.paths;
    /* WHERE THE CAR FOLLOWED REALLY IS: its offset across the changer's heading, and along it -- is it in the lane ahead, or already curving away? */
    let side = null, along = null;
    if (Lr) { const me = poseOf(w, a), it = poseOf(w, Lr), dx = it.x - me.x, dy = it.y - me.y, h = me.rot ?? 0; along = dx * Math.cos(h) + dy * Math.sin(h); side = -dx * Math.sin(h) + dy * Math.cos(h); }
    open.set(key, { side, along, diverging: !!(Lr && P[Lr.route] && P[a.route] && P[Lr.route].to !== P[a.route].to), id: a.id, at: a.lc.at, kind: kindOf(a.lc), exit: !!a.lc.exit, underFloor: real && v.gap < floor, gap: v.gap, floor, peak: 0 });
  }
  const byId = new Map(w.actors.map((a) => [a.id, a]));
  for (const [k, o] of open) {
    const a = byId.get(o.id);
    if (a) o.peak = Math.max(o.peak, -(a.a ?? 0));
    if (w.t - o.at > 3 || !a) { done.push(o); open.delete(k); }
  }
}
const by = {};
for (const o of done) { const k = o.kind + (o.exit ? ".exit" : ""); by[k] ??= { n: 0, underFloor: 0, underFloorDiverging: 0, selfOver6: 0 }; by[k].n++; if (o.underFloor) { by[k].underFloor++; if (o.diverging) by[k].underFloorDiverging++; } if (o.peak > 6) by[k].selfOver6++; }
const ex = done.filter((o) => o.underFloor).slice(0, 3).map((o) => `${o.id} ${o.kind}${o.exit ? ".exit" : ""} gap ${o.gap.toFixed(1)} floor ${o.floor.toFixed(1)} peak ${o.peak.toFixed(1)}`);
const sides = done.filter((o) => o.underFloor && o.diverging && o.side != null).map((o) => Math.abs(o.side)).sort((x, y) => x - y);
const dists = done.filter((o) => o.underFloor && o.diverging && o.side != null).map((o) => +Math.hypot(o.side, o.along).toFixed(1)).sort((x, y) => x - y);
const sideStats = sides.length ? { n: sides.length, min: +sides[0].toFixed(2), median: +sides[Math.floor(sides.length / 2)].toFixed(2), max: +sides[sides.length - 1].toFixed(2), overHalfLane: sides.filter((x) => x > 1.8).length } : null;
console.log(JSON.stringify({ map: id, cars: Number(cars), seed: Number(seed), secs: Number(secs), imposed: process.env.IMPOSED !== "0", changes: done.length, by, examples: ex, sideOfDivergingLeader: sideStats, straightLineToIt: dists }));
