/* KEEP RIGHT, measured (SIMULATOR.md 1.1.17, 1.1.18). Arguments:
   node tools/measure/keepright.mjs [cars=200] [seconds=150] [seeds=3,4,5] [--byNode]

   --byNode breaks the on/off comparison down per intersection, which is
   what verify-lanes.mjs's 0.75 -> 0.85 recalibration (25 September, the
   big arterial) was derived from: without node E the on/off ratio is
   0.68, comfortably under the old bound; E alone runs 0.88 (still a
   real reduction, just a weaker one -- E is three lanes wide, so a
   momentary open gap in the lane to the right is common even while the
   node overall is busy, and the return clock resets on every passing
   "reason" tick). E carries about a third of the map's cruising volume,
   which is what drags the population aggregate from 0.68 to 0.79. The
   mechanism itself is not at fault: verify-lanes.mjs's own
   model-vs-restatement comparison ("the exceptions are the rule") finds
   0 disagreements, on identical state, at every node including E.

   The exceptions are restated here from the maintainer's words, not
   imported, and each car is judged on its own decision tick against the
   world it decided from -- a driver reconsiders twice a second
   (LC_EVERY), from the previous committed state. */
import { seedGraph, step } from "../../src/sim/crossing.js";
import { deficitOf } from "../../src/core/driver.js";
import { CAR, wantedGap } from "../../src/sim/traffic.js";
import { changing, LC_EVERY, KEEP_RIGHT_FAULT } from "../../src/sim/lanechange.js";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
const byNode = process.argv.includes("--byNode");
const [cars = 200, seconds = 150] = process.argv.slice(2, 4).map(Number);
const seeds = (process.argv[4] ?? "3,4,5").split(",").map(Number);
const loaded = loadMap(testMap1());
const kd = (a) => deficitOf(a.ratings ?? {}, "knowledge").deficit ?? 0;
const exceptionHolds = (w, a) => {
  const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p.from];
  const right = `${leg.base}#${leg.lane + 1}`;
  if (!L.legs[right]) return "noLane";
  const exit = L.legs[p.to]?.base ?? p.to;
  const r2 = L.routesFrom(right).find((r) => (L.legs[L.paths[r].to]?.base ?? L.paths[r].to) === exit);
  if (!r2) return "turn";
  const s2 = a.s * (L.paths[r2].stopAt / p.stopAt), want = a.v0 ?? a.v;
  let ahead = null, behind = null;
  for (const b of w.actors) {
    if (b.id === a.id || (b.k ?? 0) !== (a.k ?? 0)) continue;
    if (L.paths[b.route].from !== right && !(changing(b.lc, w.t) && b.lc.fromLeg === right)) continue;
    const d = b.s - s2;
    if (d >= 0 && (!ahead || d < ahead.d)) ahead = { b, d };
    if (d < 0 && (!behind || -d < behind.d)) behind = { b, d: -d };
  }
  if ((behind && behind.d < 10) || (ahead && ahead.d < CAR.length + 2)) return "passing";
  if (ahead && ahead.d - CAR.length < Math.max(30, want * 4) && ahead.b.v < want - 1) return "inTheWay";
  /* A competent driver's gap, with the stopping-distance floor. */
  const stop = (v, vl) => Math.max(0, (v * v - vl * vl) / 16);
  if (ahead && ahead.d - CAR.length < Math.max(1.5 + stop(a.v, ahead.b.v), wantedGap(a, ahead.b))) return "noGap";
  if (behind && behind.d - CAR.length < Math.max(1.5 + stop(behind.b.v, a.v), wantedGap(behind.b, a))) return "noGap";
  return null;
};
const perNodeBoth = { true: {}, false: {} };
for (const on of [true, false]) {
  let flagged = 0, cruising = 0, cruisingOut = 0, outNoReason = 0;
  const mismatch = {}, occ = { sound: {}, weak: {} }, open = new Map(), delays = { sound: [], weak: [] };
  const perNode = perNodeBoth[on];
  for (const seed of seeds) {
    let w = seedGraph(seed, 50, loaded, { target: cars, posted: true, keepRight: on });
    for (let i = 0; i < seconds * 20; i++) {
      const prev = w; w = step(w);
      const here = new Set();
      for (const a of w.actors) {
        here.add(a.id);
        const band = kd(a) < 0.2 ? "sound" : kd(a) > 0.5 ? "weak" : null;
        const was = prev.actors.find((x) => x.id === a.id);
        if (band && was && (a.keptRight ?? 0) > (was.keptRight ?? 0)) delays[band].push(a.returnDelay);
        /* per occasion: from the clock starting to it stopping */
        const o = open.get(a.id);
        if (a.hogSince != null && !o && band) open.set(a.id, { since: a.hogSince, band, kept: a.keptRight ?? 0 });
        if (o && a.hogSince != null && w.t - o.since > KEEP_RIGHT_FAULT) o.fault = true;
        if (o && a.hogSince == null) { const k = `${o.fault ? "marked, then " : ""}${(a.keptRight ?? 0) > o.kept ? "returned" : "reason or approach ended"}`; occ[o.band][k] = (occ[o.band][k] ?? 0) + 1; open.delete(a.id); }
        /* on this car's decision tick, against the world it decided from */
        if (!was || (prev.tick + (a.n ?? 0)) % LC_EVERY !== 0 || a.lc) continue;
        const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p.from];
        /* A turn bay is never a curb-lane question -- being in one IS the
           reason -- and its `leg.lane` is null, which `null + 1` and
           `null < leg.lanes - 1` would silently coerce into lane 0. */
        if (!leg || leg.bay || (leg.lanes ?? 1) < 2 || a.v < 3 || a.s < 40 || a.s > p.stopAt - 60) continue;
        cruising++;
        const node = w.course.at[a.k ?? 0].node;
        (perNode[node] ??= { cruising: 0, noReason: 0 }).cruising++;
        if (leg.lane < leg.lanes - 1) {
          cruisingOut++;
          if (!exceptionHolds(prev, a)) { outNoReason++; perNode[node].noReason++; }
        }
        if (a.hogSince != null) { flagged++; const why = exceptionHolds(prev, a); if (why) mismatch[why] = (mismatch[why] ?? 0) + 1; }
      }
      for (const [id, o] of open) if (!here.has(id)) { const k = `${o.fault ? "marked, then " : ""}left the map`; occ[o.band][k] = (occ[o.band][k] ?? 0) + 1; open.delete(id); }
    }
  }
  const q = (xs, p) => xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))].toFixed(1) : "-";
  console.log(`keepRight ${on ? "ON " : "OFF"}: ${cruising} cruising decisions on multi-lane approaches; out of the curb lane ${(100 * cruisingOut / cruising).toFixed(1)}%, with no reason ${(100 * outNoReason / cruising).toFixed(1)}% of all`);
  if (!on) continue;
  console.log(`  judged no-reason by the model ${flagged}; an exception held by the restatement: ${JSON.stringify(mismatch)}`);
  console.log(`  returns: sound ${delays.sound.length} (min ${q(delays.sound, 0)}, median ${q(delays.sound, 0.5)} s), weak ${delays.weak.length} (min ${q(delays.weak, 0)}, median ${q(delays.weak, 0.5)} s)`);
  console.log(`  occasions, sound: ${JSON.stringify(occ.sound)}\n  occasions, weak:  ${JSON.stringify(occ.weak)}`);
}
if (byNode) {
  console.log("\nby node (of this node's own multi-lane cruising, on vs off):");
  for (const node of Object.keys(perNodeBoth.true)) {
    const on = perNodeBoth.true[node], off = perNodeBoth.false[node] ?? { cruising: 0, noReason: 0 };
    const rOn = on.cruising ? on.noReason / on.cruising : 0, rOff = off.cruising ? off.noReason / off.cruising : 0;
    console.log(`  ${node}: on ${on.cruising} cruising, ${(100 * rOn).toFixed(1)}% no reason; off ${off.cruising} cruising, ${(100 * rOff).toFixed(1)}% no reason; ratio ${rOff ? (rOn / rOff).toFixed(3) : "-"}`);
  }
}
