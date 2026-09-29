/* =====================================================================
   PEDESTRIANS AND CROSSWALKS (SIMULATOR.md stage 6): what has to hold.

     1. A crosswalk is map data per road end. Where there is one, that
        approach's stop line stands its width further back and nothing
        else moves; it is drawn as bars across the road between the box
        and the line; the editor writes it and keeps it through a split;
        and the traffic waits clear of it.
     2. People walk them, stepping off only when every car could stop;
        the traffic yields to them on the half they hold (the near-half
        rule) and never touches them -- because it yields; waiting for
        them is never undue delay; a map without crosswalks is unchanged.
     3. The player's car against a person: found, struck, left lying where
        they fell and waited for by the traffic, then cleared.
     4. A mid-block crossing made with the editor's tool: a stop each way on
        a street with no side street, and it does its job -- everybody
        stops, people cross, nobody is touched.
     5. Drivers who look away can miss somebody on foot, and only they
        can: attentive drivers strike nobody; every strike is a recorded,
        drawn crash, by a driver who had just looked away.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { emptyMap, road, CROSSWALK_W } from "../src/map/format.js";
import { graphOf, junctionsOf } from "../src/sim/graph.js";
import { seedGraph, step, overlapping, pathOf, poseOf, openTo } from "../src/sim/crossing.js";
import { crosswalksOf, bandOn, heldAhead, pedAt, pedPose, strikePed, bandsAhead } from "../src/sim/peds.js";
import { TEST_MAPS, testPeds } from "../src/map/samples.js";
import { playerOn, stepDriver, withDriver, driverPose } from "../src/sim/drive.js";
import { holdAt } from "../src/sim/player.js";
import { REACTION_FLOOR } from "../src/core/perception.js";
import { walkedCrossroads, touching } from "./measure/peds.mjs";

import { lookingAway } from "../src/sim/attention.js";
import { DT, CAR } from "../src/sim/traffic.js";
import { setCrosswalk, splitRoad, addCrossing } from "../src/editor/model.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const P = (x, y) => ({ x, y, z: 0 });

/* A crossroads of collectors, stops on the north-south road. */
export function crossroads() {
  const m = emptyMap("peds");
  m.bounds = { x: 0, y: 0, w: 600, h: 600 };
  m.roads.push(
    road({ id: "w", points: [P(0, 300), P(300, 300)] }), road({ id: "e", points: [P(300, 300), P(600, 300)] }),
    road({ id: "n", points: [P(300, 0), P(300, 300)], control: { start: "none", end: "stop" } }),
    road({ id: "s", points: [P(300, 600), P(300, 300)], control: { start: "none", end: "stop" } }),
  );
  return m;
}

