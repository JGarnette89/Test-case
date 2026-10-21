/* THE CRASHES AT TEST MAP 1'S CROSSROADS (22 October). The maintainer,
   watching at 260 cars, look-away on, seed 1: "a lot of similar crashes at
   the turn lanes" -- at 67, 70, 74 and 91 s. The world as #/map builds it
   for watching, replayed; each crash with both cars' movements, speeds,
   whether either was looking away at the moment, and what each was held by.
   Usage: node tools/measure/crash-replay.mjs [cars=260] [secs=120] [lookAway=1] [seed=1] */
import { worldFor } from "../../src/sim/scene.js";
import { step, whatStops, pathOf } from "../../src/sim/crossing.js";
import { lookingAway } from "../../src/sim/attention.js";
import { DT } from "../../src/sim/traffic.js";
const [carsArg = "260", secsArg = "120", lookArg = "1", seedArg = "1"] = process.argv.slice(2);
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), null, null, lookArg === "1");
const t0 = w.t;
for (let n = 0; n < Number(secsArg) / DT; n++) {
  const prev = w;
  const c0 = (w.crashes ?? []).length;
  w = step(w);
  for (const c of (w.crashes ?? []).slice(c0)) {
    const d = (id) => {
      const a = prev.actors.find((x) => x.id === id);
      if (!a) return `${id} (not in the tick before)`;
      const L = prev.course.at[a.k].layout, p = pathOf(prev, a);
      const v = whatStops(a, prev);
      const away = lookingAway(prev.t, a);
      return `${id} k${a.k} ${p.intent} ${a.route} s${a.s.toFixed(1)} (line ${p.stopAt.toFixed(0)}, clear ${p.clearAt.toFixed(0)}) v${a.v.toFixed(1)} ${a.going ? "going" : ""}${a.lc ? " LANE-CHANGING" : ""} control ${L.place.control[p.from] ?? "-"}${L.signal ? " (signal)" : ""} | held by ${v.leader?.id ?? "-"}@${Number.isFinite(v.gap) ? v.gap.toFixed(1) : "-"} held=${!!v.held} | looking away ${away > 0 ? `YES (${away.toFixed(2)} s into a ${(a.lag ?? 0).toFixed(2)} s glance)` : "no"}`;
    };
    console.log(`t=${(w.t - t0).toFixed(1)} s crash at k${(prev.actors.find((x) => x.id === c.a) ?? {}).k}:\n   A ${d(c.a)}\n   B ${d(c.b)}`);
  }
}
console.log(`${(w.crashes ?? []).length} crashes in ${secsArg} s, ${carsArg} cars, look-away ${lookArg === "1" ? "on" : "off"}, seed ${seedArg}`);
