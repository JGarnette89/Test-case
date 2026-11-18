/* THE MERGE TOLERANCE, RE-CHECKED ON THE GENERATED ROAD (backlog item 3 of the 18 Nov list; the lead: "if the tolerance's benefit does not reproduce on the generated road, that is a shipped default resting on a measurement from a map we have retired").
   The 2.5 s merge tolerance (DEFAULT_MERGE_TOLERANCE, DECISIONS 10.70, 10.80) was calibrated on the loop at 150 to 300 cars with four entrances; Jay drives the generated road, which has its own ramps and about a third of the density around a
   joiner. One arm per process: `TOL` is `off` (null: the tolerance not applied) or a number of seconds, the played world with no player (traffic only), `CARS` the target, `SEEDS` how many, `SECS` the length. Per arm it reports what verify-merge
   counts for the loop, pooled over the seeds: joiners (cars on an acceleration lane past its taper), the share that reached the end of the lane at or near rest (under 2 m/s within 20 m of where it runs out, having come within 15 m), joiners
   whose continuous stand at rest exceeded 20 s, merges made, and the TIME GAP a merge was accepted at (the car behind it in the target lane, gap over its speed, read from the world's own `mergePlan` the tick before the change began): that
   last is how the arm is proved by something the world does and not by the setting: the tolerance caps what a merge asks for at TOL seconds of the car behind's speed, so rule off must accept merges at larger gaps than rule on.
   Usage: TOL=2.5 CARS=100 SEEDS=8 SECS=600 node tools/measure/merge-gen.mjs [map=test-highway-gen-wide] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { mergePlan } from "../../src/sim/lanechange.js";
import { clearBetween } from "../../src/sim/traffic.js";
const id = process.argv[2] ?? "test-highway-gen-wide", TOL = process.env.TOL ?? "2.5", CARS = Number(process.env.CARS ?? 100), SEEDS = Number(process.env.SEEDS ?? 8), SECS = Number(process.env.SECS ?? 600);
const tol = TOL === "off" ? null : Number(TOL);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === id).build());
// BARE WORLD: seedGraph with the played options stated one by one, no player, shaping off: the subject is the merge between traffic and the ramps, where there is no player to shape around.
let joiners = 0, nearRest = 0, long20 = 0, merges = 0, crashes = 0; const gaps = [], stands = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  let w = seedGraph(seed, 50, loaded, { every: 2.0, target: CARS, posted: true, walkers: true, rivals: true, brakeReaction: true, mergeTolerance: tol });
  /* a world built with the tolerance OFF omits the key (null is an explicit off, `seedGraph`), so absent reads as null: the first run threw on exactly that, undefined against null */
  if ((w.mergeTolerance ?? null) !== tol) throw new Error(`the world carries mergeTolerance ${w.mergeTolerance ?? null}, not ${tol}`);
  for (let i = 0; i < 1200; i++) w = step(w);
  const c0 = (w.crashes ?? []).length, ids = new Set(), reach = new Set(), minV20 = new Map(), standing = new Map(), maxStand = new Map();
  for (let i = 0; i < SECS * 20; i++) {
    const before = w; w = step(w);
    for (const a of w.actors) {
      const L = w.course.at[a.k].layout, p = L.paths[a.route], to = L.legs[p.to];
      if (to?.accel && a.s > p.clearAt) {
        ids.add(a.id);
        const toEnd = p.length - to.accelClose - a.s;
        if (toEnd <= 20) { minV20.set(a.id, Math.min(minV20.get(a.id) ?? Infinity, a.v)); if (toEnd <= 15) reach.add(a.id); }
        if (a.v < 0.5) { const t = (standing.get(a.id) ?? 0) + 0.05; standing.set(a.id, t); maxStand.set(a.id, Math.max(maxStand.get(a.id) ?? 0, t)); } else standing.delete(a.id);
      }
      if (a.lc?.merge && a.lc.at === before.t) {
        const was = before.actors.find((x) => x.id === a.id);
        if (was) { const Lw = before.course.at[was.k].layout, pw = Lw.paths[was.route], mp = mergePlan(before, was, Lw, pw, Lw.legs[pw.to]); const nb = mp?.best?.nb; if (nb?.behind) gaps.push(clearBetween(nb.db, nb.behind, was) / Math.max(1, nb.behind.v ?? 1)); merges++; }
      }
    }
  }
  crashes += (w.crashes ?? []).length - c0; joiners += ids.size;
  nearRest += [...reach].filter((x) => (minV20.get(x) ?? Infinity) < 2).length;
  for (const v of maxStand.values()) { stands.push(v); if (v > 20) long20++; }
}
const q = (xs, f) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(f * xs.length))] : NaN);
const p = nearRest / Math.max(1, joiners), se = Math.sqrt(p * (1 - p) / Math.max(1, joiners));
console.log(JSON.stringify({ map: id, tol: TOL, cars: CARS, seeds: SEEDS, secs: SECS, joiners, nearRest, share: p, se, long20, merges, crashes, gapP10: q(gaps, 0.1), gapP50: q(gaps, 0.5), gapsN: gaps.length, standP50: q(stands, 0.5), standP90: q(stands, 0.9) }));
