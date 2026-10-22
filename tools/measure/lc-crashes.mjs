/* CRASHES AT THE PLAYER'S DENSITY, CLASSIFIED (22 October; DECISIONS 10.17's
   gates). The endless highway with a player cruising at the maintainer's
   119%, shaping on or off: every crash, and whether either car was mid lane
   change, and whether either was placed by shaping in the last 30 s.
   Usage: node tools/measure/lc-crashes.mjs [shape=1] [seeds=1-8] [cars=280] [secs=300] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { changing } from "../../src/sim/lanechange.js";
import { withDriver } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";
const [shapeArg = "1", seedArg = "1,2,3,4,5,6,7,8", carsArg = "280", secsArg = "300"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === "test-loop").build();
const tally = { total: 0, lc: 0, placed: 0, player: 0 };
for (const seed of seedArg.split(",").map(Number)) {
  let { world: w, me } = worldFor(seed, 50, 2.0, true, Number(carsArg), raw, raw.sections?.[0]?.start ?? null, false);
  w = { ...w, shape: shapeArg === "1" };
  const sc = { me, args: [1], saveWallet: false };
  for (let n = 0; n < Number(secsArg) / DT; n++) {
    me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me; w = withDriver(w, me);
    const prev = w, c0 = (w.crashes ?? []).length;
    w = step(w);
    for (const c of (w.crashes ?? []).slice(c0)) {
      const A = prev.actors.find((x) => x.id === c.a), B = prev.actors.find((x) => x.id === c.b);
      tally.total++;
      if ([A, B].some((x) => x && changing(x.lc, prev.t + 1e-9) || (x?.lc && prev.t - x.lc.t0 < 6))) tally.lc++;
      if ([A, B].some((x) => x?.placed != null && prev.t - x.placed < 30)) tally.placed++;
      if ([A, B].some((x) => x?.player)) tally.player++;
    }
  }
}
console.log(`endless highway, ${carsArg} cars, 119%, shaping ${shapeArg === "1" ? "on" : "off"}, seeds ${seedArg}, ${secsArg} s each: ${tally.total} crashes -- ${tally.lc} with a lane change in progress or just done, ${tally.placed} with a car placed in the last 30 s, ${tally.player} with the player`);
