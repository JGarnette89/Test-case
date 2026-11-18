/* =====================================================================
   THE DRIVE IN A REAL BROWSER (18 Nov 2026; DECISIONS 10.135). Chrome over the DevTools protocol, driving #/map the way Jay does: a real canvas, rastered and
   composited by the browser, a phone-sized viewport, a throttled CPU. It reads the SAME COUNTER Jay reads -- the frame meter's text, taken off the canvas
   as the page draws it (a hook on fillText), so `fps · worst · long · step` here is the number on his screen, not a similar one -- and, independent of the
   page's own meter, every rAF timestamp, the browser's long-animation-frame entries (script / style+layout / render, which the desk could never give),
   Performance.getMetrics every second (JS heap, script and task time), and the heap's drops (a major collection).

   --cpu-end N  ramps the CPU throttle from --cpu to N over the drive: a stand-in for a phone warming up (DECISIONS 10.135); a thermal state itself cannot be set from here.
   Usage:  node tools/measure/cdp-drive.mjs [--url U | --local] [--cars N] [--dpr 2|1.5|1] [--cpu 4] [--viewport 412x892] [--device-dpr 3.5]
             [--duration 120] [--warmup 15] [--set key=value ...] [--arms '[{"name":"a","set":{"dprCap":1}},{"name":"b","cpu":6}]'] [--repeat 2] [--headed] [--out name]
     --local   (default) builds the working tree into tools/scratch/dist-cdp once (--rebuild to redo) and serves it; --url points at any deployed build instead
               (the GitHub Pages one is https://jgarnette89.github.io/Test-case/), so the exact bundle Jay loads can be measured.
     An ARM is {name, set: {settings overrides}, cpu, dpr (cap), cars, viewport, deviceDpr}; the flags are the defaults every arm starts from. The drive is the same
     deterministic one in every arm (seed 1, the page's own default map, the throttle held down), so a comparison changes one thing.
   Output: a table to stdout and tools/scratch/cdp/<name>.json (every frame time, the meter lines, the heap series).
   ===================================================================== */
import http from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, extname, resolve } from "node:path";
import { launch } from "../lib/cdp.mjs";

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(`--${n}`); return i < 0 ? d : argv[i + 1]; };
const has = (n) => argv.includes(`--${n}`);
const all = (n) => argv.reduce((a, x, i) => (x === `--${n}` ? [...a, argv[i + 1]] : a), []);
const ROOT = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const num = (v) => (v == null ? v : Number(v));

const defaults = {
  cars: num(flag("cars", 100)), cpuEnd: num(flag("cpu-end", 0)), dpr: num(flag("dpr", 2)), cpu: num(flag("cpu", 4)),
  viewport: flag("viewport", "412x892"), deviceDpr: num(flag("device-dpr", 3.5)),
  set: Object.fromEntries(all("set").map((s) => { const [k, ...v] = s.split("="); const raw = v.join("="); return [k, raw === "true" ? true : raw === "false" ? false : isNaN(Number(raw)) ? raw : Number(raw)]; })),
};
const duration = num(flag("duration", 120)), warmup = num(flag("warmup", 15)), repeat = num(flag("repeat", 1));
const arms = flag("arms") ? JSON.parse(flag("arms")) : [{ name: "run" }];

