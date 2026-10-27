/* THE CANDIDATE'S CHECKS AS EVENTS (27 October; sim/checks.js; SIMULATOR
   IN FLIGHT 31; DECISIONS 10.28 point 6). Held EVENT BY EVENT (10.23)
   against the stream the screen draws -- each car's `look`, tick by tick --
   and against the driver's knowledge stated through `reads`, never against
   the model's own record of what it decided (lc.wrong, lc.checked):

   1. Every look is a named kind with a direction and a timing.
   2. Every lane change begun: a driver who knows the shoulder check made
      the side mirror then the shoulder check toward the move, both before
      it, or no look at all (an occasion skipped); one who does not, the
      mirror alone before it -- and if they look over the shoulder at all,
      only after the move began.
   3. Skipped occasions at the rate observation sets: 0.6 x the deficit,
      pooled over every change, within three standard deviations.
   4. With somebody in the blind spot when the move began, they were missed
      exactly when no shoulder check came before it.
   5. Pulling away from a line: the first look along the cross road, if
      made, is left-right-left for a driver who knows it and right-left for
      one who does not, and nobody moves off before it is done.
   6. A perceiving driver checking while moving does not see the road
      ahead as it is; one looking at the road does.
   7. With checks off, no car carries a look, a prepared change or a scan;
      and with them on, default traffic crashes no more than without.
   Usage: node tools/verify-checks.mjs */
import { worldFor } from "../src/sim/scene.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { step, seenBy } from "../src/sim/crossing.js";
import { withDriver } from "../src/sim/drive.js";
import { DT } from "../src/sim/traffic.js";
import { reads, deficitOf } from "../src/core/driver.js";
import { CHECKS } from "../src/sim/checks.js";
import { lookingAway } from "../src/sim/attention.js";
import { goodStep } from "./lib/good-driver.mjs";

let failed = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

function drive(id, cars, secs, { checks = true, perceive = false, each = null, periphery = true } = {}) {
  const raw = TEST_MAPS.find((m) => m.id === id).build();
  let { world: w, me } = worldFor(1, 50, 2.0, true, cars, raw, raw.sections?.[0]?.start ?? null, perceive, false, { checks });
  if (!periphery) w = { ...w, noPeriphery: true };
  const me0 = me, sc = { me, args: [1], saveWallet: false };
  for (let i = 0; i < secs / DT; i++) {
    if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
    me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
    const prev = w;
    w = step(withDriver(w, me));
    if (each) each(prev, w, i);
  }
  return w;
}

/* The look stream as drawn: per car, each look once, as [kind, t0, t1]. */
function recorder() {
  const looks = new Map(), bad = [];
  const add = (a) => {
    if (!a.look) return;
    const xs = looks.get(a.id) ?? [];
    const last = xs[xs.length - 1];
    if (!last || last[0] !== a.look.kind || last[1] !== a.look.t0) {
      if (!CHECKS[a.look.kind] || !(a.look.t1 > a.look.t0)) bad.push(`${a.id} ${a.look.kind} ${a.look.t0}-${a.look.t1}`);
      xs.push([a.look.kind, a.look.t0, a.look.t1]);
      looks.set(a.id, xs);
    }
  };
  return { looks, bad, add };
}

