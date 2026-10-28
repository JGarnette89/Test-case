/* DOES THE SKILL DIAL SHOW ON THE ROAD? (28 October; SIMULATOR IN FLIGHT 34 --
   the desk half of the falsification test, run before the maintainer looks.)
   One map, one seed, one dial level (stated, never defaulted): the dial set
   at t=0, so the warm-up population is REDRAWN at it (skill.js, the live
   path) and arrivals drawn at it; warmed 60 s, then 180 s counted over every
   AI car. Each kind of visible bad driving counted as it begins, by its own
   detector written here -- the shapes of marking.js's, restated over the
   whole traffic, not imported, so the instrument is not the code it reads:
     rolled       crossed the stop line of a stop sign without coming to rest
                  since reaching the line region (marking.js's rolling stop)
     harsh        braking harder than HARSH_AT (the abrupt line), per onset
     keepRight    out of the curb lane with no reason past KEEP_RIGHT_FAULT
     tightChange  a lane change into a gap a competent driver would refuse
                  (lc.tight < 1)
     blindMiss    a lane change with somebody in the blind spot, unlooked
     missedTurn   gave up getting over for the exit drawn
     lateGreen    still at a green past the undue-delay mark, unnoticed
     horn         a horn sounded (aimed, by construction, at an error)
     crash        contact between two cars (world.crashes, new entries)
   Also: the mean of each axis's soundness over the cars on the map at the
   end, so the population the counts came from is stated with them.
   Usage: node tools/measure/skill-spread.mjs map cars seed level checks(0|1) */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, waitAt, pathOf, layoutOf, AT_LINE, AT_REST, UNDUE_AT } from "../../src/sim/crossing.js";
import { DT, HARSH_AT } from "../../src/sim/traffic.js";
import { KEEP_RIGHT_FAULT } from "../../src/sim/lanechange.js";
import { AXES, soundnessOf } from "../../src/core/driver.js";

const [mapId, cars, seed, level, chk] = process.argv.slice(2);
if (chk == null) throw new Error("usage: map cars seed level checks(0|1)");
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
let w = seedGraph(Number(seed), 50, loaded, { every: 2.0, target: Number(cars), posted: true, checks: chk === "1" });
w = { ...w, skill: Number(level) };
for (let i = 0; i < 60 / DT; i++) w = step(w);
const C = { rolled: 0, harsh: 0, keepRight: 0, tightChange: 0, blindMiss: 0, missedTurn: 0, lateGreen: 0, horn: 0, crash: 0 };
const lined = new Map(), green = new Map(), seenLc = new Set(), crashSeen = new Set((w.crashes ?? []).map((c) => `${c.t}|${c.a}|${c.b}`));
let prev = new Map(w.actors.map((a) => [a.id, a])), carMinutes = 0;
for (let i = 0; i < 180 / DT; i++) {
  w = step(w);
  carMinutes += w.actors.filter((a) => !a.player).length * DT / 60;
  for (const a of w.actors) {
    if (a.player) continue;
    const b = prev.get(a.id);
    const path = pathOf(w, a);
    /* the rolling stop, at a stop sign */
    if (path && layoutOf(w, a).place?.control?.[path.from] === "stop") {
      const key = `${a.id}|${a.k}|${a.route}`;
      let st = lined.get(key);
      if (!st && waitAt(path) - a.s < AT_LINE + 6 && a.s < path.stopAt) { st = { rested: false }; lined.set(key, st); }
      if (st && !st.done) {
        if (a.v < AT_REST) st.rested = true;
        if (a.s >= path.stopAt) { if (!st.rested) C.rolled++; st.done = true; }
      }
    }
    if ((a.a ?? 0) < -HARSH_AT && !((b?.a ?? 0) < -HARSH_AT)) C.harsh++;
    const hog = (x) => x?.hogSince != null && w.t - x.hogSince > KEEP_RIGHT_FAULT;
    if (hog(a) && !(b?.hogSince != null && w.t - DT - b.hogSince > KEEP_RIGHT_FAULT)) C.keepRight++;
    if (a.lc && !seenLc.has(a.id + "@" + a.lc.at)) {
      seenLc.add(a.id + "@" + a.lc.at);
      if (!a.lc.abort && a.lc.tight < 1) C.tightChange++;
      if (a.lc.missed) C.blindMiss++;
    }
    if ((a.missedTurns ?? 0) > (b?.missedTurns ?? 0)) C.missedTurn++;
    /* how long they have sat at a green unnoticed, kept here -- never written onto the world */
    if (a.wake == null) green.delete(a.id);
    else {
      if (!green.has(a.id)) green.set(a.id, { since: w.t, counted: false });
      const g = green.get(a.id);
      if (!g.counted && w.t - g.since > UNDUE_AT) { C.lateGreen++; g.counted = true; }
    }
    if (a.honkAt != null && a.honkAt !== b?.honkAt) C.horn++;
  }
  for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (!crashSeen.has(k)) { crashSeen.add(k); C.crash++; } }
  prev = new Map(w.actors.map((a) => [a.id, a]));
}
const per100 = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, +(v / carMinutes * 100).toFixed(2)]));
const total = +(Object.entries(C).filter(([k]) => k !== "crash").reduce((s, [, v]) => s + v, 0) / carMinutes * 100).toFixed(2);
const ais = w.actors.filter((a) => !a.player && !a.rival);
const mean = Object.fromEntries(AXES.map((x) => [x, +(ais.reduce((s, a) => s + soundnessOf(a.ratings, x), 0) / Math.max(1, ais.length)).toFixed(2)]));
console.log(JSON.stringify({ map: mapId, cars: Number(cars), seed: Number(seed), level: Number(level), checks: Number(chk), carMinutes: Math.round(carMinutes), counts: C, per100carMin: per100, totalPer100: total, soundness: mean }));
