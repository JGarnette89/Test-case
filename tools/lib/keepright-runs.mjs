/* =====================================================================
   ONE RUN OF verify-keepright: one mode, one seed, as plain data, so the
   runs -- independent of each other -- can go to worker threads and come
   back to be added up (4 November; the pattern is compliance-runs.mjs). The
   logic is the check's own, moved here unchanged; the check says what it
   means, and the reasoning stays there.
   ===================================================================== */
import { Worker } from "node:worker_threads";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { changing, LC_EVERY, KEEP_RIGHT_FAULT } from "../../src/sim/lanechange.js";
import { CAR, wantedGap } from "../../src/sim/traffic.js";
import { noticing } from "../../src/sim/marking.js";
import { deficitOf, knows } from "../../src/core/driver.js";

export const SEEDS = [3, 4, 5], SECS = 150, CARS = 200;
const loaded = loadMap(testMap1());
/* HOW LAX A DRIVER IS ABOUT KEEPING RIGHT, since the knowledge/compliance
   split: 1 for one who does not know the rule, their compliance deficit
   for one who does. The bands below are unchanged. */
const kd = (a) => (!knows(a, "keep-right") ? 1 : deficitOf(a.ratings ?? {}, "compliance").deficit ?? 0);
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
  const stop = (v, vl) => Math.max(0, (v * v - vl * vl) / 16);
  if (ahead && ahead.d - CAR.length < Math.max(1.5 + stop(a.v, ahead.b.v), wantedGap(a, ahead.b))) return "noGap";
  if (behind && behind.d - CAR.length < Math.max(1.5 + stop(behind.b.v, a.v), wantedGap(behind.b, a))) return "noGap";
  return null;
};

/* `mode` is "on", "off" (the rule switched off) or "stripped" (every driver's knowledge made perfect). */
export function runOne(mode, seed) {
  let flagged = 0, cruising = 0, noReason = 0;
  const disagree = {}, delays = [], marks = { sound: 0, weak: 0, other: 0 };
  const occ = { sound: { n: 0, marked: 0 }, weak: { n: 0, marked: 0 } }, open = new Map();
    let w = seedGraph(seed, 50, loaded, { target: CARS, posted: true, keepRight: mode !== "off" });
    /* Knowledge as DRAWN, recorded before any stripping, so a mark can
       be put down to the driver it belongs to. */
    const drawnKd = new Map();
    for (let i = 0; i < SECS * 20; i++) {
      const prev = w;
      w = step(w);
      /* Every driver watched from the tick they arrive, so the sheet is
         the whole population's, not a group chosen at one moment. */
      const fresh = w.actors.filter((a) => !drawnKd.has(a.id));
      if (fresh.length) {
        for (const a of fresh) drawnKd.set(a.id, kd(a));
        const ids = new Set(fresh.map((a) => a.id));
        w = { ...w,
          actors: w.actors.map((a) => (ids.has(a.id) ? { ...a, candidate: a.id, trip: 0, ...(mode === "stripped" ? { ratings: { ...a.ratings, knowledge: 1, compliance: 1 }, unknown: [] } : {}) } : a)),
          watching: [...(w.watching ?? []), ...fresh.map((a) => ({ id: a.id }))] };
      }
      w = noticing(w);
      const here = new Set();
      /* By id, once a tick: a search per car per tick was a billion comparisons over the section (14 October). */
      const prevById = new Map(prev.actors.map((x) => [x.id, x]));
      for (const a of w.actors) {
        here.add(a.id);
        const band = kd(a) < 0.2 ? "sound" : kd(a) > 0.5 ? "weak" : null;
        const was = prevById.get(a.id);
        if (was && (a.keptRight ?? 0) > (was.keptRight ?? 0)) delays.push(a.returnDelay);
        const o = open.get(a.id);
        if (a.hogSince != null && !o && band) open.set(a.id, { since: a.hogSince, band });
        if (o && a.hogSince != null && w.t - o.since > KEEP_RIGHT_FAULT) o.marked = true;
        if (o && a.hogSince == null) { occ[o.band].n++; if (o.marked) occ[o.band].marked++; open.delete(a.id); }
        if (!was || (prev.tick + (a.n ?? 0)) % LC_EVERY !== 0 || a.lc) continue;
        const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route], leg = L.legs[p.from];
        if (!leg || (leg.lanes ?? 1) < 2 || a.v < 3 || a.s < 40 || a.s > p.stopAt - 60) continue;
        /* A TURN BAY IS NOT A CURB-LANE QUESTION. `reasonToStayOut`
           (lanechange.js) answers "turn"/"curb" for a bay before it
           asks anything else -- being in one already IS the reason,
           the same way a driver already making a left is not "out of
           position" for not being in the curb lane. Without this a
           bay leg's `leg.lane` is null, `null + 1` reads as lane 1 in
           `exceptionHolds` below, and 1.2% of cruising occasions were
           measured judged by that nonsense (tools/measure/_diag_bay_cruise.mjs). */
        if (leg.bay) continue;
        cruising++;
        if (leg.lane < leg.lanes - 1 && !exceptionHolds(prev, a)) noReason++;
        if (a.hogSince != null) { flagged++; const why = exceptionHolds(prev, a); if (why) disagree[why] = (disagree[why] ?? 0) + 1; }
      }
      for (const [id, o] of open) if (!here.has(id)) { occ[o.band].n++; if (o.marked) occ[o.band].marked++; open.delete(id); }
    }
    /* Occasions still open when the run ends are counted as they stand,
       and the map cleared: ids repeat in the next seed. */
    for (const o of open.values()) { occ[o.band].n++; if (o.marked) occ[o.band].marked++; }
    open.clear();
    for (const f of w.faults ?? []) {
      if (f.trait !== "keepRight") continue;
      const k = drawnKd.get(f.who) ?? 0;
      marks[k < 0.2 ? "sound" : k > 0.5 ? "weak" : "other"]++;
    }
  return { flagged, disagree, cruising, noReason, occ, delays, marks };
}

