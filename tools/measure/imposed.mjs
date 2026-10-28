/* THE COST A LANE CHANGE IMPOSES (28 October; the maintainer's definition of
   aggression -- "how much cost a driver is willing to impose on others",
   measured as the deceleration their action forces on somebody else; SIMULATOR
   IN FLIGHT 35). For every lane change begun (aborts aside): the car whose
   leader BECOMES the changer within 4 s of the start, and its hardest braking
   over that time -- the deceleration the change cost it. Split by whether the blind spot was missed (observation, not choice), by the
   changer's confidence (bold, sound, timid by cautionOf) and whether the
   change was for a turn, a merge, keep-right or a choice. One map, one seed,
   checks stated. Usage: node tools/measure/imposed.mjs map cars seed mins checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, whatStops } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const [id, cars, seed, mins, chk] = process.argv.slice(2);
if (chk == null) throw new Error("usage: map cars seed mins checks(0|1)");
let w = seedGraph(Number(seed), 50, loadMap(TEST_MAPS.find((t) => t.id === id).build()), { every: 2.0, target: Number(cars), posted: true, checks: chk === "1" });
for (let i = 0; i < 60 / DT; i++) w = step(w);
const open = new Map(), done = [], seen = new Set();   // seen: a change outlives its 4 s window, and must not be opened twice   // change key -> { band, kind, at, followers: Map(id -> peak decel) }
for (let i = 0; i < Number(mins) * 60 / DT; i++) {
  w = step(w);
  const byId = new Map(w.actors.map((a) => [a.id, a]));
  for (const a of w.actors) {
    if (!a.lc || a.lc.abort || a.player) continue;
    const key = `${a.id}@${a.lc.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    open.set(key, { id: a.id, at: a.lc.at, band: a.caution < 0.85 ? "bold" : a.caution > 1.15 ? "timid" : "sound", missed: !!a.lc.missed, kind: a.lc.merge ? "merge" : a.lc.keepRight ? "keepRight" : a.lc.mandatory ? "forTurn" : "choice", peak: 0, who: null });
  }
  for (const a of w.actors) {
    if (a.player || (a.v ?? 0) < 1) continue;
    const l = whatStops(a, w).leader;
    if (!l) continue;
    const L = byId.get(l.id);
    if (!L?.lc) continue;
    const o = open.get(`${L.id}@${L.lc.at}`);
    if (!o || w.t - o.at > 4) continue;
    const dec = Math.max(0, -(a.a ?? 0));
    if (o.who == null || o.who === a.id) { o.who = a.id; o.peak = Math.max(o.peak, dec); }
  }
  for (const [k, o] of open) if (w.t - o.at > 4) { done.push(o); open.delete(k); }
}
const q = (xs, p) => (xs.length ? xs.slice().sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(p * xs.length))] : null);
const sum = (rows) => { const xs = rows.filter((o) => o.who).map((o) => o.peak); return { n: rows.length, followed: xs.length, med: q(xs, 0.5)?.toFixed(2), p90: q(xs, 0.9)?.toFixed(2), max: q(xs, 1)?.toFixed(2), over1: xs.filter((x) => x > 1).length, over3: xs.filter((x) => x > 3).length }; };
const out = { map: id, cars: Number(cars), seed: Number(seed), mins: Number(mins), checks: Number(chk), all: sum(done) };
for (const b of ["bold", "sound", "timid"]) out[b] = sum(done.filter((o) => o.band === b));
for (const k of ["choice", "keepRight", "forTurn", "merge"]) out[k] = sum(done.filter((o) => o.kind === k));
out.looked = sum(done.filter((o) => !o.missed)); out.missed = sum(done.filter((o) => o.missed));
console.log(JSON.stringify(out));
