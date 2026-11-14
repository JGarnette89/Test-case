/* =====================================================================
   THE BENDS ARE THE DRIVERS' BUSINESS (DECISIONS 10.96, 10.98; Jay's standing model: push your skill, your car or the road conditions, two of the three at most, never all three, and people do anyway, which is when they crash). Where a map says `bends: "driver"` the road does not lower its posted speed to a bend; each driver reads the bend ahead and chooses a speed against their OWN capability, and a car that asks more of a bend than it has stops where it is. Expectations are LITERALS, never read from the code's own constants:

     1. WHAT A DRIVER HAS TO GIVE: the design figure for a rating of 0 (0.15 g = 1.4715 m/s^2) rising to the grip for a rating of 1 (6.0 m/s^2), linear between, times the car and the conditions.
     2. WHAT A DRIVER CHOOSES: a competent one (caution 1) with the best skill takes a 450 m bend at 43.0 m/s (sqrt(4.1 x 450)); one of rating 0.2 at 97 km/h; the bold faster and the timid slower. A driver at caution 1 or more NEVER asks more than their capability, over every rating, car and condition; a driver bold enough (caution under 0.40, derived: (1.35 - sqrt(6.0 / 4.1)) / 0.35) does -- the three factors pushed together, with nothing written for it.
     3. A LOSS IS ONLY FOR ASKING MORE THAN THERE IS: a car on a 450 m bend asking 125% of its capability stops where it is and is logged against "road"; one asking 80% does not; and within 25 m of a join (a kink in the polyline, not a bend) nothing is asked of anybody.
     4. THE CURVATURE IS A CHORD'S, NOT A WINDOW'S: along the interior of a bend (150 m or more from a path's ends, where it really changes) the estimate does not vary by more than 12% from one metre to the next (measured: 9% at most at 80 m, 16% at 40 m; the +-3 m window it replaced doubled and halved).
     5. IN A WORLD: on the generated road with bends by the driver, over two seeds, 300 cars, five minutes, NO ORDINARY DRIVER (caution over 0.40) LOSES THE ROAD, and the least skilled (rating under 0.3) take the tight bends at least 3 points of their wanted speed slower than the most skilled.
     6. THE MAP ASKS FOR IT AND NOTHING ELSE DOES: a carriageway posts the limit (110) over its whole length and a ramp keeps a lower advisory speed; the shipped five-lane road, which does not ask, posts 110 on 60 to 70% of its length as it always did; a world with no `bends` is the world it was.
   Sabotage: the judgement removed fails 5; the join margin removed fails 3; the capability floor raised to the grip fails 1 and 2. Usage: node tools/verify-bends.mjs
   ===================================================================== */
import { roadgen, testHighwayGenWide } from "../src/map/roadgen.js";
import { loadMap } from "../src/map/load.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { lateralCapability, bendSpeedOf, curvatureAt, onTheOpenRoad, BEND_JOIN } from "../src/sim/corner.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const G = 9.81, LAT = 0.15 * G, GRIPL = 6.0, CLEANL = 4.1;
const drv = (steering, caution = 1, extra = {}) => ({ ratings: { steering }, caution, ...extra });

console.log("1. WHAT A DRIVER HAS TO GIVE");
check(near(lateralCapability(drv(0)), LAT, 1e-6) && near(lateralCapability(drv(1)), GRIPL, 1e-6), `rating 0 gives ${lateralCapability(drv(0)).toFixed(4)} m/s^2 (1.4715) and rating 1 gives ${lateralCapability(drv(1)).toFixed(4)} (6.0)`);
check(near(lateralCapability(drv(0.5)), (LAT + GRIPL) / 2, 1e-6), `halfway at a rating of 0.5: ${lateralCapability(drv(0.5)).toFixed(4)} m/s^2 (3.7358)`);
check(near(lateralCapability(drv(1, 1, { carGrip: 0.8 }), 0.7), GRIPL * 0.8 * 0.7, 1e-6), `a car at 0.8 on a road at 0.7 multiplies: ${lateralCapability(drv(1, 1, { carGrip: 0.8 }), 0.7).toFixed(3)} m/s^2 (3.360)`);

