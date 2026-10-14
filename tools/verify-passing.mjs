/* =====================================================================
   GOING ROUND A BUS at a curb stop, on a broken centre line or none, never a solid one.

   Split from verify-buses.mjs on 14 October (CLAUDE.md, item 8): as one
   file it ran past twenty minutes under the full suite's load, and its
   sections are independent, so the runner runs them side by side.
   Section 7 of the old file.
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

console.log("7. going round a bus at a curb stop, on a broken centre line or none, never a solid one");
{
  /* The same map with its through road re-made: a collector is painted
     with a broken line, an arterial a solid double, a residential street
     none (draw.js). Passing is the broken line's alone. */
  const remade = (kind) => { const m = testBuses(); m.roads = m.roads.map((r) => (r.id.startsWith("main") ? { ...r, kind, lanes: 1, parking: "none" } : r)); return loadMap(m); };
  /* BOLD AGAINST TIMID, asked of the same moment: wherever a car stands
     behind a bus at its stop, the pass rule is asked as a bold driver and
     as a timid one. Counting bold drivers among the passes that happened
     was one in eighteen, then none -- luck, not a property. */
  let boldOnly = 0, timidOnly = 0;
  const run = (L, passing, seeds) => {
    let passes = 0, carCrashes = 0, behind = 0, bold = 0;
    for (const seed of seeds) {
      let v = seedGraph(seed, 50, L, { every: 2.0, target: 90, posted: true, buses: 0.3, passing });
      const seen = new Set();
      /* Seven and a half minutes a run (14 October): fifteen gave 26 passes and 18 bold-only moments against floors of 5 and 1; this gives 12 and 7. */
      for (let k = 0; k < (7.5 * 60) / DT; k++) {
        v = step(v);
        for (const a of v.actors) if (a.pass && !seen.has(`${a.id}|${a.pass.s0}`)) { seen.add(`${a.id}|${a.pass.s0}`); passes++; if ((a.caution ?? 1) < 0.6) bold++; }
        for (const b of v.actors) if (b.kind === "bus" && b.dwellFrom != null && !b.busStop?.bay) {
          const queued = v.actors.filter((c) => c.kind === "car" && c.k === b.k && c.route === b.route && c.s < b.s && b.s - c.s < 25 && c.v < 0.3);
          behind += queued.length * DT;
          if (passing && k % 10 === 0) for (const c of queued) {
            const path = v.course.at[c.k].layout.paths[c.route];
            const yes = (caution) => !!planPass(v, { ...c, caution, pass: null }, b, path);
            const bo = yes(0.05), ti = yes(1.8);
            if (bo && !ti) boldOnly++;
            if (ti && !bo) timidOnly++;
          }
        }
      }
      /* Vehicles touching vehicles: a person struck is peds.js's content (verify-peds), not this. */
      carCrashes += (v.crashes ?? []).filter((c) => !String(c.a).startsWith("ped") && !String(c.b).startsWith("ped")).length;
    }
    return { passes, carCrashes, behind, bold };
  };
  const seeds = [5, 6];
  const on = run(loadMap(testBuses()), true, seeds), off = run(loadMap(testBuses()), false, seeds);
  ok(on.passes >= 5, `on the two-lane collector, cars went round a bus standing at its stop ${on.passes} times in two runs of 7.5 minutes`);
  ok(boldOnly > 0 && timidOnly === 0, `the gap is theirs to misjudge: at the same moment behind the same bus a bold driver would go where a timid one would not ${boldOnly} times, and never the other way (${timidOnly})`);
  ok(on.behind < off.behind, `and stood behind a standing bus for less of it: ${on.behind.toFixed(0)} car-seconds against ${off.behind.toFixed(0)} with passing off`);
  ok(on.carCrashes === 0, `no vehicle touched another while passing (${on.carCrashes})`);
  const solid = run(remade("arterial"), true, [5]), none = run(remade("residential"), true, [5]);
  ok(solid.passes === 0, `nobody passed on the same road painted with a solid line (${solid.passes})`);
  /* The maintainer, 1 October: on an unmarked street, yes, if the way is clear. */
  ok(none.passes > 0 && none.carCrashes === 0, `and on the same road with no line painted they do, touching nothing (${none.passes} passes)`);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
