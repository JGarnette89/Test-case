/* =====================================================================
   ACTUATED SIGNALS (src/sim/actuated.js): the lights answer the loops.

   The maintainer's ruling (8 October): good driving is paid in time
   moving. The loop is the first way a real road does that -- pull up to
   the line and the light comes to you; stop well short and it never
   does. This holds the controller to that, on synthetic plans where the
   cars are exactly placed, and then in the sim:

   1. An isolated light rests in green with nobody waiting, answers a
      car on the stop-line loop within a gap, a change and a tick, and
      never answers a car stopped short of the loop.
   2. Cars coming on over the advance loop hold a green up to the plan's
      own green and no longer; a gap in them ends it.
   3. A protected left leads its phase only when a left lane is called.
   4. A coordinated light keeps every one of its coordinated greens on
      the clock whatever calls it gets -- the wave holds -- skips a side
      phase nobody calls, serves a late call while there is room, and
      hands an emptied side phase's time back.
   5. The player detected on a loop is what the mark on the head shows.
   6. In the sim: never two phases green on one light, nobody crossing
      a red (bar a right after stopping), nothing crashing, and less time
      standing at signalled lines than on the clock.
   ===================================================================== */
import { signalFor } from "../src/sim/signal.js";
import { stepLights, detect, LOOP, MIN_GREEN, PASSAGE } from "../src/sim/actuated.js";
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, pathOf } from "../src/sim/crossing.js";
import { lightAt, movementLight } from "../src/sim/signal.js";
import { DT } from "../src/sim/traffic.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };

/* A crossroads: N/S on one axis, E/W on the other; E posts a left arrow. */
const leg = (base, bearing, arrow = false) => ({ control: "signal", base, bearing, speed: 50 / 3.6, arrow });
const legs = { n: leg("N", 0), s: leg("S", 180), e: leg("E", 90, true), w: leg("W", 270) };
const plan = signalFor(legs, Object.keys(legs), 10);
const NS = plan.forBase.N, EW = plan.forBase.E;

/* Drive one light: `dets(t)` the cars on its approaches at time t. Returns the ball per base each tick. */
function drive(p, dets, secs, state = null) {
  let st = state ?? {};
  const out = [];
  for (let t = 0; t <= secs; t += DT) {
    st = stepLights({ 0: p }, st, () => dets(t), t);
    out.push({ t, ball: st[0].live.ball, arrow: st[0].live.arrow, saw: st[0].saw, mode: st[0].mode });
  }
  return out;
}
/* A GREEN NEVER GOES STRAIGHT TO RED -- ball or arrow, every base. Twice
   it did (the warm-up's rebase; a leading arrow under a green that had
   carried on), each time under a car already crossing. */
const abrupt = (seq) => { let n = 0; for (let i = 1; i < seq.length; i++) for (const b in seq[i].ball) { if (seq[i - 1].ball[b] === "green" && seq[i].ball[b] === "red") n++; if (seq[i - 1].arrow?.[b] === "green" && !seq[i].arrow?.[b]) n++; } return n; };
const firstGreen = (run, base) => run.find((r) => r.ball[base] === "green")?.t ?? null;

