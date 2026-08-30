// CR-013 Task 2 — BLOCKED from rendered conversion.
// Assertions check refreshDurabilityPrompts() function-body wiring — which helpers it calls and with what arguments. Source-level only.
// Evidence for all assertions in this file: source-shape.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = source.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? "" : source.slice(startIndex, endIndex);
}

describe("durability prompt UI boundary", () => {
  it("keeps install, pin-link, identity-backup, and export prompts wired to durable state", () => {
    const source = appSource();
    const refreshPrompts = source.match(/async function refreshDurabilityPrompts\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const pinBanner = between(source, "{#if showPinLinkPrompt}", "{#if showIdentityBackupPrompt");
    const identityBanner = between(source, "{#if showIdentityBackupPrompt && hasLocalClaim}", "{#if activeExportPrompt");
    const exportBanner = between(source, "{#if activeExportPrompt}", "{#if activeInstallLevel && activeInstallLevel < 3");
    const installBanner = between(source, "{#if activeInstallLevel && activeInstallLevel < 3}", "{#if recoveryActive");
    const installModal = between(source, "{#if activeInstallLevel && activeInstallLevel >= 3}", "{#if joinQrDataUrl");

    expect(refreshPrompts).toContain("activeInstallLevel = installPromptLevel({");
    expect(refreshPrompts).toContain("isStandalone");
    expect(refreshPrompts).toContain("isArchived: isGroupArchived()");
    expect(refreshPrompts).toContain("isOnline");
    expect(refreshPrompts).toContain("isDesktop");
    expect(refreshPrompts).toContain("persisted: persistedStorage");
    expect(refreshPrompts).toContain("installModalShownSession");
    expect(refreshPrompts).toContain("showPinLinkPrompt = shouldPromptPinLink(current);");
    expect(refreshPrompts).toContain("showIdentityBackupPrompt = shouldPromptIdentityBackup(current, hasLocalClaim);");
    expect(refreshPrompts).toContain("activeExportPrompt = exportPromptReason(returnWindow, allBalancesZero(), persistedStorage, Date.now());");

    expect(source).toContain("async function dismissActiveInstallPrompt()");
    expect(source).toContain("dismissInstallPrompt(durability, level)");
    expect(source).toContain("async function markPinLinkPromptHandled(copy = false)");
    expect(source).toContain("pinLinkPromptedAt: Date.now()");
    expect(source).toContain("async function markIdentityBackupPromptHandled()");
    expect(source).toContain("identityBackupPromptedAt: Date.now()");
    expect(source).toContain("async function markExportPromptHandled(reason: ExportPromptReason)");

    expect(pinBanner).toContain("Pin The Trip Link");
    expect(pinBanner).toContain("Wiped Device Can Recover Before Showing An Empty Ledger");
    expect(pinBanner).toContain("on:click={() => markPinLinkPromptHandled(true)}");
    expect(pinBanner).toContain("on:click={() => markPinLinkPromptHandled(false)}");

    expect(identityBanner).toContain("Back Up This Device Identity");
    expect(identityBanner).toContain("Grants Impersonation Power");
    expect(identityBanner).toContain("on:click={downloadPromptIdentityBackup}");
    expect(identityBanner).toContain("on:click={markIdentityBackupPromptHandled}");

    expect(exportBanner).toContain('activeExportPrompt === "first-zero" ? "Balances Are Settled" : "Export A Recovery Copy"');
    expect(exportBanner).toContain("All Balances Reached Zero For The First Time.");
    expect(exportBanner).toContain("Returned After More Than 7 Days Without Protected Storage");
    expect(exportBanner).toContain("on:click={downloadPromptExport}");
    expect(exportBanner).toContain("on:click={dismissActiveExportPrompt}");

    expect(installBanner).toContain("class:sticky-install={activeInstallLevel === 2}");
    expect(installBanner).toContain('activeInstallLevel === 1 ? "Install For Safer Storage" : "Protect This Trip"');
    expect(installBanner).toContain("Add To Home Screen");
    expect(installBanner).toContain("on:click={dismissActiveInstallPrompt}");
    expect(installModal).toContain('aria-label="Protect This Trip"');
    expect(installModal).toContain('activeInstallLevel === 4 ? "Storage Survived" : "Storage Is Still Best Effort"');
    expect(installModal).toContain("Install The App So The Browser Can Give This Trip Stronger Storage Protection.");
    expect(installModal).toContain("on:click={dismissActiveInstallPrompt}");
  });
});
