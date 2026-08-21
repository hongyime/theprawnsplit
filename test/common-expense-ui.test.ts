import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function appSource(): string {
  return readFileSync(join(process.cwd(), "src", "App.svelte"), "utf8");
}

describe("common expense UI boundary", () => {
  it("keeps equal-split paid-by-self as the default expense path", () => {
    const source = appSource();
    const expensePanel = source.match(/<article class="panel expense">([\s\S]*?)<\/article>/)?.[1] ?? "";

    expect(source).toContain('let payerMode: PayerMode = "single";');
    expect(source).toContain('let splitMode: SplitMode = "equal";');
    expect(source).toContain("payerPid = defaultPayerPid([...state.participants.values()], payerPid, new Set(group.identities.map((identity) => identity.pid)));");
    expect(source).toContain('if (splitMode === "equal")');
    expect(expensePanel).toContain('bind:value={expenseDesc} placeholder="Description"');
    expect(expensePanel).toContain('bind:value={expenseTotal} inputmode="decimal" placeholder="Total"');
    expect(expensePanel).toContain('class:active={payerMode === "single"}');
    expect(expensePanel).toContain('class:active={splitMode === mode}');
    expect(expensePanel).toContain('on:click={addExpense}><Plus size={17} /> Save expense');
  });
});
