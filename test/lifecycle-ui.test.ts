import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("lifecycle UI boundary", () => {
  it("keeps archive and unarchive explicit while archived trips remain readable and read-only", () => {
    const source = appSource();
    const header = source.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] ?? "";
    const archiveGroup = source.match(/async function archiveGroup\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const unarchiveGroup = source.match(/async function unarchiveGroup\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    expect(source).toContain("$: archived = isGroupArchived();");
    expect(source).toContain("$: groupProfileEditable = canEditGroupProfile(archived);");
    expect(source).toContain("$: settledView = state ? isSettledViewPredicate(state.balances, archived) : false;");
    expect(source).toContain("$: archiveSummary = group ? latestArchiveEvent(group.events) : undefined;");
    expect(header).toContain('{#if archived}');
    expect(header).toContain('on:click={unarchiveGroup} title="Unarchive trip"');
    expect(header).toContain('on:click={archiveGroup} title="Archive trip"');
    expect(source).toContain("This trip is archived. The ledger remains readable and exportable. Relay retention is outside this app's control; archiving does not delete relay data.");
    expect(source).toContain("This trip is still active. Adding a new expense will update balances automatically.");
    expect(source).toContain('{#if archived && archiveSummary}');
    expect(source).toContain('Archived with all balances zero.');
    expect(source).toContain('Archived trips are read-only.');

    expect(archiveGroup).toContain("if (!group || archived) return;");
    expect(archiveGroup).toContain("const plan = createArchiveTransitionPlan(suggestedSettlements);");
    expect(archiveGroup).toContain("window.confirm(archiveConfirmationText(outstandingLabels))");
    expect(archiveGroup).toContain('const archiveEvent = makeEvent(f, "GroupArchived"');
    expect(archiveGroup).toContain("const archivedExportGroup = groupWithPendingArchiveEvent(group, archiveEvent, f.nextCounter);");
    expect(archiveGroup.indexOf('if (action === "download-export")')).toBeLessThan(archiveGroup.indexOf("await commit([archiveEvent], f);"));
    expect(archiveGroup).toContain("downloadExport(undefined, archivedExportGroup);");

    expect(unarchiveGroup).toContain("if (!group || !archived) return;");
    expect(unarchiveGroup).toContain("window.confirm(unarchiveConfirmationText())");
    expect(unarchiveGroup).toContain('makeEvent(f, "GroupUnarchived", {})');
  });
});
