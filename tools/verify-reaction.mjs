/* THE REAR-END RISK (DECISIONS 10.46): a follower registers the car ahead braking after their
   own delay, so a hard brake can really cause a rear-end, and it is the poor observer who has it.
   The physics is stated here, not read from the code: a follower at v, gap g, delay T, able to
   brake at b behind a lead braking at a hits if g + v^2/2a < vT + v^2/2b. b is 8 m/s^2 for a car,
   written down here (sabotaging the delay, the lamp or the braking must fail this). Sample: 90
   drawn drivers at each of 2 speeds and 2 rates, about a minute; hit counts below are compared
   with what they actually reached, in the output. */
import { emptyMap, road } from "../src/map/format.js";
import { loadMap } from "../src/map/load.js";
import { seedGraph, step, carFor } from "../src/sim/crossing.js";
import { driver, DT, PERSONAL, lenOf } from "../src/sim/traffic.js";
import { playerAt, withDriver } from "../src/sim/drive.js";
import { playerContact } from "../src/sim/scene.js";

let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const CAR_BRAKES = 8, N = 90;
const P = (x, y) => ({ x, y, z: 0 });
const m = emptyMap("rear");
m.bounds = { x: 0, y: 0, w: 4000, h: 400 };
m.roads.push(road({ id: "w", kind: "collector", lanes: 1, speed: 90, points: [P(0, 200), P(3000, 200)] }), road({ id: "e", kind: "collector", lanes: 1, speed: 90, points: [P(3000, 200), P(4000, 200)] }), road({ id: "n", kind: "residential", points: [P(3000, 0), P(3000, 200)] }));
const loaded = loadMap(m);
const base = seedGraph(1, 50, loaded, { every: 1e9, target: 0, posted: true, trucks: 0, laneChanges: false, keepRight: false });
const L = base.course.at[0].layout;
const route = Object.keys(L.paths).find((r) => L.legs[L.paths[r].from]?.road === "w" && L.paths[r].intent === "straight");
const posted = { ...base.road, speed: 25, kmh: 90, kind: "collector" };
const person = (w, n, id, s) => {
  const who = driver(posted, 1, n, null, null, "car"), out = { ...carFor(w, n, 0, route, null, "car"), id, n, s };
  for (const k of PERSONAL) out[k] = who[k];
  return out;
};
const clear = (a, b) => b.s - a.s - (lenOf(a) + lenOf(b)) / 2;
function trial(n, rate, speed, delay) {
  let w = { ...base, ...(delay !== undefined ? { brakeReaction: delay } : {}), actors: [], crashes: [] };
  const lead = { ...person(w, n + 5000, "lead", 700), v: speed, v0: speed };
  const fol = person(w, n, "follower", 620);
  fol.v0 = Math.max(fol.v0, speed + 3); fol.v = speed;
  w = { ...w, actors: [lead, fol] };
  for (let i = 0; i < 40 / DT; i++) w = step(w);
  const f0 = w.actors.find((a) => a.id === "follower"), l0 = w.actors.find((a) => a.id === "lead");
  const g = clear(f0, l0), v = f0.v;
  w = { ...w, actors: w.actors.map((a) => (a.id === "lead" ? { ...a, dual: rate } : a)) };
  const n0 = (w.crashes ?? []).length;
  /* How hard they braked before their delay was up, the lamp having just come on: nothing is
     known yet, so they carry on. */
  let before = 0;
  const lampT = w.t + DT;
  for (let i = 0; i < 20 / DT; i++) {
    w = step(w);
    if (w.t < lampT + f0.notices - 2 * DT) before = Math.max(before, -(w.actors.find((a) => a.id === "follower")?.a ?? 0));
    if ((w.crashes ?? []).length > n0) return { hit: true, g, v, T: f0.notices, before, rate };
  }
  return { hit: false, g, v, T: f0.notices, before, rate };
}
const sweep = (delay) => { const rows = []; for (const speed of [14, 25]) for (const rate of [5.4, 8]) for (let n = 1; n <= N; n++) rows.push(trial(n, rate, speed, delay)); return rows; };
const quartiles = (rows) => { const q = [...rows].sort((a, b) => a.T - b.T); return [0, 1, 2, 3].map((i) => q.slice((i * q.length) >> 2, ((i + 1) * q.length) >> 2)); };
const hits = (r) => r.filter((x) => x.hit).length;

