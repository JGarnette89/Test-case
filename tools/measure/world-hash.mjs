/* A fingerprint of a world run: every actor's id, s, v and route every
   second, hashed. For "nothing moved" across a refactor that must not
   change behaviour. Run: node tools/measure/world-hash.mjs [map] [secs] [cars] [seed] [trucks share, default 0] */
import { createHash } from "node:crypto";
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step } from "../../src/sim/crossing.js";
import { DT } from "../../src/sim/traffic.js";
const [id = "city", secs = 120, cars = 200, seed = 3, trucks = 0] = process.argv.slice(2);
const L = loadMap(TEST_MAPS.find((t) => t.id === id).build());
let w = seedGraph(Number(seed), 50, L, { target: Number(cars), posted: true, trucks: Number(trucks) });
const h = createHash("sha1");
for (let i = 0; i < Number(secs) / DT; i++) {
  w = step(w);
  if (i % 20 === 0) h.update(JSON.stringify([w.actors.map((a) => [a.id, a.k, a.route, +a.s.toFixed(6), +a.v.toFixed(6)]), (w.peds ?? []).map((p) => [p.id, +p.u.toFixed(6), p.state]), (w.crashes ?? []).length]));
}
console.log(id, secs, cars, seed, h.digest("hex"));
