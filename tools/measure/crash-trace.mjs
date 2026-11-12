/* WHO CRASHED, AND WHAT WERE THEY DOING? (12 November, DECISIONS 10.70.) Replays `verify-checks` section 5 exactly (`drive("test-1", 260, 180)`: test map 1, 260 cars, three minutes, checks on, with the
   scripted good driver in the world) and, for every crash the world records, prints the two cars' state a second before and at the tick: route, s, speed, lane-change state, whether either is the player.
   Usage: node tools/measure/crash-trace.mjs [map=test-1] [cars=260] [secs=180] [seed=1]   (run in the tree under test). Prints; asserts nothing. */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";

const [id = "test-1", cars = 260, secs = 180, seed = 1] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(+seed, 50, 2.0, true, +cars, raw, raw.sections?.[0]?.start ?? null, false, false, { checks: true });
const me0 = me, sc = { me, args: [1], saveWallet: false };
const hist = [];   // the last second of worlds
const brief = (a) => a && ({ id: a.id, player: !!a.player, k: a.k, route: a.route, s: +a.s.toFixed(1), v: +(a.v * 3.6).toFixed(1) + " km/h", lc: a.lc ? { merge: !!a.lc.merge, exit: !!a.lc.exit, mandatory: !!a.lc.mandatory, gap: a.lc.gap != null ? +a.lc.gap.toFixed(1) : null, tight: a.lc.tight != null ? +a.lc.tight.toFixed(2) : null, missed: !!a.lc.missed } : null, kind: a.kind, going: !!a.going, stoppedAt: a.stoppedAt ?? null });
let seen = 0;
for (let i = 0; i < +secs / DT; i++) {
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
  const prev = w;
  w = step(withDriver(w, me));
  hist.push(prev); if (hist.length > 21) hist.shift();
  const cr = w.crashes ?? [];
  while (seen < cr.length) {
    const c = cr[seen++];
    const at = (world, id) => world.actors.find((x) => x.id === id);
    console.log(`CRASH at t=${w.t.toFixed(2)} s  (striker ${c.striker ?? "-"})  a=${c.a} b=${c.b}  at=${JSON.stringify(c.at)}`);
    for (const lag of [20, 10, 0]) { const ww = hist[Math.max(0, hist.length - 1 - lag)] ?? prev; console.log(`  ${lag / 20} s before:`, JSON.stringify([brief(at(ww, c.a)), brief(at(ww, c.b))])); }
  }
}
console.log(`done: seed ${seed}: ${(w.crashes ?? []).length} crash(es) in ${secs} s`);
