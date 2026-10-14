// Runs the BUILT worker bundle in a Node worker thread, shimmed as a browser worker, and drives it.
const { Worker } = require("worker_threads");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const file = path.resolve("dist/assets/" + fs.readdirSync("dist/assets").find((f) => f.startsWith("sim.worker-")));
const href = pathToFileURL(file).href;
const code = [
  'const { parentPort } = require("worker_threads");',
  "globalThis.self = globalThis;",
  "globalThis.postMessage = (m) => parentPort.postMessage(m);",
  'parentPort.on("message", (m) => globalThis.onmessage && globalThis.onmessage({ data: m }));',
  "import(" + JSON.stringify(href) + ').catch((e) => parentPort.postMessage({ type: "loadError", message: String(e) }));',
].join("\n");
const w = new Worker(code, { eval: true });
let seq = 0, steps = 0, t0 = 0;
w.on("message", (r) => {
  if (r.type !== "world") { console.log("ERROR", r); process.exit(1); }
  if (r.seq === 1) { console.log("init ok, actors", r.dyn.actors.length, "keys", Object.keys(r.dyn).length, "course sent:", "course" in r.dyn); t0 = Date.now(); }
  if (steps < 200) { steps++; w.postMessage({ type: "step", me: null, seq: ++seq }); }
  else { console.log("200 steps, t =", r.dyn.t.toFixed(2), "ms per step", ((Date.now() - t0) / 200).toFixed(2)); w.terminate(); }
});
w.on("error", (e) => { console.log("worker error", e); process.exit(1); });
w.postMessage({ type: "init", args: [1, 50, 2.0, false, null, null, null, false], seq: ++seq });
