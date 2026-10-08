/* =====================================================================
   VERIFY -- large vehicles (SIMULATOR.md, the shape of the world work, 1)

   The maintainer: "we still haven't put a single truck in the game as a
   visual/sizable obstacle". A truck is a row in the vehicle table
   (sim/traffic.js VEHICLES), read through `vehicleOf` everywhere a size
   or a performance figure is used -- never a special case.

     1. The table: a car's row IS the constants every car was built on;
        a truck is longer, wider, slower away, gentler on the brakes, and
        keeps to the limit. A world with no trucks has none.
     2. In traffic: trucks arrive from outside at about their share, pull
        away markedly slower than cars, never exceed the posted limit, and
        nobody overlaps one without it being a recorded crash.
     3. A long vehicle spans its path: front and rear both on it, so it
        cuts inside a turn and never swings its rear into the next lane.
     4. Its size is solid: the player touches a truck anywhere along its
        length, where a car-sized footprint would have missed.
     5. The amber is judged at the vehicle's own braking, and the next
        line is seen across the seam: no truck ends up over a red it
        could not stop for.

   Each mechanism sabotaged once to see this fail (29 September).
   Run: node tools/verify-trucks.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step, pathOf, layoutOf, poseOf, overlapping, strayOf, whatStops, rearOf, DT, TRUCK_SHARE, UNDUE_AT } from "../src/sim/crossing.js";
import { tallerThanEye, boxOf, eyeOf, blocked } from "../src/sim/sight.js";
import { emptyMap, road } from "../src/map/format.js";
import { joinedTo } from "../src/sim/course.js";
import { poseAt } from "../src/sim/intersection.js";
import { poseOnGraph, postedAt } from "../src/sim/graph.js";
import { VEHICLES, vehicleOf, CAR, ACCEL, MOST_BRAKE, lenOf, driver } from "../src/sim/traffic.js";
import { controlUnder, movementLight } from "../src/sim/signal.js";
import { touching } from "../src/sim/player.js";

let failed = 0;
const check = (ok, msg) => { console.log(`  ${ok ? "ok  " : "FAIL:"} ${msg}`); if (!ok) failed++; };
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());

console.log("\n1. THE TABLE");
{
  const c = VEHICLES.car, t = VEHICLES.truck;
  check(c.length === CAR.length && c.width === CAR.width && c.accel === ACCEL && c.most === MOST_BRAKE && c.cap === Infinity,
    "a car's row is the constants every car was built on, so a world of cars is the world it was");
  check(t.length > c.length && t.width > c.width && t.accel < c.accel && t.brake < c.brake && t.most < c.most && t.cap === 1,
    `a truck is ${t.length} x ${t.width} m, pulls away at ${t.accel} m/s2 against ${c.accel}, plans on ${t.brake} and stops at most at ${t.most} against ${c.brake} and ${c.most}, and keeps to the limit`);
  let w = seedGraph(3, 50, city, { target: 150, posted: true, trucks: 0 });
  let any = 0;
  for (let i = 0; i < 60 / DT; i++) { w = step(w); if (w.actors.some((a) => a.kind === "truck")) any++; }
  check(any === 0, "with the share at zero, no truck ever appears");
}

console.log("\n2. IN TRAFFIC");
{
  const pull = { car: [], truck: [] };
  let arrivals = 0, trucks = 0, overLimit = 0, truckTicks = 0, silent = 0, redRun = 0;
  const truckCrashes = [];
  for (const seed of [3, 5]) {
    let w = seedGraph(seed, 50, city, { target: 200, posted: true });
    const seen = new Set(), from = new Map(), over = new Set();
    for (let i = 0; i < 300 / DT; i++) {
      w = step(w);
      for (const a of w.actors) {
        if (a.player || a.crash) continue;
        if (!seen.has(a.id)) { seen.add(a.id); if (!a.fromCurb && !a.home) { arrivals++; if (a.kind === "truck") trucks++; } }
        const k = a.kind === "truck" ? "truck" : "car";
        if (a.v < 0.05) from.set(a.id, w.t);
        else if (from.has(a.id) && a.v > 30 / 3.6) { pull[k].push(w.t - from.get(a.id)); from.delete(a.id); }
        if (k !== "truck") continue;
        truckTicks++;
        const lim = postedAt(w.course, a.k, a.route);
        if (lim && a.v > lim * 1.02) overLimit++;
        /* Over a red: nose past the line under a red, not committed on
           the amber -- the thing a truck judging by a car's braking did. */
        const L = layoutOf(w, a), p = pathOf(w, a);
        if (L.signal && !a.amberGo && movementLight(L.signal, L.legs[p.from]?.base, p.intent, w.t, w.lights?.[a.k ?? 0]?.live) === "red" && p.intent !== "right"
          && a.s + lenOf(a) / 2 > p.stopAt + 0.5 && a.s - lenOf(a) / 2 < p.stopAt && a.v > 0.5 && !over.has(a.id + a.k)) { over.add(a.id + a.k); redRun++; }
      }
      if (i % 5 === 0) {
        const byId = new Map(w.actors.map((x) => [x.id, x]));
        for (const o of overlapping(w)) if ([o.a, o.b].some((id) => byId.get(id)?.kind === "truck") && !(byId.get(o.a)?.crash && byId.get(o.b)?.crash)) silent++;
      }
    }
    const byId = new Map(w.actors.map((x) => [x.id, x]));
    for (const c of w.crashes ?? []) if ([c.a, c.b].some((id) => byId.get(id)?.kind === "truck")) truckCrashes.push(c);
  }
  const med = (xs) => { const q = [...xs].sort((x, y) => x - y); return q[q.length >> 1]; };
  const share = trucks / Math.max(1, arrivals);
  check(trucks >= 10 && Math.abs(share - TRUCK_SHARE) < 0.04, `${trucks} of ${arrivals} arrivals from outside were trucks (${(100 * share).toFixed(1)}%, against a share of ${100 * TRUCK_SHARE}%)`);
  check(pull.truck.length >= 10 && med(pull.truck) > 1.5 * med(pull.car),
    `from rest to 30 km/h: trucks ${med(pull.truck).toFixed(1)} s (${pull.truck.length}), cars ${med(pull.car).toFixed(1)} s (${pull.car.length})`);
  check(truckTicks > 2000 && overLimit === 0, `trucks over the posted limit in ${overLimit} of ${truckTicks} ticks`);
  check(silent === 0, "nobody overlaps a truck without it being a recorded crash");
  check(redRun === 0, `no truck ends up over a red it could not stop for (${redRun}) -- the amber judged at its own braking, the next line seen across the seam`);
  console.log(`   (crashes involving a truck in ten minutes of the city at 200 cars: ${truckCrashes.length})`);
}

