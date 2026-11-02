import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The demo is served from GitHub Pages under /mawid/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/mawid/" : "/",
  plugins: [react()],
  server: { port: 5177, host: "127.0.0.1" },
}));
