/* WHEN DOES AN ORDINARY DRIVER HAVE A STAND-IN, AND WHAT DOES THE ONCOMING TRAFFIC DO ABOUT IT (DECISIONS 10.68)?
   A good driver (tools/lib/good-driver.mjs) on random trips with the real position on. Every time a stand-in
   appears or goes: where the car is. And the oncoming cars within 80 m, while the player has a stand-in and
   the rest of the time: their hardest braking, how often past 3 m/s2, how often standing.
   Usage: node tools/measure/standin-drive.mjs [map=test-1] [minutes=5] [seed=1] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, driverPose } from "../../src/sim/drive.js";
import { placesOf, routeTo } from "../../src/sim/route.js";
import { noticeTick } from "../../src/sim/session.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test-1", minArg = "5", seedArg = "1"] = process.argv.slice(2);
const def = TEST_MAPS.find((m) => m.id === mapId), raw = mapId === "test-1" ? null : def.build();
let { loaded, world: w, me } = worldFor(Number(seedArg), 50, 2.0, true, null, raw, raw?.sections?.[0]?.start ?? null, false);
w = { ...w, realPos: true };
const me0 = me, places = placesOf(w.course, loaded), sc = { me, args: [1], saveWallet: false };
let trip = 0, was = false;
const ON = { n: 0, min: 0, hard: 0, stood: 0 }, OFF = { n: 0, min: 0, hard: 0, stood: 0 };
const pick = () => { for (let i = 0; i < 80; i++) { const p = places[(++trip * 7919 + i * 104729) % places.length]; const r = routeTo(w.course, me, p); if (r && r.length > 300) return p; } return null; };
for (let i = 0; i < (Number(minArg) * 60) / DT; i++) {
  if (!sc.dest) { sc.dest = pick(); sc.routeKey = null; }
  if (me.atEdge || !sc.dest) { me = { ...me0 }; w = withDriver(w, me); sc.me = me; sc.dest = pick(); sc.routeKey = null; }
  const prev = { me, world: w };
  me = goodStep(me, w, sc, { pace: 0.95 });
  w = step(withDriver(w, me));
  noticeTick(sc, prev, { me, world: w });
  sc.me = me;
  const on = !!me.shadows, m = driverPose(me, w.course);
  for (const a of w.actors) {
    if (a.player) continue;
    const p = poseOf(w, a);
    if (Math.hypot(p.x - m.x, p.y - m.y) > 80) continue;
    if (Math.cos(((p.rot - m.heading) * Math.PI) / 180) > -0.7) continue;   // oncoming only
    const b = on ? ON : OFF;
    b.n++; b.min = Math.min(b.min, a.a ?? 0);
    if ((a.a ?? 0) < -3) b.hard++;
    if ((a.v ?? 0) < 0.3) b.stood++;
  }
  if (on !== was) {
    const p = w.course.at[me.k].layout.paths[me.route];
    console.log(`t=${(i * DT).toFixed(1)} ${on ? "ON " : "off"} ${me.route} s=${me.s.toFixed(1)} (stop ${p.stopAt.toFixed(0)}, clear ${p.clearAt.toFixed(0)}, length ${p.length.toFixed(0)}) off=${me.off.toFixed(2)} m, ${(me.psi * 57.3).toFixed(0)} deg, ${(me.v * 3.6).toFixed(0)} km/h ${on ? me.shadows.map((x) => `${x.lane} at ${x.s.toFixed(0)}`).join(", ") : ""}`);
    was = on;
  }
}
for (const [name, b] of [["while the player has a stand-in", ON], ["the rest of the drive", OFF]]) {
  console.log(`oncoming cars within 80 m, ${name}: ${b.n} car-ticks, hardest braking ${(-b.min).toFixed(1)} m/s2, ${b.hard} past 3 m/s2 (${((100 * b.hard) / Math.max(1, b.n)).toFixed(1)}%), ${b.stood} standing (${((100 * b.stood) / Math.max(1, b.n)).toFixed(1)}%)`);
}
