import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to the LAN as well as localhost so the dev server can be opened on a
    // phone or tablet on the same wifi — the only test that tells you anything.
    host: true,
  },
});
