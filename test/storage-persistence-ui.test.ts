import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("storage persistence request boundary", () => {
  it("requests persistent storage only after the first expense is saved", () => {
    const source = appSource();
    const addExpense = source.match(/async function addExpense\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    const requestPersistence =
      source.match(/async function requestStoragePersistenceAfterFirstExpense\(\): Promise<void> \{([\s\S]*?)\n  \}/)?.[1] ?? "";

    expect(source.match(/navigator\.storage\.persist\(\)/g)).toHaveLength(1);
    expect(requestPersistence).toContain("persistedStorage = await navigator.storage.persist();");
    expect(addExpense).toContain("const wasFirstExpense = expenses.length === 0;");
    expect(addExpense).toContain("await commit([event], f);");
    expect(addExpense).toMatch(/if \(wasFirstExpense\) \{[\s\S]*await requestStoragePersistenceAfterFirstExpense\(\);[\s\S]*await markFirstExpensePersistenceRequested\(\);[\s\S]*\}/);
  });
});
