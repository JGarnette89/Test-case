/* WHAT THE LOOPS DO (actuated.js): the same map and seed with the lights
   actuated and on their clock -- seconds cars stood at signalled lines,
   crossings, crashes, how often each light changed, and whether two
   phases of one light were ever green together (never).

   Usage: node tools/measure/actuated.mjs [map=test-1] [cars=120] [minutes=5] [seeds=1] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { mapFromBrief } from "../../src/map/brief.js";
import { seedGraph, step, pathOf, waitAt } from "../../src/sim/crossing.js";
import { lightAt } from "../../src/sim/signal.js";
import { BENCH_BRIEF } from "../../src/iso/bench.js";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test-1", carsArg = "120", minArg = "5", seedsArg = "1"] = process.argv.slice(2);
const raw = mapId === "bench" ? mapFromBrief(BENCH_BRIEF, 1) : TEST_MAPS.find((m) => m.id === mapId).build();
const loaded = loadMap(raw);

function run(actuated, seed) {
  let w = seedGraph(seed, 50, loaded, { every: 2.0, target: Number(carsArg), posted: true, actuated });
  let standing = 0, crossings = 0, both = 0, changes = 0;
  const last = {};
  for (let i = 0; i < (Number(minArg) * 60) / DT; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    w = step(w);
    for (const a of w.actors) {
      const L = w.course.at[a.k ?? 0].layout;
      if (!L.signal || a.player) continue;
      const p = pathOf(w, a), b = before.get(a.id);
      if (a.v < 0.3 && !a.crash && a.s <= waitAt(p, a) + 1 && a.s > p.stopAt - 60) standing += DT;
      if (b && b.k === a.k && b.route === a.route && b.s < p.stopAt && a.s >= p.stopAt) crossings++;
    }
    w.course.at.forEach((spot, k) => {
      const sig = spot.layout?.signal;
      if (!sig) return;
      const live = w.lights?.[k]?.live ?? null;
      const greens = sig.phases.filter((bases) => bases.some((b) => lightAt(sig, b, w.t, live) === "green")).length;
      if (greens > 1) both++;
      const now = JSON.stringify(sig.phases.map((bases) => lightAt(sig, bases[0], w.t, live)));
      if (last[k] != null && last[k] !== now) changes++;
      last[k] = now;
    });
  }
  const crashes = (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length;
  return { standing, crossings, both, changes, crashes };
}
const seeds = Array.from({ length: Number(seedsArg) }, (_, i) => i + 1);
for (const actuated of [true, false]) {
  const rs = seeds.map((sd) => run(actuated, sd));
  const sum = (k) => rs.reduce((t, r) => t + r[k], 0);
  console.log(`${mapId} ${actuated ? "actuated" : "on the clock"}: ${(sum("standing") / Math.max(1, sum("crossings"))).toFixed(1)} s stood at a signalled line per crossing (${sum("crossings")} crossings), ${sum("changes")} light changes, ${sum("both")} ticks with two phases green, ${sum("crashes")} crashes`);
}
