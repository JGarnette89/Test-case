/* A FORCED ENTRY AT A BUILT TIME GAP (backlog item 4, 17 Nov 2026; the lead: "one run in forty-eight producing the condition is not a measurement"). The earlier harnesses waited for traffic to offer a follower at a tight gap and
   almost never got one (forced-entry-gap.mjs: 1 of 48). Here the follower is PLACED: on the generated road's acceleration lane the player reaches 70% of the posted speed and steers across at once, no signal, whoever is there; AT THAT
   TICK a car is put in the through lane he is entering, on a path that exits to that lane, so that the distance remaining to the end of its exit is the player's plus `gap` seconds of its own speed (the same coordinate the good
   driver's lane logic uses), at the traffic's pace (0.95 of the posted speed, a flagged value). It is built by `carFor`, the arrival's own construction, so its driver, brake reaction and lag are ordinary. Per gap and seed: did the placement
   land (nobody within 12 m of it), crashes with the player and anywhere in the 10 s after, the follower's hardest braking, whether it braked at all (above 0.5 m/s^2), the smallest time gap between it and the player after he is in, and the
   same with a 3 s gap as a control that no conflict arises when none is built. Arm proof, not assumed: the placed follower's remaining-distance offset to the player is ASSERTED within 1 m of the target and its lane's leg is the one the
   player is entering, or the run throws. `CARS` is the density (default 160). Usage: [CARS=160] node tools/measure/forced-entry-built.mjs [seeds=12] [secs=60] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step, carFor, poseOf } from "../../src/sim/crossing.js";
import { withDriver, stepDriver, driverPose } from "../../src/sim/drive.js";
import { limitAt } from "../../src/sim/graph.js";
import { DT } from "../../src/sim/traffic.js";
import { goodInput } from "../lib/good-driver.mjs";
const SEEDS = Number(process.argv[2] ?? 12), secs = Number(process.argv[3] ?? 60), LANE = 3.6, CARS = Number(process.env.CARS ?? 160);
const raw = () => TEST_MAPS.find((m) => m.id === "test-highway-gen-wide").build();
const run = (seed, gap) => {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, CARS, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 0 });
  w = { ...w, shape: true };
  const sc = { me, args: [1], saveWallet: false }; let goAt = null, placed = false, followerId = null, chain = [], chainPrev = new Map(), chainPeak = Array(7).fill(0), pCrash = 0, anyCrash = 0, peak = 0, minGap = Infinity, noSite = false; const seen = new Set(); let prevV = null;
  for (let n = 0; n < secs / DT; n++) {
    const { input, signal } = goodInput(me, w, sc, { overtake: true, pace: 1 });
    const lay = w.course.at[me.k].layout, path = lay.paths[me.route], lg = lay.legs[path.to], onAccel = me.s > path.clearAt + 1 && lg?.accel;
    let inp = input;
    if (onAccel && goAt == null) {
      const posted = limitAt(w.course, me) ?? 13.9;
      if (me.v >= 0.7 * posted) {
        goAt = w.t;
        const toLeg = lay.legAt?.(lg.base, (lg.pos ?? lg.lane ?? 0) - 1) ?? null;
        const P2 = toLeg ? Object.entries(lay.paths).find(([, p]) => p.to === toLeg && p.clearAt != null) : null;
        if (!P2) noSite = true;
        else {
          const [r2, p2] = P2, vf = 0.95 * posted, mineRemaining = path.length - me.s, want = mineRemaining + gap * vf, s2 = p2.length - want;
          if (s2 > p2.clearAt + 1 && s2 < p2.length) {
            const base = { ...carFor(w, 90000 + seed, me.k, r2, null, "car") }, car = { ...base, id: `follower-${seed}`, n: 90000 + seed, k: me.k, route: r2, s: s2, v: vf, v0: vf };
            const crowded = w.actors.some((a) => !a.player && (a.k ?? 0) === me.k && a.route === r2 && Math.abs((a.s ?? 0) - s2) < 12);
            if (!crowded) {
              const offset = (p2.length - s2) - mineRemaining; if (Math.abs(offset - gap * vf) > 1) throw new Error(`the follower was not placed at the built gap: ${offset} against ${gap * vf}`);
              /* THE CHAIN BEHIND THE FOLLOWER (17 Nov, backlog: does the car behind it also brake hard, and how far back does it go?): the cars heading for the same lane, ranked by how far behind the follower they are on the exit's own coordinate, the six nearest within 300 m. Rank 0 is the follower. */
              const behindIt = w.actors.filter((a) => !a.player && !a.parked && (a.k ?? 0) === me.k && lay.paths[a.route]?.to === toLeg).map((a) => ({ id: a.id, rem: lay.paths[a.route].length - a.s })).filter((x) => x.rem > (p2.length - s2) && x.rem <= (p2.length - s2) + 300).sort((x, y) => x.rem - y.rem).slice(0, 6).map((x) => x.id);
              chain = [car.id, ...behindIt];
              w = { ...w, actors: [...w.actors, car] }; placed = true; followerId = car.id;
            }
          }
        }
      }
    }
    if (goAt != null) inp = { ...input, steer: -(me.off - -1 * LANE * 0.72) * 0.25 - me.psi * 2.5 };
    me = stepDriver({ ...me, signal }, inp, w, DT); sc.me = me; w = step(withDriver(w, me));
    if (placed && w.t - goAt < 10) {
      const f = w.actors.find((a) => a.id === followerId);
      if (f) {
        if (prevV != null) peak = Math.max(peak, (prevV - (f.v ?? 0)) / DT); prevV = f.v ?? 0;
        const p = driverPose(me, w.course), q = poseOf(w, f), h = (p.heading * Math.PI) / 180, behind = (p.x - q.x) * Math.cos(h) + (p.y - q.y) * Math.sin(h), lat = Math.abs(-(p.x - q.x) * Math.sin(h) + (p.y - q.y) * Math.cos(h));
        if (behind > 0 && lat < 3.6 && w.t - goAt > 1.0) minGap = Math.min(minGap, behind / Math.max(5, f.v ?? 5));
      }
      for (let r = 0; r < chain.length; r++) { const c = w.actors.find((a) => a.id === chain[r]); if (!c) continue; const pv = chainPrev.get(c.id); if (pv != null) chainPeak[r] = Math.max(chainPeak[r], (pv - (c.v ?? 0)) / DT); chainPrev.set(c.id, c.v ?? 0); }
      for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (!seen.has(k)) { seen.add(k); anyCrash++; if (c.a === "player" || c.b === "player") pCrash++; } }
    }
  }
  return { placed, noSite, pCrash, anyCrash, peak, minGap, chainPeak, chainLen: chain.length };
};
console.log(`a forced entry at a BUILT time gap, ${CARS} cars, ${SEEDS} seeds, ${secs} s: a follower is placed in the through lane at the moment he steers across, no signal`);
const byGap = {};
for (const gap of [3.0, 1.5, 1.0, 0.6, 0.3]) {
  const rows = Array.from({ length: SEEDS }, (_, i) => run(i + 1, gap)), ok = rows.filter((r) => r.placed); byGap[gap] = ok;
  const _unused = 0, med = (a) => a.length ? a.sort((x, y) => x - y)[a.length >> 1] : NaN;
  console.log(`gap ${gap.toFixed(1)} s${gap === 3 ? " (control)" : ""}: placed in ${ok.length} of ${SEEDS} (${rows.filter((r) => r.noSite).length} had no lane to place in) · crashes with the player ${ok.reduce((s, r) => s + r.pCrash, 0)} (in ${ok.filter((r) => r.pCrash).length} runs), anywhere ${ok.reduce((s, r) => s + r.anyCrash, 0)} · the follower braked above 0.5 m/s^2 in ${ok.filter((r) => r.peak > 0.5).length}, hardest median ${med(ok.map((r) => r.peak)).toFixed(1)}, max ${Math.max(0, ...ok.map((r) => r.peak)).toFixed(1)} m/s^2 · closest time gap after he is in median ${med(ok.map((r) => r.minGap).filter(isFinite)).toFixed(2)} s`);
}
/* THE CASCADE: the hardest braking (m/s^2) by rank behind the placed follower (rank 0 is the follower), median and max over the placed runs, and how many of those runs had that car brake above 4 (the comfortable rate is 2.7, an emergency stop 8). A rank with no car in some runs is counted over the runs that had one. */
console.log(`THE CASCADE: hardest braking by rank behind the follower (rank 0 = the follower), median / max m/s^2, and runs where that car braked above 4 m/s^2`);
for (const gap of [3.0, 1.5, 1.0, 0.6, 0.3]) {
  const ok = byGap[gap], cells = [];
  for (let r = 0; r < 7; r++) { const have = ok.filter((x) => x.chainLen > r); if (!have.length) { cells.push(`r${r}: -`); continue; } const ps = have.map((x) => x.chainPeak[r]).sort((a, b) => a - b); cells.push(`r${r}: ${ps[ps.length >> 1].toFixed(1)}/${ps[ps.length - 1].toFixed(1)} (${have.filter((x) => x.chainPeak[r] > 4).length} of ${have.length})`); }
  console.log(`gap ${gap.toFixed(1)} s: ${cells.join("  ")}`);
}
