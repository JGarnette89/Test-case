/* THE GREEN, NOTICED, AND THE HORN (crossing.js `noticeAfter`,
   `patienceOf`): on a signalled map, how long the car at the head of a
   queue takes to start once its light goes green, by its observation
   deficit; how often somebody behind honks, and who -- by confidence and
   compliance; and crashes.

   Usage: node tools/measure/greens.mjs [map=test-1] [cars=120] [minutes=5] [seeds=2] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { deficitOf } from "../../src/core/driver.js";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test-1", carsArg = "120", minArg = "5", seedsArg = "2"] = process.argv.slice(2);
const loaded = loadMap(TEST_MAPS.find((m) => m.id === mapId).build());
const starts = { sharp: [], middling: [], poor: [] }, honkers = [];
let honks = 0, crashes = 0, greens = 0, woken = 0, deserved = 0;
for (let seed = 1; seed <= Number(seedsArg); seed++) {
  let w = seedGraph(seed, 50, loaded, { every: 2.0, target: Number(carsArg), posted: true });
  const greenAt = new Map(), honkedSince = new Map();
  for (let i = 0; i < (Number(minArg) * 60) / DT; i++) {
    const before = new Map(w.actors.map((a) => [a.id, a]));
    w = step(w);
    for (const a of w.actors) {
      const b = before.get(a.id);
      if (!b || a.player) continue;
      /* Going straight: a turn waits on the traffic as well as the light, which is not noticing. */
      if (b.heldRed && !a.heldRed) { greens++; if (w.course.at[a.k ?? 0].layout.paths[a.route]?.intent === "straight") greenAt.set(a.id, w.t); }
      if (a.honkAt != null && a.honkAt !== b.honkAt) { honks++; const t0 = before.get(a.honkTo); if (t0 && (t0.wake != null || t0.player)) deserved++; honkers.push(a); honkedSince.set(a.honkTo, a.honkAt); }
      if (greenAt.has(a.id) && a.v > 0.5) {
        const d = deficitOf(a.ratings, "observation").deficit;
        (d < 0.2 ? starts.sharp : d < 0.6 ? starts.middling : starts.poor).push(w.t - greenAt.get(a.id));
        if (honkedSince.has(a.id) && honkedSince.get(a.id) >= greenAt.get(a.id)) woken++;
        greenAt.delete(a.id);
      }
    }
  }
  crashes += (w.crashes ?? []).filter((c) => !String(c.a).startsWith("ped-")).length;
}
const q = (xs, f) => { const s = xs.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(f * (s.length - 1))].toFixed(1) : "-"; };
for (const [k, xs] of Object.entries(starts)) console.log(`${k} observers: ${xs.length} starts on a green going straight, p10/p50/p90/max ${q(xs, 0.1)}/${q(xs, 0.5)}/${q(xs, 0.9)}/${q(xs, 1)} s`);
console.log(`${greens} greens at the head of a queue; ${honks} honks (${deserved} at a driver who had not yet noticed the green); ${woken} drivers started after being honked at; ${crashes} vehicle crashes`);
const band = (c) => (c < 0.5 ? "bold" : c <= 1 ? "sound" : "timid");
const by = {};
for (const h of honkers) { const k = `${band(h.caution)}, compliance ${h.ratings.compliance >= 0.8 ? "high" : "low"}`; by[k] = (by[k] ?? 0) + 1; }
console.log("who honks:", JSON.stringify(by));
