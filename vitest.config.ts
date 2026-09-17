import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    conditions: ["browser"],
    alias: [
      { find: "@/lib/NeoCard.svelte", replacement: resolve(root, "test/stubs/NeoCard.svelte") },
      { find: "@/lib/NeoButton.svelte", replacement: resolve(root, "test/stubs/NeoButton.svelte") },
      { find: "@", replacement: resolve(root, "src") },
      { find: "@theprawnsplit/core", replacement: resolve(root, "core/src/index.ts") },
      { find: "@lucide/svelte", replacement: resolve(root, "test/stubs/lucide-icons.ts") },
    ],
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["test/**/*.test.ts"],
  },
});
