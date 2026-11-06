/* CONTACT IS AN EVENT AND A RESPONSE, NOT THE END OF THE DRIVE (DECISIONS 10.49, 10.52).
   Expectations are stated here, not read from the code: one event per touch, nothing driven
   through, nobody trapped with no reverse, struck from behind costs no fare and a person always
   costs, a letter arrives once and survives a reload, a world nobody touched is the same world.
   Sample: the soak is 2 seeds of 4 simulated minutes at 180 cars, a driver who never lifts. */
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

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };

const P = (x, y) => ({ x, y, z: 0 });
const m = emptyMap("contact");
m.bounds = { x: 0, y: 0, w: 4000, h: 400 };
m.roads.push(road({ id: "w", kind: "collector", lanes: 1, speed: 90, points: [P(0, 200), P(3000, 200)] }), road({ id: "e", kind: "collector", lanes: 1, speed: 90, points: [P(3000, 200), P(4000, 200)] }));
const loaded = loadMap(m);
const base = seedGraph(1, 50, loaded, { every: 1e9, target: 0, posted: true, trucks: 0, laneChanges: false, keepRight: false, brakeReaction: true });
const L = base.course.at[0].layout;
const route = Object.keys(L.paths).find((r) => L.legs[L.paths[r].from]?.road === "w" && L.paths[r].intent === "straight");
const carAt = (w, id, s, v = 0, n = 7) => ({ ...carFor(w, n, 0, route, null, "car"), id, n, s, v, v0: Math.max(v, 1) });
const playerHere = (s, v = 0, more = {}) => ({ ...playerAt(base.course, 0, route), s, v, a: 0, ...more });
/* One tick as the screen runs it. */
function tick(sc, w, inp) {
  sc.me = stepDriver(sc.me, inp, w, DT);
  w = step(withDriver(w, sc.me));
  const c = playerContact(w, sc.me);
  const hit = contactTick(sc, c, c.world);
  return { w: withDriver(c.world, sc.me), c, hit };
}
const scene = (me) => ({ me, args: [1], saveWallet: false });
/* A driver holding their line, against any pull, with their foot down. */
const wrapped = (a) => Math.atan2(Math.sin(a ?? 0), Math.cos(a ?? 0));   // psi counts whole turns
const holdLine = (me, slider = 1) => ({ steer: Math.max(-1, Math.min(1, -0.35 * (me.off ?? 0) - 1.2 * wrapped(me.psi))), slider });

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
const strike = (me, other) => {
  const w = withDriver({ ...base, t: 100, actors: [other], crashes: [] }, me);
  return playerContact(w, me);
};
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
  check(crossed >= 100 && agree === crossed, `what a car entered under is what the light said at the line: ${agree} of ${crossed}, ${onRed} of them on red`);
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
  const worst = {};
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
      if (freeAt == null) { const p = driverPose(sc.me, ww.course); console.log(`    trapped at ${deg}: ${q.id} s ${sc.me.s.toFixed(2)} off ${sc.me.off.toFixed(2)} psi ${sc.me.psi.toFixed(2)} v ${sc.me.v.toFixed(2)} damage ${(sc.me.damage ?? 0).toFixed(2)} ${Math.hypot(p.x - q.x, p.y - q.y).toFixed(1)} m away, atEdge ${!!sc.me.atEdge}, route ${sc.me.route}, k ${sc.me.k}, solids ${playerContact(ww, sc.me).solids.map((x) => x.id).join(",")}`); trapped++; worst[deg] = Infinity; } else worst[deg] = Math.max(worst[deg], freeAt - hitAt);
    }
  }
  check(cases >= 12 && trapped === 0 && Object.values(worst).every((x) => x <= TOW_AFTER), `nose on to a parked car at 20, 45, 70, 90 degrees, ${cases} cases: ${trapped} trapped; worst seconds to get clear by angle ${Object.entries(worst).map(([d, x]) => `${d}: ${x.toFixed(1)}`).join(", ")} (${(dead * DT).toFixed(0)} s of it with the car past going, scraping the row)`);
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
    if (d < INOPERABLE) check(hit && s0 - s1 > 3 && moved > 4, `${kmh} km/h, damage ${d.toFixed(2)}: back ${(s0 - s1).toFixed(1)} m, then forward ${moved.toFixed(1)} m`);
    else {
      check(hit && s0 === s1 && moved < 0.01, `${kmh} km/h, past the limit (${d.toFixed(2)}): goes neither way`);
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

console.log(failed ? `${failed} FAILURE(S)` : "OK: contact is an event and a response; the drive goes on");
process.exit(failed ? 1 : 0);
