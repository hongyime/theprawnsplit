import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("export prompt UI boundary", () => {
  it("keeps prompted exports limited to first-zero and seven-day while archive exports are automatic", () => {
    const source = appSource();
    const refreshDurabilityPrompts =
      source.match(/async function refreshDurabilityPrompts\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const markExportPromptHandled =
      source.match(/async function markExportPromptHandled\(reason: ExportPromptReason\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const archiveGroup = source.match(/async function archiveGroup\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const exportPromptBanner = source.match(/\{#if activeExportPrompt\}([\s\S]*?)\{\/if\}\n    \{#if activeInstallLevel/)?.[1] ?? "";

    expect(refreshDurabilityPrompts).toContain("activeExportPrompt = exportPromptReason(returnWindow, allBalancesZero(), persistedStorage, Date.now());");
    expect(markExportPromptHandled).toContain('firstZeroExportPromptedAt: reason === "first-zero" ? Date.now() : durability.firstZeroExportPromptedAt');
    expect(markExportPromptHandled).toContain('sevenDayExportPromptedAt: reason === "seven-day" ? Date.now() : durability.sevenDayExportPromptedAt');

    expect(exportPromptBanner).toContain('activeExportPrompt === "first-zero" ? "Balances are settled" : "Export a recovery copy"');
    expect(exportPromptBanner).toContain('activeExportPrompt === "first-zero" ? "All balances reached zero for the first time." : "This device returned after more than 7 days without protected storage."');
    expect(exportPromptBanner).toContain("on:click={downloadPromptExport}");
    expect(exportPromptBanner).toContain("on:click={dismissActiveExportPrompt}");

    expect(archiveGroup).toContain("const plan = createArchiveTransitionPlan(suggestedSettlements);");
    expect(archiveGroup).toContain("const archivedExportGroup = groupWithPendingArchiveEvent(group, archiveEvent, f.nextCounter);");
    expect(archiveGroup).toContain('if (action === "download-export")');
    expect(archiveGroup).toContain("downloadExport(undefined, archivedExportGroup);");
    expect(archiveGroup).not.toContain("activeExportPrompt");
  });
});
