/* =====================================================================
   COURTESY GAPS (sim/courtesy.js): a timely signal is rewarded by the
   traffic, by the drivers whose temperament it is, and the player can see
   it happen.

   1. Who offers is the axes and nothing else: compliant and not bold --
      the timid included, the bold and the scofflaw never -- at the model's
      own COMPETENT_AT.
   2. It buys the player a gap: a player at 90 km/h on the highway signals
      left; with courtesy the lane beside offers a gap a competent driver
      would take sooner than without, same seeds, same moments.
   3. Courtesy is comfortable and narrow: an offerer never brakes past
      their own rate, one driver at a time is asked, nobody overlaps, and
      a gap not taken in COURTESY_FOR is withdrawn and not offered again.
   4. It has to be SEEN: no offer comes sooner after the signal than the
      offerer's own time to notice it.
   5. With no player signalling, nothing moves: the world is tick for tick
      the world with courtesy switched off.
   6. The mark is drawn, at the horn's size: a badge never under 11 px and
      the gap on the road, for an offering car and for no other.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testLoop } from "../src/map/samples.js";
import { seedGraph, step, whatStops, overlapping, noticeAfter } from "../src/sim/crossing.js";
import { playerOn, withDriver } from "../src/sim/drive.js";
import { DT, decide, wantedGap, clearBetween } from "../src/sim/traffic.js";
import { courteous, COURTESY_FOR } from "../src/sim/courtesy.js";
import { paintCourtesy } from "../src/iso/draw.js";
import { trial } from "./measure/courtesy-trial.mjs";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

console.log("\n1. WHO OFFERS IS THE AXES");
{
  const d = (confidence, compliance) => ({ ratings: { observation: 1, confidence, steering: 1, braking: 1, knowledge: 1, compliance } });
  check(courteous(d(0.5, 0.95)), "a sound, compliant driver lets you in");
  check(courteous(d(0.2, 0.95)), "so does a timid, compliant one -- over-yielding is the timid tail");
  check(!courteous(d(0.9, 0.95)), "a bold driver never does, however compliant");
  check(!courteous(d(0.5, 0.5)), "nor a driver the rules do not much bind");
  check(!courteous(d(0.2, 0.5)), "nor a timid scofflaw");
}

const loop = loadMap(testLoop());

console.log("\n2-4. A PLAYER SIGNALLING LEFT AT 90 ON THE HIGHWAY");
{
  const on = [], off = [], cars = [];
  let offers = 0, early = 0, overBrake = 0, hardest = 0, many = 0, over = 0, reoffer = 0, held = 0;
  const T = 48, bases = [], offered = [];
  for (let i = 0; i < T; i++) {
    /* Each seed warmed once and carried on 37 s between its trials. */
    let base = bases[i % 6] ?? seedGraph(1 + (i % 6), 50, loop, { target: 200, posted: true });
    while (base.t < 90 + 37 * Math.floor(i / 6)) base = step(base);
    bases[i % 6] = base;
    const ever = new Map();
    const r = trial(base, i, true, (was, w, pl, sigAt) => {
      const active = w.actors.filter((c) => c.courtesy && !c.courtesy.done);
      if (active.length > 1) many++;
      for (const c of w.actors) {
        if (!c.courtesy) continue;
        const prior = was.actors.find((x) => x.id === c.id)?.courtesy;
        if (!prior) {
          if (ever.has(c.id)) reoffer++;
          ever.set(c.id, c.courtesy.since);
          offers++;
          if (c.courtesy.since - sigAt < noticeAfter(c, sigAt) - 1e-6) early++;
        }
        if (!c.courtesy.done) { hardest = Math.max(hardest, -(c.a ?? 0)); if (-(c.a ?? 0) > (c.brake ?? 2.7) + 1e-6) overBrake++; }
        if (!c.courtesy.done && (c.courtesy.open != null ? w.t - c.courtesy.open > COURTESY_FOR + DT : w.t - c.courtesy.since > 2 * COURTESY_FOR + DT)) held++;
      }
      if (Math.round(w.t / DT) % 20 === 0) over += overlapping(w).length;
    });
    if (r == null) continue;
    on.push(r.t); off.push(trial(base, i, false).t); cars.push(r.car); offered.push(ever.size > 0);
  }
  /* Level with somebody, a gap comes when THEY give one: the trials where the car beside offered, with and without courtesy. */
  const idx = offered.map((o, j) => (o ? j : -1)).filter((j) => j >= 0);
  const soonOn = idx.filter((j) => on[j] <= 6).length, soonOff = idx.filter((j) => off[j] <= 6).length;
  check(idx.length >= 3, `the car level with the player offered in ${idx.length} of ${on.length} trials -- the rest were not courteous, which is the axes`);
  check(soonOn >= 0.75 * idx.length && soonOff <= soonOn / 2, `where it offered, a gap a competent driver takes within 6 s of signalling in ${soonOn} of ${idx.length} (${idx.map((j) => on[j].toFixed(1)).join(", ")} s); the same moments without courtesy, ${soonOff}`);
  check(overBrake === 0, `no offerer braked past their own comfortable rate (hardest ${hardest.toFixed(2)} m/s^2)`);
  check(many === 0 && over === 0, `one driver asked at a time (${many} ticks with two), nobody overlapping (${over})`);
  check(held === 0 && reoffer === 0, `an offer not taken is withdrawn at ${COURTESY_FOR} s (${held} held past it) and not made again (${reoffer})`);
  check(early === 0, `no offer before the offerer could notice the signal (${early} early)`);
}