console.log("\n1. AN ISOLATED LIGHT: it rests, it answers the loop, and only the loop");
{
  const rest = drive(plan, () => [], 90);
  check(rest.every((r) => r.ball.N === rest[0].ball.N) && rest.every((r) => r.ball.E === rest[0].ball.E), `with nobody at it, it rests: the same light for 90 s (${rest[0].ball.N} N, ${rest[0].ball.E} E)`);
  const greenAxis = rest[0].ball.N === "green" ? "N" : "E", redAxis = greenAxis === "N" ? "E" : "N";
  const onLoop = drive(plan, (t) => (t >= 20 ? [{ base: redAxis, intent: "straight", toLine: 0.3, v: 0 }] : []), 60);
  const g = firstGreen(onLoop.filter((r) => r.t >= 20), redAxis);
  const bound = 20 + PASSAGE + plan.amber + plan.allRed + 2 * DT;
  check(g != null && g <= bound, `a car standing on the stop-line loop gets its green ${g != null ? (g - 20).toFixed(1) : "never"} s after pulling up -- within a gap, the amber and the all-red (${(bound - 20).toFixed(1)} s)`);
  const short = drive(plan, (t) => (t >= 20 ? [{ base: redAxis, intent: "straight", toLine: LOOP + 6, v: 0 }] : []), 120);
  check(short.every((r) => r.ball[redAxis] === "red"), `a car stopped ${LOOP + 6} m short of the line, off the loop, is never answered: red for the whole 100 s it waits`);
  const crept = drive(plan, (t) => (t >= 20 ? [{ base: redAxis, intent: "straight", toLine: t < 60 ? LOOP + 6 : 2, v: 0 }] : []), 90);
  const gc = firstGreen(crept.filter((r) => r.t >= 20), redAxis);
  check(gc != null && gc > 60 && gc <= 60 + PASSAGE + plan.amber + plan.allRed + 2 * DT, `and creeping up onto the loop at 60 s brings it (green at ${gc?.toFixed(1)} s)`);
}

console.log("\n2. THE ADVANCE LOOP: a stream of cars holds a green to the plan's own green, a gap ends it");
{
  const from = (base) => drive(plan, () => [], 1).at(-1);   // where it rests
  const rest = drive(plan, () => [], 1);
  const g = rest.at(-1).ball.N === "green" ? "N" : "E", r = g === "N" ? "E" : "N";
  /* A car waiting on the red axis from 30 s; on the green axis a car comes over the advance loop every 2 s (inside PASSAGE) -- or every 5 s (outside it). */
  const stream = (every) => drive(plan, (t) => [
    ...(t >= 30 ? [{ base: r, intent: "straight", toLine: 0.3, v: 0 }] : []),
    ...((t % every) < 0.6 ? [{ base: g, intent: "straight", toLine: LOOP + 15, v: 12 }] : []),
  ], 120);
  const held = stream(2), gapped = stream(5);
  const hg = firstGreen(held.filter((x) => x.t >= 30), r), gg = firstGreen(gapped.filter((x) => x.t >= 30), r);
  check(hg != null && hg - 30 >= plan.greenFor - MIN_GREEN - 1 && hg - 30 <= plan.greenFor + plan.amber + plan.allRed + 1, `cars every 2 s hold the green until it maxes out: the waiting car's green ${hg != null ? (hg - 30).toFixed(1) : "never"} s after it pulled up (plan green ${plan.greenFor} s)`);
  check(gg != null && gg - 30 <= PASSAGE + 5 + plan.amber + plan.allRed + 1, `cars every 5 s leave gaps longer than ${PASSAGE} s, and the waiting car gets its green in ${gg != null ? (gg - 30).toFixed(1) : "never"} s`);
  void from;
}

console.log("\n3. A PROTECTED LEFT leads only when a left lane is called");
{
  const rest = drive(plan, () => [], 1).at(-1);
  if (rest.ball.E === "green") { check(false, "the test expects the light to rest on N/S"); }
  else {
    const left = drive(plan, (t) => (t >= 10 ? [{ base: "E", intent: "left", toLine: 0.3, v: 0 }] : []), 60);
    const straight = drive(plan, (t) => (t >= 10 ? [{ base: "E", intent: "straight", toLine: 0.3, v: 0 }] : []), 60);
    check(left.some((x) => x.arrow.E === "green" && x.ball.E === "red"), "a left-turner on the E loop gets the arrow, with every ball red");
    check(!straight.some((x) => x.arrow.E === "green"), "a car going straight on the E loop gets the green ball and no arrow");
  }
}

