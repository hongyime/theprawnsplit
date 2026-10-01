import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureGroup, resetRepositoryForTests } from "@/db/repo";
import { inferCurrencyFromLocale } from "@/lib/ids";
import { currencyOptions } from "@/lib/currencies";

describe("currency onboarding", () => {
  it("infers group currency from locale without a setup step", async () => {
    expect(inferCurrencyFromLocale("en-SG")).toBe("SGD");
    expect(inferCurrencyFromLocale("en-GB")).toBe("GBP");
    expect(inferCurrencyFromLocale("ja-JP")).toBe("JPY");
    expect(inferCurrencyFromLocale("en")).toBe("USD");
  });

  it("creates a local group immediately with an inferred currency and no currency setup input", async () => {
    await resetRepositoryForTests(`currency-onboarding-${crypto.randomUUID()}`);

    const group = await ensureGroup();

    expect(group.currency).toHaveLength(3);
    expect(group.events).toHaveLength(1);
    expect(group.events[0]).toMatchObject({
      t: "GroupCreated",
      name: "Trip",
      currency: group.currency,
    });
  });

  it("offers common and ISO currency choices through selects", () => {
    expect(currencyOptions("SGD").slice(0, 5)).toEqual(["SGD", "USD", "EUR", "GBP", "MYR"]);
    expect(currencyOptions()).toContain("JPY");
    expect(currencyOptions()).toContain("ZAR");

    const source = readFileSync(join(process.cwd(), "src", "Trip.svelte"), "utf8");
    // T60 (STRUCT-001): the Expense Currency select moved to
    // src/trip/ExpensePanel.svelte; the Main Currency select stays in Trip.svelte.
    const expensePanel = readFileSync(join(process.cwd(), "src", "trip", "ExpensePanel.svelte"), "utf8");
    const combined = `${source}\n${expensePanel}`;
    expect(combined).not.toContain('aria-label="Trip Currency"');
    expect(combined).not.toContain('aria-label="Trip currency"');
    expect(source).toContain('aria-label="Main Currency"');
    expect(expensePanel).toContain('aria-label="Expense Currency"');
    expect(combined).not.toContain('aria-label="Currency"');
  });
});