console.log("\n1. A CROSSWALK: MAP DATA, THE LINE MOVES BACK BY ITS WIDTH, NOTHING ELSE MOVES");
{
  const plain = crossroads(), walked = setCrosswalk(crossroads(), "s", "end", true);
  const g0 = graphOf(loadMap(plain), { lane: 3.6 }), g1 = graphOf(loadMap(walked), { lane: 3.6 });
  const L0 = g0.at.find((a) => !a.through).layout, L1 = g1.at.find((a) => !a.through).layout;
  let moved = 0, same = 0, wrong = 0;
  for (const [k, p] of Object.entries(L0.paths)) {
    const q = L1.paths[k];
    const fromS = L0.legs[p.from].road === "s";
    const d = p.stopAt - q.stopAt;
    if (fromS) (Math.abs(d - CROSSWALK_W) < 1e-6 ? moved++ : wrong++);
    else (Math.abs(d) < 1e-9 && Math.abs(p.length - q.length) < 1e-9 ? same++ : wrong++);
  }
  check(moved > 0 && same > 0 && wrong === 0, `the south approach's ${moved} paths stop ${CROSSWALK_W} m further back; the other ${same} are untouched (${wrong} wrong)`);
  const j = junctionsOf(g1)[0], j0 = junctionsOf(g0)[0];
  const bars = j.lines.filter((l) => l.kind === "zebra");
  const cw = j.crossings[0];
  check(j0.crossings.length === 0 && j.crossings.length === 1 && bars.length >= 5 && bars.every((b) => b.a.y > 300 && b.b.y > 300 && Math.max(b.a.y, b.b.y) - 300 <= cw.to + 0.01 && Math.min(b.a.y, b.b.y) - 300 >= cw.from - 0.01),
    `drawn as ${bars.length} bars across the south road, from ${cw?.from.toFixed(1)} to ${cw?.to.toFixed(1)} m out from the centre -- and nothing drawn without one`);
  /* The line is painted BEHIND the crosswalk, never on it. (Waiting cars
     stop about 1.8 m short of their line anyway, so where their noses are
     cannot tell a line on the paint from one behind it -- measured,
     tools/measure/cw-noses.mjs: the head car's nose at 11.0 m with the
     line at 9.25, on a crosswalk ending at 10.2.) */
  const lineS = Math.min(...Object.values(L1.legs).filter((l) => l.road === "s").map((l) => l.lineAt));
  check(lineS >= cw.to + 0.5, `the south stop line is ${lineS.toFixed(2)} m out, behind the crosswalk's outer edge at ${cw.to.toFixed(2)} -- without the shift it would lie on the paint`);
  const sp = splitRoad(walked, "s", 0, P(300, 450));
  check(walked.roads.find((r) => r.id === "s").crosswalk?.end === true && sp.map.roads.some((r) => r.crosswalk?.end === true),
    "the editor writes it at the end chosen, and a split keeps it with that end");
  let w = seedGraph(3, 50, loadMap(walked), { target: 40, posted: true });
  const Lw = w.course.at.find((a) => !a.through).layout;
  let over = 0, onIt = 0, waiting = 0;
  for (let i = 0; i < 180 / DT; i++) {
    w = step(w);
    if (i % 5 === 0) over += overlapping(w).length;
    for (const a of w.actors) {
      if (w.course.at[a.k].through) continue;
      const p = pathOf(w, a);
      if (Lw.legs[p.from]?.road !== "s" || a.v > 0.3 || a.going) continue;
      waiting++;
      /* The nose against the painted crosswalk, not against the line. */
      if (poseOf(w, a).y - 300 - CAR.length / 2 < cw.to - 0.05) onIt++;
    }
  }
  check(waiting > 100 && over === 0 && (w.crashes ?? []).length === 0 && onIt === 0, `three minutes of traffic: ${waiting} car-ticks waiting on the south approach, and none with its nose on the crosswalk (${onIt}), ${over} overlaps, ${(w.crashes ?? []).length} crashes`);
}

