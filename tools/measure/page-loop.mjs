/* THE WORLD'S PACE WITH THE SIM ON THE PAGE, PREDICTED FOR THE PHONE
   (15 October; the pacing compared, 22 October). #/map's in-page loop
   replayed headlessly: vsync at 60 Hz, each frame taking its own work
   rounded up to the next vsync. The work is the desk's real step time for
   each tick times the phone's factor plus the page's own frame work.
   The factor: 1.6 on test map 1 at ~160 cars (15 October); on the endless
   highway at 259 cars the phone read a 43.6 ms page step against the
   desk's 9.5 -- about 4.6.
   Two pacings: "until" -- step while a tick is owed (the loop before 22
   October) -- and "budget" (sim/pace.js pageMore/pageLeft, the loop now).
   Usage: node tools/measure/page-loop.mjs [cars=164] [factor=1.6] [frameMs=5] [seconds=60] [map=test-1] [pacing=until,budget] */
import { performance } from "node:perf_hooks";
import { worldFor } from "../../src/sim/scene.js";
import { TEST_MAPS } from "../../src/map/samples.js";
import { step } from "../../src/sim/crossing.js";
import { stepDriver, withDriver } from "../../src/sim/drive.js";
import { DT } from "../../src/sim/traffic.js";
import { pageMore, pageLeft } from "../../src/sim/pace.js";

const args = process.argv.slice(2);
const [cars = 164, factor = 1.6, frameMs = 5, secs = 60] = args.slice(0, 4).map(Number);
const mapId = args[4] ?? "test-1", pacings = (args[5] ?? "until,budget").split(",");
const raw = mapId === "test-1" ? null : TEST_MAPS.find((m) => m.id === mapId).build();
const VSYNC = 1000 / 60;
const q = (xs, p) => [...xs].sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
for (const pacing of pacings) {
  let { world: w, me } = worldFor(1, 50, 2.0, true, cars, raw, raw?.sections?.[0]?.start ?? null, false);
  let wall = 0, owed = 0, simT = 0;
  const frames = [], ticksAt = [], perFrame = [];
  for (let f = 0; wall < secs * 1000; f++) {
    let work = frameMs, sim = 0, steps = 0;
    const dt = frames.length ? frames[frames.length - 1] / 1000 : VSYNC / 1000;
    owed += Math.min(0.25, dt);
    while (pacing === "until" ? owed >= DT : pageMore(owed, steps, sim)) {
      owed -= DT; steps++;
      me = stepDriver(me, { steer: -me.off * 0.3 - me.psi * 3, slider: me.v < 11 ? 0.4 : 0.05, assist: 0 }, w, DT);
      const t0 = performance.now();
      w = step(withDriver(w, me));
      const ms = (performance.now() - t0) * factor;
      work += ms; sim += ms; simT += DT;
      ticksAt.push(wall);
    }
    if (pacing !== "until") owed = pageLeft(owed);
    perFrame.push(steps);
    const took = Math.ceil(work / VSYNC) * VSYNC;
    frames.push(took); wall += took;
  }
  const gaps = ticksAt.slice(1).map((t, i) => t - ticksAt[i]).filter((g) => g > 0);
  console.log(`${mapId}, ${w.actors.length} cars, step x${factor}, ${pacing.padEnd(6)}: world ${(simT / (wall / 1000)).toFixed(2)}x real time; frames p50 ${q(frames, 0.5).toFixed(0)} p95 ${q(frames, 0.95).toFixed(0)} max ${Math.max(...frames).toFixed(0)} ms (${(frames.length / (wall / 1000)).toFixed(1)} fps); steps a frame p50 ${q(perFrame, 0.5)} max ${Math.max(...perFrame)}; tick gaps p95 ${q(gaps, 0.95).toFixed(0)} ms`);
}
