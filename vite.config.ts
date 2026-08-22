import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig, type PluginOption } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    svelte(),
    ...(process.env.ANALYZE ? [visualizer({ filename: "stats.html", gzipSize: true }) as unknown as PluginOption] : []),
  ],
  resolve: {
    alias: {
      "@theprawnsplit/core": resolve(root, "core/src/index.ts"),
      "@": resolve(root, "src"),
    },
  },
});
