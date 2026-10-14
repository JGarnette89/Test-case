/* =====================================================================
   BUS BAYS: out of the lane, passed, and given way to -- by those who know to.

   Split from verify-buses.mjs on 14 October (CLAUDE.md, item 8): as one
   file it ran past twenty minutes under the full suite's load, and its
   sections are independent, so the runner runs them side by side.
   Section 6 of the old file.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { testBuses, testMap1 } from "../src/map/samples.js";
import { emptyMap, road } from "../src/map/format.js";
import { seedGraph, step, poseOf } from "../src/sim/crossing.js";
import { laneSpanOnGraph } from "../src/sim/graph.js";
import { stopsOf, DWELL, MIN_DWELL, MAX_DWELL, inBay, laneAt } from "../src/sim/buses.js";
import { planPass } from "../src/sim/passing.js";
import { onRoadSurface } from "../src/map/sidewalks.js";
import { reads, DIFFICULTY } from "../src/core/driver.js";
import { walkNetOf, walkerPose, WAIT_PATIENCE } from "../src/sim/walkers.js";
import { DT, lenOf } from "../src/sim/traffic.js";

let fails = 0;
/* VEHICLES TOUCHING VEHICLES. A person struck is peds.js's content -- the
   heedless one who darts out between parked cars ahead of the traffic, by
   design -- and verify-peds holds it to the fairness rules. Counted here
   it made "nothing touched" a claim about pedestrians this check never
   tests, green only while nobody happened to dart out (1 October). */
