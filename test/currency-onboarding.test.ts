import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { ensureGroup, resetRepositoryForTests } from "@/db/repo";
import { inferCurrencyFromLocale } from "@/lib/ids";

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
});
