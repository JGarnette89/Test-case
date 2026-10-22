/* WHAT LOOK-AWAY DOES, MEASURED (22 October). With it on, a driver's glance
   away lasts their registration delay and comes every LOOK_EVERY seconds,
   and for the whole glance they see every other car where it was when the
   glance began, carried forward at the speed it had then (crossing.js
   seenBy) -- blind to any change, no peripheral cue. This reports how much
   of the time the fleet is blind, and every crash in a run classified:
   REAR-END (same approach, the follower into the car ahead) or CROSSING
   (different approaches), by movement and by whether the lane is a turn lane.
   Usage: node tools/measure/lookaway-crashes.mjs [cars=260] [secs=300] [seed=1] [map=test-1] */
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step, pathOf } from "../../src/sim/crossing.js";
import { lookingAway, LOOK_EVERY } from "../../src/sim/attention.js";
import { DT } from "../../src/sim/traffic.js";
const [carsArg = "260", secsArg = "300", seedArg = "1", mapId = "test-1"] = process.argv.slice(2);
const raw = mapId === "test-1" ? null : TEST_MAPS.find((m) => m.id === mapId).build();
let { world: w } = worldFor(Number(seedArg), 50, 2.0, false, Number(carsArg), raw, null, true);
/* NOPERIPH=1: the glance blind (crossing.js noPeriphery), to measure the other parts alone. */
if (process.env.NOPERIPH === "1") w = { ...w, noPeriphery: true };
/* HEEDALL=1: every driver anticipates (core/driver.js anticipates, world.anticipate) -- waits for the road -- to measure the gating without the skill. */
if (process.env.HEEDALL === "1") w = { ...w, anticipate: { glance: "all" } };
/* ANYTIME=1: glances taken on the schedule whatever the road (crossing.js glanceAnyTime). */
if (process.env.ANYTIME === "1") w = { ...w, glanceAnyTime: true };
const lags = w.actors.filter((a) => !a.player).map((a) => a.lag ?? 0);
const shares = lags.map((g) => g / LOOK_EVERY);
const q = (xs, f) => [...xs].sort((a, b) => a - b)[Math.floor(f * (xs.length - 1))];
console.log(`blind share (glance / ${LOOK_EVERY} s) across ${lags.length} drivers: median ${(100 * q(shares, 0.5)).toFixed(0)}%, p90 ${(100 * q(shares, 0.9)).toFixed(0)}%, max ${(100 * Math.max(...shares)).toFixed(0)}%; glance median ${q(lags, 0.5).toFixed(2)} s, max ${Math.max(...lags).toFixed(2)} s`);
const kinds = new Map();
const add = (k) => kinds.set(k, (kinds.get(k) ?? 0) + 1);
let n = 0, awayAny = 0;
for (let i = 0; i < Number(secsArg) / DT; i++) {
  const prev = w, c0 = (w.crashes ?? []).length;
  w = step(w);
  for (const c of (w.crashes ?? []).slice(c0)) {
    const A = prev.actors.find((x) => x.id === c.a), B = prev.actors.find((x) => x.id === c.b);
    if (!A || !B) { add("with somebody just arrived"); continue; }
    n++;
    const pa = pathOf(prev, A), pb = pathOf(prev, B), L = prev.course.at[A.k].layout;
    const turnLane = (p) => { const leg = L.legs[p.from]; return leg?.bay || (L.routesFrom?.(p.from) ?? []).every((r) => L.paths[r].intent !== "straight"); };
    const rear = A.k === B.k && pa.from === pb.from;
    const back = rear ? (A.s < B.s ? A : B) : null;
    const awayNow = (x) => { for (let j = 0; j < 60 && j < (prev.past?.length ?? 0); j++) if (lookingAway(prev.t - j * DT, x) > 0) return true; return lookingAway(prev.t, x) > 0; };
    const blind = rear ? awayNow(back) : awayNow(A) || awayNow(B);
    if (blind) awayAny++;
    add(rear ? `rear-end, ${pathOf(prev, back).intent} lane${turnLane(pa) ? " (a turn lane)" : ""}` : `crossing, ${pa.intent} x ${pb.intent}`);
  }
}
console.log(`${n} crashes in ${secsArg} s at ${carsArg} cars on ${mapId}, seed ${seedArg}; ${awayAny} with the driver at fault (the follower, or either at a crossing) looking away in the 3 s before:`);
for (const [k, v] of [...kinds].sort((a, b) => b[1] - a[1])) console.log(`   ${v}  ${k}`);
