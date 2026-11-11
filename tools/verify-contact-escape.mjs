/* NOBODY IS TRAPPED, REVERSE IS AN ORDINARY CONTROL, AND THE DRIVE GOES ON (DECISIONS 10.49, 10.52, 10.57), split from verify-contact.mjs on 11 November
   (DECISIONS 10.70): Codex's +11 and +29 failures of the one file were two different kinds of thing -- a sample floor on the light-entry records,
   and escape and immobility behaviour -- under one name. Sample: section 9 is 4 angles, up to 6 parked cars each; the soak is 2 seeds of 4 simulated
   minutes at 180 cars, a driver who never lifts. */
import { emptyMap, road } from "../src/map/format.js";
import { loadMap } from "../src/map/load.js";
import { seedGraph, step, poseOf, carFor } from "../src/sim/crossing.js";
import { driver, DT } from "../src/sim/traffic.js";
import { playerAt, playerOn, withDriver, stepDriver, driverPose } from "../src/sim/drive.js";
import { worldFor } from "../src/sim/scene.js";
import { playerContact, afterContact, towTick, TOW_AFTER, owedBy } from "../src/sim/contact.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { movementLight } from "../src/sim/signal.js";
import { touching, V_MAX, INOPERABLE, BACK_V } from "../src/sim/player.js";
import { parkedPoses } from "../src/sim/parking.js";
import { pedPose } from "../src/sim/peds.js";
import { poseOnGraph } from "../src/sim/graph.js";
import { noticeTick, contactTick } from "../src/sim/session.js";
import { detect, newEventState, TRIGGERS } from "../src/sim/events.js";
import { newMeter, meterTick, fareFor } from "../src/sim/money.js";
import { newMailbox, post, mailTick, lettersFor, saveMailbox, loadMailbox, MAIL_DAY } from "../src/sim/mail.js";
import { testCityReady, testPeds } from "../src/map/samples.js";

import { P, m, loaded, base, L, route, carAt, playerHere, tick, scene, wrapped, holdLine, strike } from "./lib/contact-scene.mjs";
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