console.log("1-4. lane changes on the shaped endless highway, 180 cars, three minutes");
{
  const rec = recorder(), pending = [];
  let changes = 0, wrongSeq = [], skipped = 0, expSkip = 0, varSkip = 0, blind = 0, blindWrong = [], lateSeen = 0, lateWrong = [];
  drive("test-loop", 180, 180, {
    each: (prev, w) => {
      const before = new Map(prev.actors.map((a) => [a.id, a]));
      for (const a of w.actors) {
        if (a.player) continue;
        rec.add(a);
        const b = before.get(a.id);
        if (a.lc && !a.lc.abort && (!b?.lc || b.lc.at !== a.lc.at)) pending.push({ a, T: a.lc.at, due: w.t + 1.5 });
      }
      while (pending.length && pending[0].due <= w.t) {
        const { a, T } = pending.shift();
        const side = a.lc.L0 < 0 ? "right" : "left";
        const xs = (rec.looks.get(a.id) ?? []).filter(([k]) => k !== "mirror");
        /* This change's own looks: from when it was prepared (lc.prepAt -- a timing anchor, not a verdict) to when it began. */
        const pre = xs.filter(([, t0, t1]) => t1 <= T + DT / 2 && t0 >= (a.lc.prepAt ?? T) - 1e-9).map(([k]) => k);
        const post = xs.filter(([, t0]) => t0 > T + DT / 2).map(([k]) => k);
        const knows = reads(a, "shoulder-check");
        changes++;
        const p = 0.6 * (deficitOf(a.ratings ?? {}, "observation").deficit ?? 0);
        expSkip += p; varSkip += p * (1 - p);
        if (!pre.length) skipped++;
        const okSeq = knows
          ? (!pre.length || (pre.length === 2 && pre[0] === `mirror-${side}` && pre[1] === `shoulder-${side}`))
          : (!pre.length || (pre.length === 1 && pre[0] === `mirror-${side}`));
        if (!okSeq && wrongSeq.length < 5) wrongSeq.push(`${a.id} knows ${knows} ${side}: before ${pre.join(",") || "none"}`);
        if (!okSeq) wrongSeq.count = (wrongSeq.count ?? 0) + 1;
        /* A shoulder check after the move began: only from a driver who does not know it. */
        if (post.includes(`shoulder-${side}`)) { lateSeen++; if (knows && lateWrong.length < 5) lateWrong.push(`${a.id}`); }
        if (a.lc.blind) {
          blind++;
          const looked = pre.includes(`shoulder-${side}`);
          if (a.lc.missed !== !looked) blindWrong.push(`${a.id} missed ${a.lc.missed} looked ${looked}`);
        }
      }
    },
  });
  check(rec.bad.length === 0, `every look a named kind with a direction and a timing (${rec.bad.length} not)${rec.bad.length ? ": " + rec.bad.slice(0, 3).join("; ") : ""}`);
  check(changes >= 100 && !(wrongSeq.count > 0), `${changes} lane changes: the right looks before each -- mirror then shoulder toward the move if the driver knows it, the mirror alone if not, or none (${wrongSeq.count ?? 0} otherwise)${wrongSeq.length ? "\n         " + wrongSeq.join("\n         ") : ""}`);
  check(lateWrong.length === 0 && lateSeen > 0, `a shoulder check after the move began comes only from a driver who does not know it: ${lateSeen} seen, ${lateWrong.length} from one who does`);
  const sd = Math.sqrt(varSkip);
  check(Math.abs(skipped - expSkip) <= 3 * sd + 1, `occasions skipped at the rate observation sets: ${skipped} against ${expSkip.toFixed(1)} expected (+-${(3 * sd).toFixed(1)})`);
  check(blind > 0 && blindWrong.length === 0, `with somebody in the blind spot, missed exactly when no shoulder check came first: ${blind} such changes, ${blindWrong.length} otherwise${blindWrong.length ? ": " + blindWrong.slice(0, 3).join("; ") : ""}`);
}

