import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

/* A BUILD STAMP, baked into the served code: the commit, a "+" if the
   tree was dirty, and when this server or build started. A phone tab
   that kept yesterday's modules in memory ran yesterday's instrument
   and produced a report that cost a round trip to recognise (19 Sep);
   the stamp is on the screen before a test runs and in the report
   after, so a stale run identifies itself. */
const stamp = (command) => {
  const git = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
  const hash = git("git rev-parse --short HEAD") || "nogit";
  const dirty = git("git status --porcelain") ? "+" : "";
  const when = `${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`;
  /* A build's stamp is exact. A dev server's is taken when the server
     starts and then serves live code for hours, so it says so: the
     commit it started at, not the commit being served. */
  return command === "build" ? `${hash}${dirty} built ${when}` : `dev server started ${when} at ${hash}${dirty}, serving live code`;
};

export default defineConfig(({ command }) => ({
  define: { __BUILD__: JSON.stringify(stamp(command)) },
  /* Where the built app is served from. "/" for a dev server or a root
     deploy; the deploy workflow sets "/<repo>/" for GitHub Pages, whose
     project sites live under a path. Hash routing means nothing else
     cares. */
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    // Bind to the LAN as well as localhost so the dev server can be opened on a
    // phone or tablet on the same wifi — the only test that tells you anything.
    host: true,
    /* Vite refuses requests whose Host header it does not recognise, which is
       every tunnel. Listed rather than opened to all: a dev server reachable
       under any hostname is a dev server anyone who can resolve it can reach. */
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".loca.lt"],
  },
  preview: {
    // `npm run preview` serves the real build. Testers should judge speed on
    // that, not on a dev server carrying hot-reload machinery.
    host: true,
    allowedHosts: [".trycloudflare.com", ".ngrok-free.app", ".ngrok.io", ".loca.lt"],
  },
}));
