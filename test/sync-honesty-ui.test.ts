import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("sync honesty UI boundary", () => {
  it("keeps unconfirmed event count visible and derives ready copy only from sync labels", () => {
    const source = appSource();
    const topbar = source.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] ?? "";
    const syncStrip = source.match(/<section class="sync-strip">([\s\S]*?)<\/section>/)?.[1] ?? "";

    expect(source).toContain("$: unconfirmedCount = counts.local + counts.published;");
    expect(source).toContain("$: syncLabels = syncSurfaceLabels({ unconfirmedCount, quarantinedCount: state?.quarantined.length ?? 0 });");
    expect(topbar).toContain("{unconfirmedCount} unconfirmed");
    expect(topbar).toContain("{syncLabels.topbar}");
    expect(syncStrip).toContain("{syncLabels.protection}");
    expect(syncStrip).toContain("class:ok={unconfirmedCount === 0 && state.quarantined.length === 0}");
    expect(syncStrip).toContain("class:warn={unconfirmedCount > 0 || state.quarantined.length > 0}");
    expect(topbar).not.toMatch(/\b(?:synced|shared|success|confirmed)\b/i);
  });
});
