/* THE GENERATED HIGHWAY (14 November, DECISIONS 10.73): the road is a pure function of distance and a seed, bounded so it cannot cross itself, made of transitions, legible, and an ordinary map that loads and drives. The expectations are stated here, not read from roadgen.js's table (a check reading the code's constant cannot see it wrong); the drama floors are [invented] and mark the generator's purpose, not a measured truth -- the instrument for taste is the maintainer driving it. */
import { roadgen, lineOf, sitesOf, ROAD, testHighwayGenWide } from "../src/map/roadgen.js";
import { IX, ARCHETYPES, interchangeOf } from "../src/map/interchange.js";
import { loadMap } from "../src/map/load.js";
import { seedGraph, step } from "../src/sim/crossing.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { carsFor, carsMaxFor } from "../src/map/cars.js";
import { drive } from "./lib/shape-drive.mjs";
let bad = 0;
const check = (ok, what) => { console.log(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) bad++; };
const hw = (m) => m.roads.filter((r) => /^hw-/.test(r.id));
const hbOf = (m) => m.roads.filter((r) => /^hb-/.test(r.id)).sort((a, b) => +a.id.slice(3) - +b.id.slice(3));
const sameRoad = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log("1. A FUNCTION OF DISTANCE: the same road for the same seed, and a longer road begins with the shorter one");
const A = roadgen(), A2 = roadgen(), S = roadgen({ LENGTH: 12000 });
check(sameRoad(A, A2), "the same seed gives the same map, byte for byte");
const sS = hw(S), aById = new Map(hw(A).map((r) => [r.id, r])), short = sS.slice(0, -1);   // all but the short road's last, which ends where it ends
const shortB = hbOf(S).filter((r) => +r.id.slice(3) <= 7000);   // B runs the other way, and a break near the cut decides where the roads below it end (the no-break guard looks 1 km along): so compare only what is well below the cut
const prefixOk = shortB.every((r) => { const o = hbOf(A).find((q) => q.id === r.id); return o && sameRoad(o.points, r.points) && o.speed === r.speed; }) && short.every((r) => { const o = aById.get(r.id); return o && sameRoad(o.points, r.points) && o.speed === r.speed; });
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
const g0 = lineOf(), at = (u) => g0.pts[Math.round(u / 4)], D = 3 * 3.6 + IX.MEDIAN;
check(hw(A).every((r) => { const a = +r.id.slice(3), p = at(a); return /^hw-\d+$/.test(r.id) && Math.abs(r.points[0].x - p.x) < 1e-3 && Math.abs(r.points[0].y - p.y) < 1e-3; }), "every highway road is hw-<metres> and begins at exactly that distance along the line");
check(A.roads.filter((r) => /^(on|off)/.test(r.id)).every((r) => /^(on|off)b?-\d+$/.test(r.id)) && A.roads.filter((r) => /^hb-/.test(r.id)).every((r) => { const a = +r.id.slice(3), p = at(a), n = { x: -Math.sin(p.h), y: Math.cos(p.h) }, e = r.points.at(-1); return Math.abs(e.x - (p.x - n.x * D)) < 1e-2 && Math.abs(e.y - (p.y - n.y * D)) < 1e-2; }), "and every ramp is on/off(b)-<metres>, and every hb-<metres> road ENDS at exactly that distance on the oncoming line (it runs the other way)");

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

