/* CONTACT IS AN EVENT AND A RESPONSE, NOT THE END OF THE DRIVE (DECISIONS 10.49, 10.52).
   Expectations are stated here, not read from the code: one event per touch, nothing driven
   through, nobody trapped with no reverse, struck from behind costs no fare and a person always
   costs, a letter arrives once and survives a reload, a world nobody touched is the same world.
   Sample: section 3b is 90 s of the city's signals. SPLIT 11 November (DECISIONS 10.70): sections 9, 9b and 10 -- nobody trapped, reverse, the soak -- are verify-contact-escape.mjs, so a failure names which half it is. */
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

console.log("1. One event per touch, not one per tick");
{
  const sc = scene(playerHere(645, 5));   // near enough that the throttle has not built a speed that kills the car
  let w = withDriver({ ...base, actors: [{ ...carAt(base, "ahead", 660), crash: { t: 1e9, with: "x", at: P(0, 0) } }], crashes: [] }, sc.me);
  let events = 0, touchingTicks = 0;
  for (let i = 0; i < 15 / DT; i++) { const r = tick(sc, w, holdLine(sc.me)); w = r.w; if (r.hit) events += r.c.fresh.length; if (r.c.solids.length) touchingTicks++; }
  check(events === 1 && touchingTicks > 20, `throttle held against a wreck for 15 s: ${events} event over ${touchingTicks} ticks in contact`);
}
{
  /* Apart, and back: a second contact is a second event. */
  const sc = scene(playerHere(650, 5));
  let w = withDriver({ ...base, actors: [carAt(base, "ahead", 660)], crashes: [] }, sc.me);
  w = { ...w, actors: w.actors.map((a) => (a.id === "ahead" ? { ...a, crash: { t: 1e9, with: "x", at: P(0, 0) } } : a)) };
  let events = 0;
  for (let i = 0; i < 6 / DT; i++) { const r = tick(sc, w, holdLine(sc.me)); w = r.w; if (r.hit) events++; }
  sc.me = { ...sc.me, s: sc.me.s - 40 }; w = withDriver(w, sc.me);
  for (let i = 0; i < 25 / DT; i++) { const r = tick(sc, w, holdLine(sc.me, i * DT < 3 ? -1 : 1)); w = r.w; if (r.hit) events++; }
  check(events === 2, `backed away past the hold, and into it again: ${events} events`);
}

console.log("2. Nothing is driven through");
for (const kmh of [30, 60, 100]) {
  const sc = scene(playerHere(605, kmh / 3.6));   // 10 m out, so it arrives at about this speed
  let w = withDriver({ ...base, actors: [{ ...carAt(base, "ahead", 620), crash: { t: 1e9, with: "x", at: P(0, 0) } }], crashes: [] }, sc.me);
  let furthest = 0, touched = false;
  for (let i = 0; i < 12 / DT; i++) { const r = tick(sc, w, holdLine(sc.me)); w = r.w; furthest = Math.max(furthest, sc.me.s); if (r.c.solids.length) touched = true; }
  /* Two cars 4.5 m long touch with their centres about that far apart: the player's centre stays well behind the wreck's, by a stated 3 m. */
  check(touched && furthest < 620 - 3, `into a wreck dead ahead at ${kmh} km/h, throttle held: the player's centre got to ${furthest.toFixed(2)}, the wreck's at 620`);
}

