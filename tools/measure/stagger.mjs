// IN FLIGHT 41, the stagger, on the maintainer's recipe (10 November): a signalled turn taken fast enough to leave the lane, then the car driven by hand. Args: leg signal kmh handsoff|hold. DECISIONS 10.64.
import { seedGraph, DT } from "../../src/sim/crossing.js";
import { playerAt, stepDriver, driverPose, withDriver, routeForSignal } from "../../src/sim/drive.js";
import { holdAt } from "../../src/sim/player.js";
import { poseOnGraph } from "../../src/sim/graph.js";
import { pavedAt } from "../../src/sim/surface.js";
import { loadMap } from "../../src/map/load.js";
import { testMap1 } from "../../src/map/samples.js";
const loaded = loadMap(testMap1());
/* REAL=1: the car's real position on (drive.js `world.realPos`, DECISIONS 10.67). Mode "back": once out of the box,
   steered back for the lane the turn was for -- at a point on it 20 m further along than the car -- and then hands off. */
const w0 = { ...seedGraph(1, 50, loaded, { every: 2 }), actors: [], every: 1e9, nextAt: 1e9, ...(process.env.REAL === "1" ? { realPos: true } : {}) };
const leg = process.argv[2] ?? "A-north|end#1", sig = process.argv[3] ?? "right", kmh = Number(process.argv[4] ?? 45), mode = process.argv[5] ?? "handsoff";
const k = w0.course.at.findIndex((s) => s.layout.legs[leg]);
const layout = w0.course.at[k].layout, route = routeForSignal(layout, leg, sig), path = layout.paths[route];
let me = { ...playerAt(w0, k, route), s: path.stopAt - 0.5, v: kmh / 3.6, signal: sig, going: true, accepted: true, off: 0 };
let world = withDriver(w0, me), heldHeading = null, out = null, settledAt = null;
for (let i = 0; i < 20 * 25; i++) {
  const t = i * DT;
  let steer = 0;
  const pz = driverPose(me, world.course);
  if (me.lastTurn && heldHeading == null) { heldHeading = pz.heading; out = t; }
  // "takes control": after leaving the box, either hands off (assist), or steer to keep the world heading they have.
  /* LATE=s: the driver takes control that long after the car leaves the box -- the maintainer's recipe has it well off the road first. */
  if (mode === "back" && heldHeading != null && t - out >= Number(process.env.LATE ?? 0)) {
    /* AIM=straight: not the lane the turn was for but the road straight ahead -- the turn abandoned (DECISIONS 10.65). */
    const aim = process.env.AIM === "straight" ? routeForSignal(layout, leg, null) : route, ap = layout.paths[aim];
    /* The nearest point of the lane aimed for (past its box), and a point on it 20 m further along: the road may bend. */
    let sn = ap.clearAt + 1, dn = Infinity;
    for (let q = ap.clearAt + 1; q <= ap.length; q += 0.5) { const c = poseOnGraph(world.course, k, aim, q), dd = Math.hypot(c.x - pz.x, c.y - pz.y); if (dd < dn) { dn = dd; sn = q; } }
    const tp = poseOnGraph(world.course, k, aim, Math.min(ap.length, sn + 20)), lat = dn;
    const want = (Math.atan2(tp.y - pz.y, tp.x - pz.x) * 180) / Math.PI, e = ((pz.heading - want + 540) % 360) - 180;
    /* Hands off once within 0.6 m of the lane's line and pointing along it: what is left is the assist's. */
    if (Math.abs(lat) < 0.6 && Math.abs(e) < 6) settledAt ??= t;
    steer = settledAt != null ? 0 : Math.max(-1, Math.min(1, -e / 20));
  }
  if (mode === "hold" && heldHeading != null) { const e = ((pz.heading - heldHeading + 540) % 360) - 180; steer = Math.max(-1, Math.min(1, -e / 20)); }
  me = stepDriver(me, { steer, slider: mode === "back" && heldHeading != null && me.v < 12.5 ? 0.8 : holdAt(me.v, me.grade ?? 0), assist: 1 }, world, DT);
  world = withDriver(world, me);
  if (i % 10 === 0) { const p = driverPose(me, world.course); console.log(`t=${t.toFixed(1)} k=${me.k} route=${me.route} s=${me.s.toFixed(1)} off=${me.off.toFixed(2)} psi=${(me.psi*57.3).toFixed(0)}deg v=${(me.v*3.6).toFixed(0)} assist=${(me.assist??0).toFixed(2)} xy=(${p.x.toFixed(1)},${p.y.toFixed(1)}) hdg=${p.heading.toFixed(0)} turn=${me.lastTurn?.verdict ?? "-"} ${me.noLane ? "NO-LANE" : me.lost ? "lost" : "on-route"} paved=${pavedAt(world.course, p)} relocated=${me.relocated ?? 0}${settledAt != null ? " hands-off" : ""}`); }
}