console.log("5c. THE ROAD IS DIVIDED, AND THE INTERCHANGE IS A DIAMOND (DECISIONS 10.75)");
{
  const L = loadMap(A), ws = (L.warnings ?? []).map((w) => w.msg ?? w.message ?? "");
  const hb = A.roads.filter((r) => /^hb-/.test(r.id)), line = g0.pts;
  const off = hb.every((r) => r.points.every((q) => { let best = Infinity; for (let i = 0; i < line.length; i += 1) { const d = Math.hypot(q.x - line[i].x, q.y - line[i].y); if (d < best) best = d; } return Math.abs(best - D) < 1.5; }));
  check(hb.length >= 6 && off, `the oncoming carriageway runs ${hb.length} roads, each point ${D.toFixed(1)} m (+-1.5) from the through line: parallel, a ${IX.MEDIAN} m median between`);
  check(!ws.some((t) => /cross|with no intersection/.test(t)), "and every crossing over the carriageways is an overpass with clearance (none refused)");
  const xm = A.roads.filter((r) => /^xm-/.test(r.id)); const crossings = (L.crossings ?? []).filter((c) => c.gap != null);
  check(xm.length >= 3 && crossings.length >= 2 * xm.length && crossings.every((c) => c.gap >= 4.5), `${xm.length} crossroads, ${crossings.length} crossings of a carriageway, each at least 4.5 m clear (min ${Math.min(...crossings.map((c) => c.gap)).toFixed(1)} m)`);
  /* THE TURNAROUND: from carriageway A you can reach carriageway B, and back, along the roads and their joins (a graph search, not a drive). */
  const roadOf = new Map(L.roads.map((r) => [r.id, r])), outgoing = (leg) => { const r = roadOf.get(leg.road); return r.oneWay ? leg.end === "start" : true; };
  const reach = (from) => { const seen = new Set(), todo = [from]; while (todo.length) { const id = todo.pop(); if (seen.has(id)) continue; seen.add(id); const r = roadOf.get(id), ends = r.oneWay ? ["end"] : ["start", "end"]; for (const e of ends) for (const n of L.nodes) if (n.legs.some((l) => l.road === id && l.end === e)) for (const l of n.legs) if (l.road !== id && outgoing(l)) todo.push(l.road); } return seen; };
  const fromA = reach("hw-0"), bs = [...fromA].filter((id) => /^hb-/.test(id));
  check(bs.length >= 3, `from carriageway A you can drive onto carriageway B (${bs.length} of its roads are reachable): an interchange is a turnaround`);
  const hbRoads = hb.map((r) => r.id), toA = new Set(); for (const id of hbRoads) for (const x of reach(id)) toA.add(x);
  check([...toA].some((id) => /^hw-/.test(id)), "and back again");
  /* OPT-IN: no bend, crest or junction on the through lanes inside an interchange: they are straight and level across the whole zone, both carriageways (B is A moved sideways), and every ramp leaves the lanes at a gore the driver can see: a start at least 300 m before the crossroad. */
  const sites = sitesOf(ROAD, 20000).filter((s) => s.kind === "full" && s.end < 19000);
  check(sites.length >= 2 && sites.every((s) => interchangeOf(ROAD.SEED, s.i, 5.4).dOff >= 300), `${sites.length} full interchanges: every ramp leaves at least 300 m before the crossroad, in sight of the through lanes`);
}
console.log("5d. THE INTERCHANGES VARY, MORE THAN THE OPEN ROAD (DECISIONS 10.75: first class)");
{
  const R = []; for (let i = 0; i < 300; i++) { const x = interchangeOf(1, i, 5.4); R.push(x.off, x.on); }
  const kinds = new Set(R.map((r) => r.kind)), rs = R.map((r) => r.rmin), pts = R.map((r) => r.pts.length), shares = ARCHETYPES.map((k) => R.filter((r) => r.kind === k).length / R.length);
  check(kinds.size === ARCHETYPES.length, `all ${ARCHETYPES.length} archetypes occur (${[...kinds].join(", ")}) in 600 ramps`);
  check(Math.max(...shares) < 0.5, `none dominates (the most common is ${(100 * Math.max(...shares)).toFixed(0)}%): the diamond is also what a draw falls back to, so this watches that the shapes fit`);
  check(Math.max(...rs) > 3 * Math.min(...rs) && new Set(R.map((r) => Math.round(r.ang / 3))).size >= 4, `the tightest radius varies (${Math.min(...rs).toFixed(0)} to ${Math.max(...rs).toFixed(0)} m) and so does the angle at the gore`);
  check(R.every((r) => r.rmin >= 80) && Math.min(...R.map((r) => r.rmin)) >= 80, `no ramp is tighter than 80 m (stated here, not read from the table: the loader posts 84 m as 40 km/h and a tighter bend slower, and 25 km/h is a car park)`);
  { const L2 = loadMap(A), slow = L2.roads.filter((r) => /^(on|off)b?-/.test(r.id) && (L2.warnings ?? []).some((w) => (w.msg ?? "").includes(r.id) && /posted speed lowered/.test(w.msg ?? ""))); check(slow.length === 0, `and the loader lowers the posted speed of none of the ramps in the map as built (${slow.length})`); }
  const pair = new Set(R.filter((_, i) => i % 2 === 0).map((r, i) => r.kind + R[2 * i + 1].kind)); check(pair.size >= 12, `the off ramp and the on ramp are drawn independently (${pair.size} distinct pairs)`);
  const peak = R.map((r) => { let g = 0, a = 0; const p = r.pts; for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i].s - p[i - 1].s, p[i].v - p[i - 1].v); g = Math.max(g, Math.abs(p[i].z - p[i - 1].z) / d); } return g; });
  check(Math.max(...peak) <= 0.0705, `no ramp climbs steeper than ${(100 * Math.max(...peak)).toFixed(1)}% (the engine holds 7.7%)`);
  check(R.every((r) => Math.abs(r.pts[0].z) < 1e-9 || Math.abs(r.pts.at(-1).z) < 1e-9), "every ramp is level where it meets the through road");
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
  { const L = S.filter((s) => s.kind !== "full"); check(new Set(L.map((s) => Math.round(s.ramp / 50))).size >= 4 && new Set(L.map((s) => Math.round(s.ang / 5))).size >= 3, "slip road length and angle vary"); }
  check(S.some((s) => s.kind !== "full" && s.carriage === "B") && S.some((s) => s.kind !== "full" && s.carriage === "A"), "lone slip roads come on both carriageways");
  check(S.filter((s) => s.kind !== "full").every((s) => s.ang >= 35) && IX.ANGLE_MIN >= 35, "no ramp is shallower than 35 degrees: below that it lies along the through lanes and the conflict table stops the road (measured)");
  const far = lineOf({ LENGTH: 60000 }), a = far.nodes.map((n) => n.u).join(), b = lineOf({ LENGTH: 30000 }).nodes.map((n) => n.u).join();
  check(a.startsWith(b.slice(0, b.lastIndexOf(","))), "the interchange sequence of a short road is the start of the long one's (distance only)"); }
