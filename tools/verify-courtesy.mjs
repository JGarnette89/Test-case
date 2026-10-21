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
import { trial, gapBeside } from "./measure/courtesy-trial.mjs";
import { stepDriver } from "../src/sim/drive.js";
import { sliderFor } from "../src/sim/player.js";
import { detect, newEventState } from "../src/sim/events.js";

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
  /* EVERY STRETCH OF EVERY WARMED MOMENT (14 October, the cost of a check).
     The warm-up was nearly all of this check's time -- 48 moments, one trial
     each, 687 s -- and a moment holds a level car on each of the loop's four
     long stretches. Moments from 120 s (the loop fills only by its ramps:
     at 60 s there was hardly a car level with anybody), 30 s apart, every
     stretch, up to two cars on each, until 24 trials. */
  /* ASKED OF EACH TEMPERAMENT (14 October). Which drivers happen to sit
     level in the middle lane is luck -- 6 of 19 offered on one set of
     moments, 2 of 24 on another -- and the middle lane leans bold. So the
     trial is asked of a level car the axes call courteous (section 1), and
     of one they do not: the first must give a gap that the same moment
     without courtesy does not, the second must never offer. Chosen by their
     drawn ratings; what they then do is the sim's. */
  const MOMENTS = 24, PICKS = 2, WANT = { yes: 8, no: 6 }, bases = [], offered = [], overPairs = [], kinds = [];
  const got = { yes: 0, no: 0 };
  for (let m = 0; m < MOMENTS && (got.yes < WANT.yes || got.no < WANT.no); m++) {
    let base = bases[m % 6] ?? seedGraph(1 + (m % 6), 50, loop, { target: 200, posted: true });
    while (base.t < 120 + 30 * Math.floor(m / 6)) base = step(base);
    bases[m % 6] = base;
    for (let i = 0; i < 4; i++) for (const kind of ["yes", "no"]) for (let pick = 0; pick < PICKS && got[kind] < WANT[kind]; pick++) {
    const only = (a) => courteous(a) === (kind === "yes");
    const ever = new Map();
    const r = trial(base, i, true, (was, w, pl, sigAt) => {
      /* OFFERS TO THE PLAYER. Since 21 October the traffic offers joining
         cars gaps too (courtesy.js, map/accel.js) -- and on this loop every
         entrance has an acceleration lane -- so the player's are the ones
         marked theirs; the traffic's are verify-merge's. */
      const mine = (c) => c.courtesy && c.courtesy.forPlayer;
      const active = w.actors.filter((c) => mine(c) && !c.courtesy.done);
      if (active.length > 1) many++;
      for (const c of w.actors) {
        if (!mine(c)) continue;
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
      if (Math.round(w.t / DT) % 20 === 0) for (const o of overlapping(w)) { over++; overPairs.push(`${o.a}/${o.b}`); }
    }, pick, only);
    if (r == null) continue;
    got[kind]++;
    on.push(r.t); off.push(trial(base, i, false, null, pick, only).t); cars.push(r.car); offered.push(ever.size > 0); kinds.push(kind);
    }
  }
  if (overPairs.length) console.log("   overlapping:", overPairs.join(", "));
  /* Level with somebody, a gap comes when THEY give one: the trials where the car beside offered, with and without courtesy. */
  const yes = kinds.map((k, j) => (k === "yes" ? j : -1)).filter((j) => j >= 0), no = kinds.map((k, j) => (k === "no" ? j : -1)).filter((j) => j >= 0);
  const offeredYes = yes.filter((j) => offered[j]);
  const soonOn = offeredYes.filter((j) => on[j] <= 6).length, soonOff = offeredYes.filter((j) => off[j] <= 6).length;
  check(yes.length >= 6 && offeredYes.length >= 0.6 * yes.length, `level with a courteous driver (${yes.length} trials), they offered ${offeredYes.length} times -- the rest had not noticed the signal in time, or could not drop back comfortably`);
  check(soonOn >= 0.75 * offeredYes.length && soonOff <= soonOn / 2, `and where they did, a gap a competent driver takes came within 6 s of signalling in ${soonOn} of ${offeredYes.length} (${offeredYes.map((j) => on[j].toFixed(1)).join(", ")} s); the same moments without courtesy, ${soonOff}`);
  check(no.length >= 4 && no.every((j) => !offered[j]), `level with a driver the axes do not call courteous (${no.length} trials): no offer, ever (${no.filter((j) => offered[j]).length})`);
  check(overBrake === 0, `no offerer braked past their own comfortable rate (hardest ${hardest.toFixed(2)} m/s^2)`);
  check(many === 0 && over === 0, `one driver asked at a time (${many} ticks with two), nobody overlapping (${over})`);
  check(held === 0 && reoffer === 0, `an offer not taken is withdrawn at ${COURTESY_FOR} s (${held} held past it) and not made again (${reoffer})`);
  check(early === 0, `no offer before the offerer could notice the signal (${early} early)`);
}

