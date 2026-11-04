import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Two builds. The default is the demo for GitHub Pages under /mawid/, with the
// shop in the browser. `--mode server` is a real shop: served from the root by
// the Worker, talking to its API (proxied to `wrangler dev` while developing).
export default defineConfig(({ command, mode }) => {
  const server = mode === "server";
  return {
    base: command === "build" && !server ? "/mawid/" : "/",
    plugins: [react()],
    build: server ? { outDir: "dist-server" } : undefined,
    server: {
      port: 5177,
      host: "127.0.0.1",
      proxy: server ? { "/api": "http://127.0.0.1:8787" } : undefined,
    },
  };
});
