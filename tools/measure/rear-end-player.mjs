/* THE PLAYER STANDING ON THE BRAKE IN FRONT OF TRAFFIC (5 November; DECISIONS 10.46): what the
   maintainer described, and the one case the traffic-only scene cannot reach, since the screen
   writes the player in afresh each tick (drive.js withDriver). rear-end.mjs's road; the player
   settled ahead of a drawn follower at their own gap, then braking at a set rate to rest.
   BR=own|<seconds>, none if unset. Usage: node tools/measure/rear-end-player.mjs [drivers=120] */
import { emptyMap, road } from "../../src/map/format.js";
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, carFor } from "../../src/sim/crossing.js";
import { driver, DT, PERSONAL, lenOf } from "../../src/sim/traffic.js";
import { playerAt, withDriver } from "../../src/sim/drive.js";
import { playerContact } from "../../src/sim/scene.js";

const N = Number(process.argv[2] ?? 120);
const BR = process.env.BR === "own" ? true : process.env.BR != null ? Number(process.env.BR) : false;
const P = (x, y) => ({ x, y, z: 0 });
const m = emptyMap("rear");
m.bounds = { x: 0, y: 0, w: 4000, h: 400 };
m.roads.push(road({ id: "w", kind: "collector", lanes: 1, speed: 90, points: [P(0, 200), P(3000, 200)] }), road({ id: "e", kind: "collector", lanes: 1, speed: 90, points: [P(3000, 200), P(4000, 200)] }), road({ id: "n", kind: "residential", points: [P(3000, 0), P(3000, 200)] }));
const base = seedGraph(1, 50, loadMap(m), { every: 1e9, target: 0, posted: true, trucks: 0, laneChanges: false, keepRight: false });
const L = base.course.at[0].layout;
const route = Object.keys(L.paths).find((r) => L.legs[L.paths[r].from]?.road === "w" && L.paths[r].intent === "straight");
const posted = { ...base.road, speed: 25, kmh: 90, kind: "collector" };

function trial(n, rate, speed) {
  let w = { ...base, brakeReaction: BR, actors: [], crashes: [] };
  const who = driver(posted, 1, n, null, null, "car"), fol = { ...carFor(w, n, 0, route, null, "car"), id: "follower", n, s: 620 };
  for (const k of PERSONAL) fol[k] = who[k];
  fol.v0 = Math.max(fol.v0, speed + 3); fol.v = speed;
  let me = { ...playerAt(base.course, 0, route), s: 700, v: speed, a: 0 };
  w = withDriver({ ...w, actors: [fol] }, me);
  /* Settled at a steady speed, then braking; the player moved as the screen moves them. */
  let v = speed, s = 700, a = 0, hit = false, closest = Infinity, settled = 0, peak = 0;
  for (let i = 0; i < 60 / DT; i++) {
    const braking = i >= 40 / DT;
    if (i === Math.round(40 / DT)) { const f = w.actors.find((x) => x.id === "follower"); settled = s - f.s - (lenOf(f) + lenOf(me)) / 2; }
    a = braking && v > 0 ? -rate : 0;
    v = Math.max(0, v + a * DT); s += v * DT;
    me = { ...me, s, v, a };
    w = withDriver(w, me);
    const n0 = (w.crashes ?? []).length;
    w = step(w);
    const f = w.actors.find((x) => x.id === "follower");
    const touched = playerContact(w, me);
    if ((touched.world ?? w).crashes?.length > n0 || touched.hit) { hit = true; break; }
    if (!f) break;
    if (braking) { closest = Math.min(closest, s - f.s - (lenOf(f) + lenOf(me)) / 2); peak = Math.max(peak, -(f.a ?? 0)); }
  }
  return { hit, closest, settled, peak, notices: who.notices };
}
console.log(`the player braking in front of a drawn follower; BR ${BR}; ${N} drivers each`);
for (const speed of [14, 25]) for (const rate of [2.7, 5.4, 8]) {
  const rows = [];
  for (let n = 1; n <= N; n++) rows.push(trial(n, rate, speed));
  const q = [...rows].sort((a, b) => a.notices - b.notices), band = [0, 1, 2, 3].map((i) => q.slice((i * q.length) >> 2, ((i + 1) * q.length) >> 2));
  console.log(`  at ${speed} m/s, braking ${rate}: hit ${rows.filter((r) => r.hit).length}/${rows.length} | by delay quartile ${band.map((b) => b.filter((r) => r.hit).length).join(" ")} | follower over 5.4 by quartile ${band.map((b) => b.filter((r) => r.peak > 5.4).length).join(" ")} | closest ${Math.min(...rows.map((r) => r.closest)).toFixed(2)}`);
}
