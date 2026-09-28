/* =====================================================================
   PEDESTRIANS AND CROSSWALKS (SIMULATOR.md stage 6): what has to hold.

     1. A crosswalk is map data per road end. Where there is one, that
        approach's stop line stands its width further back and nothing
        else moves; it is drawn as bars across the road between the box
        and the line; the editor writes it and keeps it through a split;
        and the traffic waits clear of it.
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { emptyMap, road, CROSSWALK_W } from "../src/map/format.js";
import { graphOf, junctionsOf } from "../src/sim/graph.js";
import { seedGraph, step, overlapping, pathOf, poseOf } from "../src/sim/crossing.js";
import { DT, CAR } from "../src/sim/traffic.js";
import { setCrosswalk, splitRoad } from "../src/editor/model.js";

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

console.log(`\n${"=".repeat(70)}`);
console.log(failed ? `${failed} FAILURE(S)` : "OK: a crosswalk is map data, moves only its own approach's line, is drawn where it is, and the traffic waits clear of it.");
process.exit(failed ? 1 : 0);
