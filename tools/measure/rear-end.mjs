/* CAN A HARD BRAKE CAUSE A REAR-END? (5 November; DECISIONS 10.44, item 0: if it cannot,
   the price of slowing is a danger that does not exist.) A long straight road with nothing
   on it. A lead car settles at a speed with a follower settled behind it at the follower's
   own gap, three cars back in a line; then the lead brakes at a set rate (`dual`, the
   sim's own brake input) to rest. Followers are drawn as the population is, plus trucks.
   Reported: contact, the closest the bodies came, how hard the follower braked.
   LOOK=1: look-away on, as built since DECISIONS 10.19: glances that fit the road, and a
   looming car brings the eyes back. LOOK=blind: the old glance, blind and at any time
   (noPeriphery, glanceAnyTime, verify-lookaway's own control): THE CONTROL, a rear-end
   from a driver not looking must be something this scene can show.
   Usage: node tools/measure/rear-end.mjs [drivers=120] */
import { emptyMap, road } from "../../src/map/format.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, carFor } from "../../src/sim/crossing.js";
import { driver, DT, PERSONAL, lenOf, vehicleOf } from "../../src/sim/traffic.js";

const N = Number(process.argv[2] ?? 120), LOOK = process.env.LOOK === "1" || process.env.LOOK === "blind", BLIND = process.env.LOOK === "blind";
const P = (x, y) => ({ x, y, z: 0 });
const m = emptyMap("rear");
m.bounds = { x: 0, y: 0, w: 4000, h: 400 };
m.roads.push(road({ id: "w", kind: "collector", lanes: 1, speed: 90, points: [P(0, 200), P(3000, 200)] }), road({ id: "e", kind: "collector", lanes: 1, speed: 90, points: [P(3000, 200), P(4000, 200)] }), road({ id: "n", kind: "residential", points: [P(3000, 0), P(3000, 200)] }));
const loaded = loadMap(m);
const base = seedGraph(1, 50, loaded, { every: 1e9, target: 0, posted: true, trucks: 0, laneChanges: false, keepRight: false, perceive: LOOK });
const L = base.course.at[0].layout;
const route = Object.keys(L.paths).find((r) => L.legs[L.paths[r].from]?.road === "w" && L.paths[r].intent === "straight");
const posted = { ...base.road, speed: 25, kmh: 90, kind: "collector" };
const person = (w, n, id, kind, s) => {
  const who = driver(posted, 1, n, null, null, kind), out = { ...carFor(w, n, 0, route, null, kind), id, n, s };
  for (const k of PERSONAL) out[k] = who[k];
  return out;
};
function trial(n, kind, rate, speed) {
  let w = { ...base, ...(BLIND ? { noPeriphery: true, glanceAnyTime: true } : {}), actors: [], crashes: [] };
  const lead = { ...person(w, n + 5000, "lead", "car", 700), v: speed, v0: speed };
  const fol = person(w, n, "follower", kind, 620), tail = person(w, n + 9000, "tail", "car", 540);
  fol.v0 = Math.max(fol.v0, speed + 3); fol.v = speed; tail.v0 = Math.max(tail.v0, speed + 3); tail.v = speed;
  w = { ...w, actors: [lead, fol, tail] };
  for (let i = 0; i < 40 / DT; i++) w = step(w);
  const f0 = w.actors.find((a) => a.id === "follower"), l0 = w.actors.find((a) => a.id === "lead");
  if (!f0 || !l0) return null;
  const clear = (a, b) => b.s - a.s - (lenOf(a) + lenOf(b)) / 2;
  const settled = clear(f0, l0), headway = settled / Math.max(f0.v, 0.1);
  w = { ...w, actors: w.actors.map((a) => (a.id === "lead" ? { ...a, dual: rate } : a)) };
  let closest = settled, peak = 0, hit = null;
  const n0 = (w.crashes ?? []).length;
  for (let i = 0; i < 20 / DT; i++) {
    w = step(w);
    const f = w.actors.find((a) => a.id === "follower"), l = w.actors.find((a) => a.id === "lead");
    if (!f || !l) break;
    closest = Math.min(closest, clear(f, l));
    peak = Math.max(peak, -(f.a ?? 0));
    const c = (w.crashes ?? []).slice(n0)[0];
    if (c) { hit = [c.a, c.b].sort().join("+"); break; }
  }
  return { hit, closest, peak, settled, headway, most: vehicleOf(f0).most, fv: f0.v };
}
const mean = (a) => a.reduce((p, q) => p + q, 0) / Math.max(1, a.length), med = (a) => { const q = [...a].sort((x, y) => x - y); return q[q.length >> 1] ?? 0; };
console.log(`look-away ${BLIND ? "BLIND, the control" : LOOK ? "ON, as built" : "off"}; lag of a drawn follower ${person(base, 7, "x", "car", 0).lag?.toFixed(2)}; ${N} drivers each; the lead braking to rest`);
for (const kind of ["car", "truck"]) for (const speed of [14, 25]) for (const rate of [1.5, 2.7, 5.4, 8]) {
  const rows = [];
  for (let n = 1; n <= N; n++) { const r = trial(n, kind, rate, speed); if (r) rows.push(r); }
  const hits = rows.filter((r) => r.hit), fh = hits.filter((r) => r.hit.includes("follower") && r.hit.includes("lead")), th = hits.filter((r) => r.hit.includes("tail"));
  console.log(`  ${kind.padEnd(5)} at ${String(speed).padStart(2)} m/s, lead braking ${rate.toFixed(1)}: ${String(rows.length).padStart(3)} trials | hit lead ${String(fh.length).padStart(3)}, tail hit ${String(th.length).padStart(3)} | closest ${Math.min(...rows.map((r) => r.closest)).toFixed(2)} m (median ${med(rows.map((r) => r.closest)).toFixed(2)}) | settled gap median ${med(rows.map((r) => r.settled)).toFixed(1)} m, ${med(rows.map((r) => r.headway)).toFixed(2)} s, shortest ${Math.min(...rows.map((r) => r.headway)).toFixed(2)} s | follower peak ${med(rows.map((r) => r.peak)).toFixed(1)}, max ${Math.max(...rows.map((r) => r.peak)).toFixed(1)}, over 5.4: ${rows.filter((r) => r.peak > 5.4).length}`);
}
