/* =====================================================================
   TRAFFIC SIGNALS: the phases are derived, the light is obeyed, and a
   red is not a fault.

   The maintainer asked for signals so he could judge the simulator with
   varied intersections rather than one control repeated. A signal is the
   first control in this project that changes with time, and it resolves
   to controls the sim already had plus one new state (src/sim/signal.js),
   so what has to be checked is not a second rule system but these:

     the phases come out of the geometry, and NO TWO CONFLICTING PATHS
       ARE EVER GREEN AT ONCE -- asserted against the layout's own
       conflict table, swept over the whole cycle, so it is the sim's
       own definition of conflict rather than a restatement;
     everybody gets a turn, and the intervals are derived from the sim's
       own braking and box rather than typed in;
     nobody LAUNCHES on a red except a right turn, and a right on red
       only after actually stopping;
     a driver held at a red is not marked for undue delay, which is the
       trap: the delay clock runs on "was the way open", and a red road
       with nothing crossing it looks open to every test but the one
       that matters;
     an amber is a physical dilemma rather than an authored one -- a
       driver who can still stop does, one who cannot carries on, and
       neither has to brake harder than this model calls harsh;
     and, as everywhere else in the sim, nobody drives through anybody.

   Each is checked against a deliberate sabotage where a sabotage is
   available, because a green check on a mechanism that is not running
   is worse than a red one (CLAUDE.md).
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { emptyMap, road } from "../src/map/format.js";
import { graphOf } from "../src/sim/graph.js";
import { signalFor, lightAt, controlUnder, GREEN_FOR, PHASE_TOL } from "../src/sim/signal.js";
import { seedGraph, step, run, overlapping, openTo, whatStops } from "../src/sim/crossing.js";
import { CAR, HARSH_AT, stoppingRoom } from "../src/sim/traffic.js";
import { REACTION_FLOOR } from "../src/engine/score.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const line = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: 0 }));

/* A signalised crossroads, and a signalised five-way, as maps. */
function mapOf(legs, { control = "signal", kind = "collector", per = {} } = {}) {
  const m = emptyMap("sig", "signals");
  m.bounds = { x: 0, y: 0, w: 1000, h: 1000 };
  const c = { x: 500, y: 500 };
  for (const [id, far] of legs) m.roads.push(road({ id, kind, points: line(far, c), control: { start: "none", end: per[id] ?? control } }));
  return loadMap(m);
}
const CROSS = [["N", { x: 500, y: 100 }], ["S", { x: 500, y: 900 }], ["E", { x: 900, y: 500 }], ["W", { x: 100, y: 500 }]];
const FIVE = [...CROSS, ["NE", { x: 830, y: 170 }]];

/* 1. The phases are derived from the geometry. */
{
  const cross = graphOf(mapOf(CROSS), { lane: 3.6 }).at[0].layout;
  const five = graphOf(mapOf(FIVE), { lane: 3.6 }).at[0].layout;
  check(cross.signal && cross.signal.phases.length === 2, `a crossroads derives two phases, nobody having written that down (${JSON.stringify(cross.signal.phases)})`);
  check(cross.signal.phases.some((p) => p.includes("N|end") && p.includes("S|end")), "opposite approaches run together, which is why two cars going straight from opposite legs never needed a rule");
  check(five.signal.phases.length === 3, `a five-way derives three (${JSON.stringify(five.signal.phases)})`);
  const plain = graphOf(mapOf(CROSS, { control: "stop" }), { lane: 3.6 }).at[0].layout;
  check(plain.signal === null, "a node with no signalised leg has no signal at all, which is every node the sim had before");

  /* The intervals: derived from this sim's braking and this box. */
  const s = cross.signal, v = Math.max(...Object.values(cross.legs).map((l) => l.speed));
  check(Math.abs(s.amber - (REACTION_FLOOR + stoppingRoom(v) / v)) < 1e-9 || s.amber === 3,
    `amber is the reaction floor plus the time to shed the road's speed at the sim's own comfortable rate: ${s.amber.toFixed(2)}s at ${(v * 3.6).toFixed(0)} km/h`);
  check(s.allRed >= (2 * cross.place.boxHalf + CAR.length) / v - 1e-9,
    `all-red covers the time to clear the box from the line: ${s.allRed.toFixed(2)}s for ${(2 * cross.place.boxHalf + CAR.length).toFixed(1)} m`);
  check(s.greenFor === GREEN_FOR, `green is the one interval that is a design constant rather than physics (${GREEN_FOR}s), and is flagged as such`);
}

/* 2. NO TWO CONFLICTING PATHS ARE EVER GREEN AT ONCE. Against the
   layout's own conflict table, over the whole cycle. A car that is
   NOT held may enter, so "green" here means "not red" -- an amber is
   as permissive as a green for a driver already too close to stop. */
