/* DO AI DRIVERS HAVE SOMEWHERE TO GO? (27 October -- the maintainer: "it's
   key"). Traced in a running sim, not read from the routing code: every car
   on a map for five minutes with the good driver at the wheel as #/map
   runs it, and per car:
     - what it carries that could be a destination (its fields);
     - at every intersection, the exit it took, and whether it arrived in a
       lane that could not make that exit (a `want`, acted on by a lane
       change made FOR it, or a missed turn);
     - how its journey ended: pulled in at the curb at the end of a trip,
       left at the map's edge, retired by density shaping out of sight,
       cleared after a crash, or still driving at the end.
   And, for any intersection approach seen often enough, whether the exits
   chosen there look like a draw (each exit about equally often) or like
   somewhere to be.
   Usage: node tools/measure/destinations.mjs [map=test-loop] [cars=180] [secs=300] [seed=1] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const [id = "test-loop", carsS = "180", secsS = "300", seedS = "1"] = process.argv.slice(2);
const raw = TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(Number(seedS), 50, 2.0, true, Number(carsS), raw, raw.sections?.[0]?.start ?? null, false);
const me0 = me, sc = { me, args: [1], saveWallet: false };
const cars = new Map(), choices = new Map(), fates = {}, fieldsSeen = new Set();
const fate = (k) => { fates[k] = (fates[k] ?? 0) + 1; };
for (let i = 0; i < Number(secsS) / DT; i++) {
  if (!me || me.atEdge) { me = { ...me0 }; w = withDriver(w, me); }
  me = goodStep(me, w, sc, { overtake: true, pace: 1.19 }); sc.me = me;
  const prev = w;
  w = step(withDriver(w, me));
  const now = new Map(w.actors.map((a) => [a.id, a]));
  for (const b of prev.actors) {
    if (b.player || b.parked) continue;
    const a = now.get(b.id);
    let c = cars.get(b.id);
    if (!c) { c = { nodes: [], wants: 0, turnChanges: 0, missed: 0, tripLen: b.tripLen ?? null, start: b.k }; cars.set(b.id, c); for (const k of Object.keys(b)) fieldsSeen.add(k); }
    if (!a) {
      const L = prev.course.at[b.k].layout, p = L.paths[b.route];
      const nearEnd = b.s > p.length - 2 * Math.max(1, b.v ?? 0) * DT - 0.5;
      if (b.crash) fate("cleared after a crash");
      else if (b.leaveAt != null && (b.v ?? 0) < 0.5) fate("pulled in at the end of a trip");
      else if (nearEnd) fate("left at the map's edge");
      else fate("removed mid-road (density shaping retires out of sight)");
      c.ended = true;
      continue;
    }
    /* Crossed a seam: a new intersection, and the route drawn there. */
    if (a.k !== b.k || (a.leg ?? 0) !== (b.leg ?? 0)) {
      const L = w.course.at[a.k].layout, p = L.paths[a.route];
      const exit = L.legs[p.to]?.base ?? p.to, approach = L.legs[p.from]?.base ?? p.from;
      c.nodes.push(`${a.k}:${a.want ? `want ${a.want.to}` : exit}`);
      if (a.want) c.wants++;
      const key = `${a.k}|${approach}`;
      const m = choices.get(key) ?? new Map();
      const chosen = a.want ? a.want.to : exit;
      m.set(chosen, (m.get(chosen) ?? 0) + 1); choices.set(key, m);
    }
    c.turnChanges += Math.max(0, (a.turnChanges ?? 0) - (b.turnChanges ?? 0));
    c.missed += Math.max(0, (a.missedTurns ?? 0) - (b.missedTurns ?? 0));
  }
}
for (const c of cars.values()) if (!c.ended) fate("still driving at the end");
const all = [...cars.values()];
const withTrip = all.filter((c) => c.tripLen != null).length;
console.log(`${id}, ${carsS} cars, ${secsS} s, seed ${seedS}: ${all.length} cars seen`);
console.log(`  fields a car carries that could name a place: ${[...fieldsSeen].filter((k) => /dest|target|place|goal|home|trip|want|plan|leave|park/i.test(k)).join(", ") || "none"}`);
console.log(`  carrying a trip length: ${withTrip} of ${all.length}`);
console.log(`  journeys ended: ${Object.entries(fates).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("; ")}`);
const nodes = all.reduce((s, c) => s + c.nodes.length, 0), wants = all.reduce((s, c) => s + c.wants, 0);
console.log(`  intersections entered ${nodes}; arriving in a lane that could not make the exit drawn ${wants}; lane changes made for a turn ${all.reduce((s, c) => s + c.turnChanges, 0)}; turns missed ${all.reduce((s, c) => s + c.missed, 0)}`);
console.log(`  exits chosen at the busiest approaches (a draw spreads evenly over the exits):`);
for (const [key, m] of [...choices].sort((a, b) => [...b[1].values()].reduce((s, x) => s + x, 0) - [...a[1].values()].reduce((s, x) => s + x, 0)).slice(0, 4)) {
  const tot = [...m.values()].reduce((s, x) => s + x, 0);
  console.log(`    ${key}: ${[...m].map(([e, n]) => `${e} ${(100 * n / tot).toFixed(0)}%`).join(", ")} (${tot})`);
}
const one = all.find((c) => c.nodes.length >= 4);
if (one) console.log(`  one car's journey: from node ${one.start}, ${one.nodes.join(" -> ")}${one.tripLen != null ? ` (trip length ${one.tripLen})` : ""}`);
