import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "tutorial-spa"),
  publicDir: path.join(root, "public"),
  plugins: [react()],
  resolve: { alias: { "@": path.join(root, "src") } },
  build: {
    outDir: path.join(root, "cloudflare-tutorial-pages-proxy"),
    emptyOutDir: false,
    sourcemap: false,
  },
});