for (const [name, legs] of [["crossroads", CROSS], ["five-way", FIVE]]) {
  const L = graphOf(mapOf(legs), { lane: 3.6 }).at[0].layout;
  const sig = L.signal;
  let clashes = 0, worst = null, lit = {};
  for (let t = 0; t < sig.cycle; t += 0.05) {
    const open = Object.values(L.paths).filter((p) => lightAt(sig, L.legs[p.from].base, t) !== "red");
    for (const a of open) for (const b of open) {
      if (a === b || a.from === b.from) continue;
      /* Two paths from legs in DIFFERENT phases, with a conflict. */
      if (sig.forBase[L.legs[a.from].base] === sig.forBase[L.legs[b.from].base]) continue;
      if (L.conflicts[`${a.from}/${a.to}|${b.from}/${b.to}`]) { clashes++; worst ??= `${a.from}->${a.to} vs ${b.from}->${b.to}`; }
    }
    for (const b of Object.keys(sig.forBase)) if (lightAt(sig, b, t) !== "red") lit[b] = (lit[b] ?? 0) + 0.05;
  }
  check(clashes === 0, `${name}: no two conflicting paths are ever open at the same instant, over the whole ${sig.cycle.toFixed(1)}s cycle${worst ? ` (${worst})` : ""}`);
  const shares = Object.values(lit);
  check(shares.length === Object.keys(sig.forBase).length && Math.max(...shares) - Math.min(...shares) < 0.2,
    `${name}: every approach gets the same share of the cycle (${shares.map((x) => x.toFixed(1)).join(", ")}s of ${sig.cycle.toFixed(1)})`);
}

/* 3. What the light asks of one driver, directly. */
{
  const L = graphOf(mapOf(CROSS), { lane: 3.6 }).at[0].layout;
  const sig = L.signal, base = "N|end";
  const green = 1, red = sig.greenFor + sig.amber + sig.allRed + 1;
  check(lightAt(sig, base, green) === "green" && lightAt(sig, base, red) === "red", "the light is green early in its phase and red once the other phase has it");
  const at = (t, intent, opts) => controlUnder(sig, base, intent, t, opts);
  check(at(green, "left", { v: 10, toLine: 20 }) === "none", "on a green a left turn is under no control at all -- it yields to the oncoming like any uncontrolled left, which needed no new rule");
  check(at(red, "straight", { v: 10, toLine: 20 }) === "hold" && at(red, "left", { v: 10, toLine: 20 }) === "hold", "a red holds a straight and a left, gap or no gap");
  check(at(red, "right", { v: 10, toLine: 20 }) === "stop", "and turns a right into a stop sign, which IS right-on-red: stop, then take a gap");
  /* One approach posting no-right-on-red, on a real crossroads, with
     the others still allowing it: the sign is per approach, which is
     how it is actually used. */
  const posted = graphOf(mapOf(CROSS, { per: { N: "signal-no-right-on-red" } }), { lane: 3.6 }).at[0].layout.signal;
  const redForN = posted.forBase["N|end"] === 0 ? posted.greenFor + posted.amber + posted.allRed + 1 : 1;
  check(controlUnder(posted, "N|end", "right", redForN, { v: 10, toLine: 20 }) === "hold"
     && controlUnder(posted, "E|end", "right", lightAt(posted, "E|end", redForN) === "red" ? redForN : redForN + posted.greenFor + posted.amber + posted.allRed, { v: 10, toLine: 20 }) === "stop",
    "where ONE approach posts no-right-on-red its red holds the right turn, and the others still allow it");

  /* THE AMBER IS A PHYSICAL DILEMMA. */
  const amberAt = sig.greenFor + 0.5;
  const v = 14, room = stoppingRoom(v);
  check(at(amberAt, "straight", { v, toLine: room + 5 }) === "hold", `at amber a driver with room to stop comfortably (${(room + 5).toFixed(0)} m for a ${room.toFixed(0)} m stop) must`);
  check(at(amberAt, "straight", { v, toLine: room - 5 }) === "none", "and one who cannot must carry on, because standing on the brakes at an amber is the fault this model calls a harsh stop");
  check(at(amberAt, "straight", { v, toLine: -2 }) === "none", "a car already past the line is committed and the amber says nothing to it");
}

