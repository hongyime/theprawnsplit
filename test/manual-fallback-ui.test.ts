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
    expect(source).toContain("$: manualFallbackDue = isManualFallbackDue(group?.meta.unsyncedSince, nowMs);");
    expect(source).toContain("nowMs = now;");
  });

  it("keeps manual JSON import primary on suspected storage eviction recovery", () => {
    const source = readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
    const recoveryPanel = source.match(/\{#if recoveryActive\}([\s\S]*?)<section class="sync-strip">/)?.[1] ?? "";

    expect(source).toContain('return params.get("recovery") === "evicted" ? "evicted" : "first-join";');
    expect(source).toContain('recoveryMode === "evicted" ? "Device Storage Empty" : "Join Trip"');
    expect(recoveryPanel).toContain("First time here");
    expect(recoveryPanel).toContain("Had it before");
    expect(recoveryPanel).toContain('{#if recoveryMode === "evicted"}');
    expect(recoveryPanel).toContain('<a class="primary-link" href="#manual-import">Import JSON</a>');
    expect(recoveryPanel).toContain('<a href="#manual-import">Import JSON</a>');
    expect(source).toContain("Import your latest TripLedgerExport to restore this device.");
    expect(source).toContain("Import is the fastest way back onto this trip.");
  });
});
