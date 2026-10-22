/* WHO YIELDS TO WHOM ON A GREEN (22 October, following box-hold.mjs). At test
   map 1's signal, every tick a head car stands at its line with the light
   letting it go and is held by right of way: for each car blockedBy names,
   the pair -- my movement, theirs, where they come from relative to me
   (opposite / from my left / from my right / same road), and their state.
   Usage: node tools/measure/green-holds.mjs [cars=260] [secs=300] [seed=1] [lookAway=0] */
import { worldFor } from "../../src/sim/scene.js";
import { step, whatStops, blockedBy } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const [carsArg = "260", secsArg = "300", seedArg = "1", lookArg = "0"] = process.argv.slice(2);
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), null, null, lookArg === "1");
const K = w.course.at.findIndex((n) => n.layout.signal), L = w.course.at[K].layout;
const baseOf = (leg) => L.legs[leg]?.base ?? leg;
const bearing = (leg) => L.legs[leg]?.bearing ?? L.legs[leg]?.heading ?? null;
const rel = (a, b) => {
  if (baseOf(a) === baseOf(b)) return "same road";
  const x = bearing(a), y = bearing(b);
  if (x == null || y == null) return "?";
  const d = ((((y - x) % 360) + 540) % 360) - 180;
  return Math.abs(d) > 135 ? "opposite" : d > 0 ? "from one side (+)" : "from the other (-)";
};
const where = (b) => { const q = L.paths[b.route]; if (!q || (b.k ?? 0) !== K) return "elsewhere"; if (b.s > q.clearAt) return "past the box"; if (b.s > q.stopAt) return "in the box"; if (b.going) return "launched"; if (b.stoppedAt != null) return "standing at their line"; return "approaching"; };
const tally = new Map();
let n = 0;
for (let i = 0; i < Number(secsArg) / DT; i++) {
  w = step(w);
  for (const a of w.actors) {
    if ((a.k ?? 0) !== K || a.player) continue;
    const p = L.paths[a.route];
    if (!p || a.stoppedAt == null || a.going || a.v > 0.5) continue;
    const v = whatStops(a, w);
    if (v.red || v.hold || v.queued || v.leader?.id !== "line") continue;
    for (const b of w.actors) {
      if (b.id === a.id || !blockedBy(a, b, L, a.caution, w.t, w.lights?.[K]?.live ?? null)) continue;
      const q = L.paths[b.route]; if (!q) continue;
      const k = `${p.intent.padEnd(8)} yields to ${q.intent.padEnd(8)} ${rel(p.from, q.from).padEnd(18)} ${where(b)}`;
      tally.set(k, (tally.get(k) ?? 0) + 1); n++;
    }
  }
}
console.log(`test map 1's signal, ${carsArg} cars, ${secsArg} s, seed ${seedArg}, look-away ${lookArg === "1" ? "on" : "off"}: ${n} (held car, blocker) pairs`);
for (const [k, c] of [...tally].sort((x, y) => y[1] - x[1]).slice(0, 25)) console.log(`   ${(100 * c / n).toFixed(1).padStart(5)}%  ${k}`);
