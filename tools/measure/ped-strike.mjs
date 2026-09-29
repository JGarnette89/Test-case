/* Strikes by drivers who were NOT looking away: the car and the person on
   the tick before, and what the car thought held its way. */
import { loadMap } from "../../src/map/load.js";
import { seedGraph, step, pathOf, whatStops } from "../../src/sim/crossing.js";
import { testPeds } from "../../src/map/samples.js";
import { crosswalksOf, bandOn, heldAhead, holds } from "../../src/sim/peds.js";
let w = seedGraph(Number(process.argv[2] ?? 3), 50, loadMap(testPeds()), { target: 60, posted: true, perceive: false });
const cws = crosswalksOf(w.course);
const hist = [];
let seen = 0, n = 0;
for (let i = 0; i < 12000 && n < 4; i++) {
  hist.push(w); if (hist.length > 40) hist.shift();
  w = step(w);
  for (const c of (w.crashes ?? []).slice(seen)) {
    if (!String(c.a).startsWith("ped-")) continue;
    n++;
    console.log(`STRIKE t${c.t.toFixed(2)} ${c.a} by ${c.b}`);
    for (const back of [30, 20, 10, 4, 1]) {
      const pw = hist[hist.length - back]; if (!pw) continue;
      const a = pw.actors.find((q) => q.id === c.b), p = (pw.peds ?? []).find((q) => q.id === c.a);
      if (!a) continue;
      const path = pathOf(pw, a), cw = p ? cws[p.cw] : null, band = cw ? bandOn(path, cw) : null;
      const h = heldAhead(pw, a, path);
      console.log(`  -${(back * 0.05).toFixed(2)}s car s ${a.s.toFixed(1)} v ${a.v.toFixed(1)} stopAt ${path.stopAt.toFixed(1)} going ${a.going} held ${whatStops(a, pw).held} pedHold ${h ? h.s.toFixed(1) : "-"} band ${band ? band.s.toFixed(1) + " t " + band.t.toFixed(2) : "-"} | ped ${p ? p.state + " u " + p.u.toFixed(1) + "/" + cw.width.toFixed(1) + " from " + p.from + " holdsBand " + (band ? holds(p, cw, band.t) : "-") : "none yet"}`);
    }
  }
  seen = (w.crashes ?? []).length;
}
