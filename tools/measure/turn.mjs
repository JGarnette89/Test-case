/* THE TURN MODEL, SWEPT: the player through the crossroads left (r 12.7 m)
   and the curb-lane right (r 9.3 m) at a range of entry speeds, held in
   the maintain band through the box with the wheel straight. Run:
   node tools/measure/turn.mjs. The numbers are in SIMULATOR.md 1.1.3. */
import { seedGraph, step, DT } from "../../src/sim/crossing.js";
import { playerAt, stepDriver, withDriver, routeForSignal } from "../../src/sim/drive.js";
import { holdAt } from "../../src/sim/player.js";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";

const loaded = loadMap(testMap1());
const w0 = { ...seedGraph(1, 50, loaded, { every: 2 }), actors: [] };
const cases = [["A-north|end#0", "left", "crossroads left"], ["A-north|end#1", "right", "crossroads right"]];
for (const [leg, sig, name] of cases) {
  const k = w0.course.at.findIndex((s) => s.layout.legs[leg]);
  const layout = w0.course.at[k].layout;
  const route = routeForSignal(layout, leg, sig);
  const path = layout.paths[route];
  console.log(`== ${name}: box ${path.stopAt.toFixed(1)}..${path.clearAt.toFixed(1)} m`);
  for (const kmh of [8, 12, 15, 18, 20, 22, 24, 26, 28, 30, 33, 36, 40]) {
    let me = { ...playerAt(w0, k, route), s: path.stopAt - 0.5, v: kmh / 3.6, signal: sig, going: true, accepted: true, off: 0 };
    let world = withDriver(w0, me);
    let last = null, offMax = 0, vOut = null;
    for (let i = 0; i < 400; i++) {
      const inp = { steer: 0, slider: holdAt(me.v, me.grade ?? 0) };
      me = stepDriver(me, inp, world, DT);
      world = withDriver(world, me);
      if (me.turn) offMax = Math.max(offMax, Math.abs(me.off));
      if (me.lastTurn && !last) { last = me.lastTurn; vOut = me.v; break; }
      if (me.k !== k) break;
    }
    console.log(`  in ${kmh} km/h: ${last ? last.verdict : "no verdict"}  peak lat ${last?.peak.toFixed(1)}  scrubbed ${(last?.scrubbed * 3.6).toFixed(0)} km/h  out ${(vOut * 3.6).toFixed(0)} km/h  |off| max ${offMax.toFixed(2)} m  r ${last?.rMin.toFixed(1)}  wants ${(last?.vClean * 3.6).toFixed(0)}`);
  }
}
