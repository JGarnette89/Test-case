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
  /* App FIRST, because it is the one every player actually loads and it
     was the blind spot inside the blind spot: this check rendered the
     mode components directly and never the shell that routes to them, so
     a mistake in the home screen or the switcher produced a blank page
     with every other check green. */
  { id: "App", file: "src/App.jsx", why: "the shell every route goes through" },
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
  /* EVERY ROUTE, not just the default one. App renders whatever the hash
     names, so rendering it once at "" proves the home screen and nothing
     else -- and a mode reachable only by typing its hash is exactly the
     kind of thing that rots unnoticed now that the driver game is
     unlisted. Each route gets its own module instance, because App reads
     the hash at module scope through readHash(). */
  console.log("");
  const ROUTES = [
    ["", "home"],
    ["#/drive", "the examiner drive"],
    ["#/examiner", "the examiner lab"],
    ["#/timing", "timing (unlisted)"],
    ["#/daily", "today's intersection (unlisted)"],
    ["#/endless", "endless (unlisted)"],
    ["#/roguelike", "roguelike (unlisted)"],
    ["#/drives", "the drives submenu (unlisted)"],
    ["#/tutorial", "the tutorial submenu (unlisted)"],
    ["#/test", "the test menu"],
    ["#/merge-rush", "the unwired prototype"],
    ["#/nonsense", "an unknown route"],
  ];
  let routeFails = 0;
  for (const [hash, why] of ROUTES) {
    globalThis.window.location.hash = hash;
    let html = null, err = null;
    try {
      const mod = await import(await bundle("src/App.jsx", path.join(tmp, "route" + ROUTES.indexOf(hash === "" ? ROUTES[0] : ROUTES.find((r) => r[0] === hash)))));
      html = renderToStaticMarkup(createElement(mod.default));
    } catch (e) { err = e; }
    if (err) { routeFails++; fail(`${hash || "#/"} (${why}) threw: ${err.message}`); continue; }
    html.length > 200
      ? ok(`${(hash || "#/").padEnd(14)} renders ${String(html.length).padStart(7)} chars  ${why}`)
      : (routeFails++, fail(`${hash || "#/"} (${why}) rendered almost nothing (${html.length} chars)`));
  }
  globalThis.window.location.hash = "";
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* Plain scanning rather than a regex, for the same reason as the counting
   below: a mangled escape here would silently disable the whole check. */
function stripComments(src) {
  let out = "", i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "/*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? src.length : e + 2; continue; }
    if (two === "//" && src[i - 1] !== ":") { const e = src.indexOf("\n", i); i = e < 0 ? src.length : e; continue; }
    out += src[i++];
  }
  return out;
}

/* ------------------------------------------------------------------
   EVERY COMPONENT A SCREEN RENDERS HAS TO EXIST.

   Mounting is not surviving. A component referenced in a branch that only
   runs under a runtime condition is invisible to the render above AND to
   every headless check, and it takes the whole app down when the
   condition finally arrives.

   Not hypothetical -- it has happened three times. `watched` and
   `beliefs` were used and never declared. `faultVisibility` was imported
   after being deleted. And `Belief` was rendered and never defined: its
   branch runs only when an actor is OCCLUDED WHILE STILL BELIEVED IN,
   which is exactly what two cars touching produces, so the lab went black
   every time the candidate turned left into traffic while every check
   stayed green.

   The rule is deliberately dumb so it cannot itself be subtly wrong: a
   component name that appears ONLY as a JSX tag, and nowhere else in the
   file, was never defined or imported. Anything declared, imported or
   even referenced once outside a tag passes. Static, cheap, and it would
   have caught all three on the day they were written. It does not replace
   opening the page.
   ------------------------------------------------------------------ */
console.log("");
{
  const files = fs.readdirSync("src/apps").filter((f) => f.endsWith(".jsx")).map((f) => "src/apps/" + f);
  files.push("src/App.jsx");
  let missing = 0, checked = 0;
  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    /* COMMENTS ARE STRIPPED FIRST. Without this the check is defeated by
       its own documentation: a doc comment that names the component keeps
       the bare count above the tag count, so deleting the component still
       passes. Verified by deleting <Belief> and watching it slip through. */
    const src = stripComments(raw);
    // Dotted forms (<a.Icon>) are property access on something in scope.
      const used = new Set([...src.matchAll(/<([A-Z][A-Za-z0-9_]*)(?=[\s/>])/g)].map((m) => m[1]));
    for (const name of used) {
      if (name === "React") continue;
      checked++;
      /* No regex: every escaping attempt in this repo has been mangled by a
         shell heredoc at least once, and a silently wrong pattern here would
         make the check pass on everything. Plain string counting instead. */
      const count = (hay, needle) => hay.split(needle).length - 1;
      const bare = count(src, name);
      const asTag = count(src, "<" + name) + count(src, "</" + name);
      if (bare > asTag) continue;                 // mentioned somewhere else too
      missing++;
      fail(
        file + " renders <" + name + "> and never defines or imports it.\n" +
        "        A component inside a conditional branch is invisible to the mount check\n" +
        "        above: <Belief> was missing for weeks and only threw once two cars touched,\n" +
        "        because its branch runs when an actor is occluded while still believed in.\n" +
        "        MOUNTING IS NOT SURVIVING. See DECISIONS.md section 11.1."
      );
    }
  }
  missing === 0
    ? ok("every one of the " + checked + " components these screens render is defined or imported")
    : null;
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
