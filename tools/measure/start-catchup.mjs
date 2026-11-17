/* CAN SHAPING COMPENSATE FOR A STANDING START? (Jay, 17 Nov 2026.) Per 5 s of the first minute, on test-highway-gen-wide (110) after the screen's own 15 s pre-roll:
   cars in the shaping window, the player's speed, the stream's median speed, and how many cars AHEAD in the window are slower than the player (catchable) vs faster (cannot be caught).
   Usage: node tools/measure/start-catchup.mjs [map] [preroll 0|15] */
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { windowOf } from "../../src/sim/shaping.js";
import { placeOf } from "../../src/sim/placement.js";
import { goodStep } from "../lib/good-driver.mjs";
const id = process.argv[2] ?? "test-highway-gen-wide", pre = Number(process.argv[3] ?? 15);
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
const roadOf = (l) => String(l).split("#")[0];
const T = [0, 5, 10, 20, 30, 45, 60], SEEDS = [1, 2, 3], acc = T.map(() => ({ n: 0, v: 0, med: 0, slower: 0, faster: 0 }));
for (const seed of SEEDS) {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, null, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: pre });
  const sc = { me, args: [1], saveWallet: false };
  for (let n = 0; n <= 60 / DT; n++) {
    const ti = T.indexOf(Math.round(n * DT * 100) / 100);
    if (ti >= 0 && n % Math.round(1 / DT) === 0) {
      const win = windowOf(w, w.actors), cs = [];
      for (const a of w.actors) { if (a.player || a.parked || !win) continue; const at = placeOf(w.course, a.k ?? 0, a.route, a.s); if (!at) continue; const r = roadOf(at.lane);
        let d = null; if (r === win.road) d = at.c - win.at.c; else if (win.ahead.get(r) != null) d = win.ahead.get(r) + at.c; else if (win.behind.get(r) != null) d = -(win.behind.get(r) + ((win.g.len.get(r) ?? 0) - at.c));
        if (d != null) cs.push({ d, v: a.v }); }
      const vs = cs.map((c) => c.v).sort((x, y) => x - y), k = acc[ti];
      k.n += cs.length; k.v += me.v; k.med += vs.length ? vs[vs.length >> 1] : 0; k.slower += cs.filter((c) => c.d > 0 && c.v < me.v).length; k.faster += cs.filter((c) => c.d > 0 && c.v >= me.v).length;
    }
    me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me; w = step(withDriver(w, me));
  }
}
const S = SEEDS.length;
console.log(`${id}, preroll ${pre} s, goodStep driver from rest, ${S} seeds (means)`);
console.log("  t(s)  cars in window  player km/h  stream median km/h  ahead & slower than player  ahead & faster (cannot be caught)");
T.forEach((t, i) => { const k = acc[i]; console.log(`  ${String(t).padStart(3)}   ${(k.n / S).toFixed(0).padStart(8)}   ${(3.6 * k.v / S).toFixed(0).padStart(10)}   ${(3.6 * k.med / S).toFixed(0).padStart(14)}   ${(k.slower / S).toFixed(0).padStart(14)}   ${(k.faster / S).toFixed(0).padStart(24)}`); });
