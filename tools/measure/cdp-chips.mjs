/* THE BISECT CHIPS, IN A REAL BROWSER (DECISIONS 10.138): loads the built working tree (tools/scratch/dist-cdp), opens the debug chips, steps the Canvas chip through std / opaque / desync / both and the Layers chip through all / no ground / floor only / nothing,
   and for each reads the frame counter's text off the canvas and saves a screenshot to tools/scratch/cdp/chips-<state>.png -- so an opaque canvas that is black, or a remount that stops the loop, is SEEN and not assumed. Usage: node tools/measure/cdp-chips.mjs */
import http from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { launch } from "../lib/cdp.mjs";
const ROOT = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), dist = join(ROOT, "tools/scratch/dist-cdp");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((q, r) => { let p = q.url.split("?")[0]; if (p.endsWith("/")) p += "index.html"; const f = join(dist, p); if (!existsSync(f)) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", types[extname(f)] ?? "application/octet-stream"); r.end(readFileSync(f)); });
await new Promise((res) => server.listen(0, "127.0.0.1", res));
const chrome = await launch();
mkdirSync(join(ROOT, "tools/scratch/cdp"), { recursive: true });
const hook = `(() => { const R = (window.__t = { meter: [], m2: [] }); const ft = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { if (typeof s === "string") { if (s.includes(" fps · worst")) R.meter.push(s); if (s.startsWith("step max")) R.m2.push(s); } return ft.call(this, s, ...a); }; })();`;
try {
  const { send, evaluate } = chrome;
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 412, height: 892, deviceScaleFactor: 2, mobile: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: hook });
  await send("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/#/map` });
  for (let i = 0; i < 200 && !(await evaluate(`!!document.querySelector("canvas")`)); i++) await new Promise((r) => setTimeout(r, 100));
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
  await new Promise((r) => setTimeout(r, 6000));
  const click = (label) => evaluate(`(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(${JSON.stringify(label)})); if (!b) return "no button"; b.click(); return b.textContent.trim(); })()`);
  const read = async (name) => {
    await evaluate(`(window.__t.meter.length = 0, window.__t.m2.length = 0)`); await new Promise((r) => setTimeout(r, 2500));
    const t = await evaluate(`JSON.stringify({ m: window.__t.meter.slice(-1)[0], m2: window.__t.m2.slice(-1)[0], n: window.__t.meter.length, canvases: document.querySelectorAll("canvas").length })`).then(JSON.parse);
    const shot = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(join(ROOT, `tools/scratch/cdp/chips-${name}.png`), Buffer.from(shot.data, "base64"));
    console.log(`${name.padEnd(14)} canvases ${t.canvases}; ${t.m ?? "(no meter text)"}${t.m2 ? "\n".padEnd(16) + t.m2 : ""}`);
  };
  console.log("chip found:", await click("Canvas:").then((x) => x), "(clicked once: opaque)"); await read("canvas-opaque");
  await click("Canvas:"); await read("canvas-desync"); await click("Canvas:"); await read("canvas-both"); await click("Canvas:"); await read("canvas-std");
  await click("Layers:"); await read("layers-noground"); await click("Layers:"); await read("layers-floor"); await click("Layers:"); await read("layers-nothing"); await click("Layers:"); await read("layers-all");
} finally { await chrome.close(); server.close(); }
