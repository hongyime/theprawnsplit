// DATA-006/B3: setCurrency must not be a silent, local-only, unreplicated
// mutation (the original bug -- peers could never see a correction, and a
// currency could be changed even after money was already flowing under the
// old value). It must emit a replicated BaseCurrencyEstablished event, and
// must refuse once any expense exists for the group. Source-shape
// verification (see join-link-guard-ui.test.ts/export-prompt-ui.test.ts for
// the same convention in this codebase): the guard is a simple, low-risk
// early-return, and the actual freeze/quarantine/conflict-resolution
// correctness this task fixes is already thoroughly covered by
// core/test/fold.test.ts's "DATA-006/B3 base currency contract" suite.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
}

describe("setCurrency freeze-before-first-expense guard (DATA-006/B3)", () => {
  it("refuses to change currency once any expense exists, before emitting anything", () => {
    const source = appSource();
    const setCurrency = source.match(/async function setCurrency\(newCurrency: string\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(setCurrency).toContain("expenses.length > 0");
    const guardIndex = setCurrency.indexOf("expenses.length > 0");
    const emitIndex = setCurrency.indexOf("BaseCurrencyEstablished");
    expect(guardIndex).toBeGreaterThanOrEqual(0);
    expect(emitIndex).toBeGreaterThan(guardIndex);
  });

  it("emits a replicated BaseCurrencyEstablished event via commit, not a silent local-only saveGroup mutation", () => {
    const source = appSource();
    const setCurrency = source.match(/async function setCurrency\(newCurrency: string\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(setCurrency).toContain('makeEvent(f, "BaseCurrencyEstablished"');
    expect(setCurrency).toContain("await commit([event], f)");
    expect(setCurrency).not.toContain("await saveGroup(group)");
  });

  it("disables the Main Currency select once any expense exists, matching the same freeze boundary", () => {
    const source = appSource();
    const select = source.match(/<select value=\{currency\} aria-label="Main Currency"[\s\S]*?on:change=/)?.[0] ?? "";
    expect(select).toContain("expenses.length > 0");
  });
});
