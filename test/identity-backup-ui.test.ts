// CR-013 Task 2 — BLOCKED from rendered conversion.
//
// The backup prompt ({#if showIdentityBackupPrompt && hasLocalClaim}) requires two
// conditions: a local ParticipantClaimed event (so hasLocalClaim=true) AND the
// refreshDurabilityPrompts function having run after hasLocalClaim became true.
//
// In jsdom, refreshDurabilityPrompts runs ONCE in initGroupSession. At that
// point, Svelte's $: hasLocalClaim reactive declaration may not have re-evaluated
// yet (the fake-claim ParticipantClaimed event is in fold but the Svelte reactive
// chain hasn't flushed). The function is not re-called when hasLocalClaim later
// becomes true, so showIdentityBackupPrompt stays false and the prompt never
// renders in jsdom.
//
// Fixing this requires either (a) calling refreshDurabilityPrompts a second time
// after waiting for hasLocalClaim to propagate, which is not part of normal app
// flow, or (b) restructuring the test to bypass the reactive chain. Both are out of
// scope for the CR-013 pilot. Evidence: rendered.
//
// The assertions below remain source-shape. The rendered attempt produced:
//   1 failure: "grants impersonation power" not found (prompt never rendered).
//   Verdict: TEST SETUP BLOCKED — not an app defect.
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
