/* WHAT THE WORKER'S ANSWER COSTS NOW, ON THE GENERATED ROAD (17-18 Nov 2026; Jay's counter: step 19-21 ms, 19 fps, worst frame near the mean, on a Pixel 7 Pro). The worker was turned off on 15 October because on
   the phone "the way back" (the browser turning each answer into objects) cost 6 to 9 times the step it carried (SIMULATOR.md 1.2.11), with the answer a structured clone of every actor; `remote.js` has since slimmed it
   (a known driver's fixed fields are not resent) but the "two transferred buffers" rebuild that file's own settings comment asks for has NOT been made. This measures, per tick of a driven world at `cars`, what the page would
   spend taking an answer: the worker's own diff (`changed`), the clone across (structuredClone of the answer, standing for the browser's send plus read), the lay-over (`merge`), the bytes sent, and the step itself, so the
   ratio is the number: answer cost over step. Desk machine, one process, idle. Usage: node tools/measure/worker-answer-cost.mjs [cars=160] [map=test-highway-gen-wide] */
import { serialize } from "node:v8";
import { TEST_MAPS } from "../../src/map/samples.js";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { withDriver } from "../../src/sim/drive.js";
import { changed, merge } from "../../src/sim/remote.js";
import { DT } from "../../src/sim/traffic.js";
import { goodStep } from "../lib/good-driver.mjs";
const cars = Number(process.argv[2] ?? 160), id = process.argv[3] ?? "test-highway-gen-wide";
const raw = () => TEST_MAPS.find((m) => m.id === id).build();
let { world: w, me } = worldFor(1, 50, 2.0, true, cars, raw(), raw().sections?.[0]?.start ?? null, false, false, { preroll: 15 });
const sc = { me, args: [1], saveWallet: false };
let sent = w, copy = w; { const first = changed(w, null); copy = merge({}, structuredClone(first)); sent = w; }
const T = { step: [], diff: [], clone: [], merge: [], bytes: [] };
for (let i = 0; i < 50 / DT; i++) {
  me = goodStep(me, w, sc, { overtake: true, pace: 1 }); sc.me = me;
  let t = performance.now(); w = step(withDriver(w, me)); const s = performance.now() - t;
  t = performance.now(); const dyn = changed(w, sent); const d = performance.now() - t; sent = w;
  t = performance.now(); const cl = structuredClone(dyn); const c = performance.now() - t;
  t = performance.now(); copy = merge(copy, cl); const m = performance.now() - t;
  if (i >= 30 / DT) { T.step.push(s); T.diff.push(d); T.clone.push(c); T.merge.push(m); T.bytes.push(serialize(dyn).length); }
}
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const [s, d, c, m] = [med(T.step), med(T.diff), med(T.clone), med(T.merge)];
console.log(`${id}, ${cars} cars (${w.actors.length} in the world), median per tick: step ${s.toFixed(2)} ms | worker's diff ${d.toFixed(2)} | clone across ${c.toFixed(2)} | lay over ${m.toFixed(2)} | the page's share of an answer (clone + lay over) ${(c + m).toFixed(2)} ms = ${((c + m) / s).toFixed(2)}x the step it carried | ${(med(T.bytes) / 1024).toFixed(0)} KB an answer`);
