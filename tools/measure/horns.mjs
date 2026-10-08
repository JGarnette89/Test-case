/* EVERY HORN IN ORDINARY TRAFFIC, AND WHAT IT WAS AT (crossing.js, the
   horn): where the car it was aimed at stood and what it was doing --
   stopped at its line on a green, stopped at a stop sign it had stopped
   at, stopped short of its line, stopped in the box, or moving (a near
   miss) -- and from how far back in the queue it came. For judging that
   horns land on errors, and only on errors.

   Usage: node tools/measure/horns.mjs [map=test-1] [cars=120] [minutes=5] [seeds=2] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, pathOf, waitAt, whatStops, AT_LINE } from "../../src/sim/crossing.js";
import { movementLight } from "../../src/sim/signal.js";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test-1", carsArg = "120", minArg = "5", seedsArg = "2"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
const kinds = {}, examples = {};
let horns = 0, crashes = 0;
for (let seed = 1; seed <= Number(seedsArg); seed++) {
  let w = seedGraph(seed, 50, loaded, { every: 2.0, target: Number(carsArg), posted: true });
  for (let i = 0; i < (Number(minArg) * 60) / DT; i++) {
    const wb = w;
    w = step(w);
    for (const a of w.actors) {
      const b = wb.actors.find((x) => x.id === a.id);
      if (!b || a.honkAt == null || a.honkAt === b.honkAt) continue;
      horns++;
      const t = wb.actors.find((x) => x.id === a.honkTo);
      let kind = "target gone";
      if (t) {
        const p = pathOf(wb, t), L = wb.course.at[t.k ?? 0].layout, ws = whatStops(t, wb);
        const lit = L.signal ? movementLight(L.signal, L.legs[p.from]?.base, p.intent, wb.t, wb.lights?.[t.k ?? 0]?.live) : null;
        const toLine = waitAt(p, t) - t.s;
        if ((t.v ?? 0) >= 0.5) kind = "moving (near miss)";
        else if (t.s > p.stopAt && t.s < p.clearAt) kind = "stopped in the box";
        else if (toLine <= AT_LINE && lit === "green") kind = `at its line on a green${t.wake != null ? " (not yet noticed)" : ""}`;
        else if (toLine <= AT_LINE && L.place.control[p.from] === "stop") kind = "at a stop sign it had stopped at";
        else if (toLine <= AT_LINE) kind = `at its line, light ${lit ?? "none"}${ws.held ? ", held" : ""}`;
        else kind = `stopped ${toLine.toFixed(0)} m short of its line${ws.held ? ", held" : ""}${lit ? `, light ${lit}` : ""}`;
        kind = kind.replace(/\d+ m short/, (m) => (Number(m.split(" ")[0]) > 10 ? "well short" : "a little short"));
      }
      const back = a.honkTo === (a.leadId ?? null) ? "directly behind" : "further back";
      const key = `${kind} -- ${back}`;
      kinds[key] = (kinds[key] ?? 0) + 1;
      examples[key] ??= `${a.id} (caution ${a.caution.toFixed(2)}) -> ${a.honkTo} at ${a.honkAt.toFixed(1)} s, seed ${seed}`;
    }
  }
  crashes += (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-") && !String(c.b).startsWith("ped-")).length;
}
console.log(`${mapId}: ${horns} horns in ${Number(minArg) * Number(seedsArg)} minutes at ${carsArg} cars; ${crashes} vehicle crashes`);
for (const [k, n] of Object.entries(kinds).sort((x, y) => y[1] - x[1])) console.log(`  ${String(n).padStart(4)}  ${k}    e.g. ${examples[k]}`);
