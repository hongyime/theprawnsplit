import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@theprawnsplit/core": resolve(root, "core/src/index.ts"),
      "@": resolve(root, "src"),
    },
  },
});
