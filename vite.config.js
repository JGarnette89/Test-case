import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
});
