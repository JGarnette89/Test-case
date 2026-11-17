/* THE PRE-ROLL HEAD START (Jay's diagnosis, 17 Nov 2026: the 15 s pre-roll runs the traffic down the road while his start stays put, so he begins behind the population).
   Prediction stated before it ran: with the pre-roll the cars within 600 m BEHIND the player are far fewer than in a drive that has been going a minute, and the cars ahead are all
   moving away (positive closing = a car ahead faster than the player = receding). Signed distance along the player's heading, binned; cars per 100 m, pooled over seeds.
   Usage: node tools/measure/preroll-gap.mjs [map] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const id = process.argv[2] ?? "test-highway-gen";
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
const SEEDS = [1, 2, 3, 4];
const bins = [[-600, -300], [-300, -100], [-100, 0], [0, 100], [100, 300], [300, 800], [800, 1500]];
import { windowOf } from "../../src/sim/shaping.js";
import { placeOf } from "../../src/sim/placement.js";
const roadOf = (laneId) => String(laneId).split("#")[0];
/* Signed distance by the window's OWN geometry (shaping.js aheadBy / inWindow): positive ahead along the lanes reachable from the player's, negative behind. */
const signed = (win, lane, c) => {
  const r = roadOf(lane);
  if (r === win.road) return c - win.at.c;
  const da = win.ahead.get(r); if (da != null) return da + c;
  const db = win.behind.get(r); if (db != null) return -(db + ((win.g.len.get(r) ?? 0) - c));
  return null;
};
const snap = (w, me) => {
  const win = windowOf(w, w.actors), out = bins.map(() => 0), sp = bins.map(() => []);
  if (!win) return { out, sp };
  for (const a of w.actors) { if (a.player || a.parked) continue; const at = placeOf(w.course, a.k ?? 0, a.route, a.s); if (!at) continue; const d = signed(win, at.lane, at.c); if (d == null) continue;
    bins.forEach(([lo, hi], i) => { if (d >= lo && d < hi) { out[i]++; sp[i].push(a.v - me.v); } }); }
  return { out, sp };
};
const run = (label, pre, driveSecs) => {
  const tot = bins.map(() => 0), rel = bins.map(() => []);
  for (const seed of SEEDS) {
    let { world: w, me } = worldFor(seed, 50, 2.0, true, null, raw(), raw().sections?.[0]?.start ?? null, false, false, pre ? { preroll: 15 } : {});
    const sc = { me, args: [1], saveWallet: false };
    for (let n = 0; n < driveSecs / DT; n++) { me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me; w = step(withDriver(w, me)); }
    const { out, sp } = snap(w, me); out.forEach((x, i) => { tot[i] += x; rel[i].push(...sp[i]); });
  }
  const med = (a) => a.length ? a.sort((x, y) => x - y)[a.length >> 1] : NaN;
  console.log(`${label.padEnd(34)} ` + bins.map(([lo, hi], i) => `${lo}..${hi}: ${(tot[i] / SEEDS.length / ((hi - lo) / 100)).toFixed(2)}/100m (rel v ${(med(rel[i]) * 3.6).toFixed(0)})`).join("  "));
};
console.log(`${id}: cars per 100 m by signed distance along the player's heading (mean of ${SEEDS.length} seeds); rel v = median speed of those cars minus the player's, km/h`);
const only = process.argv[3];
if (only === "pacer") { run("NO standing pre-roll, driving 15 s", false, 15); run("NO standing pre-roll, driving 30 s", false, 30); run("NO standing pre-roll, driving 45 s", false, 45); }
else {
run("no pre-roll, at the start", false, 0);
run("pre-roll, at the start", true, 0);
run("pre-roll, then 10 s of driving", true, 10);
run("pre-roll, then 60 s of driving", true, 60);
}
