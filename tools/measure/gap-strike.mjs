/* A careful mid-block walker struck by a driver who was watching: the car
   and the person, tick by tick before it. Run: node tools/measure/gap-strike.mjs [seed] */
import { loadMap } from "../../src/map/load.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { seedGraph, step, pathOf } from "../../src/sim/crossing.js";
import { crosswalksOf, bandOn, heldAhead, inSight, pedPose } from "../../src/sim/peds.js";
const city = loadMap(TEST_MAPS.find((t) => t.id === "city").build());
let w = seedGraph(Number(process.argv[2] ?? 3), 50, city, { target: 300, posted: true, gapRate: 30, gapHeedless: 0 });
const cws = crosswalksOf(w.course), hist = [];
let seen = 0;
for (let i = 0; i < 6000; i++) {
  hist.push(w); if (hist.length > 80) hist.shift();
  w = step(w);
  const c = (w.crashes ?? []).slice(seen).find((x) => String(x.a).startsWith("ped-"));
  seen = (w.crashes ?? []).length;
  if (!c) continue;
  console.log(`STRIKE t${c.t.toFixed(2)} ${c.a} by ${c.b}`);
  for (const back of [70, 50, 30, 15, 5, 1]) {
    const pw = hist[hist.length - back];
    const a = pw.actors.find((q) => q.id === c.b), p = (pw.peds ?? []).find((q) => q.id === c.a);
    if (!a) { console.log(`  -${(back * 0.05).toFixed(2)} car not yet`); continue; }
    const path = pathOf(pw, a), cw = p ? cws[p.cw] : null, band = cw ? bandOn(path, cw) : null;
    const eye = { x: 0, y: 0 };
    console.log(`  -${(back * 0.05).toFixed(2)} car k${a.k} s ${a.s.toFixed(1)} v ${a.v.toFixed(1)} a ${(a.a ?? 0).toFixed(1)} band ${band ? band.s.toFixed(1) : "-"} held ${JSON.stringify(heldAhead(pw, a, path))} | ped ${p ? `${p.state} ${p.manner} u ${p.u.toFixed(1)}/${cw.width.toFixed(1)} cw k${cw.k} ${cw.kind}` : "none"}`);
  }
  break;
}