console.log("\n2. WHAT A DRIVER CHOOSES");
{
  const k = 1 / 450, BOLD = (1.35 - Math.sqrt(GRIPL / CLEANL)) / 0.35;
  check(near(bendSpeedOf(k, drv(1)), 42.95, 0.1), `rating 1, caution 1, 450 m: ${bendSpeedOf(k, drv(1)).toFixed(2)} m/s (42.95)`);
  check(near(bendSpeedOf(k, drv(0.2)) * 3.6, 97.3, 0.7), `rating 0.2, caution 1, 450 m: ${(bendSpeedOf(k, drv(0.2)) * 3.6).toFixed(1)} km/h (97.3)`);
  check(bendSpeedOf(k, drv(0.2, 0.2)) > bendSpeedOf(k, drv(0.2, 1)) && bendSpeedOf(k, drv(0.2, 1.7)) < bendSpeedOf(k, drv(0.2, 1)), "the bold take it faster and the timid slower, by the scaling their road speed has");
  let n = 0, askedOver = 0, wrongBold = 0;
  for (let r = 0; r <= 1.001; r += 0.1) for (const car of [0.5, 0.8, 1, 1.2]) for (const cond of [0.5, 0.7, 1]) for (let c = 0; c <= 1.7; c += 0.05) {
    const d = drv(r, c, { carGrip: car }), v = bendSpeedOf(k, d, cond), asked = v * v * k, cap = lateralCapability(d, cond), over = asked > cap * 1.0001;
    n++;
    if (over && c >= BOLD + 0.005) askedOver++;
    if (!over && c <= BOLD - 0.005) wrongBold++;
  }
  check(askedOver === 0, `over ${n} combinations of skill, car, conditions and caution, nobody of caution ${BOLD.toFixed(2)} or more ever asks more than they have (${askedOver})`);
  check(wrongBold === 0, `and everybody bolder than ${BOLD.toFixed(2)} does (${wrongBold} of them did not)`);
}

console.log("\n3. A LOSS IS ONLY FOR ASKING MORE THAN THERE IS");
const raw = roadgen({ ID: "x", LANES: 5, LIMIT: 110, CARS: 0, CARS_MAX: 0, SHAPE: false, BENDS: "driver" });
const loaded = loadMap(raw);
{
  const w0 = seedGraph(1, 50, loaded, { every: 2.0, target: 10, posted: true });
  check(w0.bends === "driver", "the world carries the map's `bends: driver`");
  let spot = null;
  w0.course.at.forEach((at, ki) => {
    for (const [route, p] of Object.entries(at.layout.paths)) {
      if (spot) return;
      const leg = at.layout.legs[p.from];
      if ((leg.across ?? leg.lanes ?? 1) < 3) continue;
      for (let s = BEND_JOIN + 5; s < p.stopAt - BEND_JOIN - 5; s += 10) { const kk = curvatureAt(p, s); if (kk > 1 / 480 && kk < 1 / 400 && onTheOpenRoad(p, s)) { spot = { k: ki, route, p, s }; break; } }
    }
  });
  check(!!spot, "a bend of about 450 m on an open carriageway exists to test on");
  if (spot) {
    const car = w0.actors.find((a) => !a.player) ?? w0.actors[0];
    const run = (steer, factor, s = spot.s) => {
      const c0 = { ...car, k: spot.k, route: spot.route, s, a: 0, ratings: { ...car.ratings, steering: steer }, caution: 1, going: true, stoppedAt: null, crash: undefined };
      const kk = curvatureAt(spot.p, s), v = Math.sqrt((factor * lateralCapability(c0)) / kk);
      let w = { ...w0, actors: [{ ...c0, v }], crashes: [], nextAt: 1e9, target: 0 };
      w = step(w);
      return { crashed: !!w.actors[0]?.crash, logged: (w.crashes ?? []).some((c) => c.b === "road"), v: v * 3.6 };
    };
    const hot = run(0.3, 1.25), mild = run(0.3, 0.8), kink = run(0.3, 3, 10);
    check(hot.crashed && hot.logged, `a car asking 125% of its capability (${hot.v.toFixed(0)} km/h on a 450 m bend) stops where it is and is logged against "road"`);
    check(!mild.crashed, `asking 80% does not (${mild.v.toFixed(0)} km/h)`);
    check(!kink.crashed, "and within 25 m of a join, even asking 300%, nothing is asked of anybody");
  }
}

console.log("\n4. THE CURVATURE IS A CHORD'S");
{
  const w0 = seedGraph(1, 50, loaded, { every: 2.0, target: 10, posted: true });
  let worst = 0, longest = 0;
  for (const at of w0.course.at) for (const p of Object.values(at.layout.paths)) {
    let run = 0;
    for (let s = 150; s < p.stopAt - 150; s += 1) {
      const a = curvatureAt(p, s), b = curvatureAt(p, s + 1);
      if (a > 1 / 700 && b > 1 / 700 && onTheOpenRoad(p, s)) { worst = Math.max(worst, Math.abs(a - b) / Math.max(a, b)); run++; } else run = 0;
      longest = Math.max(longest, run);
    }
  }
  check(longest > 100 && worst < 0.12, `along ${longest} m of unbroken bend the estimate varies by at most ${(100 * worst).toFixed(0)}% from one metre to the next (under 12%)`);
}