console.log("\n3. A LONG VEHICLE SPANS ITS PATH");
{
  let w = seedGraph(3, 50, city, { target: 200, posted: true, trucks: 0.3 });
  let worst = 0, turning = 0;
  for (let i = 0; i < 180 / DT; i++) {
    w = step(w);
    if (i % 4) continue;
    for (const a of w.actors) {
      if (a.kind !== "truck" || a.lc || a.crash) continue;
      const p = pathOf(w, a), q = poseOf(w, a), half = lenOf(a) / 2;
      if (a.s - half < 0 || a.s + half > p.length || p.intent === "straight") continue;
      if (a.s + half < p.stopAt || a.s - half > p.clearAt) continue;
      turning++;
      const h = (q.rot * Math.PI) / 180;
      /* Each end's distance to the PATH (the nearest point on it, searched
         along it), less this driver's own stray from their line (the
         weave, the wide line). A body facing along the arc at its centre
         puts the rear 1.9 m off it 25 degrees into a right turn. */
      for (const sgn of [1, -1]) {
        const end = { x: q.x + sgn * Math.cos(h) * half, y: q.y + sgn * Math.sin(h) * half };
        let near = Infinity;
        for (let s = a.s + sgn * half - 3; s <= a.s + sgn * half + 3; s += 0.05) {
          const on = poseOnGraph(w.course, a.k, a.route, Math.max(0, Math.min(p.length, s)));
          near = Math.min(near, Math.hypot(end.x - on.x, end.y - on.y));
        }
        worst = Math.max(worst, near - Math.abs(strayOf(w, a)) - 0.05);
      }
    }
  }
  check(turning > 50 && worst < 0.05, `over ${turning} truck positions in a turn, front and rear are on the path to within ${Math.max(0, worst).toFixed(2)} m -- the rear follows the lane, it does not swing out`);
}