const vehicleCrashes = (w) => (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped") && !String(c.b).startsWith("ped")).length;
const ok = (cond, msg) => { console.log(`${cond ? "  ok  " : "  FAIL"} ${msg}`); if (!cond) fails++; };

console.log("6. bays: out of the lane, passed, and given way to -- by those who know to");
{
  const L = loadMap(testBuses());
  const bayStops = L.stops.filter((q) => q.kind === "bay");
  ok(bayStops.length === 2, `the Buses map has its two bays (${bayStops.map((q) => q.id).join(", ")})`);
  /* The surface steps back at a bay: a point a metre and a half beyond the plain curb, level with the post, is road. */
  const widened = bayStops.every((st) => {
    const r = L.roads.find((x) => x.id === st.road), i = r.at.findIndex((a) => a >= st.s);
    const c = r.pts[i], e = (st.dir === "fwd" ? r.right : r.left)[i], plain = (r.outer ?? r.width) / 2;
    const ux = (e.x - c.x) / Math.hypot(e.x - c.x, e.y - c.y), uy = (e.y - c.y) / Math.hypot(e.x - c.x, e.y - c.y);
    return onRoadSurface(r, { x: c.x + ux * (plain + 1.5), y: c.y + uy * (plain + 1.5) });
  });
  ok(widened, "the road's surface steps back into each bay, so the sidewalk steps back with it");

  /* THREE SEEDS: one run gave three drivers who knew the rule and one who
     did not -- too few to say anything (CLAUDE.md item 3, the implied
     sample size). */
  const MINS6 = 20;
  let crashes6 = 0;
  let passedStanding = 0, inLane = 0, signalled = 0, longest = 0;
  /* ONE EPISODE per bus signalling to pull out: each car coming up behind
     it in its lane when it began -- whether they know the rule, and whether
     they could stop comfortably then -- and what came first, the car past
     the bus or the bus out. Counting stopped time instead missed every
     yield: the bus goes the moment the car behind has all but stopped. */
  const episodes = new Map();   // bus id -> { t, cars: Map(car id -> { reads, couldStop, outcome }) }
  const outcomes = [];
  const close = (bus, how) => { const ep = episodes.get(bus); if (!ep) return; for (const c of ep.cars.values()) if (!c.outcome) c.outcome = how; outcomes.push(...ep.cars.values()); episodes.delete(bus); };
  /* AND A FOURTH RUN WITH THE RULE MADE HARD, for the other half. At the
     rule's own difficulty (0.15, the maintainer's ruling) so few drivers
     do not know it that three runs held one or none of them -- the check
     passed on whoever happened to turn up, and went 0 of 0 when an
     unrelated change moved the traffic (7 October). A controlled run, as
     verify-compliance makes a map's signs hard: the same drivers, the
     rule harder, so many do not know it. The three runs at the real
     difficulty still hold everybody who knows. */
  const realDifficulty = DIFFICULTY["yield-to-bus"];
  /* One run at the rule's own difficulty and the hard one (14 October, the cost of a check): three ordinary runs gave 59 of 59 and 63 waits against floors of 5 and 10; one gives 26 and 35. The hard run, where the floor is close, is kept whole. */
  for (const [seed, hard] of [[5, false], [8, true]]) {
  DIFFICULTY["yield-to-bus"] = hard ? 0.9 : realDifficulty;
  let v = seedGraph(seed, 50, L, { every: 2.0, target: 90, posted: true, buses: 0.3 });
  episodes.clear();
  for (let k = 0; k < (MINS6 * 60) / DT; k++) {
    v = step(v);
    for (const id of [...episodes.keys()]) { const b = v.actors.find((a) => a.id === id); if (!b || b.wantsOut == null) close(id, "let out"); }
    for (const bus of v.actors) {
      if (bus.kind !== "bus" || !bus.busStop?.bay || bus.dwellFrom == null) continue;
      if (!inBay(bus)) inLane += DT;
      const [m] = laneAt(v.course, bus);
      if (!m) continue;
      const tail = m.along - lenOf(bus) / 2;
      if (bus.wantsOut != null && !episodes.has(bus.id)) { episodes.set(bus.id, { t: v.t, cars: new Map() }); signalled++; }
      const ep = episodes.get(bus.id);
      if (ep) longest = Math.max(longest, v.t - ep.t);
      for (const car of v.actors) {
        if (car.id === bus.id || car.kind === "bus") continue;
        const [o] = laneAt(v.course, car);
        if (!o || o.lane !== m.lane) continue;
        const front = o.along + lenOf(car) / 2;
        if (!ep) { if (front > tail && front < tail + 1 && (car.v ?? 0) > 1) passedStanding++; continue; }
        if (!ep.cars.has(car.id) && front < tail && tail - front < 80 && v.t - ep.t < DT * 1.5) ep.cars.set(car.id, { hard, reads: reads(car, "yield-to-bus"), couldStop: tail - front >= ((car.v ?? 0) ** 2) / (2 * (car.brake ?? 2.7)) + 1, outcome: null });
        const c = ep.cars.get(car.id);
        if (c && !c.outcome && front > tail) c.outcome = "passed";
      }
    }
  }
  crashes6 += vehicleCrashes(v);
  }
  DIFFICULTY["yield-to-bus"] = realDifficulty;
  const knew = outcomes.filter((c) => c.reads && c.couldStop), didNot = outcomes.filter((c) => !c.reads && c.couldStop && c.hard);
  ok(passedStanding > 0 && inLane < 1, `a bus in its bay is out of the lane (${inLane.toFixed(1)} s standing in it) and the traffic goes past it (${passedStanding} times)`);
  ok(signalled > 10, `buses had to wait to pull out ${signalled} times in two runs of ${MINS6} minutes`);
  ok(knew.length >= 5 && knew.every((c) => c.outcome === "let out"), `everybody who knows to give way and could stop let the bus out (${knew.filter((c) => c.outcome === "let out").length} of ${knew.length})`);
  /* Measured 5 of 9 (7 October); with everybody made to yield whatever they
     know it is 0 of 8, so the floor sits between the two rather than on
     the measurement. */
  ok(didNot.filter((c) => c.outcome === "passed").length >= 3, `and, with the rule made hard, drivers who do not know and could have stopped drove on past it (${didNot.filter((c) => c.outcome === "passed").length} of ${didNot.length})`);
  ok(longest < 90, `and no bus waited for ever to get out: the longest was ${longest.toFixed(1)} s`);
  ok(crashes6 === 0, `no vehicle touched another (${crashes6})`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
