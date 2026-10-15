/* WHAT A WORKER ANSWER CARRIES (15 October): the bytes of each key of a
   step's answer on the bench, serialized as postMessage would, and how
   many fields an actor carries -- what the page deserializes 20 times a
   second, and what lives long enough to reach the old generation.
   Usage: node tools/measure/answer-size.mjs [fleet=400] */
import { serialize } from "node:v8";
import { handle } from "../../src/sim/remote.js";
const fleet = Number(process.argv[2] ?? 400);
let { state } = handle(null, { type: "init", bench: { fleet, off: {} }, seq: 1 });
let r;
for (let i = 0; i < 40; i++) { r = handle(state, { type: "step", me: null, seq: i + 2 }); state = r.state; }
const dyn = r.reply.dyn, total = serialize(dyn).length;
console.log(`one answer at ${fleet} cars: ${(total / 1024).toFixed(0)} KB serialized`);
for (const [k, v] of Object.entries(dyn).map(([k, v]) => [k, serialize(v ?? null).length]).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(14)} ${(v / 1024).toFixed(1).padStart(7)} KB`);
const a = state.world.actors;
const keys = new Map();
for (const x of a) for (const [k, v] of Object.entries(x)) keys.set(k, (keys.get(k) ?? 0) + serialize(v ?? null).length);
console.log(`an actor: ${(a.reduce((s, x) => s + Object.keys(x).length, 0) / a.length).toFixed(0)} fields on average; the heaviest across all ${a.length}:`);
for (const [k, v] of [...keys].sort((p, q) => q[1] - p[1]).slice(0, 15)) console.log(`  ${k.padEnd(16)} ${(v / 1024).toFixed(1).padStart(7)} KB`);