console.log("3. Who was at fault, and what it costs");
{
  /* End to end: a player standing on the brake, rear-ended by the poor observers. */
  const posted = { ...base.road, speed: 25, kmh: 90, kind: "collector" };
  let struck = 0, wrong = 0;
  for (let n = 1; n <= 90; n++) {
    let w = { ...base, actors: [], crashes: [] };
    const who = driver(posted, 1, n, null, null, "car");
    const fol = { ...carFor(w, n, 0, route, null, "car"), ...who, id: "follower", n, s: 620, v: 14 };
    fol.v0 = Math.max(fol.v0, 17);
    let me = playerHere(700, 14), v = 14, s = 700;
    w = withDriver({ ...w, actors: [fol] }, me);
    for (let i = 0; i < 60 / DT; i++) {
      const a = i >= 40 / DT && v > 0 ? -8 : 0;
      v = Math.max(0, v + a * DT); s += v * DT;
      me = { ...me, s, v, a };
      w = step(withDriver(w, me));
      const c = playerContact(w, me);
      if (c.hit) { struck++; if (c.fresh.some((f) => f.atFault)) wrong++; break; }
    }
  }
  check(struck >= 10 && wrong === 0, `a player rear-ended as they braked: ${struck} of 90 struck, ${wrong} called their fault`);
}
{
  const me = playerHere(700, 0), behind = carAt(base, "b", 696.5, 10);
  const c = strike(me, behind), f = c.fresh[0];
  check(f && !f.atFault && Math.abs(f.closing - 10) < 0.01, `standing, struck from behind at 10 m/s: not at fault, closing ${f?.closing.toFixed(1)} m/s`);
  check(c.world.crashes.at(-1)?.striker === "b", `the crash records who struck whom (${c.world.crashes.at(-1)?.striker})`);
  const cutIn = strike({ ...me, laneAt: 99 }, behind).fresh[0];
  check(cutIn?.atFault, "the same strike one second after a lane change: at fault");
  const over = strike({ ...me, off: 1.4 }, behind).fresh[0];
  check(!over || over.atFault, "the same strike with the car out of its lane: at fault, where they touch at all");
  const into = strike(playerHere(700, 12), { ...carAt(base, "f", 703.5, 2) }).fresh[0];
  check(into?.atFault, "driving into the back of a slower car: at fault");
  const sideOn = strike(me, { ...carAt(base, "s", 702, 0) }).fresh[0];
  check(sideOn?.atFault, "a touch of a car ahead: at fault");
}
{
  /* The fare, through the same events the screen raises. */
  const course = base.course, me = playerHere(100, 5);
  const fare = (ids) => { let x = newMeter({ length: 2000, course, route: null, t: 0 }); x = meterTick(x, me, course, ids.map((id) => ({ id, t: 1, ...TRIGGERS[id] }))); return fareFor(x, 1); };
  const clean = fare([]);
  check(fare(["struckBy"]).total === clean.total && clean.total > 0 && fare(["struckBy"]).tip === clean.tip, `struck from behind: the fare and tip stand ($${fare(["struckBy"]).total} against $${clean.total})`);
  check(fare(["collision"]).total === 0, "a collision that was theirs: no fare");
  check(fare(["struckPerson"]).total === 0, "a person struck: no fare");
  const events = (hitOf) => detect({ me, world: base }, { me: { ...me, s: 100.1 }, world: base, hit: true, contact: hitOf }, { ...newEventState(), streakM: 500 });
  const by = events({ fresh: [{ kind: "car", atFault: false }] });
  check(by.events.some((e) => e.id === "struckBy") && !by.events.some((e) => e.id === "collision") && by.state.streakM >= 500, "struck from behind is said, and the streak stands");
  const mine = events({ fresh: [{ kind: "parked", atFault: true }] });
  check(mine.events.some((e) => e.id === "collision") && mine.state.streakM === 0, "a parked car hit is a collision, and the streak ends");
  const person = events({ fresh: [{ kind: "person", atFault: true }] });
  check(person.events.some((e) => e.id === "struckPerson") && person.state.streakM === 0, "a person struck is said as that, and the streak ends");
  const excused = detect({ me: { ...me, v: 0 }, world: base }, { me: { ...me, v: 0, shakenUntil: 1e9 }, world: base }, { ...newEventState(), dawdleSince: -100, boxFor: 100, crawlFor: 100 });
  check(!excused.events.some((e) => ["dawdling", "blockingBox", "underLimit"].includes(e.id)), "just hit, standing is not dawdling, blocking or crawling");
}
{
  /* The letters: being struck can never be a way to earn. */
  const notMine = lettersFor({ kind: "car", atFault: false }, 0.4), mine = lettersFor({ kind: "car", atFault: true }, 0.4);
  const sum = (l) => l.reduce((s, x) => s + x.amount, 0);
  check(sum(mine) < sum(notMine) && sum(notMine) < 0, `the same damage: $${sum(mine)} if it was theirs, $${sum(notMine)} if it was not`);
  check(notMine.some((l) => l.amount > 0) && !mine.some((l) => l.amount > 0), "only being struck pays out");
  const person = lettersFor({ kind: "person", atFault: true }, 0);
  check(sum(person) < sum(mine) && person[0].days > mine[0].days, `a person: $${sum(person)}, a day after a repair bill`);
}

