/* JAY'S "FOLLOWS TOO CLOSELY" AGAINST THE TRAFFIC (27 October, SIMULATOR 1.2.20):
   inside 0.75 car lengths (CAR.length 4.5 m -> 3.375 m clear, bumper to bumper)
   of the car ahead, above a speed floor, held for the dwell. Every AI driver
   on the road, each tick, against its own leader (whatStops, a car, in
   following) -- how much car-time is inside, and how many episodes reach 2 s
   and 3 s, by temperament, at floors 0, the derived one and the reaction one.
   node tools/measure/follow-close.mjs [map=test-loop] [cars=180] [secs=180] [shape=1] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, whatStops } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { CAR, DT, STANDSTILL, lenOf } from "../../src/sim/traffic.js";
import { REACTION_FLOOR } from "../../src/core/perception.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id = "test-loop", cars = "180", secs = "180", shp = "1"] = process.argv.slice(2);
const D = 0.75 * CAR.length;
const FLOORS = { none: 0, derived: (D - STANDSTILL) / 0.7, reaction: D / REACTION_FLOOR };
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(1, 50, 2.0, true, Number(cars), raw, raw.sections?.[0]?.start ?? null, false);
w = { ...w, shape: Number(shp) === 1 };
const me0 = me, sc = { me, args: [1], saveWallet: false };
const band = (c) => (c < 0.7 ? "bold" : c > 1.3 ? "timid" : "sound");
const st = {};
for (const f of Object.keys(FLOORS)) st[f] = { bold: { t: 0, in: 0, ep2: 0, ep3: 0 }, sound: { t: 0, in: 0, ep2: 0, ep3: 0 }, timid: { t: 0, in: 0, ep2: 0, ep3: 0 } };
const dwell = new Map();
for (let i = 0; i < Number(secs) / DT; i++) {
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; w = step(withDriver(w, me));
  if (i < 600) continue;   // warm
  const byId = new Map(w.actors.map((a) => [a.id, a]));
  for (const a of w.actors) {
    if (a.player || a.crash || a.parked) continue;
    const v = whatStops(a, w), L = v.leader && byId.get(v.leader.id);
    const inside = L && !L.player !== undefined && v.gap != null && v.gap < D;
    for (const [f, fl] of Object.entries(FLOORS)) {
      const s = st[f][band(a.caution ?? 1)];
      s.t += DT;
      const key = `${f}:${a.id}`;
      if (inside && (a.v ?? 0) >= fl) { s.in += DT; const d = (dwell.get(key) ?? 0) + DT; dwell.set(key, d); if (Math.abs(d - 2) < DT / 2) s.ep2++; if (Math.abs(d - 3) < DT / 2) s.ep3++; }
      else dwell.delete(key);
    }
  }
}
const mins = (Number(secs) - 30) / 60;
console.log(`${id}, ${cars} cars, shape ${shp}: threshold ${D.toFixed(3)} m; floors ${Object.entries(FLOORS).map(([k, v]) => `${k} ${v.toFixed(2)} m/s (${(v * 3.6).toFixed(1)} km/h)`).join(", ")}`);
for (const [f, by] of Object.entries(st)) console.log(`  floor ${f}: ` + Object.entries(by).map(([b, s]) => `${b} ${(100 * s.in / Math.max(s.t, 1e-9)).toFixed(1)}% of car-time inside, ${(s.ep2 / mins).toFixed(1)}/min reach 2 s, ${(s.ep3 / mins).toFixed(1)}/min reach 3 s`).join(" | "));
