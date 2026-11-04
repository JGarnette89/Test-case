/* Can verify-courtesy's section 7 reuse the worlds sections 2-4 warmed?
   Only if a warmed world is unchanged by the trials run against it, so
   that stepping on from it is exactly stepping on from a fresh warm-up.
   Seed 1: path A warms fresh to 180 s and 240 s; path B warms to 120,
   runs trials against it the way sections 2-4 do, steps to 150, trials
   again, then to 180 and 240. Compares the whole world, field by field,
   and times the warm-up. Writes nothing. */
import { loadMap } from "../../src/map/load.js";
import { testLoop } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { courteous } from "../../src/sim/courtesy.js";
import { trial } from "./courtesy-trial.mjs";

const loop = loadMap(testLoop());
const fresh = () => seedGraph(1, 50, loop, { target: 200, posted: true });
const to = (w, t) => { while (w.t < t) w = step(w); return w; };
/* Everything that is data: functions and the shared course object skipped
   (the course is built once by seedGraph and never written by step). */
const dump = (w) => JSON.stringify(w, (k, v) => (typeof v === "function" || k === "course" ? undefined : v));

let t0 = Date.now();
const a180 = to(fresh(), 180);
const warmA = (Date.now() - t0) / 1000;
const a240 = to(a180, 240);
const warmA240 = (Date.now() - t0) / 1000;

let b = to(fresh(), 120);
const before = dump(b);
for (let i = 0; i < 4; i++) for (const only of [courteous, (x) => !courteous(x)]) for (const pick of [0, 1]) { trial(b, i, true, () => {}, pick, only); trial(b, i, false, null, pick, only); }
const untouched = dump(b) === before;
b = to(b, 150);
for (let i = 0; i < 4; i++) trial(b, i, true, () => {}, 0, courteous);
const b180 = to(b, 180);
const b240 = to(b180, 240);

console.log(`a world is unchanged by the trials run against it: ${untouched}`);
console.log(`at 180 s, warmed through trials == warmed fresh: ${dump(b180) === dump(a180)}`);
console.log(`at 240 s, the same: ${dump(b240) === dump(a240)}`);
console.log(`warm-up, one seed, 200 cars: to 180 s ${warmA.toFixed(1)} s, to 240 s ${warmA240.toFixed(1)} s`);