console.log("9. Nobody is trapped: there is no reverse");
{
  const cityMap = testCityReady();
  const { world: w0, me: me0 } = worldFor(1, 50, 1e9, true, 0, cityMap);
  let w = { ...w0, actors: w0.actors.filter((a) => a.player), target: 0 };
  void me0;
  const slots = parkedPoses(w.course, w.parked);
  check(slots.length > 20, `${slots.length} parked cars to hit`);
  /* The curb lane each runs beside: a path along it, within a lane and a half. */
  const pathBeside = (q) => {
    for (let k = 0; k < w.course.at.length; k++) {
      const L = w.course.at[k].layout;
      for (const [r, p] of Object.entries(L.paths)) {
        if (p.intent !== "straight") continue;
        for (let s = 0; s < p.length; s += 2) {
          const o = poseOnGraph(w.course, k, r, s);
          const c = Math.cos(((o.rot - q.heading) * Math.PI) / 180), d = Math.hypot(o.x - q.x, o.y - q.y);
          if (c > 0.98 && d < 5.5 && s > 15 && s < p.length - 15 && s < p.stopAt - 12) return { k, r, s, o };
        }
      }
    }
    return null;
  };
  const worst = {}, escapes = { 20: [], 45: [], 70: [], 90: [] };
  let cases = 0, trapped = 0, dead = 0;
  for (const deg of [20, 45, 70, 90]) {
    worst[deg] = 0;
    let used = 0;
    for (const q of slots) {
      if (used >= 6) break;
      const at = pathBeside(q);
      if (!at) continue;
      used++; cases++;
      const h = (at.o.rot * Math.PI) / 180;
      const toX = q.x - at.o.x, toY = q.y - at.o.y;
      const off0 = -toX * Math.sin(h) + toY * Math.cos(h), side = Math.sign(off0) || 1;
      const psi = (side * deg * Math.PI) / 180, back = 6;
      /* Standing back from the parked car, its nose on it. */
      const me = { ...playerAt(w.course, at.k, at.r), s: at.s - Math.cos(psi) * back, off: off0 - Math.sin(psi) * back, psi, v: 8, a: 0 };
      const sc = scene(me);
      let ww = withDriver(w, me), hitAt = null, freeAt = null, backUntil = -1, pressed = 0;
      for (let i = 0; i < 120 / DT; i++) {
        /* Into it. Once hit, a person getting going again: the wheel toward the road's line and
           the throttle down, and pressed against something for a second, the brake held and the
           wheel the other way for two and a half seconds, as a three-point turn. Back on line and
           moving is out of it. */
        const toLine = holdLine(sc.me).steer;
        const backing = ww.t < backUntil;
        const r = tick(sc, ww, hitAt == null ? { steer: 0, slider: 1 } : backing ? { steer: -toLine, slider: -1 } : { steer: toLine, slider: 1 });
        ww = r.w;
        if (r.hit && hitAt == null) hitAt = ww.t;
        pressed = (sc.me.v ?? 0) < 0.5 && !backing ? pressed + DT : 0;
        if (hitAt != null && pressed > 1) { backUntil = ww.t + 2.5; pressed = 0; }
        if (hitAt != null && Math.abs(wrapped(sc.me.psi)) < 0.35 && (sc.me.v ?? 0) > 3 && !r.c.solids.length) { freeAt = ww.t; break; }
        if (hitAt != null && (sc.me.damage ?? 0) >= INOPERABLE) dead++;
      }
      if (hitAt == null) { cases--; continue; }
      if (freeAt == null) { const p = driverPose(sc.me, ww.course); console.log(`    trapped at ${deg}: ${q.id} s ${sc.me.s.toFixed(2)} off ${sc.me.off.toFixed(2)} psi ${sc.me.psi.toFixed(2)} v ${sc.me.v.toFixed(2)} damage ${(sc.me.damage ?? 0).toFixed(2)} ${Math.hypot(p.x - q.x, p.y - q.y).toFixed(1)} m away, atEdge ${!!sc.me.atEdge}, route ${sc.me.route}, k ${sc.me.k}, solids ${playerContact(ww, sc.me).solids.map((x) => x.id).join(",")}`); trapped++; worst[deg] = Infinity; escapes[deg].push(Infinity); } else { worst[deg] = Math.max(worst[deg], freeAt - hitAt); escapes[deg].push(freeAt - hitAt); }
    }
  }
  /* THE CLASSIFICATION OF A SLOW ESCAPE, from the sample (11 November, the corrected definition, DECISIONS 10.70): at most 6 cases a
     angle, so ONE case past TOW_AFTER is 17% of an angle's sample and one draw can explain it; TWO at the same angle is not one draw. The
     assertion stays strict (no case slower than the tow); the message says which of the two it is. Codex's +29 failure read "worst 93.4 s
     at 70 degrees" and nothing said how many cases. */
  const slowAt = (d) => escapes[d].filter((x) => x > TOW_AFTER).length;
  const verdict = (d) => (slowAt(d) === 0 ? "clear" : slowAt(d) === 1 ? `CANNOT TELL: 1 of ${escapes[d].length} cases slow, one draw` : `REAL: ${slowAt(d)} of ${escapes[d].length} cases slow`);
  check(cases >= 12, `the case arose (escape): ${cases} nose-on cases (${Object.entries(escapes).map(([d, e]) => `${d}: ${e.length}`).join(", ")}; floor 12, the check's own)`);
  check(trapped === 0, `nobody trapped: ${trapped} of ${cases}`);
  check(Object.keys(escapes).every((d) => slowAt(d) === 0), `every case clears within the tow (${TOW_AFTER} s): ${Object.keys(escapes).map((d) => `${d} degrees: worst ${worst[d].toFixed(1)} s, ${verdict(d)}`).join("; ")} (${(dead * DT).toFixed(0)} s of it with the car past going, scraping the row)`);
}