console.log("\n4. A COORDINATED LIGHT keeps its wave");
{
  const cplan = { ...plan, offset: 7.3, coord: [NS] };
  const SIDE = plan.phases[EW][0], MAIN = plan.phases[NS][0];
  /* What the clock alone says: when the coordinated phase is green. */
  const clock = (t) => lightAt(cplan, MAIN, t);
  /* Random calls on everything, by a fixed sequence. */
  let x = 12345;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const calls = new Map();
  const fuzz = drive(cplan, (t) => { const k = Math.round(t * 2); if (!calls.has(k)) calls.set(k, rnd() < 0.3 ? [{ base: rnd() < 0.5 ? SIDE : MAIN, intent: "straight", toLine: rnd() * LOOP, v: rnd() < 0.5 ? 0 : 8 }] : []); return calls.get(k); }, 600);
  const kept = fuzz.filter((r) => clock(r.t) === "green").every((r) => r.ball[MAIN] === "green");
  check(kept, "under random calls for ten minutes, the coordinated phase is green at every instant the clock gives it green -- the windows never move");
  check(fuzz.every((r) => !(r.ball[MAIN] === "green" && r.ball[SIDE] === "green")), "and never green with the side phase");
  /* The same, with left-turners calling the arrow on both axes, and the arrow led by the coordinated phase too. */
  const legs2 = { ...legs, n: leg("N", 0, true) }, plan2 = signalFor(legs2, Object.keys(legs2), 10);
  const both = { ...plan2, offset: 7.3, coord: [plan2.forBase.N] };
  const calls2 = new Map();
  const fuzz2 = drive(both, (t) => { const k = Math.round(t * 2); if (!calls2.has(k)) calls2.set(k, rnd() < 0.4 ? [{ base: ["N", "S", "E", "W"][Math.floor(rnd() * 4)], intent: rnd() < 0.4 ? "left" : "straight", toLine: rnd() * LOOP, v: rnd() < 0.5 ? 0 : 8 }] : []); return calls2.get(k); }, 900);
  const iso = drive(plan, (t) => { const k = Math.round(t * 2); if (!calls2.has(-k)) calls2.set(-k, rnd() < 0.4 ? [{ base: ["N", "S", "E", "W"][Math.floor(rnd() * 4)], intent: rnd() < 0.4 ? "left" : "straight", toLine: rnd() * LOOP, v: rnd() < 0.5 ? 0 : 8 }] : []); return calls2.get(-k); }, 900);
  check(abrupt(fuzz) + abrupt(fuzz2) + abrupt(iso) === 0, `under random calls, lefts included, coordinated (both axes with an arrow) and isolated, no green ever goes straight to red (${abrupt(fuzz)}, ${abrupt(fuzz2)}, ${abrupt(iso)})`);
  const none = drive(cplan, () => [], 300);
  check(none.every((r) => r.ball[MAIN] === "green" && r.ball[SIDE] === "red"), "with nobody on the side street, it skips the side phase: main green for five minutes");
  /* A side car arriving late in its window, and a side window emptied early. */
  const sideStart = (() => { for (let t = 0; t < 200; t += DT) if (lightAt(cplan, SIDE, t) === "green" && lightAt(cplan, SIDE, t - DT) !== "green") return t; return null; })();
  const sideEnd = (() => { for (let t = sideStart; t < 400; t += DT) if (lightAt(cplan, SIDE, t) !== "green") return t; return null; })();
  const lateAt = sideStart + 3;
  const late = drive(cplan, (t) => (t >= lateAt && t < sideEnd ? [{ base: SIDE, intent: "straight", toLine: 0.3, v: 0 }] : []), sideEnd + 5);
  const lg = late.find((r) => r.t >= lateAt && r.ball[SIDE] === "green")?.t;
  check(lg != null && lg < sideEnd, `a side car arriving ${(lateAt - sideStart).toFixed(0)} s into its window is served in it (green at ${lg?.toFixed(1)} s, the window's green ends ${sideEnd.toFixed(1)} s)`);
  const early = drive(cplan, (t) => (t >= sideStart - 15 && t < sideStart + 1 ? [{ base: SIDE, intent: "straight", toLine: 0.3, v: 0 }] : []), sideEnd + 5);
  const back = early.find((r) => r.t > sideStart && r.t < sideEnd && r.ball[MAIN] === "green")?.t;
  check(back != null, `a side phase emptied early hands its window back: main green again at ${back?.toFixed(1)} s, before the side's green would have ended at ${sideEnd.toFixed(1)} s`);
}

