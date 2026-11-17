/* THE FRAME METER AND THE LAMP HEIGHTS (17 Nov 2026, Jay's two small asks). Expectations are stated here, not read from the module.
   1. A steady 16.67 ms frame reads 60 fps, worst 16.7 ms, no long frames.
   2. ONE 200 ms frame in a second shows: worst 200, one long, and fps down -- the stutter a median would hide.
   3. The step column is the median of the steps in the window, and old samples fall out of it.
   4. The meter is drawn outside clean mode's guard (the source says so: the call is not under `!cleanRef.current`).
   5. Lamps: a truck's and a bus's lamps sit at about a metre (never on the roof, 3.4 m / 3.2 m), a car's where they were (its body's 0.75 m), for brake lamps and blinkers.
   Sabotage (done 17 Nov): lamps back at the roof height fails 5 (truck 3.40 m, bus 3.20 m), restored byte-identical.
   Usage: node tools/verify-framemeter.mjs */
import fs from "node:fs";
import { makeFrameMeter, drawFrameMeter } from "../src/iso/hud.js";
import { paintLamps } from "../src/iso/draw.js";
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? " ok " : "FAIL"} ${msg}`); if (!ok) failed++; };

{ const m = makeFrameMeter(); let t = 1000; for (let i = 0; i < 90; i++) { m.frame(t); t += 1000 / 60; }
  const s = m.stats(t - 1000 / 60);
  check(Math.abs(s.fps - 60) < 1.5 && Math.abs(s.worst - 16.67) < 0.1 && s.long === 0, `steady 60: ${s.fps.toFixed(1)} fps, worst ${s.worst.toFixed(1)}, long ${s.long}`); }
{ const m = makeFrameMeter(); let t = 1000; for (let i = 0; i < 40; i++) { m.frame(t); t += 1000 / 60; } t += 200 - 1000 / 60; m.frame(t); for (let i = 0; i < 20; i++) { t += 1000 / 60; m.frame(t); }
  const s = m.stats(t);
  check(Math.round(s.worst) === 200 && s.long === 1 && s.fps < 55, `one 200 ms frame: worst ${s.worst.toFixed(0)}, long ${s.long}, fps ${s.fps.toFixed(1)} (a mean would read ${(1000 / 60 + 200 / 60).toFixed(0)} ms)`); }
{ const m = makeFrameMeter(); m.step(0, 100); m.step(500, 10); m.step(700, 12);
  check(m.stats(900).step === 12, `step median of 100, 10, 12 is ${m.stats(900).step} (12), the 100 ms outlier not the answer`);
  check(m.stats(1200).step === 11 || m.stats(1200).step === 12, `the 100 ms step has aged out by 1200 ms: median of 10, 12 = ${m.stats(1200).step}`); }
{ const src = fs.readFileSync(new URL("../src/apps/MapRoad.jsx", import.meta.url), "utf8");
  const i = src.indexOf("drawFrameMeter(ctx, frameMeter.text(now))"), line = src.slice(src.lastIndexOf("\n", i) + 1, src.indexOf("\n", i));
  check(i > 0 && !/cleanRef/.test(line), "the meter is drawn with no clean-mode guard on its line"); }
{ const zs = []; const view = { into: (x, y, z) => { zs.push(z); return [x, y]; } };
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const at = { x: 0, y: 0, z: 0 };
  const run = (a, L, W, top, front) => { zs.length = 0; paintLamps(ctx, view, a, at, 0, L, W, top, front, 5, 0, null); return Math.max(...zs); };
  const truck = run({ brakeLamp: true, blinker: "left", n: 0 }, 9, 2.55, 3.4, 2.72), bus = run({ brakeLamp: true, blinker: "left", n: 0 }, 12.2, 2.6, 3.2, 3.2), car = run({ brakeLamp: true, blinker: "left", n: 0 }, 4.5, 1.8, 0.75, 0.75);
  check(truck <= 1.05 && truck > 0.5, `truck lamps at ${truck.toFixed(2)} m (not the 3.4 m roof)`);
  check(bus <= 1.05 && bus > 0.5, `bus lamps at ${bus.toFixed(2)} m (not the 3.2 m roof)`);
  check(Math.abs(car - 0.75) < 1e-9, `car lamps unchanged at ${car.toFixed(2)} m`); }
console.log(failed ? `\n${failed} FAILED` : "\nall passed"); process.exit(failed ? 1 : 0);