/* Adding one mode's runs up, in seed order. */
export function merge(results) {
  const out = { runs: results.length, flagged: 0, disagree: {}, cruising: 0, noReason: 0, occ: { sound: { n: 0, marked: 0 }, weak: { n: 0, marked: 0 } }, delays: [], marks: { sound: 0, weak: 0, other: 0 } };
  for (const r of results) {
    out.flagged += r.flagged; out.cruising += r.cruising; out.noReason += r.noReason; out.delays.push(...r.delays);
    for (const [k, n] of Object.entries(r.disagree)) out.disagree[k] = (out.disagree[k] ?? 0) + n;
    for (const b of ["sound", "weak"]) { out.occ[b].n += r.occ[b].n; out.occ[b].marked += r.occ[b].marked; }
    for (const b of ["sound", "weak", "other"]) out.marks[b] += r.marks[b];
  }
  return out;
}

/* Every mode's runs, a thread per run up to `workers` at a time. A worker that dies rejects: a run that did not happen must fail the check, never shrink its sample. */
export function runAll(modes, workers) {
  const jobs = modes.flatMap((mode) => SEEDS.map((seed) => ({ mode, seed })));
  let next = 0;
  const one = () => new Promise((resolve, reject) => {
    const j = jobs[next++];
    if (!j) return resolve();
    const wk = new Worker(new URL("./keepright-worker.mjs", import.meta.url), { workerData: j });
    wk.once("message", (r) => { j.result = r; });
    wk.once("error", reject);
    wk.once("exit", (code) => { if (code !== 0 || !j.result) return reject(new Error(`keep-right run ${j.mode} seed ${j.seed}: worker exited ${code}`)); one().then(resolve, reject); });
  });
  return Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, one)).then(() => Object.fromEntries(modes.map((m) => [m, merge(jobs.filter((j) => j.mode === m).map((j) => j.result))])));
}