console.log("\n5. WITH NO PLAYER SIGNALLING, NOTHING MOVES");
{
  let a = seedGraph(2, 50, loop, { target: 120, posted: true }), b = { ...a, courtesy: false };
  let same = true;
  for (let i = 0; i < 60 / DT && same; i++) {
    a = step(a); b = step(b);
    same = a.actors.length === b.actors.length && a.actors.every((x, j) => x.id === b.actors[j].id && x.s === b.actors[j].s && x.v === b.actors[j].v);
  }
  check(same, "a minute of the highway with courtesy on and off: identical, tick for tick");
}

console.log("\n6. THE MARK");
{
  const calls = [];
  const ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : typeof k === "string" && /^[a-z]/.test(k) && !["fillStyle", "strokeStyle", "lineWidth", "lineCap", "lineJoin"].includes(k) ? (...args) => calls.push([k, args, o.fillStyle]) : undefined), set: (o, k, v) => { o[k] = v; return true; } });
  const view = { into: (x, y, z, out) => { out[0] = 400 + x * 2; out[1] = 300 + y * 2 - z * 2; return out; } };
  const car = { id: 1, x: 0, y: 0, z: 0, heading: 0, length: 4.5, height: 1.5 };
  paintCourtesy(ctx, { w: 800, h: 600 }, view, { t: 0.3, actors: [car] }, 2);
  check(calls.length === 0, "a car not offering carries no mark");
  paintCourtesy(ctx, { w: 800, h: 600 }, view, { t: 0.3, actors: [{ ...car, courtesy: true }] }, 2);
  const disc = calls.find((c) => c[0] === "arc" && c[2] === "#22be54");
  const radius = calls.filter((c) => c[0] === "arc").map((c) => c[1][2]);
  check(!!disc || calls.some((c) => c[0] === "fill" && c[2] === "#22be54"), "an offering car carries the green badge");
  check(Math.min(...radius.slice(1, 2)) >= 11, `at a far zoom (2 px per metre) the badge is ${radius[1]?.toFixed(1)} px across its radius -- never under the horn's 11`);
  check(calls.some((c) => c[0] === "fill" && String(c[2]).startsWith("rgba(34,190,84")), "and the gap is painted on the road in front of it");
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