console.log("9b. Reverse, an ordinary control (DECISIONS 10.57)");
{
  const empty = (me) => withDriver({ ...base, actors: [], crashes: [] }, me);
  const drive = (me, script) => { let w = empty(me), m = me; for (const [secs, inp] of script) for (let i = 0; i < secs / DT; i++) { m = stepDriver(m, inp, w, DT); w = withDriver({ ...w, t: w.t + DT }, m); } return m; };
  const BOTTOM = { steer: 0, slider: -1 }, LIFT = { steer: 0, slider: 0 }, GAS = { steer: 0, slider: 1 };
  /* Available with nothing hit, anywhere, and with no limit but how long it is held. */
  const fresh = drive(playerHere(500, 0), [[0.2, LIFT], [20, BOTTOM]]);
  const went = 500 - fresh.s;
  check(Math.abs(went - BACK_V * (20 - 0.4)) < 1 && fresh.v === 0, `from a standstill with nothing hit, a fresh pull held 20 s: back ${went.toFixed(1)} m, its speed 0 to everybody else`);
  /* THE RED LIGHT: the reason for the gesture. Braking to a stop and staying down stays put. */
  const stopped = drive(playerHere(300, 12), [[15, BOTTOM]]);
  const rest = stopped.s;
  const stay = drive(stopped, [[20, BOTTOM]]);
  check(stopped.v < 0.01 && stay.s === rest, `braked to a stop from speed and the slider left at the bottom: it stays, for 20 s more (${(stay.s - rest).toFixed(2)} m)`);
  /* Lift and pull again, from that same stop. */
  const again = drive(stay, [[0.2, LIFT], [3, BOTTOM]]);
  check(rest - again.s > 3, `lift and pull again, from that stop: it rolls back ${(rest - again.s).toFixed(1)} m in 3 s`);
  const tap = drive(playerHere(300, 0), [[0.2, LIFT], [0.3, BOTTOM], [2, LIFT]]);
  check(tap.s === 300, "a tap at the bottom moves nothing");
  const off = drive(playerHere(300, 0), [[0.2, LIFT], [3, BOTTOM], [2, LIFT]]);
  const held = 300 - off.s;
  check(held > 3 && held < BACK_V * 3, `lifting stops it: ${held.toFixed(1)} m, no further`);
  const forward = drive(off, [[3, GAS]]);
  check(forward.s > off.s + 5 && forward.v > 3, `and forward works straight after: ${(forward.s - off.s).toFixed(1)} m in 3 s`);
  /* The wheel: reverse with it turned swings the tail that way, which turns the nose the other. */
  const turned = drive(playerHere(300, 0), [[0.2, LIFT], [5, { steer: 0.5, slider: -1 }]]);
  check(turned.psi < -0.05, `the wheel to the right in reverse: the nose comes round left (${turned.psi.toFixed(2)} rad)`);
  /* THE STRAND THE MAINTAINER REPORTED, 6 NOVEMBER, reproduced first: at each impact, back off and drive away.
     Below the limit it must go both ways; past it, neither, and it must say so. */
  for (const kmh of [10, 30, 50, 60, 70]) {
    const sc = scene(playerHere(651, kmh / 3.6));
    let w = withDriver({ ...base, actors: [{ ...carAt(base, "wreck", 660), crash: { t: 1e9, with: "x", at: P(0, 0) } }], crashes: [] }, sc.me);
    const go = (secs, inp) => { let any = null; for (let i = 0; i < secs / DT; i++) { const r = tick(sc, w, inp); w = r.w; any = r; } return any; };
    let hit = false; for (let i = 0; i < 100 && !hit; i++) { const r = tick(sc, w, { steer: 0, slider: 0.3 }); w = r.w; hit = r.hit; }
    const d = sc.me.damage; go(1, LIFT);
    const s0 = sc.me.s; go(3, BOTTOM); const s1 = sc.me.s;
    go(1, LIFT); go(3, { steer: 0.5, slider: 1 }); const moved = Math.hypot(sc.me.s - s1, sc.me.off);
    check(hit, `the case arose: ${kmh} km/h into the wreck, a contact, damage ${d.toFixed(2)} (the limit is ${INOPERABLE})`);
    if (d < INOPERABLE) check(s0 - s1 > 3 && moved > 4, `${kmh} km/h, damage ${d.toFixed(2)}: back ${(s0 - s1).toFixed(1)} m, then forward ${moved.toFixed(1)} m`);
    else {
      /* THREE LINES FROM ONE CONJUNCTION (11 November). At +29 `moved` read 11.5 mm against a 10 mm tolerance while `s0 === s1` held and the car did
         not go back at all; at native 1.8 mm and at +11 6.5 mm, monotone in the seed offset: a residual that grows with the seed number in an
         empty world is a lead, and 1.5 mm over a tolerance of a centimetre is a tolerance edge and not an immobile car moving. The 10 mm is
         unchanged (never tune a number to make a check pass). */
      check(s0 === s1, `${kmh} km/h, past the limit (${d.toFixed(2)}): did not go back (${(s0 - s1).toFixed(4)} m)`);
      check(moved < 0.01, `${kmh} km/h, past the limit: did not go forward -- moved ${(moved * 1000).toFixed(1)} mm against a tolerance of 10 mm${moved >= 0.01 && moved < 0.02 ? " -- CANNOT TELL: a residual within a centimetre of the tolerance, not an immobile car moving" : ""}`);
      check(/will not go/.test(sc.said?.text ?? "") , `and the screen says so: "${sc.said?.text}"`);
      go(TOW_AFTER + 1, LIFT); const s2 = sc.me.s; go(3, BOTTOM); const backed = s2 - sc.me.s; go(1, LIFT); go(3, { steer: 0.5, slider: 1 });
      check(backed > 3 && sc.me.v > 2, `after the tow it goes both ways: back ${backed.toFixed(1)} m, then ${sc.me.v.toFixed(1)} m/s forward`);
    }
  }
  /* Across the seam, not an invisible wall at the end of a path: on a road with a road behind it, with no jump.
     Found by sabotage: this first chose a path at the map's edge, and passed with the wall in place. */
  {
    const w1 = seedGraph(1, 50, loadMap(TEST_MAPS.find((x) => x.id === "test-1").build()), { every: 1e9, target: 0, posted: true });
    let k0 = -1, r0 = null;
    for (const j of Object.values(w1.course.joins)) { const L0 = w1.course.at[j.k].layout, r = Object.keys(L0.paths).find((x) => L0.paths[x].from === j.side && L0.paths[x].intent === "straight"); if (r) { k0 = j.k; r0 = r; break; } }
    let m = { ...playerAt(w1.course, k0, r0), s: 2, off: 0, v: 0, a: 0 }, w = withDriver({ ...w1, actors: [] }, m), jump = 0, crossed = false;
    for (let i = 0; i < 6 / DT; i++) {
      const p0 = driverPose(m, w.course);
      m = stepDriver(m, i < 4 ? LIFT : BOTTOM, w, DT); w = withDriver({ ...w, t: w.t + DT }, m);
      const p1 = driverPose(m, w.course);
      jump = Math.max(jump, Math.hypot(p1.x - p0.x, p1.y - p0.y));
      if (m.k !== k0) crossed = true;
    }
    check(crossed && jump < 0.5, `backwards off the start of a path, onto the one leading to it: crossed ${crossed}, the largest step ${jump.toFixed(2)} m`);
  }
  /* Reversing into somebody is the player's, whichever way it reads. */
  const bk = strike(playerHere(700, 0, { backing: true }), carAt(base, "b", 696.5, 3)).fresh[0];
  check(bk?.atFault, "reversing into a car behind: at fault");
}