console.log("\n5. pulling away from a line, test map 1, 260 cars, three minutes");
{
  const rec = recorder();
  let launches = 0, scanned = 0, early = [], order = [], crashes = 0;
  /* The FIRST look at each line, recorded when it is made: a long wait at a red replaces it with later ones before the launch. */
  const first = new Map();
  const w = drive("test-1", 260, 180, {
    each: (prev, w) => {
      const before = new Map(prev.actors.map((a) => [a.id, a]));
      for (const a of w.actors) {
        if (a.player) continue;
        rec.add(a);
        if (a.scan && !a.scan.round && a.scan.steps?.[0]?.[1] >= w.t - DT && !first.has(`${a.id}|${a.scan.key}`)) first.set(`${a.id}|${a.scan.key}`, a.scan);
        const b = before.get(a.id);
        if (!b || !(b.stoppedAt != null && !b.going && a.going) || a.k !== b.k) continue;
        launches++;
        const sc = b.scan && first.get(`${a.id}|${b.scan.key}`);
        if (!sc || !sc.steps?.length || !sc.key?.startsWith(`${b.k ?? 0}:`)) continue;
        scanned++;
        if (w.t < sc.until - 1e-9) early.push(`${a.id} moved off at ${w.t.toFixed(2)}, scan until ${sc.until.toFixed(2)}`);
        const drawn = (rec.looks.get(a.id) ?? []).filter(([k, t0]) => (k === "left" || k === "right") && t0 >= sc.steps[0][1] - 1e-9 && t0 <= sc.until).map(([k]) => k).join(",");
        const want = reads(a, "left-right-left") ? "left,right,left" : "right,left";
        if (drawn !== want) order.push(`${a.id} drew ${drawn} wants ${want}`);
      }
    },
  });
  crashes = (w.crashes ?? []).length;
  check(scanned >= 30 && order.length === 0, `${scanned} first looks along the cross road before ${launches} launches: left-right-left for a driver who knows it, right-left for one who does not (${order.length} otherwise)${order.length ? ": " + order.slice(0, 3).join("; ") : ""}`);
  check(early.length === 0, `nobody moves off before that look is done (${early.length} did)${early.length ? ": " + early.slice(0, 3).join("; ") : ""}`);
  check(crashes === 0, `and the traffic crashes nothing: ${crashes}`);
}

console.log("\n6. what a perceiving driver sees while checking, test map 1 with look-away, one minute");
{
  let checkingMoving = 0, carried = 0, onRoad = 0, present = 0;
  /* Peripheral vision off -- a controlled comparison (crossing.js noPeriphery): the car ahead looming brings the present back by design, and that is attention.js's, not this. */
  drive("test-1", 200, 60, {
    perceive: true, periphery: false,
    each: (prev, w, i) => {
      if (i < 300 || i % 5) return;
      for (const a of w.actors) {
        if (a.player || !(a.lag > 0)) continue;
        const kind = a.look?.kind;
        /* From a tick into the look: at its first instant the carried picture is zero seconds old, which is the present. */
        if (kind && kind !== "mirror" && a.v >= 0.3 && w.t - a.look.t0 >= DT - 1e-9) { checkingMoving++; if (seenBy(w, a) !== w.actors) carried++; }
        if (!kind && lookingAway(w.t, a) === 0) { onRoad++; if (seenBy(w, a) === w.actors) present++; }
      }
    },
  });
  check(checkingMoving > 20 && carried === checkingMoving, `checking while moving, the road ahead is the carried picture: ${carried} of ${checkingMoving}`);
  check(onRoad > 100 && present === onRoad, `eyes on the road, the world as it is: ${present} of ${onRoad}`);
}

console.log("\n7. checks off is the world without them; on, no more crashes");
{
  let carriedLook = 0, crOff = 0, crOn = 0;
  const off = drive("test-loop", 180, 60, { checks: false, each: (p, w) => { for (const a of w.actors) if (a.look !== undefined || a.lcPrep || a.scan) carriedLook++; } });
  crOff = (off.crashes ?? []).length;
  crOn = (drive("test-loop", 180, 60).crashes ?? []).length;
  check(carriedLook === 0, `checks off: no look, prepared change or scan on any car (${carriedLook} car-ticks with one)`);
  check(crOn <= crOff, `checks on, crashes ${crOn} against ${crOff} off`);
}

console.log(failed ? `\n${failed} FAILURE(S)` : "\nOK: checks are named events with a direction and a timing, made by the driver's own observation and knowledge, missing the blind spot exactly when nobody looked, held before pulling away, taking the eyes off the road while they last, and absent when switched off.");
process.exit(failed ? 1 : 0);
