/* THE FRAME METER AND THE LAMP HEIGHTS (17 Nov 2026, Jay's two small asks). Expectations are stated here, not read from the module.
   1. A steady 16.67 ms frame reads 60 fps, worst 16.7 ms, no long frames.
   2. ONE 200 ms frame in a second shows: worst 200, one long, and fps down -- the stutter a median would hide.
   3. The step column is the median of the steps in the window, and old samples fall out of it.
   4. The meter is drawn outside clean mode's guard (the source says so: the call is not under `!cleanRef.current`).
   5. Lamps: a truck's and a bus's lamps sit at about a metre (never on the roof, 3.4 m / 3.2 m), a car's where they were (its body's 0.75 m), for brake lamps and blinkers.
   Sabotage (done 17 Nov): lamps back at the roof height fails 5 (truck 3.40 m, bus 3.20 m), restored byte-identical.
   Usage: node tools/verify-framemeter.mjs */
// THE FILES THIS CHECK READS AS TEXT, which the import graph cannot see (18 Nov 2026: the Sharpness chip rewrote a line of MapRoad.jsx that verify-framemeter greps, and the derived set missed it, so the change shipped with this check red; see DECISIONS 10.129):
// check-input: ../src/apps/MapRoad.jsx
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
  /* The call is `{ const mt = frameMeter.text(now); drawFrameMeter(ctx, mt ? ...px suffix... : "") }` on one line (18 Nov: the Sharpness chip put the pixel scale into the counter); the line that holds it must still carry no clean-mode guard. */
  const i = src.indexOf("drawFrameMeter(ctx, mt"), line = src.slice(src.lastIndexOf("\n", i) + 1, src.indexOf("\n", i));
  check(i > 0 && !/cleanRef/.test(line), "the meter is drawn with no clean-mode guard on its line"); }
{ const zs = []; const view = { into: (x, y, z) => { zs.push(z); return [x, y]; } };
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const at = { x: 0, y: 0, z: 0 };
  const run = (a, L, W, top, front) => { zs.length = 0; paintLamps(ctx, view, a, at, 0, L, W, top, front, 5, 0, null); return Math.max(...zs); };
  const truck = run({ brakeLamp: true, blinker: "left", n: 0 }, 9, 2.55, 3.4, 2.72), bus = run({ brakeLamp: true, blinker: "left", n: 0 }, 12.2, 2.6, 3.2, 3.2), car = run({ brakeLamp: true, blinker: "left", n: 0 }, 4.5, 1.8, 0.75, 0.75);
  check(truck <= 1.05 && truck > 0.5, `truck lamps at ${truck.toFixed(2)} m (not the 3.4 m roof)`);
  check(bus <= 1.05 && bus > 0.5, `bus lamps at ${bus.toFixed(2)} m (not the 3.2 m roof)`);
  check(Math.abs(car - 0.75) < 1e-9, `car lamps unchanged at ${car.toFixed(2)} m`); }
/* 6. WHAT MADE A LONG GAP (DECISIONS 10.137), stated here with frames built by hand. A gap is the work BEFORE it: the previous frame's callback. */
{ const run = (cb, stepMs, gap) => { const m = makeFrameMeter(); m.frame(1000); m.step(1001, stepMs); m.work(cb); m.frame(1000 + gap); return m.stats(1000 + gap); };
  const st = run(110, 100, 120), dr = run(110, 10, 120), ot = run(5, 3, 120), no = run(110, 100, 30);
  check(st.longStep === 1 && st.longDraw === 0 && st.longOther === 0, `a 120 ms gap after a 110 ms callback that was mostly a 100 ms step is a STEP gap: ${st.longStep}/${st.longDraw}/${st.longOther}`);
  check(dr.longDraw === 1 && dr.longStep === 0 && dr.longOther === 0, `the same gap after a callback that was mostly not the step is a DRAW gap: ${dr.longStep}/${dr.longDraw}/${dr.longOther}`);
  check(ot.longOther === 1 && ot.longStep === 0 && ot.longDraw === 0, `a 120 ms gap after a 5 ms callback is OUTSIDE the page's script (raster, GPU, browser): ${ot.longStep}/${ot.longDraw}/${ot.longOther}`);
  check(no.long === 0 && no.longStep + no.longDraw + no.longOther === 0, "a 30 ms gap is no long frame and is attributed to nothing");
  const m = makeFrameMeter(); m.frame(0); m.step(1, 20); m.step(2, 70); m.work(95); m.frame(100); m.step(101, 8); m.work(12); m.frame(116);
  const t = m.stats(116); check(t.stepMax === 70 && t.cbMax === 95, `the tail is shown, not only the median: step max ${t.stepMax} (70), page callback max ${t.cbMax} (95), step median ${t.step}`);
  const src2 = fs.readFileSync(new URL("../src/apps/MapRoad.jsx", import.meta.url), "utf8");
  check(/frameMeter\.work\(/.test(src2) && /frameMeter\.text2\(\)/.test(src2), "the page closes each frame's callback with work() and draws the second line"); }
console.log(failed ? `\n${failed} FAILED` : "\nall passed"); process.exit(failed ? 1 : 0);
