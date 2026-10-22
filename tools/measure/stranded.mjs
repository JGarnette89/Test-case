/* CAN THE PLAYER BE STRANDED AT THE END OF AN ACCELERATION LANE? (22 October)
   The player stopped at the head of the lane, a few metres short of the
   taper, signalling left, in warmed traffic on the endless highway. Each
   tick: is there a gap beside them a competent driver (caution 1) would
   take from standstill -- the lane change's own test (lanechange.js
   lagNeed behind, a following gap ahead)? Time to the first one, every
   entrance at every warmed moment. With courtesy and without.
   Usage: node tools/measure/stranded.mjs [cars=150,300] [seeds=1,2,3] [moments=4] */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { playerAt, withDriver } from "../../src/sim/drive.js";
import { exitAlong } from "../../src/sim/graph.js";
import { lagNeed, changing } from "../../src/sim/lanechange.js";
import { DT, clearBetween, wantedGap } from "../../src/sim/traffic.js";

const [carsArg = "150,300", seedArg = "1,2,3", momArg = "4"] = process.argv.slice(2);
const loop = loadMap(testLoop());
const LIMIT = 120;
const ROOM = 5;   // m: the player stopped this far short of the taper
export function strandTrial(base, k, route, on, onTick = null) {
  /* ANTICIPATE=all|none: core/driver.js anticipates, for everybody (world.anticipate). */
  let w = { ...base, courtesy: on, ...(process.env.ANTICIPATE ? { anticipate: process.env.ANTICIPATE } : {}), ...(process.env.COURTESY_OLD ? { courtesyOld: true } : {}) };
  const L = w.course.at[k].layout, p = L.paths[route], to = L.legs[p.to];
  const toLeg = L.legAt(to.base, to.pos - 1);
  const s = p.length - to.accelClose - 5;
  /* Nobody in the player's own lane near them (they are standing where the joiners stand). */
  const mineAl = exitAlong(w.course, k, route, s);
  /* ...and nobody still LEAVING it: a car mid-change out of the lane is in
     both lanes until the change is done (placement.js), and the first version
     left it -- its route is already the road's -- so the player was placed
     inside a joiner merging from standstill, and the two waited on each other
     for the whole trial (22 October, verify-merge seed 2: "never"). */
  const leaving = (a) => changing(a.lc, w.t) && a.lc.fromTo === p.to;
  w = { ...w, actors: w.actors.filter((a) => { if ((a.k ?? 0) !== k || (L.paths[a.route]?.to !== p.to && !leaving(a))) return true; const al = exitAlong(w.course, k, a.route, a.s); return al == null || Math.abs(al - mineAl) > 40; }) };
  const pl = { ...playerAt(w.course, k, route), s, v: 0, v0: 25, caution: 1, signal: "left" };
  const t0 = w.t;
  for (let n = 0; n < LIMIT / DT; n++) {
    w = step(withDriver(w, pl));
    onTick?.(w);
    let ahead = null, behind = null, da = Infinity, db = Infinity;
    for (const a of w.actors) {
      if (a.player || (a.k ?? 0) !== k) continue;
      const q = L.paths[a.route];
      if (!q || q.to !== toLeg || a.s <= q.clearAt) continue;
      const al = exitAlong(w.course, k, a.route, a.s);
      if (al == null) continue;
      const d = al - mineAl;
      if (d >= 0 && d < da) { da = d; ahead = a; }
      if (d < 0 && -d < db) { db = -d; behind = a; }
    }
    /* Anywhere the player can still reach: up to ROOM forward, to where the
       taper begins -- a player in a crawling queue pulls up into the space
       the car letting them in has left, rather than waiting where they stopped. */
    const lead = ahead ? clearBetween(da, pl, ahead) - wantedGap(pl, ahead) : Infinity;
    const lag = behind ? clearBetween(db, behind, pl) - lagNeed(pl, behind, 1) : Infinity;
    if (lead >= 0 && lag >= 0) return w.t - t0;
    if (lag < 0 && lead >= -lag && -lag <= ROOM) return w.t - t0;
  }
  return Infinity;
}
if (process.argv[1]?.endsWith("stranded.mjs")) {
  for (const cars of carsArg.split(",").map(Number)) {
    const res = { on: [], off: [] };
    for (const seed of seedArg.split(",").map(Number)) {
      let base = seedGraph(seed, 50, loop, { target: cars, posted: true });
      for (let m = 0; m < Number(momArg); m++) {
        while (base.t < 120 + 45 * m) base = step(base);
        for (let k = 0; k < base.course.at.length; k++) {
          const L = base.course.at[k].layout;
          for (const [r, p] of Object.entries(L.paths)) {
            if (!L.legs[p.to]?.accel || !L.legs[p.from]?.road?.startsWith("on-")) continue;
            res.on.push(strandTrial(base, k, r, true));
            res.off.push(strandTrial(base, k, r, false));
          }
        }
      }
    }
    const q = (xs, f) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
    /* PAIRED, IN THE TAIL: the trials courtesy is for -- 20 s or more without it -- each beside its wait with it. */
    const tail = res.off.map((o, i) => [o, res.on[i]]).filter(([o]) => o >= 20);
    const fmt = (x) => (isFinite(x) ? x.toFixed(0) : "never");
    console.log(`${cars} cars, the tail (20 s or more without courtesy), without -> with: ${tail.map(([o, w]) => `${fmt(o)}->${fmt(w)}`).join(", ")}; with courtesy at most half in ${tail.filter(([o, w]) => w <= (isFinite(o) ? o : 120) / 2).length} of ${tail.length}; the tail's total wait with courtesy over without ${(tail.reduce((t, [, w]) => t + (isFinite(w) ? w : 120), 0) / Math.max(1, tail.reduce((t, [o]) => t + (isFinite(o) ? o : 120), 0))).toFixed(2)}`);
    for (const [name, xs] of Object.entries(res)) console.log(`${cars} cars, courtesy ${name}: ${xs.length} trials; first takeable gap median ${q(xs, 0.5).toFixed(1)} s, p90 ${q(xs, 0.9).toFixed(1)} s, worst ${Math.max(...xs).toFixed(1)} s; none in ${LIMIT} s: ${xs.filter((x) => !isFinite(x)).length}`);
  }
}