console.log("\n2. PEOPLE WALK THE CROSSWALKS, AND THE TRAFFIC YIELDS TO THEM -- ON THE HALF THEY HOLD");
{
  const run = (ctl, seed, ignorePeds = false) => {
    let w = { ...seedGraph(seed, 50, loadMap(walkedCrossroads(ctl)), { target: 40, posted: true }), ...(ignorePeds ? { ignorePeds } : {}) };
    const cws = crosswalksOf(w.course);
    const L = w.course.at.find((a) => !a.through).layout;
    const out = { crossed: 0, touch: 0, over: 0, longest: 0, otherHalf: 0, delayed: 0 };
    for (let i = 0; i < 240 / DT; i++) {
      const before = new Map((w.peds ?? []).map((q) => [q.id, q]));
      const cars = new Map(w.actors.map((a) => [a.id, a]));
      w = step(w);
      const now = new Set((w.peds ?? []).map((q) => q.id));
      for (const [id, q] of before) if (!now.has(id) && q.state === "crossing") out.crossed++;
      for (const q of w.peds ?? []) if (q.state === "waiting") out.longest = Math.max(out.longest, w.t - q.since);
      if (i % 5 === 0) { out.touch += touching(w).length; out.over += overlapping(w).length; }
      /* A car driving over a crosswalk while somebody is on the OTHER half
         of it: the near-half rule letting a driver go, which a rule holding
         the whole crosswalk never would. */
      for (const a of w.actors) {
        const was = cars.get(a.id);
        if (!was || was.k !== a.k || w.course.at[a.k].through) continue;
        const path = L.paths[a.route];
        for (const cw of cws) {
          const band = bandOn(path, cw);
          if (!band || !(was.s < band.s && a.s >= band.s)) continue;
          if ((w.peds ?? []).some((q) => q.cw === cw.i && q.state === "crossing")) out.otherHalf++;
        }
        /* Waiting for somebody on foot is never undue delay. */
        if (!w.ignorePeds && a.v < 0.3 && heldAhead(w, a, path) && openTo(a, w, 1)) out.delayed++;
      }
    }
    out.crashes = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length;
    out.crashesWithPeds = (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-")).length;
    return out;
  };
  const stop = run("stop", 3), none = run("none", 5), blind = run("stop", 3, true);
  check(stop.crossed >= 20 && none.crossed >= 20 && Math.max(stop.longest, none.longest) < 60,
    `four minutes each: ${stop.crossed} people across at the all-way stop and ${none.crossed} at the uncontrolled crossroads, nobody waiting at the curb longer than ${Math.max(stop.longest, none.longest).toFixed(1)} s`);
  check(stop.touch === 0 && none.touch === 0 && stop.over === 0 && none.over === 0 && stop.crashes === 0 && none.crashes === 0,
    "no car touches anybody on foot, and no car touches another car");
  /* A contact is a strike now, recorded the tick it happens (peds.js
     `strikes`), so the comparison counts strikes -- and holds that every
     one of them is recorded and drawn, never a car inside a person. */
  const blindStruck = blind.crashesWithPeds;
  check(blindStruck > 0 && blind.touch === 0, `and it is the yielding doing it: the same traffic with drivers told to ignore people on foot strikes ${blindStruck} of them -- every one a recorded crash, the person lying where they fell, never a car silently inside somebody`);
  check(stop.crashesWithPeds === 0 && none.crashesWithPeds === 0, "while drivers who yield strike nobody");
  check(stop.otherHalf + none.otherHalf > 0, `the near-half rule: ${stop.otherHalf + none.otherHalf} times a car crossed a crosswalk while somebody was still on its other half`);
  check(stop.delayed + none.delayed === 0, "and a driver waiting for somebody on foot is never counted as delaying");
  let w = seedGraph(3, 50, loadMap(crossroads()), { target: 40, posted: true });
  for (let i = 0; i < 400; i++) w = step(w);
  check(!("peds" in w), "a map with no crosswalk has nobody on foot and its world carries nothing new");
}

console.log("\n3. THE PLAYER'S CAR AGAINST A PERSON: FOUND, STRUCK, LEFT WHERE THEY FELL, WAITED FOR, CLEARED");
{
  let w = seedGraph(3, 50, loadMap(walkedCrossroads("stop")), { target: 20, posted: true });
  let who = null;
  for (let i = 0; i < 4000 && !who; i++) { w = step(w); who = (w.peds ?? []).find((q) => q.state === "crossing" && q.u > 3) ?? null; }
  const at = pedPose(w, who);
  const car = { x: at.x + 1.0, y: at.y, heading: 0 };
  const found = pedAt(w, car), missed = pedAt(w, { x: at.x + 6, y: at.y, heading: 0 });
  check(found === who.id && missed === null, "a car standing over somebody finds them, and one six metres off finds nobody");
  w = strikePed(w, who.id);
  const cw = crosswalksOf(w.course)[who.cw];
  const L = w.course.at.find((a) => !a.through).layout;
  const crossing = Object.values(L.paths).filter((pa) => bandOn(pa, cw));
  const before = pedPose(w, w.peds.find((q) => q.id === who.id));
  for (let i = 0; i < 20 / DT; i++) w = step(w);
  const lying = w.peds.find((q) => q.id === who.id);
  const still = lying && Math.hypot(pedPose(w, lying).x - before.x, pedPose(w, lying).y - before.y) < 1e-9;
  const waited = crossing.every((pa) => heldAhead(w, { k: cw.k, s: 0 }, pa) != null);
  check(lying?.state === "struck" && still && waited, `twenty seconds on they are still where they fell, and every one of the ${crossing.length} paths over that crosswalk is held for them`);
  for (let i = 0; i < 30 / DT; i++) w = step(w);
  check(!w.peds.some((q) => q.id === who.id), "and after the time a wreck stands, they are cleared");
}

console.log("\n4. A MID-BLOCK CROSSING, MADE WITH THE EDITOR'S TOOL: A STOP EACH WAY SERVING ONLY A CROSSWALK (the maintainer's ruling)");
{
  const m = emptyMap("mid");
  m.bounds = { x: 0, y: 0, w: 600, h: 200 };
  m.roads.push(road({ id: "street", kind: "residential", points: [P(0, 100), P(200, 100), P(400, 100), P(600, 100)] }));
  const { map, ids } = addCrossing(m, "street", P(310, 104));
  const L = loadMap(map);
  const node = L.nodes.find((n) => n.legs.length === 2);
  const stops = (map.signs ?? []).filter((q) => q.kind === "stop").length;
  check(ids.length === 2 && node && Math.abs(node.at.x - 310) < 0.01 && Math.abs(node.at.y - 100) < 0.01 && stops === 2 && map.roads.find((r) => r.id === ids[0]).crosswalk?.end === true,
    "one tap on a street splits it where it was tapped, puts a stop sign on both new approaches and a crosswalk between them -- a node with no side street");
  let w = seedGraph(3, 50, L, { target: 20, posted: true });
  let over = 0, stopped = 0, rolled = 0, crossed = 0, touch = 0;
  for (let i = 0; i < 240 / DT; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a])), people = new Map((w.peds ?? []).map((q) => [q.id, q]));
    w = step(w);
    for (const a of w.actors) {
      const was = before.get(a.id);
      if (!was || was.route !== a.route) continue;
      const pa = w.course.at[a.k].layout.paths[a.route];
      if (was.s < pa.stopAt && a.s >= pa.stopAt) (a.stoppedAt != null ? stopped++ : rolled++);
    }
    const now = new Set((w.peds ?? []).map((q) => q.id));
    for (const [id, q] of people) if (!now.has(id) && q.state === "crossing") crossed++;
    if (i % 5 === 0) { over += overlapping(w).length; touch += touching(w).length; }
  }
  check(stopped > 20 && crossed > 0 && touch === 0 && over === 0 && (w.crashes ?? []).length === 0,
    `four minutes: ${stopped} cars over the line having stopped (${rolled} without -- rolling stops are drivers' own), ${crossed} people across, no car touches anybody or anything`);
}

