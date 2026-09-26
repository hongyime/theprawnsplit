// DATA-007 T43 — source-shape guard for Trip.svelte's expenseCoverageLabel.
// The underlying tri-state logic (isEventCoveredByEveryKnownDevice) has
// full behavioral coverage in test/sync-coverage.test.ts; this file only
// pins that Trip.svelte's thin UI wrapper still maps all three states to
// distinct, correct labels and never collapses "unknown" back into
// "Everyone Has This" (the actual DATA-007 bug this task fixes).
// Evidence for all assertions in this file: source-shape.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
}

describe("DATA-007 expense coverage label UI boundary", () => {
  it("maps each tri-state coverage status to a distinct, correct label -- never covered from legacy/absent evidence", () => {
    const source = appSource();
    const expenseCoverageLabel = source.match(/function expenseCoverageLabel\(xid: string\): string \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    expect(expenseCoverageLabel).toContain("isEventCoveredByEveryKnownDevice(group.events, event)");
    expect(expenseCoverageLabel).toContain('if (status === "covered") return "Everyone Has This";');
    expect(expenseCoverageLabel).toContain('if (status === "not-covered") return "Not Yet On Every Known Device";');
    expect(expenseCoverageLabel).toContain('return "Coverage Unknown";');
    // The old boolean ternary collapsing unknown into "Everyone Has This"
    // must be fully gone, not merely shadowed by the new branches above.
    expect(expenseCoverageLabel).not.toMatch(/\?\s*"Everyone Has This"\s*:/);
  });
});