console.log("3b. In an intersection: who owed whom, stated here case by case");
{
  /* A plain crossroads, its four legs read off, every case a straight car and a crossing one. */
  const map = TEST_MAPS.find((x) => x.id === "test-1").build();
  const lo = loadMap(map);
  const world = seedGraph(1, 50, lo, { every: 1e9, target: 0, posted: true });
  /* The first straight movement anywhere with a road crossing it and a left coming the other way. */
  const offBy = (L, a, b) => Math.abs(Math.sin(((L.legs[a].bearing - L.legs[b].bearing) * Math.PI) / 180));
  let k = -1, L, routes, paths, mine, from, others, crossing, oncomingLeft;
  for (let i = 0; i < world.course.at.length && k < 0; i++) {
    L = world.course.at[i].layout; paths = L.paths; routes = Object.keys(paths);
    for (const r of routes.filter((x) => paths[x].intent === "straight")) {
      from = paths[r].from;
      others = routes.filter((x) => paths[x].from !== from);
      crossing = others.find((x) => paths[x].intent === "straight" && offBy(L, paths[x].from, from) > 0.7);
      oncomingLeft = others.find((x) => paths[x].intent === "left" && offBy(L, paths[x].from, from) < 0.2 && Math.cos(((L.legs[paths[x].from].bearing - L.legs[from].bearing) * Math.PI) / 180) < 0);
      if (crossing && oncomingLeft && others.some((x) => paths[x].intent === "right")) { k = i; mine = r; break; }
    }
  }
  check(k >= 0, "a crossroads to hold it on");
  const me = (ctl, t = 10, rolled = false, route = mine) => ({ k, route, s: paths[route].stopAt + 3, entry: { k, t, ctl, rolled } });
  const them = (ctl, t = 10, rolled = false, route = crossing) => ({ k, route, s: paths[route].stopAt + 3, entry: { k, t, ctl, rolled } });
  const cases = [
    ["a car on red into a player on green", me("green"), them("red"), "other"],
    ["the player on red into a car on green", me("red"), them("green"), "player"],
    ["both on red", me("red"), them("red", 11), "other"],
    ["right on red into a player on green, the turn is what owes", me("green"), them("red", 10, false, others.find((r) => paths[r].intent === "right")), "other"],
    ["a car from a stop sign into a player with no sign", me("none"), them("stop"), "other"],
    ["a stop sign still owes, having entered first", me("none", 12), them("stop", 10), "other"],
    ["a yield sign still owes, having entered first", me("none", 12), them("yield", 10), "other"],
    ["a green entered first does not excuse a red", me("green", 12), them("red", 10), "other"],
    ["the player from a stop sign into a car with no sign", me("stop"), them("none"), "player"],
    ["a car from a yield sign into a player with no sign", me("none"), them("yield"), "other"],
    ["a stop rolled into a player who stopped, both signed", me("stop", 10, false), them("stop", 9, true), "other"],
    ["the player rolling a stop into a car that stopped", me("stop", 9, true), them("stop", 10, false), "player"],
    ["both stopped: entered second had somebody already in there", me("stop", 12), them("stop", 10), "player"],
    ["both stopped, the other way", me("stop", 10), them("stop", 12), "other"],
    ["a car turning left across a player going straight, both on green", me("green"), them("green", 10, false, oncomingLeft), "other"],
    ["the player turning left across a car going straight", me("green", 10, false, routes.find((r) => paths[r].from === paths[oncomingLeft].from && paths[r].intent === "left")), them("green", 10, false, routes.find((r) => paths[r].from === from && paths[r].intent === "straight")), "player"],
    ["on a fresh green, into a car clearing on amber", me("green", 12), them("amber", 10), "player"],
    ["a car late on amber into a player already in on green", me("green", 10), them("amber", 12), "other"],
  ];
  for (const [what, p, o, want] of cases) { const got = owedBy(p, o, L); check(got === want, `${what}: ${want === "other" ? "not the player's" : "the player's"}${got === want ? "" : ` (got ${got})`}`); }
  /* With no control at all, the right-hand rule: found by sabotage it had no test. Exactly one of the two owes,
     whichever is called the player, at equal times, and neither time can move it. */
  const a0 = me("none", 10), b0 = them("none", 10);
  const eachWay = (t1, t2) => [owedBy({ ...a0, entry: { ...a0.entry, t: t1 } }, { ...b0, entry: { ...b0.entry, t: t2 } }, L), owedBy({ ...b0, entry: { ...b0.entry, t: t2 } }, { ...a0, entry: { ...a0.entry, t: t1 } }, L)];
  const [ab, ba] = eachWay(10, 10);
  check(ab !== ba, `no control, crossing: one of the two owes, whichever is the player (${ab}, ${ba})`);
  check(eachWay(8, 12).join() === eachWay(12, 8).join() && eachWay(8, 12).join() === [ab, ba].join(), "and it is the right-hand rule, not who got there first");
  {
    const at = poseOnGraph(world.course, k, mine, paths[mine].stopAt - 5), h = (at.rot * Math.PI) / 180;
    const there = poseOnGraph(world.course, k, crossing, paths[crossing].stopAt - 5);
    /* The right of travel: forward turned a quarter clockwise on the screen, as the lamps are drawn. */
    const onMyRight = (there.x - at.x) * -Math.sin(h) + (there.y - at.y) * Math.cos(h) > 0;
    check(ab === (onMyRight ? "player" : "other"), `the car on the right has the road: the other car is on the player's ${onMyRight ? "right" : "left"}, and ${ab} owes`);
  }
  check(owedBy({ ...me("green"), s: 1e6 }, them("red"), L) === null, "past the intersection: not this rule");
  check(owedBy({ k, route: mine, s: 5 }, them("red"), L) === null, "the player not in it: not this rule");
  /* Through the whole contact: fault, the fare's event and the record agree. */
  const w2 = withDriver({ ...world, t: 100, actors: [{ ...carFor(world, 7, k, crossing, null, "car"), id: "runner", n: 7, s: 0, v: 9 }] }, me("green"));
  const place = playerAt(world.course, k, mine), s0 = paths[mine].conflictAt ?? paths[mine].stopAt + 8;
  void w2; void s0;
  let hitSeen = null;
  for (let s = paths[mine].stopAt; s < paths[mine].clearAt && !hitSeen; s += 0.5) {
    const pl = { ...place, s, v: 5, a: 0, off: 0, entry: { k, t: 95, ctl: "green", rolled: false } };
    const q = driverPose(pl, world.course);
    for (let s2 = paths[crossing].stopAt; s2 < paths[crossing].clearAt; s2 += 0.5) {
      const p2 = poseOnGraph(world.course, k, crossing, s2);
      if (Math.hypot(p2.x - q.x, p2.y - q.y) < 1.5) { hitSeen = { pl, s2 }; break; }
    }
  }
  const c = hitSeen && playerContact(withDriver({ ...world, t: 100, actors: [{ ...carFor(world, 7, k, crossing, null, "car"), id: "runner", n: 7, s: hitSeen.s2, v: 9, entry: { k, t: 98, ctl: "red", rolled: true } }], crashes: [] }, hitSeen.pl), hitSeen.pl);
  check(c && c.hit && !c.fresh[0].atFault && c.fresh[0].why === "right of way" && c.world.crashes.at(-1)?.striker === "runner", "a red-runner into the player's side, through the whole contact: not at fault, and the record says who struck whom");
  const cFlip = hitSeen && playerContact(withDriver({ ...world, t: 100, actors: [{ ...carFor(world, 7, k, crossing, null, "car"), id: "runner", n: 7, s: hitSeen.s2, v: 9, entry: { k, t: 90, ctl: "green", rolled: false } }], crashes: [] }, { ...hitSeen.pl, entry: { k, t: 98, ctl: "red", rolled: true } }), { ...hitSeen.pl, entry: { k, t: 98, ctl: "red", rolled: true } });
  check(cFlip && cFlip.hit && cFlip.fresh[0].atFault, "the same contact with the player the one on red: at fault");
  /* A car changing lane into a player holding theirs. */
  const cut = strike(playerHere(700, 8), { ...carAt(base, "c", 701.5, 8), lc: { t0: 0, T: 3, L0: -1 } }).fresh[0];
  check(cut && !cut.atFault && cut.why === "cut in", "a car changing lane into them: not the player's");
  const cutBoth = strike(playerHere(700, 8, { laneAt: 99 }), { ...carAt(base, "c", 701.5, 8), lc: { t0: 0, T: 3, L0: -1 } }).fresh[0];
  check(cutBoth && cutBoth.atFault, "...unless the player has just changed lane too");
}
{
  /* The record is what the light actually said, read here as the car crossed: on real traffic. */
  const lo = loadMap(TEST_MAPS.find((x) => x.id === "test-1").build());
  let w = seedGraph(2, 50, lo, { target: 120, posted: true });
  let crossed = 0, agree = 0, onRed = 0;
  for (let i = 0; i < 90 / DT; i++) {
    const was = new Map(w.actors.map((a) => [a.id, a])), t0 = w.t, lights = w.lights;
    w = step(w);
    for (const a of w.actors) {
      const b = was.get(a.id), L = w.course.at[a.k ?? 0].layout, q = L.paths[a.route];
      if (!b || b.k !== a.k || !q || !L.signal || !(b.s <= q.stopAt && a.s > q.stopAt)) continue;
      crossed++;
      const lit = movementLight(L.signal, L.legs[q.from]?.base, q.intent, t0, lights?.[a.k ?? 0]?.live ?? null);
      if (lit === "red") onRed++;
      if (a.entry?.ctl === lit && a.entry?.k === (a.k ?? 0) && a.entry?.t === t0) agree++;
    }
  }
  /* SPLIT (11 November, DECISIONS 10.70): one line said only that something was short. Codex's +11 failure read "99 of 99 correct, requires at
     least 100"; the floor is the check's own and is unchanged, and a count short of it is an exposure failure, not a disagreement. */
  check(crossed >= 100, `the case arose (light): ${crossed} cars crossed a signalled line in 90 s, ${onRed} of them on red (floor 100, the check's own)`);
  check(agree === crossed, `what a car entered under is what the light said at the line: ${agree} of ${crossed}${crossed === 0 ? " -- NOTHING CROSSED, so this says nothing" : ""}`);
}

