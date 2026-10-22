/* IS THE JUNCTION ONE LOCK? (the maintainer, 22 October: "no car even
   advanced past the stop line until the late driver cleared the whole
   intersection"). At test map 1's signalled crossroads, every tick, every
   car standing at its own line at the head of its lane with no red and no
   hold on it -- its light lets it go -- and still not going: what holds
   it (whatStops), whether the holder is in the box, whether the holder's
   path CONFLICTS with its own (graph conflict table), and how many cars
   in the box conflict with it at all. A head car held while nothing in
   the box crosses its path is the junction behaving as one lock.
   Usage: node tools/measure/box-hold.mjs [cars=260] [secs=300] [seed=1] [lookAway=0] */
import { worldFor } from "../../src/sim/scene.js";
import { step, whatStops, conflictOf, blockedBy } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";

const [carsArg = "260", secsArg = "300", seedArg = "1", lookArg = "0"] = process.argv.slice(2);
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), null, null, lookArg === "1");
const K = w.course.at.findIndex((n) => n.layout.signal);
const L = w.course.at[K].layout;
const tally = new Map();
const add = (k) => tally.set(k, (tally.get(k) ?? 0) + 1);
let heads = 0;
const examples = [];
for (let i = 0; i < Number(secsArg) / DT; i++) {
  w = step(w);
  const box = w.actors.filter((a) => (a.k ?? 0) === K && (() => { const p = L.paths[a.route]; return p && a.s > p.stopAt && a.s < p.clearAt; })());
  for (const a of w.actors) {
    if ((a.k ?? 0) !== K || a.player) continue;
    const p = L.paths[a.route];
    if (!p || a.stoppedAt == null || a.going || a.v > 0.5) continue;
    const v = whatStops(a, w);
    if (v.red || v.hold || v.queued) continue;
    heads++;
    const lid = v.leader?.id;
    const leader = lid ? w.actors.find((x) => x.id === lid) : null;
    const inBox = leader ? box.includes(leader) : false;
    const crossing = box.filter((b) => b.id !== a.id && conflictsOf(a.route, b.route)).length;
    const k = !v.held && !lid ? "free (about to go)"
      : leader && inBox ? (conflictsOf(a.route, leader.route) ? "held by a car in the box whose path crosses mine" : "HELD BY A CAR IN THE BOX WHOSE PATH DOES NOT CROSS MINE")
      : leader && (leader.k ?? 0) !== K ? "held by a car at the next node (the exit queue)"
      : leader ? `held by a car outside the box (${(leader.s > L.paths[leader.route].clearAt) ? "past it" : "short of its line"}${conflictsOf(a.route, leader.route) ? ", crossing" : ", not crossing"})`
      : lid === "line" ? (() => {
          /* Held at the line by right of way: whom does blockedBy name, and where are they? */
          const by = w.actors.filter((b) => b.id !== a.id && blockedBy(a, b, L, a.caution, w.t, w.lights?.[K]?.live ?? null));
          if (!by.length) return "held at the line, blockedBy names nobody (dawdling, or the light read differently)";
          const where = (b) => { const q = L.paths[b.route]; if (!q || (b.k ?? 0) !== K) return "elsewhere"; if (b.s > q.clearAt) return "past the box"; if (b.s > q.stopAt) return "IN THE BOX"; if (b.going) return "launched, short of the box"; if (b.stoppedAt != null) return "standing at their own line"; return "approaching"; };
          const kinds = [...new Set(by.map(where))].sort().join(" + ");
          if (examples.length < 12 && kinds === "IN THE BOX") { const b = by[0], q = L.paths[b.route]; examples.push(`t ${w.t.toFixed(1)} ${a.id} ${p.intent} from ${p.from} held by ${by.length} in the box, e.g. ${b.id} ${q.intent} from ${q.from} v ${b.v.toFixed(1)} s ${(b.s - q.stopAt).toFixed(1)} m into a ${(q.clearAt - q.stopAt).toFixed(0)} m box`); }
          return `yielding at the line to: ${kinds}`;
        })()
      : lid ? `held by '${lid}'` : v.held ? `gap judgement (box: ${box.length} cars, ${crossing} crossing my path)` : "other";
    add(k);
    if (k.startsWith("HELD BY") && examples.length < 6) examples.push(`t ${w.t.toFixed(1)} ${a.id} ${p.intent} from ${p.from} held by ${lid} (${L.paths[leader.route].intent} from ${L.paths[leader.route].from}, s ${leader.s.toFixed(1)} of box ${L.paths[leader.route].stopAt.toFixed(0)}-${L.paths[leader.route].clearAt.toFixed(0)})`);
  }
}
/* The sim's own conflict test, read both ways. */
function conflictsOf(r1, r2) { return !!(conflictOf(L, r1, r2) || conflictOf(L, r2, r1)); }
console.log(`test map 1's signal (node ${K}), ${carsArg} cars, ${secsArg} s, seed ${seedArg}, look-away ${lookArg === "1" ? "on" : "off"}: ${heads} head-car-ticks standing at the line with the light letting them go`);
for (const [k, n] of [...tally].sort((x, y) => y[1] - x[1])) console.log(`   ${(100 * n / heads).toFixed(1).padStart(5)}%  ${k}`);
for (const e of examples) console.log("   e.g. " + e);
