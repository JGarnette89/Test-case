/* THE CRASH RATE ON THE GENERATED ROAD (DECISIONS 10.140; backlog: the loop-measured findings re-checked). 10.46 and 10.70 said "the highway is far cleaner than test map 1", 3.3 an hour at 150 to 260 cars -- measured on the LOOP, the saturated
   closed road. This drives the page's own world on the generated road (the player driven by the good driver, shaping on, rivals and walkers as the screen builds them) for `minutes` a seed at each car count, and counts the crashes the
   world records (each once), split into those involving the player and those that do not, per hour of driving and per car-hour. Usage: node tools/measure/crash-rate-gen.mjs [cars=100,160] [minutes=10] [seeds=1,2,3] [map=test-highway-gen-wide] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { goodStep } from "../lib/good-driver.mjs";
import { DT } from "../../src/sim/traffic.js";
const [carsArg = "100,160", minArg = "10", seedArg = "1,2,3", mapId = "test-highway-gen-wide"] = process.argv.slice(2);
const def = TEST_MAPS.find((m) => m.id === mapId);
for (const cars of carsArg.split(",").map(Number)) {
  const t = { cars, minutes: 0, carHours: 0, withPlayer: 0, among: 0, perSeed: [] };
  for (const seed of seedArg.split(",").map(Number)) {
    const raw = def.build();
    let { world: w, me } = worldFor(seed, 50, 2.0, true, cars, raw, raw.sections?.[0]?.start ?? null, false, false, { preroll: 15 });
    const sc = { me, args: [1], saveWallet: false }, seen = new Set(); let mine = 0, other = 0;
    for (let i = 0; i < (Number(minArg) * 60) / DT; i++) {
      me = goodStep(me, w, sc, { overtake: true, pace: 0.95 }); sc.me = me; w = step(withDriver(w, me));
      if (me.atEdge) me = { ...me, s: 0, v: 0, atEdge: false };
      t.carHours += w.actors.filter((a) => !a.player).length * DT / 3600;
      for (const c of w.crashes ?? []) { const k = `${c.t}|${c.a}|${c.b}`; if (seen.has(k)) continue; seen.add(k); if (c.a === "player" || c.b === "player" || c.mine) mine++; else other++; }
    }
    t.minutes += Number(minArg); t.withPlayer += mine; t.among += other; t.perSeed.push(`${seed}: ${mine}+${other}`);
  }
  const hrs = t.minutes / 60;
  console.log(`${mapId} ${cars} cars: ${t.minutes} min of drive over seeds ${seedArg} -> crashes with the player ${t.withPlayer} (${(t.withPlayer / hrs).toFixed(2)} an hour), among the traffic ${t.among} (${(t.among / hrs).toFixed(2)} an hour), per car-hour ${((t.withPlayer + t.among) / t.carHours).toExponential(2)}; per seed (player+other): ${t.perSeed.join(", ")}`);
}