console.log("1. Each driver's own delay, as the world is built");
const own = sweep();
const says = (r) => r.g + r.v ** 2 / (2 * r.rate) < r.v * r.T + r.v ** 2 / (2 * CAR_BRAKES);
const agree = own.filter((r) => says(r) === r.hit).length;
check(agree >= 0.9 * own.length, `the physics predicts each trial: ${agree} of ${own.length}`);
check(hits(own) >= 25, `a hard brake causes rear-ends: ${hits(own)} of ${own.length}`);
const b = quartiles(own).map(hits);
check(b[3] >= 0.7 * hits(own) && b[3] > b[2] && b[2] >= b[0], `it is the poor observer who has them, by delay quartile: ${b.join(" ")}`);
check(b[0] === 0, `the sharpest quarter of observers strike nobody: ${b[0]}`);

const slow = own.filter((r) => r.T > 1);
const worstBefore = Math.max(...slow.map((r) => r.before));
check(slow.length >= 40 && worstBefore < 1.5, `until their delay is up nothing has changed, position included: of ${slow.length} drivers with over 1 s, the hardest anybody braked before it was up is ${worstBefore.toFixed(2)} m/s^2`);

console.log("2. The controls: the delay is what does it");
const none = sweep(0);
check(hits(none) === 0, `with no delay, nobody hits anybody: ${hits(none)} of ${none.length} (the world before this)`);
const same = sweep(0.58);
const s = quartiles(same).map(hits);
check(hits(same) < hits(own) / 2 && s[3] < 0.7 * Math.max(1, hits(same)) + 2, `one delay for everybody, 0.58 s: ${hits(same)}, no longer on the poor observers: ${s.join(" ")}`);

console.log("3. Only a change: a car long stopped is seen stopped");
{
  /* Every drawn driver, up to the worst observer, driving up on a car that braked to a stop long before they got there: its lamp came on, and it is old news. */
  let struck = 0, ran = 0, worst = 0;
  for (let n = 1; n <= 60; n++) {
    let w = { ...base, actors: [], crashes: [] };
    const lead = { ...person(w, n + 5000, "lead", 700), v: 14, v0: 14, dual: 2.7 }, fol = person(w, n, "follower", 400);
    fol.v0 = Math.max(fol.v0, 16); fol.v = 14;
    w = { ...w, actors: [lead, fol] };
    worst = Math.max(worst, fol.notices);
    for (let i = 0; i < 60 / DT; i++) { w = step(w); if ((w.crashes ?? []).length) { struck++; break; } }
    ran++;
  }
  check(struck === 0, `${ran} drivers, delays up to ${worst.toFixed(2)} s, drive up on a car stopped long before: ${struck} hit it`);
}

console.log("4. The player: the screen writes them in fresh every tick, and they are read the same");
{
  const row = (n, rate, speed) => {
    let w = { ...base, actors: [], crashes: [] };
    const fol = person(w, n, "follower", 620);
    fol.v0 = Math.max(fol.v0, speed + 3); fol.v = speed;
    let me = { ...playerAt(base.course, 0, route), s: 700, v: speed, a: 0 }, v = speed, s = 700;
    w = withDriver({ ...w, actors: [fol] }, me);
    for (let i = 0; i < 60 / DT; i++) {
      const a = i >= 40 / DT && v > 0 ? -rate : 0;
      v = Math.max(0, v + a * DT); s += v * DT;
      me = { ...me, s, v, a };
      w = step(withDriver(w, me));
      if (playerContact(w, me).hit) return { hit: true, T: fol.notices };
    }
    return { hit: false, T: fol.notices };
  };
  const rows = []; for (let n = 1; n <= N; n++) rows.push(row(n, 8, 14));
  const q = quartiles(rows).map(hits);
  check(hits(rows) >= 10 && q[3] >= 0.7 * hits(rows) && q[0] === 0, `a player standing on the brake is rear-ended, by the poor observers: ${q.join(" ")}`);
}
console.log(failed ? `${failed} FAILURE(S)` : "OK: a hard brake can cause a rear-end, by the follower's own delay, and it is the poor observer who has it");
process.exit(failed ? 1 : 0);
