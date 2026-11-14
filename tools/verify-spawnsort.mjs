/* =====================================================================
   SPAWN SORTING (DECISIONS 10.91, 14 November). A car that appears ten kilometres down a motorway has been driving for a while, so it appears in a lane its
   wanted speed asks for, with the strength a table value; it was uniform, which left the wanted speed and the first lane unrelated (Spearman about 0 on both
   generated highways). Expectations are stated here, never read from the module:

     1. OFF IS THE WORLD AS IT WAS: `spawnSort: 0` and no option at all are the same world, tick for tick, on a multi-lane map and on a map with none.
     2. THE LANE A CAR FIRST APPEARS IN FOLLOWS ITS WANTED SPEED, IN PROPORTION TO THE STRENGTH: Spearman(wanted speed, lane position, 0 = inner) over the cars that
        first appear on the generated highway's three-lane entry -- near 0 at strength 0 (|rho| < 0.15), clearly negative at 1 (below -0.5), and in between at 0.5
        (below -0.15 and above the value at 1).
     3. NOTHING ELSE MOVES: a truck, and a car's random draws, are the same at any strength -- the same truck numbers appear in the same lanes at strength 1 as at 0
        (the sort has its own random stream and takes no draw from the others).
     4. IT IS NOT A PERFECT SORT: at 0.5 some of the fastest third still start in the outer lanes and some of the slowest in the inner (real motorways have slow
        cars in fast lanes), at least 10% of each (the strength is the SHARE of drivers already in their lane, so about (1 - 0.5) / 3 = 17% of each third).
   EACH OF 2-4 IS POOLED OVER THREE SEEDS: a Spearman over one seed's 68 cars has a standard error of about 0.12, so |rho| < 0.15 was a bar one draw could not hold (the first run read -0.15), and 5 trucks are not enough to say 'the same lane'. Counts are stated with their sample.
   Sabotage (the lane read as the opposite way round, rank ignored, a draw taken from the shared stream): each fails the assertion that holds it.
   Usage: node tools/verify-spawnsort.mjs
   ===================================================================== */
import { loadMap } from "../src/map/load.js";
import { TEST_MAPS } from "../src/map/samples.js";
import { seedGraph, step } from "../src/sim/crossing.js";

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };
const fp = (w) => JSON.stringify(w.actors.map((a) => [a.id, a.route, Math.round(a.s * 1e3), Math.round(a.v * 1e3)]));

console.log("1. OFF IS THE WORLD AS IT WAS, AND A MAP'S OWN VALUE IS WHAT IT GETS UNLESS IT IS TOLD OTHERWISE");
const same = (A, B, ticks = 1200) => { let a = A, b = B, ok = true, t = 0; for (; t < ticks && ok; t++) { a = step(a); b = step(b); ok = fp(a) === fp(b); } return [ok, t]; };
for (const id of ["test-highway-gen", "test-1"]) {
  /* The map as drawn but WITHOUT a value of its own: the generated highway now carries one (SPAWN_SORT in the generator's table), and "no option" on it means that, not off -- this assertion was written before it did. */
  const L = loadMap(TEST_MAPS.find((m) => m.id === id).build());
  if (L.traffic) { L.traffic = { ...L.traffic }; delete L.traffic.spawnSort; }
  const [ok, t] = same(seedGraph(3, 50, L, { every: 2.0, target: 80, posted: true }), seedGraph(3, 50, L, { every: 2.0, target: 80, posted: true, spawnSort: 0 }));
  check(ok, `${id} with no value of its own: spawnSort 0 and no option are the same world for ${t} ticks`);
}
{
  const L = loadMap(TEST_MAPS.find((m) => m.id === "test-highway-gen").build());
  check(L.traffic?.spawnSort === 0.8, `the generated highway carries 0.8 of its own (the literal the table was set to, measured 14 November: held 13.7% at 0, 8.4% at 0.8): ${L.traffic?.spawnSort}`);
  const [ok, t] = same(seedGraph(3, 50, L, { every: 2.0, target: 80, posted: true }), seedGraph(3, 50, L, { every: 2.0, target: 80, posted: true, spawnSort: 0.8 }), 600);
  check(ok, `asked for nothing, a map gets its own value: no option and 0.8 are the same world for ${t} ticks`);
  const [off] = same(seedGraph(3, 50, L, { every: 2.0, target: 80, posted: true }), seedGraph(3, 50, L, { every: 2.0, target: 80, posted: true, spawnSort: 0 }), 600);
  check(!off, "and asking for 0 is a different world from the map's own (0 turns it off, it is not ignored)");
}

