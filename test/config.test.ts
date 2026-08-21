import { readFileSync } from "node:fs";
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

  it("defaults to the v2 schema needed for rate-bearing multi-currency events", async () => {
    const { config } = await import("@/config");

    expect(config.schemaVersion).toBe(2);
  });

  it("documents every runtime client environment key in .env.example", () => {
    const configSource = readFileSync("src/config.ts", "utf8");
    const envExample = readFileSync(".env.example", "utf8");
    const runtimeKeys = [...new Set(configSource.match(/VITE_[A-Z0-9_]+/g) ?? [])].sort();
    const sampleKeys = new Set(envExample.match(/^VITE_[A-Z0-9_]+(?==)/gm) ?? []);

    expect(runtimeKeys.filter((key) => !sampleKeys.has(key))).toEqual([]);
  });
});
