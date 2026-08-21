import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("reconciliation issue actions", () => {
  it("offers one undo action for each merge edge in a marked-distinct contradiction", () => {
    const source = readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
    const actions = source.match(/<div class="reconcile-actions">([\s\S]*?)<\/div>/)?.[1] ?? "";

    expect(source).toContain("function mergeUndoEventIds");
    expect(source).toContain("anomaly.relatedEventIds");
    expect(actions).toContain("mergeUndoEventIds(anomaly)");
    expect(actions).toContain("mergeEventId");
    expect(actions).toContain("voidEvent(mergeEventId)");
    expect(actions).toContain("Undo merge {index + 1}");
    expect(actions).toContain("voidEvent(anomaly.eventId!)");
  });
});
