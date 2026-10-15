/* THE WORLD'S PACE WITH THE SIM ON THE PAGE, PREDICTED FOR THE PHONE
   (15 October). #/map's in-page loop replayed headlessly: vsync at 60 Hz,
   the accumulator stepping the world when a tick is owed, each frame
   taking its own work rounded up to the next vsync. The work is the
   desk's real step time for this tick times the phone's factor -- the
   phone's own worker step over the desk's at the same density, measured
   (17.1/20.8/21.2 ms against 11.7/12.9/13.1 ms: about 1.6) -- plus the
   page's frame work as the phone read it (our frame 4-6 ms).
   Usage: node tools/measure/page-loop.mjs [cars=164] [factor=1.6] [frameMs=5] [seconds=60] */
import { performance } from "node:perf_hooks";
import { worldFor } from "../../src/sim/scene.js";
import { step } from "../../src/sim/crossing.js";
import { stepDriver, withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";

const [cars = 164, factor = 1.6, frameMs = 5, secs = 60] = process.argv.slice(2).map(Number);
let { world: w, me } = worldFor(1, 50, 2.0, true, cars, null, null, false);
const VSYNC = 1000 / 60;
let wall = 0, owed = 0, simT = 0, frames = [], ticksAt = [];
for (let f = 0; wall < secs * 1000; f++) {
  let work = frameMs;
  const dt = frames.length ? frames[frames.length - 1] / 1000 : VSYNC / 1000;
  owed += Math.min(0.25, dt);
  while (owed >= DT) {
    owed -= DT;
    me = stepDriver(me, { steer: -me.off * 0.3 - me.psi * 3, slider: me.v < 11 ? 0.4 : 0.05, assist: 0 }, w, DT);
    const t0 = performance.now();
    w = step(withDriver(w, me));
    work += (performance.now() - t0) * factor;
    simT += DT;
    ticksAt.push(wall);
  }
  const took = Math.ceil(work / VSYNC) * VSYNC;
  frames.push(took); wall += took;
}
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
const gaps = ticksAt.slice(1).map((t, i) => t - ticksAt[i]).filter((g) => g > 0);
console.log(`test map 1, ${w.actors.length} cars, step x${factor}, page frame ${frameMs} ms: world ${(simT / (wall / 1000)).toFixed(3)}x real time; frames p50 ${q(frames, 0.5).toFixed(1)} p95 ${q(frames, 0.95).toFixed(1)} max ${Math.max(...frames).toFixed(1)} ms (${(frames.length / (wall / 1000)).toFixed(0)} fps); tick gaps p95 ${q(gaps, 0.95).toFixed(1)} max ${Math.max(...gaps).toFixed(1)} ms`);