console.log("7. IT DRIVES");
for (const [name, o] of [["with interchanges", {}], ["interchanges, seed 2", { SEED: 2 }], ["interchanges, seed 3", { SEED: 3 }], ["without", { INTERCHANGES: 0 }]]) {
  let w; try { w = seedGraph(1, 50, loadMap(roadgen(o)), { target: 80, posted: true, brakeReaction: true }); for (let i = 0; i < 20 * 45; i++) w = step(w); } catch (e) { check(false, `${name}: threw ${e.message}`); continue; }
  const moving = w.actors.filter((a) => (a.v ?? 0) > 1).length;
  check(w.actors.length >= 60 && moving >= 0.9 * w.actors.length && !(w.crashes?.length), `${name}: ${w.actors.length} cars after 45 s, ${moving} moving, ${w.crashes?.length ?? 0} crashes`);
}
console.log("8. THE PLAYER'S TRAFFIC IS SHAPED, AND THE COUNT IS ONE HIS PHONE CAN SURVIVE (Jay, 14 November: 500 cars on the generated highway, an empty-feeling road, and his page crashed)");
{
  /* Expectations are literals stated here, never read from the table: 100 by default and 160 at the most, over-corrected on purpose until the phone is measured (DECISIONS 10.92); no map's dial offers over 360, test map 1's own top, which the phone has played. */
  const wide = testHighwayGenWide();   // the map as shipped
  for (const [name, m] of [["the generated highway", roadgen()], ["with no interchange", roadgen({ INTERCHANGES: 0 })], ["five lanes at 110", wide]]) {
    const L = loadMap(m);
    check(L.traffic?.shape === true, `${name} asks for density shaping (the cars spent where the player is, sim/shaping.js)`);
    check(carsFor(L) === 100 && carsMaxFor(L) === 160, `${name}: the dial starts at ${carsFor(L)} and tops out at ${carsMaxFor(L)} (100 and 160)`);
  }
  const over = TEST_MAPS.map((t) => [t.id, carsMaxFor(loadMap(t.build()))]).filter(([, mx]) => mx > 360);
  check(over.length === 0, `no map's dial offers more than 360 cars${over.length ? `: ${over.map(([i, mx]) => `${i} ${mx}`).join(", ")}` : ` (${TEST_MAPS.length} maps)`}`);
  const out = drive({ raw: wide, cars: 100, seed: 1, secs: 60, shape: true });
  check(out.shaped === true && out.placed >= 20 && out.crashes === 0, `a shaped minute on the five-lane road at 100 cars: shaping runs (${out.placed} placed, ${out.retired} retired), ${out.crashes} crashes`);
}
console.log(bad ? `\nFAILED: ${bad}` : "\nOK: a function of distance, bounded, made of transitions, legible, and it loads and drives.");
process.exit(bad ? 1 : 0);