console.log("10. The drive goes on: a driver who never lifts, on the city at 180");
{
  let contacts = 0, ran = 0, stuckWorst = 0, kinds = {}, deep = 0, ticks = 0;
  for (const seed of [1, 2]) {
    const { world, me } = worldFor(seed, 50, undefined, true, 180, testCityReady());
    let w = world;
    const sc = scene(me);
    sc.jobText = null;
    let stuck = 0, prev = { me: sc.me, world: w };
    const hitAt = new Map();
    for (let i = 0; i < 240 / DT; i++) {
      /* Aims at the nearest thing ahead it has not just hit, a car or a parked car; else holds its line. */
      const p0 = driverPose(sc.me, w.course), h0 = (p0.heading * Math.PI) / 180;
      let aim = null, near = 40;
      const look = (id, x, y) => { const dx = x - p0.x, dy = y - p0.y, d = Math.hypot(dx, dy), along = dx * Math.cos(h0) + dy * Math.sin(h0); if (d < near && along > 0.5 * d && (hitAt.get(id) ?? -1e9) < w.t - 20) { near = d; aim = { id, along, across: -dx * Math.sin(h0) + dy * Math.cos(h0) }; } };
      for (const a of w.actors) { if (a.player) continue; const q = poseOf(w, a); look(a.id, q.x, q.y); }
      for (const q of parkedPoses(w.course, w.parked)) if (Math.abs(q.x - p0.x) < 40 && Math.abs(q.y - p0.y) < 40) look(q.id, q.x, q.y);
      const inp = { steer: Math.max(-1, Math.min(1, aim ? (3 * aim.across) / Math.max(aim.along, 1) : holdLine(sc.me).steer)), slider: 1 };
      prev = { me: sc.me, world: w };
      sc.me = stepDriver(sc.me, inp, w, DT);
      w = step(withDriver(w, sc.me));
      const c = playerContact(w, sc.me);
      w = c.world;
      noticeTick(sc, prev, { me: sc.me, world: w, hit: c.hit, contact: c });
      contactTick(sc, c, w);
      w = withDriver(w, sc.me);
      ran++; ticks++;
      for (const f of c.fresh) { contacts++; kinds[f.kind] = (kinds[f.kind] ?? 0) + 1; }
      for (const q of c.solids) if (q.id) hitAt.set(q.id, w.t);
      for (const a of w.actors) if (a.crash?.with === "player") hitAt.set(a.id, w.t);
      /* What remains in contact after the response, more than a tick's closing could explain. */
      const p = driverPose(sc.me, w.course);
      for (const q of c.solids) if (touching(p, q)) deep++;
      /* Off the end of the map: put them back, as a person restarting. */
      if (sc.me.atEdge) { const again = playerOn(w.course, "art-n~0", "end") ?? me; sc.me = { ...again, damage: sc.me.damage, pull: sc.me.pull }; }
      stuck = (sc.me.v ?? 0) < 0.2 ? stuck + DT : 0;
      stuckWorst = Math.max(stuckWorst, stuck);
    }
  }
  check(ran === 2 * 240 / DT, `${ran} ticks ran with nothing stopping them`);
  check(contacts >= 4, `${contacts} contacts along the way (${JSON.stringify(kinds)})`);
  check(deep / ticks < 0.01, `left overlapping after the response on ${deep} of ${ticks} ticks`);
  console.log(`    longest standing with the throttle down: ${stuckWorst.toFixed(1)} s (signals and traffic stop them too; reported, not a floor)`);
}

console.log(failed ? `${failed} FAILURE(S)` : "OK: nobody is trapped, reverse is an ordinary control, and the drive goes on");
process.exit(failed ? 1 : 0);
