/* OBSERVATION AGAINST PEOPLE ON FOOT, SCORED ON THE DECISION, NOT THE
   OUTCOME (Jay's clearance ruling: a gap taken with too little margin is a
   fault whether or not anybody is hit). For every ENCOUNTER -- a pedestrian
   coming to hold the point where a car's path crosses their crosswalk,
   while the car is still short of it -- record:

     registration delay  from when the person truly held the car's way to
                         when the driver's own picture shows it (heldAhead
                         with the driver's glances, against heldAhead with
                         none);
     late                registered with less room than a comfortable stop
                         needs (2.5 m/s^2), or not before reaching the paint;
     peak braking        in the encounter;
     margin              how far short of the paint the car came to rest;
     paused              the person had to stop at the middle for the car.

   Same seeds with drivers looking away and without; split by whether the
   driver was looking away when the person stepped into their way, and by
   observation deficit. Run: node tools/measure/ped-observation.mjs [secs] [seeds...] */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, pathOf } from "../../src/sim/crossing.js";
import { testPeds } from "../../src/map/samples.js";
import { heldAhead } from "../../src/sim/peds.js";
import { lookingAway } from "../../src/sim/attention.js";
import { deficitOf } from "../../src/core/driver.js";
import { DT, CAR } from "../../src/sim/traffic.js";

const secs = Number(process.argv[2] ?? 600);
const seeds = process.argv.slice(3).map(Number);
if (!seeds.length) seeds.push(3, 5, 7);

export function measure(seed, perceive, secs, pedsAlwaysSeen = false) {
  let w = { ...seedGraph(seed, 50, loadMap(testPeds()), { target: 60, posted: true, perceive }), ...(pedsAlwaysSeen ? { pedsAlwaysSeen } : {}) };
  const open = new Map(), done = [];
  let pauses = 0;
  for (let i = 0; i < secs / DT; i++) {
    const beforePeds = new Map((w.peds ?? []).map((q) => [q.id, q]));
    w = step(w);
    for (const q of w.peds ?? []) { const b = beforePeds.get(q.id); if (b && b.state === "crossing" && q.state === "crossing" && q.u === b.u) pauses++; }
    for (const a of w.actors) {
      if (a.player || a.crash || w.course.at[a.k]?.through) continue;
      const path = pathOf(w, a);
      const truth = heldAhead(w, { ...a, lag: 0 }, path);   // what a driver who never looks away would know
      const key = a.id + "@" + a.k;
      let e = open.get(key);
      if (truth && !e) {
        e = { t0: w.t, t1: null, away: lookingAway(w.t, a) > 0, lag: a.lag ?? 0, obs: deficitOf(a.ratings ?? {}, "observation").deficit ?? 0, peak: 0, late: false, margin: null, band: truth.s };
        open.set(key, e);
      }
      if (!e) continue;
      const seen = heldAhead(w, a, path);
      if (seen && e.t1 == null) {
        e.t1 = w.t;
        const room = seen.s - (a.s + CAR.length / 2);
        e.late = (a.v ?? 0) > 0.3 && ((a.v ** 2) / (2 * 2.5) > room);
      }
      e.peak = Math.max(e.peak, -(a.a ?? 0));
      if (a.v < 0.3 && e.margin == null) e.margin = e.band - (a.s + CAR.length / 2);
      /* The encounter ends when nobody holds the car's way, or it reaches the paint. */
      if (!truth || a.s + CAR.length / 2 > e.band + 0.5) {
        if (e.t1 == null && a.s + CAR.length / 2 > e.band + 0.5) e.late = true, e.never = true;
        done.push(e); open.delete(key);
      }
    }
  }
  return { done, pauses };
}

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
const summary = (name, es) => {
  const reg = es.filter((e) => e.t1 != null).map((e) => e.t1 - e.t0);
  const delayed = reg.filter((d) => d > 0.001);
  const late = es.filter((e) => e.late).length, never = es.filter((e) => e.never).length;
  const hard = es.filter((e) => e.peak > 3.5).length;
  const mean = (xs) => (xs.length ? xs.reduce((q, x) => q + x, 0) / xs.length : NaN);
  const margins = es.filter((e) => e.margin != null).map((e) => e.margin);
  return `${name}: ${es.length} encounters | registered late at all ${pct(delayed.length, es.length)} (mean delay when late ${mean(delayed).toFixed(2)}s) | too late to stop comfortably ${pct(late, es.length)} | never before the paint ${never} | braked harder than 3.5 m/s^2 ${pct(hard, es.length)} | mean stop margin ${mean(margins).toFixed(2)} m`;
};

if (process.argv[1]?.endsWith("ped-observation.mjs")) {
  for (const [perceive, always] of [[false, false], [true, false], [true, true]]) {
    const all = [];
    let pauses = 0;
    for (const s of seeds) { const r = measure(s, perceive, secs, always); all.push(...r.done); pauses += r.pauses; }
    console.log(`\n=== drivers look away: ${perceive ? "ON" : "off"}${always ? ", but people on foot ALWAYS seen (the control)" : ""} (${seeds.length} seeds x ${secs}s) -- pedestrian pause-ticks at the middle: ${pauses}`);
    console.log(summary("  everybody", all));
    console.log(summary("  sound observers, any world", all.filter((e) => e.obs < 0.2)));
    console.log(summary("  poor observers, any world", all.filter((e) => e.obs > 0.5)));
    if (perceive) {
      console.log(summary("  looking away when the person stepped into their way", all.filter((e) => e.away)));
      console.log(summary("  looking at the time", all.filter((e) => !e.away)));
      console.log(summary("  sound observers (deficit < 0.2)", all.filter((e) => e.obs < 0.2)));
      console.log(summary("  poor observers (deficit > 0.5)", all.filter((e) => e.obs > 0.5)));
    }
  }
}
