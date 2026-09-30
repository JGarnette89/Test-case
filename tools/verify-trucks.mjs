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
import { seedGraph, step, pathOf, layoutOf, poseOf, overlapping, strayOf, DT, TRUCK_SHARE } from "../src/sim/crossing.js";
import { joinedTo } from "../src/sim/course.js";
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
        if (L.signal && !a.amberGo && movementLight(L.signal, L.legs[p.from]?.base, p.intent, w.t) === "red" && p.intent !== "right"
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
  let w = seedGraph(1, 50, city, { target: 0, posted: true, trucks: 0 });
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

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: a truck is a row in the vehicle table: longer, wider, slower away, gentler on the brakes, at the limit; it spans its path through a turn, is solid its whole length, judges an amber by its own brakes, and sees the next line across the seam.");
process.exit(failed ? 1 : 0);
