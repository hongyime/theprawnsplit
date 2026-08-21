import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("protection status UI", () => {
  it("keeps standalone, storage, and sync protection state visible together", () => {
    const source = appSource();
    const syncStrip = source.match(/<section class="sync-strip">([\s\S]*?)<\/section>/)?.[1] ?? "";
    const protectionStatus = syncStrip.match(/<span class="protection-status" aria-label="Protection status">([\s\S]*?)<\/span>\n\s*<\/span>/)?.[1] ?? "";

    expect(source).toContain("$: storageLabel = persistedStorage === null ? \"storage unknown\" : persistedStorage ? \"storage protected\" : \"storage best effort\";");
    expect(source).toContain("$: syncLabels = syncSurfaceLabels({ unconfirmedCount, quarantinedCount: state?.quarantined.length ?? 0 });");
    expect(source).toContain("persistedStorage = (await navigator.storage?.persisted?.()) ?? null;");

    expect(syncStrip).toContain('aria-label="Protection status"');
    expect(protectionStatus).toContain('{isStandalone ? "installed" : "browser tab"}');
    expect(protectionStatus).toContain("{storageLabel}");
    expect(protectionStatus).toContain("{syncLabels.protection}");
    expect(protectionStatus).toContain("class:ok={isStandalone}");
    expect(protectionStatus).toContain("class:ok={persistedStorage === true}");
    expect(protectionStatus).toContain("class:warn={persistedStorage === false}");
    expect(protectionStatus).toContain("class:ok={unconfirmedCount === 0 && state.quarantined.length === 0}");
    expect(protectionStatus).toContain("class:warn={unconfirmedCount > 0 || state.quarantined.length > 0}");
  });
});