/* The first lane, wanted speed and kind of every car that appears, with the number it was drawn under. */
const SEEDS = [1, 2, 3];
const entries = (strength) => SEEDS.flatMap((seed) => entriesOf(strength, seed));
const entriesOf = (strength, seed) => {
  const L = loadMap(TEST_MAPS.find((m) => m.id === "test-highway-gen").build());
  let w = seedGraph(seed, 50, L, { every: 1.0, target: 250, posted: true, ...(strength != null ? { spawnSort: strength } : {}) });
  const seen = new Set(w.actors.map((a) => a.id)), out = [];
  for (let i = 0; i < 20 * 400; i++) {
    w = step(w);
    for (const a of w.actors) {
      if (seen.has(a.id)) continue; seen.add(a.id);
      const lay = w.course.at[a.k ?? 0].layout, p = lay.paths[a.route], leg = lay.legs[p?.from];
      if (!leg || (leg.across ?? leg.lanes ?? 1) < 3 || leg.lane == null) continue;   // the three-lane entries only
      out.push({ seed, n: a.n, kind: a.kind ?? "car", v0: a.v0, pos: leg.pos ?? leg.lane, lanes: leg.across ?? leg.lanes });
    }
  }
  return out;
};
const rank = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); let i = 0; while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const rho = (rows) => { const a = rank(rows.map((r) => r.v0)), b = rank(rows.map((r) => r.pos)), n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n; let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; } return sab / Math.sqrt(saa * sbb || 1); };

console.log("\n2. THE FIRST LANE FOLLOWS THE WANTED SPEED, IN PROPORTION TO THE STRENGTH");
const e0 = entries(0), e5 = entries(0.5), e1 = entries(1);
const cars = (e) => e.filter((r) => r.kind === "car");
const r0 = rho(cars(e0)), r5 = rho(cars(e5)), r1 = rho(cars(e1));
console.log(`   ${cars(e0).length} / ${cars(e5).length} / ${cars(e1).length} cars entering`);
check(Math.abs(r0) < 0.15, `strength 0: rho ${r0.toFixed(2)} (|rho| < 0.15: unrelated, as it was)`);
check(r1 < -0.5, `strength 1: rho ${r1.toFixed(2)} (below -0.5)`);
check(r5 < -0.15 && r5 > r1, `strength 0.5: rho ${r5.toFixed(2)} (below -0.15 and above the value at 1)`);

console.log("\n3. NOTHING ELSE MOVES");
{
  const lane = (e) => new Map(e.filter((r) => r.kind !== "car").map((r) => [`${r.seed}/${r.n}`, r.pos]));
  const a = lane(e0), b = lane(e1); let same = 0, both = 0;
  for (const [n, p] of a) if (b.has(n)) { both++; if (b.get(n) === p) same++; }
  check(both >= 8 && same === both, `${same} of ${both} trucks and buses enter in the same lane at strength 1 as at 0`);
}

console.log("\n4. IT IS NOT A PERFECT SORT");
{
  const c = cars(e5).slice().sort((x, y) => x.v0 - y.v0), third = Math.floor(c.length / 3);
  const slow = c.slice(0, third), fast = c.slice(2 * third);
  const slowInner = slow.filter((r) => r.pos === 0).length / slow.length, fastOuter = fast.filter((r) => r.pos === r.lanes - 1).length / fast.length;
  check(slowInner >= 0.1 && fastOuter >= 0.1, `at 0.5, ${(100 * slowInner).toFixed(0)}% of the slowest third start in the inner lane and ${(100 * fastOuter).toFixed(0)}% of the fastest in the curb lane (each at least 10%)`);
}
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