console.log("\n4. ITS SIZE IS SOLID");
{
  const truck = { x: 0, y: 0, z: 0, heading: 0, length: VEHICLES.truck.length, width: VEHICLES.truck.width };
  /* A car nose to tail with the truck's rear, 6 m behind its centre. */
  const behind = { x: -6.2, y: 0, z: 0, heading: 0 };
  const beside = { x: -3.5, y: 2.1, z: 0, heading: 0 };
  const clear = { x: -7.5, y: 0, z: 0, heading: 0 };
  check(touching(behind, truck) && touching(beside, truck) && !touching(clear, truck),
    "the player touches a truck at its rear and alongside its box, where a car-sized footprint would have missed, and not a car length clear of it");
}

console.log("\n5. THE AMBER AT ITS OWN BRAKING");
{
  let L = null;
  for (const at of seedGraph(1, 50, city, { target: 0, posted: true }).course.at) if (at.layout.signal) { L = at.layout; break; }
  const sig = L.signal, base = Object.values(L.legs).map((g) => g.base).find(Boolean);
  let t = 0;
  while (t < 300 && movementLight(sig, base, "straight", t) !== "amber") t += 0.05;
  /* 14 m/s, 40 m from the line: a car stops comfortably in 36 m, a truck needs 49. */
  const car = controlUnder(sig, base, "straight", t, { v: 14, toLine: 40, brake: VEHICLES.car.brake });
  const trk = controlUnder(sig, base, "straight", t, { v: 14, toLine: 40, brake: VEHICLES.truck.brake });
  check(movementLight(sig, base, "straight", t) === "amber" && car === "hold" && trk === "none",
    `at an amber, 40 m out at 50 km/h: a car stops (${car}), a truck, which cannot stop comfortably there, goes on (${trk})`);
}

console.log("\n6. THE NEXT LINE, SEEN ACROSS THE SEAM -- SET UP RATHER THAN WAITED FOR");
{
  /* The occasion that found it, rebuilt on purpose: a truck at 58 km/h
     crossing the seam into a signalled intersection whose line is a short
     way past it, under a red that lasts. Waiting for traffic to produce it
     again is luck -- the fix itself moved the city off that occasion. */
  /* On the clock (`actuated: false`): the scenario picks a red that lasts by time, which an actuated light would not hold. */
  let w = seedGraph(1, 50, city, { target: 0, posted: true, trucks: 0, actuated: false });
  const course = w.course;
  let best = null;
  for (let k0 = 0; k0 < course.at.length; k0++) {
    const L0 = course.at[k0].layout;
    for (const [r0, p0] of Object.entries(L0.paths)) {
      const j = joinedTo(course, k0, p0.to);
      if (!j) continue;
      const L2 = course.at[j.k].layout;
      if (!L2.signal) continue;
      const r2 = L2.routesFrom(j.side).find((r) => L2.paths[r].intent === "straight");
      if (!r2 || p0.intent !== "straight") continue;
      const past = L2.paths[r2].stopAt;
      if (past > 10 && past < 35 && (!best || past < best.past)) best = { k0, r0, k2: j.k, r2, past, base: L2.legs[j.side]?.base };
    }
  }
  const sig = course.at[best.k2].layout.signal;
  let t = 0;
  while (t < 400 && !(movementLight(sig, best.base, "straight", t) === "red" && movementLight(sig, best.base, "straight", t + 12) === "red")) t += 0.05;
  const L0 = course.at[best.k0].layout, p0 = L0.paths[best.r0];
  const truck = { ...driver(w.road, 1, 999, null, null, "truck"), n: 999, k: best.k0, route: best.r0, s: p0.length - 22, v: 16, leg: 0,
    stoppedAt: null, going: false, accepted: false, openFor: 0, openedAt: null, waited: 0, delayed: false };
  truck.v0 = 16;
  w = { ...w, t, actors: [truck] };
  let over = 0, stoppedShort = false;
  for (let i = 0; i < 12 / DT; i++) {
    w = step(w);
    const a = w.actors.find((x) => x.id === truck.id);
    if (!a || a.k !== best.k2) continue;
    const p = pathOf(w, a);
    if (a.s + lenOf(a) / 2 > p.stopAt + 0.3) over = Math.max(over, a.s + lenOf(a) / 2 - p.stopAt);
    if (a.v < 0.05) stoppedShort = true;
  }
  check(stoppedShort && over === 0, `a truck at 58 km/h 22 m before a seam whose red is ${best.past.toFixed(0)} m past it stops at the line (${over ? `${over.toFixed(1)} m over it` : "not over it"})`);
}

