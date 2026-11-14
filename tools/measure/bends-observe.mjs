/* WHAT A ROAD LOOKS LIKE WHEN THE BENDS ARE THE DRIVERS' BUSINESS (Jay's standing model, DECISIONS 10.96: push your skill, your car or the conditions, two of the three, never all three; "I'd like to see how our drivers just tackle obstacles and issues without that guiding hand"). AN OBSERVATION, NOT A RESULT AGAINST A BAR: no rate is aimed at, nothing is tuned.
   Three five-lane 110 roads, the played world with nobody driving: AS SHIPPED (a posted speed lowered to each bend); BENDS BY THE DRIVER with the gentle radii the shipped road is drawn with; BENDS BY THE DRIVER with the generator's own radii (sweeps 500-1300 m, tight bends 280-450 m).
   Per road, `secs` after a warm-up: the crashes by cause (the road: a car that asked more of a bend than it had; or another car), who lost the road (steering rating, caution, speed, the radius it lost it on), the sideways acceleration taken on bends, the speed spread on bends, and how many cars were on the road.
   Usage: node tools/measure/bends-observe.mjs <variant: shipped|gentle|own> [cars=300] [seed=1] [secs=300] */
import { roadgen, testHighwayGenWide } from "../../src/map/roadgen.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { curvatureAt, onTheOpenRoad } from "../../src/sim/corner.js";
import { CLEAN, GRIP } from "../../src/sim/player.js";
const [variant = "shipped", carsArg = "300", seedArg = "1", secsArg = "300"] = process.argv.slice(2);
const GENTLE = { SWEEP_R_MIN: 800, SWEEP_R_MAX: 1800, SBEND_R_MIN: 750, SBEND_R_MAX: 1400, CHAIN_R_MIN: 750, CHAIN_R_MAX: 1100, TIGHT_R_MIN: 450, TIGHT_R_MAX: 650 };
const base = { ID: "x", LANES: 5, LIMIT: 110, CARS: 0, CARS_MAX: 0, SHAPE: false };
const raw = variant === "shipped" ? testHighwayGenWide() : roadgen({ ...base, ...(variant === "gentle" ? GENTLE : {}), BENDS: "driver" });
const loaded = loadMap(raw), cars = +carsArg;
let w = seedGraph(+seedArg, 50, loaded, { every: 2.0, target: cars, posted: true, walkers: true, rivals: true, brakeReaction: true });
for (let i = 0; i < 20 * 120; i++) w = step(w);
const c0 = (w.crashes ?? []).length, seen = new Set(), lost = [], contact = []; let alat = [], ratio = [], n = 0, t0 = performance.now(); const tight = [];
for (let i = 0; i < +secsArg * 20; i++) {
  const before = w; w = step(w);
  for (const c of w.crashes ?? []) { const key = `${c.t}|${c.a}|${c.b}`; if (seen.has(key)) continue; seen.add(key); if (c.t < before.t) continue; if (c.b === "road") { const a = w.actors.find((x) => x.id === c.a); const bf = before.actors.find((x) => x.id === c.a); lost.push({ steer: a?.ratings?.steering, caution: a?.caution, v: (bf?.v ?? 0) * 3.6, R: bf ? 1 / Math.max(1e-9, curvatureAt(w.course.at[bf.k ?? 0].layout.paths[bf.route], bf.s)) : NaN }); } else contact.push(c); }
  if (i % 20 === 19) for (const a of w.actors) {
    if (a.player || a.parked || a.crash || a.v < 3) continue; n++;
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route]; if (!p || (a.s >= p.stopAt && a.s <= p.clearAt)) continue;
    const k = curvatureAt(p, a.s); if (k > 1 / 1500 && k < 1 / 100) { alat.push((a.v * a.v * k) / 9.81); ratio.push(a.v * 3.6); }
    /* THE OPEN CARRIAGEWAY ONLY (a ramp's bends are advisory and its speeds are its own), at least 25 m from a join. */
    const leg = L.legs[a.s < p.stopAt ? p.from : p.to];
    if (k > 1 / 650 && k < 1 / 300 && a.ratings?.steering != null && onTheOpenRoad(p, a.s) && (leg?.across ?? leg?.lanes ?? 1) >= 2) tight.push({ steer: a.ratings.steering, v: a.v * 3.6, wanted: a.v0 * 3.6, ask: (a.v * a.v * k) / 9.81 });
  }
}
const q = (xs, f) => { const s = xs.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const wrecks = w.actors.filter((a) => a.crash).length, mins = +secsArg / 60;
console.log(`${variant}: ${cars} cars, seed ${seedArg}, ${secsArg} s (${(performance.now() - t0) / 1000 | 0} s of compute); ${w.actors.length} cars at the end, ${wrecks} standing wrecks`);
console.log(`  crashes in ${mins.toFixed(0)} minutes: ${lost.length} LOST THE ROAD (asked more of a bend than they had), ${contact.length} contact between cars`);
/* THE SPLIT THE LEAD ASKED FOR: a driver bold enough that the model itself says they ask more than the whole capability (the speed factor 1.35 - 0.35 x caution over sqrt(GRIP / CLEAN), a caution under (1.35 - sqrt(GRIP/CLEAN)) / 0.35, about 0.4) is the three factors pushed together: the model working. Anyone else leaving the road is the model failing. */
const BOLD_BELOW = (1.35 - Math.sqrt(GRIP / CLEAN)) / 0.35;
const boldLost = lost.filter((l) => l.caution < BOLD_BELOW), ordinaryLost = lost.filter((l) => !(l.caution < BOLD_BELOW));
console.log(`  LOST THE ROAD, BY WHO: ${boldLost.length} bold (caution under ${BOLD_BELOW.toFixed(2)}: pushing skill, car and conditions together -- the model working), ${ordinaryLost.length} ordinary (a defect to fix)`);
if (tight.length) {
  /* BY STEERING RATING IN ABSOLUTE BINS, not thirds: a rating over about 0.3 has a capability that a 450 m bend at the limit never reaches, so a third of the population averages the ones the bend bites into the ones it never touches. */
  const bin = (lo, hi) => tight.filter((x) => x.steer >= lo && x.steer < hi), mean = (xs, f, d = 0) => (xs.reduce((m, x) => m + f(x), 0) / Math.max(1, xs.length)).toFixed(d);
  console.log(`  ON THE OPEN CARRIAGEWAY'S TIGHT BENDS (radius 300 to 650 m), BY STEERING RATING: ` + [[0, 0.3], [0.3, 0.6], [0.6, 0.85], [0.85, 1.01]].map(([lo, hi]) => { const b = bin(lo, hi); return `${lo.toFixed(2)}-${Math.min(1, hi).toFixed(2)}: ${b.length} car-seconds, ${mean(b, (x) => x.v)} km/h of ${mean(b, (x) => x.wanted)} wanted (${(100 * b.reduce((m, x) => m + x.v, 0) / Math.max(1, b.reduce((m, x) => m + x.wanted, 0))).toFixed(0)}%), ${mean(b, (x) => x.ask, 2)} g asked`; }).join("; "));
}
if (lost.length) console.log(`  who lost the road: steering rating ${lost.map((l) => l.steer?.toFixed(2)).join(", ")}; caution ${lost.map((l) => l.caution?.toFixed(2)).join(", ")}; speed ${lost.map((l) => l.v.toFixed(0)).join(", ")} km/h; on a bend of radius ${lost.map((l) => l.R.toFixed(0)).join(", ")} m`);
console.log(`  sideways acceleration taken on bends (${alat.length} car-seconds): p10/50/90/99/max ${q(alat, .1).toFixed(2)}/${q(alat, .5).toFixed(2)}/${q(alat, .9).toFixed(2)}/${q(alat, .99).toFixed(2)}/${Math.max(...alat).toFixed(2)} g; speed on bends p10/50/90/99 ${q(ratio, .1).toFixed(0)}/${q(ratio, .5).toFixed(0)}/${q(ratio, .9).toFixed(0)}/${q(ratio, .99).toFixed(0)} km/h`);