console.log("\n5. THE MARK: the player detected is what the head shows");
{
  const seen = detect(plan, [{ base: "N", intent: "straight", toLine: 0.5, v: 0, player: true }, { base: "E", intent: "straight", toLine: 0.5, v: 0 }]);
  const away = detect(plan, [{ base: "N", intent: "straight", toLine: LOOP + 6, v: 0, player: true }]);
  const coming = detect(plan, [{ base: "N", intent: "straight", toLine: LOOP + 10, v: 12, player: true }]);
  check(seen.saw.N === true && !seen.saw.E, "a player on the N loop is marked on N, and a traffic car on E marks nothing");
  check(!away.saw.N, "a player stopped short of the loop is not marked -- the mark means the light knows you are there");
  check(coming.saw.N === true, "a player coming on over the advance loop is marked");
}

console.log("\n6. IN THE SIM: test map 1, actuated against the clock, three seeds");
{
  const loaded = loadMap(TEST_MAPS.find((m) => m.id === "test-1").build());
  const run1 = (actuated, seed) => {
    let w = seedGraph(seed, 50, loaded, { every: 2.0, target: 40, posted: true, actuated });
    let both = 0, redRuns = 0, standing = 0, crossings = 0, jumps = 0;
    const was = {};
    for (let i = 0; i < 300 / DT; i++) {
      const before = new Map(w.actors.map((a) => [a.id, a]));
      const lightsBefore = w.lights, tBefore = w.t;
      w = step(w);
      w.course.at.forEach((spot, k) => {
        const sig = spot.layout?.signal;
        if (!sig) return;
        const live = w.lights?.[k]?.live ?? null;
        if (sig.phases.filter((bs) => bs.some((b) => lightAt(sig, b, w.t, live) === "green")).length > 1) both++;
        for (const bs of sig.phases) for (const b of bs) { const now = lightAt(sig, b, w.t, live), key = k + b; if (was[key] === "green" && now === "red") jumps++; was[key] = now; }
      });
      for (const a of w.actors) {
        const L = w.course.at[a.k ?? 0].layout;
        if (!L.signal || a.player) continue;
        const p = pathOf(w, a), b = before.get(a.id);
        if (a.v < 0.3 && !a.crash && a.s > p.stopAt - 60 && a.s <= p.stopAt) standing += DT;
        if (b && b.k === a.k && b.route === a.route && b.s < p.stopAt && a.s >= p.stopAt) {
          crossings++;
          const lit = movementLight(L.signal, L.legs[p.from]?.base, p.intent, tBefore, lightsBefore?.[a.k ?? 0]?.live ?? null);
          if (lit === "red" && p.intent !== "right" && !b.amberGo) redRuns++;
        }
      }
    }
    const crashes = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length;
    return { both, redRuns, standing, crossings, crashes, jumps, lights: !!w.lights };
  };
  /* THREE SEEDS: one gave 10.4 s against 11.8 -- a margin one draw of the traffic could take away (CLAUDE.md item 3). */
  const run = (actuated) => [1, 2, 3].map((sd) => run1(actuated, sd)).reduce((t, r) => ({ both: t.both + r.both, redRuns: t.redRuns + r.redRuns, standing: t.standing + r.standing, crossings: t.crossings + r.crossings, crashes: t.crashes + r.crashes, jumps: t.jumps + r.jumps, lights: t.lights && r.lights }));
  const on = run(true), off = run(false);
  check(on.lights && !off.lights, "actuated is the default; `actuated: false` puts the lights back on their clock");
  check(on.both === 0, `never two phases of one light green together (${on.both} ticks)`);
  check(on.jumps === 0, `and no light went from green straight to red, from the first tick after the warm-up on (${on.jumps})`);
  check(on.redRuns === 0, `nobody crossed their line on a red bar a right turn (${on.redRuns} of ${on.crossings} crossings)`);
  check(on.crashes === 0, `no vehicle touched another (${on.crashes})`);
  const per = (r) => r.standing / Math.max(1, r.crossings);
  check(per(on) < per(off), `cars stand at signalled lines less with the loops: ${per(on).toFixed(1)} s a crossing against ${per(off).toFixed(1)} on the clock (${on.crossings} and ${off.crossings} crossings)`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nall passed");
process.exit(failed ? 1 : 0);