console.log("\n5. WITH NOBODY ASKING, NOTHING MOVES");
{
  /* Nobody asking: no player signalling, and -- since joining cars ask too
     (21 October) -- no acceleration lanes, so the loop with its slip roads
     on yield signs. With them, courtesy is supposed to move the world:
     verify-merge counts the offers. */
  const raw = testLoop();
  for (const r of raw.roads) { delete r.accel; if (r.id.startsWith("on-")) r.control = { start: "none", end: "yield" }; }
  let a = seedGraph(2, 50, loadMap(raw), { target: 120, posted: true }), b = { ...a, courtesy: false };
  let same = true;
  for (let i = 0; i < 60 / DT && same; i++) {
    a = step(a); b = step(b);
    same = a.actors.length === b.actors.length && a.actors.every((x, j) => x.id === b.actors[j].id && x.s === b.actors[j].s && x.v === b.actors[j].v);
  }
  check(same, "a minute of the highway with nobody asking, courtesy on and off: identical, tick for tick");
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

console.log("\n7. TAKEN, IT IS NOTICED -- IN THE RUNNING SIM");
{
  /* "LET IN", END TO END (21 October). The voice check handed the detector
     a made offer and it fired; in the running sim it never had: on the tick
     the player crossed, their signal pointed at the next lane and the offer
     was already withdrawn. So: a player level with a courteous car,
     signalling; when the gap is there they steer into it through the real
     player model; the game's own detector must say so -- and with courtesy
     off, moving into a gap that came on its own, it must not. */
  const LANE = 3.6;
  const run = (base, i, on) => {
    let w = { ...base, courtesy: on };
    const at0 = playerOn(w.course, `loop-${(i % 4) * 2}`, "end");
    const layout = w.course.at[at0.k].layout;
    const base0 = layout.legs[layout.paths[at0.route].from].base;
    const curb = layout.legAt(base0, 2), mid = layout.legAt(base0, 1);
    const route = Object.keys(layout.paths).find((r) => layout.paths[r].from === curb);
    const cp = layout.paths[route];
    const level = w.actors.filter((a) => (a.k ?? 0) === at0.k && layout.paths[a.route]?.from === mid && a.s > 60 && a.s < layout.paths[a.route].stopAt - 200 && !a.lc && a.kind !== "truck" && a.kind !== "bus" && courteous(a));
    if (!level.length) return null;
    const c = level[0], sc = (a) => a.s * (cp.stopAt / layout.paths[a.route].stopAt);
    let pl = { ...at0, route, s: sc(c) + 0.5, v: c.v, off: 0, psi: 0 };
    w = { ...w, actors: w.actors.filter((a) => a.id === c.id || (a.k ?? 0) !== pl.k || Math.abs(sc(a) - pl.s) > 60 || ![curb, mid].includes(layout.paths[a.route]?.from)) };
    let st = newEventState(), offered = false, moving = false, said = false, moved = false;
    /* Without courtesy a gap comes only when the traffic happens to leave one: longer to wait for it. */
    for (let n = 0; n < (on ? 30 : 90) / DT; n++) {
      const signal = n * DT >= 1 ? "left" : null;
      if (w.actors.some((a) => a.courtesy?.forPlayer && !a.courtesy.done)) offered = true;
      if (signal && gapBeside(w, pl)) moving = true;
      /* With courtesy, holding level is what asks for the gap; without, a player drops back a little to find one behind. */
      const want = on ? c.v : c.v - 2;
      const input = { steer: -(pl.off - (moving ? -LANE : 0)) * 0.25 - pl.psi * 2.5, slider: sliderFor((want - pl.v) * 0.6, pl.v, 0), assist: 0 };
      const prev = { me: pl, world: w };
      pl = stepDriver({ ...pl, signal }, input, w, DT);
      w = step(withDriver(w, pl));
      const r = detect(prev, { me: pl, world: w }, st);
      st = r.state;
      if (r.events.some((e) => e.id === "letIn")) said = true;
      if (w.course.at[pl.k].layout.paths[pl.route].from === mid) moved = true;
      if (moved && n * DT > 8) break;
    }
    return { offered, moved, said };
  };
  const on = [], off = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    let base = seedGraph(seed, 50, loop, { target: 200, posted: true });
    while (base.t < 180) base = step(base);
    for (let i = 0; i < 4; i++) { const a = run(base, i, true); if (a) on.push(a); const b = run(base, i, false); if (b) off.push(b); }
  }
  const taken = on.filter((r) => r.offered && r.moved), alone = off.filter((r) => r.moved);
  check(taken.length >= 3 && taken.every((r) => r.said), `a gap offered and taken is noticed as being let in: ${taken.filter((r) => r.said).length} of ${taken.length}`);
  check(alone.length >= 3 && alone.every((r) => !r.said), `and a gap that came on its own, with courtesy off, is not: ${alone.filter((r) => r.said).length} of ${alone.length}`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
