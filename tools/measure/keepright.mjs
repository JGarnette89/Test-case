/* KEEP RIGHT, measured (SIMULATOR.md 1.1.17). Arguments:
   node tools/measure/keepright.mjs [cars=200] [seconds=150] [seeds=3,4,5]

   The exceptions are restated here from the maintainer's words, not
   imported, and each car is judged on its own decision tick against the
   world it decided from -- a driver reconsiders twice a second
   (LC_EVERY), from the previous committed state. */
import { seedGraph, step } from "../../src/sim/crossing.js";
import { deficitOf } from "../../src/engine/ratings.js";
import { CAR, wantedGap } from "../../src/sim/traffic.js";
import { changing, LC_EVERY, KEEP_RIGHT_FAULT } from "../../src/sim/lanechange.js";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
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
for (const on of [true, false]) {
  let flagged = 0, cruising = 0, cruisingOut = 0, outNoReason = 0;
  const mismatch = {}, occ = { sound: {}, weak: {} }, open = new Map(), delays = { sound: [], weak: [] };
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
        if (!leg || (leg.lanes ?? 1) < 2 || a.v < 3 || a.s < 40 || a.s > p.stopAt - 60) continue;
        cruising++;
        if (leg.lane < leg.lanes - 1) { cruisingOut++; if (!exceptionHolds(prev, a)) outNoReason++; }
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
