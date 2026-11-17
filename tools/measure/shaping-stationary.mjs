/* WHAT SHAPING DOES WHEN THE PLAYER STANDS STILL (Jay, 17 Nov 2026: "what happens when our player pulls into a stop, and then out?"). The player drives in after the screen's pre-roll,
   brakes to rest, and is held for 60 s. Per 10 s: cars in the window, cars within 400 m (the visible zone), cars placed by shaping and cars gone from the world in that span,
   and the median speed of the cars within 400 m. Usage: node tools/measure/shaping-stationary.mjs [map] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, stepDriver } from "../../src/sim/drive.js";
import { windowOf } from "../../src/sim/shaping.js";
import { DT } from "../../src/sim/traffic.js";
const id = process.argv[2] ?? "test-highway-gen-wide", SIDE = process.argv[3] === "side";
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
const SEEDS = [1, 2, 3], rows = [];
for (const seed of SEEDS) {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, null, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 15 });
  if (SIDE) w = { ...w, spawnSide: true };
  for (let n = 0; n < 40 / DT && me.v > 0.05; n++) { me = stepDriver(me, { steer: -(me.off ?? 0) * 0.25 - (me.psi ?? 0) * 2.5, slider: -0.8, assist: 0 }, w, DT); w = step(withDriver(w, me)); }
  const rest = me.v <= 0.05;
  let prev = new Set(w.actors.map((a) => a.id)), placedIds = new Set(w.actors.filter((a) => a.placed != null).map((a) => a.id)), row = [];
  let ins = 0, gone = 0;
  for (let n = 0; n < 60 / DT; n++) {
    me = stepDriver(me, { steer: 0, slider: -0.8, assist: 0 }, w, DT); w = step(withDriver(w, me));
    const now = new Set(w.actors.map((a) => a.id));
    for (const a of w.actors) if (!prev.has(a.id) && a.placed != null) ins++;
    for (const i of prev) if (!now.has(i)) gone++;
    prev = now;
    if ((n + 1) % Math.round(10 / DT) === 0) {
      const p = poseOf(w, me), near = w.actors.filter((a) => !a.player && !a.parked && Math.hypot(poseOf(w, a).x - p.x, poseOf(w, a).y - p.y) < 400);
      const win = windowOf(w, w.actors), vs = near.map((a) => a.v).sort((x, y) => x - y);
      row.push({ cars: w.actors.length, near: near.length, vmed: vs.length ? vs[vs.length >> 1] * 3.6 : 0, ins, gone, v: me.v, rest }); ins = 0; gone = 0;
    }
  }
  rows.push(row);
}
console.log(`${id}: player braked to rest after the pre-roll, held 60 s; means over ${SEEDS.length} seeds (at rest in ${rows.filter((r) => r[0].rest).length} of ${SEEDS.length})`);
console.log("  t(s)  cars on map  within 400 m  their median km/h  placed in the 10 s  gone in the 10 s");
for (let i = 0; i < 6; i++) { const m = (k) => (rows.reduce((s, r) => s + r[i][k], 0) / rows.length); console.log(`  ${String((i + 1) * 10).padStart(3)}   ${m("cars").toFixed(0).padStart(8)}   ${m("near").toFixed(1).padStart(10)}   ${m("vmed").toFixed(0).padStart(12)}   ${m("ins").toFixed(1).padStart(14)}   ${m("gone").toFixed(1).padStart(14)}`); }
