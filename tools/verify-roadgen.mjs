/* THE GENERATED HIGHWAY (14 November, DECISIONS 10.73): the road is a pure function of distance and a seed, bounded so it cannot cross itself, made of transitions, legible, and an ordinary map that loads and drives. The expectations are stated here, not read from roadgen.js's table (a check reading the code's constant cannot see it wrong); the drama floors are [invented] and mark the generator's purpose, not a measured truth -- the instrument for taste is the maintainer driving it. */
import { roadgen, lineOf, sitesOf, ROAD } from "../src/map/roadgen.js";
import { loadMap } from "../src/map/load.js";
import { seedGraph, step } from "../src/sim/crossing.js";
let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) bad++; };
const hw = (m) => m.roads.filter((r) => r.kind === "highway");
const sameRoad = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("1. A FUNCTION OF DISTANCE: the same road for the same seed, and a longer road begins with the shorter one");
const A = roadgen(), A2 = roadgen(), S = roadgen({ LENGTH: 12000 });
check(sameRoad(A, A2), "the same seed gives the same map, byte for byte");
const sS = hw(S), aById = new Map(hw(A).map((r) => [r.id, r])), short = sS.slice(0, -1);   // all but the short road's last, which ends where it ends
const prefixOk = short.every((r) => { const o = aById.get(r.id); return o && sameRoad(o.points, r.points) && o.speed === r.speed; });
check(short.length >= 6 && prefixOk, `a 12 km road and a 20 km road share every road but the short one's last identically (${short.length} roads, up to ${(short.at(-1).points.at(-1).x / 1000).toFixed(1)} km east: same ids, points and speeds)`);
{ const a = lineOf({ LENGTH: 12000 }).pts, b = lineOf().pts; const same = a.every((p, i) => p.x === b[i].x && p.y === b[i].y && p.z === b[i].z && p.h === b[i].h);
  check(same, `and the centreline itself is identical for the first 12 km (${a.length} points: x, y, z and heading): a calm zone past the short road's end shapes the bends before it, so interchanges must not depend on where a stretch ends`); }
check(!sameRoad(roadgen({ SEED: 2 }).roads[0].points, A.roads[0].points) || !sameRoad(roadgen({ SEED: 2 }).roads[3].points, A.roads[3].points), "and a different seed gives a different road");

console.log("2. THE HEADING IS BOUNDED, SO THE ROAD CANNOT CROSS ITSELF");
for (const [name, o] of [["interchanges every 5 km", {}], ["none", { INTERCHANGES: 0 }], ["seed 7", { SEED: 7 }], ["seed 31, 60 km", { SEED: 31, LENGTH: 60000 }]]) {
  const g = lineOf(o); let maxH = 0, mono = true; for (let i = 1; i < g.pts.length; i++) { maxH = Math.max(maxH, Math.abs(g.pts[i].h)); if (g.pts[i].x <= g.pts[i - 1].x) mono = false; }
  check(maxH <= 70.01 * Math.PI / 180 && mono, `${name}: the heading never passes 70 degrees (${(maxH * 180 / Math.PI).toFixed(1)}) and x only increases over ${(g.pts.length * 4 / 1000).toFixed(0)} km`);
}

for (const [name, o] of [["with interchanges", {}], ["none", { INTERCHANGES: 0 }], ["60 km", { LENGTH: 60000, SEED: 5 }]]) {
  const zs = lineOf(o).pts.map((p) => p.z), lo = Math.min(...zs), hi = Math.max(...zs);
  check(lo >= -25 && hi <= 150, `${name}: the road stays in a height band (${lo.toFixed(0)} to ${hi.toFixed(0)} m, within -25 to 150): it does not drift away downhill for ever`);
}
console.log("3. IDS COME FROM DISTANCE");
const g0 = lineOf(), at = (u) => g0.pts[Math.round(u / 4)];
check(hw(A).every((r) => { const a = +r.id.slice(3), p = at(a); return /^hw-\d+$/.test(r.id) && Math.abs(r.points[0].x - p.x) < 1e-3 && Math.abs(r.points[0].y - p.y) < 1e-3; }), "every highway road is hw-<metres> and begins at exactly that distance along the line");
check(A.roads.filter((r) => /^(on|off)-/.test(r.id)).every((r) => /^(on|off)-\d+$/.test(r.id)), "and every ramp is on-<metres> or off-<metres>");

console.log("4. IT LOADS AS AN ORDINARY MAP");
for (const [name, o] of [["with interchanges", {}], ["without", { INTERCHANGES: 0 }]]) {
  const m = roadgen(o), L = loadMap(m), msgs = (L.warnings ?? []).map((w) => w.msg ?? w.message ?? JSON.stringify(w));
  check(L.ok === true, `${name}: loads, not refused`);
  check(!msgs.some((t) => /acceleration lane needs|dropped|refused|cannot/.test(t)), `${name}: no warning about an acceleration lane, a drop or a refusal (${msgs.filter((t) => !/joined road|bend of radius/.test(t)).length} others)`);
  check(!msgs.some((t) => /bend of radius/.test(t) && /posted speed lowered/.test(t)) || msgs.filter((t) => /bend of radius/.test(t)).length <= 2, `${name}: the posted speeds already follow the bends (the loader lowers at most two)`);
}

