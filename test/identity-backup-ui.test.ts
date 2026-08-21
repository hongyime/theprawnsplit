import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("identity backup UI", () => {
  it("warns about impersonation and keeps identity backup out of share-sheet paths", () => {
    const source = readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
    const prompt = source.match(/\{#if showIdentityBackupPrompt && hasLocalClaim\}([\s\S]*?)\{#if activeExportPrompt\}/)?.[1] ?? "";
    const syncStrip = source.match(/<section class="sync-strip">([\s\S]*?)\{#if relaySettingsOpen\}/)?.[1] ?? "";
    const shareDelta = source.match(/async function shareDelta\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const backupDownload = source.match(/function downloadIdentityBackup\(\): boolean \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    expect(prompt).toContain("grants impersonation power");
    expect(backupDownload).toContain("Anyone with it can impersonate your device");
    expect(prompt).toContain("on:click={downloadPromptIdentityBackup}");
    expect(syncStrip).toContain("downloadIdentityBackup()");
    expect(prompt).not.toContain("shareDelta");
    expect(syncStrip).not.toContain("shareDelta");
    expect(backupDownload).not.toContain("navigator.share");
    expect(shareDelta).toContain("navigator.share");
  });
});
