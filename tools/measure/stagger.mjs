// IN FLIGHT 41, the stagger, on the maintainer's recipe (10 November): a signalled turn taken fast enough to leave the lane, then the car driven by hand. Args: leg signal kmh handsoff|hold. DECISIONS 10.64.
import { seedGraph, DT } from "../../src/sim/crossing.js";
import { playerAt, stepDriver, driverPose, withDriver, routeForSignal } from "../../src/sim/drive.js";
import { holdAt } from "../../src/sim/player.js";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
const loaded = loadMap(testMap1());
const w0 = { ...seedGraph(1, 50, loaded, { every: 2 }), actors: [], every: 1e9, nextAt: 1e9 };
const leg = process.argv[2] ?? "A-north|end#1", sig = process.argv[3] ?? "right", kmh = Number(process.argv[4] ?? 45), mode = process.argv[5] ?? "handsoff";
const k = w0.course.at.findIndex((s) => s.layout.legs[leg]);
const layout = w0.course.at[k].layout, route = routeForSignal(layout, leg, sig), path = layout.paths[route];
let me = { ...playerAt(w0, k, route), s: path.stopAt - 0.5, v: kmh / 3.6, signal: sig, going: true, accepted: true, off: 0 };
let world = withDriver(w0, me), heldHeading = null, out = null;
for (let i = 0; i < 20 * 25; i++) {
  const t = i * DT;
  let steer = 0;
  const pz = driverPose(me, world.course);
  if (me.lastTurn && heldHeading == null) { heldHeading = pz.heading; out = t; }
  // "takes control": after leaving the box, either hands off (assist), or steer to keep the world heading they have.
  if (mode === "hold" && heldHeading != null) { const e = ((pz.heading - heldHeading + 540) % 360) - 180; steer = Math.max(-1, Math.min(1, -e / 20)); }
  me = stepDriver(me, { steer, slider: me.lastTurn ? holdAt(me.v, me.grade ?? 0) : holdAt(me.v, me.grade ?? 0), assist: 1 }, world, DT);
  world = withDriver(world, me);
  if (i % 10 === 0) { const p = driverPose(me, world.course); console.log(`t=${t.toFixed(1)} k=${me.k} route=${me.route} s=${me.s.toFixed(1)} off=${me.off.toFixed(2)} psi=${(me.psi*57.3).toFixed(0)}deg v=${(me.v*3.6).toFixed(0)} assist=${(me.assist??0).toFixed(2)} xy=(${p.x.toFixed(1)},${p.y.toFixed(1)}) hdg=${p.heading.toFixed(0)} turn=${me.lastTurn?.verdict ?? "-"}`); }
}
