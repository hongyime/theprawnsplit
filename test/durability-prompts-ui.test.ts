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

    expect(pinBanner).toContain("Pin the trip link");
    expect(pinBanner).toContain("wiped device can recover before showing an empty ledger");
    expect(pinBanner).toContain("on:click={() => markPinLinkPromptHandled(true)}");
    expect(pinBanner).toContain("on:click={() => markPinLinkPromptHandled(false)}");

    expect(identityBanner).toContain("Back up this device identity");
    expect(identityBanner).toContain("grants impersonation power");
    expect(identityBanner).toContain("on:click={downloadPromptIdentityBackup}");
    expect(identityBanner).toContain("on:click={markIdentityBackupPromptHandled}");

    expect(exportBanner).toContain('activeExportPrompt === "first-zero" ? "Balances are settled" : "Export a recovery copy"');
    expect(exportBanner).toContain("All balances reached zero for the first time.");
    expect(exportBanner).toContain("returned after more than 7 days without protected storage");
    expect(exportBanner).toContain("on:click={downloadPromptExport}");
    expect(exportBanner).toContain("on:click={dismissActiveExportPrompt}");

    expect(installBanner).toContain("class:sticky-install={activeInstallLevel === 2}");
    expect(installBanner).toContain('activeInstallLevel === 1 ? "Install for safer storage" : "Protect this trip"');
    expect(installBanner).toContain("Add to Home Screen");
    expect(installBanner).toContain("on:click={dismissActiveInstallPrompt}");
    expect(installModal).toContain('aria-label="Protect this trip"');
    expect(installModal).toContain('activeInstallLevel === 4 ? "Storage survived" : "Storage is still best effort"');
    expect(installModal).toContain("Install the app so the browser can give this trip stronger storage protection.");
    expect(installModal).toContain("on:click={dismissActiveInstallPrompt}");
  });
});
