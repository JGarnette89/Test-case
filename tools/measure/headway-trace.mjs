/* The following readout (sim/drive.js headwayOf) against the cars poses, sample by sample, every disagreement printed with where the player and the car are (SIMULATOR 1.2.20). node tools/measure/headway-trace.mjs [map=test-loop] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, headwayOf, driverPose } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
import { placeOf } from "../../src/sim/placement.js";
const why = (me, w, carId) => { const pa = placeOf(w.course, me.k ?? 0, me.route, me.s); const c = w.actors.find((a) => a.id === carId); const pc = c && placeOf(w.course, c.k ?? 0, c.route, c.s); return `[player ${pa ? pa.lane : "IN BOX"} off ${(me.off ?? 0).toFixed(2)}; car ${pc ? pc.lane : "IN BOX"}${c?.lc ? " CHANGING" : ""}]`; };
const id = process.argv[2] ?? "test-loop";
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(1, 50, 2.0, true, 180, raw, raw.sections?.[0]?.start ?? null, false);
w = { ...w, shape: id === "test-loop" };
const me0 = me, sc = { me, args: [1], saveWallet: false };
let changer = 0, n = 0, both = 0, onlyA = 0, onlyB = 0, worst = 0, diffId = 0; const bad = [];
for (let i = 0; i < 20 * 240; i++) {
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; w = step(withDriver(w, me));
  if (i % 10) continue;
  n++;
  const hw = headwayOf(me, w);
  /* Independent: by poses. */
  const p = poseOf(w, me), h = (p.rot * Math.PI) / 180, ux = Math.cos(h), uy = Math.sin(h);
  let best = null;
  for (const a of w.actors) {
    if (a.player || a.parked) continue;
    const q = poseOf(w, a), dx = q.x - p.x, dy = q.y - p.y, along = dx * ux + dy * uy, side = -dx * uy + dy * ux;
    if (along - (p.length + q.length) / 2 < 0 || Math.abs(side) > 1.8 || Math.abs((q.z ?? 0) - (p.z ?? 0)) > 2) continue;
    const clear = along - (p.length + q.length) / 2;
    if (!best || clear < best.clear) best = { clear, id: a.id };
  }
  const indep = best && me.v >= 2 && best.clear / me.v < 5 ? best : null;
  if (hw && w.actors.find((a) => a.id === hw.id)?.lc && (!indep || indep.id !== hw.id)) { changer++; continue; }
  if (hw && indep) { both++; if (hw.id !== indep.id) diffId++; const e = Math.abs(hw.clear - indep.clear); if (hw.id === indep.id) worst = Math.max(worst, e); if (hw.id !== indep.id && bad.length < 40) bad.push(`t ${w.t.toFixed(1)} hw ${hw.id} ${hw.clear.toFixed(1)} indep ${indep.id} ${indep.clear.toFixed(1)} ${why(me, w, indep.id)}`); }
  else if (hw) { onlyA++; if (bad.length < 40) bad.push(`t ${w.t.toFixed(1)} only readout ${hw.id} ${hw.clear.toFixed(1)} m ${why(me, w, hw.id)}`); }
  else if (indep) { onlyB++; if (bad.length < 40) bad.push(`t ${w.t.toFixed(1)} only poses ${indep.id} ${indep.clear.toFixed(1)} m ${why(me, w, indep.id)}`); }
}
console.log(`${id}: ${n} samples; readout naming a changer the poses do not (the sim's both-lanes rule) ${changer}; both ${both} (other car ${diffId}, worst gap error on the same car ${worst.toFixed(2)} m); readout only ${onlyA}; poses only ${onlyB}`);
console.log(bad.join("\n"));