/* ---- what to load ---- */
let base = flag("url", null), server = null;
if (!base) {
  const dist = resolve(flag("dist", join(ROOT, "tools/scratch/dist-cdp")));
  if (!existsSync(join(dist, "index.html")) || has("rebuild")) {
    console.log("building the working tree into tools/scratch/dist-cdp ...");
    execSync(`npx vite build --outDir "${dist}" --emptyOutDir`, { cwd: ROOT, stdio: "ignore" });
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
  server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html"; const f = join(dist, p); if (!f.startsWith(dist) || !existsSync(f) || !statSync(f).isFile()) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", types[extname(f)] ?? "application/octet-stream"); r.end(readFileSync(f)); });
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${server.address().port}/`;
}

/* ---- injected before the page's own code: the recorders ---- */
const hook = (settings) => `(() => {
  try { localStorage.setItem("row.settings.v1", ${JSON.stringify(JSON.stringify(settings))}); } catch (e) {}
  const R = (window.__cdp = { frames: [], meter: [], meter2: [], loaf: [], on: false, t0: 0 });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((now) => { if (R.on) R.frames.push(now); return cb(now); });
  const ft = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, ...a) {
    if (typeof s === "string" && s.includes(" fps · worst") && R.on && R.meter[R.meter.length - 1]?.s !== s) R.meter.push({ at: performance.now(), s });
    if (typeof s === "string" && s.startsWith("step max") && R.on && R.meter2[R.meter2.length - 1]?.s !== s) R.meter2.push({ at: performance.now(), s });
    return ft.call(this, s, ...a);
  };
  try { new PerformanceObserver((l) => { if (R.on) for (const e of l.getEntries()) R.loaf.push({ at: e.startTime, d: e.duration, script: (e.scripts || []).reduce((s, x) => s + x.duration, 0), pre: e.renderStart - e.startTime, rs: e.styleAndLayoutStart ? e.styleAndLayoutStart - e.startTime : null }); }).observe({ type: "long-animation-frame", buffered: false }); } catch (e) { R.noLoaf = true; }
})();`;

const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (a) => pct(a, 0.5);

async function runArm(arm, n) {
  const cfg = { ...defaults, ...arm, set: { ...defaults.set, ...(arm.set ?? {}) } };
  const [vw, vh] = String(cfg.viewport).split("x").map(Number);
  const settings = { carsByMap: { [flag("map", "test-highway-gen-wide")]: cfg.cars }, ...cfg.set, dprCap: cfg.set.dprCap ?? cfg.dpr };
  const cars = cfg.cars;
  const chrome = await launch({ headless: !has("headed") });
  const log = [];
  try {
    const { send, evaluate } = chrome;
    await send("Page.enable"); await send("Runtime.enable"); await send("Performance.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: vw, height: vh, deviceScaleFactor: cfg.deviceDpr, mobile: true });
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
    if (cfg.cpu > 1) await send("Emulation.setCPUThrottlingRate", { rate: cfg.cpu });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: hook(settings) });
    const url = `${base}${base.endsWith("/") ? "" : "/"}#/map`;
    await send("Page.navigate", { url });
    for (let i = 0; i < 200 && !(await evaluate(`!!document.querySelector("canvas")`)); i++) await new Promise((r) => setTimeout(r, 100));
    if (!(await evaluate(`!!document.querySelector("canvas")`))) throw new Error("no canvas: the page did not mount #/map");
    const stamp = await evaluate(`(document.body.innerText.match(/[0-9a-f]{6,8}\\+? (built|dev server)[^\\n]*/) || [""])[0]`);
    // the throttle held down: a real key event to the page
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
    await new Promise((r) => setTimeout(r, warmup * 1000));
    await evaluate(`(window.__cdp.frames.length = 0, window.__cdp.meter.length = 0, window.__cdp.loaf.length = 0, window.__cdp.on = true, window.__cdp.t0 = performance.now())`);
    const series = [];
    const t0 = Date.now();
    while (Date.now() - t0 < duration * 1000) {
      const m = (await send("Performance.getMetrics")).metrics, g = (k) => m.find((x) => x.name === k)?.value ?? 0;
      if (cfg.cpuEnd && cfg.cpuEnd !== cfg.cpu) await send("Emulation.setCPUThrottlingRate", { rate: +(cfg.cpu + ((cfg.cpuEnd - cfg.cpu) * (Date.now() - t0)) / (duration * 1000)).toFixed(2) });
      series.push({ t: (Date.now() - t0) / 1000, heap: g("JSHeapUsedSize"), script: g("ScriptDuration"), task: g("TaskDuration"), layout: g("LayoutDuration"), style: g("RecalcStyleDuration") });
      await new Promise((r) => setTimeout(r, 1000));
    }
    const d = await evaluate(`JSON.stringify({ frames: window.__cdp.frames, meter: window.__cdp.meter, meter2: window.__cdp.meter2, loaf: window.__cdp.loaf, noLoaf: !!window.__cdp.noLoaf, t0: window.__cdp.t0, now: performance.now(), dpr: devicePixelRatio, w: innerWidth, h: innerHeight })`).then(JSON.parse);
    const dt = d.frames.slice(1).map((f, i) => f - d.frames[i]);
    const meter = d.meter.map((x) => { const m = x.s.match(/(\d+) fps · worst (\d+) ms · (\d+) long · step ([\d.-]+) ms(?: · px ([\d.]+)x)?/); return m ? { at: (x.at - d.t0) / 1000, fps: +m[1], worst: +m[2], long: +m[3], step: m[4] === "-" ? null : +m[4], px: m[5] ? +m[5] : null, s: x.s } : null; }).filter(Boolean);
    // a major collection is the heap falling by more than 8 MB between two seconds
    const drops = series.slice(1).map((s, i) => ({ t: s.t, mb: (series[i].heap - s.heap) / 1048576 })).filter((x) => x.mb > 8);
    const out = {
      arm: arm.name ?? "run", n, stamp, version: chrome.version, cfg: { cars, dprCap: settings.dprCap, cpu: cfg.cpu, viewport: cfg.viewport, deviceDpr: cfg.deviceDpr, set: cfg.set }, canvas: { cssW: d.w, cssH: d.h, dpr: d.dpr },
      seconds: duration, frames: dt.length, fps: dt.length / (duration), p50: med(dt), p95: pct(dt, 0.95), p99: pct(dt, 0.99), max: Math.max(0, ...dt), over50: dt.filter((x) => x > 50).length, over100: dt.filter((x) => x > 100).length,
      meterWorstMax: Math.max(0, ...meter.map((m) => m.worst)), meterLongSeconds: meter.filter((m) => m.long > 0).length, meterSamples: meter.length, stepMed: med(meter.map((m) => m.step).filter((x) => x != null)), meterFpsMed: med(meter.map((m) => m.fps)), px: meter.find((m) => m.px)?.px ?? null,
      loaf: { n: d.loaf.length, unsupported: d.noLoaf, meanScript: d.loaf.length ? d.loaf.reduce((s, x) => s + x.script, 0) / d.loaf.length : 0, meanRender: d.loaf.length ? d.loaf.reduce((s, x) => s + (x.rs == null ? 0 : x.d - x.rs), 0) / d.loaf.length : 0, meanStyle: 0, worst: d.loaf.sort((a, b) => b.d - a.d).slice(0, 5).map((x) => ({ at: +((x.at - d.t0) / 1000).toFixed(1), d: +x.d.toFixed(0), script: +x.script.toFixed(0), afterScript: x.rs == null ? null : +(x.d - x.rs).toFixed(0), beforeRender: +x.pre.toFixed(0) })) },
      heap: { startMB: series[0].heap / 1048576, maxMB: Math.max(...series.map((s) => s.heap)) / 1048576, majors: drops.length, drops },
      frameTimes: dt.map((x) => +x.toFixed(1)), meterLines: meter, meter2: d.meter2.map((x) => { const m = x.s.match(/step max (\d+|-) · page (\d+)\/(\d+) ms · long by step (\d+) draw (\d+) other (\d+)/); return m ? { at: (x.at - d.t0) / 1000, stepMax: m[1] === "-" ? null : +m[1], cbMed: +m[2], cbMax: +m[3], byStep: +m[4], byDraw: +m[5], byOther: +m[6] } : null; }).filter(Boolean), series,
    };
    return out;
  } finally { await chrome.close(); }
}