console.log("4. A person: a critical error, no respawn, and the drive goes on");
{
  let w = seedGraph(3, 50, loadMap(testPeds()), { target: 30, posted: true });
  let who = null;
  for (let i = 0; i < 6000 && !who; i++) { w = step(w); who = (w.peds ?? []).find((q) => q.state === "crossing" && q.u > 3) ?? null; }
  check(!!who, "somebody crosses");
  if (who) {
    const at = pedPose(w, who);
    let best = null;
    w.course.at.forEach((c, k) => { for (const [r, p] of Object.entries(c.layout.paths)) for (let s = 0; s < p.length; s += 1) { const q = poseOnGraph(w.course, k, r, s), d = Math.hypot(q.x - at.x, q.y - at.y); if (!best || d < best.d) best = { d, k, r, s, q }; } });
    const h = (best.q.rot * Math.PI) / 180;
    const me = { ...playerAt(w.course, best.k, best.r), s: best.s, off: -(at.x - best.q.x) * Math.sin(h) + (at.y - best.q.y) * Math.cos(h), v: 8, a: 0 };
    const sc = scene(me);
    const c = playerContact(withDriver(w, me), me);
    check(c.hit && c.fresh[0].kind === "person" && c.fresh[0].atFault, "a car over somebody on foot: a person, at fault");
    check(c.world.peds.find((q) => q.id === who.id).state === "struck", "and they lie where they fell");
    check(playerContact(c.world, me).hit === false, "struck once, the same person is not struck again");
    contactTick(sc, c, c.world);
    check(sc.me.v === 8 && (sc.mailbox.items[0]?.kind === "hospital"), `the car is not stopped by it (${sc.me.v} m/s), and a hospital bill is posted`);
  }
}

