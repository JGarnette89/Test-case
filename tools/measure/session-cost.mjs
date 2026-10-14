/* WHAT THE SESSION COSTS PER TICK (14 October): noticeTick -- the event
   detectors, the route, the voice -- against the sim step it rides beside,
   with the player driving straight on at the limit. The page runs it on
   every tick (in-thread) or every worker reply, so a cost here is paid
   every 50 ms whatever is on screen.
   Usage: node tools/measure/session-cost.mjs [map=test1|city] [cars=150] [seconds=60] */
import { performance } from "node:perf_hooks";
import { worldFor } from "../../src/sim/scene.js";
import { testCityReady } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { stepDriver, withDriver } from "../../src/sim/drive.js";
import { detect, newEventState } from "../../src/sim/events.js";
import { noticeTick } from "../../src/sim/session.js";
import { placesOf, routeTo } from "../../src/sim/route.js";
import { DT } from "../../src/sim/traffic.js";

const [mapId = "test1", carsArg = "150", secsArg = "60"] = process.argv.slice(2);
const raw = mapId === "city" ? testCityReady() : null;
let { loaded, world: w, me } = worldFor(1, 50, null, "drive", Number(carsArg), raw);
const sc = { me, args: [1] };
const P = placesOf(w.course, loaded);
sc.dest = P.find((p) => (routeTo(w.course, me, p)?.length ?? 0) > 400) ?? null;
const t = { step: [], detect: [], notice: [] };
let ev = newEventState();
for (let n = 0; n < Number(secsArg) / DT; n++) {
  const prev = { me, world: w };
  me = stepDriver(me, { steer: -me.off * 0.3 - me.psi * 3, slider: me.v < 11 ? 0.4 : 0.05, assist: 0 }, w, DT);
  let a = performance.now();
  w = step(withDriver(w, me));
  t.step.push(performance.now() - a);
  a = performance.now(); ev = detect(prev, { me, world: w }, ev).state; t.detect.push(performance.now() - a);
  a = performance.now(); noticeTick(sc, prev, { me, world: w }); sc.me = me; t.notice.push(performance.now() - a);
}
const q = (xs, f) => [...xs].sort((x, y) => x - y)[Math.floor(f * (xs.length - 1))];
console.log(`${mapId}, ${w.actors.length} actors, places ${P.length}, dest ${sc.dest ? "yes" : "none"}`);
for (const [k, xs] of Object.entries(t)) console.log(`  ${k.padEnd(7)} median ${q(xs, 0.5).toFixed(3)} ms  p95 ${q(xs, 0.95).toFixed(3)}  max ${Math.max(...xs).toFixed(2)}`);