const results = [];
for (const arm of arms) for (let n = 1; n <= repeat; n++) {
  process.stdout.write(`${arm.name ?? "run"} #${n} ... `);
  try { const r = await runArm(arm, n); results.push(r); console.log(`${r.fps.toFixed(1)} fps, p95 ${r.p95.toFixed(1)}, worst ${r.max.toFixed(0)} ms, >50 ms ${r.over50}, step ${r.stepMed} ms, ${r.heap.majors} heap drops`); }
  catch (e) { console.log(`FAILED: ${e.message}`); }
}
if (server) server.close();
if (!results.length) process.exit(1);
console.log(`\nChrome ${results[0].version}; build ${results[0].stamp || "(no stamp read)"}; ${duration} s of drive after ${warmup} s warm-up; ${results[0].cfg.viewport} at ${results[0].cfg.deviceDpr}x, canvas ${results[0].canvas.cssW}x${results[0].canvas.cssH} css.`);
console.log("arm".padEnd(14), "cars dpr cpu", "fps".padStart(6), "p50".padStart(6), "p95".padStart(6), "p99".padStart(6), "max".padStart(6), ">50".padStart(4), ">100".padStart(5), "step".padStart(6), "meterWorst".padStart(11), "longSec".padStart(8), "heapMB".padStart(7), "majors".padStart(7), "  loaf n  script afterScript");
for (const r of results) console.log(`${r.arm}#${r.n}`.padEnd(14), String(r.cfg.cars).padStart(4), String(r.cfg.dprCap).padStart(3), String(r.cfg.cpu).padStart(3), r.fps.toFixed(1).padStart(8), r.p50.toFixed(1).padStart(6), r.p95.toFixed(1).padStart(6), r.p99.toFixed(1).padStart(6), r.max.toFixed(0).padStart(6), String(r.over50).padStart(4), String(r.over100).padStart(5), String(r.stepMed).padStart(6), String(r.meterWorstMax).padStart(11), String(r.meterLongSeconds).padStart(8), r.heap.maxMB.toFixed(0).padStart(7), String(r.heap.majors).padStart(7), `  ${String(r.loaf.unsupported ? "n/a" : r.loaf.n).padStart(5)} ${r.loaf.meanScript.toFixed(1).padStart(6)} ${r.loaf.meanRender.toFixed(1).padStart(6)}`);
mkdirSync(join(ROOT, "tools/scratch/cdp"), { recursive: true });
const name = flag("out", `cdp-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}`);
writeFileSync(join(ROOT, `tools/scratch/cdp/${name}.json`), JSON.stringify(results));
console.log(`\nwritten tools/scratch/cdp/${name}.json`);
