import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  // Needed for file:// load (Electron prod) so assets resolve as relative paths.
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true
  }
});
