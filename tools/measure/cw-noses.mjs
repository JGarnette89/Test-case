/* Where cars waiting on the south approach of the peds crossroads stop:
   the nearest nose to the node centre, and the path numbers behind it.
   Run: node tools/measure/cw-noses.mjs [crosswalk 1|0] */
import { loadMap } from "../../src/map/load.js";
import { emptyMap, road } from "../../src/map/format.js";
import { seedGraph, step, pathOf, poseOf } from "../../src/sim/crossing.js";
import { setCrosswalk } from "../../src/editor/model.js";
import { CAR } from "../../src/sim/traffic.js";

const P = (x, y) => ({ x, y, z: 0 });
const m = emptyMap("peds");
m.bounds = { x: 0, y: 0, w: 600, h: 600 };
m.roads.push(
  road({ id: "w", points: [P(0, 300), P(300, 300)] }), road({ id: "e", points: [P(300, 300), P(600, 300)] }),
  road({ id: "n", points: [P(300, 0), P(300, 300)], control: { start: "none", end: "stop" } }),
  road({ id: "s", points: [P(300, 600), P(300, 300)], control: { start: "none", end: "stop" } }),
);
const map = process.argv[2] === "0" ? m : setCrosswalk(m, "s", "end", true);
let w = seedGraph(3, 50, loadMap(map), { target: 40, posted: true });
const L = w.course.at.find((a) => !a.through).layout;
let best = Infinity, row = null;
for (let i = 0; i < 1200; i++) {
  w = step(w);
  for (const a of w.actors) {
    const p = pathOf(w, a);
    if (w.course.at[a.k].through || L.legs[p.from]?.road !== "s" || a.v > 0.3 || a.going) continue;
    const nose = poseOf(w, a).y - 300 - CAR.length / 2;
    if (nose < best) { best = nose; row = { s: a.s, stopAt: p.stopAt, len: p.length, y: poseOf(w, a).y, from: p.from }; }
  }
}
console.log("nearest waiting nose", best.toFixed(2), JSON.stringify(row));
