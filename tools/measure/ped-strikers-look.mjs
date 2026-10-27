/* PEDESTRIAN STRIKES WITH PERCEPTION ON (27 October): drivers who look away
   -- the scheduled glance, and with checks on their checks too -- in
   verify-walkers' world (test-peds, 120 cars, walkers) for 15 minutes. Per
   careful pedestrian struck: the driver, their observation soundness,
   whether their eyes were off the road in the four seconds before and how
   it began (a glance or which check), and -- the demand-gating question --
   what the pedestrian was doing and how far from the car WHEN THAT LOOK
   BEGAN: a look begun with somebody already at or on the crossing ahead is
   a look no real driver takes then.
   Usage: node tools/measure/ped-strikers-look.mjs seed checks(0|1) [map=test-peds] [cars=120] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, poseOf } from "../../src/sim/crossing.js";
import { pedPose } from "../../src/sim/peds.js";
import { DT } from "../../src/sim/traffic.js";
import { soundnessOf } from "../../src/core/driver.js";
import { lookingAway } from "../../src/sim/attention.js";
const [seedS, chkS, mapId = "test-peds", carsS = "120"] = process.argv.slice(2);
const seed = Number(seedS), chk = Number(chkS);
const loaded = loadMap(TEST_MAPS.find((t) => t.id === mapId).build());
let w = seedGraph(seed, 50, loaded, { every: 2.0, target: Number(carsS), posted: true, walkers: true, perceive: true, checks: chk === 1 });
const hist = [], done = new Set(), out = [];
let careful = 0, heedless = 0;
const off = (h, a) => (a.look?.kind ?? (lookingAway(h.t, a) > 0 ? "glance" : null));
for (let k = 0; k < 15 * 60 / DT; k++) {
  w = step(w); hist.push(w); if (hist.length > 100) hist.shift();
  for (const q of w.peds ?? []) {
    if (q.state !== "struck" || done.has(q.id)) continue;
    done.add(q.id);
    if (q.manner === "heedless") { heedless++; continue; }
    careful++;
    const c = (w.crashes ?? []).find((x) => x.a === q.id || x.b === q.id), cid = c && (c.a === q.id ? c.b : c.a);
    const a = w.actors.find((x) => x.id === cid);
    /* The last time the eyes left the road within four seconds before. */
    let onset = null, kind = null;
    for (let i = hist.length - 1; i >= Math.max(1, hist.length - 80); i--) {
      const now = hist[i].actors.find((x) => x.id === cid), was = hist[i - 1].actors.find((x) => x.id === cid);
      if (!now || !was) break;
      const kn = off(hist[i], now), kw = off(hist[i - 1], was);
      if (kn && !kw) { onset = hist[i]; kind = kn; break; }
    }
    let at = "eyes on the road for the four seconds before";
    if (onset) {
      const p = (onset.peds ?? []).find((x) => x.id === q.id), car = onset.actors.find((x) => x.id === cid);
      const d = p && car ? Math.hypot(pedPose(onset, p).x - poseOf(onset, car).x, pedPose(onset, p).y - poseOf(onset, car).y) : null;
      at = `a ${kind} began ${(w.t - onset.t).toFixed(1)} s before, the pedestrian then ${p ? p.state : "not yet out"}${d != null ? ` ${d.toFixed(0)} m away` : ""}, the car at ${car?.v.toFixed(1)} m/s`;
    }
    out.push(`  t ${w.t.toFixed(0)} ${cid}: observation ${a ? soundnessOf(a.ratings ?? {}, "observation").toFixed(2) : "?"}; ${at}`);
  }
}
console.log(`${mapId} seed ${seed} checks ${chk} perception on: ${careful} careful struck, ${heedless} heedless${out.length ? "\n" + out.join("\n") : ""}`);