console.log("\n5. DRIVERS WHO LOOK AWAY CAN MISS SOMEBODY ON FOOT -- AND ONLY THEY: EVERY STRIKE RECORDED, NONE BY A DRIVER WHO WAS LOOKING");
{
  /* The Pedestrians test map: two crossroads and a mid-block crossing,
     60 cars. Ten minutes a seed. */
  const run = (seed, perceive) => {
    /* Everybody careful: this section is about what drivers see, not about
       people taking risks (section 6). */
    let w = seedGraph(seed, 50, loadMap(testPeds()), { target: 60, posted: true, perceive, pedRisk: { trusting: 0, heedless: 0 }, gapHeedless: 0 });
    let silent = 0, across = 0, unexplained = 0;
    const lastAway = new Map();
    let seenCrash = 0;
    for (let i = 0; i < 600 / DT; i++) {
      const before = new Map((w.peds ?? []).map((q) => [q.id, q]));
      w = step(w);
      for (const a of w.actors) if (lookingAway(w.t, a) > 0) lastAway.set(a.id, w.t);
      const now = new Set((w.peds ?? []).map((q) => q.id));
      for (const [id, q] of before) if (!now.has(id) && q.state === "crossing") across++;
      silent += touching(w).length;
      for (const c of (w.crashes ?? []).slice(seenCrash)) if (String(c.a).startsWith("ped-") && !(lastAway.has(c.b) && w.t - lastAway.get(c.b) < 3)) unexplained++;
      seenCrash = (w.crashes ?? []).length;
    }
    const struck = (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-")).length;
    return { across, silent, struck, unexplained, crashes: (w.crashes ?? []).length };
  };
  const off = [3, 5, 7].map((seed) => run(seed, false)), on = [3, 5, 7].map((seed) => run(seed, true));
  const sum = (xs, f) => xs.reduce((q, x) => q + x[f], 0);
  check(sum(off, "struck") === 0 && sum(off, "crashes") === 0 && sum(off, "silent") === 0 && sum(off, "across") > 400,
    `half an hour with drivers watching the road: ${sum(off, "across")} people across, nobody struck, no crash of any kind`);
  /* Counted, and said as it is: people on foot rarely step out when a
     car could not stop, so a driver's glance seldom costs anybody -- the
     axis's expression against pedestrians is thin, and that is the
     finding, not a pass. What is held: nothing silent, and nothing struck
     by a driver who was watching. */
  check(sum(on, "silent") === 0 && sum(on, "unexplained") === 0,
    `with drivers looking away now and then: ${sum(on, "struck")} people struck in half an hour (${sum(on, "across")} across) -- nothing silent, and no strike by a driver who had not just looked away`);
}

console.log("\n6. FAIRNESS IS OWED TO THE PLAYER, NOT TO THE SIMULATION (the maintainer's ruling, 29 September)");
{
  /* (a) Careful people are never struck by drivers who are watching --
     on the Pedestrians map and on the city, mid-block walkers included. */
  const careful = { pedRisk: { trusting: 0, heedless: 0 }, gapHeedless: 0 };
  let carefulStruck = 0, walked = 0;
  for (const [raw, cars, seed] of [[testPeds(), 60, 3], [TEST_MAPS.find((t) => t.id === "city").build(), 300, 5]]) {
    let w = seedGraph(seed, 50, loadMap(raw), { target: cars, posted: true, ...careful });
    const seen = new Set();
    for (let i = 0; i < 300 / DT; i++) { w = step(w); for (const q of w.peds ?? []) seen.add(q.id); }
    walked += seen.size;
    carefulStruck += (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-")).length;
  }
  check(walked > 100 && carefulStruck === 0, `with everybody on foot careful, ${walked} people over ten minutes on two maps and nobody struck by traffic that was watching`);

  /* (b) With people who take risks (the defaults), everybody struck is one
     of them, and every strike is recorded. */
  let byManner = {}, silent = 0;
  for (const seed of [3, 5, 7]) {
    let w = seedGraph(seed, 50, loadMap(TEST_MAPS.find((t) => t.id === "city").build()), { target: 300, posted: true });
    const manner = new Map();
    for (let i = 0; i < 300 / DT; i++) { w = step(w); for (const q of w.peds ?? []) manner.set(q.id, q.manner); silent += touching(w).length; }
    for (const c of (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-"))) byManner[manner.get(c.a)] = (byManner[manner.get(c.a)] ?? 0) + 1;
  }
  const struck = Object.values(byManner).reduce((q, x) => q + x, 0);
  check(!byManner.careful && silent === 0, `fifteen minutes of the city with people who take risks: ${struck} struck (${JSON.stringify(byManner)}) -- none of them careful, every one a recorded crash`);

  /* (c) THE PLAYER. A street lined with parked cars and people darting out
     between them -- every mid-block walker heedless, ten times the usual
     rate. A player who responds -- a reaction floor after somebody is in
     their way, full brake -- never strikes anybody: a response always
     existed. The traffic on the same street, owed no such thing, does. */
  const street = () => {
    const m = emptyMap("dart");
    m.bounds = { x: 0, y: 0, w: 700, h: 200 };
    m.roads.push(road({ id: "a", kind: "residential", points: [P(0, 100), P(175, 100), P(350, 100)] }), road({ id: "b", kind: "residential", points: [P(350, 100), P(525, 100), P(700, 100)] }));
    return m;
  };
  const L = loadMap(street());
  let w = seedGraph(3, 50, L, { target: 8, posted: true, gapRate: 300, gapHeedless: 1 });
  let me = playerOn(w.course, "a", "end"), playerHits = 0, laps = 0, heldSince = null;
  const hitIds = new Set();
  for (let i = 0; i < 480 / DT; i++) {
    const path = pathOf(w, me);
    const held = heldAhead(w, { ...me, lag: 0 }, path);
    if (held && heldSince == null) heldSince = w.t;
    if (!held) heldSince = null;
    const braking = heldSince != null && w.t - heldSince >= REACTION_FLOOR;
    const slider = braking ? -1 : me.v < 11 ? 0.6 : holdAt(me.v, 0);
    me = stepDriver(me, { steer: 0, slider }, w, DT);
    w = step(withDriver(w, me));
    const hit = pedAt(w, driverPose(me, w.course));
    if (hit && !hitIds.has(hit)) { hitIds.add(hit); playerHits++; }
    /* Round again from the start at the far end. */
    const at = pathOf(w, me);
    if (!w.actors.some((a) => a.player) || (me.k !== 0 || at.length - me.s < 3) && driverPose(me, w.course).x > 650) { laps++; me = playerOn(w.course, "a", "end"); w = { ...w, actors: w.actors.filter((a) => !a.player) }; }
  }
  const npc = (w.crashes ?? []).filter((c) => String(c.a).startsWith("ped-")).length;

  /* (d) THE CASE ITSELF, set up rather than waited for: the player at 40
     km/h a few metres short of a mid-block crossing, and somebody heedless
     waiting there behind the parked row. No response exists, so they must
     not step out until the player is past; a car of the traffic in the same
     spot gets no such grace. */
  const probe = (asPlayer) => {
    let pw = seedGraph(1, 50, L, { target: 0, posted: true, gapRate: 0, gapHeedless: 1 });
    const car0 = playerOn(pw.course, "a", "end");
    const path = pathOf(pw, car0);
    const cws = crosswalksOf(pw.course);
    const ahead = bandsAhead(pw, car0.k, path).filter((e) => e.cw.kind === "gap" && e.s > 120).sort((x, y) => x.s - y.s)[0];
    const car = { ...car0, s: ahead.s - 1.5 - CAR.length / 2 - 7, v: 11, player: asPlayer, ...(asPlayer ? {} : { id: "npc-probe", n: 999, v0: 11 }) };
    pw = { ...pw, actors: [car], peds: [{ id: "ped-probe", n: 0, cw: ahead.cw.i, from: 0, u: 0, state: "waiting", since: 0, manner: "heedless" }] };
    let stepped = false, hit = false, me = car;
    for (let i = 0; i < 80; i++) {
      if (asPlayer) { me = stepDriver(me, { steer: 0, slider: holdAt(me.v, 0) }, pw, DT); pw = step(withDriver(pw, me)); if (pedAt(pw, driverPose(me, pw.course))) hit = true; }
      else { pw = step(pw); if ((pw.crashes ?? []).some((c) => c.a === "ped-probe")) hit = true; }
      const q = (pw.peds ?? []).find((x) => x.id === "ped-probe");
      if (q && q.state !== "waiting") stepped = stepped || { at: pw.t, carPast: asPlayer ? me.s + CAR.length / 2 > ahead.s + 1.5 : null };
    }
    return { stepped, hit };
  };
  const pl = probe(true), np = probe(false);
  check(!pl.hit && (!pl.stepped || pl.stepped.carPast), `somebody heedless waiting behind the parked row 7 m ahead of the player at 40 km/h stays put until the player is past (${pl.stepped ? "stepped out once it was clear" : "never stepped out"}), and is not struck`);
  check(np.stepped && np.hit, "the same person, the same place, a car of the traffic instead: they dart out and it strikes them");
  check(laps >= 2 && playerHits === 0, `eight minutes along a street of parked cars with people darting out, ${laps} runs end to end at 40 km/h: a player who responds in time never strikes anybody`);
  check(npc > 0, `while the traffic on the same street, owed no such fairness, struck ${npc}`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: a crosswalk moves only its own line and is drawn where it is; people walk it, the traffic yields on the half they hold and never touches them, waiting for them is never undue delay, and somebody the player hits lies where they fell and is waited for.");
process.exit(failed ? 1 : 0);
