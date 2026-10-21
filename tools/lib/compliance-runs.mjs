/* =====================================================================
   ONE RUN OF verify-compliance's READABILITY TEST (section 3), as plain
   data -- so the runs, which are independent of each other, can go to
   worker threads and come back to be added up (22 October: the 144 runs of
   the lit crossroads were the suite's long pole, about 950 s, and their
   counts sit too near their floors to sample fewer). The logic is the
   check's own, moved here unchanged; the check says what it means.
   ===================================================================== */
import { Worker } from "node:worker_threads";
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, pathOf, layoutOf, DT, restAt, whatStops } from "../../src/sim/crossing.js";
import { movementLight } from "../../src/sim/signal.js";
import { crosswalksOf } from "../../src/sim/peds.js";
import { CAR, STANDSTILL } from "../../src/sim/traffic.js";
import { reads, deficitOf } from "../../src/core/driver.js";

/* Where an occasion is watched from: see the check. */
export const WATCH = STANDSTILL + 2;
/* The cost of an occasion, measured here and nowhere else: see the check. */
const WITNESS = 4;

const maps = {};
export function mapNamed(name) {
  if (maps[name]) return maps[name];
  if (name === "city") return (maps.city = loadMap(TEST_MAPS.find((t) => t.id === "city").build()));
  const P = (x, y) => ({ x, y, z: 0 });
  const lit = emptyMap("lit-x");
  lit.bounds = { x: 0, y: 0, w: 600, h: 600 };
  for (const [id, a] of [["w", P(0, 300)], ["e", P(600, 300)], ["n", P(300, 0)], ["s", P(300, 600)]]) lit.roads.push(road({ id, points: [a, P(300, 300)], control: { start: "none", end: "signal" } }));
  return (maps.lit = loadMap(lit));
}

const witnessed = (w, a) => {
  const k = a.k ?? 0, L = layoutOf(w, a), mine = pathOf(w, a), base = L.legs[mine.from]?.base ?? mine.from;
  for (const b of w.actors) {
    if (b.id === a.id || (b.k ?? 0) !== k) continue;
    const p = L.paths[b.route];
    if (!p) continue;
    if ((L.legs[p.from]?.base ?? p.from) === base && b.s <= a.s) continue;
    const toBox = p.stopAt - b.s;
    if (toBox < 0 ? -toBox < 12 + CAR.length : toBox / Math.max(b.v, 0.5) < WITNESS) return true;
  }
  const cws = crosswalksOf(w.course);
  return (w.peds ?? []).some((q) => q.state !== "struck" && cws[q.cw]?.k === k);
};

/* One run: { tally: {group: {key: n}}, byDriver: [[key, {rolledAlone, restedSeen, seen}]] }. */
export function runOne(mapName, cars, seed) {
  const map = mapNamed(mapName), onClock = mapName === "lit";
  const tally = {}, byDriver = new Map();
  const bump = (g, key) => { tally[g] = tally[g] ?? {}; tally[g][key] = (tally[g][key] ?? 0) + 1; };
  let w = seedGraph(seed, 50, map, { target: cars, posted: true, trucks: 0, actuated: !onClock });
  const open = new Map();
  for (let i = 0; i < 300 / DT; i++) {
    w = step(w);
    for (const a of w.actors) {
      if (a.player || a.crash) continue;
      const path = pathOf(w, a), L = layoutOf(w, a);
      const kind = L.signal ? (path.intent === "right" && movementLight(L.signal, L.legs[path.from]?.base, "right", w.t, w.lights?.[a.k ?? 0]?.live) === "red" ? "right-on-red" : null)
        : L.place.control[path.from] === "stop" ? "stop" : null;
      const key = `${a.id}@${a.k}@${a.route}`;
      let o = open.get(key);
      const toLine = restAt(path, a) - a.s;
      if (!o && kind && toLine < WATCH && toLine > -1) open.set(key, o = { kind, seen: witnessed(w, a), rested: false, before: a.stoppedAt != null && a.stoppedAt < 0 });
      if (!o) continue;
      if (a.v < 0.3 && !o.rested) { o.rested = true; if (whatStops(a, w).held) o.forced = true; }
      if (a.s >= path.stopAt && !o.done) {
        o.done = true;
        if (o.before || o.forced) continue;
        if (o.kind === "right-on-red" && (movementLight(L.signal, L.legs[path.from]?.base, "right", w.t, w.lights?.[a.k ?? 0]?.live) !== "red" || a.amberGo)) continue;
        const g = !reads(a, o.kind) ? "unread" : a.rollsStops === "unwatched" ? "scofflaw" : deficitOf(a.ratings, "compliance").deficit < 0.2 ? "sound" : null;
        if (!g) continue;
        bump(`${o.kind}:${g}`, `${o.seen ? "seen" : "alone"}.${o.rested ? "rest" : "roll"}`);
        if (g === "scofflaw") {
          const d = byDriver.get(`${seed}:${a.id}`) ?? { rolledAlone: 0, restedSeen: 0, seen: 0 };
          if (!o.seen && !o.rested) d.rolledAlone++;
          if (o.seen) { d.seen++; if (o.rested) d.restedSeen++; }
          byDriver.set(`${seed}:${a.id}`, d);
        }
      }
    }
  }
  return { tally, byDriver: [...byDriver.entries()] };
}

/* Adding runs up, in any order: tallies summed, a driver's counts summed
   under their key (the same seed's runs share drivers' keys, as the serial
   loop did). */
export function merge(results) {
  const tally = {}, byDriver = new Map();
  for (const r of results) {
    for (const [g, keys] of Object.entries(r.tally)) for (const [k, n] of Object.entries(keys)) { tally[g] = tally[g] ?? {}; tally[g][k] = (tally[g][k] ?? 0) + n; }
    for (const [k, d] of r.byDriver) { const e = byDriver.get(k) ?? { rolledAlone: 0, restedSeen: 0, seen: 0 }; e.rolledAlone += d.rolledAlone; e.restedSeen += d.restedSeen; e.seen += d.seen; byDriver.set(k, e); }
  }
  return { tally, byDriver };
}

/* The runs, spread over `workers` threads (each a fresh module instance
   running its share in order). */
export function runAll(runs, workers) {
  const shares = Array.from({ length: workers }, () => []);
  runs.forEach((r, i) => shares[i % workers].push(r));
  return Promise.all(shares.filter((s) => s.length).map((share) => new Promise((resolve, reject) => {
    const wk = new Worker(new URL("./compliance-worker.mjs", import.meta.url), { workerData: share });
    wk.once("message", resolve);
    wk.once("error", reject);
    wk.once("exit", (code) => { if (code !== 0) reject(new Error(`worker exited ${code}`)); });
  }))).then(merge);
}
