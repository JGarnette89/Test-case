/* Crashes in DEFAULT traffic (perception off), which every check had
   reported as none -- because the checks looked at one tick, or sampled,
   and a pass-through lasting a tick or two was never seen. Now contact
   stops both cars and is logged, so it can be counted. The signal check's
   five-way and crossroads, and the test maps, each run for a while.
   Run: node tools/measure/default-crashes.mjs [minutes] */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, pathOf, DT } from "../../src/sim/crossing.js";

const minutes = Number(process.argv[2]) || 4;
const line = (a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
function mapOf(legs) {
  const m = emptyMap("sig", "signals");
  m.bounds = { x: 0, y: 0, w: 1000, h: 1000 };
  const c = { x: 500, y: 500 };
  for (const [id, far] of legs) m.roads.push(road({ id, kind: "collector", points: line(far, c), control: { start: "none", end: "signal" } }));
  return loadMap(m);
}
const CROSS = [["N", { x: 500, y: 100 }], ["S", { x: 500, y: 900 }], ["E", { x: 900, y: 500 }], ["W", { x: 100, y: 500 }]];
const FIVE = [...CROSS, ["NE", { x: 830, y: 170 }]];

const cases = [
  ["signal five-way", mapOf(FIVE), { every: 1.4 }, 9],
  ["signal crossroads", mapOf(CROSS), { every: 1.2 }, 7],
  ["test map 1 @150", loadMap(TEST_MAPS.find((t) => t.id === "test-1").build()), { target: 150, posted: true }, 3],
  ["city @300", loadMap(TEST_MAPS.find((t) => t.id === "city").build()), { target: 300, posted: true }, 3],
];
for (const [name, loaded, opts, seed] of cases) {
  let w = seedGraph(seed, 50, loaded, opts);
  let seen = 0;
  const rows = [];
  for (let i = 0; i < (minutes * 60) / DT; i++) {
    const before = w;
    w = step(w);
    for (const c of (w.crashes ?? []).slice(seen)) {
      const A = before.actors.find((q) => q.id === c.a), B = before.actors.find((q) => q.id === c.b);
      if (!A || !B) { rows.push("  (a party was new this tick)"); continue; }
      const pa = pathOf(before, A), pb = pathOf(before, B);
      const box = (x, p) => x.s > p.stopAt - 1 && x.s < p.clearAt + 1;
      rows.push(`  t=${w.t.toFixed(1)} ${A.k === B.k ? "same node" : "across nodes"} ${pa.from}->${pa.to} ${pa.intent} s=${A.s.toFixed(1)}/${pa.stopAt.toFixed(1)} v=${A.v.toFixed(1)} going=${A.going} amber=${!!A.amberGo} | ${pb.from}->${pb.to} ${pb.intent} s=${B.s.toFixed(1)}/${pb.stopAt.toFixed(1)} v=${B.v.toFixed(1)} going=${B.going} amber=${!!B.amberGo} | ${box(A, pa) && box(B, pb) ? "both in the box" : A.lc || B.lc ? "lane change" : "not both in the box"}`);
    }
    seen = (w.crashes ?? []).length;
  }
  console.log(`${name}: ${seen} crashes in ${minutes} min`);
  for (const r of rows.slice(0, 6)) console.log(r);
}
