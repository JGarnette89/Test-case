/* HOW HARD DO DRIVERS TAKE A CORNER, AND DOES ANY AXIS REACH IT (the lead and Jay, 14 November: "why can't we push the speed on the curves? better drivers can handle it and worse should just slow down, or crash if they're reckless").
   The played world (tools/lib/played... : brake reaction, walkers, rivals on) with nobody driving, every second, every car on a ROAD BEND (the approach or exit part of its path, curvature over 1/1500) and every car IN AN INTERSECTION TURN (between the line and the box's far edge on a left or a right):
   the sideways acceleration it takes, v^2 x curvature, in g -- against the road's design figure (LATERAL, 0.15 g, core/motion.js), the clean turn (CLEAN, player.js) and what the tyres hold (GRIP);
   its speed as a share of the road's posted speed, on the bend and on the straight; and, per CAR (its peak), the rank correlation with each driver axis (core/driver.js deficitOf: confidence, steering, braking, observation, knowledge, compliance) and with caution.
   Usage: node tools/measure/corner-spread.mjs <mapId> [cars] [seed=1] [secs=300] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { poseAt } from "../../src/sim/intersection.js";
import { CLEAN, GRIP } from "../../src/sim/player.js";
import { LATERAL } from "../../src/core/motion.js";
import { deficitOf, AXES } from "../../src/core/driver.js";
import { DT } from "../../src/sim/traffic.js";
const [id, carsArg, seedArg = "1", secsArg = "300"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { loaded, world: w } = worldFor(+seedArg, 50, 2.0, false, carsArg ? +carsArg : null, raw, raw.sections?.[0]?.start ?? null, false);
const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const kappa = (path, s, h = 3) => { const a = poseAt(path, Math.max(0, s - h)).rot, b = poseAt(path, Math.min(path.length, s + h)).rot; return Math.abs((norm(b - a) * Math.PI) / 180 / (Math.min(path.length, s + h) - Math.max(0, s - h))); };
const G = 9.81, bend = [], turn = [], per = new Map(), straight = [], ratioBend = [], ratioStraight = [];
for (let n = 0; n < +secsArg / DT; n++) {
  w = step(w);
  if (n % 20 !== 19) continue;
  for (const a of w.actors) {
    if (a.player || a.parked || a.crash || a.v < 3) continue;
    const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route]; if (!p) continue;
    const leg = L.legs[p.from], posted = leg?.speed ?? w.road.speed;
    const inBox = a.s >= p.stopAt && a.s <= p.clearAt;
    const k = kappa(p, a.s), alat = (a.v * a.v * k) / G;
    if (inBox && p.intent && p.intent !== "straight") { turn.push({ alat, v: a.v, caution: a.caution }); continue; }
    if (inBox) continue;
    if (k > 1 / 1500) {
      bend.push(alat); ratioBend.push(a.v / posted);
      const r = per.get(a.id) ?? { peak: 0, a }; r.peak = Math.max(r.peak, alat); r.a = a; per.set(a.id, r);
    } else if (k < 1 / 8000 && posted > 20) { ratioStraight.push(a.v / posted); }
  }
}
const q = (xs, f) => { const s = xs.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(f * s.length))]; };
const share = (xs, g) => (100 * xs.filter((x) => x > g).length / Math.max(1, xs.length)).toFixed(0) + "%";
const dist = (name, xs) => xs.length ? console.log(`  ${name} (${xs.length} car-seconds): p10/50/90/99/max ${q(xs, .1).toFixed(2)}/${q(xs, .5).toFixed(2)}/${q(xs, .9).toFixed(2)}/${q(xs, .99).toFixed(2)}/${Math.max(...xs).toFixed(2)} g; over the design ${(LATERAL / G).toFixed(2)} g ${share(xs, LATERAL / G)}, over 0.3 g ${share(xs, 0.3)}, over the grip ${(GRIP / G).toFixed(2)} g ${share(xs, GRIP / G)}`) : console.log(`  ${name}: none`);
console.log(`${id}, ${carsArg ?? "the map's own count"} cars, seed ${seedArg}: sideways acceleration taken (design ${(LATERAL / G).toFixed(2)} g, the clean turn ${(CLEAN / G).toFixed(2)} g, grip ${(GRIP / G).toFixed(2)} g)`);
dist("ROAD BENDS", bend);
dist("INTERSECTION TURNS", turn.map((t) => t.alat));
const r = (xs) => (xs.length ? `p10/50/90 ${q(xs, .1).toFixed(2)}/${q(xs, .5).toFixed(2)}/${q(xs, .9).toFixed(2)} (sd ${Math.sqrt(xs.reduce((s, x) => s + (x - xs.reduce((a, b) => a + b, 0) / xs.length) ** 2, 0) / xs.length).toFixed(2)})` : "none");
console.log(`  speed as a share of the posted limit: on bends ${r(ratioBend)}; on straights ${r(ratioStraight)}`);
const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const o = new Array(xs.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k2 = i; k2 <= j; k2++) o[idx[k2][1]] = (i + j) / 2; i = j + 1; } return o; };
const rho = (a, b) => { const x = rank(a), y = rank(b), n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy || 1); };
const cars = [...per.values()];
console.log(`  PER CAR (${cars.length} cars with a bend, the peak sideways acceleration): rank correlation with each driver axis' DEFICIT (more deficit = worse) and with caution (higher = more timid):`);
console.log("    " + [...AXES, "caution"].map((ax) => `${ax} ${rho(cars.map((c) => c.peak), cars.map((c) => ax === "caution" ? (c.a.caution ?? 1) : deficitOf(c.a.ratings, ax).deficit)).toFixed(2)}`).join(", "));
