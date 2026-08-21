import { describe, expect, it } from "vitest";
import { parseClientNumericConfig } from "@/config";

describe("client numeric config parsing", () => {
  it("falls back from malformed, zero, or negative environment values", () => {
    expect(parseClientNumericConfig(undefined, 500)).toBe(500);
    expect(parseClientNumericConfig("not-a-number", 500)).toBe(500);
    expect(parseClientNumericConfig("0", 500)).toBe(500);
    expect(parseClientNumericConfig("-1", 500)).toBe(500);
  });

  it("keeps positive finite values as integer runtime knobs", () => {
    expect(parseClientNumericConfig("42", 500)).toBe(42);
    expect(parseClientNumericConfig("42.9", 500)).toBe(42);
    expect(parseClientNumericConfig(3.8, 500)).toBe(3);
  });

  it("exposes the documented group-total admission cap", async () => {
    const { config } = await import("@/config");

    expect(config.capGroupTotal).toBeGreaterThan(0);
  });
});
