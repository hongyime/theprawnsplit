import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["browser"],
    alias: {
      "@": resolve(root, "src"),
      "@theprawnsplit/core": resolve(root, "core/src/index.ts"),
      "@lucide/svelte": resolve(root, "test/stubs/lucide-icons.ts"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
  },
});