console.log("5. THE CALM AROUND AN INTERCHANGE: straight and level");
{
  const g = lineOf(), z = g.zones; let ok = true, n = 0;
  for (const [a, b] of z) for (let u = Math.ceil(a / 4) * 4; u <= Math.min(b, 19996); u += 4) { const p = g.pts[Math.round(u / 4)]; if (p.k !== 0 || p.g !== 0) ok = false; n++; }
  check(z.length >= 3 && ok, `${z.length} interchanges, ${n} points held straight (curvature 0) and level (grade 0)`);
}

console.log("6. DRAMA, AND LEGIBILITY AS A REQUIREMENT (floors are [invented]: the purpose, not a measurement)");
{
  const g = lineOf({ INTERCHANGES: 0 }), p = g.pts, N = p.length;
  const peak = Math.max(...p.map((q) => Math.abs(q.g)));
  check(peak <= 0.0775 && peak >= 0.05, `the steepest grade the player sees is ${(100 * peak).toFixed(1)}%: legible (at least 5%) and one the engine can hold at 100 km/h (at most 7.75%, player.js)`);
  /* a REVERSAL is the curvature passing through zero FAST: from one bend straight into the other, at least 2e-5 per metre of travel (an S-bend's 90 m swing between 1/700 m bends is 3e-5; a sweep easing out and another easing in the other way is 7e-6 and does not count) */
  let reversals = 0; for (let i = 1; i < N; i++) if (p[i].k * p[i - 1].k < 0 && Math.abs(p[i].k - p[i - 1].k) / 4 >= 2e-5) reversals++;
  check(reversals >= 5, `the lean swings straight from one side to the other (a fast reversal of curvature) ${reversals} times in 20 km (at least 5): the transitions the eye reads`);
  const vacc = []; for (let i = 6; i < N - 6; i++) { const dg = (p[i + 6].g - p[i - 6].g) / 48; vacc.push(-dg * 27.8 * 27.8); }   // the vertical acceleration at 100 km/h over a 48 m chord: a crest is where the road drops away under the car
  let reg = 0, inC = false; for (const v of vacc) { if (v > 0.45 && !inC) { reg++; inC = true; } else if (v < 0.2) inC = false; }
  check(reg >= 8, `${reg} crests unload the car by 0.45 m/s^2 or more at 100 km/h over 20 km (at least 8): crests that register, not slopes`);
  const sustained = p.filter((q) => Math.abs(q.k) > 1 / 900).length / N;
  check(sustained < 0.5, `less than half the road (${(100 * sustained).toFixed(0)}%) is held in a bend: change, not hold`);
  const flat = p.filter((q) => Math.abs(q.g) < 0.005).length / N;
  check(flat < 0.35, `no tabletop: ${(100 * flat).toFixed(0)}% of the road is within half a percent of level (the loop is 70%, the 403 map 59%)`);
}

console.log("5b. THE INTERCHANGES ARE COMMON AND VARY (Jay, DECISIONS 10.74)");
{ const S = sitesOf({ ...ROAD, LENGTH: 60000 }, 60000), kinds = new Set(S.map((s) => s.kind)), gaps = S.slice(1).map((s, i) => s.nodes[0].u - S[i].end), sd = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  check(S.length >= 15, `${S.length} interchanges in 60 km (at least 15: one every 4 km or closer): merging happens everywhere`);
  check(kinds.size === 3, `all three kinds come (${[...kinds].join(", ")}): an exit and an entrance, an exit alone, an entrance alone`);
  check(sd(gaps) > 600 && Math.max(...gaps) > 2 * Math.min(...gaps), `the open road between them varies (${Math.min(...gaps).toFixed(0)} to ${Math.max(...gaps).toFixed(0)} m, sd ${sd(gaps).toFixed(0)}): not a metronome`);
  check(new Set(S.map((s) => Math.round(s.ramp / 50))).size >= 4 && new Set(S.map((s) => Math.round(s.ang / 5))).size >= 3, "ramp length and angle vary");
  check(S.some((s) => s.left), "some exits leave on the left");
  check(S.every((s) => s.ang >= 35), "no ramp is shallower than 35 degrees: below that it lies along the through lanes and the conflict table stops the road (measured)");
  const far = lineOf({ LENGTH: 60000 }), a = far.nodes.map((n) => n.u).join(), b = lineOf({ LENGTH: 30000 }).nodes.map((n) => n.u).join();
  check(a.startsWith(b.slice(0, b.lastIndexOf(","))), "the interchange sequence of a short road is the start of the long one's (distance only)"); }
console.log("7. IT DRIVES");
for (const [name, o] of [["with interchanges", {}], ["interchanges, seed 2", { SEED: 2 }], ["interchanges, seed 3", { SEED: 3 }], ["without", { INTERCHANGES: 0 }]]) {
  let w; try { w = seedGraph(1, 50, loadMap(roadgen(o)), { target: 80, posted: true, brakeReaction: true }); for (let i = 0; i < 20 * 45; i++) w = step(w); } catch (e) { check(false, `${name}: threw ${e.message}`); continue; }
  const moving = w.actors.filter((a) => (a.v ?? 0) > 1).length;
  check(w.actors.length >= 60 && moving >= 0.9 * w.actors.length && !(w.crashes?.length), `${name}: ${w.actors.length} cars after 45 s, ${moving} moving, ${w.crashes?.length ?? 0} crashes`);
}
console.log(bad ? `\nFAILED: ${bad}` : "\nOK: a function of distance, bounded, made of transitions, legible, and it loads and drives.");
process.exit(bad ? 1 : 0);