console.log("\n7. A TRUCK DOES NOT TAKE A CORNER IT CANNOT MAKE");
{
  /* Restated from the geometry, not by calling the sim's `fits`: a body
     of length L with both ends on an arc of radius r cuts r - sqrt(r^2 -
     (L/2)^2) inside it, and the room it has is its lane less its width,
     split. A tight right from a stop cut 2 m inside, over the curb, onto
     somebody waiting there. Counted: every turn a truck set out on, and
     whether its leg offered a way on it could make instead. */
  let w = seedGraph(3, 50, city, { target: 200, posted: true, trucks: 0.3 });
  const spare = (3.6 - VEHICLES.truck.width) / 2, half = VEHICLES.truck.length / 2;
  const cut = (p) => {
    /* The tightest curvature along the turn, from headings 3 m apart. */
    let k = 0;
    for (let s = p.stopAt; s + 3 <= p.clearAt; s += 0.5) {
      let d = ((poseAt(p, s + 3).rot - poseAt(p, s).rot) * Math.PI) / 180;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      k = Math.max(k, Math.abs(d) / 3);
    }
    if (k < 1e-3) return 0;
    const r = 1 / k;
    return r > half ? r - Math.sqrt(r * r - half * half) : Infinity;
  };
  let turns = 0, tooTight = 0, avoidable = 0;
  const seen = new Set();
  for (let i = 0; i < 180 / DT; i++) {
    w = step(w);
    for (const a of w.actors) {
      if (a.kind !== "truck") continue;
      /* The turn taken is the route it has as it crosses the line -- a
         truck placed in a turning lane changes lanes before it. */
      const key = `${a.id}@${a.k}`;
      const L = layoutOf(w, a), p = pathOf(w, a);
      if (seen.has(key) || a.s < p.stopAt) continue;
      seen.add(key);
      if (p.intent === "straight") continue;
      turns++;
      if (cut(p) > spare) {
        tooTight++;
        const base = L.legs[p.from]?.base;
        const others = Object.keys(L.paths).filter((r) => L.legs[L.paths[r].from]?.base === base);
        if (others.some((r) => L.paths[r].intent === "straight" || cut(L.paths[r]) <= spare)) avoidable++;
      }
    }
  }
  console.log(`   (${turns} turns set out on by trucks, ${tooTight} of them tighter than a truck can make, where the leg offered no other way on)`);
  check(avoidable === 0 && seen.size > 40, `no truck sets out on a corner it cannot make when its leg offers another way on (${avoidable} of ${seen.size} truck passages)`);
}

