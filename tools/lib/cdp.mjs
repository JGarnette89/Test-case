/* A MINIMAL CHROME DEVTOOLS PROTOCOL CLIENT (18 Nov 2026). No dependency: Node's own WebSocket and fetch, and the Chrome already on the machine.
   Why it exists: every desk measurement of the draw ran in a node stub with no raster, no compositor and no memory limits, and was read as if it were
   the phone's frame (DECISIONS 10.135). This drives a REAL browser, so the canvas is rastered and composited by Chrome. */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CANDIDATES = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].filter(Boolean);
export const chromePath = () => CANDIDATES.find((p) => existsSync(p)) ?? null;

export async function launch({ port = 9333 + Math.floor(Math.random() * 500), headless = true, extra = [] } = {}) {
  const exe = chromePath();
  if (!exe) throw new Error("no Chrome or Edge found (set CHROME_PATH)");
  const dir = mkdtempSync(join(tmpdir(), "cdp-profile-"));
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--enable-precise-memory-info", ...(headless ? ["--headless=new"] : []), ...extra, "about:blank"];
  const proc = spawn(exe, args, { stdio: "ignore" });
  let version = null;
  for (let i = 0; i < 100 && !version; i++) { try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await new Promise((r) => setTimeout(r, 100)); } }
  if (!version) { proc.kill(); throw new Error("Chrome did not open its debugging port"); }
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = tabs.find((t) => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), handlers = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { const { res, rej } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(`${d.error.message}`)) : res(d.result); } else if (d.method) for (const h of handlers.get(d.method) ?? []) h(d.params); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (method, h) => { (handlers.get(method) ?? handlers.set(method, []).get(method)).push(h); };
  const evaluate = async (expression) => { const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); return r.result.value; };
  const close = async () => { try { ws.close(); } catch { /* gone */ } try { proc.kill(); } catch { /* gone */ } await new Promise((r) => setTimeout(r, 400)); try { rmSync(dir, { recursive: true, force: true }); } catch { /* the profile may linger; it is in the temp directory */ } };
  return { send, on, evaluate, close, version: version.Browser, pid: proc.pid };
}
