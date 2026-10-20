/* CAN THE PLAYER SWIM ON THE HIGHWAY? (20 October; the maintainer: "a
   highway the player can endlessly 'swim' in with traffic behaving like
   traffic would"). Swimming needs differential motion: passing and being
   passed. This measures the traffic's side of it on the endless highway:
   - DESIRED speed (v0) across drivers: mean and spread, km/h;
   - ACTUAL speed of moving cars: mean and spread -- how much of the spread
     survives following;
   - SORTING: mean speed per lane position (0 = curb/right);
   - LANE CHANGES started per car-minute, by kind (for a turn, keeping
     right, discretionary -- the overtake);
   - PASSES per car-minute: one car moving from behind to ahead of another
     in an adjacent lane of the same road.
   Usage: node tools/measure/highway-swim.mjs [cars=120,200,300] [seconds=180] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { laneSpan } from "../../src/sim/course.js";

const [carsArg = "120,200,300", secsArg = "180"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-loop").build());
const kmh = (x) => x * 3.6;
const stat = (xs) => { const n = xs.length || 1, m = xs.reduce((s, x) => s + x, 0) / n; return { mean: m, sd: Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / n) }; };
for (const cars of carsArg.split(",").map(Number)) {
  let w = seedGraph(1, 50, loaded, { every: 2.0, target: cars, posted: true });
  for (let i = 0; i < 3600; i++) w = step(w);   // three minutes in
  const v0s = [], vs = [], byLane = new Map(), lcs = { turn: 0, keepRight: 0, discretionary: 0 };
  let passes = 0, carSeconds = 0;
  let prevOrder = null;
  const N = Number(secsArg) / 0.05;
  for (let i = 0; i < N; i++) {
    const before = w;
    w = step(w);
    const t = w.t;
    for (const a of w.actors) {
      const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p.from];
      if (!leg || (leg.across ?? leg.lanes ?? 1) < 2) continue;
      carSeconds += 0.05;
      if (i % 20 === 0) { v0s.push(kmh(a.v0)); if (a.v > 3) { vs.push(kmh(a.v)); const pos = leg.pos ?? leg.lane ?? 0; (byLane.get(pos) ?? byLane.set(pos, []).get(pos)).push(kmh(a.v)); } }
      if (a.lc && a.lc.t0 === before.t && !a.lc.abort) {
        const was = before.actors.find((b) => b.id === a.id);
        if (a.keptRight !== was?.keptRight) lcs.keepRight++; else if (was?.want && was.want.k === was.k) lcs.turn++; else lcs.discretionary++;
      }
    }
    /* Passes: on each road lane-group (by its base), order cars along the road every second; a pair whose order flips while in different lanes is a pass. */
    if (i % 20 === 0) {
      const order = new Map();
      for (const a of w.actors) {
        const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p.from];
        if (!leg || (leg.across ?? leg.lanes ?? 1) < 2 || a.s > p.stopAt) continue;
        const span = laneSpan(w.course, a.k ?? 0, a.route, a.s)[0];
        order.set(a.id, { group: `${a.k}|${leg.base}`, lane: leg.pos ?? leg.lane, along: span.along });
      }
      if (prevOrder) {
        const groups = new Map();
        for (const [id, o] of order) { const was = prevOrder.get(id); if (was && was.group === o.group) (groups.get(o.group) ?? groups.set(o.group, []).get(o.group)).push({ id, o, was }); }
        for (const xs of groups.values()) for (let x = 0; x < xs.length; x++) for (let y = x + 1; y < xs.length; y++) {
          const A = xs[x], B = xs[y];
          if (Math.sign(A.was.along - B.was.along) !== Math.sign(A.o.along - B.o.along) && Math.abs(A.o.along - B.o.along) < 30 && (A.o.lane !== B.o.lane || A.was.lane !== B.was.lane)) passes++;
        }
      }
      prevOrder = order;
    }
  }
  const mins = carSeconds / 60, d = stat(v0s), v = stat(vs);
  const lanes = [...byLane.entries()].sort((a, b) => a[0] - b[0]).map(([pos, xs]) => `lane ${pos}: ${stat(xs).mean.toFixed(0)} km/h (${xs.length})`).join(", ");
  console.log(`highway, ${w.actors.length} cars, ${(mins).toFixed(0)} car-minutes on multi-lane road:`);
  console.log(`  desired speed ${d.mean.toFixed(1)} +/- ${d.sd.toFixed(1)} km/h; actual (moving) ${v.mean.toFixed(1)} +/- ${v.sd.toFixed(1)} km/h`);
  console.log(`  by lane: ${lanes}`);
  console.log(`  lane changes per car-minute: discretionary (overtaking) ${(lcs.discretionary / mins).toFixed(3)}, keep-right ${(lcs.keepRight / mins).toFixed(3)}, for a turn ${(lcs.turn / mins).toFixed(3)}; passes per car-minute ${(passes / mins).toFixed(3)}`);
}
