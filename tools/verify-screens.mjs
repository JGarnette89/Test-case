/* Do the screens actually render?
 *
 * THE ONE BLIND SPOT IN THE WHOLE SUITE, AND IT COST TWENTY INCREMENTS.
 * The Examiner screen was first in the mode switcher and threw a
 * ReferenceError the instant it mounted, from the day it was written:
 * `watched` and `beliefs` were used and never declared, and `aim`,
 * `setLooking` and `worldRef` were left dangling when the gaze cone was
 * deleted out of sight.js. Every examiner increment from the flip onward
 * was verified headlessly and never once looked at.
 *
 * CLAUDE.md already said it: the suite "cannot catch a React mistake, so
 * the component still needs eyes on it". That was true and it was not
 * enough, because nobody's eyes went there. This check is the cheapest
 * thing that would have caught it on the first increment rather than the
 * twentieth.
 *
 * It asserts NOTHING about what is drawn. It only proves the component
 * mounts and produces markup. Everything about how it looks still needs a
 * person, and this does not pretend otherwise.
 *
 * How: vite's own SSR build bundles the component, then react-dom/server
 * renders it. No DOM, no animation frames, no timers — which is exactly
 * why it is cheap enough to run every time. Effects do not fire under
 * SSR, so this catches render-time mistakes and not effect-time ones; the
 * four that broke this screen were all render-time.
 */
import { build } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

let problems = 0;
const ok = (s) => console.log(`  ok   ${s}`);
const fail = (s) => { problems++; console.log(`  FAIL: ${s}`); };

/* The screens a player can actually reach. A new one belongs here the day
   it is added to the mode switcher. */
const SCREENS = [
  { id: "ExaminerDrive", file: "src/apps/ExaminerDrive.jsx", why: "the playable loop" },
  { id: "ExaminerLab", file: "src/apps/ExaminerLab.jsx", why: "the bench behind it" },
  { id: "RightOfWayTiming", file: "src/apps/RightOfWayTiming.jsx", why: "the only renderer there is" },
  { id: "MergeRush", file: "src/apps/MergeRush.jsx", why: "unwired, but reachable at #/merge-rush" },
];

/* A window just real enough to import a browser module. Deliberately
   minimal: anything a screen genuinely needs from the DOM at RENDER time
   is a thing worth knowing about, so the shim stays thin rather than
   pretending to be a browser. */
function shimWindow() {
  if (globalThis.window) return;
  const noop = () => {};
  const store = new Map();
  globalThis.window = {
    location: { hash: "", href: "http://localhost/", search: "" },
    addEventListener: noop, removeEventListener: noop,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    requestAnimationFrame: noop, cancelAnimationFrame: noop,
    devicePixelRatio: 1, innerWidth: 390, innerHeight: 780,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
  globalThis.localStorage = globalThis.window.localStorage;
  globalThis.matchMedia = globalThis.window.matchMedia;
  globalThis.navigator ??= { userAgent: "node" };
}

async function bundle(file, out) {
  await build({
    logLevel: "silent",
    configFile: false,
    build: {
      ssr: true,
      outDir: out,
      emptyOutDir: true,
      minify: false,
      rollupOptions: {
        input: path.resolve(file),
        output: { format: "es", entryFileNames: "screen.mjs" },
      },
    },
    esbuild: { jsx: "automatic" },
  });
  return pathToFileURL(path.join(out, "screen.mjs")).href;
}

console.log("\n" + "=".repeat(70));
console.log("SCREENS: do they render at all?");
console.log("=".repeat(70));
console.log("");

shimWindow();
fs.mkdirSync(path.resolve("node_modules/.cache"), { recursive: true });
/* Inside the project, not the OS temp dir: the bundle imports react and
   lucide-react as externals, so node has to be able to resolve them from
   where the file sits. */
const tmp = fs.mkdtempSync(path.join(path.resolve("node_modules/.cache"), "screens-"));
try {
  for (const s of SCREENS) {
    if (!fs.existsSync(s.file)) { fail(`${s.id}: ${s.file} does not exist`); continue; }
    let html = null, err = null;
    try {
      const mod = await import(await bundle(s.file, path.join(tmp, s.id)));
      if (typeof mod.default !== "function") throw new Error("no default export to render");
      html = renderToStaticMarkup(createElement(mod.default));
    } catch (e) {
      err = e;
    }
    if (err) {
      fail(`${s.id} (${s.why}) threw on mount: ${err.message}`);
      continue;
    }
    html.length > 200
      ? ok(`${s.id} mounts and draws ${html.length} characters of markup (${s.why})`)
      : fail(`${s.id} mounted but produced almost nothing (${html.length} chars)`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("");
console.log("   This proves the screens mount. It says nothing about whether they");
console.log("   look right, and it cannot: effects do not run under SSR, so an");
console.log("   animation or a layout mistake still needs somebody to open the page.");

console.log("\n" + "=".repeat(70));
if (problems) {
  console.log(`FAILED: ${problems} problem(s).`);
  process.exit(1);
}
console.log("OK: every reachable screen renders.");