console.log("\n6. THE MAP ASKS FOR IT AND NOTHING ELSE DOES");
{
  const lens = (m, f) => { let tot = 0, hit = 0; for (const r of m.roads.filter((x) => /^h[wb]-/.test(x.id))) { const len = r.points.reduce((s, p, i) => (i ? s + Math.hypot(p.x - r.points[i - 1].x, p.y - r.points[i - 1].y) : 0), 0); tot += len; if (f(r)) hit += len; } return hit / tot; };
  check(near(lens(raw, (r) => r.speed === 110), 1, 1e-9), "with bends by the driver the carriageways post 110 over their whole length");
  const ramps = raw.roads.filter((r) => /^(off|on)b?-/.test(r.id));
  check(ramps.length > 4 && ramps.every((r) => r.speed < 110), `and the ${ramps.length} ramps keep a lower advisory speed (${Math.max(...ramps.map((r) => r.speed))} at most)`);
  const ship = lens(testHighwayGenWide(), (r) => r.speed === 110);
  check(ship > 0.6 && ship < 0.7, `the shipped five-lane road, which does not ask, still posts 110 on ${(100 * ship).toFixed(0)}% of its length (60 to 70%)`);
  const fp = (w) => JSON.stringify(w.actors.map((x) => [x.id, x.route, Math.round(x.s * 1e3), Math.round(x.v * 1e3)]));
  let wa = seedGraph(3, 50, loadMap(testHighwayGenWide()), { every: 2.0, target: 40, posted: true }), wb = seedGraph(3, 50, loadMap(testHighwayGenWide()), { every: 2.0, target: 40, posted: true, bends: null });
  let same = true;
  for (let i = 0; i < 400 && same; i++) { wa = step(wa); wb = step(wb); same = fp(wa) === fp(wb); }
  check(same && !wa.bends, "a world with no `bends` is the world it was (400 ticks, car for car) and carries no field");
}

console.log("\n5. IN A WORLD (two seeds, 300 cars, five minutes)");
{
  const tight = [], lostOrdinary = [];
  let lostBold = 0, lostAll = 0;
  for (const seed of [1, 2]) {
    let w = seedGraph(seed, 50, loaded, { every: 2.0, target: 300, posted: true, walkers: true, rivals: true, brakeReaction: true });
    for (let i = 0; i < 20 * 120; i++) w = step(w);
    const seen = new Set();
    for (let i = 0; i < 20 * 300; i++) {
      const before = w; w = step(w);
      for (const c of w.crashes ?? []) {
        const key = `${c.t}|${c.a}|${c.b}`;
        if (seen.has(key) || c.b !== "road" || c.t < before.t) continue;
        seen.add(key); lostAll++;
        const a = before.actors.find((x) => x.id === c.a);
        if ((a?.caution ?? 1) < 0.4) lostBold++; else lostOrdinary.push(a?.caution);
      }
      if (i % 20 === 19) for (const a of w.actors) {
        if (a.player || a.parked || a.crash || a.v < 3 || a.ratings?.steering == null) continue;
        const L = w.course.at[a.k ?? 0].layout, p = L.paths[a.route];
        if (!p || !onTheOpenRoad(p, a.s)) continue;
        const leg = L.legs[a.s < p.stopAt ? p.from : p.to], k = curvatureAt(p, a.s);
        if ((leg?.across ?? leg?.lanes ?? 1) >= 2 && k > 1 / 650 && k < 1 / 300) tight.push({ steer: a.ratings.steering, share: a.v / a.v0 });
      }
    }
  }
  const lo = tight.filter((x) => x.steer < 0.3), hi = tight.filter((x) => x.steer >= 0.85), m = (xs) => xs.reduce((s, x) => s + x.share, 0) / Math.max(1, xs.length);
  console.log(`   ${lostAll} lost the road (${lostBold} bold, ${lostOrdinary.length} ordinary); the tight bends, share of wanted speed: least skilled ${(100 * m(lo)).toFixed(0)}% (${lo.length} car-seconds), most skilled ${(100 * m(hi)).toFixed(0)}% (${hi.length})`);
  check(lostOrdinary.length === 0, `no ordinary driver (caution over 0.40) lost the road (${lostOrdinary.length})`);
  check(lo.length >= 300 && hi.length >= 1000 && m(hi) - m(lo) >= 0.03, `the least skilled take the tight bends at least 3 points of their wanted speed slower: ${(100 * m(lo)).toFixed(0)}% against ${(100 * m(hi)).toFixed(0)}%`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
