import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("manual fallback promotion", () => {
  it("promotes overdue relay confirmation to visible manual sharing actions", () => {
    const source = readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
    const banner = source.match(/\{#if manualFallbackDue\}([\s\S]*?)\{\/if\}/)?.[1] ?? "";

    expect(banner).toContain('aria-label="Manual sharing fallback"');
    expect(banner).toContain("on:click={shareDelta}");
    expect(banner).toContain("on:click={() => downloadExport()}");
    expect(banner).toContain("on:click={copyJoinLink}");
  });
});
