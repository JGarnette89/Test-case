/* A FORCED ENTRY AT A STATED TIME GAP (backlog item 4, 17 Nov 2026). The first harness (forced-entry.mjs) merged at 70% of the posted speed whoever was beside him, and no follower was ever close enough to have to react
   (the median hardest braking within 60 m was 0): it never made a real conflict. This one makes it: on the generated road's acceleration lane the player waits for a car in the adjacent through lane to be BEHIND him at a
   time gap of `gap` seconds (distance behind over that car's speed, within a 0.15 s band), and steers across at that moment, no signal, no regard for anything else; if no such moment comes by half-way along the lane he goes anyway
   and the run is marked `noMoment` (not counted). Per gap, over `seeds`: entries made, crashes with the player, crashes anywhere in the 8 s after, and the hardest braking by the nearest follower (m/s^2; comfortable about 2.7,
   an emergency stop about 8), and whether that follower's time gap fell under 0.5 s after he was in. A follower is the nearest car behind in his lane within 80 m. `CARS` picks the density (default 160, the dial's top).
   Usage: [CARS=160] node tools/measure/forced-entry-gap.mjs [seeds=12] [secs=100] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, stepDriver, driverPose } from "../../src/sim/drive.js";
import { limitAt } from "../../src/sim/graph.js";
import { DT } from "../../src/sim/traffic.js";
import { goodInput } from "../lib/good-driver.mjs";
const SEEDS = Number(process.argv[2] ?? 12), secs = Number(process.argv[3] ?? 100), LANE = 3.6, CARS = Number(process.env.CARS ?? 160);
const raw = () => TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build();
const run = (seed, gap) => {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, CARS, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 0 });
  w = { ...w, shape: true };
  const sc = { me, args: [1], saveWallet: false }; let goAt = null, noMoment = false, pCrash = 0, anyCrash = 0, peak = 0, minGapAfter = Infinity, followerId = null; const seen = new Set(), prevV = new Map();
  for (let n = 0; n < secs / DT; n++) {
    const { input, signal } = goodInput(me, w, sc, { overtake: true, pace: 1 });
    const lay = w.course.at[me.k].layout, path = lay.paths[me.route], lg = lay.legs[path.to], onAccel = me.s > path.clearAt + 1 && lg?.accel;
    let inp = input;
    if (onAccel && goAt == null) {
      const posted = limitAt(w.course, me) ?? 13.9, along = me.s - path.clearAt, open = path.length - lg.accelClose - path.clearAt;
      const p = driverPose(me, w.course), h = (p.heading * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h);
      let hit = false;
      if (me.v >= 0.5 * posted) for (const a of w.actors) { if (a.player || a.parked || a.crash) continue; const q = poseOf(w, a), dx = p.x - q.x, dy = p.y - q.y, behind = dx * fx + dy * fy, lat = Math.abs(-dx * fy + dy * fx); if (behind > 3 && behind < 80 && lat > 1.5 && lat < 6.5) { const tg = behind / Math.max(5, a.v ?? 5); if (Math.abs(tg - gap) < 0.15) { hit = true; followerId = a.id; } } }
      if (hit) goAt = w.t; else if (along > open / 2) { goAt = w.t; noMoment = true; }
    }
    if (goAt != null) inp = { ...input, steer: -(me.off - -1 * LANE * 0.72) * 0.25 - me.psi * 2.5 };
    me = stepDriver({ ...me, signal }, inp, w, DT); sc.me = me; w = step(withDriver(w, me));
    if (goAt != null && w.t - goAt < 8) {
      const p = driverPose(me, w.col ?? w.course), h = (p.heading * Math.PI) / 180, fx = Math.cos(h), fy = Math.sin(h);
      for (const a of w.actors) { if (a.player || a.parked) continue; const pv = prevV.get(a.id); const q = poseOf(w, a), dx = p.x - q.x, dy = p.y - q.y, behind = dx * fx + dy * fy, lat = Math.abs(-dx * fy + dy * fx);
        if (behind > 0 && behind < 60 && lat < 3.6 && pv != null) peak = Math.max(peak, (pv - (a.v ?? 0)) / DT);
        if (behind > 1 && behind < 60 && lat < 3.6 && w.t - goAt > 1.5) minGapAfter = Math.min(minGapAfter, behind / Math.max(5, a.v ?? 5)); }
      for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (!seen.has(k)) { seen.add(k); anyCrash++; if (c.a === "player" || c.b === "player") pCrash++; } }
    }
    for (const a of w.actors) prevV.set(a.id, a.v ?? 0);
  }
  return { entered: goAt != null, noMoment, pCrash, anyCrash, peak, minGapAfter };
};
console.log(`forced entry at a stated time gap, ${CARS} cars, ${SEEDS} seeds, ${secs} s: the player steers across at that gap behind him, no signal`);
for (const gap of [1.5, 1.0, 0.6, 0.3]) {
  const rows = Array.from({ length: SEEDS }, (_, i) => run(i + 1, gap)), real = rows.filter((r) => r.entered && !r.noMoment);
  const med = (a) => a.length ? a.sort((x, y) => x - y)[a.length >> 1] : NaN;
  console.log(`gap ${gap.toFixed(1)} s: ${real.length} of ${SEEDS} had the moment (${rows.filter((r) => r.noMoment).length} did not) · crashes with the player ${real.reduce((s, r) => s + r.pCrash, 0)} (in ${real.filter((r) => r.pCrash).length} runs), anywhere ${real.reduce((s, r) => s + r.anyCrash, 0)} · hardest braking by a follower median ${med(real.map((r) => r.peak)).toFixed(1)}, max ${Math.max(0, ...real.map((r) => r.peak)).toFixed(1)} m/s^2 · closest time gap after he is in: median ${med(real.map((r) => r.minGapAfter).filter(isFinite)).toFixed(2)} s`);
}
