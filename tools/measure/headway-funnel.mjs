/* verify-headway's drive, over several seeds, with what the check's two floors
   count split out: how often the readout is shown, and how often that readout is
   a car further away in a straight line than the gap it reports -- a phantom, the
   IN FLIGHT 39 misreading (straight line beyond gap plus half-lengths plus 5 m,
   tools/measure/phantom-leader.mjs). Written 4 November, to decide whether the
   branch's 20 of 240 and 8 comparable is too few samples or a gauge that broke.
   node tools/measure/headway-funnel.mjs [seeds, default 1,2,3,4,5,6] [cars, default 180] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, poseOf } from "../../src/sim/crossing.js";
import { withDriver, headwayOf } from "../../src/sim/drive.js";
import { placeOf } from "../../src/sim/placement.js";
import { goodStep } from "../lib/good-driver.mjs";

const seeds = (process.argv[2] ?? "1,2,3,4,5,6").split(",").map(Number), CARS = Number(process.argv[3] ?? 180);
function drive(id, seed, secs) {
  const raw = TEST_MAPS.find((m) => m.id === id).build();
  let { world: w, me } = worldFor(seed, 50, 2.0, true, CARS, raw, raw.sections?.[0]?.start ?? null, false);
  const me0 = me, sc = { me, args: [seed], saveWallet: false };
  const o = { seed, samples: 0, shown: 0, phantom: 0, sound: 0, agree: 0, shownNoPose: 0, worst: 0, moving: 0 };
  for (let i = 0; i < secs * 20; i++) {
    if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
    me = goodStep(me, w, sc, { overtake: true, pace: 1.19 });
    sc.me = me;
    w = step(withDriver(w, me));
    if (i % 10) continue;
    o.samples++;
    if (me.v >= 2) o.moving++;
    const hw = headwayOf(me, w);
    const p = poseOf(w, me);
    if (hw) {
      o.shown++;
      const c = w.actors.find((a) => a.id === hw.id);
      if (c) { const q = poseOf(w, c); if (Math.hypot(q.x - p.x, q.y - p.y) > hw.clear + (p.length + q.length) / 2 + 5) o.phantom++; }
    }
    const h = (p.rot * Math.PI) / 180, ux = Math.cos(h), uy = Math.sin(h);
    let best = null;
    for (const a of w.actors) {
      if (a.player || a.parked) continue;
      const q = poseOf(w, a), dx = q.x - p.x, dy = q.y - p.y, along = dx * ux + dy * uy, side = -dx * uy + dy * ux;
      const clear = along - (p.length + q.length) / 2;
      if (clear < 0 || Math.abs(side) > 1.8 || Math.abs((q.z ?? 0) - (p.z ?? 0)) > 2) continue;
      if (!best || clear < best.clear) best = { clear, a };
    }
    if (!best || me.v < 2 || best.clear / me.v >= 5) continue;
    const pm = placeOf(w.course, me.k ?? 0, me.route, me.s), pa = placeOf(w.course, best.a.k ?? 0, best.a.route, best.a.s);
    if (!pm || !pa || pm.lane !== pa.lane || best.a.lc || best.clear > 40) continue;
    o.sound++;
    if (hw && hw.id === best.a.id && Math.abs(hw.clear - best.clear) < 0.5) { o.agree++; o.worst = Math.max(o.worst, Math.abs(hw.clear - best.clear)); }
  }
  return o;
}
const out = seeds.map((s) => drive("city", s, 120));
console.table(out);
const sum = (k) => out.reduce((n, r) => n + r[k], 0);
console.log(`city, ${seeds.length} seeds: shown ${sum("shown")} of ${sum("samples")}, phantoms among shown ${sum("phantom")}; comparable ${sum("sound")}, agree ${sum("agree")}, worst ${Math.max(...out.map((r) => r.worst)).toFixed(2)} m; floors per drive: shown 24, comparable 20`);
