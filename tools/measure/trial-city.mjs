/* THE TRIAL CITY IN TRAFFIC (src/map/trial.js): does it run, and is it
   joined up? Ten simulated minutes at a car count, then:
   - overlaps that are not a recorded crash (must be none), and crashes;
   - the step's cost;
   - every ramp: how many different cars used it;
   - joined up: cars seen both on the highway and in the city, each way;
   - nobody stuck: the longest any car stood, and where.
     node tools/measure/trial-city.mjs [cars] [minutes] [seed]   */
import { trialCity } from "../../src/map/trial.js";
import { loadMap } from "../../src/map/load.js";
import { mapFromBrief } from "../../src/map/brief.js";
import { seedGraph, step, overlapping, DT } from "../../src/sim/crossing.js";

const CARS = Number(process.argv[2] ?? 400), MIN = Number(process.argv[3] ?? 10), SEED = Number(process.argv[4] ?? 1);
/* NOHW=1: the same brief without the highway -- the controlled comparison for anything the city does on its own. */
const L = loadMap(process.env.NOHW ? mapFromBrief({ size: "large", arterials: "loop", everyType: true, downtown: true, buses: true, drivers: "mixed" }, 1) : trialCity());
let w = seedGraph(SEED, 50, L, { target: CARS, posted: true, walkers: true });
const legRoad = (a) => { const lay = w.course.at[a.k ?? 0]?.layout, p = lay?.paths[a.route]; return p ? [lay.legs[p.from]?.road, lay.legs[p.to]?.road] : [null, null]; };
const onHw = (id) => /^hw-/.test(id ?? ""), onRamp = (id) => /^(on|off)-/.test(id ?? "");
const ramps = {}, hw = new Set(), city = new Set(), hwThenCity = new Set(), cityThenHw = new Set();
const still = new Map(); let longest = { s: 0 };
let over = 0, overPairs = new Set(), ms = 0;
const N = (MIN * 60) / DT;
for (let i = 0; i < N; i++) {
  const t0 = performance.now(); w = step(w); ms += performance.now() - t0;
  for (const a of w.actors) {
    if (a.kind === "bus") continue;
    for (const r of legRoad(a)) {
      if (!r) continue;
      if (onRamp(r)) (ramps[r] ??= new Set()).add(a.id);
      if (onHw(r)) { hw.add(a.id); if (city.has(a.id)) cityThenHw.add(a.id); }
      else if (!onRamp(r) && !/^s\d/.test(r)) { city.add(a.id); if (hw.has(a.id)) hwThenCity.add(a.id); }
    }
    if ((a.v ?? 0) < 0.1 && !a.crash) {
      const s = (still.get(a.id) ?? 0) + DT; still.set(a.id, s);
      if (s > longest.s) longest = { s, id: a.id, roads: legRoad(a), t: w.t };
    } else still.delete(a.id);
  }
  if (i % 10 === 0) for (const o of overlapping(w)) { over++; overPairs.add(`${o.a}/${o.b}`); }
}
const crashes = (w.crashLog ?? w.crashes ?? []).length;
console.log(`trial city, ${CARS} cars asked, seed ${SEED}, ${MIN} simulated minutes; ${w.actors.length} on the map at the end`);
console.log(`step: ${(ms / N).toFixed(1)} ms mean`);
console.log(`overlaps not a crash: ${over} (${[...overPairs].slice(0, 6).join(", ")}); crashes logged: ${crashes}`);
console.log(`ramps, different cars on each: ${Object.entries(ramps).sort().map(([k, v]) => `${k} ${v.size}`).join(", ") || "none"}`);
console.log(`cars seen on the highway ${hw.size}, in the city ${city.size}; highway then city ${hwThenCity.size}, city then highway ${cityThenHw.size}`);
for (const c of (w.crashes ?? [])) {
  const near = L.nodes.map((n) => ({ n, d: Math.hypot(n.at.x - c.at.x, n.at.y - c.at.y) })).sort((p, q) => p.d - q.d)[0];
  console.log(`  crash at t ${c.t.toFixed(0)} (${c.at.x.toFixed(0)}, ${c.at.y.toFixed(0)}): ${near.d.toFixed(0)} m from node ${near.n.id} [${near.n.legs.map((l) => `${l.road}:${l.control}`).join(" ")}]`);
}
console.log(`longest standstill: ${longest.s.toFixed(0)} s, car ${longest.id} on ${JSON.stringify(longest.roads)} at t ${longest.t?.toFixed(0)}`);
