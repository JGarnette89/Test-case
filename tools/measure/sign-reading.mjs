/* WHO FAILS TO READ WHICH KIND OF SIGN (core/driver.js DIFFICULTY and
   `reads`): the share of drawn drivers who misread each kind at its
   default difficulty, split by whether knowledge is their weak axis, and
   the same across a sweep of difficulties -- so a hard sign's likely
   effect can be judged before anybody places one. Traffic is drawn as the
   sim draws it (sim/traffic.js `driver`, an ordinary place).
   Run: node tools/measure/sign-reading.mjs [drivers] */
import { driver } from "../../src/sim/traffic.js";
import { DIFFICULTY, reads, LACKING_AT, soundnessOf } from "../../src/core/driver.js";
const N = Number(process.argv[2] ?? 20000), road = { speed: 13.9 };
const ds = Array.from({ length: N }, (_, n) => driver(road, 1, n));
const weak = (d) => soundnessOf(d.ratings, "knowledge") <= LACKING_AT;
const W = ds.filter(weak), S = ds.filter((d) => !weak(d));
const pc = (x, of) => `${((100 * x) / Math.max(1, of)).toFixed(1)}%`;
const row = (label, kind, dif) => {
  const all = ds.filter((d) => !reads(d, kind, dif)).length, w = W.filter((d) => !reads(d, kind, dif)).length, s = S.filter((d) => !reads(d, kind, dif)).length;
  console.log(`${label.padEnd(28)} ${String(dif).padStart(5)}   ${pc(all, N).padStart(6)}   ${pc(w, W.length).padStart(6)}   ${pc(s, S.length).padStart(6)}`);
};
console.log(`${N} drivers; ${pc(W.length, N)} weak on knowledge\n`);
console.log("kind                          diff.   misread  of weak  of sound");
for (const [kind, dif] of Object.entries(DIFFICULTY)) row(kind, kind, dif);
console.log("\nthe scale, for a sign placed harder than its kind:");
for (const dif of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) row("  (any kind)", "stop", dif);