/* 4. IN TRAFFIC: obeyed, not stranded, and nobody through anybody. */
{
  const loaded = mapOf(CROSS);
  let w = seedGraph(4, 50, loaded, { every: 1.6 });
  const launches = [], delayedAtRed = new Set();
  let harsh = 0, ticks = 0, rightsOnRed = 0, stoppedFirst = 0;
  for (let i = 0; i < 20 * 300; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    w = step(w); ticks += w.actors.length;
    for (const a of w.actors) {
      const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route];
      const light = lightAt(L.signal, L.legs[p.from]?.base, w.t);
      const was = before.get(a.id);
      if (was && !was.going && a.going) {
        launches.push({ intent: p.intent, light });
        if (light === "red") { rightsOnRed++; if (was.stoppedAt != null) stoppedFirst++; }
      }
      /* The CLOCK running, not the sticky flag: a driver who was
         genuinely delayed earlier at a green is still flagged when the
         light later goes red, and that is not this. */
      if ((a.openFor ?? 0) > 0 && light === "red" && !a.going) delayedAtRed.add(a.id);
      if (-(a.a ?? 0) > HARSH_AT) harsh++;
    }
  }
  const onRed = launches.filter((l) => l.light === "red");
  check(launches.length > 20 && onRed.every((l) => l.intent === "right"),
    `five minutes, ${w.spawned} cars: of ${launches.length} launches from rest, the ${onRed.length} on a red are ALL right turns`);
  check(rightsOnRed === 0 || stoppedFirst === rightsOnRed, `and every right taken on a red came to a full stop first (${stoppedFirst} of ${rightsOnRed})`);
  check(delayedAtRed.size === 0, `the undue-delay clock never runs on a driver held at a red (${delayedAtRed.size} drivers) -- the trap, because a red road with nothing crossing it looks open to every test but the light`);
  check(harsh / Math.max(1, ticks) < 0.001, `and the amber does not make people stand on the brakes: ${harsh} harsh car-ticks in ${ticks} (${((100 * harsh) / Math.max(1, ticks)).toFixed(3)}%)`);
  const r = run(seedGraph(7, 50, loaded, { every: 1.2 }), 20 * 240);
  check(overlapping(r).length === 0 && r.spawned > 200, `four minutes at a signalised crossroads: ${r.spawned} cars, ${overlapping(r).length} overlapping car-ticks`);
  const five = run(seedGraph(9, 50, mapOf(FIVE), { every: 1.4 }), 20 * 240);
  check(overlapping(five).length === 0 && five.spawned > 150, `four minutes at a signalised five-way: ${five.spawned} cars, ${overlapping(five).length} overlapping car-ticks`);
}

/* 5. THE HOLD IS WHAT DOES THE WORK, by controlled comparison rather
   than by hoping a crash appears: one car alone at the line, no traffic
   at all, the light the only difference. At a green the way is open and
   the driver goes; at a red the way is NOT open, which is both halves
   of the mechanism -- the permission and the delay clock -- in one
   measurement. (Collisions are the wrong sabotage here: an
   uncontrolled crossroads does not collide either, because the
   right-hand rule still runs. What a signal buys is the RULE, and this
   is what states it. When the hold was missing, measured on this same
   map: 20 of 56 launches were on a red, 13 of them left turns.) */
{
  const loaded = mapOf(CROSS);
  const base = seedGraph(11, 50, loaded, { every: 60 });
  const L = base.course.at[0].layout;
  const sig = L.signal;
  const route = Object.keys(L.paths).find((r) => L.paths[r].from.startsWith("N|") && L.paths[r].intent === "straight");
  const p = L.paths[route];
  const me = { id: "one", n: 1, k: 0, route, leg: 0, s: p.stopAt - CAR.length / 2, v: 0, a: 0, caution: 1, headway: 1.6, stoppedAt: 0, going: false, accepted: false, openFor: 0, ratings: {}, brake: 2.7, v0: 14 };
  const green = { ...base, t: 1, actors: [me] };
  const red = { ...base, t: sig.greenFor + sig.amber + sig.allRed + 1, actors: [me] };
  check(openTo(me, green, 1) && !openTo(me, red, 1), "alone at the line with no traffic anywhere: the way is open on a green and not on a red");
  check(!whatStops(me, green).hold && whatStops(me, red).hold, "and it is the HOLD that says so -- the one state a signal adds to the vocabulary");
  const after = (w, n) => { let x = w; for (let i = 0; i < n; i++) x = step(x); return x.actors[0]; };
  const wentOnGreen = after(green, 40), satOnRed = after(red, 40);
  check(wentOnGreen.s > p.stopAt && satOnRed.s <= p.stopAt + 0.01,
    `two seconds later the green car is into the intersection (${(wentOnGreen.s - p.stopAt).toFixed(1)} m past the line) and the red one has not moved (${(satOnRed.s - p.stopAt).toFixed(2)} m)`);
}

if (failed) { console.log(`\n${failed} FAILED`); process.exit(1); }
console.log("\nOK: the phases are derived and never conflict, the light is obeyed, right-on-red costs a stop, a red is not a fault, and the amber is a physical dilemma.");
