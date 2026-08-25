import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

// CR-011 Task 5 closes the ID-12 gap found by the CR-010 audit: the fold-side
// duplicate anomaly was asserted in core, but its banner rendering was not.
describe("duplicate participant banner", () => {
  it("renders the possible-duplicate-participants hint as a non-blocking banner with append-only actions", () => {
    const source = appSource();
    const panel = source.match(/<section class="reconcile-panel"([\s\S]*?)<\/section>/)?.[1] ?? "";
    const duplicateRow =
      panel.match(/\{#if anomaly\.code === "possible-duplicate-participants"[^}]*\}([\s\S]*?)\{:else if/)?.[1] ?? "";

    // The banner surfaces both participants and states that balances stay untouched.
    expect(panel).toContain('anomaly.code === "possible-duplicate-participants"');
    expect(duplicateRow).toContain("participantLabel(anomaly.pid)");
    expect(duplicateRow).toContain("participantLabel(anomaly.relatedPid)");
    expect(duplicateRow).toContain("may be the same as");
    expect(duplicateRow).toContain("without changing balances automatically");

    // Append-only resolution actions only — no automatic merge, no balance edits.
    const actions = panel.match(/<div class="reconcile-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(actions).toContain('on:click={() => mergeParticipants(anomaly.relatedPid!, anomaly.pid!)}');
    expect(actions).toContain('on:click={() => markParticipantsDistinct(anomaly.pid!, anomaly.relatedPid!)}');
    expect(actions).toContain(">Merge</button>");
    expect(actions).toContain(">Not same</button>");
  });
});