console.log("5. Damage");
{
  const fresh = playerHere(100, 0);
  const closing = (v) => afterContact(playerHere(700, v), { fresh: [{ kind: "car", id: "x", closing: v, atFault: true }], solids: [] }, base).me.damage;
  check(closing(2) < 0.05 && closing(10) > 0.2 && closing(10) < 0.6 && closing(17) >= INOPERABLE, `by closing speed: ${closing(2).toFixed(3)} at 7 km/h, ${closing(10).toFixed(2)} at 36, ${closing(17).toFixed(2)} at 61`);
  const run = (me, steer, slider, secs) => { let w = withDriver({ ...base, actors: [], crashes: [] }, me); for (let i = 0; i < secs / DT; i++) { me = stepDriver(me, { steer, slider }, w, DT); w = withDriver(w, me); } return me; };
  const whole = run({ ...fresh }, 0, 1, 30), hurt = run({ ...fresh, damage: 0.5, pull: 1 }, 0, 1, 30);
  check(hurt.v < whole.v * 0.7, `at half damage, full throttle for 30 s: ${(hurt.v * 3.6).toFixed(0)} km/h against ${(whole.v * 3.6).toFixed(0)}`);
  check(Math.abs(hurt.off - fresh.off) > 1 && Math.abs(whole.off - fresh.off) < 0.01, `hands still, the damaged car pulls ${(hurt.off - fresh.off).toFixed(1)} m, the whole one ${(whole.off - fresh.off).toFixed(2)}`);
  const dead = run({ ...playerHere(100, 12), damage: INOPERABLE, pull: 1 }, 0, 1, 20);
  check(dead.v < 0.1, `past the limit, the throttle does nothing: ${dead.v.toFixed(2)} m/s after 20 s`);
  let me = { ...dead }, towed = false, secs = 0;
  while (!towed && secs < 200) { const r = towTick(me); me = r.me; towed = r.towed; secs += DT; }
  check(towed && Math.abs(secs - TOW_AFTER) < 1 && me.damage < INOPERABLE && me.s === dead.s, `standing ${secs.toFixed(0)} s, and going again where it stood, damaged`);
  check(run({ ...me, v: 0 }, 0, 1, 10).v > 5, "and it drives");
  check(V_MAX > 30, `(a whole car's top is ${V_MAX} m/s)`);
}