console.log("\n8. A TRUCK HIDES WHAT IS BEHIND IT -- AND A DRIVER KNOWS WHAT IT HIDES");
{
  /* (a) What hides: a box above the eye, never a car's glass. */
  const truckBox = boxOf({ x: 50, y: 0, rot: 90, length: VEHICLES.truck.length, width: VEHICLES.truck.width });
  check(!tallerThanEye({ kind: "car" }) && tallerThanEye({ kind: "truck" }) && blocked({ x: 0, y: 0 }, { x: 100, y: 0 }, [truckBox]) && !blocked({ x: 0, y: 10 }, { x: 100, y: 10 }, [truckBox]),
    "a truck hides what is behind it and a car does not; a sightline past the truck's end is clear");

  /* The probes stand on an uncontrolled crossroads, set up by hand: two
     cars at their lines and a truck put where it hides one from the other. */
  const m = emptyMap("x");
  m.bounds = { x: 0, y: 0, w: 600, h: 600 };
  for (const [id, a] of [["w", { x: 0, y: 300, z: 0 }], ["e", { x: 600, y: 300, z: 0 }], ["n", { x: 300, y: 0, z: 0 }], ["s", { x: 300, y: 600, z: 0 }]]) m.roads.push(road({ id, points: [a, { x: 300, y: 300, z: 0 }], control: { start: "none", end: "none" } }));
  const base = seedGraph(1, 50, loadMap(m), { target: 0, posted: true, trucks: 0 });
  const L = base.course.at[0].layout;
  const straightFrom = (road) => Object.keys(L.paths).find((r) => L.legs[L.paths[r].from]?.road === road && L.paths[r].intent === "straight");
  const at = (road, id, stoppedAt, caution = 1) => {
    const route = straightFrom(road), p = L.paths[route];
    return { ...driver(base.road, 1, id.length + stoppedAt, null, null, "car"), id, n: 1, k: 0, route, s: p.stopAt - CAR.length / 2 - 0.2, v: 0, leg: 0, stoppedAt, going: false, accepted: false, openFor: 0, openedAt: null, waited: 0, delayed: false, caution };
  };
  const A = at("w", "A", 10), B = at("s", "B", 9);
  const eyeA = eyeOf(poseOf(base, A), A), posB = poseOf(base, B);
  const mid = { x: (eyeA.x + posB.x) / 2, y: (eyeA.y + posB.y) / 2 };
  const between = boxOf({ ...mid, rot: (Math.atan2(posB.y - eyeA.y, posB.x - eyeA.x) * 180) / Math.PI + 90, length: VEHICLES.truck.length, width: VEHICLES.truck.width }, "T");
  const w0 = { ...base, t: 12, actors: [A, B] };
  const heldIn = (w, me) => whatStops(me, w).held;
  /* (b) MEMORY. B stopped first, so A waits. A truck passes between them:
     A still has B where they last saw them, and still waits; without that
     memory A forgets B the moment the truck hides them, and goes. */
  const memo = { B: { k: 0, route: B.route, s: B.s, v: 0, t: 11.9, stoppedAt: 9, going: false, accepted: false } };
  const withTruck = { ...w0, tall: [between] };
  /* A bold driver, so what they cannot see holds them only through memory
     (a sound one would also be held by the margin, (c) below). */
  const Ab = { ...A, caution: 0 };
  check(heldIn(w0, Ab) && blocked(eyeA, posB, [between]) && heldIn(withTruck, { ...Ab, memo }) && !heldIn(withTruck, Ab),
    "two cars stopped at their lines, the second waiting its turn: a truck passing between them hides the first, and the second still waits, because it remembers who it watched stop -- without that memory it forgets them and goes");

  /* (c) THE MARGIN FOR WHAT YOU CANNOT SEE. A alone at its line, nobody
     anywhere, and a truck standing where it hides the road to A's left
     short of where their paths meet: a sound driver waits for what could
     be there; a bold one does not; and once the sound one has stood there
     long enough for anything in the hidden stretch to have come out of it,
     they go. */
  const route = straightFrom("s"), pS = L.paths[route];
  const meet = L.conflicts[route + "|" + A.route];
  const q = poseAt(pS, meet.a - 20);
  const hide = boxOf({ x: q.x, y: q.y, rot: ((pS.pts ? 0 : 0) + (Math.atan2(q.y - eyeA.y, q.x - eyeA.x) * 180) / Math.PI) + 90, length: VEHICLES.truck.length, width: VEHICLES.truck.width }, "T");
  const alone = { ...base, t: 12, actors: [], tall: [hide] };
  const sound = { ...A, stoppedAt: 11.9 }, bold = { ...A, stoppedAt: 11.9, caution: 0 }, long = { ...A, stoppedAt: 0 };
  check(heldIn(alone, sound) && !heldIn(alone, bold) && !heldIn(alone, long) && !heldIn({ ...alone, tall: [] }, sound),
    "alone at the line, the road to the left hidden by a standing truck: a sound driver waits for what could be there, a bold one does not, and after standing long enough for anything hidden to have come out, the sound one goes; with the truck see-through, nobody waits");

  /* (c2) THE WHOLE APPROACH HIDDEN -- a truck right beside the driver's
     eye, so no road beyond the hidden stretch is in view and object
     permanence has nothing to go on. A sound driver waits, but not for
     ever: past the undue-delay wait scaled by their caution they conclude
     nothing is coming (the lock, without it: a driver with the right of
     way and a truck that waited for them stood each other off). */
  const posS = poseAt(pS, meet.a - 30);
  const ang = Math.atan2(posS.y - eyeA.y, posS.x - eyeA.x);
  const wall = boxOf({ x: eyeA.x + Math.cos(ang) * 3, y: eyeA.y + Math.sin(ang) * 3, rot: (ang * 180) / Math.PI + 90, length: VEHICLES.truck.length, width: VEHICLES.truck.width }, "W");
  const whole = { ...base, t: 100, actors: [], tall: [wall] };
  const allHidden = [0, 10, 20, 30, 40, 50, 60].every((d) => blocked(eyeA, poseAt(pS, Math.max(0, meet.a - d)), [wall]));
  const soon = { ...A, stoppedAt: 99 }, later = { ...A, stoppedAt: 100 - UNDUE_AT * 1.1 };
  check(allHidden && heldIn(whole, soon) && !heldIn(whole, later),
    `the whole approach hidden by a truck beside the driver: a sound driver waits for what could be there, and gives it up after the undue-delay wait (${UNDUE_AT} s at their caution) rather than for ever`);

  /* (c3) A CAR FOLLOWING A TRUCK THROUGH A TURN never reaches its tail: in
     a turn a truck's tail is further back along its path than half its
     length (`rear`), and following by half-length ran a car into it at
     300 cars (verify-bays, 30 September). */
  {
    const rRight = Object.keys(L.paths).find((r) => L.legs[L.paths[r].from]?.road === "w" && L.paths[r].intent === "right");
    const pR = L.paths[rRight];
    /* The truck standing where its tail reaches furthest back along the
       turn, and a car arriving behind it to rest. */
    const T0 = { ...driver(base.road, 1, 77, null, null, "truck"), id: "T1", n: 77, k: 0, route: rRight, v: 0, leg: 0, stoppedAt: 1, going: true, accepted: true, openFor: 0, openedAt: null, waited: 0, delayed: false };
    let bestS = pR.stopAt, bestRear = 0;
    for (let s = pR.stopAt; s < pR.clearAt + 6; s += 0.5) { const r = rearOf({ ...base, actors: [] }, { ...T0, s }); if (r > bestRear) { bestRear = r; bestS = s; } }
    const truck = { ...T0, s: bestS, v0: 0.01 };
    const car = { ...driver(base.road, 1, 78), id: "C1", n: 78, k: 0, route: rRight, s: bestS - 25, v: 6, leg: 0, stoppedAt: 1, going: true, accepted: true, openFor: 0, openedAt: null, waited: 0, delayed: false };
    let w = { ...base, t: 5, actors: [truck, car] }, contact = false;
    for (let i = 0; i < 10 / DT; i++) { w = step(w); if ((w.crashes ?? []).length) contact = true; }
    check(!contact && bestRear > VEHICLES.truck.length / 2 + 0.5, `a car coming to rest behind a truck standing in a right turn stops short of its tail, which there lies ${bestRear.toFixed(1)} m behind its centre along the path against half its length of ${VEHICLES.truck.length / 2}`);
  }

  /* (d) In traffic: the city at 15% trucks, opaque against see-through. */
  const city15 = (opaque) => {
    let w = { ...seedGraph(3, 50, city, { target: 200, posted: true, trucks: 0.15 }), seeThrough: !opaque };
    let crossings = 0, longest = 0, still = new Map(), phantom = { bold: 0, timid: 0, boldN: 0, timidN: 0 };
    const perMin = [];
    for (let i = 0; i < 300 / DT; i++) {
      const before = new Map(w.actors.map((a) => [a.id, a]));
      w = step(w);
      for (const a of w.actors) {
        const b = before.get(a.id);
        if (b && b.k === a.k && b.route === a.route) { const p = pathOf(w, a); if (b.s < p.stopAt && a.s >= p.stopAt) { crossings++; perMin[Math.floor(w.t / 60)] = (perMin[Math.floor(w.t / 60)] ?? 0) + 1; } }
        if (a.v < 0.1 && !a.crash) { still.set(a.id, (still.get(a.id) ?? 0) + DT); longest = Math.max(longest, still.get(a.id)); } else still.delete(a.id);
      }
      if (opaque && i % 20 === 0) for (const a of w.actors) {
        if (a.player || a.crash || !w.tall) continue;
        const band = a.caution < 0.6 ? "bold" : a.caution > 1.3 ? "timid" : null;
        if (!band) continue;
        /* Among drivers at their line, the only ones the margin can hold. */
        const pa = pathOf(w, a);
        if (a.going || a.s < pa.stopAt - lenOf(a) / 2 - 8 || a.s > pa.stopAt) continue;
        phantom[band + "N"]++;
        if (whatStops(a, w).held && !whatStops(a, { ...w, tall: undefined }).held) phantom[band]++;
      }
    }
    return { crossings, perMin, longest, crashes: (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length, phantom };
  };
  const see = city15(false), opq = city15(true);
  const rate = (b) => opq.phantom[b] / Math.max(1, opq.phantom[b + "N"]);
  /* A LOCK SHOWS AS THROUGHPUT DECAYING minute on minute (a driver with the
     right of way and a truck that waited for them stood each other off for
     five minutes: 670 crossings a minute falling to 500) -- so every minute
     is held to the see-through world's same minute. The longest standstill
     is reported, not bounded: at 15% trucks a permissive left at a signal
     waits a long time for a gap in slow, dense oncoming traffic, trucks
     opaque or not. */
  const worst = Math.min(...opq.perMin.map((n, i) => n / Math.max(1, see.perMin[i] ?? n)));
  check(opq.crossings > 0.9 * see.crossings && worst > 0.85 && opq.crashes <= see.crashes + 1,
    `five minutes of the city at 15% trucks: ${opq.crossings} crossings with trucks opaque against ${see.crossings} see-through, no minute below ${(100 * worst).toFixed(0)}% of its see-through twin (a minute by minute: ${opq.perMin.join(" ")} against ${see.perMin.join(" ")}), crashes ${opq.crashes} (${see.crashes}); longest standstill ${opq.longest.toFixed(0)} s (${see.longest.toFixed(0)} s)`);
  check(rate("timid") > rate("bold") && opq.phantom.timidN > 50 && opq.phantom.boldN > 50,
    `and what a truck might hide holds the timid more than the bold: ${(100 * rate("timid")).toFixed(1)}% of timid drivers' sampled ticks at their line against ${(100 * rate("bold")).toFixed(1)}% of bold ones' (${opq.phantom.timidN} and ${opq.phantom.boldN} sampled) -- the margin for what you cannot see is confidence (at its ends, (c): a sound driver waits and a maximally bold one does not)`);
}

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: a truck is a row in the vehicle table: longer, wider, slower away, gentler on the brakes, at the limit; it spans its path through a turn, is solid its whole length, judges an amber by its own brakes, and sees the next line across the seam.");
process.exit(failed ? 1 : 0);
