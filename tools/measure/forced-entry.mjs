/* THE PLAYER WHO BULLIES HIS WAY IN (Jay, 17 Nov 2026: "I can't see a player ever accepting a full stop at the end of the ramp waiting for a gap. most likely we would just bully our way in no matter what").
   Does the traffic respond to a player who pulls into the through lane with no regard for the gap? The generated highway's on-ramp, a good driver from rest on it, two ways:
     POLITE  the check harness's own rule (goodInput): into the lane only when nobody is within 20 m beside him, by half-way along the acceleration lane whatever the speed.
     BULLY   the same, but he steers into the through lane as soon as he is at 70% of the posted speed (and never later than half-way along), whoever is beside him; no signal either way.
   Reports per seed over `secs` s: crashes the player is in, crashes anywhere, whether he reached the through lane, and the closest approach of any car to him in the 6 s after he starts the change
   (metres, and as seconds of the follower's speed). Usage: node tools/measure/forced-entry.mjs [seeds=8] [secs=90] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, stepDriver } from "../../src/sim/drive.js";
import { limitAt } from "../../src/sim/graph.js";
import { DT } from "../../src/sim/traffic.js";
import { goodInput } from "../lib/good-driver.mjs";
const SEEDS = Number(process.argv[2] ?? 8), secs = Number(process.argv[3] ?? 90), LANE = 3.6;
const raw = () => TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build();
const run = (seed, bully) => {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, process.env.CARS ? Number(process.env.CARS) : null, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 0 });
  w = { ...w, shape: true };
  const sc = { me, args: [1], saveWallet: false }; let startedAt = null, joined = false, peakBrake = 0, prevV = new Map(), close = Infinity, closeT = Infinity, pCrash = 0, seenCr = new Set();
  for (let n = 0; n < secs / DT; n++) {
    const { input, signal } = goodInput(me, w, sc, { overtake: true, pace: 1 });
    const lay = w.course.at[me.k].layout, path = lay.paths[me.route], lg = lay.legs[path.to], onAccel = me.s > path.clearAt + 1 && lg?.accel;
    let inp = input;
    if (bully && onAccel && startedAt == null) {
      const posted = limitAt(w.course, me) ?? 13.9, along = me.s - path.clearAt, open = path.length - lg.accelClose - path.clearAt;
      if (me.v >= 0.7 * posted || along > open / 2) { startedAt = w.t; }
    }
    if (bully && startedAt != null && !joined) inp = { ...input, steer: -(me.off - -1 * LANE * 0.72) * 0.25 - me.psi * 2.5 };
    if (!bully && startedAt == null && onAccel && input.steer < -0.001 && me.off < -0.3) startedAt = w.t;
    me = stepDriver({ ...me, signal }, inp, w, DT); sc.me = me; w = step(withDriver(w, me));
    if (startedAt != null && w.t - startedAt < 6) {
      const p = poseOf(w, me);
      for (const a of w.actors) { if (a.player || a.parked) continue; const q = poseOf(w, a), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < 60 && prevV.has(a.id)) peakBrake = Math.max(peakBrake, (prevV.get(a.id) - (a.v ?? 0)) / DT); if (d < close) { close = d; closeT = d / Math.max(5, a.v ?? 5); } }
    }
    for (const a of w.actors) prevV.set(a.id, a.v ?? 0);
    if (startedAt != null && me.off < -LANE * 0.6) joined = true;
    for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (!seenCr.has(k)) { seenCr.add(k); if (c.a === "player" || c.b === "player") pCrash++; } }
  }
  return { started: startedAt != null, joined, pCrash, crashes: (w.crashes ?? []).length, close, closeT, peakBrake };
};
for (const bully of [false, true]) {
  const rows = Array.from({ length: SEEDS }, (_, i) => run(i + 1, bully));
  const f = (k) => rows.filter((r) => r[k]).length, fin = rows.filter((r) => isFinite(r.close));
  console.log(`${bully ? "BULLY " : "POLITE"}: ${SEEDS} seeds, ${secs} s: began the change ${f("started")}, reached the through lane ${f("joined")}, crashes with the player in ${rows.reduce((s, r) => s + r.pCrash, 0)} (seeds ${rows.filter((r) => r.pCrash).length}), crashes anywhere ${rows.reduce((s, r) => s + r.crashes, 0)}; closest car in the 6 s after: median ${fin.length ? fin.map((r) => r.close).sort((a, b) => a - b)[fin.length >> 1].toFixed(1) : "-"} m (min ${fin.length ? Math.min(...fin.map((r) => r.close)).toFixed(1) : "-"}); hardest braking by anyone within 60 m in those 6 s: median ${rows.map((r) => r.peakBrake).sort((a, b) => a - b)[rows.length >> 1].toFixed(1)} m/s^2, max ${Math.max(...rows.map((r) => r.peakBrake)).toFixed(1)} (comfortable about 2.7, an emergency stop about 8)`);
}