console.log("6. A world nobody touched is the same world");
{
  const me = playerHere(100, 5);
  const w = withDriver({ ...base, actors: [carAt(base, "far", 800)], crashes: [] }, me);
  const c = playerContact(w, me);
  check(c.world === w && !c.hit, "no contact: the same object back, and nothing on it");
  const r = afterContact(me, c, w);
  check(r.me === me && r.letters.length === 0, "and the player the same player");
}

console.log("7. The mail");
{
  let box = post(newMailbox(), { kind: "repair", title: "t", amount: -100, days: 1, text: "" }, 0);
  let got = 0, first = null;
  for (let t = 0; t < 3 * MAIL_DAY; t += 1) { const r = mailTick(box, 1); box = r.box; if (r.arrived.length) { got += r.arrived.length; first ??= t + 1; } }
  check(got === 1 && first === MAIL_DAY, `arrives once, ${first} s of driving on`);
  /* A repeat shows only when a later letter arrives: found by sabotage, one letter passed it. */
  let two = post(post(newMailbox(), { kind: "repair", title: "a", amount: -1, days: 1, text: "" }, 0), { kind: "hospital", title: "b", amount: -2, days: 2, text: "" }, 0);
  const each = [];
  for (let t = 0; t < 3 * MAIL_DAY; t += 1) { const r = mailTick(two, 1); two = r.box; for (const l of r.arrived) each.push(l.title); }
  check(each.join("") === "ab", `two letters on different days: each once, in order (${each.join(", ")})`);
  let b2 = post(newMailbox(), { kind: "hospital", title: "t", amount: -1, days: 2, text: "" }, 0);
  b2 = mailTick(b2, 100).box;
  await saveMailbox(b2);
  const back = await loadMailbox();
  check(back.driven === 100 && back.items.length === 1 && !back.items[0].arrived && back.items[0].dueAt === 2 * MAIL_DAY, "the clock and what is on its way survive a reload");
  /* On the wallet, and only when it arrives. */
  const sc = scene(playerHere(100, 0));
  sc.mailbox = post(newMailbox(), { kind: "repair", title: "Repair bill", amount: -100, days: 1, text: "" }, 0);
  const w = withDriver({ ...base, actors: [], crashes: [] }, sc.me);
  for (let i = 0; i < (MAIL_DAY - 1) / DT; i++) contactTick(sc, { hit: false, fresh: [], solids: [] }, w);
  check((sc.wallet?.balance ?? 0) === 0, "nothing taken before it arrives");
  for (let i = 0; i < 2 / DT; i++) contactTick(sc, { hit: false, fresh: [], solids: [] }, w);
  check(sc.wallet?.balance === -100 && /Repair bill/.test(sc.said?.text ?? ""), `taken when it does, and said: "${sc.said?.text}"`);
}

console.log("8. A player just hit is not honked at");
{
  const queued = (shaken) => {
    let w = { ...base, actors: [], crashes: [] };
    const me = playerHere(700, 0, shaken ? { shakenUntil: 1e9 } : {});
    const c = { ...carAt(w, "behind", 692, 0), caution: 1, stoppedAt: null };
    w = withDriver({ ...w, actors: [c] }, me);
    let honks = 0;
    for (let i = 0; i < 25 / DT; i++) { w = withDriver(step(w), me); if (w.actors.find((a) => a.id === "behind")?.honkTo === "player") honks++; }
    return honks;
  };
  const control = queued(false), hit = queued(true);
  check(control > 0 && hit === 0, `standing in a live lane, a car behind: honked at for ${control} ticks, and for ${hit} when just hit`);
}

console.log(failed ? `${failed} FAILURE(S)` : "OK: contact is an event and a response (sections 1-8; the escape and the soak are verify-contact-escape)");
process.exit(failed ? 1 : 0);
